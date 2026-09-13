import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  cleanup,
  render,
  screen,
  fireEvent,
  within,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { GATE0_ROWS, GATE0_TESTS } from "../../../domain/stats/gate0Seed.js";

beforeEach(() => {
  vi.resetModules();
  vi.restoreAllMocks();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 8, 12, 9));
});
afterEach(() => vi.useRealTimers());

// The screen makes TWO fetches per mount (rows, then test history); the
// mock answers each by path.
async function renderScreen(
  rows: readonly unknown[],
  tests: readonly unknown[] = [],
) {
  vi.doMock("../../api", () => ({
    api: vi.fn(async (path: string) =>
      path === "/api/test-history"
        ? new Response(JSON.stringify(tests), { status: 200 })
        : new Response(JSON.stringify({ rows }), { status: 200 }),
    ),
  }));
  const { default: StatsScreen } = await import("./StatsScreen");
  render(
    <MemoryRouter initialEntries={["/you/stats"]}>
      <StatsScreen />
    </MemoryRouter>,
  );
  await screen.findByRole("heading", { name: "Stats" });
}

const chip = (name: string) => screen.getByRole("radio", { name });
const rowValue = (label: string, column: 1 | 2) =>
  within(
    screen.getByRole("row", { name: new RegExp(`^${label}`) }),
  ).getAllByRole("cell")[column - 1]!.textContent;

describe("/you/stats — the Gate 0 seed, today = 2026-09-12 (spec §5, §8.5)", () => {
  it("ALL on first open: 56,752 / 3:59:39 / 13; MACHINE 36,752 / 2:34:31 / 10; 8 OF 10; rest 718; calories 1,731 on 8 OF 10; watts 176; the singular seam line", async () => {
    await renderScreen(GATE0_ROWS);
    expect(chip("ALL")).toHaveAttribute("aria-checked", "true");
    expect(rowValue("METRES", 1)).toBe("56,752");
    expect(rowValue("METRES", 2)).toBe("36,752");
    expect(rowValue("TIME", 1)).toBe("3:59:39");
    expect(rowValue("TIME", 2)).toBe("2:34:31");
    expect(rowValue("SESSIONS", 1)).toBe("13");
    expect(rowValue("SESSIONS", 2)).toBe("10");
    expect(rowValue("REST METRES", 2)).toBe("718");
    expect(rowValue("CALORIES", 2)).toBe("1,731");
    expect(rowValue("AVG WATTS", 2)).toBe("176");
  });

  it("the presets select the right rows: SEASON 43,012 · YEAR 50,512 · MONTH 5,000 · 30 DAYS 18,000", async () => {
    await renderScreen(GATE0_ROWS);
    fireEvent.click(chip("SEASON"));
    expect(rowValue("METRES", 1)).toBe("43,012");
    fireEvent.click(chip("YEAR"));
    expect(rowValue("METRES", 1)).toBe("50,512");
    fireEvent.click(chip("MONTH"));
    expect(rowValue("METRES", 1)).toBe("5,000");
    fireEvent.click(chip("30 DAYS"));
    expect(rowValue("METRES", 1)).toBe("18,000");
  });

  it("CUSTOM seeds today−29..today, applies on change, and while FROM follows TO keeps the previous range and says so", async () => {
    await renderScreen(GATE0_ROWS);
    fireEvent.click(chip("CUSTOM"));
    const from = screen.getByLabelText("FROM") as HTMLInputElement;
    const to = screen.getByLabelText("TO") as HTMLInputElement;
    expect([from.value, to.value]).toStrictEqual(["2026-08-14", "2026-09-12"]);
    // A picker hint only (the domain clamps a future TO itself).
    expect([from.max, to.max]).toStrictEqual(["2026-09-12", "2026-09-12"]);
    expect(rowValue("METRES", 1)).toBe("18,000");
    fireEvent.change(from, { target: { value: "2026-09-01" } });
    expect(rowValue("METRES", 1)).toBe("5,000");
    fireEvent.change(from, { target: { value: "2026-09-13" } });
    expect(screen.getByRole("alert")).toHaveTextContent(
      "FROM MUST NOT FOLLOW TO",
    );
    expect(rowValue("METRES", 1)).toBe("5,000");
  });

  // Review item 1: ONE owner of the future-TO clamp (`customRange`), so
  // the totals, the range line and the bars all read the same range.
  // Mutation: drop the clamp → the line reads `14 AUG TO 31 DEC 2026`.
  it("a typed future TO (2026-12-31) clamps to today everywhere: the range line ends TO 12 SEP 2026, METRES stays 18,000, the bars end this week", async () => {
    await renderScreen(GATE0_ROWS);
    fireEvent.click(chip("CUSTOM"));
    fireEvent.change(screen.getByLabelText("TO"), {
      target: { value: "2026-12-31" },
    });
    expect(document.querySelector(".stats-range")?.textContent).toBe(
      "14 AUG TO 12 SEP 2026",
    );
    expect(rowValue("METRES", 1)).toBe("18,000");
    expect(
      document.querySelector(".stats-bar-current")?.getAttribute("data-week"),
    ).toBe("2026-09-07");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  // Review item 2: an empty range is ONE line in the range line's own
  // spelling — never a second caption in ISO beside `20 TO 31 JUL 2026`.
  // Mutation: render the old `NO ROWS BETWEEN 2026-07-20 AND …` caption
  // again → two `.stats-caption`s above the groups and an ISO date on the page.
  it("a CUSTOM range with no rows reads one line, NO ROWS · 20 TO 31 JUL 2026, with the filter bar still shown and no ISO date anywhere", async () => {
    await renderScreen(GATE0_ROWS);
    fireEvent.click(chip("CUSTOM"));
    fireEvent.change(screen.getByLabelText("FROM"), {
      target: { value: "2026-07-20" },
    });
    fireEvent.change(screen.getByLabelText("TO"), {
      target: { value: "2026-07-31" },
    });
    expect(document.querySelector(".stats-range")?.textContent).toBe(
      "NO ROWS · 20 TO 31 JUL 2026",
    );
    expect(
      document.querySelectorAll(".stats-caption.stats-range"),
    ).toHaveLength(1);
    expect(screen.queryByText(/NO ROWS BETWEEN/)).toBeNull();
    expect(screen.queryByText(/2026-07-20/)).toBeNull();
    // The only captions left are the range line and the trend's own
    // (no tests were handed to this render).
    expect(
      Array.from(
        document.querySelectorAll(".stats-caption"),
        (c) => c.textContent,
      ),
    ).toStrictEqual(["NO ROWS · 20 TO 31 JUL 2026", "NO 2K OR 6K TEST LOGGED"]);
    expect(chip("CUSTOM")).toBeInTheDocument();
  });

  it("0 rows: the empty-state string, NO filter bar and NO groups (ruling 16)", async () => {
    await renderScreen([]);
    expect(
      screen.getByText("NO ROWS YET · YOUR FIRST SAVED ROW STARTS THE COUNT"),
    ).toBeInTheDocument();
    expect(screen.queryByRole("radiogroup")).toBeNull();
    expect(screen.queryByText("TOTALS")).toBeNull();
  });

  it("zero pm5 rows (R2 · R9 · R10): ALL 20,000 / 1:25:08 / 3, an EMPTY MACHINE cell, NO MONITOR ROWS YET, no REST/CALORIES/AVG WATTS rows and no n OF m line", async () => {
    await renderScreen(GATE0_ROWS.filter((r) => r.source === "manual"));
    expect(rowValue("METRES", 1)).toBe("20,000");
    expect(rowValue("METRES", 2)).toBe("");
    expect(rowValue("TIME", 1)).toBe("1:25:08");
    expect(rowValue("SESSIONS", 1)).toBe("3");
    expect(
      screen.getByRole("columnheader", { name: "MACHINE" }),
    ).toBeInTheDocument();
    expect(screen.getByText("NO MONITOR ROWS YET")).toBeInTheDocument();
    expect(screen.queryByRole("row", { name: /^REST METRES/ })).toBeNull();
    expect(screen.queryByRole("row", { name: /^CALORIES/ })).toBeNull();
    expect(screen.queryByRole("row", { name: /^AVG WATTS/ })).toBeNull();
  });

  it("TIME BY TYPE: one legend row per non-empty bucket in the independent order, with time and percent; the manual fixture has no AN and no NO TYPE row", async () => {
    await renderScreen(GATE0_ROWS);
    const legend = screen.getByRole("list");
    expect(
      within(legend)
        .getAllByRole("listitem")
        .map((li) => li.textContent),
    ).toStrictEqual([
      "AN13:436%",
      "AT1:03:3927%",
      "O21:44:0443%",
      "TR23:0710%",
      "NO TYPE35:0615%",
    ]);
    expect(
      Array.from(legend.querySelectorAll("li")).map((li) =>
        li.getAttribute("data-bucket"),
      ),
    ).toStrictEqual(["AN", "AT", "O2", "TR", "NO TYPE"]);
    // The grid and the quiet percent are CSS on these two classes; without
    // them the rules in index.css style nothing (RF5 in the other direction).
    const rows = Array.from(legend.querySelectorAll("li"));
    expect(rows.every((li) => li.classList.contains("stats-legend-row"))).toBe(
      true,
    );
    expect(
      rows.map((li) => li.querySelector(".stats-legend-pct")?.textContent),
    ).toStrictEqual(["6%", "27%", "43%", "10%", "15%"]);
  });

  // Invariant 17's other half on THIS list: the seed above fills all five
  // buckets, so a legend that iterated every key would print the same five
  // rows and pass — the "render every bucket" mutant was measured green
  // against the case above alone. The manual fixture has AN = 0 and
  // NO TYPE = 0, so it is the one that can go red.
  it("TIME BY TYPE on the manual fixture (R2 · R9 · R10): AT · O2 · TR only — no AN row, no NO TYPE row", async () => {
    await renderScreen(GATE0_ROWS.filter((r) => r.source === "manual"));
    const legend = screen.getByRole("list");
    expect(
      Array.from(legend.querySelectorAll("li")).map((li) =>
        li.getAttribute("data-bucket"),
      ),
    ).toStrictEqual(["AT", "O2", "TR"]);
    expect(
      Array.from(legend.querySelectorAll("li")).map(
        (li) => li.querySelector(".stats-legend-pct")?.textContent,
      ),
    ).toStrictEqual(["40%", "51%", "9%"]);
  });

  it("two rows in range with metres and no work seconds: TOTALS reads 1,000 / 0:00 / 2 and TIME BY TYPE reads NO WORK TIME TO DRAW YET with no list", async () => {
    await renderScreen([
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
    ]);
    expect(rowValue("METRES", 1)).toBe("1,000");
    expect(rowValue("TIME", 1)).toBe("0:00");
    expect(rowValue("SESSIONS", 1)).toBe("2");
    expect(screen.getByText("NO WORK TIME TO DRAW YET")).toBeInTheDocument();
    expect(screen.queryByRole("list")).toBeNull();
    expect(screen.queryByText("TWO ROWS MAKE A CHART")).toBeNull();
  });

  it("CUSTOM with a cleared date: an empty FROM or TO is invalid — aria-invalid, the alert reads ENTER BOTH DATES, and the previous range stays", async () => {
    await renderScreen(GATE0_ROWS);
    fireEvent.click(chip("CUSTOM"));
    expect(rowValue("METRES", 1)).toBe("18,000");
    fireEvent.change(screen.getByLabelText("FROM"), {
      target: { value: "" },
    });
    expect(screen.getByRole("alert")).toHaveTextContent("ENTER BOTH DATES");
    expect(screen.getByLabelText("FROM")).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    expect(rowValue("METRES", 1)).toBe("18,000");
    fireEvent.change(screen.getByLabelText("FROM"), {
      target: { value: "2026-09-01" },
    });
    expect(screen.queryByRole("alert")).toBeNull();
    expect(rowValue("METRES", 1)).toBe("5,000");
  });

  it("one row in range: TOTALS in full (1 OF 1 · 237 W for R13) and TIME BY TYPE reads TWO ROWS MAKE A CHART", async () => {
    await renderScreen(GATE0_ROWS.filter((r) => r.id === "R13"));
    expect(rowValue("AVG WATTS", 2)).toBe("237");
    // R13 alone: METRES PER WEEK, TIME BY TYPE and SEASON (one season row)
    // each say so — three, one per group, in §5's order.
    expect(
      screen
        .getAllByText("TWO ROWS MAKE A CHART")
        .map((el) => el.closest("section")?.querySelector("h2")?.textContent),
    ).toStrictEqual(["METRES PER WEEK", "TIME BY TYPE", "SEASON 2027"]);
  });

  // Ruling 6's dash: MACHINE rows exist but every one is stored-tier, so
  // the watts sum has nothing to feed it and the row reads a dash — the
  // arm the seed never reaches (R1 is its only stored-tier pm5 row and the
  // other nine feed the figure).
  it("R1 alone: MACHINE has one row, 0 OF 1 carry the monitor's own totals, and AVG WATTS is a dash", async () => {
    await renderScreen(GATE0_ROWS.filter((r) => r.id === "R1"));
    expect(rowValue("METRES", 2)).toBe("6,240");
    expect(rowValue("AVG WATTS", 2)).toBe("—");
  });

  it("a failed fetch renders the alert with Try again, and the retry fetches again", async () => {
    let calls = 0;
    vi.doMock("../../api", () => ({
      api: vi.fn(async (path: string) => {
        if (path === "/api/test-history")
          return new Response("[]", { status: 200 });
        calls += 1;
        return new Response("nope", { status: 500 });
      }),
    }));
    const { default: StatsScreen } = await import("./StatsScreen");
    render(
      <MemoryRouter initialEntries={["/you/stats"]}>
        <StatsScreen />
      </MemoryRouter>,
    );
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Couldn't load your stats.");
    fireEvent.click(within(alert).getByRole("button", { name: "Try again" }));
    await vi.waitFor(() => expect(calls).toBe(2));
  });

  it("the chips are one roving-tabindex radiogroup: ArrowRight moves selection and focus", async () => {
    await renderScreen(GATE0_ROWS);
    chip("ALL").focus();
    fireEvent.keyDown(chip("ALL"), { key: "ArrowRight" });
    expect(chip("SEASON")).toHaveAttribute("aria-checked", "true");
    expect(chip("SEASON")).toHaveFocus();
    expect(chip("ALL")).toHaveAttribute("tabindex", "-1");
  });

  // RF8: the pattern's other three arrows and the wrap at both ends, and a
  // non-arrow key that must change nothing — copied from PaceRefInput's
  // keyboard cases. Plus the TO input, which the CUSTOM case above never
  // edits: 30 DAYS is 18,000 and MONTH (09-01..) is 5,000, so TO = 08-31
  // leaves 08-14..08-31 = 13,000.
  it("ArrowLeft wraps ALL to CUSTOM, ArrowDown wraps CUSTOM to ALL, ArrowUp steps back, Enter changes nothing, and TO applies on change", async () => {
    await renderScreen(GATE0_ROWS);
    chip("ALL").focus();
    fireEvent.keyDown(chip("ALL"), { key: "Enter" });
    expect(chip("ALL")).toHaveAttribute("aria-checked", "true");
    fireEvent.keyDown(chip("ALL"), { key: "ArrowLeft" });
    expect(chip("CUSTOM")).toHaveAttribute("aria-checked", "true");
    expect(chip("CUSTOM")).toHaveFocus();
    fireEvent.change(screen.getByLabelText("TO"), {
      target: { value: "2026-08-31" },
    });
    expect(rowValue("METRES", 1)).toBe("13,000");
    fireEvent.keyDown(chip("CUSTOM"), { key: "ArrowDown" });
    expect(chip("ALL")).toHaveAttribute("aria-checked", "true");
    expect(chip("ALL")).toHaveFocus();
    fireEvent.keyDown(chip("ALL"), { key: "ArrowRight" });
    fireEvent.keyDown(chip("SEASON"), { key: "ArrowUp" });
    expect(chip("ALL")).toHaveAttribute("aria-checked", "true");
    expect(chip("ALL")).toHaveFocus();
  });
});

// Phase PS PR 2 — the range line (§14 ruling 21), the page's order (§5) and
// the two unfiltered groups (invariant 19). Test rows as the route lists
// them: NEWEST first, `loggedAt` at 16:00Z of the seed date.
const GATE0_TEST_ROWS = [...GATE0_TESTS].reverse().map((t) => ({
  id: t.id,
  distance: t.distance,
  splitSeconds: t.splitSeconds,
  loggedAt: `${t.date.y}-${String(t.date.m).padStart(2, "0")}-${String(t.date.d).padStart(2, "0")}T16:00:00.000Z`,
  sessionLogId: t.log,
}));

describe("/you/stats — PR 2: the range line, the groups in order, SEASON and TEST TREND unfiltered", () => {
  const rangeLine = () => document.querySelector(".stats-range")?.textContent;

  it("the range line reads the days each preset covers: ALL TIME · SINCE 8 NOV 2025, 1 MAY TO 12 SEP 2026, 1 JAN TO 12 SEP 2026, 1 TO 12 SEP 2026, 14 AUG TO 12 SEP 2026, and CUSTOM the inputs' values", async () => {
    await renderScreen(GATE0_ROWS);
    expect(rangeLine()).toBe("ALL TIME · SINCE 8 NOV 2025");
    fireEvent.click(chip("SEASON"));
    expect(rangeLine()).toBe("1 MAY TO 12 SEP 2026");
    fireEvent.click(chip("YEAR"));
    expect(rangeLine()).toBe("1 JAN TO 12 SEP 2026");
    fireEvent.click(chip("MONTH"));
    expect(rangeLine()).toBe("1 TO 12 SEP 2026");
    fireEvent.click(chip("30 DAYS"));
    expect(rangeLine()).toBe("14 AUG TO 12 SEP 2026");
    fireEvent.click(chip("CUSTOM"));
    expect(rangeLine()).toBe("14 AUG TO 12 SEP 2026");
    fireEvent.change(screen.getByLabelText("FROM"), {
      target: { value: "2025-11-08" },
    });
    expect(rangeLine()).toBe("8 NOV 2025 TO 12 SEP 2026");
    // FROM > TO: the line names the range still APPLIED, like the totals.
    fireEvent.change(screen.getByLabelText("FROM"), {
      target: { value: "2026-09-13" },
    });
    expect(rangeLine()).toBe("8 NOV 2025 TO 12 SEP 2026");
    expect(rowValue("METRES", 1)).toBe("56,752");
  });

  it("the groups run TOTALS · METRES PER WEEK · TIME BY TYPE · SEASON 2027 · TEST TREND (§5's order) and the range line is the ONE .stats-caption above them", async () => {
    await renderScreen(GATE0_ROWS, GATE0_TEST_ROWS);
    await screen.findByText("2K 1:54.0");
    expect(
      Array.from(
        document.querySelectorAll("section.stats-group h2"),
        (h) => h.textContent,
      ),
    ).toStrictEqual([
      "TOTALS",
      "METRES PER WEEK",
      "TIME BY TYPE",
      "SEASON 2027",
      "TEST TREND",
    ]);
    expect(document.querySelectorAll(".stats-caption")).toHaveLength(1);
  });

  it("METRES PER WEEK on ALL: labels on the tallest (13,000) and the current (2,000) bars only, THIS WK on the axis, the current bar in ink", async () => {
    await renderScreen(GATE0_ROWS);
    const chart = within(screen.getByRole("img", { name: /^Metres per week/ }));
    expect(
      Array.from(
        document.querySelectorAll(".stats-bar-label"),
        (t) => t.textContent,
      ),
    ).toStrictEqual(["13,000", "2,000"]);
    expect(chart.getByText("THIS WK")).toBeInTheDocument();
    expect(document.querySelectorAll(".stats-bar-current")).toHaveLength(1);
    expect(
      document.querySelector(".stats-bar-current")?.getAttribute("data-week"),
    ).toBe("2026-09-07");
    expect(document.querySelectorAll(".stats-bar-out")).toHaveLength(0);
    fireEvent.click(chip("30 DAYS"));
    expect(document.querySelectorAll(".stats-bar-out")).toHaveLength(3);
    expect(screen.getByText("OUT OF RANGE")).toBeInTheDocument();
    // role="img" prunes the SVG's <text>: the label is what AT hears, and
    // it must say "outside the range", never a raw 0, for those weeks.
    const label = screen
      .getByRole("img", { name: /^Metres per week/ })
      .getAttribute("aria-label")!;
    expect(label).toContain("20 JUL outside the range");
    expect(label).toContain("this week 2,000");
    expect(label).not.toMatch(/JUL 0\b/);
  });

  it("two rows older than the window on ALL: METRES PER WEEK reads NO METRES IN THESE EIGHT WEEKS and draws no chart", async () => {
    await renderScreen(GATE0_ROWS.slice(0, 2)); // R1 Nov 2025, R2 Jan 2026
    expect(rowValue("SESSIONS", 1)).toBe("2");
    const group = within(
      screen.getByRole("region", { name: "METRES PER WEEK" }),
    );
    expect(
      group.getByText("NO METRES IN THESE EIGHT WEEKS"),
    ).toBeInTheDocument();
    expect(group.queryByRole("img")).toBeNull();
  });

  it("SEASON 2027 draws 43,012 TODAY, AVG M/DAY 319 M, CURRENT STREAK 3 and LONGEST STREAK 3 — and does not move when the filter does", async () => {
    await renderScreen(GATE0_ROWS);
    const season = within(screen.getByRole("region", { name: "SEASON 2027" }));
    expect(season.getByText("43,012 TODAY")).toBeInTheDocument();
    const tile = (label: string) =>
      season
        .getByText(label)
        .nextElementSibling?.querySelector(".stats-tile-value")?.textContent;
    expect(tile("AVG M/DAY")).toBe("319");
    expect(tile("CURRENT STREAK")).toBe("3");
    expect(tile("LONGEST STREAK")).toBe("3");
    expect(season.getAllByText("WEEKS · ERGOMATIC")).toHaveLength(2);
    // The SVG's <text> is pruned under role="img": the figures are SAID.
    expect(season.getByRole("img").getAttribute("aria-label")).toBe(
      "Season 2027 cumulative metres, 43,012 today, 319 per day, current streak 3, longest 3",
    );
    fireEvent.click(chip("MONTH"));
    expect(rowValue("METRES", 1)).toBe("5,000");
    expect(season.getByText("43,012 TODAY")).toBeInTheDocument();
    // The x geometry, as INDEPENDENT literals (review item 3): the season
    // spans May 1 2026 … Apr 30 2027 = 364 days over the 264 px plot
    // (44 … 308). Today is day 134 → 44 + 134/364·264 = 141.19; the APR
    // tick is Apr 1 2027, day 335 → 286.97. Probes that survived without
    // this: the month labels' year swapped, todayX six days late.
    const svg = season.getByRole("img");
    expect(
      Number(svg.querySelector(".stats-today-line")?.getAttribute("x1")),
    ).toBeCloseTo(141.19, 1);
    const apr = Array.from(svg.querySelectorAll("text.stats-tick")).find(
      (el) => el.textContent === "APR",
    );
    expect(Number(apr?.getAttribute("x"))).toBeCloseTo(286.97, 1);
  });

  it("a CUSTOM range with no rows still renders SEASON and TEST TREND under the NO ROWS line", async () => {
    await renderScreen(GATE0_ROWS, GATE0_TEST_ROWS);
    fireEvent.click(chip("CUSTOM"));
    fireEvent.change(screen.getByLabelText("FROM"), {
      target: { value: "2026-09-12" },
    });
    expect(screen.getByText("NO ROWS · 12 SEP 2026")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "TOTALS" })).toBeNull();
    expect(
      screen.getByRole("region", { name: "SEASON 2027" }),
    ).toBeInTheDocument();
    expect(await screen.findByText("2K 1:54.0")).toBeInTheDocument();
  });

  it("the season card at 0 season rows reads NO ROWS THIS SEASON YET whatever the lifetime count (R1-R4 alone)", async () => {
    await renderScreen(GATE0_ROWS.slice(0, 4));
    expect(rowValue("METRES", 1)).toBe("13,740");
    expect(
      within(screen.getByRole("region", { name: "SEASON 2027" })).getByText(
        "NO ROWS THIS SEASON YET",
      ),
    ).toBeInTheDocument();
  });

  it("TEST TREND: six dots, the last of each series labelled 2K 1:54.0 and 6K 2:01.4, ticks 1:55 · 2:00 · 2:05, months NOV … SEP; with no tests, NO 2K OR 6K TEST LOGGED", async () => {
    await renderScreen(GATE0_ROWS, GATE0_TEST_ROWS);
    const trend = within(
      await screen.findByRole("region", { name: "TEST TREND" }),
    );
    expect(document.querySelectorAll(".stats-dot").length).toBe(6 + 1); // + the season's end dot
    expect(trend.getByText("2K 1:54.0")).toBeInTheDocument();
    expect(trend.getByText("6K 2:01.4")).toBeInTheDocument();
    expect(trend.getByText("2K 1:54.0").getAttribute("text-anchor")).toBe(
      "start",
    );
    expect(
      ["1:55", "2:00", "2:05"].map((t) => trend.getByText(t).textContent),
    ).toStrictEqual(["1:55", "2:00", "2:05"]);
    expect(
      Array.from(
        trend.getByRole("img").querySelectorAll("text.stats-tick"),
        (t) => t.textContent,
      ).filter((t) => /^[A-Z]{3}$/.test(t ?? "")),
    ).toStrictEqual(["NOV", "JAN", "MAR", "MAY", "JUL", "SEP"]);
    expect(trend.getByText("FASTER IS UP")).toBeInTheDocument();
    // Faster is UP (a smaller y): the 2k's last dot (1:54.0) sits above the
    // 6k's last (2:01.4) — the `invert` mutation flips this. Three 6k dots.
    const svg = trend.getByRole("img");
    const cy = (series: string) => {
      const dots = svg.querySelectorAll(`[data-series="${series}"] circle`);
      return Number(dots[dots.length - 1]!.getAttribute("cy"));
    };
    expect(cy("2k")).toBeLessThan(cy("6k"));
    expect(svg.querySelectorAll(".stats-dot-6k")).toHaveLength(3);
    expect(svg.getAttribute("aria-label")).toBe(
      "2k and 6k test splits over time, 6 tests, latest 2k 1:54.0, latest 6k 2:01.4",
    );
  });

  it("no tests: NO 2K OR 6K TEST LOGGED; one test: a record of one is drawn, labelled, with no line", async () => {
    await renderScreen(GATE0_ROWS, []);
    expect(
      await screen.findByText("NO 2K OR 6K TEST LOGGED"),
    ).toBeInTheDocument();
  });

  it("a test on its month's last day flips its label to the LEFT of the dot (text-anchor end); the seed's own labels stay to the right", async () => {
    await renderScreen(GATE0_ROWS, [
      {
        ...GATE0_TEST_ROWS[0],
        id: "t-last",
        loggedAt: "2026-09-30T16:00:00.000Z",
      },
    ]);
    const trend = within(
      await screen.findByRole("region", { name: "TEST TREND" }),
    );
    expect(trend.getByText("2K 1:54.0").getAttribute("text-anchor")).toBe(
      "end",
    );
  });

  it("one test: drawn and labelled, no polyline", async () => {
    await renderScreen(GATE0_ROWS, [GATE0_TEST_ROWS[0]]);
    const trend = within(
      await screen.findByRole("region", { name: "TEST TREND" }),
    );
    expect(trend.getByText("2K 1:54.0")).toBeInTheDocument();
    expect(trend.getByRole("img").querySelectorAll("polyline")).toHaveLength(0);
    expect(trend.getByRole("img").querySelectorAll("circle")).toHaveLength(1);
  });

  // Review item 7a: the season's `<n> TODAY` label flips left by the SAME
  // overrun rule the trend uses (x + LABEL_ROOM > W), not at 60 % of the
  // width. 1 DEC 2026 puts today at x ≈ 199 — past 60 % (192) but with room
  // for the label — so it stays to the RIGHT; 20 APR 2027 (x ≈ 301) flips.
  // Mutation: anchor "start" unconditionally → the April case reads start.
  it("the season label stays right of the dot on 1 DEC 2026 (x ≈ 199) and flips left on 20 APR 2027 (x ≈ 301)", async () => {
    vi.setSystemTime(new Date(2026, 11, 1, 9));
    await renderScreen(GATE0_ROWS);
    const label = () =>
      within(screen.getByRole("region", { name: "SEASON 2027" }))
        .getByRole("img")
        .querySelector(".stats-point-label");
    expect(label()?.textContent).toBe("43,012 TODAY");
    expect(label()?.getAttribute("text-anchor")).toBe("start");
    cleanup();
    vi.setSystemTime(new Date(2027, 3, 20, 9));
    await renderScreen(GATE0_ROWS);
    expect(label()?.getAttribute("text-anchor")).toBe("end");
  });

  // Review item 7b: the OUT OF RANGE caption spans the dashed slots, so
  // over ONE slot it spills; with a single out-of-range week the caption
  // is not drawn and the aria label alone says "outside the range". YEAR
  // on 12 FEB 2026: the eight weeks run 22 DEC … 9 FEB, FROM = 1 JAN sits
  // in the week of 29 DEC, so only 22 DEC is out. Mutation: draw the
  // caption for `out.length > 0` → the text renders.
  it("YEAR on 12 FEB 2026 dashes ONE week (22 DEC) with no OUT OF RANGE caption; the aria label still names it", async () => {
    vi.setSystemTime(new Date(2026, 1, 12, 9));
    await renderScreen([
      ...GATE0_ROWS,
      { ...GATE0_ROWS[1], id: "extra", date: { y: 2026, m: 2, d: 3 } },
    ]);
    fireEvent.click(chip("YEAR"));
    expect(document.querySelectorAll(".stats-bar-out")).toHaveLength(1);
    expect(screen.queryByText("OUT OF RANGE")).toBeNull();
    expect(
      screen
        .getByRole("img", { name: /^Metres per week/ })
        .getAttribute("aria-label"),
    ).toContain("22 DEC outside the range");
  });

  // Review item 7c: when the latest 2k and 6k splits sit within ~1.4 s the
  // two last-point labels overprint (8.6 px/s on the seed's 14 s axis);
  // the LOWER label (the slower split) drops one line-height so the two
  // are ≥ 12 px apart. Mutation: nudge removed → 8.6 px apart.
  it("2K and 6K last labels 1 s apart are pushed ≥ 12 px apart, the slower one moving down", async () => {
    await renderScreen(GATE0_ROWS, [
      { ...GATE0_TEST_ROWS[0], id: "t-2k", distance: "2k", splitSeconds: 114 },
      {
        ...GATE0_TEST_ROWS[0],
        id: "t-6k",
        distance: "6k",
        splitSeconds: 115,
        loggedAt: "2026-08-08T16:00:00.000Z",
      },
      { ...GATE0_TEST_ROWS[5], id: "t-6k-old" }, // T1, 6k 2:04.8 in Nov 2025
    ]);
    const svg = within(
      await screen.findByRole("region", { name: "TEST TREND" }),
    ).getByRole("img");
    const labelY = (series: string) =>
      Number(
        svg
          .querySelector(`[data-series="${series}"] .stats-point-label`)
          ?.getAttribute("y"),
      );
    const dotY = (series: string) => {
      const dots = svg.querySelectorAll(`[data-series="${series}"] circle`);
      return Number(dots[dots.length - 1]!.getAttribute("cy"));
    };
    expect(labelY("2k")).toBeCloseTo(dotY("2k"), 5); // the faster label stays on its dot
    expect(labelY("6k")).toBeGreaterThan(dotY("6k")); // the slower one moved DOWN
    // One line-height apart, within float noise: (x + 12) - x is not
    // exactly 12 for every x. The literal is independent of LABEL_GAP.
    expect(labelY("6k") - labelY("2k")).toBeGreaterThan(11.99);
  });

  it("the trend's own fetch failing leaves the rest of the page standing and offers Try again", async () => {
    let testCalls = 0;
    vi.doMock("../../api", () => ({
      api: vi.fn(async (path: string) => {
        if (path === "/api/test-history") {
          testCalls += 1;
          return new Response("nope", { status: 500 });
        }
        return new Response(JSON.stringify({ rows: GATE0_ROWS }), {
          status: 200,
        });
      }),
    }));
    const { default: StatsScreen } = await import("./StatsScreen");
    render(
      <MemoryRouter initialEntries={["/you/stats"]}>
        <StatsScreen />
      </MemoryRouter>,
    );
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Couldn't load your tests.");
    expect(rowValue("METRES", 1)).toBe("56,752");
    fireEvent.click(within(alert).getByRole("button", { name: "Try again" }));
    await vi.waitFor(() => expect(testCalls).toBe(2));
  });
});
