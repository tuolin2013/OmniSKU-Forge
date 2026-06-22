"""
OmniVoice-Studio TTS Service — deployed on Modal.

基于 https://github.com/debpalash/OmniVoice-Studio 的 Kokoro-82M TTS 模型。
部署命令：
    modal deploy modal_tts_service.py

URL 规范（与 backend/app/api/v1/tts.py 保持一致）：
    GET  /health          → { status, service }
    GET  /voices          → { voices: [...] }
    POST /tts             → audio/wav 字节流
    Body: { "text": "口播文案...", "voice": "zf_xiaobei", "speed": 1.0 }

配置（backend/.env）：
    MODAL_TTS_URL=https://tuolin2011--omnivoice-tts-tts-api.modal.run

支持的声音（Kokoro voices）：
    中文：zf_xiaobei, zm_yunxi
    英文：af_heart, af_bella, am_adam, bf_emma
"""

import io
import modal

# ─────────────────────────────────────────────────────────────────────────────
# Modal 镜像：安装 kokoro 和依赖
# ─────────────────────────────────────────────────────────────────────────────

tts_image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("espeak-ng", "libsndfile1")
    .pip_install(
        "ordered-set==4.1.0",   # kokoro 隐式依赖
        "misaki[zh]==0.9.4",    # kokoro 中文音素后端
        "kokoro==0.9.4",
        "soundfile==0.12.1",
        "numpy==1.26.4",
        "scipy==1.13.1",
        "fastapi[standard]==0.115.4",
    )
)

app = modal.App("omnivoice-tts", image=tts_image)

# ─────────────────────────────────────────────────────────────────────────────
# 模型缓存 Volume（避免每次冷启动重新下载）
# ─────────────────────────────────────────────────────────────────────────────

model_volume = modal.Volume.from_name("omnivoice-model-cache", create_if_missing=True)
MODEL_DIR = "/model_cache"

# ─────────────────────────────────────────────────────────────────────────────
# TTS 推理函数
# ─────────────────────────────────────────────────────────────────────────────

@app.cls(
    gpu="T4",
    volumes={MODEL_DIR: model_volume},
    # 最多 3 个并发实例
    max_containers=3,
    # 闲置 5 分钟后回收
    scaledown_window=300,
)
class KokoroTTS:
    """Kokoro-82M TTS 推理服务。"""

    @modal.enter()
    def load_model(self):
        """冷启动时加载模型（缓存到 Volume 避免重复下载）."""
        import os
        os.makedirs(MODEL_DIR, exist_ok=True)
        os.environ["HF_HOME"] = MODEL_DIR

        from kokoro import KPipeline
        # 首次运行会从 HuggingFace 下载，后续从 Volume 缓存读取
        self.pipeline_zh = KPipeline(lang_code="z")   # 中文
        self.pipeline_en = KPipeline(lang_code="a")   # 英文（美式）

    @modal.method()
    def synthesize(
        self,
        text: str,
        voice: str = "zf_xiaobei",
        speed: float = 1.0,
    ) -> bytes:
        """
        合成语音，返回 WAV 字节流。

        Args:
            text:  要合成的文案
            voice: 声音 ID，中文推荐 zf_xiaobei / zm_yunxi
            speed: 语速倍率（0.5 ~ 2.0）

        Returns:
            WAV 格式音频字节
        """
        import numpy as np
        import soundfile as sf

        # 根据 voice 前缀选对应 pipeline
        if voice.startswith("z"):
            pipeline = self.pipeline_zh
        else:
            pipeline = self.pipeline_en

        audio_chunks = []
        # Kokoro KPipeline 按句子流式生成，收集后拼接
        for _, _, audio in pipeline(text, voice=voice, speed=speed, split_pattern=r"\n+"):
            audio_chunks.append(audio)

        if not audio_chunks:
            raise ValueError("TTS 生成结果为空，请检查输入文案")

        # 拼接所有音频段，中间加 0.3s 静音分隔
        silence = np.zeros(int(24000 * 0.3), dtype=np.float32)
        combined = audio_chunks[0]
        for chunk in audio_chunks[1:]:
            combined = np.concatenate([combined, silence, chunk])

        # 写入 WAV bytes
        buf = io.BytesIO()
        sf.write(buf, combined, 24000, format="WAV", subtype="PCM_16")
        buf.seek(0)
        return buf.read()


# ─────────────────────────────────────────────────────────────────────────────
# FastAPI Web 端点（供后端直接 HTTP 调用）
# ─────────────────────────────────────────────────────────────────────────────

@app.function()
@modal.asgi_app()
def tts_api():
    """
    对外暴露 HTTP 接口，供 OmniSKU-Forge 后端调用。
    部署后 URL 格式：https://<workspace>--omnivoice-tts-api.modal.run
    """
    from fastapi import FastAPI, HTTPException
    from fastapi.responses import StreamingResponse, JSONResponse
    from pydantic import BaseModel

    web_app = FastAPI(title="OmniVoice TTS API", version="1.0.0")

    class TTSRequest(BaseModel):
        text: str
        voice: str = "zf_xiaobei"
        speed: float = 1.0

    @web_app.get("/health")
    async def health():
        return {"status": "ok", "service": "OmniVoice-TTS"}

    @web_app.get("/voices")
    async def list_voices():
        return {
            "voices": [
                {"id": "zf_xiaobei", "name": "小北（中文女声）", "lang": "zh"},
                {"id": "zm_yunxi",   "name": "云曦（中文男声）", "lang": "zh"},
                {"id": "af_heart",   "name": "Heart（英文女声）", "lang": "en"},
                {"id": "af_bella",   "name": "Bella（英文女声）", "lang": "en"},
                {"id": "am_adam",    "name": "Adam（英文男声）",  "lang": "en"},
            ]
        }

    def _preprocess_zh(text: str) -> str:
        """
        为中文 TTS 预处理文本：
        - 将常见拉丁字母/数字缩写替换为中文发音，避免 Kokoro 中文管线跳过字母
        - 例：维A → 维阿，维D3 → 维迪三，维E → 维伊
        """
        import re

        # ── 维生素字母扩展 ──
        vitamin_map = {
            r'维\s*[Aa][Dd]': '维阿迪',
            r'维\s*[Dd][Aa]': '维迪阿',
            r'维\s*[Dd]3':    '维迪三',
            r'维\s*[Dd]₃':    '维迪三',
            r'维\s*[Kk]2':    '维科二',
            r'维\s*[Kk]₂':    '维科二',
            r'维\s*[Bb]12':   '维比十二',
            r'维\s*[Bb]₁₂':   '维比十二',
            r'维\s*[Bb]6':    '维比六',
            r'维\s*[Bb]₆':    '维比六',
            r'维\s*[Bb]2':    '维比二',
            r'维\s*[Bb]1':    '维比一',
            r'维\s*[Cc]':     '维西',
            r'维\s*[Dd]':     '维迪',
            r'维\s*[Ee]':     '维伊',
            r'维\s*[Kk]':     '维科',
            r'维\s*[Bb]':     '维比',
            r'维\s*[Aa]':     '维阿',
            r'维\s*[Pp]':     '维皮',
            r'维\s*[Hh]':     '维阿奇',
        }
        for pattern, replacement in vitamin_map.items():
            text = re.sub(pattern, replacement, text)

        # ── 常见英文字母缩写（单独大写字母） ──
        letter_zh = {
            'A': '阿', 'B': '比', 'C': '西', 'D': '迪', 'E': '伊',
            'F': '艾夫', 'G': '机', 'H': '艾奇', 'I': '艾', 'J': '杰',
            'K': '科', 'L': '艾尔', 'M': '艾姆', 'N': '艾恩', 'O': '哦',
            'P': '皮', 'Q': '扣', 'R': '阿尔', 'S': '艾斯', 'T': '提',
            'U': '优', 'V': '威', 'W': '双威', 'X': '艾克斯', 'Y': '为',
            'Z': '贼',
        }
        # 仅替换被中文包围或单独出现的大写字母（避免破坏已有词）
        def replace_isolated_letter(m):
            return letter_zh.get(m.group(0).upper(), m.group(0))

        text = re.sub(r'(?<=[^\x00-\x7F])[A-Za-z](?=[^\x00-\x7F])', replace_isolated_letter, text)
        # 替换末尾孤立字母（如 "维E" 中的 E 如果上面没匹配到）
        text = re.sub(r'(?<=[^\x00-\x7F])[A-Za-z]+(?=\s|$|[，。！？、；：])', replace_isolated_letter, text)

        return text

    @web_app.post("/tts")
    async def synthesize(req: TTSRequest):
        if not req.text.strip():
            raise HTTPException(status_code=400, detail="text 不能为空")
        if len(req.text) > 5000:
            raise HTTPException(status_code=400, detail="文案超过 5000 字符限制")

        # 中文声音做预处理（英文声音不需要）
        text_to_synth = _preprocess_zh(req.text) if req.voice.startswith("z") else req.text

        try:
            tts = KokoroTTS()
            wav_bytes = await tts.synthesize.remote.aio(text_to_synth, req.voice, req.speed)
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

    return web_app


# ─────────────────────────────────────────────────────────────────────────────
# 本地测试入口
# ─────────────────────────────────────────────────────────────────────────────

@app.local_entrypoint()
def main():
    """modal run modal_tts_service.py"""
    tts = KokoroTTS()
    test_text = "这款茶叶精选云南古树普洱，回甘持久，香气馥郁，是送礼自饮的绝佳之选。"
    wav = tts.synthesize.remote(test_text, voice="zf_xiaobei", speed=1.0)
    with open("test_output.wav", "wb") as f:
        f.write(wav)
    print(f"✅ 测试完成，已保存 test_output.wav（{len(wav)} bytes）")
