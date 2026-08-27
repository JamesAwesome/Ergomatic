// Four axes derived — never invented — from today's `ConnectedPhase` plus
// the FOUR facts the hook does not publish on its own (design spec
// docs/superpowers/specs/2026-08-15-connected-axes-design.md §1, widened by
// Phase LL Task 2/§2a): the freeze predicate's own verdict (`frozen`,
// mirrors `useMonitorSession`'s `freezeRef` via `isPausedRun`), whether this
// hook's own record is still open (`runOpen`, mirrors `runRef` —
// `disconnected` deliberately leaves the record open, so `phase` alone
// cannot say what `session` should read), whether a `failed` program
// attempt left the transport connected (`failureLeavesLinkUp`, computed by
// the CALLER from `ConnectedError.reason` — a genuine `ProgramRejection` the
// PM5 itself sent leaves the link up; a radio/transport failure on our own
// side does not — this module only consumes the already-computed boolean,
// it does not classify reasons), and whether the frame stream is currently
// suspect (`frameSilence`, published by the liveness watchdog and an
// app-lifecycle resume WHOSE MEASURED GAP EXCEEDED THE THRESHOLD alike
// (2026-08-26: a resume no longer latches on its own) — §2a's own
// `deriveLink` reads it to demote a
// live-looking phase to `"lost"` without a real `disconnected` transition).
//
// Every derivation below `switch`es EXHAUSTIVELY over all nine
// `ConnectedPhase` members (`"paused"` retired, connected-axes 2a task 5 —
// see `useMonitorSession.ts`'s own `ConnectedPhase` doc comment) with a
// `never` guard: a tenth member fails to COMPILE here rather than falling
// through into a guessed default — the mechanism `docs/monitor/
// state-architecture-review.md` §F3 named (one `switch`, zero exhaustiveness
// guards, an unenumerated phase laundered by `?? "live"` into a full live
// surface).
//
// WHAT THE CALLER MAKES OF THESE FOUR (this module still answers four
// separate questions, never one — the collapse lives in the CALLER).
// `ConnectedSurface.tsx` reads them into TWO independent facts, not one
// ranked list:
//
//   - `SurfaceStatus`, activity only: `armed` (a program sits on the
//     machine with no session open yet) beats `paused` (the freeze
//     predicate fired) beats `live` (everything else).
//   - `linkLost`, straight off `deriveLink() === "lost"`, passed alongside.
//
// **THE LINK USED TO BE A FIFTH RANK IN THAT LIST AND IT COST A WORKOUT**
// (Phase LM PR 1 Task 2). `stale` was ranked above `armed`, so a rower
// whose phone went quiet before their first pull got a surface that had
// stopped being armed: `1 OF 4 · WORK`, `LAST 0:00.0`, and an `EST LEFT`
// counting down a piece that never began. The two questions were never one
// question, and this module always knew that — it is the collapse that was
// wrong, not these axes. `"ended"` is still not part of it: the caller
// renders its own hand-off frame and never reaches the decision.
//
// There is no `surfaceStatusFor` any more — `deriveAxes` plus that
// caller-side derivation replaced it, and the `?? "live"` laundering §F3
// named is gone with it.

import type { ConnectedPhase } from "./useMonitorSession";

/** Is the radio link to the monitor available right now? Never invented —
 *  `"up"` only where a transport connection is known (or, at `failed`,
 *  reported by the caller) to exist; `"lost"` is the CONSERVATIVE answer
 *  whenever that is not established. */
export type LinkAxis = "none" | "connecting" | "up" | "lost";

/** Where the workout program stands, relative to the machine. */
export type ProgramAxis = "none" | "sending" | "armed" | "failed";

/** Is THIS hook's own record open? Independent of `phase` at `disconnected`
 *  — the record deliberately stays open across a link drop (spec's C5
 *  lose-and-degrade), which is exactly why `AxesInput` carries `runOpen`
 *  rather than letting this axis read `phase` alone. */
export type SessionAxis = "none" | "live" | "ended";

/** What the freeze predicate measures — fired, did not fire, or has no
 *  evidence to measure at all — named for the MEASUREMENT, never for what
 *  the rower is doing. "Coasting" at `idle`, or through a programmed rest
 *  (which resets the freeze run by construction — `nextFreezeRun`'s own
 *  `distanceMeters <= 0` guard), would be the fake-PAUSED mistake wearing
 *  new words: a stroking/coasting pair would misread a genuinely resting
 *  rower as "stroking". `idle`/`picking`/`pairing`/`failed` (no rowing
 *  frames observed yet) and `programming`/`ready`/`disconnected`/`ended`
 *  (no freeze evidence current enough to trust) all report `"unknown"` —
 *  never a claim this module cannot back with a live measurement. */
export type ActivityAxis = "moving" | "frozen" | "unknown";

export interface ConnectedAxes {
  link: LinkAxis;
  program: ProgramAxis;
  session: SessionAxis;
  activity: ActivityAxis;
}

export interface AxesInput {
  phase: ConnectedPhase;
  /** Mirrors `useMonitorSession`'s `freezeRef` verdict —
   *  `isPausedRun(freezeRef.current)` at the instant of derivation. */
  frozen: boolean;
  /** Mirrors `useMonitorSession`'s `runRef`: `true` iff a record is open
   *  (`runRef.current !== null && runRef.current.completedAt === null`). */
  runOpen: boolean;
  /** Whether the most recent `failed` phase left the transport connected.
   *  `null` when there is nothing to ask (every phase but `failed`) — and,
   *  at `failed`, `null` reads exactly like `false`: no evidence of a
   *  surviving link is not evidence of one.
   *
   *  THE DEAD THIRD FACT (M-1, final whole-branch review). This input is
   *  `null` at BOTH production call sites today — `ConnectedInterstitial.
   *  tsx` and `ConnectedSurface.tsx` each hardcode `failureLeavesLinkUp:
   *  null` and neither ever calls `deriveAxes` while `session.phase ===
   *  "failed"` (`ConnectedInterstitial.tsx`'s own early return on that
   *  phase, `ConnectedSurface.tsx`'s own comment on why `"failed"` never
   *  reaches it) — so `deriveLink`'s `"failed"` case is live CODE with no
   *  live CALLER: `failureLeavesLinkUp === true` never actually happens.
   *  "Failed" never reaches a consumer, in other words, not because the
   *  axis is wrong but because nothing today passes a real value.
   *
   *  This is a DOCUMENTED GAP, not a defect to close here — building a
   *  consumer is out of scope for this task. Whoever FIRST passes a real
   *  (non-null) value inherits the NOT_A_MACHINE_REFUSAL-semantics ruling
   *  this axis was built against (a transport-side failure reads `"lost"`,
   *  a genuine `ProgramRejection` the PM5 itself sent reads `"up"` —
   *  `deriveLink`'s own case, above), and the enum-deletion spec that
   *  eventually retires `ConnectedPhase`'s `"failed"` member inherits this
   *  same gap: it cannot verify the `"up"` branch is reachable from real
   *  code either, only that the TYPE still allows it. */
  failureLeavesLinkUp: boolean | null;
  /** Phase LL Task 2 (link-truth design spec §2a): mirrors
   *  `useMonitorSession`'s `SessionState.frameSilence` at the instant of
   *  derivation — `true` whenever the liveness watchdog has declared the
   *  frame stream silent, or an app-lifecycle resume MEASURED a gap past
   *  `SILENCE_THRESHOLD_MS` and is treating it as
   *  suspect, and the banner's own hysteresis has not yet retracted it.
   *  **Not a new axis and not a new state of its own** (spec §2a's own
   *  correction of the first draft, which invented one): this ONLY feeds
   *  `deriveLink`, which routes it onto the EXISTING `"lost"` member — the
   *  same member `phase === "disconnected"` already produces — so
   *  `LostBanner` needs no second treatment to know about. (Phase LM moved
   *  where that `"lost"` lands: it is the caller's own `linkLost` input
   *  now, not a `SurfaceStatus` member. Nothing about THIS field changed.) */
  frameSilence: boolean;
}

function assertNever(value: never): never {
  throw new Error(
    `connectedAxes: unhandled ConnectedPhase member ${JSON.stringify(value)}`,
  );
}

// The four sub-derivations are exported, not just `deriveAxes`, so each
// `never`-guarded switch's own default branch is independently reachable
// from a test: `deriveAxes` calls them in a fixed order and THROWS on the
// first one that meets an invalid phase, so a single call through the
// composed function can only ever exercise one of the four guards — the
// other three's `assertNever` lines would read as uncovered dead code
// otherwise, exactly the kind of gap recurring failure #2 warns about.

export function deriveLink(input: AxesInput): LinkAxis {
  const { phase, failureLeavesLinkUp, frameSilence } = input;
  switch (phase) {
    case "idle":
      return "none";
    case "picking":
      return "connecting";
    case "pairing":
    case "programming":
    case "ready":
    case "live":
      // "Connected is not programmed" (`connect`'s own comment): `pairing`
      // spans both the transport-connect settle and the wait on the
      // caller's `program()`, and every phase downstream of it still has a
      // live driver until something moves the phase off it. A frozen
      // session is `"live"` (task 5 — `"paused"` retired), so it needs no
      // case of its own here any more than it ever needed a SEPARATE one.
      //
      // Phase LL Task 2 (§2a): `frameSilence` demotes exactly this group
      // to `"lost"` — a driver that is technically still connected but
      // whose frame stream has gone quiet past the watchdog's threshold
      // (or an app-lifecycle resume whose MEASURED gap exceeded the
      // threshold — never a resume by itself) is a link the
      // rower cannot trust any more than a genuine `onDisconnect` would
      // be, and both land on the identical `"lost"` -> `stale` ->
      // `LostBanner` treatment (§2a: "one honest axis"). `picking` is
      // deliberately excluded from this check (its own `"connecting"`
      // case above never reaches here) — the watchdog cannot even be
      // armed yet at that phase (Task 1's arming rule: first valid 0x0031
      // AFTER connect).
      return frameSilence ? "lost" : "up";
    case "failed":
      return failureLeavesLinkUp === true ? "up" : "lost";
    case "disconnected":
      return "lost";
    case "ended":
      // The link was up a moment ago — every path that reaches `ended`
      // passes through a connected phase first — and nothing here retracts
      // that. A link that drops AFTER `ended` is swallowed by the P3b
      // idempotence guard today (`endByMachine`'s own early return on an
      // already-`ended` phase) rather than surfacing as `disconnected`; an
      // existing quirk this module observes, not one it corrects.
      return "up";
    default:
      return assertNever(phase);
  }
}

export function deriveProgram(phase: ConnectedPhase): ProgramAxis {
  switch (phase) {
    case "idle":
    case "picking":
    case "pairing":
      return "none";
    case "programming":
      return "sending";
    case "ready":
    case "live":
      return "armed";
    case "failed":
      return "failed";
    case "disconnected":
    case "ended":
      // Moot once the link is gone or the session is over: "armed" would
      // claim the machine still holds a program worth acting on.
      return "none";
    default:
      return assertNever(phase);
  }
}

export function deriveSession(input: AxesInput): SessionAxis {
  const { phase, runOpen } = input;
  switch (phase) {
    case "idle":
    case "picking":
    case "pairing":
    case "programming":
    case "ready":
    case "failed":
      return "none";
    case "live":
      return "live";
    case "disconnected":
      // The record deliberately stays open across a link drop (spec's C5
      // lose-and-degrade) — `phase` alone cannot say, so this is the one
      // axis `runOpen` exists to answer.
      return runOpen ? "live" : "none";
    case "ended":
      return "ended";
    default:
      return assertNever(phase);
  }
}

export function deriveActivity(input: AxesInput): ActivityAxis {
  const { phase, frozen } = input;
  switch (phase) {
    case "idle":
    case "picking":
    case "pairing":
    case "programming":
    case "ready":
    case "failed":
    case "disconnected":
    case "ended":
      return "unknown";
    case "live":
      // THE SEAM `paused` RETIRED THROUGH (task 5 — this comment used to
      // predict that retirement; it has now happened). `phase` never left
      // `"live"` for a frozen session even before this task — the hook
      // always published the freeze through `frozen` alongside it — so this
      // branch was already carrying the true signal on its own, and the
      // separate `"paused"` case below it was the redundant one, not this
      // one. `live` + `frozen` decides; `phase` alone never did.
      return frozen ? "frozen" : "moving";
    default:
      return assertNever(phase);
  }
}

export function deriveAxes(input: AxesInput): ConnectedAxes {
  return {
    link: deriveLink(input),
    program: deriveProgram(input.phase),
    session: deriveSession(input),
    activity: deriveActivity(input),
  };
}
