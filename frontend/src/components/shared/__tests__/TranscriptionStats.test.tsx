import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { TranscriptionStats } from "../TranscriptionStats";
import type { JobResponse } from "../../../api/client";

function makeJob(overrides: Partial<JobResponse> = {}): JobResponse {
  return {
    id: "job-1",
    video_id: "vid-1",
    status: "completed",
    progress: 100,
    error_message: null,
    started_at: "2024-01-15T10:00:00.000Z",
    finished_at: "2024-01-15T10:00:30.000Z",
    created_at: "2024-01-15T09:59:00.000Z",
    updated_at: "2024-01-15T10:00:30.000Z",
    queue_position: null,
    active_job_progress: null,
    ...overrides,
  };
}

describe("TranscriptionStats", () => {
  it("always renders the ready banner", () => {
    render(<TranscriptionStats job={null} cueCount={0} videoDuration={null} />);
    expect(screen.getByText(/subtitles ready/i)).toBeInTheDocument();
  });

  it("displays the cue count", () => {
    render(<TranscriptionStats job={null} cueCount={42} videoDuration={null} />);
    expect(screen.getByText("42 subtitle cues")).toBeInTheDocument();
  });

  it("displays video duration when provided", () => {
    render(<TranscriptionStats job={null} cueCount={5} videoDuration={90} />);
    expect(screen.getByText("1m 30s")).toBeInTheDocument();
  });

  it("does not display video duration when null", () => {
    render(<TranscriptionStats job={null} cueCount={5} videoDuration={null} />);
    expect(screen.queryByText(/Video duration/)).not.toBeInTheDocument();
  });

  it("displays job ID when job is present", () => {
    render(<TranscriptionStats job={makeJob()} cueCount={5} videoDuration={null} />);
    expect(screen.getByText("job-1")).toBeInTheDocument();
  });

  it("displays transcribe time when both timestamps present", () => {
    const job = makeJob({
      started_at: "2024-01-15T10:00:00.000Z",
      finished_at: "2024-01-15T10:00:30.000Z",
    });
    render(<TranscriptionStats job={job} cueCount={5} videoDuration={null} />);
    expect(screen.getByText("30s")).toBeInTheDocument();
  });

  it("does not display transcribe time when finished_at is missing", () => {
    const job = makeJob({ started_at: "2024-01-15T10:00:00.000Z", finished_at: null });
    render(<TranscriptionStats job={job} cueCount={5} videoDuration={null} />);
    expect(screen.queryByText("Transcribe time:")).not.toBeInTheDocument();
  });

  it("displays speed ratio when transcribe time and video duration are known", () => {
    // video is 60s, transcription took 30s → 2× real-time
    const job = makeJob({
      started_at: "2024-01-15T10:00:00.000Z",
      finished_at: "2024-01-15T10:00:30.000Z",
    });
    render(<TranscriptionStats job={job} cueCount={5} videoDuration={60} />);
    expect(screen.getByText(/2\.00× faster than real-time/)).toBeInTheDocument();
  });

  it("does not display speed ratio when video duration is null", () => {
    const job = makeJob({
      started_at: "2024-01-15T10:00:00.000Z",
      finished_at: "2024-01-15T10:00:30.000Z",
    });
    render(<TranscriptionStats job={job} cueCount={5} videoDuration={null} />);
    expect(screen.queryByText(/faster than real-time/)).not.toBeInTheDocument();
  });

  it("handles null job gracefully — no timestamps rendered", () => {
    render(<TranscriptionStats job={null} cueCount={0} videoDuration={null} />);
    expect(screen.queryByText(/Started at/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Finished at/)).not.toBeInTheDocument();
  });

  it("shows 0 cues correctly", () => {
    render(<TranscriptionStats job={null} cueCount={0} videoDuration={null} />);
    expect(screen.getByText("0 subtitle cues")).toBeInTheDocument();
  });
});
