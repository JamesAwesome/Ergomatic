import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { STARTER_WORKOUTS } from "../../server/seed/starter";
import type { Step, WorkoutType } from "../../domain/types.js";
import type { api } from "../api";
import type { LibraryWorkout } from "../api/useWorkouts";
import {
  buildDraft,
  clearDraft,
  loadDraft,
  saveDraft,
  startDraft,
  withNudge,
  type SessionDraft,
} from "./draft";
import { buildRun } from "./engine";
import { loadRun, saveRun, type SessionRun } from "./run";

const BASELINES = { k2Seconds: 100, k6Seconds: 120 };
const TOL = 1;
const FIXED_NOW = new Date("2026-08-01T12:00:00.000Z");

function starter(title: string) {
  const w = STARTER_WORKOUTS.find((s) => s.title === title);
  if (!w) throw new Error(`missing starter fixture: ${title}`);
  return w;
}

/** A real, mixed-kind fixture — Doldrums' own time/split work step (6k+16,
 *  restMinutes 3 — its auto-inserted rest phase) plus Jet Stream's own
 *  distance/split work step (6k+8), assembled from two real starters'
 *  own step OBJECTS rather than a hand-built minimum (the same "no single
 *  starter has this shape" idiom Task 1's own F1b test used). The reps
 *  marker Doldrums is normally authored with is deliberately dropped —
 *  SessionComplete.test.tsx's own `completeDraftAndRun` does the same for
 *  the identical reason: a live reps marker would repeat the APPENDED
 *  distance step too, which isn't the shape this fixture wants. Phases:
 *  0 warm-up, 1 work (time, 6k+16), 2 rest (3'), 3 work (distance, 6k+8) —
 *  the LAST phase gets a real recorded (stopwatch) actual; the time phase
 *  never does (the engine only ever records one for a distance phase), so
 *  this fixture covers BOTH of `buildLogSteps`' actual rules in one run. */
function buildSessionFixture(): {
  draft: SessionDraft;
  run: SessionRun;
  workout: LibraryWorkout;
} {
  const doldrums = starter("Doldrums");
  const timeWork = doldrums.steps.find((s) => s.k === "w") as Extract<
    Step,
    { k: "w" }
  >;
  const jetStream = starter("Jet Stream");
  const distanceWork = jetStream.steps.find((s) => s.k === "w") as Extract<
    Step,
    { k: "w" }
  >;

  const draft = buildDraft({
    id: "id-doldrums-fixture",
    title: doldrums.title,
    type: doldrums.type as WorkoutType,
    steps: [{ k: "wu", minutes: 4 }, timeWork, distanceWork],
  });
  const started = startDraft(draft);
  saveDraft(started);
  const built = buildRun(started, BASELINES, TOL, FIXED_NOW);
  const distanceIndex = built.phases.length - 1;
  const completedAt = new Date(
    FIXED_NOW.getTime() + 30 * 60 * 1000,
  ).toISOString();
  const run: SessionRun = {
    ...built,
    index: built.phases.length,
    completedAt,
    actuals: {
      // 2500s / 10000m * 500 = 125.0s exactly — deliberately NOT equal to
      // the 128s target, so a stopwatch actual reads as genuinely
      // different information, not a repeat of the target line.
      [distanceIndex]: {
        elapsedSeconds: 2500,
        splitSeconds: 125,
        actualSource: "stopwatch",
      },
    },
  };
  saveRun(run);
  const workout: LibraryWorkout = {
    id: "id-doldrums-fixture",
    title: doldrums.title,
    type: doldrums.type as WorkoutType,
    difficulty: doldrums.difficulty,
    pain: doldrums.pain,
    steps: started.steps,
    isGlobal: true,
    lastDoneDaysAgo: 2,
  };
  return { draft: started, run, workout };
}

function mockWorkouts(workouts: LibraryWorkout[]) {
  vi.doMock("../api/useWorkouts", () => ({
    useWorkouts: () => ({ state: "ready", workouts }),
  }));
}

// Same `vi.doMock` + returned-spy idiom as WorkoutDetail.test.tsx's own
// `mockApi` — a real `Response`, not a bare object, so `.ok`/`.status`/
// `.json()` all behave exactly like the real fetch this replaces.
function mockApi(
  handler: (path: string, init?: RequestInit) => Response | Promise<Response>,
) {
  const fn = vi.fn<typeof api>(async (path, init) => handler(path, init));
  vi.doMock("../api", () => ({ api: fn }));
  return fn;
}

function parsedBodies(
  fn: ReturnType<typeof mockApi>,
): Record<string, unknown>[] {
  return fn.mock.calls.map(([, init]) =>
    JSON.parse((init as RequestInit).body as string),
  );
}

async function renderLog(initialPath = "/session/log") {
  const { default: LogSession } = await import("./LogSession");
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="/session/log" element={<LogSession />} />
        <Route path="/today" element={<p>TODAY SCREEN</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.resetModules();
  localStorage.clear();
});

describe("LogSession: deep-link/reload guards", () => {
  it("redirects to /today when there is no run record at all", async () => {
    mockWorkouts([]);
    await renderLog();
    expect(await screen.findByText("TODAY SCREEN")).toBeInTheDocument();
  });

  it("redirects to /today when the run exists but hasn't finished yet", async () => {
    const { run } = buildSessionFixture();
    saveRun({ ...run, index: run.phases.length - 1 });
    mockWorkouts([]);
    await renderLog();
    expect(await screen.findByText("TODAY SCREEN")).toBeInTheDocument();
  });
});

describe("LogSession: prefill from a real completed run", () => {
  it("shows the title, type badge, date+duration, the PACES LOCKED panel, the per-step list, and EXPECTED N/5", async () => {
    const { workout } = buildSessionFixture();
    mockWorkouts([workout]);
    await renderLog();

    expect(
      await screen.findByRole("heading", { name: "Log Doldrums" }),
    ).toBeInTheDocument();
    expect(document.querySelector(".type-badge")?.textContent).toBe("O2");
    // completedAt = FIXED_NOW + 30 minutes -> "AUG 1"; totalMinutes = 30.
    expect(screen.getByText("AUG 1 · 30 MIN")).toBeInTheDocument();

    // PACES LOCKED (F1: only the bases actually referenced render — no
    // step in this fixture references "2k" at all, both work steps are
    // 6k-based, so the panel shows 6K alone, never "2K —"). The 6k value
    // is recovered EXACTLY from the time phase's own frozen targetSplit
    // (136 - 16 - 0 = 120, BASELINES.k6Seconds itself) -> fmtSplit(120) =
    // "2:00.0".
    expect(document.querySelector(".log-paces-value")?.textContent).toBe(
      "6K 2:00.0",
    );

    const rows = Array.from(document.querySelectorAll(".log-step-row"));
    expect(rows).toHaveLength(2);
    // Row 1: the time/split step — label composes from the DRAFT's real ref
    // (matchedDraft present), target is the frozen split; a completed time
    // phase's actual is "assumed" (identical to target), which this screen
    // deliberately does NOT print a second time.
    expect(rows[0]).toHaveTextContent("20:00 @ 6k +16");
    expect(rows[0]).toHaveTextContent("2:16.0");
    expect(rows[0]).not.toHaveTextContent("ACTUAL");
    // Row 2: the distance/split step — a REAL stopwatch actual (125.0s)
    // that differs from the 128.0s target earns its own ACTUAL line.
    expect(rows[1]).toHaveTextContent("10000 m @ 6k +8");
    expect(rows[1]).toHaveTextContent("2:08.0");
    expect(rows[1]).toHaveTextContent("ACTUAL 2:05.0");

    // EXPECTED N/5 — Doldrums' own `pain` (1), sourced via useWorkouts by
    // run.workoutId, not the rower's own (still-unset) selection.
    expect(screen.getByText("EXPECTED 1/5")).toBeInTheDocument();

    // Nothing pre-selected; Save is disabled until both are chosen.
    expect(screen.getByRole("button", { name: "HELD" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(screen.getByRole("button", { name: "Save session" })).toBeDisabled();
  });

  it("Save enables once both Held and Pain are chosen", async () => {
    const { workout } = buildSessionFixture();
    mockWorkouts([workout]);
    await renderLog();
    await screen.findByText("AUG 1 · 30 MIN");

    const save = screen.getByRole("button", { name: "Save session" });
    await userEvent.click(screen.getByRole("button", { name: "UNDER" }));
    expect(save).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "Pain 3" }));
    expect(save).not.toBeDisabled();
    expect(screen.getByRole("button", { name: "UNDER" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "Pain 3" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("shows both PACES LOCKED bases when both are derivable (a 2k off=0 and a 6k off=0 step)", async () => {
    const draft = buildDraft({
      id: "id-both-bases",
      title: "Both Bases",
      type: "AT",
      steps: [
        { k: "wu", minutes: 4 },
        {
          k: "w",
          duration: { kind: "time", minutes: 3 },
          ref: { base: "2k", off: 0 },
        },
        {
          k: "w",
          duration: { kind: "time", minutes: 3 },
          ref: { base: "6k", off: 0 },
        },
      ],
    });
    const started = startDraft(draft);
    saveDraft(started);
    const built = buildRun(started, BASELINES, TOL, FIXED_NOW);
    const run: SessionRun = {
      ...built,
      index: built.phases.length,
      completedAt: new Date(FIXED_NOW.getTime() + 6 * 60 * 1000).toISOString(),
      actuals: {},
    };
    saveRun(run);
    mockWorkouts([]);
    await renderLog();

    await screen.findByRole("heading", { name: "Log Both Bases" });
    // BASELINES.k2Seconds (100) -> "1:40.0"; BASELINES.k6Seconds (120) ->
    // "2:00.0" — both recovered exactly, off=0 on each.
    expect(document.querySelector(".log-paces-value")?.textContent).toBe(
      "2K 1:40.0 · 6K 2:00.0",
    );
  });

  it("recovers the exact baseline even when the step carries a nudge — the nudge is folded into the per-step target, not into the recovered baseline", async () => {
    const base = buildDraft({
      id: "id-nudged",
      title: "Nudged",
      type: "AT",
      steps: [
        { k: "wu", minutes: 4 },
        {
          k: "w",
          duration: { kind: "time", minutes: 3 },
          ref: { base: "6k", off: 0 },
        },
      ],
    });
    // +5s nudge on the work step (index 1) — the same confirm-time
    // adjustment ConfirmTargets.tsx's own nudge buttons apply.
    const nudged = withNudge(base, 1, 5);
    const started = startDraft(nudged);
    saveDraft(started);
    const built = buildRun(started, BASELINES, TOL, FIXED_NOW);
    const run: SessionRun = {
      ...built,
      index: built.phases.length,
      completedAt: new Date(FIXED_NOW.getTime() + 3 * 60 * 1000).toISOString(),
      actuals: {},
    };
    saveRun(run);
    mockWorkouts([]);
    await renderLog();

    await screen.findByRole("heading", { name: "Log Nudged" });
    // targetSplit = 120 (baseline) + 0 (off) + 5 (nudge) = 125 -> the
    // per-step row shows the NUDGED number.
    expect(document.querySelector(".log-step-target")?.textContent).toBe(
      "2:05.0",
    );
    // F2: the label folds the nudge into its own offset ("6k +5", not the
    // raw authored "6k") — 120 (baseline) + 5 (folded offset) = 125,
    // reconciling with the target split above.
    expect(document.querySelector(".log-step-label")?.textContent).toBe(
      "3:00 @ 6k +5",
    );
    // PACES LOCKED recovers the TRUE baseline (120), not the nudged split
    // (F1: only 6K renders at all — this fixture's only step is 6k-based) —
    // proves the reconstruction subtracts BOTH the off and the nudge, not
    // just one of them.
    expect(document.querySelector(".log-paces-value")?.textContent).toBe(
      "6K 2:00.0",
    );
  });

  it("renders '—' for an effort step's target split (5G rule: an effort phase's frozen number is an estimate, never a real target)", async () => {
    const microburst = starter("Microburst");
    const effortWork = microburst.steps.find((s) => s.k === "w") as Extract<
      Step,
      { k: "w" }
    >;
    const draft = buildDraft({
      id: "id-microburst-fixture",
      title: microburst.title,
      type: microburst.type as WorkoutType,
      steps: [{ k: "wu", minutes: 4 }, effortWork],
    });
    const started = startDraft(draft);
    saveDraft(started);
    const built = buildRun(started, BASELINES, TOL, FIXED_NOW);
    const run: SessionRun = {
      ...built,
      index: built.phases.length,
      completedAt: new Date(FIXED_NOW.getTime() + 5 * 60 * 1000).toISOString(),
      actuals: {},
    };
    saveRun(run);
    mockWorkouts([]);
    await renderLog();

    await screen.findByRole("heading", { name: "Log Microburst" });
    const rows = Array.from(document.querySelectorAll(".log-step-row"));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toHaveTextContent("0:30 @ MAX");
    expect(document.querySelector(".log-step-target")?.textContent).toBe("—");
    expect(rows[0]).not.toHaveTextContent("ACTUAL");
    // F1: an all-effort workout references neither base at all — the whole
    // PACES LOCKED panel is omitted, not a doubly-dashed one.
    expect(document.querySelector(".log-paces-panel")).not.toBeInTheDocument();
  });

  it("a null run.workoutId (a malformed/legacy record) skips the library lookup and falls back honestly, with no EXPECTED line", async () => {
    const { run } = buildSessionFixture();
    saveRun({ ...run, workoutId: null });
    clearDraft();
    mockWorkouts([]);
    await renderLog();

    await screen.findByRole("heading", { name: "Log Doldrums" });
    expect(document.querySelector(".type-badge")?.textContent).toBe("O2");
    expect(screen.queryByText(/EXPECTED/)).not.toBeInTheDocument();
  });

  it("treats a still-loading workouts hook as 'no fallback available yet' rather than blocking the screen", async () => {
    buildSessionFixture();
    clearDraft();
    vi.doMock("../api/useWorkouts", () => ({
      useWorkouts: () => ({ state: "loading" }),
    }));
    await renderLog();

    await screen.findByRole("heading", { name: "Log Doldrums" });
    expect(document.querySelector(".type-badge")?.textContent).toBe("O2");
  });
});

// The ledger residual routed to this task (Task 1's progress.md): a
// same-shaped but FOREIGN draft (a real SessionDraft, just for a different
// workoutId) must not be trusted for step labels, the PACES LOCKED
// reconstruction, or the workoutType fallback — all three read `run` and
// `draft`'s matching `workoutId` as one gate (`matchedDraft`).
describe("LogSession: the ledger residual (workoutId mismatch)", () => {
  it("ignores a foreign draft — fallback labels render and the PACES LOCKED panel is omitted entirely (F1: no bare dash)", async () => {
    const { workout } = buildSessionFixture();
    // A real, validly-shaped draft — just for a DIFFERENT workout than the
    // one this run was built from.
    const foreign = buildDraft({
      id: "a-completely-different-workout",
      title: "Foreign Workout",
      type: "AN",
      steps: [
        {
          k: "w",
          duration: { kind: "time", minutes: 5 },
          ref: { effort: "max" },
        },
      ],
    });
    saveDraft(startDraft(foreign));
    mockWorkouts([workout]);
    await renderLog();
    await screen.findByRole("heading", { name: "Log Doldrums" });

    // Neither base is recoverable without a matching draft — F1: the whole
    // panel is omitted, not a dashed "2K — · 6K —".
    expect(document.querySelector(".log-paces-panel")).not.toBeInTheDocument();

    const rows = Array.from(document.querySelectorAll(".log-step-row"));
    expect(rows).toHaveLength(2);
    // Fallback label: the phase's own frozen (already-resolved) label, not
    // the draft's chip idiom — proves the mismatch guard actually changed
    // behavior rather than passing vacuously.
    expect(rows[0]).toHaveTextContent("20:00 @ 2:15.0–2:17.0");
    expect(rows[1]).toHaveTextContent("10000 m @ 2:07.0–2:09.0");
  });
});

describe("LogSession: workoutType sourcing", () => {
  it("sources workoutType from the library when there is no usable draft, not the last-resort default", async () => {
    const { workout } = buildSessionFixture();
    clearDraft(); // simulate a missing draft — the run alone survives.
    mockWorkouts([workout]);
    await renderLog();
    await screen.findByRole("heading", { name: "Log Doldrums" });
    expect(document.querySelector(".type-badge")?.textContent).toBe(
      workout.type,
    );
  });

  it("falls back to O2 only when both the draft AND the library lookup fail", async () => {
    buildSessionFixture();
    clearDraft();
    mockWorkouts([]); // the workout is gone from the library too.
    await renderLog();
    await screen.findByRole("heading", { name: "Log Doldrums" });
    expect(document.querySelector(".type-badge")?.textContent).toBe("O2");
  });

  it("prefers matchedDraft.type over the library lookup when both exist but disagree", async () => {
    const { workout } = buildSessionFixture(); // draft.type is "O2" (Doldrums)
    mockWorkouts([{ ...workout, type: "AN" }]); // the library disagrees
    await renderLog();
    await screen.findByRole("heading", { name: "Log Doldrums" });
    expect(document.querySelector(".type-badge")?.textContent).toBe("O2");
  });
});

async function chooseHeldAndPain() {
  await userEvent.click(screen.getByRole("button", { name: "HELD" }));
  await userEvent.click(screen.getByRole("button", { name: "Pain 2" }));
}

describe("LogSession: save", () => {
  it("POSTs the built steps plus held/pain/notes, clears the draft and run, and navigates to /today", async () => {
    const { run, workout } = buildSessionFixture();
    mockWorkouts([workout]);
    const apiFn = mockApi(() =>
      Promise.resolve(
        new Response(JSON.stringify({ id: "log-1" }), { status: 201 }),
      ),
    );
    await renderLog();
    await screen.findByText("AUG 1 · 30 MIN");

    await chooseHeldAndPain();
    await userEvent.type(screen.getByLabelText("NOTES"), "Felt strong.");
    await userEvent.click(screen.getByRole("button", { name: "Save session" }));

    expect(await screen.findByText("TODAY SCREEN")).toBeInTheDocument();
    expect(apiFn).toHaveBeenCalledTimes(1);
    const [path, init] = apiFn.mock.calls[0]!;
    expect(path).toBe("/api/logs");
    const body = JSON.parse((init as RequestInit).body as string) as Record<
      string,
      unknown
    >;
    expect(body).toMatchObject({
      workoutId: run.workoutId,
      workoutTitle: "Doldrums",
      workoutType: "O2",
      held: "held",
      pain: 2,
      notes: "Felt strong.",
    });
    expect(Array.isArray(body.steps)).toBe(true);
    expect((body.steps as unknown[]).length).toBe(2);

    expect(loadDraft()).toBeNull();
    expect(loadRun()).toBeNull();
  });

  it("sends notes:null when the NOTES field is left blank", async () => {
    buildSessionFixture();
    mockWorkouts([]);
    const apiFn = mockApi(() =>
      Promise.resolve(
        new Response(JSON.stringify({ id: "log-1" }), { status: 201 }),
      ),
    );
    await renderLog();
    await screen.findByText("AUG 1 · 30 MIN");
    await chooseHeldAndPain();
    await userEvent.click(screen.getByRole("button", { name: "Save session" }));
    await screen.findByText("TODAY SCREEN");

    expect(parsedBodies(apiFn)[0]!.notes).toBeNull();
  });

  it("keeps the draft and run intact and shows an inline error on a genuine failure — retry stays possible", async () => {
    buildSessionFixture();
    mockWorkouts([]);
    const apiFn = mockApi(() =>
      Promise.resolve(
        new Response(JSON.stringify({ error: "boom" }), { status: 500 }),
      ),
    );
    await renderLog();
    await screen.findByText("AUG 1 · 30 MIN");
    await chooseHeldAndPain();
    await userEvent.click(screen.getByRole("button", { name: "Save session" }));

    expect(
      await screen.findByText("Couldn't save this session. Try again."),
    ).toBeInTheDocument();
    expect(apiFn).toHaveBeenCalledTimes(1);
    expect(loadDraft()).not.toBeNull();
    expect(loadRun()).not.toBeNull();
    expect(
      screen.getByRole("button", { name: "Save session" }),
    ).not.toBeDisabled();
  });

  it("treats an unparseable 400 body as 'no field named' — no retry, a genuine failure surfaces", async () => {
    buildSessionFixture();
    mockWorkouts([]);
    // A 400 whose body isn't valid JSON at all — `res.json()` itself
    // rejects, exercising the inner catch that falls back to `field:
    // undefined` (never "workoutId", so no retry fires).
    const apiFn = mockApi(() =>
      Promise.resolve(new Response("not json", { status: 400 })),
    );
    await renderLog();
    await screen.findByText("AUG 1 · 30 MIN");
    await chooseHeldAndPain();
    await userEvent.click(screen.getByRole("button", { name: "Save session" }));

    expect(
      await screen.findByText("Couldn't save this session. Try again."),
    ).toBeInTheDocument();
    expect(apiFn).toHaveBeenCalledTimes(1);
    expect(loadDraft()).not.toBeNull();
    expect(loadRun()).not.toBeNull();
  });

  it("catches a thrown network error and surfaces the same inline failure, records intact", async () => {
    buildSessionFixture();
    mockWorkouts([]);
    const apiFn = mockApi(() => {
      throw new Error("network down");
    });
    await renderLog();
    await screen.findByText("AUG 1 · 30 MIN");
    await chooseHeldAndPain();
    await userEvent.click(screen.getByRole("button", { name: "Save session" }));

    expect(
      await screen.findByText("Couldn't save this session. Try again."),
    ).toBeInTheDocument();
    expect(apiFn).toHaveBeenCalledTimes(1);
    expect(loadDraft()).not.toBeNull();
    expect(loadRun()).not.toBeNull();
  });

  it("retries once with workoutId:null when the 400 names workoutId specifically, and saves on the retry", async () => {
    const { run, workout } = buildSessionFixture();
    mockWorkouts([workout]);
    let calls = 0;
    const apiFn = mockApi(() => {
      calls++;
      if (calls === 1) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              error: "workoutId does not exist",
              field: "workoutId",
            }),
            { status: 400 },
          ),
        );
      }
      return Promise.resolve(
        new Response(JSON.stringify({ id: "log-2" }), { status: 201 }),
      );
    });
    await renderLog();
    await screen.findByText("AUG 1 · 30 MIN");
    await chooseHeldAndPain();
    await userEvent.click(screen.getByRole("button", { name: "Save session" }));

    expect(await screen.findByText("TODAY SCREEN")).toBeInTheDocument();
    expect(apiFn).toHaveBeenCalledTimes(2);
    const bodies = parsedBodies(apiFn);
    expect(bodies[0]!.workoutId).toBe(run.workoutId);
    expect(bodies[1]!.workoutId).toBeNull();
    expect(loadDraft()).toBeNull();
    expect(loadRun()).toBeNull();
  });

  it("does not retry when the 400 names a different field — surfaces the failure instead of silently stripping workoutId", async () => {
    buildSessionFixture();
    mockWorkouts([]);
    const apiFn = mockApi(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            error: "pain must be an integer 1..5",
            field: "pain",
          }),
          { status: 400 },
        ),
      ),
    );
    await renderLog();
    await screen.findByText("AUG 1 · 30 MIN");
    await chooseHeldAndPain();
    await userEvent.click(screen.getByRole("button", { name: "Save session" }));

    expect(
      await screen.findByText("Couldn't save this session. Try again."),
    ).toBeInTheDocument();
    expect(apiFn).toHaveBeenCalledTimes(1);
    expect(loadDraft()).not.toBeNull();
    expect(loadRun()).not.toBeNull();
  });
});

describe("LogSession: staged discard", () => {
  it("stages a confirm on the first press; Cancel restores the plain button without clearing anything", async () => {
    buildSessionFixture();
    mockWorkouts([]);
    await renderLog();
    await screen.findByText("AUG 1 · 30 MIN");

    await userEvent.click(
      screen.getByRole("button", { name: "Discard without logging" }),
    );
    expect(
      screen.getByRole("button", { name: "Discard session" }),
    ).toBeInTheDocument();
    expect(loadRun()).not.toBeNull();

    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(
      screen.queryByRole("button", { name: "Discard session" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Discard without logging" }),
    ).toBeInTheDocument();
  });

  it("clears both records and navigates to /today only once the staged press is confirmed", async () => {
    buildSessionFixture();
    mockWorkouts([]);
    await renderLog();
    await screen.findByText("AUG 1 · 30 MIN");

    await userEvent.click(
      screen.getByRole("button", { name: "Discard without logging" }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Discard session" }),
    );

    expect(await screen.findByText("TODAY SCREEN")).toBeInTheDocument();
    expect(loadDraft()).toBeNull();
    expect(loadRun()).toBeNull();
  });
});
