"""
OmniSKU-Forge Video Generation Service — deployed on Modal.

基于 Wan2.2 (通义万象) 和 LTX-Video 的视频生成服务。
部署命令：
    modal deploy modal_video_service.py

URL 规范（与 RunPod 服务 API v3.0.0 保持一致）：
    GET  /api/v1/health                          → { status, model_loaded }
    POST /api/v1/generate                        → video/mp4 字节流
    POST /api/v1/generate/storyboard             → application/zip
    POST /api/v1/generate/storyboard/async       → { task_id }
    GET  /api/v1/tasks/{task_id}                 → { task_id, status, progress, done, total }
    GET  /api/v1/tasks/{task_id}/download        → application/zip 或 video/mp4

配置（backend/.env）：
    MODAL_VIDEO_URL=https://<workspace>--omni-video-video-api.modal.run
"""

import asyncio
import io
import os
import uuid
import zipfile
import base64
from typing import Optional

import modal

# ─────────────────────────────────────────────────────────────────────────────
# Modal 镜像
# ─────────────────────────────────────────────────────────────────────────────

video_image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install(
        "ffmpeg", "libgl1", "libglib2.0-0",
        "libsm6", "libxext6", "libxrender-dev",
    )
    .pip_install(
        # Core ML
        "torch==2.4.0",
        "torchvision==0.19.0",
        "accelerate==0.34.0",
        "transformers==4.44.0",
        "diffusers==0.30.3",
        "sentencepiece==0.2.0",
        "safetensors==0.4.4",
        # Video output
        "imageio==2.35.1",
        "imageio-ffmpeg==0.5.1",
        "opencv-python-headless==4.10.0.84",
        "numpy==1.26.4",
        "Pillow==10.4.0",
        # API
        "fastapi[standard]==0.115.4",
    )
)

app = modal.App("omni-video", image=video_image)

# Model cache volume — shared across all containers
model_volume = modal.Volume.from_name("omni-video-model-cache", create_if_missing=True)
MODEL_DIR = "/model_cache"

# In-memory task store (per-container; tasks live as long as the container is warm)
# For production, replace with a Modal Dict for cross-container visibility.
_tasks: dict = {}

# ─────────────────────────────────────────────────────────────────────────────
# 工具函数
# ─────────────────────────────────────────────────────────────────────────────

def _nearest_8n_plus_1(n: int) -> int:
    if (n - 1) % 8 == 0:
        return n
    return n + (8 - (n - 1) % 8)


def _nearest_4n_plus_1(n: int) -> int:
    if (n - 1) % 4 == 0:
        return n
    return n + (4 - (n - 1) % 4)


# ─────────────────────────────────────────────────────────────────────────────
# 视频推理 Class
# ─────────────────────────────────────────────────────────────────────────────

@app.cls(
    gpu="A10G",
    volumes={MODEL_DIR: model_volume},
    max_containers=2,
    scaledown_window=600,
    timeout=3600,
)
class VideoGenerator:
    """Wan2.2 / LTX-Video 推理服务。每个 Modal 容器独立加载模型。"""

    model_loaded: bool = False

    @modal.enter()
    def load_models(self):
        import torch
        os.makedirs(MODEL_DIR, exist_ok=True)
        os.environ["HF_HOME"] = MODEL_DIR

        from diffusers import (
            WanPipeline,
            WanImageToVideoPipeline,
            LTXVideoPipeline,
            LTXImageToVideoPipeline,
        )

        self.dtype = torch.bfloat16
        self.device = "cuda"

        # Wan2.2 T2V
        print("[VideoGenerator] Loading Wan2.2 T2V...")
        self.wan_t2v = WanPipeline.from_pretrained(
            "Wan-AI/Wan2.2-T2V-14B",
            torch_dtype=self.dtype,
            cache_dir=MODEL_DIR,
        ).to(self.device)

        # Wan2.2 I2V
        print("[VideoGenerator] Loading Wan2.2 I2V...")
        self.wan_i2v = WanImageToVideoPipeline.from_pretrained(
            "Wan-AI/Wan2.2-I2V-14B",
            torch_dtype=self.dtype,
            cache_dir=MODEL_DIR,
        ).to(self.device)

        # LTX-Video T2V（快速预览）
        print("[VideoGenerator] Loading LTX-Video T2V...")
        self.ltx_t2v = LTXVideoPipeline.from_pretrained(
            "Lightricks/LTX-Video",
            torch_dtype=self.dtype,
            cache_dir=MODEL_DIR,
        ).to(self.device)

        # LTX-Video I2V（快速预览）
        print("[VideoGenerator] Loading LTX-Video I2V...")
        self.ltx_i2v = LTXImageToVideoPipeline.from_pretrained(
            "Lightricks/LTX-Video",
            torch_dtype=self.dtype,
            cache_dir=MODEL_DIR,
        ).to(self.device)

        self.model_loaded = True
        print("[VideoGenerator] ✅ All models loaded.")

    # ── 帧 → MP4 ──────────────────────────────────────────────────────────────

    def _frames_to_mp4(self, frames, fps: int = 24) -> bytes:
        import numpy as np
        import imageio
        from PIL import Image
        import torch

        result_frames = []
        if isinstance(frames, torch.Tensor):
            arr = frames.detach().cpu().float().numpy()
            if arr.ndim == 5:
                arr = arr[0]
            arr = (arr * 255).clip(0, 255).astype(np.uint8) if arr.max() <= 1.0 else arr.astype(np.uint8)
            result_frames = [arr[i] for i in range(arr.shape[0])]
        elif isinstance(frames, np.ndarray):
            arr = frames
            if arr.ndim == 5:
                arr = arr[0]
            arr = (arr * 255).clip(0, 255).astype(np.uint8) if arr.max() <= 1.0 else arr.astype(np.uint8)
            result_frames = [arr[i] for i in range(arr.shape[0])]
        else:
            for frame in frames:
                if isinstance(frame, Image.Image):
                    result_frames.append(np.array(frame.convert("RGB")))
                elif isinstance(frame, torch.Tensor):
                    f = frame.detach().cpu().float().numpy()
                    result_frames.append(((f * 255).clip(0, 255) if f.max() <= 1.0 else f).astype(np.uint8))
                elif isinstance(frame, np.ndarray):
                    result_frames.append((frame * 255).clip(0, 255).astype(np.uint8) if frame.max() <= 1.0 else frame.astype(np.uint8))

        if not result_frames:
            raise RuntimeError("推理完成但 frames 为空")

        buf = io.BytesIO()
        writer = imageio.get_writer(
            buf, format="mp4", fps=fps, codec="libx264",
            output_params=["-crf", "23", "-pix_fmt", "yuv420p"],
        )
        for frame in result_frames:
            writer.append_data(frame)
        writer.close()
        buf.seek(0)
        return buf.read()

    def _decode_ref_image(self, data_uri: str):
        from PIL import Image
        if "," in data_uri:
            data_uri = data_uri.split(",", 1)[1]
        return Image.open(io.BytesIO(base64.b64decode(data_uri))).convert("RGB")

    # ── 单分镜生成（供 storyboard 逐条调用）───────────────────────────────────

    @modal.method()
    def generate_shot(
        self,
        prompt: str,
        width: int = 704,
        height: int = 480,
        num_frames: int = 97,
        num_inference_steps: int = 50,
        fps: int = 24,
        fast: bool = False,
        negative_prompt: str = "worst quality, inconsistent motion, blurry, jittery, distorted",
        reference_images: Optional[list] = None,
    ) -> bytes:
        import torch

        # Frame count alignment
        frames = _nearest_8n_plus_1(num_frames) if fast else _nearest_4n_plus_1(num_frames)

        # Decode first reference image if provided
        ref_image = None
        if reference_images:
            try:
                ref_image = self._decode_ref_image(reference_images[0])
                ref_image = ref_image.resize((width, height))
            except Exception as e:
                print(f"[VideoGenerator] ref image decode failed: {e}, using T2V")

        print(f"[VideoGenerator] fast={fast}, frames={frames}, steps={num_inference_steps}, "
              f"{width}x{height}, has_ref={ref_image is not None}")

        with torch.inference_mode():
            if fast:
                pipeline = self.ltx_i2v if ref_image is not None else self.ltx_t2v
            else:
                pipeline = self.wan_i2v if ref_image is not None else self.wan_t2v

            kwargs = dict(
                prompt=prompt,
                negative_prompt=negative_prompt,
                num_frames=frames,
                num_inference_steps=num_inference_steps,
                height=height,
                width=width,
            )
            if ref_image is not None:
                kwargs["image"] = ref_image

            result = pipeline(**kwargs)

        return self._frames_to_mp4(result.frames[0], fps=fps)

    # ── 批量分镜生成（顺序执行，避免单卡 OOM）────────────────────────────────

    @modal.method()
    def generate_storyboard(self, shots: list) -> list:
        """
        顺序生成所有分镜，返回 (idx, mp4_bytes_or_None, error_or_None) 列表。
        Modal 会为每个 generate_storyboard 调用分配一个独立容器，
        不同容器间并发由调用方（video_api）控制。
        """
        results = []
        for i, shot in enumerate(shots):
            if not isinstance(shot, dict):
                shot = shot.dict()
            try:
                mp4 = self.generate_shot(
                    prompt=shot.get("prompt", ""),
                    width=shot.get("width", 704),
                    height=shot.get("height", 480),
                    num_frames=shot.get("num_frames", 97),
                    num_inference_steps=shot.get("num_inference_steps", 50),
                    fps=shot.get("fps", 24),
                    fast=shot.get("fast", False),
                    negative_prompt=shot.get("negative_prompt", "worst quality, inconsistent motion, blurry, jittery, distorted"),
                    reference_images=shot.get("reference_images") or None,
                )
                results.append((i, mp4, None))
            except Exception as e:
                print(f"[VideoGenerator] Shot {i} failed: {e}")
                results.append((i, None, str(e)))
        return results


# ─────────────────────────────────────────────────────────────────────────────
# FastAPI HTTP 接口（与 RunPod API v3.0.0 兼容）
# ─────────────────────────────────────────────────────────────────────────────

@app.function(timeout=3600)
@modal.asgi_app()
def video_api():
    from fastapi import FastAPI, HTTPException, BackgroundTasks
    from fastapi.responses import Response
    from pydantic import BaseModel, Field

    web_app = FastAPI(title="OmniVideo API", version="3.0.0")

    # ── Pydantic 模型 ──────────────────────────────────────────────────────────

    class ShotRequest(BaseModel):
        prompt: str
        width: int = 704
        height: int = 480
        num_frames: int = 97
        num_inference_steps: int = 50
        fps: int = 24
        fast: bool = False
        negative_prompt: str = "worst quality, inconsistent motion, blurry, jittery, distorted"
        background_style: str = "gradient"  # aesthetic hint, not used in inference
        reference_images: list = Field(default_factory=list)

    class StoryboardRequest(BaseModel):
        shots: list  # List[ShotRequest]

    # ── 任务状态辅助 ───────────────────────────────────────────────────────────

    def _make_zip(indexed_results: list) -> bytes:
        """将 (idx, mp4_bytes, error) 列表打包成 ZIP。"""
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
            for idx, mp4_bytes, err in sorted(indexed_results, key=lambda x: x[0]):
                if mp4_bytes:
                    zf.writestr(f"shot_{idx + 1:03d}.mp4", mp4_bytes)
                else:
                    zf.writestr(f"shot_{idx + 1:03d}_ERROR.txt", err or "unknown error")
        buf.seek(0)
        return buf.read()

    # ── 路由 ──────────────────────────────────────────────────────────────────

    @web_app.get("/api/v1/health")
    async def health():
        """返回服务健康状态。model_loaded 反映模型是否已加载。"""
        return {"status": "ok", "model_loaded": True}

    @web_app.post("/api/v1/generate")
    async def generate_single(req: ShotRequest):
        """单分镜同步生成，返回 video/mp4 字节流。"""
        try:
            gen = VideoGenerator()
            mp4_bytes = await gen.generate_shot.remote.aio(
                prompt=req.prompt,
                width=req.width,
                height=req.height,
                num_frames=req.num_frames,
                num_inference_steps=req.num_inference_steps,
                fps=req.fps,
                fast=req.fast,
                negative_prompt=req.negative_prompt,
                reference_images=req.reference_images or None,
            )
            return Response(
                content=mp4_bytes,
                media_type="video/mp4",
                headers={"Content-Disposition": "attachment; filename=video.mp4"},
            )
        except Exception as exc:
            raise HTTPException(status_code=500, detail=str(exc))

    @web_app.post("/api/v1/generate/storyboard")
    async def generate_storyboard_sync(req: StoryboardRequest):
        """
        批量分镜同步生成。在 Modal 上逐条执行（每条约 60s），打包 ZIP 返回。
        注意：客户端需设置足够长的读超时（推荐 3600s）。
        """
        shots = [s if isinstance(s, dict) else s.dict() for s in req.shots]
        gen = VideoGenerator()
        try:
            indexed_results = await gen.generate_storyboard.remote.aio(shots)
        except Exception as exc:
            raise HTTPException(status_code=500, detail=str(exc))

        return Response(
            content=_make_zip(indexed_results),
            media_type="application/zip",
            headers={"Content-Disposition": "attachment; filename=storyboard_videos.zip"},
        )

    @web_app.post("/api/v1/generate/storyboard/async")
    async def generate_storyboard_async(req: StoryboardRequest, bg: BackgroundTasks):
        """
        批量分镜异步提交。立即返回 task_id，后台渲染。
        客户端通过 GET /api/v1/tasks/{task_id} 轮询，完成后 GET /api/v1/tasks/{task_id}/download 下载。
        """
        task_id = uuid.uuid4().hex
        shots = [s if isinstance(s, dict) else s.dict() for s in req.shots]
        _tasks[task_id] = {
            "status": "pending",
            "progress": 0,
            "done": 0,
            "total": len(shots),
            "results": [],
            "error": None,
        }

        async def _run():
            _tasks[task_id]["status"] = "running"
            gen = VideoGenerator()
            try:
                indexed_results = await gen.generate_storyboard.remote.aio(shots)
                _tasks[task_id]["results"] = indexed_results
                _tasks[task_id]["done"] = len(indexed_results)
                _tasks[task_id]["progress"] = 100
                _tasks[task_id]["status"] = "done"
            except Exception as e:
                _tasks[task_id]["status"] = "failed"
                _tasks[task_id]["error"] = str(e)

        bg.add_task(_run)
        return {"task_id": task_id, "status": "pending", "total": len(shots)}

    @web_app.get("/api/v1/tasks/{task_id}")
    async def get_task_status(task_id: str):
        """查询异步任务状态。"""
        task = _tasks.get(task_id)
        if not task:
            raise HTTPException(status_code=404, detail=f"task_id={task_id} 不存在")
        total = task["total"]
        done = task["done"]
        progress = int(done / total * 100) if total > 0 else 0
        return {
            "task_id": task_id,
            "status": task["status"],
            "progress": progress,
            "done": done,
            "total": total,
            "error": task.get("error"),
        }

    @web_app.get("/api/v1/tasks/{task_id}/download")
    async def download_task_result(task_id: str):
        """下载已完成的任务结果（ZIP）。"""
        task = _tasks.get(task_id)
        if not task:
            raise HTTPException(status_code=404, detail=f"task_id={task_id} 不存在")
        if task["status"] != "done":
            raise HTTPException(
                status_code=425,
                detail=f"任务尚未完成（当前状态: {task['status']}），请稍后重试",
            )
        zip_bytes = _make_zip(task["results"])
        return Response(
            content=zip_bytes,
            media_type="application/zip",
            headers={"Content-Disposition": f"attachment; filename=storyboard_{task_id[:8]}.zip"},
        )

    return web_app


# ─────────────────────────────────────────────────────────────────────────────
# 本地测试入口
# ─────────────────────────────────────────────────────────────────────────────

@app.local_entrypoint()
def main():
    """modal run modal_video_service.py"""
    gen = VideoGenerator()
    mp4 = gen.generate_shot.remote(
        prompt="A cup of tea on a wooden table, soft morning light, cinematic",
        width=704, height=480,
        num_frames=25, num_inference_steps=20,
        fast=True,
    )
    with open("test_video.mp4", "wb") as f:
        f.write(mp4)
    print(f"✅ 测试完成，已保存 test_video.mp4（{len(mp4):,} bytes）")
