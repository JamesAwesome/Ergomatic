import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { listSessionLogs, upsertSessionLog } from "./sessionLogHistory";

const HISTORY_KEY = "ergomatic:session-log-history";

const t0 = new Date("2026-08-31T09:00:00.000Z");
const t1 = new Date("2026-08-31T09:10:00.000Z");
const t2 = new Date("2026-08-31T09:20:00.000Z");
const t3 = new Date("2026-08-31T09:30:00.000Z");

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("sessionLogHistory: rotation order", () => {
  it("a single upsert (new session) lands in slot 1", () => {
    upsertSessionLog("s1", "EXPORT-1", t0);
    expect(listSessionLogs()).toStrictEqual([
      {
        slot: 1,
        sessionId: "s1",
        savedAt: t0.toISOString(),
        exported: "EXPORT-1",
      },
    ]);
  });

  it("three distinct sessions: newest first", () => {
    upsertSessionLog("s1", "EXPORT-1", t0);
    upsertSessionLog("s2", "EXPORT-2", t1);
    upsertSessionLog("s3", "EXPORT-3", t2);
    expect(listSessionLogs()).toStrictEqual([
      {
        slot: 1,
        sessionId: "s3",
        savedAt: t2.toISOString(),
        exported: "EXPORT-3",
      },
      {
        slot: 2,
        sessionId: "s2",
        savedAt: t1.toISOString(),
        exported: "EXPORT-2",
      },
      {
        slot: 3,
        sessionId: "s1",
        savedAt: t0.toISOString(),
        exported: "EXPORT-1",
      },
    ]);
  });

  it("a fourth distinct session evicts the oldest (EXPORT-1) — ring stays at 3", () => {
    upsertSessionLog("s1", "EXPORT-1", t0);
    upsertSessionLog("s2", "EXPORT-2", t1);
    upsertSessionLog("s3", "EXPORT-3", t2);
    upsertSessionLog("s4", "EXPORT-4", t3);
    expect(listSessionLogs()).toStrictEqual([
      {
        slot: 1,
        sessionId: "s4",
        savedAt: t3.toISOString(),
        exported: "EXPORT-4",
      },
      {
        slot: 2,
        sessionId: "s3",
        savedAt: t2.toISOString(),
        exported: "EXPORT-3",
      },
      {
        slot: 3,
        sessionId: "s2",
        savedAt: t1.toISOString(),
        exported: "EXPORT-2",
      },
    ]);
    // EXPORT-1 is gone entirely, not merely unlisted.
    const raw = JSON.stringify(listSessionLogs());
    expect(raw).not.toContain("EXPORT-1");
  });
});

describe("sessionLogHistory: byte-identity and corruption tolerance", () => {
  it("what goes in comes back exact (byte-identity of `exported`)", () => {
    const exported = '{"entries":[{"kind":"frame","detail":"f1 01"}]}';
    upsertSessionLog("s1", exported, t0);
    expect(listSessionLogs()[0]!.exported).toBe(exported);
  });

  it("a corrupt ARRAY ELEMENT is skipped, not fatal — surviving entries still list", () => {
    upsertSessionLog("s1", "EXPORT-1", t0);
    upsertSessionLog("s2", "EXPORT-2", t1);
    upsertSessionLog("s3", "EXPORT-3", t2);
    // The array is [EXPORT-3, EXPORT-2, EXPORT-1] at this point (see the
    // rotation-order test above); corrupt the middle element directly by
    // overwriting the whole stored array with one bad entry mixed in.
    localStorage.setItem(
      HISTORY_KEY,
      JSON.stringify([
        { sessionId: "s3", savedAt: t2.toISOString(), exported: "EXPORT-3" },
        { unrelated: true },
        { sessionId: "s1", savedAt: t0.toISOString(), exported: "EXPORT-1" },
      ]),
    );
    expect(listSessionLogs()).toStrictEqual([
      {
        slot: 1,
        sessionId: "s3",
        savedAt: t2.toISOString(),
        exported: "EXPORT-3",
      },
      {
        slot: 2,
        sessionId: "s1",
        savedAt: t0.toISOString(),
        exported: "EXPORT-1",
      },
    ]);
  });

  it("an entry missing `sessionId` (a pre-identity stored value) is treated as corrupt, not fatal", () => {
    // No migration for this shape change (module header): an old array
    // written before the review-round-2 identity fix has no `sessionId` on
    // any element, so every one of them fails the shape check and the
    // whole array reads as empty — never a throw, never `undefined`
    // rendered as a session id.
    localStorage.setItem(
      HISTORY_KEY,
      JSON.stringify([{ savedAt: t0.toISOString(), exported: "EXPORT-OLD" }]),
    );
    expect(listSessionLogs()).toStrictEqual([]);
  });

  it("malformed JSON under the history key reads as an empty list, never throws", () => {
    localStorage.setItem(HISTORY_KEY, "not json{{{");
    expect(() => listSessionLogs()).not.toThrow();
    expect(listSessionLogs()).toStrictEqual([]);
  });

  it("well-formed JSON that isn't an array reads as an empty list", () => {
    localStorage.setItem(HISTORY_KEY, JSON.stringify({ not: "an array" }));
    expect(listSessionLogs()).toStrictEqual([]);
  });
});

describe("sessionLogHistory: M-7 — savedAt validation, tightened (review round 2)", () => {
  it("an entry whose savedAt does not parse to a valid date is skipped, never rendered", () => {
    localStorage.setItem(
      HISTORY_KEY,
      JSON.stringify([
        { sessionId: "sbad", savedAt: "not-a-date", exported: "EXPORT-BAD" },
        {
          sessionId: "sgood",
          savedAt: t0.toISOString(),
          exported: "EXPORT-GOOD",
        },
      ]),
    );
    const entries = listSessionLogs();
    expect(entries).toStrictEqual([
      {
        slot: 1,
        sessionId: "sgood",
        savedAt: t0.toISOString(),
        exported: "EXPORT-GOOD",
      },
    ]);
    // Never surfaces "Invalid Date" text anywhere a reader could render it.
    expect(JSON.stringify(entries)).not.toContain("EXPORT-BAD");
  });

  it("an empty-string savedAt is also invalid (Date.parse('') is NaN)", () => {
    localStorage.setItem(
      HISTORY_KEY,
      JSON.stringify([
        { sessionId: "s1", savedAt: "", exported: "EXPORT-BAD" },
      ]),
    );
    expect(listSessionLogs()).toStrictEqual([]);
  });

  it("a calendar value that Date.parse NORMALIZES rather than rejects — Feb 30 rolling to Mar 2 — is still invalid, because it fails the exact round-trip", () => {
    // `new Date("2026-02-30T00:00:00.000Z")` does not produce a NaN time
    // value — the pre-round-2 `Number.isNaN(Date.parse(...))` check let
    // this straight through — it silently normalizes to March 2nd. The
    // stored string and `toISOString()` of the parsed value disagree, which
    // the exact round-trip catches and the NaN-only check could not.
    localStorage.setItem(
      HISTORY_KEY,
      JSON.stringify([
        {
          sessionId: "s1",
          savedAt: "2026-02-30T00:00:00.000Z",
          exported: "EXPORT-BAD",
        },
      ]),
    );
    expect(listSessionLogs()).toStrictEqual([]);
  });

  it("a bare year, which Date.parse accepts as midnight UTC on Jan 1 — a shape no writer here ever produces — is rejected for the same round-trip reason", () => {
    localStorage.setItem(
      HISTORY_KEY,
      JSON.stringify([
        { sessionId: "s1", savedAt: "2026", exported: "EXPORT-BAD" },
      ]),
    );
    expect(listSessionLogs()).toStrictEqual([]);
  });

  it("every entry the writer actually stores — full toISOString() output — passes validation", () => {
    // Confirms the strict round-trip is not over-tight: the ONLY shape
    // `upsertSessionLog` ever writes (`savedAt.toISOString()`) survives it.
    upsertSessionLog("s1", "EXPORT-1", t0);
    expect(listSessionLogs()).toStrictEqual([
      {
        slot: 1,
        sessionId: "s1",
        savedAt: t0.toISOString(),
        exported: "EXPORT-1",
      },
    ]);
  });
});

describe("sessionLogHistory: M-6 — atomic history storage", () => {
  it("upsertSessionLog issues exactly ONE setItem call — the whole array, atomically", () => {
    upsertSessionLog("s1", "EXPORT-1", t0);
    const spy = vi.spyOn(Storage.prototype, "setItem");
    upsertSessionLog("s2", "EXPORT-2", t1);
    const historyWrites = spy.mock.calls.filter(([key]) => key === HISTORY_KEY);
    expect(historyWrites).toHaveLength(1);
  });

  it("a FAILED write loses only the newest upsert — the prior list survives intact", () => {
    upsertSessionLog("s1", "EXPORT-1", t0);
    upsertSessionLog("s2", "EXPORT-2", t1);
    const before = listSessionLogs();

    const spy = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(() => {
        throw new DOMException("storage is denied", "SecurityError");
      });
    try {
      expect(() => upsertSessionLog("s3", "EXPORT-3", t2)).not.toThrow();
    } finally {
      spy.mockRestore();
    }

    // The old three-key rotation could duplicate or lose an entry on a
    // mid-sequence write failure because it took multiple `setItem` calls to
    // land one push; the single-key shape either writes the whole new array
    // or leaves the old one exactly as it was — never a partial result.
    expect(listSessionLogs()).toStrictEqual(before);
  });

  it("upsertSessionLog replaces the SAME session's entry in place — no rotation, list length unchanged", () => {
    upsertSessionLog("s1", "EXPORT-1", t0);
    upsertSessionLog("s2", "EXPORT-2", t1);
    upsertSessionLog("s2", "EXPORT-2-FRESHER", t2);
    expect(listSessionLogs()).toStrictEqual([
      {
        slot: 1,
        sessionId: "s2",
        savedAt: t2.toISOString(),
        exported: "EXPORT-2-FRESHER",
      },
      {
        slot: 2,
        sessionId: "s1",
        savedAt: t0.toISOString(),
        exported: "EXPORT-1",
      },
    ]);
  });

  it("upsertSessionLog issues exactly ONE setItem call too, on the replace path", () => {
    upsertSessionLog("s1", "EXPORT-1", t0);
    const spy = vi.spyOn(Storage.prototype, "setItem");
    upsertSessionLog("s1", "EXPORT-1-FRESHER", t1);
    const historyWrites = spy.mock.calls.filter(([key]) => key === HISTORY_KEY);
    expect(historyWrites).toHaveLength(1);
  });

  it("upsertSessionLog against an empty history inserts one entry", () => {
    upsertSessionLog("s1", "EXPORT-1", t0);
    expect(listSessionLogs()).toStrictEqual([
      {
        slot: 1,
        sessionId: "s1",
        savedAt: t0.toISOString(),
        exported: "EXPORT-1",
      },
    ]);
  });
});

// ---------------------------------------------------------------------------
// Review round 2, items 1+2 (P1+P2): the history's identity fix.
//
// Defect A (double push): a Cancel that unmounts before its own `teardown`
// call resolves used to call `pushSessionLog`/`updateNewestSessionLog`
// through TWO SEPARATE `teardown()` invocations, each resetting its own
// "already pushed this teardown" guard — so one connected session burned
// two history slots. `upsertSessionLog`, keyed by the session's own id
// (minted once per LOGICAL SESSION at the post-GATT ring-creation site,
// unchanged across however many `teardown()`
// calls that one session produces), converges every stash on ONE entry by
// construction: same id in, same array slot out, no per-call guard to reset.
//
// Defect B (wrong-entry replace): a DENIED first write used to still flip
// the "pushed" guard, so the next write UPDATED the newest slot in place —
// overwriting whatever session actually held it, not the one that just
// failed to land. Keying by identity fixes this for free: a denied write
// never lands an entry for that session id, so the next attempt finds no
// match and inserts fresh, exactly like the FIRST attempt for that session
// ever would have.
// ---------------------------------------------------------------------------

describe("sessionLogHistory: identity-bound upsert (review round 2, items 1+2)", () => {
  it("two upserts for the SAME session id converge on ONE entry, regardless of how many calls it takes", () => {
    upsertSessionLog("sX", "FIRST-STASH", t0);
    upsertSessionLog("sX", "SECOND-STASH", t1);
    expect(listSessionLogs()).toHaveLength(1);
    expect(listSessionLogs()[0]).toStrictEqual({
      slot: 1,
      sessionId: "sX",
      savedAt: t1.toISOString(),
      exported: "SECOND-STASH",
    });
  });

  it("a THIRD upsert for the same session id still converges on one entry (double-teardown, not just double-stash)", () => {
    upsertSessionLog("sX", "FIRST", t0);
    upsertSessionLog("sX", "SECOND", t1);
    upsertSessionLog("sX", "THIRD", t2);
    expect(listSessionLogs()).toHaveLength(1);
    expect(listSessionLogs()[0]!.exported).toBe("THIRD");
  });

  it("failure→recovery: a denied write for a NEW session never lands a wrong-entry replace on retry — [A,B,C] -> denied -> retry succeeds -> [new,A,B]", () => {
    // Seed a full ring, oldest to newest — C is the OLDEST (about to be
    // evicted), A is the current newest/head, matching the defect's own
    // notation ("[A,B,C] -> denied push -> update -> [new,B,C], A lost").
    upsertSessionLog("C", "EXPORT-C", t0);
    upsertSessionLog("B", "EXPORT-B", t1);
    upsertSessionLog("A", "EXPORT-A", t2);
    expect(listSessionLogs().map((e) => e.sessionId)).toStrictEqual([
      "A",
      "B",
      "C",
    ]);

    // A brand-new session's FIRST stash is denied — storage-side, so
    // nothing for its id lands.
    const spy = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementationOnce(() => {
        throw new DOMException("storage is denied", "SecurityError");
      });
    expect(() =>
      upsertSessionLog("new", "EXPORT-NEW-DENIED", t3),
    ).not.toThrow();
    spy.mockRestore();
    // Unchanged — the denied write is a no-op, not a partial or wrong one.
    expect(listSessionLogs().map((e) => e.sessionId)).toStrictEqual([
      "A",
      "B",
      "C",
    ]);

    // The SAME session's second stash succeeds. No entry with id "new" was
    // ever recorded, so this is an INSERT — never mistaken for a replace of
    // whatever the ring's current head happens to be.
    upsertSessionLog("new", "EXPORT-NEW", t3);
    const entries = listSessionLogs();
    expect(entries.map((e) => e.sessionId)).toStrictEqual(["new", "A", "B"]);
    expect(entries[0]!.exported).toBe("EXPORT-NEW");
    // C — the entry a savedAt-keyed or always-newest-slot replace would
    // have clobbered — is gone; A and B, untouched by the denied attempt,
    // survive exactly as they were.
    expect(JSON.stringify(entries)).not.toContain("EXPORT-C");
  });
});

describe("sessionLogHistory: denied storage", () => {
  it("a denied GETTER reads as an empty list, never throws", () => {
    localStorage.setItem(HISTORY_KEY, "whatever");
    const spy = vi
      .spyOn(Storage.prototype, "getItem")
      .mockImplementation(() => {
        throw new DOMException("storage is denied", "SecurityError");
      });
    try {
      expect(() => listSessionLogs()).not.toThrow();
      expect(listSessionLogs()).toStrictEqual([]);
    } finally {
      spy.mockRestore();
    }
  });

  it("a denied setItem is a silent no-op — upsertSessionLog never throws", () => {
    const spy = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(() => {
        throw new DOMException("storage is denied", "SecurityError");
      });
    try {
      expect(() => upsertSessionLog("s1", "EXPORT-1", t0)).not.toThrow();
    } finally {
      spy.mockRestore();
    }
    expect(listSessionLogs()).toStrictEqual([]);
  });
});
