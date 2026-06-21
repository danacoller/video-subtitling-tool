from dataclasses import dataclass
from pathlib import Path
from typing import Protocol


@dataclass
class TranscriptSegment:
    start_sec: float
    end_sec: float
    text: str


class Transcriber(Protocol):
    def transcribe(self, audio_path: Path) -> list[TranscriptSegment]: ...


class FasterWhisperTranscriber:
    """Production transcriber using faster-whisper. Model is loaded lazily."""

    def __init__(self, model_size: str = "tiny") -> None:
        self._model_size = model_size
        self._model = None

    def _get_model(self):
        if self._model is None:
            from faster_whisper import WhisperModel

            self._model = WhisperModel(self._model_size, device="cpu", compute_type="int8")
        return self._model

    def transcribe(self, audio_path: Path) -> list[TranscriptSegment]:
        model = self._get_model()
        # vad_filter skips silent segments — significantly faster on real videos
        # beam_size=1 uses greedy decoding instead of beam search — faster, minimally less accurate
        segments, _ = model.transcribe(
            str(audio_path),
            beam_size=1,
            vad_filter=True,
            vad_parameters={"min_silence_duration_ms": 500},
        )
        return [
            TranscriptSegment(
                start_sec=seg.start,
                end_sec=seg.end,
                text=seg.text.strip(),
            )
            for seg in segments
            if seg.text.strip()  # drop empty segments
        ]


class FakeTranscriber:
    """Returns hardcoded segments — for tests, no model download required."""

    def transcribe(self, audio_path: Path) -> list[TranscriptSegment]:
        return [
            TranscriptSegment(start_sec=0.0, end_sec=2.5, text="Hello, world."),
            TranscriptSegment(start_sec=2.5, end_sec=5.0, text="This is a test."),
            TranscriptSegment(start_sec=5.0, end_sec=8.0, text="Subtitling complete."),
        ]
