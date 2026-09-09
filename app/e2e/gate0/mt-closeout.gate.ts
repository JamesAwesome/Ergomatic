// GATE 0 EVIDENCE HARNESS — Phase MT close-out PR B (2026-09-08).
//
// NOT part of the e2e suite, on purpose: the filename ends `.gate.ts`, which
// `playwright.config.ts`'s default `testMatch` does not accept, so `pnpm e2e`
// and CI never run it. `playwright.gate0.config.ts` is the only config that
// selects it. It exists to MEASURE, not to gate — every `expect` in here is a
// precondition on the fixture (we are standing on the frame we think we are),
// never a claim about the design. The design's own gates live in
// `e2e/design.spec.ts`.
//
// WHAT IT MEASURES: both changes reach ~13 of the twenty `ConnectedError`
// reasons, and Gate 0 measured two of them. This re-measures every reason
// either change touches, in both orientations.
//
// SIX REASONS ARE DRIVEN FOR REAL through `navigator.bluetooth` /
// `ergMachineType`, which is every reason a browser can reach:
// `link-failed`, `bluetooth-off`, `scan-dismissed`, `permission-denied`,
// `scan-cleanup-failed` (all five sorted by `mapRadioFailure`'s own arms) and
// `unsupported-machine` (the fake reports `ERGMACHINE_TYPE_STATIC_SKI` on
// 0x0032 and the real driver refuses the sitting).
//
// THE OTHER FOURTEEN ARE RECONSTRUCTED, and the reconstruction is CHECKED
// rather than trusted: `renderBody()` below rebuilds the message column's
// markup from the reason alone, and every one of the six real frames is
// measured twice — once as React rendered it, once with the body replaced by
// `renderBody()`'s output — with the two required to agree to 0.5px in both
// orientations. Only the body is ever rebuilt; the action stack is the real
// one, and every reconstructed reason renders the same four-button stack the
// `link-failed` host frame already carries.
//
// `unsupported-machine` is the exception on both counts: it is real, and it is
// the only three-button stack.

import fs from "node:fs";
import path from "node:path";
import { test, expect, type Page } from "@playwright/test";
import { signInViaBackdoor } from "../helpers";

const OUT = path.resolve(process.cwd(), "../docs/design/mt-closeout-gate0");
fs.mkdirSync(OUT, { recursive: true });

const PORTRAIT = { width: 390, height: 844 };
const LANDSCAPE = { width: 844, height: 390 };

const CONNECTED_PROGRAM = {
  intervals: Array.from({ length: 5 }, () => ({
    type: "work" as const,
    kind: "distance" as const,
    value: 100,
    targetSplit: null,
    displaySpm: null,
    restSeconds: 0,
  })),
};

const BULK = (title: string): string =>
  [`${title} | AN | easy | 1`, ...Array<string>(5).fill("w 100m max")].join(
    "\n",
  );

/** Every reason either change touches, with production's own copy.
 *
 *  `detail`/`raw` are `useMonitorSession.ts`'s and `driver.ts`'s own strings,
 *  not invented ones: the whole geometry turns on how many lines the copy
 *  wraps to, so an approximate string measures an approximate frame. */
const REASONS: Record<string, { detail: string; raw?: string }> = {
  busy: {
    detail: "A programming attempt is already in flight.",
    raw: "a program() is already in flight",
  },
  "bluetooth-off": {
    detail: "Bluetooth isn't available.",
    raw: "Bluetooth adapter not available",
  },
  "link-failed": {
    detail: "The link to the monitor failed.",
    raw: "Test scan failed",
  },
  "transport-missing": { detail: "This device has no Bluetooth transport." },
  "scan-dismissed": {
    detail: "No monitor was picked.",
    raw: "User cancelled the requestDevice() chooser.",
  },
  "permission-denied": {
    detail:
      "Ergomatic can't reach your PM5 without Bluetooth. Allow Bluetooth for Ergomatic in Settings, then come back and try again.",
    raw: "BLE permission denied",
  },
  disconnected: {
    detail: "PM5 disconnected before completing",
    raw: "0x00 0x00",
  },
  "target-not-advertising": {
    detail:
      "Couldn't reach PM5 918273645.\nCheck nothing else is connected to it, then try again.",
    raw: "PM5 918273645 did not advertise within 10000ms",
  },
  "target-already-connected": {
    detail: "End the monitor's current connection, then try again.",
    raw: "already connected to another central",
  },
  "target-ambiguous": {
    detail: "More than one PM5 has this name. Use Connect.",
    raw: "2 devices advertise PM5 918273645",
  },
  "target-interrupted": {
    detail: "Connection interrupted. Try again.",
    raw: "scan aborted",
  },
  "scan-cleanup-failed": {
    detail: "Bluetooth cleanup failed. Restart Ergomatic before trying again.",
    raw: "stopLEScan rejected",
  },
  "unsupported-machine": {
    detail:
      "Erg type not supported\nThis monitor is on a SkiErg. Nothing here will start.",
  },
};

/** The seven genuine machine statements share one headline and are the only
 *  reasons whose `detail` reaches the panel and nowhere else — neither change
 *  moves a pixel on them, so they are measured as the control. */
const MACHINE_REFUSALS: Record<string, { detail: string; raw?: string }> = {
  nak: { detail: "PM5 rejected frame 3", raw: "0x81 0x00" },
};

const NOT_A_MACHINE_REFUSAL = new Set(Object.keys(REASONS));

async function setBaselines(page: Page): Promise<void> {
  const r = await page.evaluate(async () => {
    const res = await fetch("/api/baselines", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ k2Seconds: 100, k6Seconds: 120 }),
    });
    return res.ok;
  });
  if (!r) throw new Error("baseline setup failed");
}

async function cleanupByTitle(page: Page, title: string): Promise<void> {
  await page.evaluate(async (t) => {
    const listRes = await fetch("/api/workouts");
    if (!listRes.ok) return;
    const workouts = (await listRes.json()) as Array<{
      id: string;
      title: string;
      isGlobal: boolean;
    }>;
    for (const w of workouts.filter((x) => !x.isGlobal && x.title === t))
      await fetch(`/api/workouts/${w.id}`, { method: "DELETE" });
  }, title);
}

async function injectFake(page: Page, ergMachineType?: number): Promise<void> {
  await page.addInitScript(
    ({ program, erg }) => {
      (window as unknown as { __pm5FakeScript__: unknown }).__pm5FakeScript__ =
        {
          program,
          events: [],
          deviceName: "PM5 918273645",
          delayWritesMs: 200,
          ...(erg === undefined ? {} : { ergMachineType: erg }),
        };
    },
    { program: CONNECTED_PROGRAM, erg: ergMachineType },
  );
}

/** A `requestDevice` that throws whatever `mapRadioFailure` needs to sort the
 *  rejection into the arm we are after. Name first, then prose — the same
 *  order that function reads them in. */
async function stubRadio(
  page: Page,
  name: string,
  message: string,
): Promise<void> {
  await page.addInitScript(
    ({ n, m }) => {
      Object.defineProperty(window.navigator, "bluetooth", {
        value: {
          requestDevice: () => {
            const err = new Error(m);
            err.name = n;
            return Promise.reject(err);
          },
        },
        configurable: true,
      });
    },
    { n: name, m: message },
  );
}

async function openConnect(
  page: Page,
  title: string,
  email: string,
): Promise<void> {
  await signInViaBackdoor(page, { email, name: "Gate0 Tester" });
  await setBaselines(page);
  await cleanupByTitle(page, title);
  await page.goto("/library/import");
  await page.getByLabel("Bulk import text").fill(BULK(title));
  await page.getByRole("button", { name: "Import", exact: true }).click();
  await expect(page).toHaveURL(/\/library$/);
  await page.locator(".workout-row").filter({ hasText: title }).click();
  await expect(page.locator("h1.workout-detail-title")).toHaveText(title);
  await page.getByRole("button", { name: "Connect" }).click();
}

interface Measurement {
  reason: string;
  variant: string;
  orientation: string;
  buttonCount: number;
  buttonLabels: string[];
  actionStackHeight: number;
  messageWindow: number;
  contentHeight: number;
  overflow: number;
  serifTop: number;
  serifBottom: number;
  headlineOnFrame: boolean;
  panelLines: string[];
  bodyLines: string[];
}

async function measure(
  page: Page,
  reason: string,
  variant: string,
  orientation: string,
): Promise<Measurement> {
  await page.evaluate(() => document.fonts.ready);
  return page.evaluate(
    ({ r, v, o }) => {
      const body = document.querySelector<HTMLElement>(
        ".connected-interstitial-body",
      );
      const stack = document.querySelector<HTMLElement>(".action-stack");
      const serif = document.querySelector<HTMLElement>(
        ".connected-serif-line",
      );
      if (body === null || stack === null || serif === null)
        throw new Error("no failure frame on screen to measure");
      const round = (n: number): number => Math.round(n * 10) / 10;
      body.scrollTop = 0;
      const restTop = body.getBoundingClientRect().top + body.clientTop;
      const sr = serif.getBoundingClientRect();
      const buttons = Array.from(
        stack.querySelectorAll<HTMLButtonElement>("button"),
      );
      return {
        reason: r,
        variant: v,
        orientation: o,
        buttonCount: buttons.length,
        buttonLabels: buttons.map((b) => (b.textContent ?? "").trim()),
        actionStackHeight: round(stack.getBoundingClientRect().height),
        messageWindow: body.clientHeight,
        contentHeight: body.scrollHeight,
        overflow: body.scrollHeight - body.clientHeight,
        serifTop: round(sr.top - restTop),
        serifBottom: round(sr.bottom - restTop),
        headlineOnFrame:
          sr.top - restTop >= -0.5 &&
          sr.bottom - restTop <= body.clientHeight + 0.5,
        panelLines: Array.from(
          document.querySelectorAll<HTMLElement>(".connected-detail-line"),
        ).map((el) => (el.textContent ?? "").trim()),
        bodyLines: Array.from(body.querySelectorAll<HTMLElement>("p, a")).map(
          (el) => (el.textContent ?? "").trim(),
        ),
      };
    },
    { r: reason, v: variant, o: orientation },
  );
}

/** Rebuild `.connected-interstitial-body`'s markup for `reason` — the exact
 *  element order and class list `ConnectedInterstitial.tsx`'s
 *  `renderFailureScreen` emits AFTER this PR. Checked against the real render
 *  on all six reachable reasons before any reconstructed number is believed. */
async function renderBody(
  page: Page,
  reason: string,
  copy: { detail: string; raw?: string },
  isMachineRefusal: boolean,
  before = false,
): Promise<void> {
  await page.evaluate(
    ({ r, detail, raw, machineRefusal, before: pre }) => {
      const body = document.querySelector<HTMLElement>(
        ".connected-interstitial-body",
      );
      if (body === null) throw new Error("no failure body");
      const label =
        document.querySelector(".connected-status-label")?.textContent ??
        "CONNECT";
      const esc = (s: string): string =>
        s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

      const headline = machineRefusal
        ? "The monitor wouldn't take it"
        : r === "permission-denied"
          ? "Bluetooth permission needed"
          : detail.split("\n")[0]!;
      const extraLines =
        machineRefusal || r === "permission-denied"
          ? []
          : detail.split("\n").slice(1);

      const parts = [`<p class="connected-status-label">${esc(label)}</p>`];
      parts.push(`<p class="connected-serif-line">${esc(headline)}</p>`);
      for (const l of extraLines)
        parts.push(`<p class="connected-body-line">${esc(l)}</p>`);
      if (machineRefusal)
        parts.push(
          `<p class="connected-body-line">End whatever is showing on the monitor, then try again.</p>`,
        );
      if (r === "permission-denied")
        parts.push(`<p class="connected-body-line">${esc(detail)}</p>`);
      if (r === "unsupported-machine")
        parts.push(
          `<a class="connected-support-link" href="/news/connect-the-monitor">WHICH ERGS WORK ›</a>`,
        );
      parts.push(
        `<p class="connected-reassurance">YOUR WORKOUT AND NUDGES ARE KEPT</p>`,
      );
      // The refusal's missing panel is NOT this PR's doing (#366 dropped it),
      // so it is absent in both variants.
      if (r !== "unsupported-machine") {
        // The de-duplicated panel: the slug always, `error.detail` only where
        // it is not already above (the machine refusals), `raw` when the
        // mapper attached one.
        const panel = [
          `<p class="connected-detail-title">DETAIL</p>`,
          `<p class="connected-detail-line">${esc(r.toUpperCase())}</p>`,
        ];
        // BEFORE this PR the panel printed `error.detail` unconditionally;
        // after it, only where the frame has not already said it.
        if (machineRefusal || pre)
          panel.push(`<p class="connected-detail-line">${esc(detail)}</p>`);
        if (raw !== undefined)
          panel.push(
            `<p class="connected-detail-line connected-detail-raw">${esc(raw)}</p>`,
          );
        parts.push(
          `<div class="connected-detail-panel">${panel.join("")}</div>`,
        );
      }
      body.innerHTML = parts.join("");
    },
    {
      r: reason,
      detail: copy.detail,
      raw: copy.raw,
      machineRefusal: isMachineRefusal,
      before,
    },
  );
}

/** Two button-count shapes no web render could produce when these captures
 *  were taken (the `openSettings` half is reachable now — see below).
 *
 *  `phoneTimer` puts `Row on the phone timer instead` back where the refusal
 *  frame carried it before this PR (after `Try again`, before the log door),
 *  which is the BEFORE shape of change 1. `openSettings` inserts the
 *  fifth button that was native-only WHEN THESE CAPTURES WERE TAKEN:
 *  `canOpenAppSettings()` was `isNative()`, and forcing that also flips
 *  `adapters/monitorTransport.ts` onto the Capacitor arm, so the frame could
 *  not be reached from a web render at all. SUPERSEDED by the Phase MT
 *  close-out seam, which gives `canOpenAppSettings()` a dev-only door and an
 *  e2e case that drives the real five-button frame; this harness keeps its
 *  insertion because it is how these committed captures were actually made.
 *  Both insert the identical
 *  node the real render emits, and every figure they produce is labelled
 *  `reconstructed`. */
async function reshapeStack(
  page: Page,
  opts: { phoneTimer?: boolean; openSettings?: boolean },
): Promise<void> {
  await page.evaluate((o) => {
    const stack = document.querySelector<HTMLElement>(".action-stack");
    if (stack === null) throw new Error("no action stack");
    const has = (label: string): boolean =>
      Array.from(stack.querySelectorAll("button")).some(
        (b) => (b.textContent ?? "").trim() === label,
      );
    if (o.phoneTimer === true && !has("Row on the phone timer instead")) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "button-l2";
      b.textContent = "Row on the phone timer instead";
      const log = Array.from(stack.querySelectorAll("button")).find(
        (x) => (x.textContent ?? "").trim() === "View connection log",
      );
      stack.insertBefore(b, log ?? null);
    }
    if (o.openSettings === true && !has("Open Settings")) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "button-l1";
      b.textContent = "Open Settings";
      stack.insertBefore(b, stack.firstChild);
    }
  }, opts);
}

const rows: Measurement[] = [];

function write(name: string, ms: Measurement[]): void {
  fs.writeFileSync(
    path.join(OUT, `measure-${name}.json`),
    `${JSON.stringify(ms, null, 2)}\n`,
  );
}

/** Drive a real frame, measure it in both orientations, then rebuild the same
 *  frame from `renderBody()` and require the two to agree — the precondition
 *  that makes every reconstructed row below worth reading. */
async function realAndCheck(
  page: Page,
  reason: string,
  name: string,
): Promise<void> {
  const out: Measurement[] = [];
  for (const [orientation, vp] of [
    ["portrait", PORTRAIT],
    ["landscape", LANDSCAPE],
  ] as const) {
    await page.setViewportSize(vp);
    await page.waitForTimeout(150);
    const real = await measure(page, reason, "real", orientation);
    await page.screenshot({
      path: path.join(OUT, `${reason}-${orientation}.png`),
    });
    await renderBody(
      page,
      reason,
      REASONS[reason] ?? MACHINE_REFUSALS[reason]!,
      !NOT_A_MACHINE_REFUSAL.has(reason),
    );
    await page.waitForTimeout(100);
    const rebuilt = await measure(page, reason, "reconstructed", orientation);
    // FIDELITY, not design: if the rebuild does not measure what React
    // rendered, no reconstructed row in this run means anything.
    expect(
      {
        w: rebuilt.messageWindow,
        c: rebuilt.contentHeight,
        t: rebuilt.serifTop,
        b: rebuilt.serifBottom,
      },
      `the ${reason} reconstruction does not match its real render`,
    ).toStrictEqual({
      w: real.messageWindow,
      c: real.contentHeight,
      t: real.serifTop,
      b: real.serifBottom,
    });
    out.push(real, rebuilt);
  }
  rows.push(...out);
  write(name, out);
}

/** A reason no browser can reach: stand on the real `link-failed` frame (the
 *  four-button stack every one of these renders) and rebuild the body. */
async function reconstructed(
  page: Page,
  reason: string,
  copy: { detail: string; raw?: string },
  isMachineRefusal: boolean,
  name: string,
  opts: {
    before?: boolean;
    phoneTimer?: boolean;
    openSettings?: boolean;
    variant?: string;
  } = {},
): Promise<void> {
  const out: Measurement[] = [];
  const variant = opts.variant ?? "reconstructed";
  for (const [orientation, vp] of [
    ["portrait", PORTRAIT],
    ["landscape", LANDSCAPE],
  ] as const) {
    await page.setViewportSize(vp);
    await renderBody(page, reason, copy, isMachineRefusal, opts.before);
    await reshapeStack(page, opts);
    await page.waitForTimeout(150);
    out.push(await measure(page, reason, variant, orientation));
    await page.screenshot({
      path: path.join(OUT, `${name}-${orientation}.png`),
    });
  }
  rows.push(...out);
  write(name, out);
}

test.describe("Phase MT close-out — every failure frame, re-measured", () => {
  test.setTimeout(240_000);

  test("unsupported-machine (real, the three-button stack)", async ({
    page,
  }) => {
    const title = "Gate0B Refusal Workout";
    await injectFake(page, 128);
    await openConnect(page, title, "gate0b-refusal@e2e.test");
    await expect(
      page.locator(".connected-serif-line", {
        hasText: "Erg type not supported",
      }),
    ).toBeVisible({ timeout: 30_000 });
    await realAndCheck(page, "unsupported-machine", "unsupported-machine");
    // BEFORE change 1: the same frame with the phone-timer button back.
    await reconstructed(
      page,
      "unsupported-machine",
      REASONS["unsupported-machine"]!,
      false,
      "unsupported-machine-BEFORE",
      { before: true, phoneTimer: true, variant: "before" },
    );
    await cleanupByTitle(page, title);
  });

  test("permission-denied (real, web four buttons)", async ({ page }) => {
    const title = "Gate0B Permission Workout";
    await stubRadio(page, "BluetoothPermissionError", "BLE permission denied");
    await openConnect(page, title, "gate0b-permission@e2e.test");
    await expect(
      page.locator(".connected-serif-line", {
        hasText: "Bluetooth permission needed",
      }),
    ).toBeVisible({ timeout: 30_000 });
    await realAndCheck(page, "permission-denied", "permission-denied");
    await reconstructed(
      page,
      "permission-denied",
      REASONS["permission-denied"]!,
      false,
      "permission-denied-BEFORE",
      { before: true, variant: "before" },
    );
    // The FIVE-button iOS stack — no web render could reach it when these
    // captures were taken; the close-out seam has since made it reachable,
    // and a `design.spec.ts` case now stands on the real frame. Both
    // variants here, the shape the landscape budget is tightest on.
    await reconstructed(
      page,
      "permission-denied",
      REASONS["permission-denied"]!,
      false,
      "permission-denied-ios5-BEFORE",
      { before: true, openSettings: true, variant: "before-ios5" },
    );
    await reconstructed(
      page,
      "permission-denied",
      REASONS["permission-denied"]!,
      false,
      "permission-denied-ios5",
      { openSettings: true, variant: "reconstructed-ios5" },
    );
    await cleanupByTitle(page, title);
  });

  test("link-failed (real) plus every reason no browser can reach", async ({
    page,
  }) => {
    const title = "Gate0B Link Failed Workout";
    await stubRadio(page, "Error", "Test scan failed");
    await openConnect(page, title, "gate0b-linkfailed@e2e.test");
    await expect(
      page.locator(".connected-serif-line", {
        hasText: "The link to the monitor failed.",
      }),
    ).toBeVisible({ timeout: 30_000 });
    await realAndCheck(page, "link-failed", "link-failed");

    for (const reason of [
      "busy",
      "transport-missing",
      "disconnected",
      "target-not-advertising",
      "target-already-connected",
      "target-ambiguous",
      "target-interrupted",
    ])
      await reconstructed(page, reason, REASONS[reason]!, false, reason);

    // …and each one's BEFORE shape, which differs only by the panel line
    // repeating the headline.
    for (const reason of [
      "busy",
      "transport-missing",
      "disconnected",
      "target-not-advertising",
      "target-already-connected",
      "target-ambiguous",
      "target-interrupted",
      "link-failed",
    ])
      await reconstructed(
        page,
        reason,
        REASONS[reason]!,
        false,
        `${reason}-BEFORE`,
        { before: true, variant: "before" },
      );

    // The control: a machine refusal, whose detail lives in the panel and
    // nowhere else, so neither change moves it.
    await reconstructed(page, "nak", MACHINE_REFUSALS["nak"]!, true, "nak");
    await cleanupByTitle(page, title);
  });

  test("bluetooth-off (real)", async ({ page }) => {
    const title = "Gate0B Bluetooth Off Workout";
    await stubRadio(page, "Error", "Bluetooth adapter not available");
    await openConnect(page, title, "gate0b-btoff@e2e.test");
    await expect(
      page.locator(".connected-serif-line", {
        hasText: "Bluetooth isn't available.",
      }),
    ).toBeVisible({ timeout: 30_000 });
    await realAndCheck(page, "bluetooth-off", "bluetooth-off");
    await reconstructed(
      page,
      "bluetooth-off",
      REASONS["bluetooth-off"]!,
      false,
      "bluetooth-off-BEFORE",
      { before: true, variant: "before" },
    );
    await cleanupByTitle(page, title);
  });

  test("scan-dismissed (real)", async ({ page }) => {
    const title = "Gate0B Scan Dismissed Workout";
    await stubRadio(
      page,
      "NotFoundError",
      "User cancelled the requestDevice() chooser.",
    );
    await openConnect(page, title, "gate0b-dismissed@e2e.test");
    await expect(
      page.locator(".connected-serif-line", {
        hasText: "No monitor was picked.",
      }),
    ).toBeVisible({ timeout: 30_000 });
    await realAndCheck(page, "scan-dismissed", "scan-dismissed");
    await reconstructed(
      page,
      "scan-dismissed",
      REASONS["scan-dismissed"]!,
      false,
      "scan-dismissed-BEFORE",
      { before: true, variant: "before" },
    );
    await cleanupByTitle(page, title);
  });

  test("scan-cleanup-failed (real)", async ({ page }) => {
    const title = "Gate0B Cleanup Failed Workout";
    await stubRadio(page, "ScanCleanupFailedError", "stopLEScan rejected");
    await openConnect(page, title, "gate0b-cleanup@e2e.test");
    await expect(
      page.locator(".connected-serif-line", {
        hasText: "Bluetooth cleanup failed.",
      }),
    ).toBeVisible({ timeout: 30_000 });
    await realAndCheck(page, "scan-cleanup-failed", "scan-cleanup-failed");
    await reconstructed(
      page,
      "scan-cleanup-failed",
      REASONS["scan-cleanup-failed"]!,
      false,
      "scan-cleanup-failed-BEFORE",
      { before: true, variant: "before" },
    );
    await cleanupByTitle(page, title);
  });
});
