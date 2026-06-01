import pytest
from vram_checker import VRAMChecker


def test_estimate_vram_returns_positive():
    checker = VRAMChecker()
    result = checker.estimate_vram_gb(param_billions=7, dtype="float16")
    assert result > 0
    assert result < 100


def test_estimate_vram_quantized_less_than_float16():
    checker = VRAMChecker()
    fp16 = checker.estimate_vram_gb(param_billions=7, dtype="float16")
    awq = checker.estimate_vram_gb(param_billions=7, dtype="awq")
    assert awq < fp16


@pytest.mark.asyncio
async def test_check_feasibility():
    checker = VRAMChecker()
    result = await checker.check_feasibility(param_billions=7, dtype="float16", available_gb=98.0)
    assert result.feasible is True


@pytest.mark.asyncio
async def test_check_infeasible():
    checker = VRAMChecker()
    result = await checker.check_feasibility(param_billions=70, dtype="float16", available_gb=8.0)
    assert result.feasible is False
    assert result.suggestion is not None
