"""Docker status route for vLLM Launcher."""

import asyncio
import logging
from fastapi import APIRouter

logger = logging.getLogger(__name__)


def create_docker_router() -> APIRouter:
    router = APIRouter(tags=["docker"])

    @router.get("/api/docker/status")
    async def docker_status():
        """Check if docker is available and list running containers."""
        try:
            proc = await asyncio.create_subprocess_exec(
                "docker", "ps", "--format", "{{.ID}}:{{.Image}}:{{.Command}}",
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            stdout, _ = await proc.communicate()
            lines = stdout.decode().strip().split("\n")
            containers = []
            for line in lines:
                if not line:
                    continue
                cid, image, cmd = line.split(":", 2)
                containers.append({"id": cid, "image": image, "command": cmd})
            return {"available": True, "containers": containers}
        except (FileNotFoundError, asyncio.SubprocessError):
            logger.warning("Docker not available or error")
            return {"available": False, "containers": []}
    
    return router
