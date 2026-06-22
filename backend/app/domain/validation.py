from app.errors import InvalidCueError


def validate_cue_timing(start_ms: int, end_ms: int) -> None:
    """Validate cue timing constraints. Raises InvalidCueError on violation."""
    if start_ms < 0:
        raise InvalidCueError(f"start_ms must be non-negative, got {start_ms}")
    if end_ms < 0:
        raise InvalidCueError(f"end_ms must be non-negative, got {end_ms}")
    if end_ms <= start_ms:
        raise InvalidCueError(
            f"end_ms ({end_ms}) must be greater than start_ms ({start_ms})"
        )
