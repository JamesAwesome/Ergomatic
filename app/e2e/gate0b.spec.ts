// GATE 0B CAPTURE HARNESS — board 1 (members M1, M1b, M2).
//
// Renders the SAME machine row twice, identical but for how it closed, so
// that M1b's conditional is something James SEES rather than something the
// spec asserts: RATE is the monitor's own average on a finished piece and
// OUR weighted mean over the splits on a terminated one
// (`logbookDerived.ts:43`, `if (input.finished) return input.avgStrokeRate`).
//
// The terminated row's 0x0039 average is 52 — DOUBLE the real 26 — because
// that is what the monitor actually reports on a terminate
// (`pm5-interface-notes.md` §27.6: "0x0039's Average Stroke Rate reads
// exactly DOUBLE on a terminate", with the PM5's own View Detail screen
// photographed at 23 against the wire's 46). The conditional exists to keep
// that number off the screen; the fixture reproduces the case it guards.
//
// Throwaway: deleted by the PR that implements board 1's ruling.
import fs from "node:fs";
import path from "node:path";
import { test, expect, type Page } from "@playwright/test";
import { RUN_ID, signInViaBackdoor } from "./helpers";

const OUT = path.resolve(
  process.cwd(),
  "../docs/design/number-provenance/gate0b",
  process.env.GATE0B_OUT ?? "before",
);

/** A trace whose WORKING strokes average ~140 bpm. The table's HR column
 *  reads the monitor's own per-interval figures (152 / 148), and
 *  `deriveAverageHeartRate` reads this — the 3.5-15.2 bpm gap the pass
 *  measured, in one frame, so it can be checked by eye (RF7). */
function traceWithHr() {
  const samples = [];
  for (let i = 0; i <= 120; i++) {
    samples.push({
      t: i * 10,
      d: i * 40,
      p: 1240,
      spm: i < 60 ? 25 : 28,
      hr: 138 + (i % 5),
    });
  }
  return { samples };
}

function machineRow(opts: {
  title: string;
  endedBy?: string;
  spm: number;
  withHr?: boolean;
}) {
  const step = (
    split: number,
    secs: number,
    spm: number,
    cal: number,
    calHr: number,
    watts: number,
    restM: number,
  ) => ({
    label: "250m @ 2:07.0",
    targetSplit: 127.0,
    actualSplit: split,
    actualSeconds: secs,
    actualSource: "pm5",
    meters: 250,
    actualMeters: 250,
    actualSpm: spm,
    machineCalories: cal,
    machineCalPerHour: calHr,
    machineWatts: watts,
    machineDragFactor: 100,
    machineRestHr: null,
    machineRestSeconds: 60,
    machineRestMeters: restM,
    ...(opts.withHr === true ? { avgHr: restM === 147 ? 152 : 148 } : {}),
  });
  return {
    workoutId: null,
    workoutTitle: opts.title,
    workoutType: "AT",
    deviceName: "PM5 432331249",
    source: "pm5",
    held: "under",
    effort: 3,
    notes: null,
    avgSplitSeconds: 124.0,
    timeSeconds: 244,
    distanceMeters: 742,
    restSeconds: 120,
    restMeters: 242,
    advancesPlan: false,
    ...(opts.endedBy !== undefined ? { endedBy: opts.endedBy } : {}),
    ...(opts.withHr === true ? { series: traceWithHr() } : {}),
    steps: [
      step(135.8, 67.9, 25, 16, 848, 140, 147),
      step(112.2, 56.1, 28, 16, 1026, 248, 95),
    ],
    machineWorkSeconds: 124.0,
    machineWorkMeters: 500,
    machineSummary: {
      avgPaceSecondsPer500m: 124.0,
      avgStrokeRate: opts.spm,
      dragFactorAverage: 100,
      totalCalories: 32,
      avgWatts: 184,
      avgCalPerHour: 931,
      totalRestMeters: 242,
    },
  };
}

async function seedAndOpen(page: Page, body: unknown): Promise<void> {
  const id = await page.evaluate(async (b) => {
    const res = await fetch("/api/logs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(b),
    });
    const text = await res.text();
    if (!res.ok) throw new Error(text);
    return (JSON.parse(text) as { id: string }).id;
  }, body);
  await page.goto(`/today/log/${id}`);
}

for (const [orient, size] of [
  ["portrait", { width: 390, height: 844 }],
  ["landscape", { width: 844, height: 390 }],
] as const) {
  test(`gate 0B board 1: the same row finished and terminated, ${orient}`, async ({
    page,
  }) => {
    test.setTimeout(180_000);
    await page.setViewportSize(size);
    await signInViaBackdoor(page, {
      email: `gate0b-${orient}-${RUN_ID}@e2e.test`,
      name: "Gate 0B",
    });
    fs.mkdirSync(OUT, { recursive: true });

    // FINISHED: no `endedBy`, so `sessionStrokeRate` returns the monitor's
    // own 26 verbatim.
    await seedAndOpen(page, machineRow({ title: "Finished piece", spm: 26 }));
    await expect(
      page.getByRole("heading", { name: "Finished piece" }),
    ).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    const tiles = page.getByTestId("summary-machine-tier");
    await expect(tiles).toBeVisible();
    await tiles.scrollIntoViewIfNeeded();
    await tiles.screenshot({
      path: path.join(OUT, `tiles-finished-${orient}.png`),
    });

    // TERMINATED: `endedBy: "rower"`, and the monitor's 0x0039 average reads
    // DOUBLE (§27.6). The guard drops it and our weighted split mean shows.
    await seedAndOpen(
      page,
      machineRow({
        title: "Terminated piece",
        endedBy: "rower",
        spm: 52,
      }),
    );
    await expect(
      page.getByRole("heading", { name: "Terminated piece" }),
    ).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    await expect(tiles).toBeVisible();
    await tiles.scrollIntoViewIfNeeded();
    await tiles.screenshot({
      path: path.join(OUT, `tiles-terminated-${orient}.png`),
    });

    // M1 + M2 IN ONE FRAME: the six tiles, the `PM5 · PER INTERVAL` eyebrow,
    // and the table under it. Two of the table's six data columns are OURS
    // (`summaryModel.ts:204-210` says so in its own comment), and the AVG HR
    // tile is our trace mean sitting directly above the monitor's own
    // per-interval HR column. Both readable by eye in one capture, which is
    // the only way a contradiction of this kind gets caught (RF7).
    await seedAndOpen(
      page,
      machineRow({ title: "Heart rate gap", spm: 26, withHr: true }),
    );
    await expect(
      page.getByRole("heading", { name: "Heart rate gap" }),
    ).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    const block = page.locator(".machine-summary-block");
    await expect(block).toBeVisible();
    await expect(tiles).toBeVisible();
    await tiles.scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(OUT, `block-hr-${orient}.png`) });
    await block.screenshot({ path: path.join(OUT, `table-${orient}.png`) });
  });
}
