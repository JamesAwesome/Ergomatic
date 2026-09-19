# Register evictions — 2026-09-19

Rows struck or evicted from `ROADMAP.md` on James's word during the
2026-09-19 refinement of Wave E and Phases MT, DE and PS. Each is kept
verbatim below its reason, so no measurement in it is lost. Nothing here is
live work.

---

## The history LIST has no `(user_id, logged_at desc, id desc)` index (Wave E)

STRUCK by James 2026-09-19. Its trigger — the next migration touching `session_logs` — fired the day after filing (`0028`, #360) without carrying it, and the DBA then ruled it "stays unowed" (`dba-ledger.md`, Phase PS).

- [ ] **The history LIST has no `(user_id, logged_at desc, id desc)`
      index.** Found by the Phase LP DBA benchmark, 2026-09-07
      (`docs/superpowers/research/2026-09-07-machine-summary-jsonb-vs-columns.md`,
      "Two things I found on the way"): `schema.ts` carries only
      `session_logs_user_id_idx`, and at 25k rows per user the page of 50
      measured ~40 ms without the composite index and ~0.25 ms with it,
      identically for both storage shapes. Not a Phase LP change (no LP
      query touches it); rides the next PR that adds a Drizzle migration
      to `session_logs`. **S** · dies 2026-10-12 (dated on the way past by
      Phase PS PR 0, campsite rule) · Phase PS's `GET /api/stats/rows` does
      not open it either — the DBA measured 2026-09-12 that a full-history
      read IGNORES the composite (743 vs 726 ms at 100k; it pays only under
      `LIMIT`), so no PS query needs it; James rules keep/kill at the PR 0
      hand-back.

---

## Generated columns for `machine_summary.totalCalories` / `avgWatts` (Wave E)

STRUCK by James 2026-09-19. Its trigger was the You-stats phase wanting a covering index; Phase PS opened and the DBA measured neither column reachable from that shape (`dba-ledger.md`).

- [ ] **Generated columns for `machine_summary.totalCalories` /
      `avgWatts` when the You-stats phase wants a covering index.** The
      same benchmark's one real jsonb gap: Postgres `INCLUDE` takes
      columns, never expressions, so a covering index for a per-user
      monthly roll-up must carry the whole ~666-byte blob (346 MB vs
      48 MB at 1M rows; 12-month cohort roll-up 337 ms vs 53 ms). The
      escape hatch needs no backfill and no write-path change:
      `GENERATED ALWAYS AS ((machine_summary->>'totalCalories')::int)
      STORED`, then a btree/covering index on it. James (2026-09-07):
      lifetime and monthly calories and average watts are the two figures
      You will show. Opens WITH that phase, not before — at household
      scale the un-indexed SUM measures ~1 ms. **S** · dies 2026-10-12
      (dated on the way past by Phase PS PR 0, campsite rule; the trigger
      FIRED 2026-09-12 when PS opened) · the DBA measured 2026-09-12 that a
      covering index or generated column cannot help PS's per-row
      projection — it helps only a SERVER roll-up (`SUM ... GROUP BY`),
      which the PS design does not do, so the phase does not open this;
      James rules keep/kill at the PR 0 hand-back.

---

## `connected.spec.ts:1703` poisons its own origin for a later run (Phase MT)

STRUCK by James 2026-09-19. The mechanism is false: no `storageState` or persistent context exists, so browser storage cannot survive into a later test (two-test probe recorded in `docs/history/wave-d.md`), and the reported symptom contradicts it anyway — `signInViaBackdoor` fails on a server `page.request.post` made before any page storage exists (`app/e2e/helpers.ts`). One sighting, 2026-09-08, never re-sighted. `fillOriginStorage` was moved inside its `try` by #434. Struck rather than folded into FLAKE 5, because folding would carry the false mechanism forward.

- [ ] **`connected.spec.ts:1703` poisons its own origin for a later run.** The
      QuotaExceededError leg fills origin storage until `setItem` genuinely
      throws; its own title says "junk cleaned up after", but a SECOND run
      against the same already-booted stack fails at `signInViaBackdoor`,
      before any assertion. Seen 2026-09-08 during Phase MT: full `pnpm e2e`
      passed 545/545 on a fresh stack, and re-running that one test against the
      surviving stack failed. Either the cleanup misses something or the
      failure is in the harness's own storage use. Costs a debugging round to
      whoever meets it next. **S**

---

## FLAKE 2 — one CI run failed four tests across four unrelated specs at once (Small, queued)

EVICTED by James 2026-09-19. #457 (`653bd5ea`) repaired all three of this run's remaining failures and the fourth was FLAKE 4's; FLAKE 5 carries the detail. Marked DONE in place on 2026-09-19 (#476) and evicted the same day.

- **FLAKE 2 — one CI run failed four tests across four unrelated specs at
  once.** · dies 2026-10-14 · a row and not a fix now because a single run
  is an anecdote; what it needs first is a COUNT, and nothing collects one.
  **DONE 2026-09-16 — #457 (`653bd5ea`) took the count and repaired all three
  of this run's remaining failures** (the NFC status, the pairing locator and
  the axe timeout; the fourth was FLAKE 4's). Each had its own cause and none
  was the runner — FLAKE 5 below carries the detail. Proposed for eviction at
  the 2026-09-19 hand-back; left here until James rules, since nothing is
  struck without him. Original filing follows.
  **2026-09-13, PR #423's run `34737876236`:** three failed plus one flaky
  out of 569 — `connected.spec.ts:2236` (the NFC scan's `✓ Monitor found`
  never appeared), `design.spec.ts:7601` (a pairing locator),
  `design.spec.ts:776` (an axe `page.evaluate` timing out at 30 s) and
  `stats.spec.ts:46` (`LIFETIME · 54,752 M`). **All four passed on a re-run
  of the identical commit**, main was green, and the branch's diff touched
  only the log detail's two components plus a comments-only edit to
  `fake.ts` — verified by filtering that diff to non-comment lines, which
  returned nothing.
  **ONE OF THE FOUR IS NOW ACCOUNTED FOR, and it was not the runner.**
  `stats.spec.ts:46` (`LIFETIME · 54,752 M`) is the delete-then-read race
  closed under FLAKE 4 on 2026-09-14 — a real, reproducible bug in the
  test, not load. That leaves three, and it weakens the inference below
  rather than refuting it: a row that reads "four unrelated specs at once"
  is a weaker signal once one of the four has its own cause.
  **Four unrelated specs in one run reads like the RUNNER, not like any one
  test** — the axe timeout is the most suggestive single data point, being
  the heaviest step in the suite. But one run is not a population, and this
  row deliberately does not open a hunt.
  **THE COUNTING METHOD, SETTLED 2026-09-14 — and this row's own
  description of the artifact was wrong in BOTH directions.** It said the
  `playwright-report` artifact is "already uploaded on every red run".
  `ci.yml:141` is `if: always()`, so it uploads on GREEN runs too — which
  matters enormously, because `playwright.config.ts:21` sets
  `retries: 1` under CI and a test saved by its retry leaves the job green
  (2 of 9 FLAKE 1 occurrences went red; 0 of 10 for FLAKE 3). So the
  artifact is not blind to flakes. **THREE of FLAKE 3's ten are
  unreachable anyway, for two different reasons:** two expired out of the
  `retention-days: 14` window (`ci.yml:146`), and the 2026-08-15 one
  predates `196d817e` (2026-08-22, the #152 flake hunt), when the step was
  still `if: failure()` and a flake's report was never written at all.
  Artifacts alone would have found 7 of 10.
  **What works, and what was actually used here:** fetch the `e2e` JOB LOG
  for every attempt of every CI run (1,359 runs, 1,318 `e2e` job entries)
  and grep the Playwright summary lines. Logs currently reach the first CI
  run (2026-07-27) where artifacts do not — though that is this repo being
  younger than GitHub's 90-day log retention, not a property of logs, and
  it expires around 2026-10-25.
  **Two traps, and the first write-up of this paragraph got both wrong.**
  `gh run list` has no `--paginate` flag and errors `unknown flag`; the
  1,000-result cap belongs to the Actions run-list API and applies only
  when you FILTER (by `actor`, `branch`, `check_suite_id`, `created`,
  `event`, `head_sha` or `status`) — unfiltered enumeration returned all
  1,396. Date-windowing works, but `created` is itself a capped parameter,
  so keep each window under 1,000. And the log API's failure is LOUD, not
  silent: without `--allow-escape-sequences` `gh` writes zero bytes and
  **exits 1** naming the flag on stderr. A pipe is what hides it.
  **Local context worth recording:** this machine was measured at ~750 MB
  free with swap at 3.7 of 5.1 GB while two sessions ran full suites at
  once, and two CI watchers were killed for memory the same day. Whether
  GitHub's runners are under comparable pressure is unknown and is exactly
  what a count would show. **S**
