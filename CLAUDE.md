# Ergomatic

Mobile-first rowing (erg) workout tracker/planner around The Erg Book model.
Roadmap: `ROADMAP.md` — **rebalanced 2026-08-28 and now forward-looking only**:
the live slate (six waves, ranked against the north star "a stranger can use
this"), an open-item register for work with no wave, a deferred section, and a
one-line ledger row per completed phase. **Finished phases live in
`docs/history/` and are a RECORD — never cite one for a live question.** Design
reference: `docs/design/` (high-fidelity; 44px hit targets and WCAG AA are hard
requirements).

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
- Single Vitest project: `pnpm test --project unit|client|integration`.
  `integration` needs Docker. **Two footguns:**
  `pnpm test --project client -- <pattern>` **silently runs the full suite**
  (pnpm swallows the scoped flag), and the obvious workaround
  `pnpm exec vitest run --project client <file>` runs client files OUTSIDE
  jsdom — 89 false failures against a green HEAD.
- `pnpm dist:grep` — the production-bundle gate. CI runs it in the `app` job
  right after `pnpm build`; it proves named dev-only seams are absent from
  `dist/`.
- `pnpm e2e` — Playwright flows + structural design assertions against the real
  compose stack. `pnpm screenshots` — captures `docs/screenshots/*.png` the
  same way. **Both `up -d --build --wait` unconditionally** (a rebuild every
  invocation, not "boots it if not running") **and leave the stack UP
  afterwards** — `E2E_KEEP` defaults to `1`.
- `pnpm mutate` — Stryker mutation testing, on-demand (see docs/TESTING.md §3);
  minutes, not part of the push/CI gate.
- Local dev DB: `docker run --rm -d --name erg-dev-pg -p 5433:5432 -e POSTGRES_PASSWORD=dev postgres:18.4`
  then `DATABASE_URL=postgres://postgres:dev@localhost:5433/postgres pnpm dev:server`.
  The server refuses to start without `DATABASE_URL` (no dotenv — real env only).
- Local OAuth: `DATABASE_URL=... GOOGLE_CLIENT_ID=... GOOGLE_CLIENT_SECRET=... ALLOWED_EMAILS=you@gmail.com pnpm dev:server`.
  **`SITE_URL` is NOT needed locally** — `server/index.ts:60` already defaults it
  to `http://localhost:5173`, which is the exact redirect URI `docs/deploy.md`
  tells you to register. This bullet used to say that omitting it makes Google
  error `redirect_uri_mismatch`; that failure cannot occur, and setting the
  variable locally is a no-op. Set it only when you genuinely need a different
  origin.

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
  with `docker compose -p <its ergomatic-NNNNN name> down -v`. **`E2E_KEEP=0`
  is NOT an equivalent** — `e2e.sh:31` and `screenshots.sh:31` both run
  `docker compose ... down` with no `-v`, so the per-worktree `pgdata` volume
  survives; only the explicit form reclaims it — per-worktree stacks outlive
  their worktrees
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
- **A SPEC THAT CHANGES WHAT A ROWER READS OR SEES CARRIES A DESIGN GATE
  (James, 2026-08-27: "Make sure to gate on designs too" — asked twice,
  so it is standing).** Any spec whose scope includes user-visible COPY
  or LAYOUT gets a Gate 0: James approves the RENDERED thing before any
  implementation task starts. Not a description of the copy, not a
  sentence in the spec — the actual screen, at real proportions, in both
  orientations, against what it replaces, with every colour pairing's
  contrast ratio computed and stated as a number.
  **Why it is a hard gate and not a courtesy:** RC-24's shape was
  approved on a DESCRIPTION and turned out to be `display: none` in
  portrait — the exact surface whose complaint produced it. Its landscape
  half was then rejected on sight of the first real capture, because
  showing `REST 0:59` beside a REST column reading `3:00` says REST twice
  with two numbers. Neither was findable in prose.
  **A number change is a design question too**, not only a data one: if a
  saved row renders a different figure after a change, the gate shows the
  before and after side by side, because it has to read as an improvement
  rather than as a row that quietly moved.
  Present it as a rendered artifact, then STOP. The gate is the approval,
  not the presentation.
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
    **A citation that justifies a STORED SHAPE quotes the load-bearing
    line verbatim and names the attribute the argument needs** (required
    or optional, current or superseded, what the field means) — see
    recurring failure 16's second corollary, which this rule exists to
    feed. A tag says where a claim came from; it does not say that the
    source supports the conclusion drawn from it.
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
    **AND ASK WHAT QUANTITY THE ORACLE MEASURES, not just whether it
    agrees (2026-08-21).** This rule as written above would have passed
    the defect that produced it. We DID compare against the machine —
    `recordTwdVerdict` checked our accumulator against the PM5's Total
    Work Distance, and PR #123 celebrated a sub-metre three-way
    agreement. It proved nothing: TWD is work PLUS rest-coast metres
    (decoded to the metre, 1535+64=1599 and 1300+47=1347) and so is our
    sum, while Concept2's logbook — the actual authority for what the row
    was — stores work only. Both screens in one photograph would have
    shown two numbers agreeing about a quantity the authority does not
    store. **An oracle that shares your definition is a mirror.** Before
    trusting any external number, state what it measures and confirm it
    is the same thing you are trying to be right about. **VINDICATED
    (RC-9c, 2026-08-25): `recordTwdVerdict` is now RETIRED, for exactly
    this entry's own reason — lifting its distance-interval suppression
    (the fix a naive reading of "compare against the machine" would
    reach for) makes it PASS everywhere, 0.2-1.5 m deltas across five
    captures, all mirrors, never a real check. This entry warned about
    the shape a phase before the code caught it; RC-9 replaced the
    mirror with two genuinely independent oracles instead (0x0032's own
    average pace, 0x003A's own rest distance — design spec
    `2026-08-25-free-oracles`) rather than trying to fix the mirror in
    place.**
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
    merge since the previous one and account for each: a note, or a
    stated reason it needs none.** Parallel sessions make this the normal
    case, not the rare one. **Use `git log <prev-tag>..main --oneline`
    WITHOUT `--merges`** — this rule shipped prescribing `--merges`, and
    on this repo that returns EMPTY, because main is squash-merged and has
    no merge commits. The one gate that exists to stop notes being written
    from a branch instead of a range was unrunnable as written for four
    tags (found at PR #144's PM re-gate, 2026-08-20). A gate nobody can
    run is not a gate.

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
    **Second corollary, added 2026-08-26 after the same class recurred
    twice in one spec: A SOURCED premise fails differently, and this rule
    did not cover it.** Phase JR's spec justified a STORED SHAPE from a
    citation twice, and both times the citation was real:
    (1) _"0x0039 has appeared in zero of our five captures"_ was true when
    written and false when used — the 2026-08-23 keystone walk had
    captured the frame two days earlier, and the cited document was the
    stale half of a contradiction resolved in the same directory;
    (2) _"Concept2's API carries `JustRow` first-class"_ was correct about
    the enum and silent on the attribute the whole argument rested on —
    that field is documented `Required: No`. Neither was unsourced; both
    were UNDER-READ. Both were caught by an adversarial pass rather than
    by the person citing, at a cost of a spec revision each.
    **A citation is only as load-bearing as the line you actually
    quoted.** When an argument depends on an attribute of a source —
    required vs optional, current vs superseded, what a field MEANS —
    quote that line verbatim beside the claim and name the attribute the
    argument needs. A URL is not evidence; a sentence is. Both failures
    die to this on sight: quoting the API's field row shows
    `Required: No`, and quoting a capture claim means opening the capture
    directory, where the newer walk is sitting.
    **Two checks, promoted here from the antagonist's ledger because a
    ledger only one agent reads cannot prevent anything:** for any
    "we have never observed X" claim, list the capture directory BY DATE
    and read the newest walk's README first — corpus facts in this repo
    have expiry dates, and the document stating one is usually older than
    the walk that killed it. And when a spec tags a vendor document
    PRIMARY, grep the repo for our own transcription of it AND for any
    code comment recording a hardware DEPARTURE from it; a document this
    project has already caught being wrong does not get a fresh PRIMARY
    tag on the neighbouring claim.

17. **Opening a phase without writing it into the ROADMAP.** Four phases
    running (PW, CS close, CM, LT), the phase's own gate ran
    `grep "<phase>" ROADMAP.md` and got zero — the roadmap learned about
    the phase only when a gate demanded it. **The brainstorm that names a
    phase adds its ROADMAP section in the same commit as its spec.**
18. **Opening a phase without READING the ROADMAP — and re-researching what
    this repo already settled.** The sibling of #17, and it cost a whole
    spec. Phase LM was opened on 2026-08-25 to fix a tester's lost workout;
    its spec diagnosed the wrong bug, proposed a fix that could not work,
    and scoped a PR 2 that contradicted a standing James ruling. All four
    corrections were already in the repo: `ROADMAP.md:3271` carried the
    real mechanism from James's own tester report the day before
    ("still in the pre-row state with no record"); `ROADMAP.md:2095-2130`
    carried his 2026-08-20 ruling ("CORRECT RESUME, not a background
    mode"); `docs/superpowers/research/2026-08-20-ble-connection-management.md`
    had already done the research, at the right LAYER; and the code
    described its own failure in a comment
    (`useMonitorSession.ts:988-990`). Only the antagonist caught it.
    **Before researching anything the OS, browser or device owns, run
    `ls docs/superpowers/research/` and `grep` the ROADMAP for the
    symptom.** This project researches things once and then re-researches
    them from scratch, and the second pass is always the shallower one.
    **And name the LAYER**: Apple's Core Bluetooth background docs are
    accurate and govern the NATIVE app, while our logging runs in a
    WebView that WebKit throttles on rules that never read a plist key. A
    correct citation answering the wrong layer reads exactly like
    evidence.
19. **Trusting a verification stack that stops at the wire.** Our
    instruments all sit at or below the transport seam, so a defect whose
    trigger enters ABOVE it — platform lifecycle, permissions,
    backgrounding, OS interruptions — is invisible to every gate we own.
    On 2026-08-26 a red `LOST THE MONITOR` banner fired nine times in
    288 s over a link that never dropped, and four instruments were blind
    at once: `RecordedEvent` had no lifecycle member, so no recording
    could carry it; the unit tests `vi.doMock` `adapters/appLifecycle`,
    replacing the seam that was wrong; `src/native/**` is `v8 ignore`d,
    and that was the arm with the bug; e2e runs on web, where the
    lifecycle arm is a deliberate no-op. It shipped through a full review
    and was caught by James at an erg
    (`docs/monitor/sessions/walk-2026-08-26/`). **For any new
    platform-sourced input, ask which instrument would catch it if it
    were wrong — and if the answer is none, build the instrument in the
    same change.** The recording format now carries `lifecycle` events
    and `transports/replay.ts` emits them for exactly this reason; a
    recording that carries one and finds no handler wired reports a
    divergence rather than skipping it silently.
20. **Writing to the main checkout with a relative shell path.** The SDLC
    rule requires `git rev-parse --show-toplevel` before every COMMIT, and
    that guard works. It does not cover WRITES: the shell's cwd resets
    between tool calls, so a `cat >>` or `>` redirect after a reset edits
    the main checkout instead of the worktree. Happened again on
    2026-08-25 (PR #197), the fifth stray main-checkout write, caught only
    at `git add`. **Every shell write uses an ABSOLUTE worktree path, or a
    `cd` in the SAME command.** Edit/Write tools take absolute paths and
    are safe; shell redirects are not.
21. **Shipping a gate that cannot go red.** A green check you never proved
    can fail is not evidence; it is decoration that reads as evidence, and
    it is worse than no gate because it retires the suspicion that would
    have found the bug. **RC-24 shipped TWO in a single task** (2026-08-26,
    PR #204): a `min-width: max-content` clip fix placed on a plain child
    of the flex item — where `min-width` cannot influence flex shrink at
    all, since that algorithm reads the ITEM's own value and never a
    descendant's, so the fix did nothing — and, in the same commit, the
    e2e no-clip test that measured **that same inline element**, whose
    `scrollWidth`/`clientWidth` are both always `0`. The gate was green
    regardless of overflow and would have passed a fully clipped cell.
    Both survived a full review AND a scoped re-review; the implementer
    found them itself while rewriting the rule for an unrelated reason.
    **Every new assertion gets a mutation that makes it fail, and the
    report states what was mutated and what the failure said.** This is
    already the rule for "this test can't fail" claims (see the
    mutation-probe memory and the antagonist's ledger); it is promoted
    here because a rule only one agent reads cannot prevent anything.
    **Two smells that predict it:** an assertion measuring a DIFFERENT
    element than the one the fix changed, and any measurement of an inline
    element's box (`scrollWidth`, `clientWidth`, `offsetWidth` are `0`
    there — blockify it or measure its flex-item parent).
    **Corollary on LAYERS, inside our own code.** Item 18 names the layer
    trap for external docs; the same PR proved it applies internally. The
    clip fix was justified by citing `domain/validate.ts`'s `0:01..60:00`
    rest bound as making `REST 59:59` reachable. The citation was real and
    answered the wrong layer: that is the BUILDER's authoring bound, while
    every connected program also passes `compileProgram`, which rejects a
    folded rest over `MAX_REST_SECONDS = 595` (9:55). The true worst case
    was four characters narrower, and knowing it deleted the fix outright.
    **When a bound justifies a decision, name the layer that enforces it
    and check whether a NARROWER one sits downstream.**

22. **`git checkout -- <file>` to revert a mutation probe, on a file that
    also holds uncommitted work.** Queued as a lesson by James on
    2026-08-24 and never landed; it then happened again on 2026-08-28,
    during the very PR that was landing it. Reverting a one-line mutation
    with `git checkout -- app/src/monitor/driver.ts` also destroyed an
    unrelated, uncommitted comment fix in the same file — silently, because
    checkout does not warn and the suite went green either way (the fix was
    a comment). Caught by `git status`, which is luck rather than a gate.
    **Before reverting anything with `git checkout`, run `git status` and
    check whether the file you are about to restore carries work you have
    not committed.** The cheap habit that removes the class entirely:
    **commit the real change BEFORE running any mutation probe**, so every
    probe's revert is a no-op against a clean file, and the probe can never
    take anything with it. `git stash` is not the alternative here — the
    stash stack is shared with other sessions (agent briefing).

23. **Adding an affordance to a surface that already offers the same
    thing, and killing the better offer with it.** Queued as a lesson by
    James on 2026-08-24 alongside item 22; the case is PR #189's baseline
    round, and `you/BaselineEditor.tsx`'s `seedFor` comment
    (lines 165-186) is the full account. The round added `[−][+]` steppers
    to the 2K/6K fields. Those fields ALREADY carried a derivation offer
    beneath them, and the two suggestion mechanisms disagreed: the
    placeholder showed the generic table seed (2:25.0) while the button
    offered a derivation from the rower's OWN rowed 6k (2:23.0). The new
    stepper materialised the generic seed, which made
    `draftValue !== offer.value` — the predicate `DeriveSlot` renders on —
    so **the better estimate vanished in ONE TAP**, and Apply then stored
    the generic seed as `manual`. The fix was to make the offer's value BE
    that side's seed, so all three paths name one number.
    **No test caught it, and the reason generalises:** every existing test
    reached that field through the offer button or by typing, because
    those were the only ways in when they were written. A new entry path
    is a new way to reach every state the old paths reached, and the
    suite's coverage of that surface is silently scoped to the old ones.
    **Before adding an affordance, enumerate everything else on that
    surface that already offers, suggests, or writes the same value, and
    write a test driving the NEW affordance against each.** The smell is
    two mechanisms proposing one field's value; the failure is the
    better-informed one losing silently, which no assertion about the new
    control will ever notice.

24. **Every test seeding PAST the producer, so no gate can go red on the one
    defect that matters.** Item 21 covers a gate that can never fail at all.
    This is its sibling and it is harder to see: each gate CAN fail, they are
    all green, and none of them can fail on this bug — because every one of
    them enters the pipe downstream of the break. **Measured cost: a headline
    feature that shipped having never once worked.**
    `MACHINE CONFIRMED · WORK ONLY` and the PM5 verification code reached
    **zero of sixteen** production rows (counted on the prod DB, 2026-08-28)
    while three gates stayed green — `FromTheLog.test.tsx` mocks the API row
    with `machineWorkSeconds: 124`, `LogSession.test.tsx` seeds a `MonitorRun`
    already carrying `summaryTotals` before it renders, and
    `screenshots.spec.ts` seeds the API row and says so in its own comment.
    Two replay suites DO drive the real driver, hook and localStorage over
    real walk bytes, and both stop at `loadMonitorRun()`. **Nothing mounted
    the reader before the producer wrote.** The break was one line: a
    mount-time `useState` snapshot that never re-read.
    **The check is not "are the gates green" — it is "which test STARTS
    upstream of the producer?"** For any A-writes-then-B-reads seam, one test
    must begin before A and assert after B. Both halves being well tested is
    exactly the condition that hides a broken seam.
    **Two tells, both present here and both missed:** a test whose own name
    explains the production symptom away as legacy (this suite had one titled
    "renders NO block when all three machine fields are null — **the common
    case, old rows**"), and a phase criterion verified at the wrong LAYER —
    a walk table's column read "App stored (WIRE→record)" while the cell
    under it cited a driver ring entry, on a build shipped the day BEFORE the
    storage code existed. **A criterion cannot be verified on a build where
    its code does not exist**, and "verified on hardware" means nothing until
    the layer is named.

25. **A lower layer reports a durability failure and its caller proceeds as
    if persistence succeeded.** The 2026-08-28 codebase-integrity audit's
    headline systemic pattern
    (`docs/superpowers/audits/2026-08-28-codebase-integrity/final-report.md`),
    and it had already
    shipped three times before the audit named it: `Countdown.tsx:220` calls
    `saveRun(run)` — a function that RETURNS a boolean for exactly this —
    ignores it, and navigates to Timer, which silently bounces to Today when
    the run never persisted (AUD-015); `saveMonitorRun` swallows its failed
    write and returns `void` while the Log door fresh-loads the record that
    never became durable, so completed PM5 work renders `NO MONITOR READING`
    (AUD-016); and recurring failure 24's machine-summary defect is the same
    shape with a reader instead of a writer. **The tell is a documented
    rationale of the form "the caller has no different action to take on a
    failed write"** — `monitorRun.ts` says those words verbatim, and AUD-016
    is the different action it did not imagine (hold the hand-off). At any
    seam where A persists and B proceeds or reads, the spec names ONE owner
    of the end-to-end invariant: either the caller branches on the failure
    it can now see, or a comment states why the outcomes are genuinely
    indistinguishable — a claim that gets the same evidence bar as any
    other, because every instance above falsified one.

## Commands

- iOS: `pnpm ios:release` (full CLI TestFlight release from the current tag;
  derives `GOOGLE_IOS_CLIENT_ID` from Info.plist — docs/RELEASING.md),
  `pnpm ios:build` (bundle+sync only). **`GOOGLE_IOS_CLIENT_ID` does not fail
  loudly if unset** — `package.json:26` defaults it to empty, so the build
  SUCCEEDS and produces a bundle whose native Google sign-in is silently dead
  (`src/native/signin.ts:8` receives `""`). Export it, or use `ios:release`,
  which derives it from Info.plist,
  `pnpm ios:open` (Xcode, GUI fallback).
