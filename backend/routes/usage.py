"""Token usage query API routes."""

from datetime import datetime
from fastapi import APIRouter, Query

from token_tracker import TokenTracker


def create_usage_router(tracker: TokenTracker) -> APIRouter:
    router = APIRouter(prefix="/api/usage", tags=["usage"])

    @router.get("/today")
    async def get_today():
        """Get today's usage grouped by IP."""
        today = datetime.now().strftime("%Y-%m-%d")
        return {"date": today, "ips": tracker.get_ip_list(today)}

    @router.get("/daily-trend")
    async def get_daily_trend(
        ip: str | None = Query(None),
        model: str | None = Query(None),
        start_date: str | None = Query(None),
        end_date: str | None = Query(None),
    ):
        """Get daily trend data grouped by date."""
        return tracker.get_ip_daily_trend(ip, model, start_date, end_date)

    @router.get("/by-ip")
    async def get_by_ip(
        ip: str,
        start_date: str | None = Query(None),
        end_date: str | None = Query(None),
    ):
        """Get usage for a specific IP over a date range."""
        rows = tracker.get_ip_daily_trend(ip, None, start_date, end_date)
        total_prompt = sum(r["prompt_tokens"] for r in rows)
        total_generation = sum(r["generation_tokens"] for r in rows)
        total_requests = sum(r["requests"] for r in rows)
        return {
            "ip": ip,
            "date_range": {"start": start_date, "end": end_date},
            "total_prompt_tokens": total_prompt,
            "total_generation_tokens": total_generation,
            "total_requests": total_requests,
            "daily": rows,
        }

    @router.get("/models")
    async def get_models(date: str | None = Query(None)):
        """Get list of distinct model names."""
        return {"models": tracker.get_model_list(date)}

    @router.post("/reset")
    async def reset_usage(date: str | None = Query(None)):
        """Reset usage for a specific date (default: today)."""
        tracker.reset_daily(date)
        return {"success": True, "date": date or datetime.now().strftime("%Y-%m-%d")}

    return router
