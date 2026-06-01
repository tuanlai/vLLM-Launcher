import re
from dataclasses import dataclass
from typing import Optional


@dataclass
class LogEvent:
    type: str  # "info", "warning", "error", "metric", "status"
    message: str
    raw: str
    metrics: Optional[dict] = None


# vLLM throughput log patterns:
# "Avg prompt throughput: 1234.5 tokens/s"
# "Avg prompt throughput: 1234.5 tok/s"
# "prompt throughput: 1234.5 tokens/s"
_PREFILL_THROUGHPUT_RE = re.compile(
    r"(?:prompt|prefill)\s+throughput:\s+([\d.]+)\s+(?:tokens?|tok)/s",
    re.IGNORECASE,
)


# Patterns for vLLM log output — only status and error detection.
# Throughput metrics now come from Prometheus scraping.
PATTERNS = {
    "server_ready": re.compile(
        r"Started server process|Uvicorn running on|Application startup complete"
    ),
    "model_loaded": re.compile(
        r"Model loaded (?:successfully)?(?:\s+in\s+([\d.]+)s)?|Loading model.*took\s+([\d.]+)"
    ),
    "oom": re.compile(
        r"CUDA out of memory|torch\.OutOfMemoryError|RuntimeError: CUDA error.*out of memory",
        re.IGNORECASE,
    ),
    "port_conflict": re.compile(
        r"Address already in use|OSError:.*\bErrno 98\b|errno 98",
        re.IGNORECASE,
    ),
    "model_not_found": re.compile(
        r"OSError:.*not found|HFValidationError|RepositoryNotFoundError|is not a valid model",
        re.IGNORECASE,
    ),
    "nccl_error": re.compile(
        r"NCCL|RuntimeError:.*NCCL|Connection refused.*nccl",
        re.IGNORECASE,
    ),
    "permission_error": re.compile(
        r"PermissionError|Access denied|Permission denied",
        re.IGNORECASE,
    ),
    "cuda_error": re.compile(
        r"RuntimeError: CUDA error|CUDA kernel errors|no kernel image",
        re.IGNORECASE,
    ),
    "import_error": re.compile(
        r"ModuleNotFoundError|ImportError",
        re.IGNORECASE,
    ),
}


def parse_log_line(line: str) -> LogEvent:
    """Parse a single vLLM log line for status and error events.

    Note: throughput metrics are now collected via Prometheus scraping.
    """
    # Check for errors first
    for pattern_name in ["oom", "port_conflict", "model_not_found", "nccl_error",
                         "permission_error", "cuda_error", "import_error"]:
        if PATTERNS[pattern_name].search(line):
            return LogEvent(
                type="error",
                message=line,
                raw=line,
                metrics={"error_type": pattern_name},
            )

    # Check for status events
    if PATTERNS["server_ready"].search(line):
        return LogEvent(type="status", message="Server is ready", raw=line)

    load_match = PATTERNS["model_loaded"].search(line)
    if load_match:
        load_time = None
        for g in load_match.groups():
            if g:
                load_time = float(g)
                break
        return LogEvent(
            type="status",
            message="Model loaded" + (f" in {load_time}s" if load_time else ""),
            raw=line,
            metrics={"load_time": load_time} if load_time else None,
        )

    # Check for warnings
    if "WARNING" in line or "WARN" in line:
        return LogEvent(type="warning", message=line, raw=line)

    # Default: info
    return LogEvent(type="info", message=line, raw=line)


def get_error_details(error_type: str) -> dict:
    """Get human-readable error details and remediation suggestions."""
    details = {
        "oom": {
            "title": "Out of Memory (OOM)",
            "description": "GPU ran out of memory while loading or running the model.",
            "suggestions": [
                "Reduce --max-model-len to limit context window",
                "Enable quantization (--quantization awq or gptq)",
                "Lower --gpu-memory-utilization (e.g., 0.85)",
                "Use a smaller model variant",
                "Increase --tensor-parallel-size across more GPUs",
            ],
            "severity": "critical",
        },
        "port_conflict": {
            "title": "Port Already in Use",
            "description": "The specified port is already occupied by another process.",
            "suggestions": [
                "Choose a different --port value",
                "Kill the process using the port: lsof -i :<port>",
                "Wait for the port to be released",
            ],
            "severity": "critical",
        },
        "model_not_found": {
            "title": "Model Not Found",
            "description": "The specified model could not be found or loaded.",
            "suggestions": [
                "Check the model ID/path is correct",
                "Ensure you have access to gated models (HuggingFace token)",
                "For local models, verify the path exists",
                "Try --trust-remote-code for custom models",
            ],
            "severity": "critical",
        },
        "nccl_error": {
            "title": "NCCL Communication Error",
            "description": "Multi-GPU communication failed.",
            "suggestions": [
                "Check all GPUs are visible: nvidia-smi",
                "Verify NCCL installation",
                "Try setting NCCL_P2P_DISABLE=1",
                "Reduce --tensor-parallel-size",
            ],
            "severity": "critical",
        },
        "cuda_error": {
            "title": "CUDA Error",
            "description": "A CUDA runtime error occurred.",
            "suggestions": [
                "Update NVIDIA drivers",
                "Check CUDA toolkit version compatibility",
                "Verify GPU compute capability with the model",
                "Try --dtype float16 or --dtype bfloat16",
            ],
            "severity": "critical",
        },
        "permission_error": {
            "title": "Permission Error",
            "description": "Insufficient permissions to access model files or resources.",
            "suggestions": [
                "Check file permissions on model directory",
                "Run with appropriate user permissions",
                "Verify HuggingFace cache directory access",
            ],
            "severity": "critical",
        },
        "import_error": {
            "title": "Import Error",
            "description": "A required Python module is missing or incompatible.",
            "suggestions": [
                "Reinstall vllm: pip install vllm",
                "Check Python version compatibility",
                "Install missing dependencies",
            ],
            "severity": "critical",
        },
    }
    return details.get(error_type, {
        "title": "Unknown Error",
        "description": "An unexpected error occurred.",
        "suggestions": ["Check the logs for more details"],
        "severity": "critical",
    })


def extract_prefill_throughput(line: str) -> Optional[float]:
    """Extract prefill throughput (tokens/s) from a vLLM log line.

    Returns the throughput value if found, None otherwise.
    Matches patterns like:
        Avg prompt throughput: 1234.5 tokens/s
        prompt throughput: 1234.5 tok/s
        prefill throughput: 1234.5 tokens/s
    """
    m = _PREFILL_THROUGHPUT_RE.search(line)
    if m:
        try:
            return float(m.group(1))
        except (ValueError, IndexError):
            pass
    return None
