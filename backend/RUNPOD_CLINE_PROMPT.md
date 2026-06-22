# RunPod Cline 指令 — 复制以下内容发给 RunPod 上的 Cline

---

## 指令正文（从下方横线起复制）

---

请在 `/workspace/ltx_video_service` 目录下，从头创建一个完整的 LTX-Video 视频生成 HTTP 服务。要求如下：

### 项目结构

```
/workspace/ltx_video_service/
├── main.py              # FastAPI 应用入口，挂载路由，监听 0.0.0.0:8000
├── services/
│   └── engine.py        # 模型加载 + 推理逻辑
├── api/
│   └── endpoints.py     # HTTP 路由控制器
├── requirements.txt     # 依赖清单
└── start.sh             # 启动脚本
```

### 接口规范

**GET /api/v1/health**
```json
{ "status": "ok", "model_loaded": true }
```
`model_loaded` 反映模型是否加载完毕。模型加载期间为 `false`，不影响服务存活。

**POST /api/v1/generate**
- 请求体（JSON）：

| 字段 | 类型 | 默认值 | 约束 | 说明 |
|------|------|--------|------|------|
| prompt | string | 必填 | 1-2000字符 | 正向提示词 |
| negative_prompt | string | "worst quality, inconsistent motion, blurry, jittery, distorted" | ≤2000字符 | 负向提示词 |
| num_frames | int | 161 | 9-257，必须满足 8N+1 | 总帧数 |
| num_inference_steps | int | 30 | 1-100 | 去噪步数 |
| height | int | 480 | 256-720，32的倍数 | 视频高度 |
| width | int | 704 | 256-1280，32的倍数 | 视频宽度 |
| fps | int | 24 | 8-60 | 帧率 |
| **reference_image** | string | null | base64 或 data URI | **可选，传入时启用图生视频模式** |

- 响应：HTTP 200，`Content-Type: video/mp4`，响应体为 MP4 二进制流
- 错误：422（参数不合法）、503（模型未就绪）、500（推理失败）

**POST /api/v1/generate/storyboard**
- 一次性批量生成多条分镜，返回 ZIP 包（内含 `shot_001.mp4`, `shot_002.mp4`, ...）
- 请求体：

```json
{
  "shots": [
    {
      "prompt": "...",
      "negative_prompt": "...",
      "num_frames": 49,
      "num_inference_steps": 30,
      "height": 480,
      "width": 704,
      "fps": 24,
      "reference_image": "data:image/jpeg;base64,..."
    },
    ...
  ]
}
```

每个 shot 字段同 `/api/v1/generate`，`reference_image` 可选，有则图生视频，无则文生视频。
- 响应：HTTP 200，`Content-Type: application/zip`，响应体为 ZIP 二进制流，内含 `shot_001.mp4`, `shot_002.mp4` ...

---

### services/engine.py 实现要求

1. 使用 `diffusers` 库加载 LTX-Video 模型，model_id 从环境变量 `LTX_MODEL_ID` 读取，默认值为 `"Lightricks/LTX-Video"`
2. 在服务启动时用后台线程异步加载模型（不阻塞 FastAPI 启动），加载完成后设置全局 `_pipeline_t2v`（文生视频）和 `_pipeline_i2v`（图生视频）变量
3. 提供 `get_pipeline()` 函数，返回 `_pipeline_t2v`（只要文生视频 pipeline 加载完即为就绪）
4. **推理函数 `generate_video_sync(...)`（同步）**：
   - 参数：`prompt, negative_prompt, num_frames, num_inference_steps, height, width, fps, reference_image=None`
   - `reference_image` 为 None 时使用 `LTXVideoPipeline`（文生视频）
   - `reference_image` 为 base64/data URI 字符串时，解码为 PIL Image，使用 `LTXImageToVideoPipeline`（图生视频）
   - 用 `threading.Lock` 串行化 GPU 推理请求（防止并发 OOM）
   - 推理完成后将帧序列用 `imageio` 写成 MP4，保存到 `/tmp/ltx_outputs/` 目录，文件名用 uuid
   - 返回生成文件的 `Path` 对象
5. 提供 `async def generate_video(...)` 用 `asyncio.to_thread` 包装上面的同步函数

### api/endpoints.py 实现要求

使用如下设计（直接照此实现）：

```python
import base64
import io
import uuid
import zipfile
from pathlib import Path
from typing import Annotated, List, Optional

from fastapi import APIRouter, BackgroundTasks, HTTPException
from fastapi.responses import FileResponse, StreamingResponse
from loguru import logger
from pydantic import BaseModel, Field, field_validator
from PIL import Image

from services import engine

router = APIRouter()


def _decode_reference_image(ref: str) -> Optional[Image.Image]:
    """将 base64 或 data URI 解码为 PIL Image，失败返回 None。"""
    try:
        if ref.startswith("data:"):
            # data:image/jpeg;base64,xxxx
            ref = ref.split(",", 1)[1]
        img_bytes = base64.b64decode(ref)
        return Image.open(io.BytesIO(img_bytes)).convert("RGB")
    except Exception as e:
        logger.warning("参考图解码失败，降级为文生视频: {}", e)
        return None


class VideoGenerationRequest(BaseModel):
    prompt: Annotated[str, Field(min_length=1, max_length=2000)]
    negative_prompt: Annotated[str, Field(
        default="worst quality, inconsistent motion, blurry, jittery, distorted",
        max_length=2000,
    )]
    num_frames: Annotated[int, Field(default=161, ge=9, le=257)]
    num_inference_steps: Annotated[int, Field(default=30, ge=1, le=100)]
    height: Annotated[int, Field(default=480, ge=256, le=720)]
    width: Annotated[int, Field(default=704, ge=256, le=1280)]
    fps: Annotated[int, Field(default=24, ge=8, le=60)]
    reference_image: Optional[str] = None  # base64 或 data URI

    @field_validator("height", "width")
    @classmethod
    def must_be_multiple_of_32(cls, v: int) -> int:
        if v % 32 != 0:
            raise ValueError(f"{v} 不是 32 的倍数")
        return v

    @field_validator("num_frames")
    @classmethod
    def must_be_8n_plus_1(cls, v: int) -> int:
        if (v - 1) % 8 != 0:
            raise ValueError(f"num_frames={v} 不满足 8N+1（如 9,17,25,49,97,161,257）")
        return v


class ShotRequest(BaseModel):
    """storyboard 批量接口中单条分镜"""
    prompt: Annotated[str, Field(min_length=1, max_length=2000)]
    negative_prompt: Annotated[str, Field(
        default="worst quality, inconsistent motion, blurry, jittery, distorted",
        max_length=2000,
    )]
    num_frames: Annotated[int, Field(default=49, ge=9, le=257)]
    num_inference_steps: Annotated[int, Field(default=30, ge=1, le=100)]
    height: Annotated[int, Field(default=480, ge=256, le=720)]
    width: Annotated[int, Field(default=704, ge=256, le=1280)]
    fps: Annotated[int, Field(default=24, ge=8, le=60)]
    reference_image: Optional[str] = None  # base64 或 data URI

    @field_validator("height", "width")
    @classmethod
    def must_be_multiple_of_32(cls, v: int) -> int:
        if v % 32 != 0:
            raise ValueError(f"{v} 不是 32 的倍数")
        return v

    @field_validator("num_frames")
    @classmethod
    def must_be_8n_plus_1(cls, v: int) -> int:
        if (v - 1) % 8 != 0:
            raise ValueError(f"num_frames={v} 不满足 8N+1")
        return v


class StoryboardRequest(BaseModel):
    shots: List[ShotRequest]


class HealthResponse(BaseModel):
    model_config = {"protected_namespaces": ()}
    status: str
    model_loaded: bool


@router.get("/health", response_model=HealthResponse)
async def health_check():
    return HealthResponse(status="ok", model_loaded=engine.get_pipeline() is not None)


@router.post("/generate")
async def generate_video_endpoint(request: VideoGenerationRequest, background_tasks: BackgroundTasks):
    logger.info("POST /generate | prompt='{}' | has_ref={}", request.prompt[:60], request.reference_image is not None)
    if engine.get_pipeline() is None:
        raise HTTPException(status_code=503, detail="模型未加载，服务未就绪")

    ref_image = _decode_reference_image(request.reference_image) if request.reference_image else None

    try:
        output_path = await engine.generate_video(
            prompt=request.prompt,
            negative_prompt=request.negative_prompt,
            num_frames=request.num_frames,
            num_inference_steps=request.num_inference_steps,
            height=request.height,
            width=request.width,
            fps=request.fps,
            reference_image=ref_image,
        )
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        logger.opt(exception=True).error("视频生成失败: {}", e)
        raise HTTPException(status_code=500, detail=f"视频生成失败: {str(e)}")

    background_tasks.add_task(lambda p: p.unlink(missing_ok=True), output_path)
    return FileResponse(path=str(output_path), media_type="video/mp4", filename=output_path.name)


@router.post("/generate/storyboard")
async def generate_storyboard_endpoint(request: StoryboardRequest):
    """批量分镜生成，返回 ZIP 包（shot_001.mp4, shot_002.mp4, ...）"""
    if engine.get_pipeline() is None:
        raise HTTPException(status_code=503, detail="模型未加载，服务未就绪")

    logger.info("POST /generate/storyboard | {} 个分镜", len(request.shots))

    tmp_dir = Path("/tmp/ltx_outputs")
    tmp_dir.mkdir(parents=True, exist_ok=True)

    generated_paths: List[Optional[Path]] = []

    for i, shot in enumerate(request.shots):
        ref_image = _decode_reference_image(shot.reference_image) if shot.reference_image else None
        logger.info("分镜 {}/{} | has_ref={}", i + 1, len(request.shots), ref_image is not None)
        try:
            path = await engine.generate_video(
                prompt=shot.prompt,
                negative_prompt=shot.negative_prompt,
                num_frames=shot.num_frames,
                num_inference_steps=shot.num_inference_steps,
                height=shot.height,
                width=shot.width,
                fps=shot.fps,
                reference_image=ref_image,
            )
            generated_paths.append(path)
        except Exception as e:
            logger.error("分镜 {} 生成失败: {}", i + 1, e)
            generated_paths.append(None)

    # 打包 ZIP
    zip_path = tmp_dir / f"storyboard_{uuid.uuid4().hex}.zip"
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
        for i, path in enumerate(generated_paths):
            mp4_name = f"shot_{i + 1:03d}.mp4"
            if path and path.exists():
                zf.write(path, mp4_name)
                path.unlink(missing_ok=True)

    def iter_zip():
        with open(zip_path, "rb") as f:
            yield from iter(lambda: f.read(65536), b"")
        zip_path.unlink(missing_ok=True)

    return StreamingResponse(
        iter_zip(),
        media_type="application/zip",
        headers={"Content-Disposition": f"attachment; filename=storyboard.zip"},
    )
```

### main.py 要求

```python
from fastapi import FastAPI
from api.endpoints import router

app = FastAPI(title="LTX-Video Service")
app.include_router(router, prefix="/api/v1")
```

### services/engine.py 关键说明

```python
import asyncio
import base64
import io
import threading
import uuid
from pathlib import Path
from typing import Optional

import imageio
import numpy as np
import torch
from diffusers import LTXVideoPipeline, LTXImageToVideoPipeline
from loguru import logger
from PIL import Image

LTX_MODEL_ID = os.environ.get("LTX_MODEL_ID", "Lightricks/LTX-Video")

_pipeline_t2v = None   # 文生视频 pipeline
_pipeline_i2v = None   # 图生视频 pipeline（共享同一 checkpoint，只需加载一次）
_gpu_lock = threading.Lock()
_output_dir = Path("/tmp/ltx_outputs")


def _load_models():
    global _pipeline_t2v, _pipeline_i2v
    try:
        logger.info("开始加载 LTX-Video 模型: {}", LTX_MODEL_ID)
        _pipeline_t2v = LTXVideoPipeline.from_pretrained(LTX_MODEL_ID, torch_dtype=torch.bfloat16).to("cuda")
        _pipeline_i2v = LTXImageToVideoPipeline.from_pretrained(LTX_MODEL_ID, torch_dtype=torch.bfloat16).to("cuda")
        logger.info("✅ 模型加载完成")
    except Exception as e:
        logger.error("模型加载失败: {}", e)


def get_pipeline():
    return _pipeline_t2v


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
            # 图生视频
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
            # 文生视频
            result = _pipeline_t2v(
                prompt=prompt,
                negative_prompt=negative_prompt,
                num_frames=num_frames,
                num_inference_steps=num_inference_steps,
                height=height,
                width=width,
            )

    frames = result.frames[0]  # list of PIL Image
    with imageio.get_writer(str(output_path), fps=fps, codec="libx264", quality=8) as writer:
        for frame in frames:
            writer.append_data(np.array(frame))

    return output_path


async def generate_video(**kwargs) -> Path:
    return await asyncio.to_thread(generate_video_sync, **kwargs)


# 服务启动时后台加载
threading.Thread(target=_load_models, daemon=True).start()
```

### requirements.txt 内容

```
fastapi==0.115.0
uvicorn[standard]==0.30.6
diffusers==0.31.0
transformers==4.45.0
accelerate==0.34.2
torch==2.4.1
torchvision==0.19.1
imageio==2.35.1
imageio-ffmpeg==0.5.1
loguru==0.7.2
python-dotenv==1.0.1
sentencepiece==0.2.0
pillow>=10.0.0
```

### start.sh 内容

```bash
#!/bin/bash
cd /workspace/ltx_video_service
pip install -r requirements.txt -q
uvicorn main:app --host 0.0.0.0 --port 8000
```

### 注意事项

- `reference_image` 字段接受 base64 字符串或 `data:image/jpeg;base64,...` 格式的 data URI
- 有 `reference_image` 时使用 `LTXImageToVideoPipeline`，无则用 `LTXVideoPipeline`
- storyboard 接口命名规则：`shot_001.mp4`, `shot_002.mp4`, ...（3位补零）
- 路由前缀为 `/api/v1`（通过 `main.py` 中 `include_router(router, prefix="/api/v1")` 实现）
- 生成的帧是 PIL Image 列表，用 `imageio.get_writer` 写成 mp4
- 输出目录 `/tmp/ltx_outputs/` 若不存在需自动创建
- 所有文件创建完毕后，输出每个文件的完整路径供确认

请创建以上所有文件。
