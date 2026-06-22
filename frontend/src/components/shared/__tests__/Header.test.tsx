import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Header } from "../Header";

describe("Header", () => {
  it("renders the app title", () => {
    render(<Header />);
    expect(screen.getByText("Video Subtitling Tool")).toBeInTheDocument();
  });

  it("renders My Videos and Jobs nav buttons when onNav is provided", () => {
    render(<Header onNav={vi.fn()} />);
    expect(screen.getByRole("button", { name: "My Videos" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Jobs" })).toBeInTheDocument();
  });

  it("does not render nav when onNav is omitted", () => {
    render(<Header />);
    expect(screen.queryByRole("button", { name: "My Videos" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Jobs" })).not.toBeInTheDocument();
  });

  it("calls onNav('library') when My Videos is clicked", async () => {
    const onNav = vi.fn();
    render(<Header onNav={onNav} />);
    await userEvent.click(screen.getByRole("button", { name: "My Videos" }));
    expect(onNav).toHaveBeenCalledWith("library");
    expect(onNav).toHaveBeenCalledTimes(1);
  });

  it("calls onNav('jobs') when Jobs is clicked", async () => {
    const onNav = vi.fn();
    render(<Header onNav={onNav} />);
    await userEvent.click(screen.getByRole("button", { name: "Jobs" }));
    expect(onNav).toHaveBeenCalledWith("jobs");
  });

  it("highlights the active screen button", () => {
    render(<Header activeScreen="library" onNav={vi.fn()} />);
    const libraryBtn = screen.getByRole("button", { name: "My Videos" });
    const jobsBtn = screen.getByRole("button", { name: "Jobs" });
    // Active button has non-transparent background
    expect(libraryBtn).toHaveStyle({ background: "#1a1a2e" });
    expect(jobsBtn).toHaveStyle({ background: "transparent" });
  });

  it("highlights jobs button when jobs screen is active", () => {
    render(<Header activeScreen="jobs" onNav={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Jobs" })).toHaveStyle({
      background: "#1a1a2e",
    });
    expect(screen.getByRole("button", { name: "My Videos" })).toHaveStyle({
      background: "transparent",
    });
  });

  it("renders children", () => {
    render(
      <Header>
        <span data-testid="extra">extra content</span>
      </Header>
    );
    expect(screen.getByTestId("extra")).toBeInTheDocument();
  });
});
