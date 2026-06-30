# backend/app/api/v1/media_proxy.py
"""
媒体生成端点代理（SadTalker / VoxCPM2）。

浏览器从内网/国内网络直连 Modal (*.modal.run) 时，常出现 TLS 连接被重置
(net::ERR_CONNECTION_CLOSED)，且带 Authorization 头的请求还会触发 CORS 预检。
统一改为经后端转发：
  - 后端到 Modal 的链路更稳定；
  - 彻底消除浏览器跨域问题；
  - SadTalker token 只保存在服务端，不再暴露到前端包里。
"""

import os
import time
import uuid
import asyncio
import logging

import httpx
from fastapi import APIRouter, UploadFile, File, Query, Form
from fastapi.responses import StreamingResponse, JSONResponse

from app.api.core.services.storage import r2

logger = logging.getLogger(__name__)


router = APIRouter(prefix="/api/v1/media", tags=["media-proxy"])

# ------------------------------------------------------------------ #
# 异步任务存储（口型视频两段式渲染耗时 1~5 分钟，必须与浏览器连接解耦）
# ------------------------------------------------------------------ #
# 之前 SadTalker / 宠物口型走的是「浏览器 → 后端 → Modal」全程同步等待：
# 一个 HTTP 连接要被占用好几分钟。只要中间任意一跳（浏览器标签、Nginx/
# Cloudflare 等网关常见 60~100s 空闲超时）断开，FastAPI 就会取消该请求协程，
# 连带把 httpx.post 取消掉——视频在 Modal 已经渲染完成，但后端还没来得及
# 接收字节并写入 R2，于是「前端没视频、R2 也没视频」。
#
# 改为：后端收到上传后立刻起一个**脱离请求连接**的后台任务，由它去同步等
# Modal（服务器到服务器链路稳定）并把结果写入 R2；浏览器只需轮询任务状态。
#
# 单进程 uvicorn 下用内存字典即可；多副本部署时应换成 Redis 等共享存储。
_TASKS: dict[str, dict] = {}
# 任务保留时长（秒），超过后惰性清理，避免内存无限增长
_TASK_TTL = 3600

# asyncio.create_task 返回的任务，事件循环只持**弱引用**：如果我们不自己抓住
# 它的强引用，GC 可能在它 await（比如等 Modal、等 R2 上传）期间把它回收掉，
# 后台协程被静默取消——表现就是「Modal 渲染成功了，但 R2 里啥也没有」。
# 这里用一个集合长期持有强引用，任务结束后再移除。
_RUNNING_TASKS: set[asyncio.Task] = set()




# ── 上游 Modal 端点（可用环境变量覆盖）──
SADTALKER_BASE = os.getenv(
    "SADTALKER_URL",
    "https://tuolin2011--sadtalker-api-factory-fastapi-app.modal.run",
)
SADTALKER_TOKEN = os.getenv(
    "SADTALKER_TOKEN",
    "0k7WGrwtbqDE3mLXYgbJPGW5c93e_PKV5N2zpzRsChk",
)
VOXCPM2_ENDPOINT = os.getenv(
    "VOXCPM2_URL",
    "https://tuolin2011--voxcpm2-api-factory-voxcpm2service-api-endpoint.modal.run",
)
VOXCPM2_TRANSCRIBE_ENDPOINT = os.getenv(
    "VOXCPM2_TRANSCRIBE_URL",
    "https://tuolin2011--voxcpm2-transcribe.modal.run",
)
VOXCPM2_CLONE_ENDPOINT = os.getenv(
    "VOXCPM2_CLONE_URL",
    "https://tuolin2011--voxcpm2-clone.modal.run",
)

# GPU 渲染较慢，给足超时：连接 30s，读取 30 分钟（与上游 Modal 函数 timeout 对齐，
# 避免长音频说话头/宠物两段式渲染未完成时本代理先超时断流）
_TIMEOUT = httpx.Timeout(connect=30.0, read=1800.0, write=1800.0, pool=30.0)



def _err(msg: str, status: int = 502) -> JSONResponse:
    logger.error("[media_proxy] %s", msg)
    return JSONResponse(status_code=status, content={"code": status, "message": msg})


def _gc_tasks() -> None:
    """惰性清理过期任务，避免内存里残留无限增长。"""
    now = time.time()
    stale = [tid for tid, t in _TASKS.items() if now - t.get("updated_at", now) > _TASK_TTL]
    for tid in stale:
        _TASKS.pop(tid, None)


# 轮询上游 /result/{call_id} 的间隔与上限。
# SadTalker(+LivePortrait 两段式) 长音频可达数分钟，给到 30 分钟上限，
# 与上游 Modal 函数 timeout=1800 对齐。
_POLL_INTERVAL = 5.0
_POLL_MAX_SECONDS = 1800


async def _render_to_r2_task(task_id: str, target_url: str, files: dict, data: dict | None = None):
    """后台任务：spawn 上游渲染 → 轮询结果 → 拿到 R2 URL → 更新任务状态。

    这段逻辑跑在**脱离浏览器请求连接**的后台 asyncio 任务里。即便前端把页面
    关掉、网关把那条上传连接断开，这里仍会跑完，因此结果不会丢。

    采用 spawn + poll 而非单条长连接：上游 GPU 渲染常需数分钟，单条 HTTP 长
    连接会被 Modal Web 前端/各级网关的空闲超时断开（表现为 "Server disconnected
    without sending a response."）。改为：POST 立刻拿到 call_id，再用秒级短请求
    轮询 /result/{call_id}，每次请求都很快返回。

    关键：视频由 Modal 容器（海外）**直接上传到 R2**，/result 完成时返回
    {"status":"done","url":...}。本地后端只透传这个 URL，不再下载视频字节、
    也不再自己传 R2——这就避开了国内主机直连 Cloudflare R2 的 TLS 重置问题。
    """
    logger.info("[media_proxy] 任务 %s 开始转发到上游: %s", task_id, target_url)
    headers = {"Authorization": f"Bearer {SADTALKER_TOKEN}"}

    # ── Step 1: 提交任务，拿到上游 call_id ──────────────────────────
    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            submit = await client.post(target_url, files=files, data=data or {}, headers=headers)
    except httpx.HTTPError as exc:
        _TASKS[task_id] = {"status": "error", "message": f"提交上游失败: {exc}", "updated_at": time.time()}
        logger.error("[media_proxy] 任务 %s 提交上游失败: %s", task_id, exc)
        return

    if submit.status_code != 200:
        _TASKS[task_id] = {
            "status": "error",
            "message": f"上游提交返回 {submit.status_code}: {submit.text[:300]}",
            "updated_at": time.time(),
        }
        logger.error("[media_proxy] 任务 %s 上游提交返回 %s", task_id, submit.status_code)
        return

    try:
        call_id = submit.json().get("call_id")
    except Exception as exc:
        _TASKS[task_id] = {"status": "error", "message": f"上游未返回 call_id: {exc}", "updated_at": time.time()}
        logger.error("[media_proxy] 任务 %s 解析 call_id 失败: %s", task_id, exc)
        return

    if not call_id:
        _TASKS[task_id] = {"status": "error", "message": "上游未返回 call_id", "updated_at": time.time()}
        logger.error("[media_proxy] 任务 %s 上游未返回 call_id", task_id)
        return

    # 结果端点：把目标 URL 的路径换成 /result/{call_id}
    # target_url 形如 https://...modal.run/pet-talk → https://...modal.run/result/{call_id}
    base = target_url.rsplit("/", 1)[0]
    result_url = f"{base}/result/{call_id}"
    logger.info("[media_proxy] 任务 %s 上游 call_id=%s，开始轮询 %s", task_id, call_id, result_url)

    # ── Step 2: 轮询结果，拿到 R2 URL ─────────────────────────────
    deadline = time.time() + _POLL_MAX_SECONDS
    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(connect=30.0, read=120.0, write=120.0, pool=30.0)) as client:
            while time.time() < deadline:
                poll = await client.get(result_url, headers=headers)
                if poll.status_code == 202:
                    # 仍在渲染，等一会再轮询
                    await asyncio.sleep(_POLL_INTERVAL)
                    continue
                if poll.status_code == 200:
                    try:
                        payload = poll.json()
                    except Exception as exc:
                        _TASKS[task_id] = {"status": "error", "message": f"上游结果解析失败: {exc}", "updated_at": time.time()}
                        logger.error("[media_proxy] 任务 %s 上游结果解析失败: %s", task_id, exc)
                        return
                    url = payload.get("url")
                    if not url:
                        _TASKS[task_id] = {"status": "error", "message": "上游完成但未返回视频 URL", "updated_at": time.time()}
                        logger.error("[media_proxy] 任务 %s 上游完成但未返回 url: %s", task_id, payload)
                        return
                    _TASKS[task_id] = {"status": "done", "url": url, "updated_at": time.time()}
                    logger.info("[media_proxy] 任务 %s 完成，R2 URL: %s", task_id, url)
                    return
                # 其它状态码（含上游 500 渲染失败）：取出错误信息并终止
                msg = poll.text[:300]
                _TASKS[task_id] = {
                    "status": "error",
                    "message": f"上游渲染失败 {poll.status_code}: {msg}",
                    "updated_at": time.time(),
                }
                logger.error("[media_proxy] 任务 %s 上游渲染失败 %s: %s", task_id, poll.status_code, msg)
                return
    except httpx.HTTPError as exc:
        _TASKS[task_id] = {"status": "error", "message": f"轮询上游失败: {exc}", "updated_at": time.time()}
        logger.error("[media_proxy] 任务 %s 轮询上游失败: %s", task_id, exc)
        return

    _TASKS[task_id] = {"status": "error", "message": "上游渲染超时", "updated_at": time.time()}
    logger.error("[media_proxy] 任务 %s 上游渲染超时", task_id)




def _start_render_task(target_url: str, files: dict, data: dict | None = None) -> JSONResponse:
    """登记一个任务并在后台启动渲染，立刻把 task_id 返回给前端。"""
    _gc_tasks()
    task_id = uuid.uuid4().hex
    _TASKS[task_id] = {"status": "pending", "updated_at": time.time()}
    # 用 create_task 起后台协程：它的生命周期独立于当前 HTTP 请求，
    # 即使客户端连接断开也会继续跑完。
    # 关键：把 Task 强引用存进 _RUNNING_TASKS，否则事件循环只持弱引用，
    # GC 可能在 await 期间回收它，导致后台任务被静默取消、R2 永远写不进去。
    task = asyncio.create_task(_render_to_r2_task(task_id, target_url, files, data))
    _RUNNING_TASKS.add(task)
    task.add_done_callback(_RUNNING_TASKS.discard)
    return JSONResponse(content={"code": 200, "message": "ok", "data": {"task_id": task_id}})



@router.get("/sadtalker/tasks/{task_id}")
async def sadtalker_task_status(task_id: str):
    """轮询口型渲染任务状态。

    返回：
      - {status: "pending"}                  渲染中
      - {status: "done", url: "..."}         完成，url 为 R2 公网地址
      - {status: "error", message: "..."}    失败
    """
    task = _TASKS.get(task_id)
    if not task:
        return JSONResponse(
            status_code=404,
            content={"code": 404, "message": "任务不存在或已过期"},
        )
    return JSONResponse(content={"code": 200, "message": "ok", "data": task})



# ------------------------------------------------------------------ #
# SadTalker：数字人 / 宠物 对口型
# ------------------------------------------------------------------ #

@router.post("/sadtalker/talk")
async def sadtalker_talk(
    source_image: UploadFile = File(...),
    driven_audio: UploadFile = File(...),
    # preprocess: crop（只裁人脸，最快）/ full（保留肩部/半身背景，逐帧 seamlessClone 贴回，
    # 较慢但适合半身照口播）。默认 full，避免半身照被裁成只剩头部。
    preprocess: str = Form("full"),
    still: bool = Form(True),
):
    """提交数字人口型渲染任务，立刻返回 task_id；前端轮询 /sadtalker/tasks/{id} 取结果。"""
    files = {
        "source_image": (source_image.filename, await source_image.read(), source_image.content_type),
        "driven_audio": (driven_audio.filename, await driven_audio.read(), driven_audio.content_type),
    }
    data = {"preprocess": preprocess, "still": str(still).lower()}
    return _start_render_task(f"{SADTALKER_BASE}/talk", files, data)



@router.post("/sadtalker/pet-talk")
async def sadtalker_pet_talk(
    pet_image: UploadFile = File(...),
    driven_audio: UploadFile = File(...),
    driver_face: UploadFile = File(...),
):
    """提交宠物口型渲染任务（SadTalker→LivePortrait 两段式），立刻返回 task_id。"""
    files = {
        "pet_image": (pet_image.filename, await pet_image.read(), pet_image.content_type),
        "driven_audio": (driven_audio.filename, await driven_audio.read(), driven_audio.content_type),
        "driver_face": (driver_face.filename, await driver_face.read(), driver_face.content_type),
    }
    return _start_render_task(f"{SADTALKER_BASE}/pet-talk", files)




# ------------------------------------------------------------------ #
# VoxCPM2：音色设计 / 识别 / 声音克隆
# ------------------------------------------------------------------ #

@router.post("/voxcpm2/generate")
async def voxcpm2_generate(
    text: str = Query(...),
    cfg_value: float = Query(2.0),
    timesteps: int = Query(10),
):
    params = {"text": text, "cfg_value": cfg_value, "timesteps": timesteps}
    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            resp = await client.post(VOXCPM2_ENDPOINT, params=params)
        if resp.status_code != 200:
            return _err(f"VoxCPM2 返回 {resp.status_code}: {resp.text[:300]}", 502)
        return StreamingResponse(
            iter([resp.content]),
            media_type=resp.headers.get("Content-Type", "audio/wav"),
        )
    except httpx.HTTPError as exc:
        return _err(f"VoxCPM2 转发失败: {exc}")


@router.post("/voxcpm2/transcribe")
async def voxcpm2_transcribe(file: UploadFile = File(...)):
    files = {"file": (file.filename, await file.read(), file.content_type)}
    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            resp = await client.post(VOXCPM2_TRANSCRIBE_ENDPOINT, files=files)
        if resp.status_code != 200:
            return _err(f"识别服务返回 {resp.status_code}: {resp.text[:300]}", 502)
        return JSONResponse(content=resp.json())
    except httpx.HTTPError as exc:
        return _err(f"识别转发失败: {exc}")


@router.post("/voxcpm2/clone")
async def voxcpm2_clone(
    file: UploadFile = File(...),
    text: str = Query(...),
    prompt_text: str = Query(""),
    cfg_value: float = Query(2.0),
    timesteps: int = Query(10),
):
    files = {"file": (file.filename, await file.read(), file.content_type)}
    params = {
        "text": text,
        "prompt_text": prompt_text,
        "cfg_value": cfg_value,
        "timesteps": timesteps,
    }
    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            resp = await client.post(VOXCPM2_CLONE_ENDPOINT, params=params, files=files)
        if resp.status_code != 200:
            return _err(f"克隆服务返回 {resp.status_code}: {resp.text[:300]}", 502)
        return StreamingResponse(
            iter([resp.content]),
            media_type=resp.headers.get("Content-Type", "audio/wav"),
        )
    except httpx.HTTPError as exc:
        return _err(f"克隆转发失败: {exc}")
