# backend/app/api/v1/agents.py
"""
AI 智能体路由层。
负责接收请求、调用 OmniBrain 大脑服务、返回结果。
不包含任何业务逻辑，业务逻辑在 services/ 层实现。
"""

import asyncio
import logging
import traceback
import uuid

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from app.api.core.services.agent_pipeline import get_brain, ImageRenderEngine, PipelineEngine
from app.api.core.services.knowledge_base import product_db
from app.api.core.services.storage import r2
from app.api.core.utils.pinyin import get_pinyin_initials

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/agents", tags=["agents"])


# ------------------------------------------------------------------ #
# 请求体 Schema
# ------------------------------------------------------------------ #

class PmAnalyzeRequest(BaseModel):
    platform: str
    sku_name: str = Field(..., description="产品名称，用于查询知识库")
    text_desc: str = Field(..., description="老板战术意图")
    image_urls: list[str] = Field(default_factory=list)
    model: str = Field("gpt-5.5", description="文本生成模型 ID")


class OpsRequest(BaseModel):
    platform: str
    sku_name: str
    pm_report: str
    model: str = "gpt-5.5"


class DesignRequest(BaseModel):
    platform: str
    pm_report: str
    ops_report: str
    count: int = 10
    image_urls: list[str] = Field(default_factory=list)


class ImageGenRequest(BaseModel):
    prompt: str
    image_urls: list[str] = Field(default_factory=list)
    model: str = "nano-banana-pro"
    previous_image_url: str = ""
    platform: str = "unknown"
    product_name: str = "product"
    image_type: str = "main"


class OneClickRequest(BaseModel):
    platform: str
    sku_name: str
    text_desc: str
    image_urls: list[str] = Field(default_factory=list)


# ------------------------------------------------------------------ #
# 工具函数
# ------------------------------------------------------------------ #

def _get_sku_or_404(sku_name: str):
    """查知识库，找不到抛 404。"""
    info = product_db.get_sku_info(sku_name)
    if not info:
        raise HTTPException(
            status_code=404,
            detail=f"知识库中未找到产品「{sku_name}」，请检查数据表。",
        )
    return info


def _stream_headers() -> dict:
    return {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
        "X-Accel-Buffering": "no",
    }


# ------------------------------------------------------------------ #
# 策划案流式生成
# ------------------------------------------------------------------ #

@router.post("/pm-analyze")
async def pm_analyze_stream(req: PmAnalyzeRequest):
    """
    流式输出策划案。
    流程：市场调研（线程池）→ 文案策划（真流式 LLM token）→ 合规审查（后台轻量）
    """
    agents = get_brain(req.platform)
    sku_info = _get_sku_or_404(req.sku_name)

    async def _generate():
        yield "【系统提示】🔍 [市场调研智能体] 正在检索并分析全网竞品趋势...\n\n"

        loop = asyncio.get_event_loop()
        research_report = await loop.run_in_executor(
            None,
            lambda: agents.run_research_agent(sku_info=sku_info, platform=req.platform),
        )

        yield "【系统提示】✅ [市场调研] 分析完毕，[文案策划智能体] 正在生成双轴矩阵策划案...\n\n"
        yield "================================================\n\n"

        try:
            for chunk in agents.run_pm_agent_stream(
                sku_info=sku_info,
                text_desc=req.text_desc,
                image_urls=req.image_urls,
                model=req.model,
                research_report=research_report,
            ):
                yield chunk
                await asyncio.sleep(0)
        except Exception as e:
            logger.error(f"pm_analyze_stream error: {e}")
            # 💡 修复了这里的换行符语法错误
            yield f"\n\n【系统提示】❌ 生成中断: {str(e)}\n\n"

    return StreamingResponse(_generate(), headers=_stream_headers(), media_type="text/plain")


# ------------------------------------------------------------------ #
# 标题 & SEO
# ------------------------------------------------------------------ #

@router.post("/ops-title")
async def ops_title(req: OpsRequest):
    agents = get_brain(req.platform)
    sku_info = _get_sku_or_404(req.sku_name)
    try:
        result = agents.run_ops_agent(
            sku_info=sku_info,
            pm_report=req.pm_report,
            platform=req.platform,
            model=req.model,
        )
        return {"code": 200, "data": result}
    except Exception as exc:
        logger.error("ops-title 失败: %s", exc)
        return {"code": 500, "message": str(exc), "data": None}


# ------------------------------------------------------------------ #
# 设计分镜 Brief
# ------------------------------------------------------------------ #

def _design_endpoint(brief_fn_name: str):
    """工厂函数：为各设计类接口生成通用处理函数，减少重复代码。"""
    async def _handler(req: DesignRequest):
        agents = get_brain(req.platform)
        try:
            fn = getattr(agents, brief_fn_name)
            result = fn(pm_report=req.pm_report, ops_report=req.ops_report)
            return {"code": 200, "data": result}
        except Exception as exc:
            logger.error("%s 失败: %s", brief_fn_name, exc)
            return {"code": 500, "message": str(exc), "data": None}
    return _handler


router.add_api_route(
    "/design-main-image-brief",
    _design_endpoint("run_designer_main_image"),
    methods=["POST"],
)
router.add_api_route(
    "/design-detail-image-brief",
    _design_endpoint("run_designer_detail_image"),
    methods=["POST"],
)
router.add_api_route(
    "/design-white-bg-image-brief",
    _design_endpoint("run_designer_white_bg_image"),
    methods=["POST"],
)
router.add_api_route(
    "/design-sku-image-brief",
    _design_endpoint("run_designer_sku_image"),
    methods=["POST"],
)


@router.post("/design-buyer-show")
async def design_buyer_show(req: DesignRequest):
    agents = get_brain(req.platform)
    try:
        result = agents.run_designer_buyer_show(
            count=req.count,
            pm_report=req.pm_report,
            ops_report=req.ops_report,
        )
        return {"code": 200, "data": result}
    except Exception as exc:
        logger.error("design-buyer-show 失败: %s", exc)
        return {"code": 500, "message": str(exc), "data": None}


# ------------------------------------------------------------------ #
# 图片生成 + 自动上云
# ------------------------------------------------------------------ #

@router.post("/generate-image")
async def generate_image(req: ImageGenRequest):
    """生成单张图片并上传到 R2，返回公开 URL。"""
    try:
        image_url = ImageRenderEngine.generate_main_image(
            prompt=req.prompt,
            image_urls=req.image_urls,
            model_name=req.model,
            previous_image_url=req.previous_image_url,
        )

        # 下载后上传 R2（带防机审护盾）
        try:
            import requests as _req
            from app.api.core.services.image_shield import AntiReviewShield

            resp = _req.get(image_url, timeout=20)
            if resp.status_code == 200:
                shielded = AntiReviewShield.apply_shield_to_bytes(resp.content)
                platform_str = "pdd" if req.platform.lower() == "pinduoduo" else req.platform.lower()
                img_type = (
                    "main" if req.image_type.lower() in ("主", "main", "主图")
                    else "detail" if req.image_type.lower() in ("详情", "detail", "详情页")
                    else req.image_type
                )
                record_id = (
                    f"{platform_str}_{get_pinyin_initials(req.product_name)}"
                    f"_{img_type}_{uuid.uuid4().hex[:6]}"
                )
                image_url = r2.upload_bytes(shielded, record_id, ext="jpg", content_type="image/jpeg")
        except Exception as r2_err:
            logger.warning("R2 上传失败，降级使用原始链接: %s", r2_err)

        return {"code": 200, "message": "图片生成成功", "data": {"url": image_url}}
    except Exception as exc:
        logger.error("generate-image 失败: %s", exc)
        return {"code": 500, "message": f"生图失败: {exc}", "data": None}


# ------------------------------------------------------------------ #
# 一键出图流水线
# ------------------------------------------------------------------ #

@router.post("/generate-one-click")
async def generate_one_click(req: OneClickRequest):
    """全自动流水线：策略→文案→排版→上云，返回成品海报 URL。"""
    logger.info("🎬 一键出图: platform=%s sku=%s", req.platform, req.sku_name)
    try:
        import os as _os
        local_path = await PipelineEngine.run_one_click_generation(
            platform=req.platform,
            sku_name=req.sku_name,
            boss_words=req.text_desc,
            image_urls=req.image_urls,
        )

        with open(local_path, "rb") as f:
            image_bytes = f.read()

        platform_str = "pdd" if req.platform.lower() == "pinduoduo" else req.platform.lower()
        record_id = (
            f"{platform_str}_{get_pinyin_initials(req.sku_name)}"
            f"_oneclick_{uuid.uuid4().hex[:6]}"
        )
        r2_url = r2.upload_bytes(image_bytes, record_id, ext="jpg", content_type="image/jpeg")
        logger.info("✅ 一键出图上云成功: %s", r2_url)

        if _os.path.exists(local_path):
            _os.remove(local_path)

        return {"code": 200, "message": "一键生成成功", "data": {"url": r2_url}}
    except Exception as exc:
        traceback.print_exc()
        return {"code": 500, "message": f"一键产线失败: {exc}", "data": None}