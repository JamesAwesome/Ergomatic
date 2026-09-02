# Wave E PR1.75a — the server half of the authenticated Concept2 link (implementation plan)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**REV 1** — written 2026-09-02 against design rev 5 at worktree head `0991046c` (branch `wave-e-pr175-app-bind`). Every `file:line` below was read in this worktree at that head. Implements ONLY **PR1.75a** as scoped in design §0; PR1.75b (native + client) is a separate later plan and nothing here touches `app/src/` or `app/ios/`.

**Goal:** Make a Concept2 link provably belong to the Ergomatic account that started it. Both completion paths (the web callback and a new native `POST /api/concept2/exchange`) authenticate the completing principal and refuse to exchange the code unless `attempt.userId === req.user.id`; every attempt records which surface minted it and can only complete on that surface; mint becomes one atomic upsert, one live attempt per user; the callback pages become the approved styled template with the Linked page naming both identities. Everything stays dark behind `C2_LINK_ENABLED`.

**Architecture:** (design §1-§7) `requireUser` learns which credential it resolved (`req.authVia`, request-lifetime) and logs both-present disagreements app-wide; the concept2 router derives `surface` from `authVia` at mint (never client-asserted), issues a per-surface `redirect_uri`, and completes through two identity ladders whose refusals happen BEFORE any store write and BEFORE any Concept2 call; the store's `consumeAttemptFor` puts the `(nonce, user_id, surface)` predicate IN the `DELETE ... RETURNING`, so a wrong principal consumes nothing by construction; migration 0020 adds `surface`, `UNIQUE(user_id)` on attempts and `UNIQUE(c2_user_id)` on links (D1). Native return (`ASWebAuthenticationSession`) is 1.75b's; after this PR a bearer mint returns a native redirect nothing on the device can receive yet — the design's named intentional interval.

**Tech Stack:** Express 5, Drizzle 0.45 + Postgres 18.4, Vitest 4 (+ supertest, @testcontainers/postgresql for `integration`), `cookie@2`. pnpm only, ESM only, server imports use `.js` extensions. Node 26 (`export PATH="$HOME/.local/share/nvm/v26.5.0/bin:$PATH"` first, per the agent briefing).

**Spec path:** `docs/superpowers/specs/2026-09-02-concept2-pr175-app-bind-design.md` (rev 5, APPROVED — James, 2026-09-02; D1 and D2 approved). Parent: `docs/superpowers/specs/2026-08-31-concept2-logbook-design.md`; ruling: `docs/superpowers/plans/2026-09-01-concept2-pr15-gate.md` §6. House shape copied from `docs/superpowers/plans/2026-08-31-concept2-pr1-server-broker.md`.

## Global Constraints

Each line below is quoted from the design (§ named) or from the standing rules (CLAUDE.md / `.claude/agent-briefing.md`), not invented here.

- **Worktree:** `/Users/james/projects/github/jamesawesome/Ergomatic-wt-c2pr175` (branch `wave-e-pr175-app-bind`). `git rev-parse --show-toplevel` before EVERY commit and confirm it prints that path (CLAUDE.md SDLC). Every shell write uses an absolute worktree path (RF20). Before relying on hooks: `pnpm install` at the worktree root AND in `app/`, then verify a deliberate lint error is blocked (CLAUDE.md SDLC).
- **Scope gate (design §0, verbatim):** "**Gate: zero files under `app/src/` or `app/ios/`.**" Mechanical check before the PR: `git diff main --stat -- app/src app/ios` prints nothing; `gh pr view <n> --json files` shows no such path. No `pnpm e2e` is triggered (RF1's trigger is `app/src/`); the PR body says so.
- **Risk class (design header, verbatim):** "TRIAD — AUTH (the principal-binding routes) + a STORED SHAPE (`surface` column, `UNIQUE(user_id)`, **migration 0020** — 0019 is Phase JR's on main)." Full cycle; James merges; PM final-PR gate. **Antagonist: SKIP, spoken** (design §0, verbatim): "the full TRIAD pass covered every server invariant here and the split adds none (§1's narrowing is a narrowing)." **Walk: none (CI-provable)** (design §0).
- **TDD + self-mutation:** failing test first, every task. "Every NEW assertion gets a mutation probe, run against a COMMITTED tree (RF21/RF22 — commit the real change before probing; revert probes with an explicit `git status` check first). Reports record the mutation and the exact failure text." (PR1 plan, Global Constraints — same rule, CLAUDE.md RF21/RF22.)
- **Secrets (PR1 plan, verbatim, still binding):** "Never log, serialize, or return `access_token`/`refresh_token`/`client_secret` in any response, error message, or test fixture output." Extended by design §Testing (d): the `AUTH_VIA_LOG` instrument and the `auth_disagreement` line log "never a token value".
- **Intentional interval (design §0, verbatim, goes in the PR body):** "after 1.75a, mint returns `haus.waffle.ergomatic://oauth/callback` to any bearer caller and nothing on the device can receive it yet. Harmless (flag off; the only native consumer, `Concept2LinkProbe`, never calls mint) and deliberate."
- **Migrations (agent briefing):** "Drizzle migrations apply by TIMESTAMP, not journal order … Check open PRs for a competing index before you generate one." Recorded in Task 1 at write time. A migration rewritten in place before it ships changes its hash; reset any stale dev volume with `docker compose -p <stack> down -v` rather than debugging the mismatch.
- **Typed-lint ratchet:** no new suppressions. `pnpm lint`, `pnpm typecheck`, `pnpm format:check`, `pnpm test --project unit` per task; `integration` needs Docker.
- **Test invocation (two footguns, CLAUDE.md + briefing):** `pnpm test --project unit -- <pattern>` SILENTLY RUNS THE FULL SUITE (pnpm swallows the scoped flag), and a bare `vitest run` collides Node 26's webStorage with jsdom. For ONE file use the exact form below, which sets the flag and names the project explicitly (both target projects here are `environment: "node"`, `app/vitest.config.ts:8-16,33-39`, so jsdom is not in play, but the flag is kept so the command is safe to copy into a client file later):
  `cd /Users/james/projects/github/jamesawesome/Ergomatic-wt-c2pr175/app && NODE_OPTIONS=--no-experimental-webstorage pnpm exec vitest run --project unit <file>`
  and for integration files `--project integration <file>` (Docker running). Read BOTH summary lines ("Test Files" and "Tests") — a file that fails to load collects zero tests and still reads green on one of them.
- **Comment style:** constraints, not narration; cite the design § or the file:line that would falsify the claim. No em-dashes in user-facing strings (house style); the copy table in Task 5 is verbatim from the design.
- **Records:** anything with a life after merge goes in ROADMAP, a ledger, DEVIATIONS or the spec at the moment it is found (RF14), never only in the PR body.

## Plan deviations / observations (RF10 — the design against the code as read)

1. **`routes/data.ts:820-826` carries no Concept2 phrase.** The design's reconciliation list (exit criterion 5) names it; what sits there is the generic "Scoped to /api" comment on `router.use("/api", requireUser)` (`data.ts:819-826`), which stays correct. The "deliberately unauthenticated" sentence the census is after lives at **`app/server/app.ts:93-105`** (the mount comment: "the concept2 callback route is deliberately unauthenticated today") and at `routes/concept2.ts:13-21`. Task 9 reconciles those two; `data.ts` is not touched.
2. **ROADMAP's PR1.5 checkbox is already ticked.** Design §0 lists "ROADMAP's stale PR1.5 checkbox" among 1.75a's files; `ROADMAP.md:989` already reads `- [x] **PR1.5 — the native link flow**` (landed by commit `4e19c69e`, "ROADMAP ticks PR1.5"). Nothing to tick; the PR1.75 row (`ROADMAP.md:999-1020`) is what Task 9 edits.
3. **Concept2 `username` — MEASURED (controller, 2026-09-02, live `GET /api/users/me` on log-dev with the desk session): the field is present and a string.** Field names observed: age_restricted, country, dob, email, email_permission, first_name, gender, health_data_permission, id, last_name, logbook_privacy, max_heart_rate, profile_image, roles, username, weight. Task 4 still reads it as OPTIONAL (`username: string | null`) and Task 6 falls back to `#<c2UserId>` if ever null, so the page can never render "undefined" — a null-guard, not a copy deviation. The `fetchMe` comment records this measurement (PRIMARY: live response, 2026-09-02) instead of a documentation quote.
4. **`consumeAttempt` retires too, not only `deleteAttemptsFor`.** After the two ladders land, `store.consumeAttempt` (`stores/concept2.ts:184-199`, fake `:988-998`) has zero callers; keeping it would leave an unauthenticated consume primitive in the store, the exact class design §5 step 1 deletes from the route. The design's test bullet "`consumeAttempt` returns `surface`" is satisfied by `peekAttempt` returning `surface` and `consumeAttemptFor` taking it as a predicate. Its two integration tests (`concept2.integration.test.ts:338-371`) are rewritten against `consumeAttemptFor`.
5. **The callback's `ambiguous_auth` refusal answers JSON, not one of the approved pages.** Design §Testing wants `400 ambiguous_auth` "on mint, callback and exchange", but the Gate 0 page set (design §7) has no such page and this plan invents no copy. Only a non-browser caller can put an `Authorization: Bearer` header on a top-level GET, so `res.status(400).json({error:"ambiguous_auth"})` is the honest response there; the seven HTML pages are untouched.
6. **Where the ambiguity check sits on the JSON routes:** as a per-route middleware immediately after `requireUser` (before availability), i.e. it behaves like `requireUser`'s own 401 — an auth-shape refusal that precedes the capability gate. Design §6's numbered ladder starts at availability and does not place this check; §1(b) says only "checked in the route module". Consequence, stated: an ambiguous request gets 400 even while the flag is off.
7. **`requireUser` now performs a second session lookup whenever BOTH credentials are present** (the only way to detect disagreement, design §1(a)). Cost: one extra `resolveSession` per both-present request, app-wide. Whether native requests ever carry a cookie is UNMEASURED (design §Research, Capacitor line) — the walk instrument this PR adds is what measures it. `resolveSession` may also extend the cookie session's expiry as a side effect (`sessions.ts:54-61`); no `Set-Cookie` is emitted for it (bearer won).
8. **The concept2 store has no `describeStoreContracts` suite.** TESTING.md §5: "a new store method ships with a new contract case in the same PR." `storeContracts.ts` has no concept2 suite (grep: the only concept2 mention is a logs comment at `:1009`); PR1 shipped the store with a real-Postgres integration file plus a fake exercised by route tests instead. This plan follows PR1's shape (Task 2 integration tests + fake mirrored by Task 6's route tests) and does NOT add the contract suite; the gap is named here and in the PR Record for the PM to size, not hidden.
9. **"Sign in to Ergomatic here" (401/403 copy) renders as PLAIN TEXT — RULED (controller, 2026-09-02):** the approved Gate 0 render shows no anchor, and the template's constraint is no anchors and no subresources at all; a same-origin link is a PR2 Gate 0 amendment if wanted. Task 5 emits `SIGN_IN_HERE = "here"`.
10. **`UNIQUE(c2_user_id)` fails loudly on any database where two links already share a Concept2 account.** Prod has zero `concept2_links` rows (the flag has never been on: `index.ts:122-123` computes availability from `C2_LINK_ENABLED`, and ROADMAP's C2 register row records prod flag-off), so 0020 cannot fail there; a dev volume that did accumulate such rows must be reset (`down -v`), not patched.
11. **Contrast, computed (RF6):** ink `#1c1a17` on ground `#f6f3ec` = **15.67:1**, on panel `#fffdf8` = **17.08:1**; label `#5f5a50` on ground = **6.18:1**, on panel = **6.74:1**; accent `#b5341f` on ground = 5.45:1 (used only as a rule, never text). The design states 15.9:1 and 5.8:1; the recomputed figures differ slightly and both pass 4.5:1. Formula: WCAG relative luminance, run in Task 5 step 5.
12. **The design's 15-phrase census cannot reach "0 or one historical hit" for every phrase within 1.75a alone.** Several phrases live in `app/src` (1.75b's), in the two agent ledgers (never edited), in the parent spec's Branch-B contingency text (design §4: "Branch B stays recorded as the contingency"), and in one merged plan's history (PR1's plan, which by its own top note is never rewritten). Task 9 states the expected count PER PHRASE after 1.75a with every residual hit named and owned, and the census command excludes the ledgers and the two plan files that quote the phrases (this one and the design's own list line).
13. **Which 400 page a nonce-shaped web-callback failure gets:** design §5 pins the STATUS (400) for unknown state, wrong surface, lost race and expired, and the copy table has exactly two 400 pages, `Incomplete` (parameters) and `Expired`. This plan uses `Incomplete` only for missing `state`/`code` and `Expired` for every nonce-shaped refusal ("This link has expired or was already used" is true of all four from the rower's seat).
14. **`Concept2RouterDeps` grows two fields** (`sessions: SessionStore` for the route-local cookie resolver and the disagreement re-check; `webRedirectUri: string`), `C2ClientConfig` loses `redirectUri`, and `AppDeps.concept2` gains `webRedirectUri`. Callers: `app.ts:106-117`, `index.ts:135-145`, `routes/concept2.test.ts:80-113`, `routes/concept2.integration.test.ts:184-219`, `concept2/client.test.ts:14-19`.

## Migration-index check (recorded at write time, 2026-09-02)

- `ls app/drizzle` → highest is `0019_happy_virginia_dare.sql`; journal (`app/drizzle/meta/_journal.json`) ends at `idx: 19`; snapshots run to `meta/0019_snapshot.json`.
- `gh pr list --json number,headRefName,files` → one open PR, **#265 `jr-close`**, with **zero `app/drizzle` files**. No competing claimant for index 0020 at write time. Task 1 re-runs both commands before generating and before the PR opens (the 0019 precedent, `0019_happy_virginia_dare.sql:18-22`, was regenerated three times for exactly this reason).

## Wire contract summary (what PR2 and 1.75b build against)

| route | auth | success | failures |
| --- | --- | --- | --- |
| `POST /api/concept2/connect` `{weightClass, linkClient?}` | user (`requireUser`) | `200 {authorizeUrl, state}` — `surface` = bearer→`native`, cookie→`web`; native `redirect_uri` `haus.waffle.ergomatic://oauth/callback`, web `new URL("/api/concept2/callback", SITE_URL)` | 401; **400 `{error:"ambiguous_auth"}`** (bearer and cookie resolve to different users); 403 `{error:"unavailable"}`; 400 field-named; **409 `{error:"update_required"}`** (bearer mint without `linkClient:"webauth-1"`); 500 (second nonce collision) |
| `GET /api/concept2/callback?code&state` | route-local `erg_session` COOKIE resolver (never `requireUser`) | 200 Linked page naming Concept2 username + Ergomatic email | 403 Unavailable (consumes nothing); 400 Incomplete; **401 Not signed in**; 400 Expired (unknown / wrong surface / lost race / stale); **403 Wrong account** (not consumed, no exchange); **409 Already linked** (D1); 502 Failed; 400 JSON `ambiguous_auth`. Every response: `Referrer-Policy: no-referrer` |
| **`POST /api/concept2/exchange` `{code, state}`** | user, bearer only | `200 {linked:true, c2UserId, weightClass}` | 401; 400 `ambiguous_auth`; 403 `unavailable`; 400 field-named; 400 `wrong_surface` (cookie caller, or a web-minted state); 400 `invalid_state`; 403 `principal_mismatch`; 400 `expired`; 502 `c2_error`; 409 `already_linked_elsewhere` |
| `GET/DELETE /link`, `POST /results/:logId` | unchanged | unchanged | + 400 `ambiguous_auth` (the route-level refusal applies to every `/api/concept2/*` route) |

PR2 keys on `body.error`, never on status alone (PR1 plan's rule; 409 now carries a third meaning, `update_required`).

---

### Task 1: Migration 0020 — `surface`, `UNIQUE(user_id)`, `UNIQUE(c2_user_id)`, attempts wiped

**Files:**
- Modify: `app/server/db/schema.ts` (`:467-525`, the Concept2 section)
- Create: `app/drizzle/0020_<name>.sql` + `app/drizzle/meta/0020_snapshot.json` + journal entry, via `pnpm db:generate`, then the SQL hand-edited (the `0019` precedent: a generated file carrying a hand-written header, `0019_happy_virginia_dare.sql:1-22`)
- Test: `app/server/db/schema.integration.test.ts` (append a `migration 0020` describe after the 0018 block at `:1264-1470`, same pre-folder harness)

**Interfaces:**
- Produces: `linkSurfaceEnum` (schema export, `pgEnum("link_surface", ["native","web"])`), `concept2AuthAttempts.surface` (NOT NULL DEFAULT 'web'), unique constraints `concept2_auth_attempts_user_id_unique` and `concept2_links_c2_user_id_unique` (drizzle-kit's `<table>_<column>_unique` naming).

- [ ] **Step 1: Failing integration test.** Append to `schema.integration.test.ts` (after the 0018 describe's closing `});`):

```ts
// Wave E PR1.75a (2026-09-02-concept2-pr175-app-bind-design.md §2, TRIAD):
// migration 0020 — `concept2_auth_attempts` gains `surface` (enum
// link_surface, NOT NULL DEFAULT 'web') and UNIQUE(user_id); `concept2_links`
// gains UNIQUE(c2_user_id) (D1, approved); every pre-existing attempt row is
// DELETED first (15-minute disposable rows — an in-flight link at deploy
// restarts at mint, already the retry story). Same pre/post-migration
// harness as the 0018 block above: rows are seeded against a folder capped
// at 0019, then the real folder applies 0020.
describe("migration 0020: attempts surface + UNIQUE(user_id), links UNIQUE(c2_user_id), attempts wiped", () => {
  let container: StartedPostgreSqlContainer;
  let pool: pg.Pool;
  let db: Db;
  let tempDir: string;
  let seededUserId: string;

  const PRE_0020_TAGS = [
    "0000_skinny_silver_fox",
    "0001_tan_thunderball",
    "0002_rare_khan",
    "0003_spicy_firedrake",
    "0004_slippery_starjammers",
    "0005_fine_radioactive_man",
    "0006_windy_wendell_vaughn",
    "0007_shallow_kang",
    "0008_strip_wu_steps",
    "0009_brief_kingpin",
    "0010_familiar_maddog",
    "0011_futuristic_roxanne_simpson",
    "0012_amused_wild_child",
    "0013_melodic_sphinx",
    "0014_graceful_microchip",
    "0015_gorgeous_black_queen",
    "0016_fancy_quentin_quire",
    "0017_fair_whizzer",
    "0018_natural_chronomancer",
    "0019_happy_virginia_dare",
  ];

  beforeAll(async () => {
    container = await new PostgreSqlContainer("postgres:18.4").start();
    ({ pool, db } = createDb(container.getConnectionUri()));

    tempDir = await mkdtemp(path.join(tmpdir(), "drizzle-pre-0020-"));
    await mkdir(path.join(tempDir, "meta"));
    for (const [i, tag] of PRE_0020_TAGS.entries()) {
      const idx = String(i).padStart(4, "0");
      await copyFile(
        path.join("drizzle", `${tag}.sql`),
        path.join(tempDir, `${tag}.sql`),
      );
      await copyFile(
        path.join("drizzle", "meta", `${idx}_snapshot.json`),
        path.join(tempDir, "meta", `${idx}_snapshot.json`),
      );
    }
    const journal = JSON.parse(
      await readFile(path.join("drizzle", "meta", "_journal.json"), "utf-8"),
    ) as { entries: { idx: number }[] };
    await writeFile(
      path.join(tempDir, "meta", "_journal.json"),
      JSON.stringify({
        ...journal,
        entries: journal.entries.filter((e) => e.idx <= 19),
      }),
    );
    await migrate(db, { migrationsFolder: tempDir });

    const [u] = await db
      .insert(users)
      .values({
        googleSub: "pre-0020-user",
        email: "pre-0020@migrate.test",
        name: "Pre 0020",
      })
      .returning();
    seededUserId = u.id;

    // TWO live attempts for ONE user, seeded against the pre-0020 schema —
    // legal there (no UNIQUE(user_id) yet, the exact "raceable" state the
    // ruling named). Raw SQL because the typed builder already declares
    // `surface`, which this table does not have yet.
    await db.execute(
      sql`insert into "concept2_auth_attempts" ("nonce", "user_id", "weight_class")
          values ('pre-0020-a', ${u.id}, 'H'), ('pre-0020-b', ${u.id}, 'L')`,
    );

    await migrate(db, { migrationsFolder: "drizzle" });
  });

  afterAll(async () => {
    await pool.end().catch(() => {});
    await container.stop().catch(() => {});
  });

  it("wipes every pre-existing attempt (the 15-minute rows restart at mint)", async () => {
    const rows = await db.execute(
      sql`select count(*)::int as n from concept2_auth_attempts`,
    );
    expect((rows.rows[0] as { n: number }).n).toBe(0);
  });

  it("adds surface as NOT NULL DEFAULT 'web' — a rollback-image insert without surface still succeeds and reads 'web'", async () => {
    // The PR1.5 image's createAttempt inserts no `surface` (design §2's
    // rollback argument); this raw insert IS that image's statement.
    await pool.query(
      `insert into "concept2_auth_attempts" ("nonce", "user_id", "weight_class") values ('rollback-shape', $1, 'H')`,
      [seededUserId],
    );
    const [row] = await db
      .select({ surface: concept2AuthAttempts.surface })
      .from(concept2AuthAttempts)
      .where(eq(concept2AuthAttempts.nonce, "rollback-shape"));
    expect(row.surface).toBe("web");
    await db
      .delete(concept2AuthAttempts)
      .where(eq(concept2AuthAttempts.nonce, "rollback-shape"));
  });

  it("rejects a surface value outside the enum at the DB layer", async () => {
    await expect(
      pool.query(
        `insert into "concept2_auth_attempts" ("nonce", "user_id", "weight_class", "surface") values ('bad-surface', $1, 'H', 'ios')`,
        [seededUserId],
      ),
    ).rejects.toThrow(/invalid input value for enum link_surface/);
  });

  it("enforces one live attempt per user: a second row for the same user_id is a unique violation", async () => {
    await pool.query(
      `insert into "concept2_auth_attempts" ("nonce", "user_id", "weight_class", "surface") values ('uniq-1', $1, 'H', 'web')`,
      [seededUserId],
    );
    await expect(
      pool.query(
        `insert into "concept2_auth_attempts" ("nonce", "user_id", "weight_class", "surface") values ('uniq-2', $1, 'H', 'web')`,
        [seededUserId],
      ),
    ).rejects.toThrow(/concept2_auth_attempts_user_id_unique/);
    await db
      .delete(concept2AuthAttempts)
      .where(eq(concept2AuthAttempts.nonce, "uniq-1"));
  });

  it("D1: two Ergomatic users cannot hold the same Concept2 account (UNIQUE c2_user_id)", async () => {
    const [other] = await db
      .insert(users)
      .values({
        googleSub: "post-0020-other",
        email: "post-0020-other@migrate.test",
        name: "Other",
      })
      .returning();
    await db.insert(concept2Links).values({
      userId: seededUserId,
      c2UserId: 2211,
      accessToken: "at",
      refreshToken: "rt",
      expiresAt: new Date("2026-10-01T00:00:00Z"),
      weightClass: "H",
    });
    await expect(
      db.insert(concept2Links).values({
        userId: other.id,
        c2UserId: 2211,
        accessToken: "at2",
        refreshToken: "rt2",
        expiresAt: new Date("2026-10-01T00:00:00Z"),
        weightClass: "L",
      }),
    ).rejects.toThrow(/concept2_links_c2_user_id_unique/);
  });
});
```

- [ ] **Step 2: Run it** — `cd /Users/james/projects/github/jamesawesome/Ergomatic-wt-c2pr175/app && NODE_OPTIONS=--no-experimental-webstorage pnpm exec vitest run --project integration server/db/schema.integration.test.ts` → the new describe fails (`surface` column absent; no unique violation; attempts not wiped). Note: it fails at TYPECHECK first (`concept2AuthAttempts.surface` does not exist) — that is the expected red for a schema task.

- [ ] **Step 3: Schema.** Replace `schema.ts:467-525` (from `// --- Wave E PR1: Concept2 stored shapes` through the closing `});` of `concept2AuthAttempts`) with:

```ts
// --- Wave E PR1 / PR1.75a: Concept2 stored shapes ------------------------

// Wave E PR1 (2026-08-31-concept2-logbook-design.md §Stored shapes, TRIAD).
export const weightClassEnum = pgEnum("weight_class", ["H", "L"]);

// Wave E PR1.75a (2026-09-02-concept2-pr175-app-bind-design.md §1-§3, TRIAD):
// which surface MINTED an attempt, derived server-side from which credential
// `requireUser` resolved (bearer -> native, cookie -> web) — never a
// client-asserted value, so there is nothing for an attacker to choose.
export const linkSurfaceEnum = pgEnum("link_surface", ["native", "web"]);

// One row per linked user. Tokens are plain columns behind the same trust
// boundary every credential this app holds already lives behind (spec:
// at-rest encryption with the key in the same process env is a lock taped
// to its own key — attacked at the anchor; held). Tokens are never
// serialized to any client response — `routes/concept2.ts` returns
// {available, linked, weightClass, c2UserId, needsReauth}, the account's
// numeric id but never a token (PR2's sent-state/View-on-Concept2 needs).
export const concept2Links = pgTable("concept2_links", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  // PR1.75a D1 (APPROVED, James 2026-09-02): one Concept2 account can be
  // linked to at most ONE Ergomatic user per database. A detective control
  // against RFC 9700 §4.5 code injection (the common case: the victim is
  // already linked) and against two Ergomatic accounts writing one
  // logbook. Cost, named in the design: a shared household Concept2 login
  // can never sit behind two Ergomatic accounts. `upsertLink` maps the
  // violation to `Concept2LinkConflictError`; both completion routes answer
  // 409.
  c2UserId: integer("c2_user_id").notNull().unique(),
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
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// Single-use, 15-minute link attempts. The nonce (`state`) CORRELATES a
// completion request to its mint attempt; the completing PRINCIPAL is
// authenticated separately on both completion routes (a cookie session on
// the web callback, a bearer on `POST /exchange`) and must equal `user_id`
// BEFORE the row is consumed and BEFORE any Concept2 call — PR1.75a,
// design §5/§6. `surface` says which route may complete the row; the
// `(nonce, user_id, surface)` predicate lives IN `consumeAttemptFor`'s
// DELETE statement (stores/concept2.ts), so a wrong principal or wrong
// surface consumes nothing by construction.
//
// UNIQUE(user_id): one live attempt per user, ENFORCED — mint is one
// `INSERT ... ON CONFLICT (user_id) DO UPDATE` (design §2; PROVEN on real
// Postgres that two concurrent mints serialize on this index and exactly
// one row survives, where the old delete-then-insert yielded two).
//
// Migration 0020 rollback, both halves (design §2): (1) `surface` carries
// DEFAULT 'web' for ROLLBACK, not for writes — the PR1.5 image's
// `createAttempt` inserts no `surface`, and a plain NOT NULL would make
// every mint 500 after a rollback; new code always writes it explicitly.
// (2) The surviving UNIQUE(user_id) turns the rollback image's concurrent
// double-mint (delete-then-insert) into a unique violation (500) rather
// than two rows — accepted: a rare self-race, strictly smaller blast radius
// than the unbounded attempts the index prevents.
export const concept2AuthAttempts = pgTable("concept2_auth_attempts", {
  nonce: text("nonce").primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" })
    .unique(),
  weightClass: weightClassEnum("weight_class").notNull(),
  surface: linkSurfaceEnum("surface").notNull().default("web"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
```

- [ ] **Step 4: Generate, then hand-edit.** In `app/`: re-run `ls drizzle | tail -1` and `gh pr list --json number,headRefName,files --jq '.[] | {number, files: [.files[].path | select(startswith("app/drizzle"))]}'` (record both outputs in the task report), then `pnpm db:generate`. Inspect the generated `drizzle/0020_<name>.sql`; it is expected to contain exactly these four statements (verify by reading it, never by trusting this list):

```sql
CREATE TYPE "public"."link_surface" AS ENUM('native', 'web');--> statement-breakpoint
ALTER TABLE "concept2_auth_attempts" ADD COLUMN "surface" "link_surface" DEFAULT 'web' NOT NULL;--> statement-breakpoint
ALTER TABLE "concept2_auth_attempts" ADD CONSTRAINT "concept2_auth_attempts_user_id_unique" UNIQUE("user_id");--> statement-breakpoint
ALTER TABLE "concept2_links" ADD CONSTRAINT "concept2_links_c2_user_id_unique" UNIQUE("c2_user_id");
```

Then hand-edit the file so it reads (header comment + the DELETE prepended; the generated statements kept verbatim below it — the DELETE MUST precede the `UNIQUE("user_id")` add, or a database with two live attempts for one user fails the migration):

```sql
-- Wave E PR1.75a (docs/superpowers/specs/2026-09-02-concept2-pr175-app-bind-design.md
-- §2, TRIAD — stored shape). Three additions, one wipe:
--   * every existing `concept2_auth_attempts` row is DELETED first — they are
--     15-minute disposable rows; an in-flight link at deploy restarts at mint,
--     which is already the retry story. The wipe MUST precede the
--     UNIQUE(user_id) below (a pre-0020 DB can legally hold two rows for one
--     user — the "raceable" state the PR1.5 ruling named).
--   * `surface` (enum link_surface: native | web), NOT NULL DEFAULT 'web'.
--     The default exists for ROLLBACK, not for writes: the PR1.5 image's
--     createAttempt inserts no surface, and a plain NOT NULL would 500 every
--     mint after a rollback. New code always writes surface explicitly.
--   * UNIQUE(user_id) on attempts — one live attempt per user, ENFORCED.
--     Rollback second half: this constraint survives a rollback and turns the
--     old image's concurrent delete-then-insert double-mint into a unique
--     violation (500) instead of two rows — accepted, a rare self-race.
--   * UNIQUE(c2_user_id) on concept2_links (D1, approved 2026-09-02): one
--     Concept2 account per Ergomatic user per database. Fails loudly on any
--     DB already holding two links to one account; prod has zero link rows
--     (the flag has never been on), dev volumes reset with `down -v`.
-- Index 0020: 0019 is Phase JR's (on main). `gh pr list` showed no other
-- drizzle claimant when this was generated (2026-09-02, PR #265 only, no
-- drizzle files) — re-check before merging rather than trusting this line.
DELETE FROM "concept2_auth_attempts";--> statement-breakpoint
CREATE TYPE "public"."link_surface" AS ENUM('native', 'web');--> statement-breakpoint
ALTER TABLE "concept2_auth_attempts" ADD COLUMN "surface" "link_surface" DEFAULT 'web' NOT NULL;--> statement-breakpoint
ALTER TABLE "concept2_auth_attempts" ADD CONSTRAINT "concept2_auth_attempts_user_id_unique" UNIQUE("user_id");--> statement-breakpoint
ALTER TABLE "concept2_links" ADD CONSTRAINT "concept2_links_c2_user_id_unique" UNIQUE("c2_user_id");
```

Journal/snapshot handling (PR1's plan, Task 1 step 4, and the 0018/0019 precedent): `pnpm db:generate` writes the `meta/_journal.json` entry (`idx: 20`, its own `when` timestamp) and `meta/0020_snapshot.json`; both are committed AS GENERATED — the snapshot describes the schema, which the hand-added DELETE does not change, and the journal's `when` is what orders application. Never edit either by hand. If the index has to move later (a competing PR merges first), delete all three generated artifacts and regenerate off new main — never a journal merge (agent briefing).

- [ ] **Step 5: Run** the integration file again → the 0020 describe passes AND the existing 0018 describe still passes (its `PRE_0018_TAGS` folder is unaffected). Then `pnpm lint && pnpm typecheck && pnpm format:check` (typecheck will now fail in `stores/concept2.ts`? No: `createAttempt` inserts without `surface`, which has a default, so it compiles; the store changes are Task 2). Also run `NODE_OPTIONS=--no-experimental-webstorage pnpm exec vitest run --project integration server/stores/concept2.integration.test.ts` — the `deleteAttemptsFor` test at `:406-440` now FAILS (three rows for two users can no longer be inserted: two for `fresh.id` violate the new unique). That red is expected and is Task 2's first failing test; do not "fix" it here.
- [ ] **Step 6: Mutation probe (after commit):** remove the `DELETE FROM` line → "wipes every pre-existing attempt" fails (`expected 0, received 2`) AND the migration itself fails on `UNIQUE("user_id")` (`could not create unique index` / duplicate key) — record both texts; restore (`git status` first, RF22).
- [ ] **Step 7: Commit** `feat(c2): migration 0020 — attempts surface + UNIQUE(user_id), links UNIQUE(c2_user_id), attempts wiped (PR1.75a)`. Before it: `git rev-parse --show-toplevel`.

### Task 2: Store — atomic upsert mint, `peekAttempt`, `consumeAttemptFor`, D1 conflict; fake mirrors

**Files:**
- Modify: `app/server/stores/concept2.ts` (full file replaced below)
- Modify: `app/server/testing/fakes.ts` (`:34-38` imports, `:883-1015` `makeFakeConcept2Store`)
- Test: `app/server/stores/concept2.integration.test.ts` (replace the describe at `:337-441`; extend `:443-471`)

**Interfaces:**

```ts
export type LinkSurface = "native" | "web";
export class AttemptNonceCollisionError extends Error {}   // new nonce hit another row's PK
export class Concept2LinkConflictError extends Error {}    // D1: c2_user_id held by a different user
export interface NewConcept2Attempt { nonce: string; userId: string; weightClass: WeightClass; surface: LinkSurface }
export interface PeekedConcept2Attempt { userId: string; weightClass: WeightClass; surface: LinkSurface }
export interface ConsumedConcept2Attempt { weightClass: WeightClass; fresh: boolean }
createAttempt(a): Promise<void>                       // INSERT ... ON CONFLICT (user_id) DO UPDATE
peekAttempt(nonce): Promise<PeekedConcept2Attempt | null>   // advisory, no delete, no freshness
consumeAttemptFor(nonce, userId, surface, maxAgeMs): Promise<ConsumedConcept2Attempt | null>
// RETIRED: consumeAttempt, deleteAttemptsFor. KEPT: deleteExpiredAttempts, upsertLink (now throws Concept2LinkConflictError), everything else.
```

- [ ] **Step 1: Failing integration tests.** Replace `concept2.integration.test.ts:337-441` (the whole `createAttempt / consumeAttempt / deleteExpiredAttempts / deleteAttemptsFor` describe) with the block below, and change the import at `:11` to `import { createConcept2Store, AttemptNonceCollisionError, Concept2LinkConflictError, type Concept2Link } from "./concept2.js";`. Also update the cascade test's `createAttempt` call (`:453-457`) to pass `surface: "web"`.

```ts
  describe("createAttempt (atomic upsert) / peekAttempt / consumeAttemptFor / deleteExpiredAttempts", () => {
    const attemptCount = async (userId: string) => {
      const rows = await db.execute(
        sql`select count(*)::int as n from concept2_auth_attempts where user_id = ${userId}`,
      );
      return (rows.rows[0] as { n: number }).n;
    };

    it("a second mint for the same user REPLACES the first: one row, the new nonce, the old nonce gone", async () => {
      const store = createConcept2Store(db);
      const fresh = await createUserStore(db).createUser({
        googleSub: "c2-store-user-replace",
        email: "replace@c2-store.test",
        name: "RP",
      });
      await store.createAttempt({
        nonce: "replace-1",
        userId: fresh.id,
        weightClass: "H",
        surface: "web",
      });
      await store.createAttempt({
        nonce: "replace-2",
        userId: fresh.id,
        weightClass: "L",
        surface: "native",
      });
      expect(await attemptCount(fresh.id)).toBe(1);
      expect(await store.peekAttempt("replace-1")).toBeNull();
      expect(await store.peekAttempt("replace-2")).toStrictEqual({
        userId: fresh.id,
        weightClass: "L",
        surface: "native",
      });
    });

    // Design §2 / exit criterion 3: two CONCURRENT mints serialize on the
    // unique index and exactly one row survives. The biting mutation is on
    // the STATEMENT (delete + plain insert), never on the index alone —
    // dropping the index only breaks ON CONFLICT's parse.
    it("two CONCURRENT mints for one user leave exactly one live attempt", async () => {
      const store = createConcept2Store(db);
      const fresh = await createUserStore(db).createUser({
        googleSub: "c2-store-user-concurrent",
        email: "concurrent@c2-store.test",
        name: "CC",
      });
      await Promise.all([
        store.createAttempt({
          nonce: "concurrent-a",
          userId: fresh.id,
          weightClass: "H",
          surface: "web",
        }),
        store.createAttempt({
          nonce: "concurrent-b",
          userId: fresh.id,
          weightClass: "H",
          surface: "web",
        }),
      ]);
      expect(await attemptCount(fresh.id)).toBe(1);
    });

    it("a nonce colliding with ANOTHER user's row throws AttemptNonceCollisionError and leaves that row intact", async () => {
      const store = createConcept2Store(db);
      const owner = await createUserStore(db).createUser({
        googleSub: "c2-store-user-collide-owner",
        email: "collide-owner@c2-store.test",
        name: "CO",
      });
      const other = await createUserStore(db).createUser({
        googleSub: "c2-store-user-collide-other",
        email: "collide-other@c2-store.test",
        name: "CX",
      });
      await store.createAttempt({
        nonce: "shared-nonce",
        userId: owner.id,
        weightClass: "H",
        surface: "web",
      });
      await expect(
        store.createAttempt({
          nonce: "shared-nonce",
          userId: other.id,
          weightClass: "L",
          surface: "native",
        }),
      ).rejects.toBeInstanceOf(AttemptNonceCollisionError);
      expect(await store.peekAttempt("shared-nonce")).toStrictEqual({
        userId: owner.id,
        weightClass: "H",
        surface: "web",
      });
      expect(await attemptCount(other.id)).toBe(0);
    });

    it("peekAttempt is advisory: it returns {userId, weightClass, surface} and does NOT delete", async () => {
      const store = createConcept2Store(db);
      await store.createAttempt({
        nonce: "peek-me",
        userId: userA,
        weightClass: "L",
        surface: "native",
      });
      expect(await store.peekAttempt("peek-me")).toStrictEqual({
        userId: userA,
        weightClass: "L",
        surface: "native",
      });
      expect(await store.peekAttempt("peek-me")).not.toBeNull();
      expect(await store.peekAttempt("never-minted")).toBeNull();
    });

    it("consumeAttemptFor with the WRONG user consumes nothing (returns null, row survives)", async () => {
      const store = createConcept2Store(db);
      await store.createAttempt({
        nonce: "wrong-user",
        userId: userA,
        weightClass: "H",
        surface: "web",
      });
      expect(
        await store.consumeAttemptFor("wrong-user", userB, "web", 15 * 60_000),
      ).toBeNull();
      expect(await store.peekAttempt("wrong-user")).not.toBeNull();
    });

    it("consumeAttemptFor with the WRONG surface consumes nothing (returns null, row survives)", async () => {
      const store = createConcept2Store(db);
      await store.createAttempt({
        nonce: "wrong-surface",
        userId: userA,
        weightClass: "H",
        surface: "native",
      });
      expect(
        await store.consumeAttemptFor(
          "wrong-surface",
          userA,
          "web",
          15 * 60_000,
        ),
      ).toBeNull();
      expect(await store.peekAttempt("wrong-surface")).not.toBeNull();
    });

    it("consumeAttemptFor with the right (user, surface) returns {weightClass, fresh:true} once and null the second time", async () => {
      const store = createConcept2Store(db);
      await store.createAttempt({
        nonce: "right-once",
        userId: userA,
        weightClass: "L",
        surface: "web",
      });
      expect(
        await store.consumeAttemptFor("right-once", userA, "web", 15 * 60_000),
      ).toStrictEqual({ weightClass: "L", fresh: true });
      expect(
        await store.consumeAttemptFor("right-once", userA, "web", 15 * 60_000),
      ).toBeNull();
      expect(await store.peekAttempt("right-once")).toBeNull();
    });

    it("a right-principal EXPIRED row is still deleted and reports fresh:false (the caller decides Expired)", async () => {
      const store = createConcept2Store(db);
      await store.createAttempt({
        nonce: "stale-right",
        userId: userA,
        weightClass: "H",
        surface: "web",
      });
      // maxAgeMs 0: any row created even microseconds ago is past it.
      expect(
        await store.consumeAttemptFor("stale-right", userA, "web", 0),
      ).toStrictEqual({ weightClass: "H", fresh: false });
      expect(await store.peekAttempt("stale-right")).toBeNull();
    });

    it("deleteExpiredAttempts removes only stale rows", async () => {
      const store = createConcept2Store(db);
      const stale = await createUserStore(db).createUser({
        googleSub: "c2-store-user-stale",
        email: "stale@c2-store.test",
        name: "ST",
      });
      await store.createAttempt({
        nonce: "nonce-stale",
        userId: stale.id,
        weightClass: "H",
        surface: "web",
      });
      await store.createAttempt({
        nonce: "nonce-fresh",
        userId: userA,
        weightClass: "H",
        surface: "web",
      });
      await db.execute(
        sql`update concept2_auth_attempts set created_at = now() - interval '1 hour' where nonce = 'nonce-stale'`,
      );
      await store.deleteExpiredAttempts(15 * 60_000);
      expect(await store.peekAttempt("nonce-stale")).toBeNull();
      expect(await store.peekAttempt("nonce-fresh")).not.toBeNull();
    });
  });

  describe("upsertLink under UNIQUE(c2_user_id) (D1)", () => {
    it("a DIFFERENT user linking an already-linked Concept2 account throws Concept2LinkConflictError; both rows untouched", async () => {
      const store = createConcept2Store(db);
      const a = await createUserStore(db).createUser({
        googleSub: "c2-store-user-d1-a",
        email: "d1-a@c2-store.test",
        name: "D1A",
      });
      const b = await createUserStore(db).createUser({
        googleSub: "c2-store-user-d1-b",
        email: "d1-b@c2-store.test",
        name: "D1B",
      });
      await store.upsertLink(a.id, link({ c2UserId: 9001 }));
      await expect(
        store.upsertLink(b.id, link({ c2UserId: 9001, accessToken: "at-b" })),
      ).rejects.toBeInstanceOf(Concept2LinkConflictError);
      expect((await store.getLink(a.id))?.accessToken).toBe("at-1");
      expect(await store.getLink(b.id)).toBeNull();
    });

    it("the SAME user relinking the SAME Concept2 account is a plain replace, not a conflict", async () => {
      const store = createConcept2Store(db);
      const a = await createUserStore(db).createUser({
        googleSub: "c2-store-user-d1-same",
        email: "d1-same@c2-store.test",
        name: "D1S",
      });
      await store.upsertLink(a.id, link({ c2UserId: 9002 }));
      await store.upsertLink(a.id, link({ c2UserId: 9002, accessToken: "at-2" }));
      expect((await store.getLink(a.id))?.accessToken).toBe("at-2");
    });
  });
```

NOTE for the pre-existing `upsertLink / getLink / deleteLink` describe (`:66-131`) and `withLinkLock` describe (`:133-335`): every `link()` there uses `c2UserId: 555` for `userA` and several fresh users. Under D1 those now COLLIDE across tests (`"upsert then get round-trips"` links `userA` to 555, `"deleteLink is idempotent"` links a fresh user to 555 too). Give each fresh-user test its own `c2UserId` via the `link({ c2UserId: N })` override (e.g. 601, 602, 603 … in file order) — a fixture fix the new constraint forces, called out here so it is not mistaken for a store bug.

- [ ] **Step 2: Run** → red (`surface` not in `NewConcept2Attempt`; `peekAttempt`/`consumeAttemptFor` missing; typecheck fails first).
- [ ] **Step 3: Implement** — replace `app/server/stores/concept2.ts` in full:

```ts
import { and, eq, sql } from "drizzle-orm";
import type { Db } from "../db/index.js";
import { concept2AuthAttempts, concept2Links } from "../db/schema.js";
import { isUniqueViolation } from "./errors.js";

export type WeightClass = "H" | "L";
// Wave E PR1.75a (2026-09-02-concept2-pr175-app-bind-design.md §1): which
// surface minted an attempt — derived by the route from `req.authVia`,
// never from the client body.
export type LinkSurface = "native" | "web";

// Wave E PR1 (2026-08-31-concept2-logbook-design.md §Stored shapes, TRIAD):
// mirrors `db/schema.ts`'s `concept2Links` row shape exactly. Tokens are
// never serialized to any client response — routes/concept2.ts owns that
// projection down to `{linked, weightClass, c2UserId, needsReauth}`, the
// account's numeric id but never a token (PR2's sent-state/
// View-on-Concept2 needs).
export interface Concept2Link {
  userId: string;
  c2UserId: number;
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
  weightClass: WeightClass;
  needsReauthAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

// The plan's serialized-refresh outcome union (plan deviation 4): exactly
// one of three things happened inside the lock, and the caller says which.
export type WithLinkLockOutcome<T> =
  | {
      action: "store";
      tokens: { accessToken: string; refreshToken: string; expiresAt: Date };
      result: T;
    }
  | { action: "flagReauth"; result: T }
  | { action: "none"; result: T };

export interface NewConcept2Attempt {
  nonce: string;
  userId: string;
  weightClass: WeightClass;
  surface: LinkSurface;
}

// `peekAttempt`'s projection: advisory only — it decides which page or
// error a presenter gets, never whether the row is consumed.
export interface PeekedConcept2Attempt {
  userId: string;
  weightClass: WeightClass;
  surface: LinkSurface;
}

// `consumeAttemptFor`'s projection. `userId` and `surface` are predicate
// INPUTS to that statement, so returning them could never disagree with
// the arguments (a green gate that cannot go red, RF21) — only the two
// things the caller does not already know come back.
export interface ConsumedConcept2Attempt {
  weightClass: WeightClass;
  fresh: boolean;
}

// The freshly minted 32-byte nonce collided with another row's primary key
// (design §2: "not worth designing around" — the route retries once, then
// 500s). Distinguished from a generic conflict so the route can tell the
// retryable case from anything else.
export class AttemptNonceCollisionError extends Error {
  constructor() {
    super("attempt nonce collision");
    this.name = "AttemptNonceCollisionError";
  }
}

// D1 (design §Decisions, APPROVED): `concept2_links.c2_user_id` is UNIQUE —
// the Concept2 account being linked already belongs to a DIFFERENT
// Ergomatic user. Both completion routes answer 409 and discard the tokens.
export class Concept2LinkConflictError extends Error {
  constructor() {
    super("concept2 account already linked to another user");
    this.name = "Concept2LinkConflictError";
  }
}

export function createConcept2Store(db: Db) {
  return {
    async getLink(userId: string): Promise<Concept2Link | null> {
      const rows = await db
        .select()
        .from(concept2Links)
        .where(eq(concept2Links.userId, userId));
      return rows[0] ?? null;
    },

    // `onConflictDoUpdate` on the PK (one row per user). `needsReauthAt` is
    // explicitly cleared to null on EVERY upsert, including the first
    // insert — a successful relink IS the recovery from a flagged link
    // (schema.ts's own `needsReauthAt` comment): the callback that reaches
    // this method already has a fresh token pair from C2, so whatever
    // reauth flag an earlier refresh failure set is now stale by
    // definition. `updatedAt` is bumped via `now()` on the conflict path
    // only — the insert path already gets its column default.
    //
    // PR1.75a D1: after the ON CONFLICT (user_id) arm, the only unique
    // violation still reachable is `concept2_links_c2_user_id_unique` — the
    // Concept2 account is held by ANOTHER user (the same user relinking the
    // same account updates in place). Mapped to a typed error so the route
    // can answer 409 without inspecting driver internals.
    async upsertLink(
      userId: string,
      link: {
        c2UserId: number;
        accessToken: string;
        refreshToken: string;
        expiresAt: Date;
        weightClass: WeightClass;
      },
    ): Promise<void> {
      try {
        await db
          .insert(concept2Links)
          .values({
            userId,
            c2UserId: link.c2UserId,
            accessToken: link.accessToken,
            refreshToken: link.refreshToken,
            expiresAt: link.expiresAt,
            weightClass: link.weightClass,
          })
          .onConflictDoUpdate({
            target: concept2Links.userId,
            set: {
              c2UserId: link.c2UserId,
              accessToken: link.accessToken,
              refreshToken: link.refreshToken,
              expiresAt: link.expiresAt,
              weightClass: link.weightClass,
              needsReauthAt: null,
              updatedAt: sql`now()`,
            },
          });
      } catch (err) {
        if (isUniqueViolation(err)) throw new Concept2LinkConflictError();
        throw err;
      }
    },

    // User-initiated unlink ONLY (schema.ts's own comment on
    // `needsReauthAt`: an automatic failure path never deletes the link,
    // it flags it via `withLinkLock`'s "flagReauth" outcome instead).
    // Idempotent: deleting an absent link matches zero rows, no error.
    async deleteLink(userId: string): Promise<void> {
      await db.delete(concept2Links).where(eq(concept2Links.userId, userId));
    },

    // Serialized refresh (plan deviation 4): `SELECT ... FOR UPDATE` on the
    // user's own link row, inside a transaction, so two overlapping
    // refreshes for the SAME user serialize — the second's `fn` only runs
    // once the first's transaction has committed (or rolled back) and sees
    // whatever the first one wrote. The lock is held ACROSS `fn`'s await
    // (its wire call to Concept2's token endpoint) by design: this
    // serializes exactly one user's refreshes against each other, nothing
    // wider (a lock scoped to a `userId` in a `WHERE`, not a table lock).
    // Zero matching rows (no link at all) is a legitimate no-op lock —
    // `fn` still runs, with `null`, and can only sensibly answer "none".
    async withLinkLock<T>(
      userId: string,
      fn: (link: Concept2Link | null) => Promise<WithLinkLockOutcome<T>>,
    ): Promise<T> {
      return db.transaction(async (tx) => {
        const rows = await tx
          .select()
          .from(concept2Links)
          .where(eq(concept2Links.userId, userId))
          .for("update");
        const link = rows[0] ?? null;

        const outcome = await fn(link);

        if (outcome.action === "store") {
          // Controller ruling R2 (task-6-brief.md, carrying Task 3's ruling
          // forward): a successful refresh proves the grant lives, so it
          // ALSO clears `needsReauthAt` — a stale flag left set here would
          // wrongly keep blocking uploads after the grant has recovered.
          await tx
            .update(concept2Links)
            .set({
              accessToken: outcome.tokens.accessToken,
              refreshToken: outcome.tokens.refreshToken,
              expiresAt: outcome.tokens.expiresAt,
              needsReauthAt: null,
              updatedAt: sql`now()`,
            })
            .where(eq(concept2Links.userId, userId));
        } else if (outcome.action === "flagReauth") {
          await tx
            .update(concept2Links)
            .set({ needsReauthAt: sql`now()` })
            .where(eq(concept2Links.userId, userId));
        }
        // "none": another request already refreshed (or there is nothing
        // to do) — no write, the lock still serialized the read.

        return outcome.result;
      });
    },

    // Mint is ONE atomic statement (design §2): `INSERT ... ON CONFLICT
    // (user_id) DO UPDATE SET nonce, surface, weight_class, created_at`.
    // Updating the PK in DO UPDATE is legal; two concurrent mints serialize
    // on `concept2_auth_attempts_user_id_unique` and exactly one row
    // survives (PROVEN on real Postgres — the integration test's concurrent
    // case; the old delete-then-insert yielded two). After that arm the
    // only unique violation left is the PRIMARY KEY: the new nonce collided
    // with another row's (32 random bytes — the route retries once).
    async createAttempt(a: NewConcept2Attempt): Promise<void> {
      try {
        await db
          .insert(concept2AuthAttempts)
          .values({
            nonce: a.nonce,
            userId: a.userId,
            weightClass: a.weightClass,
            surface: a.surface,
          })
          .onConflictDoUpdate({
            target: concept2AuthAttempts.userId,
            set: {
              nonce: a.nonce,
              surface: a.surface,
              weightClass: a.weightClass,
              createdAt: sql`now()`,
            },
          });
      } catch (err) {
        if (isUniqueViolation(err)) throw new AttemptNonceCollisionError();
        throw err;
      }
    },

    // Advisory read (design §2): no delete, NO freshness predicate. It only
    // decides which page or error a presenter gets; `consumeAttemptFor` is
    // the authority on whether anything is consumed.
    async peekAttempt(nonce: string): Promise<PeekedConcept2Attempt | null> {
      const rows = await db
        .select({
          userId: concept2AuthAttempts.userId,
          weightClass: concept2AuthAttempts.weightClass,
          surface: concept2AuthAttempts.surface,
        })
        .from(concept2AuthAttempts)
        .where(eq(concept2AuthAttempts.nonce, nonce));
      return rows[0] ?? null;
    },

    // ONE conditional statement (design §2): `DELETE ... WHERE nonce=$1 AND
    // user_id=$2 AND surface=$3 RETURNING weight_class, <fresh>`. The
    // identity/surface predicate lives IN the statement, so a wrong
    // principal or wrong surface consumes nothing by construction, not by
    // step order. Freshness rides as a computed column exactly as PR1's
    // consume did: a right-principal expired row is still deleted (and
    // reported `fresh: false` so the caller answers Expired); a
    // wrong-principal one is left for the sweep. A null return means "no
    // row matched" — unknown nonce, wrong user, wrong surface, or a
    // concurrent completion/re-mint already removed it.
    async consumeAttemptFor(
      nonce: string,
      userId: string,
      surface: LinkSurface,
      maxAgeMs: number,
    ): Promise<ConsumedConcept2Attempt | null> {
      const rows = await db
        .delete(concept2AuthAttempts)
        .where(
          and(
            eq(concept2AuthAttempts.nonce, nonce),
            eq(concept2AuthAttempts.userId, userId),
            eq(concept2AuthAttempts.surface, surface),
          ),
        )
        .returning({
          weightClass: concept2AuthAttempts.weightClass,
          fresh: sql<boolean>`${concept2AuthAttempts.createdAt} >= now() - make_interval(secs => ${maxAgeMs / 1000})`,
        });
      const row = rows[0];
      if (!row) return null;
      return { weightClass: row.weightClass, fresh: row.fresh };
    },

    // Sweeps attempts nobody ever completed (the browser hop was
    // abandoned) — unlike `consumeAttemptFor`, this legitimately gates the
    // WHERE on age, because there is no single row to single-use here.
    async deleteExpiredAttempts(maxAgeMs: number): Promise<void> {
      await db
        .delete(concept2AuthAttempts)
        .where(
          sql`${concept2AuthAttempts.createdAt} < now() - make_interval(secs => ${maxAgeMs / 1000})`,
        );
    },
  };
}

export type Concept2Store = ReturnType<typeof createConcept2Store>;
```

- [ ] **Step 4: Fake.** In `fakes.ts:34-38` change the import to:

```ts
import {
  AttemptNonceCollisionError,
  Concept2LinkConflictError,
  type Concept2Link,
  type Concept2Store,
  type ConsumedConcept2Attempt,
  type LinkSurface,
  type NewConcept2Attempt,
  type PeekedConcept2Attempt,
} from "../stores/concept2.js";
```

and replace `fakes.ts:883-1015` (`makeFakeConcept2Store` and its header comment) with:

```ts
// Wave E PR1 (2026-08-31-concept2-logbook-design.md §Stored shapes, TRIAD):
// mirrors `stores/concept2.ts`'s `createConcept2Store` signature EXACTLY
// (`routes/concept2.test.ts` consumes this fake). Deliberately NOT part of
// `makeFakeStores`/`Stores` — the concept2 router takes its own store dep.
//
// `withLinkLock`'s serialization is a per-user promise-chain gate, not a
// real lock: each call first awaits the PREVIOUS call's gate for the same
// userId, then installs its OWN gate (resolved in a `finally`, so a
// throwing `fn` still releases the next caller) before doing any work.
// This reproduces the real store's observable guarantee — two overlapping
// calls for the same user never interleave their read-decide-write — but
// cannot prove real row-locking the way `concept2.integration.test.ts`'s
// `FOR UPDATE` case does; that test exists precisely because no fake can
// stand in for it.
//
// PR1.75a: the two unique constraints migration 0020 added are mirrored
// here as the same typed errors the real store throws
// (`AttemptNonceCollisionError` on a nonce held by another user's row,
// `Concept2LinkConflictError` on a c2UserId held by another user's link),
// and `createAttempt` is the same one-row-per-user REPLACE the real upsert
// is. The concurrent-mint invariant itself is only provable on real
// Postgres (the integration test) — a Map cannot race.
//
// `clock` is injectable so a caller can control `consumeAttemptFor`'s and
// `deleteExpiredAttempts`' notion of "now" without a real sleep — the real
// store instead computes elapsed time in SQL against Postgres's own
// `now()`, which a unit test has no equivalent lever for.
export function makeFakeConcept2Store(
  clock: () => Date = () => new Date(),
): Concept2Store {
  const links = new Map<string, Concept2Link>();
  const attempts = new Map<string, NewConcept2Attempt & { createdAt: Date }>();
  const gates = new Map<string, Promise<void>>();

  return {
    async getLink(userId: string) {
      return links.get(userId) ?? null;
    },

    // Same posture as the real store: `needsReauthAt` is cleared on EVERY
    // upsert, insert or replace alike — a successful relink IS the
    // recovery (schema.ts's own `needsReauthAt` comment). D1: a c2UserId
    // already held by a DIFFERENT user is the real store's unique
    // violation, thrown as the same typed error.
    async upsertLink(userId, link) {
      for (const [otherUserId, other] of links) {
        if (otherUserId !== userId && other.c2UserId === link.c2UserId) {
          throw new Concept2LinkConflictError();
        }
      }
      const existing = links.get(userId);
      const now = clock();
      links.set(userId, {
        userId,
        c2UserId: link.c2UserId,
        accessToken: link.accessToken,
        refreshToken: link.refreshToken,
        expiresAt: link.expiresAt,
        weightClass: link.weightClass,
        needsReauthAt: null,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      });
    },

    async deleteLink(userId: string) {
      links.delete(userId);
    },

    async withLinkLock(userId, fn) {
      const previousGate = gates.get(userId) ?? Promise.resolve();
      let releaseGate: () => void = () => {};
      const ownGate = new Promise<void>((resolve) => {
        releaseGate = resolve;
      });
      gates.set(userId, ownGate);

      await previousGate;
      try {
        const current = links.get(userId) ?? null;
        const outcome = await fn(current);

        if (outcome.action === "store") {
          const existing = links.get(userId);
          if (existing) {
            // Controller ruling R2 (task-6-brief.md): mirrors the real
            // store's own `needsReauthAt: null` on a successful refresh
            // (concept2.ts's own comment on this branch).
            links.set(userId, {
              ...existing,
              accessToken: outcome.tokens.accessToken,
              refreshToken: outcome.tokens.refreshToken,
              expiresAt: outcome.tokens.expiresAt,
              needsReauthAt: null,
              updatedAt: clock(),
            });
          }
        } else if (outcome.action === "flagReauth") {
          const existing = links.get(userId);
          if (existing) {
            links.set(userId, { ...existing, needsReauthAt: clock() });
          }
        }
        // "none": no write.

        return outcome.result;
      } finally {
        releaseGate();
      }
    },

    // One row per user, REPLACED on every mint (the real store's ON
    // CONFLICT (user_id) DO UPDATE). A nonce already held by ANOTHER
    // user's row is the real store's PK violation.
    async createAttempt(a: NewConcept2Attempt) {
      const holder = attempts.get(a.nonce);
      if (holder && holder.userId !== a.userId) {
        throw new AttemptNonceCollisionError();
      }
      for (const [nonce, row] of attempts) {
        if (row.userId === a.userId) attempts.delete(nonce);
      }
      attempts.set(a.nonce, { ...a, createdAt: clock() });
    },

    async peekAttempt(nonce: string): Promise<PeekedConcept2Attempt | null> {
      const row = attempts.get(nonce);
      if (!row) return null;
      return {
        userId: row.userId,
        weightClass: row.weightClass,
        surface: row.surface,
      };
    },

    // The real store's single conditional DELETE: the row is removed ONLY
    // when all three predicates hold; freshness is reported, never gated
    // on (see `concept2.ts`'s own `consumeAttemptFor` comment).
    async consumeAttemptFor(
      nonce: string,
      userId: string,
      surface: LinkSurface,
      maxAgeMs: number,
    ): Promise<ConsumedConcept2Attempt | null> {
      const row = attempts.get(nonce);
      if (!row || row.userId !== userId || row.surface !== surface) {
        return null;
      }
      attempts.delete(nonce);
      const ageMs = clock().getTime() - row.createdAt.getTime();
      return { weightClass: row.weightClass, fresh: ageMs <= maxAgeMs };
    },

    async deleteExpiredAttempts(maxAgeMs: number) {
      const now = clock().getTime();
      for (const [nonce, row] of attempts) {
        if (now - row.createdAt.getTime() > maxAgeMs) {
          attempts.delete(nonce);
        }
      }
    },
  };
}
```

- [ ] **Step 5: Run** the store integration file → green. `pnpm typecheck` now FAILS in `routes/concept2.ts` (`consumeAttempt`/`deleteAttemptsFor` gone, `createAttempt` needs `surface`) and in `routes/concept2.test.ts:414` — expected: those are Task 6's. To keep every commit green, Task 2's commit is combined with Task 6's? No — keep the tasks separate but land Tasks 2-6 as ONE commit series on the branch where each commit typechecks: the simplest honest ordering is to commit Task 2 together with a minimal route adaptation is NOT allowed (it would smuggle route logic past its tests). Instead: commit Task 2 with the store + fake + integration tests, and make the route compile by keeping a one-line shim in `routes/concept2.ts` for this commit only: `createAttempt({..., surface: req.authVia === "bearer" ? "native" : "web"})` is Task 6's code. **Decision: Tasks 2, 3 and 4 are committed together as one commit after Task 6's route is green** — the pre-commit hook runs whole-project typecheck (CLAUDE.md "Hooks"), so an intermediate commit that does not typecheck cannot land. Each task still runs its OWN failing-test → green cycle in the working tree; the mutation probes run after the combined commit. Say this in the task report.
- [ ] **Step 6: Mutation probes (after the combined commit):** (a) replace `createAttempt`'s upsert with `delete where userId` + plain `insert` → run the concurrent test → record whether it reports `expected 1, received 2` (index dropped variant is not run — the index is in 0020) or `duplicate key value violates unique constraint "concept2_auth_attempts_user_id_unique"` (index kept) — record which, per design §Testing; (b) drop `eq(concept2AuthAttempts.userId, userId)` from `consumeAttemptFor`'s `and(...)` → "WRONG user consumes nothing" fails (`expected null, received { weightClass: 'H', fresh: true }`); (c) drop the `surface` predicate → "WRONG surface" fails the same way; (d) remove the `isUniqueViolation` mapping in `upsertLink` → the D1 test fails with `expected DrizzleQueryError to be an instance of Concept2LinkConflictError`. Restore after each (`git status` first).

### Task 3: `requireUser` — `authVia`, empty cookie is absent, the disagreement log, the `AUTH_VIA_LOG` instrument

**Files:**
- Modify: `app/server/auth/middleware.ts` (full file below)
- Test: `app/server/auth/middleware.test.ts` (extend; the `guardedApp` helper changes to expose `authVia`)

**Interfaces:**
- Produces: `export type AuthVia = "bearer" | "cookie"`; `req.authVia?: AuthVia` (the `express-serve-static-core` augmentation at `middleware.ts:5-9` grows one field); `export function cookieToken(req): string | undefined` (empty value → `undefined`); a `console.warn` line `{"event":"auth_disagreement","bearerUser","cookieUser","path"}` on both-present-different-users; a `console.log` line `{"event":"auth_via","authVia","bearerPresent","cookiePresent","path"}` when `process.env.AUTH_VIA_LOG === "1"`. Never a token value in either.

- [ ] **Step 1: Failing tests.** In `middleware.test.ts`, change `guardedApp` (`:12-18`) to return `authVia` too, and append a describe:

```ts
function guardedApp(store: SessionStore) {
  const app = express();
  app.get("/whoami", requireUser(store), (req, res) => {
    res.json({ user: req.user, authVia: req.authVia });
  });
  return app;
}
```

```ts
// Wave E PR1.75a (2026-09-02-concept2-pr175-app-bind-design.md §1): which
// credential requireUser RESOLVED is a property of every request; the
// concept2 router derives the attempt's surface from it. An empty-valued
// cookie is ABSENT (cookies.ts's clearSessionCookie sets maxAge 0, so a
// compliant browser deletes rather than empties it, and the shared native
// jar is UNMEASURED); the derivation must never be written
// `cookie !== undefined`.
describe("requireUser authVia + both-present (PR1.75a)", () => {
  const userA = { id: "ua", email: "a@x.com", name: "A" };
  const userB = { id: "ub", email: "b@x.com", name: "B" };
  const twoUserStore = () =>
    ({
      resolveSession: vi.fn(async (token: string) => {
        const user =
          token === "bearer-a" || token === "cookie-a"
            ? userA
            : token === "cookie-b"
              ? userB
              : null;
        if (!user) return null;
        return {
          user,
          expiresAt: new Date(Date.now() + 1000_000),
          refreshed: false,
        };
      }),
    }) as unknown as SessionStore;

  it("bearer -> authVia 'bearer'", async () => {
    const res = await request(guardedApp(twoUserStore()))
      .get("/whoami")
      .set("Authorization", "Bearer bearer-a");
    expect(res.status).toBe(200);
    expect(res.body.authVia).toBe("bearer");
  });

  it("cookie -> authVia 'cookie'", async () => {
    const res = await request(guardedApp(twoUserStore()))
      .get("/whoami")
      .set("Cookie", `${SESSION_COOKIE}=cookie-a`);
    expect(res.status).toBe(200);
    expect(res.body.authVia).toBe("cookie");
  });

  it("an empty-valued cookie alone is ABSENT: 401, and the store is never asked to resolve ''", async () => {
    const store = twoUserStore();
    const res = await request(guardedApp(store))
      .get("/whoami")
      .set("Cookie", `${SESSION_COOKIE}=`);
    expect(res.status).toBe(401);
    expect(store.resolveSession).not.toHaveBeenCalled();
  });

  it("bearer plus an empty-valued cookie resolves as bearer ONLY: one resolveSession call, never with ''", async () => {
    const store = twoUserStore();
    const res = await request(guardedApp(store))
      .get("/whoami")
      .set("Authorization", "Bearer bearer-a")
      .set("Cookie", `${SESSION_COOKIE}=`);
    expect(res.status).toBe(200);
    expect(res.body.authVia).toBe("bearer");
    expect(store.resolveSession).toHaveBeenCalledTimes(1);
    expect(store.resolveSession).toHaveBeenCalledWith("bearer-a");
  });

  it("both present, SAME user -> bearer wins, authVia 'bearer', no disagreement line", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const res = await request(guardedApp(twoUserStore()))
        .get("/whoami")
        .set("Authorization", "Bearer bearer-a")
        .set("Cookie", `${SESSION_COOKIE}=cookie-a`);
      expect(res.status).toBe(200);
      expect(res.body.user).toStrictEqual(userA);
      expect(res.body.authVia).toBe("bearer");
      expect(warn).not.toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });

  it("both present, DIFFERENT users -> bearer resolved AND exactly one auth_disagreement line naming both ids, never a token", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const res = await request(guardedApp(twoUserStore()))
        .get("/whoami")
        .set("Authorization", "Bearer bearer-a")
        .set("Cookie", `${SESSION_COOKIE}=cookie-b`);
      expect(res.status).toBe(200);
      expect(res.body.user).toStrictEqual(userA);
      expect(warn).toHaveBeenCalledTimes(1);
      const line = String(warn.mock.calls[0][0]);
      expect(JSON.parse(line)).toStrictEqual({
        event: "auth_disagreement",
        bearerUser: "ua",
        cookieUser: "ub",
        path: "/whoami",
      });
      expect(line).not.toContain("bearer-a");
      expect(line).not.toContain("cookie-b");
    } finally {
      warn.mockRestore();
    }
  });

  it("neither present -> 401 unchanged", async () => {
    const res = await request(guardedApp(twoUserStore())).get("/whoami");
    expect(res.status).toBe(401);
    expect(res.body).toStrictEqual({ error: "unauthenticated" });
  });

  // Design §Testing (d): the walk instrument for §1's UNMEASURED premise —
  // committed code behind an env flag (never NODE_ENV), so the walk runs
  // this PR's own build. Logs presence booleans and the path, never a token.
  describe("AUTH_VIA_LOG=1 instrument", () => {
    it("logs {authVia, bearerPresent, cookiePresent, path} and never the token", async () => {
      const log = vi.spyOn(console, "log").mockImplementation(() => {});
      const prev = process.env.AUTH_VIA_LOG;
      process.env.AUTH_VIA_LOG = "1";
      try {
        await request(guardedApp(twoUserStore()))
          .get("/whoami")
          .set("Authorization", "Bearer bearer-a")
          .set("Cookie", `${SESSION_COOKIE}=`);
        const lines = log.mock.calls.map((c) => String(c[0]));
        const authVia = lines.find((l) => l.includes('"auth_via"'));
        expect(authVia).toBeDefined();
        expect(JSON.parse(authVia!)).toStrictEqual({
          event: "auth_via",
          authVia: "bearer",
          bearerPresent: true,
          cookiePresent: false,
          path: "/whoami",
        });
        expect(authVia).not.toContain("bearer-a");
      } finally {
        if (prev === undefined) delete process.env.AUTH_VIA_LOG;
        else process.env.AUTH_VIA_LOG = prev;
        log.mockRestore();
      }
    });

    it("is silent when the flag is unset", async () => {
      const log = vi.spyOn(console, "log").mockImplementation(() => {});
      const prev = process.env.AUTH_VIA_LOG;
      delete process.env.AUTH_VIA_LOG;
      try {
        await request(guardedApp(twoUserStore()))
          .get("/whoami")
          .set("Authorization", "Bearer bearer-a");
        expect(
          log.mock.calls.some((c) => String(c[0]).includes('"auth_via"')),
        ).toBe(false);
      } finally {
        if (prev !== undefined) process.env.AUTH_VIA_LOG = prev;
        log.mockRestore();
      }
    });
  });
});
```

- [ ] **Step 2: Run** `... --project unit server/auth/middleware.test.ts` → the new describe fails (`authVia` undefined; no warn line; the empty-cookie case: today `bearer ?? ""` resolves the bearer and never touches the cookie, so THAT case passes already — it is the `!== undefined` mutation in step 5 that gives it teeth).
- [ ] **Step 3: Implement** — replace `app/server/auth/middleware.ts` in full:

```ts
import type { NextFunction, Request, RequestHandler, Response } from "express";
import { SESSION_COOKIE, getCookie, sessionCookie } from "./cookies.js";
import type { SessionStore, SessionUser } from "./sessions.js";

// Wave E PR1.75a (2026-09-02-concept2-pr175-app-bind-design.md §1): which
// credential `requireUser` RESOLVED. Request-lifetime, never persisted; the
// concept2 router derives an attempt's `surface` from it (bearer -> native,
// cookie -> web), so no client-asserted surface exists.
export type AuthVia = "bearer" | "cookie";

declare module "express-serve-static-core" {
  interface Request {
    user?: SessionUser;
    authVia?: AuthVia;
  }
}

export const noStore: RequestHandler = (_req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  next();
};

const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export function bearerToken(req: Request): string | undefined {
  const h = req.headers.authorization;
  return h?.startsWith("Bearer ") ? h.slice(7) : undefined;
}

// An empty-valued session cookie (`erg_session=`) is ABSENT, however it was
// produced: `clearSessionCookie()` sets `maxAge: 0` so a compliant browser
// DELETES rather than empties it (cookies.ts), and whether the shared
// native cookie jar can ever carry one is UNMEASURED (design §1). Written
// as a value check, never `!== undefined` — the one derivation this PR
// adds that would otherwise misread "" as a present cookie.
export function cookieToken(req: Request): string | undefined {
  const raw = getCookie(req.headers.cookie, SESSION_COOKIE);
  return raw === undefined || raw === "" ? undefined : raw;
}

export function originCheck(siteUrl: string): RequestHandler {
  const allowed = new Set([
    new URL(siteUrl).origin,
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "capacitor://localhost",
  ]);
  return (req: Request, res: Response, next: NextFunction) => {
    if (MUTATING.has(req.method)) {
      if (bearerToken(req)) {
        next();
        return;
      }
      const origin = req.headers.origin;
      if (origin && !allowed.has(origin)) {
        res.status(403).json({ error: "bad origin" });
        return;
      }
    }
    next();
  };
}

export function requireUser(store: SessionStore): RequestHandler {
  return async (req, res, next) => {
    const bearer = bearerToken(req);
    const cookie = cookieToken(req);
    // Both-present rule (design §1, the gate doc's own resolution §3(g)
    // round 16): BEARER WINS — native is the only consumer that carries
    // one, and an attacker who supplies their own bearer gains nothing by
    // also supplying a cookie.
    const token = bearer ?? cookie;
    if (!token) {
      res.status(401).json({ error: "unauthenticated" });
      return;
    }
    const resolved = await store.resolveSession(token);
    if (!resolved) {
      res.status(401).json({ error: "unauthenticated" });
      return;
    }
    const authVia: AuthVia = bearer !== undefined ? "bearer" : "cookie";

    // Disagreement, scope (a) of design §1: both present AND resolving to
    // DIFFERENT users is LOGGED app-wide, never refused here — this
    // middleware is mounted over the whole API (routes/data.ts's
    // `router.use("/api", requireUser)`) and deploys to prod web on merge,
    // while whether the native jar can ever carry `erg_session` is
    // UNMEASURED until PR1.75b's walk reads this very line. The hard 400
    // lives in routes/concept2.ts (scope (b)), dark behind the flag.
    // Cost: one extra session lookup per both-present request. Never a
    // token value.
    if (bearer !== undefined && cookie !== undefined) {
      const viaCookie = await store.resolveSession(cookie);
      if (viaCookie && viaCookie.user.id !== resolved.user.id) {
        console.warn(
          JSON.stringify({
            event: "auth_disagreement",
            bearerUser: resolved.user.id,
            cookieUser: viaCookie.user.id,
            path: req.path,
          }),
        );
      }
    }

    // Walk instrument (design §Testing (d)): an env flag, never NODE_ENV,
    // so the device walk runs the PR's own build. Presence booleans and
    // the path only — never a token value.
    if (process.env.AUTH_VIA_LOG === "1") {
      console.log(
        JSON.stringify({
          event: "auth_via",
          authVia,
          bearerPresent: bearer !== undefined,
          cookiePresent: cookie !== undefined,
          path: req.path,
        }),
      );
    }

    if (resolved.refreshed) {
      if (bearer) {
        res.setHeader("X-Session-Expires-At", resolved.expiresAt.toISOString());
      } else {
        res.setHeader("Set-Cookie", sessionCookie(token, resolved.expiresAt));
      }
    }
    req.user = resolved.user;
    req.authVia = authVia;
    next();
  };
}
```

- [ ] **Step 4: Run** the middleware file → green; run the whole `unit` project (`pnpm test --project unit` — the unscoped form is fine here) → green.
- [ ] **Step 5: Mutation probes (after the combined commit):** (a) `cookieToken` → `return raw;` (the forbidden `!== undefined` shape) → "bearer plus an empty-valued cookie" fails (`expected "spy" to be called 1 times, but got 2 times` — the disagreement branch resolved `""`) AND the `AUTH_VIA_LOG` test fails (`cookiePresent: true`); (b) delete the `console.warn` → "DIFFERENT users" fails (`expected "warn" to be called 1 times, but got 0 times`); (c) swap `bearer ?? cookie` to `cookie ?? bearer` → the existing "prefers bearer over a simultaneously-present cookie" (`:142-154`) fails AND "both present, SAME user" reports `authVia: "cookie"`. Record each text.

### Task 4: C2 client — per-surface `redirect_uri` on both calls; `fetchMe` reads `username`

**Files:**
- Modify: `app/server/concept2/client.ts` (`:13-18` config, `:105-129` `authorizeUrl`/`exchangeCode`, `:153-169` `fetchMe`)
- Test: `app/server/concept2/client.test.ts` (`:14-19` cfg, `:101-171` authorizeUrl/exchangeCode, `:282-325` fetchMe)

**Interfaces:**

```ts
export interface C2ClientConfig { baseUrl: string; clientId: string; clientSecret: string }  // redirectUri REMOVED
authorizeUrl(state: string, redirectUri: string): string
exchangeCode(code: string, redirectUri: string): Promise<C2TokenResult>
fetchMe(accessToken: string): Promise<{ ok: true; c2UserId: number; username: string | null } | { ok: false }>
```

- [ ] **Step 0 (evidence before code, observation 3):** open `https://log.concept2.com/developers/documentation`, find the `GET /api/users/me` response field table, and copy the `username` row VERBATIM (with the field's type and any required/optional marker) into the `fetchMe` comment in step 3, tagged PRIMARY with the URL. If the page does not list `username`, say so in the comment ("no `username` field documented; read as optional") and in the task report — the code is the same either way.
- [ ] **Step 1: Failing tests.** In `client.test.ts` change `cfg` (`:14-19`) to `{ baseUrl, clientId, clientSecret }` (no `redirectUri`), and replace the `authorizeUrl` and `exchangeCode` describes (`:101-171`) with:

```ts
  describe("authorizeUrl", () => {
    it("builds /oauth/authorize with the results:write scope and the CALLER's redirect_uri", () => {
      const client = createC2Client(cfg, vi.fn());
      const url = new URL(
        client.authorizeUrl("nonce-123", "https://app.test/c2/callback"),
      );
      expect(url.origin + url.pathname).toBe(
        "https://log-dev.concept2.com/oauth/authorize",
      );
      expect(url.searchParams.get("client_id")).toBe("test-client-id");
      expect(url.searchParams.get("scope")).toBe("user:read,results:write");
      expect(url.searchParams.get("response_type")).toBe("code");
      expect(url.searchParams.get("redirect_uri")).toBe(
        "https://app.test/c2/callback",
      );
      expect(url.searchParams.get("state")).toBe("nonce-123");
    });

    // PR1.75a §3: the redirect is chosen PER SURFACE at mint, so two calls
    // with different redirects must produce different URLs — a client that
    // still closed over one boot constant would pass the test above.
    it("two calls with different redirect URIs carry each its own (a private-use scheme survives URL encoding)", () => {
      const client = createC2Client(cfg, vi.fn());
      const web = new URL(
        client.authorizeUrl("n", "https://app.test/api/concept2/callback"),
      );
      const native = new URL(
        client.authorizeUrl("n", "haus.waffle.ergomatic://oauth/callback"),
      );
      expect(web.searchParams.get("redirect_uri")).toBe(
        "https://app.test/api/concept2/callback",
      );
      expect(native.searchParams.get("redirect_uri")).toBe(
        "haus.waffle.ergomatic://oauth/callback",
      );
    });
  });

  describe("exchangeCode", () => {
    it("POSTs form-encoded with the exact six-key set including scope, redirect_uri = the CALLER's", async () => {
      const fetchImpl = vi
        .fn()
        .mockResolvedValue(jsonResponse(200, PROBE_200_BODY));
      const client = createC2Client(cfg, fetchImpl);
      await client.exchangeCode(
        "auth-code-xyz",
        "haus.waffle.ergomatic://oauth/callback",
      );

      expect(fetchImpl).toHaveBeenCalledTimes(1);
      const [url, init] = fetchImpl.mock.calls[0] as [URL, RequestInit];
      expect(String(url)).toBe(
        "https://log-dev.concept2.com/oauth/access_token",
      );
      expect(init.method).toBe("POST");
      expect((init.headers as Record<string, string>)["content-type"]).toBe(
        "application/x-www-form-urlencoded",
      );
      const body = init.body as URLSearchParams;
      expect(new Set(body.keys())).toStrictEqual(
        new Set([
          "client_id",
          "client_secret",
          "grant_type",
          "code",
          "redirect_uri",
          "scope",
        ]),
      );
      expect(body.get("client_id")).toBe("test-client-id");
      expect(body.get("client_secret")).toBe("test-client-secret");
      expect(body.get("grant_type")).toBe("authorization_code");
      expect(body.get("code")).toBe("auth-code-xyz");
      expect(body.get("redirect_uri")).toBe(
        "haus.waffle.ergomatic://oauth/callback",
      );
      expect(body.get("scope")).toBe("user:read,results:write");
    });

    it("200 -> ok tokens, expiresAt = now + expires_in seconds", async () => {
      const fetchImpl = vi
        .fn()
        .mockResolvedValue(jsonResponse(200, PROBE_200_BODY));
      const client = createC2Client(cfg, fetchImpl);
      const result = await client.exchangeCode(
        "auth-code-xyz",
        "https://app.test/c2/callback",
      );
      expect(result).toStrictEqual({
        ok: true,
        tokens: {
          accessToken: PROBE_200_BODY.access_token,
          refreshToken: PROBE_200_BODY.refresh_token,
          expiresAt: new Date(
            Date.parse("2026-08-31T12:00:00.000Z") + 604800 * 1000,
          ),
        },
      });
    });
  });
```

and in the `fetchMe` describe replace the first test (`:283-296`) with these two (the other three stay):

```ts
    it("200 {data:{id, username}} -> c2UserId + username", async () => {
      const fetchImpl = vi
        .fn()
        .mockResolvedValue(
          jsonResponse(200, { data: { id: 2211, username: "jmorelli" } }),
        );
      const client = createC2Client(cfg, fetchImpl);
      const result = await client.fetchMe("some-access-token");
      expect(result).toStrictEqual({
        ok: true,
        c2UserId: 2211,
        username: "jmorelli",
      });

      const [url, init] = fetchImpl.mock.calls[0] as [URL, RequestInit];
      expect(String(url)).toBe("https://log-dev.concept2.com/api/users/me");
      expect((init.headers as Record<string, string>).authorization).toBe(
        "Bearer some-access-token",
      );
    });

    // No committed capture carries `username` (plan observation 3): the
    // field is read as OPTIONAL and a non-string reads as absent.
    it("200 {data:{id}} without a username -> username null, still ok", async () => {
      const fetchImpl = vi
        .fn()
        .mockResolvedValue(jsonResponse(200, { data: { id: 2211, username: 7 } }));
      const client = createC2Client(cfg, fetchImpl);
      expect(await client.fetchMe("t")).toStrictEqual({
        ok: true,
        c2UserId: 2211,
        username: null,
      });
    });
```

- [ ] **Step 2: Run** `... --project unit server/concept2/client.test.ts` → red (typecheck: `redirectUri` missing from cfg / extra argument).
- [ ] **Step 3: Implement.** In `client.ts`: delete `redirectUri: string;` from `C2ClientConfig` (`:17`); replace `:105-129` with:

```ts
    // /oauth/authorize shape precedent: scripts/c2-crossconnect.ts's
    // buildAuthorizeUrl (PR0, live-run-proven). PR1.75a §3: `redirectUri`
    // is the SURFACE's (web: the https callback; native:
    // `haus.waffle.ergomatic://oauth/callback`), chosen by the route at
    // mint — Concept2 requires the exchange's redirect_uri to match the
    // authorize call's ("This must match the value sent in the call to
    // oauth/authorize"), so both calls take it as an argument.
    authorizeUrl(state: string, redirectUri: string): string {
      const u = new URL("/oauth/authorize", cfg.baseUrl);
      u.searchParams.set("client_id", cfg.clientId);
      u.searchParams.set("scope", SCOPE);
      u.searchParams.set("response_type", "code");
      u.searchParams.set("redirect_uri", redirectUri);
      u.searchParams.set("state", state);
      return u.toString();
    },

    exchangeCode(code: string, redirectUri: string): Promise<C2TokenResult> {
      return requestTokens(
        new URLSearchParams({
          client_id: cfg.clientId,
          client_secret: cfg.clientSecret,
          grant_type: "authorization_code",
          code,
          redirect_uri: redirectUri,
          scope: SCOPE,
        }),
      );
    },
```

and replace `:145-169` (`fetchMe` and its comment) with:

```ts
    // No committed transcript names a SUCCESS body for this endpoint (only
    // the PROBE's 401 failure shape is a real capture — refresh-probe-
    // 2026-08-31.md), so the `data.id` shape below is the documented
    // contract's own minimum. Corroborated, not just assumed: PR0's live
    // harness parsed this exact shape against the real sandbox
    // (`scripts/c2-crossconnect.ts:255-258`), the results-201 body's own
    // `user_id` was 2211, and the measured follow-up
    // `GET /profile/2211/log/85557` returned 200.
    //
    // PR1.75a D2: `username` feeds the Linked page's identity line. It has
    // never been observed on this repo's wire (no capture carries a
    // /users/me body) — PRIMARY, Concept2 developer documentation
    // (<URL>): "<verbatim username field row, pasted at Task 4 step 0>".
    // Read as OPTIONAL regardless: a doc-described field is not a measured
    // one, and the page has a fallback (routes/concept2.ts).
    async fetchMe(
      accessToken: string,
    ): Promise<
      { ok: true; c2UserId: number; username: string | null } | { ok: false }
    > {
      let res: Response;
      try {
        res = await fetchImpl(new URL("/api/users/me", cfg.baseUrl), {
          headers: { authorization: `Bearer ${accessToken}` },
        });
      } catch {
        return { ok: false };
      }
      if (!res.ok) return { ok: false };
      const parsed = await safeJson(res);
      const data = (
        parsed as { data?: { id?: unknown; username?: unknown } } | undefined
      )?.data;
      const id = data?.id;
      if (typeof id !== "number") return { ok: false };
      const username = typeof data?.username === "string" ? data.username : null;
      return { ok: true, c2UserId: id, username };
    },
```

- [ ] **Step 4: Run** → green for this file. `pnpm typecheck` now fails at the two callers (`routes/concept2.ts`, `index.ts`, plus the two test harnesses) — Task 6 fixes them; this is part of the combined commit.
- [ ] **Step 5: Mutation probes (after the combined commit):** hardcode `redirect_uri` in `exchangeCode` to the web URL → "six-key set … redirect_uri = the CALLER's" fails (`expected 'https://…' to be 'haus.waffle.ergomatic://oauth/callback'`); drop the `typeof data?.username === "string"` guard → "without a username -> username null" fails (`username: 7`).

### Task 5: The shared callback page template (design §7, Gate 0 APPROVED) + HTML escaper

**Files:**
- Create: `app/server/concept2/callbackPage.ts`
- Test: `app/server/concept2/callbackPage.test.ts`

No existing escaper anywhere under `app/server` (grep for `escapeHtml`, `&amp;`, `replace(/&/g` over `app/server`: the only hits are a fixture string in `wodFetch.test.ts:34`) — the one below is the first, and it lives beside its only consumer.

**Interfaces:**

```ts
export type CallbackPageKind =
  | "linked" | "alreadyLinked" | "expired" | "incomplete"
  | "notSignedIn" | "wrongAccount" | "unavailable" | "failed";
export function escapeHtml(s: string): string;
export function renderCallbackPage(
  kind: CallbackPageKind,
  identities?: { c2Username: string; email: string },   // required for "linked"
): { status: number; html: string };
```

- [ ] **Step 1: Failing tests** — `callbackPage.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { escapeHtml, renderCallbackPage } from "./callbackPage.js";

// Wave E PR1.75a (2026-09-02-concept2-pr175-app-bind-design.md §7): ONE
// server template, inline CSS, system fonts, zero network, used by every
// callback page. The copy below is the design's table VERBATIM; a wording
// change here is a design-gate question, not a test fix.
describe("renderCallbackPage", () => {
  const cases: Array<
    [Parameters<typeof renderCallbackPage>[0], number, string, string, string]
  > = [
    [
      "alreadyLinked",
      409,
      "CONCEPT2 LINK · ALREADY LINKED · HTTP 409",
      "That Concept2 account is already connected to a different Ergomatic account.",
      "Return to the app.",
    ],
    [
      "expired",
      400,
      "CONCEPT2 LINK · EXPIRED · HTTP 400",
      "This link has expired or was already used.",
      "Return to the app and start again.",
    ],
    [
      "incomplete",
      400,
      "CONCEPT2 LINK · INCOMPLETE · HTTP 400",
      "This link is missing required parameters.",
      "Return to the app and start again.",
    ],
    [
      "notSignedIn",
      401,
      "CONCEPT2 LINK · NOT SIGNED IN · HTTP 401",
      "No Ergomatic session in this browser.",
      "Sign in to Ergomatic here, then start the link again from the app.",
    ],
    [
      "wrongAccount",
      403,
      "CONCEPT2 LINK · WRONG ACCOUNT · HTTP 403",
      "This link was started by a different Ergomatic account.",
      "Sign in as that account here, or start a new link from the account you're using.",
    ],
    [
      "unavailable",
      403,
      "CONCEPT2 LINK · UNAVAILABLE · HTTP 403",
      "Concept2 linking is not available right now.",
      "Return to the app.",
    ],
    [
      "failed",
      502,
      "CONCEPT2 LINK · FAILED · HTTP 502",
      "Concept2 could not complete the connection.",
      "Return to the app and try again.",
    ],
  ];

  it.each(cases)(
    "%s renders status %i, the mono label, the statement and the action line verbatim",
    (kind, status, label, statement, action) => {
      const page = renderCallbackPage(kind);
      expect(page.status).toBe(status);
      expect(page.html).toContain(label);
      expect(page.html).toContain(statement);
      // The action may carry a same-origin anchor around "here"; strip
      // tags before comparing the sentence.
      expect(page.html.replace(/<[^>]+>/g, "")).toContain(action);
    },
  );

  it("linked (200) names BOTH identities (D2) in the approved sentence", () => {
    const page = renderCallbackPage("linked", {
      c2Username: "jmorelli",
      email: "james@example.test",
    });
    expect(page.status).toBe(200);
    expect(page.html).toContain("CONCEPT2 LINK · LINKED · HTTP 200");
    expect(page.html.replace(/<[^>]+>/g, "")).toContain(
      "Concept2 jmorelli is now connected to Ergomatic james@example.test.",
    );
    expect(page.html.replace(/<[^>]+>/g, "")).toContain("Return to the app.");
  });

  it("escapes both identities: a <script> username never reaches the page raw", () => {
    const page = renderCallbackPage("linked", {
      c2Username: "<script>alert(1)</script>",
      email: 'a"b&c@example.test',
    });
    expect(page.html).not.toContain("<script>alert(1)</script>");
    expect(page.html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(page.html).toContain("a&quot;b&amp;c@example.test");
  });

  // Design §5: callback HTML carries NO subresource and NO outbound link —
  // the first external stylesheet or anchor would leak `code`/`state` in
  // Referer. Anchors, when present, are same-origin and relative.
  it.each([
    "linked",
    "alreadyLinked",
    "expired",
    "incomplete",
    "notSignedIn",
    "wrongAccount",
    "unavailable",
    "failed",
  ] as const)("%s carries no subresource and no outbound link", (kind) => {
    const { html } = renderCallbackPage(kind, {
      c2Username: "u",
      email: "e@x.test",
    });
    expect(html).not.toMatch(/<(link|script|img|iframe|object|embed|video|audio|source)\b/i);
    expect(html).not.toMatch(/\bsrc=/i);
    expect(html).not.toMatch(/@import|url\(/i);
    for (const m of html.matchAll(/href="([^"]*)"/g)) {
      expect(m[1]).toMatch(/^\/(?!\/)/);
    }
  });

  it("uses the approved palette and system fonts inline (no font or CSS fetch)", () => {
    const { html } = renderCallbackPage("expired");
    expect(html).toContain("#f6f3ec");
    expect(html).toContain("#1c1a17");
    expect(html).toContain("#5f5a50");
    expect(html).toContain("#d9d3c6");
    expect(html).toContain("#b5341f");
    expect(html).toContain("#fffdf8");
    expect(html).toContain("-apple-system");
    expect(html).toContain('<meta name="referrer" content="no-referrer">');
  });
});

describe("escapeHtml", () => {
  it("escapes the five HTML-significant characters and nothing else", () => {
    expect(escapeHtml(`<a href="x">Tom & Jerry's</a>`)).toBe(
      "&lt;a href=&quot;x&quot;&gt;Tom &amp; Jerry&#39;s&lt;/a&gt;",
    );
    expect(escapeHtml("plain.name@example.test")).toBe(
      "plain.name@example.test",
    );
  });
});
```

- [ ] **Step 2: Run** `... --project unit server/concept2/callbackPage.test.ts` → red (module missing).
- [ ] **Step 3: Implement** — create `app/server/concept2/callbackPage.ts`:

```ts
// Wave E PR1.75a (2026-09-02-concept2-pr175-app-bind-design.md §7, Gate 0
// APPROVED 2026-09-02): ONE server template for every Concept2 callback
// page — inline CSS, system fonts, ZERO network. Mechanical layout: a mono
// status label (`CONCEPT2 LINK · <LABEL> · HTTP <n>`), one bold statement,
// one action line. Palette is the app's: ground #f6f3ec, ink #1c1a17
// (15.67:1 on ground, computed), label #5f5a50 (6.18:1), rule #d9d3c6,
// accent #b5341f (a rule only, never text), panel #fffdf8.
//
// STANDING CONSTRAINT (design §5): this HTML carries NO subresource and NO
// outbound link — the callback URL carries `code` and `state`, and the
// first external stylesheet, font, image or anchor would leak them in
// `Referer` (RFC 9700 §4.2). The two "here" anchors are same-origin and
// relative, and every callback response ALSO sets
// `Referrer-Policy: no-referrer` (routes/concept2.ts). Request- or
// DB-derived values reach this template ONLY through `escapeHtml` — today
// the Linked page's two identities; every other page is literal copy.
//
// The copy is the design's table VERBATIM. Changing a word here is a
// design-gate question (CLAUDE.md: a spec that changes what a rower reads
// carries a Gate 0), not a code edit.

export type CallbackPageKind =
  | "linked"
  | "alreadyLinked"
  | "expired"
  | "incomplete"
  | "notSignedIn"
  | "wrongAccount"
  | "unavailable"
  | "failed";

const ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ESCAPES[c]!);
}

interface PageSpec {
  status: number;
  label: string;
  // Already-escaped HTML for the statement and action (literals, or the
  // Linked page's escaped identities).
  statement: string;
  action: string;
}

// This template emits NO anchors and NO subresources (design §5: the callback
// URL carries `code`; the first outbound link or stylesheet would leak it in
// Referer). "here" is plain text, matching the approved Gate 0 render.
const SIGN_IN_HERE = "here";

const LITERAL_PAGES: Record<Exclude<CallbackPageKind, "linked">, PageSpec> = {
  alreadyLinked: {
    status: 409,
    label: "ALREADY LINKED",
    statement:
      "That Concept2 account is already connected to a different Ergomatic account.",
    action: "Return to the app.",
  },
  expired: {
    status: 400,
    label: "EXPIRED",
    statement: "This link has expired or was already used.",
    action: "Return to the app and start again.",
  },
  incomplete: {
    status: 400,
    label: "INCOMPLETE",
    statement: "This link is missing required parameters.",
    action: "Return to the app and start again.",
  },
  notSignedIn: {
    status: 401,
    label: "NOT SIGNED IN",
    statement: "No Ergomatic session in this browser.",
    action: `Sign in to Ergomatic ${SIGN_IN_HERE}, then start the link again from the app.`,
  },
  wrongAccount: {
    status: 403,
    label: "WRONG ACCOUNT",
    statement: "This link was started by a different Ergomatic account.",
    action: `Sign in as that account ${SIGN_IN_HERE}, or start a new link from the account you're using.`,
  },
  unavailable: {
    status: 403,
    label: "UNAVAILABLE",
    statement: "Concept2 linking is not available right now.",
    action: "Return to the app.",
  },
  failed: {
    status: 502,
    label: "FAILED",
    statement: "Concept2 could not complete the connection.",
    action: "Return to the app and try again.",
  },
};

const STYLE = [
  "html{background:#f6f3ec;color:#1c1a17}",
  'body{margin:0;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;font-size:17px;line-height:1.45;-webkit-text-size-adjust:100%}',
  "main{max-width:34rem;margin:12vh auto 0;padding:0 20px}",
  "section{background:#fffdf8;border:1px solid #d9d3c6;border-top:3px solid #b5341f;border-radius:2px;padding:20px 22px 22px}",
  '.status{margin:0 0 14px;font-family:ui-monospace,"SF Mono",Menlo,Consolas,monospace;font-size:12px;letter-spacing:.06em;color:#5f5a50}',
  "h1{margin:0 0 14px;font-size:20px;line-height:1.3;font-weight:700}",
  ".action{margin:0;padding-top:14px;border-top:1px solid #d9d3c6;color:#5f5a50}",
  ".action a{color:#1c1a17;text-decoration:underline;text-underline-offset:2px}",
  "@media (orientation:landscape) and (max-height:500px){main{margin-top:4vh}}",
].join("");

function shell(spec: PageSpec): string {
  return (
    "<!doctype html>" +
    '<html lang="en"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width, initial-scale=1">' +
    '<meta name="referrer" content="no-referrer">' +
    `<title>Concept2 link · ${escapeHtml(spec.label.charAt(0) + spec.label.slice(1).toLowerCase())}</title>` +
    `<style>${STYLE}</style></head><body><main><section>` +
    `<p class="status">CONCEPT2 LINK · ${spec.label} · HTTP ${spec.status}</p>` +
    `<h1>${spec.statement}</h1>` +
    `<p class="action">${spec.action}</p>` +
    "</section></main></body></html>"
  );
}

export function renderCallbackPage(
  kind: CallbackPageKind,
  identities?: { c2Username: string; email: string },
): { status: number; html: string } {
  if (kind === "linked") {
    const c2 = escapeHtml(identities?.c2Username ?? "");
    const email = escapeHtml(identities?.email ?? "");
    const spec: PageSpec = {
      status: 200,
      label: "LINKED",
      // D2 (APPROVED): both identities, escaped — the shared-browser
      // fixation residual's only mitigation (design §Research).
      statement: `Concept2 ${c2} is now connected to Ergomatic ${email}.`,
      action: "Return to the app.",
    };
    return { status: 200, html: shell(spec) };
  }
  const spec = LITERAL_PAGES[kind];
  return { status: spec.status, html: shell(spec) };
}
```

- [ ] **Step 4: Run** → green. `pnpm lint && pnpm typecheck && pnpm format:check`.
- [ ] **Step 5: Contrast, recorded.** Run in `app/`:
  `node -e 'const L=h=>{const [r,g,b]=[1,3,5].map(i=>parseInt(h.slice(i,i+2),16)/255).map(c=>c<=0.03928?c/12.92:((c+0.055)/1.055)**2.4);return 0.2126*r+0.7152*g+0.0722*b};const cr=(a,b)=>{const x=L(a),y=L(b);return ((Math.max(x,y)+0.05)/(Math.min(x,y)+0.05)).toFixed(2)};for (const [f,g] of [["#1c1a17","#fffdf8"],["#5f5a50","#fffdf8"],["#1c1a17","#f6f3ec"],["#5f5a50","#f6f3ec"]]) console.log(f,"on",g,cr(f,g))'`
  Expected (computed at plan time): 17.08, 6.74, 15.67, 6.18. Put the four numbers in the task report and the PR Record.
- [ ] **Step 6: Mutation probes (after the combined commit):** replace `escapeHtml(identities?.c2Username ?? "")` with the raw value → "escapes both identities" fails (`expected … not to contain "<script>alert(1)</script>"`); change the Expired statement by one word → the `it.each` row fails naming the verbatim sentence; add `<link rel="stylesheet" href="https://fonts.googleapis.com/…">` to the shell → "carries no subresource" fails for all eight kinds.
- [ ] **Step 7: Commit** `feat(c2): styled callback page template (Gate 0 render, eight pages, escaped identities)` — this task compiles on its own (nothing imports it yet), so it can be its own commit before the combined one.

### Task 6: Routes — surface at mint, `linkClient`, per-surface redirect, the web ladder, `POST /exchange`, the disagreement refusal, D1 409; app/index wiring

**Files:**
- Modify: `app/server/routes/concept2.ts` (`:1-232` replaced by the block below; `:234-608` — the link GET/DELETE and upload routes — kept VERBATIM, only `requireUser` gains the `refuseAmbiguousAuth` neighbour on each of the three route registrations at `:236`, `:262`, `:276`)
- Modify: `app/server/app.ts` (`:38-42` AppDeps, `:106-117` mount)
- Modify: `app/server/index.ts` (`:133-145`)
- Test: `app/server/routes/concept2.test.ts` (harness `:22-113`; the `auth guard`, `availability`, `mint`, `callback` describes rewritten; a new `exchange` describe; the `link`/`upload` describes unchanged except the `deleteAttemptsFor` spy at `:414`)

**Interfaces:**

```ts
export const NATIVE_REDIRECT_URI = "haus.waffle.ergomatic://oauth/callback";
export const NATIVE_LINK_CLIENT = "webauth-1";
export interface Concept2RouterDeps {
  available: () => boolean; store: Concept2Store; logs: LogsStore; client: C2Client;
  requireUser: RequestHandler;
  sessions: SessionStore;      // NEW: route-local cookie resolver + the disagreement re-check
  webRedirectUri: string;      // NEW: new URL("/api/concept2/callback", siteUrl).href — was C2ClientConfig.redirectUri
  now?: () => Date;
}
```

- [ ] **Step 1: Failing tests.** In `concept2.test.ts`:

(a) Imports: add `import { AttemptNonceCollisionError } from "../stores/concept2.js";` and `import { SESSION_COOKIE } from "../auth/cookies.js";` and change the router import to `import { createConcept2Router, NATIVE_REDIRECT_URI, type Concept2RouterDeps } from "./concept2.js";`.

(b) Harness (replace `:43-44` and `:52-113`):

```ts
const asA = (req: request.Test) => req.set("Authorization", "Bearer token-a");
const asB = (req: request.Test) => req.set("Authorization", "Bearer token-b");
// The web surface: the SAME fake session tokens, carried as the
// `erg_session` cookie instead of a bearer.
const asACookie = (req: request.Test) =>
  req.set("Cookie", `${SESSION_COOKIE}=token-a`);
const asBCookie = (req: request.Test) =>
  req.set("Cookie", `${SESSION_COOKIE}=token-b`);

const WEB_REDIRECT_URI = "https://ergomatic.example/api/concept2/callback";

// Every method throws until a test stubs it — an un-stubbed call is a test
// bug, never a silent wrong-shape result. `authorizeUrl` echoes BOTH its
// arguments so a test can read the surface's redirect back off the URL.
function makeStubClient(): C2Client {
  return {
    authorizeUrl: vi.fn(
      (state: string, redirectUri: string) =>
        `https://c2.test/oauth/authorize?state=${state}&redirect_uri=${encodeURIComponent(redirectUri)}`,
    ),
    exchangeCode: vi.fn(async () => {
      throw new Error("exchangeCode not stubbed for this test");
    }),
    refreshTokens: vi.fn(async () => {
      throw new Error("refreshTokens not stubbed for this test");
    }),
    fetchMe: vi.fn(async () => {
      throw new Error("fetchMe not stubbed for this test");
    }),
    postResult: vi.fn(async () => {
      throw new Error("postResult not stubbed for this test");
    }),
  } as unknown as C2Client;
}

interface Harness {
  app: express.Express;
  store: Concept2Store;
  logs: LogsStore;
  client: C2Client;
  setAvailable: (v: boolean) => void;
}

function buildApp(
  overrides: {
    available?: boolean;
    store?: Concept2Store;
    logs?: LogsStore;
    client?: C2Client;
    now?: () => Date;
  } = {},
): Harness {
  const store = overrides.store ?? makeFakeConcept2Store();
  const logs = overrides.logs ?? makeFakeStores().logs;
  const client = overrides.client ?? makeStubClient();
  const state = { available: overrides.available ?? true };
  const sessions = fakeSessionStore();
  const deps: Concept2RouterDeps = {
    available: () => state.available,
    store,
    logs,
    client,
    requireUser: requireUser(sessions),
    sessions,
    webRedirectUri: WEB_REDIRECT_URI,
    now: overrides.now,
  };
  const app = express();
  app.use(express.json());
  app.use(createConcept2Router(deps));
  return {
    app,
    store,
    logs,
    client,
    setAvailable: (v: boolean) => {
      state.available = v;
    },
  };
}

function stubHappyExchange(client: C2Client, c2UserId = 2211): void {
  vi.mocked(client.exchangeCode).mockResolvedValue({
    ok: true,
    tokens: {
      accessToken: "at-1",
      refreshToken: "rt-1",
      expiresAt: new Date(Date.now() + 3600_000),
    },
  });
  vi.mocked(client.fetchMe).mockResolvedValue({
    ok: true,
    c2UserId,
    username: "jmorelli",
  });
}
```

and replace `mintAndGetState` (`:178-187`) with:

```ts
// Web mint by default (cookie); pass `asA`/`asB` for a native mint, which
// also needs the capability declaration.
async function mintAndGetState(
  app: express.Express,
  asUser: (req: request.Test) => request.Test = asACookie,
  body: Record<string, unknown> = { weightClass: "H" },
): Promise<string> {
  const res = await asUser(request(app).post("/api/concept2/connect").send(body));
  expect(res.status).toBe(200);
  return res.body.state as string;
}
const NATIVE_MINT = { weightClass: "H", linkClient: "webauth-1" };
```

(c) Replace the `auth guard` describe (`:191-215`):

```ts
describe("concept2 router: auth guard", () => {
  const routes: Array<[string, string]> = [
    ["post", "/api/concept2/connect"],
    ["post", "/api/concept2/exchange"],
    ["get", "/api/concept2/link"],
    ["delete", "/api/concept2/link"],
    ["post", `/api/concept2/results/${NON_EXISTENT_UUID}`],
  ];

  it.each(routes)("401s %s %s without a session", async (method, path) => {
    const { app } = buildApp();
    const agent = request(app) as unknown as Record<
      string,
      (p: string) => request.Test
    >;
    const res = await agent[method](path);
    expect(res.status).toBe(401);
  });

  it("callback: missing params answer 400 Incomplete BEFORE any session check (params precede identity)", async () => {
    const { app } = buildApp();
    const res = await request(app).get("/api/concept2/callback");
    expect(res.status).toBe(400);
    expect(res.type).toBe("text/html");
    expect(res.text).toContain("CONCEPT2 LINK · INCOMPLETE · HTTP 400");
  });

  // Design §1(b): both credentials present and resolving to DIFFERENT
  // users is a hard 400 on every /api/concept2/* route (scope (b)), where
  // requireUser app-wide only LOGS it (scope (a)). Nothing consumed.
  describe("ambiguous_auth: bearer A + cookie B", () => {
    const ambiguous = (req: request.Test) => asBCookie(asA(req));

    it("mint -> 400 {error:'ambiguous_auth'}, no attempt created", async () => {
      const store = makeFakeConcept2Store();
      const createSpy = vi.spyOn(store, "createAttempt");
      const { app } = buildApp({ store });
      const res = await ambiguous(
        request(app).post("/api/concept2/connect").send(NATIVE_MINT),
      );
      expect(res.status).toBe(400);
      expect(res.body).toStrictEqual({ error: "ambiguous_auth" });
      expect(createSpy).not.toHaveBeenCalled();
    });

    it("exchange -> 400 ambiguous_auth, nothing peeked or consumed", async () => {
      const store = makeFakeConcept2Store();
      const { app } = buildApp({ store });
      const state = await mintAndGetState(app, asA, NATIVE_MINT);
      const consumeSpy = vi.spyOn(store, "consumeAttemptFor");
      const res = await ambiguous(
        request(app).post("/api/concept2/exchange").send({ code: "c", state }),
      );
      expect(res.status).toBe(400);
      expect(res.body).toStrictEqual({ error: "ambiguous_auth" });
      expect(consumeSpy).not.toHaveBeenCalled();
      expect(await store.peekAttempt(state)).not.toBeNull();
    });

    it("callback -> 400 JSON ambiguous_auth (no approved page exists; only a non-browser caller can bearer a top-level GET), attempt untouched", async () => {
      const store = makeFakeConcept2Store();
      const client = makeStubClient();
      const { app } = buildApp({ store, client });
      const state = await mintAndGetState(app);
      const res = await ambiguous(
        request(app).get(`/api/concept2/callback?state=${state}&code=abc`),
      );
      expect(res.status).toBe(400);
      expect(res.body).toStrictEqual({ error: "ambiguous_auth" });
      expect(await store.peekAttempt(state)).not.toBeNull();
      expect(client.exchangeCode).not.toHaveBeenCalled();
    });

    it("bearer A + cookie A (same user) is NOT ambiguous: mint succeeds as native", async () => {
      const { app } = buildApp();
      const res = await asACookie(
        asA(request(app).post("/api/concept2/connect").send(NATIVE_MINT)),
      );
      expect(res.status).toBe(200);
      expect(
        new URL(res.body.authorizeUrl as string).searchParams.get(
          "redirect_uri",
        ),
      ).toBe(NATIVE_REDIRECT_URI);
    });
  });
});
```

(d) Replace the `availability matrix` describe's two callback cases (`:289-321`) with:

```ts
  it("callback: mid-hop unavailable -> 403 Unavailable page, exchange never called, and the attempt SURVIVES (availability consumes nothing)", async () => {
    const store = makeFakeConcept2Store();
    const client = makeStubClient();
    stubHappyExchange(client);
    const { app, setAvailable } = buildApp({ store, client });
    const state = await mintAndGetState(app);

    setAvailable(false);
    const res = await asACookie(
      request(app).get(`/api/concept2/callback?state=${state}&code=abc123`),
    );
    expect(res.status).toBe(403);
    expect(res.type).toBe("text/html");
    expect(res.text).toContain("CONCEPT2 LINK · UNAVAILABLE · HTTP 403");
    expect(client.exchangeCode).not.toHaveBeenCalled();
    expect(await store.getLink(userA.id)).toBeNull();
    expect(await store.peekAttempt(state)).not.toBeNull();

    // PR1's flag-off consume is GONE: the same state completes once the
    // flag is back, because the 403 above was a read-only refusal.
    setAvailable(true);
    const retry = await asACookie(
      request(app).get(`/api/concept2/callback?state=${state}&code=abc123`),
    );
    expect(retry.status).toBe(200);
    expect(await store.getLink(userA.id)).not.toBeNull();
  });

  it("callback: unavailable -> 403 with no peek and no consume call at all", async () => {
    const store = makeFakeConcept2Store();
    const peekSpy = vi.spyOn(store, "peekAttempt");
    const consumeSpy = vi.spyOn(store, "consumeAttemptFor");
    const { app } = buildApp({ available: false, store });
    const res = await request(app).get(
      "/api/concept2/callback?state=x&code=y",
    );
    expect(res.status).toBe(403);
    expect(peekSpy).not.toHaveBeenCalled();
    expect(consumeSpy).not.toHaveBeenCalled();
  });

  it("exchange: unavailable -> 403 before any store call", async () => {
    const store = makeFakeConcept2Store();
    const peekSpy = vi.spyOn(store, "peekAttempt");
    const { app } = buildApp({ available: false, store });
    const res = await asA(
      request(app).post("/api/concept2/exchange").send({ code: "c", state: "s" }),
    );
    expect(res.status).toBe(403);
    expect(res.body).toStrictEqual({ error: "unavailable" });
    expect(peekSpy).not.toHaveBeenCalled();
  });
```

(e) Replace the `mint` describe (`:358-422`):

```ts
describe("mint (POST /api/concept2/connect)", () => {
  it("cookie mint -> surface 'web', the WEB redirect in the URL, and the response carries state === the URL's state", async () => {
    const store = makeFakeConcept2Store();
    const { app } = buildApp({ store });
    const res = await asACookie(
      request(app).post("/api/concept2/connect").send({ weightClass: "L" }),
    );
    expect(res.status).toBe(200);
    const url = new URL(res.body.authorizeUrl as string);
    expect(url.searchParams.get("redirect_uri")).toBe(WEB_REDIRECT_URI);
    expect(res.body.state).toBe(url.searchParams.get("state"));
    expect(await store.peekAttempt(res.body.state as string)).toStrictEqual({
      userId: userA.id,
      weightClass: "L",
      surface: "web",
    });
  });

  it("bearer mint WITH linkClient 'webauth-1' -> surface 'native' and the NATIVE redirect", async () => {
    const store = makeFakeConcept2Store();
    const { app } = buildApp({ store });
    const res = await asA(
      request(app).post("/api/concept2/connect").send(NATIVE_MINT),
    );
    expect(res.status).toBe(200);
    const url = new URL(res.body.authorizeUrl as string);
    expect(url.searchParams.get("redirect_uri")).toBe(
      "haus.waffle.ergomatic://oauth/callback",
    );
    expect((await store.peekAttempt(res.body.state as string))?.surface).toBe(
      "native",
    );
  });

  // Design §3: a bearer mint must DECLARE it can receive the native
  // redirect — the capability precondition that makes the flag flip safe
  // against an installed build predating the WebAuth plugin.
  it("bearer mint WITHOUT linkClient -> 409 update_required, nothing minted", async () => {
    const store = makeFakeConcept2Store();
    const createSpy = vi.spyOn(store, "createAttempt");
    const { app } = buildApp({ store });
    const res = await asA(
      request(app).post("/api/concept2/connect").send({ weightClass: "H" }),
    );
    expect(res.status).toBe(409);
    expect(res.body).toStrictEqual({ error: "update_required" });
    expect(createSpy).not.toHaveBeenCalled();
  });

  it("bearer mint with a WRONG linkClient value -> 409 update_required", async () => {
    const { app } = buildApp();
    const res = await asA(
      request(app)
        .post("/api/concept2/connect")
        .send({ weightClass: "H", linkClient: "webauth-0" }),
    );
    expect(res.status).toBe(409);
  });

  it("a cookie mint ignores linkClient (web needs no declaration)", async () => {
    const store = makeFakeConcept2Store();
    const { app } = buildApp({ store });
    const res = await asACookie(
      request(app).post("/api/concept2/connect").send(NATIVE_MINT),
    );
    expect(res.status).toBe(200);
    expect((await store.peekAttempt(res.body.state as string))?.surface).toBe(
      "web",
    );
  });

  it("the minted nonce is 64 hex characters (randomBytes(32).toString('hex'))", async () => {
    const { app } = buildApp();
    const state = await mintAndGetState(app);
    expect(state).toMatch(/^[0-9a-f]{64}$/);
  });

  it("two mints produce DIFFERENT nonces", async () => {
    const { app } = buildApp();
    const first = await mintAndGetState(app);
    const second = await mintAndGetState(app, asBCookie);
    expect(first).not.toBe(second);
  });

  it("a re-mint REPLACES the user's live attempt: the old state is unknown afterwards", async () => {
    const store = makeFakeConcept2Store();
    const { app } = buildApp({ store });
    const first = await mintAndGetState(app);
    const second = await mintAndGetState(app);
    expect(await store.peekAttempt(first)).toBeNull();
    expect(await store.peekAttempt(second)).not.toBeNull();
  });

  // Design §2: a new nonce colliding with another row's PK surfaces as a
  // unique violation; the route retries ONCE with a fresh nonce, then 500s.
  it("a PK collision on the first nonce retries once with a DIFFERENT nonce and succeeds", async () => {
    const store = makeFakeConcept2Store();
    const realCreate = store.createAttempt.bind(store);
    const createSpy = vi
      .spyOn(store, "createAttempt")
      .mockRejectedValueOnce(new AttemptNonceCollisionError())
      .mockImplementation(realCreate);
    const { app } = buildApp({ store });
    const res = await asACookie(
      request(app).post("/api/concept2/connect").send({ weightClass: "H" }),
    );
    expect(res.status).toBe(200);
    expect(createSpy).toHaveBeenCalledTimes(2);
    const [first, second] = createSpy.mock.calls.map((c) => c[0].nonce);
    expect(first).not.toBe(second);
    expect(res.body.state).toBe(second);
  });

  it("two consecutive PK collisions -> 500, no third try", async () => {
    const store = makeFakeConcept2Store();
    const createSpy = vi
      .spyOn(store, "createAttempt")
      .mockRejectedValue(new AttemptNonceCollisionError());
    const { app } = buildApp({ store });
    const res = await asACookie(
      request(app).post("/api/concept2/connect").send({ weightClass: "H" }),
    );
    expect(res.status).toBe(500);
    expect(createSpy).toHaveBeenCalledTimes(2);
  });

  it("rejects a weightClass outside H|L, field-named", async () => {
    const { app } = buildApp();
    const res = await asACookie(
      request(app).post("/api/concept2/connect").send({ weightClass: "X" }),
    );
    expect(res.status).toBe(400);
    expect(res.body.field).toBe("weightClass");
  });

  it("a request with no body at all (req.body left undefined by express.json) is treated as empty, not a crash", async () => {
    const { app } = buildApp();
    const res = await asACookie(request(app).post("/api/concept2/connect"));
    expect(res.status).toBe(400);
    expect(res.body.field).toBe("weightClass");
  });

  // Pinned with the INDEPENDENT literal 900_000 (15 minutes in ms), not
  // the imported `ATTEMPT_MAX_AGE_MS` — retuning the production constant
  // would otherwise retune this assertion right along with it (RF21).
  it("garbage-collects expired attempts before creating a new one (no cron); per-user replacement is the upsert's, not a delete", async () => {
    const store = makeFakeConcept2Store();
    const gcExpired = vi.spyOn(store, "deleteExpiredAttempts");
    const { app } = buildApp({ store });
    await asACookie(
      request(app).post("/api/concept2/connect").send({ weightClass: "H" }),
    );
    expect(gcExpired).toHaveBeenCalledWith(900_000);
  });
});
```

(f) Replace the `callback` describe (`:424-617`):

```ts
describe("callback (GET /api/concept2/callback) — the web ladder, design §5", () => {
  it("happy path: the minting user's cookie -> 200 Linked page naming BOTH identities, link written, exchange used the WEB redirect", async () => {
    const store = makeFakeConcept2Store();
    const client = makeStubClient();
    stubHappyExchange(client);
    const { app } = buildApp({ store, client });
    const state = await mintAndGetState(app);

    const res = await asACookie(
      request(app).get(`/api/concept2/callback?state=${state}&code=abc123`),
    );
    expect(res.status).toBe(200);
    expect(res.type).toBe("text/html");
    expect(res.text).toContain("CONCEPT2 LINK · LINKED · HTTP 200");
    expect(res.text.replace(/<[^>]+>/g, "")).toContain(
      "Concept2 jmorelli is now connected to Ergomatic a@x.com.",
    );
    expect(client.exchangeCode).toHaveBeenCalledWith("abc123", WEB_REDIRECT_URI);

    const link = await store.getLink(userA.id);
    expect(link?.weightClass).toBe("H");
    expect(link?.c2UserId).toBe(2211);
  });

  it("no cookie session -> 401 Not signed in, attempt NOT consumed, exchange never called", async () => {
    const store = makeFakeConcept2Store();
    const client = makeStubClient();
    const { app } = buildApp({ store, client });
    const state = await mintAndGetState(app);

    const res = await request(app).get(
      `/api/concept2/callback?state=${state}&code=abc123`,
    );
    expect(res.status).toBe(401);
    expect(res.text).toContain("CONCEPT2 LINK · NOT SIGNED IN · HTTP 401");
    expect(await store.peekAttempt(state)).not.toBeNull();
    expect(client.exchangeCode).not.toHaveBeenCalled();
  });

  it("an EMPTY-valued cookie is no session: 401, not consumed", async () => {
    const store = makeFakeConcept2Store();
    const { app } = buildApp({ store });
    const state = await mintAndGetState(app);
    const res = await request(app)
      .get(`/api/concept2/callback?state=${state}&code=abc123`)
      .set("Cookie", `${SESSION_COOKIE}=`);
    expect(res.status).toBe(401);
    expect(await store.peekAttempt(state)).not.toBeNull();
  });

  // Exit criterion 1: the rightful user's attempt SURVIVES a wrong-principal
  // presentation (the DoS leg), and the token exchange is never called.
  it("a DIFFERENT user's cookie -> 403 Wrong account, attempt NOT consumed, exchange never called, no link for anyone", async () => {
    const store = makeFakeConcept2Store();
    const client = makeStubClient();
    stubHappyExchange(client);
    const { app } = buildApp({ store, client });
    const state = await mintAndGetState(app);

    const res = await asBCookie(
      request(app).get(`/api/concept2/callback?state=${state}&code=abc123`),
    );
    expect(res.status).toBe(403);
    expect(res.text).toContain("CONCEPT2 LINK · WRONG ACCOUNT · HTTP 403");
    expect(await store.peekAttempt(state)).not.toBeNull();
    expect(client.exchangeCode).not.toHaveBeenCalled();
    expect(await store.getLink(userA.id)).toBeNull();
    expect(await store.getLink(userB.id)).toBeNull();

    // The rightful user can still complete afterwards.
    const rightful = await asACookie(
      request(app).get(`/api/concept2/callback?state=${state}&code=abc123`),
    );
    expect(rightful.status).toBe(200);
  });

  // Exit criterion 2: a native-minted nonce cannot complete on the web
  // surface, and is not consumed by the attempt.
  it("a NATIVE-minted state on the web callback -> 400 Expired, NOT consumed, exchange never called", async () => {
    const store = makeFakeConcept2Store();
    const client = makeStubClient();
    const { app } = buildApp({ store, client });
    const state = await mintAndGetState(app, asA, NATIVE_MINT);

    const res = await asACookie(
      request(app).get(`/api/concept2/callback?state=${state}&code=abc123`),
    );
    expect(res.status).toBe(400);
    expect(res.text).toContain("CONCEPT2 LINK · EXPIRED · HTTP 400");
    expect(await store.peekAttempt(state)).not.toBeNull();
    expect(client.exchangeCode).not.toHaveBeenCalled();
  });

  it("an unknown state -> 400 Expired, exchange never called", async () => {
    const client = makeStubClient();
    const { app } = buildApp({ client });
    const res = await asACookie(
      request(app).get("/api/concept2/callback?state=nope&code=abc123"),
    );
    expect(res.status).toBe(400);
    expect(res.text).toContain("CONCEPT2 LINK · EXPIRED · HTTP 400");
    expect(client.exchangeCode).not.toHaveBeenCalled();
  });

  it("missing state or code -> 400 Incomplete", async () => {
    const { app } = buildApp();
    const res1 = await asACookie(
      request(app).get("/api/concept2/callback?code=abc"),
    );
    expect(res1.status).toBe(400);
    expect(res1.text).toContain("CONCEPT2 LINK · INCOMPLETE · HTTP 400");
    const res2 = await asACookie(
      request(app).get("/api/concept2/callback?state=xyz"),
    );
    expect(res2.status).toBe(400);
    expect(res2.text).toContain("CONCEPT2 LINK · INCOMPLETE · HTTP 400");
  });

  it("a second use of the same nonce -> 400 Expired (single-use)", async () => {
    const store = makeFakeConcept2Store();
    const client = makeStubClient();
    stubHappyExchange(client);
    const { app } = buildApp({ store, client });
    const state = await mintAndGetState(app);

    const first = await asACookie(
      request(app).get(`/api/concept2/callback?state=${state}&code=abc123`),
    );
    expect(first.status).toBe(200);
    const second = await asACookie(
      request(app).get(`/api/concept2/callback?state=${state}&code=abc123`),
    );
    expect(second.status).toBe(400);
    expect(client.exchangeCode).toHaveBeenCalledTimes(1);
  });

  // Design §5 step 7: consumeAttemptFor is the AUTHORITY; a null between
  // peek and consume (a concurrent completion or a re-mint won) is 400
  // without any exchange.
  it("a concurrent consume between peek and consume -> 400 Expired, exchange never called", async () => {
    const store = makeFakeConcept2Store();
    const client = makeStubClient();
    stubHappyExchange(client);
    const { app } = buildApp({ store, client });
    const state = await mintAndGetState(app);
    vi.spyOn(store, "consumeAttemptFor").mockResolvedValueOnce(null);

    const res = await asACookie(
      request(app).get(`/api/concept2/callback?state=${state}&code=abc123`),
    );
    expect(res.status).toBe(400);
    expect(client.exchangeCode).not.toHaveBeenCalled();
  });

  // Pinned with INDEPENDENT literal ms values (14:59 = 899_000, 15:01 =
  // 901_000), never the imported `ATTEMPT_MAX_AGE_MS` (RF21).
  it("an attempt 14:59 old is still fresh (literal ms)", async () => {
    let t = 0;
    const clock = () => new Date(t);
    const store = makeFakeConcept2Store(clock);
    const client = makeStubClient();
    stubHappyExchange(client);
    const { app } = buildApp({ store, client });
    const state = await mintAndGetState(app);
    t += 899_000;
    const res = await asACookie(
      request(app).get(`/api/concept2/callback?state=${state}&code=abc123`),
    );
    expect(res.status).toBe(200);
  });

  it("an attempt 15:01 old -> 400 Expired, the row deleted (right principal, stale), exchange never called", async () => {
    let t = 0;
    const clock = () => new Date(t);
    const store = makeFakeConcept2Store(clock);
    const client = makeStubClient();
    const { app } = buildApp({ store, client });
    const state = await mintAndGetState(app);
    t += 901_000;
    const res = await asACookie(
      request(app).get(`/api/concept2/callback?state=${state}&code=abc123`),
    );
    expect(res.status).toBe(400);
    expect(res.text).toContain("CONCEPT2 LINK · EXPIRED · HTTP 400");
    expect(await store.peekAttempt(state)).toBeNull();
    expect(client.exchangeCode).not.toHaveBeenCalled();
  });

  it("exchange failure -> 502 Failed, and the nonce is not reusable", async () => {
    const store = makeFakeConcept2Store();
    const client = makeStubClient();
    vi.mocked(client.exchangeCode).mockResolvedValue({
      ok: false,
      grantDead: false,
    });
    const { app } = buildApp({ store, client });
    const state = await mintAndGetState(app);
    const res = await asACookie(
      request(app).get(`/api/concept2/callback?state=${state}&code=abc123`),
    );
    expect(res.status).toBe(502);
    expect(res.text).toContain("CONCEPT2 LINK · FAILED · HTTP 502");
    const retry = await asACookie(
      request(app).get(`/api/concept2/callback?state=${state}&code=abc123`),
    );
    expect(retry.status).toBe(400);
    expect(await store.getLink(userA.id)).toBeNull();
  });

  it("fetchMe failure -> 502 Failed", async () => {
    const store = makeFakeConcept2Store();
    const client = makeStubClient();
    stubHappyExchange(client);
    vi.mocked(client.fetchMe).mockResolvedValue({ ok: false });
    const { app } = buildApp({ store, client });
    const state = await mintAndGetState(app);
    const res = await asACookie(
      request(app).get(`/api/concept2/callback?state=${state}&code=abc123`),
    );
    expect(res.status).toBe(502);
    expect(await store.getLink(userA.id)).toBeNull();
  });

  // D1 (APPROVED): the Concept2 account is already connected to a DIFFERENT
  // Ergomatic user -> 409 page, tokens discarded, no link for the presenter.
  it("D1: a Concept2 account already linked to another user -> 409 Already linked, no link written for the presenter", async () => {
    const store = makeFakeConcept2Store();
    await store.upsertLink(userB.id, freshLink({ c2UserId: 2211 }));
    const client = makeStubClient();
    stubHappyExchange(client, 2211);
    const { app } = buildApp({ store, client });
    const state = await mintAndGetState(app);
    const res = await asACookie(
      request(app).get(`/api/concept2/callback?state=${state}&code=abc123`),
    );
    expect(res.status).toBe(409);
    expect(res.text).toContain("CONCEPT2 LINK · ALREADY LINKED · HTTP 409");
    expect(await store.getLink(userA.id)).toBeNull();
    expect((await store.getLink(userB.id))?.c2UserId).toBe(2211);
  });

  it("a username-less fetchMe falls back to the numeric id on the Linked page (observation 3)", async () => {
    const store = makeFakeConcept2Store();
    const client = makeStubClient();
    stubHappyExchange(client);
    vi.mocked(client.fetchMe).mockResolvedValue({
      ok: true,
      c2UserId: 2211,
      username: null,
    });
    const { app } = buildApp({ store, client });
    const state = await mintAndGetState(app);
    const res = await asACookie(
      request(app).get(`/api/concept2/callback?state=${state}&code=abc123`),
    );
    expect(res.status).toBe(200);
    expect(res.text.replace(/<[^>]+>/g, "")).toContain(
      "Concept2 #2211 is now connected to Ergomatic a@x.com.",
    );
  });

  it("relinking clears a previously-set needsReauthAt", async () => {
    const store = makeFakeConcept2Store();
    await store.upsertLink(userA.id, freshLink());
    await store.withLinkLock(userA.id, async () => ({
      action: "flagReauth" as const,
      result: undefined,
    }));
    expect((await store.getLink(userA.id))?.needsReauthAt).not.toBeNull();
    const client = makeStubClient();
    stubHappyExchange(client, LINK_INPUT.c2UserId);
    const { app } = buildApp({ store, client });
    const state = await mintAndGetState(app);
    const res = await asACookie(
      request(app).get(`/api/concept2/callback?state=${state}&code=abc123`),
    );
    expect(res.status).toBe(200);
    expect((await store.getLink(userA.id))?.needsReauthAt).toBeNull();
  });

  // Design §5: every response sets Referrer-Policy: no-referrer — the URL
  // carries `code` and `state` (RFC 9700 §4.2).
  it("sets Referrer-Policy: no-referrer on EVERY callback response (403/400/401/403/200/502)", async () => {
    const store = makeFakeConcept2Store();
    const client = makeStubClient();
    stubHappyExchange(client);
    const { app, setAvailable } = buildApp({ store, client });
    const state = await mintAndGetState(app);
    const responses: request.Response[] = [];
    setAvailable(false);
    responses.push(await request(app).get("/api/concept2/callback?state=x&code=y"));
    setAvailable(true);
    responses.push(await request(app).get("/api/concept2/callback"));
    responses.push(
      await request(app).get(`/api/concept2/callback?state=${state}&code=c`),
    );
    responses.push(
      await asBCookie(
        request(app).get(`/api/concept2/callback?state=${state}&code=c`),
      ),
    );
    responses.push(
      await asACookie(
        request(app).get(`/api/concept2/callback?state=${state}&code=c`),
      ),
    );
    vi.mocked(client.exchangeCode).mockResolvedValue({ ok: false, grantDead: false });
    const again = await mintAndGetState(app);
    responses.push(
      await asACookie(
        request(app).get(`/api/concept2/callback?state=${again}&code=c`),
      ),
    );
    expect(responses.map((r) => r.status)).toStrictEqual([
      403, 400, 401, 403, 200, 502,
    ]);
    for (const r of responses) {
      expect(r.headers["referrer-policy"]).toBe("no-referrer");
    }
  });

  it("never reflects state/code into the HTML response", async () => {
    const { app } = buildApp();
    const res = await asACookie(
      request(app).get(
        `/api/concept2/callback?state=${encodeURIComponent("<script>alert(1)</script>")}&code=${encodeURIComponent("<img src=x onerror=alert(2)>")}`,
      ),
    );
    expect(res.text).not.toContain("<script>alert(1)</script>");
    expect(res.text).not.toContain("<img src=x onerror=alert(2)>");
  });

  it("the Linked page escapes a hostile Concept2 username end-to-end", async () => {
    const store = makeFakeConcept2Store();
    const client = makeStubClient();
    stubHappyExchange(client);
    vi.mocked(client.fetchMe).mockResolvedValue({
      ok: true,
      c2UserId: 2211,
      username: "<script>alert(1)</script>",
    });
    const { app } = buildApp({ store, client });
    const state = await mintAndGetState(app);
    const res = await asACookie(
      request(app).get(`/api/concept2/callback?state=${state}&code=abc123`),
    );
    expect(res.status).toBe(200);
    expect(res.text).not.toContain("<script>alert(1)</script>");
    expect(res.text).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
  });
});
```

(g) NEW `exchange` describe (insert before the `link` describe):

```ts
describe("exchange (POST /api/concept2/exchange) — the native ladder, design §6", () => {
  it("happy path: same bearer -> 200 {linked:true, c2UserId, weightClass}, exchange used the NATIVE redirect, link written", async () => {
    const store = makeFakeConcept2Store();
    const client = makeStubClient();
    stubHappyExchange(client);
    const { app } = buildApp({ store, client });
    const state = await mintAndGetState(app, asA, NATIVE_MINT);
    const res = await asA(
      request(app).post("/api/concept2/exchange").send({ code: "abc123", state }),
    );
    expect(res.status).toBe(200);
    expect(res.body).toStrictEqual({
      linked: true,
      c2UserId: 2211,
      weightClass: "H",
    });
    expect(client.exchangeCode).toHaveBeenCalledWith(
      "abc123",
      "haus.waffle.ergomatic://oauth/callback",
    );
    expect((await store.getLink(userA.id))?.c2UserId).toBe(2211);
    expect(JSON.stringify(res.body)).not.toContain("at-1");
  });

  // The echo-independence test (design §Testing): the attempt is located by
  // the BODY's state alone — nothing else on the request names it.
  it("locates the attempt from body.state only (no query, no header)", async () => {
    const store = makeFakeConcept2Store();
    const client = makeStubClient();
    stubHappyExchange(client);
    const { app } = buildApp({ store, client });
    const state = await mintAndGetState(app, asA, NATIVE_MINT);
    const wrong = await asA(
      request(app)
        .post(`/api/concept2/exchange?state=${state}`)
        .send({ code: "abc123", state: "not-the-state" }),
    );
    expect(wrong.status).toBe(400);
    expect(wrong.body).toStrictEqual({ error: "invalid_state" });
    const right = await asA(
      request(app).post("/api/concept2/exchange").send({ code: "abc123", state }),
    );
    expect(right.status).toBe(200);
  });

  it("body shape: missing code or state -> 400 field-named, nothing peeked", async () => {
    const store = makeFakeConcept2Store();
    const peekSpy = vi.spyOn(store, "peekAttempt");
    const { app } = buildApp({ store });
    const noCode = await asA(
      request(app).post("/api/concept2/exchange").send({ state: "s" }),
    );
    expect(noCode.status).toBe(400);
    expect(noCode.body.field).toBe("code");
    const noState = await asA(
      request(app).post("/api/concept2/exchange").send({ code: "c" }),
    );
    expect(noState.status).toBe(400);
    expect(noState.body.field).toBe("state");
    expect(peekSpy).not.toHaveBeenCalled();
  });

  // Step 2b: the request states its own credential class before anything
  // is peeked.
  it("a COOKIE caller -> 400 wrong_surface before any peek", async () => {
    const store = makeFakeConcept2Store();
    const { app } = buildApp({ store });
    const state = await mintAndGetState(app, asA, NATIVE_MINT);
    const peekSpy = vi.spyOn(store, "peekAttempt");
    const res = await asACookie(
      request(app).post("/api/concept2/exchange").send({ code: "c", state }),
    );
    expect(res.status).toBe(400);
    expect(res.body).toStrictEqual({ error: "wrong_surface" });
    expect(peekSpy).not.toHaveBeenCalled();
    expect(await store.peekAttempt(state)).not.toBeNull();
  });

  it("an unknown state -> 400 invalid_state", async () => {
    const { app } = buildApp();
    const res = await asA(
      request(app).post("/api/concept2/exchange").send({ code: "c", state: "nope" }),
    );
    expect(res.status).toBe(400);
    expect(res.body).toStrictEqual({ error: "invalid_state" });
  });

  // Exit criterion 2, the other direction.
  it("a WEB-minted state -> 400 wrong_surface, NOT consumed, exchange never called", async () => {
    const store = makeFakeConcept2Store();
    const client = makeStubClient();
    const { app } = buildApp({ store, client });
    const state = await mintAndGetState(app);
    const res = await asA(
      request(app).post("/api/concept2/exchange").send({ code: "c", state }),
    );
    expect(res.status).toBe(400);
    expect(res.body).toStrictEqual({ error: "wrong_surface" });
    expect(await store.peekAttempt(state)).not.toBeNull();
    expect(client.exchangeCode).not.toHaveBeenCalled();
  });

  // Exit criterion 1, native.
  it("a DIFFERENT user's bearer -> 403 principal_mismatch, NOT consumed, exchange never called, no link", async () => {
    const store = makeFakeConcept2Store();
    const client = makeStubClient();
    stubHappyExchange(client);
    const { app } = buildApp({ store, client });
    const state = await mintAndGetState(app, asA, NATIVE_MINT);
    const res = await asB(
      request(app).post("/api/concept2/exchange").send({ code: "c", state }),
    );
    expect(res.status).toBe(403);
    expect(res.body).toStrictEqual({ error: "principal_mismatch" });
    expect(await store.peekAttempt(state)).not.toBeNull();
    expect(client.exchangeCode).not.toHaveBeenCalled();
    expect(await store.getLink(userB.id)).toBeNull();
    expect(await store.getLink(userA.id)).toBeNull();
  });

  it("a concurrent consume between peek and consume -> 400 invalid_state, exchange never called", async () => {
    const store = makeFakeConcept2Store();
    const client = makeStubClient();
    stubHappyExchange(client);
    const { app } = buildApp({ store, client });
    const state = await mintAndGetState(app, asA, NATIVE_MINT);
    vi.spyOn(store, "consumeAttemptFor").mockResolvedValueOnce(null);
    const res = await asA(
      request(app).post("/api/concept2/exchange").send({ code: "c", state }),
    );
    expect(res.status).toBe(400);
    expect(res.body).toStrictEqual({ error: "invalid_state" });
    expect(client.exchangeCode).not.toHaveBeenCalled();
  });

  it("an attempt 15:01 old -> 400 expired (row deleted), 14:59 -> 200 (literal ms)", async () => {
    let t = 0;
    const clock = () => new Date(t);
    const store = makeFakeConcept2Store(clock);
    const client = makeStubClient();
    stubHappyExchange(client);
    const { app } = buildApp({ store, client });
    const stale = await mintAndGetState(app, asA, NATIVE_MINT);
    t += 901_000;
    const expired = await asA(
      request(app).post("/api/concept2/exchange").send({ code: "c", state: stale }),
    );
    expect(expired.status).toBe(400);
    expect(expired.body).toStrictEqual({ error: "expired" });
    expect(await store.peekAttempt(stale)).toBeNull();

    const fresh = await mintAndGetState(app, asA, NATIVE_MINT);
    t += 899_000;
    const ok = await asA(
      request(app).post("/api/concept2/exchange").send({ code: "c", state: fresh }),
    );
    expect(ok.status).toBe(200);
  });

  it("exchange failure -> 502 c2_error; fetchMe failure -> 502 c2_error", async () => {
    const store = makeFakeConcept2Store();
    const client = makeStubClient();
    vi.mocked(client.exchangeCode).mockResolvedValue({ ok: false, grantDead: false });
    const { app } = buildApp({ store, client });
    const s1 = await mintAndGetState(app, asA, NATIVE_MINT);
    const r1 = await asA(
      request(app).post("/api/concept2/exchange").send({ code: "c", state: s1 }),
    );
    expect(r1.status).toBe(502);
    expect(r1.body).toStrictEqual({ error: "c2_error" });

    stubHappyExchange(client);
    vi.mocked(client.fetchMe).mockResolvedValue({ ok: false });
    const s2 = await mintAndGetState(app, asA, NATIVE_MINT);
    const r2 = await asA(
      request(app).post("/api/concept2/exchange").send({ code: "c", state: s2 }),
    );
    expect(r2.status).toBe(502);
    expect(r2.body).toStrictEqual({ error: "c2_error" });
    expect(await store.getLink(userA.id)).toBeNull();
  });

  it("D1: the Concept2 account already belongs to another user -> 409 already_linked_elsewhere, no link written", async () => {
    const store = makeFakeConcept2Store();
    await store.upsertLink(userB.id, freshLink({ c2UserId: 2211 }));
    const client = makeStubClient();
    stubHappyExchange(client, 2211);
    const { app } = buildApp({ store, client });
    const state = await mintAndGetState(app, asA, NATIVE_MINT);
    const res = await asA(
      request(app).post("/api/concept2/exchange").send({ code: "c", state }),
    );
    expect(res.status).toBe(409);
    expect(res.body).toStrictEqual({ error: "already_linked_elsewhere" });
    expect(await store.getLink(userA.id)).toBeNull();
  });
});
```

(h) In the `link`/`upload` describes: `:414` `vi.spyOn(store, "deleteAttemptsFor")` is inside the mint describe already replaced above — nothing else references retired methods. Grep the file for `consumeAttempt(` and `deleteAttemptsFor` → zero.

- [ ] **Step 2: Run** `... --project unit server/routes/concept2.test.ts` → red (typecheck first: `NATIVE_REDIRECT_URI`, `sessions`, `webRedirectUri`, `peekAttempt`).
- [ ] **Step 3: Implement the router.** Replace `routes/concept2.ts:1-232` with:

```ts
import { randomBytes } from "node:crypto";
import { Router, type RequestHandler, type Request } from "express";
import { bearerToken, cookieToken } from "../auth/middleware.js";
import type { SessionStore, SessionUser } from "../auth/sessions.js";
import { renderCallbackPage } from "../concept2/callbackPage.js";
import type { C2Client } from "../concept2/client.js";
import {
  buildC2Payload,
  eligibilityFailure,
  type SessionLogRow,
} from "../concept2/mapping.js";
import {
  AttemptNonceCollisionError,
  Concept2LinkConflictError,
  type Concept2Store,
  type LinkSurface,
  type WeightClass,
} from "../stores/concept2.js";
import type { LogsStore } from "../stores/logs.js";
import { tzError } from "./data.js";

// Wave E PR1 Task 6, rebuilt at PR1.75a
// (2026-09-02-concept2-pr175-app-bind-design.md §1-§7). This router NEVER
// carries its own `router.use("/api", requireUser)` the way
// `routes/data.ts` does (data.ts:826): the web callback is authenticated by
// a ROUTE-LOCAL cookie resolver (§5) so it can keep its HTML responses and
// its pinned ladder order — `requireUser` answers bare JSON 401 and would
// run before that order — while every other route takes `requireUser`
// per-route. Mount order (app.ts: beside `createAuthRouter`, before the
// data router) is what keeps the data router's own gate away from the
// callback's HTML 401.
//
// Both completion routes refuse a foreign principal BEFORE consuming the
// attempt and BEFORE any Concept2 call (exit criterion 1); a nonce minted
// on one surface cannot complete on the other (exit criterion 2); the
// store's single conditional DELETE (`consumeAttemptFor`) is the authority
// on consumption — a wrong principal or surface consumes nothing by
// construction, not by step order.
export interface Concept2RouterDeps {
  // Flag AND both creds — computed at boot, closed over (plan's own
  // "Availability" line). A capability gate: every route re-checks it,
  // never just the client's rendering.
  available: () => boolean;
  store: Concept2Store;
  logs: LogsStore;
  client: C2Client;
  requireUser: RequestHandler;
  // The route-local cookie resolver (§5) and the disagreement re-check
  // (§1(b)) resolve sessions themselves.
  sessions: SessionStore;
  // The WEB surface's redirect_uri (index.ts: new URL("/api/concept2/
  // callback", siteUrl).href — the Google precedent). The native one is
  // the constant below.
  webRedirectUri: string;
  // Injectable clock for token-freshness expiry tests — mirrors the
  // concept2 store's own `clock` injection seam (testing/fakes.ts).
  now?: () => Date;
}

// Design §3: the RFC 8252 §7.1 reverse-domain scheme of the bundle id
// `haus.waffle.ergomatic` (project.pbxproj:321). Registered at log-dev
// 2026-09-02 (James); live-portal registration is a cutover step beside
// write approval (ROADMAP's C2 register row). Until PR1.75b ships the
// ASWebAuthenticationSession plugin nothing on the device can receive it —
// the design's named intentional interval, harmless while the flag is off.
export const NATIVE_REDIRECT_URI = "haus.waffle.ergomatic://oauth/callback";

// Design §3: a bearer mint must DECLARE it can receive the native redirect.
// A capability, not a version: it only ever narrows, and it makes the flag
// flip safe by construction against an installed build predating the
// WebAuth plugin (no such build can ever be handed a
// `haus.waffle.ergomatic://` URL). Cookie mints carry no declaration.
export const NATIVE_LINK_CLIENT = "webauth-1";

// Spec §Architecture 3: a single-use, 15-minute attempt nonce correlates
// the completion request to its mint; the completing principal is checked
// separately (this file's ladders). Expiry/GC is the server's own job,
// never a cron (mint's own sweep below).
const ATTEMPT_MAX_AGE_MS = 15 * 60 * 1000;
// Plan deviation 4: refresh 60s ahead of the wire's own `expires_at`, so an
// in-flight request never races a token that expires mid-call.
const TOKEN_REFRESH_SKEW_MS = 60 * 1000;

const WEIGHT_CLASSES: readonly WeightClass[] = ["H", "L"];

// Same shape as `routes/data.ts`'s own `UUID_RE` (that file's own comment:
// a malformed uuid literal 500s Postgres rather than finding no row).
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isRec(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function unavailableJson(res: Parameters<RequestHandler>[1]): void {
  res.status(403).json({ error: "unavailable" });
}

function notFoundJson(res: Parameters<RequestHandler>[1]): void {
  res.status(404).json({ error: "not found" });
}

// Callback responses are a browser navigation, never JSON. Every one sets
// `Referrer-Policy: no-referrer` (design §5): the callback URL carries
// `code` and `state` (RFC 9700 §4.2), and the template itself carries no
// subresource and no outbound link (concept2/callbackPage.ts).
function sendPage(
  res: Parameters<RequestHandler>[1],
  page: { status: number; html: string },
): void {
  res.setHeader("Referrer-Policy", "no-referrer");
  res.status(page.status).type("html").send(page.html);
}

// Row -> `SessionLogRow` (concept2/mapping.ts), an independent, own-bounds
// mirror of the store's full row (that module's own comment on
// `SessionLogRow`) — never the full `LogsStore.get()` type, and
// `machineSummary` is cast here rather than at every call site: the real
// store's column is untyped jsonb (`db/schema.ts`'s own comment), so its
// Drizzle-inferred type is not `Record<string, unknown> | null` by
// construction, only by the same "sanity, not truth" trust boundary this
// module's `buildC2Payload` already documents.
function toMappingRow(row: {
  loggedAt: Date;
  completedAt: Date | null;
  tz: string | null;
  workSeconds: number | null;
  workMeters: number | null;
  restSeconds: number | null;
  restMeters: number | null;
  machineSummary: unknown;
  deviceName: string | null;
  endedBy: string | null;
}): SessionLogRow {
  return {
    loggedAt: row.loggedAt,
    completedAt: row.completedAt,
    tz: row.tz,
    workSeconds: row.workSeconds,
    workMeters: row.workMeters,
    restSeconds: row.restSeconds,
    restMeters: row.restMeters,
    machineSummary: row.machineSummary as Record<string, unknown> | null,
    deviceName: row.deviceName,
    endedBy: row.endedBy,
  };
}

export function createConcept2Router({
  available,
  store,
  logs,
  client,
  requireUser,
  sessions,
  webRedirectUri,
  now = () => new Date(),
}: Concept2RouterDeps): Router {
  const router = Router();

  async function resolveCookieSession(req: Request): Promise<SessionUser | null> {
    const token = cookieToken(req);
    if (token === undefined) return null;
    const resolved = await sessions.resolveSession(token);
    return resolved?.user ?? null;
  }

  async function resolveBearerSession(req: Request): Promise<SessionUser | null> {
    const token = bearerToken(req);
    if (token === undefined || token === "") return null;
    const resolved = await sessions.resolveSession(token);
    return resolved?.user ?? null;
  }

  // Design §1(b), scope (b): on /api/concept2/* (dark behind the flag)
  // "both present AND resolving to DIFFERENT users" is a hard 400 —
  // `requireUser` (scope (a), app-wide) only LOGS it, because whether the
  // native jar can ever carry `erg_session` is UNMEASURED until 1.75b's
  // walk. Runs immediately after `requireUser`, before availability, like
  // the 401 it sits beside. When `authVia` is "cookie" no bearer exists
  // (bearer wins whenever present), so only the bearer case re-resolves.
  const refuseAmbiguousAuth: RequestHandler = async (req, res, next) => {
    if (req.authVia === "bearer" && cookieToken(req) !== undefined) {
      const viaCookie = await resolveCookieSession(req);
      if (viaCookie && viaCookie.id !== req.user!.id) {
        res.status(400).json({ error: "ambiguous_auth" });
        return;
      }
    }
    next();
  };

  // -- mint -------------------------------------------------------------

  router.post(
    "/api/concept2/connect",
    requireUser,
    refuseAmbiguousAuth,
    async (req, res) => {
      if (!available()) {
        unavailableJson(res);
        return;
      }
      const body = isRec(req.body) ? req.body : {};
      const weightClass = body.weightClass;
      if (
        typeof weightClass !== "string" ||
        !WEIGHT_CLASSES.includes(weightClass as WeightClass)
      ) {
        res.status(400).json({
          error: `weightClass must be one of ${WEIGHT_CLASSES.join(", ")}`,
          field: "weightClass",
        });
        return;
      }
      const userId = req.user!.id;
      // Surface is SERVER-DERIVED from which credential requireUser
      // resolved (design §1) — no client-asserted surface exists for an
      // attacker to choose.
      const surface: LinkSurface = req.authVia === "bearer" ? "native" : "web";
      if (surface === "native" && body.linkClient !== NATIVE_LINK_CLIENT) {
        res.status(409).json({ error: "update_required" });
        return;
      }
      const redirectUri =
        surface === "native" ? NATIVE_REDIRECT_URI : webRedirectUri;

      // GC is the server's, no cron: sweep stale attempts globally. The
      // per-user replacement is the upsert's own ON CONFLICT (user_id),
      // one atomic statement (design §2) — no delete precedes it.
      await store.deleteExpiredAttempts(ATTEMPT_MAX_AGE_MS);
      let nonce = randomBytes(32).toString("hex");
      try {
        await store.createAttempt({
          nonce,
          userId,
          weightClass: weightClass as WeightClass,
          surface,
        });
      } catch (err) {
        if (!(err instanceof AttemptNonceCollisionError)) throw err;
        // 32 random bytes collided with another row's PK: retry ONCE with
        // a fresh nonce; a second collision propagates (500).
        nonce = randomBytes(32).toString("hex");
        await store.createAttempt({
          nonce,
          userId,
          weightClass: weightClass as WeightClass,
          surface,
        });
      }
      // `state` explicit beside the URL (design §3): the native app holds
      // the correlation value it presents at /exchange without depending
      // on Concept2's undocumented `state` echo on a private-use scheme.
      res.json({
        authorizeUrl: client.authorizeUrl(nonce, redirectUri),
        state: nonce,
      });
    },
  );

  // -- web callback (design §5 — the ladder, in this exact order) --------

  router.get("/api/concept2/callback", async (req, res) => {
    // 1. availability — consumes NOTHING. PR1's flag-off consume was the
    //    route's last unauthenticated write, an attempt-destruction
    //    primitive that bought nothing; deleted at PR1.75a.
    if (!available()) {
      sendPage(res, renderCallbackPage("unavailable"));
      return;
    }
    // 2. params
    const state =
      typeof req.query.state === "string" ? req.query.state : undefined;
    const code =
      typeof req.query.code === "string" ? req.query.code : undefined;
    if (state === undefined || code === undefined) {
      sendPage(res, renderCallbackPage("incomplete"));
      return;
    }
    // 3. the completing principal: the erg_session COOKIE, resolved here
    //    (never `requireUser`). A bearer on a top-level GET can only come
    //    from a non-browser caller; if one is present AND names a
    //    different user than the cookie, that is the §1(b) refusal — JSON,
    //    since no approved page exists for it.
    const user = await resolveCookieSession(req);
    if (bearerToken(req) !== undefined) {
      const viaBearer = await resolveBearerSession(req);
      if (viaBearer && user && viaBearer.id !== user.id) {
        res.setHeader("Referrer-Policy", "no-referrer");
        res.status(400).json({ error: "ambiguous_auth" });
        return;
      }
    }
    if (!user) {
      sendPage(res, renderCallbackPage("notSignedIn"));
      return;
    }
    // 4. peek (advisory)
    const attempt = await store.peekAttempt(state);
    if (!attempt) {
      sendPage(res, renderCallbackPage("expired"));
      return;
    }
    // 5. surface — NOT consumed
    if (attempt.surface !== "web") {
      sendPage(res, renderCallbackPage("expired"));
      return;
    }
    // 6. identity — NOT consumed, exchange never called: the rightful
    //    user's attempt survives a wrong-principal presentation (the DoS
    //    leg), and the one-time code is never spent for a rejected request.
    if (attempt.userId !== user.id) {
      sendPage(res, renderCallbackPage("wrongAccount"));
      return;
    }
    // 7. consume — the conditional DELETE is the AUTHORITY; null means a
    //    concurrent completion or a re-mint won.
    const consumed = await store.consumeAttemptFor(
      state,
      user.id,
      "web",
      ATTEMPT_MAX_AGE_MS,
    );
    if (!consumed || !consumed.fresh) {
      sendPage(res, renderCallbackPage("expired"));
      return;
    }
    // 8. exchange with the WEB redirect (Concept2 requires it to match the
    //    authorize call's) -> me -> link -> Linked page naming both
    //    identities (D2).
    const tokenResult = await client.exchangeCode(code, webRedirectUri);
    if (!tokenResult.ok) {
      sendPage(res, renderCallbackPage("failed"));
      return;
    }
    const me = await client.fetchMe(tokenResult.tokens.accessToken);
    if (!me.ok) {
      sendPage(res, renderCallbackPage("failed"));
      return;
    }
    try {
      // Clears any previously-set needsReauthAt (stores/concept2.ts's own
      // `upsertLink` comment) — a successful relink IS the recovery.
      await store.upsertLink(user.id, {
        c2UserId: me.c2UserId,
        accessToken: tokenResult.tokens.accessToken,
        refreshToken: tokenResult.tokens.refreshToken,
        expiresAt: tokenResult.tokens.expiresAt,
        weightClass: consumed.weightClass,
      });
    } catch (err) {
      // D1: the Concept2 account already belongs to a different Ergomatic
      // user; the tokens are discarded with this request.
      if (err instanceof Concept2LinkConflictError) {
        sendPage(res, renderCallbackPage("alreadyLinked"));
        return;
      }
      throw err;
    }
    sendPage(
      res,
      renderCallbackPage("linked", {
        // `username` has never been observed on this repo's wire (plan
        // observation 3) — the numeric id is the fallback so the page
        // never renders an empty identity.
        c2Username: me.username ?? `#${me.c2UserId}`,
        email: user.email,
      }),
    );
  });

  // -- native exchange (design §6 — the ladder, in this exact order) -----

  router.post(
    "/api/concept2/exchange",
    requireUser,
    refuseAmbiguousAuth,
    async (req, res) => {
      // 1. availability
      if (!available()) {
        unavailableJson(res);
        return;
      }
      // 2. body shape, field-named
      const body = isRec(req.body) ? req.body : {};
      const code = body.code;
      const state = body.state;
      if (typeof code !== "string" || code === "") {
        res.status(400).json({ error: "code must be a string", field: "code" });
        return;
      }
      if (typeof state !== "string" || state === "") {
        res
          .status(400)
          .json({ error: "state must be a string", field: "state" });
        return;
      }
      // 2b. the request states its own credential class BEFORE anything
      //     is peeked — a stored column is not the place to route a
      //     property of the request.
      if (req.authVia !== "bearer") {
        res.status(400).json({ error: "wrong_surface" });
        return;
      }
      const userId = req.user!.id;
      // 3. peek (advisory)
      const attempt = await store.peekAttempt(state);
      if (!attempt) {
        res.status(400).json({ error: "invalid_state" });
        return;
      }
      // 4. surface — not consumed
      if (attempt.surface !== "native") {
        res.status(400).json({ error: "wrong_surface" });
        return;
      }
      // 5. identity — not consumed, exchange never called
      if (attempt.userId !== userId) {
        res.status(403).json({ error: "principal_mismatch" });
        return;
      }
      // 6. consume — the conditional DELETE is the authority
      const consumed = await store.consumeAttemptFor(
        state,
        userId,
        "native",
        ATTEMPT_MAX_AGE_MS,
      );
      if (!consumed) {
        res.status(400).json({ error: "invalid_state" });
        return;
      }
      if (!consumed.fresh) {
        res.status(400).json({ error: "expired" });
        return;
      }
      // 7. exchange with the NATIVE redirect -> me -> link
      const tokenResult = await client.exchangeCode(code, NATIVE_REDIRECT_URI);
      if (!tokenResult.ok) {
        res.status(502).json({ error: "c2_error" });
        return;
      }
      const me = await client.fetchMe(tokenResult.tokens.accessToken);
      if (!me.ok) {
        res.status(502).json({ error: "c2_error" });
        return;
      }
      try {
        await store.upsertLink(userId, {
          c2UserId: me.c2UserId,
          accessToken: tokenResult.tokens.accessToken,
          refreshToken: tokenResult.tokens.refreshToken,
          expiresAt: tokenResult.tokens.expiresAt,
          weightClass: consumed.weightClass,
        });
      } catch (err) {
        if (err instanceof Concept2LinkConflictError) {
          res.status(409).json({ error: "already_linked_elsewhere" });
          return;
        }
        throw err;
      }
      // Never a token on this response — the same projection GET /link
      // makes.
      res.status(200).json({
        linked: true,
        c2UserId: me.c2UserId,
        weightClass: consumed.weightClass,
      });
    },
  );
```

Then, in the UNCHANGED remainder (`:234-608` of the current file), change the three registrations to carry the refusal — `router.get("/api/concept2/link", requireUser, refuseAmbiguousAuth, async (req, res) => {`, `router.delete("/api/concept2/link", requireUser, refuseAmbiguousAuth, async (req, res) => {`, `router.post("/api/concept2/results/:logId", requireUser, refuseAmbiguousAuth, async (req, res) => {` — and nothing else in those routes. (Express 5's typed-handler widening note at the current `:281-286` still applies and the `as string` cast stays.)

- [ ] **Step 4: Wiring.** `app.ts:38-42`:

```ts
  concept2?: {
    available: () => boolean;
    store: Concept2Store;
    client: C2Client;
    // PR1.75a: the WEB surface's redirect (the native one is a constant in
    // routes/concept2.ts). Was `C2ClientConfig.redirectUri` — both client
    // calls now take the surface's redirect as an argument.
    webRedirectUri: string;
  } | null;
```

`app.ts:93-117` (the mount comment + call):

```ts
  // Controller ruling R1 (task-7-brief.md): mounted BESIDE `createAuthRouter`
  // (above), BEFORE the `if (deps.stores)` data-router block below —
  // `routes/data.ts`'s own `router.use("/api", requireUser)` 401s every
  // /api/* request that enters the data router first (bare JSON), and the
  // concept2 web callback authenticates ITSELF with a route-local cookie
  // resolver so it can answer HTML 401/403 pages in its pinned ladder
  // order (PR1.75a, routes/concept2.ts). Mounting here, after this file's
  // own `originCheck` above but ahead of the data router, keeps the authed
  // POST/DELETE concept2 routes under CSRF cover while the callback never
  // reaches a gate meant for the rest of the API. Requires BOTH
  // `deps.concept2` and `deps.stores` (the router needs `stores.logs`) —
  // `deps.concept2 ?? null` per the AppDeps field's own comment.
  const concept2Deps = deps.concept2 ?? null;
  if (concept2Deps && deps.stores) {
    app.use(
      createConcept2Router({
        available: concept2Deps.available,
        store: concept2Deps.store,
        logs: deps.stores.logs,
        client: concept2Deps.client,
        requireUser: requireUser(deps.sessions),
        sessions: deps.sessions,
        webRedirectUri: concept2Deps.webRedirectUri,
      }),
    );
  }
```

`index.ts:133-145`:

```ts
// Google precedent (index.ts:72, above): the WEB callback path is fixed and
// derived from the same siteUrl every other redirect uses. The NATIVE
// redirect is `routes/concept2.ts`'s `NATIVE_REDIRECT_URI` (PR1.75a §3);
// both must be registered at Concept2 (log-dev: done 2026-09-02; live
// portal: a cutover step beside write approval).
const c2WebRedirectUri = new URL("/api/concept2/callback", siteUrl).href;
const concept2 = {
  available: () => c2Available,
  store: createConcept2Store(db),
  client: createC2Client({
    baseUrl: c2BaseUrl,
    clientId: c2ClientId,
    clientSecret: c2ClientSecret,
  }),
  webRedirectUri: c2WebRedirectUri,
};
```

- [ ] **Step 5: Run** `... --project unit server/routes/concept2.test.ts` → green; then `pnpm lint && pnpm typecheck && pnpm format:check && pnpm test --project unit` → green (the integration harness at `routes/concept2.integration.test.ts:184-219` still passes `redirectUri` to `createC2Client` and will fail TYPECHECK until Task 7 rewrites it — do Task 7 before the commit if `pnpm typecheck` includes integration files; it does: `tsconfig.server.json` covers `server/**`).
- [ ] **Step 6: THE COMBINED COMMIT** (Tasks 2, 3, 4, 6 and 7 together — the pre-commit whole-project typecheck forbids any intermediate state): `git rev-parse --show-toplevel`, then `feat(c2): authenticated link completion on both surfaces — surface at mint, web cookie ladder, POST /exchange, atomic upsert, authVia (PR1.75a)`. Run every task's mutation probes AFTER this commit; record each in the report.
- [ ] **Step 7: Mutation probes (routes), each with the expected failure:**
  - move the `attempt.userId !== user.id` check in the callback to AFTER `exchangeCode` → "a DIFFERENT user's cookie" fails: `expected "spy" to not be called at all, but actually been called 1 times` (exchange reached);
  - move `consumeAttemptFor` above the identity check → the same test's `expect(await store.peekAttempt(state)).not.toBeNull()` fails: `expected null not to be null` (the attempt-survives assertion — exit criterion 1's second mutation);
  - delete `refuseAmbiguousAuth` from the mint registration → "mint -> 400 ambiguous_auth" fails: `expected 200 to be 400`;
  - swap `req.authVia === "bearer" ? "native" : "web"` to a constant `"web"` → "bearer mint WITH linkClient -> native redirect" fails: `expected 'https://ergomatic.example/…' to be 'haus.waffle.ergomatic://oauth/callback'`;
  - drop the `linkClient` check → "bearer mint WITHOUT linkClient -> 409" fails: `expected 200 to be 409`;
  - restore PR1's flag-off consume in step 1 → "availability consumes nothing" fails at `expect(retry.status).toBe(200)`: `expected 400 to be 200`;
  - exchange: read `state` from `req.query` instead of the body → "locates the attempt from body.state only" fails: `expected 400 to be 200`… (the query-carrying request now succeeds; `expected 200 to be 400`);
  - exchange: drop step 2b → "a COOKIE caller -> 400 wrong_surface before any peek" fails: `expected "spy" to not be called` (peek reached);
  - exchange: pass `webRedirectUri` to `exchangeCode` → "happy path … NATIVE redirect" fails on `toHaveBeenCalledWith`;
  - delete `res.setHeader("Referrer-Policy", ...)` from `sendPage` → the header test fails: `expected undefined to be 'no-referrer'`;
  - one mutation ABOVE the seam (RF21 #228): in `app.ts` pass `sessions: { resolveSession: async () => null } as SessionStore` instead of `deps.sessions` → Task 7's web same-user row fails at `expect(callback.status).toBe(200)`: `expected 401 to be 200`. Record it under Task 7.

### Task 7: The RF24 identity rows — real routes + real Postgres + real client, only `fetch` stubbed

**Files:**
- Modify (rewrite): `app/server/routes/concept2.integration.test.ts`

**Interfaces:** consumes everything above through `createApp` (`app.ts`), exactly as the file does today (`:194-219`). Two sign-in producers: the native backdoor (`POST /api/auth/native`, bearer — the file's own `signIn`, `:235-246`) and a cookie session minted directly through `createSessionStore(db).createSession(userId)` (`sessions.ts:32-41`) and carried as `erg_session` — the same direct-store seeding the refresh test already uses for its link row (`:419-430`). One user can therefore hold BOTH credentials, which the cross-surface rows need.

- [ ] **Step 1: Rewrite the file.** Keep `jsonResponse`, `RAW_201_BODY`, `RAW_409_BODY`, `tokenBody`, `meBody` (extend it: `function meBody(c2UserId: number, username = "jmorelli") { return { data: { id: c2UserId, username } }; }`), `finishedLogBody`, `EXPECTED_PAYLOAD` verbatim (`:58-159`). Replace the header comment (`:33-56`) with:

```ts
// Wave E PR1 Task 7 (the RF24 seam — "every test seeding PAST the
// producer"), extended at PR1.75a with the identity rows design §Testing
// names ("Integration (RF24, both surfaces): real routes + Postgres +
// client, only `fetch` stubbed"). This file is the ONE test that starts
// upstream of every producer in the chain and never fakes any of them: a
// real Postgres container, the real `createDataRouter`'s `POST /api/logs`
// (the REAL producer of the row the upload reads), the real
// `createConcept2Store` (real `FOR UPDATE` locking, real UNIQUE indexes),
// and a real `createC2Client` with ONLY the module boundary this repo
// can't control (`fetch` itself) stubbed. Every stubbed response body is
// transcribed verbatim from a committed capture:
//   RAW   = docs/monitor/c2-crossconnect-2026-09/raw-output.txt
//   PROBE = docs/monitor/c2-crossconnect-2026-09/refresh-probe-2026-08-31.md
// (`meBody`'s `username` is NOT a capture — no /users/me body is committed;
// plan observation 3 — it is the documented field, read as optional.)
//
// Mount order (controller ruling R1): the web callback below is driven with
// a COOKIE and no bearer; if `createConcept2Router` ever lands after
// `routes/data.ts`'s own `router.use("/api", requireUser)`, that request
// gets the data router's bare JSON 401 instead of this router's HTML
// ladder — the "web same-user" row reads `text/html` to pin it.
```

Replace the `beforeAll` app construction (`:184-219`) so the client config drops `redirectUri` and the deps carry `webRedirectUri`:

```ts
    fetchMock = vi.fn();
    const client = createC2Client(
      {
        baseUrl: "https://log-dev.concept2.test",
        clientId: "seam-client-id",
        clientSecret: "seam-client-secret",
      },
      fetchMock,
    );
    sessions = createSessionStore(db);

    app = createApp(
      baseDeps({
        sessions,
        users: createUserStore(db),
        allowlist: new Set([
          "seam-rf24@c2seam.test",
          "seam-409@c2seam.test",
          "seam-singleuse@c2seam.test",
          "seam-refresh@c2seam.test",
          "seam-web-a@c2seam.test",
          "seam-web-b@c2seam.test",
          "seam-native-a@c2seam.test",
          "seam-native-b@c2seam.test",
          "seam-cross@c2seam.test",
          "seam-d1-a@c2seam.test",
          "seam-d1-b@c2seam.test",
          "seam-concurrent@c2seam.test",
        ]),
        nativeVerifier: async (idToken: string) => ({
          sub: idToken,
          email: `${idToken}@c2seam.test`,
          emailVerified: true,
          name: idToken,
        }),
        stores,
        concept2: {
          available: () => true,
          store: createConcept2Store(db),
          client,
          webRedirectUri: WEB_REDIRECT_URI,
        },
      }),
    );
```

with, at file scope, `const WEB_REDIRECT_URI = "https://ergomatic.example/api/concept2/callback";` and `const NATIVE_REDIRECT_URI = "haus.waffle.ergomatic://oauth/callback";` (an INDEPENDENT literal, never the import — RF21), `let sessions: ReturnType<typeof createSessionStore>;`, and these helpers beside `signIn`/`mintState`:

```ts
  // A cookie session for an existing user, minted through the real store
  // (sessions.ts:32-41) — the web surface's credential. One user can hold
  // both a bearer (signIn) and this cookie; the cross-surface rows need
  // exactly that.
  async function cookieFor(userId: string): Promise<string> {
    const { token } = await sessions.createSession(userId);
    return `erg_session=${token}`;
  }

  async function mintWeb(cookie: string): Promise<string> {
    const res = await request(app)
      .post("/api/concept2/connect")
      .set("Cookie", cookie)
      .send({ weightClass: "H" });
    expect(res.status).toBe(200);
    expect(
      new URL(res.body.authorizeUrl as string).searchParams.get("redirect_uri"),
    ).toBe(WEB_REDIRECT_URI);
    return res.body.state as string;
  }

  async function mintNative(bearer: string): Promise<string> {
    const res = await request(app)
      .post("/api/concept2/connect")
      .set("Authorization", bearer)
      .send({ weightClass: "H", linkClient: "webauth-1" });
    expect(res.status).toBe(200);
    expect(
      new URL(res.body.authorizeUrl as string).searchParams.get("redirect_uri"),
    ).toBe(NATIVE_REDIRECT_URI);
    return res.body.state as string;
  }

  // `fetch` stub answering the token + me endpoints (and, when asked, the
  // results endpoint) — every body a committed transcript.
  function stubC2(opts: { c2UserId?: number; results?: "201" | "409" } = {}) {
    fetchMock.mockImplementation(async (input: Parameters<typeof fetch>[0]) => {
      const url = String(input);
      if (url.endsWith("/oauth/access_token")) {
        return jsonResponse(200, tokenBody("at-seam", "rt-seam"));
      }
      if (url.endsWith("/api/users/me")) {
        return jsonResponse(200, meBody(opts.c2UserId ?? 2211));
      }
      if (url.endsWith("/api/users/me/results")) {
        return opts.results === "409"
          ? jsonResponse(409, RAW_409_BODY)
          : jsonResponse(201, RAW_201_BODY);
      }
      throw new Error(`unexpected fetch url in this test: ${url}`);
    });
  }

  const tokenCalls = () =>
    fetchMock.mock.calls.filter((call) =>
      String(call[0]).endsWith("/oauth/access_token"),
    );

  const attemptRows = async (userId: string) => {
    const rows = await db.execute(
      sql`select count(*)::int as n from concept2_auth_attempts where user_id = ${userId}`,
    );
    return (rows.rows[0] as { n: number }).n;
  };
```

(`sql` from `drizzle-orm` joins the imports.) `mintState` (`:248-256`) becomes `mintNative` — update the four existing tests: test 1 mints web with a cookie for the same user and drives the callback WITH that cookie (`.set("Cookie", cookie)`), asserting `callback.type === "text/html"` and `callback.text` contains `CONCEPT2 LINK · LINKED · HTTP 200` and `Ergomatic seam-rf24@c2seam.test`; the 409 test and single-use test do the same (single-use: the second callback with the same cookie → 400); the refresh test is unchanged except `mintState` is gone (it never minted).

Then append the identity rows inside the outer `describe`:

```ts
  describe("identity rows (design §Testing — RF24, both surfaces)", () => {
    it("web, same user: cookie mint -> cookie callback -> Linked page names both identities -> link row exists", async () => {
      stubC2();
      const { userId } = await signIn("seam-web-a");
      const cookie = await cookieFor(userId);
      const state = await mintWeb(cookie);
      const callback = await request(app)
        .get(`/api/concept2/callback?state=${state}&code=abc123`)
        .set("Cookie", cookie);
      expect(callback.status).toBe(200);
      expect(callback.type).toBe("text/html");
      expect(callback.text.replace(/<[^>]+>/g, "")).toContain(
        "Concept2 jmorelli is now connected to Ergomatic seam-web-a@c2seam.test.",
      );
      expect(callback.headers["referrer-policy"]).toBe("no-referrer");
      const link = await createConcept2Store(db).getLink(userId);
      expect(link?.c2UserId).toBe(2211);
      // The exchange went to the wire with the WEB redirect.
      const [, init] = tokenCalls()[0];
      expect((init as RequestInit).body).toBeInstanceOf(URLSearchParams);
      expect(
        ((init as RequestInit).body as URLSearchParams).get("redirect_uri"),
      ).toBe(WEB_REDIRECT_URI);
      expect(await attemptRows(userId)).toBe(0);
    });

    it("web, wrong user: another user's cookie -> 403 Wrong account, NO token call, no link for anyone, attempt STILL PRESENT", async () => {
      stubC2();
      const a = await signIn("seam-web-b");
      const b = await signIn("seam-cross");
      const cookieA = await cookieFor(a.userId);
      const cookieB = await cookieFor(b.userId);
      const state = await mintWeb(cookieA);
      const callback = await request(app)
        .get(`/api/concept2/callback?state=${state}&code=abc123`)
        .set("Cookie", cookieB);
      expect(callback.status).toBe(403);
      expect(callback.text).toContain("CONCEPT2 LINK · WRONG ACCOUNT · HTTP 403");
      expect(tokenCalls()).toHaveLength(0);
      const store = createConcept2Store(db);
      expect(await store.getLink(a.userId)).toBeNull();
      expect(await store.getLink(b.userId)).toBeNull();
      expect(await store.peekAttempt(state)).not.toBeNull();
      expect(await attemptRows(a.userId)).toBe(1);
    });

    it("native, same bearer: native mint -> POST /exchange -> 200 linked, exchange carried the NATIVE redirect", async () => {
      stubC2({ c2UserId: 3311 });
      const { bearer, userId } = await signIn("seam-native-a");
      const state = await mintNative(bearer);
      const res = await request(app)
        .post("/api/concept2/exchange")
        .set("Authorization", bearer)
        .send({ code: "abc123", state });
      expect(res.status).toBe(200);
      expect(res.body).toStrictEqual({
        linked: true,
        c2UserId: 3311,
        weightClass: "H",
      });
      const [, init] = tokenCalls()[0];
      expect(
        ((init as RequestInit).body as URLSearchParams).get("redirect_uri"),
      ).toBe(NATIVE_REDIRECT_URI);
      expect((await createConcept2Store(db).getLink(userId))?.c2UserId).toBe(
        3311,
      );
      expect(await attemptRows(userId)).toBe(0);
    });

    it("native, wrong bearer: another user's bearer -> 403 principal_mismatch, NO token call, attempt STILL PRESENT", async () => {
      stubC2();
      const a = await signIn("seam-native-b");
      const b = await signIn("seam-cross");
      const state = await mintNative(a.bearer);
      const res = await request(app)
        .post("/api/concept2/exchange")
        .set("Authorization", b.bearer)
        .send({ code: "abc123", state });
      expect(res.status).toBe(403);
      expect(res.body).toStrictEqual({ error: "principal_mismatch" });
      expect(tokenCalls()).toHaveLength(0);
      expect(await createConcept2Store(db).peekAttempt(state)).not.toBeNull();
    });

    it("cross-surface, both directions: a web-minted state cannot /exchange and a native-minted state cannot /callback — 400, nothing consumed, no token call", async () => {
      stubC2();
      const { bearer, userId } = await signIn("seam-cross");
      const cookie = await cookieFor(userId);

      const webState = await mintWeb(cookie);
      const viaExchange = await request(app)
        .post("/api/concept2/exchange")
        .set("Authorization", bearer)
        .send({ code: "abc123", state: webState });
      expect(viaExchange.status).toBe(400);
      expect(viaExchange.body).toStrictEqual({ error: "wrong_surface" });
      expect(await createConcept2Store(db).peekAttempt(webState)).not.toBeNull();

      const nativeState = await mintNative(bearer);
      const viaCallback = await request(app)
        .get(`/api/concept2/callback?state=${nativeState}&code=abc123`)
        .set("Cookie", cookie);
      expect(viaCallback.status).toBe(400);
      expect(viaCallback.text).toContain("CONCEPT2 LINK · EXPIRED · HTTP 400");
      expect(await createConcept2Store(db).peekAttempt(nativeState)).not.toBeNull();

      expect(tokenCalls()).toHaveLength(0);
    });

    it("neither credential: callback -> 401 Not signed in (HTML), exchange -> 401 (JSON); nothing consumed", async () => {
      const { bearer, userId } = await signIn("seam-cross");
      const cookie = await cookieFor(userId);
      const webState = await mintWeb(cookie);
      const nativeState = await mintNative(bearer);
      // A native mint REPLACED the web one (one live attempt per user) —
      // the web state is gone by upsert, not by any callback.
      expect(await createConcept2Store(db).peekAttempt(webState)).toBeNull();

      const cb = await request(app).get(
        `/api/concept2/callback?state=${nativeState}&code=abc123`,
      );
      expect(cb.status).toBe(401);
      expect(cb.type).toBe("text/html");
      expect(cb.text).toContain("CONCEPT2 LINK · NOT SIGNED IN · HTTP 401");

      const ex = await request(app)
        .post("/api/concept2/exchange")
        .send({ code: "abc123", state: nativeState });
      expect(ex.status).toBe(401);
      expect(await createConcept2Store(db).peekAttempt(nativeState)).not.toBeNull();
    });

    it("D1 on real Postgres: a Concept2 account already linked to user A cannot be linked to user B (409), A's row intact", async () => {
      stubC2({ c2UserId: 4411 });
      const a = await signIn("seam-d1-a");
      const cookieA = await cookieFor(a.userId);
      const stateA = await mintWeb(cookieA);
      const first = await request(app)
        .get(`/api/concept2/callback?state=${stateA}&code=abc123`)
        .set("Cookie", cookieA);
      expect(first.status).toBe(200);

      const b = await signIn("seam-d1-b");
      const stateB = await mintNative(b.bearer);
      const second = await request(app)
        .post("/api/concept2/exchange")
        .set("Authorization", b.bearer)
        .send({ code: "def456", state: stateB });
      expect(second.status).toBe(409);
      expect(second.body).toStrictEqual({ error: "already_linked_elsewhere" });
      const store = createConcept2Store(db);
      expect((await store.getLink(a.userId))?.c2UserId).toBe(4411);
      expect(await store.getLink(b.userId)).toBeNull();
    });

    // Exit criterion 3 at the ROUTE layer (the store-level proof is
    // stores/concept2.integration.test.ts's concurrent case).
    it("two CONCURRENT mints through the real route leave exactly one live attempt", async () => {
      const { bearer, userId } = await signIn("seam-concurrent");
      const [r1, r2] = await Promise.all([
        request(app)
          .post("/api/concept2/connect")
          .set("Authorization", bearer)
          .send({ weightClass: "H", linkClient: "webauth-1" }),
        request(app)
          .post("/api/concept2/connect")
          .set("Authorization", bearer)
          .send({ weightClass: "H", linkClient: "webauth-1" }),
      ]);
      expect(r1.status).toBe(200);
      expect(r2.status).toBe(200);
      expect(await attemptRows(userId)).toBe(1);
    });
  });
```

- [ ] **Step 2: Run** `... --project integration server/routes/concept2.integration.test.ts` (Docker up) → green after Task 6; before it, red at typecheck (`webRedirectUri`).
- [ ] **Step 3: Mutation probes (after the combined commit; the deciding source, RF21):** (a) in the callback, move the identity check after `exchangeCode` → "web, wrong user" fails at `expect(tokenCalls()).toHaveLength(0)`: `expected [ [...] ] to have a length of 0 but got 1`; (b) in `consumeAttemptFor` drop the `surface` predicate AND in the callback drop step 5 → "cross-surface" fails at the native-minted callback: `expected 200 to be 400`; (c) the above-the-seam mutation from Task 6 step 7 (`app.ts` passing a null-resolving `sessions`) → "web, same user" fails: `expected 401 to be 200`; (d) replace the store's upsert with delete+insert → "two CONCURRENT mints through the real route" reports either `expected 1 to be 2`-shaped (two rows) or a 500 on one request (`expected 500 to be 200`, the unique violation) — record which.

### Task 8: Gates, `dist:grep`, coverage

- [ ] `dist:grep` — **no needle changes.** Reason: every string this PR adds (`haus.waffle.ergomatic://oauth/callback`, `webauth-1`, `ambiguous_auth`, the page copy, `AUTH_VIA_LOG`) lives under `app/server/**`, which `vite build` never bundles (the client graph is `src/**`; the server compiles separately via `tsconfig.server.build.json` into `dist/server`, and the gate scans `dist/client` only — `scripts/dist-grep.sh`, `DIST="dist/client"`). Nothing dev-only is added on either side, so there is no new seam for the gate to prove absent. Still run it: `pnpm build && pnpm dist:grep` → `dist-grep: OK — none of the 8 dev-only markers found in dist/client.` Paste the line in the report.
- [ ] `pnpm lint && pnpm format:check && pnpm typecheck && pnpm test` (all three projects, Docker up) → green; read BOTH summary lines.
- [ ] `pnpm test:coverage` → read the PER-FILE rows (RF2, TESTING.md §10) for `server/routes/concept2.ts`, `server/stores/concept2.ts`, `server/auth/middleware.ts`, `server/concept2/client.ts`, `server/concept2/callbackPage.ts` — the HTML report under `app/coverage/` is authoritative; say which source you read. New file `callbackPage.ts` should be 100%.
- [ ] Scope check, mechanical: `git diff main --stat -- app/src app/ios` prints nothing.
- [ ] No e2e run (nothing under `app/src/`); state this in the PR body.

### Task 9: Reconciliation — every server-side and record site (design exit criterion 5), grep-census exit

**Files (server):** `app/server/db/schema.ts` (done in Task 1 — verify), `app/server/routes/concept2.ts` (done in Task 6 — verify), `app/server/app.ts` (done in Task 6 — verify), `app/server/testing/fakes.ts` (done in Task 2 — verify).
**Files (records):** `ROADMAP.md`, `docs/superpowers/specs/2026-08-31-concept2-logbook-design.md`, `docs/superpowers/plans/2026-09-01-concept2-pr15-gate.md`, `docs/design/handoffs/2026-08-31-concept2-connect/README.md`, `.claude/agents/pm-ledger.md` / `antagonist-ledger.md` (NOT edited — see the census table).
**EXPLICITLY DEFERRED to PR1.75b (do NOT touch in this PR — the scope gate):** `app/src/monitor/Concept2LinkProbe.tsx:5-10` ("A dev-only probe, never a real link"), `app/src/api/useReturnToApp.ts:8-45` (the `browserFinished` arm and its rationale), `app/src/native/externalBrowser.ts` + `app/src/adapters/externalBrowser.ts` (`onBrowserFinished` consumers), `app/src/api/useReturnToApp.test.tsx`, `app/src/adapters/externalBrowser.test.ts`, and the PR1.5 native-link plan `docs/superpowers/plans/2026-09-01-concept2-pr15-native-link.md` (a merged plan's history; 1.75b's census owns any marker it needs).

Root markdown is NOT Prettier-formatted (CLAUDE.md "Hooks"): wrap ROADMAP edits by hand to the surrounding width; never run `prettier --write` on it.

- [ ] **Step 1: Server-side sites — verify each phrase is gone** (they were rewritten in Tasks 1/2/6; this step is the check, not the edit):

| file:line (current) | current phrase | replacement (landed in) |
| --- | --- | --- |
| `schema.ts:506-515` | "the nonce CORRELATES the browser's return … nothing here checks WHO completes it. That identity check is the ruled activation shape's job (PR1.75 …), not this table." / "No redirect_kind column … see the design spec's Stored-Shapes section for the target `surface` column, not yet added here)." | Task 1's new table comment (identity checked on both routes before consume; `surface` present; UNIQUE(user_id); rollback halves) |
| `routes/concept2.ts:13-21` | "the callback route … is deliberately unauthenticated today, so `requireUser` is applied per-route instead, on every route but that one." | Task 6's header ("authenticated by a ROUTE-LOCAL cookie resolver (§5)") |
| `routes/concept2.ts:37-41` | "a single-use, 15-minute attempt nonce correlates the browser's return to this attempt — it does not bind the consenting principal's identity (PR1.75 owns the identity check that would)" | Task 6's `ATTEMPT_MAX_AGE_MS` comment ("the completing principal is checked separately (this file's ladders)") |
| `routes/concept2.ts:160-170` | "Corrected 2026-09-01: this is a sequential-replace guarantee, not a cardinality bound … the delete/delete/insert sequence is untransacted and there is no UNIQUE(user_id) constraint" | Task 6's mint comment ("The per-user replacement is the upsert's own ON CONFLICT (user_id), one atomic statement") |
| `routes/concept2.ts:182` | "-- callback (NO requireUser — the nonce correlates, not binds) --" | Task 6's "-- web callback (design §5 — the ladder, in this exact order) --" |
| `routes/concept2.ts:190-199` | "availability is RE-CHECKED here … `await store.consumeAttempt(state, …)`" | Task 6 step 1 comment: "consumes NOTHING. PR1's flag-off consume … deleted at PR1.75a" |
| `app.ts:93-105` | "the concept2 callback route is deliberately unauthenticated today (the nonce only correlates the return; it does not bind a principal, and there is no session check here either" | Task 6 step 4's mount comment |
| `fakes.ts:883-887` | "Not wired into `makeFakeStores`/`Stores` yet — that's a later task's job, once `routes/concept2.ts` exists to need it." (stale since PR1 Task 6) | Task 2's fake header ("Deliberately NOT part of `makeFakeStores`/`Stores` — the concept2 router takes its own store dep") |
| `stores/concept2.ts:167-170` (retired method) | "the nonce CORRELATES the return to the attempt; it does not BIND the consenting principal — see … PR1.75 for the identity check that would" | gone with `consumeAttempt`; `consumeAttemptFor`'s comment states the predicate |

- [ ] **Step 2: `ROADMAP.md:999-1020` (the PR1.75 row).** Keep it `- [ ]` (1.75b still owes the native half). Replace the clause "the authenticated native exchange (URL scheme + `appUrlOpen`, moved from PR1.5)" with "the authenticated native exchange (`POST /api/concept2/exchange`, server side; the device return rides `ASWebAuthenticationSession`, not a URL scheme + `appUrlOpen` — design §4)" and the clause "`UNIQUE(user_id)` + a transaction around mint (one-attempt is currently best-effort/raceable)" with "`UNIQUE(user_id)` + one atomic upsert at mint (one live attempt per user, ENFORCED at 1.75a)". Append to the row, hand-wrapped: "**Status 2026-09-0X: server half BUILT (PR1.75a, #<n>) — migration 0020, both identity ladders, `authVia`, the styled pages; native half is PR1.75b (`WebAuthPlugin`, `linkFlow`, the return-arm census, the walk). The per-clause disposition of this row lands at 1.75b's merge (design exit criterion 8); still owed after both: the flag flip, live-portal registration of the native redirect, PR2's surface + identity line, promotion of the app-wide disagreement refusal.**"
- [ ] **Step 3: `ROADMAP.md:1304` (the C2 account injection register row).** Replace the fragment `"one live attempt per user" is best-effort and RACEABLE, not enforced — mint is a delete/delete/insert sequence with no transaction and no `UNIQUE(user_id)` (`server/routes/concept2.ts:157-167`, `schema.ts:510-519`), so sequential mints replace the prior attempt but concurrent mints can leave several live at once (§1, corrected)` with `"one live attempt per user" is ENFORCED since PR1.75a (#<n>): migration 0020's `UNIQUE(user_id)` + one atomic `INSERT … ON CONFLICT (user_id) DO UPDATE` at mint (`server/stores/concept2.ts`, `createAttempt`)`; and the fragment `(`attempt.userId === req.user.id` before exchange; the web callback is unauthenticated today)` with `(`attempt.userId === req.user.id` before exchange — BUILT server-side at PR1.75a on both the cookie-authenticated web callback and `POST /api/concept2/exchange`; the native RETURN that reaches the exchange is PR1.75b's, and the gate stays closed until it ships and walks)`. Everything else in the row (the ruling, the reaffirmation, the blast radius) stands.
- [ ] **Step 4: Parent spec `2026-08-31-concept2-logbook-design.md`.** `:429-431`: replace "**TARGET (UNBUILT ACTIVATION SHAPE — PR1.75's job, no migration exists yet for any of this): add a `surface` column**" with "**TARGET, server half BUILT at PR1.75a (migration 0020, `2026-09-02-concept2-pr175-app-bind-design.md` §2): the `surface` column**" and, at the end of that paragraph (`:440-441` "does not exist on either completion route"), append "— **as of PR1.75a it exists on both** (route-local cookie resolver on the web callback; bearer on `POST /exchange`); what remains is the native return (PR1.75b)." `:248` (quotes the PR1 callback comment "NO requireUser — the nonce correlates, not binds"): append "(comment retired at PR1.75a; the callback is cookie-authenticated)". `:298` ("one live attempt per user" is best-effort): append "— ENFORCED at PR1.75a (0020)". `:568-575` (the "After PR1.5" / "After PR1.75" bullets): rewrite the "After PR1.75" bullet to "**After PR1.75a:** the server side of the ruled activation shape — migration 0020 (`surface`, `UNIQUE(user_id)`, `UNIQUE(c2_user_id)`), the cookie-authenticated web callback and the bearer-authenticated `POST /api/concept2/exchange`, `authVia`, the styled pages. **After PR1.75b:** the native return via `ASWebAuthenticationSession` (design §4 — not a URL scheme + `appUrlOpen` handler, which stays recorded as the Branch-B contingency), the PR1.5 return-arm retirement, the device walk. Deployed prod behavior after both: unchanged while dark."
- [ ] **Step 5: Gate doc `2026-09-01-concept2-pr15-gate.md` — a SUPERSESSION MARKER, not a deletion** (design exit criterion 5). Insert directly under the §3(g) heading (`:664`), under the §4 heading (`:950`) and under the §6 heading (`:1046`) the same dated paragraph, hand-wrapped:

> **SUPERSEDED IN PART — 2026-09-0X, PR1.75a (#<n>):** the server half of option (g) is BUILT: migration 0020 (`surface`, `UNIQUE(user_id)`, D1's `UNIQUE(c2_user_id)`), `attempt.userId === req.user.id` BEFORE consume and BEFORE exchange on BOTH the web callback (cookie, route-local resolver) and `POST /api/concept2/exchange` (bearer), and the surface predicate's authority (`req.authVia`, bearer wins, disagreement logged app-wide and refused on `/api/concept2/*`). Every sentence below describing the callback as unauthenticated, the attempts table as lacking a surface column, or mint as raceable describes the PRE-1.75a code and is kept as the record the ruling was drawn from. The native return (`ASWebAuthenticationSession`, not `appUrlOpen`) is PR1.75b's; the activation gate stays closed until it ships. Current design: `docs/superpowers/specs/2026-09-02-concept2-pr175-app-bind-design.md`.

  Additionally edit §4's "Still owed" bullet at `:984-991` in place (it is a current-state list, not history): "(g)'s own three preconditions, none built yet" → "(g)'s own three preconditions: the `surface` column and migration (BUILT, 0020 at PR1.75a), the dual-route identity check (BUILT at PR1.75a), Concept2's approval of the native `redirect_uri` (log-dev DONE 2026-09-02; live portal owed at cutover). The device-side return is PR1.75b's."
- [ ] **Step 6: Handoff README `:94-97`.** Replace "**Owed amendment (added PR1.5 fix round, post-2026-09-01 account-injection ruling): the callback page and this card should also name which Ergomatic account received the link … That copy is NOT in this frozen board and is NOT approved — it needs its own rendered Gate 0 pass before PR2 implements it.**" with "**Gate 0 amendment, callback pages: APPROVED 2026-09-02 and BUILT at PR1.75a — the shared callback template (`2026-09-02-concept2-pr175-app-bind-design.md` §7) now covers 401 Not signed in, 403 Wrong account, 409 Already linked (D1) and a Linked page naming BOTH identities (D2). This CARD's own identity line (the detect-identity hedge for the app surface) is still NOT in the frozen board and still needs its own rendered Gate 0 pass before PR2 implements it.**"
- [ ] **Step 7: The census (the exit gate).** Run from the worktree root and paste the output into the PR Record:

```bash
cd /Users/james/projects/github/jamesawesome/Ergomatic-wt-c2pr175 && for p in "correlates, not binds" "No redirect_kind column" "not yet added here" "deliberately unauthenticated" "unauthenticated BY DESIGN" "sequential-replace guarantee" "best-effort and RACEABLE" "delete/delete/insert" "one live attempt per user" "none built yet" "no migration exists yet" "appUrlOpen" "browserFinished" "never a real link" "posts nothing and carries no client id"; do echo "=== $p ==="; grep -rn --fixed-strings "$p" app/server app/src ROADMAP.md docs/superpowers/specs docs/superpowers/plans docs/design/handoffs | grep -v "2026-09-02-concept2-pr175a-server.md" | grep -v "2026-09-02-concept2-pr175-app-bind-design.md:6[12][0-9]:" | cut -c1-140; done
```

Expected result after this task (baseline counted 2026-09-02 at `0991046c`; ledgers `.claude/agents/*-ledger.md` and `docs/history/` are outside the scope by construction — they are records nobody edits):

| phrase | expected hits | accounted residuals |
| --- | --- | --- |
| `correlates, not binds` | 1 | gate doc `:76` (revision history of round 15 — historical, under the marker) |
| `No redirect_kind column` | 2 | PR1's plan `:150` (merged-plan history, never rewritten by its own top note); gate doc `:695` (quotes the deleted comment; under the marker) |
| `not yet added here` | 0 | — |
| `deliberately unauthenticated` | 0 | — |
| `unauthenticated BY DESIGN` | 1 | gate doc `:699` (under the marker) |
| `sequential-replace guarantee` | 0 | — |
| `best-effort and RACEABLE` | 0 | — |
| `delete/delete/insert` | 0 | — |
| `one live attempt per user` | ≤ 6, none stale | design `:279,:323` (CURRENT, correct: "ENFORCED"); ROADMAP `:1304` (rewritten to "ENFORCED"); parent spec `:298` (appended "ENFORCED at PR1.75a"); gate doc `:1058,:1062` (§6, under the marker); native-link plan `:90` (merged-plan history, 1.75b's) — pass condition: no hit still pairs the phrase with "best-effort"/"raceable" outside the gate doc's marked sections |
| `none built yet` | 0 | (§4 bullet rewritten in step 5) |
| `no migration exists yet` | 0 | — |
| `appUrlOpen` | no hit describing PR1.75's MECHANISM | ROADMAP `:994` (PR1.5 row's narration of what moved — historical), parent spec `:202,:225,:242` (the Branch-B contingency the design keeps on record) and `:632,:642` (PR1.5 narration), gate doc `:677,:794,:991` (under the marker), native-link plan `:5` (1.75b's), research `2026-07-27-capacitor-vs-react-native.md:52` (research, not a PR claim), design `:416` ("Why this over … `appUrlOpen`") — pass condition: ROADMAP `:1009` and parent spec `:574` no longer name it as PR1.75's mechanism |
| `browserFinished` | server 0; client hits DEFERRED | every `app/src` hit + ROADMAP `:992` + PR1.5 docs are 1.75b's return-arm census |
| `never a real link` | 1 | `app/src/monitor/Concept2LinkProbe.tsx:6` — DEFERRED to 1.75b (scope gate) |
| `posts nothing and carries no client id` | 0 | (only the PM ledger carries it, outside scope) |

Any hit not in this table is a defect in this task: fix it or add it to the table with its reason before the PR opens.

- [ ] **Step 8:** `pnpm lint && pnpm typecheck && pnpm format:check` (comments-only change class), then commit `docs(c2): reconcile server comments, ROADMAP, parent spec, gate doc (supersession marker) and handoff README for PR1.75a`.

### Task 10: The PR

- [ ] **SDLC checks, in order:** `git rev-parse --show-toplevel` prints the worktree; `git status` on the MAIN checkout (`/Users/james/projects/github/jamesawesome/Ergomatic`) shows no stray writes from this work (RF20 — the pre-existing `app/ios/App/...` modifications there predate this plan and are not ours; report them, do not touch them); `git merge origin/main` on the branch (agent briefing pre-ready checklist), gates green on the merged tree; push; open the PR; wait for a CI run to EXIST and go green (an empty check rollup is not green).
- [ ] **Scope gate (mechanical):** `gh pr view <n> --json files --jq '.files[].path' | grep -E "^app/(src|ios)/"` → empty; paste the empty result in the Record.
- [ ] **PR body.** Above the fold: the PM's fold VERBATIM (design §0 / the PM report — the controller holds the six bullets; the outcome line is fixed). Count the words: ≤ ~120 above the fold, ≤ ~25 per bullet (CLAUDE.md, the countable form). Draft, to be REPLACED by the PM report's bullets verbatim where they differ:

> This PR makes a Concept2 link provably belong to the account that started it.
>
> - Both completion paths now check who is completing: the web callback reads the session cookie, the new native exchange reads the bearer. Wrong account is refused before any Concept2 call.
> - Each link attempt records the surface that minted it (native or web) and can only complete there.
> - Mint is one atomic statement: one live attempt per user, enforced by the database, no more race.
> - The callback pages are the approved styled set; the Linked page names both the Concept2 and Ergomatic identities.
> - One Concept2 account can be linked to one Ergomatic account per database (409 otherwise).
> - Tester impact: none. Everything stays dark behind `C2_LINK_ENABLED`; no client or iOS file changes; no e2e run needed.
>
> Intentional interval, stated: after 1.75a, mint returns `haus.waffle.ergomatic://oauth/callback` to any bearer caller and nothing on the device can receive it yet. Harmless (flag off; the only native consumer, `Concept2LinkProbe`, never calls mint) and deliberate.

Then the collapsed block:

```html
<details><summary>Record (for agents and audits)</summary>

- **Head:** `<sha>` (reconciled against `gh pr diff --name-only` at this head; every claim below describes this head).
- **Scope gate:** `gh pr view <n> --json files --jq '.files[].path' | grep -E "^app/(src|ios)/"` → (empty). No `pnpm e2e` (RF1's trigger is `app/src/`).
- **Risk class:** TRIAD (AUTH + stored shape, migration 0020). Antagonist: SKIP, spoken — design §0 ("the full TRIAD pass covered every server invariant here and the split adds none"). PM: FULL final-PR gate. Walk: none (CI-provable).
- **Migration 0020:** index check at generate time and at PR open (`ls app/drizzle`, `gh pr list … files`) — paste both. Hand-edited: the header + `DELETE FROM "concept2_auth_attempts"` prepended; journal/snapshot as generated.
- **Mutation log** (every probe run against the committed tree; RF21/RF22): a table of `file | mutation | test that died | exact failure text | restored (git status clean)` — one row per probe listed in Tasks 1-7, including the two exit-criterion-1 mutations (identity check moved after exchange; consume moved before the check), the statement-level concurrent-mint mutation with WHICH outcome it produced, and the above-the-seam `app.ts` sessions mutation.
- **Contrast (RF6):** ink #1c1a17 on #fffdf8 = 17.08:1, on #f6f3ec = 15.67:1; label #5f5a50 on #fffdf8 = 6.74:1, on #f6f3ec = 6.18:1.
- **Grep census (Task 9 step 7):** the command's full output, then the per-phrase table with each residual named and owned.
- **Coverage, per file (RF2):** the five touched/new server files' rows, source named (HTML report).
- **`dist:grep`:** unchanged needles, the OK line, and the reason (server-only strings; `dist/client` never carries them).
- **Plan deviations / observations 1-14** (this plan's section) — in particular #3 (Concept2 `username` MEASURED present; `#<id>` is a null-guard only) and #8 (no contract suite for the concept2 store) for James/PM to rule on.
- **Records updated:** ROADMAP `:999-1020` (PR1.75 row status line), `:1304` (register row: ENFORCED / built server-side); parent spec `:248,:298,:429-441,:568-575`; gate doc §3(g)/§4/§6 supersession marker + §4 bullet; handoff README `:94-97`. Deferred to 1.75b (listed, untouched): `Concept2LinkProbe.tsx:5-10`, `useReturnToApp.ts:8-45`, both `externalBrowser` files, the PR1.5 native-link plan.
- **Ledgers:** no agent ran on this PR (antagonist skipped per design §0; the PM's final-PR gate report, when it arrives, proposes its own entry — the controller lands it; agents never write their own ledgers).
- **Still owed after this PR (design exit criterion 8):** 1.75b (native return, return-arm census, the walk with the `AUTH_VIA_LOG=1` readings), the flag flip, live-portal registration of the native redirect, PR2's surface + identity line, promotion of the app-wide disagreement refusal.

</details>
```

- [ ] After James's review round(s): re-review signal only when fixes + internal review + push + a green CI run that EXISTS are ALL done ("PR #n is ready for your re-review", its own sentence). Never merge; James merges.
- [ ] **Release recommendation to post at merge:** "not needed" — nothing tester-visible (flag off, no client change); PR2 re-checks the reserved version at its own merge.
- [ ] **Agent-config check at merge (non-fast-path):** propose either "no change needed" or a CLAUDE.md line for observation 3's class (a Gate 0-approved copy string that names a wire field no capture has shown) — the controller decides.

## Self-review notes

- Design coverage: §1 `authVia` + empty cookie + bearer-wins + two-scope disagreement ✓ (T3, T6); §2 migration 0020 + rollback halves + atomic upsert + PK retry + `peekAttempt` + `consumeAttemptFor` + retirements + D1 ✓ (T1, T2, T6); §3 per-surface redirect + `linkClient` + `{authorizeUrl, state}` + both client signatures ✓ (T4, T6); §5 web ladder in order, availability consumes nothing, route-local resolver, `Referrer-Policy`, no-subresource constraint, escaper ✓ (T5, T6); §6 native exchange with 2b ✓ (T6); §7 template + verbatim copy + palette ✓ (T5); §Testing server bullets each with a named mutation ✓ (T2, T3, T6, T7); RF24 rows on real Postgres incl. concurrent mint at the statement level ✓ (T2, T7); exit criterion 5 reconciliation with a census exit ✓ (T9); `dist:grep` stated ✓ (T8); PR body per house shape + Record ✓ (T10). §4 (native plugin, `linkFlow`, return-arm census), the device walk and every client site are 1.75b's and are named as deferred, not silently skipped.
- Type consistency: `LinkSurface`, `PeekedConcept2Attempt`, `ConsumedConcept2Attempt`, `AttemptNonceCollisionError`, `Concept2LinkConflictError`, `cookieToken`, `AuthVia`, `NATIVE_REDIRECT_URI`, `NATIVE_LINK_CLIENT`, `renderCallbackPage`, `webRedirectUri`, `sessions` are used with the same names and shapes in T2-T7.
- Commit shape: T1 alone; T5 alone; T2+T3+T4+T6+T7 as one commit (the whole-project pre-commit typecheck forbids the intermediate states — stated in T2 step 5, not discovered at commit time); T9 alone. Every mutation probe runs after the commit that carries the code it targets.
