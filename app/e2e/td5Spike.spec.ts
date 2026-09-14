// THROWAWAY PROBE — TD-5 (Phase TD). Not a gate, never merged to main.
// Question: where does a free-row `deliverSummary` land relative to the two
// measured bounds (spec 2026-09-12-phase-td-design.md §1.3) — after the
// driver has seen the `terminated` status frame, and before the hook's
// 2000 ms hand-off burst linger closes?
//
// The observable is the ring, read from the browser after teardown:
// `useMonitorSession.ts` writes `ergomatic:last-session-log` to
// localStorage UNCONDITIONALLY on the way out, so no dev seam is needed.
import { test, expect, type Page } from "@playwright/test";
import { signInViaBackdoor } from "./helpers";

const JR_STORY_START_MS = 8000;

// A copy of `screenshots.spec.ts`'s `injectJustRowShotFake` (that file's
// helpers are not exported, and this probe must not edit it).
async function injectJustRowShotFake(page: Page): Promise<void> {
  await page.addInitScript(
    ({ startMs }) => {
      window.__pm5FakeScript__ = {
        program: {
          intervals: [
            {
              type: "work",
              kind: "distance",
              value: 100,
              targetSplit: null,
              displaySpm: null,
              restSeconds: 0,
            },
          ],
        },
        deviceName: "PM5 432331249",
        events: Array.from({ length: 90 }, (_, i) => {
          const t = i + 1;
          const d = t <= 10 ? t * 4 : 40 + (t - 10) * 6;
          return {
            atMs: startMs + 1000 + i * 1000,
            kind: "status",
            workoutState: 4,
            elapsedSeconds: t,
            distanceMeters: d,
            spm: t <= 10 ? 22 : 26,
            currentSplit: t <= 10 ? 125 : 83.3,
            heartRateBpm: null,
            programIntervalIndex: 0,
          };
        }),
      };
    },
    { startMs: JR_STORY_START_MS },
  );
}

async function openJustRowLive(page: Page, email: string): Promise<void> {
  await injectJustRowShotFake(page);
  await signInViaBackdoor(page, { email, name: "Screenshot Tester" });
  await page.goto("/justrow");
  await page.getByRole("button", { name: "Connect" }).click();
  await expect(
    page.getByRole("heading", { name: "Ready when you pull" }),
  ).toBeVisible();
  await expect(page.getByText("ELAPSED")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("0:16")).toBeVisible({ timeout: 20_000 });
}

/** Every ring entry the browser stashed, printed through
 *  `process.stdout.write` (this repo's own readout rule). */
async function dumpRing(page: Page, label: string): Promise<void> {
  const raw = await page.evaluate(() =>
    localStorage.getItem("ergomatic:last-session-log"),
  );
  if (raw === null) {
    process.stdout.write(`\n[${label}] NO RING STASHED\n`);
    return;
  }
  const parsed = JSON.parse(raw) as {
    entries: { seq: number; atMs?: number; kind: string; detail: string }[];
  };
  const tail = parsed.entries.slice(-45);
  const t0 = tail[0]?.atMs ?? 0;
  process.stdout.write(
    `\n===== [${label}] last ${tail.length} ring entries =====\n`,
  );
  for (const e of tail) {
    const rel = e.atMs === undefined ? "?" : `+${e.atMs - t0}`;
    process.stdout.write(`${e.seq}\t${rel}\t${e.kind} :: ${e.detail}\n`);
  }
  process.stdout.write(`===== [${label}] end =====\n`);
}

for (const delayMs of [0, 400, 800, 1500]) {
  test(`TD5 probe: deliver +${delayMs}ms after the second End tap`, async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await openJustRowLive(page, `td5-probe-${delayMs}@e2e.test`);

    await page.getByRole("button", { name: "End session" }).click();
    await page.getByRole("button", { name: "Tap again to end" }).click();

    // The pre-delivery state the 2026-09-07 attempt relied on: still on the
    // free-row route, hold visibly open.
    await expect(
      page.locator(".connected-serif-line", { hasText: "Wrapping up" }),
    ).toBeVisible();
    await expect(page).toHaveURL(/\/justrow$/);

    if (delayMs > 0) await page.waitForTimeout(delayMs);

    const stillHere = page.url();
    const delivered = await page.evaluate(() => {
      const controls = window.__pm5FakeControls__;
      if (controls === undefined) return "NO CONTROLS";
      controls.deliverSummary({ elapsedSeconds: 20, meters: 100 });
      return "delivered";
    });
    process.stdout.write(
      `\n[+${delayMs}ms] url at delivery: ${stillHere} :: ${delivered}\n`,
    );

    await expect(page).toHaveURL(/\/justrow\/log$/, { timeout: 15_000 });
    await expect(page.getByText("EFFORT", { exact: true })).toBeVisible();

    const tierCount = await page.getByTestId("summary-machine-tier").count();
    process.stdout.write(`[+${delayMs}ms] machine tier count: ${tierCount}\n`);
    await dumpRing(page, `+${delayMs}ms`);
  });
}
