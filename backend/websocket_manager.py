"""WebSocket connection management and broadcast utilities."""

import json
import logging
import time
from collections import deque

from fastapi import WebSocket

from log_parser import parse_log_line, get_error_details

logger = logging.getLogger(__name__)

MAX_LOG_BUFFER = 5000


class WebSocketManager:
    """Manages per-instance WebSocket clients and log buffers."""

    def __init__(self):
        self.log_buffers: dict[str, deque[dict]] = {}
        self.ws_clients: dict[str, set[WebSocket]] = {}

    def get_log_buffer(self, instance_id: str) -> deque[dict]:
        if instance_id not in self.log_buffers:
            self.log_buffers[instance_id] = deque(maxlen=MAX_LOG_BUFFER)
        return self.log_buffers[instance_id]

    def get_ws_clients(self, instance_id: str) -> set[WebSocket]:
        if instance_id not in self.ws_clients:
            self.ws_clients[instance_id] = set()
        return self.ws_clients[instance_id]

    def remove_instance(self, instance_id: str) -> None:
        self.log_buffers.pop(instance_id, None)
        self.ws_clients.pop(instance_id, None)

    async def broadcast(self, instance_id: str, message: dict) -> None:
        """Send a message to all WebSocket clients connected to a specific instance."""
        clients = self.get_ws_clients(instance_id)
        dead = set()
        payload = json.dumps(message)
        for client in clients:
            try:
                await client.send_text(payload)
            except Exception:
                dead.add(client)
        clients.difference_update(dead)

    async def broadcast_status(self, instance_id: str, status: dict) -> None:
        """Broadcast a status update to all connected clients."""
        await self.broadcast(instance_id, {"type": "status", "data": status})

    def make_log_handler(self, instance_id: str, manager):
        """Create a log handler callback for a specific instance.

        Note: metrics (throughput, requests, cache) now come from Prometheus scraping.
        This handler only processes status events (server ready, model loaded) and errors.
        """
        from instance_manager import ProcessState

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

            buffer = self.get_log_buffer(instance_id)
            buffer.append(log_entry)

            await self.broadcast(instance_id, log_entry)

            # Handle status changes
            if event.type == "status":
                if "Server is ready" in event.message:
                    instance = manager.get(instance_id)
                    instance.state = ProcessState.RUNNING
                    await self.broadcast_status(instance_id, instance.get_status())
                elif "Model loaded" in event.message:
                    instance = manager.get(instance_id)
                    if event.metrics and "load_time" in event.metrics:
                        instance.load_time = event.metrics["load_time"]
                    instance.model_loaded = True

            # Handle errors
            if event.type == "error":
                error_type = event.metrics.get("error_type", "unknown") if event.metrics else "unknown"
                error_info = get_error_details(error_type)
                await self.broadcast(instance_id, {
                    "type": "error",
                    "data": {
                        "error_type": error_type,
                        "message": line,
                        **error_info,
                    },
                })

        return log_handler

    def make_metrics_handler(self, instance_id: str):
        """Create a metrics callback for the Prometheus-based metrics collector."""

        async def metrics_handler(instance):
            await self.broadcast(instance_id, {
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

        return metrics_handler
