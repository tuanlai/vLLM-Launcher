import logging
import re
from dataclasses import dataclass
from typing import Optional

import httpx

logger = logging.getLogger(__name__)


@dataclass
class MetricsScrapState:
    """Per-instance state for sliding-window throughput calculation."""
    # Smoothed throughput values (exponential moving average)
    prefill_throughput: float = 0.0
    decode_throughput: float = 0.0


# Prometheus counter regex — matches both gauge and counter formats
# vLLM exposes token counters as *_total with label sets, e.g.
#   vllm:prompt_tokens_total{engine="0",model_name="..."} 12345.0
# Large values use scientific notation (e.g. 1.111753e+06), so we handle [eE][+-]?\d+
_TOKEN_RE = re.compile(
    r"^vllm:(prompt_tokens|generation_tokens)_total(?:\{[^}]*\})?\s+(\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)$"
)
# Request/gauge metrics also carry label sets
_REQ_RUNNING_RE = re.compile(
    r"^vllm:num_requests_running(?:\{[^}]*\})?\s+([\d.]+(?:[eE][+-]?\d+)?)$"
)
_REQ_WAITING_RE = re.compile(
    r"^vllm:num_requests_waiting(?:\{[^}]*\})?\s+([\d.]+(?:[eE][+-]?\d+)?)$"
)
_KV_CACHE_RE = re.compile(
    r"^vllm:kv_cache_usage_perc(?:\{[^}]*\})?\s+([\d.]+(?:[eE][+-]?\d+)?)$"
)



async def scrape_full_metrics(port: int, timeout: float = 5.0) -> Optional[dict]:
    """Fetch all metrics we care about from a running vLLM instance."""
    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            resp = await client.get(f"http://localhost:{port}/metrics")
            if resp.status_code != 200:
                return None
    except Exception:
        logger.debug("Failed to scrape metrics on port %d", port, exc_info=True)
        return None

    data = {
        "prompt_tokens": 0,
        "generation_tokens": 0,
        "running_reqs": 0,
        "waiting_reqs": 0,
        "kv_cache_usage": 0.0,
    }
    for line in resp.text.splitlines():
        m = _TOKEN_RE.match(line)
        if m:
            key, val = m.group(1), int(float(m.group(2)))
            if key == "prompt_tokens":
                data["prompt_tokens"] = val
            elif key == "generation_tokens":
                data["generation_tokens"] = val
            continue
        m = _REQ_RUNNING_RE.match(line)
        if m:
            data["running_reqs"] = int(float(m.group(1)))
            continue
        m = _REQ_WAITING_RE.match(line)
        if m:
            data["waiting_reqs"] = int(float(m.group(1)))
            continue
        m = _KV_CACHE_RE.match(line)
        if m:
            data["kv_cache_usage"] = float(m.group(1))
            continue
    return data
