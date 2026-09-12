import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { GATE0_ROWS } from "../../../domain/stats/gate0Seed.js";

beforeEach(() => {
  vi.resetModules();
  vi.restoreAllMocks();
  vi.useFakeTimers({ toFake: ["Date"] });
  // The Gate 0 clock (spec §8.5): today = 2026-09-12, local.
  vi.setSystemTime(new Date(2026, 8, 12, 9));
});
afterEach(() => vi.useRealTimers());

function mockRows(rows: readonly unknown[]) {
  vi.doMock("../../api", () => ({
    api: vi.fn(
      async () => new Response(JSON.stringify({ rows }), { status: 200 }),
    ),
  }));
}

// Two hand-logged rows whose only step carries metres and no seconds (the
// steps tier, `workSeconds: null`) — independent literals, not the seed.
const METRES_ONLY_ROWS = [
  {
    id: "m1",
    loggedAt: "2026-09-10T16:00:00.000Z",
    source: "manual",
    workoutType: "O2",
    tier: "steps",
    workMeters: 500,
    workSeconds: null,
    restMeters: null,
    restSeconds: null,
    calories: null,
  },
  {
    id: "m2",
    loggedAt: "2026-09-11T16:00:00.000Z",
    source: "manual",
    workoutType: "AT",
    tier: "steps",
    workMeters: 500,
    workSeconds: null,
    restMeters: null,
    restSeconds: null,
    calories: null,
  },
];

async function renderHero() {
  const { default: YouStatsHero } = await import("./YouStatsHero");
  render(
    <MemoryRouter initialEntries={["/you"]}>
      <Routes>
        <Route path="/you" element={<YouStatsHero />} />
        <Route path="/you/stats" element={<h1>Stats page</h1>} />
      </Routes>
    </MemoryRouter>,
  );
  return screen.findByRole("link", { name: "Stats" });
}

describe("YouStatsHero — Gate 0's H3 hero, and the door (spec §5, invariant 16)", () => {
  it("prints LIFETIME 56,752 M and SEASON 2027 43,012 M for the seed, with the five-bucket legend", async () => {
    mockRows(GATE0_ROWS);
    const hero = await renderHero();
    await screen.findByText("LIFETIME · 56,752 M");
    expect(hero).toHaveTextContent("SEASON 2027 · 43,012 M");
    expect(hero).toHaveTextContent(
      "AN 6% · AT 27% · O2 43% · TR 10% · NO TYPE 15%",
    );
    expect(hero).toHaveTextContent("WORK TIME BY TYPE · ALL ROWS");
  });

  it("is exactly ONE focusable control named Stats, and a click on the legend text — the deepest descendant — opens /you/stats", async () => {
    mockRows(GATE0_ROWS);
    const hero = await renderHero();
    await screen.findByText("LIFETIME · 56,752 M");
    // The link itself is the only focusable node in the subtree (count 1).
    expect(hero.matches("a, button, [tabindex]")).toBe(true);
    expect(hero.querySelectorAll("a, button, [tabindex]")).toHaveLength(0);
    fireEvent.click(
      screen.getByText("AN 6% · AT 27% · O2 43% · TR 10% · NO TYPE 15%"),
    );
    expect(await screen.findByText("Stats page")).toBeInTheDocument();
  });

  it("draws one segment per NON-EMPTY bucket, in the independent stack order", async () => {
    mockRows(GATE0_ROWS.filter((r) => r.source === "manual"));
    const hero = await renderHero();
    await screen.findByText("LIFETIME · 20,000 M");
    const order = Array.from(hero.querySelectorAll("rect")).map((r) =>
      r.getAttribute("data-bucket"),
    );
    expect(order).toStrictEqual(["AT", "O2", "TR"]);
    expect(hero).toHaveTextContent("AT 40% · O2 51% · TR 9%");
  });

  it("two rows with metres but no work seconds: LIFETIME counts them, and the bar's place reads NO WORK TIME TO DRAW YET with no svg and no legend", async () => {
    mockRows(METRES_ONLY_ROWS);
    const hero = await renderHero();
    await screen.findByText("LIFETIME · 1,000 M");
    expect(hero.textContent).toContain("NO WORK TIME TO DRAW YET");
    expect(hero.querySelector("svg")).toBeNull();
    expect(hero.querySelector(".stats-legend-line")).toBeNull();
    expect(hero.textContent).not.toContain("WORK TIME BY TYPE");
  });

  it("at 0 rows the figures read 0 M and the empty-state string stands in for the bar", async () => {
    mockRows([]);
    const hero = await renderHero();
    await screen.findByText("LIFETIME · 0 M");
    expect(hero).toHaveTextContent(
      "NO ROWS YET · YOUR FIRST SAVED ROW STARTS THE COUNT",
    );
    expect(hero.querySelector("svg")).toBeNull();
  });
});
