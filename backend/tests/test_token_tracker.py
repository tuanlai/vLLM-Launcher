"""Tests for token_tracker module."""

import pytest
import tempfile
import shutil
from pathlib import Path

from token_tracker import TokenTracker


@pytest.fixture
def tracker():
    tmpdir = tempfile.mkdtemp()
    db_path = Path(tmpdir) / "test_usage.db"
    t = TokenTracker(db_path=db_path)
    yield t
    shutil.rmtree(tmpdir, ignore_errors=True)


def test_record_and_query_by_ip(tracker):
    tracker.record("192.168.1.1", "inst1", "model-a", 100, 200)
    tracker.record("192.168.1.2", "inst1", "model-a", 50, 100)

    ips = tracker.get_ip_list()
    assert len(ips) == 2
    first = [i for i in ips if i["ip"] == "192.168.1.1"][0]
    assert first["prompt_tokens"] == 100
    assert first["generation_tokens"] == 200
    assert first["requests"] == 1


def test_daily_summary(tracker):
    from datetime import datetime
    today = datetime.now().strftime("%Y-%m-%d")

    tracker.record("192.168.1.1", "inst1", "model-a", 100, 200)
    tracker.record("192.168.1.1", "inst1", "model-b", 300, 400)

    summary = tracker.get_daily_summary(date=today)
    assert len(summary) == 1
    assert summary[0]["prompt_tokens"] == 400
    assert summary[0]["generation_tokens"] == 600
    assert summary[0]["requests"] == 2


def test_model_list(tracker):
    tracker.record("192.168.1.1", "inst1", "model-a", 10, 10)
    tracker.record("192.168.1.1", "inst1", "model-b", 10, 10)

    models = tracker.get_model_list()
    assert "model-a" in models
    assert "model-b" in models


def test_reset_daily(tracker):
    from datetime import datetime
    today = datetime.now().strftime("%Y-%m-%d")

    tracker.record("192.168.1.1", "inst1", "model-a", 100, 200)
    assert len(tracker.get_ip_list(today)) == 1

    tracker.reset_daily(today)
    assert len(tracker.get_ip_list(today)) == 0


def test_ip_daily_trend(tracker):
    from datetime import datetime
    today = datetime.now().strftime("%Y-%m-%d")

    tracker.record("10.0.0.1", "inst1", "model-a", 500, 600)

    trend = tracker.get_ip_daily_trend(ip="10.0.0.1", start_date=today, end_date=today)
    assert len(trend) == 1
    assert trend[0]["prompt_tokens"] == 500
