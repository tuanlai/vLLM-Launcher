import asyncio
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
        self._settings_path = self._path.parent / "settings.json"
        if not self._settings_path.exists():
            self._settings_path.write_text("{}")
        self._lock = asyncio.Lock()

    def _read_all(self) -> list[dict]:
        data = json.loads(self._path.read_text())
        return data

    def _write_all(self, presets: list[dict]) -> None:
        self._path.write_text(json.dumps(presets, indent=2))

    async def save(self, name: str, config: dict) -> None:
        async with self._lock:
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

    async def delete(self, name: str) -> None:
        async with self._lock:
            presets = self._read_all()
            presets = [p for p in presets if p["name"] != name]
            self._write_all(presets)

    def get_settings(self) -> dict:
        try:
            return json.loads(self._settings_path.read_text())
        except (json.JSONDecodeError, FileNotFoundError):
            return {}

    def get_setting(self, key: str, default=None):
        return self.get_settings().get(key, default)

    async def set_setting(self, key: str, value) -> None:
        async with self._lock:
            settings = self.get_settings()
            settings[key] = value
            self._settings_path.write_text(json.dumps(settings, indent=2))
