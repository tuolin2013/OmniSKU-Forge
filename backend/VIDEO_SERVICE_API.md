# OmniSKU-Forge Video Backend — 服务端接口规范

> 适用版本：OmniSKU-Forge API v6.3.0  
> 部署环境：RunPod（FastAPI + Uvicorn，diffusers LTX-Video）  
> 配置项：`LTX_VIDEO_BASE_URL` 写入 `backend/.env`

---

## 概述

视频生成服务由两层组成：

```
前端 / 调用方
    │
    ▼
OmniSKU-Forge 主后端（FastAPI，8000 端口）
    │  ltx_video_engine.py 封装的 HTTP 调用
    ▼
Video Backend（RunPod 上的 LTX-Video 推理服务）
    └── 本文档描述的接口即此层
```

主后端通过 `ltx_video_engine.py` 调用 Video Backend，采用**同步请求 → 直接返回 MP4 文件流**模式（无 task_id，无轮询）。

**参考图传递规则（重要）：**
- 主后端从 `image_urls[0]` 下载第一张产品实拍图，转换为 base64 data URI
- 仅在分镜 `video_type == "image-to-video"` 时将其作为 `reference_image` 传给 RunPod
- RunPod 服务端使用 `LTXImageToVideoPipeline`（图生视频），否则使用 `LTXVideoPipeline`（文生视频）
- **每次只传 1 张参考图**（`image_urls[0]`），不支持多参考图

---

## 基础信息

| 项目 | 值 |
|------|----|
| Base URL | `LTX_VIDEO_BASE_URL`（环境变量，例如 `https://q9v8jl52w5pb58-8000.proxy.runpod.net`） |
| 路由前缀 | `/api/v1`（所有接口均以此开头） |
| 数据格式 | 请求 JSON，响应 `video/mp4` 或 `application/zip` 二进制流 |
| 认证 | 无（依赖 RunPod 网络隔离） |
| TLS 验证 | 关闭（`verify=False`，RunPod 代理证书环境） |

---

## 接口列表

### 1. 健康检查

```
GET /api/v1/health
```

#### 响应体（HTTP 200）

| 字段 | 类型 | 说明 |
|------|------|------|
| `status` | string | 固定为 `"ok"` |
| `model_loaded` | bool | 模型是否已加载完毕。`false` 表示服务存活但仍在加载，不应发送推理请求 |

```json
{
  "status": "ok",
  "model_loaded": true
}
```

> 服务启动后模型加载需要约 1-2 分钟，此期间 `model_loaded` 为 `false`，  
> 发送 `/generate` 请求会收到 `503 Service Unavailable`。

---

### 2. 单条视频生成

```
POST /api/v1/generate
```

#### 请求体（`Content-Type: application/json`）

| 字段 | 类型 | 必填 | 默认值 | 约束 | 说明 |
|------|------|------|--------|------|------|
| `prompt` | string | ✅ | — | 1–2000 字符 | 正向提示词 |
| `negative_prompt` | string | ❌ | `"worst quality, inconsistent motion, blurry, jittery, distorted"` | ≤2000 字符 | 负向提示词 |
| `num_frames` | int | ❌ | `161` | 9–257，必须满足 **8N+1** | 总帧数 |
| `num_inference_steps` | int | ❌ | `30` | 1–100 | 扩散去噪步数 |
| `height` | int | ❌ | `480` | 256–720，**32 的倍数** | 视频高度（像素） |
| `width` | int | ❌ | `704` | 256–1280，**32 的倍数** | 视频宽度（像素） |
| `fps` | int | ❌ | `24` | 8–60 | 输出视频帧率 |
| `reference_image` | string | ❌ | `null` | base64 或 data URI | **参考图，传入时启用图生视频模式** |

**常用宽高比 → 推荐分辨率**

| 比例 | width | height | 说明 |
|------|-------|--------|------|
| 16:9 | 704 | 480 | 默认，横屏电商视频 |
| 9:16 | 480 | 704 | 竖屏短视频 |
| 1:1  | 512 | 512 | 正方形 |
| 3:4  | 480 | 640 | 竖向海报 |

#### 请求示例（文生视频）

```json
{
  "prompt": "A sleek wireless earphone floats against a clean white background, soft studio lighting, product reveal shot, cinematic",
  "num_frames": 97,
  "num_inference_steps": 30,
  "height": 480,
  "width": 704,
  "fps": 24
}
```

#### 请求示例（图生视频）

```json
{
  "prompt": "Product elegantly rotating, studio lighting, cinematic 4K",
  "num_frames": 49,
  "num_inference_steps": 30,
  "height": 480,
  "width": 704,
  "fps": 24,
  "reference_image": "data:image/jpeg;base64,/9j/4AAQ..."
}
```

#### 响应（成功，HTTP 200）

- `Content-Type: video/mp4`
- 响应体为 MP4 二进制文件流，可直接保存为 `.mp4` 文件

---

### 3. 批量分镜生成（Storyboard）

```
POST /api/v1/generate/storyboard
```

一次性批量生成所有分镜，最终返回一个 ZIP 包。

#### 请求体

```json
{
  "shots": [
    {
      "prompt": "分镜1提示词",
      "num_frames": 49,
      "num_inference_steps": 30,
      "height": 480,
      "width": 704,
      "fps": 24,
      "reference_image": "data:image/jpeg;base64,..."
    },
    {
      "prompt": "分镜2提示词（文生视频，无参考图）",
      "num_frames": 49,
      "num_inference_steps": 30,
      "height": 480,
      "width": 704,
      "fps": 24
    }
  ]
}
```

每个 shot 的字段与 `/api/v1/generate` 相同，`reference_image` 可选：有则图生视频，无则文生视频。

#### 响应（成功，HTTP 200）

- `Content-Type: application/zip`
- 响应体为 ZIP 二进制流
- ZIP 内文件命名规则：`shot_001.mp4`, `shot_002.mp4`, ...（3位补零，与请求 shots 顺序一一对应）
- 生成失败的分镜对应的 ZIP 条目将缺失（主后端检测并标记为失败）

---

## 完整交互流程

```
主后端                          Video Backend（RunPod）
  │                                  │
  │── GET /api/v1/health ───────────▶│
  │◀── { status:"ok",                │
  │      model_loaded: true } ───────│
  │                                  │
  │── POST /api/v1/generate/         │
  │   storyboard ──────────────────▶ │
  │   { shots: [...] }               │   （GPU 推理，顺序执行每条分镜）
  │                                  │
  │◀── 200 OK                        │
  │    Content-Type: application/zip │
  │    [ZIP 二进制流，含所有 MP4] ────│
  │                                  │
  │  解压 ZIP，逐条上传 R2，          │
  │  返回每条 URL 列表给前端          │
```

---

## 错误响应

| HTTP 状态码 | 触发条件 | 响应体示例 |
|------------|---------|-----------|
| `422` | 请求参数不合法（字段缺失、超出范围、不满足 8N+1 或 32 倍数约束） | `{"detail": [...]}` |
| `503` | 模型尚未加载完毕 | `{"detail": "模型未加载，服务未就绪"}` |
| `500` | 推理过程异常（OOM、模型错误等） | `{"detail": "视频生成失败: CUDA out of memory"}` |

---

## 环境配置

在 `backend/.env` 中配置 Video Backend 地址：

```env
LTX_VIDEO_BASE_URL=https://q9v8jl52w5pb58-8000.proxy.runpod.net
```

Swagger UI（可直接在浏览器测试）：`${LTX_VIDEO_BASE_URL}/docs`

---

## 超时说明

| 阶段 | 主后端配置 | 说明 |
|------|----------|------|
| 连接超时 | 15 秒 | 连接 RunPod 服务的最长等待 |
| 读取超时 | 1200 秒（20 分钟） | 等待整批 storyboard 推理完成的最长等待 |
| 上层 FastAPI 超时 | 1200 秒 | `/generate-from-script` 整批超时上限 |

LTX-Video 实际推理耗时取决于帧数和步数，典型值：
- `num_frames=49, steps=30`：约 20-40 秒/条
- `num_frames=97, steps=30`：约 40-70 秒/条

---

## 参数速查（8N+1 帧数对照）

| num_frames | 时长（fps=24） | 推荐用途 |
|-----------|--------------|---------|
| 25 | ~1s | 极短动效 |
| 49 | ~2s | 分镜片段（storyboard 推荐） |
| 97 | ~4s | 单条完整场景 |
| 161 | ~6.7s | 较长镜头 |
| 257 | ~10.7s | 长镜头（慎用，耗时长） |

---

## 注意事项

1. **参考图只支持 1 张**：每条分镜最多传 1 张 `reference_image`，主后端固定取 `image_urls[0]`。
2. **并发请求自动排队**：服务内部使用 GPU 推理锁，多个请求依次排队执行，不会 OOM。
3. **storyboard 顺序执行**：批量接口中各分镜按顺序串行推理，总耗时 = 各条耗时之和。
4. **临时文件自动清理**：MP4 文件在打包 ZIP 后由服务端自动删除，ZIP 在流式传输完成后删除。
5. **模型加载等待**：服务启动后首次推理前需等待约 1-2 分钟（`/health` 的 `model_loaded` 变为 `true`）。
6. **8N+1 帧数**：LTX-Video 架构限制，传入不符合格式的值会得到 `422` 错误。
