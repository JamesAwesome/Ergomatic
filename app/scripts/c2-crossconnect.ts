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
    if (!v)
      throw new Error(
        `${k} is required (real env only; see spec §PR0 operator steps)`,
      );
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
  if (!res.ok)
    throw new Error(`token exchange failed: ${res.status} ${await res.text()}`);
  return (await res.json()) as TokenSet;
}

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
const RESULT_OBJECT_BLIND = new Set([
  "rest_time",
  "rest_distance",
  "stroke_rate",
]);

export function diffRowVsResult(
  row: StoredRowFixture,
  opts: PostOpts,
  result: Record<string, unknown>,
): FieldDiff[] {
  const expected = buildResultPost(row, {
    ...opts,
    timeOverrideTenths: undefined,
  });
  return Object.entries(expected).map(([field, want]) => {
    if (RESULT_OBJECT_BLIND.has(field)) {
      return {
        field,
        expected: want,
        cameBack: undefined,
        verdict: "invisible-to-result-object" as const,
      };
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
  console.log(
    `PROBE state-echo: ${stateEchoed ? "ECHOED" : `NOT ECHOED (got ${echoed})`}`,
  );
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

// FIXTURE: docs/monitor/sessions/walk-2026-08-25/rests-finished-recording.jsonl.gz
// — piece 1 ("Walk Rests", `w 1' r1 / w 500m r1 / w 1'`), natural finish.
// Chosen because it is the capture `oracleCorpusReplay.test.ts:682` cites as
// "254.8 s / 935 m on both sides" (RC close, RC-9(b)). Values transcribed
// from the stored-form numbers that test and its capture assert — never
// invented (RF16):
//   - workSeconds=254.8, workMeters=935: 0x0039's own end-of-workout totals,
//     WORK-ONLY (rest-exclusive — the test's own headline claim, settled at
//     oracleCorpusReplay.test.ts:704-716 and independently by the walk
//     README's finding W-5). Decoded raw bytes + summary-totals line:
//     docs/monitor/sessions/walk-2026-08-25/rests-finished-ring.json:65-67
//     ("0x0039 decoded: elapsed=254.8s distance=935m").
//   - restSeconds=120: the program's two 60 s rests (after intervals 1 and
//     2), both programmed AND taken — walk README finding W-9's table
//     (60 + 60 + 0 = 120 s) and independently confirmed by
//     oracleCorpusReplay.test.ts:708-712 ("a rest-inclusive reading would be
//     374.8 s" = 254.8 + 120).
//   - restMeters=274: 0x003A's Total Rest Distance, REST-ONLY, agreeing with
//     our own accumulator to the metre —
//     oracleCorpusReplay.test.ts:485 ("machine(0x003A)=274m ours=274m
//     delta=0m") and walk README finding W-9's table (130 + 144 = 274 m).
//   - avgStrokeRate=24: 0x0039 byte 10 on THIS (natural-finish) capture only
//     — docs/monitor/sessions/walk-2026-08-25/rests-finished-ring.json:65
//     raw byte 10 = `18` hex = 24. The walk README's W-3 flags 0x0039's
//     average stroke rate as unreliable (reads 2x) ONLY on a TERMINATED
//     piece; this capture is a natural finish, and W-3's own table lists
//     "Piece 1 (finished) | 24", matching the raw byte independently.
// date/tz: the 0x0039 summary's own wall-clock stamp —
//     docs/monitor/sessions/walk-2026-08-25/rests-finished-ring.json:66
//     ("wall=2026-08-25T21:42:03.110Z"); tz per the walk README's own walk
//     (James, America/Los_Angeles — no override stated for this session).
// See PR0 report §fixture.
export const FIXTURE: StoredRowFixture = {
  workSeconds: 254.8,
  workMeters: 935,
  restSeconds: 120,
  restMeters: 274,
  avgStrokeRate: 24,
};
export const FIXTURE_OPTS: PostOpts = {
  weightClass: "H",
  date: new Date("2026-08-25T21:42:03.110Z"),
  tz: "America/Los_Angeles",
};

async function authedFetch(
  cfg: C2Config,
  path: string,
  init?: RequestInit,
): Promise<Response> {
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
    console.log(
      `${d.verdict.padEnd(28)} ${d.field}: expected ${String(d.expected)} got ${String(d.cameBack)}`,
    );
  }
  for (const type of ["csv", "fit", "tcx"] as const) {
    const ex = await authedFetch(
      cfg,
      `/api/users/me/results/${id}/export/${type}`,
    );
    console.log(
      `export/${type} → ${ex.status} ${ex.headers.get("content-type")}`,
    );
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
  console.log(
    `PROBE red-proof: time verdict = ${timeDiff?.verdict} (MUST be MISMATCH)`,
  );
}

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
  console.log(
    "C: same day, +30 SECONDS (THE deciding case: 409 = day-granular, 201 = datetime-granular)",
  );
  await postResult(cfg, buildResultPost(FIXTURE, at(30_000)));
  console.log(
    "D: same date, time field +1 tenth (expect 201 — time is in the key)",
  );
  await postResult(cfg, {
    ...buildResultPost(FIXTURE, at(60_000)),
    time: c2Tenths(FIXTURE.workSeconds) + 1,
  });
  console.log("E: next day, identical values (expect 201 — sanity)");
  await postResult(cfg, buildResultPost(FIXTURE, at(86_400_000)));
}

const [, , command] = process.argv;
const commands: Record<string, () => Promise<void>> = {
  auth: () => cmdAuth(readConfig()),
  post: () => cmdPost(readConfig()),
  diff: () => cmdDiff(readConfig()),
  "probe-red": () => cmdProbeRed(readConfig()),
  "probe-dedup": () => cmdProbeDedup(readConfig()),
};
if (command && commands[command]) {
  commands[command]().catch((e: unknown) => {
    console.error(e);
    process.exit(1);
  });
} else if (
  command !== undefined ||
  process.argv[1]?.endsWith("c2-crossconnect.ts")
) {
  // Imported by the test file: no command, no dispatch, no output.
  if (command !== undefined) {
    console.error(`unknown command: ${command}`);
    process.exit(1);
  }
}
