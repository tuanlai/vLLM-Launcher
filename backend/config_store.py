import json
import os
from datetime import datetime, timezone
from pathlib import Path


class ConfigStore:
    def __init__(self, path: str | None = None):
        if path is None:
            path = os.path.expanduser("~/.config/vllm-launcher/presets.json")
        self._path = Path(path)
        self._path.parent.mkdir(parents=True, exist_ok=True)
        if not self._path.exists():
            self._path.write_text("[]")

    def _read_all(self) -> list[dict]:
        data = json.loads(self._path.read_text())
        return data

    def _write_all(self, presets: list[dict]) -> None:
        self._path.write_text(json.dumps(presets, indent=2))

    def save(self, name: str, config: dict) -> None:
        presets = self._read_all()
        now = datetime.now(timezone.utc).isoformat()
        for preset in presets:
            if preset["name"] == name:
                preset["config"] = config
                preset["updated_at"] = now
                self._write_all(presets)
                return
        presets.append({
            "name": name,
            "config": config,
            "created_at": now,
            "updated_at": now,
        })
        self._write_all(presets)

    def load(self, name: str) -> dict:
        presets = self._read_all()
        for preset in presets:
            if preset["name"] == name:
                return preset["config"]
        raise KeyError(f"Preset '{name}' not found")

    def list_all(self) -> list[dict]:
        presets = self._read_all()
        return [
            {
                "name": p["name"],
                "config": p["config"],
                "created_at": p["created_at"],
                "updated_at": p.get("updated_at", p["created_at"]),
            }
            for p in presets
        ]

    def delete(self, name: str) -> None:
        presets = self._read_all()
        presets = [p for p in presets if p["name"] != name]
        self._write_all(presets)
