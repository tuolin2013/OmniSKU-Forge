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
        description="产品参考图 URL 列表。传入时启用图生视频模式，取第一张作为首帧参考，保持产品外观一致。",
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
    - 提供 image_urls：图生视频，首帧锁定产品外观
    - 不提供 image_urls：纯文生视频
    - 最长等待 5 分钟；客户端断开时 stop_event 通知轮询线程提前退出
    """
    stop_event = threading.Event()

    async def _watch_disconnect() -> None:
        """轮询检测客户端是否断开，断开后设置 stop_event 通知轮询线程。
        
        注意：is_disconnected() 在 HTTP/1.1 非流式请求上可能立即返回 True（请求体已读完），
        所以改为每 3 秒轮询一次，连续 2 次确认断开才触发取消，避免误判。
        """
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
        # generate_video 放到线程池；同时启动断开监听协程
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
# LTX-Video：根据分镜 JSON 逐条生成视频切片
# ─────────────────────────────────────────────────────────────────────────────

class StoryboardShot(BaseModel):
    logic: str
    scene_prompt: str
    video_type: str = "text-to-video"   # "text-to-video" | "image-to-video"

class ScriptToVideoRequest(BaseModel):
    global_style_prompt: str = ""
    ratio: str = "16:9"
    storyboard: List[StoryboardShot]
    # 产品实拍图列表（image-to-video 分镜用第一张作为参考帧）
    image_urls: List[str] = Field(default_factory=list)
    # LTX 渲染参数（可覆盖默认值）
    num_frames: int = 49
    steps: int = 30
    cfg_scale: float = 3.5

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

# 单切片 LTX 渲染最多等 10 分钟
_LTX_SHOT_TIMEOUT_S = 600

@router.post("/generate-from-script", response_model=ScriptToVideoResponse)
async def generate_from_script(body: ScriptToVideoRequest):
    """
    接受完整分镜 JSON，一次性批量提交到 RunPod LTX-Video storyboard 接口。

    - video_type == "image-to-video"：将 image_urls[0] 转 base64 作为参考帧
    - video_type == "text-to-video"：纯文生视频

    返回每条分镜的生成结果，包含 video_url 或 error 信息。
    """
    from app.api.core.services.ltx_video_engine import (
        generate_storyboard_ltx,
        _url_to_base64,
        _RATIO_SIZES,
        _nearest_8n_plus_1,
    )

    # 取第一张实拍图作为 image-to-video 参考帧（下载 + 转 base64，只做一次）
    ref_image_url: Optional[str] = body.image_urls[0] if body.image_urls else None
    ref_b64: Optional[str] = None
    if ref_image_url:
        ref_b64 = await asyncio.to_thread(_url_to_base64, ref_image_url)

    width, height = _RATIO_SIZES.get(body.ratio, (704, 480))
    num_frames = _nearest_8n_plus_1(body.num_frames)

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
            "num_frames": num_frames,
            "num_inference_steps": body.steps,
            "height": height,
            "width": width,
            "fps": 24,
        }
        if shot.video_type == "image-to-video" and ref_b64:
            s["reference_image"] = ref_b64
        shots.append(s)

    # 单次批量调用，最长等整个 storyboard 完成（20 min）
    _STORYBOARD_TIMEOUT_S = 1200
    try:
        url_list: List[str] = await asyncio.wait_for(
            asyncio.to_thread(generate_storyboard_ltx, shots, num_frames, body.steps),
            timeout=_STORYBOARD_TIMEOUT_S,
        )
    except asyncio.TimeoutError:
        err = f"❌ 整批渲染超时（超过 {_STORYBOARD_TIMEOUT_S // 60} 分钟）"
        url_list = [err] * len(shots)
    except Exception as exc:
        err = f"❌ 批量生成异常: {exc}"
        url_list = [err] * len(shots)

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
# LTX-Video RunPod 健康检查代理（供前端轮询）
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/ltx-health")
async def ltx_health():
    """
    代理查询 RunPod LTX-Video 服务是否就绪。
    返回 { ready: bool, detail: str }
    """
    from app.api.core.services.ltx_video_engine import LTX_VIDEO_BASE_URL, check_service_ready
    if not LTX_VIDEO_BASE_URL:
        return {"ready": False, "detail": "LTX_VIDEO_BASE_URL 未配置"}
    ready = await asyncio.to_thread(check_service_ready)
    if ready:
        return {"ready": True, "detail": "RunPod LTX-Video 服务就绪"}
    else:
        return {"ready": False, "detail": "模型尚未加载完毕，请稍候再试"}
