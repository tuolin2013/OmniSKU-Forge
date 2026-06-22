"""
services/engine.py — RunPod LTX-Video 推理引擎（修复版）
修复: result.frames[0] 返回 tensor/ndarray 而非 PIL 列表时的 numpy 布尔歧义错误
"""
import asyncio
import os
import threading
import uuid
from pathlib import Path
from typing import Optional

import imageio
import numpy as np
import torch
from loguru import logger
from PIL import Image

LTX_MODEL_ID = os.environ.get("LTX_MODEL_ID", "Lightricks/LTX-Video")

_pipeline_t2v = None   # 文生视频 pipeline
_pipeline_i2v = None   # 图生视频 pipeline
_gpu_lock = threading.Lock()
_output_dir = Path("/tmp/ltx_outputs")


def _load_models():
    global _pipeline_t2v, _pipeline_i2v
    try:
        from diffusers import LTXVideoPipeline, LTXImageToVideoPipeline
        logger.info("开始加载 LTX-Video 模型: {}", LTX_MODEL_ID)
        _pipeline_t2v = LTXVideoPipeline.from_pretrained(
            LTX_MODEL_ID, torch_dtype=torch.bfloat16
        ).to("cuda")
        _pipeline_i2v = LTXImageToVideoPipeline.from_pretrained(
            LTX_MODEL_ID, torch_dtype=torch.bfloat16
        ).to("cuda")
        logger.info("✅ 模型加载完成")
    except Exception as e:
        logger.error("模型加载失败: {}", e)


def get_pipeline():
    return _pipeline_t2v


def _frames_to_uint8(frames) -> list:
    """
    将 diffusers pipeline 输出的 frames 统一转为 uint8 numpy 数组列表。
    兼容以下格式：
      - list[PIL.Image]
      - torch.Tensor  shape (T, H, W, C) or (1, T, H, W, C), float [0,1]
      - np.ndarray    shape (T, H, W, C), float or uint8
    """
    result_frames = []

    # ── torch.Tensor ──────────────────────────────────────────────────────────
    if isinstance(frames, torch.Tensor):
        arr = frames.detach().cpu().float().numpy()
        # Remove batch dimension if present: (1,T,H,W,C) → (T,H,W,C)
        if arr.ndim == 5:
            arr = arr[0]
        # Normalize to [0,255] uint8
        if arr.max() <= 1.0:
            arr = (arr * 255).clip(0, 255)
        arr = arr.astype(np.uint8)
        for i in range(arr.shape[0]):
            result_frames.append(arr[i])
        return result_frames

    # ── np.ndarray ─────────────────────────────────────────────────────────────
    if isinstance(frames, np.ndarray):
        arr = frames
        if arr.ndim == 5:
            arr = arr[0]
        if arr.max() <= 1.0:
            arr = (arr * 255).clip(0, 255)
        arr = arr.astype(np.uint8)
        for i in range(arr.shape[0]):
            result_frames.append(arr[i])
        return result_frames

    # ── list (of PIL Image or tensor/ndarray) ──────────────────────────────────
    for frame in frames:
        if isinstance(frame, Image.Image):
            result_frames.append(np.array(frame.convert("RGB")))
        elif isinstance(frame, torch.Tensor):
            f = frame.detach().cpu().float().numpy()
            if f.max() <= 1.0:
                f = (f * 255).clip(0, 255)
            result_frames.append(f.astype(np.uint8))
        elif isinstance(frame, np.ndarray):
            f = frame
            if f.max() <= 1.0:
                f = (f * 255).clip(0, 255)
            result_frames.append(f.astype(np.uint8))
        else:
            # Fallback: try PIL
            result_frames.append(np.array(Image.fromarray(frame).convert("RGB")))

    return result_frames


def generate_video_sync(
    prompt: str,
    negative_prompt: str,
    num_frames: int,
    num_inference_steps: int,
    height: int,
    width: int,
    fps: int,
    reference_image: Optional[Image.Image] = None,
) -> Path:
    _output_dir.mkdir(parents=True, exist_ok=True)
    output_path = _output_dir / f"{uuid.uuid4().hex}.mp4"

    with _gpu_lock:
        if reference_image is not None and _pipeline_i2v is not None:
            result = _pipeline_i2v(
                image=reference_image,
                prompt=prompt,
                negative_prompt=negative_prompt,
                num_frames=num_frames,
                num_inference_steps=num_inference_steps,
                height=height,
                width=width,
            )
        else:
            result = _pipeline_t2v(
                prompt=prompt,
                negative_prompt=negative_prompt,
                num_frames=num_frames,
                num_inference_steps=num_inference_steps,
                height=height,
                width=width,
            )

    # result.frames is (usually) a list containing one item (the batch):
    #   result.frames[0] can be a list[PIL] or a tensor/ndarray
    raw = result.frames[0]
    frames_uint8 = _frames_to_uint8(raw)

    if not frames_uint8:
        raise RuntimeError("推理完成但 frames 为空，无法写入 MP4")

    # Write MP4 using imageio-ffmpeg
    writer = imageio.get_writer(
        str(output_path),
        fps=fps,
        codec="libx264",
        output_params=["-crf", "23", "-pix_fmt", "yuv420p"],
    )
    for frame in frames_uint8:
        writer.append_data(frame)
    writer.close()

    logger.info("✅ 视频写入完成: {} ({} 帧)", output_path.name, len(frames_uint8))
    return output_path


async def generate_video(**kwargs) -> Path:
    return await asyncio.to_thread(generate_video_sync, **kwargs)


# 服务启动时后台加载
threading.Thread(target=_load_models, daemon=True).start()
