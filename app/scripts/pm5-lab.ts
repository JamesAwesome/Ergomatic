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
// 6. Record what you observe against each §17 item's expected reading;
//    append the results to §18 ("Laptop session observations").

import { createWebBluetoothTransport } from "../src/monitor/transports/webBluetooth";
import { createPm5Driver } from "../src/monitor/driver";
import { createEventLog } from "../src/monitor/eventLog";
import type { MonitorDriver, MonitorEvent } from "../domain/monitor/types";
import type { WorkoutProgram } from "../domain/monitor/program";

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
 *  7 frames, so a PM that only keeps the last frame's intervals shows it
 *  immediately. */
const MANY_PROGRAM: WorkoutProgram = {
  intervals: Array.from({ length: 25 }, () => ({
    kind: "distance" as const,
    value: 500,
    targetSplit: 120,
    displaySpm: null,
    restSeconds: 120,
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

const SHORT_PROGRAM: WorkoutProgram = {
  intervals: Array.from({ length: 3 }, () => ({
    kind: "distance" as const,
    value: 500,
    targetSplit: 120,
    displaySpm: null,
    restSeconds: 60,
  })),
};

const log = createEventLog();
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
  driver = createPm5Driver(transport, log);
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
  "program-short": () =>
    programNamed("program(3 intervals, §17 #6)", SHORT_PROGRAM),
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
