import { createRequire } from "node:module";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(
  path.resolve(here, "../../../../app/package.json"),
);
const { chromium } = require("@playwright/test");
const AxeBuilder = require("@axe-core/playwright").default;

const baseURL = process.env.E2E_BASE_URL;
if (!baseURL) throw new Error("E2E_BASE_URL is required");

const captureDir = path.join(here, "captures");
await mkdir(captureDir, { recursive: true });

const options = {
  frontDoorEnabled: true,
  apple: { native: true, web: true },
  google: { native: true, web: true },
};
const viewports = [
  { label: "portrait", width: 390, height: 844 },
  { label: "landscape", width: 844, height: 390 },
];

function normalizeViolations(result) {
  return result.violations.map((violation) => ({
    id: violation.id,
    impact: violation.impact,
    help: violation.help,
    nodes: violation.nodes.map((node) => node.target),
  }));
}

async function capture(page, state, viewport) {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(100);
  const metrics = await page.evaluate(() => {
    const describe = (selector) =>
      [...document.querySelectorAll(selector)].map((node) => {
        const box = node.getBoundingClientRect();
        const style = getComputedStyle(node);
        return {
          selector,
          text: (node.textContent ?? "").replace(/\s+/g, " ").trim(),
          disabled: node instanceof HTMLButtonElement ? node.disabled : null,
          box: {
            x: box.x,
            y: box.y,
            width: box.width,
            height: box.height,
            right: box.right,
            bottom: box.bottom,
          },
          style: {
            color: style.color,
            backgroundColor: style.backgroundColor,
            borderTopColor: style.borderTopColor,
            borderTopWidth: style.borderTopWidth,
            borderTopStyle: style.borderTopStyle,
            fontFamily: style.fontFamily,
            fontSize: style.fontSize,
            fontWeight: style.fontWeight,
            lineHeight: style.lineHeight,
            opacity: style.opacity,
          },
        };
      });
    return {
      url: location.href,
      viewport: { width: innerWidth, height: innerHeight },
      document: {
        htmlClientWidth: document.documentElement.clientWidth,
        htmlScrollWidth: document.documentElement.scrollWidth,
        htmlClientHeight: document.documentElement.clientHeight,
        htmlScrollHeight: document.documentElement.scrollHeight,
        bodyScrollWidth: document.body.scrollWidth,
        bodyScrollHeight: document.body.scrollHeight,
      },
      body: describe("body"),
      main: describe("main"),
      alerts: describe('[role="alert"]'),
      statuses: describe('[role="status"]'),
      providerButtons: describe(".auth-provider-button"),
      methodRows: describe(".auth-method-row"),
      methodActions: describe(".auth-method-action"),
      connectedLabels: describe(".auth-method-connected"),
    };
  });
  const axe = normalizeViolations(await new AxeBuilder({ page }).analyze());
  const file = `${state}-${viewport.label}-${viewport.width}x${viewport.height}.png`;
  await page.screenshot({ path: path.join(captureDir, file), fullPage: false });
  return { state, file, metrics, axe };
}

async function newPage(browser, viewport) {
  const context = await browser.newContext({
    baseURL,
    viewport: { width: viewport.width, height: viewport.height },
    colorScheme: "light",
    reducedMotion: "reduce",
  });
  return { context, page: await context.newPage() };
}

async function routeSignedOut(page) {
  await page.route("**/api/me", (route) =>
    route.fulfill({ status: 401, json: { error: "unauthenticated" } }),
  );
}

const browser = await chromium.launch();
const results = [];
try {
  for (const viewport of viewports) {
    {
      const { context, page } = await newPage(browser, viewport);
      await page.route("**/api/auth/options", (route) =>
        route.fulfill({ status: 200, json: options }),
      );
      await routeSignedOut(page);
      await page.goto(
        "/?keep=1&authError=access_denied&authEmail=relay%40privaterelay.appleid.com&authPurpose=signin&authProvider=apple#return",
      );
      await page
        .getByRole("alert")
        .filter({ hasText: "isn't invited to this Ergomatic" })
        .waitFor();
      results.push(await capture(page, "access-denied", viewport));
      await context.close();
    }

    {
      const { context, page } = await newPage(browser, viewport);
      await page.route("**/api/auth/options", (route) =>
        route.fulfill({
          status: 200,
          json: { ...options, apple: { native: true, web: false } },
        }),
      );
      await page.route("**/api/auth/methods", (route) =>
        route.fulfill({ status: 200, json: { apple: false, google: true } }),
      );
      const signIn = await page.request.post(
        `${baseURL}/api/auth/test-signin`,
        {
          data: {
            secret: "e2e-secret",
            email: `apple-capture-${viewport.label}-${Date.now()}@e2e.test`,
            name: "Apple Link Tester",
          },
        },
      );
      if (!signIn.ok()) {
        throw new Error(
          `capture backdoor sign-in failed: ${signIn.status()} ${await signIn.text()}`,
        );
      }
      await page.goto("/you");
      await page.getByText("CONNECTED").waitFor();
      const addApple = page.getByRole("button", { name: "Add Apple" });
      await addApple.waitFor();
      if (!(await addApple.isDisabled())) throw new Error("Add Apple is enabled");
      results.push(await capture(page, "unavailable-add", viewport));
      await context.close();
    }

    {
      const { context, page } = await newPage(browser, viewport);
      let cancellations = 0;
      let starts = 0;
      await page.route("**/api/auth/options", (route) =>
        route.fulfill({ status: 200, json: options }),
      );
      await routeSignedOut(page);
      await page.route("**/api/auth/web/attempts/cancel-delivery", (route) =>
        route.fulfill({
          status: 200,
          json: {
            outcome: "confirm",
            attemptId: "cancel-delivery",
            purpose: "signin",
            targetProvider: "apple",
            expiresAt: "2026-09-13T00:05:00.000Z",
            profile: { email: "relay@apple.test", name: "Rower" },
          },
        }),
      );
      await page.route(
        "**/api/auth/web/attempts/cancel-delivery/cancel",
        async (route) => {
          cancellations += 1;
          if (cancellations === 1) await route.abort("connectionfailed");
          else await route.fulfill({ status: 204 });
        },
      );
      await page.route("**/api/auth/web/attempts", async (route) => {
        starts += 1;
        await route.fulfill({
          status: 200,
          json: {
            outcome: "authorize",
            attemptId: "replacement",
            purpose: "signin",
            targetProvider: "apple",
            expiresAt: "2026-09-13T00:05:00.000Z",
            provider: "apple",
            stage: "signin",
            nonce: "new-nonce",
            state: "new-state",
            authorizationUrl:
              "/?authResult=cancelled&authPurpose=signin&authProvider=apple",
          },
        });
      });

      await page.goto("/?authAttempt=cancel-delivery");
      await page.getByRole("button", { name: "← BACK" }).click();
      await page
        .getByRole("alert")
        .filter({ hasText: "That sign-in didn’t work" })
        .waitFor();
      if (cancellations !== 1) {
        throw new Error(`expected one failed cancellation, saw ${cancellations}`);
      }
      results.push(await capture(page, "failed-cancel-notice", viewport));

      await page.getByRole("button", { name: "Continue with Apple" }).click();
      for (let wait = 0; wait < 100 && (cancellations !== 2 || starts !== 1); wait += 1) {
        await page.waitForTimeout(25);
      }
      await page.waitForFunction(
        () => !location.search.includes("authResult"),
      );
      await page.getByRole("button", { name: "Continue with Apple" }).waitFor();
      if (cancellations !== 2 || starts !== 1) {
        throw new Error(
          `recovery counts: cancellations=${cancellations}, starts=${starts}`,
        );
      }
      if ((await page.getByRole("alert").count()) !== 0) {
        throw new Error("recovery retained an alert");
      }
      results.push(await capture(page, "failed-cancel-recovery", viewport));
      await context.close();
    }
  }
} finally {
  await browser.close();
}

await writeFile(
  path.join(here, "capture-metrics.json"),
  `${JSON.stringify(results, null, 2)}\n`,
);
process.stdout.write(
  `${results.length} captures written; ${results.reduce((sum, result) => sum + result.axe.length, 0)} axe violations\n`,
);
