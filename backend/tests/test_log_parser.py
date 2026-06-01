import pytest

from log_parser import LogEvent, parse_log_line, get_error_details


class TestParseLogLine:
    def test_server_ready_started_process(self):
        event = parse_log_line("INFO: Started server process [12345]")
        assert event.type == "status"
        assert event.message == "Server is ready"

    def test_server_ready_uvicorn_running(self):
        event = parse_log_line("INFO: Uvicorn running on http://0.0.0.0:8000")
        assert event.type == "status"
        assert event.message == "Server is ready"

    def test_model_loaded_successfully(self):
        event = parse_log_line("Model loaded successfully in 12.3s")
        assert event.type == "status"
        assert event.metrics is not None
        assert event.metrics["load_time"] == pytest.approx(12.3)

    def test_loading_model_took(self):
        event = parse_log_line("Loading model took 5.2")
        assert event.type == "status"
        assert event.metrics is not None
        assert event.metrics["load_time"] == pytest.approx(5.2)

    def test_oom_error(self):
        event = parse_log_line("RuntimeError: CUDA out of memory")
        assert event.type == "error"
        assert event.metrics is not None
        assert event.metrics["error_type"] == "oom"

    def test_port_conflict_error(self):
        event = parse_log_line("OSError: Address already in use")
        assert event.type == "error"
        assert event.metrics is not None
        assert event.metrics["error_type"] == "port_conflict"

    def test_import_error_module_not_found(self):
        event = parse_log_line("ModuleNotFoundError: No module named 'vllm'")
        assert event.type == "error"
        assert event.metrics is not None
        assert event.metrics["error_type"] == "import_error"

    def test_warning(self):
        event = parse_log_line("WARNING: something happened")
        assert event.type == "warning"
        assert event.message == "WARNING: something happened"

    def test_generic_info_line(self):
        event = parse_log_line("Loading weights from disk...")
        assert event.type == "info"
        assert event.message == "Loading weights from disk..."


class TestGetErrorDetails:
    def test_oom_returns_full_details(self):
        details = get_error_details("oom")
        assert details["title"] == "Out of Memory (OOM)"
        assert "description" in details
        assert "suggestions" in details
        assert isinstance(details["suggestions"], list)
        assert len(details["suggestions"]) > 0
        assert details["severity"] == "critical"

    def test_unknown_type_returns_fallback(self):
        details = get_error_details("unknown_type")
        assert details["title"] == "Unknown Error"
        assert "description" in details
        assert "suggestions" in details
        assert details["severity"] == "critical"

    def test_known_error_types_all_present(self):
        for error_type in ["oom", "port_conflict", "model_not_found",
                           "nccl_error", "cuda_error", "permission_error",
                           "import_error"]:
            details = get_error_details(error_type)
            assert "title" in details
            assert "description" in details
            assert "suggestions" in details
            assert "severity" in details
