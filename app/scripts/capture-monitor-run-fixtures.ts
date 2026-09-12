// Drives the hand-off store's REAL writer over the seven shapes in
// `src/monitor/fixtures/monitorRunShapes.ts` and writes the bytes each
// one leaves under MONITOR_RUN_KEY to `src/monitor/fixtures/monitorRun-
// bytes/<name>.json`. Run ONCE against main before Phase MD PR 1's move
// (RF11), and again only when the stored shape deliberately changes.
//
//   pnpm exec tsx scripts/capture-monitor-run-fixtures.ts
//
// Node has no `localStorage` (the repo runs with
// --no-experimental-webstorage); the shim below is the smallest thing the
// store's `safeSetItem`/`safeGetItem`/`safeRemoveItem` need, plus a
// one-shot throw so the sacrifice path runs for the shapes that ask for it.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const OUT = join(here, "..", "src", "monitor", "fixtures", "monitorRun-bytes");

let throwNext = false;
const store = new Map<string, string>();
Object.defineProperty(globalThis, "localStorage", {
  configurable: true,
  value: {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => {
      if (throwNext) {
        throwNext = false;
        throw new Error("QuotaExceededError (simulated, first write only)");
      }
      store.set(k, v);
    },
    removeItem: (k: string) => {
      store.delete(k);
    },
    clear: () => store.clear(),
  },
});

const { MONITOR_RUN_SHAPES } =
  await import("../src/monitor/fixtures/monitorRunShapes.ts");
const handoff = await import("../src/monitor/handoffStore.ts");
const KEY = "ergomatic.monitorRun";

mkdirSync(OUT, { recursive: true });
for (const shape of MONITOR_RUN_SHAPES) {
  handoff.resetForTests();
  store.clear();
  throwNext = shape.throwFirstWrite;
  const result = handoff.commit(shape.run.startedAt, null, shape.run);
  if (!result.accepted) {
    throw new Error(`${shape.name}: commit refused (${result.reason})`);
  }
  const bytes = store.get(KEY) ?? null;
  const out = { name: shape.name, verdict: result.verdict, bytes };
  writeFileSync(
    join(OUT, `${shape.name}.json`),
    JSON.stringify(out, null, 2) + "\n",
  );
  console.log(
    `${shape.name}: ${result.verdict}, ${bytes === null ? "no bytes" : `${bytes.length} bytes`}`,
  );
}
