import asyncio
import signal
import os
from enum import Enum
from typing import Optional, AsyncIterator
from dataclasses import dataclass, field
from datetime import datetime


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
    extra_args: str = ""

    def to_command(self, python_path: str = "python") -> list[str]:
        cmd = [
            python_path, "-m", "vllm.entrypoints.openai.api_server",
            "--model", self.model,
            "--tensor-parallel-size", str(self.tensor_parallel_size),
            "--port", str(self.port),
            "--host", self.host,
            "--gpu-memory-utilization", str(self.gpu_memory_utilization),
        ]
        if self.max_model_len:
            cmd += ["--max-model-len", str(self.max_model_len)]
        if self.quantization:
            cmd += ["--quantization", self.quantization]
        if self.dtype:
            cmd += ["--dtype", self.dtype]
        if self.trust_remote_code:
            cmd += ["--trust-remote-code"]
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
class ProcessInfo:
    state: ProcessState = ProcessState.IDLE
    config: Optional[VLLMConfig] = None
    pid: Optional[int] = None
    start_time: Optional[datetime] = None
    metrics: MetricsSnapshot = field(default_factory=MetricsSnapshot)
    last_error: Optional[str] = None
    model_loaded: bool = False
    load_time: Optional[float] = None


DEFAULT_VENV_PYTHON = "/home/tuanlai/env/vllm/.venv/bin/python"


class VLLMProcessManager:
    def __init__(self, python_path: str = DEFAULT_VENV_PYTHON):
        self.info = ProcessInfo()
        self._process: Optional[asyncio.subprocess.Process] = None
        self._log_callbacks: list = []
        self._python_path = python_path

    @property
    def state(self) -> ProcessState:
        return self.info.state

    def on_log(self, callback):
        self._log_callbacks.append(callback)

    async def _emit_log(self, line: str, stream: str = "stdout"):
        for cb in self._log_callbacks:
            await cb(line, stream)

    async def start(self, config: VLLMConfig) -> bool:
        if self.info.state in (ProcessState.STARTING, ProcessState.RUNNING):
            return False

        self.info = ProcessInfo(
            state=ProcessState.STARTING,
            config=config,
            start_time=datetime.now(),
        )

        cmd = config.to_command(self._python_path)
        await self._emit_log(f"[launcher] Starting vLLM: {' '.join(cmd)}", "system")

        try:
            self._process = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.STDOUT,
                env={**os.environ, "PYTHONUNBUFFERED": "1"},
            )
            self.info.pid = self._process.pid
            await self._emit_log(f"[launcher] Process started with PID {self.info.pid}", "system")

            asyncio.create_task(self._read_output())
            asyncio.create_task(self._monitor_process())
            return True

        except FileNotFoundError:
            self.info.state = ProcessState.ERROR
            self.info.last_error = "vLLM command not found. Is vllm installed?"
            await self._emit_log("[launcher] ERROR: vllm command not found", "error")
            return False
        except Exception as e:
            self.info.state = ProcessState.ERROR
            self.info.last_error = str(e)
            await self._emit_log(f"[launcher] ERROR: {e}", "error")
            return False

    async def stop(self):
        if self._process is None or self.info.state not in (ProcessState.STARTING, ProcessState.RUNNING):
            return

        self.info.state = ProcessState.STOPPING
        await self._emit_log("[launcher] Stopping vLLM process...", "system")

        try:
            self._process.send_signal(signal.SIGTERM)
            try:
                await asyncio.wait_for(self._process.wait(), timeout=10.0)
            except asyncio.TimeoutError:
                await self._emit_log("[launcher] SIGTERM timeout, sending SIGKILL", "system")
                self._process.kill()
                await self._process.wait()
        except ProcessLookupError:
            pass

        self.info.state = ProcessState.STOPPED
        self.info.pid = None
        self._process = None
        await self._emit_log("[launcher] Process stopped", "system")

    async def _read_output(self):
        if self._process is None or self._process.stdout is None:
            return

        async for line_bytes in self._process.stdout:
            line = line_bytes.decode("utf-8", errors="replace").rstrip("\n")
            await self._emit_log(line, "stdout")

    async def _monitor_process(self):
        if self._process is None:
            return

        returncode = await self._process.wait()

        if self.info.state == ProcessState.STOPPING:
            return

        if returncode != 0:
            self.info.state = ProcessState.ERROR
            self.info.last_error = f"Process exited with code {returncode}"
            await self._emit_log(f"[launcher] Process exited with code {returncode}", "error")
        else:
            self.info.state = ProcessState.STOPPED

        self.info.pid = None
        self._process = None

    def update_metrics(self, **kwargs):
        for k, v in kwargs.items():
            if hasattr(self.info.metrics, k):
                setattr(self.info.metrics, k, v)
        self.info.metrics.timestamp = asyncio.get_event_loop().time()

    def set_state(self, state: ProcessState):
        self.info.state = state

    def get_status(self) -> dict:
        return {
            "state": self.info.state.value,
            "pid": self.info.pid,
            "start_time": self.info.start_time.isoformat() if self.info.start_time else None,
            "model": self.info.config.model if self.info.config else None,
            "model_loaded": self.info.model_loaded,
            "load_time": self.info.load_time,
            "last_error": self.info.last_error,
            "metrics": {
                "prefill_throughput": self.info.metrics.prefill_throughput,
                "decode_throughput": self.info.metrics.decode_throughput,
                "total_tokens": self.info.metrics.total_tokens,
                "requests_active": self.info.metrics.requests_active,
                "requests_waiting": self.info.metrics.requests_waiting,
                "gpu_cache_usage": self.info.metrics.gpu_cache_usage,
                "timestamp": self.info.metrics.timestamp,
            },
            "config": {
                "model": self.info.config.model,
                "tensor_parallel_size": self.info.config.tensor_parallel_size,
                "port": self.info.config.port,
                "gpu_memory_utilization": self.info.config.gpu_memory_utilization,
                "max_model_len": self.info.config.max_model_len,
                "quantization": self.info.config.quantization,
            } if self.info.config else None,
        }
