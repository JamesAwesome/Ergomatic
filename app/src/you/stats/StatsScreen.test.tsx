import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { GATE0_ROWS } from "../../../domain/stats/gate0Seed.js";

beforeEach(() => {
  vi.resetModules();
  vi.restoreAllMocks();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 8, 12, 9));
});
afterEach(() => vi.useRealTimers());

async function renderScreen(rows: readonly unknown[]) {
  vi.doMock("../../api", () => ({
    api: vi.fn(
      async () => new Response(JSON.stringify({ rows }), { status: 200 }),
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
    expect(
      screen.getByText("8 OF 10 MACHINE ROWS CARRY THE MONITOR'S OWN TOTALS"),
    ).toBeInTheDocument();
    expect(rowValue("REST METRES", 2)).toBe("718");
    expect(rowValue("CALORIES", 2)).toBe("1,731");
    expect(rowValue("AVG WATTS", 2)).toBe("176");
    expect(
      screen.getByText("1 ROW PREDATES WORK-ONLY TOTALS"),
    ).toBeInTheDocument();
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
    expect(rowValue("METRES", 1)).toBe("18,000");
    fireEvent.change(from, { target: { value: "2026-09-01" } });
    expect(rowValue("METRES", 1)).toBe("5,000");
    fireEvent.change(from, { target: { value: "2026-09-13" } });
    expect(screen.getByRole("alert")).toHaveTextContent(
      "FROM MUST NOT FOLLOW TO",
    );
    expect(rowValue("METRES", 1)).toBe("5,000");
  });

  it("a CUSTOM range with no rows reads NO ROWS BETWEEN <from> AND <to> with the filter bar still shown", async () => {
    await renderScreen(GATE0_ROWS);
    fireEvent.click(chip("CUSTOM"));
    fireEvent.change(screen.getByLabelText("FROM"), {
      target: { value: "2026-07-20" },
    });
    fireEvent.change(screen.getByLabelText("TO"), {
      target: { value: "2026-07-31" },
    });
    expect(
      screen.getByText("NO ROWS BETWEEN 2026-07-20 AND 2026-07-31"),
    ).toBeInTheDocument();
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
    // m = 0: no footnote; k = 0 (no pm5 stored row): no seam line.
    expect(screen.queryByText(/CARRY THE MONITOR'S OWN TOTALS/)).toBeNull();
    expect(screen.queryByText(/PREDATE/)).toBeNull();
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
    expect(
      screen.getByText("1 OF 1 MACHINE ROWS CARRY THE MONITOR'S OWN TOTALS"),
    ).toBeInTheDocument();
    expect(rowValue("AVG WATTS", 2)).toBe("237");
    expect(screen.getByText("TWO ROWS MAKE A CHART")).toBeInTheDocument();
  });

  // Ruling 6's dash: MACHINE rows exist but every one is stored-tier, so
  // the watts sum has nothing to feed it and the row reads a dash — the
  // arm the seed never reaches (R1 is its only stored-tier pm5 row and the
  // other nine feed the figure).
  it("R1 alone: MACHINE has one row, 0 OF 1 carry the monitor's own totals, and AVG WATTS is a dash", async () => {
    await renderScreen(GATE0_ROWS.filter((r) => r.id === "R1"));
    expect(rowValue("METRES", 2)).toBe("6,240");
    expect(
      screen.getByText("0 OF 1 MACHINE ROWS CARRY THE MONITOR'S OWN TOTALS"),
    ).toBeInTheDocument();
    expect(rowValue("AVG WATTS", 2)).toBe("—");
  });

  it("a failed fetch renders the alert with Try again, and the retry fetches again", async () => {
    let calls = 0;
    vi.doMock("../../api", () => ({
      api: vi.fn(async () => {
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
