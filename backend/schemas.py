"""Pydantic request/response models for the vLLM Launcher API."""

from typing import Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator


class CreateInstanceRequest(BaseModel):
    """Request body for creating a new vLLM instance."""
    model: str = Field(..., min_length=1, max_length=512)
    tensor_parallel_size: int = Field(default=1, ge=1, le=16)
    port: int = Field(default=8000, ge=1024, le=65535)
    host: str = "0.0.0.0"
    gpu_memory_utilization: float = Field(default=0.9, gt=0.0, le=1.0)
    max_model_len: Optional[int] = Field(default=None, ge=1)
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
    seed: Optional[int] = Field(default=None, ge=0)
    max_num_seqs: Optional[int] = Field(default=None, ge=1)
    max_num_batched_tokens: Optional[int] = Field(default=None, ge=1)
    swap_space: int = Field(default=4, ge=0, le=64)
    block_size: Optional[int] = Field(default=None, ge=1, le=512)
    enable_prefix_caching: Optional[bool] = None
    disable_log_stats: bool = False
    load_format: str = "auto"
    lora: Optional[str] = None
    served_model_name: Optional[str] = None
    extra_args: str = ""
    env_vars: Optional[dict[str, str]] = None

    # New Docker fields
    launch_mode: str = "direct"
    docker_image: str = ""
    docker_gpus: str = ""
    docker_shm_size: str = ""
    docker_network: str = "host"
    docker_ipc: str = "host"
    docker_volume_mounts: list[dict[str, str]] = Field(default_factory=list)

    @field_validator('extra_args')
    @classmethod
    def sanitize_extra_args(cls, v: str) -> str:
        dangerous = [';', '|', '&', '$', '`', '\n', '\r', '>', '<']
        for ch in dangerous:
            if ch in v:
                raise ValueError(f"extra_args contains forbidden character: {ch!r}")
        return v


class SavePresetRequest(BaseModel):
    """Request body for saving a configuration preset."""
    name: str
    config: dict


class UpdateSettingsRequest(BaseModel):
    """Request body for updating application settings."""
    python_path: Optional[str] = None
    model_scan_path: Optional[str] = None


class ChatRequest(BaseModel):
    """Request body for chat completion proxy (OpenAI-compatible).

    Uses extra='allow' so unknown fields are forwarded to vLLM.
    """
    model_config = ConfigDict(extra="allow")

    messages: list[dict]
    max_tokens: int = 512
    temperature: float = 0.7
    top_p: float = 1.0
    stream: bool = False
