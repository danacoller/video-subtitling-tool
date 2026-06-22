import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { SectionHeading } from "../SectionHeading";

describe("SectionHeading", () => {
  it("renders the title", () => {
    render(<SectionHeading icon={<span>📁</span>} title="My Section" />);
    expect(screen.getByText("My Section")).toBeInTheDocument();
  });

  it("renders the icon", () => {
    render(<SectionHeading icon={<span data-testid="icon">📁</span>} title="Title" />);
    expect(screen.getByTestId("icon")).toBeInTheDocument();
  });

  it("renders subtitle when provided", () => {
    render(
      <SectionHeading
        icon={<span />}
        title="Upload"
        subtitle="Add a video to generate subtitles"
      />
    );
    expect(screen.getByText("Add a video to generate subtitles")).toBeInTheDocument();
  });

  it("does not render subtitle element when subtitle is omitted", () => {
    render(<SectionHeading icon={<span />} title="Upload" />);
    expect(screen.queryByText(/generate/)).not.toBeInTheDocument();
  });

  it("renders action slot when provided", () => {
    render(
      <SectionHeading
        icon={<span />}
        title="Videos"
        action={<button>Delete all</button>}
      />
    );
    expect(screen.getByRole("button", { name: "Delete all" })).toBeInTheDocument();
  });

  it("does not render action slot when omitted", () => {
    render(<SectionHeading icon={<span />} title="Videos" />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
