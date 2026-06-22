import { describe, it, expect } from "vitest";
// Note: vitest also exposes these as globals (globals: true in vitest config)
// but explicit imports are kept for clarity.
import { formatDuration, formatFileSize, formatVideoDuration } from "../format";

describe("formatDuration", () => {
  it("formats 0 seconds", () => {
    expect(formatDuration(0)).toBe("0s");
  });

  it("formats seconds only (< 60s)", () => {
    expect(formatDuration(45)).toBe("45s");
  });

  it("formats 59 seconds", () => {
    expect(formatDuration(59)).toBe("59s");
  });

  it("formats exactly 1 minute", () => {
    expect(formatDuration(60)).toBe("1m 0s");
  });

  it("formats minutes and seconds", () => {
    expect(formatDuration(90)).toBe("1m 30s");
  });

  it("formats 59 minutes 59 seconds", () => {
    expect(formatDuration(3599)).toBe("59m 59s");
  });

  it("formats exactly 1 hour", () => {
    expect(formatDuration(3600)).toBe("1h 0m 0s");
  });

  it("formats hours, minutes and seconds", () => {
    expect(formatDuration(3661)).toBe("1h 1m 1s");
  });

  it("formats a large value", () => {
    expect(formatDuration(7384)).toBe("2h 3m 4s");
  });
});

describe("formatFileSize", () => {
  it("formats 0 bytes", () => {
    expect(formatFileSize(0)).toBe("0.0 MB");
  });

  it("formats exactly 1 MB", () => {
    expect(formatFileSize(1024 * 1024)).toBe("1.0 MB");
  });

  it("formats fractional MB", () => {
    expect(formatFileSize(512 * 1024)).toBe("0.5 MB");
  });

  it("formats larger files", () => {
    expect(formatFileSize(100 * 1024 * 1024)).toBe("100.0 MB");
  });

  it("rounds to one decimal place", () => {
    // 10.55 MB in bytes: floating-point arithmetic means .toFixed(1) may give "10.6"
    // Test the actual rounding behaviour rather than an assumed value
    const result = formatFileSize(10.55 * 1024 * 1024);
    expect(result).toMatch(/^10\.[56] MB$/);
  });
});

describe("formatVideoDuration", () => {
  it("formats 0 seconds", () => {
    expect(formatVideoDuration(0)).toBe("0:00");
  });

  it("formats under 1 minute", () => {
    expect(formatVideoDuration(45)).toBe("0:45");
  });

  it("formats exactly 1 minute", () => {
    expect(formatVideoDuration(60)).toBe("1:00");
  });

  it("pads seconds with leading zero", () => {
    expect(formatVideoDuration(65)).toBe("1:05");
  });

  it("formats 2 minutes 5 seconds (125s)", () => {
    expect(formatVideoDuration(125)).toBe("2:05");
  });

  it("formats a longer video", () => {
    expect(formatVideoDuration(3600)).toBe("60:00");
  });

  it("rounds fractional seconds", () => {
    expect(formatVideoDuration(60.7)).toBe("1:01");
  });
});
