"""Chat completion proxy API routes."""

import json
import logging

import httpx
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse

from instance_manager import InstanceManager, ProcessState
from schemas import ChatRequest

logger = logging.getLogger(__name__)


def create_chat_router(manager: InstanceManager) -> APIRouter:
    router = APIRouter(tags=["chat"])

    @router.post("/api/chat/{instance_id}")
    async def chat_proxy(instance_id: str, request: ChatRequest):
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
                response = await client.post(url, json=request.model_dump())
                return response.json()
            except httpx.ConnectError:
                raise HTTPException(
                    status_code=502,
                    detail=f"Could not connect to vLLM on port {port}",
                )
            except Exception as e:
                raise HTTPException(status_code=502, detail=str(e))

    @router.post("/api/chat/{instance_id}/stream")
    async def chat_proxy_stream(instance_id: str, request: ChatRequest):
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

        body = request.model_dump()
        body["stream"] = True

        async def event_generator():
            try:
                timeout = httpx.Timeout(connect=10.0, read=600.0, write=30.0, pool=10.0)
                async with httpx.AsyncClient(timeout=timeout) as client:
                    async with client.stream("POST", url, json=body) as response:
                        if response.status_code != 200:
                            raw = await response.aread()
                            try:
                                err = json.loads(raw)
                                msg = err.get("message", err.get("detail", raw.decode()))
                            except (json.JSONDecodeError, UnicodeDecodeError):
                                msg = raw.decode(errors="replace")
                            yield f'data: {{"error": {{"message": {json.dumps(msg)}, "type": "vllm_error"}}}}\n\n'
                            return
                        async for line in response.aiter_lines():
                            if line.startswith("data: "):
                                yield f"{line}\n\n"
                            elif line.strip() == "":
                                continue
            except httpx.ConnectError:
                yield f'data: {{"error": {{"message": "Could not connect to vLLM on port {port}", "type": "connection_error"}}}}\n\n'
            except Exception as e:
                logger.exception("Stream proxy error")
                yield f'data: {{"error": {{"message": {json.dumps(str(e))}, "type": "proxy_error"}}}}\n\n'

        return StreamingResponse(
            event_generator(),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
                "X-Accel-Buffering": "no",
            },
        )

    return router
