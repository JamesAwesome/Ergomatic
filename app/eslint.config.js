import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";
import prettierConfig from "eslint-config-prettier";
import vitest from "@vitest/eslint-plugin";

export default tseslint.config(
  {
    ignores: [
      "dist",
      "coverage",
      "drizzle",
      "playwright-report",
      "test-results",
    ],
  },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2023,
      globals: { ...globals.browser, ...globals.node },
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": [
        "warn",
        { allowConstantExport: true },
      ],
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
    },
  },
  {
    files: ["**/*.test.{ts,tsx}"],
    plugins: { vitest },
    rules: {
      ...vitest.configs.recommended.rules,
      "vitest/expect-expect": "error",
      "vitest/no-conditional-expect": "error",
      "vitest/no-disabled-tests": "error",
      "vitest/no-focused-tests": "error",
      "vitest/prefer-strict-equal": "error",
    },
  },
  {
    // Native-first policy (CLAUDE.md): screens never branch on platform.
    // Platform/Capacitor imports are legal ONLY in the adapter layer; tests
    // are exempt so they can mock the seams (vi.doMock hits no import
    // syntax anyway — this exemption is for adapter tests importing seams).
    files: ["src/**/*.{ts,tsx}"],
    ignores: [
      "src/platform.ts",
      "src/api.ts",
      "src/native/**",
      "src/adapters/**",
      // Phase 7A Task 5: the monitor's own radio adapters
      // (`capacitorBle.ts`/`webBluetooth.ts`) ARE this domain's adapter
      // layer — the one place `@capacitor-community/bluetooth-le` is
      // allowed, same native-first reasoning as `src/adapters/**` above,
      // just organized under `src/monitor/` instead since these two files
      // are Transport implementations, not general platform adapters.
      // Named individually (final-review L-5), matching vitest.config.ts's
      // own coverage-exclude list exactly — a bare `src/monitor/
      // transports/**` glob silently exempted `fake.ts` too (harmless
      // today; it imports no Capacitor) and would invisibly exempt any
      // FUTURE file dropped into this directory, including the new dev-lab
      // harness's own imports.
      "src/monitor/transports/capacitorBle.ts",
      "src/monitor/transports/webBluetooth.ts",
      "src/**/*.test.{ts,tsx}",
    ],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "@capacitor/*",
                "@capacitor-community/*",
                "@capgo/*",
                "@aparajita/*",
              ],
              message:
                "Capacitor plugins live behind the adapter layer (src/platform.ts, src/api.ts, src/native/, src/adapters/) — native-first policy, see CLAUDE.md.",
            },
            {
              group: ["./platform", "../platform", "**/platform"],
              message:
                "Screens must not call isNative(): import a function/component from src/adapters/ instead.",
            },
            {
              group: ["./native/*", "../native/*", "**/native/*"],
              message:
                "Native modules are adapter-internal: import from src/adapters/ instead.",
            },
          ],
        },
      ],
    },
  },
  prettierConfig,
);
