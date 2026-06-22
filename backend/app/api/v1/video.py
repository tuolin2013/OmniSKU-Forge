import asyncio
import threading
from typing import List, Optional
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field
from app.api.core.services.video_engine import generate_video

router = APIRouter()


class VideoGenerationRequest(BaseModel):
    prompt: str
    type: str = "main"
    image_urls: list[str] = Field(
        default_factory=list,
        description="产品参考图 URL 列表。传入时启用图生视频模式，CLIP 自动从多张图中选最匹配的一张作为参考。",
    )


class VideoGenerationResponse(BaseModel):
    url: str
    status: str


# 单个视频最长等待 5 分钟（Seedance 实际渲染约 30-90s）
_VIDEO_TIMEOUT_S = 300

@router.post("/generate", response_model=VideoGenerationResponse)
async def create_video(body: VideoGenerationRequest, http_request: Request):
    """
    生成单段视频切片（约 5s）。
    - 提供 image_urls：图生视频，CLIP 自动选最匹配的一张作为参考帧
    - 不提供 image_urls：纯文生视频
    - 最长等待 5 分钟；客户端断开时 stop_event 通知轮询线程提前退出
    """
    stop_event = threading.Event()

    async def _watch_disconnect() -> None:
        """轮询检测客户端是否断开，断开后设置 stop_event 通知轮询线程。"""
        try:
            confirmed = 0
            while True:
                await asyncio.sleep(3)
                disconnected = await http_request.is_disconnected()
                if disconnected:
                    confirmed += 1
                    if confirmed >= 2:
                        stop_event.set()
                        return
                else:
                    confirmed = 0
        except asyncio.CancelledError:
            pass
        except Exception:
            pass

    try:
        video_task = asyncio.ensure_future(
            asyncio.wait_for(
                asyncio.to_thread(generate_video, body.prompt, body.image_urls or None, stop_event),
                timeout=_VIDEO_TIMEOUT_S,
            )
        )
        watch_task = asyncio.ensure_future(_watch_disconnect())

        try:
            video_url = await video_task
        finally:
            watch_task.cancel()

        if video_url.startswith("❌"):
            raise HTTPException(status_code=500, detail=video_url)
        return VideoGenerationResponse(url=video_url, status="success")
    except asyncio.TimeoutError:
        stop_event.set()
        raise HTTPException(status_code=504, detail="视频生成超时（超过5分钟），请稍后重试")
    except HTTPException:
        raise
    except Exception as exc:
        stop_event.set()
        raise HTTPException(status_code=500, detail=str(exc)) from exc

class VideoScriptRequest(BaseModel):
    pm_report: str
    ops_report: str
    platform: str
    ratio: str = "16:9"
    num_clips: int = 12

@router.post("/design-script")
async def design_video_script(request: VideoScriptRequest):
    try:
        from app.api.core.services.omni_brain import OmniBrain
        brain = OmniBrain(platform_name=request.platform)
        script_json_str = brain.run_designer_video_script(
            pm_report=request.pm_report,
            ops_report=request.ops_report,
            platform=request.platform,
            ratio=request.ratio,
            num_clips=request.num_clips,
        )
        return {"code": 200, "data": script_json_str}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ─────────────────────────────────────────────────────────────────────────────
# LTX-Video / Wan2.2：根据分镜 JSON 批量生成视频切片
# ─────────────────────────────────────────────────────────────────────────────

class StoryboardShot(BaseModel):
    logic: str
    scene_prompt: str
    video_type: str = "text-to-video"   # "text-to-video" | "image-to-video"

class ScriptToVideoRequest(BaseModel):
    global_style_prompt: str = ""
    ratio: str = "16:9"
    storyboard: List[StoryboardShot]
    # 产品实拍图列表（image-to-video 分镜会将所有图传给 RunPod，CLIP 自动选最匹配的）
    image_urls: List[str] = Field(default_factory=list)
    # 渲染参数
    num_frames: int = Field(default=97, description="总帧数，推荐 97（约4s@24fps）")
    steps: int = Field(default=50, description="去噪步数，正式出片推荐 50，预览推荐 20")
    fast: bool = Field(default=False, description="False=Wan2.2 正式出片，True=LTX-Video 快速预览")
    background_style: str = Field(default="gradient", description="商品背景样式：gradient/white/warm/dark")

class ShotResult(BaseModel):
    index: int
    logic: str
    video_type: str
    video_url: Optional[str] = None
    error: Optional[str] = None

class ScriptToVideoResponse(BaseModel):
    code: int
    results: List[ShotResult]
    total: int
    success_count: int
    failed_count: int

# 整批 LTX/Wan2.2 渲染最多等 60 分钟
_STORYBOARD_TIMEOUT_S = 3600


@router.post("/generate-from-script", response_model=ScriptToVideoResponse)
async def generate_from_script(body: ScriptToVideoRequest):
    """
    接受完整分镜 JSON，一次性批量提交到 RunPod 视频服务的 storyboard 接口。

    - video_type == "image-to-video"：将所有 image_urls 下载转 base64，传入 reference_images
      RunPod 服务使用 CLIP 从多张图中自动选最匹配当前分镜 prompt 的一张
    - video_type == "text-to-video"：纯文生视频，不传 reference_images
    - fast=False（默认）：Wan2.2 正式出片，高质量，每条约 60s
    - fast=True：LTX-Video 快速预览，每条约 8s

    返回每条分镜的生成结果，包含 video_url 或 error 信息。
    """
    from app.api.core.services.ltx_video_engine import (
        generate_storyboard_ltx,
        _urls_to_base64_list,
        _RATIO_SIZES,
        _nearest_4n_plus_1,
        _nearest_8n_plus_1,
    )

    # 将所有产品实拍图下载转 base64（只做一次，所有 image-to-video 分镜共用）
    ref_images_b64: List[str] = []
    if body.image_urls:
        ref_images_b64 = await asyncio.to_thread(_urls_to_base64_list, body.image_urls)
        if ref_images_b64:
            import logging
            logging.getLogger(__name__).info(
                "[video.py] 已下载 %d/%d 张参考图转 base64",
                len(ref_images_b64), len(body.image_urls)
            )

    width, height = _RATIO_SIZES.get(body.ratio, (1280, 720))

    # 帧数对齐
    if body.fast:
        num_frames = _nearest_8n_plus_1(body.num_frames)
    else:
        num_frames = _nearest_4n_plus_1(body.num_frames)

    # 组装 shots 列表
    shots = []
    for shot in body.storyboard:
        full_prompt = (
            f"{body.global_style_prompt}, {shot.scene_prompt}".strip(", ")
            if body.global_style_prompt
            else shot.scene_prompt
        )
        s: dict = {
            "prompt": full_prompt,
            "negative_prompt": "worst quality, inconsistent motion, blurry, jittery, distorted",
            "num_frames": num_frames,
            "num_inference_steps": body.steps,
            "height": height,
            "width": width,
            "fps": 24,
            "fast": body.fast,
            "background_style": body.background_style,
        }
        # image-to-video 分镜：传入所有参考图，CLIP 自动选最匹配的
        if shot.video_type == "image-to-video" and ref_images_b64:
            s["reference_images"] = ref_images_b64
        shots.append(s)

    # 单次批量调用 — 优先 RunPod，RunPod 未配置时回退到 Modal
    from app.api.core.services.ltx_video_engine import (
        LTX_VIDEO_BASE_URL,
        MODAL_VIDEO_URL,
    )
    use_modal = (not LTX_VIDEO_BASE_URL) and bool(MODAL_VIDEO_URL)

    import logging as _logging
    _log = _logging.getLogger(__name__)
    _log.info(
        "[generate_from_script] use_modal=%s, LTX_VIDEO_BASE_URL=%r, MODAL_VIDEO_URL=%r, shots=%d",
        use_modal, LTX_VIDEO_BASE_URL, MODAL_VIDEO_URL, len(shots),
    )

    # Use async endpoint when payload is large (reference images inflate JSON to tens of MB)
    # Async: POST /storyboard/async → poll /tasks/{id} → GET /tasks/{id}/download
    has_ref_images = any(s.get("reference_images") for s in shots)
    use_async = has_ref_images and not use_modal  # Modal doesn't support async yet

    _log.info(
        "[generate_from_script] has_ref_images=%s, use_async=%s",
        has_ref_images, use_async,
    )

    try:
        if use_modal:
            url_list = await asyncio.wait_for(
                asyncio.to_thread(
                    _generate_storyboard_modal, shots, num_frames, body.steps
                ),
                timeout=_STORYBOARD_TIMEOUT_S,
            )
        elif use_async:
            from app.api.core.services.ltx_video_engine import generate_storyboard_ltx_async
            url_list = await asyncio.wait_for(
                asyncio.to_thread(generate_storyboard_ltx_async, shots, num_frames, body.steps),
                timeout=_STORYBOARD_TIMEOUT_S,
            )
        else:
            url_list = await asyncio.wait_for(
                asyncio.to_thread(generate_storyboard_ltx, shots, num_frames, body.steps),
                timeout=_STORYBOARD_TIMEOUT_S,
            )
    except asyncio.TimeoutError:
        err = f"❌ 整批渲染超时（超过 {_STORYBOARD_TIMEOUT_S // 60} 分钟）"
        url_list = [err] * len(shots)
    except Exception as exc:
        err = f"❌ 批量生成异常: {exc}"
        url_list = [err] * len(shots)

    # Log first result so we can see what RunPod actually returned
    if url_list:
        _log.info("[generate_from_script] first result: %s", url_list[0][:200])

    results: List[ShotResult] = []
    for i, (shot, url) in enumerate(zip(body.storyboard, url_list)):
        if url.startswith("❌"):
            results.append(ShotResult(index=i, logic=shot.logic, video_type=shot.video_type, error=url))
        else:
            results.append(ShotResult(index=i, logic=shot.logic, video_type=shot.video_type, video_url=url))

    success_count = sum(1 for r in results if r.video_url)
    failed_count = len(results) - success_count

    return ScriptToVideoResponse(
        code=200,
        results=results,
        total=len(results),
        success_count=success_count,
        failed_count=failed_count,
    )


# ─────────────────────────────────────────────────────────────────────────────
# Modal 视频服务调用（当 RunPod 未配置时使用）
# ─────────────────────────────────────────────────────────────────────────────

def _generate_storyboard_modal(
    shots: List[dict],
    num_frames: int,
    steps: int,
) -> List[str]:
    """
    将分镜列表提交给 Modal 视频服务（MODAL_VIDEO_URL/generate/storyboard），
    解析返回的 ZIP，逐帧上传 R2，返回 URL 列表。
    """
    import io
    import uuid
    import zipfile
    import logging
    import requests
    from app.api.core.services.ltx_video_engine import MODAL_VIDEO_URL
    from app.api.core.services.storage import r2

    _log = logging.getLogger(__name__)

    if not MODAL_VIDEO_URL:
        return ["❌ MODAL_VIDEO_URL 未配置"] * len(shots)

    storyboard_url = f"{MODAL_VIDEO_URL}/generate/storyboard"
    _log.info("[video.py Modal] POST %s (%d shots)", storyboard_url, len(shots))

    try:
        resp = requests.post(
            storyboard_url,
            json={"shots": shots},
            timeout=(15, 3600),
        )
        resp.raise_for_status()
    except requests.exceptions.ConnectionError as e:
        err = f"❌ 无法连接 Modal 视频服务（{MODAL_VIDEO_URL}）：{e}"
        return [err] * len(shots)
    except requests.exceptions.Timeout:
        return ["❌ Modal 视频服务推理超时"] * len(shots)
    except Exception as e:
        return [f"❌ Modal 请求异常：{e}"] * len(shots)

    content_type = resp.headers.get("Content-Type", "")
    if "zip" not in content_type and "octet-stream" not in content_type:
        return [f"❌ Modal 响应 Content-Type 异常（{content_type}）"] * len(shots)

    results: List[str] = ["❌ 未生成"] * len(shots)
    try:
        with zipfile.ZipFile(io.BytesIO(resp.content)) as zf:
            for i in range(len(shots)):
                mp4_name = f"shot_{i + 1:03d}.mp4"
                if mp4_name not in zf.namelist():
                    results[i] = f"❌ 分镜 {i + 1} 未生成"
                    continue
                mp4_bytes = zf.read(mp4_name)
                if not mp4_bytes:
                    results[i] = f"❌ 分镜 {i + 1} 空视频"
                    continue
                record_id = f"videos/{uuid.uuid4().hex}"
                try:
                    url = r2.upload_bytes(
                        data=mp4_bytes, record_id=record_id,
                        ext="mp4", content_type="video/mp4",
                    )
                    results[i] = url
                    _log.info("[video.py Modal] 分镜 %d 上传 R2 成功: %s", i + 1, url)
                except Exception as e:
                    results[i] = f"❌ 分镜 {i + 1} 上传 R2 失败：{e}"
    except zipfile.BadZipFile as e:
        return [f"❌ Modal 返回的 ZIP 文件损坏：{e}"] * len(shots)

    return results


# ─────────────────────────────────────────────────────────────────────────────
# LTX-Video 健康检查
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/ltx-health")
async def ltx_health():
    """检查 RunPod LTX/Wan2.2 / Modal 视频服务是否就绪。"""
    from app.api.core.services.ltx_video_engine import (
        LTX_VIDEO_BASE_URL, MODAL_VIDEO_URL, check_service_ready,
    )

    # RunPod 在线时优先用它
    if LTX_VIDEO_BASE_URL:
        ready = await asyncio.to_thread(check_service_ready)
        return {"ready": ready, "backend": "runpod"}

    # 回退到 Modal：调用 /health 确认
    if MODAL_VIDEO_URL:
        try:
            import requests
            resp = requests.get(f"{MODAL_VIDEO_URL}/health", timeout=10)
            if resp.status_code == 200:
                return {"ready": True, "backend": "modal"}
        except Exception:
            pass
        return {"ready": False, "backend": "modal"}

    return {"ready": False, "backend": "none"}
