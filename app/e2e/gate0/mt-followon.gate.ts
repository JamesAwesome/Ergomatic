// GATE 0 CAPTURE HARNESS — Phase MT follow-on, the two changes filed against
// `ConnectedInterstitial`'s failure frames (2026-09-08).
//
// NOT part of the e2e suite, on purpose. The filename ends `.gate.ts`, which
// `playwright.config.ts`'s default `testMatch` does not accept, so `pnpm e2e`
// and CI never run it; `playwright.gate0.config.ts` is the only config that
// selects it. It exists to PRODUCE the artifact James rules on — real
// captures at real proportions plus the measured geometry behind them — not
// to gate anything. Every assertion in here is a precondition on the fixture
// (we are standing on the frame we think we are), never a claim about the
// design.
//
// Everything is driven through the same supported producers `design.spec.ts`
// and `screenshots.spec.ts` use: the fake monitor's `ergMachineType` for the
// SkiErg refusal, `stubBluetoothPermissionDenied` for the permission frame,
// `stubBluetoothScanFailure` for the link failure.
//
// ONE SHAPE WAS NOT REACHABLE FROM THE WEB BUILD WHEN THESE CAPTURES WERE
// TAKEN and is reconstructed rather than driven: the FIVE-button
// `permission-denied` stack, whose extra `Open Settings` button renders only
// when `canOpenAppSettings()` is true, which was `isNative()` alone
// (`src/adapters/appSettings.ts`). `e2e/helpers.ts`'s own comment on
// `stubBluetoothPermissionDenied` said the same thing. Forcing `isNative()` —
// via `window.CapacitorCustomPlatform` — also flips
// `src/adapters/monitorTransport.ts` onto the Capacitor BLE arm, so the frame
// would never have been reached at all. The variants below therefore INSERT
// the identical button node the native render produces (`<button
// type="button" class="button-l1">Open Settings</button>`, first child of the
// stack, which is where `ConnectedInterstitial.tsx` renders it) and
// re-measure. That is a real measurement of the real CSS over the real fonts;
// it is not a measurement of the real React tree, and every figure it produces
// is labelled `reconstructed` in the output JSON.
//
// SUPERSEDED, and left in the past tense rather than rewritten because this
// harness's output is a dated record of what it did: the Phase MT close-out
// gave that adapter a DEV-ONLY DOOR OVERRIDE (`window.__appSettingsDoor__`,
// gated on the same build-time fold every other dev seam uses, needled by
// `scripts/dist-grep.sh`, ruled out for `isNative()` for exactly the
// Capacitor-arm reason this comment gives). `e2e/helpers.ts`'s
// `forceAppSettingsDoor` writes the token and `e2e/design.spec.ts` drives the
// real five-button React tree. A future run of this harness should use that
// seam and drop the reconstruction; the committed captures were not re-made.

import fs from "node:fs";
import path from "node:path";
import { test, expect, type Page } from "@playwright/test";
import {
  signInViaBackdoor,
  stubBluetoothPermissionDenied,
  stubBluetoothScanFailure,
} from "../helpers";

/** `before` (HEAD) or `after` (both changes applied) — the build under the
 *  browser decides which, and the runner passes the matching label. */
const VARIANT = process.env.GATE_VARIANT ?? "before";
const OUT = path.resolve(
  process.cwd(),
  "../docs/design/mt-followon-gate0",
  VARIANT,
);
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

const BASELINES = { k2Seconds: 100, k6Seconds: 120 };

async function setBaselines(page: Page): Promise<void> {
  const r = await page.evaluate(async (patch) => {
    const res = await fetch("/api/baselines", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    return { ok: res.ok, status: res.status };
  }, BASELINES);
  if (!r.ok) throw new Error(`baseline setup failed: ${r.status}`);
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

/** Every number the gate reports, read in ONE `page.evaluate` so no React
 *  re-render can land between reads. Geometry relative to
 *  `.connected-interstitial-body`'s own client box (the box the rower sees)
 *  is exactly `design.spec.ts`'s `measureFailureFrame` convention. */
async function measure(page: Page): Promise<unknown> {
  await page.evaluate(() => document.fonts.ready);
  return page.evaluate(() => {
    const body = document.querySelector<HTMLElement>(
      ".connected-interstitial-body",
    );
    const stack = document.querySelector<HTMLElement>(".action-stack");
    const serif = document.querySelector<HTMLElement>(".connected-serif-line");
    if (body === null || stack === null || serif === null)
      throw new Error("no failure frame on screen to measure");

    const clientTopOf = (el: HTMLElement): number =>
      el.getBoundingClientRect().top + el.clientTop;
    body.scrollTop = 0;
    const restTop = clientTopOf(body);
    const serifRect = serif.getBoundingClientRect();
    const remedy = body.querySelector<HTMLElement>(".connected-body-line");

    // The effective painted background behind an element: the nearest
    // ancestor whose own background-color is not fully transparent.
    const effectiveBg = (el: Element): string => {
      let node: Element | null = el;
      while (node !== null) {
        const bg = getComputedStyle(node).backgroundColor;
        const m = /rgba?\(([^)]+)\)/.exec(bg);
        if (m) {
          const parts = m[1].split(",").map((s) => Number(s.trim()));
          if (parts.length < 4 || parts[3] > 0) return bg;
        }
        node = node.parentElement;
      }
      return "rgb(255, 255, 255)";
    };

    const textish = Array.from(
      document.querySelectorAll<HTMLElement>(
        ".connected-status-label, .connected-serif-line, .connected-body-line, .connected-reassurance, .connected-detail-title, .connected-detail-line, .connected-support-link, .action-stack button",
      ),
    ).map((el) => {
      const cs = getComputedStyle(el);
      return {
        selector: el.className,
        text: (el.textContent ?? "").trim().slice(0, 60),
        color: cs.color,
        background: effectiveBg(el),
        fontSize: cs.fontSize,
      };
    });

    const buttons = Array.from(
      stack.querySelectorAll<HTMLButtonElement>("button"),
    ).map((b) => {
      const r = b.getBoundingClientRect();
      return {
        label: (b.textContent ?? "").trim(),
        className: b.className,
        x: Math.round(r.x * 10) / 10,
        y: Math.round(r.y * 10) / 10,
        width: Math.round(r.width * 10) / 10,
        height: Math.round(r.height * 10) / 10,
        gridColumn: getComputedStyle(b).gridColumn,
        disabled: b.disabled,
      };
    });

    const taps = Array.from(
      document.querySelectorAll<HTMLElement>(
        "a, button, [role=button], input, select",
      ),
    )
      .filter((el) => el.getBoundingClientRect().width > 0)
      .map((el) => {
        const r = el.getBoundingClientRect();
        return {
          label: (el.textContent ?? "").trim().slice(0, 40) || el.tagName,
          width: Math.round(r.width * 10) / 10,
          height: Math.round(r.height * 10) / 10,
        };
      });

    const stackRect = stack.getBoundingClientRect();
    return {
      viewport: { width: window.innerWidth, height: window.innerHeight },
      buttonCount: buttons.length,
      buttons,
      actionStackHeight: Math.round(stackRect.height * 10) / 10,
      // What the action stack costs the frame overall: its own box plus the
      // 12px margin-top `.connected-interstitial-actions` carries.
      actionStackHeightWithMargin:
        Math.round(
          (stackRect.height +
            parseFloat(getComputedStyle(stack).marginTop || "0")) *
            10,
        ) / 10,
      messageWindow: body.clientHeight,
      contentHeight: body.scrollHeight,
      overflow: body.scrollHeight - body.clientHeight,
      serifTop: Math.round((serifRect.top - restTop) * 10) / 10,
      serifBottom: Math.round((serifRect.bottom - restTop) * 10) / 10,
      headlineOnFrame:
        serifRect.top - restTop >= -0.5 &&
        serifRect.bottom - restTop <= body.clientHeight + 0.5,
      remedyTop:
        remedy === null
          ? null
          : Math.round((remedy.getBoundingClientRect().top - restTop) * 10) /
            10,
      remedyText: remedy === null ? null : (remedy.textContent ?? "").trim(),
      hasDetailPanel:
        document.querySelector(".connected-detail-panel") !== null,
      detailPanelHeight:
        document
          .querySelector<HTMLElement>(".connected-detail-panel")
          ?.getBoundingClientRect().height ?? null,
      minTapWidth: Math.min(...taps.map((t) => t.width)),
      minTapHeight: Math.min(...taps.map((t) => t.height)),
      subTapTargets: taps.filter((t) => t.width < 44 || t.height < 44),
      text: textish,
    };
  });
}

/** The two reconstructions. `openSettings` inserts the native-only fifth
 *  button; `dropRowInstead` removes "Row on the phone timer instead", which
 *  is what a change-1 scoped to ALL failure frames would do. Both are DOM
 *  edits on a React tree that will not re-render on its own, so they stick. */
interface Reshape {
  openSettings?: boolean;
  dropRowInstead?: boolean;
  /** Change 2, option A: the whole DETAIL panel goes (what #366 did to the
   *  refusal frame). */
  dropDetailPanel?: boolean;
  /** Change 2, option B: only the panel line that repeats `error.detail`
   *  verbatim goes; DETAIL, the reason slug and the raw platform string
   *  stay. */
  dropDuplicateDetailLine?: boolean;
  /** Landscape-stack alternates for a THREE-button frame, injected as real
   *  CSS so the grid resolves them for real:
   *    "B" — the first button (Try again) full width, the last two paired.
   *    "C" — the first two paired, the last button (Cancel) spanning. */
  layout?: "B" | "C";
}

async function reshapeStack(page: Page, opts: Reshape): Promise<void> {
  await page.evaluate((o) => {
    const stack = document.querySelector<HTMLElement>(".action-stack");
    if (stack === null) throw new Error("no action stack");
    if (o.dropDetailPanel === true)
      document.querySelector(".connected-detail-panel")?.remove();
    if (
      o.dropDuplicateDetailLine === true &&
      document.querySelector(".connected-detail-panel[data-gate0-deduped]") ===
        null
    ) {
      const panel = document.querySelector(".connected-detail-panel");
      const body = document.querySelector(".connected-body-line");
      const serif = document.querySelector(".connected-serif-line");
      const above = [body, serif]
        .filter((el): el is Element => el !== null)
        .map((el) => (el.textContent ?? "").trim());
      const dup = Array.from(
        panel?.querySelectorAll(".connected-detail-line") ?? [],
      ).find((el) => above.includes((el.textContent ?? "").trim()));
      // A precondition, not decoration: if this frame's panel does NOT
      // repeat something already on screen, the option being rendered does
      // not apply to it and the capture would be a lie.
      if (dup === undefined)
        throw new Error("no duplicated DETAIL line on this frame");
      dup.remove();
      panel?.setAttribute("data-gate0-deduped", "");
    }
    if (
      o.layout !== undefined &&
      document.getElementById("gate0-layout") === null
    ) {
      const style = document.createElement("style");
      style.id = "gate0-layout";
      const target = o.layout === "B" ? "first-child" : "last-child";
      style.textContent =
        "@media (orientation: landscape) {" +
        `.connected-interstitial-actions--failure > button:${target}` +
        "{ grid-column: 1 / -1; } }";
      document.head.appendChild(style);
    }
    if (o.dropRowInstead === true) {
      const b = Array.from(stack.querySelectorAll("button")).find(
        (x) =>
          (x.textContent ?? "").trim() === "Row on the phone timer instead",
      );
      b?.remove();
    }
    if (
      o.openSettings === true &&
      !Array.from(stack.querySelectorAll("button")).some(
        (x) => (x.textContent ?? "").trim() === "Open Settings",
      )
    ) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "button-l1";
      b.textContent = "Open Settings";
      stack.insertBefore(b, stack.firstChild);
    }
  }, opts);
}

async function shoot(page: Page, name: string): Promise<void> {
  await page.screenshot({ path: path.join(OUT, `${name}.png`) });
}

/** Capture + measure one frame in both orientations under one label. */
async function bothOrientations(
  page: Page,
  name: string,
  reshape?: Reshape,
): Promise<void> {
  for (const [label, vp] of [
    ["portrait", PORTRAIT],
    ["landscape", LANDSCAPE],
  ] as const) {
    await page.setViewportSize(vp);
    if (reshape !== undefined) await reshapeStack(page, reshape);
    await page.waitForTimeout(150);
    // Written per capture rather than accumulated: `fullyParallel` puts each
    // test in its own worker process, so a shared in-memory map would come
    // back with one test's worth of rows. `merge-measures.mjs` joins them.
    const m = await measure(page);
    fs.writeFileSync(
      path.join(OUT, `measure-${name}-${label}.json`),
      `${JSON.stringify({ [`${name}-${label}`]: m }, null, 2)}\n`,
    );
    await shoot(page, `${name}-${label}`);
  }
}

test.describe("Gate 0 — Phase MT follow-on failure frames", () => {
  test.setTimeout(180_000);

  test("unsupported-machine (the SkiErg refusal)", async ({ page }) => {
    const title = "Gate0 Refusal Workout";
    // 128 = ERGMACHINE_TYPE_STATIC_SKI: the fake reports it on 0x0032, the
    // real parser reads it, and the real driver and hook refuse the sitting.
    await injectFake(page, 128);
    await openConnect(page, title, "gate0-refusal@e2e.test");
    const refused = page.locator(".connected-serif-line", {
      hasText: "Erg type not supported",
    });
    await expect(refused).toBeVisible({ timeout: 30_000 });
    await bothOrientations(page, "refusal");
    await cleanupByTitle(page, title);
  });

  test("unsupported-machine, with the phone-timer button dropped by hand", async ({
    page,
  }) => {
    const title = "Gate0 Refusal Dropped Workout";
    await injectFake(page, 128);
    await openConnect(page, title, "gate0-refusal-drop@e2e.test");
    await expect(
      page.locator(".connected-serif-line", {
        hasText: "Erg type not supported",
      }),
    ).toBeVisible({ timeout: 30_000 });
    await bothOrientations(page, "refusal-3btn-reconstructed", {
      dropRowInstead: true,
    });
    await cleanupByTitle(page, title);
  });

  test("permission-denied (web, four buttons)", async ({ page }) => {
    const title = "Gate0 Permission Workout";
    await stubBluetoothPermissionDenied(page);
    await openConnect(page, title, "gate0-permission@e2e.test");
    await expect(
      page.locator(".connected-serif-line", {
        hasText: "Bluetooth permission needed",
      }),
    ).toBeVisible({ timeout: 30_000 });
    await bothOrientations(page, "permission-web4");
    await cleanupByTitle(page, title);
  });

  test("permission-denied, the five-button iOS stack (reconstructed)", async ({
    page,
  }) => {
    const title = "Gate0 Permission iOS Workout";
    await stubBluetoothPermissionDenied(page);
    await openConnect(page, title, "gate0-permission-ios@e2e.test");
    await expect(
      page.locator(".connected-serif-line", {
        hasText: "Bluetooth permission needed",
      }),
    ).toBeVisible({ timeout: 30_000 });
    await bothOrientations(page, "permission-ios5-reconstructed", {
      openSettings: true,
    });
    await cleanupByTitle(page, title);
  });

  test("permission-denied, iOS stack with the phone-timer button dropped too (reconstructed)", async ({
    page,
  }) => {
    const title = "Gate0 Permission iOS Dropped Workout";
    await stubBluetoothPermissionDenied(page);
    await openConnect(page, title, "gate0-permission-ios-drop@e2e.test");
    await expect(
      page.locator(".connected-serif-line", {
        hasText: "Bluetooth permission needed",
      }),
    ).toBeVisible({ timeout: 30_000 });
    await bothOrientations(page, "permission-ios4-dropped-reconstructed", {
      openSettings: true,
      dropRowInstead: true,
    });
    await cleanupByTitle(page, title);
  });

  // --- CHANGE 1's landscape alternates, at three buttons ---------------
  //
  // `-n + 4` matches ALL THREE children at three buttons, so the stack
  // resolves to [Try again | View connection log] and Cancel alone in the
  // left column with an empty cell beside it. B and C are the two ways to
  // close that hole; both are injected as REAL CSS so the grid resolves them
  // rather than being drawn.

  test("unsupported-machine, three buttons, layout option B", async ({
    page,
  }) => {
    const title = "Gate0 Refusal Layout B Workout";
    await injectFake(page, 128);
    await openConnect(page, title, "gate0-refusal-b@e2e.test");
    await expect(
      page.locator(".connected-serif-line", {
        hasText: "Erg type not supported",
      }),
    ).toBeVisible({ timeout: 30_000 });
    await bothOrientations(page, "refusal-3btn-optionB", {
      dropRowInstead: true,
      layout: "B",
    });
    await cleanupByTitle(page, title);
  });

  test("unsupported-machine, three buttons, layout option C", async ({
    page,
  }) => {
    const title = "Gate0 Refusal Layout C Workout";
    await injectFake(page, 128);
    await openConnect(page, title, "gate0-refusal-c@e2e.test");
    await expect(
      page.locator(".connected-serif-line", {
        hasText: "Erg type not supported",
      }),
    ).toBeVisible({ timeout: 30_000 });
    await bothOrientations(page, "refusal-3btn-optionC", {
      dropRowInstead: true,
      layout: "C",
    });
    await cleanupByTitle(page, title);
  });

  // --- CHANGE 2's options, on both frames whose panel repeats the top -----

  test("permission-denied, option A: the whole DETAIL panel dropped", async ({
    page,
  }) => {
    const title = "Gate0 Permission Option A Workout";
    await stubBluetoothPermissionDenied(page);
    await openConnect(page, title, "gate0-permission-a@e2e.test");
    await expect(
      page.locator(".connected-serif-line", {
        hasText: "Bluetooth permission needed",
      }),
    ).toBeVisible({ timeout: 30_000 });
    await bothOrientations(page, "permission-web4-optionA", {
      dropDetailPanel: true,
    });
    await cleanupByTitle(page, title);
  });

  test("permission-denied, option B: only the repeated line dropped", async ({
    page,
  }) => {
    const title = "Gate0 Permission Option B Workout";
    await stubBluetoothPermissionDenied(page);
    await openConnect(page, title, "gate0-permission-b@e2e.test");
    await expect(
      page.locator(".connected-serif-line", {
        hasText: "Bluetooth permission needed",
      }),
    ).toBeVisible({ timeout: 30_000 });
    await bothOrientations(page, "permission-web4-optionB", {
      dropDuplicateDetailLine: true,
    });
    await cleanupByTitle(page, title);
  });

  test("permission-denied iOS five-button, option A (reconstructed)", async ({
    page,
  }) => {
    const title = "Gate0 Permission iOS Option A Workout";
    await stubBluetoothPermissionDenied(page);
    await openConnect(page, title, "gate0-permission-ios-a@e2e.test");
    await expect(
      page.locator(".connected-serif-line", {
        hasText: "Bluetooth permission needed",
      }),
    ).toBeVisible({ timeout: 30_000 });
    await bothOrientations(page, "permission-ios5-optionA-reconstructed", {
      openSettings: true,
      dropDetailPanel: true,
    });
    await cleanupByTitle(page, title);
  });

  test("permission-denied iOS five-button, option B (reconstructed)", async ({
    page,
  }) => {
    const title = "Gate0 Permission iOS Option B Workout";
    await stubBluetoothPermissionDenied(page);
    await openConnect(page, title, "gate0-permission-ios-b@e2e.test");
    await expect(
      page.locator(".connected-serif-line", {
        hasText: "Bluetooth permission needed",
      }),
    ).toBeVisible({ timeout: 30_000 });
    await bothOrientations(page, "permission-ios5-optionB-reconstructed", {
      openSettings: true,
      dropDuplicateDetailLine: true,
    });
    await cleanupByTitle(page, title);
  });

  // The SAME duplication, one frame over: `link-failed`'s panel repeats the
  // HEADLINE (`failedSerifLine` returns `error.detail` for every
  // non-machine-refusal reason), so change 2's argument reaches it too. The
  // `dropDuplicateDetailLine` reshape asserts the duplicate exists before it
  // removes it, so this capture is also the evidence for that claim.
  test("link-failed, option B: the repeated headline line dropped", async ({
    page,
  }) => {
    const title = "Gate0 Link Failed Option B Workout";
    await stubBluetoothScanFailure(page);
    await openConnect(page, title, "gate0-linkfailed-b@e2e.test");
    await expect(
      page.locator(".connected-serif-line", {
        hasText: "The link to the monitor failed.",
      }),
    ).toBeVisible({ timeout: 30_000 });
    await bothOrientations(page, "linkfailed-optionB", {
      dropDuplicateDetailLine: true,
    });
    await cleanupByTitle(page, title);
  });

  // THE ONE COMBINATION THAT MAKES THE iOS PERMISSION FRAME FULLY READABLE
  // IN LANDSCAPE, measured because the option list needs its cost either way
  // (RF30): change 2 option A ALONE leaves that frame overflowing — the
  // five-button stack's 138px window against 175px of remaining content — so
  // the remedy's last line is still cut. Dropping the phone-timer button on
  // EVERY failure frame rather than the refusal alone is what takes the
  // window back to 206.
  test("permission-denied iOS, option A AND the phone-timer button dropped everywhere (reconstructed)", async ({
    page,
  }) => {
    const title = "Gate0 Permission iOS Combined Workout";
    await stubBluetoothPermissionDenied(page);
    await openConnect(page, title, "gate0-permission-ios-combined@e2e.test");
    await expect(
      page.locator(".connected-serif-line", {
        hasText: "Bluetooth permission needed",
      }),
    ).toBeVisible({ timeout: 30_000 });
    await bothOrientations(page, "permission-ios4-optionA-reconstructed", {
      openSettings: true,
      dropRowInstead: true,
      dropDetailPanel: true,
    });
    await cleanupByTitle(page, title);
  });

  test("link-failed (the control frame neither change touches)", async ({
    page,
  }) => {
    const title = "Gate0 Link Failed Workout";
    await stubBluetoothScanFailure(page);
    await openConnect(page, title, "gate0-linkfailed@e2e.test");
    await expect(
      page.locator(".connected-serif-line", {
        hasText: "The link to the monitor failed.",
      }),
    ).toBeVisible({ timeout: 30_000 });
    await bothOrientations(page, "linkfailed");
    await cleanupByTitle(page, title);
  });
});
