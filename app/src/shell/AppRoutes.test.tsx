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
  // NOT a proof of declaration order: react-router-dom 7.18.2 ranks a
  // static path segment ("import") over a dynamic one (":id") regardless of
  // which route is registered first in AppRoutes.tsx, so this test would
  // pass even with the two routes swapped. It exists purely as a regression
  // guard that /library/import renders the importer.
  it("renders the importer at /library/import", async () => {
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
