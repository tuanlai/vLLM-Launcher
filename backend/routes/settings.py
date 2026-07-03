"""Settings, presets, capabilities, and version API routes."""

import asyncio
import json
import logging
import os
from pathlib import Path

from fastapi import APIRouter, HTTPException

from instance_manager import InstanceManager
from config_store import ConfigStore
from schemas import SavePresetRequest, UpdateSettingsRequest
from typing import Any
import sys

logger = logging.getLogger(__name__)


def create_settings_router(manager: InstanceManager, config_store: ConfigStore) -> APIRouter:
    router = APIRouter(tags=["settings"])

    # --- Dynamic capabilities from installed vLLM ---

    _VLLM_CAPABILITIES_SCRIPT = '''
import json
from typing import get_args
result = {}
try:
    from vllm.model_executor.layers.quantization import (
        QUANTIZATION_METHODS,
        DEPRECATED_QUANTIZATION_METHODS,
    )
    result["quantization_methods"] = [
        m for m in QUANTIZATION_METHODS if m not in DEPRECATED_QUANTIZATION_METHODS
    ]
except Exception as e:
    result["quantization_methods"] = None
    result["quantization_error"] = str(e)
try:
    from vllm.model_executor.model_loader import LoadFormats
    result["load_formats"] = list(get_args(LoadFormats))
except Exception as e:
    result["load_formats"] = None
    result["load_formats_error"] = str(e)
try:
    from vllm.config.model import ModelDType
    result["dtypes"] = list(get_args(ModelDType))
except Exception as e:
    result["dtypes"] = None
    result["dtypes_error"] = str(e)
try:
    from vllm.config.cache import CacheDType
    result["kv_cache_dtypes"] = list(get_args(CacheDType))
except Exception as e:
    result["kv_cache_dtypes"] = None
    result["kv_cache_dtypes_error"] = str(e)
try:
    from vllm.tool_parsers import ToolParserManager
    result["tool_call_parsers"] = ToolParserManager.list_registered()
except Exception as e:
    result["tool_call_parsers"] = None
    result["tool_call_parsers_error"] = str(e)
print(json.dumps(result))
'''

    @router.get("/api/capabilities")
    async def get_capabilities():
        """Detect supported vLLM parameter values from the installed package."""
        py = manager.python_path or None
        if not py or not Path(py).exists():
            # Fallback to launcher's own python — the same env running FastAPI
            py = sys.executable

        caps: dict[str, Any] = {}
        try:
            proc = await asyncio.wait_for(
                asyncio.create_subprocess_exec(
                    py, "-c", _VLLM_CAPABILITIES_SCRIPT,
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.PIPE,
                ),
                timeout=15,
            )
            stdout, stderr = await proc.communicate()
            if proc.returncode == 0:
                caps = json.loads(stdout.decode())
            else:
                logger.warning(
                    "vLLM capabilities detection failed (%s): %s",
                    py,
                    stderr.decode(errors="replace"),
                )
        except Exception:
            logger.exception("Failed to detect vLLM capabilities")
        return caps or None

    # --- Existing endpoints ---

    @router.get("/api/presets")
    async def list_presets():
        return {"presets": config_store.list_all()}

    @router.post("/api/presets")
    async def save_preset(req: SavePresetRequest):
        await config_store.save(req.name, req.config)
        return {"success": True}

    @router.delete("/api/presets/{name}")
    async def delete_preset(name: str):
        await config_store.delete(name)
        return {"success": True}

    @router.get("/api/version")
    async def get_vllm_version():
        try:
            proc = await asyncio.create_subprocess_exec(
                manager.python_path, "-c", "import vllm; print(vllm.__version__)",
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            stdout, _ = await asyncio.wait_for(proc.communicate(), timeout=10)
            version = stdout.decode().strip() if proc.returncode == 0 else None
        except Exception:
            version = None
        return {
            "vllm_version": version,
            "python_path": manager.python_path,
        }

    @router.get("/api/settings")
    async def get_settings():
        settings = config_store.get_settings()
        default_model_dir = str(Path.home() / "Models")
        return {
            "python_path": settings.get("python_path", manager.python_path),
            "model_scan_path": settings.get("model_scan_path", default_model_dir),
        }

    @router.post("/api/settings")
    async def update_settings(req: UpdateSettingsRequest):
        if req.python_path is not None:
            python_file = Path(req.python_path)
            if not python_file.exists():
                raise HTTPException(
                    status_code=400,
                    detail=f"Python path does not exist: {req.python_path}",
                )
            vllm_bin = python_file.parent / "vllm"
            if not vllm_bin.exists():
                raise HTTPException(
                    status_code=400,
                    detail=f"vLLM binary not found at: {vllm_bin}",
                )
            await config_store.set_setting("python_path", req.python_path)
            manager.python_path = req.python_path

        if req.model_scan_path is not None:
            model_dir = Path(req.model_scan_path)
            if not model_dir.exists():
                raise HTTPException(
                    status_code=400,
                    detail=f"Model directory does not exist: {req.model_scan_path}",
                )
            await config_store.set_setting("model_scan_path", req.model_scan_path)

        return {"success": True}

    return router
