import pytest

from app.domain.validation import validate_cue_timing
from app.errors import InvalidCueError


def test_valid_cue():
    validate_cue_timing(0, 1000)  # no exception


def test_valid_cue_adjacent():
    validate_cue_timing(1000, 1001)


def test_negative_start_raises():
    with pytest.raises(InvalidCueError):
        validate_cue_timing(-1, 1000)


def test_negative_end_raises():
    with pytest.raises(InvalidCueError):
        validate_cue_timing(0, -1)


def test_end_equal_start_raises():
    with pytest.raises(InvalidCueError):
        validate_cue_timing(500, 500)


def test_end_before_start_raises():
    with pytest.raises(InvalidCueError):
        validate_cue_timing(2000, 1000)


def test_zero_start_zero_end_raises():
    with pytest.raises(InvalidCueError):
        validate_cue_timing(0, 0)


def test_large_valid_values():
    validate_cue_timing(86_398_000, 86_399_999)  # near end of day, valid
