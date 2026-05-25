# vLLM Launcher Redesign — Design Spec

## Context

Personal development tool for launching and monitoring vLLM inference servers on a single machine with an RTX PRO 6000 Blackwell (98GB VRAM). The current implementation uses a dark theme (VoltAgent-inspired) but the user prefers an Ollama-style minimal white aesthetic. The redesign also adds multi-instance management, local model scanning, VRAM pre-checking, config presets, and an API playground.

## Requirements

### Functional
1. **Multi-instance management** — launch multiple vLLM processes on different ports, each with independent config/logs/metrics
2. **Local model scanning** — auto-scan `/home/tuanlai/Models/` for HF directories and GGUF files
3. **VRAM pre-check** — before launch, estimate model VRAM usage and warn if insufficient
4. **Config presets** — save/load/delete named parameter combinations, persisted to `~/.config/vllm-launcher/presets.json`
5. **API playground** — send test requests to any running instance, view responses and latency
6. **Complete vLLM parameters** — all 100+ engine args organized in 3 tiers (common/performance/advanced) with an always-visible "Active Parameters" panel
7. **Real-time monitoring** — throughput gauges (prefill/decode), log streaming, GPU usage
8. **Error handling** — detect OOM, port conflicts, model errors with remediation suggestions

### Non-functional
- Single-user, no auth needed
- Python 3.12, venv at `/home/tuanlai/env/vllm/.venv`
- Responsive but primarily desktop use

## Design Language

Reference: Ollama's minimal white style

### Colors
| Token | Hex | Usage |
|-------|-----|-------|
| canvas | #ffffff | Page background |
| surface-soft | #fafafa | Code blocks, log viewer |
| primary | #000000 | CTAs, headlines |
| body | #737373 | Paragraph text |
| mute | #a3a3a3 | Captions, placeholders |
| hairline | #e5e5e5 | Card borders, dividers |
| success | #10b981 | Running status |
| error | #ef4444 | Error states |
| warning | #f59e0b | Starting state |
| terminal-red | #ff5f56 | Terminal traffic light |
| terminal-yellow | #ffbd2e | Terminal traffic light |
| terminal-green | #27c93f | Terminal traffic light |

### Typography
- Headings: system-ui sans, weight 500-600
- Body: system-ui sans, weight 400, 16px
- Code/metrics: ui-monospace (JetBrains Mono fallback)
- All-caps labels: 12px, weight 500, letter-spacing 0.5px

### Shapes
- Buttons: pill (border-radius 9999px)
- Cards: 12px border-radius, 1px hairline border, no shadows
- Inputs: pill or 6px radius

### Spacing
- Section gap: 88px
- Card padding: 24-32px
- Component gap: 8-12px
- Max content width: 960px (cards), 720px (text)

## Architecture

```
vllm-launcher/
├── backend/
│   ├── main.py              # FastAPI app, routes, WebSocket
│   ├── instance_manager.py  # Multi-instance process pool
│   ├── model_scanner.py     # Local model discovery
│   ├── vram_checker.py      # GPU VRAM checking + estimation
│   ├── config_store.py      # Preset persistence
│   ├── log_parser.py        # vLLM output parsing
│   ├── error_detector.py    # Error pattern matching
│   └── requirements.txt
├── frontend/
│   └── src/
│       ├── api/websocket.ts
│       ├── components/
│       │   ├── Sidebar.tsx
│       │   ├── StatusBadge.tsx
│       │   ├── AnimatedGauge.tsx
│       │   ├── LogViewer.tsx
│       │   ├── ConfigForm.tsx      # Refactored: 3-tier params + active panel
│       │   ├── ModelSelector.tsx   # New: scan + dropdown
│       │   ├── VRAMIndicator.tsx   # New: pre-check display
│       │   ├── PresetManager.tsx   # New: save/load/delete
│       │   ├── InstanceCard.tsx    # New: instance list item
│       │   └── APIPlayground.tsx   # New: request tester
│       └── pages/
│           ├── Dashboard.tsx       # Single instance monitoring
│           ├── Instances.tsx       # Multi-instance management
│           ├── Logs.tsx
│           ├── Playground.tsx      # API testing
│           └── Settings.tsx        # Launch config
└── DESIGN.md
```

### Backend: InstanceManager

Replaces the single-process `VLLMProcessManager` with a pool:

```python
class InstanceManager:
    _instances: dict[str, Instance]  # uuid → Instance

    async def create(config: VLLMConfig) -> str  # returns instance_id
    async def stop(instance_id: str)
    async def restart(instance_id: str)
    def get(instance_id: str) -> Instance
    def list_all() -> list[Instance]
    def next_port() -> int  # auto-allocate starting from 8000
```

Each `Instance` holds its own process, log buffer, metrics, and state.

### Backend: ModelScanner

```python
class ModelScanner:
    async def scan(directory: str) -> list[ModelInfo]
    # Detects:
    #   - HF directories (contains config.json + safetensors/bin)
    #   - GGUF files (*.gguf)
    # Returns: name, path, size_gb, format, param_count
```

### Backend: VRAMChecker

```python
class VRAMChecker:
    def get_gpus() -> list[GPUInfo]  # nvidia-smi parsing
    def estimate_vram(model_path: str) -> float  # GB
    def check(model_path: str, tp_size: int) -> VRAMCheck
    # VRAMCheck: feasible, estimated_gb, available_gb, suggestion
```

Estimation heuristic: param_count × bytes_per_param (varies by dtype/quantization), plus ~20% overhead for KV cache.

### Backend: ConfigStore

```python
class ConfigStore:
    def __init__(self, path: str = "~/.config/vllm-launcher/presets.json")
    def save(name: str, config: dict)
    def load(name: str) -> dict
    def list_all() -> list[dict]
    def delete(name: str)
```

### Frontend: ConfigForm (refactored)

Three collapsible tiers + always-visible Active Parameters panel:

```
┌─────────────────────────────────────────────┐
│  Active Parameters                    [Copy] │
│  ┌─────────────────────────────────────────┐ │
│  │ python -m vllm.entrypoints.openai...    │ │
│  │   --model /home/tuanlai/Models/Qwen/.. │ │
│  │   --port 8000                           │ │
│  │   --tensor-parallel-size 2              │ │
│  │   --gpu-memory-utilization 0.9          │ │
│  └─────────────────────────────────────────┘ │
├─────────────────────────────────────────────┤
│  ▼ Common Parameters                        │
│    model: [dropdown ▼]  port: [8000]        │
│    tp_size: [===●===] 2  gpu_mem: [===●=]   │
│    ...                                      │
├─────────────────────────────────────────────┤
│  ▶ Performance Tuning                       │
├─────────────────────────────────────────────┤
│  ▶ Advanced (LoRA, Multi-modal, Dist, ...)  │
├─────────────────────────────────────────────┤
│  ▶ Extra Arguments                          │
│    [--trust-remote-code --enforce-eager ]   │
└─────────────────────────────────────────────┘
```

### Frontend: ModelSelector

- On mount, calls `/api/models/scan?path=/home/tuanlai/Models`
- Displays dropdown grouped by directory (Qwen/, deepseek-ai/, etc.)
- Shows size and format next to each model
- "Refresh" button to re-scan
- Manual input fallback

### Frontend: VRAMIndicator

- Appears below model selector
- Shows: "Estimated: 42.3 GB / 98 GB (43%)" with a progress bar
- Color: green (< 75%), yellow (75-90%), red (> 90%)
- If insufficient: "Warning: Model may exceed available VRAM. Consider quantization."

### Frontend: Instances Page

```
┌─────────────────────────────────────────────┐
│  Instances                        [+ New]   │
├─────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────┐│
│  │ ● Running    Qwen2.5-72B   :8000       ││
│  │ Prefill: 1234 tok/s  Decode: 45 tok/s  ││
│  │ [Logs] [Stop] [Restart]                 ││
│  └─────────────────────────────────────────┘│
│  ┌─────────────────────────────────────────┐│
│  │ ○ Idle       Llama-3-8B    :8001       ││
│  │ [Start] [Configure] [Delete]            ││
│  └─────────────────────────────────────────┘│
└─────────────────────────────────────────────┘
```

### Frontend: Playground Page

```
┌─────────────────────────────────────────────┐
│  API Playground                             │
│  Instance: [Qwen2.5-72B @ :8000 ▼]         │
├─────────────────────────────────────────────┤
│  Messages                                   │
│  ┌─────────────────────────────────────────┐│
│  │ system: You are a helpful assistant.    ││
│  │ user: Hello!                            ││
│  └─────────────────────────────────────────┘│
│  max_tokens: [256]  temperature: [0.7]      │
│  [Send]                                     │
├─────────────────────────────────────────────┤
│  Response                    Latency: 1.2s  │
│  ┌─────────────────────────────────────────┐│
│  │ Hello! How can I help you today?        ││
│  │                                         ││
│  │ Tokens: 12 (prompt: 8, completion: 4)   ││
│  └─────────────────────────────────────────┘│
└─────────────────────────────────────────────┘
```

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/instances` | Create and start a new instance |
| GET | `/api/instances` | List all instances |
| GET | `/api/instances/{id}` | Get instance status |
| POST | `/api/instances/{id}/stop` | Stop instance |
| POST | `/api/instances/{id}/restart` | Restart instance |
| DELETE | `/api/instances/{id}` | Delete instance |
| GET | `/api/models/scan` | Scan directory for models |
| GET | `/api/models/vram-check` | Check VRAM feasibility |
| GET | `/api/presets` | List presets |
| POST | `/api/presets` | Save preset |
| DELETE | `/api/presets/{name}` | Delete preset |
| POST | `/api/chat/{instance_id}` | Proxy chat completion request |
| GET | `/api/gpu` | Get GPU info |
| WS | `/ws/{instance_id}` | Real-time logs + metrics |

## Error Handling

Same error detection patterns as current implementation, plus:
- VRAM pre-check prevents launching models that won't fit
- Port auto-allocation prevents conflicts
- Instance isolation prevents one crash from affecting others

## Implementation Order

1. Refactor backend: InstanceManager (multi-instance)
2. Add ModelScanner + VRAMChecker
3. Add ConfigStore
4. Refactor frontend: Ollama white theme (CSS variables rewrite)
5. Refactor ConfigForm: 3-tier params + active panel
6. Add ModelSelector + VRAMIndicator components
7. Add Instances page
8. Add Playground page
9. Wire WebSocket to multi-instance
10. Testing + polish
