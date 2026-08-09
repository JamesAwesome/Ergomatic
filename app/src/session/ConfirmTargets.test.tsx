import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { LIBRARY_WORKOUTS } from "../../server/seed/library/index";
import { resolveSplit } from "../../domain/pace.js";
import { fmtSplit } from "../../domain/format.js";
import type { WorkoutType } from "../../domain/types.js";
import {
  buildDraft,
  loadDraft,
  saveDraft,
  startDraft,
  type SessionDraft,
} from "./draft";
import {
  clampMeters,
  clampReps,
  clampSpm,
  snapDurationSeconds,
} from "./ConfirmTargets";

// Realistic fixtures, per repo convention: real library workouts
// (app/server/seed/library/index.ts), matching draft.test.ts's own choices
// so the pinned minute totals here are the exact same already-verified
// numbers.
// - Hoarfrost (O2): wu 6' + reps×2 marker + one split-ref work step (22
//   spm, 6k+12, 5' embedded rest) — the reps-marker fixture.
// - Calm Sea (O2): wu 8' + a single 10,000 m distance work step — the
//   distance-duration-stepper fixture. (Meltemi used to hold this role; the
//   library rewrite turned it into a 5-phase TIME workout with no distance
//   step at all, so this suite re-anchored to Calm Sea — same 10,000 m
//   distance, matching draft.test.ts/engine.test.ts/logDraft.test.ts.)
// - Heat Lightning (AN): wu 10' + reps×10 marker + an EFFORT-ref work step —
//   the no-nudge/effort-word fixture. (Fork Lightning used to hold this
//   role; the rewrite turned its reps block into TWO alternating work
//   steps, which renders as two separate editable rows here and breaks the
//   "exactly one ALL OUT row" assumption this test makes, so this suite
//   re-anchored to Heat Lightning, which still has a single repeated step.)
function library(title: string) {
  const w = LIBRARY_WORKOUTS.find((s) => s.title === title);
  if (!w) throw new Error(`missing library fixture: ${title}`);
  return w;
}

function seedDraft(title: string, id = `id-${title}`): SessionDraft {
  const w = library(title);
  const draft = buildDraft({
    id,
    title: w.title,
    type: w.type as WorkoutType,
    steps: w.steps,
  });
  saveDraft(draft);
  return draft;
}

const BASELINES = { k2Seconds: 100, k6Seconds: 120 };
const NO_BASELINES = { k2Seconds: null, k6Seconds: null };

function mockBaselines(
  baselines: { k2Seconds: number | null; k6Seconds: number | null } = BASELINES,
) {
  vi.doMock("../api/useBaselines", () => ({
    useBaselines: () => ({ state: "ready", baselines }),
  }));
}

async function renderConfirm(initialPath = "/session/confirm") {
  const { default: ConfirmTargets } = await import("./ConfirmTargets");
  render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="/session/confirm" element={<ConfirmTargets />} />
        <Route path="/today" element={<p>TODAY SCREEN</p>} />
        <Route path="/session/countdown" element={<p>COUNTDOWN SCREEN</p>} />
        <Route path="/session/run" element={<p>RUN SCREEN</p>} />
        <Route path="/you" element={<p>YOU SCREEN</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.resetModules();
  localStorage.clear();
});

describe("ConfirmTargets", () => {
  it("redirects to /today when there is no draft", async () => {
    mockBaselines();
    await renderConfirm();

    expect(await screen.findByText("TODAY SCREEN")).toBeInTheDocument();
  });

  // F3 fix (final whole-branch review): a STARTED draft is re-enterable at
  // this route via back-swipe (the browser history entry for
  // /session/confirm still exists after START navigated away from it).
  // Before this fix, landing back here re-rendered the full editable target
  // list, and a second START press would re-stamp `startedAt` — silently
  // restarting whatever 6B's real timer thought was in progress. Uses
  // `startDraft` (not a hand-built `startedAt` string) so this exercises
  // the exact shape the real START button produces.
  it("redirects to /session/run instead of re-rendering when the draft is already STARTED", async () => {
    mockBaselines();
    const d = seedDraft("Hoarfrost");
    saveDraft(startDraft(d));
    await renderConfirm();

    expect(await screen.findByText("RUN SCREEN")).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Hoarfrost" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Looks right, start" }),
    ).not.toBeInTheDocument();
  });

  it("shows LOADING… while baselines are still resolving", async () => {
    vi.doMock("../api/useBaselines", () => ({
      useBaselines: () => ({ state: "loading" }),
    }));
    seedDraft("Hoarfrost");
    await renderConfirm();

    expect(screen.getByText("LOADING…")).toBeInTheDocument();
  });

  it("shows a retry control when baselines fail to load", async () => {
    const retry = vi.fn();
    vi.doMock("../api/useBaselines", () => ({
      useBaselines: () => ({ state: "error", retry }),
    }));
    seedDraft("Hoarfrost");
    await renderConfirm();

    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it("renders the draft's title, type badge, and initial recount", async () => {
    mockBaselines();
    seedDraft("Hoarfrost");
    await renderConfirm();

    expect(
      screen.getByRole("heading", { name: "Hoarfrost" }),
    ).toBeInTheDocument();
    expect(screen.getByText("O2")).toBeInTheDocument();
    // 2 * (12' work + 5' rest) = 2040s -> 34 (draft.test.ts's own pinned
    // total for this exact fixture/baseline pair). No warm-up: the setting
    // is OFF by default and no workout carries one since 2026-08-09.
    expect(screen.getByText("34 MIN")).toBeInTheDocument();
  });

  it("shows an em-dash recount and a no-target fallback with no baselines, and hides every nudge control", async () => {
    mockBaselines(NO_BASELINES);
    seedDraft("Hoarfrost");
    await renderConfirm();

    expect(screen.getByText("— MIN")).toBeInTheDocument();
    // Two "no target" idioms now render with no baselines: the row-level
    // one (Hoarfrost's split-ref work step) and the footer's own (below) —
    // both the same idiom, different scope.
    expect(screen.getAllByText("no target")).toHaveLength(2);
    expect(
      screen.queryByRole("button", { name: /nudge/i }),
    ).not.toBeInTheDocument();
  });

  // Ledger item 2 (routed from Task 2's review): buildRun needs a concrete
  // Baselines always, so START is blocked entirely — not just per-row —
  // whenever baselines are unset, via the same no-target/`/you` idiom
  // rather than letting a rower reach Countdown with nothing to build a
  // real run from.
  it("blocks START and shows the no-target idiom with a /you link when baselines are unset", async () => {
    mockBaselines(NO_BASELINES);
    seedDraft("Hoarfrost");
    await renderConfirm();

    expect(
      screen.queryByRole("button", { name: "Looks right, start" }),
    ).not.toBeInTheDocument();
    const footer = screen.getByText("— MIN").closest("footer")!;
    const link = within(footer).getByRole("link", { name: "Set baselines" });
    expect(link).toHaveAttribute("href", "/you");

    await userEvent.click(link);
    expect(await screen.findByText("YOU SCREEN")).toBeInTheDocument();
  });

  it("the work step's duration stepper snaps by 30s and moves the footer recount", async () => {
    mockBaselines();
    seedDraft("Hoarfrost");
    await renderConfirm();

    expect(screen.getByText("34 MIN")).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("button", { name: "Row 2 duration down" }),
    );

    const group = screen.getByRole("group", { name: "Row 2 duration" });
    expect(within(group).getByText("11:30")).toBeInTheDocument();
    // Removing 30s from each of the 2 reps: 34 - 1 = 33.
    expect(screen.getByText("33 MIN")).toBeInTheDocument();
  });

  it("a distance work step's duration stepper steps by 100m in both directions", async () => {
    mockBaselines();
    seedDraft("Calm Sea");
    await renderConfirm();

    const group = screen.getByRole("group", { name: "Row 1 duration" });
    expect(within(group).getByText("10000 M")).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("button", { name: "Row 1 duration up" }),
    );
    expect(within(group).getByText("10100 M")).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("button", { name: "Row 1 duration down" }),
    );
    expect(within(group).getByText("10000 M")).toBeInTheDocument();
  });

  it("the SPM stepper wakes from the step's own spm, not always 20, in both directions", async () => {
    mockBaselines();
    seedDraft("Hoarfrost"); // the work step carries spm: 22
    await renderConfirm();

    const group = screen.getByRole("group", { name: "Row 2 stroke rate" });
    expect(within(group).getByText("22")).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("button", { name: "Row 2 stroke rate up" }),
    );
    expect(within(group).getByText("23")).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("button", { name: "Row 2 stroke rate down" }),
    );
    expect(within(group).getByText("22")).toBeInTheDocument();
  });

  it("the SPM stepper wakes at 20 when the step carries no spm of its own", async () => {
    mockBaselines();
    const draft: SessionDraft = {
      v: 1,
      workoutId: "synthetic",
      title: "No SPM",
      type: "O2",
      steps: [
        {
          k: "w",
          duration: { kind: "time", minutes: 10 },
          ref: { base: "6k", off: 0 },
        },
      ],
      nudges: {},
      spmOverrides: {},
      removed: [],
      createdAt: new Date().toISOString(),
      startedAt: null,
    };
    saveDraft(draft);
    await renderConfirm();

    const group = screen.getByRole("group", { name: "Row 1 stroke rate" });
    expect(within(group).getByText("20")).toBeInTheDocument();
  });

  it("the reps marker gets a rep stepper, no remove/restore control, and its count moves the recount", async () => {
    mockBaselines();
    seedDraft("Hoarfrost");
    await renderConfirm();

    const markerRow = screen.getByText(/REPEAT/).closest(".step-editor");
    expect(markerRow).not.toBeNull();
    expect(
      within(markerRow as HTMLElement).queryByRole("button", {
        name: /remove|restore/i,
      }),
    ).not.toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("button", { name: "Row 1 reps up" }),
    );
    // 3 * (12' + 5') = 3060s -> 51.
    expect(screen.getByText("51 MIN")).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("button", { name: "Row 1 reps down" }),
    );
    expect(screen.getByText("34 MIN")).toBeInTheDocument();
  });

  // Moonbow (w 15' / r 3' / w 12'), not Hoarfrost: these two tests need
  // two independently removable rows, and Hoarfrost is down to a reps
  // marker (which has no remove control) plus one work row now that the
  // warm-up row it used to strike here is gone (2026-08-09's setting).
  it("removing a row excludes it from the recount, strikes it visibly, and restoring undoes both", async () => {
    mockBaselines();
    seedDraft("Moonbow");
    await renderConfirm();

    const restRow = screen.getByText(/· REST/).closest(".step-editor");
    expect(restRow).not.toBeNull();
    expect(restRow).not.toHaveClass("confirm-step-removed");

    await userEvent.click(screen.getByRole("button", { name: "Remove Row 2" }));

    expect(restRow).toHaveClass("confirm-step-removed");
    // 15' + 12' = 27, the 3' rest dropped out of the 30' total.
    expect(screen.getByText("27 MIN")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Restore Row 2" }),
    ).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("button", { name: "Restore Row 2" }),
    );

    expect(restRow).not.toHaveClass("confirm-step-removed");
    expect(screen.getByText("30 MIN")).toBeInTheDocument();
  });

  it("removing two rows exercises the removed-index sort with a real multi-element array", async () => {
    mockBaselines();
    seedDraft("Moonbow");
    await renderConfirm();

    await userEvent.click(screen.getByRole("button", { name: "Remove Row 1" }));
    await userEvent.click(screen.getByRole("button", { name: "Remove Row 3" }));

    // Only the 3' rest row (Row 2) is left un-struck — both work rows gone.
    expect(screen.getByText("3 MIN")).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("button", { name: "Restore Row 3" }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Restore Row 1" }),
    );
    expect(screen.getByText("30 MIN")).toBeInTheDocument();
  });

  it("nudging a split step's target updates the exact split shown in both directions, clamped to a real split", async () => {
    mockBaselines();
    seedDraft("Hoarfrost");
    await renderConfirm();

    const ref = { base: "6k" as const, off: 12 };
    const before = fmtSplit(resolveSplit(BASELINES, ref, 0));
    expect(screen.getByText(before)).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("button", { name: "Row 2 nudge slower" }),
    );

    const after = fmtSplit(resolveSplit(BASELINES, ref, 1));
    expect(screen.getByText(after)).toBeInTheDocument();
    expect(screen.queryByText(before)).not.toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("button", { name: "Row 2 nudge faster" }),
    );
    expect(screen.getByText(before)).toBeInTheDocument();
    expect(screen.queryByText(after)).not.toBeInTheDocument();
  });

  // Hand-built rather than a library fixture: no seeded workout carries a
  // "test" step (validateSteps permits it; the builder just never authors
  // one), so this is the only way to exercise every row kind's header
  // label and the REST duration branch's own up AND down presses. (It
  // carried a `wu` row too until 2026-08-09's warmup setting deleted that
  // row kind; the rest row is the only user of that shared duration branch
  // now.)
  const KITCHEN_SINK: SessionDraft = {
    v: 1,
    workoutId: "w-sink",
    title: "Kitchen Sink",
    type: "TR",
    steps: [
      {
        k: "w",
        duration: { kind: "time", minutes: 2 },
        ref: { base: "2k", off: 0 },
        spm: 24,
      },
      { k: "r", minutes: 2 },
      { k: "test", label: "2k test" },
    ],
    nudges: {},
    spmOverrides: {},
    removed: [],
    createdAt: new Date().toISOString(),
    startedAt: null,
  };

  it("renders every row kind with the right header label and both duration-stepper directions", async () => {
    mockBaselines();
    saveDraft(KITCHEN_SINK);
    await renderConfirm();

    expect(screen.queryByText(/WARM-UP/)).not.toBeInTheDocument();
    expect(screen.getByText(/· REST/)).toBeInTheDocument();
    expect(screen.getByText(/· TEST/)).toBeInTheDocument();

    // w, time-kind (Row 1): both directions (the "down" direction is
    // already covered against a different fixture in the recount test
    // above; this is the branch's own "up" press).
    const wGroup = screen.getByRole("group", { name: "Row 1 duration" });
    expect(within(wGroup).getByText("2:00")).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("button", { name: "Row 1 duration up" }),
    );
    expect(within(wGroup).getByText("2:30")).toBeInTheDocument();

    // r (Row 2): both directions.
    const rGroup = screen.getByRole("group", { name: "Row 2 duration" });
    expect(within(rGroup).getByText("2:00")).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("button", { name: "Row 2 duration down" }),
    );
    expect(within(rGroup).getByText("1:30")).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("button", { name: "Row 2 duration up" }),
    );
    expect(within(rGroup).getByText("2:00")).toBeInTheDocument();

    // The TEST row (Row 3): removable, but no stepper controls of its own.
    const testRow = screen.getByText(/· TEST/).closest(".step-editor");
    expect(
      within(testRow as HTMLElement).queryByRole("group"),
    ).not.toBeInTheDocument();
    expect(
      within(testRow as HTMLElement).getByRole("button", { name: /remove/i }),
    ).toBeInTheDocument();
  });

  it("an effort-ref step shows its effort word with no nudge control anywhere on that row", async () => {
    mockBaselines();
    seedDraft("Heat Lightning");
    await renderConfirm();

    // Header label and the TARGET row both read the effort word — the
    // header's own text node is "ROW 2 · ALL OUT" (a regex match on
    // substring), the TARGET row's is the word alone (an exact match).
    expect(screen.getAllByText(/ALL OUT/).length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText("ALL OUT")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /nudge/i }),
    ).not.toBeInTheDocument();
  });

  it("START stamps startedAt, saves the draft, and navigates to /session/countdown", async () => {
    mockBaselines();
    seedDraft("Hoarfrost");
    await renderConfirm();

    await userEvent.click(
      screen.getByRole("button", { name: "Looks right, start" }),
    );

    expect(await screen.findByText("COUNTDOWN SCREEN")).toBeInTheDocument();
    const saved = loadDraft();
    expect(saved).not.toBeNull();
    expect(saved!.startedAt).not.toBeNull();
    expect(new Date(saved!.startedAt!).toISOString()).toBe(saved!.startedAt);
  });

  // Phase 6I: `needsBaselines` (domain/needsBaselines.ts) is the single
  // predicate every coupled guard site shares — this is the footer's own
  // half. Heat Lightning (AN) is a REAL, shipped library workout whose
  // only work step is an effort ref (`{effort:"max"}`) — the realistic
  // fixture the repo convention requires, not a hand-built minimum;
  // Task 1's own review flagged that this exact pre-existing content, not
  // just the future onboarding pair, is what this guard loosening opens.
  it("shows a clickable START for an effort-only workout with null baselines (no 'no target' idiom anywhere)", async () => {
    mockBaselines(NO_BASELINES);
    seedDraft("Heat Lightning");
    await renderConfirm();

    expect(
      screen.getByRole("button", { name: "Looks right, start" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("no target")).not.toBeInTheDocument();
    // The recount is still a bare dash — `estimateMinutes` genuinely can't
    // price an effort phase without baselines, and the "never a bare dash"
    // house rule is the onboarding CARD's own fixed nominal copy (Task 5),
    // not this general workout screen's.
    expect(screen.getByText("— MIN")).toBeInTheDocument();
  });

  it("START on an effort-only workout with null baselines still stamps startedAt and navigates to /session/countdown (the flow this guard loosening exists to unblock)", async () => {
    mockBaselines(NO_BASELINES);
    seedDraft("Heat Lightning");
    await renderConfirm();

    await userEvent.click(
      screen.getByRole("button", { name: "Looks right, start" }),
    );

    expect(await screen.findByText("COUNTDOWN SCREEN")).toBeInTheDocument();
    const saved = loadDraft();
    expect(saved).not.toBeNull();
    expect(saved!.startedAt).not.toBeNull();
  });

  // Regression pin: a split-ref workout (Hoarfrost — the SAME fixture the
  // "blocks START" test above already covers) must stay blocked even
  // though the predicate now lets SOME workouts through — the guard is
  // conditional, not removed.
  it("still blocks a split-ref workout's START with null baselines (needsBaselines reads true)", async () => {
    mockBaselines(NO_BASELINES);
    seedDraft("Hoarfrost");
    await renderConfirm();

    expect(
      screen.queryByRole("button", { name: "Looks right, start" }),
    ).not.toBeInTheDocument();
    expect(screen.getAllByText("no target").length).toBeGreaterThan(0);
  });
});

describe("snapDurationSeconds", () => {
  it("snaps to the nearest 30s multiple", () => {
    expect(snapDurationSeconds(319)).toBe(330);
    expect(snapDurationSeconds(305)).toBe(300);
  });

  it("floors at 30s rather than reaching 0", () => {
    expect(snapDurationSeconds(5)).toBe(30);
  });

  it("ceilings at 180 minutes (the domain's own duration bound)", () => {
    expect(snapDurationSeconds(999_999)).toBe(180 * 60);
  });
});

describe("clampMeters", () => {
  it("clamps to the domain's 100..42195 range", () => {
    expect(clampMeters(50)).toBe(100);
    expect(clampMeters(50_000)).toBe(42_195);
    expect(clampMeters(2500)).toBe(2500);
  });
});

describe("clampSpm", () => {
  it("clamps to the confirm screen's 18..32 range", () => {
    expect(clampSpm(10)).toBe(18);
    expect(clampSpm(40)).toBe(32);
    expect(clampSpm(24)).toBe(24);
  });
});

describe("clampReps", () => {
  it("clamps to the domain's 1..12 range", () => {
    expect(clampReps(0)).toBe(1);
    expect(clampReps(20)).toBe(12);
    expect(clampReps(5)).toBe(5);
  });
});
