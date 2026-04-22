import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import WorkspaceLayout from "../../src/components/WorkspaceLayout";

vi.mock("../../src/components/NotificationMenu", () => ({
  default: () => <div>NotificationMenu</div>,
}));

describe("WorkspaceLayout", () => {
  it("renders title and children", () => {
    render(
      <MemoryRouter>
        <WorkspaceLayout pageLabel="Test Label" title="Test Title">
          <div>Child content</div>
        </WorkspaceLayout>
      </MemoryRouter>,
    );

    expect(screen.getByText("Test Title")).toBeInTheDocument();
    expect(screen.getByText("Child content")).toBeInTheDocument();
  });
});
