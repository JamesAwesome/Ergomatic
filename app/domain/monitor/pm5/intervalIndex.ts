// D3 (docs/monitor/pm5-interface-notes.md §18 #3, PM5 432331249,
// 2026-08-05): a CLEAN 2x(1:00 work / 0:30 rest) session read
// work0 -> idx 0, rest-after-work0 -> idx 1, work1 -> idx 1,
// rest-after-work1 -> idx 2 — a PHANTOM third index on a workout that only
// ever had two intervals. The PM attributes a REST forward, to the interval
// it is heading INTO, while a WORK tick reports its own interval directly;
// this codec's own program indices are 0-based per work interval. The two
// numbering systems are structurally different, not merely offset by one —
// `divergence` never fired that session because `MonitorFrame.intervalIndex`
// (0x0033) and `IntervalActual.index` (0x0037/38) agreed with EACH OTHER
// while both disagreed with the program.
//
// `toProgramIndex` undoes exactly that forward attribution, translating a
// raw machine index (0x0033's Interval Count, or 0x0037/38's Split/Interval
// Number — same base ambiguity, interface-notes.md §15 #1) into OUR
// 0-based-per-work-interval numbering. `src/monitor/driver.ts` is its only
// caller: `MonitorFrame.intervalIndex` and `IntervalActual.index` carry the
// return value of that function, never the raw machine byte, everywhere
// they reach a consumer — the raw value survives only in the event log.
//
// `toMachineIndex` goes the other way, for the ONE caller that has to
// SPEAK the machine's numbering rather than read it: the simulator
// (`src/monitor/transports/fake.ts`), which since Phase 7A-fix Task 4 puts
// genuine forward-attributed values on its synthetic wire so the
// normalization above is exercised end to end instead of both sides
// agreeing on a pre-normalized fiction.
//
// domain/monitor/** imports nothing from src/.

import type { MonitorFrame } from "../types.js";

/**
 * The FORWARD direction: our program index -> the number the machine would
 * put on the wire for it, given the machine's own state. Exists for
 * `src/monitor/transports/fake.ts` (Phase 7A-fix Task 4), which has to
 * synthesize 0x0033's Interval Count and 0x0037/38's Split/Interval Number
 * the way the observed PM5 writes them — and cannot compute the offset
 * itself without putting Concept2 numbering knowledge in `src/`.
 *
 * Deliberately NOT implemented as, or shared with, `toProgramIndex`'s own
 * arithmetic: the fake feeding the driver a value derived from the very
 * function under test would make an end-to-end index assertion tautological
 * (both sides wrong in the same direction still round-trips). These are two
 * independently written functions, each pinned by its own unit test to the
 * §18 #3 observation table, so a mutation to either one breaks the
 * round trip.
 *
 * The observed table (interface-notes.md §18 #3), read in this direction:
 *   - our 0, rowing (work0)                -> machine 0
 *   - our 0, resting (rest after work0)    -> machine 1
 *   - our 1, rowing (work1)                -> machine 1
 *   - our 1, resting (rest after work1)    -> machine 2  (the "phantom")
 *
 * **No clamping, ever, and no upper bound.** The phantom index a real PM5
 * emits past the end of a program (our last interval's trailing rest) is
 * exactly the value this must produce for the driver to have something real
 * to normalize — clamping it here would delete the defect from the fake.
 *
 * **A `"rowing"` tick passes through UNADJUSTED** — the confirmed half of
 * the rule is the resting one. What the machine numbers at a work→work
 * boundary with no intervening rest is genuinely unknown (§17 item 13);
 * this function does not invent an offset for it, so a `restSeconds: 0`
 * boundary round-trips as identity and the driver's `"index-unverified"`
 * log entry — not a fabricated wire value — is the observable that the
 * assumption was in play.
 *
 * **States outside `"resting"`** all pass through: `toProgramIndex`'s own
 * `null` for inactive states is a business rule about which of OUR
 * intervals is current, not a claim that the machine stops writing a byte
 * into the field — a real PM5 puts some number in 0x0033's Interval Count
 * on every status tick, armed and finished included.
 */
export function toMachineIndex(
  programIndex: number,
  machineState: MonitorFrame["state"],
): number {
  return machineState === "resting" ? programIndex + 1 : programIndex;
}

/**
 * `machineIndex` -> our program index, given the machine's own reported
 * `machineState` and the ARMED program's interval count (`programLength`,
 * `WorkoutProgram.intervals.length` — this function takes the count, not
 * the array, so it stays free of `program.ts`'s own type).
 *
 * **The rule** (interface-notes.md §18 #3): a work tick reports its own
 * interval directly (`machineIndex` unchanged); a rest tick reports the
 * interval it is counting DOWN TO, one past the interval whose trailing
 * rest it actually is (`machineIndex - 1` — `ProgramInterval.restSeconds`
 * folds a trailing rest into the interval BEFORE it, so subtracting one
 * re-attaches the rest to the work it belongs to). Checked against the full
 * observed table for a 2-interval program:
 *   - work0, rowing, machineIndex 0 -> candidate 0 -> our 0
 *   - rest-after-work0, resting, machineIndex 1 -> candidate 0 -> our 0
 *   - work1, rowing, machineIndex 1 -> candidate 1 -> our 1
 *   - rest-after-work1, resting, machineIndex 2 -> candidate 1 -> our 1
 * The fourth row is the exact defect: the "phantom" machine index 2 lands
 * squarely on interval 1 (the program's last interval) once the offset is
 * applied — no clamping needed for this specific session's numbers.
 *
 * **Clamping** covers the rule's own boundary shape: a rest reported before
 * any interval has genuinely begun (`machineIndex` 0 while resting ->
 * candidate -1) or a work/rest tick reported one past the program's last
 * interval (`candidate === programLength`) are both exactly what the offset
 * rule itself produces at the two ends of a program — not garbage, just an
 * edge of arithmetic that already has an obvious interval to belong to.
 * Both clamp to the nearest valid index (0, or `programLength - 1`) rather
 * than being rejected.
 *
 * **`null`** is for everything the rule does NOT explain: a candidate more
 * than one step outside `[0, programLength - 1]`, or `programLength <= 0`
 * (no program armed yet, or — unreachable past `compileProgram`'s own
 * "no-work" guard, but this function does not assume a caller already
 * checked — a program with zero intervals). The caller
 * (`src/monitor/driver.ts`) logs this `null` as a `"divergence"` entry: the
 * one that should have fired at the erg and didn't, because the machine's
 * own two fields (0x0033, 0x0037/38) agreed with each other while both
 * disagreed with the program (interface-notes.md §18 #3's own diagnosis).
 *
 * **States outside `"rowing"`/`"resting"`** (`"idle"`, `"armed"`,
 * `"finished"`, `"terminated"`, and any future addition to
 * `MonitorFrame["state"]`) always return `null` — a DELIBERATE choice
 * mirroring `pm5/parse.ts`'s own `toMonitorFrame` business rule ("no
 * interval is ever 'current' while armed/idle/finished/terminated", cited
 * there to the design spec). There is no work/rest distinction to even
 * apply outside an active session; returning anything but `null` here would
 * be inventing a fact this module has no basis for, not reading one off the
 * wire. This also means a call made with an inactive `machineState` is
 * never itself divergence-worthy — the caller only escalates to
 * `"divergence"` when `machineState` WAS `"rowing"`/`"resting"` (a real
 * interval was supposedly current) and this function still returned `null`.
 */
export function toProgramIndex(
  machineIndex: number,
  machineState: MonitorFrame["state"],
  programLength: number,
): number | null {
  if (programLength <= 0) return null;
  if (machineState !== "rowing" && machineState !== "resting") return null;

  const candidate =
    machineState === "resting" ? machineIndex - 1 : machineIndex;

  if (candidate >= 0 && candidate < programLength) return candidate;
  // Exactly one step outside either end — the offset rule's own boundary
  // shape (see this function's own doc comment) — clamp, don't reject.
  if (candidate === -1) return 0;
  if (candidate === programLength) return programLength - 1;
  // More than one step outside the valid range: not explained by the rule
  // at all.
  return null;
}
