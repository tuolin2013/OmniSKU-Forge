"""
EmotiVoice TTS Service — deployed on Modal.

基于网易云音乐开源的 EmotiVoice，支持 200+ 情绪风格。
部署命令：
    modal deploy modal_emotivoice_service.py

调用方式：
    POST https://<workspace>--emotivoice-tts-api.modal.run/tts
    Body: {
        "text": "口播文案...",
        "speaker": "9017",      # 说话人 ID
        "emotion": "开心",       # 情绪描述（中文自然语言）
        "speed": 1.0
    }
    Response: audio/wav 字节流

支持的情绪（部分）：
    开心、激动、兴奋、自信、温柔、平静、悲伤、生气、惊讶、严肃
    亲切、热情、专业、活泼、慵懒、神秘 … (可填任意中文情绪描述)
"""

import io
import modal

# ─────────────────────────────────────────────────────────────────────────────
# Modal 镜像
# ─────────────────────────────────────────────────────────────────────────────

emotivoice_image = (
    modal.Image.debian_slim(python_version="3.10")
    .apt_install(
        "git", "wget", "curl", "ffmpeg", "libsndfile1",
        "build-essential",
    )
    .pip_install(
        "torch==2.1.2",
        "torchaudio==2.1.2",
        "--extra-index-url", "https://download.pytorch.org/whl/cu121",
    )
    .pip_install(
        "fastapi[standard]==0.115.4",
        "numpy==1.26.4",
        "soundfile==0.12.1",
        "scipy==1.13.1",
        "jieba==0.42.1",
        "pypinyin==0.51.0",
        "inflect==7.4.0",
        "pydantic==2.8.2",
        "huggingface-hub==0.24.6",
        "transformers==4.44.2",
        "cn2an==0.5.22",
        "zhon==2.0.2",
    )
    .run_commands(
        # Clone EmotiVoice
        "git clone https://github.com/netease-youdao/EmotiVoice.git /opt/EmotiVoice",
        "cd /opt/EmotiVoice && pip install -r requirements.txt 2>/dev/null || true",
        # Pre-download model weights
        (
            "python -c \""
            "from huggingface_hub import snapshot_download; "
            "snapshot_download('youdao/emotivoice_v1', local_dir='/model_cache/emotivoice_v1')"
            "\" 2>/dev/null || true"
        ),
    )
)

app = modal.App("emotivoice-tts", image=emotivoice_image)

model_volume = modal.Volume.from_name("emotivoice-model-cache", create_if_missing=True)
MODEL_DIR = "/model_cache"

# 常用情绪 → EmotiVoice prompt 映射（EmotiVoice 接受自然语言情绪描述）
EMOTION_LABELS = {
    "neutral":  "平静",
    "happy":    "开心",
    "excited":  "激动兴奋",
    "sad":      "悲伤",
    "angry":    "生气",
    "tender":   "温柔",
    "lively":   "活泼热情",
    "calm":     "平静沉稳",
    "whisper":  "轻声细语",
    "confident":"自信",
    "warm":     "亲切温暖",
    "serious":  "严肃专业",
}

# EmotiVoice 内置说话人（部分）
SPEAKER_IDS = {
    "中文女声A": "9017",
    "中文女声B": "8051",
    "中文男声A": "6097",
    "中文男声B": "7989",
    "英文女声":  "en_us_female",
}


@app.cls(
    gpu="T4",
    volumes={MODEL_DIR: model_volume},
    max_containers=2,
    scaledown_window=300,
)
class EmotiVoiceTTS:

    @modal.enter()
    def load_model(self):
        import sys, os
        sys.path.insert(0, "/opt/EmotiVoice")
        os.environ["HF_HOME"] = MODEL_DIR
        os.makedirs(MODEL_DIR, exist_ok=True)

        # EmotiVoice uses a simple synthesis pipeline
        from emotivoice.models.prompt_tts_modified.jets import JETSGenerator
        from emotivoice.models.prompt_tts_modified.configuration_jets import JETSConfig
        import torch

        model_path = os.path.join(MODEL_DIR, "emotivoice_v1")
        if not os.path.exists(model_path):
            from huggingface_hub import snapshot_download
            snapshot_download("youdao/emotivoice_v1", local_dir=model_path)

        config = JETSConfig.from_pretrained(model_path)
        self.generator = JETSGenerator(config).to("cuda" if torch.cuda.is_available() else "cpu")
        checkpoint = torch.load(
            os.path.join(model_path, "g_00140000"),
            map_location="cpu",
        )
        self.generator.load_state_dict(checkpoint["generator"])
        self.generator.eval()
        self.device = next(self.generator.parameters()).device
        self.sample_rate = 24000

    @modal.method()
    def synthesize(
        self,
        text: str,
        speaker: str = "中文女声A",
        emotion: str = "neutral",
        speed: float = 1.0,
    ) -> bytes:
        import sys, os, torch
        import numpy as np
        import soundfile as sf

        sys.path.insert(0, "/opt/EmotiVoice")
        from emotivoice.frontend import g2p_cn_en, ROOT_DIR, read_lexicon, G2p
        from emotivoice.inference_am_vocoder_joint import get_style_embedding

        # 情绪 prompt
        emotion_prompt = EMOTION_LABELS.get(emotion, emotion)
        speaker_id = SPEAKER_IDS.get(speaker, "9017")

        lexicon = read_lexicon(f"{ROOT_DIR}/lexicon/librispeech-lexicon.txt")
        g2p = G2p()

        phones, tones, lang_ids = g2p_cn_en(text, g2p, lexicon)

        style_embedding = get_style_embedding(emotion_prompt, self.generator.bert, self.device)

        with torch.no_grad():
            audio = self.generator.inference(
                phones=torch.tensor(phones).unsqueeze(0).to(self.device),
                tones=torch.tensor(tones).unsqueeze(0).to(self.device),
                lang_ids=torch.tensor(lang_ids).unsqueeze(0).to(self.device),
                style_embedding=style_embedding.unsqueeze(0),
                speaker_id=torch.tensor([int(speaker_id) if speaker_id.isdigit() else 0]).to(self.device),
                speed=speed,
            )[0].squeeze().cpu().numpy()

        buf = io.BytesIO()
        sf.write(buf, audio, self.sample_rate, format="WAV", subtype="PCM_16")
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

    web_app = FastAPI(title="EmotiVoice TTS API", version="1.0.0")

    class TTSRequest(BaseModel):
        text: str
        speaker: str = "中文女声A"
        emotion: str = "neutral"   # neutral/happy/excited/sad/angry/tender/lively/calm/whisper/confident/warm/serious
        speed: float = 1.0

    @web_app.get("/health")
    async def health():
        return {
            "status": "ok",
            "service": "EmotiVoice-TTS",
            "emotions": list(EMOTION_LABELS.keys()),
        }

    @web_app.get("/voices")
    async def voices():
        return {
            "voices": [
                {"id": k, "name": k, "lang": "en" if "英文" in k else "zh"}
                for k in SPEAKER_IDS
            ],
            "emotions": list(EMOTION_LABELS.keys()),
        }

    @web_app.post("/tts")
    async def synthesize(req: TTSRequest):
        if not req.text.strip():
            raise HTTPException(status_code=400, detail="text 不能为空")
        if len(req.text) > 5000:
            raise HTTPException(status_code=400, detail="文案超过 5000 字符限制")
        try:
            tts = EmotiVoiceTTS()
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
            raise HTTPException(status_code=500, detail=f"EmotiVoice 合成失败: {exc}")

    return web_app


@app.local_entrypoint()
def main():
    tts = EmotiVoiceTTS()
    wav = tts.synthesize.remote(
        "这款茶叶精选云南古树，回甘持久，立即下单享受好茶！",
        emotion="excited",
    )
    with open("test_emotivoice.wav", "wb") as f:
        f.write(wav)
    print(f"✅ EmotiVoice 测试完成，已保存 test_emotivoice.wav（{len(wav)} bytes）")
