from fastapi import APIRouter, HTTPException
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


@router.post("/generate", response_model=VideoGenerationResponse)
async def create_video(request: VideoGenerationRequest):
    """
    生成单段视频切片（约 5s）。
    - 提供 image_urls：图生视频，首帧锁定产品外观
    - 不提供 image_urls：纯文生视频
    """
    try:
        video_url = generate_video(request.prompt, image_urls=request.image_urls or None)
        if video_url.startswith("❌"):
            raise HTTPException(status_code=500, detail=video_url)
        return VideoGenerationResponse(url=video_url, status="success")
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

class VideoScriptRequest(BaseModel):
    pm_report: str
    ops_report: str
    platform: str

@router.post("/design-script")
async def design_video_script(request: VideoScriptRequest):
    try:
        from app.api.core.services.omni_brain import OmniBrain
        brain = OmniBrain(platform_name=request.platform)
        script_json_str = brain.run_designer_video_script(
            pm_report=request.pm_report,
            ops_report=request.ops_report,
            platform=request.platform
        )
        return {"code": 200, "data": script_json_str}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
