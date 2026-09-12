// The byte-compatibility gate (Phase MD PR 1, spec §5 — rebuilt after the
// anchor pass proved revision 1's could not go red). Three claims; (a) and
// (c) go red under a production mutation, (b) under a fixture regeneration:
//
//  (a) BYTE IDENTITY: the writer, driven with the SAME input the fixture
//      was captured from, produces the SAME bytes. This is the gate that
//      catches an added field AND a renamed one (`seriesDropped` ->
//      `seriesTrimmed` changes the sacrifice fixture's bytes).
//  (b) KEY SET: each fixture's parsed key set equals a literal list, so a
//      reviewer sees a renamed/added field BY NAME rather than as a diff
//      of program bytes. This leg pins the FIXTURE FILES, not the writer —
//      no production change can redden it; it goes red exactly when someone
//      regenerates the fixtures, which is when a reviewer must look.
//  (c) OLD BYTES STILL LOAD: bytes main wrote are accepted by the current
//      reader. `toStrictEqual` here is a courtesy (for these fixtures the
//      reader returns its parse unmodified — a malformed `series` would be
//      stripped, and none of the seven carries one); the `not.toBeNull()`
//      is the assertion that bites when a validator is tightened.
//
// Fixtures were captured by `scripts/capture-monitor-run-fixtures.ts`
// against main at 4aa3d132 (RF11). Never regenerate them to make this
// green.
import { afterEach, describe, expect, it, vi } from "vitest";
import { MONITOR_RUN_SHAPES } from "./fixtures/monitorRunShapes";
import ordinary from "./fixtures/monitorRun-bytes/ordinary.json?raw";
import sacrifice from "./fixtures/monitorRun-bytes/sacrifice-thrown-with-series.json?raw";
import thrownNoSeries from "./fixtures/monitorRun-bytes/thrown-without-series.json?raw";
import v1 from "./fixtures/monitorRun-bytes/v1-record.json?raw";
import partial from "./fixtures/monitorRun-bytes/partial.json?raw";
import summaryDetail from "./fixtures/monitorRun-bytes/summary-detail.json?raw";
import justrow from "./fixtures/monitorRun-bytes/mode-justrow.json?raw";

interface Captured {
  name: string;
  verdict: "saved" | "saved-without-series" | "failed";
  bytes: string | null;
}

const CAPTURED: Record<string, Captured> = Object.fromEntries(
  [ordinary, sacrifice, thrownNoSeries, v1, partial, summaryDetail, justrow]
    .map((raw) => JSON.parse(raw) as Captured)
    .map((c) => [c.name, c]),
);

const KEY = "ergomatic.monitorRun";

// Independent literals (RF21): NOT derived from the MonitorRun type or the
// fixture inputs. A field added to the record shows up here as a named
// diff, and the list is what a reviewer reads.
const BASE_KEYS = [
  "actuals",
  "completedAt",
  "deviceName",
  "logSeed",
  "program",
  "startedAt",
  "terminated",
  "title",
  "v",
  "workoutId",
];
const EXPECTED_KEYS: Record<string, readonly string[]> = {
  ordinary: [...BASE_KEYS, "series"],
  "sacrifice-thrown-with-series": [...BASE_KEYS, "seriesDropped"],
  "v1-record": BASE_KEYS.filter((k) => k !== "logSeed"),
  partial: [...BASE_KEYS, "endedBy", "partial"],
  "summary-detail": [
    ...BASE_KEYS,
    "endedBy",
    "summaryDetail",
    "summaryTotals",
    "verificationBytes",
  ],
  "mode-justrow": [...BASE_KEYS, "mode"],
};

type StoreModule = typeof import("./handoffStore");

async function freshStore(): Promise<StoreModule> {
  vi.resetModules();
  localStorage.clear();
  return import("./handoffStore");
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("byte compatibility of the stored run (spec §5)", () => {
  it("captured seven shapes, and the capture recorded the verdict each one produced", () => {
    expect(Object.keys(CAPTURED).sort()).toStrictEqual(
      MONITOR_RUN_SHAPES.map((s) => s.name).sort(),
    );
    expect(CAPTURED["sacrifice-thrown-with-series"]!.verdict).toBe(
      "saved-without-series",
    );
    expect(CAPTURED["thrown-without-series"]!.verdict).toBe("failed");
    expect(CAPTURED["thrown-without-series"]!.bytes).toBeNull();
    // (b)'s table is tied to the capture: an eighth shape cannot be added
    // and regenerated without a reviewer writing its key list down.
    expect(Object.keys(EXPECTED_KEYS).sort()).toStrictEqual(
      Object.values(CAPTURED)
        .filter((c) => c.bytes !== null)
        .map((c) => c.name)
        .sort(),
    );
  });

  for (const shape of MONITOR_RUN_SHAPES) {
    it(`(a) the writer reproduces the captured bytes for "${shape.name}"`, async () => {
      const store = await freshStore();
      if (shape.throwFirstWrite) {
        const real = localStorage.setItem.bind(localStorage);
        let first = true;
        vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (
          this: Storage,
          k: string,
          v: string,
        ) {
          if (first) {
            first = false;
            throw new Error("QuotaExceededError (simulated)");
          }
          real(k, v);
        });
      }
      const result = store.commit(shape.run.startedAt, null, shape.run);
      expect(result.accepted).toBe(true);
      if (!result.accepted) return;
      expect(result.verdict).toBe(CAPTURED[shape.name]!.verdict);
      expect(localStorage.getItem(KEY)).toBe(CAPTURED[shape.name]!.bytes);
    });
  }

  for (const [name, keys] of Object.entries(EXPECTED_KEYS)) {
    it(`(b) the key set of "${name}" is exactly the pinned list`, () => {
      const bytes = CAPTURED[name]!.bytes;
      expect(bytes).not.toBeNull();
      const parsed = JSON.parse(bytes!) as Record<string, unknown>;
      expect(Object.keys(parsed).sort()).toStrictEqual([...keys].sort());
    });
  }

  for (const [name, captured] of Object.entries(CAPTURED)) {
    if (captured.bytes === null) continue;
    it(`(c) bytes main wrote for "${name}" still load through the current reader`, async () => {
      const store = await freshStore();
      localStorage.setItem(KEY, captured.bytes!);
      store.hydrate();
      const entry = store.currentUnretired();
      expect(entry).not.toBeNull();
      expect(entry!.run).toStrictEqual(JSON.parse(captured.bytes!));
    });
  }
});
