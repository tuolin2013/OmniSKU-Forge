# backend/app/api/v1/r2.py
"""
Cloudflare R2 图片管理路由。
操作逻辑委托给 storage.R2StorageService，路由层只做参数校验和响应组装。
"""

import uuid
import logging

from fastapi import APIRouter, File, Query, UploadFile
from pydantic import BaseModel

from app.api.core.services.storage import r2, R2Config

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1/r2", tags=["r2"])


# ------------------------------------------------------------------ #
# Schema
# ------------------------------------------------------------------ #

class FileKeyRequest(BaseModel):
    file_key: str
    new_name: str = ""


class BatchDeleteRequest(BaseModel):
    file_keys: list[str]


# ------------------------------------------------------------------ #
# 路由
# ------------------------------------------------------------------ #

@router.get("/images")
async def list_images(
    page: int = Query(1, ge=1),
    limit: int = Query(30, ge=1, le=100),
):
    media, has_more = r2.list_images(page=page, limit=limit)
    urls = [m["url"] for m in media]
    return {"code": 200, "data": {"urls": urls, "media": media, "has_more": has_more}}


@router.post("/upload")
async def upload_image(file: UploadFile = File(...)):
    logger.info("📥 收到上传请求: %s", file.filename)
    try:
        contents = await file.read()
        ext = file.filename.rsplit(".", 1)[-1] if "." in file.filename else "png"
        url = r2.upload_bytes(
            contents,
            record_id=uuid.uuid4().hex,
            ext=ext,
            content_type=file.content_type or "image/png",
        )
        return {"code": 200, "message": "上传成功", "data": {"url": url}}
    except Exception as exc:
        logger.error("上传失败: %s", exc)
        return {"code": 500, "message": f"上传失败: {exc}", "data": None}


@router.post("/delete")
async def delete_image(req: FileKeyRequest):
    success = r2.delete(req.file_key)
    if success:
        return {"code": 200, "message": "删除成功"}
    return {"code": 500, "message": "删除失败"}


@router.post("/batch-delete")
async def batch_delete(req: BatchDeleteRequest):
    ok, total = r2.batch_delete(req.file_keys)
    if ok == total:
        return {"code": 200, "message": f"成功删除 {ok} 个文件"}
    if ok > 0:
        return {"code": 206, "message": f"部分删除成功: {ok}/{total}"}
    return {"code": 500, "message": "批量删除失败"}


@router.post("/rename")
async def rename_image(req: FileKeyRequest):
    if not req.new_name:
        return {"code": 400, "message": "新名称不能为空"}

    ext = req.file_key.rsplit(".", 1)[-1] if "." in req.file_key else "jpg"
    new_key = (
        req.new_name
        if req.new_name.startswith("uploads/")
        else f"uploads/{req.new_name}.{ext}"
    )

    success = r2.rename(req.file_key, new_key)
    if success:
        return {
            "code": 200,
            "message": "重命名成功",
            "data": {"new_url": R2Config.public_url(new_key), "new_key": new_key},
        }
    return {"code": 500, "message": "重命名失败"}
