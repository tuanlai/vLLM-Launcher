"""File browser API route with path traversal protection."""

import logging
from pathlib import Path

from fastapi import APIRouter, HTTPException, Query

logger = logging.getLogger(__name__)

# Allowed root directories for the file browser
ALLOWED_ROOTS = [Path.home(), Path("/tmp"), Path("/mnt")]


def create_files_router() -> APIRouter:
    router = APIRouter(tags=["files"])

    @router.get("/api/files/browse")
    async def browse_files(
        path: str = Query("/"),
        mode: str = Query("dir"),
    ):
        target = Path(path).resolve()

        # Path traversal protection: only allow browsing under allowed roots
        if not any(target.is_relative_to(root) for root in ALLOWED_ROOTS):
            raise HTTPException(
                status_code=403,
                detail=f"Access denied: path must be under one of: {', '.join(str(r) for r in ALLOWED_ROOTS)}",
            )

        if not target.exists():
            raise HTTPException(status_code=404, detail=f"Path not found: {path}")

        if not target.is_dir():
            raise HTTPException(status_code=400, detail=f"Not a directory: {path}")

        entries = []
        try:
            for entry in sorted(target.iterdir(), key=lambda e: (not e.is_dir(), e.name.lower())):
                if entry.name.startswith("."):
                    continue
                try:
                    is_dir = entry.is_dir()
                    size = entry.stat().st_size if not is_dir else 0
                    entries.append({
                        "name": entry.name,
                        "path": str(entry),
                        "is_dir": is_dir,
                        "size": size,
                    })
                except (PermissionError, OSError):
                    continue
        except PermissionError:
            raise HTTPException(status_code=403, detail=f"Permission denied: {path}")

        return {
            "path": str(target),
            "parent": str(target.parent) if target.parent != target else None,
            "entries": entries,
        }

    return router
