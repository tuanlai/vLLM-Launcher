"""GPU info and port cleanup API routes."""

import asyncio
import logging
import os
import signal
import time

import psutil
from fastapi import APIRouter
from pathlib import Path as P

from instance_manager import InstanceManager
from vram_checker import VRAMChecker

logger = logging.getLogger(__name__)


def create_gpu_router(manager: InstanceManager, vram_checker: VRAMChecker) -> APIRouter:
    router = APIRouter(tags=["gpu"])

    @router.get("/api/gpu")
    async def get_gpu_info():
        gpus = await vram_checker.get_gpus()
        return [
            {
                "index": g.index,
                "name": g.name,
                "memory_total_gb": round(g.memory_total_gb, 2),
                "memory_used_gb": round(g.memory_used_gb, 2),
                "memory_free_gb": round(g.memory_free_gb, 2),
                "temperature_c": g.temperature_c,
                "power_draw_w": round(g.power_draw_w, 1),
                "power_limit_w": round(g.power_limit_w, 1),
                "utilization_gpu_pct": g.utilization_gpu_pct,
                "utilization_mem_pct": g.utilization_mem_pct,
                "fan_speed_pct": g.fan_speed_pct,
            }
            for g in gpus
        ]

    @router.post("/api/ports/clean")
    async def clean_orphan_ports():
        tracked_pids = {inst.pid for inst in manager.list_all() if inst.pid}
        tracked_pids.add(os.getpid())

        orphans = []
        for proc in psutil.process_iter(["pid", "cmdline"]):
            try:
                cmdline = proc.info.get("cmdline") or []
                if len(cmdline) < 3:
                    continue
                try:
                    serve_idx = cmdline.index("serve")
                except ValueError:
                    continue
                vllm_bin = cmdline[serve_idx - 1]
                if "vllm" not in P(vllm_bin).name:
                    continue

                pid = proc.info["pid"]
                if pid in tracked_pids:
                    continue

                port = None
                i = 0
                while i < len(cmdline):
                    if cmdline[i] == "--port" and i + 1 < len(cmdline):
                        try:
                            port = int(cmdline[i + 1])
                        except ValueError:
                            pass
                        break
                    i += 1

                try:
                    connections = proc.net_connections("tcp")
                    listening_ports = [
                        c.laddr.port for c in connections
                        if c.status == "LISTENING" and c.laddr.port
                    ]
                except (psutil.AccessDenied, Exception):
                    listening_ports = []

                model = ""
                if serve_idx + 1 < len(cmdline):
                    model = cmdline[serve_idx + 1]

                orphans.append({
                    "pid": pid,
                    "port": port or (listening_ports[0] if listening_ports else None),
                    "model": model,
                    "listening_ports": listening_ports,
                })
            except (psutil.NoSuchProcess, psutil.AccessDenied, IndexError):
                continue

        if orphans:
            killed = []
            for orphan in orphans:
                try:
                    # Try graceful SIGTERM first, then escalate to SIGKILL
                    os.kill(orphan["pid"], signal.SIGTERM)
                    # Wait up to 3 seconds for graceful shutdown
                    deadline = time.monotonic() + 3
                    while time.monotonic() < deadline:
                        if not psutil.pid_exists(orphan["pid"]):
                            break
                        await asyncio.sleep(0.2)
                    else:
                        # Process still alive, escalate to SIGKILL
                        try:
                            os.kill(orphan["pid"], signal.SIGKILL)
                        except ProcessLookupError:
                            pass
                    killed.append(orphan)
                except ProcessLookupError:
                    pass
                except PermissionError:
                    orphan["kill_error"] = "Permission denied"
                    killed.append(orphan)

            return {
                "found": len(orphans),
                "killed": len([k for k in killed if not k.get("kill_error")]),
                "orphans": orphans,
            }

        return {"found": 0, "killed": 0, "orphans": []}

    return router
