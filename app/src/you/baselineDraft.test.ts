import { describe, it, expect } from "vitest";
import {
  MAX_SPLIT,
  MIN_SPLIT,
  commit,
  discard,
  initDraft,
  isDirty,
  nudge,
  setDraft,
} from "./baselineDraft";

describe("baseline drafts", () => {
  it("starts clean with draft equal to committed", () => {
    const s = initDraft(112, 122);
    expect(isDirty(s)).toBe(false);
    expect(s.draft).toStrictEqual({ k2: 112, k6: 122 });
  });

  // Task review round (PR #66, Finding 1, BLOCKER): per-field `touched`
  // tracking — whether the ROWER acted on a side this session (stepper,
  // typed entry, or the fill-from-offer action), independent of whether the
  // resulting number happens to differ from the seed/committed value. This
  // is what lets Apply distinguish "the rower entered this" from "this is
  // still just the fabricated seed" (BaselineEditor.tsx's own Apply logic).
  it("starts with neither side touched", () => {
    expect(initDraft(112, 122).touched).toStrictEqual({
      k2: false,
      k6: false,
    });
  });

  it("nudging a side marks ONLY that side touched", () => {
    const s = nudge(initDraft(112, 122), "k2", -1);
    expect(s.touched).toStrictEqual({ k2: true, k6: false });
  });

  it("nudging the other side marks that one touched instead", () => {
    const s = nudge(initDraft(112, 122), "k6", 1);
    expect(s.touched).toStrictEqual({ k2: false, k6: true });
  });

  it("discard clears touched on both sides — declining undoes everything staged, including the touch itself", () => {
    const s = discard(nudge(initDraft(112, 122), "k2", -1));
    expect(s.touched).toStrictEqual({ k2: false, k6: false });
  });

  it("commit clears touched on both sides — nothing stays pending after a successful Apply", () => {
    const s = commit(nudge(initDraft(112, 122), "k2", -1));
    expect(s.touched).toStrictEqual({ k2: false, k6: false });
  });

  // Found by BaselineEditor.test.tsx's own Finding-3 pin (task review
  // round): `isDirty` used to compare VALUES only (draft !== committed),
  // so a side that's touched but happens to land back on the exact
  // committed/seed value read as clean — no confirm block, no Apply
  // button, the rower's own real edit silently unreachable. `touched` is
  // ALWAYS true whenever draft has ever diverged (every mutator sets both
  // together) and false only when it never has, so `isDirty` is exactly
  // "is anything touched," not a value comparison at all.
  it("is dirty when a field is touched even if its value happens to equal committed", () => {
    // setDraft to the SAME value committed already holds: no value change,
    // but it's still an explicit act.
    const s = setDraft(initDraft(112, 122), "k2", 112);
    expect(s.draft.k2).toBe(s.committed.k2);
    expect(isDirty(s)).toBe(true);
  });

  it("treats − as faster in 0.5s steps", () => {
    const s = nudge(initDraft(112, 122), "k2", -1);
    expect(s.draft.k2).toBe(111.5);
    expect(s.committed.k2).toBe(112);
    expect(isDirty(s)).toBe(true);
  });

  it("treats + as slower in 0.5s steps", () => {
    expect(nudge(initDraft(112, 122), "k6", 1).draft.k6).toBe(122.5);
  });

  it("changes only the requested baseline", () => {
    const s = nudge(initDraft(112, 122), "k2", 1);
    expect(s.draft.k6).toBe(122);
  });

  it("clamps at the API's bounds instead of drifting out of range", () => {
    expect(nudge(initDraft(MIN_SPLIT, 122), "k2", -1).draft.k2).toBe(MIN_SPLIT);
    expect(nudge(initDraft(112, MAX_SPLIT), "k6", 1).draft.k6).toBe(MAX_SPLIT);
  });

  it("discards back to the committed values", () => {
    const s = discard(nudge(nudge(initDraft(112, 122), "k2", -1), "k6", 1));
    expect(s.draft).toStrictEqual({ k2: 112, k6: 122 });
    expect(isDirty(s)).toBe(false);
  });

  it("commits the draft so nothing stays pending", () => {
    const s = commit(nudge(initDraft(112, 122), "k2", -1));
    expect(s.committed.k2).toBe(111.5);
    expect(isDirty(s)).toBe(false);
  });
});

// The honest-empty round (2026-08-24): an UNSET baseline is representable
// as such. Before this, `initDraft` was handed a fabricated seed for a
// server-null side, so a side that had never been rowed was structurally
// indistinguishable from one that had — the defect James reported.
describe("an unset side is null, not a fabricated seed", () => {
  it("keeps a server-null side null instead of standing a number in for it", () => {
    const s = initDraft(null, 122);
    expect(s.draft).toStrictEqual({ k2: null, k6: 122 });
    expect(s.committed).toStrictEqual({ k2: null, k6: 122 });
    expect(isDirty(s)).toBe(false);
  });

  // THE INVARIANT the Apply paths lean on: `touched` implies a real
  // number. Every mutator that sets `touched` also writes a number, and
  // this is the one call that could break it — a stepper aimed at an
  // empty field. The control materialises the seed via `setDraft` in that
  // case (BaselineField.tsx); `nudge` itself has no seed to offer, so it
  // must refuse rather than invent 0.5s or NaN out of nothing.
  it("refuses to nudge an unset side: no value appears, and it stays untouched", () => {
    const s = nudge(initDraft(null, 122), "k2", 1);
    expect(s.draft.k2).toBeNull();
    expect(s.touched.k2).toBe(false);
    expect(isDirty(s)).toBe(false);
  });

  it("refuses on the other side too — the guard is per field, not shared", () => {
    const s = nudge(initDraft(112, null), "k6", -1);
    expect(s.draft.k6).toBeNull();
    expect(s.touched.k6).toBe(false);
  });

  it("materialising an unset side through setDraft fills it and marks it touched", () => {
    const s = setDraft(initDraft(null, 122), "k2", 145);
    expect(s.draft.k2).toBe(145);
    expect(s.touched.k2).toBe(true);
    // The committed side stays null: nothing has been saved yet, so the
    // confirm card must still read this as "was unset, becomes 2:25".
    expect(s.committed.k2).toBeNull();
  });

  it("discard puts an unset side back to unset, never to the number the rower abandoned", () => {
    const s = discard(setDraft(initDraft(null, 122), "k2", 145));
    expect(s.draft.k2).toBeNull();
    expect(isDirty(s)).toBe(false);
  });

  it("commit folds a materialised value into committed, so the side is no longer unset", () => {
    const s = commit(setDraft(initDraft(null, 122), "k2", 145));
    expect(s.committed.k2).toBe(145);
    expect(s.draft.k2).toBe(145);
  });
});

describe("setDraft (ui-notes round, item 2: the derivation offer fills a draft field directly)", () => {
  it("sets only the requested side, leaving the other and committed untouched", () => {
    const s = setDraft(initDraft(112, 122), "k2", 115);
    expect(s.draft).toStrictEqual({ k2: 115, k6: 122 });
    expect(s.committed).toStrictEqual({ k2: 112, k6: 122 });
    expect(isDirty(s)).toBe(true);
  });

  it("sets the other side too", () => {
    expect(setDraft(initDraft(112, 122), "k6", 119).draft.k6).toBe(119);
  });

  it("clamps a value below MIN_SPLIT instead of drifting out of range", () => {
    expect(setDraft(initDraft(112, 122), "k2", MIN_SPLIT - 5).draft.k2).toBe(
      MIN_SPLIT,
    );
  });

  it("clamps a value above MAX_SPLIT instead of drifting out of range", () => {
    expect(setDraft(initDraft(112, 122), "k6", MAX_SPLIT + 5).draft.k6).toBe(
      MAX_SPLIT,
    );
  });

  it("is an ordinary draft edit: a stepper still nudges the filled value afterward", () => {
    const filled = setDraft(initDraft(112, 122), "k2", 115);
    const nudged = nudge(filled, "k2", -1);
    expect(nudged.draft.k2).toBe(114.5);
  });

  // Task review round, Finding 3 (dissolved by Finding 1's fix): a filled
  // value that happens to equal the seed must still count as touched, or
  // Apply would silently drop it again as "still just the seed."
  it("marks the filled side touched even when the derived value equals the seed exactly", () => {
    // deriveK6FromK2 semantics: k6=119 -> derived k2 = 112 = SEED_K2.
    const s = setDraft(initDraft(112, 122), "k2", 112);
    expect(s.draft.k2).toBe(112);
    expect(s.touched.k2).toBe(true);
  });
});
