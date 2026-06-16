# backend/app/main.py
"""
OmniSKU-Forge 后端入口。
只负责：应用创建、中间件、路由注册、生命周期管理。
业务逻辑全部委托给对应的路由模块。
"""

import os
import logging
from contextlib import asynccontextmanager

import uvicorn
from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from io import BytesIO

from app.api.core.services.knowledge_base import product_db
from app.api.routers import catalog
from app.api.v1 import video, agents, r2

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
logger = logging.getLogger(__name__)


# ------------------------------------------------------------------ #
# 生命周期
# ------------------------------------------------------------------ #

@asynccontextmanager
async def lifespan(_app: FastAPI):
    current_dir = os.path.dirname(os.path.abspath(__file__))
    data_dir = os.path.join(os.path.dirname(current_dir), "data")
    os.makedirs(data_dir, exist_ok=True)
    product_db.init_from_directory(data_dir)
    logger.info("✅ 知识库加载完毕，数据目录: %s", data_dir)
    yield
    logger.info("🛑 服务关闭")


# ------------------------------------------------------------------ #
# 应用实例
# ------------------------------------------------------------------ #

app = FastAPI(
    title="OmniSKU-Forge API",
    description="多平台电商内容生成引擎",
    version="6.2.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ------------------------------------------------------------------ #
# 路由注册
# ------------------------------------------------------------------ #

app.include_router(catalog.router, prefix="/api/catalog", tags=["catalog"])
app.include_router(video.router, prefix="/api/v1/video", tags=["video"])
app.include_router(agents.router)   # 前缀已在模块内定义
app.include_router(r2.router)       # 前缀已在模块内定义


# ------------------------------------------------------------------ #
# 通用工具接口
# ------------------------------------------------------------------ #

@app.get("/health", tags=["system"])
async def health_check():
    return {"status": "ok", "version": app.version}


@app.get("/api/v1/proxy/download", tags=["system"])
def proxy_download(url: str = Query(..., description="需要代理下载的图片 URL")):
    """跨域图片代理，供前端下载 R2 上的图片文件。"""
    import requests
    try:
        resp = requests.get(url, timeout=20)
        resp.raise_for_status()
        return StreamingResponse(
            BytesIO(resp.content),
            media_type=resp.headers.get("Content-Type", "image/jpeg"),
        )
    except Exception as exc:
        from fastapi.responses import JSONResponse
        return JSONResponse(
            status_code=500,
            content={"code": 500, "message": f"代理下载失败: {exc}"},
        )


# ------------------------------------------------------------------ #
# 开发模式启动
# ------------------------------------------------------------------ #

if __name__ == "__main__":
    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)
