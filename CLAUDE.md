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
  branch still exists. **Teardown also downs the worktree's compose stack**
  (`docker compose -p <its ergomatic-NNNNN name> down -v`, or run the gate
  once with `E2E_KEEP=0`) — per-worktree stacks outlive their worktrees
  otherwise; `app/scripts/stack-reap.sh` reaps forgotten ones at the next
  e2e/screenshots boot, but four orphaned stacks (twelve containers) had
  accumulated before it existed, so don't rely on the net alone.
- **Fast path (James-approved, 2026-08-01; tightened 2026-08-14):** a
  change may skip the subagent implement/review cycle when ALL FIVE hold.
  Check them mechanically, against `git diff --stat`, not by feel.
  (1) ZERO files under `app/domain/` or `app/server/` — not "only comments
  there", zero. (2) No stored-data shape: no persisted type, no `pgEnum`,
  no localStorage shape, no migration. (3) No auth. (4) Roughly one file
  of product code; tests, CSS, docs and captures do not count against it.
  (5) The failure mode if wrong is cosmetic or test-only — words, pixels,
  or a red suite. **If a wrong version would produce a wrong NUMBER, a
  lost record, or a wrong device interaction, it is not fast path. If any
  check is uncertain, it is not fast path.** The rule exists to save a
  cycle on trivia, not to be argued into.
  Fast-path changes still get a worktree, failing-test-first,
  self-mutation, the scoped gates, and a PR — Claude implements inline and
  **James is the reviewer**, with the PR carrying screenshots and a
  one-paragraph risk note ("what I'd have asked a reviewer to probe").
  **Escalate mid-change, do not finish and disclose:** the moment a
  fast-path change reaches into `domain/`, a stored shape, or a second
  product file, stop and take the full cycle. _This has been violated:_
  on 2026-08-13 five commits landed inline as fast path — 42 files, +764
  lines, including a rename through `app/domain/judge.ts` — and two
  independent adversarial reviews named that tail as the only place an
  unknown defect could still hide. A fast-path change that ships a bug
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
  - **Both agents are PHASE-GROUPED with a triad override (James,
    2026-08-16 — replaces the per-spec/per-brief triggers; motivation:
    CR2 ran ~9 antagonist dispatches where ~4-5 carried all the catches,
    and every kill-shot in either ledger lived in four classes: invented
    mechanisms, wire semantics, oracle soundness, number changes).**
  - **THE TRIAD always forces the full treatment, phase position
    irrelevant** — the same line the fast path draws: a change to what a
    NUMBER means, a STORED SHAPE, or AUTH gets the complete antagonist
    pass on its spec AND a PM final-PR gate on its PR. One definition of
    "dangerous" across the whole SDLC.
  - **`antagonist`, phase-shaped:** (1) **Phase open — the anchor pass:**
    attack the phase's decomposition plus its riskiest spec, fully; the
    report's attacked-and-held claims become the phase's VETTED GROUND,
    recorded in the ledger entry. (2) **Mid-phase specs — delta or skip,
    said aloud:** a later spec gets a DELTA pass (attack only what is new
    against the vetted ground) when it invents a new mechanism or touches
    wire semantics on ground the anchor did not cover; genuinely novel
    ground gets a full pass; everything else SKIPS with a stated reason
    ("inherits phase ground; no new invariant class") — the skip is
    spoken, never silent. (3) **Phase close — the exit pass:** before the
    phase walk, attack the exit-criteria evidence and the walk protocol
    (oracle-blindness like "the keystone row cannot exercise the new
    code" lives here). (4) **Premise passes FOLD into the spec pass**
    when the plan is written in the same cycle — one dispatch attacks the
    spec's premises and the plan's fresh factual claims together; a
    standalone premise pass only for a plan written long after its spec
    or by a different session, and one pass covers a wave of
    near-identical briefs.
  - **`product-manager`, phase-shaped:** at phase OPEN (the spec slate —
    scope, shape, build-now) and phase CLOSE (exit criteria against what
    happened, tester impact, the release call), plus the triad's per-PR
    final gates. Pure-UI, infra, and docs PRs no longer get per-PR PM
    verdicts. Present PM verdicts with the artifact they judge; never
    merge on green CI alone where a PM gate applies.
  - **They PROPOSE ledger entries; the controller lands them.** Neither
    agent writes to the repo, including its own ledger — they are usually
    dispatched against the main checkout, and main is PR-only. The
    definitions originally said "append", three engagements did exactly
    that, and 94 good lines sat uncommitted in the main checkout until
    someone noticed. The entry comes back in the report as ready-to-paste
    markdown and rides whatever PR is already open.
  - **NEITHER AGENT RUNS ON FAST-PATH WORK (James, 2026-08-14).** The
    fast path has no spec and no task brief, so the antagonist has
    nothing to attack, and by its own criteria a fast-path change cannot
    alter what the product does — so there is nothing for a PM to judge.
    **The PM gate is about FUNCTION, not diff size:** it runs when a
    change alters what the app DOES, what a tester RECEIVES as a
    capability, or the shape and sequence of planned work. It does NOT
    run for copy, styling, comments, tests, docs, captures, or a refactor
    with no behaviour change — however many files those touch. A
    thousand-line docs PR needs no PM; a one-line change to what a number
    means does.
- **GROUP THE WORK, AND SPEND LESS DOING IT (James, 2026-08-20: "i want
  to avoid small pr's and prefer to group things", "and preserve
  credits").** Both halves are standing rules, and they bind the
  controller more than the implementers.
  - **Default to ONE PR per coherent chunk of work, not one per task.**
    Phase LL spec 1 produced three PRs in a day for one spec, and that is
    the shape to avoid. Small queued items ride the next PR that touches
    their area rather than becoming their own branch: a stale comment, a
    fixture fix, a docs correction, a follow-up sized in single files.
    **The exception is narrow and stays:** work carrying TRIAD weight (a
    number's meaning, a stored shape, auth) still lands alone when
    bundling it would make its own gate harder to run — the accumulator
    in #140 was right to ship by itself. "Would a reviewer have to hold
    two unrelated risk models at once?" is the test, not diff size.
  - **Spend proportionally.** Match the ceremony to the risk, and say
    which gates you are SKIPPING and why rather than running them by
    reflex. A non-triad UI task needs no PM gate and no antagonist pass —
    the spec pass already covered it. Prefer one review over a review
    plus three scoped re-reviews when the findings are documentation-
    level. Use the cheapest model that can do the job, and remember that
    a plan carrying complete code makes its implementer a transcriber.
  - **The two pull against each other and the tie-break is stated:** a
    bigger PR is cheaper to run gates on but harder to review. When
    grouping would force a reviewer to reason about a stored-shape change
    and an unrelated redesign in one pass, split. Otherwise group.
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
- **CI skips the code jobs on documentation-only pushes.** `scripts/ci-changes.sh`
  (tested by `scripts/ci-changes.test.sh`, run in CI's `scripts` job) decides:
  if every changed path is under `docs/`, `.claude/`, or root markdown, then
  `app`, `docker` and `e2e` skip — otherwise they run, and every uncertainty
  (bad sha, empty diff, unrecognised path, the script itself failing) resolves
  to running them. **If you put anything CI must exercise under those paths,
  change the allowlist in the same commit** — and note that release notes live
  in `app/src/`, so a notes PR still runs the full gate.
- pnpm only. ESM only. Server imports use `.js` extensions.
- **Write for James first, the record second (James, 2026-08-16).** Binding
  for every PR body, design presentation, discussion, and SUMMARY — and
  "summary" means ALL of them: in-line status while working on things,
  outcome summaries when a task or phase finishes, spec summaries when a
  design is presented, verdict presentations, session wrap-ups:
  - Line one: **"This PR [outcome]"** — the result, not the mechanism.
  - Then bullets, not paragraphs. ~6 max, one line each: what changed, why,
    tester impact, how to try it.
  - Codenames and file paths are fine as references. The failure mode is
    WHAT-without-WHY prose: naming mechanisms ("four honest axes, derived
    never guarded, exhaustive table over nine members") without saying
    what problem they solve or what a human now sees differently. Every
    bullet above the fold answers "so what?" — James is technical; he is
    not the spec's co-author.
  - Everything else — evidence, probe outputs, cross-refs, risk notes,
    agent context — goes in a collapsed `<details>` block titled
    **"Record (for agents and audits)"**. Depth lives there, not up top.
  - The test: the top reads aloud in 30 seconds. The `product-manager`
    final-PR gate checks this and fails the PR presentation on it.
  - Specs open with a plain-language "What and why" paragraph before any
    machinery, and a SUMMARY of a spec is that paragraph plus bullets —
    never a tour of its sections.
  - Summaries follow the same shape wherever they occur, including
    mid-task: outcome line, then bullets, plain words. A status update or
    verdict that needs decoding wastes the turn it reports on.
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
   the feature. **Seed real data, then open the image and look at it — and when the
   screen derives a number from other numbers in the same frame, recompute
   the headline from the rows by eye** (PR #117's flagship capture showed a
   hero contradicting its only row by 37s/500m through seven reviews; the
   PM caught it with ten seconds of arithmetic).
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
    `docs/monitor/sessions/` and checking the derived total against each
    interval's own final pre-reset reading (the captures contain no
    `boundary` events, and the boundary-actual sum is an unsound oracle —
    architecture review §F2). An agreement with our own fixtures proves
    nothing about the erg.
12. **Settling a claim about build output by reading code instead of
    building it.** Twice now: `dist-grep.sh`'s own header records an
    identifier needle coming back clean against a build that genuinely
    contained `fake.ts` (minification renamed it), and PR #100's planned
    download path — a dynamic `import()` behind a runtime check — read
    correctly and still emitted the whole module graph as its own chunk,
    because Rollup only folds an `import()` behind a BUILD-TIME constant.
    Both were caught by producing the artifact, never by review. **Any
    claim of the form "X is not in the production bundle" is settled by
    `pnpm build` plus a string-literal grep over `dist/`, in both
    directions — prove the probe can go red before trusting its green.**
13. **Handing James an operator instruction nobody checked against the
    code.** Item 10 covers plans that contain factual errors; this is its
    operator-facing sibling, and it burns HIS time rather than an agent's.
    Phase CS's spec said `VITE_ENABLE_FAKE_MONITOR=1 pnpm ios:build` puts
    a fake PM5 on the phone so a walk needs no erg; the plan and two walk
    cards inherited it verbatim, and it is impossible —
    `adapters/monitorTransport.ts` takes the Capacitor BLE arm whenever
    `isNative()`, and ONLY the web arm reaches the fake seam. He built,
    tapped Connect, and found nothing. The same day, the canned keystone
    block in `/hardware-walk` failed to import at all (`r0` is not a rest
    the grammar accepts) — also never once pasted before being shipped as
    an instruction. **Before an instruction reaches him, run it or read
    the code that serves it: paste the block, follow the flag to the
    branch that consumes it. An instruction is a claim about the system,
    and it gets the same evidence bar as any other.** Corollary, from the
    fix that followed: **a diagnostic hidden behind a build flag is
    disarmed by anyone who edits the build command for unrelated
    reasons** — correcting that same walk card silently removed the
    `pointercancel` readout, so the one case that needed instrumenting was
    walked without it. If a flag carries a diagnostic, say so where the
    flag is written down.
14. **Treating a PR body as a record.** Five times in six PM gates, a real
    finding lived only in a PR's Record block — an owed follow-up, an
    unexplained capture diff, a product gap — and had to be rescued into
    ROADMAP or a ledger at the gate, or was lost. **A PR body is a
    presentation; anything with a life after merge goes in ROADMAP, a
    ledger, DEVIATIONS, or a RUNSHEET at the moment it is found.**
15. **Writing release notes from your own branch instead of the tag's
    range.** v0.13.0 was one command from being cut with notes covering
    only the phase this session ran; session deletion had merged from a
    parallel session in between, and testers would have found a delete
    button no note mentioned. It was caught by reading the commit log by
    hand, which is luck, not a gate. **Before cutting a tag, list every
    merge since the previous one (`git log <prev-tag>..main --oneline
    --merges`) and account for each: a note, or a stated reason it needs
    none.** Parallel sessions make this the normal case, not the rare one.

16. **Stating an unsourced premise as fact.** In one day the controller
    told James "the PM5 is single-central" and "App Review scrutinises a
    `bluetooth-central` declaration" — both load-bearing, both used to
    reason about real decisions, both false or unsourceable, and both
    caught by a research pass rather than by the person saying them. The
    icon's "ERGOMATIO" claim is the same shape and survived three hops
    over weeks because nobody opened the PNG. **A premise you cannot cite
    is a premise you are inventing: tag it PRIMARY / SECONDARY /
    INFERENCE, or do not say it.** The tell is a sentence that sounds
    like it came from a document. Corollary from PR #141's gate:
    **a dangling citation is worse than no citation, because it reads as
    evidence** — 23 citations across 11 tracked files point into
    `.superpowers/`, which is git-excluded and unreachable to anyone but
    the session that wrote it.

17. **Opening a phase without writing it into the ROADMAP.** Four phases
    running (PW, CS close, CM, LT), the phase's own gate ran
    `grep "<phase>" ROADMAP.md` and got zero — the roadmap learned about
    the phase only when a gate demanded it. **The brainstorm that names a
    phase adds its ROADMAP section in the same commit as its spec.**


## Commands

- iOS: `pnpm ios:release` (full CLI TestFlight release from the current tag;
  derives `GOOGLE_IOS_CLIENT_ID` from Info.plist — docs/RELEASING.md),
  `pnpm ios:build` (bundle+sync only; needs `GOOGLE_IOS_CLIENT_ID` env),
  `pnpm ios:open` (Xcode, GUI fallback).
