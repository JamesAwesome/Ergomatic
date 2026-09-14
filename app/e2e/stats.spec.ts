import { test, expect, type Page } from "@playwright/test";
import {
  backdateLog,
  RUN_ID,
  seedGate0Tests,
  signInViaBackdoor,
} from "./helpers";
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
  // PR 2: the six test rows, keyed to their seed logs (T1/T3/T5 to a
  // throwaway log that is then deleted), backdated like the logs.
  const tids = await seedGate0Tests(page, ids, (d) => `${d}T16:00:00Z`);
  const tests = await page.evaluate(async () => {
    const res = await fetch("/api/test-history");
    return (await res.json()) as {
      id: string;
      loggedAt: string;
      sessionLogId: string | null;
    }[];
  });
  expect(tests).toHaveLength(6);
  expect(tests.find((t) => t.id === tids.T1)?.loggedAt).toBe(
    "2025-11-22T16:00:00.000Z",
  );
  expect(tests.find((t) => t.id === tids.T1)?.sessionLogId).toBeNull();
  expect(tests.find((t) => t.id === tids.T6)?.sessionLogId).toBe(ids.R13);

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
  // Ruling 20: the chevron is drawn and hidden from the accessible tree.
  await expect(hero.locator(".you-stats-chevron")).toHaveText("›");
  await expect(hero.locator(".you-stats-chevron")).toHaveAttribute(
    "aria-hidden",
    "true",
  );
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

  // PR 2 — the range line (ruling 21), the three charts on the seed.
  const rangeLine = page.locator(".stats-range");
  await expect(rangeLine).toHaveText("ALL TIME · SINCE 8 NOV 2025");
  await page.getByRole("radio", { name: "SEASON" }).click();
  await expect(rangeLine).toHaveText("1 MAY TO 12 SEP 2026");
  await expect(row("METRES").getByRole("cell").nth(0)).toHaveText("43,012");
  await page.getByRole("radio", { name: "ALL" }).click();
  await expect(rangeLine).toHaveText("ALL TIME · SINCE 8 NOV 2025");
  await expect(page.locator(".stats-bar-label")).toHaveText([
    "13,000",
    "2,000",
  ]);
  await expect(page.locator(".stats-bar-current")).toHaveAttribute(
    "data-week",
    "2026-09-07",
  );
  const season = page.getByRole("region", { name: "SEASON 2027" });
  await expect(season).toContainText("43,012 TODAY");
  await expect(season.locator(".stats-tile-value")).toHaveText([
    "319",
    "3",
    "3",
  ]);
  const trend = page.getByRole("region", { name: "TEST TREND" });
  await expect(trend.locator("circle")).toHaveCount(6);
  await expect(trend).toContainText("2K 1:54.0");
  await expect(trend).toContainText("6K 2:01.4");
  // The backdate is what puts T1 in November 2025: without it every point
  // plots today and the axis reads SEP alone.
  await expect(
    trend.locator("text.stats-tick", { hasText: /^NOV$/ }),
  ).toHaveCount(1);

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
  // WAIT FOR THE DELETE'S OWN POST-WRITE NAVIGATION (2026-09-14 flake
  // hunt). `confirmDelete` (`log/FromTheLog.tsx:428`) navigates to
  // `backTarget` only after `await api(DELETE)` resolves, and this screen
  // was entered from Today (`Today.tsx:1623` sets `state={{from:"/today"}}`
  // -> `resolveLogBack` -> `/today`), so landing on `/today` is proof the
  // row is gone. Without it, tapping YOU with the DELETE still in flight
  // let You's one-shot stats GET read the PRE-delete figure — the hero
  // then says 56,752, which is exactly the number this test asserts has
  // moved. It also removes a second race: `navigate(backTarget)` firing
  // AFTER the test reached /you would yank the page to /today mid-
  // assertion. This is a client-side navigate, so leg 1 stays SAME-
  // DOCUMENT and the sentinel below still means what it says.
  // Its three siblings already did this — `log.spec.ts:1668` waits on
  // `/\/plan$/`, `log.spec.ts:1765` on `/\/today\/log$/` (RF34).
  await expect(page).toHaveURL(/\/today$/);
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
  // Ruling 4 on the supported path: R13 is gone from every total, and T6
  // — the test measured in it — is still the trend's last 2k point.
  await expect(trend.locator("circle")).toHaveCount(6);
  await expect(trend).toContainText("2K 1:54.0");
  await expect(season.locator(".stats-tile-value")).toHaveText([
    "304",
    "2",
    "2",
  ]);
  // Leg 2: the reload — the sentinel is gone, and the figures hold.
  await page.goto("/you");
  expect(await sentinel()).toBeUndefined();
  await expect(hero).toContainText("LIFETIME · 54,752 M");
  await page.goto("/you/stats");
  await expect(row("METRES").getByRole("cell").nth(1)).toHaveText("34,752");
});
