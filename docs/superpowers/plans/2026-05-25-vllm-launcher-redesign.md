# vLLM Launcher Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor vLLM Launcher from a single-instance dark-themed app into a multi-instance, Ollama-style white-themed launcher with model scanning, VRAM pre-check, config presets, and API playground.

**Architecture:** FastAPI backend manages a pool of vLLM subprocess instances. React frontend provides a minimal white UI with real-time monitoring via WebSocket. Model scanner discovers local models, VRAM checker estimates GPU usage before launch.

**Tech Stack:** Python 3.12, FastAPI, asyncio subprocess, React 18, TypeScript, Vite, Framer Motion, ECharts, react-router-dom

---

## File Map

### Backend (create/modify)
| File | Action | Purpose |
|------|--------|---------|
| `backend/instance_manager.py` | Create | Multi-instance process pool (replaces process_manager.py) |
| `backend/model_scanner.py` | Create | Scan local model directories |
| `backend/vram_checker.py` | Create | GPU VRAM info + model estimation |
| `backend/config_store.py` | Create | Preset save/load/delete to JSON |
| `backend/log_parser.py` | Keep | No changes needed |
| `backend/error_detector.py` | Keep | No changes needed |
| `backend/main.py` | Rewrite | New routes for all features |
| `backend/tests/test_instance_manager.py` | Create | TDD tests |
| `backend/tests/test_model_scanner.py` | Create | TDD tests |
| `backend/tests/test_vram_checker.py` | Create | TDD tests |
| `backend/tests/test_config_store.py` | Create | TDD tests |

### Frontend (create/modify)
| File | Action | Purpose |
|------|--------|---------|
| `frontend/src/App.css` | Rewrite | Ollama white theme tokens |
| `frontend/src/App.tsx` | Modify | Add new routes |
| `frontend/src/api/websocket.ts` | Rewrite | Multi-instance WebSocket |
| `frontend/src/components/Sidebar.tsx` | Rewrite | White theme + new nav items |
| `frontend/src/components/StatusBadge.tsx` | Rewrite | White theme |
| `frontend/src/components/AnimatedGauge.tsx` | Rewrite | White theme, simpler design |
| `frontend/src/components/LogViewer.tsx` | Rewrite | Light terminal style |
| `frontend/src/components/ConfigForm.tsx` | Rewrite | 3-tier params + active panel |
| `frontend/src/components/ModelSelector.tsx` | Create | Model dropdown with scan |
| `frontend/src/components/VRAMIndicator.tsx` | Create | VRAM usage display |
| `frontend/src/components/PresetManager.tsx` | Create | Save/load/delete presets |
| `frontend/src/components/InstanceCard.tsx` | Create | Instance list item |
| `frontend/src/components/APIPlayground.tsx` | Create | Chat completion tester |
| `frontend/src/pages/Dashboard.tsx` | Rewrite | White theme single-instance |
| `frontend/src/pages/Instances.tsx` | Create | Multi-instance management |
| `frontend/src/pages/Logs.tsx` | Modify | White theme |
| `frontend/src/pages/Playground.tsx` | Create | API testing page |
| `frontend/src/pages/Settings.tsx` | Modify | New config form |

---

## Task 1: InstanceManager — Multi-instance backend

**Files:**
- Create: `backend/instance_manager.py`
- Create: `backend/tests/test_instance_manager.py`

### Step 1: Write failing tests

```python
# backend/tests/test_instance_manager.py
import pytest
import asyncio
from instance_manager import InstanceManager, VLLMConfig, ProcessState

@pytest.fixture
def manager():
    return InstanceManager(python_path="/usr/bin/python3")

def test_create_instance(manager):
    instance_id = manager.create(VLLMConfig(model="test-model"))
    assert instance_id is not None
    assert len(instance_id) == 8  # short uuid

def test_list_instances(manager):
    id1 = manager.create(VLLMConfig(model="model-a"))
    id2 = manager.create(VLLMConfig(model="model-b"))
    instances = manager.list_all()
    assert len(instances) == 2
    models = [i.config.model for i in instances]
    assert "model-a" in models
    assert "model-b" in models

def test_get_instance(manager):
    instance_id = manager.create(VLLMConfig(model="test"))
    inst = manager.get(instance_id)
    assert inst.config.model == "test"
    assert inst.state == ProcessState.IDLE

def test_auto_port_allocation(manager):
    id1 = manager.create(VLLMConfig(model="a"))
    id2 = manager.create(VLLMConfig(model="b"))
    inst1 = manager.get(id1)
    inst2 = manager.get(id2)
    assert inst2.config.port == inst1.config.port + 1

def test_remove_instance(manager):
    instance_id = manager.create(VLLMConfig(model="test"))
    manager.remove(instance_id)
    assert len(manager.list_all()) == 0

def test_get_nonexistent_raises(manager):
    with pytest.raises(KeyError):
        manager.get("nonexistent")
```

### Step 2: Run tests to verify they fail

```bash
cd /home/tuanlai/vllm-launcher/backend && python -m pytest tests/test_instance_manager.py -v
```

Expected: FAIL — `ModuleNotFoundError: No module named 'instance_manager'`

### Step 3: Implement InstanceManager

```python
# backend/instance_manager.py
import asyncio
import os
import signal
import uuid
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import Optional


class ProcessState(str, Enum):
    IDLE = "idle"
    STARTING = "starting"
    RUNNING = "running"
    STOPPING = "stopping"
    STOPPED = "stopped"
    ERROR = "error"


@dataclass
class VLLMConfig:
    model: str = ""
    tensor_parallel_size: int = 1
    port: int = 8000
    host: str = "0.0.0.0"
    gpu_memory_utilization: float = 0.9
    max_model_len: Optional[int] = None
    quantization: Optional[str] = None
    dtype: Optional[str] = None
    trust_remote_code: bool = False
    enforce_eager: bool = False
    seed: Optional[int] = None
    max_num_seqs: Optional[int] = None
    max_num_batched_tokens: Optional[int] = None
    swap_space: int = 4
    block_size: Optional[int] = None
    enable_prefix_caching: Optional[bool] = None
    disable_log_stats: bool = False
    load_format: str = "auto"
    extra_args: str = ""

    def to_command(self, python_path: str = "python") -> list[str]:
        cmd = [python_path, "-m", "vllm.entrypoints.openai.api_server",
               "--model", self.model,
               "--port", str(self.port),
               "--host", self.host]
        if self.tensor_parallel_size != 1:
            cmd += ["--tensor-parallel-size", str(self.tensor_parallel_size)]
        if self.gpu_memory_utilization != 0.9:
            cmd += ["--gpu-memory-utilization", str(self.gpu_memory_utilization)]
        if self.max_model_len:
            cmd += ["--max-model-len", str(self.max_model_len)]
        if self.quantization:
            cmd += ["--quantization", self.quantization]
        if self.dtype and self.dtype != "auto":
            cmd += ["--dtype", self.dtype]
        if self.trust_remote_code:
            cmd += ["--trust-remote-code"]
        if self.enforce_eager:
            cmd += ["--enforce-eager"]
        if self.seed is not None:
            cmd += ["--seed", str(self.seed)]
        if self.max_num_seqs:
            cmd += ["--max-num-seqs", str(self.max_num_seqs)]
        if self.max_num_batched_tokens:
            cmd += ["--max-num-batched-tokens", str(self.max_num_batched_tokens)]
        if self.swap_space != 4:
            cmd += ["--swap-space", str(self.swap_space)]
        if self.block_size:
            cmd += ["--block-size", str(self.block_size)]
        if self.enable_prefix_caching is not None:
            if self.enable_prefix_caching:
                cmd += ["--enable-prefix-caching"]
            else:
                cmd += ["--no-enable-prefix-caching"]
        if self.disable_log_stats:
            cmd += ["--disable-log-stats"]
        if self.load_format != "auto":
            cmd += ["--load-format", self.load_format]
        if self.extra_args.strip():
            cmd += self.extra_args.strip().split()
        return cmd


@dataclass
class MetricsSnapshot:
    timestamp: float = 0.0
    prefill_throughput: float = 0.0
    decode_throughput: float = 0.0
    total_tokens: int = 0
    requests_active: int = 0
    requests_waiting: int = 0
    gpu_cache_usage: float = 0.0


@dataclass
class Instance:
    id: str
    config: VLLMConfig
    state: ProcessState = ProcessState.IDLE
    pid: Optional[int] = None
    start_time: Optional[datetime] = None
    metrics: MetricsSnapshot = field(default_factory=MetricsSnapshot)
    last_error: Optional[str] = None
    model_loaded: bool = False
    load_time: Optional[float] = None
    _process: Optional[asyncio.subprocess.Process] = field(default=None, repr=False)
    _log_callbacks: list = field(default_factory=list, repr=False)

    def get_status(self) -> dict:
        return {
            "id": self.id,
            "state": self.state.value,
            "pid": self.pid,
            "start_time": self.start_time.isoformat() if self.start_time else None,
            "model": self.config.model,
            "port": self.config.port,
            "model_loaded": self.model_loaded,
            "load_time": self.load_time,
            "last_error": self.last_error,
            "metrics": {
                "prefill_throughput": self.metrics.prefill_throughput,
                "decode_throughput": self.metrics.decode_throughput,
                "total_tokens": self.metrics.total_tokens,
                "requests_active": self.metrics.requests_active,
                "requests_waiting": self.metrics.requests_waiting,
                "gpu_cache_usage": self.metrics.gpu_cache_usage,
                "timestamp": self.metrics.timestamp,
            },
            "config": {
                "model": self.config.model,
                "tensor_parallel_size": self.config.tensor_parallel_size,
                "port": self.config.port,
                "gpu_memory_utilization": self.config.gpu_memory_utilization,
                "max_model_len": self.config.max_model_len,
                "quantization": self.config.quantization,
                "dtype": self.config.dtype,
            },
        }


DEFAULT_VENV_PYTHON = "/home/tuanlai/env/vllm/.venv/bin/python"


class InstanceManager:
    def __init__(self, python_path: str = DEFAULT_VENV_PYTHON):
        self._instances: dict[str, Instance] = {}
        self._python_path = python_path
        self._next_port = 8000

    def create(self, config: VLLMConfig) -> str:
        instance_id = uuid.uuid4().hex[:8]
        if config.port == 8000:
            config.port = self._next_port
        self._next_port = config.port + 1
        instance = Instance(id=instance_id, config=config)
        self._instances[instance_id] = instance
        return instance_id

    def get(self, instance_id: str) -> Instance:
        if instance_id not in self._instances:
            raise KeyError(f"Instance {instance_id} not found")
        return self._instances[instance_id]

    def list_all(self) -> list[Instance]:
        return list(self._instances.values())

    def remove(self, instance_id: str):
        self._instances.pop(instance_id, None)

    async def start(self, instance_id: str) -> bool:
        inst = self.get(instance_id)
        if inst.state in (ProcessState.STARTING, ProcessState.RUNNING):
            return False

        inst.state = ProcessState.STARTING
        inst.start_time = datetime.now()
        cmd = inst.config.to_command(self._python_path)

        try:
            inst._process = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.STDOUT,
                env={**os.environ, "PYTHONUNBUFFERED": "1"},
            )
            inst.pid = inst._process.pid
            asyncio.create_task(self._read_output(instance_id))
            asyncio.create_task(self._monitor_process(instance_id))
            return True
        except FileNotFoundError:
            inst.state = ProcessState.ERROR
            inst.last_error = "vLLM command not found"
            return False
        except Exception as e:
            inst.state = ProcessState.ERROR
            inst.last_error = str(e)
            return False

    async def stop(self, instance_id: str):
        inst = self.get(instance_id)
        if inst._process is None or inst.state not in (ProcessState.STARTING, ProcessState.RUNNING):
            return

        inst.state = ProcessState.STOPPING
        try:
            inst._process.send_signal(signal.SIGTERM)
            try:
                await asyncio.wait_for(inst._process.wait(), timeout=10.0)
            except asyncio.TimeoutError:
                inst._process.kill()
                await inst._process.wait()
        except ProcessLookupError:
            pass

        inst.state = ProcessState.STOPPED
        inst.pid = None
        inst._process = None

    async def _read_output(self, instance_id: str):
        inst = self._instances.get(instance_id)
        if inst is None or inst._process is None or inst._process.stdout is None:
            return
        async for line_bytes in inst._process.stdout:
            line = line_bytes.decode("utf-8", errors="replace").rstrip("\n")
            for cb in inst._log_callbacks:
                await cb(instance_id, line, "stdout")

    async def _monitor_process(self, instance_id: str):
        inst = self._instances.get(instance_id)
        if inst is None or inst._process is None:
            return
        returncode = await inst._process.wait()
        if inst.state == ProcessState.STOPPING:
            return
        if returncode != 0:
            inst.state = ProcessState.ERROR
            inst.last_error = f"Process exited with code {returncode}"
        else:
            inst.state = ProcessState.STOPPED
        inst.pid = None
        inst._process = None
```

### Step 4: Run tests to verify they pass

```bash
cd /home/tuanlai/vllm-launcher/backend && python -m pytest tests/test_instance_manager.py -v
```

Expected: All 5 tests PASS.

### Step 5: Commit

```bash
git add backend/instance_manager.py backend/tests/test_instance_manager.py
git commit -m "feat: add InstanceManager for multi-instance vLLM process pool"
```

---

## Task 2: ModelScanner — Local model discovery

**Files:**
- Create: `backend/model_scanner.py`
- Create: `backend/tests/test_model_scanner.py`

### Step 1: Write failing tests

```python
# backend/tests/test_model_scanner.py
import pytest
import tempfile
import json
import os
from model_scanner import ModelScanner

@pytest.fixture
def model_dir(tmp_path):
    # Create a fake HF model directory
    hf_model = tmp_path / "Qwen" / "Qwen2.5-7B"
    hf_model.mkdir(parents=True)
    (hf_model / "config.json").write_text('{"model_type": "qwen2"}')
    (hf_model / "model.safetensors").write_bytes(b'\x00' * 1024)
    (hf_model / "tokenizer.json").write_text('{}')

    # Create a GGUF file
    gguf_dir = tmp_path / "GGUF"
    gguf_dir.mkdir()
    (gguf_dir / "model-Q4_K_M.gguf").write_bytes(b'\x00' * 2048)

    # Create a non-model directory
    (tmp_path / "not-a-model").mkdir()
    (tmp_path / "not-a-model" / "readme.txt").write_text("just a file")

    return tmp_path

@pytest.mark.asyncio
async def test_scan_finds_hf_models(model_dir):
    scanner = ModelScanner()
    results = await scanner.scan(str(model_dir))
    hf_models = [r for r in results if r.format == "hf"]
    assert len(hf_models) >= 1
    assert any("Qwen2.5-7B" in r.name for r in hf_models)

@pytest.mark.asyncio
async def test_scan_finds_gguf(model_dir):
    scanner = ModelScanner()
    results = await scanner.scan(str(model_dir))
    gguf_models = [r for r in results if r.format == "gguf"]
    assert len(gguf_models) >= 1

@pytest.mark.asyncio
async def test_scan_skips_non_model_dirs(model_dir):
    scanner = ModelScanner()
    results = await scanner.scan(str(model_dir))
    names = [r.name for r in results]
    assert "not-a-model" not in names

@pytest.mark.asyncio
async def test_scan_returns_size(model_dir):
    scanner = ModelScanner()
    results = await scanner.scan(str(model_dir))
    for r in results:
        assert r.size_gb >= 0
```

### Step 2: Run tests to verify they fail

```bash
cd /home/tuanlai/vllm-launcher/backend && python -m pytest tests/test_model_scanner.py -v
```

Expected: FAIL — `ModuleNotFoundError`

### Step 3: Implement ModelScanner

```python
# backend/model_scanner.py
import json
import os
from dataclasses import dataclass
from pathlib import Path


@dataclass
class ModelInfo:
    name: str
    path: str
    size_gb: float
    format: str  # "hf" or "gguf"
    param_count: Optional[str] = None  # e.g. "7B", "72B"


class ModelScanner:
    async def scan(self, directory: str) -> list[ModelInfo]:
        results = []
        base = Path(directory)
        if not base.exists():
            return results

        for item in sorted(base.rglob("*")):
            if item.is_dir():
                config_path = item / "config.json"
                if config_path.exists():
                    model_info = self._parse_hf_model(item)
                    if model_info:
                        results.append(model_info)
            elif item.suffix == ".gguf":
                results.append(ModelInfo(
                    name=item.stem,
                    path=str(item),
                    size_gb=item.stat().st_size / (1024**3),
                    format="gguf",
                ))

        return results

    def _parse_hf_model(self, directory: Path) -> Optional[ModelInfo]:
        config_path = directory / "config.json"
        try:
            config = json.loads(config_path.read_text())
        except (json.JSONDecodeError, OSError):
            return None

        # Check for model weight files
        has_weights = False
        for f in directory.iterdir():
            if f.suffix in (".safetensors", ".bin") or f.name.startswith("model"):
                has_weights = True
                break
        if not has_weights:
            return None

        # Calculate total size
        size_bytes = sum(f.stat().st_size for f in directory.rglob("*") if f.is_file())
        size_gb = size_bytes / (1024**3)

        # Try to extract param count from config
        param_count = None
        if "num_hidden_layers" in config and "hidden_size" in config:
            # Rough estimation
            layers = config.get("num_hidden_layers", 0)
            hidden = config.get("hidden_size", 0)
            if layers > 0 and hidden > 0:
                param_count = f"~{layers}L/{hidden}H"

        name = directory.name
        # Use parent dir as prefix if it's not the root
        parent_name = directory.parent.name
        if parent_name and parent_name != directory.name:
            name = f"{parent_name}/{directory.name}"

        return ModelInfo(
            name=name,
            path=str(directory),
            size_gb=round(size_gb, 2),
            format="hf",
            param_count=param_count,
        )
```

### Step 4: Run tests

```bash
cd /home/tuanlai/vllm-launcher/backend && python -m pytest tests/test_model_scanner.py -v
```

Expected: All 4 tests PASS.

### Step 5: Commit

```bash
git add backend/model_scanner.py backend/tests/test_model_scanner.py
git commit -m "feat: add ModelScanner for local model discovery"
```

---

## Task 3: VRAMChecker — GPU info and estimation

**Files:**
- Create: `backend/vram_checker.py`
- Create: `backend/tests/test_vram_checker.py`

### Step 1: Write failing tests

```python
# backend/tests/test_vram_checker.py
import pytest
from vram_checker import VRAMChecker

def test_estimate_vram_returns_positive():
    checker = VRAMChecker()
    # A rough estimate for a 7B model in float16
    result = checker.estimate_vram_gb(param_billions=7, dtype="float16")
    assert result > 0
    assert result < 100  # sanity

def test_estimate_vram_quantized_less_than_float16():
    checker = VRAMChecker()
    fp16 = checker.estimate_vram_gb(param_billions=7, dtype="float16")
    awq = checker.estimate_vram_gb(param_billions=7, dtype="awq")
    assert awq < fp16

def test_check_feasibility():
    checker = VRAMChecker()
    # 7B model should fit in 98GB
    result = checker.check_feasibility(param_billions=7, dtype="float16", available_gb=98.0)
    assert result.feasible is True

def test_check_infeasible():
    checker = VRAMChecker()
    # 70B float16 should NOT fit in 8GB
    result = checker.check_feasibility(param_billions=70, dtype="float16", available_gb=8.0)
    assert result.feasible is False
    assert result.suggestion is not None
```

### Step 2: Run tests to verify they fail

```bash
cd /home/tuanlai/vllm-launcher/backend && python -m pytest tests/test_vram_checker.py -v
```

Expected: FAIL — `ModuleNotFoundError`

### Step 3: Implement VRAMChecker

```python
# backend/vram_checker.py
import subprocess
from dataclasses import dataclass


@dataclass
class GPUInfo:
    index: int
    name: str
    memory_total_gb: float
    memory_used_gb: float
    memory_free_gb: float


@dataclass
class VRAMCheck:
    feasible: bool
    estimated_gb: float
    available_gb: float
    utilization_pct: float
    suggestion: str | None = None


# Bytes per parameter for different dtypes/d量化
BYTES_PER_PARAM = {
    "float32": 4,
    "float16": 2,
    "bfloat16": 2,
    "int8": 1,
    "awq": 0.5,  # 4-bit
    "gptq": 0.5,
    "fp8": 1,
    "squeezellm": 0.5,
}

# Overhead multiplier for KV cache, activations, etc.
OVERHEAD_MULTIPLIER = 1.25


class VRAMChecker:
    def get_gpus(self) -> list[GPUInfo]:
        try:
            result = subprocess.run(
                ["nvidia-smi", "--query-gpu=index,name,memory.total,memory.used,memory.free",
                 "--format=csv,noheader,nounits"],
                capture_output=True, text=True, timeout=5,
            )
            gpus = []
            for line in result.stdout.strip().split("\n"):
                if not line.strip():
                    continue
                parts = [p.strip() for p in line.split(",")]
                gpus.append(GPUInfo(
                    index=int(parts[0]),
                    name=parts[1],
                    memory_total_gb=float(parts[2]) / 1024,
                    memory_used_gb=float(parts[3]) / 1024,
                    memory_free_gb=float(parts[4]) / 1024,
                ))
            return gpus
        except (subprocess.SubprocessError, FileNotFoundError, ValueError):
            return []

    def estimate_vram_gb(self, param_billions: float, dtype: str = "float16") -> float:
        bytes_per = BYTES_PER_PARAM.get(dtype, 2)
        raw_gb = param_billions * 1e9 * bytes_per / (1024**3)
        return raw_gb * OVERHEAD_MULTIPLIER

    def check_feasibility(
        self,
        param_billions: float,
        dtype: str = "float16",
        available_gb: float | None = None,
        tp_size: int = 1,
    ) -> VRAMCheck:
        if available_gb is None:
            gpus = self.get_gpus()
            if gpus:
                available_gb = sum(g.memory_free_gb for g in gpus[:tp_size])
            else:
                available_gb = 0

        estimated = self.estimate_vram_gb(param_billions, dtype)
        if tp_size > 1:
            estimated = estimated / tp_size

        feasible = estimated <= available_gb * 0.95  # 5% margin
        utilization = (estimated / available_gb * 100) if available_gb > 0 else 100

        suggestion = None
        if not feasible:
            if param_billions > 20:
                suggestion = "Consider using quantization (AWQ/GPTQ) to reduce VRAM usage"
            else:
                suggestion = "Model may exceed available VRAM. Try reducing --max-model-len or using quantization"

        return VRAMCheck(
            feasible=feasible,
            estimated_gb=round(estimated, 1),
            available_gb=round(available_gb, 1),
            utilization_pct=round(utilization, 1),
            suggestion=suggestion,
        )
```

### Step 4: Run tests

```bash
cd /home/tuanlai/vllm-launcher/backend && python -m pytest tests/test_vram_checker.py -v
```

Expected: All 4 tests PASS.

### Step 5: Commit

```bash
git add backend/vram_checker.py backend/tests/test_vram_checker.py
git commit -m "feat: add VRAMChecker for GPU memory estimation"
```

---

## Task 4: ConfigStore — Preset persistence

**Files:**
- Create: `backend/config_store.py`
- Create: `backend/tests/test_config_store.py`

### Step 1: Write failing tests

```python
# backend/tests/test_config_store.py
import pytest
import tempfile
import os
from config_store import ConfigStore

@pytest.fixture
def store(tmp_path):
    return ConfigStore(path=str(tmp_path / "presets.json"))

def test_save_and_load(store):
    store.save("test-preset", {"model": "test", "port": 8000})
    result = store.load("test-preset")
    assert result["model"] == "test"
    assert result["port"] == 8000

def test_list_presets(store):
    store.save("preset-a", {"model": "a"})
    store.save("preset-b", {"model": "b"})
    presets = store.list_all()
    names = [p["name"] for p in presets]
    assert "preset-a" in names
    assert "preset-b" in names

def test_delete_preset(store):
    store.save("to-delete", {"model": "x"})
    store.delete("to-delete")
    assert len(store.list_all()) == 0

def test_load_nonexistent_raises(store):
    with pytest.raises(KeyError):
        store.load("does-not-exist")
```

### Step 2: Run tests to verify they fail

```bash
cd /home/tuanlai/vllm-launcher/backend && python -m pytest tests/test_config_store.py -v
```

Expected: FAIL — `ModuleNotFoundError`

### Step 3: Implement ConfigStore

```python
# backend/config_store.py
import json
from pathlib import Path
from datetime import datetime


class ConfigStore:
    def __init__(self, path: str | None = None):
        if path is None:
            path = str(Path.home() / ".config" / "vllm-launcher" / "presets.json")
        self._path = Path(path)
        self._path.parent.mkdir(parents=True, exist_ok=True)
        if not self._path.exists():
            self._path.write_text("[]")

    def _read(self) -> list[dict]:
        try:
            return json.loads(self._path.read_text())
        except (json.JSONDecodeError, OSError):
            return []

    def _write(self, data: list[dict]):
        self._path.write_text(json.dumps(data, indent=2))

    def save(self, name: str, config: dict):
        presets = self._read()
        # Update existing or add new
        for p in presets:
            if p["name"] == name:
                p["config"] = config
                p["updated_at"] = datetime.now().isoformat()
                self._write(presets)
                return
        presets.append({
            "name": name,
            "config": config,
            "created_at": datetime.now().isoformat(),
            "updated_at": datetime.now().isoformat(),
        })
        self._write(presets)

    def load(self, name: str) -> dict:
        for p in self._read():
            if p["name"] == name:
                return p["config"]
        raise KeyError(f"Preset '{name}' not found")

    def list_all(self) -> list[dict]:
        return [
            {"name": p["name"], "created_at": p.get("created_at"), "updated_at": p.get("updated_at")}
            for p in self._read()
        ]

    def delete(self, name: str):
        presets = [p for p in self._read() if p["name"] != name]
        self._write(presets)
```

### Step 4: Run tests

```bash
cd /home/tuanlai/vllm-launcher/backend && python -m pytest tests/test_config_store.py -v
```

Expected: All 4 tests PASS.

### Step 5: Commit

```bash
git add backend/config_store.py backend/tests/test_config_store.py
git commit -m "feat: add ConfigStore for preset persistence"
```

---

## Task 5: Rewrite main.py — New API routes

**Files:**
- Rewrite: `backend/main.py`

### Step 1: Rewrite main.py with all new routes

```python
# backend/main.py
import asyncio
import json
import time
from pathlib import Path

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel
from typing import Optional

from instance_manager import InstanceManager, VLLMConfig, ProcessState
from model_scanner import ModelScanner
from vram_checker import VRAMChecker
from config_store import ConfigStore
from log_parser import parse_log_line, get_error_details

app = FastAPI(title="vLLM Launcher")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_credentials=True,
                   allow_methods=["*"], allow_headers=["*"])

manager = InstanceManager()
scanner = ModelScanner()
vram_checker = VRAMChecker()
config_store = ConfigStore()

# instance_id → list of connected WebSocket clients
ws_clients: dict[str, set[WebSocket]] = {}
log_buffers: dict[str, list[dict]] = {}
MAX_LOG_BUFFER = 5000


class CreateInstanceRequest(BaseModel):
    model: str
    tensor_parallel_size: int = 1
    port: int = 8000
    host: str = "0.0.0.0"
    gpu_memory_utilization: float = 0.9
    max_model_len: Optional[int] = None
    quantization: Optional[str] = None
    dtype: Optional[str] = None
    trust_remote_code: bool = False
    enforce_eager: bool = False
    seed: Optional[int] = None
    max_num_seqs: Optional[int] = None
    max_num_batched_tokens: Optional[int] = None
    swap_space: int = 4
    extra_args: str = ""


class SavePresetRequest(BaseModel):
    name: str
    config: dict


# --- WebSocket ---

async def broadcast_to_instance(instance_id: str, message: dict):
    clients = ws_clients.get(instance_id, set())
    dead = set()
    payload = json.dumps(message)
    for client in clients:
        try:
            await client.send_text(payload)
        except Exception:
            dead.add(client)
    clients.difference_update(dead)


async def log_handler(instance_id: str, line: str, stream: str):
    event = parse_log_line(line)
    timestamp = time.time()

    log_entry = {"type": "log", "data": {
        "timestamp": timestamp, "level": event.type, "message": line, "stream": stream,
    }}

    buf = log_buffers.setdefault(instance_id, [])
    buf.append(log_entry)
    if len(buf) > MAX_LOG_BUFFER:
        buf.pop(0)

    await broadcast_to_instance(instance_id, log_entry)

    if event.metrics:
        inst = manager.get(instance_id)
        for key in ("prefill_throughput", "decode_throughput", "requests_active",
                     "requests_waiting", "gpu_cache_usage"):
            if key in event.metrics:
                if hasattr(inst.metrics, key):
                    setattr(inst.metrics, key, event.metrics[key])
        if "load_time" in event.metrics:
            inst.load_time = event.metrics["load_time"]
            inst.model_loaded = True
        inst.metrics.timestamp = timestamp
        await broadcast_to_instance(instance_id, {"type": "metrics", "data": {
            "prefill_throughput": inst.metrics.prefill_throughput,
            "decode_throughput": inst.metrics.decode_throughput,
            "requests_active": inst.metrics.requests_active,
            "requests_waiting": inst.metrics.requests_waiting,
            "gpu_cache_usage": inst.metrics.gpu_cache_usage,
            "timestamp": inst.metrics.timestamp,
        }})

    if event.type == "status" and "Server is ready" in event.message:
        inst = manager.get(instance_id)
        inst.state = ProcessState.RUNNING
        await broadcast_to_instance(instance_id, {"type": "status", "data": inst.get_status()})

    if event.type == "error":
        error_type = event.metrics.get("error_type", "unknown") if event.metrics else "unknown"
        error_info = get_error_details(error_type)
        await broadcast_to_instance(instance_id, {"type": "error", "data": {
            "error_type": error_type, "message": line, **error_info,
        }})


@app.websocket("/ws/{instance_id}")
async def websocket_endpoint(websocket: WebSocket, instance_id: str):
    await websocket.accept()
    ws_clients.setdefault(instance_id, set()).add(websocket)

    try:
        inst = manager.get(instance_id)
        await websocket.send_text(json.dumps({"type": "status", "data": inst.get_status()}))
    except KeyError:
        pass

    for entry in log_buffers.get(instance_id, [])[-200:]:
        await websocket.send_text(json.dumps(entry))

    try:
        while True:
            data = await websocket.receive_text()
            msg = json.loads(data)
            if msg.get("action") == "start":
                config = VLLMConfig(**msg.get("config", {}))
                iid = manager.create(config)
                manager._instances[iid].on_log(lambda iid=iid, *a: log_handler(iid, *a))
                await manager.start(iid)
            elif msg.get("action") == "stop":
                await manager.stop(instance_id)
    except WebSocketDisconnect:
        ws_clients.get(instance_id, set()).discard(websocket)
    except Exception:
        ws_clients.get(instance_id, set()).discard(websocket)


# --- REST API: Instances ---

@app.post("/api/instances")
async def create_instance(req: CreateInstanceRequest):
    config = VLLMConfig(**req.model_dump())
    instance_id = manager.create(config)
    inst = manager.get(instance_id)
    inst._log_callbacks.append(lambda *a: log_handler(instance_id, *a))
    log_buffers[instance_id] = []
    success = await manager.start(instance_id)
    return {"success": success, "instance_id": instance_id, "status": inst.get_status()}


@app.get("/api/instances")
async def list_instances():
    return {"instances": [i.get_status() for i in manager.list_all()]}


@app.get("/api/instances/{instance_id}")
async def get_instance(instance_id: str):
    return manager.get(instance_id).get_status()


@app.post("/api/instances/{instance_id}/stop")
async def stop_instance(instance_id: str):
    await manager.stop(instance_id)
    return {"success": True, "status": manager.get(instance_id).get_status()}


@app.delete("/api/instances/{instance_id}")
async def delete_instance(instance_id: str):
    await manager.stop(instance_id)
    manager.remove(instance_id)
    log_buffers.pop(instance_id, None)
    ws_clients.pop(instance_id, None)
    return {"success": True}


# --- REST API: Models ---

@app.get("/api/models/scan")
async def scan_models(path: str = "/home/tuanlai/Models"):
    models = await scanner.scan(path)
    return {"models": [
        {"name": m.name, "path": m.path, "size_gb": m.size_gb,
         "format": m.format, "param_count": m.param_count}
        for m in models
    ]}


@app.get("/api/models/vram-check")
async def check_vram(model_path: str, dtype: str = "float16", tp_size: int = 1):
    # Estimate param count from directory name or size
    import re
    match = re.search(r'(\d+\.?\d*)[Bb]', model_path)
    param_billions = float(match.group(1)) if match else 7.0
    result = vram_checker.check_feasibility(param_billions, dtype, tp_size=tp_size)
    return {"feasible": result.feasible, "estimated_gb": result.estimated_gb,
            "available_gb": result.available_gb, "utilization_pct": result.utilization_pct,
            "suggestion": result.suggestion}


# --- REST API: Presets ---

@app.get("/api/presets")
async def list_presets():
    return {"presets": config_store.list_all()}


@app.post("/api/presets")
async def save_preset(req: SavePresetRequest):
    config_store.save(req.name, req.config)
    return {"success": True}


@app.delete("/api/presets/{name}")
async def delete_preset(name: str):
    config_store.delete(name)
    return {"success": True}


# --- REST API: GPU ---

@app.get("/api/gpu")
async def get_gpu_info():
    gpus = vram_checker.get_gpus()
    return {"gpus": [
        {"index": g.index, "name": g.name, "memory_total_gb": g.memory_total_gb,
         "memory_used_gb": g.memory_used_gb, "memory_free_gb": g.memory_free_gb}
        for g in gpus
    ]}


# --- REST API: Chat proxy ---

@app.post("/api/chat/{instance_id}")
async def chat_completion(instance_id: str, request: dict):
    """Proxy a chat completion request to the target vLLM instance."""
    import httpx
    inst = manager.get(instance_id)
    if inst.state != ProcessState.RUNNING:
        return {"error": "Instance is not running"}
    url = f"http://localhost:{inst.config.port}/v1/chat/completions"
    async with httpx.AsyncClient(timeout=120) as client:
        resp = await client.post(url, json=request)
        return resp.json()


# --- Serve frontend ---

frontend_dist = Path(__file__).parent.parent / "frontend" / "dist"
if frontend_dist.exists():
    app.mount("/assets", StaticFiles(directory=frontend_dist / "assets"), name="assets")

    @app.get("/{full_path:path}")
    async def serve_frontend(full_path: str):
        file_path = frontend_dist / full_path
        if file_path.exists() and file_path.is_file():
            return FileResponse(file_path)
        return FileResponse(frontend_dist / "index.html")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001)
```

### Step 2: Update requirements.txt

```
fastapi>=0.104.0
uvicorn[standard]>=0.24.0
websockets>=12.0
pydantic>=2.0
httpx>=0.25.0
```

### Step 3: Commit

```bash
git add backend/main.py backend/requirements.txt
git commit -m "feat: rewrite main.py with multi-instance, model scan, presets, GPU, chat proxy APIs"
```

---

## Task 6: Frontend — Ollama white theme

**Files:**
- Rewrite: `frontend/src/App.css`

### Step 1: Replace all CSS variables with Ollama white theme

Replace the entire `:root` block and global styles in `App.css`:

```css
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap');

:root {
  --canvas: #ffffff;
  --canvas-soft: #fafafa;
  --canvas-softer: #f5f5f5;
  --surface-card: #ffffff;
  --surface-hover: #fafafa;
  --primary: #000000;
  --primary-soft: #171717;
  --primary-deep: #0a0a0a;
  --primary-glow: rgba(0, 0, 0, 0.04);
  --ink: #000000;
  --ink-strong: #000000;
  --body: #525252;
  --mute: #a3a3a3;
  --hairline: #e5e5e5;
  --hairline-strong: #d4d4d4;
  --error: #ef4444;
  --error-soft: rgba(239, 68, 68, 0.08);
  --warning: #f59e0b;
  --warning-soft: rgba(245, 158, 11, 0.08);
  --success: #10b981;
  --success-soft: rgba(16, 185, 129, 0.08);
  --info: #3b82f6;
  --info-soft: rgba(59, 130, 246, 0.08);
  --font-sans: 'Inter', ui-sans-serif, system-ui, -apple-system, sans-serif;
  --font-mono: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace;
  --space-xs: 4px; --space-sm: 8px; --space-md: 12px; --space-lg: 16px;
  --space-xl: 20px; --space-2xl: 24px; --space-3xl: 32px; --space-5xl: 48px;
  --radius-sm: 6px; --radius-md: 8px; --radius-lg: 12px; --radius-pill: 9999px;
  --sidebar-width: 240px; --sidebar-collapsed: 64px;
}
```

Update all component styles:
- Cards: white background, `#e5e5e5` border, no shadow
- Buttons: black primary, pill shape
- Inputs: white background, `#e5e5e5` border, pill shape
- Text: black headlines, `#525252` body, `#a3a3a3` muted
- Status dots: green=running, black=idle, red=error

### Step 2: Commit

```bash
git add frontend/src/App.css
git commit -m "feat: switch to Ollama-style white theme"
```

---

## Task 7: Frontend — Update Sidebar for new pages

**Files:**
- Rewrite: `frontend/src/components/Sidebar.tsx`

### Step 1: Update navigation items and white theme styling

Add Instances and Playground to nav, restyle for white theme:

```tsx
const navItems = [
  { path: '/', label: 'Dashboard', icon: DashboardIcon },
  { path: '/instances', label: 'Instances', icon: InstancesIcon },
  { path: '/logs', label: 'Logs', icon: LogsIcon },
  { path: '/playground', label: 'Playground', icon: PlaygroundIcon },
  { path: '/settings', label: 'Settings', icon: SettingsIcon },
]
```

Update styles: white background `#ffffff`, border `#e5e5e5`, active state with black left-border, text colors `#000000` active / `#525252` default.

### Step 2: Update App.tsx routes

```tsx
<Routes>
  <Route path="/" element={<Dashboard ws={ws} />} />
  <Route path="/instances" element={<Instances ws={ws} />} />
  <Route path="/logs" element={<Logs ws={ws} />} />
  <Route path="/playground" element={<Playground ws={ws} />} />
  <Route path="/settings" element={<Settings ws={ws} />} />
</Routes>
```

### Step 3: Commit

```bash
git add frontend/src/components/Sidebar.tsx frontend/src/App.tsx
git commit -m "feat: add Instances and Playground pages to navigation"
```

---

## Task 8: Frontend — WebSocket multi-instance support

**Files:**
- Rewrite: `frontend/src/api/websocket.ts`

### Step 1: Rewrite WebSocket hook for multi-instance

Key changes:
- `useWebSocket()` returns `connectInstance(id)` function
- Each instance gets its own WebSocket connection
- Metrics/status/logs are keyed by instance_id
- Add `instances` list state

```typescript
export interface UseWebSocketReturn {
  connected: boolean
  instances: InstanceStatus[]
  selectedInstanceId: string | null
  selectInstance: (id: string) => void
  getLogs: (instanceId: string) => LogEntry[]
  getMetrics: (instanceId: string) => Metrics
  getStatus: (instanceId: string) => InstanceStatus | null
  startInstance: (config: Record<string, any>) => Promise<void>
  stopInstance: (instanceId: string) => void
  deleteInstance: (instanceId: string) => void
  clearLogs: (instanceId: string) => void
  lastError: ErrorData | null
  clearError: () => void
}
```

### Step 2: Commit

```bash
git add frontend/src/api/websocket.ts
git commit -m "feat: rewrite WebSocket hook for multi-instance support"
```

---

## Task 9: Frontend — ModelSelector component

**Files:**
- Create: `frontend/src/components/ModelSelector.tsx`

### Step 1: Create ModelSelector component

Features:
- On mount, calls `GET /api/models/scan`
- Dropdown grouped by parent directory
- Shows name, format badge (HF/GGUF), size
- "Refresh" button to re-scan
- Manual input fallback
- Calls VRAM check on selection

### Step 2: Commit

```bash
git add frontend/src/components/ModelSelector.tsx
git commit -m "feat: add ModelSelector with local model scanning"
```

---

## Task 10: Frontend — VRAMIndicator component

**Files:**
- Create: `frontend/src/components/VRAMIndicator.tsx`

### Step 1: Create VRAMIndicator component

Features:
- Shows estimated VRAM vs available
- Progress bar with color coding (green/yellow/red)
- Warning message if infeasible
- Triggered by ModelSelector when model is selected

### Step 2: Commit

```bash
git add frontend/src/components/VRAMIndicator.tsx
git commit -m "feat: add VRAMIndicator for GPU memory pre-check"
```

---

## Task 11: Frontend — PresetManager component

**Files:**
- Create: `frontend/src/components/PresetManager.tsx`

### Step 1: Create PresetManager component

Features:
- List saved presets
- "Save current" button with name input
- Click to load preset
- Delete button per preset
- Uses `/api/presets` endpoints

### Step 2: Commit

```bash
git add frontend/src/components/PresetManager.tsx
git commit -m "feat: add PresetManager for config save/load"
```

---

## Task 12: Frontend — ConfigForm rewrite (3-tier + active panel)

**Files:**
- Rewrite: `frontend/src/components/ConfigForm.tsx`

### Step 1: Rewrite ConfigForm with 3-tier layout

Structure:
1. **Active Parameters panel** — always visible, shows the full `vllm serve ...` command, copy button
2. **Common Parameters** — default expanded: model (ModelSelector), port, host, tp_size, gpu_mem, max_model_len, quantization, dtype, trust_remote_code, enforce_eager, seed
3. **Performance Tuning** — collapsed: max_num_seqs, max_num_batched_tokens, swap_space, block_size, enable_prefix_caching, disable_log_stats, load_format
4. **Advanced** — collapsed: LoRA, multi-modal, distributed, extra_args
5. **Presets** — PresetManager integrated at the top

### Step 2: Commit

```bash
git add frontend/src/components/ConfigForm.tsx
git commit -m "feat: rewrite ConfigForm with 3-tier params and active command panel"
```

---

## Task 13: Frontend — InstanceCard component

**Files:**
- Create: `frontend/src/components/InstanceCard.tsx`

### Step 1: Create InstanceCard component

Features:
- Shows: status dot, model name, port, state
- Inline metrics (prefill/decode tok/s)
- Action buttons: Stop, Restart, Delete, View Logs
- Expandable to show details

### Step 2: Commit

```bash
git add frontend/src/components/InstanceCard.tsx
git commit -m "feat: add InstanceCard for instance list display"
```

---

## Task 14: Frontend — Instances page

**Files:**
- Create: `frontend/src/pages/Instances.tsx`

### Step 1: Create Instances page

Features:
- List of InstanceCards
- "New Instance" button → opens ConfigForm in a modal or side panel
- Auto-refresh instance list

### Step 2: Commit

```bash
git add frontend/src/pages/Instances.tsx
git commit -m "feat: add Instances page for multi-instance management"
```

---

## Task 15: Frontend — APIPlayground component and Playground page

**Files:**
- Create: `frontend/src/components/APIPlayground.tsx`
- Create: `frontend/src/pages/Playground.tsx`

### Step 1: Create APIPlayground component

Features:
- Instance selector dropdown (only running instances)
- Message input (system + user messages)
- Parameters: max_tokens, temperature, top_p
- Send button → POST to `/api/chat/{instance_id}`
- Response display with latency and token counts
- Error handling

### Step 2: Create Playground page

Wraps APIPlayground in page layout with white theme.

### Step 3: Commit

```bash
git add frontend/src/components/APIPlayground.tsx frontend/src/pages/Playground.tsx
git commit -m "feat: add API Playground for testing vLLM endpoints"
```

---

## Task 16: Frontend — Update remaining pages for white theme

**Files:**
- Rewrite: `frontend/src/pages/Dashboard.tsx`
- Rewrite: `frontend/src/pages/Logs.tsx`
- Rewrite: `frontend/src/pages/Settings.tsx`
- Rewrite: `frontend/src/components/AnimatedGauge.tsx`
- Rewrite: `frontend/src/components/LogViewer.tsx`
- Rewrite: `frontend/src/components/StatusBadge.tsx`

### Step 1: Update each component for white theme

For each file:
- Replace dark color references with light equivalents
- Update card backgrounds to white with hairline borders
- Update text colors: black headlines, gray body
- LogViewer: light terminal style (`#fafafa` background)
- AnimatedGauge: simpler, text-focused design (large monospace number)
- StatusBadge: green dot for running, black for idle

### Step 2: Commit

```bash
git add frontend/src/
git commit -m "feat: update all pages and components for Ollama white theme"
```

---

## Task 17: Build, test, and verify

### Step 1: Install new backend dependency

```bash
cd /home/tuanlai/vllm-launcher/backend && pip install httpx
```

### Step 2: Run all backend tests

```bash
cd /home/tuanlai/vllm-launcher/backend && python -m pytest tests/ -v
```

Expected: All tests pass.

### Step 3: Build frontend

```bash
cd /home/tuanlai/vllm-launcher/frontend && npm run build
```

Expected: Build succeeds with no errors.

### Step 4: Start backend and verify APIs

```bash
cd /home/tuanlai/vllm-launcher/backend && python main.py &
curl http://localhost:8001/api/gpu
curl http://localhost:8001/api/models/scan
curl http://localhost:8001/api/presets
```

Expected: Each returns valid JSON.

### Step 5: Open browser and test UI

Open `http://localhost:5173` and verify:
- Dashboard loads with white theme
- Instances page shows empty list
- Settings page has 3-tier config form
- Model selector loads models from `/home/tuanlai/Models/`
- Playground page loads

### Step 6: Final commit

```bash
git add -A
git commit -m "feat: vLLM Launcher redesign complete — white theme, multi-instance, model scan, presets, playground"
```
