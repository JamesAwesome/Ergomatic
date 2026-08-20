import { test, expect } from "@playwright/test";
import { signInViaBackdoor } from "./helpers";

// Phase LT spec 2 (`docs/superpowers/specs/2026-08-19-series-capture-design.md`),
// Task 4. §4's S2 check: "An empirical probe test in the e2e layer
// (Chrome): write a worst-case record + series, read it back byte-
// identical." The claim under test is a raw storage-mechanism one — does
// web storage on the shipped browser actually hold and return a ~720 KB
// value unmodified — so this drives `localStorage` directly, in-page,
// against the real compose stack's own served origin, never through the
// app's UI (there is no UI path that ever holds a value this large in one
// write; the recorder decimates it into place over a whole session, §2's
// flush policy). No sign-in strictly required for a same-origin storage
// read/write, but this signs in anyway (`signInViaBackdoor`) so the test
// runs against the SAME real page/origin every other e2e spec does, not a
// bare unauthenticated shell — cheap, and it keeps this file's "real
// Chrome, real origin" claim honest end to end.
//
// A worst-case `MonitorRun.series`: `SERIES_SAMPLE_CAP` (14,400) samples,
// each carrying every optional field (`hr` present — §1's own "50.0
// B/sample with hr present -> 720 KB worst case" arithmetic), `truncated:
// true` (the cap was reached). The record around it is a minimal-but-
// real-shaped `MonitorRun` (`monitorRun.ts`'s own fields) — this probe is
// about the STORAGE MECHANISM, not `isMonitorRun`'s validation (that is
// covered on the unit side, `monitorRun.test.ts`'s own round-trip suite);
// nothing here imports the app's TS modules — same "drives the app from
// OUTSIDE" constraint every Playwright spec in this repo has.
const WORST_CASE_SAMPLE_COUNT = 14_400;

test.describe("S2: web storage holds the worst-case series byte-identical, in a real Chrome context (§4)", () => {
  test("a ~720 KB worst-case MonitorRun round-trips through localStorage.setItem/getItem byte-identical", async ({
    page,
  }) => {
    await signInViaBackdoor(page, {
      email: "s2-storage-probe@e2e.test",
      name: "S2 Storage Probe",
    });

    const result = await page.evaluate((sampleCount) => {
      const samples = Array.from({ length: sampleCount }, (_, i) => ({
        t: (i + 1) * 10,
        d: (i + 1) * 34,
        p: Math.round(120 * 10 + (i % 40)),
        spm: 20 + (i % 10),
        hr: 130 + (i % 60),
      }));
      const record = {
        v: 2,
        workoutId: null,
        title: "S2 worst-case probe",
        program: { intervals: [] },
        actuals: [],
        deviceName: "PM5 918273645",
        startedAt: new Date(0).toISOString(),
        completedAt: new Date(sampleCount * 1000).toISOString(),
        terminated: false,
        series: { samples, truncated: true },
      };
      const json = JSON.stringify(record);
      const key = "ergomatic.s2-worst-case-probe";
      let threw: string | null = null;
      try {
        localStorage.setItem(key, json);
      } catch (err) {
        threw = err instanceof Error ? err.message : String(err);
      }
      const readBack = localStorage.getItem(key);
      localStorage.removeItem(key);
      return {
        writtenLength: json.length,
        threw,
        readBack,
        byteIdentical: readBack === json,
        sampleCount: samples.length,
      };
    }, WORST_CASE_SAMPLE_COUNT);

    // Sanity on the fixture itself: this really is the ~720 KB worst case
    // the spec's own arithmetic names (§1: "50.0 B/sample with hr present
    // -> 720 KB worst case"), not an accidentally-smaller stand-in.
    expect(result.sampleCount).toBe(WORST_CASE_SAMPLE_COUNT);
    expect(result.writtenLength).toBeGreaterThan(700_000);

    // The check itself: no throw on the write, and the read-back string
    // is IDENTICAL to what was written — not merely equal after a
    // round-trip through JSON (a byte-for-byte string compare, catching
    // any mangling `setItem`/`getItem` themselves might introduce, which
    // a parse-then-deep-equal comparison would silently paper over).
    expect(
      result.threw,
      "a worst-case series write must not throw under normal (non-exhausted) storage conditions",
    ).toBeNull();
    expect(result.readBack).not.toBeNull();
    expect(result.byteIdentical).toBe(true);
  });
});
