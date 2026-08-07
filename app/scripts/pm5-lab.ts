// The laptop-vs-real-PM5 lab harness (final-review M-5): before this file,
// `createWebBluetoothTransport` had ZERO call sites anywhere in the repo —
// James had nothing to launch at the erg. This wires the one Chromium-
// capable Transport straight to the real driver and a real event log, with
// console output plus an on-page `exportLog()` dump. NOT product UI: no
// design-system components, no CSS custom properties, no screen this
// phase's conventions apply to — same "compile-tested shapes only" ceiling
// `capacitorBle.ts`/`webBluetooth.ts` themselves carry (excluded from the
// coverage gate, vitest.config.ts, and from mutation testing).
//
// Launch (docs/monitor/pm5-interface-notes.md §17's own setup steps):
// 1. Wake the PM5 (row a stroke, or press any button on the monitor) so it
//    starts BLE advertising.
// 2. From `app/`, run `pnpm dev`.
// 3. Open Chrome (Web Bluetooth is Chromium-only — docs/superpowers/
//    research/2026-07-27-pm5-ble-research.md) at
//    http://localhost:5173/scripts/pm5-lab.html
// 4. Click "Scan & connect" and pick the PM5 from the browser's own device
//    picker (a user gesture is required for `requestDevice`, which is why
//    this is a button, not something that runs on page load).
// 5. Use "Program test workout" / "Terminate" / "Disconnect" to drive the
//    scenarios §17's items name; watch this page's log AND the devtools
//    console (identical output, `out()` writes both). "Dump event log"
//    prints `eventLog.exportLog()` — the full chunk-by-chunk trace design
//    spec §5 describes.
// 5b. Two REMOTE-only commands, `settle-off` and `settle-on`, flip
//    `program()`'s prepare-settle wait for the NEXT driver this page builds
//    (`settleDisabled` below) — sessions 4a step 2 and 4b step 2 need the
//    settle off to reproduce the empty arm. Send the command, then click
//    Scan & connect again; there is no button for either, deliberately (a
//    session that silently ran with the settle off would be worse than one
//    that needed a reconnect).
// 6. Record what you observe against each §17 item's expected reading;
//    append the results to §18 ("Laptop session observations").

import { createWebBluetoothTransport } from "../src/monitor/transports/webBluetooth";
import { createPm5Driver } from "../src/monitor/driver";
import { createEventLog } from "../src/monitor/eventLog";
import type { MonitorDriver, MonitorEvent } from "../domain/monitor/types";
import type { MonitorEventLog } from "../src/monitor/eventLog";
import type { WorkoutProgram } from "../domain/monitor/program";

/**
 * Fix-round 1, F4: without a `verifyTicks` bound, `program()`'s
 * verification phase waits forever — the exact hardware case laptop
 * session 1 hit (a `0x01` ack for a total no-op, D2) would leave this
 * script's "Program test workout" button spinning in total silence, with
 * nothing to press and nothing in the log explaining why.
 *
 * 20 ticks. The laptop session observed GENERAL_STATUS notifications
 * arriving at roughly 2/second in practice (interface-notes.md §18) —
 * NOT the 10/second the fastest documented sample rate
 * (`buildSampleRateConfig`, §4) would suggest, so this budgets against the
 * OBSERVED cadence, not the requested one. 20 ticks at ~2/s is ~10 real
 * seconds — generous enough to absorb the PM's own Appendix-E auto-cycle
 * (Terminate -> Rearm -> WaitToBegin) plus normal BLE jitter, while still
 * bounded: a silent monitor now fails loudly (`"not-observed"`) instead of
 * hanging the page forever.
 */
const VERIFY_TICKS = 20;

/** One real interval, well inside every Table 19 minimum (interface-
 *  notes.md §8) — enough to drive `program()` -> `armed` -> `terminate()`
 *  without hand-authoring a whole workout for a session that's about
 *  observing the PM5's real behavior, not the compiler (that's
 *  `domain/monitor/program.test.ts`'s job). */
const TEST_PROGRAM: WorkoutProgram = {
  intervals: [
    {
      kind: "time",
      value: 60,
      targetSplit: 120,
      displaySpm: 24,
      restSeconds: 30,
    },
  ],
};

/** §17 item 4 (zero-vs-omit for a no-target interval): the same shape with
 *  `targetSplit: null`, so the question needs a command rather than an edit
 *  and a reload mid-session. */
const NO_TARGET_PROGRAM: WorkoutProgram = {
  intervals: [{ ...TEST_PROGRAM.intervals[0]!, targetSplit: null }],
};

/** §17 item 5 (multi-frame retention — the codec's least-confident fact):
 *  25 intervals is Sea Smoke's shape, which `buildFrameGroups` splits into
 *  7 frames, so a PM that only keeps the last frame's intervals is
 *  detectable. Intervals are the Table 19 MINIMUM (100m, §8) with no rest,
 *  because the armed screen does not show a full interval readout — the
 *  count can only be read by ROWING into the program and watching the
 *  interval counter advance, and 100m reps make each boundary ~25s of easy
 *  rowing instead of 500m's ~2min. Rowing 2-3 boundaries also converts two
 *  never-observed actual shapes in one go (§17: a DISTANCE interval's
 *  actual, and a MIDDLE boundary of a big program); rest 0 matches the
 *  no-rest shape hardware already accepted and ran for TIME (§19.8). */
const MANY_PROGRAM: WorkoutProgram = {
  intervals: Array.from({ length: 25 }, () => ({
    kind: "distance" as const,
    value: 100,
    targetSplit: 120,
    displaySpm: null,
    restSeconds: 0,
  })),
};

/** §17 item 6 (no wipe/reset): program this straight after MANY_PROGRAM
 *  without power-cycling — a stale tail shows up as intervals 4..25
 *  surviving on the monitor. */
/** Laptop session 1 discriminator: TWO TIME intervals. The one program the
 *  PM accepted was a single TIME interval; every rejected one was DISTANCE.
 *  This separates "multi-interval is broken" from "distance encoding is
 *  broken" — they were confounded until now. */
const TWO_TIME_PROGRAM: WorkoutProgram = {
  intervals: Array.from({ length: 2 }, () => ({
    kind: "time" as const,
    value: 60,
    targetSplit: 120,
    displaySpm: null,
    restSeconds: 30,
  })),
};

/** §17 item 13 (the no-rest work→work boundary): TWO TIME intervals with NO
 *  rest between them — the program that produced the laptop session 2
 *  reading which ANSWERED this item (interface-notes.md §19.8): 0x0037 read
 *  `1` (forward-attributed) while 0x0033 read `0` (identity) at the same
 *  work0→work1 boundary, still `"rowing"` throughout. The driver's old
 *  `index-unverified` log entry, which existed to flag this exact
 *  boundary shape while the reading was still missing, is retired now that
 *  it isn't — `domain/monitor/pm5/intervalIndex.ts`'s `toActualIndex`
 *  applies the forward-attributed offset unconditionally for
 *  `IntervalActual.index`. Kept here (and in the `REMOTE` map below) since
 *  it remains the harness program for re-confirming this shape on a future
 *  session, not only for discovering it the first time. */
const TWO_TIME_NO_REST_PROGRAM: WorkoutProgram = {
  intervals: Array.from({ length: 2 }, () => ({
    kind: "time" as const,
    value: 60,
    targetSplit: 120,
    displaySpm: null,
    restSeconds: 0,
  })),
};

const SHORT_PROGRAM: WorkoutProgram = {
  intervals: Array.from({ length: 3 }, () => ({
    kind: "distance" as const,
    value: 500,
    targetSplit: 120,
    displaySpm: null,
    restSeconds: 60,
  })),
};

/** Session-3 live bisect: `program-many` (25×100m rest 0, 7 frames) armed
 *  EMPTY (`:00`, no boundary past 100m) while `program-short` (3×500m rest
 *  60, single frame) armed correctly — three variables differ, so three
 *  one-variable probes, each read off the monitor with NO rowing. Named for
 *  the variable they isolate against SHORT_PROGRAM's known-good shape. */
const BISECT_100M: WorkoutProgram = {
  // only the VALUE changes vs SHORT (500 → 100, the Table 19 minimum)
  intervals: Array.from({ length: 3 }, () => ({
    kind: "distance" as const,
    value: 100,
    targetSplit: 120,
    displaySpm: null,
    restSeconds: 60,
  })),
};
const BISECT_REST0: WorkoutProgram = {
  // only the REST changes vs SHORT (60 → 0)
  intervals: Array.from({ length: 3 }, () => ({
    kind: "distance" as const,
    value: 500,
    targetSplit: 120,
    displaySpm: null,
    restSeconds: 0,
  })),
};
const BISECT_FRAMES: WorkoutProgram = {
  // only the COUNT changes vs SHORT (3 → 25: multi-frame, like fix-1's
  // original MANY shape)
  intervals: Array.from({ length: 25 }, () => ({
    kind: "distance" as const,
    value: 500,
    targetSplit: 120,
    displaySpm: null,
    restSeconds: 60,
  })),
};

/** Round 2: every single variable armed correctly (100m ✓, rest0 ✓,
 *  25-count/7-frames ✓) while the triple (25×100m r0) arms EMPTY — so the
 *  defect is an interaction. Two pair-probes isolate which pair. */
const BISECT_PAIR_COUNT_VALUE: WorkoutProgram = {
  // 25 × 100m, rest 60 — count+value together, rest normal
  intervals: Array.from({ length: 25 }, () => ({
    kind: "distance" as const,
    value: 100,
    targetSplit: 120,
    displaySpm: null,
    restSeconds: 60,
  })),
};
const BISECT_PAIR_VALUE_REST: WorkoutProgram = {
  // 3 × 100m, rest 0 — value+rest together, count small
  intervals: Array.from({ length: 3 }, () => ({
    kind: "distance" as const,
    value: 100,
    targetSplit: 120,
    displaySpm: null,
    restSeconds: 0,
  })),
};

/**
 * Session 4a/4b's own switch (fix-3 plan Task 3, design spec §Session-4a
 * step 2 and §Session-4b step 2): `settle-off` makes the NEXT driver
 * constructed here pass `prepareSettleTicks: 0`, disabling `program()`'s
 * prepare-settle wait entirely; `settle-on` puts it back to the default.
 * Both are REMOTE commands, so the two erg sessions that need the settle
 * disabled — 4a's empty-arm capture and 4b's detection row — need no code
 * edit and no rebuild at the erg.
 *
 * Consumed at DRIVER CONSTRUCTION (the `connect` handler below), which is
 * the only safe place: `createPm5Driver` subscribes to five
 * characteristics and has no teardown, so rebuilding a live driver would
 * leave the old one's subscriptions double-processing every notification.
 * Toggling therefore takes effect on the next **Scan & connect** — the
 * command says so in its own output rather than leaving the operator to
 * find out from the trace.
 */
let settleDisabled = false;

function driverOptions(): Parameters<typeof createPm5Driver>[2] {
  return settleDisabled
    ? { verifyTicks: VERIFY_TICKS, prepareSettleTicks: 0 }
    : { verifyTicks: VERIFY_TICKS };
}

/** The one phrasing of "which mode is this", used by the toggle, by the
 *  connect handler, and by the log entry each of them writes — so the page,
 *  the console and `exportLog()` can never disagree about it. */
function settleModeLine(): string {
  return settleDisabled
    ? "settle OFF (prepareSettleTicks=0) — program() sends its frames straight after the prepare ack"
    : "settle ON (prepareSettleTicks=default) — program() waits for armed+1 when the prepare fires against a rowing/resting machine";
}

function setSettle(disabled: boolean): void {
  settleDisabled = disabled;
  const line = settleModeLine();
  out(
    `${line}${
      driver
        ? " — takes effect on the NEXT Scan & connect (the live driver keeps the setting it was built with)"
        : " — will apply to the driver built by Scan & connect"
    }`,
  );
  // Into the EXPORTED log too, not just the page (review IMPORTANT-6):
  // sessions 4a step 2/3 and 4b step 2 exist to compare settle-off against
  // settle-on, and `exportLog()`'s dump is the artifact those readings get
  // written up from. Absence of `prepare-settle` entries is ambiguous
  // evidence on its own — it also means "the prior state wasn't rowing" —
  // so the mode has to be stated, not inferred.
  log.record("settle-mode", `${line} (requested; not yet applied)`);
}

const rawLog = createEventLog();
// Fix-round 1, F4: taps every entry as it's recorded so the page/console
// gets a live line the INSTANT verification begins — `sendSequence`
// records `"programmed"` the moment the real send acks, which is exactly
// when `program()` moves from "sent" to "waiting for the machine to say
// armed" (driver.ts's own `verifyArmed` call). Without this, "Program
// test workout" prints "sending…" and then nothing until it either
// resolves or the `VERIFY_TICKS` bound above rejects it — indistinguishable
// from a hung network call.
const log: MonitorEventLog = {
  record(kind, detail) {
    rawLog.record(kind, detail);
    if (kind === "programmed") {
      out(
        `verify: machine acked the send — waiting up to ${VERIFY_TICKS} status tick(s) (~2/s ⇒ ~${Math.round(VERIFY_TICKS / 2)}s) for it to report "armed"…`,
      );
    }
  },
  entries: () => rawLog.entries(),
  exportLog: () => rawLog.exportLog(),
};
const transport = createWebBluetoothTransport();
let driver: MonitorDriver | null = null;

/** The optional second seat (scripts/pm5-bridge.mjs). Every line this page
 *  prints is mirrored there, and commands enqueued there are executed here —
 *  so a session can be driven from a laptop while the rower rows. All of it
 *  is best-effort: with no bridge running, every call fails silently and the
 *  page behaves exactly as it did before. */
const BRIDGE = "http://127.0.0.1:5178";

function mirror(line: string): void {
  void fetch(`${BRIDGE}/log`, { method: "POST", body: line }).catch(() => {});
}

function out(line: string): void {
  console.log(line);
  const el = document.querySelector<HTMLDivElement>("#log");
  if (el) el.textContent = `${el.textContent ?? ""}${line}\n`;
  mirror(line);
}

function wireEvents(d: MonitorDriver): void {
  d.events((e: MonitorEvent) => {
    out(`[event] ${JSON.stringify(e)}`);
  });
}

function onClick(id: string, handler: () => void | Promise<void>): void {
  const el = document.querySelector<HTMLButtonElement>(`#${id}`);
  el?.addEventListener("click", () => {
    void Promise.resolve(handler()).catch((err: unknown) => {
      out(`ERROR: ${String(err)}`);
    });
  });
}

onClick("connect", async () => {
  const [found] = await transport.scan();
  if (!found) {
    out("scan(): no device returned");
    return;
  }
  out(`scan(): found ${found.name} (${found.id})`);
  await transport.connect(found.id);
  out("connect(): ok");
  driver = createPm5Driver(transport, log, driverOptions());
  // The mode this driver was actually BUILT with — the entry every dump
  // carries, distinct from the "requested" one `setSettle` writes.
  log.record("settle-mode", `${settleModeLine()} (active for this driver)`);
  out(settleModeLine());
  wireEvents(driver);
  out(`capabilities: ${JSON.stringify(driver.capabilities)}`);
});

async function programNamed(
  name: string,
  program: WorkoutProgram,
): Promise<void> {
  if (!driver) {
    out(`${name}: connect first`);
    return;
  }
  out(`${name}: sending ${program.intervals.length} interval(s)…`);
  await driver.program(program);
  out(`${name}: acked, armed`);
}

async function terminate(): Promise<void> {
  if (!driver) {
    out("terminate(): connect first");
    return;
  }
  await driver.terminate();
  out("terminate(): acked");
}

async function disconnect(): Promise<void> {
  if (!driver) {
    out("disconnect(): connect first");
    return;
  }
  await driver.disconnect();
  out(
    "disconnect(): requested (caller-initiated — should NOT log a 'disconnected' MonitorEvent; watch the log above)",
  );
}

function dump(): void {
  out("---- exportLog() ----");
  out(log.exportLog());
}

/** What the bridge may trigger. `connect` is absent on purpose: Web
 *  Bluetooth's `requestDevice` needs a real user gesture, so the person at
 *  the erg always clicks that one themselves. */
const REMOTE: Record<string, () => void | Promise<void>> = {
  program: () => programNamed("program()", TEST_PROGRAM),
  "program-no-target": () =>
    programNamed("program(no-target, §17 #4)", NO_TARGET_PROGRAM),
  "program-many": () =>
    programNamed("program(25 intervals, §17 #5)", MANY_PROGRAM),
  "program-two-time": () =>
    programNamed("program(2 TIME intervals, discriminator)", TWO_TIME_PROGRAM),
  "program-no-rest": () =>
    programNamed(
      "program(2 TIME intervals, NO rest, §17 #13)",
      TWO_TIME_NO_REST_PROGRAM,
    ),
  "program-short": () =>
    programNamed("program(3 intervals, §17 #6)", SHORT_PROGRAM),
  "bisect-100m": () =>
    programNamed("bisect(3×100m r60 — isolates VALUE)", BISECT_100M),
  "bisect-rest0": () =>
    programNamed("bisect(3×500m r0 — isolates REST)", BISECT_REST0),
  "bisect-frames": () =>
    programNamed("bisect(25×500m r60 — isolates COUNT/frames)", BISECT_FRAMES),
  "bisect-count-value": () =>
    programNamed(
      "bisect(25×100m r60 — COUNT+VALUE pair)",
      BISECT_PAIR_COUNT_VALUE,
    ),
  "bisect-value-rest": () =>
    programNamed("bisect(3×100m r0 — VALUE+REST pair)", BISECT_PAIR_VALUE_REST),
  "settle-off": () => setSettle(true),
  "settle-on": () => setSettle(false),
  terminate,
  disconnect,
  dump,
  ping: () => out(`ping: driver ${driver ? "connected" : "not connected"}`),
};

onClick("program", () => programNamed("program()", TEST_PROGRAM));
onClick("terminate", terminate);
onClick("disconnect", disconnect);
onClick("dump", dump);

/** Poll the bridge for queued commands. Failures are silent by design — no
 *  bridge running is the ordinary case, and a lab that spams errors when
 *  nobody is watching from a second seat would be worse than useless. */
function pollBridge(): void {
  void fetch(`${BRIDGE}/commands`)
    .then((r) => (r.ok ? (r.json() as Promise<string[]>) : []))
    .then(async (cmds) => {
      for (const cmd of cmds) {
        const handler = REMOTE[cmd];
        if (!handler) {
          out(`remote: unknown command "${cmd}"`);
          continue;
        }
        out(`remote: ${cmd}`);
        try {
          await handler();
        } catch (err: unknown) {
          out(`remote ${cmd} ERROR: ${String(err)}`);
        }
      }
    })
    .catch(() => {});
}

setInterval(pollBridge, 1000);
