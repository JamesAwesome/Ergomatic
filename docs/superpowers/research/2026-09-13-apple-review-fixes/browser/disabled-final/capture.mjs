import { createRequire } from "node:module";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(
  path.resolve(here, "../../../../../app/package.json"),
);
const { chromium } = require("@playwright/test");
const AxeBuilder = require("@axe-core/playwright").default;
const baseURL = process.env.E2E_BASE_URL;
if (!baseURL) throw new Error("E2E_BASE_URL is required");

const options = {
  frontDoorEnabled: true,
  apple: { native: true, web: false },
  google: { native: true, web: true },
};
const viewports = [
  { label: "portrait", width: 390, height: 844 },
  { label: "landscape", width: 844, height: 390 },
];
const captures = path.join(here, "captures");
await mkdir(captures, { recursive: true });

const browser = await chromium.launch();
const results = [];
try {
  for (const viewport of viewports) {
    const context = await browser.newContext({
      baseURL,
      viewport: { width: viewport.width, height: viewport.height },
      colorScheme: "light",
      reducedMotion: "reduce",
    });
    const page = await context.newPage();
    await page.route("**/api/auth/options", (route) =>
      route.fulfill({ status: 200, json: options }),
    );
    await page.route("**/api/auth/methods", (route) =>
      route.fulfill({ status: 200, json: { apple: false, google: true } }),
    );
    const signIn = await page.request.post(`${baseURL}/api/auth/test-signin`, {
      data: {
        secret: "e2e-secret",
        email: `apple-disabled-final-${viewport.label}-${Date.now()}@e2e.test`,
        name: "Apple Link Tester",
      },
    });
    if (!signIn.ok()) {
      throw new Error(
        `capture backdoor sign-in failed: ${signIn.status()} ${await signIn.text()}`,
      );
    }
    await page.goto("/you");
    await page.getByText("CONNECTED").waitFor();
    const row = page.getByRole("button", { name: "Add Apple" });
    await row.waitFor();
    if (!(await row.isDisabled())) throw new Error("Add Apple is enabled");
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(100);

    const metrics = await row.evaluate((node) => {
      const action = node.querySelector(".auth-method-action");
      if (!(action instanceof HTMLElement)) throw new Error("action missing");
      const provider = node.querySelector(".auth-method-name");
      if (!(provider instanceof HTMLElement)) throw new Error("provider missing");
      const box = node.getBoundingClientRect();
      const style = getComputedStyle(node);
      const actionStyle = getComputedStyle(action);
      const providerStyle = getComputedStyle(provider);
      return {
        disabled: node.disabled,
        row: {
          box: box.toJSON(),
          color: style.color,
          cursor: style.cursor,
          fontSize: style.fontSize,
        },
        provider: {
          color: providerStyle.color,
          cursor: providerStyle.cursor,
        },
        action: {
          color: actionStyle.color,
          cursor: actionStyle.cursor,
        },
        document: {
          clientWidth: document.documentElement.clientWidth,
          scrollWidth: document.documentElement.scrollWidth,
          clientHeight: document.documentElement.clientHeight,
          scrollHeight: document.documentElement.scrollHeight,
        },
      };
    });
    const axeResult = await new AxeBuilder({ page }).analyze();
    const axe = axeResult.violations.map((violation) => ({
      id: violation.id,
      impact: violation.impact,
      help: violation.help,
      nodes: violation.nodes.map((node) => node.target),
    }));
    const file = `unavailable-add-${viewport.label}-${viewport.width}x${viewport.height}.png`;
    await page.screenshot({ path: path.join(captures, file), fullPage: false });
    results.push({ viewport, file, metrics, axe });
    await context.close();
  }
} finally {
  await browser.close();
}

await writeFile(
  path.join(here, "capture-metrics.json"),
  `${JSON.stringify(results, null, 2)}\n`,
);
process.stdout.write(`${results.length} disabled-Add captures written\n`);
