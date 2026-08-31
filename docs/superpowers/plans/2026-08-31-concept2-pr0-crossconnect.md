# Wave E PR0 — Concept2 desk cross-connect Implementation Plan

> **EXECUTION STATUS (2026-08-31, reconciled at James's #244 review,
> finding 6):** Tasks 1-5 executed and reviewed (SDD ledger; commits
> c099c5e6..cbf03182 + fix wave e379c33d). Task 6's live run happened
> 2026-08-31 (report: `docs/monitor/c2-crossconnect-2026-09/`) with two
> operator items still open: the single-process state receipt and the
> provenance-correct eligibility census. Checkboxes below were tracked
> in the SDD ledger rather than ticked in this file.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Post one reconciled stored row to `log-dev.concept2.com`, pull the
result and its exports back, diff field-by-field, and answer the wave's six
pre-committed probes — discharging RC exit criterion (d).

**Architecture:** A single dev-only CLI script (`app/scripts/c2-crossconnect.ts`,
run via `pnpm exec tsx`) with its pure helpers exported and unit-tested
(`scripts/**/*.test.ts` runs in the vitest `unit` project; coverage's include
never reaches `scripts/**`). OAuth is a manual paste flow; tokens persist in
`~/.ergomatic-c2-dev.json`, OUTSIDE the repo. The deliverable is the probe
REPORT under `docs/monitor/`; the script is instrumentation.

**Tech Stack:** tsx (already a devDependency), Node's global `fetch`,
`node:readline/promises`, `node:fs/promises`. NO new dependencies.

**Spec:** `docs/superpowers/specs/2026-08-31-concept2-logbook-design.md`
(§PR0, §Research record, §The mapping). The plan argues from the spec.

## Global Constraints

- Branch: `wave-e-logbook` (worktree
  `/Users/james/projects/github/jamesawesome/Ergomatic/.claude/worktrees/wave-e-logbook`).
  Run `git rev-parse --show-toplevel` before EVERY commit and confirm it
  prints the worktree path. Shell writes use absolute worktree paths (RF20).
- pnpm only, ESM only. The script imports nothing from `server/` or `src/`.
- **Secrets:** `C2_CLIENT_ID`/`C2_CLIENT_SECRET` come from real env at
  invocation (James provides; the repo-root `.env`'s `LOGBOOK_DEV_KEY` is one
  40-char value of unknown half — do not read its VALUE into any transcript
  or file, ever). The token file lives at `~/.ergomatic-c2-dev.json`, never
  under the repo. No secret value appears in code, tests, commits, or the
  report.
- **Blocked-on-operator (James, before Tasks 3-6 can run live):** the dev
  `client_id` + `client_secret` pair; the redirect URI registered in C2's
  API-key portal (`http://localhost:8199/c2-callback` is what the script
  expects — tell James this exact string); a `log-dev.concept2.com` account.
  Tasks 1-2 build and test WITHOUT credentials.
- Time in TENTHS everywhere on the wire; `date` is LOCAL wall-clock with a
  separate `timezone` parameter (spec §Research record).
- House copy rules do not bite (no user-facing strings); report prose follows
  "write for James first".

## File Structure

- `app/scripts/c2-crossconnect.ts` — config, OAuth helpers, payload builder,
  diff engine (all exported, pure where possible), and a small command
  dispatcher (`auth`, `post`, `diff`, `probe-red`, `probe-dedup`,
  `probe-zerorest`, `probe-verification`).
- `app/scripts/c2-crossconnect.test.ts` — unit tests for every pure helper.
- `docs/monitor/c2-crossconnect-2026-09/README.md` — the probe report
  (Task 6; the wave's exit evidence).

---

### Task 1: Config + OAuth helpers + `auth` command

**Files:**
- Create: `app/scripts/c2-crossconnect.ts`
- Test: `app/scripts/c2-crossconnect.test.ts`

**Interfaces:**
- Produces: `readConfig(env): C2Config`, `buildAuthorizeUrl(cfg, state): string`,
  `parseCallbackUrl(raw): { code: string; state: string | null }`,
  `exchangeCode(cfg, code): Promise<TokenSet>` — Task 3 consumes all four.
- `TokenSet = { access_token: string; refresh_token: string; expires_in: number }`.

- [ ] **Step 1: Write the failing tests**

```ts
// app/scripts/c2-crossconnect.test.ts
import { describe, expect, it } from "vitest";
import {
  buildAuthorizeUrl,
  parseCallbackUrl,
  readConfig,
} from "./c2-crossconnect.js";

const cfg = {
  baseUrl: "https://log-dev.concept2.com",
  clientId: "cid",
  clientSecret: "sec",
  redirectUri: "http://localhost:8199/c2-callback",
};

describe("readConfig", () => {
  it("builds config from env and defaults baseUrl to log-dev", () => {
    const c = readConfig({
      C2_CLIENT_ID: "cid",
      C2_CLIENT_SECRET: "sec",
      C2_REDIRECT_URI: "http://localhost:8199/c2-callback",
    });
    expect(c.baseUrl).toBe("https://log-dev.concept2.com");
    expect(c.clientId).toBe("cid");
  });
  it("refuses to run with a missing credential, naming it", () => {
    expect(() => readConfig({ C2_CLIENT_ID: "cid" })).toThrow(
      /C2_CLIENT_SECRET/,
    );
  });
});

describe("buildAuthorizeUrl", () => {
  it("carries the four documented params plus the state probe, scope explicit", () => {
    const u = new URL(buildAuthorizeUrl(cfg, "nonce123"));
    expect(u.origin).toBe("https://log-dev.concept2.com");
    expect(u.pathname).toBe("/oauth/authorize");
    expect(u.searchParams.get("client_id")).toBe("cid");
    expect(u.searchParams.get("scope")).toBe("user:read,results:write");
    expect(u.searchParams.get("response_type")).toBe("code");
    expect(u.searchParams.get("redirect_uri")).toBe(cfg.redirectUri);
    expect(u.searchParams.get("state")).toBe("nonce123");
  });
});

describe("parseCallbackUrl", () => {
  it("extracts code and echoed state", () => {
    expect(
      parseCallbackUrl(
        "http://localhost:8199/c2-callback?code=abc&state=nonce123",
      ),
    ).toEqual({ code: "abc", state: "nonce123" });
  });
  it("reports state null when C2 did not echo it — the probe's negative arm", () => {
    expect(
      parseCallbackUrl("http://localhost:8199/c2-callback?code=abc"),
    ).toEqual({ code: "abc", state: null });
  });
  it("throws on a pasted URL with no code", () => {
    expect(() => parseCallbackUrl("http://localhost:8199/c2-callback")).toThrow(
      /code/,
    );
  });
});
```

- [ ] **Step 2: Run tests, verify they fail**

Run (from `app/`): `pnpm test --project unit -- c2-crossconnect`
Expected: FAIL — module not found. (Reminder: the `--project X -- pattern`
footgun applies to `client` scoping; unit-project single-file scoping this way
has worked — if the run count looks like the whole suite, fall back to
`pnpm exec vitest run --project unit scripts/c2-crossconnect.test.ts`, which
is safe for node-environment files.)

- [ ] **Step 3: Implement**

```ts
// app/scripts/c2-crossconnect.ts
// Wave E PR0 desk harness (spec 2026-08-31-concept2-logbook-design.md §PR0).
// Dev-only instrumentation: never imported by server/ or src/, never bundled.
// Tokens persist in ~/.ergomatic-c2-dev.json — OUTSIDE the repo on purpose.

export interface C2Config {
  baseUrl: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

export interface TokenSet {
  access_token: string;
  refresh_token: string;
  expires_in: number;
}

export function readConfig(
  env: Record<string, string | undefined> = process.env,
): C2Config {
  const need = (k: string): string => {
    const v = env[k];
    if (!v) throw new Error(`${k} is required (real env only; see spec §PR0 operator steps)`);
    return v;
  };
  return {
    baseUrl: env.C2_BASE_URL ?? "https://log-dev.concept2.com",
    clientId: need("C2_CLIENT_ID"),
    clientSecret: need("C2_CLIENT_SECRET"),
    redirectUri: need("C2_REDIRECT_URI"),
  };
}

export function buildAuthorizeUrl(cfg: C2Config, state: string): string {
  const u = new URL("/oauth/authorize", cfg.baseUrl);
  u.searchParams.set("client_id", cfg.clientId);
  u.searchParams.set("scope", "user:read,results:write");
  u.searchParams.set("response_type", "code");
  u.searchParams.set("redirect_uri", cfg.redirectUri);
  // `state` is NOT documented on C2's authorize endpoint — whether it echoes
  // is probe #1 (spec §PR0), and parseCallbackUrl reports null when it does not.
  u.searchParams.set("state", state);
  return u.toString();
}

export function parseCallbackUrl(raw: string): {
  code: string;
  state: string | null;
} {
  const u = new URL(raw);
  const code = u.searchParams.get("code");
  if (!code) throw new Error("pasted URL carries no code param");
  return { code, state: u.searchParams.get("state") };
}

export async function exchangeCode(
  cfg: C2Config,
  code: string,
): Promise<TokenSet> {
  const res = await fetch(new URL("/oauth/access_token", cfg.baseUrl), {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      grant_type: "authorization_code",
      code,
      redirect_uri: cfg.redirectUri,
    }),
  });
  if (!res.ok) throw new Error(`token exchange failed: ${res.status} ${await res.text()}`);
  return (await res.json()) as TokenSet;
}
```

- [ ] **Step 4: Run tests, verify they pass**

Run (from `app/`): `pnpm test --project unit -- c2-crossconnect`
Expected: PASS (6 tests).

- [ ] **Step 5: Add the `auth` command + session file (no test — I/O shell)**

Append to `c2-crossconnect.ts`:

```ts
import { readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline/promises";
import { randomBytes } from "node:crypto";

const SESSION_PATH = join(homedir(), ".ergomatic-c2-dev.json");

interface Session {
  tokens: TokenSet;
  obtainedAt: string;
  c2UserId?: number;
  stateEchoed: boolean;
}

async function loadSession(): Promise<Session> {
  return JSON.parse(await readFile(SESSION_PATH, "utf8")) as Session;
}

async function cmdAuth(cfg: C2Config): Promise<void> {
  const state = randomBytes(16).toString("hex");
  console.log("\nOpen this in a browser, log in to log-dev, approve:\n");
  console.log(buildAuthorizeUrl(cfg, state));
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const pasted = await rl.question("\nPaste the FULL redirected URL: ");
  rl.close();
  const { code, state: echoed } = parseCallbackUrl(pasted.trim());
  const stateEchoed = echoed === state;
  console.log(`PROBE state-echo: ${stateEchoed ? "ECHOED" : `NOT ECHOED (got ${echoed})`}`);
  const tokens = await exchangeCode(cfg, code);
  const meRes = await fetch(new URL("/api/users/me", cfg.baseUrl), {
    headers: { authorization: `Bearer ${tokens.access_token}` },
  });
  const me = (await meRes.json()) as { data?: { id?: number } };
  const session: Session = {
    tokens,
    obtainedAt: new Date().toISOString(),
    c2UserId: me.data?.id,
    stateEchoed,
  };
  await writeFile(SESSION_PATH, JSON.stringify(session, null, 2));
  console.log(`Session saved to ${SESSION_PATH} (user ${me.data?.id}).`);
}
```

And the dispatcher at the bottom of the file:

```ts
const [, , command] = process.argv;
const commands: Record<string, () => Promise<void>> = {
  auth: () => cmdAuth(readConfig()),
};
if (command && commands[command]) {
  commands[command]().catch((e: unknown) => {
    console.error(e);
    process.exit(1);
  });
} else if (command !== undefined || process.argv[1]?.endsWith("c2-crossconnect.ts")) {
  // Imported by the test file: no command, no dispatch, no output.
  if (command !== undefined) {
    console.error(`unknown command: ${command}`);
    process.exit(1);
  }
}
```

- [ ] **Step 6: Typecheck and lint**

Run (from `app/`): `pnpm typecheck && pnpm lint`
Expected: clean. (`scripts/node-shims.d.ts` already exists for node types.)

- [ ] **Step 7: Commit**

```bash
git rev-parse --show-toplevel  # MUST print .../worktrees/wave-e-logbook
git add app/scripts/c2-crossconnect.ts app/scripts/c2-crossconnect.test.ts
git commit -m "PR0: C2 desk harness — config, OAuth helpers, auth command"
```

---

### Task 2: Payload builder + diff engine (pure, the encoding under probe)

**Files:**
- Modify: `app/scripts/c2-crossconnect.ts`
- Test: `app/scripts/c2-crossconnect.test.ts`

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces: `c2Tenths(seconds): number`, `formatC2Date(instant, tz): string`,
  `buildResultPost(row, opts): Record<string, unknown>`,
  `diffRowVsResult(row, opts, result): FieldDiff[]` — Tasks 3-5 consume all.
- `StoredRowFixture = { workSeconds: number; workMeters: number; restSeconds: number; restMeters: number; avgStrokeRate?: number }`
- `PostOpts = { weightClass: "H" | "L"; date: Date; tz: string; workoutType?: string; timeOverrideTenths?: number }`
- `FieldDiff = { field: string; expected: unknown; cameBack: unknown; verdict: "match" | "MISMATCH" | "invisible-to-result-object" }`

- [ ] **Step 1: Write the failing tests**

Append to `c2-crossconnect.test.ts`:

```ts
import {
  buildResultPost,
  c2Tenths,
  diffRowVsResult,
  formatC2Date,
} from "./c2-crossconnect.js";

// The fixture mirrors a real stored row's shape (spec §Mapping): work/rest
// split per RC-1, machine avgStrokeRate flat on the summary blob. Values are
// realistic wire-shaped numbers (tenths-precision seconds, whole meters).
const row = {
  workSeconds: 254.8,
  workMeters: 935,
  restSeconds: 180,
  restMeters: 64,
  avgStrokeRate: 24,
};
const opts = {
  weightClass: "H" as const,
  date: new Date("2026-08-26T13:40:00Z"),
  tz: "America/Los_Angeles",
};

describe("c2Tenths", () => {
  it("matches C2's own documented example: one minute is 600", () => {
    expect(c2Tenths(60)).toBe(600); // independent literal, not derived (RF21)
  });
  it("rounds tenths-precision sums exactly", () => {
    expect(c2Tenths(254.8)).toBe(2548);
    expect(c2Tenths(12 * 32.7)).toBe(3924); // anchor V8's probe value
  });
});

describe("formatC2Date", () => {
  it("renders LOCAL wall clock in the given zone, yyyy-mm-dd hh:mm:ss", () => {
    // 13:40Z on 2026-08-26 is 06:40 in Los Angeles (PDT, UTC-7).
    expect(formatC2Date(new Date("2026-08-26T13:40:00Z"), "America/Los_Angeles"))
      .toBe("2026-08-26 06:40:00");
  });
  it("crosses the calendar-day boundary the spec warns about (anchor K3)", () => {
    // 02:30Z on 2026-08-27 is 19:30 the PREVIOUS day in Los Angeles.
    expect(formatC2Date(new Date("2026-08-27T02:30:00Z"), "America/Los_Angeles"))
      .toBe("2026-08-26 19:30:00");
  });
});

describe("buildResultPost", () => {
  it("builds the spec's summary-level post: work-only distance/time, rest split out, tz first-class", () => {
    const p = buildResultPost(row, opts);
    expect(p).toEqual({
      type: "rower",
      date: "2026-08-26 06:40:00",
      timezone: "America/Los_Angeles",
      distance: 935,
      time: 2548,
      weight_class: "H",
      rest_time: 1800,
      rest_distance: 64,
      stroke_rate: 24,
    });
  });
  it("omits rest fields on a zero-rest row and workout_type when absent", () => {
    const p = buildResultPost({ ...row, restSeconds: 0, restMeters: 0 }, opts);
    expect(p).not.toHaveProperty("rest_time");
    expect(p).not.toHaveProperty("rest_distance");
    expect(p).not.toHaveProperty("workout_type");
  });
  it("carries workout_type when supplied (the zero-rest probe needs it)", () => {
    const p = buildResultPost(row, { ...opts, workoutType: "VariableInterval" });
    expect(p.workout_type).toBe("VariableInterval");
  });
  it("honours timeOverrideTenths — the red-proof's deliberate wrong encoding", () => {
    const p = buildResultPost(row, { ...opts, timeOverrideTenths: 255 });
    expect(p.time).toBe(255);
  });
});

describe("diffRowVsResult", () => {
  const result = {
    id: 339,
    date: "2026-08-26 06:40:00",
    timezone: "America/Los_Angeles",
    distance: 935,
    time: 2548,
    weight_class: "H",
  };
  it("matches a faithful round-trip and marks the result-object-blind fields", () => {
    const diffs = diffRowVsResult(row, opts, result);
    expect(diffs.find((d) => d.field === "distance")?.verdict).toBe("match");
    expect(diffs.find((d) => d.field === "time")?.verdict).toBe("match");
    expect(diffs.find((d) => d.field === "rest_time")?.verdict).toBe(
      "invisible-to-result-object",
    );
    expect(diffs.find((d) => d.field === "stroke_rate")?.verdict).toBe(
      "invisible-to-result-object",
    );
  });
  it("goes RED when C2's copy disagrees with the stored row (the gate can fail)", () => {
    const diffs = diffRowVsResult(row, opts, { ...result, time: 255 });
    expect(diffs.find((d) => d.field === "time")?.verdict).toBe("MISMATCH");
  });
});
```

- [ ] **Step 2: Run tests, verify the new ones fail**

Run (from `app/`): `pnpm test --project unit -- c2-crossconnect`
Expected: Task 1 tests PASS, new tests FAIL (helpers not exported).

- [ ] **Step 3: Implement**

Append to `c2-crossconnect.ts`:

```ts
export interface StoredRowFixture {
  workSeconds: number;
  workMeters: number;
  restSeconds: number;
  restMeters: number;
  avgStrokeRate?: number;
}

export interface PostOpts {
  weightClass: "H" | "L";
  date: Date;
  tz: string;
  workoutType?: string;
  timeOverrideTenths?: number;
}

export function c2Tenths(seconds: number): number {
  return Math.round(seconds * 10);
}

export function formatC2Date(instant: Date, tz: string): string {
  // en-CA gives yyyy-mm-dd; hourCycle h23 avoids "24:00".
  const date = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(instant);
  const time = new Intl.DateTimeFormat("en-GB", {
    timeZone: tz,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).format(instant);
  return `${date} ${time}`;
}

export function buildResultPost(
  row: StoredRowFixture,
  opts: PostOpts,
): Record<string, unknown> {
  const post: Record<string, unknown> = {
    type: "rower",
    date: formatC2Date(opts.date, opts.tz),
    timezone: opts.tz,
    distance: row.workMeters,
    time: opts.timeOverrideTenths ?? c2Tenths(row.workSeconds),
    weight_class: opts.weightClass,
  };
  if (row.restSeconds > 0) post.rest_time = c2Tenths(row.restSeconds);
  if (row.restMeters > 0) post.rest_distance = row.restMeters;
  if (row.avgStrokeRate !== undefined) post.stroke_rate = row.avgStrokeRate;
  if (opts.workoutType !== undefined) post.workout_type = opts.workoutType;
  return post;
}

export interface FieldDiff {
  field: string;
  expected: unknown;
  cameBack: unknown;
  verdict: "match" | "MISMATCH" | "invisible-to-result-object";
}

// The result object C2 returns has NO top-level stroke_rate/rest_time/
// rest_distance (spec §Research record) — those fields are named
// invisible rather than silently skipped, so the report says which oracle
// saw which field (anchor F10).
const RESULT_OBJECT_BLIND = new Set(["rest_time", "rest_distance", "stroke_rate"]);

export function diffRowVsResult(
  row: StoredRowFixture,
  opts: PostOpts,
  result: Record<string, unknown>,
): FieldDiff[] {
  const expected = buildResultPost(row, { ...opts, timeOverrideTenths: undefined });
  return Object.entries(expected).map(([field, want]) => {
    if (RESULT_OBJECT_BLIND.has(field)) {
      return { field, expected: want, cameBack: undefined, verdict: "invisible-to-result-object" as const };
    }
    const got = result[field];
    return {
      field,
      expected: want,
      cameBack: got,
      verdict: got === want ? ("match" as const) : ("MISMATCH" as const),
    };
  });
}
```

- [ ] **Step 4: Run tests, verify all pass**

Run (from `app/`): `pnpm test --project unit -- c2-crossconnect`
Expected: PASS (all Task 1 + Task 2 tests). Also grep the OUTPUT's
"Test Files" line — a load failure collects zero (read-both-lines rule).

- [ ] **Step 5: Mutation probe (RF21/22 — commit first, then probe)**

Commit (as below), THEN: change `c2Tenths` to `Math.round(seconds)` and run
the suite. Expected: the "one minute is 600" test fails with `60 !== 600`.
Revert with `git checkout -- app/scripts/c2-crossconnect.ts` (safe: file just
committed, `git status` clean). Record what the failure said for the PR body.

- [ ] **Step 6: Commit**

```bash
git rev-parse --show-toplevel  # MUST print .../worktrees/wave-e-logbook
git add app/scripts/c2-crossconnect.ts app/scripts/c2-crossconnect.test.ts
git commit -m "PR0: payload builder + diff engine with oracle-blindness marking"
```

---

### Task 3: Fixture extraction + `post`/`diff` commands + the red-proof

**Files:**
- Modify: `app/scripts/c2-crossconnect.ts`
- Create: `docs/monitor/c2-crossconnect-2026-09/README.md` (skeleton)

**Interfaces:**
- Consumes: everything from Tasks 1-2.
- Produces: `cmdPost`, `cmdDiff`, `cmdProbeRed` commands; the FIXTURE constant
  Tasks 4-5 reuse.

- [ ] **Step 1: Extract the fixture row from the committed corpus**

Open `app/src/monitor/oracleCorpusReplay.test.ts` and find the capture whose
rest totals are 254.8 s / 935 m — noted at RC close as "rests-finished …
exact" (ROADMAP Wave E item history). Follow it to its session directory
under `docs/monitor/sessions/` and read that walk's README. Record, with the
capture path cited in a comment: `workSeconds`, `workMeters`, `restSeconds`,
`restMeters`, the machine's `avgStrokeRate` if the capture carries a 0x0039
decode, and the wall-clock end time of the piece from the walk README (this
becomes the fixture's `date`, with `tz` set to the zone the walk happened
in — James rows in America/Los_Angeles unless the README says otherwise).
Add to the script:

```ts
// FIXTURE: docs/monitor/sessions/<the capture dir>/ — <which piece>.
// Values transcribed from the stored-form numbers the corpus replay
// asserts; date/tz from the walk README. See PR0 report §fixture.
export const FIXTURE: StoredRowFixture = {
  workSeconds: 0, // ← real values at execution time, from the capture
  workMeters: 0,
  restSeconds: 0,
  restMeters: 0,
};
export const FIXTURE_OPTS: PostOpts = {
  weightClass: "H",
  date: new Date("<from the walk README>"),
  tz: "America/Los_Angeles",
};
```

(The zeros above are the ONE deliberate placeholder in this plan, because the
values must come from reading the capture at execution time, not from this
plan's author's memory — RF16. The executor fills them and cites the file.)

- [ ] **Step 2: Implement the three commands**

```ts
async function authedFetch(cfg: C2Config, path: string, init?: RequestInit) {
  const session = await loadSession();
  const res = await fetch(new URL(path, cfg.baseUrl), {
    ...init,
    headers: {
      ...init?.headers,
      authorization: `Bearer ${session.tokens.access_token}`,
      ...(init?.body ? { "content-type": "application/json" } : {}),
      accept: "application/json",
    },
  });
  return res;
}

async function postResult(
  cfg: C2Config,
  body: Record<string, unknown>,
): Promise<{ status: number; json: Record<string, unknown> }> {
  const res = await authedFetch(cfg, "/api/users/me/results", {
    method: "POST",
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  console.log(`POST → ${res.status}`);
  console.log(JSON.stringify(json, null, 2));
  return { status: res.status, json };
}

async function cmdPost(cfg: C2Config): Promise<void> {
  await postResult(cfg, buildResultPost(FIXTURE, FIXTURE_OPTS));
}

async function cmdDiff(cfg: C2Config): Promise<void> {
  const id = process.argv[3];
  if (!id) throw new Error("usage: … diff <result_id>");
  const res = await authedFetch(cfg, `/api/users/me/results/${id}`);
  const wrapper = (await res.json()) as { data?: Record<string, unknown> };
  const result = wrapper.data ?? (wrapper as Record<string, unknown>);
  for (const d of diffRowVsResult(FIXTURE, FIXTURE_OPTS, result)) {
    console.log(`${d.verdict.padEnd(28)} ${d.field}: expected ${String(d.expected)} got ${String(d.cameBack)}`);
  }
  for (const type of ["csv", "fit", "tcx"] as const) {
    const ex = await authedFetch(cfg, `/api/users/me/results/${id}/export/${type}`);
    console.log(`export/${type} → ${ex.status} ${ex.headers.get("content-type")}`);
    if (type === "csv" && ex.ok) console.log(await ex.text());
  }
}

async function cmdProbeRed(cfg: C2Config): Promise<void> {
  // RF21: prove the diff can go red. Post the fixture with time encoded in
  // SECONDS (the classic wrong encoding), then diff — `time` must MISMATCH.
  const wrong = buildResultPost(FIXTURE, {
    ...FIXTURE_OPTS,
    date: new Date(FIXTURE_OPTS.date.getTime() + 86_400_000), // avoid 409 with the real post
    timeOverrideTenths: Math.round(FIXTURE.workSeconds),
  });
  const { json } = await postResult(cfg, wrong);
  const result = (json as { data?: Record<string, unknown> }).data ?? json;
  const timeDiff = diffRowVsResult(FIXTURE, FIXTURE_OPTS, result).find(
    (d) => d.field === "time",
  );
  console.log(`PROBE red-proof: time verdict = ${timeDiff?.verdict} (MUST be MISMATCH)`);
}
```

Register in the dispatcher: `post: () => cmdPost(readConfig())`,
`diff: () => cmdDiff(readConfig())`, `"probe-red": () => cmdProbeRed(readConfig())`.

- [ ] **Step 3: Typecheck, lint, full unit run**

Run (from `app/`): `pnpm typecheck && pnpm lint && pnpm test --project unit`
Expected: clean, all green.

- [ ] **Step 4: Create the report skeleton**

`docs/monitor/c2-crossconnect-2026-09/README.md` with empty sections:
Fixture (capture citation) · Auth + state-echo probe · The post · Field-by-field
diff (result object) · Export contents (csv columns recorded verbatim; fit/tcx
status) · Per-field oracle visibility table · Red-proof (what the failure said)
· Dedup granularity (three pre-committed branches from the spec, answer marked)
· Zero-rest post · Verification stretch · Eligible-population count · Verdict
against RC exit (d).

- [ ] **Step 5: Commit**

```bash
git rev-parse --show-toplevel  # MUST print .../worktrees/wave-e-logbook
git add app/scripts/c2-crossconnect.ts docs/monitor/c2-crossconnect-2026-09/README.md
git commit -m "PR0: post/diff/red-proof commands + report skeleton"
```

---

### Task 4: Dedup-granularity probe

**Files:**
- Modify: `app/scripts/c2-crossconnect.ts`

**Interfaces:**
- Consumes: `postResult`, `buildResultPost`, `FIXTURE`, `FIXTURE_OPTS`.
- Produces: `probe-dedup` command.

- [ ] **Step 1: Implement**

```ts
async function cmdProbeDedup(cfg: C2Config): Promise<void> {
  // Spec §PR0 probe 2 — the three product branches are pre-committed in the
  // spec; this prints the raw statuses the report interprets.
  // Base date: unique day, away from Task 3's posts.
  const base = new Date("2026-09-02T14:00:00Z");
  const at = (deltaMs: number): PostOpts => ({
    ...FIXTURE_OPTS,
    date: new Date(base.getTime() + deltaMs),
  });
  console.log("A: fresh post (expect 201)");
  await postResult(cfg, buildResultPost(FIXTURE, at(0)));
  console.log("B: exact repost (expect 409 — proves dedup fires at all)");
  await postResult(cfg, buildResultPost(FIXTURE, at(0)));
  console.log("C: same day, +30 SECONDS (THE deciding case: 409 = day-granular, 201 = datetime-granular)");
  await postResult(cfg, buildResultPost(FIXTURE, at(30_000)));
  console.log("D: same date, time field +1 tenth (expect 201 — time is in the key)");
  await postResult(cfg, {
    ...buildResultPost(FIXTURE, at(60_000)),
    time: c2Tenths(FIXTURE.workSeconds) + 1,
  });
  console.log("E: next day, identical values (expect 201 — sanity)");
  await postResult(cfg, buildResultPost(FIXTURE, at(86_400_000)));
}
```

Register: `"probe-dedup": () => cmdProbeDedup(readConfig())`.

- [ ] **Step 2: Typecheck + lint + commit**

```bash
git rev-parse --show-toplevel
git add app/scripts/c2-crossconnect.ts
git commit -m "PR0: dedup-granularity probe"
```

---

### Task 5: Zero-rest + verification probes

**Files:**
- Modify: `app/scripts/c2-crossconnect.ts`

**Interfaces:**
- Consumes: Tasks 1-3's exports.
- Produces: `probe-zerorest`, `probe-verification` commands.

- [ ] **Step 1: Implement**

```ts
async function cmdProbeZeroRest(cfg: C2Config): Promise<void> {
  // Spec §PR0 probe 3 (anchor F11): a continuous piece declaring an interval
  // workout_type while omitting rest fields — accepted or rejected decides
  // whether workout_type omission is forced for continuous rows.
  await postResult(cfg, buildResultPost(
    { ...FIXTURE, restSeconds: 0, restMeters: 0 },
    { ...FIXTURE_OPTS, date: new Date("2026-09-03T14:00:00Z"), workoutType: "VariableInterval" },
  ));
}

async function cmdProbeVerification(cfg: C2Config): Promise<void> {
  // Stretch (spec §PR0 probe 5). Only meaningful AFTER the date mapping
  // proved out (anchor K3). The executor formats the fixture capture's
  // verificationBytes per C2's documented example shape
  // (1234-5678-90AB-CDEF-) and posts with verification_code; any 4xx body
  // is the finding. If the fixture capture carries no verificationBytes,
  // record "no bytes on the fixture capture" — that is the result.
  const code = process.argv[3];
  if (!code) throw new Error("usage: … probe-verification <formatted-code>");
  await postResult(cfg, {
    ...buildResultPost(FIXTURE, { ...FIXTURE_OPTS, date: new Date("2026-09-04T14:00:00Z") }),
    verification_code: code,
  });
}
```

Register both in the dispatcher.

- [ ] **Step 2: Typecheck + lint + commit**

```bash
git rev-parse --show-toplevel
git add app/scripts/c2-crossconnect.ts
git commit -m "PR0: zero-rest and verification probes"
```

---

### Task 6: The live run, the report, and the PR

**Blocked on James's operator steps** (Global Constraints). Everything before
this task builds and tests offline.

- [ ] **Step 1: Confirm credentials + registration with James**

Needed in the shell env for every live command:
`C2_CLIENT_ID`, `C2_CLIENT_SECRET`,
`C2_REDIRECT_URI=http://localhost:8199/c2-callback` (must equal what he
registered in C2's API-key portal). He also needs a `log-dev.concept2.com`
account. Values are typed by James (`! export …` in-session or a local shell),
never echoed into the transcript.

- [ ] **Step 2: Run the sequence, capturing output to the report dir**

From `app/`, in order (each `| tee -a` into
`docs/monitor/c2-crossconnect-2026-09/raw-output.txt`, absolute worktree
path):
1. `pnpm exec tsx scripts/c2-crossconnect.ts auth` — records the state-echo
   probe.
2. `… post` — note the returned id.
3. `… diff <id>` — the field-by-field verdicts + csv columns.
4. `… probe-red` — MUST print `MISMATCH`; if it prints `match`, STOP: the
   diff cannot go red and nothing after it is evidence (RF21).
5. `… probe-dedup`
6. `… probe-zerorest`
7. `… probe-verification <code>` — only if the fixture capture has bytes.

- [ ] **Step 3: The eligible-population count (spec §Mapping, PM condition 3)**

James runs on the prod host (deploy path `~/Ergomatic`, app port 8082 —
deploy-host facts):

```sql
SELECT count(*) FILTER (WHERE ended_by = 'finished'
                        AND work_seconds IS NOT NULL
                        AND work_meters IS NOT NULL) AS eligible,
       count(*) AS total_rows
FROM session_logs;
```

Record both numbers. Near-zero is a finding, not a blocker (spec: the
button's first audience may be rows saved after this ships).

- [ ] **Step 4: Write the report**

Fill every section of `docs/monitor/c2-crossconnect-2026-09/README.md`.
Binding bits: the dedup answer names WHICH pre-committed branch fires (spec
§PR0 probe 2); the oracle-visibility table lists every posted field × which
oracle saw it; the state-echo answer names Branch A or Branch B for PR1.5;
the verdict section quotes RC exit (d) verbatim and says MET or documents the
reason per the bounded hatch. Delete `raw-output.txt` lines carrying tokens
before committing (grep for `access_token` — there should be none; the
script never prints tokens).

- [ ] **Step 5: Reconcile the spec + ROADMAP with the measured answers**

Update the spec's §Architecture branch choice (A or B) and check off the
ROADMAP PR0 item. If any probe forced a design not written in the spec, STOP
and flag for an antagonist DELTA pass before PR1 (spec §Gates).

- [ ] **Step 6: Commit, push, open the PR**

```bash
git rev-parse --show-toplevel
git add -A && git commit -m "PR0: cross-connect report — RC exit (d) evidence"
git push -u origin wave-e-logbook
gh pr create --title "Wave E: Concept2 spec + PR0 desk cross-connect" --body-file <(...)
```

PR body per house shape: "This PR proves our stored row round-trips through
Concept2's sandbox" (or what actually happened), ~6 bullets, Record block
with probe outputs, the rev-2 gate history, and both ledger entries' landing
note. James reviews; NO merge without his explicit approval.

---

## Self-review notes

- Spec coverage: PR0's six probes → Tasks 3 (red-proof, oracle table), 4
  (dedup), 5 (zero-rest, verification), 6 (population count, report,
  state-echo recorded from Task 1's auth). RC (d) verdict in Task 6 Step 4.
  PR1/PR1.5/PR2 are deliberately UNPLANNED until PR0's report exists (spec
  §PR decomposition — stubs transcribe real transcripts; the return branch
  is chosen by the state probe; PR2 waits on Gate 0).
- One deliberate placeholder (FIXTURE zeros), fenced with the reason and the
  extraction instruction (Task 3 Step 1).
- Type consistency: `StoredRowFixture`/`PostOpts`/`FieldDiff` defined once
  (Task 2), consumed by name in Tasks 3-5.
