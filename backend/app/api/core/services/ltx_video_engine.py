# backend/app/api/core/services/ltx_video_engine.py
"""
LTX-Video 视频生成引擎。
封装部署在 RunPod 上的 LTX-Video 推理服务。

RunPod 服务接口规范（API_GUIDE.md）:
  GET  /api/v1/health                → { status: "ok", model_loaded: bool }
  POST /api/v1/generate/storyboard   → 批量分镜，返回 storyboard_videos.zip
  POST /api/v1/generate              → 单分镜，返回 video/mp4 二进制流

  参考图字段：reference_image（base64 字符串，非 URL）

部署后在 backend/.env 中配置：
  LTX_VIDEO_BASE_URL=https://q9v8jl52w5pb58-8000.proxy.runpod.net
"""

import base64
import io
import os
import uuid
import zipfile
import logging
import requests
from dotenv import load_dotenv
from typing import Optional

from app.api.core.services.storage import r2

load_dotenv()
logger = logging.getLogger(__name__)

# ─── 配置 ──────────────────────────────────────────────────────────────────────
LTX_VIDEO_BASE_URL: str = os.environ.get("LTX_VIDEO_BASE_URL", "").rstrip("/")

_CONNECT_TIMEOUT = 15
# 批量分镜推理可能耗时很长，最多等 20 分钟
_READ_TIMEOUT = 1200

# 宽高比 → (width, height)，必须是 32 的倍数
_RATIO_SIZES: dict[str, tuple[int, int]] = {
    "16:9": (704, 480),
    "9:16": (480, 704),
    "1:1":  (512, 512),
    "3:4":  (480, 640),
}


def _nearest_8n_plus_1(n: int) -> int:
    """将 num_frames 修正为最近的 8N+1 值（向上取整）。"""
    if (n - 1) % 8 == 0:
        return n
    remainder = (n - 1) % 8
    adjusted = n + (8 - remainder)
    logger.debug("[LTXVideo] num_frames %d → %d", n, adjusted)
    return adjusted


def _url_to_base64(url: str) -> Optional[str]:
    """
    从 URL 下载图片并转为 base64 字符串。
    下载失败返回 None（降级为文生视频）。
    """
    try:
        resp = requests.get(url, timeout=30, verify=False)
        resp.raise_for_status()
        content_type = resp.headers.get("Content-Type", "image/jpeg")
        b64 = base64.b64encode(resp.content).decode()
        # 返回 data URI 格式，服务端两种格式都支持
        return f"data:{content_type};base64,{b64}"
    except Exception as e:
        logger.warning("[LTXVideo] 参考图下载失败，降级为文生视频: %s", e)
        return None


def generate_storyboard_ltx(
    shots: list[dict],
    num_frames: int = 65,
    steps: int = 30,
) -> list[str]:
    """
    批量提交分镜脚本到 RunPod LTX-Video，返回每个分镜的 R2 永久 URL 列表。

    Args:
        shots: 分镜列表，每项包含：
            - prompt: str
            - reference_image: str | None  (base64 或 data URI，已由调用方转换)
            - width: int
            - height: int
            - num_frames: int（可选，覆盖默认值）
            - num_inference_steps: int（可选）
        num_frames: 默认帧数（8N+1 格式，如 65）
        steps: 默认推理步数

    Returns:
        URL 列表，长度与 shots 相同。失败的分镜对应 "❌..." 字符串。
    """
    if not LTX_VIDEO_BASE_URL:
        return ["❌ LTX_VIDEO_BASE_URL 未配置"] * len(shots)

    # 补全每个 shot 的默认参数
    prepared_shots = []
    for shot in shots:
        s = dict(shot)
        s.setdefault("num_frames", _nearest_8n_plus_1(num_frames))
        s.setdefault("num_inference_steps", steps)
        s.setdefault("fps", 24)
        # 确保 num_frames 满足 8N+1
        s["num_frames"] = _nearest_8n_plus_1(s["num_frames"])
        prepared_shots.append(s)

    storyboard_url = f"{LTX_VIDEO_BASE_URL}/api/v1/generate/storyboard"
    logger.info("[LTXVideo] 提交 %d 个分镜到 %s", len(prepared_shots), storyboard_url)

    try:
        resp = requests.post(
            storyboard_url,
            json={"shots": prepared_shots},
            timeout=(_CONNECT_TIMEOUT, _READ_TIMEOUT),
            verify=False,
            stream=True,
        )
    except requests.exceptions.ConnectionError as e:
        err = f"❌ 无法连接 LTX-Video 服务（{LTX_VIDEO_BASE_URL}）：{e}"
        return [err] * len(shots)
    except requests.exceptions.Timeout:
        err = "❌ 推理超时（超过 20 分钟），请确认 RunPod 服务正常运行"
        return [err] * len(shots)
    except requests.exceptions.RequestException as e:
        err = f"❌ 请求异常：{e}"
        return [err] * len(shots)

    if resp.status_code == 503:
        err = "❌ LTX-Video 服务未就绪（模型仍在加载），请稍后重试"
        return [err] * len(shots)
    if resp.status_code == 422:
        try:
            detail = resp.json().get("detail", resp.text[:300])
        except Exception:
            detail = resp.text[:300]
        err = f"❌ 请求参数不合法：{detail}"
        return [err] * len(shots)
    if resp.status_code != 200:
        err = f"❌ 推理失败 (HTTP {resp.status_code}): {resp.text[:200]}"
        return [err] * len(shots)

    content_type = resp.headers.get("Content-Type", "")
    if "zip" not in content_type and "octet-stream" not in content_type:
        err = f"❌ 响应 Content-Type 异常（{content_type}），期望 application/zip"
        return [err] * len(shots)

    # ── 读取 ZIP，逐 shot 上传 R2 ───────────────────────────────────────────
    try:
        zip_bytes = resp.content
    except Exception as e:
        err = f"❌ 读取 ZIP 流失败：{e}"
        return [err] * len(shots)

    results: list[str] = ["❌ 未生成"] * len(shots)

    try:
        with zipfile.ZipFile(io.BytesIO(zip_bytes)) as zf:
            for i in range(len(shots)):
                # RunPod 命名规则：shot_001.mp4, shot_002.mp4, ...
                mp4_name = f"shot_{i + 1:03d}.mp4"
                if mp4_name not in zf.namelist():
                    logger.warning("[LTXVideo] ZIP 中缺少 %s", mp4_name)
                    results[i] = f"❌ 分镜 {i + 1} 未生成（ZIP 中无 {mp4_name}）"
                    continue

                mp4_bytes = zf.read(mp4_name)
                if not mp4_bytes:
                    results[i] = f"❌ 分镜 {i + 1} 空视频"
                    continue

                logger.info("[LTXVideo] 分镜 %d 大小 %.1f KB，上传 R2...", i + 1, len(mp4_bytes) / 1024)
                record_id = f"videos/{uuid.uuid4().hex}"
                try:
                    video_url = r2.upload_bytes(
                        data=mp4_bytes,
                        record_id=record_id,
                        ext="mp4",
                        content_type="video/mp4",
                    )
                    results[i] = video_url
                    logger.info("[LTXVideo] 分镜 %d 上传成功: %s", i + 1, video_url)
                except Exception as e:
                    results[i] = f"❌ 分镜 {i + 1} 上传 R2 失败：{e}"
    except zipfile.BadZipFile as e:
        err = f"❌ 返回的 ZIP 文件损坏：{e}"
        return [err] * len(shots)

    return results


def generate_video_ltx(
    prompt: str,
    image_url: Optional[str] = None,
    ratio: str = "16:9",
    num_frames: int = 65,
    steps: int = 30,
    cfg_scale: float = 3.5,
    negative_prompt: str = "worst quality, inconsistent motion, blurry, jittery, distorted",
) -> str:
    """
    单分镜生成（兼容旧接口）。内部使用 storyboard 批量接口实现。

    Returns:
        成功时返回 R2 永久 URL；失败时返回以 "❌" 开头的错误描述。
    """
    if not LTX_VIDEO_BASE_URL:
        return "❌ LTX_VIDEO_BASE_URL 未配置，请在 backend/.env 中设置 RunPod 服务地址"

    width, height = _RATIO_SIZES.get(ratio, (704, 480))
    frames = _nearest_8n_plus_1(num_frames)

    # 参考图：URL → base64
    ref_b64 = _url_to_base64(image_url) if image_url else None

    shot: dict = {
        "prompt": prompt,
        "negative_prompt": negative_prompt,
        "num_frames": frames,
        "num_inference_steps": steps,
        "height": height,
        "width": width,
        "fps": 24,
    }
    if ref_b64:
        shot["reference_image"] = ref_b64

    results = generate_storyboard_ltx([shot], num_frames=frames, steps=steps)
    return results[0] if results else "❌ 未返回结果"


def check_service_ready() -> bool:
    """
    检查 Video Backend 是否就绪（模型已加载）。
    返回 True 表示可以发送推理请求。
    """
    if not LTX_VIDEO_BASE_URL:
        return False
    try:
        resp = requests.get(
            f"{LTX_VIDEO_BASE_URL}/api/v1/health",
            timeout=(_CONNECT_TIMEOUT, 10),
            verify=False,
        )
        if resp.status_code == 200:
            return resp.json().get("model_loaded", False)
    except Exception:
        pass
    return False
