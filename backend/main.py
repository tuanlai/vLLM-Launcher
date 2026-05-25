import asyncio
import json
import time
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel

from process_manager import VLLMProcessManager, VLLMConfig, ProcessState
from log_parser import parse_log_line, get_error_details

app = FastAPI(title="vLLM Launcher")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

manager = VLLMProcessManager()
connected_clients: set[WebSocket] = set()
log_buffer: list[dict] = []
MAX_LOG_BUFFER = 5000


class StartRequest(BaseModel):
    model: str
    tensor_parallel_size: int = 1
    port: int = 8000
    host: str = "0.0.0.0"
    gpu_memory_utilization: float = 0.9
    max_model_len: Optional[int] = None
    quantization: Optional[str] = None
    dtype: Optional[str] = None
    trust_remote_code: bool = False
    extra_args: str = ""


async def broadcast(message: dict):
    """Send a message to all connected WebSocket clients."""
    dead = set()
    payload = json.dumps(message)
    for client in connected_clients:
        try:
            await client.send_text(payload)
        except Exception:
            dead.add(client)
    connected_clients.difference_update(dead)


async def log_handler(line: str, stream: str):
    """Called by process_manager for each log line."""
    event = parse_log_line(line)
    timestamp = time.time()

    log_entry = {
        "type": "log",
        "data": {
            "timestamp": timestamp,
            "level": event.type,
            "message": line,
            "stream": stream,
        },
    }

    log_buffer.append(log_entry)
    if len(log_buffer) > MAX_LOG_BUFFER:
        log_buffer.pop(0)

    await broadcast(log_entry)

    # Handle metrics
    if event.metrics:
        if "prefill_throughput" in event.metrics:
            manager.update_metrics(prefill_throughput=event.metrics["prefill_throughput"])
        if "decode_throughput" in event.metrics:
            manager.update_metrics(decode_throughput=event.metrics["decode_throughput"])
        if "requests_active" in event.metrics:
            manager.update_metrics(requests_active=event.metrics["requests_active"])
        if "requests_waiting" in event.metrics:
            manager.update_metrics(requests_waiting=event.metrics["requests_waiting"])
        if "gpu_cache_usage" in event.metrics:
            manager.update_metrics(gpu_cache_usage=event.metrics["gpu_cache_usage"])
        if "load_time" in event.metrics:
            manager.info.load_time = event.metrics["load_time"]
            manager.info.model_loaded = True

        await broadcast({"type": "metrics", "data": manager.info.metrics.__dict__})

    # Handle status changes
    if event.type == "status":
        if "Server is ready" in event.message:
            manager.set_state(ProcessState.RUNNING)
            await broadcast({"type": "status", "data": manager.get_status()})

    # Handle errors
    if event.type == "error":
        error_type = event.metrics.get("error_type", "unknown") if event.metrics else "unknown"
        error_info = get_error_details(error_type)
        await broadcast({
            "type": "error",
            "data": {
                "error_type": error_type,
                "message": line,
                **error_info,
            },
        })


manager.on_log(log_handler)


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    connected_clients.add(websocket)

    # Send current status on connect
    await websocket.send_text(json.dumps({
        "type": "status",
        "data": manager.get_status(),
    }))

    # Send buffered logs
    for entry in log_buffer[-200:]:
        await websocket.send_text(json.dumps(entry))

    try:
        while True:
            data = await websocket.receive_text()
            msg = json.loads(data)

            if msg.get("action") == "start":
                config = VLLMConfig(**msg.get("config", {}))
                await manager.start(config)
                await broadcast({"type": "status", "data": manager.get_status()})

            elif msg.get("action") == "stop":
                await manager.stop()
                await broadcast({"type": "status", "data": manager.get_status()})

    except WebSocketDisconnect:
        connected_clients.discard(websocket)
    except Exception:
        connected_clients.discard(websocket)


@app.post("/api/start")
async def start_vllm(req: StartRequest):
    config = VLLMConfig(
        model=req.model,
        tensor_parallel_size=req.tensor_parallel_size,
        port=req.port,
        host=req.host,
        gpu_memory_utilization=req.gpu_memory_utilization,
        max_model_len=req.max_model_len,
        quantization=req.quantization,
        dtype=req.dtype,
        trust_remote_code=req.trust_remote_code,
        extra_args=req.extra_args,
    )
    success = await manager.start(config)
    await broadcast({"type": "status", "data": manager.get_status()})
    return {"success": success, "status": manager.get_status()}


@app.post("/api/stop")
async def stop_vllm():
    await manager.stop()
    await broadcast({"type": "status", "data": manager.get_status()})
    return {"success": True, "status": manager.get_status()}


@app.get("/api/status")
async def get_status():
    return manager.get_status()


@app.get("/api/logs")
async def get_logs(limit: int = 200):
    return {"logs": log_buffer[-limit:]}


# Serve frontend static files
frontend_dist = Path(__file__).parent.parent / "frontend" / "dist"
if frontend_dist.exists():
    app.mount("/assets", StaticFiles(directory=frontend_dist / "assets"), name="assets")

    @app.get("/{full_path:path}")
    async def serve_frontend(full_path: str):
        file_path = frontend_dist / full_path
        if file_path.exists() and file_path.is_file():
            return FileResponse(file_path)
        return FileResponse(frontend_dist / "index.html")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001)
