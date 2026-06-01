import pytest
from unittest.mock import AsyncMock, patch, MagicMock

from metrics_scraper import parse_prometheus_text, scrape_full_metrics


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


class TestParsePrometheusText:
    def test_realistic_text(self):
        result = parse_prometheus_text(REALISTIC_PROMETHEUS_TEXT)
        assert result.prompt_tokens == 12345
        assert result.generation_tokens == 67890

    def test_scientific_notation(self):
        text = 'vllm:prompt_tokens_total 1.111753e+06\nvllm:generation_tokens_total 2.5e+04\n'
        result = parse_prometheus_text(text)
        assert result.prompt_tokens == 1111753
        assert result.generation_tokens == 25000

    def test_empty_text(self):
        result = parse_prometheus_text("")
        assert result.prompt_tokens == 0
        assert result.generation_tokens == 0

    def test_no_matching_metrics(self):
        text = "some_unrelated_metric 42\nanother_metric 100\n"
        result = parse_prometheus_text(text)
        assert result.prompt_tokens == 0
        assert result.generation_tokens == 0

    def test_with_label_sets(self):
        text = 'vllm:prompt_tokens_total{engine="0",model_name="model-a"} 999\nvllm:generation_tokens_total{engine="0",model_name="model-a"} 500\n'
        result = parse_prometheus_text(text)
        assert result.prompt_tokens == 999
        assert result.generation_tokens == 500


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
