import asyncio
import json
import re
import time
from pathlib import Path
from typing import Optional

import httpx
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel

from instance_manager import InstanceManager, VLLMConfig, ProcessState
from model_scanner import ModelScanner
from vram_checker import VRAMChecker
from config_store import ConfigStore
from log_parser import parse_log_line, get_error_details

app = FastAPI(title="vLLM Launcher")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Core services ---
manager = InstanceManager()
model_scanner = ModelScanner()
vram_checker = VRAMChecker()
config_store = ConfigStore()

# --- Per-instance log buffers and WebSocket clients ---
log_buffers: dict[str, list[dict]] = {}
ws_clients: dict[str, set[WebSocket]] = {}
MAX_LOG_BUFFER = 5000


def _get_log_buffer(instance_id: str) -> list[dict]:
    if instance_id not in log_buffers:
        log_buffers[instance_id] = []
    return log_buffers[instance_id]


def _get_ws_clients(instance_id: str) -> set[WebSocket]:
    if instance_id not in ws_clients:
        ws_clients[instance_id] = set()
    return ws_clients[instance_id]


# --- Pydantic request models ---

class CreateInstanceRequest(BaseModel):
    model: str
    tensor_parallel_size: int = 1
    port: int = 8000
    host: str = "0.0.0.0"
    gpu_memory_utilization: float = 0.9
    max_model_len: Optional[int] = None
    quantization: Optional[str] = None
    dtype: Optional[str] = None
    trust_remote_code: bool = False
    enforce_eager: bool = False
    seed: Optional[int] = None
    max_num_seqs: Optional[int] = None
    max_num_batched_tokens: Optional[int] = None
    swap_space: int = 4
    extra_args: str = ""


class SavePresetRequest(BaseModel):
    name: str
    config: dict


# --- WebSocket broadcast helpers ---

async def broadcast_to_instance(instance_id: str, message: dict):
    """Send a message to all WebSocket clients connected to a specific instance."""
    clients = _get_ws_clients(instance_id)
    dead = set()
    payload = json.dumps(message)
    for client in clients:
        try:
            await client.send_text(payload)
        except Exception:
            dead.add(client)
    clients.difference_update(dead)


# --- Log handler factory ---

def make_log_handler(instance_id: str):
    """Create a log handler callback for a specific instance."""

    async def log_handler(line: str, stream: str):
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

        buffer = _get_log_buffer(instance_id)
        buffer.append(log_entry)
        if len(buffer) > MAX_LOG_BUFFER:
            buffer.pop(0)

        await broadcast_to_instance(instance_id, log_entry)

        # Handle metrics
        if event.metrics:
            instance = manager.get(instance_id)
            if "prefill_throughput" in event.metrics:
                instance.metrics.prefill_throughput = event.metrics["prefill_throughput"]
                instance.metrics.timestamp = time.time()
            if "decode_throughput" in event.metrics:
                instance.metrics.decode_throughput = event.metrics["decode_throughput"]
                instance.metrics.timestamp = time.time()
            if "requests_active" in event.metrics:
                instance.metrics.requests_active = event.metrics["requests_active"]
            if "requests_waiting" in event.metrics:
                instance.metrics.requests_waiting = event.metrics["requests_waiting"]
            if "gpu_cache_usage" in event.metrics:
                instance.metrics.gpu_cache_usage = event.metrics["gpu_cache_usage"]
            if "load_time" in event.metrics:
                instance.load_time = event.metrics["load_time"]
                instance.model_loaded = True

            await broadcast_to_instance(instance_id, {
                "type": "metrics",
                "data": {
                    "prefill_throughput": instance.metrics.prefill_throughput,
                    "decode_throughput": instance.metrics.decode_throughput,
                    "total_tokens": instance.metrics.total_tokens,
                    "requests_active": instance.metrics.requests_active,
                    "requests_waiting": instance.metrics.requests_waiting,
                    "gpu_cache_usage": instance.metrics.gpu_cache_usage,
                    "timestamp": instance.metrics.timestamp,
                },
            })

        # Handle status changes
        if event.type == "status":
            if "Server is ready" in event.message:
                instance = manager.get(instance_id)
                instance.state = ProcessState.RUNNING
                await broadcast_to_instance(instance_id, {
                    "type": "status",
                    "data": instance.get_status(),
                })

        # Handle errors
        if event.type == "error":
            error_type = event.metrics.get("error_type", "unknown") if event.metrics else "unknown"
            error_info = get_error_details(error_type)
            await broadcast_to_instance(instance_id, {
                "type": "error",
                "data": {
                    "error_type": error_type,
                    "message": line,
                    **error_info,
                },
            })

    return log_handler


# --- Instance API routes ---

@app.post("/api/instances")
async def create_instance(req: CreateInstanceRequest):
    """Create and start a new vLLM instance."""
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
        enforce_eager=req.enforce_eager,
        seed=req.seed,
        max_num_seqs=req.max_num_seqs,
        max_num_batched_tokens=req.max_num_batched_tokens,
        swap_space=req.swap_space,
        extra_args=req.extra_args,
    )

    instance_id = manager.create(config)

    # Register log callback for this instance
    instance = manager.get(instance_id)
    instance._log_callbacks.append(make_log_handler(instance_id))

    # Initialize log buffer and ws clients for this instance
    _get_log_buffer(instance_id)
    _get_ws_clients(instance_id)

    success = await manager.start(instance_id)
    return {
        "instance_id": instance_id,
        "success": success,
        "status": instance.get_status(),
    }


@app.get("/api/instances")
async def list_instances():
    """List all instances."""
    return [inst.get_status() for inst in manager.list_all()]


@app.get("/api/instances/{instance_id}")
async def get_instance(instance_id: str):
    """Get a single instance's status."""
    try:
        instance = manager.get(instance_id)
    except KeyError:
        raise HTTPException(status_code=404, detail=f"Instance {instance_id} not found")
    return instance.get_status()


@app.post("/api/instances/{instance_id}/stop")
async def stop_instance(instance_id: str):
    """Stop a running instance."""
    try:
        await manager.stop(instance_id)
        instance = manager.get(instance_id)
        await broadcast_to_instance(instance_id, {
            "type": "status",
            "data": instance.get_status(),
        })
        return {"success": True, "status": instance.get_status()}
    except KeyError:
        raise HTTPException(status_code=404, detail=f"Instance {instance_id} not found")


@app.delete("/api/instances/{instance_id}")
async def delete_instance(instance_id: str):
    """Stop and delete an instance."""
    try:
        await manager.stop(instance_id)
    except KeyError:
        raise HTTPException(status_code=404, detail=f"Instance {instance_id} not found")

    # Clean up per-instance data
    log_buffers.pop(instance_id, None)
    ws_clients.pop(instance_id, None)
    manager.remove(instance_id)
    return {"success": True}


# --- Model API routes ---

@app.get("/api/models/scan")
async def scan_models(path: str = Query(..., description="Directory path to scan")):
    """Scan a directory for local models."""
    models = await model_scanner.scan(path)
    return [
        {
            "name": m.name,
            "path": m.path,
            "size_gb": m.size_gb,
            "format": m.format,
            "param_count": m.param_count,
        }
        for m in models
    ]


@app.get("/api/models/vram-check")
async def check_vram(
    model_path: str = Query(...),
    dtype: str = Query("float16"),
    tp_size: int = Query(1),
):
    """Check VRAM feasibility for a model."""
    # Extract param_billions from model path using regex
    match = re.search(r"(\d+\.?\d*)[Bb]", model_path)
    if not match:
        raise HTTPException(
            status_code=400,
            detail="Could not determine parameter count from model path. "
                   "Path should contain a pattern like '7B' or '13b'.",
        )
    param_billions = float(match.group(1))
    result = vram_checker.check_feasibility(param_billions, dtype=dtype, tp_size=tp_size)
    return {
        "feasible": result.feasible,
        "estimated_gb": round(result.estimated_gb, 2),
        "available_gb": round(result.available_gb, 2),
        "utilization_pct": round(result.utilization_pct, 1),
        "suggestion": result.suggestion,
    }


# --- Preset API routes ---

@app.get("/api/presets")
async def list_presets():
    """List all saved presets."""
    return config_store.list_all()


@app.post("/api/presets")
async def save_preset(req: SavePresetRequest):
    """Save a preset."""
    config_store.save(req.name, req.config)
    return {"success": True}


@app.delete("/api/presets/{name}")
async def delete_preset(name: str):
    """Delete a preset."""
    config_store.delete(name)
    return {"success": True}


# --- GPU API routes ---

@app.get("/api/gpu")
async def get_gpu_info():
    """Get GPU information from nvidia-smi."""
    gpus = vram_checker.get_gpus()
    return [
        {
            "index": g.index,
            "name": g.name,
            "memory_total_gb": round(g.memory_total_gb, 2),
            "memory_used_gb": round(g.memory_used_gb, 2),
            "memory_free_gb": round(g.memory_free_gb, 2),
        }
        for g in gpus
    ]


# --- Chat Proxy ---

@app.post("/api/chat/{instance_id}")
async def chat_proxy(instance_id: str, request: dict):
    """Proxy a chat completion request to a running instance's vLLM OpenAI API."""
    try:
        instance = manager.get(instance_id)
    except KeyError:
        raise HTTPException(status_code=404, detail=f"Instance {instance_id} not found")

    if instance.state != ProcessState.RUNNING:
        raise HTTPException(
            status_code=400,
            detail=f"Instance {instance_id} is not running (state: {instance.state.value})",
        )

    port = instance.config.port
    url = f"http://localhost:{port}/v1/chat/completions"

    async with httpx.AsyncClient(timeout=300.0) as client:
        try:
            response = await client.post(url, json=request)
            return response.json()
        except httpx.ConnectError:
            raise HTTPException(
                status_code=502,
                detail=f"Could not connect to vLLM on port {port}",
            )
        except Exception as e:
            raise HTTPException(status_code=502, detail=str(e))


# --- WebSocket ---

@app.websocket("/ws/{instance_id}")
async def websocket_endpoint(websocket: WebSocket, instance_id: str):
    """Real-time logs and metrics for a specific instance."""
    await websocket.accept()

    # Verify instance exists
    try:
        instance = manager.get(instance_id)
    except KeyError:
        await websocket.send_text(json.dumps({
            "type": "error",
            "data": {"message": f"Instance {instance_id} not found"},
        }))
        await websocket.close()
        return

    clients = _get_ws_clients(instance_id)
    clients.add(websocket)

    # Send current status on connect
    await websocket.send_text(json.dumps({
        "type": "status",
        "data": instance.get_status(),
    }))

    # Send buffered logs
    buffer = _get_log_buffer(instance_id)
    for entry in buffer[-200:]:
        await websocket.send_text(json.dumps(entry))

    try:
        while True:
            data = await websocket.receive_text()
            # Client messages are optional; we can handle commands here if needed
            try:
                msg = json.loads(data)
                if msg.get("action") == "stop":
                    await manager.stop(instance_id)
                    await broadcast_to_instance(instance_id, {
                        "type": "status",
                        "data": instance.get_status(),
                    })
            except json.JSONDecodeError:
                pass

    except WebSocketDisconnect:
        clients.discard(websocket)
    except Exception:
        clients.discard(websocket)


# --- Serve frontend static files ---

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
