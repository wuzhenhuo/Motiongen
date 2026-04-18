# WuZhen Studio

AI辅助编舞 · 混元动作大模型 · by Wu Zhen · 2026

基于腾讯 HY-Motion 的 AI 辅助编舞工作站，支持文字驱动动作生成与多轨时间线编辑，配套 3D 预览器实时回放。

![界面预览](https://github.com/wuzhenhuo/3dmodel_gen/raw/master/docs/preview.png)

---

## 功能

### 动作生成（HY-Motion）
- 接入腾讯 [HY-Motion-1.0](https://huggingface.co/spaces/tencent/HY-Motion-1.0) HuggingFace Space
- 输入中文或英文描述，可选接入 **智谱 AI** 自动将中文提示词改写为专业英文动作描述
- 一键生成 BVH / GLB 动作文件并在线预览（Three.js WebGL 渲染）
- Space 休眠时自动重试（最多 3 次，每次倒计时 35 秒）
- 生成历史记录本地持久化（localStorage），支持一键复现

### 动作编辑
- 上传本地 GLB / GLTF / FBX 动作文件，在 3D 预览窗口实时播放
- **多轨时间线**：动作轨道 + 音乐轨道，鼠标拖拽调整片段位置
- 时间线面板高度可拖拽调整（上方拖柄）
- 点击播放后，3D 预览器按时间线安排自动播放对应动作（mixer scheduling）
- 支持键盘快捷键：`Delete / Backspace` 删除选中轨道，`Ctrl/Cmd+Z` 撤销

### 通用
- RunwayML 风格设计系统，支持**亮色 / 暗色**双主题切换，状态持久化
- 字体：Space Grotesk（界面）+ JetBrains Mono（数值/代码）
- 响应式布局，顶栏标签快速切换页面

---

## 技术栈

| 层 | 技术 |
|---|---|
| 前端 | React 18 + Vite + Tailwind CSS v4 |
| 3D 渲染 | Three.js + React Three Fiber + @react-three/drei |
| 字体 | Space Grotesk + JetBrains Mono（Google Fonts） |
| 后端 | Node.js + Express |
| 动作生成 | HuggingFace Gradio Space（ZeroGPU）|
| 提示词改写 | 智谱 AI GLM API |
| 部署 | EdgeOne Pages（前端静态）+ 独立 Node 服务 |

---

## 快速开始

### 前置条件

- **Node.js 18+**
- **HuggingFace Token**（用于 HY-Motion，需有 ZeroGPU 访问权限，免费申请）
- **智谱 AI API Key**（可选，用于提示词改写，[免费注册](https://open.bigmodel.cn)）

### 1. 克隆仓库

```bash
git clone https://github.com/wuzhenhuo/3dmodel_gen.git
cd 3dmodel_gen
```

### 2. 安装依赖

```bash
# 安装服务端依赖
cd server && npm install && cd ..

# 安装客户端依赖
cd client && npm install && cd ..
```

### 3. 配置环境变量

```bash
cp server/.env.example server/.env
```

编辑 `server/.env`：

```env
# HuggingFace Token（https://huggingface.co/settings/tokens）
HF_TOKEN=hf_your_token_here

# 智谱 AI Key，用于提示词中译英改写（可选，https://open.bigmodel.cn）
ZHIPU_API_KEY=your_zhipu_api_key_here

# 服务端口（默认 3001）
PORT=3001
```

> `HF_TOKEN` 若留空，用户可在页面内手动粘贴 Token 使用。

### 4. 启动开发服务器

```bash
# 一键启动（推荐）
bash start.sh
```

或分别启动：

```bash
npm run dev:server   # API 服务，端口 3001
npm run dev:client   # React 前端，端口 5173
```

打开浏览器访问 **http://localhost:5173**

---

## 使用说明

### 动作生成

1. 切换到顶部「**动作生成**」标签
2. 在左侧输入框输入动作描述（中文或英文均可）
3. 点击「改写提示词」可让 AI 将描述优化为专业英文（需配置 `ZHIPU_API_KEY`）
4. 调整时长、种子、CFG 等参数后点击「**Generate**」
5. 生成完成后可在右侧预览动画，下载 BVH / GLB 文件
6. 历史记录显示在左侧下方，点击可恢复上次生成结果

### 动作编辑

1. 切换到顶部「**动作编辑**」标签
2. 点击控制栏「**上传动作**」，选择 GLB / GLTF / FBX 文件
   - 文件会同时加载到 3D 预览器和时间线
3. 可继续上传多个动作文件，每个文件占一条轨道
4. 点击「**上传音乐**」添加背景音乐轨道（支持常见音频格式）
5. 在时间线中**拖拽轨道块**调整各动作的起始时间
6. 拖动时间线顶部的**拖柄**可调整面板高度
7. 点击 ▶ **播放**，3D 预览器将按时间线顺序播放各动作，音乐同步播放
8. 点击 ■ **停止**归零，Ctrl+Z 撤销上一步操作

---

## 项目结构

```
3dmodel_gen/
├── client/                      # React 前端
│   ├── index.html               # 含 Google Fonts 引用
│   └── src/
│       ├── App.jsx              # 主布局，页面切换（动作生成 | 动作编辑）
│       ├── index.css            # CSS 变量设计系统（亮/暗双主题）
│       ├── components/
│       │   ├── HyMotionPage.jsx # HY-Motion 动作生成页（含历史记录）
│       │   ├── MusicTimeline.jsx# 多轨动作 + 音乐时间线编辑器
│       │   └── ModelViewer.jsx  # Three.js 3D 预览器 + 动作面板
│       └── hooks/
│           └── useTheme.js      # 亮/暗模式持久化（localStorage）
├── server/                      # Node.js 后端
│   ├── index.js                 # Express 入口
│   ├── .env.example             # 环境变量模板
│   └── routes/
│       ├── hymotion.js          # HY-Motion Gradio 代理
│       └── tripo.js             # Tripo3D API 代理（备用）
├── edgeone.json                 # EdgeOne Pages 部署配置
├── start.sh                     # 开发一键启动脚本
└── package.json                 # 根级 npm scripts
```

---

## API 说明

服务端代理外部 API，前端只需访问本地 `/api/*`：

| 路由 | 说明 |
|---|---|
| `GET  /api/health` | 服务健康检查 |
| `POST /api/hymotion/generate` | 提交 HY-Motion 生成任务，返回 `event_id` |
| `GET  /api/hymotion/result/:id` | SSE 流式获取生成结果 |

---

## 部署

### 前端（EdgeOne Pages）

项目根目录包含 `edgeone.json`，推送到 Git 后 EdgeOne Pages 自动构建：

```json
{
  "build": {
    "command": "npm install --prefix client && npm run build --prefix client",
    "output": "client/dist"
  }
}
```

### 服务端

在任意 Node.js 18+ 环境（云服务器、Railway、Render 等）运行：

```bash
cd server
npm install
node index.js
```

记得设置以下环境变量：`HF_TOKEN`、`ZHIPU_API_KEY`（可选）、`PORT`。

---

## 注意事项

- **HY-Motion ZeroGPU 配额**：HuggingFace ZeroGPU 每日有配额限制，耗尽后生成请求会失败。更换有效 `HF_TOKEN` 或等次日重置后恢复。
- **CORS**：服务端已配置 `cors()`，开发时前端通过 Vite proxy 访问后端，生产环境需按实际域名调整。
- **文件大小**：上传图片限制 20MB，动作文件无服务端限制（在浏览器本地解析）。
