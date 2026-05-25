import pytest
from config_store import ConfigStore


@pytest.fixture
def store(tmp_path):
    return ConfigStore(path=str(tmp_path / "presets.json"))


def test_save_and_load(store):
    store.save("test-preset", {"model": "test", "port": 8000})
    result = store.load("test-preset")
    assert result["model"] == "test"
    assert result["port"] == 8000


def test_list_presets(store):
    store.save("preset-a", {"model": "a"})
    store.save("preset-b", {"model": "b"})
    presets = store.list_all()
    names = [p["name"] for p in presets]
    assert "preset-a" in names
    assert "preset-b" in names


def test_delete_preset(store):
    store.save("to-delete", {"model": "x"})
    store.delete("to-delete")
    assert len(store.list_all()) == 0


def test_load_nonexistent_raises(store):
    with pytest.raises(KeyError):
        store.load("does-not-exist")
