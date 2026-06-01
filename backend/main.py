"""vLLM Launcher — FastAPI backend entry point.

Thin shell that wires together core services and registers route modules.
"""

import asyncio
import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, FileResponse
from fastapi.staticfiles import StaticFiles

from logging_config import setup_logging
from instance_manager import InstanceManager
from model_scanner import ModelScanner
from vram_checker import VRAMChecker
from config_store import ConfigStore
from websocket_manager import WebSocketManager
from routes import register_routes

setup_logging()
logger = logging.getLogger(__name__)

# --- Core services ---

manager = InstanceManager()
model_scanner = ModelScanner()
vram_checker = VRAMChecker()
config_store = ConfigStore()
ws_manager = WebSocketManager()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: recover running vLLM processes
    saved_path = config_store.get_setting("python_path")
    if saved_path:
        manager.python_path = saved_path
    recovered = manager.recover_running_instances()
    if recovered > 0:
        logger.info("Recovered %d running instance(s)", recovered)
        for inst in manager.list_all():
            ws_manager.get_log_buffer(inst.id)
            ws_manager.get_ws_clients(inst.id)
            inst._metrics_callbacks.append(ws_manager.make_metrics_handler(inst.id))
            inst._metrics_task = asyncio.create_task(
                manager._collect_metrics(inst.id)
            )

    yield

    # Shutdown: clean up WebSocket connections and stop all instances
    logger.info("Shutting down, cleaning up resources...")
    for instance_id, clients in ws_manager.ws_clients.items():
        for client in list(clients):
            try:
                await client.send_text('{"type":"error","data":{"message":"Server shutting down"}}')
                await client.close()
            except Exception:
                logger.debug("Error closing WebSocket during shutdown", exc_info=True)
        clients.clear()
    for inst in manager.list_all():
        if inst.state.value in ("running", "starting"):
            try:
                await manager.stop(inst.id)
            except Exception:
                logger.exception("Error stopping instance %s during shutdown", inst.id)


app = FastAPI(title="vLLM Launcher", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.exception("Unhandled exception on %s %s", request.method, request.url.path)
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error"},
    )


register_routes(app, manager, model_scanner, vram_checker, config_store, ws_manager)


# --- Serve frontend static files ---

frontend_dist = Path(__file__).parent.parent / "frontend" / "dist"
if frontend_dist.exists():
    app.mount("/assets", StaticFiles(directory=frontend_dist / "assets"), name="assets")

    @app.get("/{full_path:path}")
    async def serve_frontend(full_path: str):
        file_path = frontend_dist / full_path
        if file_path.exists() and file_path.is_file():
            return FileResponse(file_path, headers={"Cache-Control": "public, max-age=31536000, immutable"})
        return FileResponse(frontend_dist / "index.html", headers={"Cache-Control": "no-cache, no-store, must-revalidate"})


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001)
