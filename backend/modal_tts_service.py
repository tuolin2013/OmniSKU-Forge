"""
OmniVoice-Studio TTS Service — deployed on Modal.

参考 OmniVoice-Studio 官方 demo 模式：
  - uv_pip_install 极速构建镜像
  - @modal.concurrent(max_inputs=5) 允许 5 个请求共享一块 A10G 显存
  - @modal.fastapi_endpoint() 直接暴露 FastAPI 接口（无需 asgi_app wrapper）
  - Volume 存放模型权重 + 主播参考音频（支持声音克隆）

部署命令：
    modal deploy modal_tts_service.py

URL 规范（与 backend/app/api/v1/tts.py 保持一致）：
    GET  /health          → { status, service }
    GET  /voices          → { voices: [...] }
    POST /tts             → audio/wav 字节流
    Body: { "text": "口播文案...", "voice": "zf_xiaobei", "speed": 1.0 }

配置（backend/.env）：
    MODAL_TTS_URL=https://tuolin2011--omnivoice-tts-tts-api.modal.run

Volume 使用说明：
    - 上传主播参考音频（WAV 格式）到 Volume /prompts/，文件名即声音 ID
      例：modal volume put omnivoice-model-cache 李佳琦.wav /prompts/李佳琦.wav
    - 声音 ID 传入 voice 参数后缀加 "_clone" 即可触发声音克隆
      例：{ "voice": "李佳琦_clone" }

支持的内置声音（Kokoro voices）：
    中文：zf_xiaobei, zm_yunxi
    英文：af_heart, af_bella, am_adam, bf_emma
"""

import io
import modal

# ─────────────────────────────────────────────────────────────────────────────
# 极速构建镜像：uv_pip_install（比 pip_install 快 3-5x）
# ─────────────────────────────────────────────────────────────────────────────

tts_image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("espeak-ng", "libsndfile1")
    .uv_pip_install(
        "ordered-set==4.1.0",   # kokoro 隐式依赖
        "misaki[zh]==0.9.4",    # kokoro 中文音素后端
        "kokoro==0.9.4",
        "soundfile==0.12.1",
        "numpy==1.26.4",
        "scipy==1.13.1",
        "fastapi[standard]==0.115.4",
        "torchaudio",
    )
)

app = modal.App("omnivoice-tts", image=tts_image)

# ─────────────────────────────────────────────────────────────────────────────
# Volume：模型权重缓存 + 主播参考音频（声音克隆）
# ─────────────────────────────────────────────────────────────────────────────

model_volume = modal.Volume.from_name("omnivoice-model-cache", create_if_missing=True)
MODEL_DIR = "/model_cache"   # Kokoro 模型权重（HuggingFace cache）
PROMPTS_DIR = "/prompts"     # 存放主播参考音频 WAV，文件名即声音 ID

# ─────────────────────────────────────────────────────────────────────────────
# TTS 推理 Class
# ─────────────────────────────────────────────────────────────────────────────

@app.cls(
    gpu="A10G",                          # 24G 显存，Kokoro + 可选克隆模型绰绰有余
    volumes={
        MODEL_DIR:   model_volume,
        PROMPTS_DIR: model_volume,       # 同一个 Volume，不同挂载路径
    },
    max_containers=3,
    scaledown_window=300,                # 5 分钟无请求后回收容器
)
@modal.concurrent(max_inputs=5)         # 5 个请求共享一块 A10G，最大化 GPU 利用率
class KokoroTTS:
    """Kokoro-82M TTS 推理服务。冷启动加载模型后常驻显存。"""

    @modal.enter()
    def load_model(self):
        """容器启动时只执行一次，将模型加载到显存中。"""
        import os
        os.makedirs(MODEL_DIR, exist_ok=True)
        os.makedirs(PROMPTS_DIR, exist_ok=True)
        os.environ["HF_HOME"] = MODEL_DIR

        print("🚀 [冷启动] 正在将 Kokoro-82M 载入 A10G 显存...")
        from kokoro import KPipeline
        # 首次从 HuggingFace 下载，后续从 Volume 缓存读取
        self.pipeline_zh = KPipeline(lang_code="z")   # 中文
        self.pipeline_en = KPipeline(lang_code="a")   # 英文（美式）
        print("✅ [Kokoro] 模型加载完成。")

    # ── 内置声音合成 ──────────────────────────────────────────────────────────

    def _synthesize_builtin(self, text: str, voice: str, speed: float) -> bytes:
        """使用 Kokoro 内置声音合成。"""
        import numpy as np
        import soundfile as sf

        pipeline = self.pipeline_zh if voice.startswith("z") else self.pipeline_en

        audio_chunks = []
        for _, _, audio in pipeline(text, voice=voice, speed=speed, split_pattern=r"\n+"):
            audio_chunks.append(audio)

        if not audio_chunks:
            raise ValueError("TTS 生成结果为空，请检查输入文案")

        # 段落间插入 0.3s 静音
        silence = np.zeros(int(24000 * 0.3), dtype=np.float32)
        combined = audio_chunks[0]
        for chunk in audio_chunks[1:]:
            combined = np.concatenate([combined, silence, chunk])

        buf = io.BytesIO()
        sf.write(buf, combined, 24000, format="WAV", subtype="PCM_16")
        buf.seek(0)
        return buf.read()

    # ── 声音克隆合成（参考音频在 Volume /prompts/ 下）────────────────────────

    def _synthesize_clone(self, text: str, voice_id: str, speed: float) -> bytes:
        """
        使用存放在 Volume /prompts/{voice_id}.wav 的参考音频克隆声音。
        若参考音频不存在，自动降级到内置 zf_xiaobei。
        """
        import os
        ref_path = os.path.join(PROMPTS_DIR, f"{voice_id}.wav")
        if not os.path.exists(ref_path):
            print(f"⚠️ 参考音频 {ref_path} 不存在，降级到内置 zf_xiaobei")
            return self._synthesize_builtin(text, "zf_xiaobei", speed)

        # Kokoro 支持通过 voice 参数传入参考音频路径（v0.9.x）
        import numpy as np
        import soundfile as sf

        pipeline = self.pipeline_zh  # 克隆模式默认用中文 pipeline
        audio_chunks = []
        for _, _, audio in pipeline(text, voice=ref_path, speed=speed, split_pattern=r"\n+"):
            audio_chunks.append(audio)

        if not audio_chunks:
            raise ValueError("声音克隆生成结果为空")

        silence = np.zeros(int(24000 * 0.3), dtype=np.float32)
        combined = audio_chunks[0]
        for chunk in audio_chunks[1:]:
            combined = np.concatenate([combined, silence, chunk])

        buf = io.BytesIO()
        sf.write(buf, combined, 24000, format="WAV", subtype="PCM_16")
        buf.seek(0)
        return buf.read()

    # ── 统一入口 ──────────────────────────────────────────────────────────────

    @modal.method()
    def synthesize(self, text: str, voice: str = "zf_xiaobei", speed: float = 1.0) -> bytes:
        """
        合成语音，返回 WAV 字节流。

        Args:
            text:  要合成的文案（≤5000字）
            voice: 声音 ID。
                   内置：zf_xiaobei / zm_yunxi / af_heart / af_bella / am_adam
                   克隆：{voice_id}_clone（需提前上传参考音频到 Volume /prompts/）
            speed: 语速倍率（0.5 ~ 2.0）
        """
        text = _preprocess_zh(text) if not voice.endswith("_clone") and voice.startswith("z") else text

        if voice.endswith("_clone"):
            voice_id = voice[:-6]  # strip "_clone"
            return self._synthesize_clone(text, voice_id, speed)
        return self._synthesize_builtin(text, voice, speed)

    # ── FastAPI endpoints（直接挂载在 Class 上，@modal.concurrent 自动生效）─

    @modal.fastapi_endpoint(method="GET", docs=True)
    def health(self):
        return {"status": "ok", "service": "OmniVoice-TTS", "gpu": "A10G"}

    @modal.fastapi_endpoint(method="GET", docs=True)
    def voices(self):
        import os
        builtin = [
            {"id": "zf_xiaobei", "name": "小北（中文女声）",   "lang": "zh", "type": "builtin"},
            {"id": "zm_yunxi",   "name": "云曦（中文男声）",   "lang": "zh", "type": "builtin"},
            {"id": "af_heart",   "name": "Heart（英文女声）",  "lang": "en", "type": "builtin"},
            {"id": "af_bella",   "name": "Bella（英文女声）",  "lang": "en", "type": "builtin"},
            {"id": "am_adam",    "name": "Adam（英文男声）",   "lang": "en", "type": "builtin"},
        ]
        # 扫描 Volume /prompts/ 目录，列出可克隆的自定义声音
        clones = []
        if os.path.isdir(PROMPTS_DIR):
            for f in sorted(os.listdir(PROMPTS_DIR)):
                if f.lower().endswith(".wav"):
                    voice_id = f[:-4]
                    clones.append({
                        "id": f"{voice_id}_clone",
                        "name": f"{voice_id}（克隆）",
                        "lang": "zh",
                        "type": "clone",
                    })
        return {"voices": builtin + clones}

    @modal.fastapi_endpoint(method="POST", docs=True)
    def tts(self, req: dict):
        """
        合成语音接口。
        Body: { "text": "...", "voice": "zf_xiaobei", "speed": 1.0 }
        Response: audio/wav 字节流
        """
        from fastapi import HTTPException
        from fastapi.responses import StreamingResponse

        text  = req.get("text", "").strip()
        voice = req.get("voice", "zf_xiaobei")
        speed = float(req.get("speed", 1.0))

        if not text:
            raise HTTPException(status_code=400, detail="text 不能为空")
        if len(text) > 5000:
            raise HTTPException(status_code=400, detail="文案超过 5000 字符限制")

        try:
            wav_bytes = self.synthesize(text, voice, speed)
            return StreamingResponse(
                io.BytesIO(wav_bytes),
                media_type="audio/wav",
                headers={
                    "Content-Disposition": "attachment; filename=voice.wav",
                    "Content-Length": str(len(wav_bytes)),
                },
            )
        except Exception as exc:
            raise HTTPException(status_code=500, detail=f"TTS 合成失败: {exc}")


# ─────────────────────────────────────────────────────────────────────────────
# 文本预处理（中文 TTS 字母/数字规范化）
# ─────────────────────────────────────────────────────────────────────────────

def _preprocess_zh(text: str) -> str:
    """
    为中文 TTS 预处理文本：将常见拉丁字母/数字缩写替换为中文发音，
    避免 Kokoro 中文管线跳过字母（例：维A → 维阿，维D3 → 维迪三）。
    """
    import re

    vitamin_map = {
        r'维\s*[Aa][Dd]': '维阿迪',   r'维\s*[Dd][Aa]': '维迪阿',
        r'维\s*[Dd]3':    '维迪三',   r'维\s*[Dd]₃':    '维迪三',
        r'维\s*[Kk]2':    '维科二',   r'维\s*[Kk]₂':    '维科二',
        r'维\s*[Bb]12':   '维比十二', r'维\s*[Bb]₁₂':   '维比十二',
        r'维\s*[Bb]6':    '维比六',   r'维\s*[Bb]₆':    '维比六',
        r'维\s*[Bb]2':    '维比二',   r'维\s*[Bb]1':    '维比一',
        r'维\s*[Cc]':     '维西',     r'维\s*[Dd]':     '维迪',
        r'维\s*[Ee]':     '维伊',     r'维\s*[Kk]':     '维科',
        r'维\s*[Bb]':     '维比',     r'维\s*[Aa]':     '维阿',
        r'维\s*[Pp]':     '维皮',     r'维\s*[Hh]':     '维阿奇',
    }
    for pattern, replacement in vitamin_map.items():
        text = re.sub(pattern, replacement, text)

    letter_zh = {
        'A': '阿', 'B': '比', 'C': '西', 'D': '迪', 'E': '伊',
        'F': '艾夫', 'G': '机', 'H': '艾奇', 'I': '艾', 'J': '杰',
        'K': '科', 'L': '艾尔', 'M': '艾姆', 'N': '艾恩', 'O': '哦',
        'P': '皮', 'Q': '扣', 'R': '阿尔', 'S': '艾斯', 'T': '提',
        'U': '优', 'V': '威', 'W': '双威', 'X': '艾克斯', 'Y': '为',
        'Z': '贼',
    }

    def _replace(m):
        return letter_zh.get(m.group(0).upper(), m.group(0))

    text = re.sub(r'(?<=[^\x00-\x7F])[A-Za-z](?=[^\x00-\x7F])', _replace, text)
    text = re.sub(r'(?<=[^\x00-\x7F])[A-Za-z]+(?=\s|$|[，。！？、；：])', _replace, text)
    return text


# ─────────────────────────────────────────────────────────────────────────────
# 本地测试入口
# ─────────────────────────────────────────────────────────────────────────────

@app.local_entrypoint()
def main():
    """
    modal run modal_tts_service.py

    可选参数（传给 synthesize）：
        modal run modal_tts_service.py --voice zm_yunxi
    """
    import sys
    voice = sys.argv[1] if len(sys.argv) > 1 else "zf_xiaobei"
    test_text = "这款茶叶精选云南古树普洱，回甘持久，香气馥郁，是送礼自饮的绝佳之选。"
    tts = KokoroTTS()
    wav = tts.synthesize.remote(test_text, voice=voice, speed=1.0)
    out = f"test_output_{voice}.wav"
    with open(out, "wb") as f:
        f.write(wav)
    print(f"✅ 测试完成，已保存 {out}（{len(wav):,} bytes）")
