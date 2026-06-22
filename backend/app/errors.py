class AppError(Exception):
    status_code: int = 500
    code: str = "internal_error"

    def __init__(self, message: str = "", details: str | None = None) -> None:
        super().__init__(message)
        self.message = message
        self.details = details


class VideoNotFoundError(AppError):
    status_code = 404
    code = "video_not_found"


class JobNotFoundError(AppError):
    status_code = 404
    code = "job_not_found"


class CueNotFoundError(AppError):
    status_code = 404
    code = "cue_not_found"


class DuplicateJobError(AppError):
    status_code = 409
    code = "duplicate_job"


class StorageError(AppError):
    status_code = 500
    code = "storage_error"


class TranscriptionError(AppError):
    status_code = 500
    code = "transcription_error"


class InvalidCueError(AppError):
    status_code = 422
    code = "invalid_cue"


class VideoUploadError(AppError):
    status_code = 422
    code = "invalid_upload"


class CorruptedVideoError(AppError):
    """Raised when a video file cannot be decoded — deterministic failure, no retry."""
    status_code = 422
    code = "corrupted_video"
