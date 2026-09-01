import { expect, test } from "@playwright/test";
import { RUN_ID, signInViaBackdoor } from "./helpers";

// Wave F PR 2 Task 4 — the composition leg (recurring failure 24): a
// connected TEARDOWN WRITES the diagnostics ring
// (`sessionLogHistory.ts`'s `upsertSessionLog`, called unconditionally from
// `useMonitorSession.ts`'s `stash()`), and the diagnostics door (Task 3,
// `/you/diagnostics/monitor-logs`) READS it back. Every other test that
// touches either half stops at its own producer (`sessionLogHistory.test.ts`,
// `useMonitorSession.test.ts`) or its own consumer
// (`MonitorLogs.test.tsx`, seeded by hand-calling `upsertSessionLog` — never
// through a real teardown) — this is the one test that starts BEFORE the
// write and finishes AFTER the read, so a broken seam between them (a key
// typo, a storage-shape mismatch, a stale snapshot) has somewhere to fail
// loudly. `e2e/connected.spec.ts`'s own header explains the fake-transport
// idiom this file reuses; see it for the fuller story.
//
// DELIBERATELY THE THINNEST CONNECTED SESSION THIS SUITE DRIVES: no
// scripted status/boundary events at all (`FakeScript.events` is optional
// — `transports/fake.ts`'s own interface — and `connected.spec.ts`'s own
// `walkToReady` already proves the ready dwell is reached from programming
// completion alone; its own story does not start until well after that
// point). With zero rowing frames, `run` (`useMonitorSession.ts`) stays
// `null`, so `burstEligible` is false and the End teardown takes the
// IMMEDIATE path: `stash()` — and with it `upsertSessionLog` — runs
// synchronously off the second End tap, with no "Wrapping up" burst hold
// to wait out and no dependence on whether any interval was ever measured.
// The ring write this leg proves out does not care whether a record ever
// opened; only that a connected session ended for real.
//
// THE TEARDOWN THAT WRITES THE RING RUNS ON UNMOUNT, NOT ON THE CLICK
// (found running this file for real, `docs/monitor/`-style discipline
// applied to a client mechanism instead of a wire one): `endSession()`
// itself only flips `session.phase` to `"ended"` and returns —
// `useMonitorSession.ts`'s own `useEffect(() => teardown, [teardown])` is
// what actually calls `stash()`/`upsertSessionLog`, and it fires off
// `ConnectedInterstitial` unmounting (`handleConnectedEnded`'s
// `setConnecting(null)`), which React schedules as a PASSIVE EFFECT — a
// real, if usually sub-second, delay after the URL has already changed,
// not the same microtask as the click. `expect.poll` below waits out that
// gap explicitly rather than assuming the write has landed the instant
// the URL does.
test.setTimeout(60_000);
test.describe("Wave F PR 2 Task 4: the ring's composition leg — teardown writes, the door reads", () => {
  test("a connected session's teardown writes the ring, and the diagnostics door lists and copies it", async ({
    page,
  }) => {
    // Chrome does NOT auto-grant `clipboard-write` off a bare user
    // gesture in this (headless, Playwright-driven) environment — found
    // running this file for real, contradicting the assumption an
    // earlier draft of this comment made. Granted up front, context-wide:
    // no existing e2e file does this (grepped `e2e/*.spec.ts` and
    // `playwright.config.ts` before writing this), so this is the first.
    await page
      .context()
      .grantPermissions(["clipboard-read", "clipboard-write"]);

    const title = `Diagnostics Ring Walk ${RUN_ID}`;
    const deviceName = "PM5 246813579";

    // `InjectedFakeScript` (`src/monitor/transports/index.ts`) — set via
    // `page.addInitScript` before the page ever loads, the same seam
    // `connected.spec.ts`'s own `injectFakeMonitor` uses. `delayWritesMs`
    // (120ms, matching that file's own `INTERSTITIAL_WRITE_DELAY_MS`)
    // keeps "Connecting"/"Sending the workout" real, observable states
    // rather than a same-microtask blur — not needed for THIS file's own
    // assertions (which skip past both), but harmless and consistent with
    // the rest of the suite.
    await page.addInitScript(
      ({ program, deviceName: name }) => {
        window.__pm5FakeScript__ = {
          program,
          deviceName: name,
          delayWritesMs: 120,
        };
      },
      {
        program: {
          intervals: [
            {
              type: "work" as const,
              kind: "distance" as const,
              value: 100,
              targetSplit: null,
              displaySpm: null,
              restSeconds: 0,
            },
          ],
        },
        deviceName,
      },
    );

    await signInViaBackdoor(page, {
      email: `diagnostics-ring-${RUN_ID}@e2e.test`,
      name: "Diagnostics Ring Tester",
    });

    await page.goto("/library/import");
    await page
      .getByLabel("Bulk import text")
      .fill([`${title} | AN | easy | 1`, "w 100m max"].join("\n"));
    await page.getByRole("button", { name: "Import", exact: true }).click();
    await expect(page).toHaveURL(/\/library$/);

    await page.locator(".workout-row").filter({ hasText: title }).click();
    await expect(page.locator("h1.workout-detail-title")).toHaveText(title);

    await page.getByRole("button", { name: "Connect" }).click();
    // State 7 — ready. No dwell auto-advance (2026-08-08 operator ruling,
    // `connected.spec.ts`'s own comment on this same line) — the button
    // holds until pressed.
    await expect(
      page.locator(".connected-serif-line", {
        hasText: "Ready when you pull",
      }),
    ).toBeVisible({ timeout: 15_000 });
    const showNumbers = page.getByRole("button", {
      name: "Show me the numbers",
    });
    await expect(showNumbers).toBeVisible();
    await showNumbers.click();

    // THE TEARDOWN — no rowing ever happened (`run` stays null per this
    // file's own header), so `burstEligible` is false and the End
    // teardown takes the IMMEDIATE, non-held path: no "Wrapping up" burst
    // hold to wait out, no dependence on whether any interval was ever
    // measured. It still runs off the UNMOUNT effect, not the click
    // itself (this file's own header) — the wait below is that gap, not
    // a burst hold.
    await page.getByRole("button", { name: "End session" }).click();
    await page.getByRole("button", { name: "Tap again to end" }).click();
    await expect(page).toHaveURL(/\/library\/[^/]+\/log\?from=monitor$/);

    // THE WRITE. Waits for `sessionLogHistory.ts`'s own history key
    // directly — the thing this leg's first half is actually proving —
    // rather than inferring it from an incidental page state a later step
    // happens to also need. M-6 (final whole-branch review, atomic history
    // storage): ONE key now, `ergomatic:session-log-history`, holding a
    // JSON array (newest first) rather than three independently-addressed
    // `h1`/`h2`/`h3` slots — the newest push is index 0.
    await expect
      .poll(
        () =>
          page.evaluate(() =>
            localStorage.getItem("ergomatic:session-log-history"),
          ),
        { timeout: 10_000 },
      )
      .not.toBeNull();
    const storedHistory = await page.evaluate(() =>
      localStorage.getItem("ergomatic:session-log-history"),
    );
    const storedExported = (
      JSON.parse(storedHistory ?? "null") as { exported: string }[] | null
    )?.[0]?.exported;
    expect(
      storedExported,
      "the newest history entry carries the ring's own exported JSON",
    ).not.toBeUndefined();

    // THE DOOR READS. A fresh Playwright test gets a fresh browser
    // context — empty localStorage before this session's own teardown
    // just wrote slot 1 above — so exactly one entry below is THIS
    // session's, never a leftover from another test or run.
    await page.goto("/you");
    await page.getByRole("link", { name: "DIAGNOSTICS" }).click();
    await expect(page.locator("h1.screen-title")).toHaveText("Diagnostics");

    await page.locator("a.diag-card").click();
    await expect(page.locator("h1.screen-title")).toHaveText("Monitor logs");

    const cards = page.locator(".diag-log-card");
    await expect(cards).toHaveCount(1);
    // The correct SHAPE ("N EVENTS", `MonitorLogs.tsx`'s own
    // `eventCount`/pluralisation), not a specific count — the exact
    // number of ring entries a connect/program/end sequence produces is
    // an implementation detail of `eventLog.ts`'s own logging, not
    // something this composition leg needs to pin.
    await expect(cards.first().locator(".diag-log-count")).toHaveText(
      /^\d+ EVENTS?$/,
    );

    // COPY — the user-visible contract (`MonitorLogs.tsx`'s `CopyState`):
    // a resolved `navigator.clipboard.writeText` flips the label to
    // COPIED, a rejected one to COPY FAILED (this file's own header on
    // why the permission grant above is needed for the resolved branch to
    // ever be reachable here at all).
    const copyButton = cards.first().locator(".diag-copy");
    await expect(copyButton).toHaveText("COPY");
    await copyButton.click();
    await expect(copyButton).toHaveText("COPIED");

    // BYTE-IDENTICAL, not just "resolved" — the same discipline Task 3's
    // own unit suite pins (`MonitorLogs.tsx`'s header: copy writes
    // `entry.exported` verbatim, never re-`JSON.stringify`d). This is the
    // ONE place in the whole leg that can prove the door handed back
    // exactly what teardown wrote, not a re-encoding of it.
    const clipboardText = await page.evaluate(() =>
      navigator.clipboard.readText(),
    );
    expect(clipboardText).toBe(storedExported);
  });
});
