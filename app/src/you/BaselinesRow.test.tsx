import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import BaselinesRow from "./BaselinesRow";
import { api } from "../api";

// Same idiom as `Concept2Row.test.tsx`: `../api` is mocked (its ONE export)
// and the baselines read is answered from `baselines`; `body === "pending"`
// answers with a promise that never settles, which is how the loading cell
// is reached honestly rather than by racing the assertion against the read.
const baselines = vi.hoisted(() => ({
  body: { k2Seconds: null, k6Seconds: null } as unknown,
  status: 200,
}));

vi.mock("../api", () => ({
  api: vi.fn(async (path: string, init?: RequestInit) => {
    if (path !== "/api/baselines") return fetch(path, init);
    if (baselines.body === "pending") return new Promise<Response>(() => {});
    return new Response(JSON.stringify(baselines.body), {
      status: baselines.status,
      headers: { "Content-Type": "application/json" },
    });
  }),
}));

beforeEach(() => {
  baselines.body = { k2Seconds: null, k6Seconds: null };
  baselines.status = 200;
  vi.mocked(api).mockClear();
});

const renderRow = () =>
  render(
    <MemoryRouter>
      <BaselinesRow />
    </MemoryRouter>,
  );

describe("BaselinesRow", () => {
  it("carries the two splits into You's doors group", async () => {
    baselines.body = { k2Seconds: 112.3, k6Seconds: 125 };
    renderRow();
    expect(await screen.findByText("2K 1:52.3 · 6K 2:05.0")).toBeVisible();
  });

  it("opens /you/baselines, and says where BACK came from", async () => {
    renderRow();
    const row = await screen.findByRole("link", { name: /BASELINES/ });
    expect(row).toHaveAttribute("href", "/you/baselines");
    expect(row).toHaveClass("diag-row");
  });

  it("still draws the row, tappable, while the read is in flight", async () => {
    baselines.body = "pending";
    renderRow();
    // The door must never be missing: a rower who cannot see their numbers
    // yet still needs the way in to set them.
    const row = await screen.findByRole("link", { name: /BASELINES/ });
    expect(row).toHaveAttribute("href", "/you/baselines");
    await waitFor(() =>
      expect(vi.mocked(api)).toHaveBeenCalledWith("/api/baselines"),
    );
    expect(screen.queryByText("NOT SET")).toBeNull();
  });

  it("says COULDN'T READ rather than lying about the numbers", async () => {
    baselines.status = 502;
    renderRow();
    expect(await screen.findByText("COULDN'T READ")).toBeVisible();
  });

  it("renders the state line and the chevron in one end group", async () => {
    baselines.body = { k2Seconds: 112.3, k6Seconds: null };
    renderRow();
    const line = await screen.findByText("2K 1:52.3 · 6K —");
    expect(line).toHaveClass("diag-row-state");
    expect(line.parentElement).toHaveClass("diag-row-end");
  });
});
