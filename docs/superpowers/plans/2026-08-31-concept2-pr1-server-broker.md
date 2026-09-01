# Wave E PR1 — Concept2 Server Broker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**REV 2** — the antagonist premise pass (2026-08-31, verdict REVISE) is folded in; see "Premise-pass disposition" below for what changed and why. Rev 1's superseded claims are REPLACED, not appended.

**Goal:** The server side of the Concept2 link: token broker (mint → system-browser consent → callback exchange), link/unlink routes, the upload route that posts an eligible stored row to C2 and records the result id, plus the stored shapes and the `C2_LINK_ENABLED` availability gate — everything dark by default.

**Architecture:** Branch A (PROVEN at PR0: `state` echoes durably). The server holds `client_secret` and tokens; the browser hop carries no credential — a single-use, 15-minute `concept2_auth_attempts` nonce IS the user binding. Every route re-checks availability server-side (capability gate, not a hide). Upload reads only validated stored values, band-checks the two `machineSummary` fields, writes `c2_result_id`/`c2_user_id` when C2 acknowledges the row — a 2xx, or a 409 whose body names the colliding id (RF25's durable-recovery write). **No automatic path ever deletes a link** — token-endpoint failures set `needs_reauth_at`, and refresh is serialized per user with `SELECT … FOR UPDATE`.

**Tech Stack:** Express 5, Drizzle + Postgres, Vitest (+ supertest, @testcontainers/postgresql for integration), global `fetch` (injected for tests). pnpm only, ESM only, server imports use `.js` extensions.

**Spec:** `docs/superpowers/specs/2026-08-31-concept2-logbook-design.md` (rev 2, anchor-vetted). PR0 evidence: `docs/monitor/c2-crossconnect-2026-09/` — `README.md` + `raw-output.txt` (results/dedup transcripts) + **`refresh-probe-2026-08-31.md` (token-endpoint probes: rotation measured live, old token dies immediately, error dialects)**. Every C2 stub in this plan transcribes one of those committed files. PR0 harness (transplant source for `c2Tenths`/`formatC2Date`): `app/scripts/c2-crossconnect.ts`.

## Global Constraints

- Worktree: `/Users/james/projects/github/jamesawesome/Ergomatic-wt-c2pr1` (branch `wave-e-pr1-server-broker`). `git rev-parse --show-toplevel` before EVERY commit; every shell write uses an absolute worktree path (RF20).
- **ZERO files under `app/src/`** — PR1's safe end state is "no client change" (spec §PR decomposition). The client posts `completedAt`/`tz` starting PR2; PR1 only accepts/stores them. No `pnpm e2e` needed (RF1 doesn't trigger); say so in the PR body.
- TRIAD (auth + stored shapes): full cycle, James merges, PM final-PR gate.
- TDD: failing test first, every task. Every NEW assertion gets a mutation probe, run against a COMMITTED tree (RF21/RF22 — commit the real change before probing; revert probes with an explicit `git status` check first). Reports record the mutation and the exact failure text.
- Real env only (no dotenv). Env names: `C2_BASE_URL` (default `https://log-dev.concept2.com`), `C2_CLIENT_ID`, `C2_CLIENT_SECRET`, `C2_LINK_ENABLED` (default off).
- Typed-lint ratchet: no new suppressions. Run `pnpm lint`, `pnpm typecheck`, `pnpm test --project unit` locally per task; integration project needs Docker.
- Comment style: match the codebase (constraint-stating comments citing spec/section, no narration).
- Never log, serialize, or return `access_token`/`refresh_token`/`client_secret` in any response, error message, or test fixture output.

## Premise-pass disposition (rev 1 → rev 2)

| finding | disposition |
| --- | --- |
| KILL-SHOT: "400/401 on refresh = grant dead, delete link" — C2 documents 400 as OUR malformed request and 401 as CLIENT credentials; a server bug or rotated `C2_CLIENT_SECRET` would mass-unlink and re-ask the PII question | **Adopted the recommended design:** automatic paths NEVER `deleteLink`. `concept2_links.needs_reauth_at` (nullable timestamptz) is set instead; `weight_class` survives; relink is a re-consent that clears it. Misclassification is now cosmetic. |
| The refresh probe's evidence lived only in the plan; garbage-token n=1 was the wrong input class | **Measured properly and committed:** `refresh-probe-2026-08-31.md` — genuine rotation (200, new pair), the OLD token immediately after (400, same body as garbage), plus the 401 access-token shape. Dead-grant shape now n=2 with the right input class. |
| Rotation race premise unmeasured; the re-read guard was a TOCTOU heuristic with both failure modes | **Premise now MEASURED (old token dies instantly — the race is real) and the heuristic is DELETED.** Refresh serializes per user via `SELECT … FOR UPDATE` on the link row inside a transaction (rev-1 deviation 4 retired). |
| `scope` required on EVERY token call incl. refresh; rev 1's refresh description omitted it | Refresh body carries all six keys incl. `scope`; Task 4 asserts the exact key set on BOTH exchange and refresh (the probe that measured rotation sent scope and succeeded). |
| BLOCKER: "mounted like `stores`" → `routes/data.ts:722`'s `router.use("/api", requireUser)` 401s the unauthenticated callback (demonstrated) | Task 7 mounts the concept2 router **beside `createAuthRouter` (app.ts:64), BEFORE the data router**, and the integration test drives the callback with NO session cookie. |
| Upload-time `tz` varies per attempt → dedup is second-granular, so a legacy-row retry from a different zone lands a SECOND C2 row, breaking the RF25 recovery | **Persist-on-first-use:** when the row's `tz` is null, the upload route writes the request's `tz` onto the row BEFORE building the payload; every later attempt reads the stored zone. Payload stable, dedup behaves. |
| `tzError` via `Intl.DateTimeFormat` accepts `+05:00`, `utc`, `EST5EDT`… — looser than "IANA" | Validation = membership in `Intl.supportedValuesOf("timeZone")`, plus literal `"UTC"` (test whether the runtime's set includes it; accept it explicitly either way — the client's `resolvedOptions().timeZone` can produce it). |
| Task 2's sanity band 400s the WHOLE save on a bad device clock (RF25's shape at the product's north star) | Out-of-band-but-parseable `completedAt` **coerces to null** (save proceeds; upload falls back to `loggedAt`); only a malformed value (wrong type / failing the ISO shape) 400s — that's a client BUG and should be loud. Strict ISO regex so the message is true. |
| `Date.parse` accepts `"March 5, 2020"` | ISO-shape regex before parse (below). |
| stroke_rate band's authority: "u8 wire band" is false (u8=0..255); house precedent is `ACTUAL_SPM_MIN`/`PM5_SPM_MAX` (`data.ts:281,297`) | Citation replaced. Band unchanged (1..99 integers). |
| `commands.ts:386` is 0x0031 armed-readback prose, not 0x0039 | workoutType citation replaced: 0x0039 byte 17 (`parse.ts:370`), ordinal-8 string accepted live at PR0, and `walk-2026-08-24/README.md:116-118` (JustRow capture read `01`, "noted raw, not yet interpreted"). |
| "RC-16 is terminate-only" — RC-16 was CLOSED PREMISE-FALSIFIED (`phase-rc.md:1962-1968`), finished side n=1 | Restated: the 2× anomaly has never been observed on a finished row (n=1); the guard is the band check plus the finished-only fence, never RC-16. |
| Every committed machineSummary fixture carries `workoutType: 1` (terminated/ineligible) — the ordinal map's gate can't go red on the corpus | Tasks 5/7 build a NEW finished-row fixture transcribed from `walk-2026-08-25/rests-finished-ring.json:65-66` (workoutType 8, avgStrokeRate 24) — the PR0 report's own fixture, not a store fixture. |
| Wire contract: 409/502 are new to this API; two 409 meanings; proxy 502s have no JSON body | Stated in the contract; pinned: **PR2 keys on `body.error`, never on status alone**. |
| Already-sent short-circuit makes the C2-side-deleted row unrecoverable; "per-account sent state" over-reads a single stored pair | Both named as decisions below (deviation 5). Short-circuit kept; no resend door this wave; resend-to-B overwrites A's record (recoverable via 409 on relink-to-A). |
| `testDeps.ts` is a hand-written literal; three more full `AppDeps` literals exist | `concept2` is an OPTIONAL key (`concept2?: … \| null`), read with `?? null`; no other literal changes. |
| storeContracts formula is `− steps − series − machineSummary + machineAvgPaceSecondsPer500m`; the fake is self-consistent by construction | Formula corrected in Task 1; Step 6 requires the DOCKER contract run, not the fake-only run. |
| Account-injection direction (attacker mints, victim consents, victim's C2 tokens land on attacker's account) — SUSPECTED, mitigated by ALLOWED_EMAILS | Out of PR1's mechanics (Branch A is vetted ground); recorded in Task 9 as a spec note + PR Record item for James's call. |
| Deviation 1 (`redirect_kind` dropped), deviation 2's PII reading, `endedBy "rower"`, migration 0017 free, Google redirect precedent | HELD — unchanged. |

## Plan deviations from the spec, stated (for the PR record)

1. **`redirect_kind` column DROPPED from `concept2_auth_attempts`.** Branch A is chosen and measured; the redirect URI is one env-derived boot constant (`index.ts:60,69` precedent); C2 requires only that the exchange's `redirect_uri` match the authorize call's, and both come from the same constant. A mid-deploy `SITE_URL` change costs one recoverable attempt. (Attacked; HELD.)
2. **Legacy-date fallback zone comes from the UPLOAD request, persisted on first use — not "the LINK's capture zone".** The spec's fallback names a zone its own stored shape doesn't hold, and C2's user object has none (13 fields, measured). A mint-body zone would be a second link-flow attribute (exit criterion 3 bounds it to one). The upload body carries `tz`; when the row's `tz` is null it is WRITTEN to the row before the payload is built, so retries render one stable `date` (dedup is second-granular — PR0 probe C — and an unstable zone would turn the RF25 "re-send → 409" recovery into a second C2 row).
3. **Token-endpoint error handling is measured, not doc-derived — and never destructive.** MEASURED (committed, `refresh-probe-2026-08-31.md`): a dead/rotated refresh token is `400 {"message":"The refresh token is invalid.","status_code":400}`; C2's doc ALSO shows an `{error, error_description}` dialect for malformed requests and bad client credentials. Rule: refresh 400/401 → set `needs_reauth_at` (link and `weight_class` survive; UI prompts re-consent); 5xx/network → `c2_error`, retryable, no flag. The spec's `invalid_grant` sentence is corrected in Task 9 (C2 never emitted that code in any measurement).
4. **Refresh is serialized per user** (`SELECT … FROM concept2_links WHERE user_id=$1 FOR UPDATE` inside a transaction): rotation invalidates the old token IMMEDIATELY (measured, probe B), so concurrent refreshes must not race. Inside the lock: re-read; if another request already refreshed (expiry now beyond skew), use the stored pair and skip the wire call. The lock is held across the refresh HTTP call by design — it serializes one user's refreshes only; comment says so.
5. **Already-sent short-circuit on upload.** Row has `c2_result_id` AND `c2_user_id` equals the live link's → `200 {resultId}`, no wire call. NAMED consequences, accepted this wave: a result deleted on C2's site stays "sent" with a 404 link-out (spec F8 accepts this; no force-resend door this wave — PR2+ may add one); the row stores ONE `(c2_result_id, c2_user_id)` pair, so re-sending after relinking to a DIFFERENT account overwrites the record that the first account received it (recoverable: relink to A → resend → 409 duplicate). This path is hardening for stale-cache/second-device callers, not a defect fix — a correctly-rendering PR2 client never calls it.
6. **Weight-class conditional ruling (open, memory: wave-e-concept2) does not move PR1's shape.** Mint requires `weightClass` per James's standing 2026-08-22 ruling. If the open PR2 ruling changes the ASK, PR2 sources the value differently and calls the same mint contract.

## Wire contract summary (what PR2 builds against)

**PR2 pins: key on `body.error`, never on HTTP status alone** — 409 carries two meanings, and the deployment's tunnel can emit its own bodiless 502. 409/422/502 are NEW status codes for this API (census: server routes previously use 200/201/204/400/403/404/422-once/503); the error SHAPE (`{error}` / `{error, field}`) matches the house helpers.

| route | auth | success | failures |
| --- | --- | --- | --- |
| `POST /api/concept2/connect` `{weightClass}` | user | `200 {authorizeUrl}` | 403 `{error:"unavailable"}`; 400 field-named |
| `GET /api/concept2/callback?code&state` | none (nonce binds) | 200 HTML "Linked. Return to the app." | 403 HTML (unavailable — checked AT callback); 400 HTML (missing/unknown/expired/consumed state); 502 HTML (exchange failed) |
| `GET /api/concept2/link` | user | `200 {available:false}` \| `{available:true,linked:false}` \| `{available:true,linked:true,weightClass,c2UserId,needsReauth}` | never 4xx/5xx for availability; never tokens |
| `DELETE /api/concept2/link` | user | 204 (idempotent; user-initiated unlink is the ONE path that deletes) | 403 `{error:"unavailable"}` |
| `POST /api/concept2/results/:logId` `{tz}` | user | `200 {resultId}` (fresh write or already-sent) | 403 `{error:"unavailable"}`; 404 (bad/foreign/absent id); 400 (bad/absent `tz`); 409 `{error:"unlinked"}`; 409 `{error:"needs_reauth"}`; 409 `{error:"duplicate", c2ResultId}`; 422 `{error:"not_eligible", reason}`; 502 `{error:"c2_error"}` |

Availability = `C2_LINK_ENABLED === "1"` AND `C2_CLIENT_ID` AND `C2_CLIENT_SECRET` all present, computed at boot, closed over. Redirect URI = `new URL("/api/concept2/callback", siteUrl).href` (the Google precedent, `server/index.ts:69`). **Operator step before any live test:** register that URI in the log-dev API-key portal (PR0's registration was the harness's `:8199/c2-callback`, a different URI).

---

### Task 1: Stored shapes — migration, list projection, fakes

**Files:**
- Modify: `server/db/schema.ts` (two tables, one enum, four `session_logs` columns)
- Create: `drizzle/0017_*.sql` via `pnpm db:generate` (never hand-written)
- Modify: `server/stores/logs.ts` (`LOG_LIST_COLUMNS` + `LogInput` + `create()` for `completedAt`/`tz` — the c2 pair is server-written, never client input)
- Modify: `server/testing/fakes.ts` (fake logs store mirrors the new columns — `LogInput`, `create()`'s row literal, and the list projection all three)
- Modify: `server/stores/contracts/storeContracts.ts` (the pin at :1077-1084 asserts `keys(list) === keys(get) − {steps, series, machineSummary} + {machineAvgPaceSecondsPer500m}`; extend the seeded round-trip row to carry the new fields)
- Test: `server/db/schema.integration.test.ts` (or a sibling — follow that file's harness shape)

**Interfaces:**
- Produces: `concept2Links`, `concept2AuthAttempts`, `weightClassEnum` (schema exports); `sessionLogs.c2ResultId`/`c2UserId`/`completedAt`/`tz`; `LogInput.completedAt?: Date | null; tz?: string | null`.

- [ ] **Step 1: Write the failing integration test** — real Postgres container, migrate through `drizzle/`, assert: `concept2_links` (incl. `needs_reauth_at`) and `concept2_auth_attempts` exist with the expected columns; inserting a `session_logs` row with `completedAt`/`tz` round-trips; a legacy row reads all four new columns back as null. Follow `endedBy.integration.test.ts`'s harness shape.
- [ ] **Step 2: Run it** — fails (tables/columns absent).
- [ ] **Step 3: Schema additions:**

```ts
// Wave E PR1 (2026-08-31-concept2-logbook-design.md §Stored shapes, TRIAD).
export const weightClassEnum = pgEnum("weight_class", ["H", "L"]);

// One row per linked user. Tokens are plain columns behind the same trust
// boundary every credential this app holds already lives behind (spec:
// at-rest encryption with the key in the same process env is a lock taped
// to its own key — attacked at the anchor; held). Tokens are never
// serialized to any client response (routes/concept2.ts returns {linked,
// weightClass, c2UserId, needsReauth} — the account's numeric id, for
// PR2's sent-state/View-on-Concept2 needs, but still never a token).
export const concept2Links = pgTable("concept2_links", {
  userId: uuid("user_id").primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  c2UserId: integer("c2_user_id").notNull(),
  accessToken: text("access_token").notNull(),
  refreshToken: text("refresh_token").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  weightClass: weightClassEnum("weight_class").notNull(),
  // Set (never deleteLink) by any AUTOMATIC path when C2's token endpoint
  // answers 400/401 on a refresh: C2 documents those statuses for OUR
  // malformed request and OUR client credentials too (their 400 example
  // says `Check the "client_secret" parameter`), so an automatic delete
  // would destroy links — and re-ask the one PII question — on a server
  // bug or a rotated C2_CLIENT_SECRET. With this flag a misclassified
  // status costs a re-consent prompt, never the stored weight_class.
  // Cleared by the callback's upsert on successful relink. Measured
  // grounds: docs/monitor/c2-crossconnect-2026-09/refresh-probe-2026-08-31.md.
  needsReauthAt: timestamp("needs_reauth_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// Single-use, 15-minute link attempts: the browser hop carries no
// credential, so the nonce IS the user binding (spec §Architecture 1).
// No redirect_kind column — Branch A is chosen and the redirect URI is one
// env-derived constant (plan deviation 1).
export const concept2AuthAttempts = pgTable("concept2_auth_attempts", {
  nonce: text("nonce").primaryKey(),
  userId: uuid("user_id").notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  weightClass: weightClassEnum("weight_class").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
```

`session_logs` additions (inside the existing table, after `machineSummary`):

```ts
    // Wave E PR1 (spec §Stored shapes): all four additive-optional, no
    // default, no backfill — every existing row reads them back null.
    // c2ResultId: C2's own result id, written when C2 ACKNOWLEDGES the
    // row — a 2xx, or a 409 whose body names the colliding id (RF25's
    // durable-recovery write). c2UserId: WHICH Concept2 account accepted
    // it — the sent state renders only when this matches the live link's
    // (anchor F8). Both server-written at upload, never client input.
    c2ResultId: integer("c2_result_id"),
    c2UserId: integer("c2_user_id"),
    // completedAt: the client's MonitorRun.completedAt — C2's `date` is
    // the END of the workout and logged_at is save-time, minutes-to-hours
    // later (anchor K3). tz: the client's IANA zone; posted at save from
    // PR2 on, or written by the upload route's first legacy send (plan
    // deviation 2 — the payload's date must be stable across retries
    // because C2's dedup key is second-granular).
    completedAt: timestamp("completed_at", { withTimezone: true }),
    tz: text("tz"),
```

- [ ] **Step 4:** `pnpm db:generate` (in `app/`), inspect the generated SQL — additive only (2 CREATE TABLE, 1 CREATE TYPE, 4 ADD COLUMN, no defaults, no data rewrites).
- [ ] **Step 5:** Add the four columns to `LOG_LIST_COLUMNS` (small scalars — the `endedBy` idiom) and `completedAt`/`tz` to `LogInput` + `create()` (`?? null`, the `deviceName` idiom — in the REAL store, the fake's `create()`, and the fake's row literal). The storeContracts pin derives list-keys from get-keys for the real store; the fake is self-consistent by construction, so:
- [ ] **Step 6:** Run the integration + contract suites INCLUDING the Docker run (`contracts.real.integration.test.ts` — the fake-only run cannot catch a missed list column) → PASS. `pnpm lint && pnpm typecheck`.
- [ ] **Step 7: Commit** `feat(c2): concept2_links + auth_attempts tables, four session_logs columns (migration 0017)`.

### Task 2: `POST /api/logs` accepts `completedAt` + `tz`

**Files:**
- Modify: `server/routes/data.ts` (two validators + create call)
- Test: `server/routes/data.test.ts` (validator cases), extend Task 1's integration test with a POST→GET round-trip through the real route

**Interfaces:**
- Consumes: Task 1's `LogInput` fields.
- Produces: wire fields `completedAt` (ISO 8601 string, optional/nullable), `tz` (IANA zone string, optional/nullable) on `POST /api/logs`.

- [ ] **Step 1: Failing unit tests** in `data.test.ts`: POST with valid `completedAt` ISO string + `tz: "America/New_York"` → 201 and GET returns both; absent → 201, both null; `completedAt: "not-a-date"` / `"March 5, 2020"` / `12345` → 400 field-named (malformed = client bug, loud); **`completedAt` parseable but before 2020 or > 48h future → 201 with `completedAt` stored as NULL** (a wrong device clock must never cost the rower the save — RF25's shape; upload falls back to `loggedAt`); `tz: "Not/AZone"` / `"+05:00"` / `"GMT+5"` → 400 field-named; `tz: "UTC"` → accepted.
- [ ] **Step 2: Run** → fail.
- [ ] **Step 3: Validators** (beside `notesError`, same shape):

```ts
// Wave E PR1: completedAt is the run's own close stamp (C2's `date` is the
// END of the workout — spec anchor K3). Malformed input is a client BUG and
// 400s; a PARSEABLE stamp outside the plausible band is a wrong device
// clock, and the save must survive it — the caller coerces to null (the
// column is nullable and the upload mapping already has a loggedAt
// fallback). This band is a save-time sanity bound only; C2's own
// future-date bound applies at UPLOAD time to a different instant.
const COMPLETED_AT_RE =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;
const COMPLETED_AT_MIN_MS = Date.parse("2020-01-01T00:00:00Z");
const COMPLETED_AT_FUTURE_SKEW_MS = 48 * 3600 * 1000;
type CompletedAtCheck =
  | { ok: true; value: Date | null }
  | { ok: false; message: string };
function checkCompletedAt(value: unknown, now: () => number = Date.now): CompletedAtCheck {
  if (value === undefined || value === null) return { ok: true, value: null };
  if (typeof value !== "string" || !COMPLETED_AT_RE.test(value) || Number.isNaN(Date.parse(value))) {
    return { ok: false, message: "completedAt must be an ISO 8601 timestamp string or null" };
  }
  const ms = Date.parse(value);
  if (ms < COMPLETED_AT_MIN_MS || ms > now() + COMPLETED_AT_FUTURE_SKEW_MS) {
    return { ok: true, value: null }; // wrong clock: drop the stamp, keep the save
  }
  return { ok: true, value: new Date(ms) };
}

// IANA membership, not "Intl accepts it" — Intl.DateTimeFormat also accepts
// offsets ("+05:00") and legacy aliases, and C2's `timezone` feeds their
// date_utc derivation, so only canonical zone names (plus "UTC", which the
// client's resolvedOptions().timeZone can legitimately produce) pass.
const IANA_ZONES = new Set<string>([...Intl.supportedValuesOf("timeZone"), "UTC"]);
function tzError(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string" || !IANA_ZONES.has(value)) {
    return "tz must be an IANA timezone name or null";
  }
  return null;
}
```

Wire both into the POST handler (after `notesError`, same 400-field-named pattern for the `ok:false` arms) and pass through to `stores.logs.create` as `completedAt: completedAtCheck.value, tz: (body.tz as string | null | undefined) ?? null`. Export `tzError` and `IANA_ZONES` for Task 6's upload route (one copy of the rule — the from-the-log precedent).
- [ ] **Step 4: Run** → pass. Mutation probes (after commit): drop the regex test → the `"March 5, 2020"` case names the failure; invert the band coercion to 400 → the wrong-clock case fails; swap `IANA_ZONES.has` to always-true → the `"+05:00"` case fails. Record failure texts.
- [ ] **Step 5: Commit** `feat(c2): POST /api/logs accepts completedAt + tz (additive, validated, clock-safe)`.

### Task 3: Concept2 store

**Files:**
- Create: `server/stores/concept2.ts`
- Modify: `server/testing/fakes.ts` (add `makeFakeConcept2Store()` mirroring signatures)
- Test: `server/stores/concept2.integration.test.ts` (real Postgres)

**Interfaces:**
- Produces:

```ts
export interface Concept2Link {
  userId: string; c2UserId: number; accessToken: string; refreshToken: string;
  expiresAt: Date; weightClass: "H" | "L"; needsReauthAt: Date | null;
  createdAt: Date; updatedAt: Date;
}
export function createConcept2Store(db: Db): {
  getLink(userId: string): Promise<Concept2Link | null>;
  // Clears needsReauthAt — a successful relink IS the recovery.
  upsertLink(userId: string, link: { c2UserId: number; accessToken: string;
    refreshToken: string; expiresAt: Date; weightClass: "H" | "L" }): Promise<void>;
  deleteLink(userId: string): Promise<void>;   // user-initiated unlink ONLY
  // Serialized refresh (plan deviation 4): runs fn inside a transaction
  // holding SELECT ... FOR UPDATE on the user's link row. fn receives the
  // locked row (fresh read) and returns either new tokens to store, a
  // needsReauth flag to set, or nothing (another request already
  // refreshed). The lock is held across fn's wire call by design — it
  // serializes ONE user's refreshes, nothing else.
  withLinkLock<T>(userId: string, fn: (link: Concept2Link | null) => Promise<
    | { action: "store"; tokens: { accessToken: string; refreshToken: string; expiresAt: Date }; result: T }
    | { action: "flagReauth"; result: T }
    | { action: "none"; result: T }
  >): Promise<T>;
  createAttempt(a: { nonce: string; userId: string; weightClass: "H" | "L" }): Promise<void>;
  // Single-use: DELETE ... RETURNING with the expiry predicate IN the SQL,
  // so consume-and-check is one atomic statement — a second call, or an
  // expired nonce, returns null.
  consumeAttempt(nonce: string, maxAgeMs: number): Promise<{ userId: string; weightClass: "H" | "L" } | null>;
  deleteExpiredAttempts(maxAgeMs: number): Promise<void>;
  deleteAttemptsFor(userId: string): Promise<void>;
};
export type Concept2Store = ReturnType<typeof createConcept2Store>;
```

- [ ] **Step 1: Failing integration tests:** upsert→get round-trip; upsert twice replaces (one row per user, PK) AND clears a set `needsReauthAt`; deleteLink idempotent; `withLinkLock` "store" writes the pair + expiresAt + bumps updatedAt atomically; `withLinkLock` "flagReauth" sets `needsReauthAt` and leaves tokens untouched; **two concurrent `withLinkLock` calls serialize** (start both without awaiting, have the first hold the lock past the second's start, assert the second's `fn` receives the FIRST's stored tokens — the deterministic replacement for rev 1's race guard); consumeAttempt returns the row once and null the second time; consumeAttempt past maxAgeMs returns null AND deletes; deleteExpiredAttempts removes only stale rows; user delete cascades both tables.
- [ ] **Step 2: Run** → fail. **Step 3:** implement (Drizzle: `onConflictDoUpdate` for upsert with `needsReauthAt: null`; `db.transaction` + `tx.execute(sql\`select … for update\`)` or Drizzle's `.for("update")` for the lock; `sql\`${concept2AuthAttempts.createdAt} < now() - make_interval(secs => ${maxAgeMs / 1000})\`` inside `delete().where().returning()` for expiry). **Step 4:** pass. **Step 5:** in-memory fake (Map-backed; `withLinkLock` serializes via a per-user promise chain; same expiry semantics via injected clock). **Step 6: Commit** `feat(c2): concept2 store (links + serialized refresh lock + single-use attempts)`.

### Task 4: C2 HTTP client

**Files:**
- Create: `server/concept2/client.ts`
- Test: `server/concept2/client.test.ts` (stubbed `fetch`; every stub body transcribed from `docs/monitor/c2-crossconnect-2026-09/raw-output.txt` or `refresh-probe-2026-08-31.md`)

**Interfaces:**
- Produces:

```ts
export interface C2ClientConfig { baseUrl: string; clientId: string; clientSecret: string; redirectUri: string; }
export interface C2TokenSet { accessToken: string; refreshToken: string; expiresAt: Date; }
export type C2TokenResult =
  | { ok: true; tokens: C2TokenSet }
  // grantDead: HTTP 400/401 from the token endpoint. Measured shapes
  // (refresh-probe-2026-08-31.md): {"message":"The refresh token is
  // invalid.","status_code":400} for both a garbage AND a genuinely
  // rotated-away token; C2's doc ALSO shows an {error,error_description}
  // dialect. The CALLER decides what grantDead means (needs_reauth, never
  // delete) — this type only reports the status class.
  | { ok: false; grantDead: true }
  | { ok: false; grantDead: false }; // network/5xx/timeout — retryable
export type C2PostResult =
  | { ok: true; resultId: number }
  | { ok: false; kind: "duplicate"; resultId: number }   // 409, body.id names the collider
  | { ok: false; kind: "auth" }                           // 401 on the results call
  | { ok: false; kind: "c2_error"; status?: number };     // 422/5xx/network
export function createC2Client(cfg: C2ClientConfig, fetchImpl: typeof fetch = fetch): {
  authorizeUrl(state: string): string;             // /oauth/authorize, scope user:read,results:write
  exchangeCode(code: string): Promise<C2TokenResult>;
  refreshTokens(refreshToken: string): Promise<C2TokenResult>;
  fetchMe(accessToken: string): Promise<{ ok: true; c2UserId: number } | { ok: false }>;
  postResult(accessToken: string, payload: Record<string, unknown>): Promise<C2PostResult>;
};
```

- [ ] **Step 1: Failing tests.** Token endpoint, BOTH grants: form-encoded body carrying the exact six-key set — `client_id, client_secret, grant_type, code|refresh_token, redirect_uri (exchange only), scope` — **`scope` asserted present on the REFRESH body too** (C2: `Required: Yes` on every token call; their refresh example carries it; the probe that measured rotation sent it and succeeded). 200 `{access_token, refresh_token, expires_in: 604800, token_type}` → `expiresAt = now + expires_in seconds`; the measured 400 refresh body → `{ok:false, grantDead:true}`; a 401 → same; a 503/`fetch` rejection → `{ok:false, grantDead:false}`. `fetchMe`: 200 `{"data":{"id":2211,...}}` → 2211; the measured 401 (`{"message":"Invalid OAuth access token","status_code":401}`) → `{ok:false}`. `postResult`: JSON content-type; 201 transcript (id 85557) → resultId; 409 transcript `{"message":"Duplicate Result","id":85560,"status":409}` → duplicate carrying 85560; 422 transcript (future-date body) → `c2_error` with status; 401 → `auth`. Assert no method ever throws on a non-2xx (typed results only) and no error path's message string contains a token.
- [ ] **Step 2–4:** run/fail, implement (URLSearchParams for token calls, JSON for results — PR0: "JSON worked; token endpoint stays form-encoded"), pass.
- [ ] **Step 5: Commit** `feat(c2): concept2 http client (typed results, injected fetch)`.

### Task 5: Mapping module (pure)

**Files:**
- Create: `server/concept2/mapping.ts`
- Test: `server/concept2/mapping.test.ts`

**Fixture (RF3 — the corpus has NO eligible machineSummary fixture):** every committed `machineSummary` store fixture carries `workoutType: 1` from a TERMINATED capture (ineligible by this module's own fence). Build the finished-row fixture by TRANSCRIBING `docs/monitor/sessions/walk-2026-08-25/rests-finished-ring.json:65-66` — workSeconds 254.8, workMeters 935, restSeconds 120, restMeters 274, machineSummary `{avgStrokeRate: 24, workoutType: 8}`, endedBy "finished", deviceName "PM5 432331249 Row" — the same transcription PR0's harness fixture used (`c2-crossconnect.ts:280-346`, README §Fixture). Cite the ring JSON in the fixture's comment.

**Interfaces:**
- Consumes: the `session_logs` row shape (`stores/logs.ts` `get()` return) and `{weightClass}`.
- Produces:

```ts
export type EligibilityFailure = "not_monitor" | "not_finished" | "no_work_totals";
// endedBy is NULLABLE on the row (pre-RC rows carry null): null !== "finished"
// → "not_finished" — a pre-RC row is excluded with that reason, stated here
// because it has no close reason at all, not a wrong one.
export function eligibilityFailure(row: {
  deviceName: string | null; endedBy: string | null;
  workSeconds: number | null; workMeters: number | null;
}): EligibilityFailure | null;
export function c2Tenths(seconds: number): number;               // Math.round(s*10) — transplanted from scripts/c2-crossconnect.ts:132
export function formatC2Date(instant: Date, tz: string): string; // transplanted from scripts/c2-crossconnect.ts:136 (en-CA date + en-GB h23 time)
// tz precedence: row.completedAt+row.tz when BOTH present; else
// loggedAt + effectiveTz, where the CALLER passes the row's stored tz if
// present, else the request's (persisted by the route before this runs —
// plan deviation 2).
export function buildC2Payload(row: SessionLogRow, link: { weightClass: "H" | "L" },
  effectiveTz: string): Record<string, unknown>;
```

- Rules locked (spec §The mapping): `type:"rower"`; `date`/`timezone` per the precedence above; `distance: workMeters`; `time: c2Tenths(workSeconds)`; `weight_class: link.weightClass`; `rest_time`/`rest_distance` only when > 0; `stroke_rate` from `machineSummary.avgStrokeRate` (FLAT — anchor K2) only when an integer 1..99 — the HOUSE stroke-rate band (`routes/data.ts:281,297` `ACTUAL_SPM_MIN`/`PM5_SPM_MAX`, mirrored client-side in `logDraft.ts`), NOT the wire's u8 range (0..255 — `data.ts:268-270` says so); the blob is untyped jsonb and `validateMachineSummary` band-checks nothing numeric, so this band is load-bearing. `workout_type` from `machineSummary.workoutType` via `C2_WORKOUT_TYPE_BY_ORDINAL = { 8: "VariableInterval" }` — the value is 0x0039 byte 17 (`domain/monitor/pm5/parse.ts:370`), ordinal 8 = the programmed-row reading on the finished capture and C2 accepted the string live at PR0; the JustRow capture read `01`, "noted raw, not yet interpreted" (`walk-2026-08-24/README.md:116-118`), so it stays UNMAPPED until phase JR confirms it; everything else OMITTED (omission is honest — anchor F6). The 2× stroke-rate anomaly has never been observed on a FINISHED row (n=1 — RC-16 itself was closed PREMISE-FALSIFIED, `docs/history/phase-rc.md:1962-1968`; the guard here is the band plus the finished-only fence, never RC-16). No `workout`, `comments`, `stroke_data`, `verification_code`.
- [ ] **Step 1: Failing table-driven tests:** the fixture row maps to EXACTLY PR0's accepted payload (transcript echo: date `2026-08-25 17:42:03`, distance 935, time 2548, rest_time 1200, rest_distance 274, stroke_rate 24, workout_type VariableInterval); tenths boundary (254.85 → 2549, 0.04 → 0); legacy row (null completedAt/tz) uses loggedAt + effectiveTz; machineSummary absent → both optional fields omitted; avgStrokeRate 0 / 100 / 24.5 / "24" → omitted; workoutType 1 / null / "8" → omitted; zero-rest row omits both rest keys (PR0: never forced); eligibility: deviceName null → `not_monitor`, endedBy "rower" → `not_finished`, endedBy null → `not_finished`, workSeconds null → `no_work_totals`, the fixture row → null.
- [ ] **Step 2–4:** run/fail, implement, pass. Mutation probes after commit: `* 10` → `* 100`; drop the tz argument from the time formatter; invert the rest-`> 0` guard; widen the stroke band to accept 0 — record each failure text.
- [ ] **Step 5: Commit** `feat(c2): pure mapping module (row → C2 result payload, eligibility)`.

### Task 6: Router — mint, callback, link, upload

**Files:**
- Create: `server/routes/concept2.ts`
- Modify: `server/stores/logs.ts` + fakes (add `recordC2Result`, test-first in this task)
- Test: `server/routes/concept2.test.ts` (supertest + fake session store per `data.test.ts`'s pattern, fake concept2 store, stub client)

**Interfaces:**
- Consumes: Tasks 3–5; Task 2's exported `tzError`.
- Produces:

```ts
export interface Concept2RouterDeps {
  available: () => boolean;      // flag AND both creds — computed at boot, closed over
  store: Concept2Store;
  logs: LogsStore;
  client: C2Client;              // ReturnType<typeof createC2Client>
  requireUser: RequestHandler;
  now?: () => Date;              // injectable clock for expiry tests
}
export const ATTEMPT_MAX_AGE_MS = 15 * 60 * 1000;   // spec §Architecture 3
export const TOKEN_REFRESH_SKEW_MS = 60 * 1000;
export function createConcept2Router(deps: Concept2RouterDeps): Router;
```

Plus on `stores/logs.ts`: `recordC2Result(userId: string, logId: string, c2ResultId: number, c2UserId: number): Promise<boolean>` (owner-scoped UPDATE, returns whether a row was written) — real store + fake, and this task also writes `tz` persistence: `recordTz(userId, logId, tz): Promise<void>` (owner-scoped, writes only when the column is null: `SET tz = $1 WHERE … AND tz IS NULL`).

- Route logic locked:
  - **Mint** (`POST /api/concept2/connect`, requireUser): unavailable → 403 `{error:"unavailable"}` BEFORE any store call (matrix: no attempt row). Validate `weightClass` ∈ H|L → 400 field-named. `deleteExpiredAttempts(ATTEMPT_MAX_AGE_MS)` + `deleteAttemptsFor(user)` (GC is the server's, no cron), `nonce = randomBytes(32).toString("hex")`, `createAttempt`, return `{authorizeUrl: client.authorizeUrl(nonce)}`.
  - **Callback** (`GET /api/concept2/callback`, NO requireUser — the nonce binds; GETs pass `originCheck` untouched, and the MOUNT ORDER in Task 7 is what keeps `requireUser` away from this route): responses are tiny inline HTML (`res.status(n).type("html").send(...)`), never JSON — this is a browser navigation. Order (matrix row 3, pinned): (1) if unavailable → consume/delete the attempt if `state` present, 403 page, NO exchange (stub asserts `exchangeCode` never called); (2) `state`/`code` missing → 400 page; (3) `consumeAttempt(state, ATTEMPT_MAX_AGE_MS)` null (unknown/expired/second use) → 400 page; (4) `exchangeCode` → failure → 502 page, attempt already consumed (retry restarts at mint — single-use preserved); (5) `fetchMe` → failure → 502 page; (6) `upsertLink` with attempt's userId + weightClass (clears `needsReauthAt`) → 200 "Linked. Return to the app." The app learns the outcome by re-fetching `GET /link` on foreground (PR1.5/PR2).
  - **Link GET** (requireUser): unavailable → `200 {available:false}` (200 on purpose — the matrix's one non-403 row). Else `{available:true, linked, weightClass?, c2UserId?, needsReauth: link.needsReauthAt !== null}` (`c2UserId` is the linked account's numeric id, for PR2's sent-state/View-on-Concept2 needs). Tokens never serialized.
  - **Link DELETE** (requireUser): unavailable → 403; else `deleteLink`, 204 — the ONE delete path, user-initiated (V5: no revocation endpoint; unlink is local). Flag-off later hides but deletes nothing (lifecycle rule).
  - **Upload** (`POST /api/concept2/results/:logId`, requireUser): unavailable → 403. UUID_RE fail → 404. `tzError(body.tz)` failure or `tz` absent → 400 field-named. `logs.get(user, id)` null → 404. Link null → 409 `{error:"unlinked"}`. `needsReauthAt` set → 409 `{error:"needs_reauth"}`. Already-sent short-circuit (deviation 5) → 200 `{resultId}`. `eligibilityFailure` → 422 `{error:"not_eligible", reason}`. **Persist tz** (deviation 2): if `row.tz === null`, `recordTz(...)` with the body's zone, and use it as `effectiveTz`; else `effectiveTz = row.tz`. **Token freshness inside `withLinkLock`:** locked re-read; if `expiresAt > now + TOKEN_REFRESH_SKEW_MS` → `{action:"none"}` with the stored access token (covers "another request already refreshed"); else `client.refreshTokens(link.refreshToken)` → ok → `{action:"store", tokens}` and use the new access token; grantDead → `{action:"flagReauth"}` and respond 409 `{error:"needs_reauth"}` (link + weight_class INTACT — deviation 3); retryable → `{action:"none"}` and respond 502 `{error:"c2_error"}`. Then `postResult(accessToken, buildC2Payload(row, link, effectiveTz))`: 201 → `recordC2Result(user, logId, resultId, link.c2UserId)` (on a false return — row deleted concurrently — respond 502 `{error:"c2_error"}`; RF25: this route owns the seam; the named recovery is re-send → C2 409 → duplicate, a state the UI has) → 200 `{resultId}`; duplicate → 409 `{error:"duplicate", c2ResultId}` (durably recorded with the locked link's identity BEFORE responding; if that write also fails, still respond duplicate); auth → ONE refresh-and-retry through the same locked path, then as above; c2_error → 502.
- [ ] **Step 1: Failing tests, grouped:** (a) availability matrix — one per cell class: mint 403 + store spy proves no attempt; callback mid-hop 403 + exchange-never-called + attempt gone + no link; link GET `{available:false}` for flag-off AND creds-missing separately; upload 403; linked-user-under-flag-off: link persists, GET says unavailable, upload 403. (b) mint happy path + bad weightClass. (c) callback: happy path writes the link for the ATTEMPT's user (no session cookie on the request — the binding is the nonce); second use of the same nonce → 400; expired (inject clock) → 400; exchange failure → 502 + nonce not reusable; relink after `needsReauthAt` set → flag cleared. (d) upload: every typed failure incl. `needs_reauth`; happy path asserting the EXACT payload the stub client received (the Task 5 fixture); legacy-row first send persists `tz` and a RETRY builds the SAME date string (the dedup-stability property deviation 2 exists for); refresh-on-expiry stores the rotated pair; grantDead sets `needsReauthAt` and does NOT delete (assert the link row and its weightClass survive); 5xx keeps the link AND leaves `needsReauthAt` null; already-sent short-circuit → 200 + client never called; resend-to-different-account allowed and overwrites the pair.
- [ ] **Step 2–4:** run/fail, implement, pass.
- [ ] **Step 5: Mutation probes (committed first), minimum set, record each failure:** delete the availability check on upload → matrix test red; reorder callback to exchange before consume → single-use test red; change `flagReauth` to `deleteLink` → the link-survives test red; move the `recordC2Result` call above the 201 check → duplicate test red (RF21's deciding-source rule); drop the `tz IS NULL` guard from `recordTz` → the retry-same-date test red; **one mutation ABOVE the seam** (RF21 #228): make the route pass the raw row to `buildC2Payload` bypassing `eligibilityFailure` → the not-eligible test AND Task 7's seam test must both go red.
- [ ] **Step 6: Commit** `feat(c2): concept2 router (mint/callback/link/upload, needs_reauth, availability gate)`.

### Task 7: Wiring + the RF24 seam test

**Files:**
- Modify: `server/app.ts` — `AppDeps` gains an OPTIONAL key `concept2?: { available: () => boolean; store: Concept2Store; client: C2Client } | null` (optional so the four existing hand-written `AppDeps` literals — `testDeps.ts:6`, `index.ts:109`, `auth/routes.test.ts:17`, `auth/testSignin.test.ts:15` — stay untouched; read it with `deps.concept2 ?? null`). **Mount `createConcept2Router` BESIDE `createAuthRouter` (after app.ts:64), BEFORE the `if (deps.stores)` block** — `routes/data.ts:722`'s `router.use("/api", requireUser)` 401s every `/api/*` request that enters the data router first, and the unauthenticated callback must never enter it (demonstrated at the premise pass; `createAuthRouter`'s own mount position is the precedent).
- Modify: `server/index.ts` (env: read the four vars, `available` closure, boot warn when flag on but creds missing or vice versa)
- Test: `server/routes/concept2.integration.test.ts`

**Interfaces:**
- Consumes: everything above.
- Produces: the deployed shape — every route live behind the gate. With `C2_LINK_ENABLED` unset on prod (the spec's safe end state): no new capability; `GET /api/logs` rows carry four always-null fields (`c2ResultId`, `c2UserId`, `completedAt`, `tz`); one new unauthenticated route (`GET /api/concept2/callback`) answers 403 dark rather than not existing.

- [ ] **Step 1: Failing integration test (the RF24 seam — one test starts UPSTREAM of the producer):** real Postgres + real stores + real router, stub ONLY `fetch` inside a real `createC2Client` (responses = committed transcripts verbatim). Flow: sign in (testDeps pattern) → `POST /api/logs` with the Task 5 fixture's full body (the REAL producer — steps, workSeconds 254.8, workMeters 935, restSeconds 120, restMeters 274, endedBy "finished", deviceName "PM5 432331249 Row", machineSummary {avgStrokeRate:24, workoutType:8}, completedAt, tz) → link via mint + **callback driven WITH NO SESSION COOKIE** (the mount-order regression test — it goes 401 if the router lands behind the data router) → `POST /api/concept2/results/:logId {tz}` → assert 200 `{resultId: 85557}` AND the stored row now carries `c2_result_id 85557` + `c2_user_id 2211` (fresh GET) AND the payload the fetch stub captured equals PR0's accepted payload field-for-field. Second test: stub 409 → row's c2 columns are durably recorded with the colliding id and the linked account. Third: attempt expiry/single-use through the real store (drive callback twice). Fourth: refresh path — link seeded expired, stub the token endpoint with the probe's 200 body then the results 201; assert the stored pair rotated.
- [ ] **Step 2–4:** run/fail, wire app.ts/index.ts, pass. Full suite: `pnpm test` (unit + client + integration, Docker up).
- [ ] **Step 5: Commit** `feat(c2): wire concept2 broker into app boot (dark behind C2_LINK_ENABLED)`.

### Task 8: dist:grep needle + red proof

**Files:**
- Modify: `scripts/dist-grep.sh` (add needle `C2_CLIENT_SECRET` with a header comment: server-only env name; the client bundle must never learn it)

- [ ] **Step 1:** Add the needle. `pnpm build && pnpm dist:grep` → OK.
- [ ] **Step 2: Red proof (RF12/RF21, both directions):** temporarily plant `const leak = "C2_CLIENT_SECRET";` in a client-reachable module (e.g. `src/main.tsx`), rebuild, run the gate → record its exact FAILED output; revert the plant (check `git status` first — RF22), rebuild, gate green again. The plant is never committed; the recorded red output goes in the task report and PR Record block.
- [ ] **Step 3: Commit** `chore(c2): dist-grep gate for the client secret's env name`.

### Task 9: Docs — handoff archive, spec corrections, records

**Files:**
- Create: `docs/design/handoffs/2026-08-31-concept2-connect/` board files — unzip `~/Desktop/connect-send-handoff.zip` (`Concept2 connect.dc.html`, `support.js`, its README) into the directory, reconciling with the README already committed there (read both first; keep the richer or merge)
- Modify: `docs/superpowers/specs/2026-08-31-concept2-logbook-design.md`:
  - §Architecture 6: REPLACE the `invalid_grant` sentence — C2 emits no such code; the measured rule is refresh 400/401 → `needs_reauth_at` (never delete; quote the probe body verbatim, cite `refresh-probe-2026-08-31.md`), 5xx/network → retryable.
  - §Stored shapes: `needs_reauth_at` on `concept2_links`; `redirect_kind` removed (deviation 1); the mapping table's fallback row → upload-time persisted tz (deviation 2).
  - §Architecture (callback): one line recording the account-injection residual for James — an attacker who mints on their own account and hands the URL to a victim links the victim's C2 account under the attacker's user; bounded today by `ALLOWED_EMAILS` (household allowlist); flagged SUSPECTED at the premise pass, decision owed before prod cutover.
  - Replace superseded claims in place, never append contradictions.
- Modify: `ROADMAP.md` Wave E block if PR1's row needs a status touch (hand-wrapped, never Prettier — root markdown is unformatted)

- [ ] **Step 1:** Archive + reconcile the handoff (discharges the memory note "archive into docs/design/handoffs/… on PR1's branch").
- [ ] **Step 2:** Spec corrections, replace-not-append.
- [ ] **Step 3: Commit** `docs(c2): archive Gate 0 handoff; fold measured token-endpoint facts into the spec`.

### Task 10: Gates and PR

- [ ] `pnpm lint && pnpm format:check && pnpm typecheck && pnpm test && pnpm test:coverage` — check PER-FILE coverage for every new file (RF2), not the aggregate.
- [ ] `pnpm build && pnpm dist:grep` (both green; red-proof already recorded).
- [ ] No `app/src/` diff: `git diff main --stat -- app/src/` prints nothing (constraint check, mechanical).
- [ ] Push, open PR. Body per house shape (~120 words above the fold, ≤6 bullets, Record block carries: mutation ledger with exact failure texts, the availability-matrix test census, the two committed probe files, deviations 1–6 + the premise-pass disposition table, the antagonist's ready-to-paste ledger entry (rides this PR — agents never write their own ledgers), the account-injection residual, and the RF24 seam test's claim WITH its five-part proof contract per RF26 — invariant, producer, observable, deciding mutation, strongest stateable conclusion).
- [ ] Premise pass: DONE (2026-08-31, REVISE → this rev 2). Per-task review during execution; PM final-PR gate (TRIAD) before merge is requested. James merges; nobody else.

## Self-review notes

- Spec coverage: migration ✓ (T1), mint/callback per Branch A ✓ (T6), link routes ✓ (T6), upload ✓ (T6), mapping module pure ✓ (T5), refresh logic ✓ (T3/T4/T6 — serialized, non-destructive), save-path additions through the POST validator ✓ (T2 — client half is PR2's, per the spec's own "no client change" end state), availability gate on every route + matrix tests ✓ (T6/T7), RF24 seam ✓ (T7), mutation probes incl. one above the seam ✓ (T6), grant-dead vs 5xx with both MEASURED stub responses ✓ (T4/T6), attempt expiry + single-use driven twice ✓ (T3/T7), dist:grep both directions ✓ (T8).
- Type consistency: `Concept2Store`/`withLinkLock`/`C2Client`/`buildC2Payload`/`eligibilityFailure`/`recordC2Result`/`recordTz` names used identically in T3–T7.
- Known open ruling that does NOT block PR1: the conditional weight-class ask (PR2 surface question — deviation 6).
