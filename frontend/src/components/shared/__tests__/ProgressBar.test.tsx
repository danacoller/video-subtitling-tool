import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { ProgressBar } from "../ProgressBar";

describe("ProgressBar", () => {
  function getFill(container: HTMLElement) {
    // The inner fill div is the second child of the root div
    return container.firstChild!.childNodes[0] as HTMLElement;
  }

  it("renders 0% fill", () => {
    const { container } = render(<ProgressBar value={0} />);
    expect(getFill(container)).toHaveStyle({ width: "0%" });
  });

  it("renders 50% fill", () => {
    const { container } = render(<ProgressBar value={50} />);
    expect(getFill(container)).toHaveStyle({ width: "50%" });
  });

  it("renders 100% fill", () => {
    const { container } = render(<ProgressBar value={100} />);
    expect(getFill(container)).toHaveStyle({ width: "100%" });
  });

  it("applies custom color to fill", () => {
    const { container } = render(<ProgressBar value={40} color="#ff0000" />);
    expect(getFill(container)).toHaveStyle({ background: "#ff0000" });
  });

  it("applies custom height to track", () => {
    const { container } = render(<ProgressBar value={50} height={16} />);
    const track = container.firstChild as HTMLElement;
    expect(track).toHaveStyle({ height: "16px" });
  });

  it("applies custom maxWidth to track", () => {
    const { container } = render(<ProgressBar value={50} maxWidth={200} />);
    const track = container.firstChild as HTMLElement;
    expect(track).toHaveStyle({ maxWidth: "200px" });
  });

  it("uses default maxWidth of 400 when not specified", () => {
    const { container } = render(<ProgressBar value={50} />);
    const track = container.firstChild as HTMLElement;
    expect(track).toHaveStyle({ maxWidth: "400px" });
  });

  it("uses default height of 8 when not specified", () => {
    const { container } = render(<ProgressBar value={50} />);
    const track = container.firstChild as HTMLElement;
    expect(track).toHaveStyle({ height: "8px" });
  });
});
