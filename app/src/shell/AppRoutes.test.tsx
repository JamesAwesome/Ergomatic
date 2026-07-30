import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import AppRoutes from "./AppRoutes";

vi.mock("../library/Library", () => ({
  default: () => <h1>Library</h1>,
}));
vi.mock("../builder/BulkImport", () => ({
  default: () => <h1>Import</h1>,
}));
vi.mock("../workout/WorkoutDetail", () => ({
  default: () => <h1>Detail</h1>,
}));

describe("AppRoutes", () => {
  it("routes the static /library/import to the importer, not the dynamic /library/:id detail screen", async () => {
    render(
      <MemoryRouter initialEntries={["/library/import"]}>
        <AppRoutes />
      </MemoryRouter>,
    );
    expect(
      await screen.findByRole("heading", { name: "Import" }),
    ).toBeVisible();
    expect(
      screen.queryByRole("heading", { name: "Detail" }),
    ).not.toBeInTheDocument();
  });

  it("still routes a real workout id to the detail screen", async () => {
    render(
      <MemoryRouter initialEntries={["/library/w1"]}>
        <AppRoutes />
      </MemoryRouter>,
    );
    expect(
      await screen.findByRole("heading", { name: "Detail" }),
    ).toBeVisible();
  });

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
