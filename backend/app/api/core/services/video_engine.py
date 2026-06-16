# backend/app/api/core/services/video_engine.py
"""
Volcengine Ark Seedance 视频生成引擎。
支持：
  - 纯文生视频（text-to-video）
  - 图生视频（image-to-video）：传入 image_urls 时自动切换，保持产品形态一致
"""

import os
import time
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

# 轮询参数
_POLL_INTERVAL_S = 5
_MAX_POLL_ATTEMPTS = 120  # 最多等待 10 分钟


def generate_video(prompt: str, image_urls: list[str] | None = None) -> str:
    """
    提交 Seedance 视频生成任务并轮询结果，返回视频 URL。

    Args:
        prompt:     视频生成提示词（英文效果更佳）
        image_urls: 产品参考图 URL 列表。
                    - 传入时：取第一张作为首帧，实现图生视频，保持产品外观一致。
                    - 不传或为空：纯文生视频。

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

    payload = {
        "model": SEEDANCE_MODEL,
        "content": content,
        "generate_audio": False,
        "ratio": "16:9",
        "duration": 5,
        "watermark": False,
    }

    # ---- Step 1：提交任务 ----
    logger.info("[VideoEngine] 提交任务，prompt前50字: %s", prompt[:50])
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
        time.sleep(_POLL_INTERVAL_S)
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
    return "❌ 视频生成超时（超过10分钟）"
