"""WebSocket endpoint for real-time instance logs and metrics."""

import json
import logging

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from instance_manager import InstanceManager
from websocket_manager import WebSocketManager

logger = logging.getLogger(__name__)


def create_ws_router(manager: InstanceManager, ws_manager: WebSocketManager) -> APIRouter:
    router = APIRouter(tags=["websocket"])

    @router.websocket("/ws/{instance_id}")
    async def websocket_endpoint(websocket: WebSocket, instance_id: str):
        await websocket.accept()

        try:
            instance = manager.get(instance_id)
        except KeyError:
            await websocket.send_text(json.dumps({
                "type": "error",
                "data": {"message": f"Instance {instance_id} not found"},
            }))
            await websocket.close()
            return

        clients = ws_manager.get_ws_clients(instance_id)
        clients.add(websocket)

        # Send current status on connect
        await websocket.send_text(json.dumps({
            "type": "status",
            "data": instance.get_status(),
        }))

        # Send buffered logs
        buffer = ws_manager.get_log_buffer(instance_id)
        for entry in list(buffer)[-200:]:
            await websocket.send_text(json.dumps(entry))

        try:
            while True:
                data = await websocket.receive_text()
                try:
                    msg = json.loads(data)
                    if msg.get("action") == "stop":
                        await manager.stop(instance_id)
                        await ws_manager.broadcast_status(instance_id, instance.get_status())
                except json.JSONDecodeError:
                    pass

        except WebSocketDisconnect:
            clients.discard(websocket)
        except Exception:
            logger.warning("WebSocket error for instance %s", instance_id, exc_info=True)
            clients.discard(websocket)

    return router
