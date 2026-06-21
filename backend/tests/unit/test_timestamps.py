import pytest

from app.domain.timestamps import format_vtt_timestamp
from app.errors import InvalidCueError


def test_zero():
    assert format_vtt_timestamp(0) == "00:00:00.000"


def test_999ms():
    assert format_vtt_timestamp(999) == "00:00:00.999"


def test_1000ms_is_one_second():
    assert format_vtt_timestamp(1000) == "00:00:01.000"


def test_59_999ms():
    assert format_vtt_timestamp(59_999) == "00:00:59.999"


def test_60_000ms_is_one_minute():
    assert format_vtt_timestamp(60_000) == "00:01:00.000"


def test_3_661_500ms():
    assert format_vtt_timestamp(3_661_500) == "01:01:01.500"


def test_max_value():
    assert format_vtt_timestamp(86_399_999) == "23:59:59.999"


def test_negative_raises():
    with pytest.raises(InvalidCueError):
        format_vtt_timestamp(-1)


def test_negative_large_raises():
    with pytest.raises(InvalidCueError):
        format_vtt_timestamp(-1000)
