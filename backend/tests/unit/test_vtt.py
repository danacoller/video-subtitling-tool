import pytest
from dataclasses import dataclass

from app.domain.vtt import serialize_vtt
from app.errors import InvalidCueError


@dataclass
class Cue:
    start_ms: int
    end_ms: int
    text: str


def test_empty_list_returns_header_only():
    result = serialize_vtt([])
    assert result == "WEBVTT\n"


def test_single_cue():
    cues = [Cue(start_ms=0, end_ms=1000, text="Hello")]
    result = serialize_vtt(cues)
    assert result.startswith("WEBVTT\n")
    assert "00:00:00.000 --> 00:00:01.000" in result
    assert "Hello" in result
    assert "1\n" in result


def test_sequence_numbers_are_1_based_and_contiguous():
    cues = [
        Cue(start_ms=0, end_ms=1000, text="A"),
        Cue(start_ms=1000, end_ms=2000, text="B"),
        Cue(start_ms=2000, end_ms=3000, text="C"),
    ]
    result = serialize_vtt(cues)
    lines = result.split("\n")
    cue_numbers = [l for l in lines if l.strip().isdigit()]
    assert cue_numbers == ["1", "2", "3"]


def test_cue_text_with_arrow_sanitized():
    cues = [Cue(start_ms=0, end_ms=1000, text="A --> B")]
    result = serialize_vtt(cues)
    # The original text "A --> B" should be sanitized in the cue body
    lines = result.split("\n")
    text_line = lines[4]  # WEBVTT, blank, "1", timestamp, text
    assert "-->" not in text_line


def test_cue_text_with_angle_brackets():
    cues = [Cue(start_ms=0, end_ms=1000, text="<b>Bold</b>")]
    result = serialize_vtt(cues)
    assert "<b>Bold</b>" in result


def test_multiline_text():
    cues = [Cue(start_ms=0, end_ms=2000, text="Line one\nLine two")]
    result = serialize_vtt(cues)
    assert "Line one\nLine two" in result


def test_end_equal_start_raises():
    with pytest.raises(InvalidCueError):
        serialize_vtt([Cue(start_ms=1000, end_ms=1000, text="oops")])


def test_end_before_start_raises():
    with pytest.raises(InvalidCueError):
        serialize_vtt([Cue(start_ms=2000, end_ms=1000, text="oops")])


def test_valid_vtt_structure():
    cues = [
        Cue(start_ms=0, end_ms=500, text="First"),
        Cue(start_ms=500, end_ms=1500, text="Second"),
    ]
    result = serialize_vtt(cues)
    lines = result.split("\n")
    assert lines[0] == "WEBVTT"
    assert lines[1] == ""
    assert lines[2] == "1"
    assert "00:00:00.000 --> 00:00:00.500" in lines[3]
    assert lines[4] == "First"
