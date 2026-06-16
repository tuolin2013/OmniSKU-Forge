# OmniSKU-Forge

多平台电商内容生成引擎。输入产品档案 + 老板意图，自动产出策划案、主图分镜、详情页、SKU图、白底图、买家秀、视频脚本，支持拼多多和淘宝/天猫。

## 功能

- **AI 策划案**：市场调研（Tavily 联网）+ 文案策划（真流式输出）+ 合规审查（后台轻量 Critic）
- **主图生成**：10 张分镜，支持多模型（gpt-image-2 / nano-banana-pro）
- **详情页排版**：15 屏自动生成，带防机审护盾处理
- **白底图 / SKU规格图 / 买家秀**：一键批量生成并上传 R2
- **视频分镜**：60s 短视频剧本 + 12 段切片
- **一键出图**：策略→文案→排版→上云全自动流水线
- **R2 图库管理**：上传、删除、重命名、分页浏览

## 项目结构

```
OmniSKU-Forge/
├── backend/                    # FastAPI 后端
│   ├── app/
│   │   ├── main.py             # 应用入口（仅路由注册 + 生命周期）
│   │   └── api/
│   │       ├── v1/
│   │       │   ├── agents.py   # AI 智能体路由
│   │       │   ├── r2.py       # R2 存储路由
│   │       │   └── video.py    # 视频路由
│   │       ├── routers/
│   │       │   └── catalog.py  # 产品目录路由
│   │       └── core/
│   │           ├── services/
│   │           │   ├── omni_brain.py       # 多智能体大脑
│   │           │   ├── storage.py          # R2 存储服务
│   │           │   ├── knowledge_base.py   # Excel 知识库
│   │           │   ├── agent_pipeline.py   # 一键流水线
│   │           │   ├── image_shield.py     # 防机审处理
│   │           │   ├── platforms/          # 平台规则
│   │           │   ├── strategies/         # 品类策略
│   │           │   ├── categories/         # 类目规则
│   │           │   └── skills/
│   │           │       └── search_skill.py # Tavily 联网搜索
│   │           └── utils/
│   │               └── pinyin.py           # 拼音工具
│   ├── data/                   # Excel 产品知识库（不提交）
│   └── requirements.txt
├── frontend/                   # Next.js 前端
│   └── src/
│       ├── services/
│       │   └── api.ts          # 统一 API 调用层
│       ├── hooks/
│       │   └── useAgentStream.ts # 流式生成 Hook
│       ├── components/
│       │   ├── PinduoduoPublish.tsx
│       │   └── TaobaoPublish.tsx
│       └── pages/
│           └── index.tsx
├── .env.example                # 环境变量模板
├── .gitignore
└── README.md
```

## 快速开始

### 1. 克隆仓库

```bash
git clone https://github.com/tuolin2013/OmniSKU-Forge.git
cd OmniSKU-Forge
```

### 2. 配置环境变量

```bash
cp .env.example backend/.env
# 用编辑器打开 backend/.env，填入真实密钥
```

必填项：
- `RIGHT_CODE_API_KEY` — AI 模型调用密钥
- `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` — Cloudflare R2 密钥

可选项：
- `TAVILY_API_KEY` — 联网搜索（不填则降级为大模型内部推演）

### 3. 启动后端

```bash
cd backend
python -m venv .venv
# Windows
.venv\Scripts\activate
# macOS / Linux
source .venv/bin/activate

pip install -r requirements.txt

# 把产品 Excel 文件放入 data/ 目录
# 启动服务
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

API 文档访问：http://localhost:8000/docs

### 4. 启动前端

```bash
cd frontend
npm install
npm run dev
```

浏览器访问：http://localhost:3000

## Excel 知识库格式

将产品档案 `.xlsx` 文件放入 `backend/data/` 目录，启动时自动加载。
每行一个 SKU，至少包含以下列：

| 列名 | 说明 |
|------|------|
| 产品名称 | SKU 名称，作为查询 key |
| 核心成分 | 主要原料 |
| 使用说明 | 用法用量 |
| 适用人群 | 目标客群 |
| 产品卖点 | 核心差异化优势 |

其余列自动纳入档案，列越丰富策划案质量越高。

## 技术栈

**后端**
- Python 3.11+ / FastAPI / Uvicorn
- OpenAI SDK（兼容代理端点）
- Tavily（联网搜索）
- boto3（Cloudflare R2）
- Pillow（图像处理）

**前端**
- Next.js 16 / React 19 / TypeScript
- Ant Design 6
- Tailwind CSS 4

## 贡献

欢迎 PR 和 Issue。提交前请确保：

1. 不提交任何包含真实密钥的文件（`.env`、硬编码字符串）
2. 新增接口在 `api/v1/` 下建独立路由文件
3. 新增前端 API 调用统一写入 `src/services/api.ts`
4. Python 代码遵循 PEP 8，TypeScript 开启 strict 模式

## License

MIT
