import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import type { PlanData } from "../api/usePlan";
import PostWorkoutSummary, {
  offsetFragment,
  singleTargetHint,
} from "./PostWorkoutSummary";
import type { SummaryModel } from "./summaryModel";

// A realistic monitor-door-shaped model: a warm-up row plus two judged work
// rows (one faster, one slower than the working average) — the same shape
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
        isWarmup: true,
        label: "WARM-UP",
        timeLabel: "4:00",
        paceLabel: "2:20.0",
      },
      {
        measured: true,
        isWarmup: false,
        index: 1,
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
        isWarmup: false,
        index: 2,
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
        isWarmup: false,
        index: 1,
        label: "10:00 @ 6k +8",
        durationLabel: "10:00",
        targetPaceLabel: "2:00.0",
      },
      {
        measured: false,
        isWarmup: false,
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
    isOnboarding: false,
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
  it("renders the warm-up row labeled WARM-UP with no deviation bar or number", () => {
    renderSummary();
    const rows = screen.getAllByRole("listitem");
    const warmup = rows.find((r) => r.className.includes("summary-row-warmup"));
    expect(warmup).toBeDefined();
    expect(within(warmup!).getByText("WARM-UP")).toBeInTheDocument();
    expect(within(warmup!).queryByText(/^[+−]/)).not.toBeInTheDocument();
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
            isWarmup: false,
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
            isWarmup: false,
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

  // A real, if unusual, monitor-door shape (LogSession.test.tsx's own
  // "unusable avgSplit" fixture, R-B/monitorWorkRows): a real elapsed
  // reading with no usable pace (avgSplit 0, "the wire had no reading" —
  // dropped, never fabricated). Proves the row still renders MEASURED
  // (time shown) with an empty (not "undefined") pace cell, and that the
  // aria-label degrades to naming only what was actually read.
  it("a measured row with a time but no pace omits the pace segment from both the cell and the accessible name", () => {
    renderSummary({
      model: monitorModel({
        rows: [
          {
            measured: true,
            isWarmup: false,
            index: 1,
            label: "6:00 @ 6k",
            timeLabel: "11:45",
            // paceLabel intentionally absent.
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

describe("PostWorkoutSummary — save stack (§2F)", () => {
  it("with an active plan (not onboarding): Log against plan leads with the plan position, Save without logging is secondary", async () => {
    const user = userEvent.setup();
    const onLogAgainstPlan = vi.fn();
    const onSaveWithoutLogging = vi.fn();
    renderSummary({
      plan: plan({ doneN: 3, sequence: plan().sequence }),
      isOnboarding: false,
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

  it("on an onboarding-title workout, Save without logging leads and Log against plan demotes to the outline slot", () => {
    renderSummary({ plan: plan(), isOnboarding: true });
    const lead = screen.getByRole("button", { name: "Save without logging" });
    expect(lead.className).toContain("summary-save-lead");
    const secondary = screen.getByRole("button", {
      name: /Log against plan/,
    });
    expect(secondary.className).toContain("summary-save-secondary");
  });

  it("with no active plan, Log against plan is hidden (not disabled) and Save without logging leads alone", () => {
    renderSummary({ plan: null, isOnboarding: false });
    expect(
      screen.queryByRole("button", { name: /Log against plan/ }),
    ).not.toBeInTheDocument();
    const lead = screen.getByRole("button", { name: "Save without logging" });
    expect(lead.className).toContain("summary-save-lead");
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
