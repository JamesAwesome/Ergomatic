// PROVENANCE, END TO END — the board 1 ruling as James approved it
// (Gate 0B round 2, 2026-09-15).
//
// This replaces the throwaway capture harness that produced the gate's
// frames. It is a PRODUCER-TO-CONSUMER test in RF24's sense: every case
// starts upstream at the API seed and asserts what the rendered screen says,
// so a break anywhere between `storedMachineTier`'s stamp and the sheet's
// rendering of it goes red. Both halves being well tested separately is
// exactly the condition that hides a broken seam.
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
import { test, expect, type Page } from "@playwright/test";
import { RUN_ID, signInViaBackdoor } from "./helpers";

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

test("a TERMINATED row says its RATE is derived, and why", async ({ page }) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await signInViaBackdoor(page, {
    email: `prov-term-${RUN_ID}@e2e.test`,
    name: "Provenance",
  });

  // 52 on the wire is the DOUBLED 0x0039 average a terminate produces
  // (pm5-interface-notes §27.6). The tile must not show it.
  await seedAndOpen(
    page,
    machineRow({
      title: "Terminated piece",
      endedBy: "rower",
      spm: 52,
      withHr: true,
    }),
  );
  await expect(
    page.getByRole("heading", { name: "Terminated piece" }),
  ).toBeVisible();

  const tier = page.getByTestId("summary-machine-tier");
  await expect(tier).toBeVisible();
  // The guard is still doing its job: 26, never the wire's 52.
  await expect(tier).toContainText("26");
  await expect(tier).not.toContainText("52");

  await page
    .getByRole("button", { name: /where these numbers come from/i })
    .click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();

  // RATE sits under DERIVED and explains itself. Asserting the SENTENCE, not
  // just the grouping — the explanation is the thing the screen has never
  // said, so a version that grouped correctly and said nothing would pass a
  // weaker check while failing the rower.
  await expect(dialog).toContainText("DERIVED");
  await expect(dialog).toContainText(/stopped this piece early/i);
  await expect(dialog).toContainText("MEASURED");
});

test("a FINISHED row puts the same tile under MEASURED, with nothing to explain", async ({
  page,
}) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await signInViaBackdoor(page, {
    email: `prov-fin-${RUN_ID}@e2e.test`,
    name: "Provenance",
  });

  await seedAndOpen(page, machineRow({ title: "Finished piece", spm: 26 }));
  await expect(
    page.getByRole("heading", { name: "Finished piece" }),
  ).toBeVisible();

  await page
    .getByRole("button", { name: /where these numbers come from/i })
    .click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();

  // THE PAIR IS THE POINT. This row and the terminated one render an
  // IDENTICAL tile face (board 1's whole finding), so the only way to tell
  // them apart is here — and the terminated row's sentence must be absent.
  await expect(dialog).not.toContainText(/stopped this piece early/i);
  await expect(dialog).toContainText("MEASURED");
});

test("the table groups its columns, derived first, and drops the blanket PM5 claim", async ({
  page,
}) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await signInViaBackdoor(page, {
    email: `prov-table-${RUN_ID}@e2e.test`,
    name: "Provenance",
  });

  await seedAndOpen(
    page,
    machineRow({ title: "Grouped columns", spm: 26, withHr: true }),
  );
  await expect(
    page.getByRole("heading", { name: "Grouped columns" }),
  ).toBeVisible();

  const block = page.locator(".machine-summary-block");
  await expect(block).toBeVisible();
  await expect(block).toContainText("PER INTERVAL");
  // The eyebrow no longer claims the PM5 for columns that are not its.
  await expect(block).not.toContainText("PM5 · PER INTERVAL");

  const headers = block.locator(".machine-summary-groups th[colspan]");
  await expect(headers).toHaveText(["DERIVED", "MEASURED"]);

  // DERIVED LEADS, and a browser is the only place this can be checked: the
  // strip overflows ~30px at 390px, so with MEASURED first the two derived
  // columns and their own heading are what scrolls out of sight at rest —
  // the table would hide the disclosure it exists to make.
  const [derivedBox, measuredBox] = await Promise.all([
    headers.nth(0).boundingBox(),
    headers.nth(1).boundingBox(),
  ]);
  expect(derivedBox!.x).toBeLessThan(measuredBox!.x);
  expect(derivedBox!.x).toBeGreaterThanOrEqual(0);
  // and it is fully on screen at rest, which is the property that matters
  expect(derivedBox!.x + derivedBox!.width).toBeLessThanOrEqual(390);
});
