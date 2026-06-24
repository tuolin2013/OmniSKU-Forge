# backend/app/api/v1/tts.py
"""
TTS（文字转语音）路由。

接口列表：
1. POST /api/v1/tts/extract-script       — 从策划案提取口播文案（LLM 生成）
2. POST /api/v1/tts/generate             — Kokoro TTS（OmniVoice）合成语音，上传 R2
3. POST /api/v1/tts/generate-cosyvoice   — CosyVoice 2 合成（支持情绪控制），上传 R2
4. POST /api/v1/tts/generate-emotivoice  — EmotiVoice 合成（支持情绪控制），上传 R2
"""

import io
import logging
import os
import time
import uuid

import requests as _req
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from app.api.core.services.storage import r2, R2Config, _build_s3_client

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/tts", tags=["tts"])

# ─────────────────────────────────────────────────────────────────────────────
# 配置
# ─────────────────────────────────────────────────────────────────────────────

# Kokoro TTS 服务 URL（通过环境变量注入，兼容 Modal 或任意自托管部署）
MODAL_TTS_URL = os.environ.get("MODAL_TTS_URL", "").rstrip("/")

# TTS 相关的 LLM 配置复用 base_brain 的密钥
from app.api.core.services.base_brain import RIGHT_CODE_API_KEY, CODEX_BASE_URL, CODEX_MODEL


# ─────────────────────────────────────────────────────────────────────────────
# Schemas
# ─────────────────────────────────────────────────────────────────────────────

class ExtractScriptRequest(BaseModel):
    pm_report: str = Field(..., description="策划案全文")
    sku_name: str = Field(default="", description="产品名称，用于上下文")
    platform: str = Field(default="taobao")


class ExtractScriptResponse(BaseModel):
    code: int
    data: str  # 提取出的口播文案
    message: str = ""


class TTSGenerateRequest(BaseModel):
    text: str = Field(..., description="需要合成语音的文案")
    voice: str = Field(default="zf_xiaobei", description="声音 ID")
    speed: float = Field(default=1.0, ge=0.5, le=2.0, description="语速倍率")
    product_name: str = Field(default="product", description="产品名，用于 R2 文件命名")


class TTSGenerateResponse(BaseModel):
    code: int
    data: dict = {}   # { "url": "...", "key": "..." }
    message: str = ""


# ─────────────────────────────────────────────────────────────────────────────
# R2 voice 文件夹上传辅助
# ─────────────────────────────────────────────────────────────────────────────

def _upload_voice_to_r2(wav_bytes: bytes, record_id: str) -> str:
    """
    上传 WAV 字节到 R2 的 voice/ 路径，返回公开 URL。
    使用独立的 key 前缀 voice/ 与图片的 uploads/ 分区存放。
    """
    if not wav_bytes:
        raise ValueError("音频数据不能为空")

    file_key = f"voice/{record_id}.wav"
    logger.info("☁️ 写入 R2 voice: bucket=%s key=%s", R2Config.BUCKET_NAME, file_key)

    s3 = _build_s3_client()
    for attempt in range(1, 4):
        try:
            s3.put_object(
                Bucket=R2Config.BUCKET_NAME,
                Key=file_key,
                Body=wav_bytes,
                ContentType="audio/wav",
            )
            return R2Config.public_url(file_key)
        except Exception as exc:
            logger.warning("R2 voice 上传第 %d 次失败: %s", attempt, exc)
            if attempt == 3:
                raise
            time.sleep(1)


# ─────────────────────────────────────────────────────────────────────────────
# 1. 提取口播文案
# ─────────────────────────────────────────────────────────────────────────────

@router.post("/extract-script", response_model=ExtractScriptResponse)
async def extract_broadcast_script(req: ExtractScriptRequest):
    """
    从策划案中提取适合口播的精炼文案。
    要求：口语化、节奏感强、适合 TTS 朗读、控制在 200 字以内。
    """
    if not req.pm_report.strip():
        raise HTTPException(status_code=400, detail="策划案不能为空")

    sku_hint = f"产品：{req.sku_name}\n" if req.sku_name else ""
    platform_hint = "淘宝/天猫" if req.platform == "taobao" else req.platform

    prompt = f"""你是一位顶尖的电商短视频口播文案专家，擅长为{platform_hint}商品写出极具感染力的口播脚本。

{sku_hint}
【策划案原文】：
{req.pm_report}

请从以上策划案中提取并优化为一段【口播文案】，要求：
1. 纯口语化表达，听感自然流畅，避免书面语
2. 开头 3 秒必须有吸引力（钩子）
3. 突出 2~3 个核心卖点，每个卖点用具体数字或场景支撑
4. 结尾带行动召唤（如：立即下单/限时优惠/点击购买）
5. 全文控制在 150~200 字，适合 30~45 秒口播时长
6. 只输出文案本身，不要任何标注、序号或说明文字

【口播文案】："""

    try:
        headers = {
            "Authorization": f"Bearer {RIGHT_CODE_API_KEY}",
            "Content-Type": "application/json",
        }
        payload = {
            "model": CODEX_MODEL,
            "messages": [{"role": "user", "content": prompt}],
            "temperature": 0.75,
        }
        resp = _req.post(
            f"{CODEX_BASE_URL}/chat/completions",
            json=payload,
            headers=headers,
            timeout=60,
            proxies={"http": None, "https": None},
        )
        if resp.status_code != 200:
            raise Exception(f"HTTP {resp.status_code}: {resp.text}")

        script = resp.json()["choices"][0]["message"]["content"].strip()
        return ExtractScriptResponse(code=200, data=script)

    except Exception as exc:
        logger.error("提取口播文案失败: %s", exc)
        raise HTTPException(status_code=500, detail=f"提取口播文案失败: {exc}")


# ─────────────────────────────────────────────────────────────────────────────
# 2. TTS 生成 + 上传 R2
# ─────────────────────────────────────────────────────────────────────────────

@router.post("/generate", response_model=TTSGenerateResponse)
async def generate_tts(req: TTSGenerateRequest):
    """
    调用 Modal TTS 服务合成语音，上传到 R2 voice/ 文件夹，返回公开 URL。

    前置条件：环境变量 MODAL_TTS_URL 必须配置为 Modal 部署的服务地址。
    """
    if not req.text.strip():
        raise HTTPException(status_code=400, detail="文案不能为空")

    if not MODAL_TTS_URL:
        raise HTTPException(
            status_code=503,
            detail="TTS 服务未配置。请在 .env 中设置 MODAL_TTS_URL 为 Kokoro TTS 服务地址。",
        )

    # ── 调用 Modal TTS 服务 ──
    logger.info("🎙️ 调用 TTS 服务: voice=%s speed=%s text_len=%d", req.voice, req.speed, len(req.text))
    try:
        # Modal 冷启动需要加载 Kokoro 模型，首次可能需要 3-5 分钟
        # 重试逻辑：最多 2 次，每次 300s 超时
        last_exc = None
        wav_bytes = None
        for attempt in range(1, 3):
            try:
                logger.info("🎙️ TTS 请求第 %d 次 (timeout=300s)", attempt)
                tts_resp = _req.post(
                    f"{MODAL_TTS_URL}/tts",
                    json={"text": req.text, "voice": req.voice, "speed": req.speed},
                    timeout=300,  # 300s — 覆盖 Modal 冷启动时间
                    proxies={"http": None, "https": None},  # 绕过系统代理
                )
                if tts_resp.status_code != 200:
                    raise Exception(f"Modal TTS 返回 HTTP {tts_resp.status_code}: {tts_resp.text[:200]}")
                wav_bytes = tts_resp.content
                logger.info("✅ TTS 合成成功 (attempt=%d)，音频大小: %d bytes", attempt, len(wav_bytes))
                break
            except _req.exceptions.Timeout:
                last_exc = Exception(f"第 {attempt} 次请求超时（300s），Modal 容器可能仍在冷启动中")
                logger.warning("TTS 超时，attempt=%d", attempt)
                if attempt < 2:
                    import time as _time
                    _time.sleep(5)
            except Exception as exc:
                last_exc = exc
                break

        if wav_bytes is None:
            raise last_exc or Exception("TTS 请求失败")

    except Exception as exc:
        logger.error("TTS 合成失败: %s", exc)
        raise HTTPException(status_code=500, detail=f"TTS 合成失败: {exc}")

    # ── 上传到 R2 voice/ 文件夹 ──
    try:
        from app.api.core.utils.pinyin import get_pinyin_initials
        pinyin_name = get_pinyin_initials(req.product_name) if req.product_name else "product"
        record_id = f"{pinyin_name}_voice_{uuid.uuid4().hex[:8]}"
        voice_url = _upload_voice_to_r2(wav_bytes, record_id)
        file_key = f"voice/{record_id}.wav"
        logger.info("✅ 语音上传 R2 成功: %s", voice_url)
        return TTSGenerateResponse(
            code=200,
            data={"url": voice_url, "key": file_key},
            message="语音合成并上传成功",
        )
    except Exception as exc:
        logger.error("语音上传 R2 失败: %s", exc)
        raise HTTPException(status_code=500, detail=f"语音上传 R2 失败: {exc}")


# ─────────────────────────────────────────────────────────────────────────────
# 3. 可用声音列表（透传 Modal 服务，带本地 fallback）
# ─────────────────────────────────────────────────────────────────────────────

_DEFAULT_VOICES = [
    {"id": "zf_xiaobei", "name": "小北（中文女声）", "lang": "zh"},
    {"id": "zm_yunxi",   "name": "云曦（中文男声）", "lang": "zh"},
    {"id": "af_heart",   "name": "Heart（英文女声）", "lang": "en"},
    {"id": "af_bella",   "name": "Bella（英文女声）", "lang": "en"},
    {"id": "am_adam",    "name": "Adam（英文男声）",  "lang": "en"},
]


@router.get("/voices")
async def list_voices():
    """返回可用 TTS 声音列表，优先从 Modal 服务拉取，失败时返回内置默认列表。"""
    if MODAL_TTS_URL:
        try:
            resp = _req.get(f"{MODAL_TTS_URL}/voices", timeout=5, proxies={"http": None, "https": None})
            if resp.status_code == 200:
                return {"code": 200, "data": resp.json().get("voices", _DEFAULT_VOICES)}
        except Exception:
            pass
    return {"code": 200, "data": _DEFAULT_VOICES}


# ─────────────────────────────────────────────────────────────────────────────
# 通用 Modal TTS 调用辅助
# ─────────────────────────────────────────────────────────────────────────────

def _call_modal_tts(url: str, payload: dict, engine_name: str) -> bytes:
    """调用任意 Modal TTS 服务，返回 WAV 字节，支持重试和超时。"""
    last_exc = None
    for attempt in range(1, 3):
        try:
            logger.info("🎙️ %s 请求第 %d 次 (timeout=300s)", engine_name, attempt)
            resp = _req.post(
                f"{url}/tts",
                json=payload,
                timeout=300,
                proxies={"http": None, "https": None},
            )
            if resp.status_code != 200:
                raise Exception(f"{engine_name} 返回 HTTP {resp.status_code}: {resp.text[:200]}")
            logger.info("✅ %s 合成成功 (attempt=%d)，大小: %d bytes", engine_name, attempt, len(resp.content))
            return resp.content
        except _req.exceptions.Timeout:
            last_exc = Exception(f"第 {attempt} 次超时（300s），容器可能在冷启动")
            logger.warning("%s 超时，attempt=%d", engine_name, attempt)
            if attempt < 2:
                time.sleep(5)
        except Exception as exc:
            last_exc = exc
            break
    raise last_exc or Exception(f"{engine_name} 请求失败")


def _build_voice_response(wav_bytes: bytes, product_name: str, engine: str) -> TTSGenerateResponse:
    """上传 WAV 到 R2，构建统一响应。"""
    try:
        from app.api.core.utils.pinyin import get_pinyin_initials
        pinyin_name = get_pinyin_initials(product_name) if product_name else "product"
    except Exception:
        pinyin_name = "product"
    record_id = f"{pinyin_name}_{engine}_{uuid.uuid4().hex[:8]}"
    voice_url = _upload_voice_to_r2(wav_bytes, record_id)
    file_key = f"voice/{record_id}.wav"
    logger.info("✅ 语音上传 R2 成功: %s", voice_url)
    return TTSGenerateResponse(
        code=200,
        data={"url": voice_url, "key": file_key},
        message=f"{engine} 语音合成并上传成功",
    )


# ─────────────────────────────────────────────────────────────────────────────
# 4. CosyVoice 2 TTS（情绪控制）
# ─────────────────────────────────────────────────────────────────────────────

# CosyVoice TTS 服务 URL
MODAL_COSYVOICE_URL = os.environ.get("MODAL_COSYVOICE_URL", "").rstrip("/")

COSYVOICE_EMOTIONS = [
    {"id": "neutral",  "label": "平静（默认）"},
    {"id": "happy",    "label": "开心"},
    {"id": "excited",  "label": "激动兴奋"},
    {"id": "sad",      "label": "悲伤"},
    {"id": "angry",    "label": "生气"},
    {"id": "tender",   "label": "温柔"},
    {"id": "lively",   "label": "活泼热情"},
    {"id": "calm",     "label": "平静沉稳"},
    {"id": "whisper",  "label": "轻声耳语"},
]

COSYVOICE_SPEAKERS = [
    {"id": "中文女声", "name": "中文女声"},
    {"id": "中文男声", "name": "中文男声"},
    {"id": "英文女声", "name": "英文女声"},
    {"id": "英文男声", "name": "英文男声"},
]


class CosyVoiceRequest(BaseModel):
    text: str = Field(..., description="需要合成语音的文案")
    speaker: str = Field(default="中文女声", description="说话人")
    emotion: str = Field(default="neutral", description="情绪控制")
    speed: float = Field(default=1.0, ge=0.5, le=2.0)
    product_name: str = Field(default="product")


@router.post("/generate-cosyvoice", response_model=TTSGenerateResponse)
async def generate_cosyvoice(req: CosyVoiceRequest):
    """调用 CosyVoice 2 合成语音（支持情绪控制），上传 R2 voice/。"""
    if not req.text.strip():
        raise HTTPException(status_code=400, detail="文案不能为空")
    if not MODAL_COSYVOICE_URL:
        raise HTTPException(
            status_code=503,
            detail="CosyVoice 服务未配置。请在 .env 中设置 MODAL_COSYVOICE_URL 为服务地址。",
        )
    logger.info("🎭 CosyVoice: speaker=%s emotion=%s text_len=%d", req.speaker, req.emotion, len(req.text))
    try:
        wav_bytes = _call_modal_tts(
            MODAL_COSYVOICE_URL,
            {"text": req.text, "speaker": req.speaker, "emotion": req.emotion, "speed": req.speed},
            "CosyVoice2",
        )
    except Exception as exc:
        logger.error("CosyVoice 合成失败: %s", exc)
        raise HTTPException(status_code=500, detail=f"CosyVoice 合成失败: {exc}")

    try:
        return _build_voice_response(wav_bytes, req.product_name, "cosyvoice")
    except Exception as exc:
        logger.error("CosyVoice 上传 R2 失败: %s", exc)
        raise HTTPException(status_code=500, detail=f"语音上传 R2 失败: {exc}")


@router.get("/cosyvoice-emotions")
async def cosyvoice_emotions():
    return {"code": 200, "data": {"emotions": COSYVOICE_EMOTIONS, "speakers": COSYVOICE_SPEAKERS}}


# ─────────────────────────────────────────────────────────────────────────────
# 5. EmotiVoice TTS（情绪控制）
# ─────────────────────────────────────────────────────────────────────────────

# EmotiVoice TTS 服务 URL
MODAL_EMOTIVOICE_URL = os.environ.get("MODAL_EMOTIVOICE_URL", "").rstrip("/")

EMOTIVOICE_EMOTIONS = [
    {"id": "neutral",   "label": "平静（默认）"},
    {"id": "happy",     "label": "开心"},
    {"id": "excited",   "label": "激动兴奋"},
    {"id": "sad",       "label": "悲伤"},
    {"id": "angry",     "label": "生气"},
    {"id": "tender",    "label": "温柔"},
    {"id": "lively",    "label": "活泼热情"},
    {"id": "calm",      "label": "平静沉稳"},
    {"id": "whisper",   "label": "轻声耳语"},
    {"id": "confident", "label": "自信"},
    {"id": "warm",      "label": "亲切温暖"},
    {"id": "serious",   "label": "严肃专业"},
]

EMOTIVOICE_SPEAKERS = [
    {"id": "中文女声A", "name": "中文女声A"},
    {"id": "中文女声B", "name": "中文女声B"},
    {"id": "中文男声A", "name": "中文男声A"},
    {"id": "中文男声B", "name": "中文男声B"},
]


class EmotiVoiceRequest(BaseModel):
    text: str = Field(..., description="需要合成语音的文案")
    speaker: str = Field(default="中文女声A", description="说话人")
    emotion: str = Field(default="neutral", description="情绪控制")
    speed: float = Field(default=1.0, ge=0.5, le=2.0)
    product_name: str = Field(default="product")


@router.post("/generate-emotivoice", response_model=TTSGenerateResponse)
async def generate_emotivoice(req: EmotiVoiceRequest):
    """调用 EmotiVoice 合成语音（支持情绪控制），上传 R2 voice/。"""
    if not req.text.strip():
        raise HTTPException(status_code=400, detail="文案不能为空")
    if not MODAL_EMOTIVOICE_URL:
        raise HTTPException(
            status_code=503,
            detail="EmotiVoice 服务未配置。请在 .env 中设置 MODAL_EMOTIVOICE_URL 为服务地址。",
        )
    logger.info("🎭 EmotiVoice: speaker=%s emotion=%s text_len=%d", req.speaker, req.emotion, len(req.text))
    try:
        wav_bytes = _call_modal_tts(
            MODAL_EMOTIVOICE_URL,
            {"text": req.text, "speaker": req.speaker, "emotion": req.emotion, "speed": req.speed},
            "EmotiVoice",
        )
    except Exception as exc:
        logger.error("EmotiVoice 合成失败: %s", exc)
        raise HTTPException(status_code=500, detail=f"EmotiVoice 合成失败: {exc}")

    try:
        return _build_voice_response(wav_bytes, req.product_name, "emotivoice")
    except Exception as exc:
        logger.error("EmotiVoice 上传 R2 失败: %s", exc)
        raise HTTPException(status_code=500, detail=f"语音上传 R2 失败: {exc}")


@router.get("/emotivoice-emotions")
async def emotivoice_emotions():
    return {"code": 200, "data": {"emotions": EMOTIVOICE_EMOTIONS, "speakers": EMOTIVOICE_SPEAKERS}}


# ─────────────────────────────────────────────────────────────────────────────
# 6. TTS 服务状态检查（前端用于判断哪些引擎已部署）
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/status")
async def tts_status():
    """返回各 TTS 引擎的部署状态，供前端渲染 UI。"""
    return {
        "code": 200,
        "data": {
            "kokoro":     {"ready": bool(MODAL_TTS_URL),        "url": MODAL_TTS_URL or None},
            "cosyvoice":  {"ready": bool(MODAL_COSYVOICE_URL),  "url": MODAL_COSYVOICE_URL or None},
            "emotivoice": {"ready": bool(MODAL_EMOTIVOICE_URL), "url": MODAL_EMOTIVOICE_URL or None},
        },
    }
