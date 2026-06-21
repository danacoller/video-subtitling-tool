from typing import Protocol

from app.domain.timestamps import format_vtt_timestamp
from app.errors import InvalidCueError


class CueLike(Protocol):
    start_ms: int
    end_ms: int
    text: str


def _sanitize_text(text: str) -> str:
    """Ensure cue text doesn't contain '-->' which would corrupt VTT structure."""
    return text.replace("-->", "- ->")


def serialize_vtt(cues: list[CueLike]) -> str:
    """Produce a valid WebVTT string from a list of cue-like objects."""
    lines: list[str] = ["WEBVTT", ""]

    for i, cue in enumerate(cues, start=1):
        if cue.end_ms <= cue.start_ms:
            raise InvalidCueError(
                f"Cue {i}: end_ms ({cue.end_ms}) must be greater than start_ms ({cue.start_ms})"
            )
        start = format_vtt_timestamp(cue.start_ms)
        end = format_vtt_timestamp(cue.end_ms)
        text = _sanitize_text(cue.text)
        lines.append(str(i))
        lines.append(f"{start} --> {end}")
        lines.append(text)
        lines.append("")

    return "\n".join(lines)
