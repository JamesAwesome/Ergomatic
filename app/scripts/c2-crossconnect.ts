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
    // Review #2: C2 marks `scope` required at the token-exchange step, not
    // just at /oauth/authorize — do not rely on a default.
    body: new URLSearchParams({
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      grant_type: "authorization_code",
      code,
      redirect_uri: cfg.redirectUri,
      scope: "user:read,results:write",
    }),
  });
  if (!res.ok)
    throw new Error(`token exchange failed: ${res.status} ${await res.text()}`);
  return (await res.json()) as TokenSet;
}

export interface StateReceipt {
  nonceSha256: string;
  echoedSha256: string;
  equal: true;
  at: string;
}

// Review #1: cmdAuth must ENFORCE state (Branch A requires it), not just
// probe and log it. Pure so the enforcement logic is testable independent
// of readline/process.exit wiring.
export function verifyState(
  nonce: string,
  echoed: string | null,
  now: () => Date = () => new Date(),
): { ok: true; receipt: StateReceipt } | { ok: false; reason: string } {
  if (echoed === null) {
    return { ok: false, reason: "state missing from callback" };
  }
  if (echoed !== nonce) {
    return { ok: false, reason: `state mismatch: got ${echoed}` };
  }
  const nonceSha256 = createHash("sha256").update(nonce).digest("hex");
  const echoedSha256 = createHash("sha256").update(echoed).digest("hex");
  return {
    ok: true,
    receipt: {
      nonceSha256,
      echoedSha256,
      equal: true,
      at: now().toISOString(),
    },
  };
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

// MEASURED LIVE 2026-08-31 (result 85557 on log-dev, PR0 report): the
// result object DOES return rest_time/rest_distance/stroke_rate at top
// level — the research-pass claim that it omits them was wrong. Visibility
// is therefore decided per response, not from a hardcoded list: a field
// the result carries is COMPARED; only a field genuinely absent from the
// response is named invisible rather than silently skipped, so the report
// still says which oracle saw which field (anchor F10).
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
    const got = result[field];
    if (got === undefined) {
      return {
        field,
        expected: want,
        cameBack: undefined,
        verdict: "invisible-to-result-object" as const,
      };
    }
    return {
      field,
      expected: want,
      cameBack: got,
      verdict: got === want ? ("match" as const) : ("MISMATCH" as const),
    };
  });
}

import { chmod, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline/promises";
import { createHash, randomBytes } from "node:crypto";

const SESSION_PATH = join(homedir(), ".ergomatic-c2-dev.json");

interface Session {
  tokens: TokenSet;
  obtainedAt: string;
  c2UserId?: number;
  stateEchoed: boolean;
  stateReceipt: StateReceipt;
}

async function loadSession(): Promise<Session> {
  return JSON.parse(await readFile(SESSION_PATH, "utf8")) as Session;
}

export async function cmdAuth(cfg: C2Config): Promise<void> {
  const state = randomBytes(16).toString("hex");
  console.log("\nOpen this in a browser, log in to log-dev, approve:\n");
  console.log(buildAuthorizeUrl(cfg, state));
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const pasted = await rl.question("\nPaste the FULL redirected URL: ");
  rl.close();
  const { code, state: echoed } = parseCallbackUrl(pasted.trim());
  console.log(
    `PROBE state-echo: ${echoed === state ? "ECHOED" : `NOT ECHOED (got ${echoed})`}`,
  );
  // Review #1: Branch A requires state — enforce it, before any token
  // exchange, rather than only logging the probe result.
  const verified = verifyState(state, echoed);
  if (!verified.ok) {
    console.log(`AUTH ABORTED: ${verified.reason}`);
    process.exit(1);
    return;
  }
  const tokens = await exchangeCode(cfg, code);
  const meRes = await fetch(new URL("/api/users/me", cfg.baseUrl), {
    headers: { authorization: `Bearer ${tokens.access_token}` },
  });
  const me = (await meRes.json()) as { data?: { id?: number } };
  const session: Session = {
    tokens,
    obtainedAt: new Date().toISOString(),
    c2UserId: me.data?.id,
    stateEchoed: true,
    stateReceipt: verified.receipt,
  };
  // Review #3: the session file carries live tokens — write it 0600, and
  // chmod after (mode only applies at file creation, not on overwrite of an
  // existing file from a prior run).
  await writeFile(SESSION_PATH, JSON.stringify(session, null, 2), {
    mode: 0o600,
  });
  await chmod(SESSION_PATH, 0o600);
  console.log(`Session saved to ${SESSION_PATH} (user ${me.data?.id}).`);
  console.log(
    "State receipt (hashes only, never raw tokens — paste into the walk report):",
  );
  console.log(JSON.stringify(verified.receipt, null, 2));
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
//     ("wall=2026-08-25T21:42:03.110Z"). tz: the walk README states NO zone
//     for this session (grepped, nothing found — a prior comment here cited
//     James/America/Los_Angeles and that citation was invented, RF16). The
//     zone below is instead SOURCED from the capture's own wire stamp:
//     rests-finished-ring.json:65 pairs wire=2026-08-25 17:40 with the same
//     wall=2026-08-25T21:42:03.110Z — the monitor's local clock reads wall
//     minus 4 h (wire is minute-resolution and reads ~2 min slow, matching
//     that line's own "DIAGNOSTIC only" caveat). UTC-4 in August is EDT
//     (America/New_York), and every other summary-log-stamp line under
//     docs/monitor/sessions/ shows the same wall-4h relationship (e.g.
//     walk-2026-08-28*/*.json: wire=2026-08-28 21:22/21:27/17:36 vs
//     wall=...T01:24:18/01:29:11/21:38:28 — all -4h), corroborated by this
//     repo's own commits being authored at -0400 (`git log -1 --format=%cI`
//     on this branch: 2026-08-31T11:01:49-04:00). PENDING JAMES'S
//     CONFIRMATION — no walk README states the PM5's set timezone directly.
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
  tz: "America/New_York",
  // I-1: the flagship post must exercise every field the mapping sends —
  // the spec's bounded hatch forbids "we chose not to send it" (spec
  // §PR0). workoutType decoded straight off this capture:
  // rests-finished-ring.json:66 ("0x0039 decoded: ... workoutType=8 ...");
  // ordinal 8 -> VariableInterval per
  // docs/superpowers/specs/2026-08-24-just-row-design.md:303 ("a programmed
  // row is `VariableInterval`" — this fixture is a programmed 3-interval
  // walk, so VariableInterval is the correct mapping, not just an available
  // one).
  workoutType: "VariableInterval",
};

// Minor 2: a non-aliased account can 404 the `me` alias on result routes —
// use the stored session's c2UserId when present, falling back to `me`.
function resultsBase(session: Session): string {
  return session.c2UserId !== undefined
    ? `/api/users/${session.c2UserId}/results`
    : "/api/users/me/results";
}

// Review #5b: must not launder a bad response into an "invisible" verdict —
// a non-2xx or a malformed 2xx body throws, loudly, instead of being handed
// to diffRowVsResult as if it were a real result record.
export async function fetchResult(
  cfg: C2Config,
  id: string,
): Promise<Record<string, unknown>> {
  const session = await loadSession();
  const res = await authedFetch(cfg, `${resultsBase(session)}/${id}`);
  const raw = await res.text();
  if (!res.ok) throw new Error(`fetchResult failed: ${res.status} ${raw}`);
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    parsed = { rawBody: raw };
  }
  const wrapper =
    typeof parsed === "object" && parsed !== null
      ? (parsed as { data?: Record<string, unknown> })
      : undefined;
  const data = wrapper?.data;
  if (
    typeof data !== "object" ||
    data === null ||
    data.id === undefined ||
    data.id === null
  ) {
    throw new Error("malformed result response");
  }
  // P1 fix (PR0 re-review): a stale or wrong row must never masquerade as
  // fresh evidence for the id we asked for — require the response to name
  // the SAME id we requested, not just SOME id.
  if (String(data.id) !== String(id)) {
    throw new Error(
      `fetchResult id mismatch: requested ${id}, got ${String(data.id)}`,
    );
  }
  return data;
}

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
  // I-2: a non-JSON body must still be captured and printed — a 4xx body IS
  // the finding for probes 3 and 5, and the old `.catch(() => ({}))` threw
  // it away silently.
  const raw = await res.text();
  let json: Record<string, unknown>;
  try {
    json = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    json = { rawBody: raw };
  }
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
  const result = await fetchResult(cfg, id);
  for (const d of diffRowVsResult(FIXTURE, FIXTURE_OPTS, result)) {
    console.log(
      `${d.verdict.padEnd(28)} ${d.field}: expected ${String(d.expected)} got ${String(d.cameBack)}`,
    );
  }
  const session = await loadSession();
  const base = resultsBase(session);
  for (const type of ["csv", "fit", "tcx"] as const) {
    const ex = await authedFetch(cfg, `${base}/${id}/export/${type}`);
    console.log(
      `export/${type} → ${ex.status} ${ex.headers.get("content-type")}`,
    );
    if (type === "csv" && ex.ok) console.log(await ex.text());
  }
}

// Review #5a: a 409 (dedup — the post already existed) can still carry an
// `id` in its body, and that id is NOT fresh evidence for the red-proof —
// only a genuine fresh 201 is. Pure so the guard is testable independent of
// the network call.
export function evaluateFreshPost(
  status: number,
  id: unknown,
): { ok: true; id: string } | { ok: false; message: string } {
  if (status === 201 && id !== undefined && id !== null) {
    return { ok: true, id: String(id) };
  }
  return {
    ok: false,
    message: `RED-PROOF ABORTED: expected fresh 201, got ${status}`,
  };
}

async function cmdProbeRed(cfg: C2Config): Promise<void> {
  // RF21: prove the diff can go red. Post the fixture with time encoded in
  // SECONDS (the classic wrong encoding). I-3: the verdict must NOT be read
  // off the POST echo — C2's create response is not guaranteed to be the
  // same shape a later GET returns. Self-contained instead: fetch the
  // stored result back (the same path cmdDiff uses) and diff THAT, only
  // trusting a MISMATCH when cameBack is actually defined and wrong.
  const wrong = buildResultPost(FIXTURE, {
    ...FIXTURE_OPTS,
    date: new Date(FIXTURE_OPTS.date.getTime() + 86_400_000), // avoid 409 with the real post
    timeOverrideTenths: Math.round(FIXTURE.workSeconds),
  });
  const { status, json } = await postResult(cfg, wrong);
  const posted = (json as { data?: Record<string, unknown> }).data ?? json;
  const evaluated = evaluateFreshPost(status, posted.id);
  if (!evaluated.ok) {
    console.log(evaluated.message);
    process.exit(1);
    return;
  }
  const id = evaluated.id;
  console.log(`PROBE red-proof: posted id=${id}, fetching it back`);
  const result = await fetchResult(cfg, id);
  const timeDiff = diffRowVsResult(FIXTURE, FIXTURE_OPTS, result).find(
    (d) => d.field === "time",
  );
  const proven = timeDiff !== undefined && timeDiff.cameBack !== undefined;
  const verdict = proven
    ? timeDiff.verdict
    : `UNPROVEN — cameBack is ${String(timeDiff?.cameBack)}, not a defined-and-wrong value`;
  console.log(
    `PROBE red-proof: time verdict (from a fresh GET of id=${String(id)}, not the POST echo) = ${verdict} (MUST be MISMATCH; double-check by hand with \`diff ${String(id)}\`)`,
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
    "C: same day, +30 SECONDS (THE deciding case: 409 = coarser than seconds, 201 = datetime-granular — a +30s probe can't tell day from minute granularity; the wire date is minute-resolution, exactly the ErgData shape)",
  );
  await postResult(cfg, buildResultPost(FIXTURE, at(30_000)));
  console.log(
    "D: SAME instant as A/B, time field +1 tenth (expect 201 — time is in the key)",
  );
  await postResult(cfg, {
    ...buildResultPost(FIXTURE, at(0)),
    time: c2Tenths(FIXTURE.workSeconds) + 1,
  });
  console.log("E: next day, identical values (expect 201 — sanity)");
  await postResult(cfg, buildResultPost(FIXTURE, at(86_400_000)));
}

async function cmdProbeZeroRest(cfg: C2Config): Promise<void> {
  // Spec §PR0 probe 3 (anchor F11): a continuous piece declaring an interval
  // workout_type while omitting rest fields — accepted or rejected decides
  // whether workout_type omission is forced for continuous rows.
  await postResult(
    cfg,
    buildResultPost(
      { ...FIXTURE, restSeconds: 0, restMeters: 0 },
      {
        ...FIXTURE_OPTS,
        // Past date on purpose: log-dev 422s dates ~3+ days in the future
        // ("The date of the workout is too far in the future", measured
        // 2026-08-31 — see the PR0 report's Encoding notes).
        date: new Date("2026-08-24T14:00:00Z"),
        workoutType: "VariableInterval",
      },
    ),
  );
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
    ...buildResultPost(FIXTURE, {
      ...FIXTURE_OPTS,
      // Past date: log-dev rejects dates ~3+ days ahead (measured 2026-08-31).
      date: new Date("2026-08-23T14:00:00Z"),
    }),
    verification_code: code,
  });
}

const [, , command] = process.argv;
const commands: Record<string, () => Promise<void>> = {
  auth: () => cmdAuth(readConfig()),
  post: () => cmdPost(readConfig()),
  diff: () => cmdDiff(readConfig()),
  "probe-red": () => cmdProbeRed(readConfig()),
  "probe-dedup": () => cmdProbeDedup(readConfig()),
  "probe-zerorest": () => cmdProbeZeroRest(readConfig()),
  "probe-verification": () => cmdProbeVerification(readConfig()),
};
if (command && commands[command]) {
  commands[command]().catch((e: unknown) => {
    console.error(e);
    process.exit(1);
  });
} else if (command !== undefined) {
  console.error(`unknown command: ${command}`);
  process.exit(1);
} else if (process.argv[1]?.endsWith("c2-crossconnect.ts")) {
  // Run directly with no command — usage, not silence.
  console.log(
    `usage: c2-crossconnect.ts <${Object.keys(commands).join(" | ")}>`,
  );
}
// Else: imported by the test file (command undefined, not the entry script)
// — no dispatch, no output.
