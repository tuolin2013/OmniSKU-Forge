# backend/app/api/core/services/ltx_video_engine.py
"""
LTX-Video / Wan2.2 视频生成引擎。
封装部署在 RunPod 上的视频推理服务（API v3.0.0）。

RunPod 服务接口规范（API_GUIDE.md v3.0.0）:
  GET  /api/v1/health                            → { status: "ok", model_loaded: bool }
  POST /api/v1/generate/storyboard               → 批量分镜（同步），返回 storyboard_videos.zip
  POST /api/v1/generate                          → 单分镜（同步），返回 video/mp4 二进制流
  POST /api/v1/generate/async                    → 单分镜异步提交，返回 { task_id }
  POST /api/v1/generate/storyboard/async         → 批量分镜异步提交，返回 { task_id }
  GET  /api/v1/tasks/{task_id}                   → 查询任务状态
  GET  /api/v1/tasks/{task_id}/download          → 下载结果（mp4 或 zip）

  关键字段变更（v2 → v3）：
    reference_image（单图 base64） → reference_images（数组，支持多张，CLIP 自动选最匹配）
    新增 fast（bool）：false=Wan2.2 正式出片，true=LTX-Video 快速预览
    新增 background_style：gradient/white/warm/dark

  分辨率标准（v3）：
    16:9 → 1280×720
    9:16 → 576×1024
    1:1  → 768×768
    3:4  → 576×768
    4:3  → 960×720

部署后在 backend/.env 中配置：
  LTX_VIDEO_BASE_URL=https://q9v8jl52w5pb58-8000.proxy.runpod.net
"""

import base64
import io
import os
import time
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
# Modal 部署的视频服务 URL（优先级高于 RunPod，RunPod 未配置时自动回退到 Modal）
MODAL_VIDEO_URL: str = os.environ.get("MODAL_VIDEO_URL", "").rstrip("/")

def _get_video_base_url() -> str:
    """
    返回当前可用的视频服务 base URL。
    优先级：LTX_VIDEO_BASE_URL（RunPod）> MODAL_VIDEO_URL（Modal）。
    两者均未配置则返回空字符串。
    """
    if LTX_VIDEO_BASE_URL:
        return LTX_VIDEO_BASE_URL
    if MODAL_VIDEO_URL:
        return MODAL_VIDEO_URL
    return ""

# Connect + send-body timeout: raised to 120s to handle large base64 payloads
# (12 shots × 3 reference images ≈ several MB upload over RunPod proxy)
_CONNECT_TIMEOUT = 120
# 批量分镜推理（Wan2.2 每条 ~60s），最多等 60 分钟
_READ_TIMEOUT = 3600
# 异步轮询间隔（秒）
_POLL_INTERVAL = 5
# 异步轮询最大等待（秒）
_POLL_TIMEOUT = 3600

# 宽高比 → (width, height)，所有维度必须是 32 的倍数（RunPod 服务要求）
# 参考 API_GUIDE.md v3.0.0 推荐值，服务内部会再次对齐到标准分辨率
_RATIO_SIZES: dict[str, tuple[int, int]] = {
    "16:9": (704, 480),    # 标准 16:9 入口尺寸，服务自动放大到 1280×720
    "9:16": (480, 704),    # 标准 9:16，服务自动放大到 576×1024
    "1:1":  (512, 512),    # 标准 1:1，服务自动放大到 768×768
    "3:4":  (480, 640),    # 标准 3:4，服务自动放大到 576×768
    "4:3":  (640, 480),    # 标准 4:3，服务自动放大到 960×720
}


def _nearest_8n_plus_1(n: int) -> int:
    """将 num_frames 修正为最近的 8N+1 值（向上取整）。LTX 模式使用。"""
    if (n - 1) % 8 == 0:
        return n
    remainder = (n - 1) % 8
    adjusted = n + (8 - remainder)
    logger.debug("[VideoEngine] num_frames %d → %d (8N+1)", n, adjusted)
    return adjusted


def _nearest_4n_plus_1(n: int) -> int:
    """将 num_frames 修正为最近的 4N+1 值（向上取整）。Wan2.2 模式使用。"""
    if (n - 1) % 4 == 0:
        return n
    remainder = (n - 1) % 4
    adjusted = n + (4 - remainder)
    logger.debug("[VideoEngine] num_frames %d → %d (4N+1)", n, adjusted)
    return adjusted


def _make_ssl_session() -> requests.Session:
    """
    创建一个禁用 SSL 验证且强制使用 TLSv1.2 的 requests Session，
    规避 Windows Python 与 Cloudflare TLS 握手兼容性问题（SSLEOFError）。
    """
    import ssl
    from requests.adapters import HTTPAdapter
    from urllib3.util.ssl_ import create_urllib3_context

    ctx = create_urllib3_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    # 禁用 TLS 1.3 降级到 1.2，规避部分 Windows OpenSSL TLS 握手断连问题
    ctx.options |= ssl.OP_NO_TLSv1_3 if hasattr(ssl, "OP_NO_TLSv1_3") else 0

    class _TLSAdapter(HTTPAdapter):
        def init_poolmanager(self, *args, **kwargs):
            kwargs["ssl_context"] = ctx
            super().init_poolmanager(*args, **kwargs)

    session = requests.Session()
    session.mount("https://", _TLSAdapter())
    return session


# Max dimension for reference images sent to RunPod.
# Keeps each image ≤ ~100KB after JPEG compression, so 3 images × 12 shots ≈ 3.6MB total.
_REF_IMAGE_MAX_DIM = 512
_REF_IMAGE_JPEG_QUALITY = 85


def _url_to_base64(url: str) -> Optional[str]:
    """
    从 URL 下载图片，压缩到 _REF_IMAGE_MAX_DIM 以内，转为 base64 JPEG 字符串。
    下载失败返回 None（降级为文生视频）。
    """
    for attempt in range(3):
        try:
            session = _make_ssl_session()
            resp = session.get(url, timeout=30)
            resp.raise_for_status()

            # Compress with Pillow to keep payload small
            try:
                from PIL import Image as _PILImage
                img = _PILImage.open(io.BytesIO(resp.content)).convert("RGB")
                # Downscale if larger than max dim
                w, h = img.size
                if max(w, h) > _REF_IMAGE_MAX_DIM:
                    scale = _REF_IMAGE_MAX_DIM / max(w, h)
                    img = img.resize((int(w * scale), int(h * scale)), _PILImage.LANCZOS)
                buf = io.BytesIO()
                img.save(buf, format="JPEG", quality=_REF_IMAGE_JPEG_QUALITY, optimize=True)
                compressed = buf.getvalue()
                logger.debug(
                    "[VideoEngine] 参考图压缩: %.1f KB → %.1f KB (%dx%d → %dx%d)",
                    len(resp.content) / 1024, len(compressed) / 1024,
                    w, h, img.size[0], img.size[1],
                )
                b64 = base64.b64encode(compressed).decode()
                return f"data:image/jpeg;base64,{b64}"
            except ImportError:
                # Pillow not available — fall back to raw bytes
                logger.warning("[VideoEngine] Pillow 未安装，跳过图片压缩（payload 可能较大）")
                content_type = resp.headers.get("Content-Type", "image/jpeg")
                b64 = base64.b64encode(resp.content).decode()
                return f"data:{content_type};base64,{b64}"

        except Exception as e:
            logger.warning("[VideoEngine] 参考图下载失败 (attempt %d/3)，原因: %s", attempt + 1, e)
            if attempt < 2:
                import time as _time
                _time.sleep(1)
    logger.warning("[VideoEngine] 参考图下载 3 次均失败，降级为文生视频: %s", url)
    return None


def _urls_to_base64_list(image_urls: list[str]) -> list[str]:
    """
    批量下载图片 URL 列表，转为 base64 data URI 列表。
    下载失败的跳过（不影响成功的）。
    """
    result = []
    for url in image_urls:
        b64 = _url_to_base64(url)
        if b64:
            result.append(b64)
    return result


# ─── 健康检查 ──────────────────────────────────────────────────────────────────

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


# ─── 同步批量生成（storyboard） ────────────────────────────────────────────────

def generate_storyboard_ltx(
    shots: list[dict],
    num_frames: int = 97,
    steps: int = 50,
) -> list[str]:
    """
    批量提交分镜脚本到 RunPod 视频服务，返回每个分镜的 R2 永久 URL 列表。

    Args:
        shots: 分镜列表，每项支持：
            - prompt: str
            - reference_images: list[str] | None  (base64 或 data URI 列表)
            - reference_image: str | None          (兼容旧字段，自动合并到 reference_images)
            - width: int
            - height: int
            - num_frames: int（可选，覆盖默认值）
            - num_inference_steps: int（可选）
            - fast: bool（可选，默认 False = Wan2.2 正式出片）
            - background_style: str（可选，gradient/white/warm/dark）
        num_frames: 默认帧数
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
        fast = s.get("fast", False)

        # 帧数对齐：fast=True 用 LTX(8N+1)，fast=False 用 Wan2.2(4N+1)
        frames = s.get("num_frames", num_frames)
        if fast:
            s["num_frames"] = _nearest_8n_plus_1(frames)
        else:
            s["num_frames"] = _nearest_4n_plus_1(frames)

        s.setdefault("num_inference_steps", steps)
        s.setdefault("fps", 24)

        # 兼容旧字段 reference_image → 合并到 reference_images
        old_ref = s.pop("reference_image", None)
        ref_images = s.get("reference_images") or []
        if old_ref and old_ref not in ref_images:
            ref_images = [old_ref] + list(ref_images)
        if ref_images:
            s["reference_images"] = ref_images
        elif "reference_images" in s:
            del s["reference_images"]  # 不传空列表

        prepared_shots.append(s)

    storyboard_url = f"{LTX_VIDEO_BASE_URL}/api/v1/generate/storyboard"
    logger.info("[VideoEngine] 提交 %d 个分镜到 %s", len(prepared_shots), storyboard_url)

    try:
        resp = requests.post(
            storyboard_url,
            json={"shots": prepared_shots},
            timeout=(_CONNECT_TIMEOUT, _READ_TIMEOUT),
            verify=False,
            stream=True,
        )
    except requests.exceptions.ConnectionError as e:
        err = f"❌ 无法连接视频服务（{LTX_VIDEO_BASE_URL}）：{e}"
        return [err] * len(shots)
    except requests.exceptions.Timeout:
        err = "❌ 推理超时（超过 60 分钟），请确认 RunPod 服务正常运行"
        return [err] * len(shots)
    except requests.exceptions.RequestException as e:
        err = f"❌ 请求异常：{e}"
        return [err] * len(shots)

    logger.info(
        "[VideoEngine] RunPod 响应: HTTP %d, Content-Type=%r, Content-Length=%s",
        resp.status_code,
        resp.headers.get("Content-Type", ""),
        resp.headers.get("Content-Length", "unknown"),
    )

    if resp.status_code == 503:
        err = "❌ 视频服务未就绪（模型仍在加载），请稍后重试"
        logger.error("[VideoEngine] 503: %s", err)
        return [err] * len(shots)
    if resp.status_code == 422:
        try:
            detail = resp.json().get("detail", resp.text[:300])
        except Exception:
            detail = resp.text[:300]
        err = f"❌ 请求参数不合法：{detail}"
        logger.error("[VideoEngine] 422: %s", err)
        return [err] * len(shots)
    if resp.status_code != 200:
        body_preview = resp.text[:500]
        err = f"❌ 推理失败 (HTTP {resp.status_code}): {body_preview}"
        logger.error("[VideoEngine] HTTP %d: %s", resp.status_code, body_preview)
        return [err] * len(shots)

    content_type = resp.headers.get("Content-Type", "")
    if "zip" not in content_type and "octet-stream" not in content_type:
        body_preview = resp.text[:500]
        err = f"❌ 响应 Content-Type 异常（{content_type}），期望 application/zip。响应体: {body_preview}"
        logger.error("[VideoEngine] Content-Type 异常: %s", err)
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
                    logger.warning("[VideoEngine] ZIP 中缺少 %s", mp4_name)
                    results[i] = f"❌ 分镜 {i + 1} 未生成（ZIP 中无 {mp4_name}）"
                    continue

                mp4_bytes = zf.read(mp4_name)
                if not mp4_bytes:
                    results[i] = f"❌ 分镜 {i + 1} 空视频"
                    continue

                logger.info("[VideoEngine] 分镜 %d 大小 %.1f KB，上传 R2...", i + 1, len(mp4_bytes) / 1024)
                record_id = f"videos/{uuid.uuid4().hex}"
                try:
                    video_url = r2.upload_bytes(
                        data=mp4_bytes,
                        record_id=record_id,
                        ext="mp4",
                        content_type="video/mp4",
                    )
                    results[i] = video_url
                    logger.info("[VideoEngine] 分镜 %d 上传成功: %s", i + 1, video_url)
                except Exception as e:
                    results[i] = f"❌ 分镜 {i + 1} 上传 R2 失败：{e}"
    except zipfile.BadZipFile as e:
        err = f"❌ 返回的 ZIP 文件损坏：{e}"
        return [err] * len(shots)

    return results


# ─── 异步批量生成（storyboard/async + 轮询） ──────────────────────────────────

def generate_storyboard_ltx_async(
    shots: list[dict],
    num_frames: int = 97,
    steps: int = 50,
) -> list[str]:
    """
    异步提交批量分镜 → 轮询 → 下载 ZIP → 上传 R2。
    接口流程：
      1. POST /api/v1/generate/storyboard/async → { task_id }
      2. GET  /api/v1/tasks/{task_id}           → 轮询直到 status=done
      3. GET  /api/v1/tasks/{task_id}/download  → ZIP 二进制

    Returns:
        URL 列表，长度与 shots 相同。失败分镜返回 "❌..." 字符串。
    """
    if not LTX_VIDEO_BASE_URL:
        return ["❌ LTX_VIDEO_BASE_URL 未配置"] * len(shots)

    # 准备 shots（同同步版本）
    prepared_shots = []
    for shot in shots:
        s = dict(shot)
        fast = s.get("fast", False)
        frames = s.get("num_frames", num_frames)
        s["num_frames"] = _nearest_8n_plus_1(frames) if fast else _nearest_4n_plus_1(frames)
        s.setdefault("num_inference_steps", steps)
        s.setdefault("fps", 24)
        old_ref = s.pop("reference_image", None)
        ref_images = s.get("reference_images") or []
        if old_ref and old_ref not in ref_images:
            ref_images = [old_ref] + list(ref_images)
        if ref_images:
            s["reference_images"] = ref_images
        elif "reference_images" in s:
            del s["reference_images"]
        prepared_shots.append(s)

    # Step 1: 异步提交
    submit_url = f"{LTX_VIDEO_BASE_URL}/api/v1/generate/storyboard/async"
    logger.info("[VideoEngine] 异步提交 %d 个分镜到 %s", len(prepared_shots), submit_url)
    try:
        submit_resp = requests.post(
            submit_url,
            json={"shots": prepared_shots},
            timeout=(_CONNECT_TIMEOUT, 30),
            verify=False,
        )
        submit_resp.raise_for_status()
        task_data = submit_resp.json()
        task_id = task_data.get("task_id")
        if not task_id:
            raise ValueError(f"提交成功但未返回 task_id: {task_data}")
        logger.info("[VideoEngine] 任务已提交，task_id=%s", task_id)
    except Exception as e:
        err = f"❌ 异步提交失败：{e}"
        return [err] * len(shots)

    # Step 2: 轮询状态
    status_url = f"{LTX_VIDEO_BASE_URL}/api/v1/tasks/{task_id}"
    deadline = time.time() + _POLL_TIMEOUT
    while time.time() < deadline:
        try:
            status_resp = requests.get(status_url, timeout=10, verify=False)
            status_resp.raise_for_status()
            status_data = status_resp.json()
            status = status_data.get("status", "")
            progress = status_data.get("progress", 0)
            done_count = status_data.get("done", 0)
            total_count = status_data.get("total")
            logger.info("[VideoEngine] task=%s status=%s progress=%d%% (%s/%s)",
                        task_id, status, progress, done_count, total_count)

            if status == "done":
                break
            if status == "failed":
                err = f"❌ 任务失败：{status_data.get('error', '未知错误')}"
                return [err] * len(shots)
        except Exception as e:
            logger.warning("[VideoEngine] 轮询失败，重试：%s", e)

        time.sleep(_POLL_INTERVAL)
    else:
        err = f"❌ 异步任务超时（超过 {_POLL_TIMEOUT // 60} 分钟）"
        return [err] * len(shots)

    # Step 3: 下载 ZIP
    download_url = f"{LTX_VIDEO_BASE_URL}/api/v1/tasks/{task_id}/download"
    try:
        dl_resp = requests.get(
            download_url,
            timeout=(_CONNECT_TIMEOUT, 600),
            verify=False,
            stream=True,
        )
        dl_resp.raise_for_status()
        zip_bytes = dl_resp.content
    except Exception as e:
        err = f"❌ 下载结果失败：{e}"
        return [err] * len(shots)

    # 解压 + 上传 R2（复用同步版本逻辑）
    results: list[str] = ["❌ 未生成"] * len(shots)
    try:
        with zipfile.ZipFile(io.BytesIO(zip_bytes)) as zf:
            for i in range(len(shots)):
                mp4_name = f"shot_{i + 1:03d}.mp4"
                if mp4_name not in zf.namelist():
                    results[i] = f"❌ 分镜 {i + 1} 未生成（ZIP 中无 {mp4_name}）"
                    continue
                mp4_bytes = zf.read(mp4_name)
                if not mp4_bytes:
                    results[i] = f"❌ 分镜 {i + 1} 空视频"
                    continue
                record_id = f"videos/{uuid.uuid4().hex}"
                try:
                    video_url = r2.upload_bytes(
                        data=mp4_bytes, record_id=record_id,
                        ext="mp4", content_type="video/mp4",
                    )
                    results[i] = video_url
                    logger.info("[VideoEngine] 分镜 %d 上传成功: %s", i + 1, video_url)
                except Exception as e:
                    results[i] = f"❌ 分镜 {i + 1} 上传 R2 失败：{e}"
    except zipfile.BadZipFile as e:
        return [f"❌ ZIP 文件损坏：{e}"] * len(shots)

    return results


# ─── 单分镜生成（兼容旧接口） ──────────────────────────────────────────────────

def generate_video_ltx(
    prompt: str,
    image_urls: Optional[list[str]] = None,
    ratio: str = "16:9",
    num_frames: int = 97,
    steps: int = 50,
    cfg_scale: float = 3.5,
    negative_prompt: str = "worst quality, inconsistent motion, blurry, jittery, distorted",
    fast: bool = False,
    background_style: str = "gradient",
) -> str:
    """
    单分镜生成（兼容旧接口）。内部使用 storyboard 批量接口实现。

    Args:
        image_urls: 产品参考图 URL 列表（支持多张，CLIP 自动选最匹配的）
        fast: False=Wan2.2 正式出片，True=LTX-Video 快速预览

    Returns:
        成功时返回 R2 永久 URL；失败时返回以 "❌" 开头的错误描述。
    """
    if not LTX_VIDEO_BASE_URL:
        return "❌ LTX_VIDEO_BASE_URL 未配置，请在 backend/.env 中设置 RunPod 服务地址"

    width, height = _RATIO_SIZES.get(ratio, (1280, 720))
    frames = _nearest_8n_plus_1(num_frames) if fast else _nearest_4n_plus_1(num_frames)

    # 参考图：URL 列表 → base64 列表
    ref_images_b64: list[str] = []
    if image_urls:
        ref_images_b64 = _urls_to_base64_list(image_urls)

    shot: dict = {
        "prompt": prompt,
        "negative_prompt": negative_prompt,
        "num_frames": frames,
        "num_inference_steps": steps,
        "height": height,
        "width": width,
        "fps": 24,
        "fast": fast,
        "background_style": background_style,
    }
    if ref_images_b64:
        shot["reference_images"] = ref_images_b64

    results = generate_storyboard_ltx([shot], num_frames=frames, steps=steps)
    return results[0] if results else "❌ 未返回结果"
