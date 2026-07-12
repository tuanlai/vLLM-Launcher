"""Integration tests for the vLLM Launcher FastAPI API."""

import pytest
import httpx
from unittest.mock import patch, AsyncMock

from main import app


@pytest.fixture
async def client():
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


@pytest.mark.asyncio
async def test_health(client):
    resp = await client.get("/api/health")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "ok"
    assert "instances" in data
    assert isinstance(data["instances"], int)


@pytest.mark.asyncio
async def test_list_instances_empty(client):
    resp = await client.get("/api/instances")
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, list)


@pytest.mark.asyncio
async def test_get_instance_not_found(client):
    resp = await client.get("/api/instances/nonexistent")
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_gpu_endpoint(client):
    resp = await client.get("/api/gpu")
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, list)


@pytest.mark.asyncio
async def test_presets_endpoint(client):
    resp = await client.get("/api/presets")
    assert resp.status_code == 200
    data = resp.json()
    assert "presets" in data
    assert isinstance(data["presets"], list)


@pytest.mark.asyncio
async def test_files_browse_blocked_path(client):
    resp = await client.get("/api/files/browse", params={"path": "/etc"})
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_files_browse_allowed_path(client):
    resp = await client.get("/api/files/browse", params={"path": "/tmp"})
    assert resp.status_code == 200
    data = resp.json()
    assert "entries" in data


@pytest.mark.asyncio
async def test_settings_endpoint(client):
    resp = await client.get("/api/settings")
    assert resp.status_code == 200
    data = resp.json()
    assert "python_path" in data


@pytest.mark.asyncio
async def test_models_scan_nonexistent(client):
    resp = await client.get("/api/models/scan", params={"path": "/nonexistent_dir"})
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, list)
    assert len(data) == 0


@pytest.mark.asyncio
async def test_create_instance_mocked(client):
    with patch("instance_manager.InstanceManager.start", new_callable=AsyncMock, return_value=True):
        resp = await client.post("/api/instances", json={"model": "test-model"})
    assert resp.status_code == 200
    data = resp.json()
    assert "instance_id" in data
    assert data["success"] is True


@pytest.mark.asyncio
async def test_list_instances_after_create(client):
    # First create an instance with mocked start
    with patch("instance_manager.InstanceManager.start", new_callable=AsyncMock, return_value=True):
        create_resp = await client.post("/api/instances", json={"model": "test-model"})
    assert create_resp.status_code == 200

    # Now list instances — should have at least 1
    list_resp = await client.get("/api/instances")
    assert list_resp.status_code == 200
    instances = list_resp.json()
    assert len(instances) >= 1


@pytest.mark.asyncio
async def test_chat_stream_not_found(client):
    resp = await client.post(
        "/api/chat/nonexistent/stream",
        json={"messages": [{"role": "user", "content": "hi"}]},
    )
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_create_instance_docker(client):
    """Verify creating a docker-mode instance works."""
    with patch("instance_manager.InstanceManager.start", new_callable=AsyncMock, return_value=True):
        payload = {
            "model": "test-model",
            "launch_mode": "docker",
            "docker_image": "vllm-moet-sm120:v024",
            "docker_gpus": '"device=0"',
        }
        resp = await client.post("/api/instances", json=payload)
    assert resp.status_code == 200
    data = resp.json()
    assert data["success"]
    assert data["instance_id"] is not None


@pytest.mark.asyncio
async def test_delete_docker_instance(client):
    """Verify deleting a docker-mode instance works."""
    with patch("instance_manager.InstanceManager.start", new_callable=AsyncMock, return_value=True):
        payload = {"model": "test", "port": 8001, "launch_mode": "docker", "docker_image": "img"}
        resp = await client.post("/api/instances", json=payload)
    assert resp.status_code == 200
    instance_id = resp.json()["instance_id"]

    resp = await client.delete(f"/api/instances/{instance_id}")
    assert resp.status_code == 200
