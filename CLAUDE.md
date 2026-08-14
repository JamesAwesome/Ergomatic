# Ergomatic

Mobile-first rowing (erg) workout tracker/planner around The Erg Book model.
Roadmap: `ROADMAP.md` (phases + standing rules). Design reference: `docs/design/`
(high-fidelity; 44px hit targets and WCAG AA are hard requirements).

## Layout

- `app/` — the deployable: `src/` (React 19 + Vite client), `server/` (Express 5 API),
  `domain/` (pure Erg Book logic — no framework imports allowed)
- Root `package.json` exists only to host husky hooks. Run `pnpm install` at root
  AND in `app/`.
- `app/pnpm-workspace.yaml` is auto-generated pnpm config (`allowBuilds` for esbuild,
  plus other keys pnpm adds during installs) and makes `app/` its own pnpm workspace
  root, so the repo-root `.npmrc` does not apply inside `app/`.

## Commands (run in `app/`)

- `pnpm dev` / `pnpm dev:server` — Vite client :5173 (proxies /api) / API :8080
- `pnpm lint` · `pnpm format` / `pnpm format:check` · `pnpm typecheck` · `pnpm test` ·
  `pnpm test:coverage` (90% gate) · `pnpm build`
- Single Vitest project: `pnpm test --project unit|client|integration`
- `pnpm e2e` — Playwright flows + structural design assertions against the real
  compose stack (boots it if not running). `pnpm screenshots` — captures
  `docs/screenshots/*.png` the same way. `pnpm mutate` — Stryker mutation testing,
  on-demand (see docs/TESTING.md §3); minutes, not part of the push/CI gate.
- Local dev DB: `docker run --rm -d --name erg-dev-pg -p 5433:5432 -e POSTGRES_PASSWORD=dev postgres:18.4`
  then `DATABASE_URL=postgres://postgres:dev@localhost:5433/postgres pnpm dev:server`.
  The server refuses to start without `DATABASE_URL` (no dotenv — real env only).
- Local OAuth: set `SITE_URL=http://localhost:5173` when running `dev:server`
  (redirect URI derives from it; without it Google errors redirect_uri_mismatch):
  `DATABASE_URL=... SITE_URL=http://localhost:5173 GOOGLE_CLIENT_ID=... GOOGLE_CLIENT_SECRET=... ALLOWED_EMAILS=you@gmail.com pnpm dev:server`

## Rules

- **SDLC (binding for all agents — brief every subagent with this bullet before
  it starts work):** All implementation happens in git worktrees, never in the
  main checkout; tear the worktree down immediately after its PR merges (and
  only then). **Run `git rev-parse --show-toplevel` before every commit and
  confirm it prints your worktree path** — three agents have committed to the
  main checkout despite being told not to; the check catches it, the
  instruction alone does not. **No PR merges without James's explicit
  approval** — green CI and a clean final review are necessary but not
  sufficient; present the review verdict and stop. Subagents never merge,
  close, or approve PRs and never remove worktrees; main is PR-only, no merge
  commits. **After creating a worktree, run `pnpm install` at the worktree
  root AND in `app/`, then verify hooks actually fire** (e.g. a deliberate
  lint error gets blocked) before relying on them — a phase already lost a
  review round when root-only install left `.husky/_` missing, `core.hooksPath`
  pointed at nothing, and git silently skipped every hook, letting a commit
  land that broke both typecheck and lint. **Every subagent reads
  `.claude/agent-briefing.md` before its task brief** — the standing rules
  live there, not in per-dispatch boilerplate. **Phase teardown checks
  `git status` on the main checkout** before removing the worktree; stray
  writes there have happened four times and are only cheap to fix while the
  branch still exists.
- **Fast path (James-approved, 2026-08-01):** a change may skip the
  subagent implement/review cycle when ALL hold: no `app/domain/` or
  `app/server/` code, no stored-data shape, no auth; roughly one file of
  product code (tests/CSS/docs don't count against it); and the failure
  mode if wrong is cosmetic or test-only. Fast-path changes still get a
  worktree, failing-test-first, self-mutation, the scoped gates, and a PR —
  Claude implements inline and **James is the reviewer**, with the PR
  carrying screenshots and a one-paragraph risk note ("what I'd have asked
  a reviewer to probe"). Anything that surprises mid-change escalates to
  the full cycle, stated in the PR. A fast-path change that ships a bug
  sends the next change of its kind back to the full cycle.
- **Brainstorming carries a research pass and a does-it-exist question
  (added 2026-08-14).** Before a design is presented for approval, two
  things happen, and the spec records both — including "nothing found",
  which is itself a result.
  - **Research the triggers.** Anything the OS, browser or device OWNS
    (safe areas, permissions, background execution, Bluetooth lifecycle,
    wake locks, storage); any wire or protocol semantics (what a field
    means, when it resets, what is authoritative); any mechanism we are
    about to INVENT (a reconciler, an accumulator, a scheduler, a state
    machine) — who solved this already and what did they learn; and any
    accessibility or platform convention with a published standard.
    Vendor docs and specs first, implementation source second, blog posts
    last and labelled. Tag claims PRIMARY / SECONDARY / INFERENCE.
    _Cost of skipping, measured:_ the connected gutter was derived from
    first principles across two sessions and a NO-GO, when Apple
    documents that the landscape inset protects the rounded corners as
    well as the housing — which was the whole answer.
  - **Ask whether the underlying system HAS the concept.** Before
    designing a state, mode or capability, establish that the real system
    (the PM5, iOS, the browser) has it. If it does not, name what we are
    asserting on its behalf and who is wrong when it matters. _Cost of
    skipping:_ we shipped a PAUSED state the PM5 does not have and cannot
    have, on a monitor whose clock keeps running, and the block we drew
    covers the one number that would have told the rower so. We KNEW the
    wire fact the whole time; nobody asked the product question.
- **Two standing agents, `product-manager` and `antagonist`
  (`.claude/agents/`), keep ledgers that are part of the repo.** Both
  append what they learn to their ledger at the end of an engagement; a
  dispatch that skips the ledger update wastes the half of them that
  compounds. **They have fixed trigger points (James, 2026-08-14) — these
  are gates, not suggestions:**
  - **`product-manager` runs twice per phase.** Once when a DESIGN is
    presented, before James approves it — its job there is scope, shape
    and whether this should be built now. Once when the FINAL PR is
    posted, before James's merge word — its job there is exit criteria
    against what actually happened, tester impact, the release call, and
    what landed after the last review. Present its verdict with the PR;
    do not merge on green CI alone.
  - **`antagonist` runs on every SPEC and on every TASK BRIEF.** On a
    spec it is the full adversarial pass this repo already runs between
    spec and plan (`spec → adversarial → plan → SDD`) — that step IS this
    agent now. On a task brief it is a narrower PREMISE pass before
    dispatch: does this brief assert anything unverified, invent a
    mechanism without checking prior art, or contradict what the code
    does? Briefs have shipped factual errors here and an implementer who
    works around one silently costs a review round.
  - **Scope control for task briefs:** the premise pass is cheap and
    scoped to the brief's claims, not a review of the whole task. If a
    wave's briefs are near-identical, one pass over the set is enough —
    say so rather than running ten.
- **Mid-phase requests batch to the phase's close-out task** (or the fast
  path after merge) instead of resuming a live agent — one review instead
  of several resumed contexts. Exception: anything that invalidates
  in-flight work interrupts immediately.
- **Native-first:** the iOS app is the primary surface; design decisions
  favor it. The web build is the same code serving as test harness
  (Playwright/design/screenshots), dev loop, and fallback — never dropped,
  never polished at the app's expense. Platform conditionals live ONLY in
  the adapter layer (`src/platform.ts`, `src/api.ts`, `src/native/`,
  `src/adapters/` — lint-enforced via no-restricted-imports).
- **Verify current versions before adding/pinning any dependency** (`npm view <pkg> version`).
  Never trust versions from memory or other repos. TypeScript stays `~6.0.x` until
  typescript-eslint's peer range admits 7 (check `npm view typescript-eslint peerDependencies`).
- Testing policy: docs/TESTING.md governs — the pyramid, naming/assertion-quality
  rules, coverage stance, contract-test rule, and structural design assertions all
  live there. Read it before writing or reviewing tests.
- TDD: failing test first. Domain code gets the heaviest coverage.
- Hooks: pre-commit = lint-staged + typecheck; pre-push = unit + client tests only
  (fast, Docker-free — CI runs the full gate incl. integration/e2e). Both hooks fail
  loudly and block if the active Node major is below `.nvmrc`. Don't bypass with
  `--no-verify`; fix the failure.
- pnpm only. ESM only. Server imports use `.js` extensions.
- After every merge to main, post a TestFlight release recommendation
  (docs/RELEASING.md): "recommended: <reasons>" or "not needed". Versions
  come ONLY from annotated vX.Y.Z tags; API changes additive-only between
  tags.
- **After every NON-FAST-PATH merge, also check the agent configs**
  (James, 2026-08-14) and say explicitly which: "agent configs updated:
  <what>" or "no change needed: <why>". The question is whether this work
  taught us something the next agent should start with — a ruling for
  `pm-ledger.md`, a falsified claim and the technique that caught it for
  `antagonist-ledger.md`, a new recurring failure for this file, or a
  correction to a definition in `.claude/agents/`. Pair it with the
  release recommendation so both happen in the same breath. Fast-path
  merges are exempt by definition: if a change was small enough to skip
  the cycle, it is small enough to teach nothing.

## Recurring failures — read before you start

Every item below has actually happened here, most of them more than once, and
each cost a review round or a follow-up fix wave. They are ordered by how
often they recur.

1. **Changing UI without running `pnpm e2e`.** Three phases running, a task
   changed a component and left the e2e suite red because only
   `--project unit --project client` was run. The e2e job gates CI. **If your
   diff touches anything under `app/src/`, run `pnpm e2e` before you report
   done** — and `pnpm screenshots` too if you changed a screen's layout.
2. **Trusting the aggregate coverage gate.** The 90×4 threshold is repo-wide,
   so a brand-new file can ship with entire branches uncovered and the gate
   still passes. Four components did exactly that (keyboard handlers twice,
   error branches twice). **Check the per-file numbers for files you touched.**
3. **Fixtures that don't look like production data.** The name generator
   returned the same name forever against the real 35-workout library while
   every test passed, because the tests used an empty library. A whole phase's
   `wu`/`r` rendering branch shipped with an accessibility defect because every
   test and design sweep built `kind: "w"` rows. **Test against a realistic
   fixture — the seeded library, a stored workout, a populated form.**
4. **Asserting a thing exists instead of that it works.**
   `expect(typeof retry).toBe("function")` passes whether or not retry
   retries. **Invoke it and assert the consequence.** See docs/TESTING.md §3.
5. **Deleting a component and leaving its CSS.** Happened three times
   (`.col-*`, `.set-toggle`, `.field-dur`/`.field-spm`). **After deleting a
   component, grep its class names across `src/` and `e2e/` and remove the
   dead rules.**
6. **Judging contrast by eye.** A token shipped at 3.29:1 against a 4.5:1
   requirement and was only caught by a later automated scan. **Compute the
   ratio; put the number in your report.**
7. **Screenshots that capture empty states.** Committed screenshots are the
   PR's visual record and have twice shown fallback dashes or scrolled past
   the feature. **Seed real data, then open the image and look at it.**
8. **Hand-rolling the same ARIA pattern again.** There are already three
   roving-tabindex radiogroups; each shipped untested and needed a follow-up.
   **Reuse `PaceRefInput`/`ClassificationCard`'s pattern and copy its keyboard
   tests.**
9. **Letting `docs/design/DEVIATIONS.md` drift.** It documents _current state_,
   not history. Rows have described deleted code and contradicted each other.
   **When you change or remove something it describes, reconcile the row.**
10. **Assuming the plan is right.** Plans in this repo have contained factual
    errors — a route-ordering claim that the router made moot, a
    `DROP COLUMN` sequencing that would have broken rollback, a task split that
    was impossible because a type change forces compilation coupling. **If the
    brief contradicts what you observe, say so in your report instead of
    working around it silently.**
11. **Verifying the app only against itself.** Every gate this repo has —
    fixtures, captures, unit tests, design sweeps, even the hardware walks —
    checks the app for INTERNAL consistency. A nine-task wave, three
    adversarial reviews, a test-integrity sweep and a five-item erg walk all
    passed while the app reported 16938 m against the PM5's own 4384 m
    (2026-08-13, "Sun fret"). James found it in one session by
    photographing the monitor and the phone in the SAME FRAME. **When the
    machine reports a number we also compute, compare them** — on hardware
    with both screens in one shot, or in a test by replaying a capture from
    `docs/monitor/sessions/` and checking the derived total against the
    intervals' own `boundary` actuals. An agreement with our own fixtures
    proves nothing about the erg.

## Commands

- iOS: `pnpm ios:build` (tag-derived version; needs `GOOGLE_IOS_CLIENT_ID` env), `pnpm ios:open` (Xcode).
