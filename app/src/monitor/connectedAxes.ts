// Four axes derived — never invented — from today's `ConnectedPhase` plus
// the three facts the hook does not publish on its own (design spec
// docs/superpowers/specs/2026-08-15-connected-axes-design.md §1): the freeze
// predicate's own verdict (`frozen`, mirrors `useMonitorSession`'s
// `freezeRef` via `isPausedRun`), whether this hook's own record is still
// open (`runOpen`, mirrors `runRef` — `disconnected` deliberately leaves the
// record open, so `phase` alone cannot say what `session` should read), and
// whether a `failed` program attempt left the transport connected
// (`failureLeavesLinkUp`, computed by the CALLER from `ConnectedError.reason`
// — a genuine `ProgramRejection` the PM5 itself sent leaves the link up; a
// radio/transport failure on our own side does not — this module only
// consumes the already-computed boolean, it does not classify reasons).
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
// PRECEDENCE FOR THE COLLAPSE TO ONE `SurfaceStatus` (this module still
// answers four separate questions, never one — the collapse lives in the
// CALLER): `stale` (the link is lost) beats `armed` (a program sits on the
// machine with no session open yet) beats `paused` (the freeze predicate
// fired) beats `live` (everything else). `"ended"` is not part of that
// collapse at all — the caller renders its own hand-off frame for it and
// never reaches the axes-to-status decision. Realized in exactly one place
// (task 2, connected-axes design spec §1): `ConnectedSurface.tsx`'s own
// call to `deriveAxes`, whose comment carries this same order. There is no
// `surfaceStatusFor` any more — `deriveAxes` plus that one caller-side
// ternary replaced it, and the `?? "live"` laundering §F3 named is gone
// with it.

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
  const { phase, failureLeavesLinkUp } = input;
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
      return "up";
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
