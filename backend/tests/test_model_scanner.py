import pytest
import json
from model_scanner import ModelScanner


@pytest.fixture
def model_dir(tmp_path):
    # Fake HF model
    hf_model = tmp_path / "Qwen" / "Qwen2.5-7B"
    hf_model.mkdir(parents=True)
    (hf_model / "config.json").write_text('{"model_type": "qwen2"}')
    (hf_model / "model.safetensors").write_bytes(b'\x00' * 1024)
    (hf_model / "tokenizer.json").write_text('{}')

    # GGUF file
    gguf_dir = tmp_path / "GGUF"
    gguf_dir.mkdir()
    (gguf_dir / "model-Q4_K_M.gguf").write_bytes(b'\x00' * 2048)

    # Non-model directory
    (tmp_path / "not-a-model").mkdir()
    (tmp_path / "not-a-model" / "readme.txt").write_text("just a file")

    return tmp_path


@pytest.mark.asyncio
async def test_scan_finds_hf_models(model_dir):
    scanner = ModelScanner()
    results = await scanner.scan(str(model_dir))
    hf_models = [r for r in results if r.format == "hf"]
    assert len(hf_models) >= 1
    assert any("Qwen2.5-7B" in r.name for r in hf_models)


@pytest.mark.asyncio
async def test_scan_finds_gguf(model_dir):
    scanner = ModelScanner()
    results = await scanner.scan(str(model_dir))
    gguf_models = [r for r in results if r.format == "gguf"]
    assert len(gguf_models) >= 1


@pytest.mark.asyncio
async def test_scan_skips_non_model_dirs(model_dir):
    scanner = ModelScanner()
    results = await scanner.scan(str(model_dir))
    names = [r.name for r in results]
    assert "not-a-model" not in names


@pytest.mark.asyncio
async def test_scan_returns_size(model_dir):
    scanner = ModelScanner()
    results = await scanner.scan(str(model_dir))
    for r in results:
        assert r.size_gb >= 0
