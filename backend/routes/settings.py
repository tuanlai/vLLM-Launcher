"""Settings, presets, and version API routes."""

import logging
import os
import subprocess
from pathlib import Path

from fastapi import APIRouter, HTTPException

from instance_manager import InstanceManager
from config_store import ConfigStore
from schemas import SavePresetRequest, UpdateSettingsRequest

logger = logging.getLogger(__name__)


def create_settings_router(manager: InstanceManager, config_store: ConfigStore) -> APIRouter:
    router = APIRouter(tags=["settings"])

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
            result = subprocess.run(
                [manager.python_path, "-c", "import vllm; print(vllm.__version__)"],
                capture_output=True,
                text=True,
                timeout=10,
            )
            version = result.stdout.strip() if result.returncode == 0 else None
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
