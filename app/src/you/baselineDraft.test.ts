import { describe, it, expect } from "vitest";
import {
  MAX_SPLIT,
  MIN_SPLIT,
  commit,
  discard,
  initDraft,
  isDirty,
  nudge,
} from "./baselineDraft";

describe("baseline drafts", () => {
  it("starts clean with draft equal to committed", () => {
    const s = initDraft(112, 122);
    expect(isDirty(s)).toBe(false);
    expect(s.draft).toStrictEqual({ k2: 112, k6: 122 });
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
