# Wave E PR A — Concept2 becomes a row on You, and a screen behind it: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The Concept2 card leaves the You tab; one quiet mono row (CONCEPT2 · state · ›) takes its place beside DIAGNOSTICS, and everything the card does moves to a new `/you/concept2` screen behind it.

**Architecture:** A pure decision table (`concept2RowState.ts`) turns the link hook's two outputs plus one persisted per-account fact (`concept2Seen.ts`, `localStorage`) into one of four strings or nothing; `Concept2Row` renders it inside a new `.you-doors` group that carries the ONE `margin-top: auto` pinning both doors to the foot of You. `Concept2Screen` is Diagnostics' shape (BackLink, title) around the UNCHANGED `Concept2Card`, redirecting to `/you` only when a successful read says `available: false`. The dev-only link probe moves behind the screen.

**Tech Stack:** React 19, react-router-dom flat routes, Vitest + Testing Library (client project), Playwright (`e2e/concept2.spec.ts`, `design.spec.ts`, `screenshots.spec.ts`), plain CSS in `index.css`.

**Spec:** `docs/superpowers/specs/2026-09-04-concept2-walk-fixes.md` — §5.1 (the design), §6.1 (gates), §8 "PR A" (exit criteria A1–A12), §2 rulings 1–7. Gate 0: `docs/design/handoffs/2026-08-31-concept2-connect/amendment-2026-09-03.html` §8, APPROVED by James 2026-09-04 ("approved") on `3fe5f2c2`.

**Worktree:** `/Users/james/projects/github/jamesawesome/Ergomatic-wt-c2pra`, branch `wave-e-c2-row-screen`, base `e3ce0a03` (= main after PR B #298). Every command in this plan runs from `/Users/james/projects/github/jamesawesome/Ergomatic-wt-c2pra/app` unless it says otherwise.

**Paste-test record (agent-briefing "Plan authoring", harden Phase 0 item 4):** every code block in Tasks 1–6 was written into this worktree at base `e3ce0a03` on 2026-09-04, run through `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, the prescribed unit tests (`242 files / 7016 passed / 1 skipped` for `pnpm test --project unit --project client`) and `pnpm e2e` (see Task 5/6 for the count), and then reset. The mutation failure texts quoted in Tasks 2–4 are the actual output of those runs, not predictions. The e2e-level mutations in Task 6 were run by the author against the up stack (measured values in its table). Hardened per `/harden`: lens 1 (antagonist delta, 6 falsified, folded in rev 2) and lens 2 (prescribed code, 10 findings, folded in rev 3); both reports under the worktree's `.superpowers/harden/`.

## Global Constraints

- **R1 — the row mints no copy.** Its state line is one of `LINKED ✓`, `RECONNECT NEEDED`, `NOT LINKED`, `COULDN'T READ` — the strings `Concept2Card` already renders. Never `WAITING`.
- **R2 — the row never shows attempt state.** Nothing in the row reads `outcome`, `busy`, `armed`, `unlinkFailed` — it imports nothing from `Concept2Card`.
- **R3 — `needsReauth` reaches the row in EVERY combination where it holds, including a concurrent read failure** (ruling 5, decision-table cell 10). The row's ordering is `available → needsReauth → failed → linked`, which is NOT the card's.
- **R4 / R11 — silence means "this account has never been told Concept2 is available".** The persisted `seen` fact (`ergomatic.concept2Seen.<accountId>`, value `"1"`) is read ONCE at mount, is an input only where `link === null`, is minted by a successful `available: true` read, cleared by a successful `available: false` read (I-C) and by sign-out (I-D), and a throwing store degrades to `false` (I-G). Its only reader is the row; its only writer is the row plus sign-out's clear.
- **R5 — the screen always answers.** Chrome (BackLink + title) in every state. Redirect predicate is EXACTLY `link !== null && !link.available`. Never `!link?.available`, never `link === null` (AUD-015).
- **R6 — `Concept2Card`'s MARKUP does not change.** Its file gains two comment edits and nothing else. `Concept2Card.test.tsx` and the four `e2e/fixtures/c2-card-*.html` are untouched. Gate 0 §8.5b KEPT the card's `CONCEPT2` head.
- **R7 — one auto margin for the doors group** (`.you-doors`), CONCEPT2 ABOVE DIAGNOSTICS (ruling 7). DIAGNOSTICS stays You's last child.
- **R8 / R9 — no new tier, no new `--accent` use, Unlink unchanged** (52px, two-tap arm, 4 s disarm). The row's state line is `--ink-3` for all four values (6.69:1 on `--page`); Gate 0's optional `--ink`/600 distinction for RECONNECT NEEDED was drawn and is NOT adopted.
- **R10 — `grep -n 'Concept2Card' app/src/You.tsx` returns nothing** (2 at base). The dev probe `monitor/Concept2LinkProbe` MOVES behind `/you/concept2` (Gate 0 A12, recommended and approved).
- **Send block's sentence "Reconnect on the You tab." is UNCHANGED** (ruling 7). No copy string anywhere changes.
- **Not TRIAD:** no number's meaning, no auth. `seen` is a client-side, per-account, boolean-shaped `localStorage` key that can only WIDEN what the rower is told (R11) — a stored shape in the RF27 sense (it carries the lifetime table in `concept2Seen.ts`), not a server-side one; no migration.
- **Never `git checkout -- <file>` or `git stash`** to revert a mutation on a file with uncommitted work (RF22): commit first, mutate, `git checkout` the now-clean file. Anchor every mutation on a string `grep -c` returns exactly `1` for.
- **Every shell write uses an absolute worktree path** (RF20). Run `git rev-parse --show-toplevel` before every commit.
- **`pnpm e2e` and `pnpm screenshots` rebuild the compose stack and leave it up.** Both are required (A10): `app/src/` changes and two screens' layouts change.

---

## Task 0: Gate 0 — verify it is closed; present nothing

**Files:** none changed.

Gate 0 for PR A was presented as the amendment page's §8 (`docs/design/handoffs/2026-08-31-concept2-connect/amendment-2026-09-03.html`, published artifact `dc9d5f68-f201-4da5-8232-63c1adebb7b5`) and James answered "approved" on 2026-09-04. Ruling 7 (spec §2) records the two choices he settled explicitly; the page's own recommendations settle the rest and his approval covers them. **The controller's rulings for this plan, so no implementer re-derives them:**

| question (spec §4.3 / page §8) | answer | where it binds |
| --- | --- | --- |
| Row order | CONCEPT2 above DIAGNOSTICS | Task 4 You.tsx; Task 4 You.test document-order case |
| Send block's "Reconnect on the You tab." | unchanged | nothing to do; A7's phrase sweep confirms no hit changes |
| The word CONCEPT2 twice on the screen (§8.5b) | KEEP the card head — R6 intact, nothing regenerates | Task 3 screen mounts the card as-is |
| `monitor/Concept2LinkProbe` (A12) | MOVES behind `/you/concept2` | Task 3 |
| RECONNECT NEEDED weight on the row (§8.1 optional `.on`) | NOT adopted; all four values `--ink-3` | Task 4 CSS |
| R4's first-visit trade (cell 2a draws nothing) | approved as drawn (§8.3, three silences) | Task 2 |
| `.c2-card`'s 12px top margin on the new screen | REMOVED — measured to paint nothing under the h1's collapsing 21px margin | Task 4 CSS + Task 6 in-situ test |

- [ ] **Step 1.** Confirm the approval is on record and the page is at the approved revision: `git -C /Users/james/projects/github/jamesawesome/Ergomatic-wt-c2pra log --oneline -1 -- docs/design/handoffs/2026-08-31-concept2-connect/amendment-2026-09-03.html` — expect the PR B final-review fix commit or later (the page was reconciled at `d7225703`; §8 is untouched since `3fe5f2c2`).
- [ ] **Step 2.** Do NOT present anything to James. The gate is closed. Proceed to Task 1.

---

## Task 1: `concept2Seen` — the persisted fact and its lifetime

**Files:**
- Create: `app/src/you/concept2Seen.ts`
- Test: `app/src/you/concept2Seen.test.ts`

**Interfaces:**
- Produces: `concept2SeenKey(accountId: string): string`, `readConcept2Seen(accountId: string): boolean`, `writeConcept2Seen(accountId: string, available: boolean): void`, `clearConcept2Seen(accountId: string): void`. Key is `ergomatic.concept2Seen.<accountId>`, stored value `"1"`.

- [ ] **Step 1: Write the failing test**

Create `app/src/you/concept2Seen.test.ts` with exactly this content:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  clearConcept2Seen,
  concept2SeenKey,
  readConcept2Seen,
  writeConcept2Seen,
} from "./concept2Seen";

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("concept2Seen (ruling 6's persisted fact, invariants I-A..I-G)", () => {
  it("is false for an account nobody has written — the fresh-device default", () => {
    expect(readConcept2Seen("u1")).toBe(false);
  });

  it("a successful available:true read mints it, and it reads back true", () => {
    writeConcept2Seen("u1", true);
    expect(readConcept2Seen("u1")).toBe(true);
    // The stored value is our own literal, not a boolean coerced to a string
    // by accident — pinned as an INDEPENDENT literal (RF21).
    expect(localStorage.getItem("ergomatic.concept2Seen.u1")).toBe("1");
  });

  it("I-C: a successful available:false read clears it in the same pass", () => {
    writeConcept2Seen("u1", true);
    writeConcept2Seen("u1", false);
    expect(readConcept2Seen("u1")).toBe(false);
    expect(localStorage.getItem("ergomatic.concept2Seen.u1")).toBeNull();
  });

  it("I-A: one fact per account — another account on the same device reads false", () => {
    writeConcept2Seen("u1", true);
    expect(readConcept2Seen("u2")).toBe(false);
    expect(concept2SeenKey("u2")).not.toBe(concept2SeenKey("u1"));
  });

  it("I-D: clearConcept2Seen removes exactly that account's fact", () => {
    writeConcept2Seen("u1", true);
    writeConcept2Seen("u2", true);
    clearConcept2Seen("u1");
    expect(readConcept2Seen("u1")).toBe(false);
    expect(readConcept2Seen("u2")).toBe(true);
  });

  it("I-B: a foreign value under our key is NOT a claim — only our own literal reads as seen", () => {
    localStorage.setItem("ergomatic.concept2Seen.u1", "true");
    expect(readConcept2Seen("u1")).toBe(false);
  });

  it("I-G: a store that throws on read answers false, never a claim", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("SecurityError");
    });
    expect(readConcept2Seen("u1")).toBe(false);
  });

  it("I-G: a store that throws on the CLEAR leaves the old fact — the one direction that is not fail-closed, named", () => {
    writeConcept2Seen("u1", true);
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
      throw new Error("SecurityError");
    });
    expect(() => writeConcept2Seen("u1", false)).not.toThrow();
    vi.restoreAllMocks();
    // Still "1": a swallowed CLEAR cannot un-say a claim. Bounded by I-C
    // retrying on every successful read and by I-A keeping it to this
    // account; the module header says so.
    expect(readConcept2Seen("u1")).toBe(true);
  });

  it("I-G: a store that throws on write is swallowed, and the fact degrades to not-seen", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });
    expect(() => writeConcept2Seen("u1", true)).not.toThrow();
    vi.restoreAllMocks();
    expect(readConcept2Seen("u1")).toBe(false);
  });
});
```

- [ ] **Step 2: Run it — expect FAIL (module not found)**

```
cd /Users/james/projects/github/jamesawesome/Ergomatic-wt-c2pra/app
NODE_OPTIONS=--no-experimental-webstorage pnpm exec vitest run --project client src/you/concept2Seen.test.ts
```
(`NODE_OPTIONS` is not optional — CLAUDE.md's vitest footgun: without it Node 26's webStorage global collides with jsdom's `localStorage` and every storage test in this plan fails falsely.)

- [ ] **Step 3: Write the module**

Create `app/src/you/concept2Seen.ts` with exactly this content:

```ts
/**
 * "This account has been told Concept2 is available" — the ONE persisted fact
 * the Concept2 row on You reads (spec 2026-09-04-concept2-walk-fixes §5.1,
 * ruling 6 and its lifetime table, invariants I-A..I-G).
 *
 * WHY IT IS PERSISTED AND NOT `useState`: `useConcept2Link`'s `link` and
 * `failed` are component state, routes are flat and mutually exclusive, so
 * You unmounts on every trip to `/you/concept2` and back and every visit is a
 * first-ever read. Per-mount evidence had a shorter lifetime than the fact it
 * was asked to carry (RF27). `localStorage` is the store this WebView already
 * writes from (`monitor/monitorRun.ts`'s `saveMonitorRun`) and it survives
 * unmount, route change, backgrounding and relaunch (I-E). Availability floor:
 * `localStorage` is part of WebKit's WKWebView on every iOS this app targets
 * (`IPHONEOS_DEPLOYMENT_TARGET = 15.0`, `App.xcodeproj/project.pbxproj`);
 * WebStorage shipped in iOS 2.0's Safari and has never been removed.
 *
 * WHAT IT ASSERTS (I-B): exactly one thing — a successful read on THIS account
 * has reported `available: true` at least once. Never linked, never healthy,
 * never current. Its only consumer is the row's `link === null && failed !==
 * null` cell (I-F): the row that would otherwise have to show a rower an
 * error about a feature they may not have.
 *
 * PER ACCOUNT (I-A): the key carries the account id, so no account can read
 * another's. Sign-out ALSO clears it (I-D, `You.tsx`'s Sign out handler) —
 * NOT because another account could read it (I-A pins that) but because
 * THIS account may sign back in on this device after being removed from
 * `C2_ALLOWED_EMAILS`, and a stale `true` would give it a door on the one
 * read that fails.
 *
 * FAIL-CLOSED ON THE MINT (I-G): a read that throws answers `false` ("not
 * seen"), and a MINT that throws is swallowed — the row goes quiet, it never
 * asserts a cohort from a write nobody made. The CLEAR is the one direction
 * that is not fail-closed: a `removeItem` that throws leaves the old `"1"`,
 * so a stale claim can survive until the next successful clear or sign-out.
 * Bounded: the only cell it feeds (row 2b) draws a door whose screen re-reads
 * the server, and I-C retries the clear on every successful read. Named
 * rather than hidden; `concept2Seen.test.ts` pins both directions. This is
 * the opposite of RF25/AUD-016's `saveMonitorRun`, where a swallowed write
 * let the caller proceed as if it had succeeded; here the caller's next
 * render simply re-reads storage.
 *
 * ONE COLLAPSE TO KNOW ABOUT: `normalizeLink` answers `available: false` for
 * a 200 whose body it cannot read as well as for a real "no Concept2" — so a
 * malformed 200 clears the fact (I-C) exactly as a revocation does. The cost
 * is one visit's silence on the next FAILED read (cell 2a instead of 2b),
 * never a claim; accepted, because the alternative is trusting a body the
 * hook itself refused.
 */

const KEY_PREFIX = "ergomatic.concept2Seen.";

export function concept2SeenKey(accountId: string): string {
  return `${KEY_PREFIX}${accountId}`;
}

/** `true` only when a successful read on this account has ever reported
 *  `available: true` AND that fact could be read back. Anything else —
 *  absent key, storage unavailable, a value that is not our own `"1"` — is
 *  `false`. */
export function readConcept2Seen(accountId: string): boolean {
  try {
    return localStorage.getItem(concept2SeenKey(accountId)) === "1";
  } catch {
    return false;
  }
}

/** Records the latest SUCCESSFUL read's `available` answer for this account:
 *  `true` mints the fact, `false` clears it in the same pass (I-C — a revoked
 *  cohort membership cannot leave a row behind). Never called on a FAILED
 *  read; the caller (`Concept2Row`) only reaches this once `link` is non-null.
 *  A throwing store is swallowed: the fact degrades to "not seen" on the
 *  next read, never to a claim. */
export function writeConcept2Seen(accountId: string, available: boolean): void {
  try {
    if (available) localStorage.setItem(concept2SeenKey(accountId), "1");
    else localStorage.removeItem(concept2SeenKey(accountId));
  } catch {
    // I-G: nothing to do. The next `readConcept2Seen` answers `false`, which
    // is the honest failure mode — the row goes quiet.
  }
}

/** I-D: sign-out clears the fact for the account signing out. */
export function clearConcept2Seen(accountId: string): void {
  writeConcept2Seen(accountId, false);
}
```

- [ ] **Step 4: Run the test — expect `9 passed`**, then the gates:

```
cd /Users/james/projects/github/jamesawesome/Ergomatic-wt-c2pra/app
NODE_OPTIONS=--no-experimental-webstorage pnpm exec vitest run --project client src/you/concept2Seen.test.ts
```
(`NODE_OPTIONS` is not optional — CLAUDE.md's vitest footgun: without it Node 26's webStorage global collides with jsdom's `localStorage` and every storage test in this plan fails falsely.)

```
cd /Users/james/projects/github/jamesawesome/Ergomatic-wt-c2pra/app
pnpm typecheck
pnpm lint
pnpm format:check
```

- [ ] **Step 4b: Mutation (this task had no mutation table before; added at
  Task 7's reconciliation).** `grep -c 'localStorage.getItem' app/src/you/concept2Seen.ts` must be 1 before mutating; revert with `git checkout -- <file>` on the now-clean file (commit Step 5 first if it has not landed yet, so the revert is a no-op).

| # | mutation (file, anchor → replacement) | measured failure |
| --- | --- | --- |
| I-B | `concept2Seen.ts`: `localStorage.getItem(concept2SeenKey(accountId)) === "1"` → `localStorage.getItem(concept2SeenKey(accountId)) !== null` | `1 failed`: "I-B: a foreign value under our key is NOT a claim…" — `AssertionError: expected true to be false` (the foreign `"true"` string now reads as seen) |

- [ ] **Step 5: Commit**

```
cd /Users/james/projects/github/jamesawesome/Ergomatic-wt-c2pra
git rev-parse --show-toplevel   # MUST print this worktree's path
git add app/src/you/concept2Seen.ts app/src/you/concept2Seen.test.ts
git commit -m "PR A Task 1: concept2Seen — the persisted per-account fact (ruling 6)"
```

---

## Task 2: the decision table and the row

**Files:**
- Create: `app/src/you/concept2RowState.ts` (pure function; separate file so `Concept2Row.tsx` exports only a component — `react-refresh/only-export-components` warns otherwise, measured)
- Create: `app/src/you/Concept2Row.tsx`
- Test: `app/src/you/Concept2Row.test.tsx`

**Interfaces:**
- Consumes: Task 1's `readConcept2Seen`/`writeConcept2Seen`; `useConcept2Link` (`api/useConcept2Link.ts`, returns `{ link, failed, reload }`).
- Produces: `rowState(link: Concept2Link | null, failed: LinkReadFailure | null, seen: boolean): RowState` where `RowState = "NOT LINKED" | "LINKED ✓" | "RECONNECT NEEDED" | "COULDN'T READ" | null`; default export `Concept2Row({ accountId }: { accountId: string })` rendering `<Link to="/you/concept2" state={{ from: "/you" }} className="diag-row">` with `<span>CONCEPT2</span>` and `<span className="diag-row-end"><span className="diag-row-state">{state}</span><span aria-hidden="true">›</span></span>`, or `null`.

- [ ] **Step 1: Write the failing test**

Create `app/src/you/Concept2Row.test.tsx` with exactly this content:

```tsx
import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import Concept2Row from "./Concept2Row";
import { rowState } from "./concept2RowState";
import { LINK_UNAVAILABLE, type Concept2Link } from "../api/useConcept2Link";
import { api } from "../api";

// Same idiom as `You.test.tsx`: `./api` is mocked (its ONE export), the
// link read is answered from `c2Link`, everything else falls through to
// `fetch`. `c2Link.body === "pending"` answers with a promise that never
// settles, which is how cells 1/2a/2b (no read has resolved this mount) are
// reached honestly rather than by racing the assertion against the read.
const c2Link = vi.hoisted(() => ({
  body: { available: false } as unknown,
  status: 200,
}));

vi.mock("../api", () => ({
  api: vi.fn(async (path: string, init?: RequestInit) => {
    if (path !== "/api/concept2/link") return fetch(path, init);
    if (c2Link.body === "pending") return new Promise<Response>(() => {});
    return new Response(JSON.stringify(c2Link.body), {
      status: c2Link.status,
      headers: { "Content-Type": "application/json" },
    });
  }),
}));

const AVAILABLE_UNLINKED: Concept2Link = {
  ...LINK_UNAVAILABLE,
  available: true,
};
const LINKED: Concept2Link = {
  available: true,
  linked: true,
  c2UserId: 2211,
  c2Username: "jamesawesome",
  needsReauth: false,
  logbookBaseUrl: "https://log-dev.concept2.com",
};
const REAUTH: Concept2Link = { ...LINKED, needsReauth: true };
const FAILED = { status: 502 };

beforeEach(() => {
  c2Link.body = { available: false };
  c2Link.status = 200;
  vi.mocked(api).mockClear();
});
afterEach(() => {
  localStorage.clear();
});

function renderRow(accountId = "u1") {
  return render(
    <MemoryRouter>
      <Concept2Row accountId={accountId} />
    </MemoryRouter>,
  );
}

describe("rowState — the decision table, all eleven leaf cells (spec §5.1)", () => {
  // Written as INDEPENDENT literals against the table's own row numbers, so
  // a change to the derivation is caught by the cell it moves, not by a
  // symbol that moved with it (RF21).
  it.each([
    ["1", null, null, false, null],
    ["1 (seen)", null, null, true, null],
    ["2a", null, FAILED, false, null],
    ["2b", null, FAILED, true, "COULDN'T READ"],
    ["3", LINK_UNAVAILABLE, null, false, null],
    ["4", LINK_UNAVAILABLE, FAILED, true, null],
    ["5", AVAILABLE_UNLINKED, null, false, "NOT LINKED"],
    ["6", AVAILABLE_UNLINKED, FAILED, false, "COULDN'T READ"],
    ["7", LINKED, null, false, "LINKED ✓"],
    ["8", LINKED, FAILED, false, "COULDN'T READ"],
    ["9", REAUTH, null, false, "RECONNECT NEEDED"],
    ["10", REAUTH, FAILED, false, "RECONNECT NEEDED"],
  ] as const)("cell %s", (_cell, link, failed, seen, expected) => {
    expect(rowState(link, failed, seen)).toBe(expected);
  });

  it("cell 10 is ruling 5: a failed re-read does NOT overwrite a sticky RECONNECT NEEDED", () => {
    // Stated on its own because it is the cell the whole revision exists
    // for, and the one the card's own ordering would get wrong.
    expect(rowState(REAUTH, FAILED, false)).toBe("RECONNECT NEEDED");
    expect(rowState(REAUTH, FAILED, true)).toBe("RECONNECT NEEDED");
  });

  it("cell 4: seen does not resurrect a row a successful available:false read removed", () => {
    expect(rowState(LINK_UNAVAILABLE, FAILED, true)).toBeNull();
  });
});

describe("Concept2Row on You (spec §5.1 R1-R4, R11)", () => {
  it("cell 5: an available, unlinked account gets a NOT LINKED row linking to /you/concept2", async () => {
    c2Link.body = { available: true, linked: false };
    renderRow();
    const row = await screen.findByRole("link", { name: /CONCEPT2/ });
    expect(row).toHaveAttribute("href", "/you/concept2");
    expect(screen.getByText("NOT LINKED")).toBeInTheDocument();
  });

  it("cell 7: a healthy link reads LINKED ✓", async () => {
    c2Link.body = LINKED;
    renderRow();
    expect(await screen.findByText("LINKED ✓")).toBeInTheDocument();
  });

  it("cell 9: needsReauth reads RECONNECT NEEDED — the pre-emptive warning the row exists for (R3)", async () => {
    c2Link.body = REAUTH;
    renderRow();
    expect(await screen.findByText("RECONNECT NEEDED")).toBeInTheDocument();
  });

  it("cell 3: a successful available:false read draws nothing, and clears seen (I-C)", async () => {
    localStorage.setItem("ergomatic.concept2Seen.u1", "1");
    c2Link.body = { available: false };
    renderRow();
    await waitFor(() =>
      expect(vi.mocked(api)).toHaveBeenCalledWith("/api/concept2/link"),
    );
    await waitFor(() =>
      expect(localStorage.getItem("ergomatic.concept2Seen.u1")).toBeNull(),
    );
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("cell 2a: a FIRST-EVER read that fails draws nothing — never an error about a feature this account may not have (R4)", async () => {
    c2Link.body = { error: "upstream" };
    c2Link.status = 502;
    renderRow();
    await waitFor(() =>
      expect(vi.mocked(api)).toHaveBeenCalledWith("/api/concept2/link"),
    );
    // Positive readiness first: the read has resolved (the hook set
    // `failed`), which this test observes through the row NOT rendering
    // after the call — so wait one more macrotask for the state to land.
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.queryByText("COULDN'T READ")).toBeNull();
  });

  it("cell 2b: an account that HAS been told, whose read fails, keeps its door and reads COULDN'T READ (R11)", async () => {
    localStorage.setItem("ergomatic.concept2Seen.u1", "1");
    c2Link.body = { error: "upstream" };
    c2Link.status = 502;
    renderRow();
    expect(await screen.findByText("COULDN'T READ")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /CONCEPT2/ })).toHaveAttribute(
      "href",
      "/you/concept2",
    );
  });

  it("cell 1: nothing while the first read is still pending, seen or not", async () => {
    localStorage.setItem("ergomatic.concept2Seen.u1", "1");
    c2Link.body = "pending";
    renderRow();
    await waitFor(() =>
      expect(vi.mocked(api)).toHaveBeenCalledWith("/api/concept2/link"),
    );
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("a successful available:true read mints seen for THIS account only (I-A, I-B)", async () => {
    c2Link.body = { available: true, linked: false };
    renderRow("u1");
    await screen.findByText("NOT LINKED");
    await waitFor(() =>
      expect(localStorage.getItem("ergomatic.concept2Seen.u1")).toBe("1"),
    );
    expect(localStorage.getItem("ergomatic.concept2Seen.u2")).toBeNull();
  });

  it("I-A: a second account on the same device inherits nothing — its own failed first read draws no row", async () => {
    localStorage.setItem("ergomatic.concept2Seen.u1", "1");
    c2Link.body = { error: "upstream" };
    c2Link.status = 502;
    renderRow("u2");
    await waitFor(() =>
      expect(vi.mocked(api)).toHaveBeenCalledWith("/api/concept2/link"),
    );
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("R2: the row carries no attempt state — none of the card's tap-born strings can appear", async () => {
    c2Link.body = LINKED;
    renderRow();
    await screen.findByText("LINKED ✓");
    for (const s of ["WAITING", "OPENING CONCEPT2", "Tap again to unlink"]) {
      expect(screen.queryByText(s)).toBeNull();
    }
  });
});
```

- [ ] **Step 2: Run it — expect FAIL (modules not found)**

```
cd /Users/james/projects/github/jamesawesome/Ergomatic-wt-c2pra/app
NODE_OPTIONS=--no-experimental-webstorage pnpm exec vitest run --project client src/you/Concept2Row.test.tsx
```
(`NODE_OPTIONS` is not optional — CLAUDE.md's vitest footgun: without it Node 26's webStorage global collides with jsdom's `localStorage` and every storage test in this plan fails falsely.)

- [ ] **Step 3: Write the table**

Create `app/src/you/concept2RowState.ts` with exactly this content:

```ts
import type { Concept2Link, LinkReadFailure } from "../api/useConcept2Link";

/**
 * The CONCEPT2 row's decision table (spec 2026-09-04-concept2-walk-fixes
 * §5.1), as a pure function so every one of its eleven leaf cells is a unit
 * case. `Concept2Row.tsx` is the only caller and carries the argument for
 * the one place this departs from the card's own ordering (ruling 5).
 */
export type RowState =
  "NOT LINKED" | "LINKED ✓" | "RECONNECT NEEDED" | "COULDN'T READ" | null;

export function rowState(
  link: Concept2Link | null,
  failed: LinkReadFailure | null,
  seen: boolean,
): RowState {
  if (link === null) {
    // Cells 1, 2a, 2b. Nothing has resolved this mount. A failure is worth
    // saying ONLY to an account that has been told, on some earlier
    // successful read, that Concept2 exists for it (R4) — the first thing a
    // rower ever hears about Concept2 must not be an error.
    return failed !== null && seen ? "COULDN'T READ" : null;
  }
  // Cells 3, 4: a SUCCESSFUL read said this account has no Concept2. A later
  // failed re-read is not evidence against it.
  if (!link.available) return null;
  // Cells 9, 10 — before `failed`, on purpose (ruling 5). R3: no other state
  // can hide a broken link.
  if (link.linked && link.needsReauth) return "RECONNECT NEEDED";
  // Cells 6, 8: a retained AVAILABLE link, so the rower knows the feature
  // exists and the failure is worth telling them about.
  if (failed !== null) return "COULDN'T READ";
  // Cells 5, 7.
  return link.linked ? "LINKED ✓" : "NOT LINKED";
}
```

- [ ] **Step 4: Write the row**

Create `app/src/you/Concept2Row.tsx` with exactly this content:

```tsx
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useConcept2Link } from "../api/useConcept2Link";
import { rowState } from "./concept2RowState";
import { readConcept2Seen, writeConcept2Seen } from "./concept2Seen";

/**
 * The Concept2 door on You (spec 2026-09-04-concept2-walk-fixes §5.1; Gate 0
 * amendment §8). One quiet mono row in the DIAGNOSTICS idiom — label, state
 * line, chevron — opening `/you/concept2`, where the card now lives.
 *
 * THE ROW SHOWS WHAT THE SERVER LAST SAID; THE SCREEN SHOWS WHAT THE LAST TAP
 * DID. That partition is forced, not chosen: the card's attempt state
 * (`outcome`/`busy`/`armed`/`unlinkFailed`) is `useState` inside
 * `Concept2Card`, routes are flat (`shell/AppRoutes.tsx`), so You is unmounted
 * whenever the screen is open and no frame ever holds a mounted row and a live
 * attempt at once (R2). The fifth attempt value, `adapters/linkFlow.ts`'s
 * module-level `linkInFlight`, does survive unmount — and is rendered nowhere.
 *
 * THE ROW MINTS NO COPY (R1): its four strings are ones `Concept2Card` already
 * renders. The card's fifth status, `WAITING`, is an attempt state and is
 * unreachable here.
 *
 * `rowState` (`./concept2RowState.ts`, a separate module so this file exports
 * only a component for Fast Refresh) is the decision table, spec §5.1, over
 * the two inputs the row actually reads plus `seen` on the two cells where
 * `link` is still null.
 * The one place it DEPARTS from the card: on the card `failed` wins over a
 * retained `link` (`Concept2Card.tsx`, the 1i comment) because the card's
 * failure panel carries a Retry. The row has no Retry — its only affordance
 * is the tap into the screen — so a sticky, server-set `needsReauth` is NOT
 * overwritten by a transient read failure (ruling 5, cell 10): the server
 * clears `needsReauthAt` only on a successful relink
 * (`server/routes/concept2.ts`, the exchange handler's own comment), and a
 * read that FAILED cannot have resolved it.
 */
export default function Concept2Row({ accountId }: { accountId: string }) {
  const { link, failed } = useConcept2Link();
  // Read ONCE, at mount (a `useState` initializer, never re-read): `seen`
  // is an input only while `link` is null, and once a read resolves this
  // mount `link` is newer than the flag and answers for it. Re-reading it
  // later would be a second source of truth for a fact the live read owns.
  const [seenAtMount] = useState(() => readConcept2Seen(accountId));

  // The row is `seen`'s only WRITER as well as its only reader (I-F): every
  // successful read that reaches this mount records its `available` answer,
  // minting on `true` and clearing on `false` (I-C). Never on a failed read
  // — `link` stays whatever it was, so this effect does not fire for it.
  // No `setState` here (`react-hooks/set-state-in-effect`): the effect
  // writes storage and nothing else.
  useEffect(() => {
    if (link !== null) writeConcept2Seen(accountId, link.available);
  }, [accountId, link]);

  const state = rowState(link, failed, seenAtMount);
  if (state === null) return null;

  return (
    <Link to="/you/concept2" state={{ from: "/you" }} className="diag-row">
      <span>CONCEPT2</span>
      <span className="diag-row-end">
        <span className="diag-row-state">{state}</span>
        <span aria-hidden="true">&rsaquo;</span>
      </span>
    </Link>
  );
}
```

- [ ] **Step 5: Run the test — expect `24 passed`**, then the gates.

```
cd /Users/james/projects/github/jamesawesome/Ergomatic-wt-c2pra/app
NODE_OPTIONS=--no-experimental-webstorage pnpm exec vitest run --project client src/you/Concept2Row.test.tsx
```
(`NODE_OPTIONS` is not optional — CLAUDE.md's vitest footgun: without it Node 26's webStorage global collides with jsdom's `localStorage` and every storage test in this plan fails falsely.)

```
cd /Users/james/projects/github/jamesawesome/Ergomatic-wt-c2pra/app
pnpm typecheck
pnpm lint
pnpm format:check
```

- [ ] **Step 6: Commit BEFORE mutating** (RF22)

```
cd /Users/james/projects/github/jamesawesome/Ergomatic-wt-c2pra
git rev-parse --show-toplevel   # MUST print this worktree's path
git add app/src/you/concept2RowState.ts app/src/you/Concept2Row.tsx app/src/you/Concept2Row.test.tsx
git commit -m "PR A Task 2: the CONCEPT2 row and its decision table"
```

- [ ] **Step 7: Mutations (spec §6.1; each anchor must `grep -c` to exactly 1 first; revert each with `git checkout -- <file>` on the now-clean file).** Measured output at the author's paste-test:

| # | mutation (file, anchor → replacement) | measured failure |
| --- | --- | --- |
| R3(i) | `concept2RowState.ts`: `if (link.linked && link.needsReauth) return "RECONNECT NEEDED";` → `if (link.linked && false) return "RECONNECT NEEDED";` | `4 failed`: cells 9, 10, "cell 10 is ruling 5…", "cell 9: needsReauth reads RECONNECT NEEDED…" — `AssertionError: expected 'LINKED ✓' to be 'RECONNECT NEEDED'` |
| R3(ii) | same file: move `if (failed !== null) return "COULDN'T READ";` ABOVE the `needsReauth` line (the card's ordering) | `2 failed`: cell 10, "cell 10 is ruling 5…" — `AssertionError: expected 'COULDN\'T READ' to be 'RECONNECT NEEDED'` |
| R4 | same file: `return failed !== null && seen ? "COULDN'T READ" : null;` → `return failed !== null ? "COULDN'T READ" : null;` | `3 failed`: cell 2a (×2), "I-A: a second account…" — `AssertionError: expected 'COULDN\'T READ' to be null` |
| R11(a) | `Concept2Row.tsx`: `useState(() => readConcept2Seen(accountId));` → `useState(() => false && readConcept2Seen(accountId));` | `1 failed`: "cell 2b: an account that HAS been told…" — `Unable to find an element with the text: COULDN'T READ` |
| R2 | **no code to mutate.** The row cannot reach `busy`/`outcome`/`armed`/`unlinkFailed` — they are `Concept2Card`'s `useState` and the row imports nothing from it. R2 is gated by STRUCTURE (`grep -n "import.*Concept2Card" app/src/you/Concept2Row.tsx` → 0 — plain `grep -n "Concept2Card"` returns 3, all header-comment prose, so the anchor must be the import line) and by the "R2: the row carries no attempt state" case; the PR body says so rather than claiming a mutation. | n/a — record the grep |

Record each mutation's actual output in your report, verbatim. If any differs from the table, the table is wrong and the report says so.

---

## Task 3: the screen and its route; the probe moves

**Files:**
- Create: `app/src/you/Concept2Screen.tsx`
- Test: `app/src/you/Concept2Screen.test.tsx`
- Modify: `app/src/shell/AppRoutes.tsx` (one import, one route inside the `{user && onSignedOut && …}` fragment, after `/you/diagnostics`)
- Modify: `app/src/shell/AppRoutes.test.tsx` (one mock, one case)

**Interfaces:**
- Consumes: `Concept2Card({ email })` unchanged; `BackLink({ fallback })`; `useConcept2Link`.
- Produces: default export `Concept2Screen({ email }: { email: string })` at route `/you/concept2`.

- [ ] **Step 1: Write the failing test**

Create `app/src/you/Concept2Screen.test.tsx` with exactly this content:

```tsx
import { act, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import Concept2Screen from "./Concept2Screen";
import { api } from "../api";

// The dev-only probe now mounts HERE (moved from You, Gate 0 A12); same
// reason `You.test.tsx` used to mock it — `import.meta.env.DEV` is true
// under Vitest and the real lazy import would resolve in every test.
vi.mock("../monitor/Concept2LinkProbe", () => ({ default: () => null }));

// `./api`'s one export mocked; `"pending"` never settles — that is how the
// "read still in flight" state is reached honestly (see Concept2Row.test).
const c2Link = vi.hoisted(() => ({
  body: { available: false } as unknown,
  status: 200,
}));
vi.mock("../api", () => ({
  api: vi.fn(async (path: string, init?: RequestInit) => {
    if (path !== "/api/concept2/link") return fetch(path, init);
    if (c2Link.body === "pending") return new Promise<Response>(() => {});
    return new Response(JSON.stringify(c2Link.body), {
      status: c2Link.status,
      headers: { "Content-Type": "application/json" },
    });
  }),
}));

function YouProbe() {
  const loc = useLocation();
  return <p>YOU SCREEN at {loc.pathname}</p>;
}

function renderScreen(
  initialEntries: (string | { pathname: string; state: unknown })[] = [
    "/you/concept2",
  ],
) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <Routes>
        <Route path="/you" element={<YouProbe />} />
        <Route
          path="/you/concept2"
          element={<Concept2Screen email="a@x.com" />}
        />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  c2Link.body = { available: false };
  c2Link.status = 200;
  vi.mocked(api).mockClear();
});
afterEach(() => {
  localStorage.clear();
});

describe("Concept2Screen — /you/concept2 (spec §5.1 R5, R6)", () => {
  it("renders BackLink and the Concept2 title before the first read resolves — a pending read is NOT a redirect", async () => {
    c2Link.body = "pending";
    renderScreen();
    expect(screen.getByRole("heading", { name: "Concept2" })).toBeVisible();
    expect(screen.getByRole("link", { name: /BACK/ })).toHaveAttribute(
      "href",
      "/you",
    );
    await waitFor(() =>
      expect(vi.mocked(api)).toHaveBeenCalledWith("/api/concept2/link"),
    );
    // Still here after the read is in flight: the AUD-015 shape this guards
    // against is a screen that bounces on every mount because `null` read
    // as "unavailable".
    expect(screen.queryByText(/YOU SCREEN/)).toBeNull();
    expect(screen.getByRole("heading", { name: "Concept2" })).toBeVisible();
  });

  it("renders chrome AND the card's read-failed panel when the read fails, retained link or not", async () => {
    c2Link.body = { error: "upstream" };
    c2Link.status = 502;
    renderScreen();
    expect(await screen.findByText("COULDN'T READ CONCEPT2")).toBeVisible();
    expect(screen.getByRole("heading", { name: "Concept2" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Retry" })).toBeVisible();
    expect(screen.getByRole("link", { name: /BACK/ })).toBeVisible();
  });

  it("mounts the card unchanged: an available, unlinked account sees CONNECT TO CONCEPT2 under the title", async () => {
    c2Link.body = { available: true, linked: false };
    renderScreen();
    expect(
      await screen.findByRole("button", { name: "CONNECT TO CONCEPT2" }),
    ).toBeEnabled();
    // R6: the card's own head is still there — Gate 0 §8.5b kept it.
    expect(screen.getByRole("heading", { name: "CONCEPT2" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Concept2" })).toBeVisible();
  });

  it("returns the rower to /you when a SUCCESSFUL read says the surface is unavailable (typed URL, stale history)", async () => {
    c2Link.body = { available: false };
    renderScreen();
    expect(await screen.findByText("YOU SCREEN at /you")).toBeVisible();
    expect(screen.queryByRole("heading", { name: "Concept2" })).toBeNull();
  });

  it("the screen's own read and the card's can disagree: a card gone unavailable while the screen's read failed leaves chrome over an empty body — the known window", async () => {
    // TWO reads per mount, one per hook instance, and the card's read is
    // call 1 and the screen's is call 2 — child-before-parent effect order,
    // INFERENCE from the measured run (react.dev's useEffect reference does
    // not state an inter-component ordering; checked 2026-09-04, no such
    // sentence found). Answering call 1 `available:false` and call 2 with a 502 is the
    // disagreement directly: the card goes silent (its own `!link.available`
    // return), the screen's `link` stays null with `failed` set, and its
    // redirect predicate (`link !== null && !link.available`) cannot fire.
    // The same shape arises in production when the card's Retry succeeds
    // with available:false after both reads failed. Pinned so a change to
    // either predicate — or to the effect order — is a red test, not a
    // silently blank screen.
    // Deferred, so BOTH answers are APPLIED before any assertion: a call
    // count only proves the requests STARTED, and `.c2-card` is absent at
    // mount anyway (the card returns null while `link === null`), so neither
    // is a readiness observable — measured: a screen mutated to redirect on
    // a FAILED read stayed green against the count-gated version. Resolver 0
    // is the card's read and resolver 1 is the screen's, child-before-parent
    // (INFERENCE from this measured run, not a cited React ordering
    // guarantee — see the note above).
    const answer: Array<(r: Response) => void> = [];
    vi.mocked(api).mockImplementation((path: string) => {
      if (path !== "/api/concept2/link")
        return Promise.resolve(new Response(null, { status: 204 }));
      return new Promise<Response>((resolve) => answer.push(resolve));
    });
    renderScreen();
    await waitFor(() => expect(answer).toHaveLength(2));
    await act(async () => {
      answer[0]!(
        new Response(JSON.stringify({ available: false }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    });
    await act(async () => {
      answer[1]!(
        new Response(JSON.stringify({ error: "upstream" }), { status: 502 }),
      );
    });
    // Both answers applied. Chrome stays, BACK works, no redirect, card silent.
    expect(screen.getByRole("heading", { name: "Concept2" })).toBeVisible();
    expect(screen.getByRole("link", { name: /BACK/ })).toHaveAttribute(
      "href",
      "/you",
    );
    expect(screen.queryByText("YOU SCREEN at /you")).toBeNull();
    expect(document.querySelector(".c2-card")).toBeNull();
    expect(screen.queryByText("COULDN'T READ CONCEPT2")).toBeNull();
  });

  it("BACK targets /you — the row's from=/you and the screen's fallback are the same place, so one assertion covers a warm entry and a cold load", async () => {
    c2Link.body = { available: true, linked: false };
    renderScreen([{ pathname: "/you/concept2", state: { from: "/you" } }]);
    expect(await screen.findByRole("link", { name: /BACK/ })).toHaveAttribute(
      "href",
      "/you",
    );
  });
});
```

- [ ] **Step 2: Run it — expect FAIL**

```
cd /Users/james/projects/github/jamesawesome/Ergomatic-wt-c2pra/app
NODE_OPTIONS=--no-experimental-webstorage pnpm exec vitest run --project client src/you/Concept2Screen.test.tsx
```
(`NODE_OPTIONS` is not optional — CLAUDE.md's vitest footgun: without it Node 26's webStorage global collides with jsdom's `localStorage` and every storage test in this plan fails falsely.)

- [ ] **Step 3: Write the screen**

Create `app/src/you/Concept2Screen.tsx` with exactly this content:

```tsx
import { lazy, Suspense } from "react";
import { Navigate } from "react-router-dom";
import { useConcept2Link } from "../api/useConcept2Link";
import BackLink from "../shell/BackLink";
import Concept2Card from "./Concept2Card";

// Wave E PR1.5 fix round 2 (P1a-device), moved here from You by PR A (Gate 0
// amendment §8, A12: "move it behind /you/concept2"): a dynamic `import()`
// behind a build-time-folded condition, so this card and its distinctive
// `data-c2-link-probe` literal are absent from a production build with the
// flag unset (dist-grep proof:
// `docs/superpowers/plans/2026-09-01-concept2-pr15-walk.md`). It needed a
// TAPPABLE entry point for on-device walks (no address bar on iOS); the
// CONCEPT2 row on You is one, one tap away, and this is where Concept2
// diagnostics live now.
const c2LinkProbeEnabled =
  import.meta.env.DEV || import.meta.env.VITE_ENABLE_C2_LINK_PROBE === "1";
const Concept2LinkProbe = c2LinkProbeEnabled
  ? lazy(() => import("../monitor/Concept2LinkProbe"))
  : null;

/**
 * `/you/concept2` — the screen behind You's CONCEPT2 row (spec
 * 2026-09-04-concept2-walk-fixes §5.1, invariant R5). Diagnostics' shape:
 * `screen overlay-screen`, a BackLink falling back to `/you`, a title. The
 * card is mounted exactly as it was on You (R6 — its markup does not change;
 * `email` is what You passed it).
 *
 * A SCREEN THE ROWER ASKED FOR ALWAYS ANSWERS (R5): chrome renders in EVERY
 * state of THIS hook — before the first read resolves, and on a read that
 * failed (the card draws 1i's own panel and Retry then, retained link or
 * not). It never renders nothing WHILE ITS OWN READ IS THE AUTHORITY. The
 * card runs a second `useConcept2Link` (below) and can go silent
 * (`Concept2Card.tsx`, its `!link.available` return) while this one still
 * holds `null` from a read that failed — the card's Retry re-reads only the
 * card's instance. That window leaves chrome over an empty body with a
 * working BACK; it is pinned by `Concept2Screen.test.tsx`'s disagreement
 * case and ACCEPTED rather than fixed (found at the plan's hardening),
 * because closing it means giving the card a callback (R6 forbids) or
 * lifting its hook out (the 1,000-line card test), for a case that needs the
 * account to lose Concept2 between two reads on one visit.
 *
 * `available: false` — reachable only by a typed URL or a stale history
 * entry, since the row is absent then — returns the rower to `/you` rather
 * than drawing a blank or naming a capability they do not have.
 * THE PREDICATE IS `link !== null && !link.available`, and the shape matters:
 * `link` is `null` until the first read lands, so `!link?.available` or
 * `link === null` would bounce on EVERY mount and make the screen unopenable
 * behind a row that reads as a dead door — RF25/AUD-015's exact shape
 * (`Countdown.tsx` navigating to a Timer that silently bounced to Today).
 * "Still loading" is a third value, not a falsy one.
 *
 * A SECOND `useConcept2Link` INSTANCE, on purpose: the card owns its own
 * (R6 keeps its signature), and nothing else here can observe the card's
 * `null` return. The cost is one extra `GET /api/concept2/link` per screen
 * mount and foreground; the alternative is lifting the hook out of the card
 * and re-plumbing the 1,000-line card test for a screen with one child.
 */
export default function Concept2Screen({ email }: { email: string }) {
  const { link } = useConcept2Link();
  if (link !== null && !link.available) {
    return <Navigate to="/you" replace />;
  }
  return (
    <main className="screen overlay-screen" tabIndex={0}>
      <BackLink fallback="/you" />
      <h1 className="screen-title">Concept2</h1>
      <Concept2Card email={email} />
      {Concept2LinkProbe && (
        <Suspense fallback={null}>
          <Concept2LinkProbe />
        </Suspense>
      )}
    </main>
  );
}
```

- [ ] **Step 4: Register the route and its test**

Apply this patch to `app/src/shell/AppRoutes.tsx` (save it to a file and run `git apply <file>` from `/Users/james/projects/github/jamesawesome/Ergomatic-wt-c2pra` as `git apply --recount <file>` — `--recount` so a fence-trimmed blank context line is not read as drift; apply each block as its OWN file, never several concatenated. If it still does not apply, the tree has drifted from base `e3ce0a03` — stop and report, do not hand-merge):

```diff
diff --git a/app/src/shell/AppRoutes.tsx b/app/src/shell/AppRoutes.tsx
index 5634152a..3d624a54 100644
--- a/app/src/shell/AppRoutes.tsx
+++ b/app/src/shell/AppRoutes.tsx
@@ -32,6 +32,7 @@ import Today from "../today/Today";
 import WorkoutDetail from "../workout/WorkoutDetail";
 import You from "../You";
 import Diagnostics from "../you/Diagnostics";
+import Concept2Screen from "../you/Concept2Screen";
 import MonitorLogs from "../you/MonitorLogs";
 import type { Me } from "../useMe";
 import TabBar from "./TabBar";
@@ -252,6 +253,15 @@ export default function AppRoutes({
                 note as /library/import, /news/releases above), though
                 react-router doesn't require the ordering here either. */}
             <Route path="/you/diagnostics" element={<Diagnostics />} />
+            {/* Wave E PR A (spec 2026-09-04-concept2-walk-fixes §5.1): the
+                Concept2 screen behind You's CONCEPT2 row. Flat, a sibling of
+                /you like /you/diagnostics, and inside this signed-in fragment
+                because the card's identity line needs `user.email`. NOT in
+                HIDDEN_TABBAR_PREFIXES — the tab bar stays, as on Diagnostics. */}
+            <Route
+              path="/you/concept2"
+              element={<Concept2Screen email={user.email} />}
+            />
             <Route
               path="/you/diagnostics/monitor-logs"
               element={<MonitorLogs />}
```

Apply this patch to `app/src/shell/AppRoutes.test.tsx` (save it to a file and run `git apply <file>` from `/Users/james/projects/github/jamesawesome/Ergomatic-wt-c2pra` as `git apply --recount <file>` — `--recount` so a fence-trimmed blank context line is not read as drift; apply each block as its OWN file, never several concatenated. If it still does not apply, the tree has drifted from base `e3ce0a03` — stop and report, do not hand-merge):

```diff
diff --git a/app/src/shell/AppRoutes.test.tsx b/app/src/shell/AppRoutes.test.tsx
index b7ad7f1d..89aa65ab 100644
--- a/app/src/shell/AppRoutes.test.tsx
+++ b/app/src/shell/AppRoutes.test.tsx
@@ -30,6 +30,9 @@ vi.mock("../session/Timer", () => ({
 vi.mock("../session/LogSession", () => ({
   default: () => <h1>Log Session</h1>,
 }));
+vi.mock("../you/Concept2Screen", () => ({
+  default: () => <h1>Concept2 screen stub</h1>,
+}));
 vi.mock("../monitor/JustRowObserver", () => ({
   default: () => <h1>Just Row Observer</h1>,
 }));
@@ -291,6 +294,21 @@ describe("AppRoutes", () => {
     ).toBeVisible();
   });
 
+  // Wave E PR A: the Concept2 screen behind You's CONCEPT2 row, behind the
+  // same signed-in guard. The screen itself is stubbed — its own file tests
+  // its states; this pins only that the route exists and is signed-in only.
+  it("routes /you/concept2 when signed in", async () => {
+    const user = { id: "u1", email: "a@x.com", name: "Ada Rower" };
+    render(
+      <MemoryRouter initialEntries={["/you/concept2"]}>
+        <AppRoutes user={user} onSignedOut={() => {}} />
+      </MemoryRouter>,
+    );
+    expect(
+      await screen.findByRole("heading", { name: "Concept2 screen stub" }),
+    ).toBeVisible();
+  });
+
   // James's 2026-08-23 ruling removed /you/learning (LearningTheApp) —
   // an old bookmark or stale client lands on the signed-in wildcard and
   // resolves to Today rather than 404ing.
```

- [ ] **Step 5: Run — expect `6 passed` (screen) and the AppRoutes file green**, then the gates.

```
cd /Users/james/projects/github/jamesawesome/Ergomatic-wt-c2pra/app
NODE_OPTIONS=--no-experimental-webstorage pnpm exec vitest run --project client src/you/Concept2Screen.test.tsx src/shell/AppRoutes.test.tsx
```
(`NODE_OPTIONS` is not optional — CLAUDE.md's vitest footgun: without it Node 26's webStorage global collides with jsdom's `localStorage` and every storage test in this plan fails falsely.)

```
cd /Users/james/projects/github/jamesawesome/Ergomatic-wt-c2pra/app
pnpm typecheck
pnpm lint
pnpm format:check
```

- [ ] **Step 6: Commit BEFORE mutating**

```
cd /Users/james/projects/github/jamesawesome/Ergomatic-wt-c2pra
git rev-parse --show-toplevel   # MUST print this worktree's path
git add app/src/you/Concept2Screen.tsx app/src/you/Concept2Screen.test.tsx app/src/shell/AppRoutes.tsx app/src/shell/AppRoutes.test.tsx
git commit -m "PR A Task 3: /you/concept2 — the screen behind the row; the probe moves"
```

- [ ] **Step 7: Mutations (R5, both — one cannot catch the defect that matters).** Measured:

| # | mutation | measured failure |
| --- | --- | --- |
| R5(i) | `Concept2Screen.tsx`: delete the three-line `if (link !== null && !link.available) { return <Navigate … /> }` block | `1 failed`: "returns the rower to /you when a SUCCESSFUL read says the surface is unavailable…" — `Unable to find an element with the text: YOU SCREEN at /you` |
| R5(ii) | same file: `if (link !== null && !link.available) {` → `if (link === null \|\| !link.available) {` (AUD-015's shape) | `5 failed`, not 4: pending, read-failed, mounts-the-card, BACK, and the disagreement case (which TIMES OUT rather than failing an assertion) — `Unable to find an accessible element with the role "heading" and name "Concept2"` on the first four — the screen bounced on every mount, which is exactly the unopenable-door defect |
| R5(iii) | same file: destructure `failed` and widen to `if ((link !== null && !link.available) \|\| failed !== null) {` (redirect on a FAILED read) | `2 failed`: the disagreement case — `Unable to find an accessible element with the role "heading" and name "Concept2"` — and the read-failed case — `Unable to find an element with the text: COULDN'T READ CONCEPT2`. (Against the count-gated first draft of the disagreement case this mutant was GREEN, which is why the case resolves both reads deterministically before asserting.) |

---

## Task 4: You — the card becomes the row; the doors group; sign-out clears `seen`

**Files:**
- Modify: `app/src/You.tsx` (replace the whole file — below)
- Modify: `app/src/index.css` (`.diag-row` loses its `margin-top`; `.you-screen .diag-row { margin-top: auto }` and its M-3 comment are REPLACED by `.you-doors` + `.diag-row-end`; `.c2-card` loses `margin: 12px 0 0` and its comment paragraph is rewritten)
- Modify: `app/src/you/Concept2Card.tsx` (TWO comments only — I2 names the screen not You; the `failed`-wins comment gains the row's departure. `git diff --stat` must show comment lines only; `Concept2Card.test.tsx` untouched)
- Modify: `app/src/You.test.tsx` (the probe mock goes — You no longer imports the probe; the three card cases become four row cases)

**Interfaces:**
- Consumes: `Concept2Row({ accountId })` (Task 2), `clearConcept2Seen` (Task 1).
- Produces: You's foot is `<nav className="you-doors" aria-label="More">` holding `<Concept2Row accountId={user.id} />` then the DIAGNOSTICS `<Link className="diag-row">`.

- [ ] **Step 1: Write the failing tests** (the You.test patch — apply it first; the new cases fail against the card-bearing You)

Apply this patch to `app/src/You.test.tsx` (save it to a file and run `git apply <file>` from `/Users/james/projects/github/jamesawesome/Ergomatic-wt-c2pra` as `git apply --recount <file>` — `--recount` so a fence-trimmed blank context line is not read as drift; apply each block as its OWN file, never several concatenated. If it still does not apply, the tree has drifted from base `e3ce0a03` — stop and report, do not hand-merge):

```diff
diff --git a/app/src/You.test.tsx b/app/src/You.test.tsx
index 274dd475..829ce4ca 100644
--- a/app/src/You.test.tsx
+++ b/app/src/You.test.tsx
@@ -5,16 +5,8 @@ import { MemoryRouter } from "react-router-dom";
 import You from "./You";
 import { api } from "./api";
 
-// Fix round 2 (P1a-device): same idiom `AppRoutes.test.tsx` already uses
-// for `JustRowObserver` — `import.meta.env.DEV` is `true` under Vitest, so
-// You's own conditional `lazy()` import would otherwise really resolve
-// this dev-only card in every test here. It has its own dedicated test
-// file (`monitor/Concept2LinkProbe.test.tsx`); no test in this file cares
-// about its content.
-vi.mock("./monitor/Concept2LinkProbe", () => ({ default: () => null }));
-
-// Wave E PR2 Task 8: You now mounts the PRODUCT Concept2 card, whose hook
-// reads `GET /api/concept2/link` on every mount. That read has to be
+// Wave E PR2 Task 8 (card), PR A (row): You mounts the Concept2 ROW, whose
+// hook reads `GET /api/concept2/link` on every mount. That read has to be
 // answered for the WHOLE FILE, not only in the new cases — before this
 // mock every test here ran the read through the real `src/api.ts`, whose
 // relative-URL `fetch` rejects under jsdom, and the rejection landed after
@@ -37,13 +29,16 @@ vi.mock("./monitor/Concept2LinkProbe", () => ({ default: () => null }));
 // `vi.hoisted` because `vi.mock`'s factory is hoisted above ordinary
 // declarations: a plain `const` referenced inside it throws "Cannot access
 // before initialization".
-const c2Link = vi.hoisted(() => ({ body: { available: false } as unknown }));
+const c2Link = vi.hoisted(() => ({
+  body: { available: false } as unknown,
+  status: 200,
+}));
 
 vi.mock("./api", () => ({
   api: vi.fn(async (path: string, init?: RequestInit) =>
     path === "/api/concept2/link"
       ? new Response(JSON.stringify(c2Link.body), {
-          status: 200,
+          status: c2Link.status,
           headers: { "Content-Type": "application/json" },
         })
       : fetch(path, init),
@@ -52,6 +47,7 @@ vi.mock("./api", () => ({
 
 beforeEach(() => {
   c2Link.body = { available: false };
+  c2Link.status = 200;
   vi.mocked(api).mockClear();
 });
 
@@ -67,6 +63,12 @@ afterEach(() => {
   vi.unstubAllGlobals();
   vi.resetModules();
   vi.doUnmock("./adapters/auth");
+  // Wave E PR A: the row writes `ergomatic.concept2Seen.<id>` on every
+  // successful read (`you/concept2Seen.ts`). `src/test/setup.ts` clears no
+  // storage, so without this the I-D case would inherit a `u1` key minted
+  // two tests earlier and its "MINTED by this mount" precondition would be
+  // satisfied by leakage (found at the plan's hardening).
+  localStorage.clear();
 });
 
 describe("You", () => {
@@ -180,55 +182,98 @@ describe("You", () => {
   });
 });
 
-describe("You: the Concept2 card", () => {
+describe("You: the Concept2 row (Wave E PR A, spec §5.1)", () => {
   const user = { id: "u1", email: "a@x.com", name: "Ada Rower" };
 
-  it("renders the Concept2 card between the baseline reset and the diagnostics row", async () => {
-    // DOCUMENT ORDER, not presence: the DIAGNOSTICS row's own comment
-    // requires it stay the LAST child, and presence alone would pass with
-    // the card sitting below it.
+  it("renders the CONCEPT2 row ABOVE the DIAGNOSTICS row, both inside one doors group (R7, ruling 7)", async () => {
+    // DOCUMENT ORDER, not presence: ruling 7 puts CONCEPT2 first and keeps
+    // DIAGNOSTICS You's last child; presence alone would pass either order.
     c2Link.body = { available: true, linked: false };
     renderYou(user);
-    const card = await screen.findByRole("region", { name: "CONCEPT2" });
-    const reset = screen.getByRole("button", { name: /Reset baseline setup/i });
+    const row = await screen.findByRole("link", { name: /CONCEPT2/ });
     const diagnostics = screen.getByRole("link", { name: /DIAGNOSTICS/ });
+    const reset = screen.getByRole("button", { name: /Reset baseline setup/i });
     const following = Node.DOCUMENT_POSITION_FOLLOWING;
-    expect(reset.compareDocumentPosition(card) & following).toBeTruthy();
-    expect(card.compareDocumentPosition(diagnostics) & following).toBeTruthy();
+    expect(reset.compareDocumentPosition(row) & following).toBeTruthy();
+    expect(row.compareDocumentPosition(diagnostics) & following).toBeTruthy();
+    const group = screen.getByRole("navigation", { name: "More" });
+    expect(group).toContainElement(row);
+    expect(group).toContainElement(diagnostics);
+    expect(row).toHaveAttribute("href", "/you/concept2");
+    expect(screen.getByText("NOT LINKED")).toBeInTheDocument();
   });
 
-  it("passes the signed-in rower's own email to the card, so the identity line names both principals", async () => {
-    // Gate 0 amendment 1c. The card cannot fetch this: `Me` is You's prop,
-    // and the whole point of the line is that it names BOTH principals.
-    c2Link.body = {
-      available: true,
-      linked: true,
-      c2UserId: 2211,
-      c2Username: "jamesawesome",
-      needsReauth: false,
-      logbookBaseUrl: "https://log-dev.concept2.com",
-    };
-    renderYou({ id: "u1", email: "james@jamestheaweso.me", name: "James A" });
-    expect(
-      await screen.findByText(
-        "Concept2 jamesawesome · Ergomatic james@jamestheaweso.me",
-      ),
-    ).toBeTruthy();
+  it("renders NO card on You any more — the card lives behind the row (R10)", async () => {
+    c2Link.body = { available: true, linked: false };
+    renderYou(user);
+    await screen.findByRole("link", { name: /CONCEPT2/ });
+    expect(screen.queryByRole("region", { name: "CONCEPT2" })).toBeNull();
+    expect(screen.queryByText("CONNECT TO CONCEPT2")).toBeNull();
   });
 
-  it("renders no Concept2 card at all when the server reports the surface unavailable", async () => {
-    // The whole-screen half of Concept2Card's own unit case: You itself
-    // must not reserve space, add a heading, or draw a hairline for an
-    // absent card. Awaiting POSITIVE observables first — a section of You
-    // that is always there, and the card's own mount read — so the absence
-    // is asserted against a settled screen rather than one that has not
-    // rendered yet.
+  it("renders no Concept2 row at all when the server reports the surface unavailable", async () => {
+    // Awaiting POSITIVE observables first — a section of You that is always
+    // there, and the row's own mount read — so the absence is asserted
+    // against a settled screen rather than one that has not rendered yet.
     renderYou(user);
     expect(await screen.findByText("BASELINES")).toBeTruthy();
     await waitFor(() =>
       expect(vi.mocked(api)).toHaveBeenCalledWith("/api/concept2/link"),
     );
-    expect(screen.queryByRole("region", { name: "CONCEPT2" })).toBeNull();
-    expect(screen.queryByText("CONNECT TO CONCEPT2")).toBeNull();
+    expect(screen.queryByRole("link", { name: /CONCEPT2/ })).toBeNull();
+    expect(screen.queryByText("CONCEPT2")).toBeNull();
+    // The doors group is then the lone DIAGNOSTICS row, drawn as before.
+    expect(screen.getByRole("link", { name: /DIAGNOSTICS/ })).toBeVisible();
+  });
+
+  it("I-D: signing out clears this account's persisted Concept2 'seen' fact before notifying", async () => {
+    // The row's OWN mount read must say available:true here, so the fact is
+    // MINTED by this mount (I-B) and can only be gone afterwards because
+    // sign-out cleared it. With the default `{available:false}` answer the
+    // row itself clears the key (I-C) and this test cannot tell the two
+    // clears apart — measured: with the sign-out clear deleted, that
+    // version stayed green.
+    localStorage.setItem("ergomatic.concept2Seen.u2", "1");
+    c2Link.body = { available: true, linked: false };
+    vi.stubGlobal(
+      "fetch",
+      vi.fn(async () => new Response(null, { status: 204 })),
+    );
+    const onSignedOut = vi.fn();
+    const first = render(
+      <MemoryRouter>
+        <You user={user} onSignedOut={onSignedOut} />
+      </MemoryRouter>,
+    );
+    await screen.findByRole("link", { name: /CONCEPT2/ });
+    await waitFor(() =>
+      expect(localStorage.getItem("ergomatic.concept2Seen.u1")).toBe("1"),
+    );
+    await userEvent.click(screen.getByRole("button", { name: "Sign out" }));
+    await waitFor(() => expect(onSignedOut).toHaveBeenCalled());
+    expect(localStorage.getItem("ergomatic.concept2Seen.u1")).toBeNull();
+    // Another account's fact on the same device is not this sign-out's to
+    // clear (I-A keeps them apart; I-D clears the one signing out).
+    expect(localStorage.getItem("ergomatic.concept2Seen.u2")).toBe("1");
+
+    // THE SEAM, not just the write (RF24): a fresh mount for the SAME
+    // account whose read now fails must draw nothing (cell 2a) rather than
+    // inheriting the door the pre-sign-out mint would have given it. The
+    // signed-out You is unmounted first — the app does the same (App.tsx
+    // swaps to SignIn) — so the row found below can only be the new mount's.
+    first.unmount();
+    c2Link.body = { error: "upstream" };
+    c2Link.status = 502;
+    vi.mocked(api).mockClear();
+    render(
+      <MemoryRouter>
+        <You user={user} onSignedOut={() => {}} />
+      </MemoryRouter>,
+    );
+    await waitFor(() =>
+      expect(vi.mocked(api)).toHaveBeenCalledWith("/api/concept2/link"),
+    );
+    await new Promise((r) => setTimeout(r, 0));
+    expect(screen.queryByRole("link", { name: /CONCEPT2/ })).toBeNull();
   });
 });
```

- [ ] **Step 2: Run — expect THREE of the four "You: the Concept2 row" cases to FAIL** (the unavailable case is green on both the old card-bearing shape and the new row shape — it asserts an absence, and both shapes agree there is nothing to find)

```
cd /Users/james/projects/github/jamesawesome/Ergomatic-wt-c2pra/app
NODE_OPTIONS=--no-experimental-webstorage pnpm exec vitest run --project client src/You.test.tsx
```
(`NODE_OPTIONS` is not optional — CLAUDE.md's vitest footgun: without it Node 26's webStorage global collides with jsdom's `localStorage` and every storage test in this plan fails falsely.)

- [ ] **Step 3: Replace `app/src/You.tsx` with exactly this**

```tsx
import { useState } from "react";
import { Link } from "react-router-dom";
import type { Me } from "./useMe";
import { signOut as authSignOut } from "./adapters/auth";
import BaselineEditor from "./you/BaselineEditor";
import { clearConcept2Seen } from "./you/concept2Seen";
import Concept2Row from "./you/Concept2Row";
import ResetBaselineSetup from "./you/ResetBaselineSetup";
import RetestShortcut from "./you/RetestShortcut";

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
}

export default function You({
  user,
  onSignedOut,
}: {
  user: Me;
  onSignedOut: () => void;
}) {
  // Phase BL PR C: bumped by Reset baseline setup's successful clear —
  // remounts BaselineEditor (key below) so its draft re-seeds from the
  // now-empty server state instead of keeping the cleared numbers on
  // screen as if they still existed.
  const [resetGeneration, setResetGeneration] = useState(0);

  return (
    // M-3 (final whole-branch review): `you-screen` pairs with the
    // `.you-screen` CSS rule (index.css, Task 3's own comment block) that
    // pins the DIAGNOSTICS row below to the bottom of this screen, matching
    // the approved gate artifact — `.screen` itself is untouched, so no
    // other route's layout changes.
    <main className="screen you-screen">
      <section className="you">
        <div className="avatar" aria-hidden="true">
          {initials(user.name)}
        </div>
        {/* NAMED so it can carry `min-width: 0`. A flex child's default
            `min-width: auto` refuses to shrink below its content, so a long
            address used to push this block a whole line taller — see
            `.you-identity` in index.css. */}
        <div className="you-identity">
          <p className="you-name">{user.name}</p>
          <p className="you-email">{user.email}</p>
        </div>
        <button
          className="button-outline"
          onClick={async () => {
            // I-D (spec 2026-09-04-concept2-walk-fixes §5.1): the Concept2
            // row's persisted "this account has been told" fact must not
            // outlive the account on this device. Cleared BEFORE the
            // adapter's sign-out so a failed sign-out cannot leave it
            // behind either.
            clearConcept2Seen(user.id);
            await authSignOut();
            onSignedOut();
          }}
        >
          Sign out
        </button>
      </section>
      <h2 className="section-heading">BASELINES</h2>
      <BaselineEditor key={resetGeneration} />
      {/* Phase BL PR B, reshaped by James's tester feedback (2026-08-22):
          row the 6k / race the 2k, one tap from the numbers to each
          designated test's DETAIL screen (Connect / Start Timer / Log it
          after) — the shortcut's own doc comment (you/RetestShortcut.tsx)
          covers identity, the from:"/you" back chain, and where the
          start guards live now. */}
      <RetestShortcut />
      {/* Phase BL PR C: the staged-confirm Reset baseline setup — the
          product answer to "the doors are unreachable once set" (spec rev
          2's Reset onboarding ruling). Sits with the BASELINES section it
          destroys, below the shortcut. */}
      <ResetBaselineSetup onReset={() => setResetGeneration((g) => g + 1)} />
      {/* No SETTINGS section: the mock's settings rows (PRE-WORKOUT
          COUNTDOWN, PACE TOLERANCE, ACCENT COLOR) are filler
          (DEVIATIONS.md/handoff README §7) and are deliberately not
          built; the two rows that WERE real are both since removed —
          WARM-UP by Phase WU (2026-08-21), and "Learning the app" by
          James's 2026-08-23 ruling (the teaching lives in News's pinned
          articles alone now). */}
      {/* THE DOORS (Wave E PR A, spec 2026-09-04-concept2-walk-fixes §5.1,
          Gate 0 amendment §8 approved 2026-09-04): the foot of You is one
          GROUP of two quiet mono rows, pinned to the bottom by ONE
          `margin-top: auto` on this wrapper (`.you-doors`, index.css) —
          invariant R7; two rows each carrying their own auto margin would
          be a flex free-space split, not a second row under the first.
          ORDER RULED (ruling 7): CONCEPT2 ABOVE DIAGNOSTICS, which keeps
          the DIAGNOSTICS row You's last child.

          CONCEPT2: the row replaces the card that stood here (PR2's
          Surface 1). It renders NOTHING unless a successful read has said
          `available: true` for this account — today's capability gate,
          plus ruling 6's persisted `seen` fact for the failed-read cell
          (`you/Concept2Row.tsx` carries the decision table). Everything
          the card did lives behind it at `/you/concept2`
          (`you/Concept2Screen.tsx`), including the dev-only link probe
          that used to sit between the card and this row. James's
          2026-09-04 "AS SHIPPED" position ruling was made on captures of
          the CARD beside RESET BASELINE SETUP; it does not transfer to
          this adjacency, which Gate 0 §8.2/8.4 drew and approved instead.

          DIAGNOSTICS (Task 3, Gate 0 rev 2/3, 2026-09-01): one quiet mono
          row, at the bottom of You, on purpose — the diagnostics ring is
          not a product feature a rower reaches for, it's a tool for the
          rare "something went wrong" moment. Opens the menu screen
          (`you/Diagnostics.tsx`), not Monitor logs directly — the menu is
          the extensible home for whatever diagnostic tools follow.
          `state={{ from: "/you" }}`: the same origin idiom RetestShortcut
          above uses, so the menu's own BackLink returns HERE. Stays the
          LAST child of You. */}
      <nav className="you-doors" aria-label="More">
        <Concept2Row accountId={user.id} />
        <Link
          to="/you/diagnostics"
          state={{ from: "/you" }}
          className="diag-row"
        >
          <span>DIAGNOSTICS</span>
          <span aria-hidden="true">&rsaquo;</span>
        </Link>
      </nav>
    </main>
  );
}
```

- [ ] **Step 4: CSS and the card's two comments**

Apply this patch to `app/src/index.css` (save it to a file and run `git apply <file>` from `/Users/james/projects/github/jamesawesome/Ergomatic-wt-c2pra` as `git apply --recount <file>` — `--recount` so a fence-trimmed blank context line is not read as drift; apply each block as its OWN file, never several concatenated. If it still does not apply, the tree has drifted from base `e3ce0a03` — stop and report, do not hand-merge):

```diff
diff --git a/app/src/index.css b/app/src/index.css
index ea4bd86b..78e15aae 100644
--- a/app/src/index.css
+++ b/app/src/index.css
@@ -10018,7 +10018,6 @@ section:not(.news-pinned) .news-row:last-of-type {
 }
 
 .diag-row {
-  margin-top: 12px;
   display: flex;
   align-items: center;
   justify-content: space-between;
@@ -10033,18 +10032,38 @@ section:not(.news-pinned) .news-row:last-of-type {
   text-decoration: none;
 }
 
-/* M-3: pins the row above — `.diag-row` is used ONLY on the You screen
-   (grep confirmed, single JSX site), so this lives on the row's own rule
-   rather than a separate wrapper div; `margin-top: auto` on a flex-column
-   item pushes it to the end of the main axis, absorbing whatever space
-   `.you-screen`'s min-height leaves above it (the short-content case the
-   gate artifact shows). Overrides the plain `12px` `margin-top` above via
-   specificity, in EVERY case, not conditionally — when BASELINES content
-   already fills or exceeds that min-height, a flex `auto` margin resolves
-   to `0`, not back to `12px`; the row's own `border-top` still supplies
-   the visual separation in that case, so nothing collapses illegibly. */
-.you-screen .diag-row {
+/* THE DOORS GROUP (Wave E PR A, spec 2026-09-04-concept2-walk-fixes §5.1
+   R7; Gate 0 amendment §8.2/8.4). Two `.diag-row`s — CONCEPT2 above
+   DIAGNOSTICS — sit at the foot of You inside ONE wrapper, and the wrapper
+   carries the ONE `margin-top: auto` that pins the group to the bottom of
+   `.you-screen`'s flex column. This used to live on `.diag-row` itself
+   (`.you-screen .diag-row { margin-top: auto }`, "single JSX site, grep
+   confirmed"); with two rows that rule would have given EACH row an auto
+   margin, and CSS Flexbox §8.1 splits positive free space equally between
+   auto margins on the main axis — two rows floating apart, not a second row
+   under the first. `auto` resolves to 0 when BASELINES content already fills
+   the column, exactly as before; each row's own `border-top` is then the
+   only separation, on purpose (the rows carry no `margin-top` of their own
+   any more — the 12px `.diag-row` used to declare was overridden to `auto`
+   at its only site, so it never painted). The CONCEPT2 row is absent on any
+   deployment or account without Concept2, and the group is then one row,
+   drawn exactly as the lone DIAGNOSTICS row was. */
+.you-doors {
   margin-top: auto;
+  display: flex;
+  flex-direction: column;
+}
+
+/* The CONCEPT2 row's right-hand side: the state line (one of the four
+   strings the card already renders — `you/Concept2Row.tsx`) and the
+   chevron. `--ink-3` on `--page` = 6.69:1 for all four values (Gate 0
+   §8.1's optional `--ink`/600 distinction for RECONNECT NEEDED was drawn
+   and NOT adopted: the word is the distinction). 12px gap matches the
+   approved frames' `.door-right`. */
+.diag-row-end {
+  display: flex;
+  align-items: center;
+  gap: 12px;
 }
 
 .diag-caption {
@@ -10157,37 +10176,24 @@ section:not(.news-pinned) .news-row:last-of-type {
    therefore --ink-3, not the --ink-4 every other muted line on this card
    uses. Anything added to .c2-card-panel later inherits that constraint.
 
-   `margin: 12px 0 0` — TASK 8, and both authorities name the same number,
-   which is what makes it an implementer's call rather than a Gate 0 one
-   (the sibling `.c2-send` block had to send its 12-vs-24 question to
-   James, because there the frames said 12 and the screen's own rhythm
-   said 20/24). The amendment's in-situ frames separate every child of the
-   phone frame by `.frame { gap: 12px }`, AND every block on the real You
-   screen already stands off its neighbour by 12: `.baselines-card`,
-   `.retest`, `.reset-baselines` and `.diag-row` are each
-   `margin-top: 12px`.
-
-   The rule exists because it was MISSING and nothing could say so. This
-   card declared no margin; its preceding sibling on You,
-   `.reset-baselines`, is `margin-top: 12px` with no bottom; `.you-screen`
-   is a flex column, so no neighbour's margin collapses in either.
-   Measured in the real engine before the fix: `reset -> card = 0`. A
-   bordered card touched the Reset baseline setup button. That is the
-   `.c2-send` defect one screen over — every other gate on this card
-   measures boxes INSIDE it, so nothing measured the card's own — and
-   `e2e/design.spec.ts`'s "the card stands off the row above it on You" is
-   the assertion that closes it.
-
-   Bottom stays 0 on purpose: `.you-screen .diag-row` below is
-   `margin-top: auto`, so a bottom margin here would be absorbed by that
-   `auto` rather than seen, and when the column overflows (no `auto` room
-   left) the row's own `border-top` is what separates them. */
+   NO `margin-top` OF ITS OWN any more (Wave E PR A, spec
+   2026-09-04-concept2-walk-fixes §5.1). Task 8 gave this card `margin: 12px
+   0 0` on You, where it stood under RESET BASELINE SETUP and measured
+   `reset -> card = 0` without it. PR A moved the card to `/you/concept2`,
+   where its only neighbour above is the `.screen-title` h1, whose
+   browser-default bottom margin (0.67em of 31px ≈ 21px) collapses with any
+   top margin here in block flow (`.overlay-screen` is not a flex column) —
+   so a 12px here painted NOTHING and could not be gated (a mutation deleting
+   it left every measurement identical). The stand-off on the screen is the
+   h1's own, and `e2e/design.spec.ts`'s "the card stands off the title above
+   it on the Concept2 screen" measures it there. Bottom stays 0: the next
+   sibling is the dev-only link probe or nothing, and `.overlay-screen` pads
+   for the tab bar. */
 .c2-card {
   background: var(--surface);
   border: 1px solid var(--rule);
   border-radius: var(--radius);
   padding: 16px;
-  margin: 12px 0 0;
   display: flex;
   flex-direction: column;
   gap: 12px;
```

Apply this patch to `app/src/you/Concept2Card.tsx` (save it to a file and run `git apply <file>` from `/Users/james/projects/github/jamesawesome/Ergomatic-wt-c2pra` as `git apply --recount <file>` — `--recount` so a fence-trimmed blank context line is not read as drift; apply each block as its OWN file, never several concatenated. If it still does not apply, the tree has drifted from base `e3ce0a03` — stop and report, do not hand-merge):

```diff
diff --git a/app/src/you/Concept2Card.tsx b/app/src/you/Concept2Card.tsx
index ff5d95f0..ba9278e9 100644
--- a/app/src/you/Concept2Card.tsx
+++ b/app/src/you/Concept2Card.tsx
@@ -100,8 +100,11 @@ export default function Concept2Card({ email }: { email: string }) {
   }, []);
 
   // Invariant I2 (plan's lifetime table): the arm can never survive
-  // leaving You. Returning `disarm` as the effect's cleanup is what
-  // guarantees it, including for the timer.
+  // leaving the screen it was made on — `/you/concept2` since PR A (spec
+  // 2026-09-04-concept2-walk-fixes §5.1 R9; it used to say You, where the
+  // card lived). Returning `disarm` as the effect's cleanup is what
+  // guarantees it, including for the timer: a route change unmounts the
+  // card exactly as leaving You did.
   useEffect(() => disarm, [disarm]);
 
   // Invariant I5's OTHER half. `useConcept2Link` re-reads the link on a
@@ -217,6 +220,14 @@ export default function Concept2Card({ email }: { email: string }) {
   // that was fine a moment ago. The cost is one transient panel; the
   // alternative is a link state nobody observed staying on screen, and the
   // panel carries a Retry that fixes it in one tap.
+  //
+  // THE ROW ON YOU RULES THE OTHER WAY, and the departure is deliberate
+  // (spec 2026-09-04-concept2-walk-fixes §5.1, ruling 5; `you/Concept2Row.tsx`
+  // carries the table): the row has NO Retry — its only affordance is the
+  // tap into this screen — so a sticky, server-set `needsReauth` is not
+  // overwritten there by a transient read failure. The last clause above
+  // ("the panel carries a Retry") is exactly what makes THIS ordering cheap
+  // and what does not transfer to a one-line row.
   if (failed !== null) {
     return (
       <section className="c2-card" aria-labelledby="c2-card-label">
```

- [ ] **Step 5: Run You + the card's own suite (untouched under R6, must stay green) + the full unit/client run**, then the gates.

```
cd /Users/james/projects/github/jamesawesome/Ergomatic-wt-c2pra/app
NODE_OPTIONS=--no-experimental-webstorage pnpm exec vitest run --project client src/You.test.tsx src/you/Concept2Card.test.tsx
```
(`NODE_OPTIONS` is not optional — CLAUDE.md's vitest footgun: without it Node 26's webStorage global collides with jsdom's `localStorage` and every storage test in this plan fails falsely.)

```
cd /Users/james/projects/github/jamesawesome/Ergomatic-wt-c2pra/app
pnpm test --project unit --project client
```
Expected: `Test Files 242 passed`, `Tests 7016 passed | 1 skipped` (measured at the author's paste-test; a different count is reported, not smoothed over).

```
cd /Users/james/projects/github/jamesawesome/Ergomatic-wt-c2pra/app
pnpm typecheck
pnpm lint
pnpm format:check
```

- [ ] **Step 6: The R10 / R6 greps, output pasted into your report:**

```
cd /Users/james/projects/github/jamesawesome/Ergomatic-wt-c2pra
grep -n 'Concept2Card' app/src/You.tsx                      # expect NO output (was 2)
grep -rn 'className="diag-row"' app/src --include='*.tsx' | grep -v '\.test\.'   # expect exactly 2 lines: You.tsx (DIAGNOSTICS) and you/Concept2Row.tsx (CONCEPT2) — the bare word `diag-row` also matches `diag-row-end`/`-state` and comments, 4 lines
grep -rln 'concept2Seen' app/src | grep -v '\.test\.' | sort   # expect exactly 3 files: src/You.tsx (the sign-out clear), src/you/Concept2Row.tsx (read + write), src/you/concept2Seen.ts (the module). A fourth is a second consumer of a fact whose lifetime table assumes one — stop and re-run the table before adding it
git diff --stat HEAD~0 -- app/src/you/Concept2Card.tsx        # comment-only; confirm no JSX line changed: git diff HEAD -- app/src/you/Concept2Card.tsx | grep '^[-+]' | grep -v '^[-+] *//' | grep -v '^[-+][-+]'  → expect NO output
```
- [ ] **Step 7: Commit BEFORE mutating**

```
cd /Users/james/projects/github/jamesawesome/Ergomatic-wt-c2pra
git rev-parse --show-toplevel   # MUST print this worktree's path
git add app/src/You.tsx app/src/You.test.tsx app/src/index.css app/src/you/Concept2Card.tsx
git commit -m "PR A Task 4: You carries the CONCEPT2 row in a doors group; sign-out clears seen"
```

- [ ] **Step 8: Mutations.** Measured:

| # | mutation | measured failure |
| --- | --- | --- |
| R11(b) I-D | `You.tsx`: delete the line `clearConcept2Seen(user.id);` | `1 failed`: "I-D: signing out clears this account's persisted Concept2 'seen' fact before notifying" — `AssertionError: expected '1' to be null`. **Note the test's own precondition:** the row's mount read must answer `available: true` so the fact is MINTED by this mount; with the default `{available:false}` the ROW clears the key (I-C) and this mutation survived — measured, and the test comment records it. |
| R7 order | `You.tsx`: move `<Concept2Row accountId={user.id} />` BELOW the DIAGNOSTICS `<Link>` inside `.you-doors` | `1 failed`: "renders the CONCEPT2 row ABOVE the DIAGNOSTICS row…" — `AssertionError: expected +0 to be truthy` |

---

## Task 5: e2e — the row and screen suite, the sentinel, the captures

**Files:**
- Modify: `app/e2e/concept2.spec.ts` (`openYou` sentinel REPLACED; new `openConcept2Screen(page, fake)`; the five card tests enter through it; the dark test gains the row negative; a new `test.describe("Concept2 row on You (Wave E PR A)")` with five tests)
- Modify: `app/e2e/screenshots.spec.ts` (`openC2You` sentinel; new `openC2Screen`; five You captures re-shot as row states — `unlinked`, `linked`, NEW `reconnect`, `read-failed` (one good read then 502), `landscape` — plus five NEW `concept2-screen-*` captures; `you-concept2-armed.png` is superseded by `concept2-screen-armed.png`)
- Delete: `docs/screenshots/you-concept2-armed.png` (`git rm`); the five re-shot PNGs and five new PNGs land in `docs/screenshots/`

- [ ] **Step 1: Apply both patches**

Apply this patch to `app/e2e/concept2.spec.ts` (save it to a file and run `git apply <file>` from `/Users/james/projects/github/jamesawesome/Ergomatic-wt-c2pra` as `git apply --recount <file>` — `--recount` so a fence-trimmed blank context line is not read as drift; apply each block as its OWN file, never several concatenated. If it still does not apply, the tree has drifted from base `e3ce0a03` — stop and report, do not hand-merge):

```diff
diff --git a/app/e2e/concept2.spec.ts b/app/e2e/concept2.spec.ts
index 18a9c022..40f5c272 100644
--- a/app/e2e/concept2.spec.ts
+++ b/app/e2e/concept2.spec.ts
@@ -302,12 +302,34 @@ async function openLogDetail(page: Page, title: string): Promise<void> {
   await expect(page.getByRole("heading", { name: title })).toBeVisible();
 }
 
-/** You is rendered when its LAST child is on screen: the DIAGNOSTICS row is
- *  `You.tsx`'s own final element and its comment requires it stay there. A
- *  negative assertion about the card is worthless until this has passed. */
+/** You is rendered when its own container and a control that is ALWAYS on it
+ *  are on screen. Wave E PR A (spec 2026-09-04-concept2-walk-fixes §6.1, A3):
+ *  this used to be `.diag-row` — "You's LAST child" — and PR A put a second
+ *  `.diag-row` (the CONCEPT2 door) on You, which makes that locator a
+ *  Playwright strict-mode violation. Scoping it (`.nth(0)`, a text filter)
+ *  would fix strict mode and leave the third door to break it again, so the
+ *  sentinel moved to observables that do not depend on which feature rows
+ *  exist. A negative assertion about the Concept2 ROW is still worthless
+ *  until `fake.linkReads` has moved — the row is async and this sentinel is
+ *  not (RF21). */
 async function openYou(page: Page): Promise<void> {
   await page.goto("/you");
-  await expect(page.locator(".diag-row")).toBeVisible();
+  await expect(page.locator("main.you-screen")).toBeVisible();
+  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
+}
+
+/** The Concept2 SCREEN, entered the way a rower does — through the row on
+ *  You — so the door under test is the one the row actually opens. The row
+ *  exists only after a successful `available: true` read, so the poll on
+ *  `fake.linkReads` is a precondition, not a readiness nicety. */
+async function openConcept2Screen(page: Page, fake: C2Fake): Promise<void> {
+  await openYou(page);
+  await expect.poll(() => fake.linkReads).toBeGreaterThan(0);
+  await page.getByRole("link", { name: /CONCEPT2/ }).click();
+  await expect(page).toHaveURL(/\/you\/concept2$/);
+  await expect(
+    page.getByRole("heading", { name: "Concept2", exact: true }),
+  ).toBeVisible();
 }
 
 async function signIn(page: Page, slug: string): Promise<C2Fake> {
@@ -336,6 +358,9 @@ test.describe("Concept2 link and send, in a real browser", () => {
     await openYou(page);
     await expect.poll(() => fake.linkReads).toBeGreaterThan(0);
     await expect(page.locator(".c2-card")).toHaveCount(0);
+    // PR A: the ROW is the You surface now, and it is absent for the same
+    // reason the card was — `getByText("CONCEPT2")` covers its label too.
+    await expect(page.getByRole("link", { name: /CONCEPT2/ })).toHaveCount(0);
     await expect(page.getByText("CONCEPT2")).toHaveCount(0);
 
     const readsBefore = fake.linkReads;
@@ -358,7 +383,7 @@ test.describe("Concept2 link and send, in a real browser", () => {
       body: { authorizeUrl: "/api/concept2/callback?stub=1", state: "s" },
     };
 
-    await openYou(page);
+    await openConcept2Screen(page, fake);
     const connect = page.getByRole("button", { name: "CONNECT TO CONCEPT2" });
     // LIVE ON FIRST PAINT (ruling i). Not "eventually enabled" — the card's
     // only gate on this button is `busy`, and nothing has been tapped.
@@ -396,7 +421,7 @@ test.describe("Concept2 link and send, in a real browser", () => {
   }) => {
     const fake = await signIn(page, "unlink");
     fake.linked();
-    await openYou(page);
+    await openConcept2Screen(page, fake);
 
     const email = `c2-unlink-${RUN_ID}@e2e.test`;
     await expect(page.locator(".c2-card-identity")).toHaveText(
@@ -641,8 +666,17 @@ test.describe("Concept2 link and send, in a real browser", () => {
     // Concept2, and drawing them the same way tells a rower whose server
     // does have it that it does not.
     const fake = await signIn(page, "readfail");
-    fake.link = { status: 502, body: { error: "upstream" } };
+    // PR A: a 502 on the FIRST-EVER read draws no row at all (decision-table
+    // cell 2a — the first thing a rower hears about Concept2 must not be an
+    // error), so there is no door to open. One good read mints ruling 6's
+    // `seen`; the read that fails AFTER it is cell 2b, and the row keeps its
+    // door. That is the path a real rower takes to this panel now.
+    fake.unlinked();
     await openYou(page);
+    await expect(page.getByRole("link", { name: /CONCEPT2/ })).toBeVisible();
+    fake.link = { status: 502, body: { error: "upstream" } };
+    await page.reload();
+    await openConcept2Screen(page, fake);
 
     await expect(page.locator(".c2-card")).toBeVisible();
     await expect(page.locator(".c2-card-status")).toHaveText("COULDN'T READ");
@@ -673,7 +707,7 @@ test.describe("Concept2 link and send, in a real browser", () => {
     const fake = await signIn(page, "unlinkfail");
     fake.linked();
     fake.unlink = { status: 500, body: { error: "boom" } };
-    await openYou(page);
+    await openConcept2Screen(page, fake);
 
     await page.getByRole("button", { name: "Unlink Concept2" }).click();
     await page.getByRole("button", { name: "Tap again to unlink" }).click();
@@ -749,7 +783,7 @@ test.describe("coming back from Concept2", () => {
       status: 200,
       body: { authorizeUrl: "/api/concept2/callback?stub=1", state: "s" },
     };
-    await openYou(page);
+    await openConcept2Screen(page, fake);
 
     // A MARKER IN THE JS HEAP — the instrument this describe's header
     // names. A back-forward-cache RESTORE preserves this document and
@@ -791,3 +825,111 @@ test.describe("coming back from Concept2", () => {
     );
   });
 });
+
+// ── Wave E PR A: the CONCEPT2 row on You, and the screen behind it ─────────
+//
+// Spec 2026-09-04-concept2-walk-fixes §5.1 / §6.1. The row shows what the
+// SERVER last said (never attempt state); the screen shows the card as it was.
+// Every negative assertion about the row polls `fake.linkReads` first: the
+// row is async and You's sentinel is not (RF21).
+test.describe("Concept2 row on You (Wave E PR A)", () => {
+  test("an available, unlinked account gets a NOT LINKED row; the row opens the screen; BACK returns to You", async ({
+    page,
+  }) => {
+    const fake = await signIn(page, "row-unlinked");
+    fake.unlinked();
+    await openYou(page);
+    const row = page.getByRole("link", { name: /CONCEPT2/ });
+    await expect(row).toBeVisible();
+    await expect(row.locator(".diag-row-state")).toHaveText("NOT LINKED");
+    // No card on You any more (R10).
+    await expect(page.locator(".c2-card")).toHaveCount(0);
+
+    await row.click();
+    await expect(page).toHaveURL(/\/you\/concept2$/);
+    await expect(
+      page.getByRole("heading", { name: "Concept2", exact: true }),
+    ).toBeVisible();
+    await expect(
+      page.getByRole("button", { name: "CONNECT TO CONCEPT2" }),
+    ).toBeEnabled();
+
+    await page.getByRole("link", { name: /BACK/ }).click();
+    await expect(page).toHaveURL(/\/you$/);
+    await expect(page.getByRole("link", { name: /CONCEPT2/ })).toBeVisible();
+  });
+
+  test("a healthy link reads LINKED ✓ on the row", async ({ page }) => {
+    const fake = await signIn(page, "row-linked");
+    fake.linked();
+    await openYou(page);
+    await expect(
+      page.getByRole("link", { name: /CONCEPT2/ }).locator(".diag-row-state"),
+    ).toHaveText("LINKED ✓");
+  });
+
+  test("needsReauth reads RECONNECT NEEDED, and a failed re-read does NOT overwrite it (ruling 5, cell 10)", async ({
+    page,
+  }) => {
+    const fake = await signIn(page, "row-reauth");
+    fake.linked({ needsReauth: true });
+    await openYou(page);
+    const state = page
+      .getByRole("link", { name: /CONCEPT2/ })
+      .locator(".diag-row-state");
+    await expect(state).toHaveText("RECONNECT NEEDED");
+
+    // The next read fails. `pageshow` is one of the two events the hook
+    // re-reads on (`useConcept2Link`), and it is the one a real return from
+    // the browser fires.
+    const readsBefore = fake.linkReads;
+    fake.link = { status: 502, body: { error: "upstream" } };
+    await page.evaluate(() => window.dispatchEvent(new Event("pageshow")));
+    await expect.poll(() => fake.linkReads).toBeGreaterThan(readsBefore);
+    // Still the sticky, server-set warning — not COULDN'T READ.
+    await expect(state).toHaveText("RECONNECT NEEDED");
+  });
+
+  test("a FIRST-EVER read that fails draws no row; once the account has been told, a failed read draws COULDN'T READ (R4, R11)", async ({
+    page,
+  }) => {
+    const fake = await signIn(page, "row-seen");
+    // 2a: fresh account, first read fails — nothing, and no error about a
+    // feature this account may not have.
+    fake.link = { status: 502, body: { error: "upstream" } };
+    await openYou(page);
+    await expect.poll(() => fake.linkReads).toBeGreaterThan(0);
+    await expect(page.getByRole("link", { name: /CONCEPT2/ })).toHaveCount(0);
+    await expect(page.getByText("COULDN'T READ")).toHaveCount(0);
+
+    // A successful available:true read mints `seen`.
+    fake.unlinked();
+    await page.reload();
+    await expect(page.getByRole("link", { name: /CONCEPT2/ })).toBeVisible();
+
+    // 2b: the read fails on a later visit — the row keeps its door.
+    fake.link = { status: 502, body: { error: "upstream" } };
+    await page.reload();
+    const row = page.getByRole("link", { name: /CONCEPT2/ });
+    await expect(row.locator(".diag-row-state")).toHaveText("COULDN'T READ");
+    // ...and the screen behind it draws 1i's panel with its Retry (R5).
+    await row.click();
+    await expect(
+      page.getByRole("heading", { name: "Concept2", exact: true }),
+    ).toBeVisible();
+    await expect(page.getByText("COULDN'T READ CONCEPT2")).toBeVisible();
+    await expect(page.getByRole("button", { name: "Retry" })).toBeVisible();
+  });
+
+  test("a typed /you/concept2 on an account without Concept2 lands back on You (R5)", async ({
+    page,
+  }) => {
+    const fake = await signIn(page, "row-typed");
+    fake.unavailable();
+    await page.goto("/you/concept2");
+    await expect(page).toHaveURL(/\/you$/);
+    await expect(page.locator("main.you-screen")).toBeVisible();
+    await expect.poll(() => fake.linkReads).toBeGreaterThan(0);
+    await expect(page.getByRole("link", { name: /CONCEPT2/ })).toHaveCount(0);
+  });
+});
```

Apply this patch to `app/e2e/screenshots.spec.ts` (save it to a file and run `git apply <file>` from `/Users/james/projects/github/jamesawesome/Ergomatic-wt-c2pra` as `git apply --recount <file>` — `--recount` so a fence-trimmed blank context line is not read as drift; apply each block as its OWN file, never several concatenated. If it still does not apply, the tree has drifted from base `e3ce0a03` — stop and report, do not hand-merge):

```diff
diff --git a/app/e2e/screenshots.spec.ts b/app/e2e/screenshots.spec.ts
index f4bae145..5555e1e1 100644
--- a/app/e2e/screenshots.spec.ts
+++ b/app/e2e/screenshots.spec.ts
@@ -6210,50 +6210,116 @@ async function openC2You(page: Page, email: string): Promise<void> {
   await signInViaBackdoor(page, { email, name: "Screenshot Tester" });
   await setBaselines(page);
   await page.goto("/you");
-  await expect(page.locator(".diag-row")).toBeVisible();
+  // PR A: the sentinel is You's own container plus a control always on it,
+  // never a feature row's class (two `.diag-row`s now — strict mode).
+  await expect(page.locator("main.you-screen")).toBeVisible();
+  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
+}
+
+/** The Concept2 SCREEN behind the row, entered through the row. Its captures
+ *  are VIEWPORT shots, never `fullPage`: `/you/concept2` is `.overlay-screen`
+ *  (`position: fixed; inset: 0`), and this file's own diagnostics captures
+ *  record that `fullPage: true` is useless on that route shape — the fixed
+ *  overlay is exactly one viewport tall whatever the document behind it
+ *  measures. */
+async function openC2Screen(page: Page, email: string): Promise<void> {
+  await openC2You(page, email);
+  await page.getByRole("link", { name: /CONCEPT2/ }).click();
+  await expect(
+    page.getByRole("heading", { name: "Concept2", exact: true }),
+  ).toBeVisible();
+  await expect(page.locator(".c2-card")).toBeVisible();
 }
 
 test("you-concept2-unlinked", async ({ page }) => {
-  // GATE 0's OWN ARTIFACT, and the reason this capture is full-page: the
-  // card's position relative to RESET BASELINE SETUP has never been rendered
-  // for anyone. Every in-situ frame on the amendment page draws the card in
-  // the slot the reset ghost occupies in its own frame, and no frame draws
-  // both — so the page cannot settle the order and the shipped order lives
-  // only in a `You.tsx` comment. This image is what that decision looks like.
-  //
-  // It is ALSO the visual record of what the two weight-class rulings
-  // changed: the board's 1a drew a WEIGHT CLASS section and a two-option
-  // control between the explanation and the button, and the first amendment
-  // replaced them with a helper line saying where the class comes from.
-  // James, 2026-09-04: "Stop talking about the weight class." Nothing stands
-  // in their place — the explanation, the rule and the button, and that is
-  // what this image now shows.
+  // Wave E PR A (spec 2026-09-04-concept2-walk-fixes §5.1): the card is gone
+  // from You; one quiet mono row stands at the foot beside DIAGNOSTICS. This
+  // is decision-table cell 5 — the discovery state most rowers are in — and
+  // the adjacency Gate 0 §8.2/8.4 drew and James approved on 2026-09-04
+  // (CONCEPT2 above DIAGNOSTICS). Full page, so the row's place at the foot
+  // is in the picture.
   const fake: C2ShotFake = {
     link: { status: 200, body: C2_SHOT_UNLINKED },
     send: { status: 200, body: {} },
   };
   await routeC2(page, fake);
   await openC2You(page, "screenshots-c2-unlinked@e2e.test");
-  await expect(
-    page.getByRole("button", { name: "CONNECT TO CONCEPT2" }),
-  ).toBeEnabled();
-  await expect(page.locator(".c2-card").getByRole("radiogroup")).toHaveCount(0);
-  // Shot only once the card demonstrably says nothing about the class —
-  // otherwise the capture is the record of a screen nobody checked.
-  await expect(page.locator(".c2-card").getByText(/weight class/i)).toHaveCount(
-    0,
-  );
+  const row = page.getByRole("link", { name: /CONCEPT2/ });
+  await expect(row.locator(".diag-row-state")).toHaveText("NOT LINKED");
+  await expect(page.locator(".c2-card")).toHaveCount(0);
   await page.screenshot({
     path: path.join(SCREENSHOTS_DIR, "you-concept2-unlinked.png"),
     fullPage: true,
   });
 });
 
+test("you-concept2-linked", async ({ page }) => {
+  // Cell 7: the door with an answer.
+  const fake: C2ShotFake = {
+    link: { status: 200, body: C2_SHOT_LINKED },
+    send: { status: 200, body: {} },
+  };
+  await routeC2(page, fake);
+  await openC2You(page, "screenshots-c2-linked@e2e.test");
+  await expect(
+    page.getByRole("link", { name: /CONCEPT2/ }).locator(".diag-row-state"),
+  ).toHaveText("LINKED ✓");
+  await page.screenshot({
+    path: path.join(SCREENSHOTS_DIR, "you-concept2-linked.png"),
+    fullPage: true,
+  });
+});
+
+test("you-concept2-reconnect", async ({ page }) => {
+  // Cell 9: the pre-emptive warning the row exists for — the server's own
+  // `needs_reauth_at`, on a surface the rower passes anyway, before they
+  // spend a send on it.
+  const fake: C2ShotFake = {
+    link: { status: 200, body: { ...C2_SHOT_LINKED, needsReauth: true } },
+    send: { status: 200, body: {} },
+  };
+  await routeC2(page, fake);
+  await openC2You(page, "screenshots-c2-reconnect@e2e.test");
+  await expect(
+    page.getByRole("link", { name: /CONCEPT2/ }).locator(".diag-row-state"),
+  ).toHaveText("RECONNECT NEEDED");
+  await page.screenshot({
+    path: path.join(SCREENSHOTS_DIR, "you-concept2-reconnect.png"),
+    fullPage: true,
+  });
+});
+
+test("you-concept2-read-failed", async ({ page }) => {
+  // Cell 2b: an account that HAS been told Concept2 exists for it (one good
+  // read, which mints ruling 6's persisted `seen`), whose read then fails.
+  // The row keeps its door so the Retry behind it stays reachable. A 502 on
+  // the FIRST-EVER read would draw NO row (cell 2a) — that is the live
+  // defect this design closes, and it is why the fixture serves one good
+  // read before the failing one.
+  const fake: C2ShotFake = {
+    link: { status: 200, body: C2_SHOT_UNLINKED },
+    send: { status: 200, body: {} },
+  };
+  await routeC2(page, fake);
+  await openC2You(page, "screenshots-c2-read-failed@e2e.test");
+  await expect(page.getByRole("link", { name: /CONCEPT2/ })).toBeVisible();
+  fake.link = { status: 502, body: { error: "upstream" } };
+  await page.reload();
+  await expect(page.locator("main.you-screen")).toBeVisible();
+  await expect(
+    page.getByRole("link", { name: /CONCEPT2/ }).locator(".diag-row-state"),
+  ).toHaveText("COULDN'T READ");
+  await page.screenshot({
+    path: path.join(SCREENSHOTS_DIR, "you-concept2-read-failed.png"),
+    fullPage: true,
+  });
+});
+
 test("you-concept2-landscape", async ({ page }) => {
-  // THE SECOND ORIENTATION, which the Gate 0 rule asks for by name. The
-  // landscape rule is what turns the card's tell/act pair into two columns
-  // (`index.css`'s `.c2-card-body-split` media block), and until now that
-  // rule has only ever been measured, never looked at.
+  // THE SECOND ORIENTATION, which the Gate 0 rule asks for by name: the two
+  // doors at the foot of You, landscape. Viewport, not full page (a fullPage
+  // capture paints the FIXED tab bar at its viewport position across the
+  // middle of the page — measured on the card's landscape capture).
   const fake: C2ShotFake = {
     link: { status: 200, body: C2_SHOT_UNLINKED },
     send: { status: 200, body: {} },
@@ -6261,50 +6327,57 @@ test("you-concept2-landscape", async ({ page }) => {
   await routeC2(page, fake);
   await page.setViewportSize({ width: 844, height: 390 });
   await openC2You(page, "screenshots-c2-landscape@e2e.test");
+  const row = page.getByRole("link", { name: /CONCEPT2/ });
+  await expect(row.locator(".diag-row-state")).toHaveText("NOT LINKED");
+  await page.locator(".you-doors").scrollIntoViewIfNeeded();
+  await page.screenshot({
+    path: path.join(SCREENSHOTS_DIR, "you-concept2-landscape.png"),
+  });
+});
+
+test("concept2-screen-unlinked", async ({ page }) => {
+  // The screen behind the row: BackLink, title, and the card exactly as it
+  // was on You (R6). 1a.
+  const fake: C2ShotFake = {
+    link: { status: 200, body: C2_SHOT_UNLINKED },
+    send: { status: 200, body: {} },
+  };
+  await routeC2(page, fake);
+  await openC2Screen(page, "screenshots-c2-screen-unlinked@e2e.test");
   await expect(
     page.getByRole("button", { name: "CONNECT TO CONCEPT2" }),
   ).toBeEnabled();
-  // VIEWPORT, not full page, and the portrait capture's own comment does not
-  // apply here. In portrait the whole screen fits the 390x844 viewport, so
-  // `fullPage` and a viewport shot are the same image. In landscape the
-  // screen is taller than the 390px viewport, and a `fullPage` capture
-  // paints the FIXED tab bar at its viewport position — measured, it landed
-  // across the middle of the page over the two door buttons, which is a
-  // picture of a layout that does not exist. Scrolling the card into a real
-  // viewport shows what a rower actually sees.
-  await page.locator(".c2-card").scrollIntoViewIfNeeded();
   await page.screenshot({
-    path: path.join(SCREENSHOTS_DIR, "you-concept2-landscape.png"),
+    path: path.join(SCREENSHOTS_DIR, "concept2-screen-unlinked.png"),
   });
 });
 
-test("you-concept2-linked", async ({ page }) => {
+test("concept2-screen-linked", async ({ page }) => {
   const fake: C2ShotFake = {
     link: { status: 200, body: C2_SHOT_LINKED },
     send: { status: 200, body: {} },
   };
   await routeC2(page, fake);
-  await openC2You(page, "screenshots-c2-linked@e2e.test");
-  // The identity line names BOTH accounts — the Concept2 username and the
-  // Ergomatic address it is bound to. That pairing is the whole point of
-  // the state, so the capture proves it before shooting.
+  await openC2Screen(page, "screenshots-c2-screen-linked@e2e.test");
   await expect(page.locator(".c2-card-identity")).toContainText(
-    "Concept2 jamesawesome · Ergomatic screenshots-c2-linked-",
+    "Concept2 jamesawesome · Ergomatic screenshots-c2-screen-linked",
   );
   await expect(page.locator(".c2-card-status")).toHaveText("LINKED ✓");
   await page.screenshot({
-    path: path.join(SCREENSHOTS_DIR, "you-concept2-linked.png"),
-    fullPage: true,
+    path: path.join(SCREENSHOTS_DIR, "concept2-screen-linked.png"),
   });
 });
 
-test("you-concept2-armed", async ({ page }) => {
+test("concept2-screen-armed", async ({ page }) => {
+  // 1d, on the screen it now lives on. Unlink keeps its tier, its size and
+  // its two-tap arm (spec §5.1 R8/R9): on a screen whose only job is this
+  // link, the destructive control being the loudest thing there is correct.
   const fake: C2ShotFake = {
     link: { status: 200, body: C2_SHOT_LINKED },
     send: { status: 200, body: {} },
   };
   await routeC2(page, fake);
-  await openC2You(page, "screenshots-c2-armed@e2e.test");
+  await openC2Screen(page, "screenshots-c2-screen-armed@e2e.test");
   await page.getByRole("button", { name: "Unlink Concept2" }).click();
   await expect(
     page.getByRole("button", { name: "Tap again to unlink" }),
@@ -6313,28 +6386,50 @@ test("you-concept2-armed", async ({ page }) => {
     page.getByText("DISARMS ON ITS OWN AFTER 4 SECONDS"),
   ).toBeVisible();
   await page.screenshot({
-    path: path.join(SCREENSHOTS_DIR, "you-concept2-armed.png"),
-    fullPage: true,
+    path: path.join(SCREENSHOTS_DIR, "concept2-screen-armed.png"),
   });
 });
 
-test("you-concept2-read-failed", async ({ page }) => {
-  // Amendment 1i, and the state the invisibility case must never be
-  // confused with: a read that FAILED is a different answer from a
-  // deployment that has no Concept2, and drawing them the same way tells a
-  // rower whose server does have it that it does not.
+test("concept2-screen-read-failed", async ({ page }) => {
+  // 1i on the screen: chrome in every state (R5), and the card's own panel
+  // with its Retry. The screen is reached through a row that exists only
+  // after one good read, so this is the same one-good-read-then-502 path as
+  // `you-concept2-read-failed` — cell 2b, one tap deeper.
   const fake: C2ShotFake = {
-    link: { status: 502, body: { error: "upstream" } },
+    link: { status: 200, body: C2_SHOT_UNLINKED },
     send: { status: 200, body: {} },
   };
   await routeC2(page, fake);
-  await openC2You(page, "screenshots-c2-read-failed@e2e.test");
+  await openC2You(page, "screenshots-c2-screen-read-failed@e2e.test");
+  await expect(page.getByRole("link", { name: /CONCEPT2/ })).toBeVisible();
+  fake.link = { status: 502, body: { error: "upstream" } };
+  await page.reload();
+  await page.getByRole("link", { name: /CONCEPT2/ }).click();
+  await expect(
+    page.getByRole("heading", { name: "Concept2", exact: true }),
+  ).toBeVisible();
   await expect(page.locator(".c2-card-status")).toHaveText("COULDN'T READ");
   await expect(page.getByText("REASON: THE SERVER ANSWERED 502")).toBeVisible();
   await expect(page.getByRole("button", { name: "Retry" })).toBeVisible();
   await page.screenshot({
-    path: path.join(SCREENSHOTS_DIR, "you-concept2-read-failed.png"),
-    fullPage: true,
+    path: path.join(SCREENSHOTS_DIR, "concept2-screen-read-failed.png"),
+  });
+});
+
+test("concept2-screen-landscape", async ({ page }) => {
+  const fake: C2ShotFake = {
+    link: { status: 200, body: C2_SHOT_UNLINKED },
+    send: { status: 200, body: {} },
+  };
+  await routeC2(page, fake);
+  await page.setViewportSize({ width: 844, height: 390 });
+  await openC2Screen(page, "screenshots-c2-screen-landscape@e2e.test");
+  await expect(
+    page.getByRole("button", { name: "CONNECT TO CONCEPT2" }),
+  ).toBeEnabled();
+  await page.locator(".c2-card").scrollIntoViewIfNeeded();
+  await page.screenshot({
+    path: path.join(SCREENSHOTS_DIR, "concept2-screen-landscape.png"),
   });
 });
 
```

- [ ] **Step 2: Typecheck the e2e project first (cheap), then the full suite**

```
cd /Users/james/projects/github/jamesawesome/Ergomatic-wt-c2pra/app
pnpm exec tsc -p e2e/tsconfig.json --noEmit
pnpm lint
pnpm e2e
```
Expected: `499 passed` (the suite is 487 at base + 12 new). Author's measurement at the draft: the full run was `497 passed, 2 failed`; both failures were the author's own — a `getByRole("heading", { name: "Concept2" })` that also matched the card's `CONCEPT2` h2 (fixed with `exact: true`, seven sites), and the read-failed card test entering through a row that under R4 does not exist on a first-ever 502 (fixed: one good read, then the 502) — and the Concept2 subset then ran `36 passed`. Record the exact `N passed` line. If a test fails, fix the CAUSE and say what it was; do not retune an assertion to green.

- [ ] **Step 3: Captures**

```
cd /Users/james/projects/github/jamesawesome/Ergomatic-wt-c2pra
git rm docs/screenshots/you-concept2-armed.png
cd app && pnpm screenshots
cd .. && git status --short docs/screenshots
```
Expected among the Concept2 captures: 4 modified (`you-concept2-{unlinked,linked,read-failed,landscape}.png`), 1 new `you-concept2-reconnect.png`, and 5 new `concept2-screen-{unlinked,linked,armed,read-failed,landscape}.png`. **The run also rewrites ~55 UNRELATED PNGs byte-for-byte differently** (measured at the author's run — the suite is not pixel-deterministic); `git checkout -- docs/screenshots/<each unrelated file>` so the commit carries only the ten Concept2 captures. The author's three spot-checks: `you-concept2-unlinked.png` shows BASELINES, the two test buttons, Reset, then the two doors stacked at the foot (CONCEPT2 · NOT LINKED · › above DIAGNOSTICS · ›); `concept2-screen-unlinked.png` shows ← BACK, the serif Concept2 title, and the unchanged card (CONCEPT2 · NOT LINKED head, CONNECT TO CONCEPT2, OPENS CONCEPT2 IN YOUR BROWSER); `you-concept2-read-failed.png` is the same You with the row reading COULDN'T READ. **OPEN EVERY ONE** (Read tool on the PNG) and describe each in your report in one line from having looked at it (RF7): which row state or card frame it shows, and that the doors sit at the foot with CONCEPT2 above DIAGNOSTICS. A capture showing a dash, an empty You, or the OLD card on You is a failure, not a record. **Two stated pass conditions:** in `you-concept2-landscape.png` BOTH doors are fully visible above the fixed tab bar — if DIAGNOSTICS is clipped by it, call the file's own `neutralizeFixedTabBarForFullPageCapture` before shooting and say so; and the four portrait `concept2-screen-*` captures are VIEWPORT shots on purpose (`/you/concept2` is `position: fixed` `.overlay-screen`, where `fullPage` is meaningless — the file's diagnostics captures record the same) — if a card state is taller than 844px, scroll the overlay's own scroller, never restore `fullPage`.

- [ ] **Step 4: The negative-assertion audit (A3).** In your report, list every `toHaveCount(0)` / `toBeNull`-style assertion about the row you added and the `expect.poll(() => fake.linkReads)` that precedes it. Any negative not preceded by a poll is RF21 — fix it.

- [ ] **Step 5: Commit**

```
cd /Users/james/projects/github/jamesawesome/Ergomatic-wt-c2pra
git rev-parse --show-toplevel   # MUST print this worktree's path
git add app/e2e/concept2.spec.ts app/e2e/screenshots.spec.ts docs/screenshots
git commit -m "PR A Task 5: e2e — the row and screen walk, sentinel replaced, captures re-shot"
```

- [ ] **Step 6: What this suite does NOT gate, stated.** The row tests assert TEXT (the four strings, the URL, the panel), never geometry. R7's geometry — adjacency AND the pin to the foot — is gated in Task 6's design.spec, by the mutations listed there. Say so in your report rather than claiming this suite covers it.

---

## Task 6: design.spec — the screen registers; the in-situ test moves; the doors group is measured

**Files:**
- Modify: `app/e2e/design.spec.ts` (Concept2 block header corrected in place; the in-situ "stands off the row above it on You" test REWRITTEN for the screen; the real-screens describe enters through the row and its two test titles say "the Concept2 screen"; two NEW describes appended: `concept2 screen (/you/concept2, Wave E PR A)` — A11 — and `You carrying the CONCEPT2 row (Wave E PR A)` with the R7 geometry assertion)

- [ ] **Step 1: Apply the patch**

Apply this patch to `app/e2e/design.spec.ts` (save it to a file and run `git apply <file>` from `/Users/james/projects/github/jamesawesome/Ergomatic-wt-c2pra` as `git apply --recount <file>` — `--recount` so a fence-trimmed blank context line is not read as drift; apply each block as its OWN file, never several concatenated. If it still does not apply, the tree has drifted from base `e3ce0a03` — stop and report, do not hand-merge):

```diff
diff --git a/app/e2e/design.spec.ts b/app/e2e/design.spec.ts
index abf1ef72..7f53214d 100644
--- a/app/e2e/design.spec.ts
+++ b/app/e2e/design.spec.ts
@@ -10307,10 +10307,11 @@ test.describe("unlogged recovery render registrations", () => {
 // component's exact markup regardless of how the file is formatted on disk;
 // the empty act column in the 1g fixture must stay `:empty` to collapse.
 //
-// WHAT IT DOES NOT PROVE: that the card is reachable on You. Task 8 HAS now
-// mounted it (`You.tsx`, between Reset baseline setup and the DIAGNOSTICS
-// row), so the mount itself is real and `You.test.tsx` pins it; what is
-// still missing is a browser walk of it, because this stack runs with
+// WHAT IT DOES NOT PROVE: that the card is reachable from You. Since Wave E
+// PR A the card is NOT on You at all — it is mounted on `/you/concept2`
+// (`you/Concept2Screen.tsx`), behind the CONCEPT2 row You now carries, and
+// `Concept2Screen.test.tsx` pins that mount; the browser walk of it is the
+// "Concept2 surfaces on the real screens" describe below. This stack runs with
 // `C2_LINK_ENABLED` unset (`compose.yml`'s `C2_LINK_ENABLED:
 // ${C2_LINK_ENABLED:-}`, exported by neither `e2e.sh` nor
 // `screenshots.sh`), so the route answers `{available:false}` and the card
@@ -10551,61 +10552,47 @@ test.describe("Concept2 card: the landscape interior (Gate 0 amendment §1a-1j)"
     }
   });
 
-  test("the card stands off the row above it on You, in both orientations", async ({
+  test("the card stands off the title above it on the Concept2 screen, in both orientations", async ({
     page,
   }) => {
-    // THE GAP NOTHING ELSE HERE CAN SEE, and it is the sibling block's own
-    // defect one screen over: every other case in this file measures boxes
-    // INSIDE the card, so nothing measured the card's OWN box and a
-    // bordered card butted flush against the Reset baseline setup button
-    // could not redden anything. It did butt flush — measured
-    // `reset -> card = 0` in this engine before `.c2-card` declared a
-    // margin, because `.reset-baselines` is `margin-top: 12px` with no
-    // bottom, `.c2-card` declared none at all, and `.you-screen` is a flex
-    // column (so nothing collapses in from a neighbour either).
+    // Wave E PR A (spec 2026-09-04-concept2-walk-fixes §5.1): the card lives
+    // on `/you/concept2` now, under the screen's `.screen-title` h1, and the
+    // Reset-baseline neighbour this test used to compose against is a
+    // screen away. Every other case in this file measures boxes INSIDE the
+    // card; this is the one that measures the card's OWN box against what
+    // sits above it, and it is kept for the reason it was written — a
+    // bordered card butting flush against its neighbour is the defect
+    // nothing else here can see.
     //
-    // 12 is BOTH authorities agreeing, unlike the send block's case, where
-    // the frames said 12 and the screen's own rhythm said 20/24 and the
-    // difference went to James: the amendment's in-situ frames separate
-    // every child of `.frame` by `gap: 12px`, AND every block on the real
-    // You screen already stands off its neighbour by 12
-    // (`.baselines-card`, `.retest`, `.reset-baselines`, `.diag-row` are
-    // each `margin-top: 12px`). Transcribed as an INDEPENDENT literal, so
-    // retuning `index.css` cannot retune this test with it (RF21).
+    // WHAT SUPPLIES THE GAP, measured rather than assumed: the h1's
+    // browser-default bottom margin (0.67em × 31px ≈ 21px), collapsing in
+    // block flow with whatever the card declares — which is nothing, since
+    // PR A removed `.c2-card`'s `margin-top` after a mutation deleting it
+    // changed no measurement on this screen. So the assertion is the
+    // stand-off itself, at the floor every other You block uses (12), as an
+    // INDEPENDENT literal (RF21); the mutation that bites is zeroing the
+    // title's margin (`h1 { margin: 0 }` on `.screen-title`), which drops
+    // the gap to 0.
     //
-    // THE COMPOSITION is You's own sibling chain, and only the two
-    // NEIGHBOURS are hand-written: `<main class="screen you-screen">` and
-    // the `.reset-baselines` wrapper around a `.button-outline` are
-    // `You.tsx` and `you/ResetBaselineSetup.tsx`'s own literal output at
-    // the slot the card was mounted into, and the card itself is the
-    // committed fixture that `Concept2Card.test.tsx` pins as the
-    // component's output. So this test can go stale only if the SCREEN's
-    // markup changes, never if the card's does.
-    //
-    // NOTHING is asserted about the gap BELOW: `.you-screen .diag-row` is
-    // `margin-top: auto`, so that distance is whatever the flex column has
-    // left over and is viewport- and content-dependent by design (the
-    // row's own `border-top` is what separates it when the space runs
-    // out). A bottom margin on `.c2-card` would be absorbed by that `auto`
-    // rather than seen, which is why the card declares none.
+    // THE COMPOSITION is the screen's own sibling chain — `<main
+    // class="screen overlay-screen">`, `BackLink`'s `<a class="back-link">`,
+    // the `<h1 class="screen-title">` — around the committed fixture that
+    // `Concept2Card.test.tsx` pins as the component's output.
     const inSitu = [
-      `<main class="screen you-screen">`,
-      `<div class="reset-baselines"><button type="button" class="button-outline">Reset baseline setup</button></div>`,
+      `<main class="screen overlay-screen" tabindex="0">`,
+      `<a class="back-link" href="/you">← BACK</a>`,
+      `<h1 class="screen-title">Concept2</h1>`,
       fixtureMarkup("c2-card-unlinked.html"),
-      `<a class="diag-row" href="/you/diagnostics"><span>DIAGNOSTICS</span><span aria-hidden="true">&rsaquo;</span></a>`,
       `</main>`,
     ].join("");
     for (const vp of [PHONE_PORTRAIT, PHONE_LANDSCAPE]) {
       await page.setViewportSize(vp);
       await paint(page, inSitu);
-      const [reset, card] = await boxesOf(page, [
-        ".reset-baselines",
-        ".c2-card",
-      ]);
-      if (reset == null || card == null) {
+      const [title, card] = await boxesOf(page, [".screen-title", ".c2-card"]);
+      if (title == null || card == null) {
         throw new Error("the in-situ composition did not render");
       }
-      expect(card.y - (reset.y + reset.height)).toBe(12);
+      expect(card.y - (title.y + title.height)).toBeGreaterThanOrEqual(12);
     }
   });
 });
@@ -10857,6 +10844,8 @@ test.describe("Concept2 surfaces on the real screens (Wave E PR2)", () => {
     }, name);
   }
 
+  /** The card lives on `/you/concept2` since Wave E PR A; reached the way a
+   *  rower reaches it — through the CONCEPT2 row on You. */
   async function openYouLinked(page: Page, slug: string): Promise<void> {
     await signInViaBackdoor(page, {
       email: `design-c2-${slug}@e2e.test`,
@@ -10864,10 +10853,11 @@ test.describe("Concept2 surfaces on the real screens (Wave E PR2)", () => {
     });
     await fakeLink(page, C2_LINKED);
     await page.goto("/you");
+    await page.getByRole("link", { name: /CONCEPT2/ }).click();
     await expect(page.locator(".c2-card")).toBeVisible();
   }
 
-  test("every tappable on a You carrying the card clears 44x44, in both orientations", async ({
+  test("every tappable on the Concept2 screen carrying the card clears 44x44, in both orientations", async ({
     page,
   }) => {
     // The card's own three controls have their HEIGHTS pinned by the
@@ -10895,7 +10885,7 @@ test.describe("Concept2 surfaces on the real screens (Wave E PR2)", () => {
     await assertTapTargets(page);
   });
 
-  test("zero WCAG 2A/2AA violations on a You carrying the card", async ({
+  test("zero WCAG 2A/2AA violations on the Concept2 screen carrying the card", async ({
     page,
   }) => {
     // NOT reachable from a fixture: axe scores a PAGE — landmarks, heading
@@ -10993,3 +10983,172 @@ test.describe("Concept2 surfaces on the real screens (Wave E PR2)", () => {
     await assertNoA11yViolations(page);
   });
 });
+
+// ── Wave E PR A: /you/concept2 registers here, and You carrying the ROW ────
+//
+// TESTING.md §"structural design assertions": a new screen with no entry
+// here is a screen the a11y/tap-target/token rules are not actually
+// checking — and `design.spec.ts`'s own diagnostics entry above records the
+// last time a new door shipped without one. Exit criterion A11.
+test.describe("concept2 screen (/you/concept2, Wave E PR A)", () => {
+  const C2_LINKED = {
+    available: true,
+    linked: true,
+    c2UserId: 2211,
+    c2Username: "jamesawesome",
+    needsReauth: false,
+    logbookBaseUrl: "https://log-dev.concept2.com",
+  };
+
+  test.beforeEach(async ({ page }) => {
+    await signInViaBackdoor(page, {
+      email: "design-c2-screen@e2e.test",
+      name: "Design C2 Screen Tester",
+    });
+    await page.route(/\/api\/concept2\//, async (route) => {
+      await route.fulfill({
+        status: 200,
+        contentType: "application/json",
+        body: JSON.stringify(C2_LINKED),
+      });
+    });
+    // The ROUTE, typed — this describe registers the screen, not the row.
+    await page.goto("/you/concept2");
+    await expect(
+      page.getByRole("heading", { name: "Concept2", exact: true }),
+    ).toBeVisible();
+    await expect(page.locator(".c2-card")).toBeVisible();
+  });
+
+  test("every visible interactive element has a >=44x44 tap target, in both orientations", async ({
+    page,
+  }) => {
+    for (const vp of [PHONE_PORTRAIT, PHONE_LANDSCAPE]) {
+      await page.setViewportSize(vp);
+      await expect(page.getByRole("link", { name: /BACK/ })).toBeVisible();
+      await assertTapTargets(page);
+    }
+  });
+
+  test("zero WCAG 2A/2AA violations, in both orientations", async ({
+    page,
+  }) => {
+    for (const vp of [PHONE_PORTRAIT, PHONE_LANDSCAPE]) {
+      await page.setViewportSize(vp);
+      await assertNoA11yViolations(page);
+    }
+  });
+
+  test("the title is the screen-title token and the body is --page", async ({
+    page,
+  }) => {
+    const bodyBg = await page.evaluate(
+      () => getComputedStyle(document.body).backgroundColor,
+    );
+    expect(bodyBg).toBe("rgb(244, 241, 232)"); // --page
+    const title = page.getByRole("heading", { name: "Concept2", exact: true });
+    expect(await title.evaluate((el) => getComputedStyle(el).fontSize)).toBe(
+      "31px",
+    );
+  });
+});
+
+test.describe("You carrying the CONCEPT2 row (Wave E PR A)", () => {
+  const C2_UNLINKED = {
+    available: true,
+    linked: false,
+    c2UserId: null,
+    c2Username: null,
+    needsReauth: false,
+    logbookBaseUrl: null,
+  };
+
+  test.beforeEach(async ({ page }) => {
+    await signInViaBackdoor(page, {
+      email: "design-c2-row@e2e.test",
+      name: "Design C2 Row Tester",
+    });
+    await page.route(/\/api\/concept2\//, async (route) => {
+      await route.fulfill({
+        status: 200,
+        contentType: "application/json",
+        body: JSON.stringify(C2_UNLINKED),
+      });
+    });
+    await page.goto("/you");
+    await expect(page.getByRole("link", { name: /CONCEPT2/ })).toBeVisible();
+  });
+
+  test("every tappable on a You carrying the row clears 44x44, in both orientations", async ({
+    page,
+  }) => {
+    for (const vp of [PHONE_PORTRAIT, PHONE_LANDSCAPE]) {
+      await page.setViewportSize(vp);
+      await assertTapTargets(page);
+    }
+  });
+
+  test("zero WCAG 2A/2AA violations on a You carrying the row", async ({
+    page,
+  }) => {
+    await assertNoA11yViolations(page);
+  });
+
+  test("the two doors read as ONE group: DIAGNOSTICS starts where CONCEPT2 ends, in both orientations (R7)", async ({
+    page,
+  }) => {
+    // Invariant R7 (spec §5.1): exactly one auto top margin separates the
+    // group from the content above it. Two rows each carrying their own
+    // `margin-top: auto` as DIRECT flex children of `.you-screen` would
+    // SPLIT the column's free space between them (CSS Flexbox §8.1) — the
+    // mutation that bites the adjacency line: delete the `.you-doors`
+    // wrapper and put `margin-top: auto` back on `.you-screen .diag-row`;
+    // measured 174.5px apart in portrait. Tolerance 1px for the shared
+    // hairline.
+    for (const vp of [PHONE_PORTRAIT, PHONE_LANDSCAPE]) {
+      await page.setViewportSize(vp);
+      const c2 = await stableBoundingBox(
+        page.getByRole("link", { name: /CONCEPT2/ }),
+      );
+      const diag = await stableBoundingBox(
+        page.getByRole("link", { name: /DIAGNOSTICS/ }),
+      );
+      if (c2 == null || diag == null) throw new Error("a door did not render");
+      expect(Math.abs(diag.y - (c2.y + c2.height))).toBeLessThanOrEqual(1);
+      expect(c2.height).toBeGreaterThanOrEqual(44);
+      expect(diag.height).toBeGreaterThanOrEqual(44);
+      // R7's OTHER half: the ONE auto margin pins the group to the FOOT.
+      // Measured against `.you-screen`'s own box, because a mutant that moves
+      // the auto margin onto the rows INSIDE `.you-doors` has no free space
+      // to split (the adjacency assertion above stays green) and instead
+      // lets the whole group float up the screen — measured at the plan's
+      // hardening: group bottom → main bottom went from 20 to 369 with every
+      // other gate green. `.screen`'s 20px bottom padding is the only gap
+      // that may remain (INDEPENDENT literal, RF21).
+      const main = await stableBoundingBox(page.locator("main.you-screen"));
+      if (main == null) throw new Error("the You screen did not render");
+      expect(main.y + main.height - (diag.y + diag.height)).toBeLessThanOrEqual(
+        21,
+      );
+    }
+  });
+
+  test("the row's label and state line paint --ink-3 on --page (6.69:1)", async ({
+    page,
+  }) => {
+    const row = page.getByRole("link", { name: /CONCEPT2/ });
+    expect(await row.evaluate((el) => getComputedStyle(el).color)).toBe(
+      "rgb(87, 84, 76)", // --ink-3
+    );
+    expect(
+      await row
+        .locator(".diag-row-state")
+        .evaluate((el) => getComputedStyle(el).color),
+    ).toBe("rgb(87, 84, 76)");
+    expect(
+      await page.evaluate(
+        () => getComputedStyle(document.body).backgroundColor,
+      ),
+    ).toBe("rgb(244, 241, 232)"); // --page
+  });
+});
```

- [ ] **Step 2: Typecheck, lint, then the suite**

```
cd /Users/james/projects/github/jamesawesome/Ergomatic-wt-c2pra/app
pnpm exec tsc -p e2e/tsconfig.json --noEmit
pnpm lint
pnpm e2e
```
Expected: `499 passed` (same count as Task 5 — Task 5's run already included this file's changes if you applied both patches before running; if you ran Task 5 first, the count grows by 7 here — design.spec adds 3 + 4). Record the exact line.

- [ ] **Step 3: Commit BEFORE mutating**

```
cd /Users/james/projects/github/jamesawesome/Ergomatic-wt-c2pra
git rev-parse --show-toplevel   # MUST print this worktree's path
git add app/e2e/design.spec.ts
git commit -m "PR A Task 6: design.spec — /you/concept2 registers; the doors group is measured"
```

- [ ] **Step 4: Mutations (e2e-level; the author ran each against the up stack and the failures below are MEASURED against the draft at base, 2026-09-04).** Run each with `bash scripts/e2e.sh e2e/design.spec.ts -g "<grep>"` from `app/` (e2e.sh passes its arguments to Playwright and rebuilds the stack, which a `src/` mutation needs), revert with `git checkout -- <file>` (clean — you committed in Step 3), and record the real output.

| # | mutation (anchor must `grep -c` to 1) | grep | measured failure |
| --- | --- | --- | --- |
| R7(i) adjacency | `You.tsx`: delete the `<nav className="you-doors" aria-label="More">` … `</nav>` wrapper (both `.diag-row`s become direct children of `.you-screen`); `index.css`: replace the whole `.you-doors { … }` rule with `.you-screen .diag-row { margin-top: auto; }` | `Wave E PR A` | "the two doors read as ONE group…" `1 failed` — `expect(received).toBeLessThanOrEqual(expected) Expected: <= 1 Received: 91.5` (the free space split between the rows; the number is viewport-dependent) |
| R7(ii) adjacency | `index.css`: append `.you-doors .diag-row { margin-top: 12px; }` | `Wave E PR A` | same test `1 failed` — `Expected: <= 1 Received: 12` |
| R7 foot | `index.css`: remove `margin-top: auto` from `.you-doors` and add `.you-doors .diag-row { margin-top: auto; }` | `Wave E PR A` | same test `1 failed` on its THIRD assertion — `Expected: <= 21 Received: 203` (the group floated up the screen; the adjacency assertions stayed green — this is the mutant the plan's first draft prescribed against the wrong line) |
| in-situ | `index.css`: append `.screen-title { margin: 0; }` | `Concept2 card` | "the card stands off the title above it on the Concept2 screen…" `1 failed` — `Expected: >= 12 Received: 0` |
| A11 reachability | `AppRoutes.tsx`: `path="/you/concept2"` → `path="/you/concept2-gone"` (deleting the `<Route>` outright leaves an unused import and the docker BUILD fails before Playwright runs — measured; rename the path instead) | `concept2 screen` | the describe's `beforeEach` fails — `Error: expect(locator).toBeVisible() failed … waiting for getByRole('heading', { name: 'Concept2', exact: true })` |

**Why the R7 table has THREE rows and not the one the spec named:** the plan's first draft prescribed "move `margin-top: auto` from `.you-doors` onto `.you-doors .diag-row`" against the ADJACENCY assertion — and that mutant leaves the rows flush (a flex child inside `.you-doors` has no free space to split) while moving the whole group 349px up the screen, with every gate green. Found at the plan's hardening (lens 1, finding 1/2); the foot assertion and its mutation exist because of it.

---

## Task 7: Reconciliation — A7's list, the design page, ROADMAP

**Files:**
- Modify: `docs/design/handoffs/2026-08-31-concept2-connect/amendment-2026-09-03.html` — the 12 in-situ card-on-You frames the census script names are STRUCK on the page (a `<p class="struck">`-style note in the page's own convention, beside each; do not delete the frames — they are the record of what was approved before), and every sentence describing the card as living on You is corrected in place
- Modify: `docs/design/handoffs/2026-08-31-concept2-connect/README.md` — §1's row "You tab · Concept2 card" and anywhere else the card is said to live on You
- Modify: `ROADMAP.md` — the Wave E PR A row (`- [ ] **PR A — Concept2 becomes a row on You…`, ~line 1028) becomes `[x]` with the head SHA, the walk-free gate summary, and a one-line pointer to the captures; no other row appended
- Check, do not change unless a row describes the card on You: `docs/design/DEVIATIONS.md` (spec R8: its one Concept2 row, the Send block link-out, is untouched; NO second row minted)

- [ ] **Step 1: Run the census script** (spec §5.1, verbatim) from `/Users/james/projects/github/jamesawesome/Ergomatic-wt-c2pra/docs/design/handoffs/2026-08-31-concept2-connect` and record its output BEFORE and AFTER your edits (expected before: `54 24 12 12` on `2148f978`; the page has grown since — record what it prints now).

```bash
cd /Users/james/projects/github/jamesawesome/Ergomatic-wt-c2pra/docs/design/handoffs/2026-08-31-concept2-connect && python3 - <<'EOF'
import re
s = open('amendment-2026-09-03.html').read()
opens = list(re.finditer(r'<div class="(frame(?: land)?(?: cb)?)"', s))
tag = re.compile(r'<div\b|</div>')
frames = []
for m in opens:
    depth = 0
    for t in tag.finditer(s, m.start()):
        if t.group() == '</div>':
            depth -= 1
            if depth == 0:
                frames.append(s[m.start():t.end()]); break
        else:
            depth += 1
card = [b for b in frames if 'c2card' in b]
you = [b for b in card if any(k in b for k in ('DIAGNOSTICS','BASELINES','Sign out'))]
print(len(frames), len(card), len(you), len(card)-len(you))
EOF
```

- [ ] **Step 2: The phrase sweep — mechanical, every hit dispositioned in your report.** From the worktree root:

```
grep -rn -i "card on You\|on the You tab\|You tab — the Concept2 card\|between Reset baseline setup\|You's LAST child\|only warning\|no Concept2 component\|single JSX site\|all four\|unreachable" app/src app/e2e docs/design/DEVIATIONS.md docs/design/handoffs/2026-08-31-concept2-connect ROADMAP.md CLAUDE.md docs/superpowers/specs/2026-09-04-concept2-walk-fixes.md | grep -v "docs/monitor"
grep -rn "You tab" app/src app/e2e docs/design | grep -v releaseNotes | grep -v "news/content"
grep -rn 'You\.tsx' app/src app/scripts app/e2e | grep -v '/You.tsx:'
```
The third grep is for the dev probe's MOVE: three tracked files say its build-time fold lives on `You.tsx` and none of the other patterns reach them — `app/src/monitor/Concept2LinkProbe.tsx` (~line 60, "guarded by a build-time-folded condition (`You.tsx:19-23`)" → "…(`you/Concept2Screen.tsx`'s `c2LinkProbeEnabled`)"), `app/src/you/concept2CardModel.ts` (~line 130, "`You.tsx` gates it on" → "`Concept2Screen.tsx` gates it on"), `app/scripts/dist-grep.sh` (~line 107, "`You.tsx` behind the SAME…" → "`you/Concept2Screen.tsx` behind the SAME…"). Correct all three in place in this task's commit (the script is a comment-only change; `pnpm dist:grep` must still pass — run it).
For each hit: CHANGED (in place, never appended beneath), or STANDS with the reason (a historical record, a closed-phase doc, the approved send-block string ruling 7 kept). The spec's own §5.1 counted 13 "You tab" hits with five in scope; ruling 7 keeps the send block's string, so the two code hits (`Concept2SendBlock.tsx`, its test) STAND, and the three doc hits are yours.

- [ ] **Step 3: ROADMAP row.** Wrap by hand to the surrounding width; root markdown is never Prettier-formatted.

- [ ] **Step 4: Gates** (docs under `app/` are formatted; root docs are not):

```
cd /Users/james/projects/github/jamesawesome/Ergomatic-wt-c2pra/app
pnpm format:check
pnpm lint
```
- [ ] **Step 5: Commit**

```
cd /Users/james/projects/github/jamesawesome/Ergomatic-wt-c2pra
git rev-parse --show-toplevel   # MUST print this worktree's path
git add docs/design/handoffs/2026-08-31-concept2-connect ROADMAP.md app/src/monitor/Concept2LinkProbe.tsx app/src/you/concept2CardModel.ts app/scripts/dist-grep.sh
git commit -m "PR A Task 7: reconcile the design page, README, ROADMAP and the probe's three fold comments"
```

---

## Task 8: Final gates, the PR, and STOP

- [ ] **Step 1: merge main first.** `git -C /Users/james/projects/github/jamesawesome/Ergomatic-wt-c2pra fetch origin && git -C /Users/james/projects/github/jamesawesome/Ergomatic-wt-c2pra merge --no-edit origin/main`; resolve; re-run everything below on the merged tree.
- [ ] **Step 2: the whole gate, one per line, each result reported:**

```
cd /Users/james/projects/github/jamesawesome/Ergomatic-wt-c2pra/app
pnpm lint
pnpm typecheck
pnpm format:check
pnpm test --project unit --project client
pnpm build
pnpm dist:grep
pnpm e2e
pnpm screenshots
```
After `pnpm screenshots`, OPEN the ten Concept2 captures again (the merge may have changed a neighbouring screen) and commit them if they changed; `git checkout` every unrelated PNG the run rewrote (the suite is not pixel-deterministic — see Task 5 Step 3).

- [ ] **Step 3: RF28 — main's own CI:** `gh run list --branch main --limit 3` and state main's latest conclusion.
- [ ] **Step 4: the PR body.** Line one "This PR …", ~6 bullets, ~120 words above the fold — COUNTED. Everything else in `<details><summary><strong>Record (for agents and audits)</strong></summary>`. The Record MUST contain, each under its exit-criterion letter:
  - **A2:** the eleven-cell decision table (copy it from `concept2RowState.ts`'s test, `it.each` rows → a markdown table), plus the two exhaustiveness claims WITH their citations: `normalizeLink` admits exactly five shapes (`useConcept2Link.ts`, the three `return`s), and no attempt state coexists with a mounted row (flat routes `AppRoutes.tsx`; component-local `useState` in `Concept2Card.tsx`; `linkFlow.ts`'s module-level `linkInFlight` named as the fifth value that does NOT unmount and is rendered nowhere).
  - **A3:** the sentinel's new form (`main.you-screen` + Sign out button) and why scoping was not enough; the list of row negatives each with its `fake.linkReads` poll.
  - **A4:** every mutation from Tasks 2, 3, 4, 6 with its verbatim failure — and R2's "no code to mutate" finding stated as such, and Task 5's "row tests do not gate geometry" finding.
  - **A5:** every capture named with its one-line description from having opened it.
  - **A6:** the two greps' outputs.
  - **A7:** the disposition table from Task 7 Step 2, in full.
  - **A8:** the census script's before/after output.
  - **A9:** the numbers — row label and state line `--ink-3` on `--page` 6.69:1; chevron decorative; hit target 44px (`var(--tap)`); screen title `--ink` on `--page` 15.41:1; BackLink `--ink` 15.41:1; card numbers unchanged (its own CSS block's header).
  - **A11:** the two `design.spec.ts` describes by name.
  - **A12:** "the probe MOVED behind `/you/concept2`" and R10's grep.
  - **The `seen` lifetime table** (from `concept2Seen.ts`'s header), stated as invariants: mint / clear / survives unmount, relaunch / cleared by sign-out.
  - **The known window (Concept2Screen.test's disagreement case):** the screen's hook and the card's hook are two instances; when the card's read says `available:false` while the screen's read failed, the screen shows chrome over an empty body with a working BACK. ACCEPTED at the plan's hardening (fixing it means a card callback, forbidden by R6, or lifting the hook); stated in the Record, never as "the screen always answers" without the qualifier.
  - **Proof contract** (RF26) and the strongest conclusion the PR may state: the row and screen behave as the decision table says in jsdom and in Chromium against a fake link route; NOT walked on a phone (this PR changes no native code path; the card's own behaviour is unchanged). Recommend James taps the row once on the next TestFlight build.
  - **Risk note:** the one thing a reviewer should probe — the `seen` fact's lifetime across sign-out on NATIVE (Google sign-out through `native/signin`), where `You.tsx`'s handler is the only clear and a sign-out that throws before `onSignedOut` leaves the key; and whether any other sign-out path exists (a 401 → `useMe` → `out`) that bypasses You's handler and so never clears it. State the answer, with the grep.
- [ ] **Step 5: `gh pr create`**, then **STOP. No merge without James's explicit approval.** Do not remove the worktree.
- [ ] **Step 6 (after merge, both in one breath):** TestFlight release recommendation (rower-visible: You's foot changes and a new screen appears — RECOMMENDED, and it pairs with PR B's held release), and the agent-config check ("agent configs updated: …" or "no change needed: …"; candidates: an antagonist-ledger note that a test can be masked by a SIBLING clear of the same key — Task 4's I-D probe survived until its precondition was rewritten).

---

## Self-review (author, 2026-09-04)

- **Spec coverage:** R1 (Task 2 rowState + "R2/R1" cases), R2 (structure + case; no mutation possible — stated), R3 (Task 2 mutations i/ii), R4/R11 (Tasks 1, 2, 4; mutations R4, R11a, R11b), R5 (Task 3, two mutations), R6 (card untouched; Task 4 Step 6 grep; `Concept2Card.test.tsx` in the Task 4 run), R7 (Task 4 order test + Task 6 geometry), R8/R9 (no CSS on the card's controls changes — `git diff` of `index.css` shows only `.diag-row`, `.you-doors`, `.diag-row-end`, `.c2-card`'s margin and comments), R10 (Task 4 Step 6), A1 (Task 0), A2–A12 (Task 8's Record list), §6.1's design.spec registration (Task 6), the sentinel (Task 5), negatives poll `linkReads` (Task 5 Step 4).
- **Departures from the spec, stated:** (1) `.c2-card`'s 12px margin is REMOVED rather than "re-argued" — measured to paint nothing under the h1; the spec's cost table said "re-argued or re-ruled", and removal with the measurement is the re-argument. (2) The spec's R2 mutation ("wire `busy` into the row") cannot be written — the row has no `busy`; recorded as a structural gate instead. (3) The in-situ design test measures the TITLE→card gap on the screen, not reset→card on You, because the latter composition no longer exists.
- **Placeholder scan:** none. Every expected count names the run that produced it.
- **Type consistency:** `rowState`'s `RowState` union matches the four strings the tests and screenshots assert; `Concept2Row({ accountId })` matches You's `user.id`; `Concept2Screen({ email })` matches `AppRoutes`' `user.email`; `.diag-row-state` is the class every e2e locator uses.
