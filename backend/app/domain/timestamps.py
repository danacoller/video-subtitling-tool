from app.errors import InvalidCueError


def format_vtt_timestamp(ms: int) -> str:
    """Convert integer milliseconds to WebVTT timestamp format HH:MM:SS.mmm."""
    if ms < 0:
        raise InvalidCueError(f"Timestamp must be non-negative, got {ms}")

    total_seconds, millis = divmod(ms, 1000)
    total_minutes, seconds = divmod(total_seconds, 60)
    hours, minutes = divmod(total_minutes, 60)

    return f"{hours:02d}:{minutes:02d}:{seconds:02d}.{millis:03d}"
