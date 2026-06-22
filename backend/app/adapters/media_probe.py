"""Thin wrapper around ffprobe for reading video metadata."""
import json
import subprocess


def probe_video_duration(path: str) -> float | None:
    """Return duration in seconds via ffprobe, or None if it cannot be determined."""
    try:
        result = subprocess.run(
            ["ffprobe", "-v", "quiet", "-print_format", "json", "-show_format", path],
            capture_output=True,
            text=True,
            timeout=10,
        )
        data = json.loads(result.stdout)
        raw = data.get("format", {}).get("duration")
        return float(raw) if raw is not None else None
    except Exception:
        return None
