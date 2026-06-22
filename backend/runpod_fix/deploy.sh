#!/bin/bash
# 在 RunPod pod 终端中执行此脚本，修复 LTX engine.py 并重启服务
# 用法: bash deploy.sh

set -e

SERVICE_DIR="/workspace/ltx_video_service/services"
TARGET="$SERVICE_DIR/engine.py"

echo "📁 备份原文件..."
cp "$TARGET" "${TARGET}.bak_$(date +%Y%m%d_%H%M%S)"

echo "⬇️  下载修复版 engine.py..."
# 直接写入修复内容
cat > "$TARGET" << 'PYEOF'
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

_pipeline_t2v = None
_pipeline_i2v = None
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
    """将 diffusers pipeline 输出的 frames 统一转为 uint8 numpy 数组列表。"""
    result_frames = []

    if isinstance(frames, torch.Tensor):
        arr = frames.detach().cpu().float().numpy()
        if arr.ndim == 5:
            arr = arr[0]
        if arr.max() <= 1.0:
            arr = (arr * 255).clip(0, 255)
        arr = arr.astype(np.uint8)
        for i in range(arr.shape[0]):
            result_frames.append(arr[i])
        return result_frames

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

    raw = result.frames[0]
    frames_uint8 = _frames_to_uint8(raw)

    if not frames_uint8:
        raise RuntimeError("推理完成但 frames 为空，无法写入 MP4")

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


threading.Thread(target=_load_models, daemon=True).start()
PYEOF

echo "✅ engine.py 已更新"

echo "🔄 重启 uvicorn 服务..."
pkill -f "uvicorn main:app" || true
sleep 2
cd /workspace/ltx_video_service
nohup uvicorn main:app --host 0.0.0.0 --port 8000 > /tmp/ltx_service.log 2>&1 &
echo "⏳ 等待服务启动..."
sleep 5
curl -s http://localhost:8000/api/v1/health | python3 -c "import sys,json; d=json.load(sys.stdin); print('Health:', d)"
echo "🎉 部署完成！模型正在后台加载，约 2-3 分钟后 model_loaded 变为 true"
