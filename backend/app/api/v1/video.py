import asyncio
import json
import logging
import threading
import time
import uuid
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, BackgroundTasks, HTTPException, Request, WebSocket, WebSocketDisconnect
from pydantic import BaseModel, Field
from app.api.core.services.video_engine import generate_video


_log = logging.getLogger(__name__)

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

class VideoTaskResponse(BaseModel):
    task_id: str
    status: str
    progress: int = 0
    video_url: Optional[str] = None
    error: Optional[str] = None


@router.post("/generate/async", response_model=VideoTaskResponse)
async def create_video_async(body: VideoGenerationRequest):
    """
    异步提交视频生成任务，返回 task_id 用于轮询进度。
    """
    from app.api.core.services.ltx_video_engine import generate_video_ltx_async
    try:
        task_id_or_err = await asyncio.to_thread(
            generate_video_ltx_async, 
            body.prompt, 
            body.image_urls or None,
            fast=False
        )
        if task_id_or_err.startswith("❌"):
            raise HTTPException(status_code=500, detail=task_id_or_err)
        return VideoTaskResponse(task_id=task_id_or_err, status="pending")
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.get("/tasks/{task_id}", response_model=VideoTaskResponse)
async def get_task_status(task_id: str):
    """
    轮询视频生成任务进度。如果 status == "done"，则会包含 video_url。
    """
    from app.api.core.services.ltx_video_engine import get_ltx_task_status
    try:
        status_data = await asyncio.to_thread(get_ltx_task_status, task_id)
        return VideoTaskResponse(
            task_id=task_id,
            status=status_data.get("status", "unknown"),
            progress=status_data.get("progress", 0),
            video_url=status_data.get("video_url"),
            error=status_data.get("error")
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


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
    # 商品类目（可选，单分镜级别可覆盖全局 category）
    category: Optional[str] = Field(
        default=None,
        description="商品类目，传入后视频服务自动注入该类目专业镜头语言。"
                    "通用：beauty/fashion/food/3c/home/baby/sports/jewelry；"
                    "业务专用：pet_supplement（宠物营养保健）/moji_tea（张家界莓茶）",
    )

class ScriptToVideoRequest(BaseModel):
    global_style_prompt: str = ""
    ratio: str = "16:9"
    storyboard: List[StoryboardShot]
    # 产品实拍图列表（image-to-video 分镜会将所有图传给 RunPod，CLIP 自动选最匹配的）
    image_urls: List[str] = Field(default_factory=list)
    # 全局商品类目（可选，单个分镜未设置 category 时回退使用此值）
    category: Optional[str] = Field(
        default=None,
        description="全局商品类目，所有未单独指定 category 的分镜默认使用此值。",
    )
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
        # 商品类目：分镜级优先，未设置则回退到全局 category
        shot_category = shot.category or body.category
        if shot_category:
            s["category"] = shot_category
        # image-to-video 分镜：传入所有参考图，CLIP 自动选最匹配的
        if shot.video_type == "image-to-video" and ref_images_b64:
            s["reference_images"] = ref_images_b64
        shots.append(s)


    from app.api.core.services.ltx_video_engine import LTX_VIDEO_BASE_URL

    import logging as _logging
    _log = _logging.getLogger(__name__)

    # 有参考图时使用异步接口（payload 较大），否则使用同步接口
    has_ref_images = any(s.get("reference_images") for s in shots)
    _log.info(
        "[generate_from_script] LTX_VIDEO_BASE_URL=%r, has_ref_images=%s, shots=%d",
        LTX_VIDEO_BASE_URL, has_ref_images, len(shots),
    )

    try:
        if has_ref_images:
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
# WebSocket：实时流式视频生成（解决 HTTP 60 分钟超时问题）
# ─────────────────────────────────────────────────────────────────────────────

@router.websocket("/ws/generate-from-script")
async def ws_generate_from_script(websocket: WebSocket):
    """
    WebSocket 端点：逐条生成视频分镜，每完成一条立即推送结果。

    客户端发送单条 JSON 消息（与 ScriptToVideoRequest 相同格式），
    服务端推送以下消息：

        { "type": "init",     "total": 12 }
        { "type": "progress", "index": 0, "total": 12, "url": "https://..." }
        { "type": "error",    "index": 0, "total": 12, "error": "❌..." }
        { "type": "done",     "success": 10, "failed": 2 }
        { "type": "fatal",    "error": "..." }   ← 如果在开始前出现不可恢复错误

    这样无论渲染多少条，WebSocket 连接保持活跃，不会触发任何 HTTP 超时。
    """
    await websocket.accept()

    try:
        raw = await websocket.receive_text()
        body_dict = json.loads(raw)
        body = ScriptToVideoRequest(**body_dict)
    except Exception as exc:
        await websocket.send_text(json.dumps({"type": "fatal", "error": f"解析请求失败: {exc}"}))
        await websocket.close()
        return

    # ── 准备参考图 base64 ────────────────────────────────────────────────────
    from app.api.core.services.ltx_video_engine import (
        generate_storyboard_ltx,
        _urls_to_base64_list,
        _RATIO_SIZES,
        _nearest_4n_plus_1,
        _nearest_8n_plus_1,
        generate_storyboard_ltx_async,
    )

    ref_images_b64: List[str] = []
    if body.image_urls:
        try:
            ref_images_b64 = await asyncio.to_thread(_urls_to_base64_list, body.image_urls)
            _log.info("[ws_video] 已下载 %d 张参考图转 base64", len(ref_images_b64))
        except Exception as exc:
            _log.warning("[ws_video] 参考图下载失败: %s", exc)

    width, height = _RATIO_SIZES.get(body.ratio, (1280, 720))
    num_frames = _nearest_8n_plus_1(body.num_frames) if body.fast else _nearest_4n_plus_1(body.num_frames)
    total = len(body.storyboard)

    await websocket.send_text(json.dumps({"type": "init", "total": total}))

    # ── 逐条生成 ────────────────────────────────────────────────────────────
    success_count = 0
    failed_count = 0

    for i, shot in enumerate(body.storyboard):
        # Check if client disconnected
        try:
            # Non-blocking check — receive with very short timeout
            await asyncio.wait_for(websocket.receive_text(), timeout=0.01)
        except asyncio.TimeoutError:
            pass  # normal — no message from client
        except WebSocketDisconnect:
            _log.info("[ws_video] 客户端断开，终止生成 (shot %d/%d)", i, total)
            return
        except Exception:
            pass

        full_prompt = (
            f"{body.global_style_prompt}, {shot.scene_prompt}".strip(", ")
            if body.global_style_prompt
            else shot.scene_prompt
        )
        shot_dict: dict = {
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
        # 商品类目：分镜级优先，未设置则回退到全局 category
        shot_category = shot.category or body.category
        if shot_category:
            shot_dict["category"] = shot_category
        if shot.video_type == "image-to-video" and ref_images_b64:
            shot_dict["reference_images"] = ref_images_b64


        try:
            # Each shot has its own generous timeout (15 min for Wan2.2 high-quality)
            url_list = await asyncio.wait_for(
                asyncio.to_thread(generate_storyboard_ltx_async, [shot_dict], num_frames, body.steps),
                timeout=900,
            )
            url = url_list[0]

            if url.startswith("❌"):
                failed_count += 1
                await websocket.send_text(json.dumps({
                    "type": "error",
                    "index": i,
                    "total": total,
                    "logic": shot.logic,
                    "error": url,
                }))
            else:
                success_count += 1
                await websocket.send_text(json.dumps({
                    "type": "progress",
                    "index": i,
                    "total": total,
                    "logic": shot.logic,
                    "url": url,
                }))

        except asyncio.TimeoutError:
            failed_count += 1
            err = f"❌ 分镜 {i+1} 渲染超时（超过15分钟）"
            _log.warning("[ws_video] %s", err)
            await websocket.send_text(json.dumps({
                "type": "error", "index": i, "total": total,
                "logic": shot.logic, "error": err,
            }))
        except WebSocketDisconnect:
            _log.info("[ws_video] 客户端断开，终止生成 (shot %d/%d)", i + 1, total)
            return
        except Exception as exc:
            failed_count += 1
            err = f"❌ 分镜 {i+1} 异常: {exc}"
            _log.error("[ws_video] %s", err)
            await websocket.send_text(json.dumps({
                "type": "error", "index": i, "total": total,
                "logic": shot.logic, "error": err,
            }))

    await websocket.send_text(json.dumps({
        "type": "done",
        "success": success_count,
        "failed": failed_count,
    }))
    await websocket.close()


# ─────────────────────────────────────────────────────────────────────────────
# LTX-Video 健康检查
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/ltx-health")
async def ltx_health():
    """检查视频生成服务（LTX_VIDEO_BASE_URL）是否就绪。"""
    from app.api.core.services.ltx_video_engine import LTX_VIDEO_BASE_URL, check_service_ready

    if not LTX_VIDEO_BASE_URL:
        return {"ready": False, "backend": "none"}

    ready = await asyncio.to_thread(check_service_ready)
    return {"ready": ready, "backend": "video_service"}
