import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import AppRoutes from "./AppRoutes";

vi.mock("../library/Library", () => ({
  default: () => <h1>Library</h1>,
}));

describe("AppRoutes", () => {
  it("redirects / to the library", async () => {
    render(
      <MemoryRouter initialEntries={["/"]}>
        <AppRoutes />
      </MemoryRouter>,
    );
    expect(
      await screen.findByRole("heading", { name: "Library" }),
    ).toBeVisible();
  });

  it("names the phase that will fill a placeholder tab", () => {
    render(
      <MemoryRouter initialEntries={["/plan"]}>
        <AppRoutes />
      </MemoryRouter>,
    );
    expect(screen.getByText(/Phase 8/)).toBeVisible();
  });
});
