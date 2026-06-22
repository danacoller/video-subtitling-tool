import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { StatusBadge } from "../StatusBadge";

describe("StatusBadge", () => {
  it("renders the label text", () => {
    render(<StatusBadge color="#6c63ff" label="Processing" />);
    expect(screen.getByText("Processing")).toBeInTheDocument();
  });

  it("applies the color to text", () => {
    const { container } = render(<StatusBadge color="#6c63ff" label="Done" />);
    const badge = container.firstChild as HTMLElement;
    expect(badge).toHaveStyle({ color: "#6c63ff" });
  });

  it("applies the color to border", () => {
    const { container } = render(<StatusBadge color="#c44" label="Failed" />);
    const badge = container.firstChild as HTMLElement;
    expect(badge).toHaveStyle({ border: "1px solid #c44" });
  });

  it("uses semi-transparent background derived from color", () => {
    const { container } = render(<StatusBadge color="#abc" label="Test" />);
    const badge = container.firstChild as HTMLElement;
    expect(badge).toHaveStyle({ background: "#abc22" });
  });

  it("renders different status labels correctly", () => {
    const { rerender } = render(<StatusBadge color="#888" label="Queued" />);
    expect(screen.getByText("Queued")).toBeInTheDocument();

    rerender(<StatusBadge color="#2d8a4e" label="Completed" />);
    expect(screen.getByText("Completed")).toBeInTheDocument();
  });
});
