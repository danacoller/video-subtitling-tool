import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { UploadZone } from "../UploadZone";

// Mock the API module so no real HTTP requests are made
vi.mock("../../api/client", () => ({
  uploadVideo: vi.fn(),
}));

import { uploadVideo } from "../../api/client";
const mockUploadVideo = vi.mocked(uploadVideo);

function makeVideoFile(name = "clip.mp4", type = "video/mp4") {
  return new File(["content"], name, { type });
}

function getFileInput(container: HTMLElement) {
  return container.querySelector("input[type='file']") as HTMLInputElement;
}

function dropFile(container: HTMLElement, file: File) {
  const input = getFileInput(container);
  fireEvent.change(input, { target: { files: [file] } });
}

describe("UploadZone", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  // ── Idle state ────────────────────────────────────────────────────────────

  it("shows the idle prompt", () => {
    render(<UploadZone onUploaded={vi.fn()} />);
    expect(screen.getByText(/drop a video here/i)).toBeInTheDocument();
  });

  it("shows an upload button above the drop zone", () => {
    render(<UploadZone onUploaded={vi.fn()} />);
    expect(screen.getByRole("button", { name: /upload video/i })).toBeInTheDocument();
  });

  it("shows the browse-files call-to-action", () => {
    render(<UploadZone onUploaded={vi.fn()} />);
    expect(screen.getByText(/browse files/i)).toBeInTheDocument();
  });

  it("shows accepted format hints", () => {
    render(<UploadZone onUploaded={vi.fn()} />);
    expect(screen.getByText(/MP4/)).toBeInTheDocument();
    expect(screen.getByText(/MOV/)).toBeInTheDocument();
    expect(screen.getByText(/WebM/)).toBeInTheDocument();
  });

  it("renders a hidden file input", () => {
    const { container } = render(<UploadZone onUploaded={vi.fn()} />);
    expect(getFileInput(container)).toBeInTheDocument();
  });

  it("does not show an error message initially", () => {
    render(<UploadZone onUploaded={vi.fn()} />);
    expect(screen.queryByText(/✗/)).not.toBeInTheDocument();
  });

  // ── Uploading state ───────────────────────────────────────────────────────

  it("shows uploading state with 0% progress immediately after drop", async () => {
    // uploadVideo never resolves — keeps the component in uploading state
    mockUploadVideo.mockReturnValue(new Promise(() => {}));

    const { container } = render(<UploadZone onUploaded={vi.fn()} />);
    await act(async () => { dropFile(container, makeVideoFile()); });

    expect(screen.getByText(/uploading/i)).toBeInTheDocument();
    expect(screen.getByText("0%")).toBeInTheDocument();
  });

  it("reflects upload progress updates", async () => {
    let capturedOnProgress: ((pct: number) => void) | undefined;
    mockUploadVideo.mockImplementation(
      (_file, onProgress) =>
        new Promise((resolve) => {
          capturedOnProgress = onProgress;
          // resolve after we inspect the progress
          void resolve;
        })
    );

    const { container } = render(<UploadZone onUploaded={vi.fn()} />);
    await act(async () => { dropFile(container, makeVideoFile()); });

    await act(async () => { capturedOnProgress?.(60); });
    expect(screen.getByText("60%")).toBeInTheDocument();
  });

  it("calls onUploaded with the returned video after a successful upload", async () => {
    const fakeVideo = { id: "vid-1", original_name: "clip.mp4" };
    mockUploadVideo.mockResolvedValue(fakeVideo as never);

    const onUploaded = vi.fn();
    const { container } = render(<UploadZone onUploaded={onUploaded} />);
    await act(async () => { dropFile(container, makeVideoFile()); });

    await waitFor(() => expect(onUploaded).toHaveBeenCalledWith(fakeVideo));
  });

  it("calls onUploaded and does not show an error after a successful upload", async () => {
    const fakeVideo = { id: "v1", original_name: "clip.mp4" };
    mockUploadVideo.mockResolvedValue(fakeVideo as never);

    const onUploaded = vi.fn();
    const { container } = render(<UploadZone onUploaded={onUploaded} />);
    await act(async () => { dropFile(container, makeVideoFile()); });

    await waitFor(() => expect(onUploaded).toHaveBeenCalled());
    // No error banner should be visible after a clean upload
    expect(screen.queryByText(/✗/)).not.toBeInTheDocument();
  });

  // ── Error state ───────────────────────────────────────────────────────────

  it("shows an error message when upload fails", async () => {
    mockUploadVideo.mockRejectedValue(new Error("Network error"));

    const { container } = render(<UploadZone onUploaded={vi.fn()} />);
    await act(async () => { dropFile(container, makeVideoFile()); });

    await waitFor(() =>
      expect(screen.getByText("Network error")).toBeInTheDocument()
    );
  });

  it("shows a fallback error message for non-Error throws", async () => {
    mockUploadVideo.mockRejectedValue("something went wrong");

    const { container } = render(<UploadZone onUploaded={vi.fn()} />);
    await act(async () => { dropFile(container, makeVideoFile()); });

    await waitFor(() =>
      expect(screen.getByText("Upload failed")).toBeInTheDocument()
    );
  });

  it("clears a previous error when a new upload starts", async () => {
    mockUploadVideo
      .mockRejectedValueOnce(new Error("First error"))
      .mockReturnValue(new Promise(() => {})); // second call hangs

    const { container } = render(<UploadZone onUploaded={vi.fn()} />);
    await act(async () => { dropFile(container, makeVideoFile()); });
    await waitFor(() => expect(screen.getByText("First error")).toBeInTheDocument());

    await act(async () => { dropFile(container, makeVideoFile()); });
    expect(screen.queryByText("First error")).not.toBeInTheDocument();
  });

  it("clears the error and calls onUploaded when the second upload succeeds", async () => {
    const onUploaded = vi.fn();
    mockUploadVideo
      .mockRejectedValueOnce(new Error("oops"))
      .mockResolvedValueOnce({ id: "v1" } as never);

    const { container } = render(<UploadZone onUploaded={onUploaded} />);
    await act(async () => { dropFile(container, makeVideoFile()); });
    await waitFor(() => expect(screen.getByText("oops")).toBeInTheDocument());

    await act(async () => { dropFile(container, makeVideoFile()); });
    await waitFor(() => expect(onUploaded).toHaveBeenCalled());
    expect(screen.queryByText("oops")).not.toBeInTheDocument();
  });

  // ── Disabled during upload ────────────────────────────────────────────────

  it("switches cursor to default (non-clickable) while uploading", async () => {
    mockUploadVideo.mockReturnValue(new Promise(() => {}));

    const { container } = render(<UploadZone onUploaded={vi.fn()} />);
    await act(async () => { dropFile(container, makeVideoFile()); });

    // Wait for uploading state
    await waitFor(() => expect(screen.getByText(/uploading/i)).toBeInTheDocument());

    // The component sets cursor: "default" when uploading to signal non-interactive state
    // Hidden input, upload button row, then the video-sized dashed drop zone
    const dropzone = container.firstElementChild!.children[2] as HTMLElement;
    expect(dropzone).toHaveStyle({ cursor: "default" });
  });
});
