"""
CosyVoice 2 TTS Service — deployed on Modal.

支持原生情绪控制标签（<laughter>/<breath>/<strong> 等）和 instruct 模式。
部署命令：
    modal deploy modal_cosyvoice_service.py

调用方式：
    POST https://<workspace>--cosyvoice-tts-api.modal.run/tts
    Body: {
        "text": "口播文案...",
        "speaker": "中文女声",
        "emotion": "excited",   # neutral/happy/excited/sad/angry/tender
        "speed": 1.0
    }
    Response: audio/wav 字节流
"""

import io
import modal

# ─────────────────────────────────────────────────────────────────────────────
# Modal 镜像
# ─────────────────────────────────────────────────────────────────────────────

cosyvoice_image = (
    modal.Image.debian_slim(python_version="3.10")
    .apt_install(
        "git", "wget", "curl", "ffmpeg", "libsndfile1",
        "build-essential", "cmake",
    )
    .pip_install(
        "torch==2.3.1",
        "torchaudio==2.3.1",
        "--extra-index-url", "https://download.pytorch.org/whl/cu121",
    )
    .pip_install(
        "fastapi[standard]==0.115.4",
        "numpy==1.26.4",
        "soundfile==0.12.1",
        "scipy==1.13.1",
        "librosa==0.10.2",
        "huggingface-hub==0.24.6",
        "transformers==4.44.2",
        "modelscope==1.18.1",
        "conformer==0.3.2",
        "diffusers==0.30.3",
        "lightning==2.4.0",
        "hydra-core==1.3.2",
        "onnxruntime-gpu==1.19.2",
        "WeTextProcessing==1.0.3",
        "inflect==7.4.0",
        "pydantic==2.8.2",
    )
    .run_commands(
        # Clone CosyVoice2 repo
        "git clone https://github.com/FunAudioLLM/CosyVoice.git /opt/CosyVoice",
        "cd /opt/CosyVoice && pip install -r requirements.txt --no-deps 2>/dev/null || true",
        "cd /opt/CosyVoice/third_party/Matcha-TTS && pip install -e . 2>/dev/null || true",
    )
)

app = modal.App("cosyvoice-tts", image=cosyvoice_image)

model_volume = modal.Volume.from_name("cosyvoice-model-cache", create_if_missing=True)
MODEL_DIR = "/model_cache"

# ─────────────────────────────────────────────────────────────────────────────
# 情绪标签映射 → CosyVoice instruct 文本
# ─────────────────────────────────────────────────────────────────────────────

EMOTION_INSTRUCT = {
    "neutral":  "",           # 不加 instruct，走 sft 模式
    "happy":    "用开心愉快的语气说",
    "excited":  "用激动兴奋的语气说",
    "sad":      "用伤感低沉的语气说",
    "angry":    "用生气严肃的语气说",
    "tender":   "用温柔细腻的语气说",
    "lively":   "用活泼热情的语气说，语速稍快",
    "calm":     "用平静沉稳的语气说",
    "whisper":  "用轻声细语耳语的方式说",
}

SPEAKER_MAP = {
    "中文女声":  "中文女声",
    "中文男声":  "中文男声",
    "英文女声":  "英文女声",
    "英文男声":  "英文男声",
}


@app.cls(
    gpu="A10G",
    volumes={MODEL_DIR: model_volume},
    max_containers=2,
    scaledown_window=300,
)
class CosyVoiceTTS:

    @modal.enter()
    def load_model(self):
        import sys, os
        sys.path.insert(0, "/opt/CosyVoice")
        sys.path.insert(0, "/opt/CosyVoice/third_party/Matcha-TTS")
        os.environ["HF_HOME"] = MODEL_DIR
        os.makedirs(MODEL_DIR, exist_ok=True)

        from cosyvoice.cli.cosyvoice import CosyVoice2
        # 下载 CosyVoice2-0.5B（首次从 ModelScope 下载，后续走 Volume 缓存）
        self.model = CosyVoice2(
            "iic/CosyVoice2-0.5B",
            load_jit=False,
            load_trt=False,
        )

    @modal.method()
    def synthesize(
        self,
        text: str,
        speaker: str = "中文女声",
        emotion: str = "neutral",
        speed: float = 1.0,
    ) -> bytes:
        import numpy as np
        import soundfile as sf

        instruct = EMOTION_INSTRUCT.get(emotion, "")
        spk = SPEAKER_MAP.get(speaker, "中文女声")

        if instruct:
            # instruct2 模式：支持情绪引导
            results = list(self.model.inference_instruct2(
                text, instruct, spk, stream=False, speed=speed
            ))
        else:
            # sft 模式：无情绪标注，音质更稳定
            results = list(self.model.inference_sft(
                text, spk, stream=False, speed=speed
            ))

        if not results:
            raise ValueError("CosyVoice 生成结果为空")

        # 拼接所有段落
        audio_chunks = [r["tts_speech"].numpy().flatten() for r in results]
        silence = np.zeros(int(self.model.sample_rate * 0.2), dtype=np.float32)
        combined = audio_chunks[0]
        for chunk in audio_chunks[1:]:
            combined = np.concatenate([combined, silence, chunk])

        buf = io.BytesIO()
        sf.write(buf, combined, self.model.sample_rate, format="WAV", subtype="PCM_16")
        buf.seek(0)
        return buf.read()


# ─────────────────────────────────────────────────────────────────────────────
# FastAPI Web 端点
# ─────────────────────────────────────────────────────────────────────────────

@app.function()
@modal.asgi_app()
def tts_api():
    from fastapi import FastAPI, HTTPException
    from fastapi.responses import StreamingResponse
    from pydantic import BaseModel

    web_app = FastAPI(title="CosyVoice 2 TTS API", version="1.0.0")

    class TTSRequest(BaseModel):
        text: str
        speaker: str = "中文女声"
        emotion: str = "neutral"
        speed: float = 1.0

    @web_app.get("/health")
    async def health():
        return {"status": "ok", "service": "CosyVoice2-TTS", "emotions": list(EMOTION_INSTRUCT.keys())}

    @web_app.get("/voices")
    async def voices():
        return {
            "voices": [
                {"id": "中文女声", "name": "中文女声（CosyVoice2）", "lang": "zh"},
                {"id": "中文男声", "name": "中文男声（CosyVoice2）", "lang": "zh"},
                {"id": "英文女声", "name": "英文女声（CosyVoice2）", "lang": "en"},
                {"id": "英文男声", "name": "英文男声（CosyVoice2）", "lang": "en"},
            ],
            "emotions": list(EMOTION_INSTRUCT.keys()),
        }

    @web_app.post("/tts")
    async def synthesize(req: TTSRequest):
        if not req.text.strip():
            raise HTTPException(status_code=400, detail="text 不能为空")
        if len(req.text) > 5000:
            raise HTTPException(status_code=400, detail="文案超过 5000 字符限制")
        try:
            tts = CosyVoiceTTS()
            wav_bytes = await tts.synthesize.remote.aio(
                req.text, req.speaker, req.emotion, req.speed
            )
            return StreamingResponse(
                io.BytesIO(wav_bytes),
                media_type="audio/wav",
                headers={
                    "Content-Disposition": "attachment; filename=voice.wav",
                    "Content-Length": str(len(wav_bytes)),
                },
            )
        except Exception as exc:
            raise HTTPException(status_code=500, detail=f"CosyVoice 合成失败: {exc}")

    return web_app


@app.local_entrypoint()
def main():
    tts = CosyVoiceTTS()
    wav = tts.synthesize.remote("这款产品专为您打造，品质卓越，立即下单！", emotion="excited")
    with open("test_cosyvoice.wav", "wb") as f:
        f.write(wav)
    print(f"✅ CosyVoice 测试完成，已保存 test_cosyvoice.wav（{len(wav)} bytes）")
