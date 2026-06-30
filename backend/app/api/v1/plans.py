# backend/app/api/v1/plans.py
"""
策划案持久化路由。
支持保存/加载/列举/删除图文策划案，按 平台+产品名+日期 组织文件。
"""

import os
import json
import uuid
import logging
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/plans", tags=["plans"])

# 计划存储目录：backend/data/plans/
PLANS_DIR = os.path.join(
    os.path.dirname(os.path.abspath(__file__)),  # v1/
    "..", "..", "..", "data", "plans"            # → backend/data/plans/
)


def _ensure_dir():
    os.makedirs(PLANS_DIR, exist_ok=True)


# ------------------------------------------------------------------ #
# Schema
# ------------------------------------------------------------------ #

class SavePlanRequest(BaseModel):
    platform: str           # taobao / pinduoduo
    sku_name: str           # 产品名称（来自 Cascader 叶节点）
    pm_report: str          # 策划案正文


class PlanMeta(BaseModel):
    id: str
    platform: str
    sku_name: str
    title: str              # 展示用：平台_产品名_生成日期
    created_at: str


class PlanDetail(PlanMeta):
    pm_report: str


# ------------------------------------------------------------------ #
# Helper
# ------------------------------------------------------------------ #

def _plan_path(plan_id: str) -> str:
    return os.path.join(PLANS_DIR, f"{plan_id}.json")


def _load_meta(plan_id: str) -> Optional[dict]:
    path = _plan_path(plan_id)
    if not os.path.exists(path):
        return None
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return None


# ------------------------------------------------------------------ #
# Endpoints
# ------------------------------------------------------------------ #

@router.post("", response_model=PlanMeta)
async def save_plan(req: SavePlanRequest):
    """保存策划案到本地 JSON 文件。"""
    _ensure_dir()
    now = datetime.now()
    plan_id = uuid.uuid4().hex[:12]
    date_str = now.strftime("%Y%m%d_%H%M%S")
    title = f"{req.platform}_{req.sku_name}_{date_str}"

    plan = {
        "id": plan_id,
        "platform": req.platform,
        "sku_name": req.sku_name,
        "title": title,
        "created_at": now.isoformat(),
        "pm_report": req.pm_report,
    }

    path = _plan_path(plan_id)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(plan, f, ensure_ascii=False, indent=2)

    logger.info("✅ 策划案已保存: %s", title)
    return PlanMeta(**{k: v for k, v in plan.items() if k != "pm_report"})


@router.get("", response_model=list[PlanMeta])
async def list_plans(
    platform: Optional[str] = Query(None, description="按平台过滤"),
    sku_name: Optional[str] = Query(None, description="按产品名过滤"),
):
    """列出所有已保存的策划案（按创建时间倒序）。"""
    _ensure_dir()
    results = []
    for fname in os.listdir(PLANS_DIR):
        if not fname.endswith(".json"):
            continue
        plan_id = fname[:-5]
        data = _load_meta(plan_id)
        if data is None:
            continue
        if platform and data.get("platform") != platform:
            continue
        if sku_name and data.get("sku_name") != sku_name:
            continue
        results.append(PlanMeta(
            id=data["id"],
            platform=data["platform"],
            sku_name=data["sku_name"],
            title=data["title"],
            created_at=data["created_at"],
        ))

    results.sort(key=lambda x: x.created_at, reverse=True)
    return results


@router.get("/{plan_id}", response_model=PlanDetail)
async def get_plan(plan_id: str):
    """按 ID 加载策划案全文。"""
    data = _load_meta(plan_id)
    if data is None:
        raise HTTPException(status_code=404, detail=f"策划案 {plan_id} 不存在")
    return PlanDetail(**data)


@router.delete("/{plan_id}")
async def delete_plan(plan_id: str):
    """删除策划案文件。"""
    path = _plan_path(plan_id)
    if not os.path.exists(path):
        raise HTTPException(status_code=404, detail=f"策划案 {plan_id} 不存在")
    os.remove(path)
    logger.info("🗑️  策划案已删除: %s", plan_id)
    return {"code": 200, "message": "删除成功"}
