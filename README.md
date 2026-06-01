# vLLM Launcher

English | [中文](README_zh.md)

A web-based launcher and manager for [vLLM](https://github.com/vllm-project/vllm) inference servers. Launch, monitor, and manage multiple vLLM instances through a clean, responsive UI.

## Features

- **Multi-instance management** — Create, start, stop, and delete multiple vLLM server instances from one interface
- **Real-time monitoring** — Live throughput charts (prefill/decode), GPU utilization, KV cache usage, and request metrics via WebSocket
- **Chat playground** — Built-in streaming chat interface to test your models directly, with parameter controls (temperature, top-p, max tokens)
- **Model browser** — Scan local directories for HuggingFace and GGUF models, with VRAM feasibility estimation
- **File browser** — Browse the server filesystem to select model paths and Python executables
- **Config presets** — Save and load vLLM configurations as reusable presets
- **Full parameter support** — All vLLM parameters organized in 3 tiers (Common / Performance / Advanced), including quantization, LoRA, speculative decoding, tool calling, and more
- **GPU monitoring** — Real-time GPU stats via nvidia-smi (utilization, VRAM, temperature, power, fan speed)
- **Log viewer** — Live log streaming with search and filter
- **i18n** — English and Chinese (简体中文) interface
- **Process recovery** — Automatically re-attaches to running vLLM processes on backend restart
- **Error detection** — Automatic detection and diagnosis of OOM, port conflicts, NCCL errors, and more

## Prerequisites

- Python 3.10+
- Node.js 18+
- NVIDIA GPU with CUDA and [vLLM](https://docs.vllm.ai/en/latest/getting_started/installation.html) installed
- nvidia-smi (for GPU monitoring and VRAM estimation)

## Quick Start

```bash
git clone https://github.com/tuanlai/vLLM-Launcher.git
cd vLLM-Launcher

# Install backend dependencies
cd backend
pip install -r requirements.txt
cd ..

# Install frontend dependencies
cd frontend
npm install
cd ..

# Launch (auto-detects dev/production mode)
./start.sh
```

The UI will be available at `http://localhost:8001`.

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `VLLM_PYTHON` | (auto-detect) | Path to Python executable in vLLM virtual environment |
| `PORT` | `8001` | Backend server port |
| `VLLM_NO_BROWSER` | (unset) | Set to skip auto-opening browser |

### Manual Start

```bash
# Backend
cd backend
python -m uvicorn main:app --host 0.0.0.0 --port 8001

# Frontend (development)
cd frontend
npm run dev

# Frontend (production build)
cd frontend
npm run build
```

## Usage

1. **Configure Python path** — Go to Settings and set the path to your vLLM Python executable (e.g., `/path/to/venv/bin/python`)
2. **Create an instance** — Go to Instances, click "New Instance", select a model and configure parameters
3. **Monitor** — The Dashboard shows real-time throughput, GPU stats, and server info
4. **Chat** — Use the Playground to interact with your running models
5. **Manage presets** — Save frequently used configurations as presets for quick reuse

## Project Structure

```
vllm-launcher/
├── backend/
│   ├── main.py                 # FastAPI entry point
│   ├── instance_manager.py     # Multi-instance process lifecycle
│   ├── model_scanner.py        # Local model discovery (HF + GGUF)
│   ├── vram_checker.py         # GPU VRAM estimation via nvidia-smi
│   ├── config_store.py         # Preset and settings persistence
│   ├── metrics_scraper.py      # Prometheus metrics scraping
│   ├── log_parser.py           # Log parsing and error detection
│   ├── websocket_manager.py    # WebSocket connection management
│   ├── schemas.py              # Pydantic request/response models
│   ├── routes/                 # API route modules
│   │   ├── instances.py        # Instance CRUD and lifecycle
│   │   ├── chat.py             # Chat completion proxy (streaming)
│   │   ├── models.py           # Model scanning and VRAM check
│   │   ├── settings.py         # Settings, presets, version
│   │   ├── gpu.py              # GPU monitoring
│   │   ├── files.py            # File browser
│   │   └── ws.py               # WebSocket endpoints
│   └── tests/                  # Backend test suite
├── frontend/
│   ├── src/
│   │   ├── pages/              # Route pages (Dashboard, Instances, etc.)
│   │   ├── components/         # Reusable UI components
│   │   ├── api/                # API client and WebSocket hooks
│   │   └── i18n/               # Internationalization (en, zh)
│   └── dist/                   # Production build output
├── start.sh                    # One-command launcher
├── DESIGN.md                   # Design system specification
├── pyproject.toml              # Python project metadata
└── LICENSE                     # MIT License
```

## API Overview

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/instances` | GET/POST | List or create instances |
| `/api/instances/{id}/start` | POST | Start an instance |
| `/api/instances/{id}/stop` | POST | Stop an instance |
| `/api/instances/{id}` | DELETE | Delete an instance |
| `/api/chat/{id}` | POST | Chat completion (non-streaming) |
| `/api/chat/{id}/stream` | POST | Chat completion (SSE streaming) |
| `/api/models/scan` | GET | Scan directory for models |
| `/api/models/vram-check` | GET | Estimate VRAM requirements |
| `/api/gpu` | GET | GPU stats from nvidia-smi |
| `/api/presets` | GET/POST/DELETE | Preset CRUD |
| `/api/settings` | GET/POST | Application settings |
| `/api/files/browse` | GET | Browse server filesystem |
| `/api/version` | GET | vLLM version info |
| `/ws/{id}` | WebSocket | Real-time logs and metrics |

## Development

```bash
# Backend tests
cd backend
python -m pytest tests/ -v

# Frontend type check
cd frontend
npx tsc --noEmit

# Frontend tests
cd frontend
npx vitest run
```

## Tech Stack

- **Backend**: Python, FastAPI, asyncio, httpx, psutil
- **Frontend**: React 19, TypeScript, Vite, ECharts, Framer Motion
- **Communication**: REST API, WebSocket, SSE (Server-Sent Events)

## License

[MIT](LICENSE)
