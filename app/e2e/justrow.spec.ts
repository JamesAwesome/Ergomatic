import { test, expect, type Page } from "@playwright/test";
import { RUN_ID, signInViaBackdoor } from "./helpers";

// PHASE JR PR 2 — the free row's own e2e walk, fake-driven, in a real
// browser: Today → JUST ROW → Connect → the ready frame → the standard
// connected surface wearing the free-row treatment → a Menu end on the
// erg → the ended hand-off → the workout-less log door → Save this row →
// the row in history. The one flow a rower actually walks, entered at the
// top, so nothing here seeds a record past any producer (recurring
// failure 24's rule at this layer too).
//
// The fake's `program` field is REQUIRED by its script shape and never
// consulted here: a free row programs nothing, and the fake's
// byte-for-byte programming assertion has nothing to check when no
// programming bytes ever arrive.

const WORKOUTSTATE_INTERVALWORKTIME = 4; // parse.ts's own ordinal

const FIXTURE_PROGRAM = {
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
};

/** The story's own start, in virtual milliseconds — connected.spec.ts's
 *  STORY_START_MS rationale: frames that begin right after connect() race
 *  the arm (the free-row effect fires on the render after the link comes
 *  up, and frames delivered before `ready` are ignored by the record-open
 *  branch). This spec WAS flaky at 1000 ms — one run passed, the next
 *  stuck at "Ready when you pull" with the timeline already spent. */
const STORY_START_MS = 8000;

/** A LONG free row at 1 Hz — sixty frames, no scripted ending. The flow
 *  below ends by the ROWER's own END control, deliberately: a scripted
 *  terminate races the assertions against the fake's real-speed virtual
 *  clock (measured: three shapes of the same flake), while the Menu-end
 *  path is already proven on the walk's real bytes by
 *  `justRowReplay.test.ts`. What this spec buys is the flow a rower
 *  walks, not a second wire-ending oracle. Frame values are
 *  row-cumulative, as the capture walk proved 0x0031 behaves (CLOSED 1). */
function freeRowEvents() {
  return Array.from({ length: 60 }, (_, i) => ({
    atMs: STORY_START_MS + 1000 + i * 1000,
    kind: "status" as const,
    workoutState: WORKOUTSTATE_INTERVALWORKTIME,
    elapsedSeconds: i + 1,
    distanceMeters: (i + 1) * 4,
    spm: 22,
    currentSplit: 140,
    heartRateBpm: null,
    programIntervalIndex: 0,
  }));
}

async function injectFakeMonitor(page: Page): Promise<void> {
  await page.addInitScript(
    ({ program, events }) => {
      window.__pm5FakeScript__ = {
        program,
        events,
        deviceName: "PM5 e2e-justrow",
      };
    },
    { program: FIXTURE_PROGRAM, events: freeRowEvents() },
  );
}

test.describe("Just Row: the whole flow", () => {
  test("Today → Connect → live free row → Menu end → log door → history", async ({
    page,
  }) => {
    await signInViaBackdoor(page, {
      email: `justrow-flow-${RUN_ID}@e2e.test`,
      name: "Just Row Walker",
    });
    await injectFakeMonitor(page);

    await page.goto("/today");
    await page.getByRole("link", { name: "JUST ROW" }).click();
    await expect(page).toHaveURL(/\/justrow$/);

    await page.getByRole("button", { name: "Connect" }).click();

    // The ready frame: the interstitial's own copy with the one changed
    // word — CONNECTED, not PROGRAMMED — because nothing was sent.
    await expect(
      page.getByRole("heading", { name: "Ready when you pull" }),
    ).toBeVisible();
    await expect(page.getByText(/CONNECTED/)).toBeVisible();

    // "Show me the numbers" hands over to the surface BEFORE the first
    // pull — the ready screen's own lead action, and the one branch only
    // this layer can reach (jsdom cannot take the bare hook live). The
    // frames have not started yet (STORY_START_MS), so this also pins that
    // the pre-motion surface renders rather than waiting for motion.
    await page.getByRole("button", { name: "Show me the numbers" }).click();

    // First motion then fills the standard surface in its free-row
    // treatment: the identity where a count would be, Free in both target
    // slots, ELAPSED as the band's one cell, no GRID control anywhere.
    // The 15 s allowance is the story's own arithmetic, not slack: the
    // first frame lands at STORY_START_MS + 1000 ≈ 9 s of virtual time, and
    // the fake's auto-tick runs virtual at real speed.
    await expect(page.getByText("JUST ROW", { exact: true })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText("Free")).toHaveCount(2);
    await expect(page.getByText("ELAPSED")).toBeVisible();
    await expect(page.locator(".connected-control")).toHaveCount(0);
    await expect(page.getByText("UP NEXT")).toHaveCount(0);

    // MOTION BEFORE THE END, pinned on a real number — the structural
    // assertions above all pass on the PRE-motion surface too (the armed
    // mirror renders the same treatment), and a first cut of this spec
    // ended a row that never started: END at ready closes no record, the
    // door finds nothing, and the flow lands on Today. 64m is frame 16's
    // own meters.
    await expect(page.getByText("64m")).toBeVisible({ timeout: 30_000 });

    // The rower ends the row from the app: the header END control, staged
    // (first tap arms TAP AGAIN). The ended frame is deliberately not
    // asserted — `onEnded` navigates the moment the hand-off hold
    // releases, so its copy is a client-test assertion
    // (ConnectedSurface.test.tsx's free-row ended block); what this flow
    // owns is the destination.
    await page.getByRole("button", { name: "End session" }).click();
    await expect(
      page.getByRole("button", { name: "Tap again to end" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Tap again to end" }).click();
    await expect(page).toHaveURL(/\/justrow\/log$/, { timeout: 15_000 });
    await expect(page.getByRole("heading", { name: "Just Row" })).toBeVisible();
    await expect(page.getByText("PAIN", { exact: true })).toBeVisible();
    await expect(page.getByText(/DID YOU HOLD THE TARGETS/)).toHaveCount(0);

    await page.getByRole("button", { name: "Save this row" }).click();

    // History, with the free row named and unbadged. The badge absence is
    // exit criterion 2's LITERAL subject — a history list holding the
    // null-type row renders no `.type-badge` at all — and this is the one
    // place a null-type row from the supported producer reaches a list.
    // A fresh backdoor user's history holds only this row, so a badge on
    // it is the only badge there could be: the probe bites.
    await expect(page).toHaveURL(/\/today\/log$/);
    await expect(page.getByText("Just Row").first()).toBeVisible();
    await expect(page.locator(".type-badge")).toHaveCount(0);
  });
});
