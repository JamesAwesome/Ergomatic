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

import { writeFile } from "node:fs/promises";
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

const [, , command] = process.argv;
const commands: Record<string, () => Promise<void>> = {
  auth: () => cmdAuth(readConfig()),
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
