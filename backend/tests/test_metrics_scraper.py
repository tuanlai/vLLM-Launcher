import pytest
from unittest.mock import AsyncMock, patch, MagicMock

from metrics_scraper import scrape_full_metrics


REALISTIC_PROMETHEUS_TEXT = """\
# HELP vllm:prompt_tokens_total Number of prefill tokens processed.
# TYPE vllm:prompt_tokens_total counter
vllm:prompt_tokens_total{engine="0",model_name="test-model"} 12345.0
# HELP vllm:generation_tokens_total Number of generation tokens processed.
# TYPE vllm:generation_tokens_total counter
vllm:generation_tokens_total{engine="0",model_name="test-model"} 67890.0
# HELP vllm:num_requests_running Number of requests currently running.
# TYPE vllm:num_requests_running gauge
vllm:num_requests_running{engine="0",model_name="test-model"} 3.0
# HELP vllm:num_requests_waiting Number of requests waiting to be processed.
# TYPE vllm:num_requests_waiting gauge
vllm:num_requests_waiting{engine="0",model_name="test-model"} 1.0
# HELP vllm:kv_cache_usage_perc KV-cache usage.
# TYPE vllm:kv_cache_usage_perc gauge
vllm:kv_cache_usage_perc{engine="0",model_name="test-model"} 0.42
"""


class TestScrapeFullMetrics:
    @pytest.mark.asyncio
    async def test_successful_response(self):
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.text = REALISTIC_PROMETHEUS_TEXT

        mock_client = AsyncMock()
        mock_client.get = AsyncMock(return_value=mock_response)
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)

        with patch("metrics_scraper.httpx.AsyncClient", return_value=mock_client):
            result = await scrape_full_metrics(port=8000)

        assert result is not None
        assert result["prompt_tokens"] == 12345
        assert result["generation_tokens"] == 67890
        assert result["running_reqs"] == 3
        assert result["waiting_reqs"] == 1
        assert result["kv_cache_usage"] == pytest.approx(0.42)

    @pytest.mark.asyncio
    async def test_failed_response_returns_none(self):
        mock_response = MagicMock()
        mock_response.status_code = 500

        mock_client = AsyncMock()
        mock_client.get = AsyncMock(return_value=mock_response)
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)

        with patch("metrics_scraper.httpx.AsyncClient", return_value=mock_client):
            result = await scrape_full_metrics(port=8000)

        assert result is None

    @pytest.mark.asyncio
    async def test_connection_error_returns_none(self):
        mock_client = AsyncMock()
        mock_client.get = AsyncMock(side_effect=Exception("Connection refused"))
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)

        with patch("metrics_scraper.httpx.AsyncClient", return_value=mock_client):
            result = await scrape_full_metrics(port=8000)

        assert result is None
