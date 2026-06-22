import { useCallback, useEffect, useRef, useState } from "react";
import {
  CueResponse,
  JobResponse,
  VideoResponse,
  getJob,
  listCues,
  transcribeVideo,
} from "../api/client";

export interface EditorSession {
  videoId: string | null;
  videoName: string;
  videoDuration: number | null;
  job: JobResponse | null;
  cues: CueResponse[];
  currentTimeMs: number;
  transcribeError: string | null;
  jobDone: boolean;
  elapsedSec: number;
  setCurrentTimeMs: (ms: number) => void;
  openVideo: (video: VideoResponse) => Promise<void>;
  handleTranscribe: () => Promise<void>;
  handleRetry: () => void;
  stopPolling: () => void;
}

export function useEditorSession(): EditorSession {
  const [videoId, setVideoId] = useState<string | null>(null);
  const [videoName, setVideoName] = useState("");
  const [videoDuration, setVideoDuration] = useState<number | null>(null);
  const [job, setJob] = useState<JobResponse | null>(null);
  const [cues, setCues] = useState<CueResponse[]>([]);
  const [currentTimeMs, setCurrentTimeMs] = useState(0);
  const [transcribeError, setTranscribeError] = useState<string | null>(null);
  const [jobDone, setJobDone] = useState(false);
  const [elapsedSec, setElapsedSec] = useState(0);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const videoIdRef = useRef<string | null>(null);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const startTimer = useCallback(
    (startedAt: string | null) => {
      stopTimer();
      const origin = startedAt ? new Date(startedAt).getTime() : Date.now();
      setElapsedSec(Math.floor((Date.now() - origin) / 1000));
      timerRef.current = setInterval(() => {
        setElapsedSec(Math.floor((Date.now() - origin) / 1000));
      }, 1000);
    },
    [stopTimer]
  );

  const startPolling = useCallback(
    (vid: string) => {
      stopPolling();
      pollRef.current = setInterval(async () => {
        try {
          const j = await getJob(vid);
          setJob(j);
          if (j.status === "processing" && timerRef.current === null) {
            startTimer(j.started_at);
          }
          if (j.status === "completed") {
            stopPolling();
            stopTimer();
            const loaded = await listCues(vid);
            setCues(loaded);
            setJobDone(true);
          } else if (j.status === "failed") {
            stopPolling();
            stopTimer();
            setTranscribeError(j.error_message ?? "Transcription failed");
          }
        } catch {
          // keep polling
        }
      }, 1000);
    },
    [stopPolling, stopTimer, startTimer]
  );

  useEffect(() => () => { stopPolling(); stopTimer(); }, [stopPolling, stopTimer]);

  const openVideo = useCallback(
    async (video: VideoResponse) => {
      stopPolling();
      stopTimer();
      setVideoId(video.id);
      videoIdRef.current = video.id;
      setVideoName(video.original_name);
      setVideoDuration(video.duration_seconds);
      setJob(null);
      setCues([]);
      setTranscribeError(null);
      setJobDone(false);
      setCurrentTimeMs(0);
      setElapsedSec(0);

      const existingCues = await listCues(video.id).catch(() => []);
      if (existingCues.length > 0) {
        setCues(existingCues);
        setJobDone(true);
        return;
      }

      try {
        const j = await getJob(video.id);
        setJob(j);
        if (j.status === "queued" || j.status === "processing") {
          startPolling(video.id);
        }
      } catch {
        // no job yet — user can start transcription
      }
    },
    [stopPolling, stopTimer, startPolling]
  );

  const handleTranscribe = useCallback(async () => {
    const vid = videoIdRef.current;
    if (!vid) return;
    setTranscribeError(null);
    setJobDone(false);
    setJob(null);
    try {
      const j = await transcribeVideo(vid);
      setJob(j);
      startPolling(vid);
    } catch (err: unknown) {
      setTranscribeError(
        err instanceof Error ? err.message : "Failed to start transcription"
      );
    }
  }, [startPolling]);

  const handleRetry = useCallback(() => {
    setTranscribeError(null);
    setJob(null);
    handleTranscribe();
  }, [handleTranscribe]);

  return {
    videoId,
    videoName,
    videoDuration,
    job,
    cues,
    currentTimeMs,
    transcribeError,
    jobDone,
    elapsedSec,
    setCurrentTimeMs,
    openVideo,
    handleTranscribe,
    handleRetry,
    stopPolling,
  };
}
