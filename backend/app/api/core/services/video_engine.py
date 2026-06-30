# backend/app/api/core/services/video_engine.py
"""
Volcengine Ark Seedance 视频生成引擎。
支持：
  - 纯文生视频（text-to-video）
  - 图生视频（image-to-video）：传入 image_urls 时自动切换，保持产品形态一致
"""

import os
import time
import threading
import logging
import requests
from dotenv import load_dotenv

load_dotenv()
logger = logging.getLogger(__name__)

# ---- 配置 ----
# API Key 必须通过环境变量注入，严禁硬编码
SEEDANCE_API_KEY: str = os.environ.get("SEEDANCE_API_KEY", "")
if not SEEDANCE_API_KEY:
    import warnings
    warnings.warn(
        "环境变量 SEEDANCE_API_KEY 未设置，视频生成将失败。"
        "请在 backend/.env 中配置该密钥。",
        RuntimeWarning,
        stacklevel=1,
    )

SEEDANCE_BASE_URL = "https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks"
SEEDANCE_MODEL = os.environ.get("SEEDANCE_MODEL", "doubao-seedance-2-0-260128")
# 视频分辨率档位：480p / 720p / 1080p / 4k。
# 不同档位计费不同（分辨率越高越贵）。此前未显式指定，API 会回退到模型默认档（1080p，
# 即最贵档）。现统一显式声明，默认 720p 以平衡画质与成本，可通过环境变量覆盖。
SEEDANCE_RESOLUTION = os.environ.get("SEEDANCE_RESOLUTION", "720p")
# 视频时长（秒），可通过环境变量覆盖
SEEDANCE_DURATION = int(os.environ.get("SEEDANCE_DURATION", "5"))


# 轮询参数
_POLL_INTERVAL_S = 5
_MAX_POLL_ATTEMPTS = 120  # 最多等待 10 分钟


def generate_video(
    prompt: str,
    image_urls: list[str] | None = None,
    stop_event: threading.Event | None = None,
    ratio: str = "16:9",
    resolution: str | None = None,
    duration: int | None = None,
) -> str:
    """
    提交 Seedance 视频生成任务并轮询结果，返回视频 URL。

    Args:
        prompt:      视频生成提示词（英文效果更佳）
        image_urls:  产品参考图 URL 列表。
                     - 传入时：取第一张作为首帧，实现图生视频，保持产品外观一致。
                     - 不传或为空：纯文生视频。
        stop_event:  threading.Event，外部设置后轮询提前退出（客户端断开时使用）。
        ratio:       视频宽高比（1:1 / 16:9 / 9:16 / 3:4 等）。
        resolution:  分辨率档位（480p/720p/1080p/4k）。计费随档位升高而升高。
                     不传则使用环境变量 SEEDANCE_RESOLUTION（默认 720p）。
        duration:    时长（秒）。不传则使用环境变量 SEEDANCE_DURATION（默认 5）。

    Returns:
        成功时返回视频 URL 字符串；失败时返回以 "❌" 开头的错误描述。
    """

    if not SEEDANCE_API_KEY:
        return "❌ SEEDANCE_API_KEY 未配置，无法生成视频"

    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {SEEDANCE_API_KEY}",
    }

    # ---- 构建 content 数组 ----
    content: list[dict] = []

    # 如果提供了产品图，优先取第一张作为参考首帧（图生视频）
    if image_urls:
        ref_image = image_urls[0]
        content.append({"type": "image_url", "image_url": {"url": ref_image}})
        logger.info("[VideoEngine] 图生视频模式，参考图: %s", ref_image[:60])
    else:
        logger.info("[VideoEngine] 纯文生视频模式")

    content.append({"type": "text", "text": prompt})

    # 分辨率/时长：优先用调用方显式传入，否则回退到环境变量默认值
    _resolution = resolution or SEEDANCE_RESOLUTION
    _duration = duration if duration is not None else SEEDANCE_DURATION

    payload = {
        "model": SEEDANCE_MODEL,
        "content": content,
        "generate_audio": False,
        "ratio": ratio or "16:9",
        # 显式声明分辨率档位，避免回退到模型默认最贵档（1080p）
        "resolution": _resolution,
        "duration": _duration,
        "watermark": False,
    }

    # ---- Step 1：提交任务 ----
    logger.info(
        "[VideoEngine] 提交任务 ratio=%s resolution=%s duration=%ss，prompt前50字: %s",
        payload["ratio"], _resolution, _duration, prompt[:50],
    )

    try:
        submit_resp = requests.post(
            SEEDANCE_BASE_URL, headers=headers, json=payload, timeout=30
        )
    except requests.exceptions.RequestException as exc:
        return f"❌ 视频任务提交网络异常: {exc}"

    if submit_resp.status_code != 200:
        logger.error("[VideoEngine] 任务提交失败 %d: %s", submit_resp.status_code, submit_resp.text)
        return f"❌ 任务提交失败: HTTP {submit_resp.status_code}"

    task_id: str | None = submit_resp.json().get("id")
    if not task_id:
        return f"❌ 任务提交失败: 未获取到 Task ID，响应: {submit_resp.text[:200]}"

    logger.info("[VideoEngine] 任务提交成功，Task ID: %s", task_id)

    # ---- Step 2：轮询任务状态 ----
    poll_url = f"{SEEDANCE_BASE_URL}/{task_id}"
    for attempt in range(1, _MAX_POLL_ATTEMPTS + 1):
        # 客户端断开或外部取消时提前退出，不继续白跑
        if stop_event is not None and stop_event.is_set():
            logger.info("[VideoEngine] Task %s 轮询被外部取消（客户端已断开）", task_id)
            return "❌ 视频生成已取消"

        # 分段 sleep，每秒检查一次 stop_event，响应更及时
        for _ in range(_POLL_INTERVAL_S):
            if stop_event is not None and stop_event.is_set():
                break
            time.sleep(1)

        if stop_event is not None and stop_event.is_set():
            logger.info("[VideoEngine] Task %s 轮询被外部取消", task_id)
            return "❌ 视频生成已取消"

        try:
            poll_resp = requests.get(poll_url, headers=headers, timeout=15)
        except requests.exceptions.RequestException as exc:
            logger.warning("[VideoEngine] 轮询第 %d 次网络异常: %s", attempt, exc)
            continue

        if poll_resp.status_code != 200:
            logger.warning("[VideoEngine] 轮询第 %d 次失败 %d", attempt, poll_resp.status_code)
            continue

        poll_data = poll_resp.json()
        status = poll_data.get("status")
        logger.info("[VideoEngine] Task %s 状态: %s（第 %d/%d 次）", task_id, status, attempt, _MAX_POLL_ATTEMPTS)

        if status == "succeeded":
            content_result = poll_data.get("content", {})
            video_url = (
                content_result.get("video_url")
                if isinstance(content_result, dict)
                else None
            )
            if video_url:
                logger.info("[VideoEngine] 视频生成成功: %s", video_url)
                return video_url
            return "❌ 任务成功，但响应中未找到 video_url"

        if status in ("failed", "canceled"):
            error_msg = poll_data.get("error", {}).get("message", "未知错误")
            logger.error("[VideoEngine] 任务失败: %s", error_msg)
            return f"❌ 视频生成失败: {error_msg}"

    logger.error("[VideoEngine] 任务 %s 轮询超时", task_id)
    return "❌ 视频生成超时（超过5分钟）"
