# Frontend/API Container Split + Native-First Policy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split the single `app` container into a static-serving `web` (nginx) container and a JSON-only `api` (Express) container, and structurally cap web/native divergence with an adapter layer plus a lint rule.

**Architecture:** One multi-stage `app/Dockerfile` gains two named targets sharing today's build stage: `api` (current runtime minus client assets) and `web` (`nginxinc/nginx-unprivileged` + Vite build + a conf that proxies `/api` to `api:8080` and serves the SPA fallback). Compose renames `app`→`api` (no host port), adds `web` (takes over `APP_PORT`), and the tunnel origin moves to `http://web:8080`. Client code gets `src/adapters/auth.tsx` so screens never call `isNative()`; an ESLint `no-restricted-imports` override makes that permanent.

**Tech Stack:** Express 5, nginx (unprivileged image), Docker Compose, Playwright, ESLint flat config, React 19.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-29-frontend-split-design.md` governs; ROADMAP standing rules apply.
- **Verify current versions before pinning** — the nginx image tag in Task 3 MUST be confirmed against the registry in that task (command provided); never trust a remembered version.
- **Shared-host port rule (binding):** every host-facing port is `${VAR:-default}` — no hardcoded host ports in any compose file. Full host surface after the split: `APP_PORT` (web, default 8081), `APP_BIND` (default 127.0.0.1), `POSTGRES_PORT` (default 5433). The `api` service maps NO host port.
- Express static serving is DELETED, not disabled (`clientDir` gone from `AppDeps`).
- Same-origin behavior must be byte-identical: nginx passes `Host` through on `/api` proxying.
- pnpm only, ESM only, server imports use `.js` extensions. TDD: failing test first.
- Testing policy: docs/TESTING.md governs naming/assertion quality. Coverage gate 90×4 stays green; domain pinned 100 (untouched here).
- Container-internal listen port stays 8080 for both services. `APP_VERSION` build arg: api target only.
- Hooks must pass without `--no-verify`; work happens in the `frontend-split` worktree; no merge without James's explicit approval.

## File Structure

- `app/server/app.ts`, `app/server/index.ts`, `app/server/app.test.ts` — static serving removed (Task 1)
- `app/src/adapters/auth.tsx` (+ `.test.tsx`), `app/src/You.tsx`, `app/src/SignIn.tsx`, their tests, `app/eslint.config.js` — adapter seam + lint rule (Task 2)
- `app/nginx.conf`, `app/Dockerfile`, `compose.yml`, `compose.e2e.yml`, `.env.example` — the split itself (Task 3)
- `app/e2e/serving.spec.ts`, `.github/workflows/ci.yml` — topology proof (Task 4)
- `CLAUDE.md`, `ROADMAP.md`, `docs/deploy.md` — policy + runbook text (Task 5)
- Task 6 is the orchestrator's deploy/cutover runbook (not a subagent task).

---

### Task 1: Delete Express static serving; pin api 404 behavior

**Files:**
- Modify: `app/server/app.ts` (delete lines 73–84 block, `clientDir` from `AppDeps` at line 21, and the now-unused `fs`/`path` imports at lines 2–3)
- Modify: `app/server/index.ts` (delete the `clientDir:` line ~115; delete the `path` import if now unused — check with typecheck)
- Test: `app/server/app.test.ts` (delete the `"static client serving"` describe at line 52; REWRITE the root-401 hotfix regression test at line ~99)

**Interfaces:**
- Produces: `AppDeps` WITHOUT `clientDir` — later tasks and all existing tests must construct deps without it. No other signature changes.

- [ ] **Step 1: Write the failing tests** — in `app/server/app.test.ts`, replace the entire `describe("static client serving", ...)` block AND the existing hotfix test (`"serves the SPA at / when stores are mounted (2026-07-28 root-401 hotfix)"`) with:

```ts
describe("non-API paths (api container serves no client)", () => {
  it("404s at / — static serving lives in the web container now", async () => {
    const res = await request(
      createApp(baseDeps({ checkDb: async () => true })),
    ).get("/");
    expect(res.status).toBe(404);
  });

  it("keeps non-API paths outside requireUser: / is 404, never 401, with stores mounted (2026-07-28 root-401 hotfix)", async () => {
    // Regression re-pinned post-split: an unscoped router.use(requireUser)
    // would turn this 404 into a 401. Keep the contrast pair below honest.
    const res = await request(
      createApp(baseDeps({ checkDb: async () => true, stores: makeFakeStores() })),
    ).get("/");
    expect(res.status).toBe(404);
  });

  it("still 401s unauthenticated /api requests (contrast pin)", async () => {
    const res = await request(
      createApp(baseDeps({ checkDb: async () => true, stores: makeFakeStores() })),
    ).get("/api/workouts");
    expect(res.status).toBe(401);
  });
});
```

Reuse the file's existing `baseDeps` helper and stores fixture — the old hotfix test at line ~99 shows the exact stores construction this file already uses (if it builds stores inline rather than via a `makeFakeStores` import, keep that inline construction). Remove the now-unused `mkdtempSync`/`tmpdir`/`writeFileSync` imports.

- [ ] **Step 2: Run to verify the new tests fail** — Run: `cd app && pnpm test --project unit server/app.test.ts`. Expected: the two 404 tests FAIL (currently `/` serves index.html or hits the old behavior); compile errors about `clientDir` are also acceptable failure signals at this step.

- [ ] **Step 3: Implement** — in `app/server/app.ts`: delete `import fs from "node:fs";`, `import path from "node:path";`, the `clientDir?: string;` AppDeps field (and its comment), and the whole `if (deps.clientDir) { ... }` block. In `app/server/index.ts`: delete the `clientDir: path.resolve(process.cwd(), "dist/client"),` line; if `path` is now unused there, delete its import.

- [ ] **Step 4: Run the full unit+client suites** — Run: `cd app && pnpm test --project unit --project client`. Expected: PASS (any other test constructing `clientDir` deps must be updated — the compiler will list them).

- [ ] **Step 5: Typecheck and commit**

```bash
cd app && pnpm typecheck
git add server/app.ts server/index.ts server/app.test.ts
git commit -m "feat: delete Express static serving — api container is JSON-only"
```

---

### Task 2: Platform adapter layer + no-restricted-imports rule

**Files:**
- Create: `app/src/adapters/auth.tsx`
- Create: `app/src/adapters/auth.test.tsx`
- Modify: `app/src/You.tsx`, `app/src/SignIn.tsx`, `app/src/You.test.tsx`, `app/src/SignIn.test.tsx`
- Modify: `app/eslint.config.js`

**Interfaces:**
- Consumes: `isNative()` from `app/src/platform.ts`; `nativeSignOut`, `initNativeAuth`, `nativeSignIn` from `app/src/native/signin.ts` (all exist today).
- Produces: `signOut(): Promise<void>` and `SignInButton({ onSignedIn?, onError }): JSX.Element` from `app/src/adapters/auth.tsx`. Allowlist for platform imports: `src/platform.ts`, `src/api.ts`, `src/native/**`, `src/adapters/**` (the spec's "initially exactly platform.ts and api.ts" predates noticing `src/native/` already imports Capacitor plugins — native/ and adapters/ ARE the adapter layer; screens still may not touch platform).

- [ ] **Step 1: Write failing adapter tests** — `app/src/adapters/auth.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

beforeEach(() => {
  vi.resetModules();
  vi.restoreAllMocks();
});

describe("adapters/auth signOut", () => {
  it("POSTs /api/auth/signout on web", async () => {
    vi.doMock("../platform", () => ({ isNative: () => false }));
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(null, { status: 200 }));
    const { signOut } = await import("./auth");
    await signOut();
    expect(fetchSpy).toHaveBeenCalledWith("/api/auth/signout", {
      method: "POST",
    });
  });

  it("signs out via the native Keychain path when isNative()", async () => {
    vi.doMock("../platform", () => ({ isNative: () => true }));
    const nativeSignOut = vi.fn(async () => {});
    vi.doMock("../native/signin", () => ({ nativeSignOut }));
    const { signOut } = await import("./auth");
    await signOut();
    expect(nativeSignOut).toHaveBeenCalledOnce();
  });
});

describe("adapters/auth SignInButton", () => {
  it("renders the web sign-in as a link to /api/auth/signin", async () => {
    vi.doMock("../platform", () => ({ isNative: () => false }));
    const { SignInButton } = await import("./auth");
    render(<SignInButton onError={() => {}} />);
    const link = screen.getByRole("link", { name: "Continue with Google" });
    expect(link).toHaveAttribute("href", "/api/auth/signin");
  });

  it("renders a native button and reports sign-in failures via onError", async () => {
    vi.doMock("../platform", () => ({ isNative: () => true }));
    vi.doMock("../native/signin", () => ({
      initNativeAuth: vi.fn(async () => {}),
      nativeSignIn: vi.fn(async () => {
        throw new Error("boom");
      }),
    }));
    const onError = vi.fn();
    const { SignInButton } = await import("./auth");
    render(<SignInButton onError={onError} />);
    await userEvent.click(
      screen.getByRole("button", { name: "Continue with Google" }),
    );
    expect(onError).toHaveBeenCalledWith("boom");
  });
});
```

(Match the mocking idiom already used in `You.test.tsx`/`SignIn.test.tsx` — `vi.doMock` + dynamic import; check those files if the module-reset pattern differs.)

- [ ] **Step 2: Run to verify failure** — Run: `cd app && pnpm test --project client src/adapters/auth.test.tsx`. Expected: FAIL — `./auth` module not found.

- [ ] **Step 3: Implement `app/src/adapters/auth.tsx`:**

```tsx
import { isNative } from "../platform";

/** The ONLY place screens may reach platform-specific auth behavior.
 *  Native modules stay behind dynamic imports so Capacitor plugins never
 *  land in the web bundle. */
export async function signOut(): Promise<void> {
  if (isNative()) {
    const { nativeSignOut } = await import("../native/signin");
    await nativeSignOut();
  } else {
    await fetch("/api/auth/signout", { method: "POST" });
  }
}

export function SignInButton({
  onSignedIn,
  onError,
}: {
  onSignedIn?: () => void;
  onError: (message: string) => void;
}) {
  if (!isNative()) {
    return (
      <a className="button-primary" href="/api/auth/signin">
        Continue with Google
      </a>
    );
  }
  async function signInNative() {
    try {
      const { initNativeAuth, nativeSignIn } = await import(
        "../native/signin"
      );
      await initNativeAuth();
      await nativeSignIn();
      onSignedIn?.();
    } catch (err) {
      onError(
        err instanceof Error
          ? err.message
          : "That sign-in didn't work. Give it another try.",
      );
    }
  }
  return (
    <button className="button-primary" onClick={signInNative}>
      Continue with Google
    </button>
  );
}
```

- [ ] **Step 4: Refactor the screens.** `app/src/You.tsx`: replace the `isNative` import with `import { signOut as authSignOut } from "./adapters/auth";`, delete the inline `signOut` body, and use `onClick={async () => { await authSignOut(); onSignedOut(); }}` (keep the button markup/classes identical). `app/src/SignIn.tsx`: delete the `isNative` import and `signInNative`; keep `nativeError` state and all three notice blocks; replace the ternary button block with `<SignInButton onSignedIn={onSignedIn} onError={setNativeError} />` imported from `./adapters/auth`.

- [ ] **Step 5: Update screen tests.** `You.test.tsx`: the `"signs out via the native Keychain path when isNative()"` test moves its platform mock to `./adapters/auth` — mock `signOut` and assert it was called and `onSignedOut` fired after it resolved. `SignIn.test.tsx`: the `"renders a native sign-in button (not a link) when isNative()"` test now mocks `./adapters/auth`'s dependencies the same way the adapter test does, or simplifies to assert `SignIn` renders the adapter's output and surfaces `onError` messages in the `role="alert"` notice. Preserve assertion strength — no test may become assertion-free (TESTING.md).

- [ ] **Step 6: Run client suite** — Run: `cd app && pnpm test --project client`. Expected: PASS.

- [ ] **Step 7: Add the lint rule** — in `app/eslint.config.js`, insert before the final `prettierConfig` entry:

```js
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
```

- [ ] **Step 8: Prove the rule fires (tests-with-teeth, recorded not committed)** — add `import { isNative } from "./platform";` to the top of `app/src/App.tsx`, run `pnpm lint`, confirm it ERRORS with the adapters message, then revert the line. Paste the error output into your task report.

- [ ] **Step 9: Full verification and commit**

```bash
cd app && pnpm lint && pnpm typecheck && pnpm test --project unit --project client
git add src/adapters/ src/You.tsx src/SignIn.tsx src/You.test.tsx src/SignIn.test.tsx eslint.config.js
git commit -m "feat: platform adapter layer + lint-enforced native-first seam"
```

---

### Task 3: nginx config, two-target Dockerfile, compose split

**Files:**
- Create: `app/nginx.conf`
- Modify: `app/Dockerfile`
- Modify: `compose.yml`, `compose.e2e.yml`, `.env.example`

**Interfaces:**
- Consumes: nothing from Tasks 1–2 beyond the repo state (client build output `dist/client`, server entry `dist/server/server/index.js`).
- Produces: compose services named `api` and `web`; Dockerfile targets named `api` and `web`; `web` listens on container port 8080 and owns `${APP_PORT}`. Task 4's CI edits and e2e spec depend on these exact names.

- [ ] **Step 1: Verify the nginx image tag against the registry (STANDING RULE — do not skip):**

```bash
curl -s "https://hub.docker.com/v2/repositories/nginxinc/nginx-unprivileged/tags?page_size=100&name=alpine" \
  | python3 -c "import json,sys; [print(t['name']) for t in json.load(sys.stdin)['results'] if t['name'].endswith('-alpine')]" | head
```

Registry state on 2026-07-29: stock nginx stable is `1.30.4-alpine`, mainline `1.31.3-alpine`. Pin the CURRENT STABLE `-alpine` tag of `nginxinc/nginx-unprivileged` that this command shows (expected `1.30.4-alpine`; if only mainline exists for unprivileged, pin that and say so in the task report). Use the exact tag you verified in the Dockerfile below.

- [ ] **Step 2: Create `app/nginx.conf`** (mounted as `/etc/nginx/conf.d/default.conf` — the unprivileged base image's main config already handles pid/cache paths under /tmp):

```nginx
server {
    listen 8080;
    root /usr/share/nginx/html;

    gzip on;
    gzip_types text/css application/javascript application/json image/svg+xml;

    # Prefix location without a URI on proxy_pass: the original URI is
    # passed through untouched (no trailing-slash rewrite surprises).
    # Host passthrough keeps originCheck + cookie behavior byte-identical.
    location /api {
        proxy_pass http://api:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /assets/ {
        add_header Cache-Control "public, max-age=31536000, immutable";
        try_files $uri =404;
    }

    location = /index.html {
        add_header Cache-Control "no-cache";
    }

    location / {
        try_files $uri /index.html;
    }
}
```

- [ ] **Step 3: Rework `app/Dockerfile`** — keep the `build` stage exactly as-is, split the runtime:

```dockerfile
FROM node:26.5.0-slim AS build

# Node 25+ images no longer bundle corepack; install pnpm directly.
RUN npm install -g pnpm@11.17.0

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm build

# ---- api: Express, JSON-only, ships zero client assets ----
FROM node:26.5.0-slim AS api

RUN npm install -g pnpm@11.17.0

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile --prod

COPY --from=build /app/dist/server ./dist/server
COPY --from=build /app/drizzle ./drizzle

ENV NODE_ENV=production
ENV PORT=8080
ARG APP_VERSION=dev
ENV APP_VERSION=$APP_VERSION
EXPOSE 8080

USER node

CMD ["node", "dist/server/server/index.js"]

# ---- web: nginx serving the Vite build, proxying /api ----
FROM nginxinc/nginx-unprivileged:<TAG-VERIFIED-IN-STEP-1> AS web

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist/client /usr/share/nginx/html

EXPOSE 8080
```

(`<TAG-VERIFIED-IN-STEP-1>` is the one placeholder you fill from Step 1's output before committing — it must be a concrete tag like `1.30.4-alpine` in the committed file.)

- [ ] **Step 4: compose.yml** — rename the `app` service to `api`: `container_name: ergomatic-api`, add `target: api` under `build`, DELETE the entire `ports:` block and its comment (api gets no host mapping), keep env/hardening/healthcheck/depends_on unchanged. Add the `web` service:

```yaml
  web:
    build:
      context: ./app
      target: web
    container_name: ergomatic-web
    restart: unless-stopped
    security_opt:
      - no-new-privileges:true
    cap_drop:
      - ALL
    read_only: true
    tmpfs:
      # unprivileged nginx keeps pid + cache under /tmp
      - /tmp
    ports:
      # The ONLY host-facing app port (shared host: natalie owns 8080/8081,
      # prod .env sets APP_PORT=8082). api has no host mapping at all.
      - "${APP_BIND:-127.0.0.1}:${APP_PORT:-8081}:8080"
    depends_on:
      api:
        condition: service_healthy
    # Fetches through nginx's own /api proxy: `compose up --wait` (the
    # deploy.sh health gate) now proves web -> api -> postgres end-to-end.
    healthcheck:
      test: ["CMD", "wget", "-qO-", "http://127.0.0.1:8080/api/health"]
      interval: 10s
      timeout: 3s
      retries: 5
      start_period: 10s
```

Point `cloudflared`'s `depends_on` at `web` instead of `app`. In `compose.e2e.yml`, rename `services.app` → `services.api` (comment included if it names the service).

- [ ] **Step 5: `.env.example`** — update the `APP_PORT` comment to say it now binds the `web` (nginx) container, api is not host-reachable. No new variables.

- [ ] **Step 6: Boot the split stack locally and verify:**

```bash
docker compose -f compose.yml -f compose.e2e.yml up -d --build --wait --wait-timeout 120
curl -s http://127.0.0.1:8081/api/health          # {"ok":true,...} through nginx
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:8081/            # 200
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:8081/deep/link   # 200 (SPA fallback)
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:8081/api/nope    # 401 (proxied to api)
docker compose -f compose.yml -f compose.e2e.yml down
```

(Needs `TEST_AUTH_SECRET=anything POSTGRES_PASSWORD=dev` etc. in the environment — copy how `app/scripts/e2e.sh` boots the stack.) All four expectations must hold.

- [ ] **Step 7: Shared-host port audit (spec exit criterion):**

```bash
grep -n '"[0-9]' compose.yml compose.e2e.yml
```

Expected: every match is inside a `${VAR:-default}` expansion on the host side (container-side `:8080`/`:5432` literals after the colon are fine); NO bare host-side port literal.

- [ ] **Step 8: Commit**

```bash
git add app/nginx.conf app/Dockerfile compose.yml compose.e2e.yml .env.example
git commit -m "feat: split app container into web (nginx) + api (Express)"
```

---

### Task 4: e2e serving assertions + CI builds both targets

**Files:**
- Create: `app/e2e/serving.spec.ts`
- Modify: `.github/workflows/ci.yml` (docker job)

**Interfaces:**
- Consumes: compose services/targets from Task 3; Playwright config (chromium project, baseURL `http://127.0.0.1:8081`) unchanged.
- Produces: nothing downstream; this is the topology's regression net.

- [ ] **Step 1: Write the spec (failing is only provable against the old stack, so write + run against the new one):** `app/e2e/serving.spec.ts`:

```ts
import { test, expect } from "@playwright/test";

// Structural assertions on the nginx serving topology (spec 2026-07-29).
// Complements flows.spec.ts (which already exercises /api through the
// proxy via the sign-in backdoor) with what only headers can prove.
test.describe("serving topology", () => {
  test("deep links fall back to the SPA shell", async ({ page }) => {
    await page.goto("/workouts/some-future-route");
    await expect(
      page.getByRole("heading", { name: "Ergomatic" }),
    ).toBeVisible();
  });

  test("index.html is no-cache; hashed assets are immutable", async ({
    request,
  }) => {
    const index = await request.get("/");
    expect(index.headers()["cache-control"]).toContain("no-cache");
    const asset = (await index.text()).match(/\/assets\/[^"]+\.js/)?.[0];
    expect(asset, "index.html should reference a hashed JS asset").toBeTruthy();
    const res = await request.get(asset!);
    expect(res.status()).toBe(200);
    expect(res.headers()["cache-control"]).toContain("immutable");
  });
});
```

- [ ] **Step 2: Register the file if needed** — check `app/playwright.config.ts`: if the `chromium` project uses `testMatch`/`testIgnore` patterns that would exclude `serving.spec.ts`, widen them; if it picks up all `e2e/*.spec.ts` except screenshots, nothing to do.

- [ ] **Step 3: Run the full e2e suite** — Run: `cd app && pnpm e2e`. Expected: all existing 11 tests plus the 2 new ones PASS against the nginx-fronted stack.

- [ ] **Step 4: CI docker job builds BOTH targets** — in `.github/workflows/ci.yml`, replace the single `Build app image` step with:

```yaml
      - name: Build api image
        uses: docker/build-push-action@v7
        with:
          context: ./app
          target: api
          push: false
          build-args: |
            APP_VERSION=ci
      - name: Build web image
        uses: docker/build-push-action@v7
        with:
          context: ./app
          target: web
          push: false
```

- [ ] **Step 5: Commit**

```bash
git add app/e2e/serving.spec.ts .github/workflows/ci.yml
git commit -m "test: e2e serving-topology assertions; CI builds api+web targets"
```

---

### Task 5: Policy + runbook docs

**Files:**
- Modify: `CLAUDE.md` (Rules section), `ROADMAP.md` (standing rules area), `docs/deploy.md` (tunnel origin, lines ~40–44)

**Interfaces:** none — text only, but exact wording below is the deliverable.

- [ ] **Step 1: CLAUDE.md** — add one bullet to `## Rules` (after the SDLC bullet):

```markdown
- **Native-first:** the iOS app is the primary surface; design decisions
  favor it. The web build is the same code serving as test harness
  (Playwright/design/screenshots), dev loop, and fallback — never dropped,
  never polished at the app's expense. Platform conditionals live ONLY in
  the adapter layer (`src/platform.ts`, `src/api.ts`, `src/native/`,
  `src/adapters/` — lint-enforced via no-restricted-imports).
```

- [ ] **Step 2: ROADMAP.md** — under the standing rules section, add:

```markdown
- Serving topology (2026-07-29 investigation): web and API are split into
  nginx + Express containers; the API has no host port and is reachable
  only through nginx. Keeping the single React codebase was deliberate —
  dropping web or rewriting in Swift was evaluated and rejected (harness
  loss / domain-layer duplication). Revisit the topology only if web and
  API release cadences diverge. iOS resolves Capacitor via SPM (verified
  2026-07-29; Cocoapods sunset 2026-12-02 does not affect us).
```

- [ ] **Step 3: docs/deploy.md** — update the tunnel section: origin becomes `http://web:8080`; keep (and update) the existing warning that `APP_PORT`/8082 is host-side only and `http://web:8082` would 502; add one line: "after changing compose topology, the tunnel origin must be edited in the Cloudflare Zero Trust dashboard — expect 502s from the edge until it is."

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md ROADMAP.md docs/deploy.md
git commit -m "docs: native-first policy, topology decision record, tunnel runbook"
```

---

### Task 6: Deploy & cutover (ORCHESTRATOR ONLY — not a subagent task)

- [ ] Final whole-branch review (most capable model, review package via `scripts/review-package`), adjudicate, fix waves as needed.
- [ ] Open PR (body: topology diagram from the spec, before/after table, the port surface, cutover note). CI green including e2e.
- [ ] **STOP — James's explicit merge approval (SDLC rule). Present the review verdict and wait.**
- [ ] On approval: rebase-merge, watch deploy. `--remove-orphans` retires the old `ergomatic-app` container.
- [ ] Walk James through the tunnel origin edit (`http://app:8080` → `http://web:8080`). Expect 502s in the gap — this was accepted in the spec.
- [ ] Verify prod through the tunnel: `/` 200 (nginx), `/deep/link` 200 (SPA fallback), `/api/health` ok:true (proxied), `POST /api/auth/test-signin` → 401 `{"error":"unauthenticated"}` (absent-route fall-through signature).
- [ ] Post release recommendation on the PR (expected: not needed — serving topology only).
- [ ] Ledger close-out; tear down the worktree immediately after merge; update `deploy-host-facts` + `platform-direction` memories (tunnel origin now web:8080; native-first policy recorded).
```
