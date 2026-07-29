import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "unit",
          environment: "node",
          include: ["server/**/*.test.ts", "domain/**/*.test.ts"],
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
        "src/platform.ts",
        "server/index.ts",
        "server/testDeps.ts",
        "**/*.test.*",
      ],
      // Ratchet floor: near-total coverage is cheap on a skeleton. Raise, never
      // lower, as the app grows (natalie convention).
      thresholds: {
        statements: 90,
        branches: 90,
        functions: 90,
        lines: 90,
      },
    },
  },
});
