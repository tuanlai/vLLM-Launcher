"""GPU VRAM checking and model VRAM estimation."""

import subprocess
from dataclasses import dataclass, field
from typing import Optional


@dataclass
class GPUInfo:
    index: int
    name: str
    memory_total_gb: float
    memory_used_gb: float
    memory_free_gb: float
    temperature_c: float = 0.0
    power_draw_w: float = 0.0
    power_limit_w: float = 0.0
    utilization_gpu_pct: float = 0.0
    utilization_mem_pct: float = 0.0
    fan_speed_pct: float = 0.0


@dataclass
class VRAMCheck:
    feasible: bool
    estimated_gb: float
    available_gb: float
    utilization_pct: float
    suggestion: Optional[str] = None


BYTES_PER_PARAM = {
    "float32": 4,
    "float16": 2,
    "bfloat16": 2,
    "int8": 1,
    "awq": 0.5,
    "gptq": 0.5,
    "fp8": 1,
    "squeezellm": 0.5,
}

OVERHEAD_MULTIPLIER = 1.25


class VRAMChecker:
    def get_gpus(self) -> list[GPUInfo]:
        """Run nvidia-smi and parse CSV output to get GPU info."""
        def safe_float(val: str, default: float = 0.0) -> float:
            try:
                return float(val)
            except (ValueError, TypeError):
                return default

        try:
            result = subprocess.run(
                [
                    "nvidia-smi",
                    "--query-gpu=index,name,memory.total,memory.used,memory.free,"
                    "temperature.gpu,power.draw,power.limit,"
                    "utilization.gpu,utilization.memory,fan.speed",
                    "--format=csv,noheader,nounits",
                ],
                capture_output=True,
                text=True,
                check=True,
            )
            gpus = []
            for line in result.stdout.strip().splitlines():
                parts = [p.strip() for p in line.split(",")]
                if len(parts) >= 10:
                    gpus.append(
                        GPUInfo(
                            index=int(parts[0]),
                            name=parts[1],
                            memory_total_gb=safe_float(parts[2]) / 1024,
                            memory_used_gb=safe_float(parts[3]) / 1024,
                            memory_free_gb=safe_float(parts[4]) / 1024,
                            temperature_c=safe_float(parts[5]),
                            power_draw_w=safe_float(parts[6]),
                            power_limit_w=safe_float(parts[7]),
                            utilization_gpu_pct=safe_float(parts[8]),
                            utilization_mem_pct=safe_float(parts[9]),
                            fan_speed_pct=safe_float(parts[10]) if len(parts) > 10 else 0.0,
                        )
                    )
            return gpus
        except (subprocess.CalledProcessError, FileNotFoundError, ValueError):
            return []

    def estimate_vram_gb(self, param_billions: float, dtype: str = "float16") -> float:
        """Estimate VRAM needed based on parameter count and dtype."""
        bytes_per = BYTES_PER_PARAM.get(dtype, 2)
        raw_gb = param_billions * 1e9 * bytes_per / (1024**3)
        return raw_gb * OVERHEAD_MULTIPLIER

    def check_feasibility(
        self,
        param_billions: float,
        dtype: str = "float16",
        available_gb: Optional[float] = None,
        tp_size: int = 1,
    ) -> VRAMCheck:
        """Check if a model fits in available VRAM."""
        if available_gb is None:
            gpus = self.get_gpus()
            if not gpus:
                return VRAMCheck(
                    feasible=False,
                    estimated_gb=0.0,
                    available_gb=0.0,
                    utilization_pct=0.0,
                    suggestion="No GPUs detected",
                )
            available_gb = sum(g.memory_free_gb for g in gpus)

        estimated = self.estimate_vram_gb(param_billions, dtype)
        estimated_per_gpu = estimated / tp_size
        utilization = (estimated_per_gpu / available_gb) * 100 if available_gb > 0 else 0.0
        feasible = estimated_per_gpu <= available_gb * 0.95

        suggestion = None
        if not feasible:
            if param_billions >= 30:
                suggestion = "Consider quantization"
            else:
                suggestion = "Reduce --max-model-len or use quantization"

        return VRAMCheck(
            feasible=feasible,
            estimated_gb=estimated_per_gpu,
            available_gb=available_gb,
            utilization_pct=utilization,
            suggestion=suggestion,
        )
