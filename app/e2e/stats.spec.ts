import { test, expect, type Page } from "@playwright/test";
import { backdateLog, RUN_ID, signInViaBackdoor } from "./helpers";
import { GATE0_LOG_BODIES, GATE0_TODAY_ISO } from "../src/test/gate0LogBodies";

// Phase PS PR 1, spec §8.5: the Gate 0 seed through the real stack, the
// browser's zone pinned to New York and its clock to 09:00 there on
// 2026-09-12. `timezoneId` moves ONLY the browser; this runner is in the
// host's zone locally and in UTC on CI, so every instant below is written
// as an explicit `…Z` literal and the assertions must hold under both.
// Rows are backdated to 16:00Z of their seed date — noon EDT, 11:00 EST —
// so under the browser's zone each lands on its own date. Every figure is
// `compute.mjs`'s printout (invariant 18). Bounded below the fake
// monitor's first frame by construction — nothing here connects a
// monitor (RF41).
test.use({ timezoneId: "America/New_York" });
// 09:00 EDT on the seed's today, as the instant it is.
const CLOCK = new Date(`${GATE0_TODAY_ISO}T13:00:00Z`);

async function seedGate0(page: Page): Promise<Record<string, string>> {
  const ids: Record<string, string> = {};
  for (const { id, date, body } of GATE0_LOG_BODIES) {
    const created = await page.evaluate(async (b) => {
      const res = await fetch("/api/logs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(b),
      });
      return { ok: res.ok, status: res.status, text: await res.text() };
    }, body);
    if (!created.ok)
      throw new Error(`${id}: ${created.status} ${created.text}`);
    const rowId = (JSON.parse(created.text) as { id: string }).id;
    await backdateLog(rowId, `${date}T16:00:00Z`);
    ids[id] = rowId;
  }
  // The backdate is asserted, not assumed: R13's loggedAt reads back as
  // the instant written (noon EDT on 2026-09-11).
  const r13 = await page.evaluate(async (id) => {
    const res = await fetch(`/api/logs/${id}`);
    return (await res.json()) as { loggedAt: string };
  }, ids.R13!);
  expect(r13.loggedAt).toBe("2026-09-11T16:00:00.000Z");
  return ids;
}

test("You's hero prints the seed's LIFETIME and SEASON, is the one control named Stats, and /you/stats prints both columns; deleting R13 moves both", async ({
  page,
}) => {
  await page.clock.install({ time: CLOCK });
  await signInViaBackdoor(page, {
    email: `stats-${RUN_ID}@e2e.test`,
    name: "Stats Rower",
  });
  const ids = await seedGate0(page);

  await page.goto("/you");
  // The same-document sentinel (RF38): set on THIS document; leg 1 below
  // asserts it is still here (no reload between minting any cache and the
  // read-back), leg 2 asserts it is gone (a reload happened).
  await page.evaluate(() => {
    (window as unknown as { __psSameDoc?: string }).__psSameDoc = "same-doc";
  });
  const sentinel = () =>
    page.evaluate(
      () => (window as unknown as { __psSameDoc?: string }).__psSameDoc,
    );
  const hero = page.getByRole("link", { name: "Stats" });
  await expect(hero).toContainText("LIFETIME · 56,752 M");
  await expect(hero).toContainText("SEASON 2027 · 43,012 M");
  // The doors group is unchanged and gains no STATS row (ruling 10): the
  // three doors every account has are named, and STATS is absent. Not a
  // child COUNT — the CONCEPT2 door renders only for an account whose read
  // says `available: true`, an environment fact this test does not own.
  const doors = page.locator(".you-doors");
  for (const name of ["BASELINES", "SETTINGS", "DIAGNOSTICS"]) {
    await expect(doors.getByText(name, { exact: true })).toBeVisible();
  }
  await expect(doors).not.toContainText("STATS");
  // One focusable control: Tab from the sign-out button lands on it.
  await page.getByRole("button", { name: "Sign out" }).focus();
  await page.keyboard.press("Tab");
  await expect(hero).toBeFocused();
  // Tap the LEGEND — the deepest descendant — and land on the subpage.
  await hero.locator(".stats-legend-line").click();
  await expect(page).toHaveURL(/\/you\/stats$/);

  const row = (label: string) =>
    page.getByRole("row", { name: new RegExp(`^${label}`) });
  await expect(row("METRES").getByRole("cell").nth(0)).toHaveText("56,752");
  await expect(row("METRES").getByRole("cell").nth(1)).toHaveText("36,752");
  await expect(row("REST METRES").getByRole("cell").nth(1)).toHaveText("718");
  await expect(row("CALORIES").getByRole("cell").nth(1)).toHaveText("1,731");
  await expect(row("AVG WATTS").getByRole("cell").nth(1)).toHaveText("176");

  // Delete R13 (a pm5 row, 2,000 m) through the UI and both columns move
  // (invariant 13) — on TWO legs, because they prove different things
  // (RF38). Leg 1 is SAME-DOCUMENT end to end: /you/stats has just MOUNTED
  // (any cache is minted now), then the TODAY tab, R13's row, the delete,
  // the YOU tab and the hero are all clicks, so the module graph survives
  // and a cache at module scope would still serve 56,752 here. Leg 2 is
  // `page.goto`, a reload, which any implementation passes. Leg 1 is the
  // gate; the sentinel is what proves each leg is the kind it claims.
  await page
    .getByRole("navigation", { name: "Main" })
    .getByRole("link", { name: "TODAY" })
    .click();
  await page.locator(`a[href="/today/log/${ids.R13}"]`).click();
  await expect(page).toHaveURL(new RegExp(`/today/log/${ids.R13}$`));
  await page.getByRole("button", { name: "Delete session" }).click();
  await page
    .locator(".log-delete-confirm")
    .getByRole("button", { name: "Delete session" })
    .click();
  await page
    .getByRole("navigation", { name: "Main" })
    .getByRole("link", { name: "YOU" })
    .click();
  await expect(page).toHaveURL(/\/you$/);
  expect(await sentinel()).toBe("same-doc");
  await expect(hero).toContainText("LIFETIME · 54,752 M");
  await hero.click();
  await expect(page).toHaveURL(/\/you\/stats$/);
  await expect(row("METRES").getByRole("cell").nth(1)).toHaveText("34,752");
  // Leg 2: the reload — the sentinel is gone, and the figures hold.
  await page.goto("/you");
  expect(await sentinel()).toBeUndefined();
  await expect(hero).toContainText("LIFETIME · 54,752 M");
  await page.goto("/you/stats");
  await expect(row("METRES").getByRole("cell").nth(1)).toHaveText("34,752");
});
