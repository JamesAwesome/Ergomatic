import { describe, it, expect, beforeEach, vi } from "vitest";
import { LIBRARY_WORKOUTS } from "../../server/seed/library/index";
import type { Baselines, WorkoutType } from "../../domain/types.js";
import { buildDraft } from "./draft";
import { buildRun, pause, advance, nextDistance } from "./engine";
import { saveRun, loadRun, clearRun, RUN_KEY, type SessionRun } from "./run";
import { saveDraft, loadDraft, DRAFT_KEY } from "./draft";

// Realistic fixture, per repo convention: Filling Low (AT) — wu 8' +
// 3x2000m @ 6k+4 with 3' rest — the same reps-expanded distance workout
// engine.test.ts uses, so a run built from it exercises actuals, set
// numbering, and originalIndex in one realistic shape.
function fillingLowDraft(id: string) {
  const w = LIBRARY_WORKOUTS.find((s) => s.title === "Filling Low");
  if (!w) throw new Error("missing library fixture: Filling Low");
  return buildDraft({
    id,
    title: w.title,
    type: w.type as WorkoutType,
    steps: w.steps,
  });
}

const baselines: Baselines = { k2Seconds: 100, k6Seconds: 120 };
const t0 = new Date("2026-08-01T12:00:00.000Z");

function addSeconds(d: Date, s: number): Date {
  return new Date(d.getTime() + s * 1000);
}

function freshRun(): SessionRun {
  return buildRun(fillingLowDraft(`fl-${Math.random()}`), baselines, 3, t0);
}

// A phase with no `set` (no reps marker active, e.g. warmup) still carries
// the KEY with value `undefined` (domain/expand.ts's `phases()` always
// includes it in the object literal) — JSON.stringify drops undefined-valued
// keys entirely, so the realistic post-storage shape has no `set` key there
// at all. Round-trip expectations compare against THIS, not the raw
// pre-save value, so the assertion reflects what storage actually preserves.
function viaJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

describe("saveRun / loadRun / clearRun", () => {
  beforeEach(() => localStorage.clear());

  it("round-trips a fresh run byte-identical", () => {
    const run = freshRun();
    expect(saveRun(run)).toBe(true);
    expect(loadRun()).toStrictEqual(viaJson(run));
  });

  it("round-trips a paused, mid-run record with a distance actual recorded", () => {
    const run = freshRun();
    const withActual = nextDistance({ ...run, index: 1 }, addSeconds(t0, 452));
    const paused = pause(withActual, addSeconds(t0, 460));
    expect(saveRun(paused)).toBe(true);
    const loaded = loadRun();
    expect(loaded).toStrictEqual(viaJson(paused));
    expect(loaded!.pausedAt).toBe(addSeconds(t0, 460).toISOString());
    expect(loaded!.actuals[1]).toStrictEqual({
      elapsedSeconds: 452,
      splitSeconds: 113,
      actualSource: "stopwatch",
    });
  });

  it("round-trips a completed run", () => {
    // Filling Low: wu + 3x(work,rest) = 1 + 6 = 7 phases, indices 0..6.
    const run = { ...freshRun(), index: 6 }; // the last phase
    const completed = advance(run, addSeconds(t0, 1000));
    expect(saveRun(completed)).toBe(true);
    const loaded = loadRun();
    expect(loaded).toStrictEqual(viaJson(completed));
    expect(loaded!.completedAt).toBe(addSeconds(t0, 1000).toISOString());
  });

  it("returns null when nothing is stored", () => {
    expect(loadRun()).toBeNull();
  });

  it("returns null and clears the key for garbage JSON", () => {
    localStorage.setItem(RUN_KEY, "{not json");
    expect(loadRun()).toBeNull();
    expect(localStorage.getItem(RUN_KEY)).toBeNull();
  });

  // Resilience 5: unknown `v` -> null + clear, the DRAFT (a separate key)
  // survives untouched.
  it("resilience 5: returns null and clears the key for an unknown version, leaving the DRAFT untouched", () => {
    const run = freshRun();
    const draft = fillingLowDraft("fl-draft-survives");
    saveDraft(draft);
    localStorage.setItem(RUN_KEY, JSON.stringify({ ...run, v: 2 }));

    expect(loadRun()).toBeNull();
    expect(localStorage.getItem(RUN_KEY)).toBeNull();
    expect(loadDraft()).toStrictEqual(draft);
  });

  it("returns null and clears the key for a bare {v:1} with none of the load-bearing fields", () => {
    localStorage.setItem(RUN_KEY, JSON.stringify({ v: 1 }));
    expect(loadRun()).toBeNull();
    expect(localStorage.getItem(RUN_KEY)).toBeNull();
  });

  it("returns null and clears the key for valid JSON that isn't a plain record at all (a bare number)", () => {
    localStorage.setItem(RUN_KEY, "42");
    expect(loadRun()).toBeNull();
    expect(localStorage.getItem(RUN_KEY)).toBeNull();
  });

  it("returns null and clears the key for valid JSON that's null", () => {
    localStorage.setItem(RUN_KEY, "null");
    expect(loadRun()).toBeNull();
    expect(localStorage.getItem(RUN_KEY)).toBeNull();
  });

  it("returns null and clears the key for valid JSON that's an array, not an object", () => {
    localStorage.setItem(RUN_KEY, "[]");
    expect(loadRun()).toBeNull();
    expect(localStorage.getItem(RUN_KEY)).toBeNull();
  });

  it("returns null for v:1 with phases as the wrong shape (an object, not an array)", () => {
    const run = freshRun();
    localStorage.setItem(RUN_KEY, JSON.stringify({ ...run, phases: {} }));
    expect(loadRun()).toBeNull();
    expect(localStorage.getItem(RUN_KEY)).toBeNull();
  });

  it("returns null for v:1 with index as the wrong shape (a string, not a number)", () => {
    const run = freshRun();
    localStorage.setItem(RUN_KEY, JSON.stringify({ ...run, index: "0" }));
    expect(loadRun()).toBeNull();
    expect(localStorage.getItem(RUN_KEY)).toBeNull();
  });

  it("returns null for v:1 with phaseStartedAt as the wrong shape (a number, not a string)", () => {
    const run = freshRun();
    localStorage.setItem(
      RUN_KEY,
      JSON.stringify({ ...run, phaseStartedAt: 12345 }),
    );
    expect(loadRun()).toBeNull();
    expect(localStorage.getItem(RUN_KEY)).toBeNull();
  });

  it("returns null for v:1 with pausedAt as the wrong shape (a number — neither null nor a string)", () => {
    const run = freshRun();
    localStorage.setItem(RUN_KEY, JSON.stringify({ ...run, pausedAt: 5 }));
    expect(loadRun()).toBeNull();
    expect(localStorage.getItem(RUN_KEY)).toBeNull();
  });

  it("returns null for v:1 with pausedTotalMs as the wrong shape (a string, not a number)", () => {
    const run = freshRun();
    localStorage.setItem(
      RUN_KEY,
      JSON.stringify({ ...run, pausedTotalMs: "0" }),
    );
    expect(loadRun()).toBeNull();
    expect(localStorage.getItem(RUN_KEY)).toBeNull();
  });

  it("returns null for v:1 with actuals as the wrong shape (an array, not a record)", () => {
    const run = freshRun();
    localStorage.setItem(RUN_KEY, JSON.stringify({ ...run, actuals: [] }));
    expect(loadRun()).toBeNull();
    expect(localStorage.getItem(RUN_KEY)).toBeNull();
  });

  it("returns null for v:1 with startedAt as the wrong shape (missing/non-string)", () => {
    const run = freshRun();
    localStorage.setItem(RUN_KEY, JSON.stringify({ ...run, startedAt: 1 }));
    expect(loadRun()).toBeNull();
    expect(localStorage.getItem(RUN_KEY)).toBeNull();
  });

  it("returns null for v:1 with completedAt as the wrong shape (a number — neither null nor a string)", () => {
    const run = freshRun();
    localStorage.setItem(RUN_KEY, JSON.stringify({ ...run, completedAt: 5 }));
    expect(loadRun()).toBeNull();
    expect(localStorage.getItem(RUN_KEY)).toBeNull();
  });

  // F3a (whole-branch review): title/workoutId are new required fields on
  // SessionRun, stamped by buildRun — validated here the same way every
  // other load-bearing field above already is.
  it("returns null for v:1 with title as the wrong shape (missing/non-string)", () => {
    const run = freshRun();
    localStorage.setItem(RUN_KEY, JSON.stringify({ ...run, title: 5 }));
    expect(loadRun()).toBeNull();
    expect(localStorage.getItem(RUN_KEY)).toBeNull();
  });

  it("returns null for v:1 with workoutId as the wrong shape (a number — neither null nor a string)", () => {
    const run = freshRun();
    localStorage.setItem(RUN_KEY, JSON.stringify({ ...run, workoutId: 5 }));
    expect(loadRun()).toBeNull();
    expect(localStorage.getItem(RUN_KEY)).toBeNull();
  });

  it("round-trips workoutId: null (a hand-built draft, not a library workout) same as a real id", () => {
    const run = { ...freshRun(), workoutId: null };
    expect(saveRun(run)).toBe(true);
    expect(loadRun()).toStrictEqual(viaJson(run));
  });

  it("clearRun removes the stored run", () => {
    saveRun(freshRun());
    clearRun();
    expect(loadRun()).toBeNull();
    expect(localStorage.getItem(RUN_KEY)).toBeNull();
  });

  it("returns false without throwing when localStorage.setItem fails (quota)", () => {
    const spy = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(() => {
        throw new DOMException("quota exceeded", "QuotaExceededError");
      });
    const run = freshRun();
    expect(() => saveRun(run)).not.toThrow();
    expect(saveRun(run)).toBe(false);
    spy.mockRestore();
  });

  it("exposes the storage key used", () => {
    expect(RUN_KEY).toBe("ergomatic.sessionRun");
  });
});

describe("RUN_KEY / DRAFT_KEY", () => {
  it("are distinct storage keys — the run and the draft never collide", () => {
    expect(RUN_KEY).not.toBe(DRAFT_KEY);
  });
});
