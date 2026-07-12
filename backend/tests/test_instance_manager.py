import pytest
import asyncio
import subprocess
from unittest.mock import AsyncMock
from instance_manager import InstanceManager, VLLMConfig, ProcessState


@pytest.fixture
def manager():
    return InstanceManager(python_path="/usr/bin/python3")


def test_create_instance(manager):
    instance_id = manager.create(VLLMConfig(model="test-model"))
    assert instance_id is not None
    assert len(instance_id) == 8


def test_list_instances(manager):
    id1 = manager.create(VLLMConfig(model="model-a"))
    id2 = manager.create(VLLMConfig(model="model-b"))
    instances = manager.list_all()
    assert len(instances) == 2


def test_get_instance(manager):
    instance_id = manager.create(VLLMConfig(model="test"))
    inst = manager.get(instance_id)
    assert inst.config.model == "test"
    assert inst.state == ProcessState.IDLE


def test_auto_port_allocation(manager):
    id1 = manager.create(VLLMConfig(model="a"))
    id2 = manager.create(VLLMConfig(model="b"))
    assert manager.get(id2).config.port == manager.get(id1).config.port + 1


def test_remove_instance(manager):
    instance_id = manager.create(VLLMConfig(model="test"))
    manager.remove(instance_id)
    assert len(manager.list_all()) == 0


def test_get_nonexistent_raises(manager):
    with pytest.raises(KeyError):
        manager.get("nonexistent")


# --- Docker mode tests ---

def test_to_command_docker():
    """Verify docker run command construction with all fields."""
    config = VLLMConfig(
        model="test-model",
        launch_mode="docker",
        docker_image="vllm-moet-sm120:v024",
        docker_gpus='"device=0"',
        docker_shm_size="64g",
        docker_network="host",
        docker_ipc="host",
        docker_volume_mounts=[{"host_path": "/models", "container_path": "/model", "mode": "ro"}],
        env_vars={"VLLM_MOE_W2": "1"},
    )
    cmd = config.to_command("/usr/bin/python3")
    assert cmd[0] == "docker"
    assert cmd[cmd.index("--gpus") + 1] == '"device=0"'
    assert cmd[cmd.index("-v") + 1] == "/models:/model:ro"
    assert cmd[cmd.index("-e") + 1] == "VLLM_MOE_W2=1"
    assert "test-model" in cmd[-1]


def test_to_command_docker_defaults():
    """Verify defaults when only launch_mode='docker' with minimal fields."""
    config = VLLMConfig(model="test", launch_mode="docker")
    cmd = config.to_command("/usr/bin/python3")
    assert cmd[0] == "docker"
    assert "--network" in cmd
    assert cmd[cmd.index("--network") + 1] == "host"
    assert "--gpus" not in cmd
    assert "--shm-size" not in cmd
    assert "-v" not in cmd
    assert "-e" not in cmd


@pytest.mark.asyncio
async def test_start_docker(docker_manager, monkeypatch):
    """Verify _start_docker() creates subprocess correctly."""
    monkeypatch.setattr(asyncio, "create_subprocess_exec", AsyncMock())
    instance_id = docker_manager.create(VLLMConfig(model="test", launch_mode="docker", docker_image="test-img"))
    result = await docker_manager.start(instance_id)
    assert result is True
    instance = docker_manager.get(instance_id)
    assert instance.state == ProcessState.STARTING


@pytest.mark.asyncio
async def test_stop_docker(docker_manager, monkeypatch):
    """Verify _stop_docker() stops container correctly."""
    monkeypatch.setattr(asyncio, "create_subprocess_exec", AsyncMock())
    instance_id = docker_manager.create(VLLMConfig(model="test", launch_mode="docker", docker_image="test-img"))
    await docker_manager.start(instance_id)
    await docker_manager.stop(instance_id)
    instance = docker_manager.get(instance_id)
    assert instance.state == ProcessState.STOPPED

def test_recover_docker_instances(docker_manager, monkeypatch):
    """Verify _recover_docker_instances() scans docker ps correctly."""
    # Simulate docker ps output with vllm containers
    mock_output = """abc123:vllm-moet-sm120:v024:vllm serve test-model --port 8000
def456:vllm:latest:vllm serve other-model --port 8001
"""
    monkeypatch.setattr(subprocess, "run", ...)
    # ... will evaluate?
    # Actually need to mock subprocess.run to return this output
    import unittest.mock
    def mock_run(cmd, *args, **kwargs):
        return unittest.mock.Mock(stdout=mock_output.encode(), returncode=0)
    monkeypatch.setattr(subprocess, "run", mock_run)
    recovered = docker_manager._recover_docker_instances()
    assert recovered == 2

@pytest.fixture
def docker_manager():
    return InstanceManager(python_path="/usr/bin/python3")
