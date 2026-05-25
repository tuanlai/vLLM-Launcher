import asyncio
import os
import signal
import uuid
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import Optional, AsyncIterator


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
        cmd = [
            python_path, "-m", "vllm.entrypoints.openai.api_server",
            "--model", self.model,
        ]

        # Only include args that differ from defaults
        if self.tensor_parallel_size != 1:
            cmd += ["--tensor-parallel-size", str(self.tensor_parallel_size)]
        if self.port != 8000:
            cmd += ["--port", str(self.port)]
        if self.host != "0.0.0.0":
            cmd += ["--host", self.host]
        if self.gpu_memory_utilization != 0.9:
            cmd += ["--gpu-memory-utilization", str(self.gpu_memory_utilization)]
        if self.max_model_len is not None:
            cmd += ["--max-model-len", str(self.max_model_len)]
        if self.quantization is not None:
            cmd += ["--quantization", self.quantization]
        if self.dtype is not None:
            cmd += ["--dtype", self.dtype]
        if self.trust_remote_code:
            cmd += ["--trust-remote-code"]
        if self.enforce_eager:
            cmd += ["--enforce-eager"]
        if self.seed is not None:
            cmd += ["--seed", str(self.seed)]
        if self.max_num_seqs is not None:
            cmd += ["--max-num-seqs", str(self.max_num_seqs)]
        if self.max_num_batched_tokens is not None:
            cmd += ["--max-num-batched-tokens", str(self.max_num_batched_tokens)]
        if self.swap_space != 4:
            cmd += ["--swap-space", str(self.swap_space)]
        if self.block_size is not None:
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


DEFAULT_VENV_PYTHON = "/home/tuanlai/env/vllm/.venv/bin/python"


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
    _process: Optional[asyncio.subprocess.Process] = field(
        default=None, repr=False
    )
    _log_callbacks: list = field(default_factory=list, repr=False)

    def get_status(self) -> dict:
        return {
            "id": self.id,
            "state": self.state.value,
            "pid": self.pid,
            "start_time": self.start_time.isoformat() if self.start_time else None,
            "model": self.config.model,
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
                "host": self.config.host,
                "gpu_memory_utilization": self.config.gpu_memory_utilization,
                "max_model_len": self.config.max_model_len,
                "quantization": self.config.quantization,
                "dtype": self.config.dtype,
                "trust_remote_code": self.config.trust_remote_code,
                "enforce_eager": self.config.enforce_eager,
                "seed": self.config.seed,
                "max_num_seqs": self.config.max_num_seqs,
                "max_num_batched_tokens": self.config.max_num_batched_tokens,
                "swap_space": self.config.swap_space,
                "block_size": self.config.block_size,
                "enable_prefix_caching": self.config.enable_prefix_caching,
                "disable_log_stats": self.config.disable_log_stats,
                "load_format": self.config.load_format,
            },
        }


class InstanceManager:
    def __init__(self, python_path: str = DEFAULT_VENV_PYTHON):
        self._python_path = python_path
        self._instances: dict[str, Instance] = {}
        self._next_port: int = 8000

    def create(self, config: VLLMConfig) -> str:
        instance_id = uuid.uuid4().hex[:8]

        # Auto-assign port if it's the default 8000
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

    def remove(self, instance_id: str) -> None:
        if instance_id in self._instances:
            del self._instances[instance_id]

    async def start(self, instance_id: str) -> bool:
        instance = self.get(instance_id)
        if instance.state in (ProcessState.STARTING, ProcessState.RUNNING):
            return False

        instance.state = ProcessState.STARTING
        instance.start_time = datetime.now()
        instance.last_error = None

        cmd = instance.config.to_command(self._python_path)

        try:
            instance._process = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.STDOUT,
                env={**os.environ, "PYTHONUNBUFFERED": "1"},
            )
            instance.pid = instance._process.pid

            asyncio.create_task(self._read_output(instance_id))
            asyncio.create_task(self._monitor_process(instance_id))
            return True

        except FileNotFoundError:
            instance.state = ProcessState.ERROR
            instance.last_error = "vLLM command not found. Is vllm installed?"
            return False
        except Exception as e:
            instance.state = ProcessState.ERROR
            instance.last_error = str(e)
            return False

    async def stop(self, instance_id: str) -> None:
        instance = self.get(instance_id)
        if instance._process is None or instance.state not in (
            ProcessState.STARTING, ProcessState.RUNNING
        ):
            return

        instance.state = ProcessState.STOPPING

        try:
            instance._process.send_signal(signal.SIGTERM)
            try:
                await asyncio.wait_for(instance._process.wait(), timeout=10.0)
            except asyncio.TimeoutError:
                instance._process.kill()
                await instance._process.wait()
        except ProcessLookupError:
            pass

        instance.state = ProcessState.STOPPED
        instance.pid = None
        instance._process = None

    async def _read_output(self, instance_id: str) -> None:
        instance = self.get(instance_id)
        if instance._process is None or instance._process.stdout is None:
            return

        async for line_bytes in instance._process.stdout:
            line = line_bytes.decode("utf-8", errors="replace").rstrip("\n")
            for cb in instance._log_callbacks:
                await cb(line, "stdout")

    async def _monitor_process(self, instance_id: str) -> None:
        instance = self.get(instance_id)
        if instance._process is None:
            return

        returncode = await instance._process.wait()

        if instance.state == ProcessState.STOPPING:
            return

        if returncode != 0:
            instance.state = ProcessState.ERROR
            instance.last_error = f"Process exited with code {returncode}"
        else:
            instance.state = ProcessState.STOPPED

        instance.pid = None
        instance._process = None
