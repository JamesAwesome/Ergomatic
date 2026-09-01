import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "unit",
          environment: "node",
          include: [
            "server/**/*.test.ts",
            "domain/**/*.test.ts",
            "scripts/**/*.test.ts",
          ],
          exclude: ["server/**/*.integration.test.ts"],
        },
      },
      {
        plugins: [react()],
        test: {
          name: "client",
          environment: "jsdom",
          globals: true,
          setupFiles: "./src/test/setup.ts",
          include: ["src/**/*.test.{ts,tsx}"],
          env: { VITE_API_BASE: "https://api.test" },
        },
      },
      {
        test: {
          name: "integration",
          environment: "node",
          include: ["server/**/*.integration.test.ts"],
          testTimeout: 120_000,
          hookTimeout: 120_000,
        },
      },
    ],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["src/**/*.{ts,tsx}", "server/**/*.ts", "domain/**/*.ts"],
      exclude: [
        "src/main.tsx",
        "src/vite-env.d.ts",
        "src/test/**",
        "src/native/**",
        // Phase 7A Task 5: the two radio Transport adapters — no BLE radio
        // exists in CI (or on the runner at all), so a mocked
        // BleClient/navigator.bluetooth would only prove each file calls
        // its own mock correctly, never that it talks to a real PM5.
        // "Compile-tested shapes" (enforced by `pnpm typecheck`, not this
        // gate) is the honest ceiling here — the real proof is James's
        // laptop-vs-real-PM5 session, post-merge (interface-notes.md §17),
        // the same boundary `src/native/**` above already draws for
        // on-device plugin wrappers.
        "src/monitor/transports/capacitorBle.ts",
        "src/monitor/transports/webBluetooth.ts",
        // Final-review M-5: the laptop-session dev harness — a Chrome-only
        // entry point wiring the two adapters above to a real driver, no
        // product UI, nothing this gate can run headlessly against either.
        // Joins the same "compile-tested shapes" boundary the two
        // Transport adapters already draw (the `include` glob above never
        // reaches `scripts/**` in the first place; listed here anyway for
        // the same reason the two adapters are — explicit, not implicit).
        "scripts/pm5-lab.ts",
        // PR1.5's own instance of the same boundary, one file: jsdom's
        // `window.location.assign` throws "Not implemented: navigation"
        // when actually invoked and cannot even be `vi.spyOn`'d ("Cannot
        // redefine property: assign", checked against this repo's jsdom) —
        // no test environment here can exercise the real call.
        // `externalBrowser.test.ts` covers this module's CONSUMER
        // (`openExternalUrl` calls it, correctly, via `vi.doMock`); the one
        // line inside is compile-tested only, same ceiling as the two
        // Transport adapters above.
        "src/adapters/webNavigate.ts",
        "src/platform.ts",
        "server/index.ts",
        "server/testDeps.ts",
        "server/testing/**",
        "server/stores/contracts/**",
        "**/*.test.*",
      ],
      // Ratchet floor: near-total coverage is cheap on a skeleton. Raise, never
      // lower, as the app grows (natalie convention).
      thresholds: {
        statements: 90,
        branches: 90,
        functions: 90,
        lines: 90,
        "domain/**/*.ts": {
          statements: 100,
          branches: 100,
          functions: 100,
          lines: 100,
        },
      },
    },
  },
});
