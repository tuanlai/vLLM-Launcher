"""Token usage tracker — persists per-request usage to SQLite."""

import sqlite3
import threading
from datetime import datetime
from pathlib import Path

DB_PATH = Path(__file__).parent.parent / "data" / "usage.db"


class TokenTracker:
    """Thread-safe SQLite-backed token usage tracker."""

    def __init__(self, db_path: Path | None = None):
        self._db_path = db_path or DB_PATH
        self._db_path.parent.mkdir(parents=True, exist_ok=True)
        self._lock = threading.Lock()
        self._init_db()

    def _get_conn(self) -> sqlite3.Connection:
        conn = sqlite3.connect(str(self._db_path))
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA journal_mode=WAL")
        return conn

    def _init_db(self):
        with self._lock:
            with self._get_conn() as conn:
                conn.execute("""
                    CREATE TABLE IF NOT EXISTS token_usage (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        ip TEXT NOT NULL,
                        instance_id TEXT,
                        model TEXT NOT NULL,
                        prompt_tokens INTEGER NOT NULL DEFAULT 0,
                        generation_tokens INTEGER NOT NULL DEFAULT 0,
                        timestamp DATETIME DEFAULT (strftime('%Y-%m-%T', 'now')),
                        date TEXT DEFAULT (strftime('%Y-%m-%d', 'now'))
                    )
                """)
                conn.execute("""
                    CREATE INDEX IF NOT EXISTS idx_usage_date ON token_usage(date)
                """)
                conn.execute("""
                    CREATE INDEX IF NOT EXISTS idx_usage_ip ON token_usage(ip)
                """)
                conn.execute("""
                    CREATE INDEX IF NOT EXISTS idx_usage_model ON token_usage(model)
                """)
                conn.commit()

    def record(self, ip: str, instance_id: str | None, model: str, prompt_tokens: int, generation_tokens: int):
        """Record a single request's token usage."""
        with self._lock:
            with self._get_conn() as conn:
                conn.execute(
                    """INSERT INTO token_usage (ip, instance_id, model, prompt_tokens, generation_tokens)
                       VALUES (?, ?, ?, ?, ?)""",
                    (ip, instance_id, model, prompt_tokens, generation_tokens),
                )
                conn.commit()

    # --- Query methods ---

    def get_daily_summary(
        self,
        ip: str | None = None,
        model: str | None = None,
        date: str | None = None,
    ) -> list[dict]:
        """Get aggregated usage grouped by date. Optionally filter by IP/model."""
        conditions = []
        params: list = []

        if ip:
            conditions.append("ip = ?")
            params.append(ip)
        if model:
            conditions.append("model = ?")
            params.append(model)
        if date:
            conditions.append("date = ?")
            params.append(date)

        where = (" WHERE " + " AND ".join(conditions)) if conditions else ""

        with self._get_conn() as conn:
            rows = conn.execute(
                f"""SELECT date, COALESCE(SUM(prompt_tokens), 0) AS prompt_tokens,
                           COALESCE(SUM(generation_tokens), 0) AS generation_tokens,
                           COUNT(*) AS requests
                    FROM token_usage{where}
                    GROUP BY date
                    ORDER BY date""",
                params,
            ).fetchall()
            return [dict(r) for r in rows]

    def get_ip_list(self, date: str | None = None) -> list[dict]:
        """Get list of unique IPs with today's (or specified date's) totals."""
        where = " WHERE date = ?" if date else ""
        params: list = [date] if date else []

        with self._get_conn() as conn:
            rows = conn.execute(
                f"""SELECT ip,
                           COALESCE(SUM(prompt_tokens), 0) AS prompt_tokens,
                           COALESCE(SUM(generation_tokens), 0) AS generation_tokens,
                           COUNT(*) AS requests,
                           GROUP_CONCAT(DISTINCT model) AS models
                    FROM token_usage{where}
                    GROUP BY ip
                    ORDER BY (prompt_tokens + generation_tokens) DESC""",
                params,
            ).fetchall()
            return [dict(r) for r in rows]

    def get_ip_daily_trend(
        self,
        ip: str | None = None,
        model: str | None = None,
        start_date: str | None = None,
        end_date: str | None = None,
    ) -> list[dict]:
        """Get daily trend data, optionally filtered by IP/model."""
        conditions = ["date >= ?", "date <= ?"]
        params: list = [start_date or "1970-01-01", end_date or "2100-01-01"]

        if ip:
            conditions.append("ip = ?")
            params.append(ip)
        if model:
            conditions.append("model = ?")
            params.append(model)

        with self._get_conn() as conn:
            rows = conn.execute(
                f"""SELECT date,
                          COALESCE(SUM(prompt_tokens), 0) AS prompt_tokens,
                          COALESCE(SUM(generation_tokens), 0) AS generation_tokens,
                          COUNT(*) AS requests
                   FROM token_usage
                   WHERE {" AND ".join(conditions)}
                   GROUP BY date
                   ORDER BY date""",
                params,
            ).fetchall()
            return [dict(r) for r in rows]

    def get_model_list(self, date: str | None = None) -> list[str]:
        """Get distinct model names, optionally for a specific date."""
        where = " WHERE date = ?" if date else ""
        params: list = [date] if date else []

        with self._get_conn() as conn:
            rows = conn.execute(
                f"""SELECT DISTINCT model FROM token_usage{where} ORDER BY model""",
                params,
            ).fetchall()
            return [r["model"] for r in rows]

    def reset_daily(self, date: str | None = None):
        """Delete records for a specific date (or today if not given)."""
        target = date or datetime.now().strftime("%Y-%m-%d")
        with self._lock:
            with self._get_conn() as conn:
                conn.execute("DELETE FROM token_usage WHERE date = ?", (target,))
                conn.commit()
