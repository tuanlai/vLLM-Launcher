"""Local model discovery scanner for HuggingFace format models and GGUF files."""

import os
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional


@dataclass
class ModelInfo:
    name: str  # e.g. "Qwen/Qwen2.5-7B" or "model-Q4_K_M"
    path: str  # full path
    size_gb: float
    format: str  # "hf" or "gguf"
    param_count: Optional[str] = None


class ModelScanner:
    """Scans local directories for HuggingFace format models and GGUF files."""

    WEIGHT_EXTENSIONS = {".safetensors", ".bin"}

    def _is_hf_model(self, directory: Path) -> bool:
        """Check if a directory looks like a HuggingFace model."""
        config_file = directory / "config.json"
        if not config_file.is_file():
            return False

        # Check for at least one weight file
        try:
            for entry in directory.iterdir():
                if entry.is_file():
                    if entry.suffix in self.WEIGHT_EXTENSIONS:
                        return True
                    if entry.name.startswith("model"):
                        return True
        except PermissionError:
            pass
        return False

    def _get_dir_size(self, directory: Path) -> int:
        """Calculate total size of all files in a directory recursively."""
        total = 0
        try:
            for entry in directory.rglob("*"):
                if entry.is_file():
                    try:
                        total += entry.stat().st_size
                    except (OSError, PermissionError):
                        pass
        except PermissionError:
            pass
        return total

    def _extract_param_count(self, config_path: Path) -> Optional[str]:
        """Try to extract parameter count info from config.json."""
        import json

        try:
            with open(config_path, "r") as f:
                config = json.load(f)
        except (json.JSONDecodeError, OSError, PermissionError):
            return None

        # Check common config fields for parameter hints
        # Some configs have "num_parameters" or similar
        for key in ("num_parameters", "n_params", "num_params"):
            if key in config:
                return str(config[key])

        # Try to infer from hidden_size and num_hidden_layers
        hidden_size = config.get("hidden_size") or config.get("d_model")
        num_layers = config.get("num_hidden_layers") or config.get(
            "n_layer", config.get("num_layers")
        )
        if hidden_size and num_layers:
            # Very rough approximation: ~12 * hidden_size^2 * num_layers / 10^9
            # This is just a heuristic, not exact
            approx_params = 12 * (hidden_size**2) * num_layers
            if approx_params >= 1e9:
                return f"~{approx_params / 1e9:.1f}B"

        return None

    def _make_hf_name(self, directory: Path) -> str:
        """Create a name for an HF model in 'parent_dir/dir_name' format."""
        parent = directory.parent.name
        name = directory.name
        if parent and parent != ".":
            return f"{parent}/{name}"
        return name

    async def scan(self, directory: str) -> list[ModelInfo]:
        """Recursively scan directory for models.

        Finds:
        - HF models: directories with config.json + weight files
        - GGUF files: any file ending in .gguf
        """
        root = Path(directory)
        if not root.is_dir():
            return []

        models: list[ModelInfo] = []
        visited: set[str] = set()

        # Walk the directory tree
        for dirpath, dirnames, filenames in os.walk(root):
            current = Path(dirpath)
            current_resolved = str(current.resolve())

            # Skip if we already processed this as an HF model subtree
            if current_resolved in visited:
                continue

            # Check for GGUF files in current directory
            for fname in filenames:
                if fname.endswith(".gguf"):
                    fpath = current / fname
                    try:
                        size_bytes = fpath.stat().st_size
                    except OSError:
                        continue
                    name = fpath.stem  # filename without extension
                    models.append(
                        ModelInfo(
                            name=name,
                            path=str(fpath),
                            size_gb=round(size_bytes / (1024**3), 4),
                            format="gguf",
                        )
                    )

            # Check if current directory is an HF model
            if self._is_hf_model(current):
                size_bytes = self._get_dir_size(current)
                config_path = current / "config.json"
                param_count = self._extract_param_count(config_path)

                models.append(
                    ModelInfo(
                        name=self._make_hf_name(current),
                        path=str(current),
                        size_gb=round(size_bytes / (1024**3), 4),
                        format="hf",
                        param_count=param_count,
                    )
                )

                # Mark all subdirectories as visited to avoid scanning
                # inside a model directory for nested models
                for sub in current.rglob("*"):
                    if sub.is_dir():
                        visited.add(str(sub.resolve()))

        return models
