# vLLM Launcher

[English](README.md) | 中文

基于 Web 的 [vLLM](https://github.com/vllm-project/vllm) 推理服务器启动器和管理器。通过简洁的界面启动、监控和管理多个 vLLM 实例。
![image](https://github.com/tuanlai/vLLM-Launcher/blob/master/screenshot.png)
## 功能特性

- **多实例管理** — 在一个界面中创建、启动、停止和删除多个 vLLM 服务实例
- **实时监控** — 吞吐量图表（prefill/decode）、GPU 利用率、KV 缓存使用率、请求指标（WebSocket 实时推送）
- **聊天测试台** — 内置流式聊天界面，支持 temperature、top-p、max tokens 等参数调节
- **模型浏览** — 扫描本地目录发现 HuggingFace 和 GGUF 模型，附带显存预估
- **文件浏览器** — 浏览服务器文件系统，选择模型路径和 Python 可执行文件
- **配置预设** — 保存和加载 vLLM 配置为可复用的预设
- **完整参数支持** — 所有 vLLM 参数按 3 级组织（常用 / 性能调优 / 高级），包括量化、LoRA、推测解码、工具调用等
- **GPU 监控** — 通过 nvidia-smi 实时获取 GPU 状态（利用率、显存、温度、功耗、风扇转速）
- **日志查看器** — 实时日志流，支持搜索和过滤
- **国际化** — 支持英文和中文界面
- **进程恢复** — 后端重启时自动重新关联正在运行的 vLLM 进程
- **错误检测** — 自动检测和诊断 OOM、端口冲突、NCCL 错误等

## 环境要求

- Python 3.10+
- Node.js 18+
- NVIDIA GPU，已安装 CUDA 和 [vLLM](https://docs.vllm.ai/en/latest/getting_started/installation.html)
- nvidia-smi（用于 GPU 监控和显存预估）

## 快速开始

```bash
git clone https://github.com/tuanlai/vLLM-Launcher.git
cd vLLM-Launcher

# 安装后端依赖
cd backend
pip install -r requirements.txt
cd ..

# 安装前端依赖
cd frontend
npm install
cd ..

# 启动（自动检测开发/生产模式）
./start.sh
```

访问 `http://localhost:8001` 即可使用。

### 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `VLLM_PYTHON` | （自动检测） | vLLM 虚拟环境中 Python 可执行文件的路径 |
| `PORT` | `8001` | 后端服务端口 |
| `VLLM_NO_BROWSER` | （未设置） | 设置后跳过自动打开浏览器 |

### 手动启动

```bash
# 后端
cd backend
python -m uvicorn main:app --host 0.0.0.0 --port 8001

# 前端（开发模式）
cd frontend
npm run dev

# 前端（生产构建）
cd frontend
npm run build
```

## 使用方法

1. **配置 Python 路径** — 进入设置页面，设置 vLLM Python 可执行文件路径（如 `/path/to/venv/bin/python`）
2. **创建实例** — 进入实例页面，点击"新建实例"，选择模型并配置参数
3. **监控** — 仪表盘实时显示吞吐量、GPU 状态和服务信息
4. **聊天** — 使用测试台与运行中的模型交互
5. **管理预设** — 将常用配置保存为预设，快速复用

## 项目结构

```
vLLM-Launcher/
├── backend/
│   ├── main.py                 # FastAPI 入口
│   ├── instance_manager.py     # 多实例进程生命周期管理
│   ├── model_scanner.py        # 本地模型发现（HF + GGUF）
│   ├── vram_checker.py         # 通过 nvidia-smi 预估显存
│   ├── config_store.py         # 预设和设置持久化
│   ├── metrics_scraper.py      # Prometheus 指标采集
│   ├── log_parser.py           # 日志解析和错误检测
│   ├── websocket_manager.py    # WebSocket 连接管理
│   ├── schemas.py              # Pydantic 请求/响应模型
│   ├── routes/                 # API 路由模块
│   │   ├── instances.py        # 实例 CRUD 和生命周期
│   │   ├── chat.py             # 聊天补全代理（流式）
│   │   ├── models.py           # 模型扫描和显存检查
│   │   ├── settings.py         # 设置、预设、版本
│   │   ├── gpu.py              # GPU 监控
│   │   ├── files.py            # 文件浏览器
│   │   └── ws.py               # WebSocket 端点
│   └── tests/                  # 后端测试套件
├── frontend/
│   ├── src/
│   │   ├── pages/              # 页面（仪表盘、实例等）
│   │   ├── components/         # 可复用 UI 组件
│   │   ├── api/                # API 客户端和 WebSocket hooks
│   │   └── i18n/               # 国际化（英文、中文）
│   └── dist/                   # 生产构建输出
├── start.sh                    # 一键启动脚本
├── DESIGN.md                   # 设计规范
├── pyproject.toml              # Python 项目元数据
└── LICENSE                     # MIT 许可证
```

## API 概览

| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/instances` | GET/POST | 列出或创建实例 |
| `/api/instances/{id}/start` | POST | 启动实例 |
| `/api/instances/{id}/stop` | POST | 停止实例 |
| `/api/instances/{id}` | DELETE | 删除实例 |
| `/api/chat/{id}` | POST | 聊天补全（非流式） |
| `/api/chat/{id}/stream` | POST | 聊天补全（SSE 流式） |
| `/api/models/scan` | GET | 扫描目录中的模型 |
| `/api/models/vram-check` | GET | 预估显存需求 |
| `/api/gpu` | GET | nvidia-smi GPU 状态 |
| `/api/presets` | GET/POST/DELETE | 预设 CRUD |
| `/api/settings` | GET/POST | 应用设置 |
| `/api/files/browse` | GET | 浏览服务器文件系统 |
| `/api/version` | GET | vLLM 版本信息 |
| `/ws/{id}` | WebSocket | 实时日志和指标 |

## 开发

```bash
# 后端测试
cd backend
python -m pytest tests/ -v

# 前端类型检查
cd frontend
npx tsc --noEmit

# 前端测试
cd frontend
npx vitest run
```

## 技术栈

- **后端**: Python, FastAPI, asyncio, httpx, psutil
- **前端**: React 19, TypeScript, Vite, ECharts, Framer Motion
- **通信**: REST API, WebSocket, SSE（Server-Sent Events）

## 许可证

[MIT](LICENSE)
