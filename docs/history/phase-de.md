# Phase DE — Difficulty out, effort in (CLOSED 2026-09-19)

**Closed by James's word on 2026-09-19, together with Phases MT and PS, in one
doc-class PR.** Shipped in v0.39.0 (#309, #310) and v0.46.0 (#400). Close
record, with all six of the spec's exit criteria and the pasted greps:
`docs/closeouts/close-DE.md`.

**PM close gate: PASS WITH CONDITIONS, both met in the close PR.**
**Antagonist exit pass: HOLDS WITH STATED LIMITS.**

- **Kept ON PURPOSE, and recorded in code:** the legacy bulk header
  `title | TYPE | difficulty | pain` is still accepted and ignored
  (`app/domain/bulk.ts`, `HEADER_MESSAGE` and the field-count comment).
- **Spec §6.5's "this spec's body moves to `docs/history/`" was DELIBERATELY
  NOT DONE.** No closed phase has ever moved its spec (159 files in
  `docs/superpowers/specs/`, none in `docs/history/`), and moving this one
  would dangle five citations, two of them in tracked SQL
  (`0024_pain_to_effort.sql`, `0029_drop_difficulty_compat.sql`). The spec
  stays at `docs/superpowers/specs/2026-09-05-difficulty-out-effort-in-design.md`.
- **Migration 0029's drops are confirmed on production** without SSH: the
  household creates custom workouts there, `workouts.difficulty` was
  `NOT NULL` with no default and nothing writes it, and drizzle runs every
  pending migration and its journal row in ONE transaction — so that one
  insert proves all three drops landed.
- **One criterion is literally unmet and was accepted:** "`effort` means one
  thing" has two English-idiom exceptions, `bestEffort` (a fire-and-forget
  helper, two files) and `effortful` (one comment).

The body below is the section as it stood at the close, verbatim.

---

## Phase DE — Difficulty out, effort in

**Status: all three PRs merged — spec (#308) 2026-09-05, PR 1 (#309)
2026-09-05, PR 2 (#310) 2026-09-05 (shipped as v0.39.0), PR 3 (#400)
2026-09-12, per the Saturday trigger below and James's explicit merge
approval. Phase functionally done; `/close-phase` not yet run** (the
exit-criteria walk, PM close gate and moving this spec to
`docs/history/` are separate work). **TRIAD** (stored shape).
**M.** Spec:
`docs/superpowers/specs/2026-09-05-difficulty-out-effort-in-design.md`.

**Goal:** a rower sees one figure for how hard a workout is, called EFFORT,
on every row, filter, picker, log and article. EASY / MEDIUM / HARD goes
(across all 300 seeded workouts it was a coarse copy of the 1–5 figure:
easy always 1–2, hard always 4–5, medium 2–4), and the 1–5 figure formerly
called PAIN is renamed. Nothing about what the number means changes;
nothing here reaches the PM5 or the pace math, so no hardware walk.

**Why it runs before Wave A:** a stranger reading `PAIN 4/5` on their first
log is itself a north-star failure, and a rename only gets more expensive
as surfaces accumulate; this is M-sized and touches no auth.

Three PRs, in order; **PR 1 and PR 2 ride ONE tag — no release between
them** (a tag after PR 1 alone ships a half-move and a second stale-build
generation):

- [x] **PR 1 — remove difficulty (#309).** No migration: the column, enum and
      `preferences.difficulties` stay as read-only compat until PR 3, and
      the server writes a difficulty DERIVED from effort on every insert
      (1–2 easy, 3 medium, 4–5 hard) so pre-PR-1 builds — which call
      `difficulty.toUpperCase()` in three renderers — never see a NULL. The
      chip, both filter groups, the preference, the builder radiogroup, the
      seed field and the bulk-header column go. Bulk header becomes
      `title | TYPE | effort`; the 4- and 5-field legacy headers still parse
      with difficulty ignored. Today's suggestion filters on type, time and
      effort only. `library.test.ts`'s within-type ordering invariant is
      re-expressed over effort, not deleted — which required a stable
      re-sort of the AT and TR seed blocks (38 rows move; the seeder's
      converge then rewrites their stored difficulty at merge, 27 of them
      medium→hard as pre-PR-1 builds see it). **Gate 0 captures** (row, Today
      card, both sheets, classification card) before implementation.
      Reconciles the DEVIATIONS "Difficulty" row, the "picking a workout"
      article's false "easy and a 4" example, `library-moves.ts`, both
      skills' pasteable headers.
- [x] **PR 2 — rename pain → effort (#310).** HAND-WRITTEN migration (drizzle has
      never generated a RENAME here; its non-TTY fallback is DROP+ADD):
      column renames on `workouts` and `session_logs` plus an
      `article_reads.slug` UPDATE. NOT rollback-safe and `deploy.sh`'s
      health-gated auto-rollback crosses it unattended — PR 2 adds its tag
      as a RELEASING.md § Rollback-constraints floor row, FORWARD-FIX ONLY.
      API serves both `pain` and `effort` (nine response sites) and accepts
      either on write (three inbound sites; both present and unequal → 400);
      every `pain`-keyed write emits a `compat.pain_write` log line. Three
      localStorage keys read the old key as a fallback for one release.
      `PainBar` → `EffortBar`; article slug `pain-scale` → `effort-scale`
      with the old slug still resolving. The pace-word identifier FAMILY
      (~20 names: `Effort`, `EffortRef`, `isEffortRef`, `effortWord`, …) →
      `PaceWord*`, **stored key `{effort: "max"}` untouched.** Gate 0 is the
      word list (spec §4.4), no captures; the committed filter-sheet
      screenshots are refreshed in the PR. (An earlier "waits for AUD-016"
      condition here was void: AUD-016 shipped as #239 and was struck in
      #240; `Ergomatic-wt-aud016` is a stale pre-#239 spec branch.)
- [x] **PR 3 — drop compat. MERGED as #400 (2026-09-12).**
      (James, 2026-09-05: "We have like five users let's just schedule the work for
      Saturday"). **BEFORE generating this PR's migration: Phase RW PR C
      merged `0026` on `preferences` first, so delete any migration written
      off an older main and re-run `pnpm db:generate` against current main.**
      Drizzle applies journal entries whose `when` is strictly greater than
      the newest already applied, so a migration generated earlier is
      skipped **silently** — no error, no log line — and because
      `db.select().from(preferences)` names every declared column, the next
      `/api/prefs` 500s for every rower. No gate here can see it: every
      integration suite starts from an empty database and the deploy health
      check reads no schema. After this PR deploys, `curl` the deployed
      `/api/prefs` and confirm the body still carries `baselinesSkipped`. The earlier zero-`compat.pain_write`-for-seven-days
      MEASUREMENT is struck: the cohort is five household testers who all
      update, and `docker logs` only covers the current container, which
      every deploy recreates — so the gate was both overkill and
      unsatisfiable. The log line survives the week as a tripwire to grep,
      not a gate. Drop `workouts.difficulty` + its enum + `preferences.difficulties`
      and the derived write; drop `pain`/`difficulty`/`difficulties` from
      the API and the log line; delete the three localStorage fallbacks.
      Legacy bulk headers are kept on purpose. Own RELEASING.md floor row.

      **This order is DONE, not at risk** — the ONLY order in the file whose
      trigger was a calendar date, and the Saturday it named is the day it
      merged. Recorded here as the contrast case: eleven other live orders
      carried a wave, a PR, or him asking, and every one of those slipped;
      this one didn't. **Migration precondition verified**: the 0029 migration
      was regenerated off current main (0028 was the tip) before this PR
      opened, and CI's own `app` job ran the full migration chain against a
      real ephemeral Postgres (via `pnpm test:coverage`'s integration suite)
      before this merge. **AND the merge's own deploy ran clean**: the
      `deploy` job (self-hosted runner, `scripts/deploy.sh` over SSH) on
      commit `13adce4` completed successfully
      (github.com/JamesAwesome/Ergomatic/actions/runs/34699658452,
      job 103570288978) — its health-gated wait passed against the real
      production database with 0029 applied, which is the actual event the
      "curl the deployed `/api/prefs`" line above exists to catch a failure
      of. **RE-VERIFIED BY HAND 2026-09-13, and it passed.** James ran the
      authenticated read in a browser at `https://ergomatic.waffle.haus`:
      `await (await fetch('/api/prefs')).json()` — same-origin, so
      the `erg_session` cookie rides automatically, and `originCheck`
      (`app/server/auth/middleware.ts:41-62`) gates only MUTATING methods,
      so a GET with no `Origin` passes. Production reported
      `{"ok":true,"db":true,"version":"v0.46.0-4-g99f82298"}` at the time of
      the check, and the body carried all six declared keys:
      `timeCapMinutes: 60`, `countdownSeconds: 10`,
      `paceToleranceSeconds: 1`, `accentColor: "#b5341f"`,
      `startHereDismissed: true`, `baselinesSkipped: false`.
      **`baselinesSkipped` being present is the thing this line existed to
      catch:** `createPreferencesStore.get`
      (`app/server/stores/preferences.ts:28-33`) does
      `db.select().from(preferences)`, which drizzle expands to an EXPLICIT
      column list, so a silently-skipped 0026 would 500 here whether or not
      the user has a row. And `startHereDismissed: true` differs from
      `PREFERENCES_DEFAULTS` (`false`, `preferences.ts:20`), which proves
      this was a real row out of Postgres rather than the no-row default
      object `get()` falls back to.
      **What this read could not see — whether 0029's DROPs landed — is
      settled without SSH, in two steps.** INFERRED, strongly: `migrate()` is
      a top-level `await` before the server listens (`app/server/index.ts`),
      so a migration that failed would have killed the boot, failed
      `deploy.sh`'s health wait and rolled back — and that deploy passed.
      DECISIVE, and SETTLED 2026-09-19: `workouts.difficulty` was `NOT NULL`
      with no default (`drizzle/0001`) and nothing has written it since #400,
      so one successful custom-workout creation on production proves the
      column is gone — and James confirms the household creates custom
      workouts on production "all the time". The drops landed. Nothing is
      owed here.
**Exit:** the two phase-close greps in spec §6 (no `pain`/`difficult`; and
`effort` means one thing) pasted into the close gate; e2e and screenshots
green with refreshed captures; the by-hand stale-build check (a `v0.38.1`
web build against the post-PR-2 server saves `pain: 3`, reads back
`effort: 3`, and a workout it creates carries a derived difficulty)
recorded in PR 2's body; release note in rower words (spec §6.6).
