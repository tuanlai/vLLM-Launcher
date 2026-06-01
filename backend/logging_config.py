"""Centralized logging configuration for vLLM Launcher backend."""

import logging
import os
import sys


def setup_logging() -> None:
    """Configure root logger for the application.

    Set VLLM_LAUNCHER_DEBUG=1 environment variable to enable DEBUG level.
    """
    level = logging.DEBUG if os.environ.get("VLLM_LAUNCHER_DEBUG") else logging.INFO

    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(logging.Formatter(
        fmt="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    ))

    root = logging.getLogger()
    root.setLevel(level)
    # Remove any existing handlers to avoid duplicates on reload
    root.handlers.clear()
    root.addHandler(handler)
