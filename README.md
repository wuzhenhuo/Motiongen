# WuZhen Studio

AI 动态雕塑工作室 — 吴振 · 明日剧场 · 2026

基于 Tripo3D API 和 HY-Motion 的 3D 模型生成与动作编辑工作站。

## 功能

### 模型生成
- **文字转 3D**：输入文字描述，生成 3D 模型
- **图片转 3D**：上传参考图片，生成对应 3D 模型
- **后处理流水线**（生成完成后可用）：
  - **拆分**：将模型拆分为多个独立部件（`segment_model`）
  - **重拓扑**：导出游戏引擎兼容格式，支持 FBX / OBJ / USDZ / STL，FBX 支持四边形网格（`convert_model`）
  - **纹理生成**：重新生成高清 PBR 纹理贴图（`texture_model`）
  - **动画绑定**：骨骼绑定（Mixamo / Tripo 规格）+ 动画应用，内置 7 种预设动画（`animate_rig` + `animate_retarget`）

### 动作编辑
- 上传本地 GLB / GLTF / FBX 文件预览
- 多轨音乐时间线，支持拖拽排列动作片段
- 3D 预览窗口播放动画

### 动作生成（HY-Motion）
- 接入腾讯 [HY-Motion-1.0](https://huggingface.co/spaces/tencent/HY-Motion-1.0) HuggingFace Space
- 输入文字描述，生成人体动作 BVH / GLB 文件
- Space 休眠时自动重试（最多 3 次，间隔 35 秒倒计时）

## 技术栈

| 层 | 技术 |
|---|---|
| 前端 | React 18 + Vite + Tailwind CSS |
| 3D 渲染 | Three.js + React Three Fiber + @react-three/drei |
| 后端 | Node.js + Express |
| 3D 生成 API | [Tripo3D](https://platform.tripo3d.ai/) |
| 动作生成 | HuggingFace Gradio Space（ZeroGPU） |
| 部署 | EdgeOne Pages（前端静态） + 独立 Node 服务 |

## 快速开始

### 前置条件

- Node.js 18+
- Tripo3D API Key（[获取地址](https://platform.tripo3d.ai/)）
- HuggingFace Token（用于 HY-Motion，需有 ZeroGPU 配额）

### 安装

```bash
# 克隆仓库
git clone <repo-url>
cd 3dmodel_gen

# 安装服务端依赖
cd server && npm install && cd ..

# 安装客户端依赖
cd client && npm install && cd ..
```

### 配置环境变量

```bash
cp server/.env.example server/.env
```

编辑 `server/.env`：

```env
TRIPO_API_KEY=your_tripo_api_key_here
HF_TOKEN=your_huggingface_token_here
PORT=3001
```

### 启动开发服务器

```bash
# 一键启动（推荐）
bash start.sh

# 或分别启动
npm run dev:server   # API 服务，端口 3001
npm run dev:client   # React 前端，端口 5173
```

打开浏览器访问 http://localhost:5173

## 项目结构

```
3dmodel_gen/
├── client/                  # React 前端
│   └── src/
│       ├── components/
│       │   ├── App.jsx          # 主布局，页面切换
│       │   ├── ModelViewer.jsx  # Three.js 3D 预览器
│       │   ├── PostProcessPanel.jsx  # 后处理流水线面板
│       │   ├── HyMotionPage.jsx # HY-Motion 动作生成页
│       │   ├── MusicTimeline.jsx # 动作时间线编辑器
│       │   ├── PromptInput.jsx  # 生成提示词输入
│       │   └── ProgressBar.jsx  # 任务进度条
│       ├── hooks/
│       │   ├── useTaskPolling.js    # 主生成任务轮询
│       │   └── usePipelineTask.js   # 后处理任务轮询
│       └── utils/
│           ├── api.js               # Tripo3D API 封装
│           └── promptOptimizer.js   # 提示词优化
├── server/                  # Node.js 后端
│   ├── index.js             # Express 入口
│   └── routes/
│       ├── tripo.js         # Tripo3D API 代理
│       └── hymotion.js      # HY-Motion Gradio 代理
├── motion/                  # （可选）本地 HY-Motion Python 服务
│   ├── app.py
│   └── requirements.txt
├── edgeone.json             # EdgeOne Pages 部署配置
└── start.sh                 # 开发一键启动脚本
```

## API 说明

服务端代理所有外部 API 请求，前端只需访问本地 `/api/*`：

| 路由 | 说明 |
|---|---|
| `POST /api/tripo/upload-image` | 上传图片，获取 image_token |
| `POST /api/tripo/generate` | 创建文字或图片转 3D 任务 |
| `GET /api/tripo/task/:id` | 查询任务状态与进度 |
| `POST /api/tripo/pipeline` | 运行后处理任务（拆分/重拓扑/纹理/动画） |
| `GET /api/tripo/download` | 代理下载模型文件 |
| `POST /api/hymotion/generate` | 提交 HY-Motion 生成任务 |
| `GET /api/hymotion/result/:id` | 获取 HY-Motion 生成结果 |

## 部署

### EdgeOne Pages（前端）

项目根目录包含 `edgeone.json`，推送到 Git 后 EdgeOne Pages 自动执行：

```json
{
  "build": {
    "command": "npm install --prefix client && npm run build --prefix client",
    "output": "client/dist"
  }
}
```

### 服务端

在任意 Node.js 环境（如云服务器、Railway、Render）运行：

```bash
cd server && npm install && node index.js
```

确保设置环境变量 `TRIPO_API_KEY`、`HF_TOKEN`，以及前端 Vite 代理指向正确的服务端地址。

## 注意事项

- **HY-Motion ZeroGPU 配额**：HuggingFace ZeroGPU 每日有配额限制。配额耗尽时生成会失败，更换有效 `HF_TOKEN` 后即可恢复。
- **Tripo3D API**：生成任务按次计费，请在 Tripo3D 控制台监控用量。
- 上传图片限制为 20MB，支持 JPEG / PNG / WebP 格式。
