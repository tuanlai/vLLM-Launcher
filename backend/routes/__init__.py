"""Route registry for vLLM Launcher API."""

from fastapi import FastAPI

from instance_manager import InstanceManager
from model_scanner import ModelScanner
from vram_checker import VRAMChecker
from config_store import ConfigStore
from websocket_manager import WebSocketManager

from .instances import create_instances_router
from .models import create_models_router
from .chat import create_chat_router
from .settings import create_settings_router
from .gpu import create_gpu_router
from .files import create_files_router
from .ws import create_ws_router
from .docker import create_docker_router


def register_routes(
    app: FastAPI,
    manager: InstanceManager,
    model_scanner: ModelScanner,
    vram_checker: VRAMChecker,
    config_store: ConfigStore,
    ws_manager: WebSocketManager,
) -> None:
    """Register all API routers on the FastAPI app."""
    app.include_router(create_instances_router(manager, ws_manager))
    app.include_router(create_models_router(model_scanner, vram_checker))
    app.include_router(create_chat_router(manager))
    app.include_router(create_settings_router(manager, config_store))
    app.include_router(create_gpu_router(manager, vram_checker))
    app.include_router(create_files_router())
    app.include_router(create_ws_router(manager, ws_manager))
    app.include_router(create_docker_router())

    @app.get("/api/health")
    async def health():
        return {"status": "ok", "instances": len(manager.list_all())}
