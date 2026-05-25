import pytest
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
