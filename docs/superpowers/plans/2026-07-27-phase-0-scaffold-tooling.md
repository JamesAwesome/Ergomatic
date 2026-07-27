# Phase 0: Scaffold & Tooling Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A cloned Ergomatic repo where `pnpm install && pnpm test` works, CI is green, and bad code cannot be committed or pushed.

**Architecture:** Single deployable `app/` (Vite React client in `src/`, Express API in `server/`, shared pure logic in `domain/`) mirroring the `nataliesawacritter.info` template. A minimal root `package.json` exists only to host husky git hooks, since hooks are repo-level and the app lives in a subdirectory.

**Tech Stack:** TypeScript (strict, ESM), React 19 + Vite 8, Express 5, Vitest 4 (three projects: unit / client / integration), ESLint 10 flat config, husky + lint-staged, pnpm, GitHub Actions.

## Global Constraints

- **Version freshness (standing rule from ROADMAP.md):** the versions table below was verified against npm/endoflife.date on **2026-07-27**. Task 1 re-verifies before installing. Never substitute a version from memory or from another repo.
- **TypeScript is pinned `~6.0.3`** — do NOT upgrade to 7.x: `typescript-eslint@8.65.0` declares peer `typescript >=4.8.4 <6.1.0` (verified 2026-07-27). Revisit when typescript-eslint supports TS 7.
- **Node 26** (current line, LTS 2026-10-28; matches natalie). **pnpm 11.17.0** via `packageManager` field. pnpm only — `only-allow pnpm` preinstall.
- ESM everywhere (`"type": "module"`). Server-relative imports use the `.js` extension (`./app.js` resolves to `app.ts` under `moduleResolution: bundler`; compiled output stays Node-ESM-valid).
- Test scripts set `NODE_OPTIONS=--no-experimental-webstorage` (Node's experimental localStorage global conflicts with jsdom's; copied from natalie).
- App name in all UI/docs copy: **Ergomatic**.
- Every task ends with a commit; every commit must pass the hooks once Task 7 lands.

**Verified versions (2026-07-27):** typescript 6.0.3 (pinned; 7.0.2 blocked by typescript-eslint), react/react-dom 19.2.8, vite 8.1.5, @vitejs/plugin-react 6.0.4, express 5.2.1, vitest + @vitest/coverage-v8 4.1.10, eslint 10.8.0, typescript-eslint 8.65.0, eslint-plugin-react-hooks 7.1.1, eslint-plugin-react-refresh 0.5.3, globals 17.8.0, jsdom 30.0.0, @testing-library/react 16.3.2, @testing-library/jest-dom 7.0.0, @testing-library/user-event 14.6.1, tsx 4.23.1, supertest 7.2.2, @types/express 5.0.6, @types/supertest 7.2.1, husky 9.1.7, lint-staged 17.2.0, pnpm 11.17.0, Node 26.5.0.

---

### Task 1: Repo layout, package.json, and TypeScript baseline

**Files:**
- Create: `.gitignore`, `.npmrc`, `app/package.json`, `app/tsconfig.json`, `app/tsconfig.app.json`, `app/tsconfig.node.json`, `app/tsconfig.server.json`, `app/tsconfig.server.build.json`

**Interfaces:**
- Produces: the `app/` package every later task installs into; `pnpm typecheck` / `pnpm lint` / `pnpm test` script names all later tasks and CI rely on.

- [x] **Step 1: Re-verify current versions (standing rule)**

Run:
```bash
for p in typescript react vite express vitest eslint typescript-eslint husky lint-staged pnpm; do echo -n "$p: "; npm view "$p" version; done
curl -s https://endoflife.date/api/nodejs.json | head -c 300
node --version
```
Expected: values matching the table above (or newer patch/minor — use what the registry says today). Confirm local Node is 26.x; if not, install via your version manager before continuing. Confirm `npm view typescript-eslint peerDependencies` still excludes TS 7 — if it now allows it, note that in the commit message but still install `~6.0.3` (upgrading TS majors is its own task, not a drive-by).

- [x] **Step 2: Write root `.gitignore` and `.npmrc`**

`.gitignore`:
```
node_modules/
dist/
coverage/
*.tsbuildinfo
.env
.DS_Store
```

`.npmrc`:
```
shamefully-hoist=false
strict-peer-dependencies=false
auto-install-peers=true
```

- [x] **Step 3: Write `app/package.json`**

```json
{
  "name": "ergomatic",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "packageManager": "pnpm@11.17.0",
  "engines": { "node": ">=26" },
  "scripts": {
    "preinstall": "npx only-allow pnpm",
    "dev": "vite",
    "dev:server": "tsx watch server/index.ts",
    "build": "tsc -b && vite build && tsc -p tsconfig.server.build.json",
    "lint": "eslint .",
    "typecheck": "tsc -b && tsc -p tsconfig.server.json --noEmit",
    "test": "NODE_OPTIONS=--no-experimental-webstorage vitest run",
    "test:watch": "NODE_OPTIONS=--no-experimental-webstorage vitest",
    "test:coverage": "NODE_OPTIONS=--no-experimental-webstorage vitest run --coverage",
    "start": "node dist/server/index.js"
  }
}
```

- [x] **Step 4: Install all Phase 0 dependencies at verified-latest**

```bash
cd app
pnpm add express react react-dom
pnpm add -D typescript@~6.0.3 @types/node @types/express @types/react @types/react-dom \
  tsx vite @vitejs/plugin-react vitest @vitest/coverage-v8 jsdom \
  supertest @types/supertest @testing-library/react @testing-library/jest-dom @testing-library/user-event \
  eslint @eslint/js typescript-eslint globals eslint-plugin-react-hooks eslint-plugin-react-refresh
```
Expected: lockfile created; `pnpm exec tsc --version` prints `Version 6.0.3`.

- [x] **Step 5: Write the four-part tsconfig set**

`app/tsconfig.json`:
```json
{
  "files": [],
  "references": [
    { "path": "./tsconfig.app.json" },
    { "path": "./tsconfig.node.json" }
  ]
}
```

`app/tsconfig.app.json` (client + shared domain; `noEmit` typecheck):
```json
{
  "compilerOptions": {
    "tsBuildInfoFile": "./node_modules/.tmp/tsconfig.app.tsbuildinfo",
    "target": "ES2023",
    "useDefineForClassFields": true,
    "lib": ["ES2023", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "verbatimModuleSyntax": true,
    "jsx": "react-jsx",
    "noEmit": true,
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "noUncheckedSideEffectImports": true,
    "types": ["vitest/globals", "@testing-library/jest-dom"]
  },
  "include": ["src", "domain"]
}
```

`app/tsconfig.node.json` (vite/vitest config files):
```json
{
  "compilerOptions": {
    "tsBuildInfoFile": "./node_modules/.tmp/tsconfig.node.tsbuildinfo",
    "target": "ES2023",
    "lib": ["ES2023"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "verbatimModuleSyntax": true,
    "noEmit": true,
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "noUncheckedSideEffectImports": true,
    "types": ["node"]
  },
  "include": ["vite.config.ts", "vitest.config.ts"]
}
```

`app/tsconfig.server.json` (compiles `server/` + `domain/` to `dist/server`):
```json
{
  "compilerOptions": {
    "target": "ES2023",
    "lib": ["ES2023"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "skipLibCheck": true,
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "outDir": "dist/server",
    "rootDir": ".",
    "declaration": false,
    "sourceMap": false,
    "verbatimModuleSyntax": true,
    "types": ["node"]
  },
  "include": ["server", "domain"]
}
```
(`rootDir: "."` so `server/` and `domain/` land as `dist/server/server/` and `dist/server/domain/` — the `start` script becomes `node dist/server/server/index.js` once Task 3 exists. Keep the script in sync in Task 3.)

`app/tsconfig.server.build.json`:
```json
{
  "extends": "./tsconfig.server.json",
  "exclude": ["server/**/*.test.ts", "domain/**/*.test.ts"]
}
```

- [x] **Step 6: Verify typecheck runs clean on the empty tree**

```bash
mkdir -p src server domain
cd app && pnpm typecheck
```
Expected: exits 0 (no inputs is acceptable for `tsc -b`; if `tsc -p tsconfig.server.json` errors with "No inputs were found", add a placeholder `server/index.ts` containing `export {}` — Task 3 replaces it).

- [x] **Step 7: Commit**

```bash
git add -A
git commit -m "chore: scaffold app package, pnpm, and strict TS baseline"
```

---

### Task 2: ESLint flat config

**Files:**
- Create: `app/eslint.config.js`

**Interfaces:**
- Produces: `pnpm lint` passing/failing correctly — the command lint-staged (Task 7) and CI (Task 8) run.

- [x] **Step 1: Write `app/eslint.config.js`** (natalie's config verbatim, minus the drizzle ignore)

```js
import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  { ignores: ['dist', 'coverage'] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2023,
      globals: { ...globals.browser, ...globals.node },
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': [
        'warn',
        { allowConstantExport: true },
      ],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
    },
  },
)
```

- [x] **Step 2: Verify lint passes, then verify it actually catches errors**

```bash
cd app && pnpm lint
echo "const unused = 1" > src/bad.ts && pnpm lint; rm src/bad.ts
```
Expected: first run exits 0; second run FAILS with `@typescript-eslint/no-unused-vars` on `src/bad.ts`. (A linter that has never been seen failing is not verified.)

- [x] **Step 3: Commit**

```bash
git add app/eslint.config.js
git commit -m "chore: add ESLint 10 flat config"
```

---

### Task 3: Express server skeleton (TDD)

**Files:**
- Create: `app/server/app.ts`, `app/server/index.ts`, `app/server/app.test.ts`, `app/server/health.integration.test.ts`, `app/vitest.config.ts`
- Modify: `app/package.json` (start script path)

**Interfaces:**
- Produces: `createApp(): express.Express` from `server/app.ts` — every future route/middleware task builds on it. `GET /api/health` → `200 {"ok":true}` (Phase 1 extends with a DB check). Vitest projects named `unit` and `integration` (Task 4 adds `client`).

- [x] **Step 1: Write `app/vitest.config.ts` with unit + integration projects**

```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'unit',
          environment: 'node',
          include: ['server/**/*.test.ts', 'domain/**/*.test.ts'],
          exclude: ['server/**/*.integration.test.ts'],
        },
      },
      {
        test: {
          name: 'integration',
          environment: 'node',
          include: ['server/**/*.integration.test.ts'],
          testTimeout: 120_000,
          hookTimeout: 120_000,
        },
      },
    ],
  },
})
```
(Timeouts sized for the Testcontainers work arriving in Phase 3; harmless now.)

- [x] **Step 2: Write the failing unit test `app/server/app.test.ts`**

```ts
import { describe, it, expect } from 'vitest'
import request from 'supertest'
import { createApp } from './app.js'

describe('createApp', () => {
  it('responds to GET /api/health with ok', async () => {
    const res = await request(createApp()).get('/api/health')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ ok: true })
  })
})
```

- [x] **Step 3: Run it to verify it fails**

```bash
cd app && pnpm test --project unit
```
Expected: FAIL — cannot resolve `./app.js`.

- [x] **Step 4: Write `app/server/app.ts`**

```ts
import express from 'express'

export function createApp() {
  const app = express()
  app.use(express.json())

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true })
  })

  return app
}
```

- [x] **Step 5: Run the unit project to verify it passes**

```bash
cd app && pnpm test --project unit
```
Expected: PASS (1 test).

- [x] **Step 6: Write the failing integration test `app/server/health.integration.test.ts`** (real HTTP over a real socket — the slot Testcontainers plugs into in Phase 3)

```ts
import { describe, it, expect } from 'vitest'
import type { AddressInfo } from 'node:net'
import { createApp } from './app.js'

describe('health over real HTTP', () => {
  it('serves /api/health on a live socket', async () => {
    const server = createApp().listen(0)
    try {
      const { port } = server.address() as AddressInfo
      const res = await fetch(`http://127.0.0.1:${port}/api/health`)
      expect(res.status).toBe(200)
      expect(await res.json()).toEqual({ ok: true })
    } finally {
      server.close()
    }
  })
})
```

- [x] **Step 7: Run the integration project**

```bash
cd app && pnpm test --project integration
```
Expected: PASS (1 test). (It goes green immediately because `createApp` already exists — the test still earns its keep as the integration project's proof of life.)

- [x] **Step 8: Write the entrypoint `app/server/index.ts`** (replacing any Task 1 placeholder) **and fix the start script**

```ts
import { createApp } from './app.js'

const port = Number(process.env.PORT ?? 8080)
createApp().listen(port, () => {
  console.log(`ergomatic api listening on :${port}`)
})
```

In `app/package.json`, set `"start": "node dist/server/server/index.js"` (rootDir `.` nests output — see Task 1 Step 5).

- [x] **Step 9: Verify dev server, typecheck, and full test run**

```bash
cd app && pnpm typecheck && pnpm test
(pnpm dev:server &) && sleep 2 && curl -s localhost:8080/api/health && kill %1
```
Expected: typecheck 0; both projects pass; curl prints `{"ok":true}`.

- [x] **Step 10: Commit**

```bash
git add -A
git commit -m "feat: Express skeleton with /api/health, unit + integration test projects"
```

---

### Task 4: React client skeleton (TDD)

**Files:**
- Create: `app/index.html`, `app/src/main.tsx`, `app/src/App.tsx`, `app/src/App.test.tsx`, `app/src/test/setup.ts`, `app/src/vite-env.d.ts`, `app/vite.config.ts`
- Modify: `app/vitest.config.ts` (add `client` project)

**Interfaces:**
- Consumes: vitest project structure from Task 3.
- Produces: `<App />` root component; jsdom `client` Vitest project; `pnpm build` producing `dist/client`.

- [x] **Step 1: Add the `client` project to `app/vitest.config.ts`** (insert between `unit` and `integration`; also add the react import at top)

```ts
import react from '@vitejs/plugin-react'
```
```ts
      {
        plugins: [react()],
        test: {
          name: 'client',
          environment: 'jsdom',
          globals: true,
          setupFiles: './src/test/setup.ts',
          include: ['src/**/*.test.{ts,tsx}'],
        },
      },
```

- [x] **Step 2: Write `app/src/test/setup.ts`**

```ts
import '@testing-library/jest-dom'
```

- [x] **Step 3: Write the failing test `app/src/App.test.tsx`**

```tsx
import { render, screen } from '@testing-library/react'
import App from './App'

describe('App', () => {
  it('shows the Ergomatic heading', () => {
    render(<App />)
    expect(screen.getByRole('heading', { name: /ergomatic/i })).toBeInTheDocument()
  })
})
```

- [x] **Step 4: Run it to verify it fails**

```bash
cd app && pnpm test --project client
```
Expected: FAIL — cannot resolve `./App`.

- [x] **Step 5: Write `app/src/App.tsx`**

```tsx
export default function App() {
  return (
    <main>
      <h1>Ergomatic</h1>
      <p>Rowing workout tracker &amp; planner.</p>
    </main>
  )
}
```

- [x] **Step 6: Run it to verify it passes**

```bash
cd app && pnpm test --project client
```
Expected: PASS (1 test).

- [x] **Step 7: Write the Vite entry files**

`app/src/vite-env.d.ts`:
```ts
/// <reference types="vite/client" />
```

`app/src/main.tsx`:
```tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
```

`app/index.html`:
```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Ergomatic</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

`app/vite.config.ts`:
```ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': 'http://localhost:8080',
    },
  },
  build: {
    outDir: 'dist/client',
  },
})
```

- [x] **Step 8: Verify everything: lint, typecheck, all three test projects, build**

```bash
cd app && pnpm lint && pnpm typecheck && pnpm test && pnpm build
ls dist/client/index.html dist/server/server/index.js
```
Expected: all exit 0; both built files listed.

- [x] **Step 9: Commit**

```bash
git add -A
git commit -m "feat: React client skeleton with jsdom test project and Vite build"
```

---

### Task 5: Domain module seed — split formatting (TDD)

**Files:**
- Create: `app/domain/format.ts`, `app/domain/format.test.ts`

**Interfaces:**
- Produces: `fmtSplit(totalSeconds: number): string` — formats a per-500 m split as `m:ss.t` (e.g. `112` → `"1:52.0"`). Phase 3's pace engine and every screen showing a split will import this. Establishes `domain/` as pure, framework-free, unit-project-tested code.

- [x] **Step 1: Write the failing test `app/domain/format.test.ts`** (values from the design handoff: 2k baseline 112.0 s = "1:52.0", 6k 122.0 s = "2:02.0")

```ts
import { describe, it, expect } from 'vitest'
import { fmtSplit } from './format.js'

describe('fmtSplit', () => {
  it('formats the handoff baselines', () => {
    expect(fmtSplit(112)).toBe('1:52.0')
    expect(fmtSplit(122)).toBe('2:02.0')
  })
  it('keeps tenths', () => {
    expect(fmtSplit(113.5)).toBe('1:53.5')
  })
  it('rounds to the nearest tenth, carrying into seconds and minutes', () => {
    expect(fmtSplit(119.97)).toBe('2:00.0')
  })
  it('pads seconds under ten', () => {
    expect(fmtSplit(65.4)).toBe('1:05.4')
  })
})
```

- [x] **Step 2: Run it to verify it fails**

```bash
cd app && pnpm test --project unit
```
Expected: FAIL — cannot resolve `./format.js`.

- [x] **Step 3: Write `app/domain/format.ts`**

```ts
/** Format a per-500m split in seconds as m:ss.t (e.g. 112 -> "1:52.0"). */
export function fmtSplit(totalSeconds: number): string {
  const tenths = Math.round(totalSeconds * 10)
  const minutes = Math.floor(tenths / 600)
  const rem = tenths % 600
  const seconds = Math.floor(rem / 10)
  const tenth = rem % 10
  return `${minutes}:${String(seconds).padStart(2, '0')}.${tenth}`
}
```

- [x] **Step 4: Run it to verify it passes**

```bash
cd app && pnpm test --project unit
```
Expected: PASS (all unit tests, including Task 3's).

- [x] **Step 5: Commit**

```bash
git add app/domain
git commit -m "feat: domain module seed — fmtSplit per-500m formatting"
```

---

### Task 6: Coverage thresholds

**Files:**
- Modify: `app/vitest.config.ts` (add `coverage` block inside `test`)

**Interfaces:**
- Produces: `pnpm test:coverage` — the gate CI (Task 8) runs on every PR.

- [x] **Step 1: Add the coverage block to `app/vitest.config.ts`** (sibling of `projects`)

```ts
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/**/*.{ts,tsx}', 'server/**/*.ts', 'domain/**/*.ts'],
      exclude: [
        'src/main.tsx',
        'src/vite-env.d.ts',
        'src/test/**',
        'server/index.ts',
        '**/*.test.*',
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
```

- [x] **Step 2: Verify coverage passes and the gate works**

```bash
cd app && pnpm test:coverage
```
Expected: PASS with a coverage table ≥90 on every metric (`App.tsx`, `server/app.ts`, `domain/format.ts` are all fully exercised). If any metric is below 90, the tests are missing something — fix the tests, don't lower the floor.

- [x] **Step 3: Verify the gate fails when coverage drops**

```bash
cd app && cat >> domain/format.ts <<'EOF'

export function neverCalled(): string {
  return 'uncovered'
}
EOF
pnpm test:coverage; git checkout domain/format.ts
```
Expected: the run FAILS with a threshold error before the checkout restores the file.

- [x] **Step 4: Commit**

```bash
git add app/vitest.config.ts
git commit -m "chore: enforce 90% coverage thresholds"
```

---

### Task 7: Git hooks — husky + lint-staged

**Files:**
- Create: `package.json` (root), `.husky/pre-commit`, `.husky/pre-push`

**Interfaces:**
- Consumes: `pnpm lint` / `typecheck` / `test` scripts from Tasks 1–4.
- Produces: repo-level hooks; the root `pnpm install` step every contributor (and CLAUDE.md) must mention.

- [x] **Step 1: Write root `package.json`** (hooks host only — the app keeps its own package)

```json
{
  "name": "ergomatic-root",
  "private": true,
  "type": "module",
  "packageManager": "pnpm@11.17.0",
  "scripts": {
    "preinstall": "npx only-allow pnpm",
    "prepare": "husky"
  },
  "lint-staged": {
    "app/**/*.{ts,tsx}": "pnpm --dir app exec eslint --max-warnings 0 --no-warn-ignored"
  }
}
```

- [x] **Step 2: Install husky + lint-staged at root and initialize**

```bash
pnpm add -D husky lint-staged
```
Expected: `prepare` runs `husky`, creating `.husky/` and setting `core.hooksPath`. Verify: `git config core.hooksPath` prints `.husky/_`... (husky 9 layout) or `.husky`; either is fine as long as Step 5 blocks.

- [x] **Step 3: Write `.husky/pre-commit`**

```sh
npx lint-staged
pnpm --dir app typecheck
```

- [x] **Step 4: Write `.husky/pre-push`**

```sh
pnpm --dir app test
```

- [x] **Step 5: Verify the pre-commit hook blocks a lint failure**

```bash
echo "const unused = 1" > app/src/bad.ts
git add app/src/bad.ts
git commit -m "should be blocked"; echo "exit: $?"
git reset && rm app/src/bad.ts
```
Expected: commit FAILS (non-zero exit) with the no-unused-vars error from lint-staged.

- [x] **Step 6: Verify the pre-push hook blocks a test failure**

```bash
cat > app/domain/fail.test.ts <<'EOF'
import { it, expect } from 'vitest'
it('fails on purpose', () => { expect(1).toBe(2) })
EOF
sh .husky/pre-push; echo "exit: $?"
rm app/domain/fail.test.ts
```
Expected: non-zero exit with the failing test. (Direct hook invocation — no remote exists to push to yet.)

- [x] **Step 7: Commit** (this commit itself now runs the hooks — proof of life)

```bash
git add package.json pnpm-lock.yaml .husky
git commit -m "chore: husky hooks — pre-commit lint+typecheck, pre-push tests"
```

---

### Task 8: GitHub Actions CI + Dependabot

**Files:**
- Create: `.github/workflows/ci.yml`, `.github/dependabot.yml`

**Interfaces:**
- Consumes: `pnpm lint` / `typecheck` / `test:coverage` / `build` from earlier tasks.
- Produces: the CI gate Phase 1 extends with `docker` and `deploy` jobs.

- [x] **Step 1: Write `.github/workflows/ci.yml`**

```yaml
name: CI

on:
  pull_request:
  push:
    branches: [main]

jobs:
  app:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: app
    steps:
      - uses: actions/checkout@v7
      - uses: pnpm/action-setup@v6
        with:
          version: 11.17.0
      - uses: actions/setup-node@v6
        with:
          node-version: 26
          cache: pnpm
          cache-dependency-path: app/pnpm-lock.yaml
      - run: pnpm install --frozen-lockfile
      - run: pnpm lint
      - run: pnpm typecheck
      - run: pnpm test:coverage
      - run: pnpm build
```
(Action versions checkout@v7 / pnpm@v6 / setup-node@v6 verified current in natalie's passing CI as of 2026-07; Dependabot below keeps them fresh.)

- [x] **Step 2: Write `.github/dependabot.yml`**

```yaml
version: 2
updates:
  - package-ecosystem: npm
    directory: /app
    schedule:
      interval: weekly
    groups:
      npm-all:
        patterns: ['*']
  - package-ecosystem: npm
    directory: /
    schedule:
      interval: weekly
    groups:
      npm-root:
        patterns: ['*']
  - package-ecosystem: github-actions
    directory: /
    schedule:
      interval: weekly
```

- [x] **Step 3: Commit and push; verify CI goes green**

```bash
git add .github
git commit -m "ci: lint, typecheck, coverage-gated tests, build; weekly dependabot"
git push -u origin main
gh run watch --exit-status
```
Expected: push triggers the pre-push hook (full tests) locally, then the `app` job passes on GitHub. If `gh run watch` needs a run id, get it from `gh run list --limit 1`.

---

### Task 9: CLAUDE.md + README

**Files:**
- Create: `CLAUDE.md`
- Modify: `README.md`

**Interfaces:**
- Consumes: everything above — this documents it.

- [x] **Step 1: Write `CLAUDE.md`**

```markdown
# Ergomatic

Mobile-first rowing (erg) workout tracker/planner around The Erg Book model.
Roadmap: `ROADMAP.md` (phases + standing rules). Design reference: `docs/design/`
(high-fidelity; 44px hit targets and WCAG AA are hard requirements).

## Layout

- `app/` — the deployable: `src/` (React 19 + Vite client), `server/` (Express 5 API),
  `domain/` (pure Erg Book logic — no framework imports allowed)
- Root `package.json` exists only to host husky hooks. Run `pnpm install` at root
  AND in `app/`.

## Commands (run in `app/`)

- `pnpm dev` / `pnpm dev:server` — Vite client :5173 (proxies /api) / API :8080
- `pnpm lint` · `pnpm typecheck` · `pnpm test` · `pnpm test:coverage` (90% gate) · `pnpm build`
- Single Vitest project: `pnpm test --project unit|client|integration`

## Rules

- **Verify current versions before adding/pinning any dependency** (`npm view <pkg> version`).
  Never trust versions from memory or other repos. TypeScript stays `~6.0.x` until
  typescript-eslint's peer range admits 7 (check `npm view typescript-eslint peerDependencies`).
- TDD: failing test first. Domain code gets the heaviest coverage.
- Hooks: pre-commit = lint-staged + typecheck; pre-push = full tests. Don't bypass with
  `--no-verify`; fix the failure.
- pnpm only. ESM only. Server imports use `.js` extensions.
```

- [x] **Step 2: Update `README.md`** (replace the stub body)

```markdown
# Ergomatic

Mobile-first tracker and planner for indoor rowing workouts, built around
The Erg Book's baseline-offset pace model. See `ROADMAP.md` for the build plan
and `CLAUDE.md` for dev workflow.

## Quick start

    pnpm install          # root: installs git hooks
    cd app && pnpm install
    pnpm dev:server       # API on :8080
    pnpm dev              # client on :5173
```

- [x] **Step 3: Verify the documented workflow from scratch** (what a fresh clone experiences)

```bash
git status --porcelain   # expect: only CLAUDE.md / README.md changes from this task
cd app && pnpm install --frozen-lockfile && pnpm lint && pnpm typecheck && pnpm test
```
Expected: all green using only documented commands.

- [x] **Step 4: Commit and push**

```bash
git add CLAUDE.md README.md
git commit -m "docs: CLAUDE.md dev guide and README quick start"
git push
```

---

## Phase 0 exit criteria (from ROADMAP.md)

- [x] CI green on a trivial client/server "hello" with one passing test in each Vitest project (Tasks 3, 4, 8)
- [x] Hooks demonstrably block a lint failure and a test failure (Task 7, Steps 5–6)
- [x] Version-verification standing rule followed and recorded (Task 1, Step 1; header table)

When all boxes are checked: update `ROADMAP.md` Phase 0 status to **Done**, check its boxes, and commit.
