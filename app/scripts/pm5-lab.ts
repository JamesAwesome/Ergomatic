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

const log = createEventLog();
const transport = createWebBluetoothTransport();
let driver: MonitorDriver | null = null;

function out(line: string): void {
  console.log(line);
  const el = document.querySelector<HTMLDivElement>("#log");
  if (el) el.textContent = `${el.textContent ?? ""}${line}\n`;
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

onClick("program", async () => {
  if (!driver) {
    out("program(): connect first");
    return;
  }
  await driver.program(TEST_PROGRAM);
  out("program(): acked, armed");
});

onClick("terminate", async () => {
  if (!driver) {
    out("terminate(): connect first");
    return;
  }
  await driver.terminate();
  out("terminate(): acked");
});

onClick("disconnect", async () => {
  if (!driver) {
    out("disconnect(): connect first");
    return;
  }
  await driver.disconnect();
  out(
    "disconnect(): requested (caller-initiated — should NOT log a 'disconnected' MonitorEvent; watch the log above)",
  );
});

onClick("dump", () => {
  out("---- exportLog() ----");
  out(log.exportLog());
});
