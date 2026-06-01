import asyncio
import time
import os
import signal
import atexit
import uuid
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from pathlib import Path
from typing import Optional

import psutil

from metrics_scraper import MetricsScrapState, scrape_full_metrics
from log_parser import extract_prefill_throughput


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
    kv_cache_dtype: Optional[str] = None
    trust_remote_code: bool = False
    enforce_eager: bool = False
    enable_chunked_prefill: bool = False
    enable_auto_tool_choice: bool = False
    tool_call_parser: Optional[str] = None
    reasoning_parser: Optional[str] = None
    speculative_config: Optional[str] = None
    seed: Optional[int] = None
    max_num_seqs: Optional[int] = None
    max_num_batched_tokens: Optional[int] = None
    swap_space: int = 4
    block_size: Optional[int] = None
    enable_prefix_caching: Optional[bool] = None
    disable_log_stats: bool = False
    load_format: str = "auto"
    lora: Optional[str] = None
    extra_args: str = ""
    env_vars: Optional[dict[str, str]] = None

    def to_command(self, python_path: str = "python") -> list[str]:
        vllm_bin = str(Path(python_path).parent / "vllm")
        cmd = [
            vllm_bin, "serve", self.model,
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
        if self.kv_cache_dtype is not None:
            cmd += ["--kv-cache-dtype", self.kv_cache_dtype]
        if self.trust_remote_code:
            cmd += ["--trust-remote-code"]
        if self.enforce_eager:
            cmd += ["--enforce-eager"]
        if self.enable_chunked_prefill:
            cmd += ["--enable-chunked-prefill"]
        if self.enable_auto_tool_choice:
            cmd += ["--enable-auto-tool-choice"]
        if self.tool_call_parser is not None:
            cmd += ["--tool-call-parser", self.tool_call_parser]
        if self.reasoning_parser is not None:
            cmd += ["--reasoning-parser", self.reasoning_parser]
        if self.speculative_config is not None:
            cmd += ["--speculative-config", self.speculative_config]
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
        if self.lora is not None:
            cmd += ["--lora", self.lora]
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


DEFAULT_VENV_PYTHON = os.environ.get("VLLM_PYTHON", "") or ""


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
    _metrics_scrap_state: MetricsScrapState = field(
        default_factory=MetricsScrapState, repr=False
    )
    _metrics_task: Optional[asyncio.Task] = field(
        default=None, repr=False
    )
    _metrics_callbacks: list = field(default_factory=list, repr=False)

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
                "kv_cache_dtype": self.config.kv_cache_dtype,
                "trust_remote_code": self.config.trust_remote_code,
                "enforce_eager": self.config.enforce_eager,
                "enable_chunked_prefill": self.config.enable_chunked_prefill,
                "enable_auto_tool_choice": self.config.enable_auto_tool_choice,
                "tool_call_parser": self.config.tool_call_parser,
                "reasoning_parser": self.config.reasoning_parser,
                "speculative_config": self.config.speculative_config,
                "seed": self.config.seed,
                "max_num_seqs": self.config.max_num_seqs,
                "max_num_batched_tokens": self.config.max_num_batched_tokens,
                "swap_space": self.config.swap_space,
                "block_size": self.config.block_size,
                "enable_prefix_caching": self.config.enable_prefix_caching,
                "disable_log_stats": self.config.disable_log_stats,
                "load_format": self.config.load_format,
                "lora": self.config.lora,
                "env_vars": self.config.env_vars,
            },
        }


class InstanceManager:
    def __init__(self, python_path: str = DEFAULT_VENV_PYTHON):
        self._python_path = python_path
        self._instances: dict[str, Instance] = {}
        self._cleanup_registered = False
        self._register_cleanup()

    def _register_cleanup(self):
        """Register signal handlers and atexit to kill child processes on shutdown."""
        if self._cleanup_registered:
            return
        self._cleanup_registered = True

        def cleanup():
            import time as _time
            for inst in self._instances.values():
                if inst._process and inst.state == ProcessState.RUNNING:
                    try:
                        inst._process.terminate()
                    except ProcessLookupError:
                        pass
            # Escalate to SIGKILL after 3s for stubborn GPU workers
            deadline = _time.monotonic() + 3
            for inst in self._instances.values():
                if inst._process and inst.state == ProcessState.RUNNING:
                    remaining = deadline - _time.monotonic()
                    if remaining > 0:
                        try:
                            inst._process.wait(timeout=remaining)
                        except (ProcessLookupError, OSError):
                            pass
                    try:
                        inst._process.kill()
                    except (ProcessLookupError, OSError):
                        pass

        atexit.register(cleanup)

        for sig in (signal.SIGTERM, signal.SIGINT):
            try:
                signal.signal(sig, lambda s, f: (cleanup(), signal.signal(s, signal.SIG_DFL), os.kill(os.getpid(), s)))
            except (OSError, ValueError):
                pass

    @property
    def python_path(self) -> str:
        return self._python_path

    @python_path.setter
    def python_path(self, path: str) -> None:
        self._python_path = path

    def recover_running_instances(self) -> int:
        """Scan for already-running vLLM processes and re-register them."""
        recovered = 0
        for proc in psutil.process_iter(["pid", "cmdline"]):
            try:
                cmdline = proc.info.get("cmdline") or []
                if len(cmdline) < 4:
                    continue
                # Match: [python] vllm serve <model> [args...]
                # or:    vllm serve <model> [args...]
                try:
                    serve_idx = cmdline.index("serve")
                except ValueError:
                    continue
                if serve_idx < 1:
                    continue
                vllm_bin = cmdline[serve_idx - 1]
                if "vllm" not in Path(vllm_bin).name:
                    continue
                model = cmdline[serve_idx + 1]
                if not model or model.startswith("-"):
                    continue

                # Parse args
                args = cmdline[serve_idx + 2:]
                config = self._parse_vllm_args(model, args)

                # Check if we already track this PID
                already_tracked = any(
                    inst.pid == proc.info["pid"]
                    for inst in self._instances.values()
                )
                if already_tracked:
                    continue

                instance_id = uuid.uuid4().hex[:8]
                instance = Instance(
                    id=instance_id,
                    config=config,
                    state=ProcessState.RUNNING,
                    pid=proc.info["pid"],
                    start_time=datetime.fromtimestamp(proc.create_time()),
                    model_loaded=True,
                )
                self._instances[instance_id] = instance

                recovered += 1
            except (psutil.NoSuchProcess, psutil.AccessDenied, IndexError):
                continue
        return recovered

    @staticmethod
    def _parse_vllm_args(model: str, args: list[str]) -> VLLMConfig:
        """Parse vllm serve CLI args into a VLLMConfig."""
        config = VLLMConfig(model=model)

        i = 0
        while i < len(args):
            arg = args[i]
            if not arg.startswith("--"):
                i += 1
                continue

            key = arg.lstrip("-").replace("-", "_")
            # Boolean flags (no value)
            if key in ("trust_remote_code", "enforce_eager", "enable_chunked_prefill",
                        "enable_auto_tool_choice", "disable_log_stats"):
                setattr(config, key, True)
                i += 1
                continue

            # Three-state boolean flags
            if key == "enable_prefix_caching":
                config.enable_prefix_caching = True
                i += 1
                continue
            if key == "no_enable_prefix_caching":
                config.enable_prefix_caching = False
                i += 1
                continue

            # Flags with value
            if i + 1 < len(args) and not args[i + 1].startswith("--"):
                val = args[i + 1]
                if key == "port":
                    config.port = int(val)
                elif key == "host":
                    config.host = val
                elif key == "tensor_parallel_size":
                    config.tensor_parallel_size = int(val)
                elif key == "gpu_memory_utilization":
                    config.gpu_memory_utilization = float(val)
                elif key == "max_model_len":
                    config.max_model_len = int(val)
                elif key == "quantization":
                    config.quantization = val
                elif key == "dtype":
                    config.dtype = val
                elif key == "kv_cache_dtype":
                    config.kv_cache_dtype = val
                elif key == "seed":
                    config.seed = int(val)
                elif key == "max_num_seqs":
                    config.max_num_seqs = int(val)
                elif key == "max_num_batched_tokens":
                    config.max_num_batched_tokens = int(val)
                elif key == "swap_space":
                    config.swap_space = int(val)
                elif key == "block_size":
                    config.block_size = int(val)
                elif key == "load_format":
                    config.load_format = val
                elif key == "tool_call_parser":
                    config.tool_call_parser = val
                elif key == "reasoning_parser":
                    config.reasoning_parser = val
                elif key == "speculative_config":
                    config.speculative_config = val
                elif key == "lora":
                    config.lora = val
                elif key == "served_model_name":
                    pass  # skip, we use model path
                i += 2
            else:
                i += 1

        return config

    def create(self, config: VLLMConfig) -> str:
        instance_id = uuid.uuid4().hex[:8]

        # Check port conflict with existing managed instances
        for inst in self._instances.values():
            if inst.config.port == config.port:
                raise ValueError(f"Port {config.port} is already in use by instance {inst.id}")

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

        # Ensure venv bin is in PATH so vllm, ninja, etc. are found
        venv_bin = str(Path(self._python_path).parent)
        env = {
            **os.environ,
            "PATH": f"{venv_bin}:{os.environ.get('PATH', '')}",
            "PYTHONUNBUFFERED": "1",
        }
        # Inject instance-specific environment variables
        if instance.config.env_vars:
            for k, v in instance.config.env_vars.items():
                env[k] = str(v)

        try:
            instance._process = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.STDOUT,
                env=env,
            )
            instance.pid = instance._process.pid

            asyncio.create_task(self._read_output(instance_id))
            asyncio.create_task(self._monitor_process(instance_id))
            instance._metrics_task = asyncio.create_task(
                self._collect_metrics(instance_id)
            )
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
        if instance.state not in (ProcessState.STARTING, ProcessState.RUNNING):
            return

        instance.state = ProcessState.STOPPING

        if instance._metrics_task is not None:
            instance._metrics_task.cancel()
            instance._metrics_task = None
        try:
            if instance._process is not None:
                instance._process.send_signal(signal.SIGTERM)
                try:
                    await asyncio.wait_for(instance._process.wait(), timeout=10.0)
                except asyncio.TimeoutError:
                    instance._process.kill()
                    await instance._process.wait()
            elif instance.pid is not None:
                # Recovered instance — kill by PID
                os.kill(instance.pid, signal.SIGTERM)
                # Wait for process to exit
                for _ in range(100):
                    await asyncio.sleep(0.1)
                    if not psutil.pid_exists(instance.pid):
                        break
                else:
                    try:
                        os.kill(instance.pid, signal.SIGKILL)
                    except ProcessLookupError:
                        pass
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
            # Extract prefill throughput from vLLM log output
            prefill_tps = extract_prefill_throughput(line)
            if prefill_tps is not None:
                scrap = instance._metrics_scrap_state
                if scrap.prefill_throughput == 0:
                    scrap.prefill_throughput = prefill_tps
                else:
                    scrap.prefill_throughput = 0.4 * prefill_tps + 0.6 * scrap.prefill_throughput
                instance.metrics.prefill_throughput = scrap.prefill_throughput
                instance.metrics.timestamp = time.time()
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

        if instance._metrics_task is not None:
            instance._metrics_task.cancel()
            instance._metrics_task = None

    METRICS_INTERVAL = 0.5  # seconds between scrapes
    METRICS_ALPHA = 0.4     # EMA smoothing factor

    async def _collect_metrics(self, instance_id: str) -> None:
        """Periodically scrape /metrics and update throughput via delta calculation."""
        try:
            return await self._collect_metrics_loop(instance_id)
        except asyncio.CancelledError:
            pass

    async def _collect_metrics_loop(self, instance_id: str) -> None:
        instance = self.get(instance_id)
        port = instance.config.port
        scrap = instance._metrics_scrap_state

        while instance.state in (ProcessState.STARTING, ProcessState.RUNNING):
            data = await scrape_full_metrics(port)
            if data is None:
                await asyncio.sleep(self.METRICS_INTERVAL)
                continue

            now = time.time()
            # Update non-throughput metrics directly
            instance.metrics.requests_active = data["running_reqs"]
            instance.metrics.requests_waiting = data["waiting_reqs"]
            instance.metrics.gpu_cache_usage = data["kv_cache_usage"]
            instance.metrics.total_tokens = (
                data["prompt_tokens"] + data["generation_tokens"]
            )

            # Delta-based throughput (decode only; prefill comes from log parsing)
            if scrap.last_scrape_time > 0:
                dt = now - scrap.last_scrape_time
                if dt > 0.5:  # ignore tiny intervals
                    dg = data["generation_tokens"] - scrap.last_generation_tokens
                    raw_decode = dg / dt
                    if scrap.decode_throughput == 0:
                        scrap.decode_throughput = raw_decode
                    else:
                        a = self.METRICS_ALPHA
                        scrap.decode_throughput = a * raw_decode + (1 - a) * scrap.decode_throughput

                    instance.metrics.decode_throughput = scrap.decode_throughput
                    instance.metrics.timestamp = now
                    for cb in instance._metrics_callbacks:
                        await cb(instance)

            scrap.last_prompt_tokens = data["prompt_tokens"]
            scrap.last_generation_tokens = data["generation_tokens"]
            scrap.last_scrape_time = now
            scrap.running_reqs = data["running_reqs"]
            scrap.waiting_reqs = data["waiting_reqs"]
            scrap.kv_cache_usage = data["kv_cache_usage"]

            await asyncio.sleep(self.METRICS_INTERVAL)
