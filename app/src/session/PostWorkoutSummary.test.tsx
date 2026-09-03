import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { readFileSync } from "node:fs";
import { ONBOARDING_TITLES } from "../../domain/onboarding.js";
import type { PlanData } from "../api/usePlan";
import type { SeriesData } from "../monitor/seriesRecorder";
import { commentStrippedSource, cssRules } from "../test/cssView";
import PostWorkoutSummary, {
  offsetFragment,
  singleTargetHint,
} from "./PostWorkoutSummary";
import type { SummaryModel } from "./summaryModel";

// A realistic monitor-door-shaped model: an unjudged opening row plus two
// judged work rows (one faster, one slower than the working average). Phase
// WU: the opener used to be the unnumbered `isWarmup: true` WARM-UP row; it
// is a numbered row with no target now, which is the shape a measured
// EFFORT piece produces. The same shape
// `summaryModel.test.ts` (Task 4) proves `buildSummaryModel` produces from a
// real committed monitor recording. Built as a literal here (not re-run
// through `buildSummaryModel`) because this file's own job is the SCREEN's
// structure/copy/behavior, not the model's number derivation — the brief's
// own division of labor ("numbers via the model tests already").
function monitorModel(overrides: Partial<SummaryModel> = {}): SummaryModel {
  return {
    meta: {
      dateLabel: "AUG 10",
      timeLabel: "18:57",
      sourceLabel: "PM5 432331249",
    },
    heroes: { avgSplit: "2:09.2", time: "25:50", distanceMeters: 6000 },
    rows: [
      {
        measured: true,
        index: 1,
        label: "4:00 @ MIN",
        timeLabel: "4:00",
        paceLabel: "2:20.0",
      },
      {
        measured: true,
        index: 2,
        label: "6:00 @ 6k",
        timeLabel: "6:00",
        paceLabel: "2:05.0",
        judged: {
          direction: "faster",
          deviationSeconds: -4.2,
          deviationLabel: "−4.2",
          barWidthPercent: 50,
        },
      },
      {
        measured: true,
        index: 3,
        label: "6:00 @ 6k",
        timeLabel: "6:20",
        paceLabel: "2:13.4",
        judged: {
          direction: "slower",
          deviationSeconds: 4.2,
          deviationLabel: "+4.2",
          barWidthPercent: 50,
        },
      },
    ],
    ...overrides,
  };
}

function prescribedOnlyModel(): SummaryModel {
  return {
    meta: { dateLabel: "AUG 10", sourceLabel: "LOGGED BY HAND" },
    heroes: {},
    rows: [
      {
        measured: false,
        index: 1,
        label: "10:00 @ 6k +8",
        durationLabel: "10:00",
        targetPaceLabel: "2:00.0",
      },
      {
        measured: false,
        index: 2,
        label: "0:30 @ MAX",
        durationLabel: "0:30",
      },
    ],
    caption: "TARGETS ONLY · NOTHING MEASURED",
  };
}

function plan(overrides: Partial<PlanData> = {}): PlanData {
  return {
    planKey: "sprint",
    doneN: 3,
    sequence: Array.from({ length: 12 }, (_, i) => ({
      index: i,
      code: "2x2k" as PlanData["sequence"][number]["code"],
      status: "upcoming" as const,
    })),
    ...overrides,
  };
}

// Phase LT spec 3, Task 3: a plausible multi-interval `SeriesData` — three
// segments of real pace/rate/hr readings, faster each interval (so a
// "faster is up" trace has a real shape to draw), never touching the
// `p === 0`/`spm === 0` sentinel question (Task 1/2's own job, already
// proven against a real capture there; this file's job is the HOST's own
// wiring/placement, not the trace math a second time).
function realisticSeries(): SeriesData {
  const samples: SeriesData["samples"] = [];
  let t = 0;
  for (const [pace, spm, hr] of [
    [140, 22, 128],
    [138, 22, 130],
    [135, 23, 132],
    [125, 24, 138],
    [122, 24, 140],
    [120, 25, 142],
    [116, 26, 148],
    [114, 27, 150],
    [112, 28, 152],
  ] as const) {
    samples.push({ t: t * 10, d: t * 4, p: pace * 10, spm, hr });
    t += 20;
  }
  return { samples };
}

function baseProps(
  overrides: Partial<Parameters<typeof PostWorkoutSummary>[0]> = {},
) {
  return {
    title: "Silver Thaw",
    model: monitorModel(),
    pacesOffCaption: "PACES OFF 6K 2:09.0",
    hint: "TARGET 2:09.0",
    expectedPain: 3,
    held: null,
    onHeld: vi.fn(),
    pain: null,
    onPain: vi.fn(),
    thumbs: null,
    onThumbs: vi.fn(),
    notes: "",
    onNotes: vi.fn(),
    plan: plan(),
    // Phase 8A: the save stack's lead is DERIVED inside the component from
    // `title` + this pair — there is no injectable boolean any more. The
    // base fixture is a baselined account rowing an ordinary title.
    accountBaselines: { k2Seconds: 112, k6Seconds: 122 },
    saving: false,
    saveError: null,
    onLogAgainstPlan: vi.fn(),
    onSaveWithoutLogging: vi.fn(),
    discardSlot: <button type="button">Discard without logging</button>,
    ...overrides,
  };
}

function renderSummary(
  overrides: Partial<Parameters<typeof PostWorkoutSummary>[0]> = {},
) {
  return render(
    <MemoryRouter>
      <PostWorkoutSummary {...baseProps(overrides)} />
    </MemoryRouter>,
  );
}

describe("PostWorkoutSummary — title block (§2A)", () => {
  it("renders the WORKOUT COMPLETE eyebrow, the workout title as the heading, and a ← DONE back link falling back to /today", () => {
    renderSummary();
    expect(screen.getByText("WORKOUT COMPLETE")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Silver Thaw" }),
    ).toBeInTheDocument();
    const back = screen.getByRole("link", { name: "← DONE" });
    expect(back).toHaveAttribute("href", "/today");
  });

  it("renders the meta line as date · time · source for a connected door", () => {
    renderSummary();
    expect(
      screen.getByText("AUG 10 · 18:57 · PM5 432331249"),
    ).toBeInTheDocument();
  });

  it("omits the time segment for a manual (no-timeLabel) door", () => {
    renderSummary({ model: prescribedOnlyModel() });
    expect(screen.getByText("AUG 10 · LOGGED BY HAND")).toBeInTheDocument();
  });

  it("respects a caller-supplied backFallback", () => {
    renderSummary({ backFallback: "/library/w1" });
    expect(screen.getByRole("link", { name: "← DONE" })).toHaveAttribute(
      "href",
      "/library/w1",
    );
  });
});

// PR #248's round-1 review recommended this ("My recommendation is to
// suppress the completion eyebrow"); implemented, then Gate-0 approved
// (James: "Gold approved", 2026-08-31, on the rendered
// `log-monitor-dropped.png` / `log-monitor-dropped-landscape.png` captures
// at `9bd4ddac`). This component's own half of the contract —
// `summaryModel.ts`'s `buildMonitorModel` is what DERIVES the flag from a
// real `MonitorRun.endedBy` (see `summaryModel.test.ts`'s own describe
// block of the same name); this file's job is only "does the screen obey
// the flag it's handed", the render half of the split RF24 asks for.
describe("PostWorkoutSummary — the completion eyebrow suppression (PR #248 round-1 review)", () => {
  it("suppressCompletionEyebrow: true hides the eyebrow, and nothing replaces it", () => {
    renderSummary({
      model: monitorModel({ suppressCompletionEyebrow: true }),
    });
    expect(screen.queryByText("WORKOUT COMPLETE")).not.toBeInTheDocument();
    // The title still renders as the screen's first heading — the layout
    // starts one element earlier, it doesn't leave a placeholder gap.
    expect(
      screen.getByRole("heading", { name: "Silver Thaw" }),
    ).toBeInTheDocument();
  });

  // The pin: a genuine finish (the default monitor-door fixture carries no
  // `endedBy` override, i.e. it never sets the flag) still shows the
  // eyebrow — already covered by the title-block describe above; this name
  // states the leg explicitly for the fix-round record.
  it("pin: a model with no suppressCompletionEyebrow (an ordinary finished monitor summary) still shows the eyebrow", () => {
    renderSummary({ model: monitorModel() });
    expect(screen.getByText("WORKOUT COMPLETE")).toBeInTheDocument();
  });

  // The timer door has no PM5 and so no `endedBy` at all — `buildTimerModel`
  // never sets `suppressCompletionEyebrow`, and this pins that a
  // timer-shaped model (not just an un-overridden monitor one) still shows
  // the eyebrow: the suppression is scoped to the three recommended monitor
  // arrivals, never a blanket "connected-looking model" rule.
  it("pin: a timer-door-shaped model (no PM5, TIMER source, no series) still shows the eyebrow", () => {
    renderSummary({
      model: {
        meta: { dateLabel: "AUG 10", timeLabel: "18:57", sourceLabel: "TIMER" },
        heroes: { avgSplit: "2:09.2", time: "25:50" },
        rows: [],
      },
    });
    expect(screen.getByText("WORKOUT COMPLETE")).toBeInTheDocument();
  });
});

describe("PostWorkoutSummary — heroes (§2B)", () => {
  it("renders all three heroes when every input is present, AVG SPLIT leading", () => {
    renderSummary();
    expect(screen.getByText("AVG SPLIT")).toBeInTheDocument();
    expect(screen.getByText("2:09.2")).toBeInTheDocument();
    expect(screen.getByText("TIME")).toBeInTheDocument();
    expect(screen.getByText("25:50")).toBeInTheDocument();
    expect(screen.getByText("DISTANCE")).toBeInTheDocument();
    expect(screen.getByText("6000")).toBeInTheDocument();
  });

  it("closes up an absent cell rather than rendering a 0:00/0 m placeholder", () => {
    renderSummary({
      model: monitorModel({ heroes: { time: "25:50" } }),
    });
    expect(screen.queryByText("AVG SPLIT")).not.toBeInTheDocument();
    expect(screen.queryByText("DISTANCE")).not.toBeInTheDocument();
    expect(screen.getByText("TIME")).toBeInTheDocument();
  });

  it("renders no hero block at all when every hero is absent (the manual door)", () => {
    renderSummary({ model: prescribedOnlyModel() });
    expect(screen.queryByText("AVG SPLIT")).not.toBeInTheDocument();
    expect(screen.queryByText("TIME")).not.toBeInTheDocument();
    expect(screen.queryByText("DISTANCE")).not.toBeInTheDocument();
  });

  // RC-5 §2 (hero-truth design spec, 2026-08-25): the TOTAL line renders
  // right beneath the heroes, in the same viewport (placement is a
  // requirement, not a nicety) — no scroll, no collapse, no lazy render.
  it("renders the TOTAL line right beneath the heroes when the model supplies one", () => {
    renderSummary({
      model: monitorModel({
        heroes: {
          avgSplit: "2:04.0",
          time: "2:04",
          distanceMeters: 500,
          totalLine: "4:04 total · plus 242 m coasting in rest",
        },
      }),
    });
    expect(
      screen.getByText("4:04 total · plus 242 m coasting in rest"),
    ).toBeInTheDocument();
  });

  it("omits the TOTAL line when the model has none (e.g. the timer/manual doors, which never set one)", () => {
    renderSummary();
    expect(screen.queryByText(/coasting in rest/)).not.toBeInTheDocument();
    expect(screen.queryByText(/\btotal\b/)).not.toBeInTheDocument();
  });
});

describe("PostWorkoutSummary — reflection card (§2D)", () => {
  it("HOW DID IT FEEL: tapping ↑ selects it, tapping it again clears it", async () => {
    const user = userEvent.setup();
    const onThumbs = vi.fn();
    const { rerender } = renderSummary({ onThumbs });
    await user.click(screen.getByRole("button", { name: "↑ MORE LIKE THIS" }));
    expect(onThumbs).toHaveBeenCalledWith("up");

    onThumbs.mockClear();
    rerender(
      <MemoryRouter>
        <PostWorkoutSummary {...baseProps({ onThumbs, thumbs: "up" })} />
      </MemoryRouter>,
    );
    await user.click(screen.getByRole("button", { name: "↑ MORE LIKE THIS" }));
    expect(onThumbs).toHaveBeenCalledWith(null);
  });

  it("HOW DID IT FEEL: tapping ↓ (Less like this) selects it, tapping it again clears it", async () => {
    const user = userEvent.setup();
    const onThumbs = vi.fn();
    const { rerender } = renderSummary({ onThumbs });
    await user.click(screen.getByRole("button", { name: "Less like this" }));
    expect(onThumbs).toHaveBeenCalledWith("down");

    onThumbs.mockClear();
    rerender(
      <MemoryRouter>
        <PostWorkoutSummary {...baseProps({ onThumbs, thumbs: "down" })} />
      </MemoryRouter>,
    );
    await user.click(screen.getByRole("button", { name: "Less like this" }));
    expect(onThumbs).toHaveBeenCalledWith(null);
  });

  it("DID YOU HOLD THE TARGETS renders option-B labels and clears on a second tap of the selected option", async () => {
    const user = userEvent.setup();
    const onHeld = vi.fn();
    renderSummary({ onHeld, held: "under" });
    expect(screen.getByText("HELD")).toBeInTheDocument();
    expect(screen.getByText("UNDER · FASTER")).toBeInTheDocument();
    expect(screen.getByText("OVER · SLOWER")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "UNDER · FASTER" }));
    expect(onHeld).toHaveBeenCalledWith(null);
  });

  it("clicking an unselected HELD option selects it (does not clear)", async () => {
    const user = userEvent.setup();
    const onHeld = vi.fn();
    renderSummary({ onHeld, held: null });
    await user.click(screen.getByRole("button", { name: "HELD" }));
    expect(onHeld).toHaveBeenCalledWith("held");
  });

  it("renders the hint right-aligned next to DID YOU HOLD when present, and omits it when undefined", () => {
    const { rerender } = renderSummary({ hint: "TARGET 2:09.0" });
    expect(screen.getByText("TARGET 2:09.0")).toBeInTheDocument();
    rerender(
      <MemoryRouter>
        <PostWorkoutSummary {...baseProps({ hint: undefined })} />
      </MemoryRouter>,
    );
    expect(screen.queryByText("TARGET 2:09.0")).not.toBeInTheDocument();
  });

  it("renders BY FEEL when the caller passes it (the manual door's unconditional override)", () => {
    renderSummary({ hint: "BY FEEL" });
    expect(screen.getByText("BY FEEL")).toBeInTheDocument();
  });

  it("ACTUAL PAIN: selecting a level clears on a second tap, and the caption reads the three-way band", async () => {
    const user = userEvent.setup();
    const onPain = vi.fn();
    const { rerender } = renderSummary({ onPain, pain: null });
    expect(screen.getByText("TAP TO RATE")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Pain 1" }));
    expect(onPain).toHaveBeenCalledWith(1);

    rerender(
      <MemoryRouter>
        <PostWorkoutSummary {...baseProps({ onPain, pain: 1 })} />
      </MemoryRouter>,
    );
    expect(screen.getByText("EASIER THAN PLANNED")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Pain 1" }));
    expect(onPain).toHaveBeenCalledWith(null);

    rerender(
      <MemoryRouter>
        <PostWorkoutSummary {...baseProps({ onPain, pain: 2 })} />
      </MemoryRouter>,
    );
    expect(screen.getByText("AS PLANNED")).toBeInTheDocument();

    rerender(
      <MemoryRouter>
        <PostWorkoutSummary {...baseProps({ onPain, pain: 4 })} />
      </MemoryRouter>,
    );
    expect(screen.getByText("HARDER THAN PLANNED")).toBeInTheDocument();
  });

  it("renders the EXPECTED n/5 hint only when expectedPain is present", () => {
    const { rerender } = renderSummary({ expectedPain: 3 });
    expect(screen.getByText("EXPECTED 3/5")).toBeInTheDocument();
    rerender(
      <MemoryRouter>
        <PostWorkoutSummary {...baseProps({ expectedPain: null })} />
      </MemoryRouter>,
    );
    expect(screen.queryByText(/EXPECTED/)).not.toBeInTheDocument();
  });

  it("NOTES is a placeholder-bearing textarea whose value/onChange are wired", async () => {
    const user = userEvent.setup();
    const onNotes = vi.fn();
    renderSummary({ onNotes });
    const textarea = screen.getByPlaceholderText("What happened out there?");
    await user.type(textarea, "x");
    expect(onNotes).toHaveBeenCalled();
  });
});

describe("PostWorkoutSummary — intervals (§2E)", () => {
  it("renders an unjudged measured row with its number and no deviation bar or ± number", () => {
    // Phase WU: this used to look for `.summary-row-warmup` and the word
    // `WARM-UP`. Both are gone with the row type — the class, the label
    // and the unnumbered `#` cell. What survives is the behaviour that
    // mattered: a measured row carrying no judgment renders no deviation
    // figure, and it is numbered like every other row.
    renderSummary();
    const rows = screen.getAllByRole("listitem");
    const opener = rows[0]!;
    expect(opener.querySelector(".summary-row-index")?.textContent).toBe("1");
    expect(within(opener).getByText("4:00")).toBeInTheDocument();
    expect(within(opener).queryByText(/^[+−]/)).not.toBeInTheDocument();
  });

  it("renders a judged measured row's deviation label and shows the legend", () => {
    renderSummary();
    expect(screen.getByText("−4.2")).toBeInTheDocument();
    expect(screen.getByText("+4.2")).toBeInTheDocument();
    expect(
      screen.getByText("← FASTER (BLUE) · SLOWER (RED) →"),
    ).toBeInTheDocument();
  });

  // Review finding C3: nothing previously asserted `barWidthPercent` -> the
  // bar's own `width` style, the `right:50%`/`left:50%` anchoring, or that
  // `summary-row-faster`/`-slower` actually lands on the pace text — a
  // faster/slower color or width swap would have passed the whole suite.
  // Two distinct `barWidthPercent` values (32 vs 47) prove the width is
  // READ from the model, not a hardcoded per-direction constant.
  it("a faster row's pace and bar carry summary-row-faster, the bar anchored from the right at the model's own width (C3)", () => {
    renderSummary({
      model: monitorModel({
        rows: [
          {
            measured: true,
            index: 1,
            label: "6:00 @ 6k",
            timeLabel: "6:00",
            paceLabel: "2:05.0",
            judged: {
              direction: "faster",
              deviationSeconds: -4.2,
              deviationLabel: "−4.2",
              barWidthPercent: 32,
            },
          },
        ],
      }),
    });
    const row = screen.getByRole("listitem");
    const pace = row.querySelector(".summary-row-pace");
    expect(pace?.className).toContain("summary-row-faster");
    expect(pace?.className).not.toContain("summary-row-slower");
    const dev = row.querySelector(".summary-row-dev");
    expect(dev?.className).toContain("summary-row-faster");
    const bar = row.querySelector(".summary-row-bar");
    expect(bar).not.toBeNull();
    expect(bar!.className).toContain("summary-row-faster");
    expect((bar as HTMLElement).style.width).toBe("32%");
    expect((bar as HTMLElement).style.right).toBe("50%");
    expect((bar as HTMLElement).style.left).toBe("");
  });

  it("a slower row's pace and bar carry summary-row-slower, the bar anchored from the left at the model's own width (C3)", () => {
    renderSummary({
      model: monitorModel({
        rows: [
          {
            measured: true,
            index: 1,
            label: "6:00 @ 6k",
            timeLabel: "6:20",
            paceLabel: "2:13.4",
            judged: {
              direction: "slower",
              deviationSeconds: 4.2,
              deviationLabel: "+4.2",
              barWidthPercent: 47,
            },
          },
        ],
      }),
    });
    const row = screen.getByRole("listitem");
    const pace = row.querySelector(".summary-row-pace");
    expect(pace?.className).toContain("summary-row-slower");
    expect(pace?.className).not.toContain("summary-row-faster");
    const dev = row.querySelector(".summary-row-dev");
    expect(dev?.className).toContain("summary-row-slower");
    const bar = row.querySelector(".summary-row-bar");
    expect(bar).not.toBeNull();
    expect(bar!.className).toContain("summary-row-slower");
    expect((bar as HTMLElement).style.width).toBe("47%");
    expect((bar as HTMLElement).style.left).toBe("50%");
    expect((bar as HTMLElement).style.right).toBe("");
  });

  // PM final-PR gate (lone-measured-row ruling, 2026-08-17): a measured
  // row with `judged: undefined` (`summaryModel.test.ts`'s own "a single
  // measured work row is UNJUDGED" — the count<2 gate, finding 5) used to
  // still render the 14px track WITH its center tick and no fill — an
  // empty widget that reads as broken, visible on both committed connected
  // captures. §2B's own idiom ("any cell whose inputs are absent is
  // ABSENT") applied here, and §2E's warm-up-row precedent (measured,
  // "UNJUDGED (no deviation bar...)" — that row type is gone with Phase
  // WU, its rule is not) extended to any unjudged measured row: no tick,
  // no fill, but the empty `.summary-row-bar-track` is kept rather than
  // removed outright, so the column still lines up with judged sibling
  // rows in the same list.
  it("a lone measured row (judged undefined) renders no deviation bar — no tick, no fill, just the empty track", () => {
    renderSummary({
      model: monitorModel({
        rows: [
          {
            measured: true,
            index: 1,
            label: "6:00 @ 6k",
            timeLabel: "6:00",
            paceLabel: "2:05.0",
            // judged intentionally absent — the lone-measured-row shape.
          },
        ],
      }),
    });
    const row = screen.getByRole("listitem");
    expect(row.querySelector(".summary-row-bar-tick")).toBeNull();
    expect(row.querySelector(".summary-row-bar")).toBeNull();
    // The pace still renders, unjudged (no faster/slower color class).
    const pace = row.querySelector(".summary-row-pace");
    expect(pace?.textContent).toBe("2:05.0");
    expect(pace?.className).not.toContain("summary-row-faster");
    expect(pace?.className).not.toContain("summary-row-slower");
  });

  // A real, if unusual, monitor-door shape (LogSession.test.tsx's own
  // "unusable avgSplit" fixture, R-B/monitorWorkRows): a real elapsed
  // reading with no usable pace (avgSplit 0, "the wire had no reading" —
  // dropped, never fabricated). Proves the row still renders MEASURED
  // (time shown) with an empty (not "undefined") pace cell, and that the
  // aria-label degrades to naming only what was actually read. Review
  // fix round (MEDIUM): this fixture also carries no targetLabel/
  // spmCell/judged/onTarget at all, so it doubles as the pin proving
  // `rowJudgmentDescription`'s own three clauses stay silent (not a
  // fabricated "no target" utterance) when the row was never judged and
  // has no target — the name below is UNCHANGED by that function's
  // addition, on purpose.
  it("a measured row with a time but no pace omits the pace segment from both the cell and the accessible name", () => {
    renderSummary({
      model: monitorModel({
        rows: [
          {
            measured: true,
            index: 1,
            label: "6:00 @ 6k",
            timeLabel: "11:45",
            // paceLabel intentionally absent (and so are targetLabel/
            // spmCell/judged/onTarget — see the comment above).
          },
        ],
      }),
    });
    const row = screen.getByRole("listitem");
    expect(row).toHaveAccessibleName("Interval 1: 6:00 @ 6k, 11:45");
    expect(row.querySelector(".summary-row-pace")?.textContent).toBe("");
  });

  it("renders a prescribed row's duration/target/offset/dash and never a bare label with no dash", () => {
    renderSummary({ model: prescribedOnlyModel() });
    expect(screen.getByText("10:00")).toBeInTheDocument();
    expect(screen.getByText("2:00.0")).toBeInTheDocument();
    expect(screen.getByText("6k +8")).toBeInTheDocument();
    // The effort row's offset fragment falls back to the ref chip alone.
    expect(screen.getByText("MAX")).toBeInTheDocument();
    expect(screen.getAllByText("—")).toHaveLength(2);
  });

  it("renders the TARGETS ONLY · NOTHING MEASURED caption only when the model supplies one, and omits the legend when nothing is judged", () => {
    renderSummary({ model: prescribedOnlyModel() });
    expect(
      screen.getByText("TARGETS ONLY · NOTHING MEASURED"),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("← FASTER (BLUE) · SLOWER (RED) →"),
    ).not.toBeInTheDocument();
  });

  it("renders the paces-off caption next to INTERVALS when present, and omits it when null", () => {
    const { rerender } = renderSummary({
      pacesOffCaption: "PACES OFF 6K 2:09.0",
    });
    expect(screen.getByText("PACES OFF 6K 2:09.0")).toBeInTheDocument();
    rerender(
      <MemoryRouter>
        <PostWorkoutSummary {...baseProps({ pacesOffCaption: null })} />
      </MemoryRouter>,
    );
    expect(screen.queryByText(/PACES OFF/)).not.toBeInTheDocument();
  });

  it("renders nothing under INTERVALS when the model has no rows at all", () => {
    renderSummary({ model: monitorModel({ rows: [] }) });
    expect(screen.queryByText("INTERVALS")).not.toBeInTheDocument();
  });
});

// Phase LT spec 1, §1/§2 (Task 3): the re-baselined row's two new cells
// (TARGET, `m:ss.t`; SPM, `24 / 22` with a quiet target half) and the
// on-target (plain-ink) rendering `rowJudgment` (Task 2) already encodes
// via `judged`/`onTarget`'s own mutual-exclusion invariant. Every fixture
// row below is measured-shaped, built the same literal-object way this
// file's own `monitorModel` rows already are (this file's job is the
// SCREEN, not the model — the model's own derivation is
// `summaryModel.test.ts`'s job).
describe("PostWorkoutSummary — TARGET + SPM cells, on-target plain ink (§1/§2)", () => {
  it("renders the TARGET cell (m:ss.t) when the row carries one, and an empty cell when it has none", () => {
    renderSummary({
      model: monitorModel({
        rows: [
          {
            measured: true,
            index: 1,
            label: "6:00 @ 6k",
            timeLabel: "6:00",
            paceLabel: "2:05.0",
            targetLabel: "2:09.0",
          },
        ],
      }),
    });
    const row = screen.getByRole("listitem");
    expect(row.querySelector(".summary-row-target")?.textContent).toBe(
      "2:09.0",
    );
  });

  it("a row with no targetLabel renders an empty TARGET cell (absence, never a dash or a fabricated value)", () => {
    renderSummary({
      model: monitorModel({
        rows: [
          {
            measured: true,
            index: 1,
            label: "6:00 @ 6k",
            timeLabel: "6:00",
            paceLabel: "2:05.0",
            // targetLabel intentionally absent — the pairing-exception
            // shape (antagonist B5) still shows a real number when it
            // HAS one; this fixture simply has none.
          },
        ],
      }),
    });
    const row = screen.getByRole("listitem");
    expect(row.querySelector(".summary-row-target")?.textContent).toBe("");
  });

  it("SPM cell §2: both halves present render `24 / 22`, the target half (after the slash) carrying the quiet class", () => {
    renderSummary({
      model: monitorModel({
        rows: [
          {
            measured: true,
            index: 1,
            label: "6:00 @ 6k",
            timeLabel: "6:00",
            paceLabel: "2:05.0",
            spmCell: { measured: 24, target: 22 },
          },
        ],
      }),
    });
    const row = screen.getByRole("listitem");
    const spm = row.querySelector(".summary-row-spm")!;
    expect(spm.textContent).toBe("24 / 22");
    const target = spm.querySelector(".summary-row-spm-target")!;
    expect(target).not.toBeNull();
    expect(target.textContent).toBe(" / 22");
  });

  it("SPM cell: a measured-only half (no authored rate) renders the bare number, no slash, no quiet span", () => {
    renderSummary({
      model: monitorModel({
        rows: [
          {
            measured: true,
            index: 1,
            label: "6:00 @ 6k",
            timeLabel: "6:00",
            paceLabel: "2:05.0",
            spmCell: { measured: 24 },
          },
        ],
      }),
    });
    const row = screen.getByRole("listitem");
    const spm = row.querySelector(".summary-row-spm")!;
    expect(spm.textContent).toBe("24");
    expect(spm.querySelector(".summary-row-spm-target")).toBeNull();
  });

  it("SPM cell: a target-only half renders `/ 22` wholly in the quiet class (no leading space, per §2's own literal example)", () => {
    renderSummary({
      model: monitorModel({
        rows: [
          {
            measured: true,
            index: 1,
            label: "6:00 @ 6k",
            timeLabel: "6:00",
            paceLabel: "2:05.0",
            spmCell: { target: 22 },
          },
        ],
      }),
    });
    const row = screen.getByRole("listitem");
    const spm = row.querySelector(".summary-row-spm")!;
    expect(spm.textContent).toBe("/ 22");
    const target = spm.querySelector(".summary-row-spm-target")!;
    expect(target.textContent).toBe("/ 22");
  });

  it("SPM cell: absent entirely (no spmCell on the row) renders an empty cell, not an empty widget", () => {
    renderSummary({
      model: monitorModel({
        rows: [
          {
            measured: true,
            index: 1,
            label: "6:00 @ 6k",
            timeLabel: "6:00",
            paceLabel: "2:05.0",
            // spmCell intentionally absent.
          },
        ],
      }),
    });
    const row = screen.getByRole("listitem");
    expect(row.querySelector(".summary-row-spm")?.textContent).toBe("");
  });

  // James's tule-fog report (the spec's own naming): a row can beat its
  // target and still land WITHIN the ±0.5s band — the on-target state
  // renders PLAIN, same visual treatment as an unjudged row, never a
  // color, never a bar, never a ± label, even though `onTarget: true` DID
  // evaluate it (unlike a genuinely unjudged row where neither field is
  // set at all).
  it("an on-target row (onTarget: true, judged absent) renders plain ink: no faster/slower class, no bar tick/fill, no ± label", () => {
    renderSummary({
      model: monitorModel({
        rows: [
          {
            measured: true,
            index: 1,
            label: "6:00 @ 6k",
            timeLabel: "6:00",
            paceLabel: "2:09.3",
            targetLabel: "2:09.0",
            onTarget: true,
            // judged intentionally absent — Task 2's own mutual-
            // exclusion invariant.
          },
        ],
      }),
    });
    const row = screen.getByRole("listitem");
    const pace = row.querySelector(".summary-row-pace");
    expect(pace?.className).not.toContain("summary-row-faster");
    expect(pace?.className).not.toContain("summary-row-slower");
    const dev = row.querySelector(".summary-row-dev");
    expect(dev?.className).not.toContain("summary-row-faster");
    expect(dev?.className).not.toContain("summary-row-slower");
    expect(dev?.textContent).toBe("");
    expect(row.querySelector(".summary-row-bar-tick")).toBeNull();
    expect(row.querySelector(".summary-row-bar")).toBeNull();
  });

  it("by-hand (prescribed) rows are unpainted: no TARGET/SPM/bar geometry at all, only duration/target-pace/offset/dash", () => {
    renderSummary({ model: prescribedOnlyModel() });
    const rows = screen.getAllByRole("listitem");
    for (const row of rows) {
      expect(row.querySelector(".summary-row-spm")).toBeNull();
      expect(row.querySelector(".summary-row-bar-track")).toBeNull();
    }
  });

  // Review fix round (MEDIUM): the sighted-only defect — `IntervalRow`'s
  // own `aria-label` replaces the row's content for assistive tech
  // (`role="listitem"`, no visible-text fallback), so TARGET, the SPM
  // cell, and the judgment state must be SPOKEN, not just painted. Every
  // clause below is independently absent exactly when its own visible
  // cell is absent (§2B's per-cell absence idiom, extended to the
  // accessible name) — proven by the target-only-SPM/abstained-row case
  // below carrying NEITHER the target clause NOR the judgment clause.
  describe("accessible name carries TARGET, SPM, and the judgment state (review fix round, MEDIUM)", () => {
    it("judged FASTER: target, both SPM halves, and a plain faster-than sentence", () => {
      renderSummary({
        model: monitorModel({
          rows: [
            {
              measured: true,
              index: 1,
              label: "6:00 @ 6k",
              timeLabel: "6:00",
              paceLabel: "2:05.0",
              targetLabel: "2:09.0",
              spmCell: { measured: 24, target: 22 },
              judged: {
                direction: "faster",
                deviationSeconds: -4.2,
                deviationLabel: "−4.2",
                barWidthPercent: 50,
              },
            },
          ],
        }),
      });
      expect(screen.getByRole("listitem")).toHaveAccessibleName(
        "Interval 1: 6:00 @ 6k, 6:00 at 2:05.0 per 500, target 2:09.0 per 500, 24 strokes per minute, target 22, 4.2 faster than target",
      );
    });

    it("judged SLOWER: the same clauses, the plain slower-than sentence", () => {
      renderSummary({
        model: monitorModel({
          rows: [
            {
              measured: true,
              index: 1,
              label: "6:00 @ 6k",
              timeLabel: "6:20",
              paceLabel: "2:13.4",
              targetLabel: "2:09.0",
              spmCell: { measured: 26, target: 22 },
              judged: {
                direction: "slower",
                deviationSeconds: 4.2,
                deviationLabel: "+4.2",
                barWidthPercent: 50,
              },
            },
          ],
        }),
      });
      expect(screen.getByRole("listitem")).toHaveAccessibleName(
        "Interval 1: 6:00 @ 6k, 6:20 at 2:13.4 per 500, target 2:09.0 per 500, 26 strokes per minute, target 22, 4.2 slower than target",
      );
    });

    it("ON TARGET: onTarget true, judged absent — the plain 'on target' clause, no faster/slower sentence", () => {
      renderSummary({
        model: monitorModel({
          rows: [
            {
              measured: true,
              index: 1,
              label: "6:00 @ 6k",
              timeLabel: "6:00",
              paceLabel: "2:09.3",
              targetLabel: "2:09.0",
              spmCell: { measured: 24 },
              onTarget: true,
            },
          ],
        }),
      });
      expect(screen.getByRole("listitem")).toHaveAccessibleName(
        "Interval 1: 6:00 @ 6k, 6:00 at 2:09.3 per 500, target 2:09.0 per 500, 24 strokes per minute, on target",
      );
    });

    it("target-only SPM on an abstained effort row: the SPM clause alone — no TARGET clause (no targetSplit), no judgment clause (never judged)", () => {
      renderSummary({
        model: monitorModel({
          rows: [
            {
              measured: true,
              index: 2,
              label: "100 m @ MAX",
              timeLabel: "0:21",
              paceLabel: "1:45.0",
              spmCell: { target: 22 },
              // targetLabel/judged/onTarget all intentionally absent —
              // the abstained-effort-row shape.
            },
          ],
        }),
      });
      expect(screen.getByRole("listitem")).toHaveAccessibleName(
        "Interval 2: 100 m @ MAX, 0:21 at 1:45.0 per 500, target 22 strokes per minute",
      );
    });

    it("by-hand (prescribed) rows: the accessible name is unchanged plain text — no target/SPM/judgment clause exists on this row shape at all", () => {
      renderSummary({ model: prescribedOnlyModel() });
      expect(
        screen.getByRole("listitem", { name: /10:00 @ 6k \+8/ }),
      ).toHaveAccessibleName("Interval 1: 10:00 @ 6k +8, not measured");
    });
  });
});

describe("PostWorkoutSummary — save stack (§2F)", () => {
  it("with an active plan (not onboarding): Log against plan leads with the plan position, Save without logging is secondary", async () => {
    const user = userEvent.setup();
    const onLogAgainstPlan = vi.fn();
    const onSaveWithoutLogging = vi.fn();
    renderSummary({
      plan: plan({ doneN: 3, sequence: plan().sequence }),
      onLogAgainstPlan,
      onSaveWithoutLogging,
    });
    const lead = screen.getByRole("button", {
      name: "Log against plan · SESSION 4 OF 12",
    });
    expect(lead.className).toContain("summary-save-lead");
    const secondary = screen.getByRole("button", {
      name: "Save without logging",
    });
    expect(secondary.className).toContain("summary-save-secondary");

    await user.click(lead);
    expect(onLogAgainstPlan).toHaveBeenCalledTimes(1);
    await user.click(secondary);
    expect(onSaveWithoutLogging).toHaveBeenCalledTimes(1);
  });

  // Phase 8A (James's ruling 5, 2026-08-22): the 6I demotion narrowed to
  // its actual population — an onboarding-titled workout on an account
  // whose BASELINES ARE NULL. Both tests below build the condition from
  // the REAL inputs (a designated title constant + a baselines state), so
  // neither can stay green if the component's derivation breaks — the
  // pre-8A version passed `isOnboarding: true` as a prop and pinned the
  // soft-locking behaviour through any wiring change.
  it("6I: an onboarding-titled workout on a NO-BASELINE account demotes Log against plan to the outline slot", () => {
    renderSummary({
      plan: plan(),
      title: ONBOARDING_TITLES.k6,
      accountBaselines: null,
    });
    const lead = screen.getByRole("button", { name: "Save without logging" });
    expect(lead.className).toContain("summary-save-lead");
    const secondary = screen.getByRole("button", {
      name: /Log against plan/,
    });
    expect(secondary.className).toContain("summary-save-secondary");
  });

  it("8A: the same onboarding-titled workout on a BASELINED account leads with Log against plan (the checkpoint day)", () => {
    renderSummary({
      plan: plan(),
      title: ONBOARDING_TITLES.k2,
      accountBaselines: { k2Seconds: 112, k6Seconds: 122 },
    });
    const lead = screen.getByRole("button", {
      name: "Log against plan · SESSION 4 OF 12",
    });
    expect(lead.className).toContain("summary-save-lead");
    expect(
      screen.getByRole("button", { name: "Save without logging" }).className,
    ).toContain("summary-save-secondary");
  });

  it("an ordinary title on a NO-BASELINE account still leads with Log against plan (the demotion keys on both inputs)", () => {
    renderSummary({ plan: plan(), accountBaselines: null });
    expect(
      screen.getByRole("button", { name: /Log against plan/ }).className,
    ).toContain("summary-save-lead");
  });

  // Timer-mode spec (2026-09-02, ruling 5): with no plan there is nothing
  // to log against, so "without logging" describes a choice the rower
  // never had — the lone button reads `Save`. The words `Save without
  // logging` survive only beneath `Log against plan` (the tests above).
  it("with no active plan, Log against plan is hidden (not disabled) and the lone button reads Save — never 'Save without logging'", async () => {
    const user = userEvent.setup();
    const onSaveWithoutLogging = vi.fn();
    renderSummary({ plan: null, onSaveWithoutLogging });
    expect(
      screen.queryByRole("button", { name: /Log against plan/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Save without logging" }),
    ).not.toBeInTheDocument();
    const lead = screen.getByRole("button", { name: "Save" });
    expect(lead.className).toContain("summary-save-lead");
    // Same handler, same slot — only the words changed.
    await user.click(lead);
    expect(onSaveWithoutLogging).toHaveBeenCalledTimes(1);
  });

  it("disables both save buttons while saving, and renders the save error", () => {
    renderSummary({
      saving: true,
      saveError: "Couldn't save this session. Try again.",
    });
    expect(
      screen.getByRole("button", { name: /Log against plan/ }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Save without logging" }),
    ).toBeDisabled();
    expect(
      screen.getByText("Couldn't save this session. Try again."),
    ).toBeInTheDocument();
  });

  it("renders the caller's discardSlot verbatim, and nothing extra when it is null", () => {
    const { rerender } = renderSummary();
    expect(
      screen.getByRole("button", { name: "Discard without logging" }),
    ).toBeInTheDocument();
    rerender(
      <MemoryRouter>
        <PostWorkoutSummary {...baseProps({ discardSlot: null })} />
      </MemoryRouter>,
    );
    expect(
      screen.queryByRole("button", { name: "Discard without logging" }),
    ).not.toBeInTheDocument();
  });
});

describe("PostWorkoutSummary — diagnostics passthrough", () => {
  it("renders children (the diagnostics rows) below the save stack, and nothing extra when omitted", () => {
    const { rerender } = render(
      <MemoryRouter>
        <PostWorkoutSummary {...baseProps()}>
          <button type="button">MONITOR LOG · COPY</button>
        </PostWorkoutSummary>
      </MemoryRouter>,
    );
    expect(
      screen.getByRole("button", { name: "MONITOR LOG · COPY" }),
    ).toBeInTheDocument();

    rerender(
      <MemoryRouter>
        <PostWorkoutSummary {...baseProps()} />
      </MemoryRouter>,
    );
    expect(
      screen.queryByRole("button", { name: "MONITOR LOG · COPY" }),
    ).not.toBeInTheDocument();
  });
});

describe("offsetFragment", () => {
  it("returns the text after the shared ' @ ' idiom", () => {
    expect(offsetFragment("0:30 @ 6k +8")).toBe("6k +8");
    expect(offsetFragment("0:30 @ MAX")).toBe("MAX");
  });

  it("falls back to the whole label when the idiom is absent (a legacy pre-ref label)", () => {
    expect(offsetFragment("some legacy label")).toBe("some legacy label");
  });
});

// Phase LT spec 3, Task 3 (§1: "the live summary" host, placement below
// the intervals block, absent when the door has none — every current door
// but monitor, `LogSession.tsx`'s own doc comment). `<TraceChart>` already
// owns every absence/gate rule (Task 2, `TraceChart.test.tsx`) — this
// suite's only job is proving THIS screen passes `series` straight
// through and puts the result in the right place, never re-testing the
// chart's own math a second time.
describe("PostWorkoutSummary — the trace chart (Phase LT spec 3)", () => {
  it("renders the chart below the intervals block when `series` carries real readings", () => {
    const { container } = renderSummary({ series: realisticSeries() });
    const figure = container.querySelector(".trace-figure");
    const intervals = container.querySelector(".summary-intervals");
    expect(figure).not.toBeNull();
    expect(intervals).not.toBeNull();
    // DOM-order assertion, both directions (spec 1's fix-round technique,
    // `FromTheLog.test.tsx`'s own precedent) — a single-bit check could
    // pass on garbage input.
    expect(
      intervals!.compareDocumentPosition(figure!) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      figure!.compareDocumentPosition(intervals!) &
        Node.DOCUMENT_POSITION_PRECEDING,
    ).toBeTruthy();
  });

  it("renders NOTHING when `series` is absent — the timer/by-hand doors' own shape (no `series` prop at all)", () => {
    const { container } = renderSummary();
    expect(container.querySelector(".trace-figure")).toBeNull();
  });
});

describe("singleTargetHint", () => {
  it("returns TARGET m:ss when exactly one distinct target split exists", () => {
    expect(singleTargetHint([{ targetSplit: 129 }, { targetSplit: 129 }])).toBe(
      "TARGET 2:09.0",
    );
  });

  it("returns undefined for zero distinct targets (effort-only)", () => {
    expect(singleTargetHint([{}, {}])).toBeUndefined();
  });

  it("returns undefined for more than one distinct target (multi-target)", () => {
    expect(
      singleTargetHint([{ targetSplit: 129 }, { targetSplit: 140 }]),
    ).toBeUndefined();
  });
});

// ---------------------------------------------------------------------
// Door spec (2026-09-02) §5.1/§5.4/§6 — the in-flight pair, rendered.
// Gate 0-B (James, 2026-09-02) APPROVED decisions (a), (c), (d), (f) and
// (g); the copy and structure below are that approval, not a proposal.
// ---------------------------------------------------------------------

/** The artboard's own scenario: Tropical Wave's five 500 m reps, End
 *  pressed 250 m into interval 3. Rows 1-2 measured, 3 partial, 4-5 never
 *  reached — so this model carries all three row shapes at once, which is
 *  what makes the "dash on one, pair on another" assertions below mean
 *  anything. */
function partialModel(overrides: Partial<SummaryModel> = {}): SummaryModel {
  return {
    meta: {
      dateLabel: "AUG 10",
      timeLabel: "18:57",
      sourceLabel: "PM5 432331249",
    },
    heroes: { avgSplit: "1:52.0", time: "3:44", distanceMeters: 1000 },
    rows: [
      {
        measured: true,
        index: 1,
        label: "500 m @ 2k +2",
        timeLabel: "1:52",
        paceLabel: "1:52.0",
      },
      {
        measured: true,
        index: 2,
        label: "500 m @ 2k +2",
        timeLabel: "1:52",
        paceLabel: "1:52.0",
      },
      {
        measured: false,
        index: 3,
        label: "500 m @ 2k +2",
        durationLabel: "500 m",
        targetPaceLabel: "1:52.0",
        partialLabel: "250 m · 1:03",
      },
      {
        measured: false,
        index: 4,
        label: "500 m @ 2k +2",
        durationLabel: "500 m",
        targetPaceLabel: "1:52.0",
      },
      {
        measured: false,
        index: 5,
        label: "500 m @ 2k +2",
        durationLabel: "500 m",
        targetPaceLabel: "1:52.0",
      },
    ],
    ...overrides,
  };
}

function rowByIndex(index: number): HTMLElement {
  return screen.getByRole("listitem", {
    name: new RegExp(`^Interval ${index}:`),
  });
}

describe("PostWorkoutSummary — the in-flight pair on a partial step row (§5.1)", () => {
  it("renders the pair as an EXTRA CELL IN FRONT OF the dash — the dash stays, so a part-rowed row never reads as a rowed one (Gate 0-B decision (a))", () => {
    renderSummary({ model: partialModel() });
    const partial = rowByIndex(3);
    // A DIRECT CHILD of `.summary-row`, which is the flex CONTAINER — so
    // `index.css`'s `flex: 0 0 auto` lands on the flex ITEM and the shrink
    // algorithm actually reads it. RF21's recorded failure was a
    // declaration placed on a DESCENDANT, where it is inert; a plain
    // `querySelector` here would match a wrapped span just as happily and
    // was MEASURED to stay green under exactly that mutation (M5.4b in the
    // task report), which is why this is `:scope >`.
    expect(
      partial.querySelector(":scope > .summary-row-partial")?.textContent,
    ).toBe("250 m · 1:03");

    // THE DASH STAYS. The approved artboard renders the alternative — the
    // pair REPLACING the dash — beside the recommendation and captions it
    // "Not recommended: the dash is doing real work", because it is the
    // one mark rows 3, 4 and 5 share and the only thing that stops a
    // part-rowed row ending in a number like the measured rows above it.
    // This assertion is what holds the rejected shape out.
    expect(
      partial.querySelector(":scope > .summary-row-dash")?.textContent,
    ).toBe("—");

    // ORDER: pair, THEN dash. The row must end on the dash.
    const cells = Array.from(partial.children).map((c) => c.className);
    expect(cells).toStrictEqual([
      "summary-row-index",
      "summary-row-duration",
      "summary-row-target",
      "summary-row-offset",
      "summary-row-partial",
      "summary-row-dash",
    ]);

    // The unreached row keeps exactly what it has today — the dash, and
    // no partial element at all.
    const unreached = rowByIndex(4);
    expect(unreached.querySelector(".summary-row-dash")?.textContent).toBe("—");
    expect(unreached.querySelector(".summary-row-partial")).toBeNull();
  });

  it("NO pace, split or rate cell appears on a partial row — Gate 0-B decision (f), so a future `helpful` derivation goes red here", () => {
    // The pair's clock is ELAPSED, not rowing time (the PM5 has no paused
    // state), so a quotient of the two would be a split nobody rowed.
    // Asserted as ABSENCE of the two cells that would carry one.
    renderSummary({ model: partialModel() });
    const partial = rowByIndex(3);
    expect(partial.querySelector(".summary-row-pace")).toBeNull();
    expect(partial.querySelector(".summary-row-dev")).toBeNull();
    expect(partial.querySelector(".summary-row-bar-track")).toBeNull();
    // A measured sibling in the SAME list DOES carry a pace cell, so this
    // is a real absence rather than a selector that matches nothing
    // anywhere (RF21 — a gate that cannot go red).
    expect(rowByIndex(1).querySelector(".summary-row-pace")).not.toBeNull();
  });

  it("the accessible name speaks the pair instead of `not measured` (Gate 0-B decision (g))", () => {
    renderSummary({ model: partialModel() });
    expect(
      screen.getByRole("listitem", {
        name: "Interval 3: 500 m @ 2k +2, stopped at 250 m · 1:03",
      }),
    ).toBeInTheDocument();
    // The unreached row's own name is untouched.
    expect(
      screen.getByRole("listitem", {
        name: "Interval 4: 500 m @ 2k +2, not measured",
      }),
    ).toBeInTheDocument();
  });

  it("a ZERO pair renders as a real reading — `0 m · 0:00`, spoken and shown, with no floor swallowing it", () => {
    renderSummary({
      model: partialModel({
        rows: [
          {
            measured: false,
            index: 1,
            label: "500 m @ 2k +2",
            durationLabel: "500 m",
            targetPaceLabel: "1:52.0",
            partialLabel: "0 m · 0:00",
          },
        ],
      }),
    });
    expect(
      screen.getByRole("listitem", {
        name: "Interval 1: 500 m @ 2k +2, stopped at 0 m · 0:00",
      }),
    ).toBeInTheDocument();
    expect(screen.getByText("0 m · 0:00")).toBeInTheDocument();
  });
});

describe("PostWorkoutSummary — the link-lost caption block (§6, Gate 0-B decision (c))", () => {
  it("a single-interval link-lost model renders EXACTLY ONE caption element, carrying the partial sentence", () => {
    // The model tests gate the VALUE (`summaryModel.test.ts` /
    // `storedSummary.test.ts`); this leg gates that the block still
    // renders ONE element for it — precedence, not two stacked captions.
    const { container } = renderSummary({
      model: partialModel({
        rows: [
          {
            measured: false,
            index: 1,
            label: "500 m @ 2k +2",
            durationLabel: "500 m",
            targetPaceLabel: "1:52.0",
            partialLabel: "250 m · 1:03",
          },
        ],
        caption: "INTERVAL 1 · LAST READING BEFORE THE LINK WENT",
      }),
    });
    const captions = container.querySelectorAll(
      ".summary-targets-only-caption",
    );
    expect(captions).toHaveLength(1);
    expect(captions[0]!.textContent).toBe(
      "INTERVAL 1 · LAST READING BEFORE THE LINK WENT",
    );
    expect(
      screen.queryByText("TARGETS ONLY · NOTHING MEASURED"),
    ).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------
// The structural CSS pin (docs/TESTING.md §8). jsdom never loads
// `index.css` as real stylesheet rules, so the rule is read off disk and
// parsed — through `cssView`'s comment-stripped view, so a rule's PROSE
// can never satisfy an assertion about its declarations.
// ---------------------------------------------------------------------

/** Its OWN path regex, scoped to `src/session/`: a regex scoped to some
 *  other directory would silently fail to substitute here, the read would
 *  point at THIS file, and every rule lookup would come back empty — a
 *  gate green by vacuity (RF21). The non-empty leg below is the tripwire
 *  for exactly that. */
const SUMMARY_CSS_PATH = import.meta.url
  .replace(/^file:\/\//, "")
  .replace(/session\/[^/]+\.test\.tsx$/, "index.css");
const SUMMARY_CSS = commentStrippedSource(
  readFileSync(SUMMARY_CSS_PATH, "utf-8"),
);

function summaryRuleFor(selector: string) {
  const rules = cssRules(SUMMARY_CSS).filter((r) =>
    r.selectors.includes(selector),
  );
  expect(rules, `expected exactly one ${selector} rule`).toHaveLength(1);
  return rules[0]!;
}

/** The rule's own computed `flex-shrink`, read from either the shorthand
 *  (`flex: <grow> <shrink> <basis>`) or the longhand. Parsed rather than
 *  string-matched because the assertion has to be about the VALUE the
 *  shrink algorithm reads, not about which spelling the author chose. */
function flexShrinkOf(body: string): string | undefined {
  const longhand = /(?:^|;)\s*flex-shrink\s*:\s*([^;]+)/.exec(body);
  if (longhand) return longhand[1]!.trim();
  const shorthand = /(?:^|;)\s*flex\s*:\s*([^;]+)/.exec(body);
  if (!shorthand) return undefined;
  const parts = shorthand[1]!.trim().split(/\s+/);
  // `flex: <grow> <shrink> <basis>` — a two-or-three-value shorthand names
  // shrink second; a single-number `flex: 1` leaves shrink at its initial 1.
  return parts.length >= 2 ? parts[1]! : "1";
}

describe("index.css: .summary-row-partial is a NON-SHRINKING, NON-WRAPPING flex ITEM", () => {
  it("reads a non-empty index.css (the path regex actually substituted)", () => {
    expect(SUMMARY_CSS_PATH.endsWith("/src/index.css")).toBe(true);
    expect(SUMMARY_CSS.length).toBeGreaterThan(1000);
    expect(cssRules(SUMMARY_CSS).length).toBeGreaterThan(100);
  });

  it("declares .summary-row-partial with flex-shrink 0 and white-space nowrap, ON THE FLEX ITEM ITSELF", () => {
    // RF21's own recorded failure was a `min-width` placed on a CHILD of
    // the flex item, where the shrink algorithm never reads it. This
    // asserts on the rule for the element `IntervalRow` renders as a
    // direct child of `.summary-row` (which is `display: flex`), so the
    // declaration is on the item the algorithm actually consults.
    const rule = summaryRuleFor(".summary-row-partial");
    expect(rule.at).toStrictEqual([]);
    expect(rule.selectors).toStrictEqual([".summary-row-partial"]);
    expect(flexShrinkOf(rule.body)).toBe("0");
    expect(rule.body).toMatch(/white-space:\s*nowrap/);
    // Contrast computed, never eyeballed (RF6): `--ink-2` (#3f3c35) on
    // `--page` (#f4f1e8) is 9.75:1 and on `--surface` (#fffdf7) is
    // 10.81:1 — both clear the 4.5:1 AA floor.
    expect(rule.body).toMatch(/color:\s*var\(--ink-2\)/);
    expect(rule.body).toMatch(/font-family:\s*var\(--font-mono\)/);
  });

  it("is typed as one of the table's own numbers: every TYPE declaration is `.summary-row-time`'s, tabular figures included", () => {
    // Gate 0-B's approved rule, verbatim: "Every declaration is
    // `.summary-row-time`'s own (mono, 13px, --ink-2, tabular-nums): the
    // pair is typed as one of the table's numbers, not as a new register.
    // Only the box differs." Held equal here rather than trusted, so the
    // two cannot drift into two registers. `.summary-row-time` shares its
    // rule with `.summary-row-duration`, which is why the selector list is
    // read rather than assumed.
    const partial = summaryRuleFor(".summary-row-partial");
    const rules = cssRules(SUMMARY_CSS).filter((r) =>
      r.selectors.includes(".summary-row-time"),
    );
    expect(rules).toHaveLength(1);
    const time = rules[0]!;
    const typeDecls = (body: string) =>
      body
        .split(";")
        .map((d) => d.trim().replace(/\s+/g, " "))
        .filter((d) =>
          /^(font-family|font-size|color|font-variant-numeric)\s*:/.test(d),
        )
        .sort();
    expect(typeDecls(partial.body)).toStrictEqual(typeDecls(time.body));
    // Named as well as compared, so deleting a declaration from BOTH rules
    // cannot keep this leg green.
    expect(typeDecls(partial.body)).toStrictEqual([
      "color: var(--ink-2)",
      "font-family: var(--font-mono)",
      "font-size: 13px",
      "font-variant-numeric: tabular-nums",
    ]);
  });

  it("the neighbour that yields the space still does: .summary-row-offset stays flex: 1 with min-width: 0", () => {
    // Named here because `.summary-row-partial`'s non-shrink is only
    // survivable if something ELSE in the row absorbs the squeeze; if this
    // ever stops being the flexible cell, the partial's `flex: 0 0 auto`
    // becomes an overflow rather than a nowrap.
    const rule = summaryRuleFor(".summary-row-offset");
    expect(rule.body).toMatch(/flex:\s*1\s*;/);
    expect(rule.body).toMatch(/min-width:\s*0/);
  });
});
