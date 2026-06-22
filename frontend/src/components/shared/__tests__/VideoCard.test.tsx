import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { VideoCard } from "../VideoCard";
import type { VideoResponse } from "../../../api/client";

function makeVideo(overrides: Partial<VideoResponse> = {}): VideoResponse {
  return {
    id: "vid-1",
    original_name: "my-video.mp4",
    content_type: "video/mp4",
    size_bytes: 10 * 1024 * 1024, // 10 MB
    duration_seconds: 125,          // 2:05
    status: "uploaded",
    created_at: "2024-06-01T12:00:00.000Z",
    updated_at: "2024-06-01T12:00:00.000Z",
    ...overrides,
  };
}

describe("VideoCard", () => {
  it("renders the video file name", () => {
    render(<VideoCard video={makeVideo()} onClick={vi.fn()} onDelete={vi.fn()} />);
    expect(screen.getByText("my-video.mp4")).toBeInTheDocument();
  });

  it("renders the formatted file size", () => {
    render(<VideoCard video={makeVideo()} onClick={vi.fn()} onDelete={vi.fn()} />);
    expect(screen.getByText(/10\.0 MB/)).toBeInTheDocument();
  });

  it("renders the duration when present", () => {
    render(<VideoCard video={makeVideo({ duration_seconds: 125 })} onClick={vi.fn()} onDelete={vi.fn()} />);
    // 125s = 2:05
    expect(screen.getByText(/2:05/)).toBeInTheDocument();
  });

  it("omits the duration when duration_seconds is null", () => {
    render(<VideoCard video={makeVideo({ duration_seconds: null })} onClick={vi.fn()} onDelete={vi.fn()} />);
    // The formatted duration for 125s is "2:05"; that text must not appear
    expect(screen.queryByText(/2:05/)).not.toBeInTheDocument();
  });

  it("shows the Delete button", () => {
    render(<VideoCard video={makeVideo()} onClick={vi.fn()} onDelete={vi.fn()} />);
    expect(screen.getByRole("button", { name: /delete/i })).toBeInTheDocument();
  });

  it("shows the Open arrow label", () => {
    render(<VideoCard video={makeVideo()} onClick={vi.fn()} onDelete={vi.fn()} />);
    expect(screen.getByText(/Open →/)).toBeInTheDocument();
  });

  it("calls onClick when the main content area is clicked", async () => {
    const onClick = vi.fn();
    render(<VideoCard video={makeVideo()} onClick={onClick} onDelete={vi.fn()} />);
    await userEvent.click(screen.getByText("my-video.mp4"));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("calls onDelete when the Delete button is clicked", async () => {
    const onDelete = vi.fn().mockResolvedValue(undefined);
    render(<VideoCard video={makeVideo()} onClick={vi.fn()} onDelete={onDelete} />);
    await userEvent.click(screen.getByRole("button", { name: /delete/i }));
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it("does NOT call onClick when the Delete button is clicked", async () => {
    const onClick = vi.fn();
    const onDelete = vi.fn().mockResolvedValue(undefined);
    render(<VideoCard video={makeVideo()} onClick={onClick} onDelete={onDelete} />);
    await userEvent.click(screen.getByRole("button", { name: /delete/i }));
    expect(onClick).not.toHaveBeenCalled();
  });

  it("shows '…' and disables the Delete button while deleting", async () => {
    // onDelete never resolves so we stay in the loading state
    const onDelete = vi.fn(() => new Promise<void>(() => {}));
    render(<VideoCard video={makeVideo()} onClick={vi.fn()} onDelete={onDelete} />);
    await userEvent.click(screen.getByRole("button", { name: /delete/i }));
    const btn = screen.getByRole("button", { name: "…" });
    expect(btn).toBeDisabled();
  });

  it("re-enables the Delete button after deletion completes", async () => {
    const onDelete = vi.fn().mockResolvedValue(undefined);
    render(<VideoCard video={makeVideo()} onClick={vi.fn()} onDelete={onDelete} />);
    await userEvent.click(screen.getByRole("button", { name: /delete/i }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /delete/i })).not.toBeDisabled()
    );
  });
});
