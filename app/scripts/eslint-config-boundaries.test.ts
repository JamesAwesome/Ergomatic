import { fileURLToPath } from "node:url";

import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

const appRoot = fileURLToPath(new URL("..", import.meta.url));

function severity(
  config: Awaited<ReturnType<ESLint["calculateConfigForFile"]>>,
  rule: string,
): unknown {
  const setting = config?.rules?.[rule];
  return Array.isArray(setting) ? setting[0] : setting;
}

describe("ESLint config boundaries", () => {
  it("ignores generated Capacitor web assets", async () => {
    const eslint = new ESLint({ cwd: appRoot });

    await expect(
      eslint.isPathIgnored("ios/App/App/public/assets/index.js"),
    ).resolves.toBe(true);
  });

  it("keeps typed and React rules on client source", async () => {
    const eslint = new ESLint({ cwd: appRoot });
    const config = await eslint.calculateConfigForFile("src/main.tsx");

    expect(config?.languageOptions?.parserOptions?.jsDocParsingMode).toBe(
      "none",
    );
    expect(severity(config, "react-hooks/rules-of-hooks")).toBe(2);
    expect(severity(config, "react-refresh/only-export-components")).toBe(1);
  });

  it("does not load React rules for end-to-end tests", async () => {
    const eslint = new ESLint({ cwd: appRoot });
    const config = await eslint.calculateConfigForFile("e2e/design.spec.ts");

    expect(severity(config, "react-hooks/rules-of-hooks")).toBeUndefined();
    expect(
      severity(config, "react-refresh/only-export-components"),
    ).toBeUndefined();
  });
});
