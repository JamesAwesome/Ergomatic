// The hand-off store (design spec `docs/superpowers/specs/
// 2026-08-30-handoff-protocol-design.md`, rev 4, James-approved 2026-08-30):
// ONE module owning BOTH persistence tiers for the connected record —
// `§1 The store`. Plan Task 2's own scope: this module and its unit tests
// ONLY. Nothing outside this file writes `MONITOR_RUN_KEY` or holds a
// module-level `MonitorRun` — every existing writer/remover in
// `monitorRun.ts`/`useMonitorSession.ts`/`LogSession.tsx`/`Today.tsx`/
// `WorkoutDetail.tsx`/`useStartWorkout.ts` is REWRITTEN onto this module in
// Tasks 3-5 (§11's rewrite list); this task builds the module those rewrites
// land on, untouched by them.
//
// **Names verbatim from the plan's Global Constraints:** `handoffStore`,
// `commit(sessionKey, expectedRevision, next)` (`null` = expect-absent),
// `retryDurable`, `read`/`currentUnretired`, `retire(set, reason)`,
// tombstones, receipts (`store-second-key-refused`, `handoff-dropped
// reason=richer-at-save`, retire receipts w/ claim state), `durableRevision`
// + `durableComplete`. `lastAcceptedRevisionRef` is the HOOK's own ref
// (§1: "The hook holds `lastAcceptedRevisionRef`") — Task 3's concern, not
// this module's; it is not defined here.
//
// **One naming call this module makes that the spec states in prose rather
// than pinning a literal name for:** §6 describes the commit effect
// "claims" an entry ("registers `{sessionKey, renderedRevision}` — a
// lightweight receipt-and-state record") without naming a function. This
// module exposes that as `claim(sessionKey, renderedRevision)`, tracked
// store-side (not duplicated by the consumer) so `retire`'s own receipts can
// report accurate claim state — the Task 2 brief's own unit-test list names
// "claim states (unclaimed/claimed/consumed) and the abandoned-claim count"
// as this module's responsibility, which only works if the store, not the
// consumer, is the one holding the state `retire` reads. Flagged here for
// Task 3/4's review since the verbatim-names list does not cover it.

import {
  MONITOR_RUN_KEY,
  isMonitorRun,
  isPlainRecord,
  stripMalformedSeries,
  type MonitorRun,
} from "./monitorRun.js";

/** The store's one entry shape (§1): "{ sessionKey, revision, run }" —
 *  `sessionKey` = `startedAt`, `revision` a monotonic counter the store
 *  alone owns, the entry itself immutable (a new revision is a new object;
 *  reference identity implements revision identity — never mutate a
 *  `HandoffEntry` returned by any method below). */
export interface HandoffEntry {
  readonly sessionKey: string;
  readonly revision: number;
  readonly run: MonitorRun;
}

/** §1/§7: the three shapes a durable attempt can leave behind. `"saved"` —
 *  the whole record, series included, landed. `"saved-without-series"` —
 *  the SACRIFICE succeeded (`§3`'s ordering, ported verbatim from
 *  `monitorRun.ts`'s old `saveMonitorRun`): the full write threw, a series
 *  was present, and the retry WITHOUT it landed — a poorer copy of the same
 *  revision (§8: "without the flag the staleness metric would claim
 *  currency for a durable copy missing up to ~720 KB of trace"). `"failed"`
 *  — every attempt threw; `durableRevision`/`durableComplete` are left
 *  UNCHANGED for the key (§8: "Failed attempts leave both unchanged"). */
export type DurableVerdict = "saved" | "saved-without-series" | "failed";

/** §6: "unclaimed → claimed → consumed." Reported ONLY on a `retire`
 *  receipt — see `deriveClaimState` below for exactly when the persisted
 *  `claimed` state (the only state this module actually STORES; `consumed`
 *  is a receipt-time label, never a fourth persisted value — see that
 *  function's own doc comment) reads back as which of the three. */
export type ClaimState = "unclaimed" | "claimed" | "consumed";

/** Every observable event this module can produce, per the Task 2 brief's
 *  "receipt CHANNEL... every receipt kind from the spec." Nothing below is
 *  invented beyond what §1/§6/§7/§8 name in prose; see each variant's own
 *  comment for its citation. This is the module's ENTIRE side-channel for
 *  observability — no method below returns receipts directly (only their
 *  own operational result), so every test and every future diagnostic-ring
 *  consumer (Task 3's `logRef` wiring) goes through `setReceiptChannel`. */
export type HandoffReceipt =
  | {
      kind: "commit-accepted";
      sessionKey: string;
      revision: number;
      verdict: DurableVerdict;
    }
  | {
      kind: "commit-refused";
      sessionKey: string;
      reason: "stale" | "retired";
      expectedRevision: number | null;
      currentRevision: number | null;
    }
  // §1: "a create-commit while an unretired entry exists for a DIFFERENT
  // key is refused with a receipt (`store-second-key-refused`)" — kept as
  // its OWN kind, distinct from the generic refusal above, because this is
  // the single-unretired-session invariant's own counted-impossible, not an
  // ordinary stale-CAS race.
  | {
      kind: "store-second-key-refused";
      sessionKey: string;
      existingKey: string;
    }
  // §1: retryDurable "never bumps revision" — this receipt carries the
  // fresh verdict alone, with no revision field, so a test (or a future
  // reader) cannot mistake it for a commit.
  | { kind: "retry-durable"; sessionKey: string; verdict: DurableVerdict }
  | { kind: "claim"; sessionKey: string; renderedRevision: number }
  // §1/§6: "one receipt per retired entry (key, revision, claim state
  // §6)." `authorizedRevision` is the revision the retire SET named (what
  // the guard staged, or the consumer's claim); `retiredRevision` is
  // whatever was ACTUALLY current for that key at retire time — equal
  // unless a producer update superseded the stage between authorization
  // and retire (§1: "does NOT reject: the retire proceeds and the receipt
  // records the superseded revision").
  | {
      kind: "retire";
      sessionKey: string;
      authorizedRevision: number;
      retiredRevision: number;
      superseded: boolean;
      claimState: ClaimState;
      reason: string;
    }
  // §6/§10 row 3/ratified condition 1: emitted ALONGSIDE (never instead
  // of) the `retire` receipt above, exactly when a `"save-success"` retire
  // finds the current revision richer than what was claimed.
  | {
      kind: "handoff-dropped";
      reason: "richer-at-save";
      sessionKey: string;
      claimedRevision: number;
      currentRevision: number;
    }
  // §8: "Malformed durable bytes are never cleared during a read... the
  // store records the malformed state, treats the key as absent, receipts
  // it." Fired at most once per process (hydration runs once).
  | { kind: "hydration-malformed"; raw: string }
  // §1 WHATWG primary: "the `localStorage` GETTER throws `SecurityError`
  // (failing every access)... the store's accessor" wraps it. Fired for
  // `"get"` (hydration's own read) and `"remove"` (a retire's physical
  // cleanup) — the two operations with no OTHER receipt already reporting
  // failure. `"set"` (a `commit`/`retryDurable` durable write) is
  // deliberately NOT a separate receipt here: `DurableVerdict: "failed"`
  // on that call's own `commit-accepted`/`retry-durable` receipt already
  // reports the identical event (a getter throw and an ordinary
  // `QuotaExceededError` both surface the same way to a write attempt —
  // both must swallow and fail gracefully, and both already do, via that
  // verdict) — a second receipt for the same write would double-report
  // it under two kinds.
  | { kind: "storage-getter-error"; operation: "get" | "remove" };

type ReceiptChannel = (receipt: HandoffReceipt) => void;

let receiptChannel: ReceiptChannel = () => undefined;

/** Installs the store's one observability sink (Task 2 brief: "an
 *  injectable `onReceipt` callback (the hook wires logRef in Task 3);
 *  default no-op"). Not a per-call parameter — `commit`/`retryDurable`/
 *  `retire`'s arities are fixed at the spec's own verbatim signatures — so
 *  this is the configuration point instead, same shape as the module's
 *  other module-level state (hydration, entries, tombstones): one process,
 *  one channel. Tests get a fresh one per file via `vi.resetModules()`
 *  (this codebase's own convention for singleton modules — every
 *  `src/monitor/*Replay.test.ts` does the identical dance for
 *  `useMonitorSession`), never a bespoke reset export that would exist
 *  only for tests. */
export function setReceiptChannel(channel: ReceiptChannel | null): void {
  receiptChannel = channel ?? (() => undefined);
}

function emit(receipt: HandoffReceipt): void {
  receiptChannel(receipt);
}

/** §1's accessor wrapper: WHATWG PRIMARY (spec §1) — "the `localStorage`
 *  GETTER throws `SecurityError` (failing every access)" — meaning even
 *  evaluating `localStorage.getItem` can throw before `getItem` itself
 *  runs, on top of `setItem`'s own well-known `QuotaExceededError`. Every
 *  raw storage touch in this module goes through this one wrapper so NO
 *  throw — getter or method — ever escapes uncaught, matching §8's "never
 *  an unhandled throw." */
function safeStorageOp<T>(op: () => T): { ok: true; value: T } | { ok: false } {
  try {
    return { ok: true, value: op() };
  } catch {
    return { ok: false };
  }
}

function safeGetItem(
  key: string,
): { ok: true; value: string | null } | { ok: false } {
  return safeStorageOp(() => localStorage.getItem(key));
}

function safeSetItem(
  key: string,
  value: string,
): { ok: true; value: void } | { ok: false } {
  return safeStorageOp(() => localStorage.setItem(key, value));
}

function safeRemoveItem(
  key: string,
): { ok: true; value: void } | { ok: false } {
  return safeStorageOp(() => localStorage.removeItem(key));
}

// ---------------------------------------------------------------------
// Module-level state — the store IS this state, per §1 ("Nothing else
// writes MONITOR_RUN_KEY or holds a module-level run") and the Task 2
// brief ("hydration outside render semantics (module-level: hydrate-on-
// first-access...)"). A reload starts a fresh module instance, which is
// exactly §8's "Reload: memory, tombstones, claims are gone; durable
// serves at hydration baseline" — no explicit teardown code needed for
// that residual; it falls out of these being ordinary module bindings.
// ---------------------------------------------------------------------

/** The single current entry, or `null` when nothing unretired exists. At
 *  most one exists BY CONSTRUCTION (§1's invariant) — `commit` is the only
 *  writer and it refuses every path that would produce a second key. */
let current: HandoffEntry | null = null;

/** Process-scoped, per retired key (§1: "Tombstones. Process-scoped, per
 *  retired key.") — gates a post-retire `commit` create attempt. Never
 *  cleared; a reload is a fresh module, per the header note above. */
const tombstones = new Set<string>();

/** §6: "registers `{sessionKey, renderedRevision}`" — the ONLY persisted
 *  claim state (`"claimed"`); `"consumed"` is derived at retire time
 *  (`deriveClaimState`), never stored as a third value. A retire always
 *  deletes its key's entry here (§6: "a retire releases"). */
const claims = new Map<string, { renderedRevision: number }>();

/** §8: "Tracked durable state: per key, `durableRevision` ... and
 *  `durableComplete`." Set only on a SUCCESSFUL durable write (including
 *  the sacrifice's own success); a failed attempt never touches this map
 *  for the key, per §8's own text. */
const durableStateByKey = new Map<
  string,
  { durableRevision: number; durableComplete: boolean }
>();

/** §7: "`commit` caches the durable verdict per key ... A refused commit
 *  never touches the cached verdict." `retryDurable` also updates this
 *  (§1). Read by the release funnel in Task 3 — not consulted by anything
 *  in this module beyond writing it. */
const cachedVerdicts = new Map<string, DurableVerdict>();

let hydrated = false;

/**
 * §8: "at the store's first NON-RENDER access in a process (guards, doors,
 * commit paths), a durable entry hydrates as `revision 0`." Called at the
 * START of every method EXCEPT `read` — see that function's own doc
 * comment for why it alone must never trigger this. Runs at most once per
 * process; every call after the first is a no-op, matching "hydrates" (a
 * one-time event), not "re-reads."
 *
 * **Never clears malformed bytes** (§8, the anti-pattern this whole
 * function exists to avoid: "the current loader self-clears ... which
 * under a render-time read destroys bytes during a repeatable render").
 * Garbage JSON, an unrecognized shape, or a getter throw all resolve to
 * "treat the durable tier as absent this process," receipted, and the
 * physical bytes are left exactly as they were — the NEXT accepted commit
 * (an ordinary `setItem` overwrite) or the next `retire` (a `removeItem`)
 * is what eventually replaces them, as a natural side effect of doing its
 * own job, never a special-cased extra write this function issues itself.
 */
function ensureHydrated(): void {
  if (hydrated) return;
  hydrated = true;

  const raw = safeGetItem(MONITOR_RUN_KEY);
  if (!raw.ok) {
    emit({ kind: "storage-getter-error", operation: "get" });
    return;
  }
  if (raw.value === null) return;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.value);
  } catch {
    emit({ kind: "hydration-malformed", raw: raw.value });
    return;
  }

  const candidate = isPlainRecord(parsed)
    ? stripMalformedSeries(parsed)
    : parsed;
  if (!isMonitorRun(candidate)) {
    emit({ kind: "hydration-malformed", raw: raw.value });
    return;
  }

  // `revision 0` (§8) — the hydration baseline every post-reload writer's
  // `expectedRevision` derives from. `seriesDropped: true` on the loaded
  // bytes is this exact record's own audit trail of a PRIOR process's
  // sacrifice (`MonitorRun.seriesDropped`'s own doc comment in
  // `monitorRun.ts`) — reusing it here is what lets a rehydrated poorer
  // copy still report `durableComplete: false` instead of asserting
  // currency it does not have.
  current = { sessionKey: candidate.startedAt, revision: 0, run: candidate };
  durableStateByKey.set(candidate.startedAt, {
    durableRevision: 0,
    durableComplete: candidate.seriesDropped !== true,
  });
  cachedVerdicts.set(
    candidate.startedAt,
    candidate.seriesDropped === true ? "saved-without-series" : "saved",
  );
}

/**
 * §3's sacrifice ordering, ported verbatim from `monitorRun.ts`'s retired
 * `saveMonitorRun` (Task 3 removes that function's own copy once its
 * callers move onto this store): try the full write; on a throw, retry
 * ONCE without `series` (stamping `seriesDropped: true`) IF a series was
 * present at all; a series-less record that fails skips the retry outright
 * ("there is nothing smaller to try" — the original comment's own words).
 * Updates `durableStateByKey` on success only (§8).
 */
function performDurableWrite(
  sessionKey: string,
  revision: number,
  run: MonitorRun,
): DurableVerdict {
  const primary = safeSetItem(MONITOR_RUN_KEY, JSON.stringify(run));
  if (primary.ok) {
    durableStateByKey.set(sessionKey, {
      durableRevision: revision,
      durableComplete: true,
    });
    return "saved";
  }
  if (run.series === undefined) return "failed";

  const { series: _series, ...withoutSeries } = run;
  const dropped: MonitorRun = { ...withoutSeries, seriesDropped: true };
  const retry = safeSetItem(MONITOR_RUN_KEY, JSON.stringify(dropped));
  if (retry.ok) {
    durableStateByKey.set(sessionKey, {
      durableRevision: revision,
      durableComplete: false,
    });
    return "saved-without-series";
  }
  return "failed";
}

/**
 * §6: claim-state derivation at RETIRE time — the module's only place
 * `"consumed"` is ever produced (never persisted as a fourth `claims` map
 * value; see that map's own doc comment). `"save-success"` is the ONE
 * reason string this module gives special meaning to, matching §6's own
 * words: "Save-success is the consumer's own retire" — the exact instant a
 * claim becomes consumed IS the successful-save retire, so there is
 * nowhere else in the protocol a `"consumed"` label could originate.
 * Every other reason leaves a persisted claim exactly as `"claimed"` — an
 * abandoned claim, never promoted, exactly matching §6: "Abandon (claimed,
 * unmount without Save) leaves CLAIMED."
 */
function deriveClaimState(sessionKey: string, reason: string): ClaimState {
  if (!claims.has(sessionKey)) return "unclaimed";
  return reason === "save-success" ? "consumed" : "claimed";
}

/**
 * §6: "The commit effect claims: registers `{sessionKey, renderedRevision}`
 * — a lightweight receipt-and-state record, NOT a copy. Claiming never
 * compares against the current revision and cannot fail; StrictMode
 * double-claim is idempotent by value." No `ensureHydrated()` call here on
 * purpose — claiming is a pure state-registration, not a storage access,
 * and nothing about it needs hydration to have happened first.
 *
 * "Idempotent by value": an identical `{sessionKey, renderedRevision}`
 * re-claim (StrictMode's own double-invoke) is a true no-op — no receipt,
 * no map mutation — rather than emitting a duplicate `claim` receipt for
 * an event that didn't actually change anything observable.
 */
export function claim(sessionKey: string, renderedRevision: number): void {
  const existing = claims.get(sessionKey);
  if (
    existing !== undefined &&
    existing.renderedRevision === renderedRevision
  ) {
    return;
  }
  claims.set(sessionKey, { renderedRevision });
  emit({ kind: "claim", sessionKey, renderedRevision });
}

/**
 * §1: the store's one write path — expected-revision CAS.
 * `expectedRevision: null` means "expect absent" (create). Returns
 * `{accepted:true, revision, verdict}` on success (memory written; durable
 * attempted; verdict cached per §7) or `{accepted:false, reason, current?}`
 * on refusal. **A refusal bumps nothing — not revision, not the cached
 * verdict — and is receipted** (§1, §7: "A refused commit never touches
 * the cached verdict").
 *
 * Refusal reasons, in the order this function checks them:
 *  1. `"retired"` — a tombstone exists for this exact key (§1: "A
 *     post-retire commit is refused ... its plausible producer is the dead
 *     hook's late burst racing a fast reconnect").
 *  2. `"second-key"` — CREATE ONLY (`expectedRevision === null`): a
 *     DIFFERENT key is currently unretired (§1's invariant). An UPDATE
 *     naming a key the store has nothing current for is `"stale"`
 *     instead (below) — §1 states the invariant specifically for "a
 *     create-commit," and an update against a non-existent key has no
 *     revision to have been stale FROM in the second-key sense.
 *  3. `"stale"` — the CAS proper: `expectedRevision` does not match
 *     whatever the store currently holds for this key (including
 *     `null`-expects-absent against something present, or a non-null
 *     expectation against nothing/a different revision).
 */
export function commit(
  sessionKey: string,
  expectedRevision: number | null,
  next: MonitorRun,
):
  | { accepted: true; revision: number; verdict: DurableVerdict }
  | {
      accepted: false;
      reason: "stale" | "retired" | "second-key";
      current?: HandoffEntry;
    } {
  ensureHydrated();

  if (tombstones.has(sessionKey)) {
    emit({
      kind: "commit-refused",
      sessionKey,
      reason: "retired",
      expectedRevision,
      currentRevision: null,
    });
    return { accepted: false, reason: "retired" };
  }

  const existingForKey =
    current !== null && current.sessionKey === sessionKey ? current : null;

  if (expectedRevision === null) {
    if (current !== null && current.sessionKey !== sessionKey) {
      emit({
        kind: "store-second-key-refused",
        sessionKey,
        existingKey: current.sessionKey,
      });
      return { accepted: false, reason: "second-key", current };
    }
    if (existingForKey !== null) {
      emit({
        kind: "commit-refused",
        sessionKey,
        reason: "stale",
        expectedRevision: null,
        currentRevision: existingForKey.revision,
      });
      return { accepted: false, reason: "stale", current: existingForKey };
    }
    return acceptCommit(sessionKey, 0, next);
  }

  if (existingForKey === null || existingForKey.revision !== expectedRevision) {
    emit({
      kind: "commit-refused",
      sessionKey,
      reason: "stale",
      expectedRevision,
      currentRevision: existingForKey?.revision ?? null,
    });
    return {
      accepted: false,
      reason: "stale",
      current: existingForKey ?? undefined,
    };
  }
  return acceptCommit(sessionKey, expectedRevision + 1, next);
}

function acceptCommit(
  sessionKey: string,
  revision: number,
  run: MonitorRun,
): { accepted: true; revision: number; verdict: DurableVerdict } {
  current = { sessionKey, revision, run };
  const verdict = performDurableWrite(sessionKey, revision, run);
  cachedVerdicts.set(sessionKey, verdict);
  emit({ kind: "commit-accepted", sessionKey, revision, verdict });
  return { accepted: true, revision, verdict };
}

/**
 * §1/§7: "Retry's primitive. Re-attempts the durable write of the CURRENT
 * memory entry; updates `durableRevision` and the cached verdict; NEVER
 * bumps `revision`" — modeling Retry as `commit` would stale the hook's
 * own ref and refuse the next producer commit (§1's own headline-loss
 * case). Returns `null` when there is nothing current for this key to
 * retry (already retired, or never existed) — the caller has no durable
 * write to re-attempt.
 */
export function retryDurable(sessionKey: string): DurableVerdict | null {
  ensureHydrated();
  if (current === null || current.sessionKey !== sessionKey) return null;

  const verdict = performDurableWrite(
    sessionKey,
    current.revision,
    current.run,
  );
  cachedVerdicts.set(sessionKey, verdict);
  emit({ kind: "retry-durable", sessionKey, verdict });
  return verdict;
}

/**
 * §1: "returns the current entry (§8 precedence)." **Never hydrates, never
 * clears anything — the Task 2 brief's own render-safety model**: "the
 * store's `read()` never clearing" is what makes a render-context call
 * structurally incapable of triggering the malformed-bytes self-clear
 * class of bug (P1c, `monitorRun.ts`'s own historical defect), regardless
 * of how many times React re-invokes the render this call sits in
 * (StrictMode's double-render included). If hydration has not yet run
 * (nothing has called `commit`/`retryDurable`/`retire`/`currentUnretired`
 * yet this process), this returns `null` even when durable bytes exist —
 * by design (§8: "the render peek reads only what is already hydrated or
 * the memory tier"); Task 3/4's integration is responsible for a guard or
 * door running before the first render that needs to see a durable-only
 * record.
 *
 * `sessionKey` omitted returns whatever the single current entry is
 * (unambiguous by construction — §1's invariant permits at most one);
 * supplied, it filters — a mismatched key returns `null` rather than some
 * OTHER key's entry.
 */
export function read(sessionKey?: string): HandoffEntry | null {
  if (current === null) return null;
  if (sessionKey !== undefined && current.sessionKey !== sessionKey)
    return null;
  return current;
}

/**
 * §1: "serves the guards" — `read()` plus the hydration side-effect
 * `read()` itself must never carry. Guards/doors are exactly the
 * "NON-RENDER access" §8 names as hydration's trigger.
 */
export function currentUnretired(): HandoffEntry | null {
  ensureHydrated();
  return current;
}

/**
 * §1: "the only destructive operation; one receipt per retired entry (key,
 * revision, claim state §6); nothing found → nothing emitted." Each
 * `{sessionKey, revision}` in `set` is looked up by KEY alone — a revision
 * mismatch (the entry was superseded between authorization and this call)
 * never blocks the retire; it only changes what the receipt reports
 * (`superseded`/`retiredRevision` vs `authorizedRevision`). This is also
 * what makes save-success's own retire "EXEMPT from rejection by
 * construction" (§1) with no special-casing needed here beyond the
 * `reason` string driving `deriveClaimState`/the `handoff-dropped` receipt
 * below: a genuine key MISMATCH (the set names a key that isn't the
 * store's current one at all — §1's "receipted-impossible" new-key case)
 * is simply absent from `current`'s perspective and falls into "nothing
 * found," the identical no-op path an ordinary stale lookup takes.
 *
 * A key found is unconditionally removed from every tier this module
 * tracks: `current` (if it is that key), its tombstone is armed, its claim
 * released (§6: "a retire releases"), and its durable/cached-verdict
 * bookkeeping dropped. The physical `removeItem` is attempted
 * best-effort (§1 WHATWG: "`removeItem` carries NO throw condition" for
 * the method itself, but the GETTER can still throw before reaching it —
 * `safeRemoveItem` wraps that); its failure is MASKED by the tombstone
 * for the rest of the process regardless (§1/§9.6, "the receipts at the
 * failed session bound the surprise") — never retried, but a distinct
 * `storage-getter-error{operation:"remove"}` receipt IS emitted alongside
 * the ordinary retire receipt so the failure is at least named, even
 * though nothing downstream branches on it.
 */
export function retire(
  set: readonly { sessionKey: string; revision: number }[],
  reason: string,
): void {
  ensureHydrated();

  for (const { sessionKey, revision: authorizedRevision } of set) {
    const entry =
      current !== null && current.sessionKey === sessionKey ? current : null;
    if (entry === null) continue; // nothing found -> nothing emitted (§1)

    const claimState = deriveClaimState(sessionKey, reason);

    current = null;
    tombstones.add(sessionKey);
    claims.delete(sessionKey);
    durableStateByKey.delete(sessionKey);
    cachedVerdicts.delete(sessionKey);
    const removal = safeRemoveItem(MONITOR_RUN_KEY);
    if (!removal.ok) {
      emit({ kind: "storage-getter-error", operation: "remove" });
    }

    const superseded = entry.revision !== authorizedRevision;
    emit({
      kind: "retire",
      sessionKey,
      authorizedRevision,
      retiredRevision: entry.revision,
      superseded,
      claimState,
      reason,
    });

    if (reason === "save-success" && superseded) {
      emit({
        kind: "handoff-dropped",
        reason: "richer-at-save",
        sessionKey,
        claimedRevision: authorizedRevision,
        currentRevision: entry.revision,
      });
    }
  }
}

/** §8: "per key, `durableRevision` (last successful durable write) and
 *  `durableComplete`." Exposed read-only for Task 3's release-funnel
 *  staleness metric; this module's own writers are the only mutators. */
export function durableState(
  sessionKey: string,
): { durableRevision: number; durableComplete: boolean } | undefined {
  return durableStateByKey.get(sessionKey);
}

/** §7: "the release funnel reads the CACHED verdict — the last accepted
 *  commit's, not the close commit's." Exposed read-only, same rationale as
 *  `durableState` above. */
export function cachedVerdict(sessionKey: string): DurableVerdict | undefined {
  return cachedVerdicts.get(sessionKey);
}

/** The store's own name, per the plan's Global Constraints ("Names
 *  verbatim from the spec: `handoffStore` ..."). A plain object of the
 *  module's exported functions — this module has exactly one instance per
 *  process by design (§1's module-level state), so this is a namespacing
 *  convenience for call sites, not a second construction path; every
 *  function above is equally reachable by its own named export (this
 *  file's tests use the named exports directly, matching the rest of this
 *  codebase's `import { fn } from "./module"` convention). */
export const handoffStore = {
  commit,
  retryDurable,
  read,
  currentUnretired,
  retire,
  claim,
  durableState,
  cachedVerdict,
};
