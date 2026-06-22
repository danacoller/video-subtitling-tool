import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, act, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { JobsMonitor } from "../JobsMonitor";
import type { JobWithVideo } from "../../api/client";

vi.mock("../../api/client", () => ({
  listAllJobs: vi.fn(),
}));

import { listAllJobs } from "../../api/client";
const mockListAllJobs = vi.mocked(listAllJobs);

function makeJob(overrides: Partial<JobWithVideo> = {}): JobWithVideo {
  return {
    id: "job-1",
    video_id: "vid-1",
    video_name: "sample.mp4",
    video_duration: 60,
    status: "queued",
    progress: 0,
    error_message: null,
    started_at: null,
    finished_at: null,
    created_at: "2024-06-01T10:00:00.000Z",
    ...overrides,
  };
}

describe("JobsMonitor", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.resetAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  async function renderAndSettle() {
    let result: ReturnType<typeof render>;
    await act(async () => {
      result = render(<JobsMonitor onOpenVideo={vi.fn()} />);
    });
    return result!;
  }

  // ── Loading state ─────────────────────────────────────────────────────────

  it("shows loading indicator before first response", () => {
    mockListAllJobs.mockReturnValue(new Promise(() => {}));
    render(<JobsMonitor onOpenVideo={vi.fn()} />);
    expect(screen.getByText(/loading jobs/i)).toBeInTheDocument();
  });

  // ── Empty state ───────────────────────────────────────────────────────────

  it("shows empty-state message when there are no jobs", async () => {
    mockListAllJobs.mockResolvedValue([]);
    await renderAndSettle();
    expect(screen.getByText(/no transcription jobs yet/i)).toBeInTheDocument();
  });

  // ── Section rendering by status ───────────────────────────────────────────

  it("renders the Running section for processing jobs", async () => {
    mockListAllJobs.mockResolvedValue([
      makeJob({ status: "processing", progress: 45 }),
    ]);
    await renderAndSettle();
    expect(screen.getByText(/Running \(1\)/)).toBeInTheDocument();
  });

  it("renders the Queued section for queued jobs", async () => {
    mockListAllJobs.mockResolvedValue([makeJob({ status: "queued" })]);
    await renderAndSettle();
    expect(screen.getByText(/Queued \(1\)/)).toBeInTheDocument();
  });

  it("renders the Failed section for failed jobs", async () => {
    mockListAllJobs.mockResolvedValue([
      makeJob({ status: "failed", error_message: "boom" }),
    ]);
    await renderAndSettle();
    expect(screen.getByText(/Failed \(1\)/)).toBeInTheDocument();
  });

  it("renders the Completed section for completed jobs", async () => {
    mockListAllJobs.mockResolvedValue([makeJob({ status: "completed" })]);
    await renderAndSettle();
    expect(screen.getByText(/Completed \(1\)/)).toBeInTheDocument();
  });

  it("hides a section when it has no jobs", async () => {
    // Only a queued job — Failed and Running should not appear
    mockListAllJobs.mockResolvedValue([makeJob({ status: "queued" })]);
    await renderAndSettle();
    expect(screen.queryByText(/Running/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Failed/)).not.toBeInTheDocument();
  });

  it("renders multiple sections when jobs span statuses", async () => {
    mockListAllJobs.mockResolvedValue([
      makeJob({ id: "j1", status: "processing", progress: 20 }),
      makeJob({ id: "j2", status: "queued" }),
      makeJob({ id: "j3", status: "completed" }),
    ]);
    await renderAndSettle();
    expect(screen.getByText(/Running \(1\)/)).toBeInTheDocument();
    expect(screen.getByText(/Queued \(1\)/)).toBeInTheDocument();
    expect(screen.getByText(/Completed \(1\)/)).toBeInTheDocument();
  });

  // ── Per-job badge rendering ───────────────────────────────────────────────

  it("shows progress percentage for a processing job", async () => {
    mockListAllJobs.mockResolvedValue([
      makeJob({ status: "processing", progress: 72 }),
    ]);
    await renderAndSettle();
    expect(screen.getByText("72%")).toBeInTheDocument();
  });

  it("shows Waiting… badge for a queued job", async () => {
    mockListAllJobs.mockResolvedValue([makeJob({ status: "queued" })]);
    await renderAndSettle();
    expect(screen.getByText("Waiting…")).toBeInTheDocument();
  });

  it("shows ✓ Done badge for a completed job", async () => {
    mockListAllJobs.mockResolvedValue([makeJob({ status: "completed" })]);
    await renderAndSettle();
    expect(screen.getByText("✓ Done")).toBeInTheDocument();
  });

  it("shows ✗ Failed badge for a failed job", async () => {
    mockListAllJobs.mockResolvedValue([
      makeJob({ status: "failed", error_message: "ffmpeg error" }),
    ]);
    await renderAndSettle();
    expect(screen.getByText("✗ Failed")).toBeInTheDocument();
  });

  it("shows the video name in each job row", async () => {
    mockListAllJobs.mockResolvedValue([
      makeJob({ video_name: "lecture.mp4", status: "queued" }),
    ]);
    await renderAndSettle();
    expect(screen.getByText("lecture.mp4")).toBeInTheDocument();
  });

  // ── Interactions ──────────────────────────────────────────────────────────

  it("calls onOpenVideo with the video_id when a job row is clicked", async () => {
    const onOpenVideo = vi.fn();
    mockListAllJobs.mockResolvedValue([
      makeJob({ video_id: "vid-42", status: "completed" }),
    ]);
    // Use act to settle the initial async render under fake timers
    await act(async () => {
      render(<JobsMonitor onOpenVideo={onOpenVideo} />);
    });
    expect(screen.getByText("✓ Done")).toBeInTheDocument();

    // fireEvent.click is synchronous — avoids userEvent async scheduling issues with fake timers
    fireEvent.click(screen.getByTitle("Open video"));
    expect(onOpenVideo).toHaveBeenCalledWith("vid-42");
  });

  // ── Polling ───────────────────────────────────────────────────────────────

  it("re-fetches jobs every second via polling", async () => {
    mockListAllJobs.mockResolvedValue([]);
    await renderAndSettle();

    expect(mockListAllJobs).toHaveBeenCalledTimes(1);

    await act(async () => { vi.advanceTimersByTime(1000); });
    expect(mockListAllJobs).toHaveBeenCalledTimes(2);

    await act(async () => { vi.advanceTimersByTime(1000); });
    expect(mockListAllJobs).toHaveBeenCalledTimes(3);
  });
});
