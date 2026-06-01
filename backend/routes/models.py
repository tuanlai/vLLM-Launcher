"""Model scanning and VRAM check API routes."""

import re

from fastapi import APIRouter, HTTPException, Query

from model_scanner import ModelScanner
from vram_checker import VRAMChecker


def create_models_router(model_scanner: ModelScanner, vram_checker: VRAMChecker) -> APIRouter:
    router = APIRouter(tags=["models"])

    @router.get("/api/models/scan")
    async def scan_models(path: str = Query(..., description="Directory path to scan")):
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

    @router.get("/api/models/vram-check")
    async def check_vram(
        model_path: str = Query(...),
        dtype: str = Query("float16"),
        tp_size: int = Query(1),
    ):
        match = re.search(r"(\d+\.?\d*)[Bb]", model_path)
        if not match:
            raise HTTPException(
                status_code=400,
                detail="Could not determine parameter count from model path. "
                       "Path should contain a pattern like '7B' or '13b'.",
            )
        param_billions = float(match.group(1))
        result = await vram_checker.check_feasibility(param_billions, dtype=dtype, tp_size=tp_size)

        gpus = await vram_checker.get_gpus()
        total_vram = sum(g.memory_total_gb for g in gpus) if gpus else 0.0
        used_vram = sum(g.memory_used_gb for g in gpus) if gpus else 0.0
        free_vram = sum(g.memory_free_gb for g in gpus) if gpus else 0.0
        gpu_name = gpus[0].name if gpus else "Unknown"

        return {
            "feasible": result.feasible,
            "estimated_gb": round(result.estimated_gb, 2),
            "available_gb": round(result.available_gb, 2),
            "utilization_pct": round(result.utilization_pct, 1),
            "suggestion": result.suggestion,
            "total_vram_gb": round(total_vram, 2),
            "used_vram_gb": round(used_vram, 2),
            "free_vram_gb": round(free_vram, 2),
            "gpu_name": gpu_name,
        }

    return router
