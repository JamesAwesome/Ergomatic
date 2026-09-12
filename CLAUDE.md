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
- `.agents/skills/` holds two populations and both are COMMITTED: our own Codex
  adapters (`harden`, `close-phase`, `hardware-walk`, `wod-import` — ten-line
  POINTERS at `.claude/skills/`, never copies; Codex follows a pointer, James
  confirmed 2026-09-12, and `AGENTS.md` forbids copying or translating that
  guidance), and third-party skills VENDORED from
  `mattpocock/skills` via the vercel-labs `skills` CLI (James, 2026-09-12).
  `skills-lock.json` at the root is that CLI's manifest and is committed as a
  SOURCE-OF-RECORD ONLY — it is not a lock in pnpm's sense and not a drift
  detector, measured on 2026-09-12: it pins no commit (`experimental_install`
  fetches upstream HEAD), and its `computedHash` reproduces from the vendored
  bytes under neither of the CLI's two local hash functions — it is most
  likely the CLI's server-side blob hash. **The bytes in git are the
  reviewed instructions agents follow; `git diff` is the drift detector.**
  Update by re-running the CLI and reviewing the diff like any dependency
  bump. **Claude Code loads `.claude/skills/` and Codex loads
  `.agents/skills/`; neither harness sees the other's directory, and a skill
  present in only one is invisible to half the agents here with no error
  anywhere.** So the two roots are kept at PARITY, gated by
  `scripts/skills-parity.sh` in CI's always-run `scripts` job: every name
  exists in both with identical `name` / `description` /
  `disable-model-invocation`. The vendored eight are canonical in `.agents/`
  and reach Claude Code through SYMLINKS at `.claude/skills/<name>`; the four
  owned skills are canonical in `.claude/` and reach Codex through the
  ten-line adapters. Pointers in both directions, copies in neither. **If the
  `skills` CLI vendors a ninth skill, add its symlink in the same commit** —
  the gate goes red otherwise, which is the whole point of it.
  **`domain-modeling` is pinned `user-invocable-only` in `.claude/settings.json`**
  (the vendor's own mechanism for a skill whose `SKILL.md` you do not want to
  edit, which keeps the vendored bytes unforked). Its trigger is "discussing
  codebase terminology" — most of a session here — and on firing it CREATES
  `CONTEXT.md` and `docs/adr/`, neither of which exists: a fourth
  decision-record system, unprompted repo writes, no `dies` date, no gate.
  James still has `/domain-modeling`. Verified 2026-09-12: the listing drops
  37 → 36 and the slash command still loads the whole skill.

## Commands (run in `app/`)

- `pnpm dev` / `pnpm dev:server` — Vite client :5173 (proxies /api) / API :8080
- `pnpm lint` · `pnpm format` / `pnpm format:check` · `pnpm typecheck` · `pnpm test` ·
  `pnpm test:coverage` (90% gate) · `pnpm build`
- Single Vitest project: `pnpm test --project unit|client|integration`.
  `integration` needs Docker. **Two footguns:**
  `pnpm test --project client -- <pattern>` **silently runs the full suite**
  (pnpm swallows the scoped flag), and the obvious workaround
  `pnpm exec vitest run --project client <file>` drops the
  `NODE_OPTIONS=--no-experimental-webstorage` that `package.json`'s `test`
  script sets — Node 26's experimental webStorage global then collides with
  jsdom's `localStorage` (measured 2026-09-02: 1582 false failures across
  client+unit against a green HEAD; not a jsdom-vs-Node issue). Prefix the
  bare form yourself:
  `NODE_OPTIONS=--no-experimental-webstorage pnpm exec vitest run --project client <file>`
  — jsdom loads and the tests pass. Note this form collapses a signal death
  to exit 1 — see recurring failure 40. Prefer `pnpm test --project client`
  when you do not need a file filter.
- `pnpm dist:grep` — the production-bundle gate. CI runs it in the `app` job
  right after `pnpm build`; it proves named dev-only seams are absent from
  `dist/`.
- `pnpm e2e` — Playwright flows + structural design assertions against the real
  compose stack. `pnpm screenshots` — captures `docs/screenshots/*.png` the
  same way. **Both `up -d --build --wait` unconditionally** (a rebuild every
  invocation, not "boots it if not running") **and leave the stack UP
  afterwards** — `E2E_KEEP` defaults to `1`.
- `ERGOMATIC_TEST_WORKERS` / `ERGOMATIC_E2E_WORKERS` — local worker
  ceilings, defaulting to 4 and 3. Tuned for a 16 GB / 4-performance-core
  Mac running several agent sessions; **raise or unset them on a bigger
  machine**. Both are inert under CI.
- `pnpm mutate` — Stryker mutation testing, on-demand (see docs/TESTING.md §3);
  minutes, not part of the push/CI gate.
- Local dev DB: `docker run --rm -d --name erg-dev-pg -p 5433:5432 -e POSTGRES_PASSWORD=dev postgres:18.4`
  then `DATABASE_URL=postgres://postgres:dev@localhost:5433/postgres pnpm dev:server`.
  The server refuses to start without `DATABASE_URL` (no dotenv — real env only).
- Local OAuth: `DATABASE_URL=... GOOGLE_CLIENT_ID=... GOOGLE_CLIENT_SECRET=... ALLOWED_EMAILS=you@gmail.com pnpm dev:server`.
  **`SITE_URL` is NOT needed locally** — `server/index.ts:60` already defaults it
  to `http://localhost:5173`, which is the exact redirect URI `docs/deploy.md`
  tells you to register. Setting it locally is a no-op. Set it only when you
  genuinely need a different origin.

## Rules

- **SDLC (binding for all agents — brief every subagent with this bullet before
  it starts work):** All implementation happens in git worktrees, never in the
  main checkout; tear the worktree down immediately after its PR merges (and
  only then). **Run `git rev-parse --show-toplevel` before every commit and
  confirm it prints your worktree path** — three agents have committed to the
  main checkout despite being told not to; the check catches it, the
  instruction alone does not. **No PR merges without James's explicit
  approval** — green CI and a clean final review are necessary but not
  sufficient; present the review verdict and stop. **Inline implementation
  is an accepted shape when the plan author paste-tests every block
  (James, 2026-09-04, Phase SF PR1 #297: "shape is fine"):** the
  controller may implement in task-sized commits with failing tests
  first and dispatch only the REVIEW half — a two-stage branch review
  plus the PM gate where the triad applies — since a fresh subagent
  transcribing already-committed code adds nothing. The review half is
  not optional, the PR body says which shape was used, and the fast-path
  rule below is unchanged. Subagents never merge,
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
  is NOT an equivalent** — `e2e.sh`'s cleanup trap and `screenshots.sh`'s
  cleanup trap both run `docker compose ... down` with no `-v`, so the
  per-worktree `pgdata` volume survives; only the explicit form reclaims it
  (`screenshots.sh`'s BOOT path has been an unconditional `down -v` since
  #395, but that runs before a capture, not at teardown) — per-worktree stacks outlive
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
  **Check 5 covers the instruction corpus too** — `CLAUDE.md`,
  `AGENTS.md`, `.claude/agent-briefing.md`, `.claude/agents/**`, and any
  `SKILL.md` this repo's agents follow. A wrong edit there is not
  cosmetic: it changes how every future agent behaves, and nothing runs
  red. Changing what an existing rule REQUIRES takes the full cycle.
  **Carve-out:** correcting a single stated fact — a stale number, a
  dangling path, a sentence the repo has already falsified elsewhere — is
  cosmetic and stays on the fast path, because a reviewer settles it by
  reading one thing. `c2182ef5` is the case this exists for: it shipped a
  175-line forked skill under a message calling it an adapter
  (`git show --stat c2182ef5`).
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
  **When the gate offers OPTIONS, every cost attached to one is a
  factual claim** and gets the same evidence bar as the design — measure
  it or mark it untested, because James decides on that list and an
  invented cost picks the design for him (recurring failure 30, which
  cost a whole implementation).
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
  - **The `harden` SKILL owns the pre-implementation loop, and caps it at
    TWO passes (2026-09-02).** Wave E PR1.75b's native plan took eleven
    antagonist passes; six found drift in bookkeeping the loop itself
    generated (a stale census table, pass-count bullets that grew from 2
    to 21 one per fold, and reports citing the plan by line number), and
    the two highest-value late finds came from lenses never in the loop —
    running the repo's own typecheck and lint over the prescribed blocks,
    and reading that code as code with hostile inputs. **The skill was
    then TESTED against that plan's own draft with the ledger withheld:
    one lens-2 dispatch returned fifteen findings, recovering in a single
    pass what the original loop needed passes 1, 2, 3, 4, 6, 7 and 11 to
    reach, plus four the eleven never found — including the `?code=`
    bug.** Passes 5-10 cost roughly a third of a session for
    record hygiene a reviewer swept in one round, while a real bug in a
    prescribed block (`?code=` empty parses to `""`, not `null`) survived
    all eleven. `/harden` runs the mechanism lens (this agent) and the
    prescribed-code lens (a cheaper dispatch), then STOPS — and stops
    earlier the first time a pass returns only bookkeeping, where
    bookkeeping means a fix changing no code block, no gate command, no
    expected value, and no walk step. The author's own paste-test is a
    PRECONDITION of the loop, not a finding inside it
    (`.claude/agent-briefing.md`, "Plan authoring").
  - **`product-manager`, phase-shaped:** at phase OPEN (the spec slate —
    scope, shape, build-now) and phase CLOSE (exit criteria against what
    happened, tester impact, the release call), plus the triad's per-PR
    final gates. Pure-UI, infra, and docs PRs no longer get per-PR PM
    verdicts. Present PM verdicts with the artifact they judge; never
    merge on green CI alone where a PM gate applies.
  - **Every installation to James's phone requires explicit permission for
    that installation (James, 2026-09-04).** Readiness for setup, permission to
    continue desk work, PM approval, or a previous install authorization does
    not authorize another install/reinstall. Prepare and verify the artifact
    first, then obtain permission before the device install command. A direct
    request such as “Install again” authorizes that one installation.
  - **Every hardware walk requires a separate PM readiness PASS (James,
    2026-09-04).** This includes mid-phase, diagnostic, resumed, phone-only,
    and zero-rowing walks. The PM judges the operator session, even when
    its code change would not need a PM review. A phase/design approval
    or James saying he is ready does not approve an unreviewed walk.
    Before asking James to reserve time or operate hardware, attach the
    PM verdict to the exact versioned runsheet. Then James chooses whether
    and when to run it; PM approval is not permission to start a session.
    The runsheet must name:
    - one primary evidence target and only the cases needed to decide it;
      each unanswered question, why desk tests/captured evidence cannot
      settle it, the exact action and independent observable, and its
      pass/fail/inconclusive outcome;
    - the prepared build, desk rehearsal of controls and capture/export,
      prefilled metadata, and the controller-owned evidence destination;
    - TOTAL operator wall-clock cap (setup, installs, waiting, captures
      recovery and wrap-up included), rowing/HR requirements, numbered
      cases, maximum attempts per case (normally one; at most one
      pre-approved retry within the same clock), and precise abort/stop
      conditions, including broken capture;
    - every operator interaction and typing/paste count. Default to taps
      and automatic log collection. Any unavoidable console setup is one
      pretested batch declared up front, not repeated commands or manual
      receipt copying during the walk.
    **Validate that each action is possible, not just that its control
    exists (James, 2026-09-04).** For every gesture, button and transition,
    record the exact platform/build, starting UI state, modal-sheet state,
    and evidence that the operator can actually perform it. Source/API
    documentation establishes a candidate, not on-device reachability.
    Reuse compatible recorded demonstrations; no hidden rehearsal walk
    may bypass this gate. Unknown action feasibility is NOT READY and
    cannot be an assumed prerequisite. A bounded feasibility experiment
    can itself be proposed to PM, explicitly labelled as the uncertainty
    being tested, never as a known-working step. Unknown test outcomes
    are legitimate; silently impossible instructions are not.
    Finish builds, code review, desk debugging and capture preparation
    before inviting James. Give complete short action blocks between
    pieces; never ask for typing mid-piece. Start and record the agreed
    wall-clock deadline when James begins setup or waiting for the walk.
    At the cap, an unplanned failure, or an exhausted retry budget, STOP,
    preserve the evidence and release James. No live repair/rebuild loop,
    surprise case, or "one more scan". Revised scope, build, steps, timing,
    retry or typing budgets require a new PM PASS and James's agreement
    before another session. The hardware-walk skill's rowing budget is
    additional to this total-time gate, not a substitute for it.
  - **They PROPOSE ledger entries; the controller lands them.** Neither
    agent writes to the repo — its own ledger, a spec, or a plan — in ANY
    checkout. The worktree is not an exception: the rule is about who owns
    the commit, not which directory it lands in. The entry comes back in
    the report as ready-to-paste markdown and rides whatever PR is already
    open. **Each agent's memory is two files** — a bounded
    `-techniques.md` it reads whole, and the `-ledger.md` dated record it
    greps; an entry is proposed to BOTH, because one that lands only in the
    record is invisible to the next agent.
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
- **EVERY ROADMAP ROW SAYS WHEN IT DIES, AND JAMES SEES THE LIST BEFORE IT IS
  FILED (James, 2026-09-10).** RF14 says everything with a life after merge
  goes in the ROADMAP; this is the other half, which was missing, and the
  register grew +6.75 rows/day for twelve straight days because of it.
  - **The stamp.** A row filed from now on ends with
    `· dies YYYY-MM-DD · <one clause: why this is a row and not a fix now>`.
    The clause is the load-bearing half — "filed" with no reason is how a row
    becomes furniture.
  - **A date is required EVEN WHEN the row names a trigger.** The trigger
    fires early when it works; the date is the backstop for when it does not,
    and Phase OD measured exactly that failure — Wave D's "hunt the e2e
    flakes" carried an ACTIVE trigger the row itself recorded as having FIRED,
    and sat 20 days. A trigger is not a schedule.
  - **Campsite rule, and nothing retroactive.** The rows already in the file
    carry no date and are not being migrated. When a PR touches a dateless
    row for any reason, it gives it one on the way past.
  - **Before filing, say what would FIX it now and why you are not.** A row
    you cannot justify against its own fix is a fix you are deferring without
    saying so.
  - **THE GATE IS THE FINAL PR OF A PIECE OF WORK, and it is a hand-back.**
    When you open the last PR of a phase, a wave, a fast-path change or a
    one-off, put TWO lists in front of James in ONE message and STOP:
    - **Proposed to add** — every row this work wants to file, one line each:
      title, `dies` date, and the clause saying why it is a row and not a fix.
    - **Now overdue** — every row ANYWHERE in `ROADMAP.md` whose `dies` date
      has passed, one line each, oldest first.

    He rules keep / kill / re-date on each. **Nothing is struck without him**
    (RF30: striking an item is a decision he does not get to make again). A row
    he re-dates carries the new date and a clause saying who moved it and why.
    **This is not `/close-phase`'s business** — that skill closes a phase, and
    most work that files rows never runs it. It fires when a PR is opened,
    which is also what makes it reach fast-path and one-off changes.
  - _What this deliberately is NOT: a script, a marker on every heading, a CI
    check, or anything that strikes a row on its own. Phase RR built that and
    it was abandoned — `docs/history/phase-rr.md`._
- **CLOSE THE INVARIANT AND KEEP THE REVIEW RECORD CURRENT.** A fix round closes
  every finding's underlying invariant, not only its latest counterexample.
  Every factual claim in a report, review comment, or code comment names
  either the command and relevant output that established it or a citation.
  Label an inference and cite the observations it rests on; an unsupported
  claim is invention that will be read as evidence. These rules bind the
  controller that requests review or merge:
  - **A review record describes the current head, not the head where it was
    written.** After any scope-changing push and immediately before initial
    review, re-review, or merge, name the current head SHA and reconcile the PR
    body against `gh pr diff --name-only` (or the equivalent current
    base-to-head range). Replace stale claims about file scope, captures,
    gates, tests, and finding disposition; never append a correction beneath a
    contradiction. **A PARTIAL RECONCILIATION READS AS A DONE ONE, and PR
    #246 needed two extra review rounds proving it:** both times the headline
    claim was corrected while the same absolute stood in five other places
    (a ROADMAP status line, an owed-work register, an end-semantics section,
    a code comment, an interface note). **After withdrawing a claim, grep its
    PHRASING across every file that repeated it** — the withdrawn words
    themselves ("never", "only", "indefinitely", "all seven") — and reconcile
    each hit or state why it stands. Correcting where the claim was ARGUED
    and leaving it where it was USED is the failure.
    **And grep the PROPOSITION, not only the string (Phase JC, 2026-09-08).**
    JC's own invariant said "no copy on any surface names a colour the
    settings could contradict"; the sweep it ran was for the deleted legend's
    literal words. Five present-tense sentences in
    `app/src/news/content/releaseNotes.ts` still asserted the same mapping in
    different words — "Faster is blue, slower is red", "Those rows are blue
    now", "it turns blue or red" — and neither the spec, the plan nor the
    ROADMAP mentioned News. A shipped release note is where a retired fact
    hides longest, because it is correct about the past and reads as present
    tense. (Ruled: dated notes stand as history; what the invariant forbids is
    UNDATED copy on a rendering surface, and the word "live" is now in it.)
    A push is scope-changing when it adds or removes files, changes
    behavior, risk class, or test surface, or changes a finding's
    disposition. Copy-only corrections do not trigger another census.
  - **Name the authority and lifetime of every predicate input.** When a
    classification combines a saved snapshot with a linked or freshly fetched
    entity, state which record owns identity and whether the inputs can legally
    disagree. For a positive identity claim, select one authoritative record.
    If inputs span records, define and test disagreement; do not assume a writer
    made them equal.
  - **A seam gap gates the PR that creates it.** When recurring failure 24's
    upstream-producer trigger applies, add the supported producer → consumer
    gate in that PR. Do not file it as roadmap or follow-on work and ask for
    re-review with the seam untested.
  - **A negative async assertion waits for positive readiness.** Before
    asserting that asynchronously enriched UI has NO mark, warning, or state,
    first await an observable owned by that enrichment (for example, its
    resolved link).
  - **Mutate the deciding source, not a convenient neighbour.** Per recurring
    failure 22, commit the real change before running the probe. The mutation
    must change the authority selected by the predicate and reach the artifact
    under assertion. For served UI, follow recurring failure 12: run
    `pnpm build`, grep a string literal over `dist/` in both directions, and
    prove the probe goes red before trusting its restored green.
  - **Reconcile the review record before requesting another round.** For each
    finding, record the invariant, fix, supported-path test, biting mutation
    and what its failure said (recurring failure 21), and comment/ruling
    status. Replace superseded claims instead of appending a contradictory
    history, and never call a cost "accepted" without the exact recorded
    ruling that accepts it.
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
- **Typed-lint ratchet and campsite rule.** Existing debt in the committed
  ESLint suppression ledger may only decrease. Never add or regenerate a
  suppression to make a change pass; adopting a new suppressed rule requires
  James's explicit approval. When changing code that carries grandfathered
  debt, remove suppressions for violations in the function, test, or behavior
  being changed when doing so is safe and local, then run `pnpm lint:prune`.
  Do not expand a focused change into unrelated cleanup.
- TDD: failing test first. Domain code gets the heaviest coverage.
- Hooks: pre-commit runs staged format/lint first and whole-project typecheck
  second; it is fail-fast. Pre-push runs unit + client tests only (fast,
  Docker-free — CI runs the full gate incl. integration/e2e). Both hooks fail
  loudly and block if the active Node major is below `.nvmrc`. Don't bypass with
  `--no-verify`; fix the failure. **Root markdown AND everything under `docs/`
  are formatted by NOTHING** — lint-staged's globs are `app/**/*.{ts,tsx}` and
  `app/**/*.{json,css,md,html}`, so `ROADMAP.md`, `CLAUDE.md` and the whole
  `docs/` tree have never been Prettier-formatted; `package.json` is the
  authority if you doubt it. Never run `prettier --write` on them to "fix"
  a failing check: it reflows the whole file and buries a real
  edit in ~100 lines of rewrapped prose (measured on `ROADMAP.md`, 2026-08-31 —
  226/166 became 118/57 once the reflow was reverted). Wrap by hand to match the
  surrounding text.
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
  - The test: the top reads aloud in 30 seconds — James learns what the
    work did and what he now has without opening the Record block. The
    `product-manager` final-PR gate fails a presentation that does not,
    and carries the word counts it checks against.
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
- **And if the merge RECORDED AN ORDER of James's, say which state it is in
  (Phase OD, 2026-09-09).** Two states only: it rides a named PR, or it has a
  date. A row with a trigger is the third state and it is where orders die —
  the sweep that produced this line found twelve live orders, the oldest 23
  days, four of them carrying triggers that had ALREADY FIRED and one carrying
  no trigger at all. **The rule that actually keeps one alive: schedule its
  OPEN QUESTION before scheduling the order.** All four rotted orders were
  0.5-1.0 of work blocked behind a question that took a read to answer and had
  no owner. Say the question, or say there is none.

## Recurring failures — read before you start

Every item below has actually happened here, most of them more than once, and
each cost a review round or a follow-up fix wave. They are in the order they
were found — newest last. **The numbers are permanent identifiers**: 1387
citations across 185 markdown files point at them, so entries are never
renumbered or reordered
(`grep -rohiE "RF[0-9]+|recurring failure #?[0-9]+" --include='*.md' . | wc -l`,
2026-09-12).

**Each entry is the rule and the one measurement that convicts it.** The full
incident behind any of them — what shipped, what was measured, which review
missed it — is `docs/history/recurring-failures.md`, keyed by the same number.
Read that when you want to know whether your situation is the one an entry
describes.

1. **Changing UI without running `pnpm e2e`.** If your diff touches anything
   under `app/src/`, run the named e2e specs locally against an already-booted
   stack, then read the e2e job on the PR for the full suite — and
   `pnpm screenshots` if a screen's layout changed, **committing only the
   captures for screens your diff touched**; `git checkout -- docs/screenshots/`
   discards the rest (TESTING.md §8). The local half is NAMED specs because
   James tiered the gate (2026-09-08): CI owns the full suite, where nobody can
   skip it. **An `app/src/` change is not done until a full e2e run has passed
   somewhere you have read the result.** _Three phases
   running, a task left the e2e suite red because only
   `--project unit --project client` was run._

2. **Trusting the aggregate coverage gate.** The 90×4 threshold is repo-wide, so
   a brand-new file can ship with entire branches uncovered and the gate still
   passes. **Check the per-file numbers for files you touched.** _Four
   components did exactly that: keyboard handlers twice, error branches twice._

3. **Fixtures that don't look like production data.** **Test against a realistic
   fixture** — the seeded library, a stored workout, a populated form. _The name
   generator returned the same name forever against the real 35-workout library
   while every test passed, because the tests used an empty one._

4. **Asserting a thing exists instead of that it works.** **Invoke it and assert
   the consequence.** `expect(typeof retry).toBe("function")` passes whether or
   not retry retries. See docs/TESTING.md §3.

5. **Deleting a component and leaving its CSS.** **After deleting a component,
   grep its class names across `src/` and `e2e/` and remove the dead rules.**
   _Happened three times: `.col-*`, `.set-toggle`, `.field-dur`/`.field-spm`._

6. **Judging contrast by eye.** **Compute the ratio; put the number in your
   report.** _A token shipped at 3.29:1 against a 4.5:1 requirement and was
   caught only by a later automated scan._

7. **Screenshots that capture empty states.** **Seed real data, then open the
   image and look at it** — and when the screen derives a number from other
   numbers in the same frame, recompute the headline from the rows by eye. _PR
   #117's flagship capture showed a hero contradicting its only row by
   37s/500m through seven reviews; the PM caught it with ten seconds of
   arithmetic._

8. **Hand-rolling the same ARIA pattern again.** **Reuse
   `PaceRefInput`/`ClassificationCard`'s roving-tabindex pattern and copy its
   keyboard tests.** _There are already three such radiogroups; each shipped
   untested and needed a follow-up._

9. **Letting `docs/design/DEVIATIONS.md` drift.** It documents _current state_,
   not history. **When you change or remove something it describes, reconcile
   the row.** _Rows have described deleted code and contradicted each other._

10. **Assuming the plan is right.** **If the brief contradicts what you observe,
    say so in your report instead of working around it silently.** _Plans here
    have carried a route-ordering claim the router made moot, a `DROP COLUMN`
    sequencing that would have broken rollback, and a task split that was
    impossible because a type change forces compilation coupling._

11. **Verifying the app only against itself.** Every gate this repo has checks
    the app for INTERNAL consistency. **When the machine reports a number we
    also compute, compare them** — on hardware with both screens in one shot, or
    in a test by replaying a capture from `docs/monitor/sessions/` and checking
    the derived total against each interval's own final pre-reset reading (the
    captures carry no `boundary` events, and the boundary-actual sum is an
    unsound oracle). _A nine-task wave, three adversarial reviews, a
    test-integrity sweep and a five-item erg walk all passed while the app
    reported 16938 m against the PM5's own 4384 m; James found it by
    photographing both screens in one frame._

    **AND ASK WHAT QUANTITY THE ORACLE MEASURES, not just whether it agrees.**
    **Before trusting any external number, state what it measures and confirm it
    is the same thing you are trying to be right about.** An oracle that shares
    your definition is a mirror. _`recordTwdVerdict` checked our accumulator
    against the PM5's Total Work Distance and celebrated a sub-metre three-way
    agreement; TWD is work PLUS rest-coast metres and so was our sum, while
    Concept2's logbook — the actual authority — stores work only. It is now
    RETIRED: lifting its distance-interval suppression makes it PASS everywhere
    (0.2-1.5 m across five captures), never a real check._

12. **Settling a claim about build output by reading code instead of building
    it.** **Any claim of the form "X is not in the production bundle" is settled
    by `pnpm build` plus a string-literal grep over `dist/`, in both directions —
    prove the probe can go red before trusting its green.** _Minification
    renamed an identifier `dist-grep.sh` was looking for, and PR #100's dynamic
    `import()` behind a runtime check emitted its whole module graph anyway,
    because Rollup only folds an `import()` behind a BUILD-TIME constant._

    **Corollary: a mutation that breaks the BUILD reads as a passing probe.** **An
    e2e mutation must COMPILE** — swap one call for another that keeps every
    import used, rather than deleting a call — **and the build must be seen to
    succeed before the test result is read.** _Three e2e probes came back green
    in one session because the mutation left an import unused, `pnpm build`
    exited 2 inside `docker compose up --build`, and compose kept the PREVIOUS
    image (PR #344)._

13. **Handing James an operator instruction nobody checked against the code.**
    **Before an instruction reaches him, run it or read the code that serves it:
    paste the block, follow the flag to the branch that consumes it.** An
    instruction is a claim about the system and gets the same evidence bar as
    any other. **And if a flag carries a diagnostic, say so where the flag is
    written down** — a diagnostic hidden behind a build flag is disarmed by
    anyone who edits the build command for unrelated reasons. _Phase CS's spec,
    its plan and two walk cards all said `VITE_ENABLE_FAKE_MONITOR=1
    pnpm ios:build` puts a fake PM5 on the phone; `adapters/monitorTransport.ts`
    takes the Capacitor BLE arm whenever `isNative()`, so only the web arm ever
    reaches the fake seam. He built, tapped Connect, and found nothing._

14. **Treating a PR body as a record.** **A PR body is a presentation; anything
    with a life after merge goes in ROADMAP, a ledger, DEVIATIONS, or a RUNSHEET
    at the moment it is found.** _Five times in six PM gates a real finding lived
    only in a PR's Record block and had to be rescued at the gate, or was lost._

15. **Writing release notes from your own branch instead of the tag's range.**
    **Before cutting a tag, list every merge since the previous one and account
    for each: a note, or a stated reason it needs none.** **Use
    `git log <prev-tag>..main --oneline` WITHOUT `--merges`** — main is
    squash-merged, so `--merges` returns EMPTY and the gate is unrunnable as
    written. _v0.13.0 was one command from shipping with notes that omitted
    session deletion, merged from a parallel session; the `--merges` form was
    prescribed for four tags before anyone noticed it returns nothing (found at
    PR #144's re-gate)._

16. **Stating an unsourced premise as fact.** **A premise you cannot cite is a
    premise you are inventing: tag it PRIMARY / SECONDARY / INFERENCE, or do not
    say it.** The tell is a sentence that sounds like it came from a document.
    **A dangling citation is worse than no citation, because it reads as
    evidence** — 23 citations across 11 tracked files point into `.superpowers/`,
    which is git-excluded. _In one day the controller said "the PM5 is
    single-central" and "App Review scrutinises a `bluetooth-central`
    declaration" — both load-bearing, both false or unsourceable._

    **Second corollary: a SOURCED premise fails differently.** **A citation is
    only as load-bearing as the line you actually quoted.** When an argument
    depends on an attribute of a source — required vs optional, current vs
    superseded, what a field MEANS — **quote that line verbatim beside the claim
    and name the attribute the argument needs.** A URL is not evidence; a
    sentence is. _Phase JR's spec justified a stored shape twice from real
    citations: one was true when written and false when used (a capture two days
    older), the other correct about an enum and silent on the `Required: No`
    the whole argument rested on._

    **Third corollary: READING A CONDITIONAL AS AN ENUMERATION.** **The tell is
    writing "the only X it lists" about a sentence containing a conditional
    clause** (`that is…`, `when…`, `if…`): such a sentence describes a case, and
    a case is not a set. **Ask what the sentence would still permit if the
    condition were false.** _Appendix E's line about where a TERMINATED row goes
    was written up as "gives a JustRow only a Terminate exit", tagged PRIMARY,
    and propagated to four files — and it was committed INSIDE the pass that was
    correcting a different instance of this very rule, which is why the check
    has to be mechanical rather than attentional._

    **Two checks, because a ledger only one agent reads cannot prevent
    anything:** for any "we have never observed X" claim, **list the capture
    directory BY DATE and read the newest walk's README first** — corpus facts
    here have expiry dates. And when a spec tags a vendor document PRIMARY,
    **grep the repo for our own transcription of it AND for any code comment
    recording a hardware DEPARTURE from it.**

    **Fourth corollary: A VENDOR'S REVISION HISTORY LOGS EDITS TO A DOCUMENT,
    NOT CHANGES TO THE WIRE.** **When a scope claim rests on a vendor's
    changelog, re-derive it from a property of our own code and require both
    routes to agree.** _The short-status-frame fix scoped itself from Concept2's
    revision history; the conclusion was right and the method was not — the same
    pass found three GATT-versus-multiplexed divergences carrying no revision
    row at all. What rescued it was `length floor − (highest byte offset of a
    field that has a consumer)` over our own parsers: exactly two had slack._

17. **Opening a phase without writing it into the ROADMAP.** **The brainstorm
    that names a phase adds its ROADMAP section in the same commit as its spec.**
    _Four phases running (PW, CS close, CM, LT), the phase's own gate ran
    `grep "<phase>" ROADMAP.md` and got zero._

18. **Opening a phase without READING the ROADMAP — and re-researching what this
    repo already settled.** **Before researching anything the OS, browser or
    device owns, run `ls docs/superpowers/research/` and `grep` the ROADMAP for
    the symptom.** **And name the LAYER**: a correct citation answering the wrong
    layer reads exactly like evidence. _Phase LM diagnosed the wrong bug,
    proposed a fix that could not work, and scoped a PR contradicting a standing
    ruling — all four corrections were already in the repo, including the real
    mechanism in James's own tester report the day before._

    **A COMMENT THAT NAMES ITS OWN PRECONDITION IS A TRIPWIRE.** **Before adding
    a caller to a shared hook, grep its source for "unreachable", "only
    because", "as long as", and "today":** those phrases mark invariants held up
    by the current call graph, and a new caller is what changes it. _A connect
    guard's comment said in as many words that it would need a `cancellingRef`
    if cancel ever stopped unmounting; a new screen did exactly that, and the
    abandoned attempt installed a driver and ten subscriptions behind a screen
    reading "Not connected" (PR #246)._

    **AND IT APPLIES TO PROCESS, NOT ONLY CODE.** **Before designing a fix for a
    workflow problem, grep the repo for a ruling on it** —
    `grep -rn "<the symptom>" docs/ ROADMAP.md CLAUDE.md` — **and read the
    consumer before optimising the producer.** _Two sessions and three PRs went
    into making `pnpm screenshots` byte-stable before anyone asked who consumed
    the bytes (nobody automated) and found James's own ruling in TESTING.md from
    two weeks earlier. The engineering was reverted._

19. **Trusting a verification stack that stops at the wire.** Our instruments sit
    at or below the transport seam, so a defect entering ABOVE it — platform
    lifecycle, permissions, backgrounding, OS interruptions — is invisible to
    every gate we own. **For any new platform-sourced input, ask which
    instrument would catch it if it were wrong — and if the answer is none,
    build the instrument in the same change.** _A red `LOST THE MONITOR` banner
    fired nine times in 288 s over a link that never dropped, with four
    instruments blind at once; it shipped through a full review and James found
    it at an erg. The recording format now carries `lifecycle` events for
    exactly this reason._

20. **Writing to the main checkout with a relative shell path.** The
    `git rev-parse --show-toplevel` guard covers COMMITS, not WRITES: the
    shell's cwd resets between tool calls, so a `cat >>` or `>` redirect after a
    reset edits the main checkout. **Every shell write uses an ABSOLUTE worktree
    path, or a `cd` in the SAME command.** Edit/Write tools take absolute paths
    and are safe; shell redirects are not. _Five stray main-checkout writes, the
    latest caught only at `git add` (PR #197)._

21. **Shipping a gate that cannot go red.** A green check you never proved can
    fail is not evidence; it is decoration that reads as evidence, and it is
    worse than no gate because it retires the suspicion that would have found
    the bug. **Every new assertion gets a mutation that makes it fail, and the
    report states what was mutated and what the failure said.** Then check each
    of these:

    - **Does the assertion measure the element the fix changed?** An inline
      element's `scrollWidth`/`clientWidth`/`offsetWidth` are always `0` —
      blockify it or measure its flex-item parent.
    - **Does the test import the constant it exists to gate?** Then it retunes
      with the constant. Pin contracts with INDEPENDENT literals (held at 1999,
      released at 2000), never with the production symbol.
    - **Is every mutation below the seam under test?** When a fix's value crosses
      a component seam, one mutation forges the value AT the seam.
    - **Can any user-facing path reach the invariant?** If not, the test belongs
      at the layer that can. A green assertion you could not make fail is
      decoration — move it or delete it.
    - **Does a bound justify the decision at the right layer?** Name the layer
      that enforces it and check whether a NARROWER one sits downstream.
    - **Can the module answer without consulting its store?** Any in-memory
      fallback beside a store hides the store being broken. Set the fallback only
      on the refused path; clear it on the successful one.
    - **Is a concurrency gate proved by RACING?** Racing is unreliable. Hold an
      uncommitted conflicting row in an open transaction on one connection while
      the code runs on another, and verify the pool has ≥2 connections or the
      test hangs instead of failing.

    **And when a probe comes back green, name the case in the suite where it
    could have gone red.** If you cannot name one, you have found a hole in the
    tests, not a fact about the code — say so rather than promoting the silence
    into a property of the design. The tell is "restoring X alone breaks
    nothing, so X is safe": that is only true if something was watching X.

    _RC-24 shipped TWO in one task: a `min-width` clip fix on a plain child of
    the flex item, where `min-width` cannot influence flex shrink at all, and
    the e2e no-clip test that measured that same inline element, whose
    `scrollWidth` and `clientWidth` are both always `0`. Both survived a full
    review and a scoped re-review._

22. **`git checkout -- <file>` to revert a mutation probe, on a file that also
    holds uncommitted work.** **Before reverting anything with `git checkout`,
    run `git status` and check whether the file carries work you have not
    committed.** The habit that removes the class entirely: **commit the real
    change BEFORE running any mutation probe**, so every revert is a no-op
    against a clean file. `git stash` is not the alternative — the stash stack is
    shared with other sessions. **And confirm the commit LANDED (`git log -1`)
    before the probe.** **And anchor the mutation on a UNIQUE string:** grep the
    anchor first and confirm it returns ONE hit. _Reverting a one-line mutation
    destroyed an unrelated uncommitted comment fix, silently, because the suite
    went green either way. Later: a blocked pre-commit left a file dirty and the
    probe's revert erased forty lines of real work. Separately, a probe edited
    the first match of a `sessions:` line — the unmounted test router, not the
    mount it meant to break — and read green as evidence._

23. **Adding an affordance to a surface that already offers the same thing, and
    killing the better offer with it.** **Before adding an affordance, enumerate
    everything else on that surface that already offers, suggests, or writes the
    same value, and write a test driving the NEW affordance against each.** The
    smell is two mechanisms proposing one field's value; the failure is the
    better-informed one losing silently. _`[−][+]` steppers were added to fields
    that already carried a derivation offer; the stepper materialised the
    generic table seed, which made `draftValue !== offer.value`, so the
    rower's own derived estimate vanished in ONE TAP. No test caught it because
    every existing test reached the field through the offer button or by
    typing — the only ways in when they were written._

24. **Every test seeding PAST the producer, so no gate can go red on the one
    defect that matters.** Item 21 covers a gate that can never fail at all;
    this is its sibling — each gate CAN fail, they are all green, and none can
    fail on this bug, because every one enters the pipe downstream of the break.
    **The check is not "are the gates green" — it is "which test STARTS upstream
    of the producer?" For any A-writes-then-B-reads seam, one test must begin
    before A and assert after B.** Both halves being well tested is exactly the
    condition that hides a broken seam. **Two tells:** a test whose own name
    explains the production symptom away as legacy, and a phase criterion
    verified at the wrong LAYER — **a criterion cannot be verified on a build
    where its code does not exist**, and "verified on hardware" means nothing
    until the layer is named. _`MACHINE CONFIRMED · WORK ONLY` reached ZERO of
    sixteen production rows while three gates stayed green; the break was one
    line, a mount-time `useState` snapshot that never re-read._

25. **A lower layer reports a durability failure and its caller proceeds as if
    persistence succeeded.** **At any seam where A persists and B proceeds or
    reads, the spec names ONE owner of the end-to-end invariant:** either the
    caller branches on the failure it can now see, or a comment states why the
    outcomes are genuinely indistinguishable — a claim with the same evidence
    bar as any other. **The tell is a documented rationale of the form "the
    caller has no different action to take on a failed write."** _The
    2026-08-28 audit's headline systemic pattern, already shipped three times:
    `Countdown.tsx:220` ignores `saveRun`'s boolean and navigates to a Timer
    that silently bounces to Today; `saveMonitorRun` swallows its failed write
    so the Log door renders `NO MONITOR READING`; `monitorRun.ts` says those
    words verbatim, and AUD-016 is the different action it did not imagine._

26. **Promoting a useful gate into a stronger product claim than it proves.**
    **Before building or reviewing any non-trivial gate, write its five-part
    proof contract:** (1) the production invariant; (2) the supported producer
    and reachable ordering; (3) the independent observable; (4) the exact
    deciding-source mutation and expected failure; (5) the strongest conclusion
    the spec, test title, comments, and PR body may state. A synthetic ordering
    proves conditional acceptance only; re-entry proves re-entry; a definition-
    or call-site census proves structure, not runtime invocation. **If the
    supported path cannot be gated, narrow the claim or change production — do
    not manufacture an interleaving and promote it.** Behavior, its gates, and
    its record stay in one review unit. _PR #239 took nine review rounds; its
    last round changed only comments and prose, because the remaining defects
    were claims about the evidence rather than about behavior._

27. **Session-scoped state shipped without a lifetime table — and a spec that
    names a mechanism where it owes an invariant.** **A plan introducing any
    session-scoped state carries a LIFETIME TABLE** — every ref, guard, and
    counter; its mint site; its clear sites; what survives teardown, relaunch,
    and re-arm — **and states invariants, never mechanisms.** **A novel mechanism
    gets the antagonist pass**; a skip that waves one through buys review churn
    at about one invariant clause per round. **Corollaries:** adopt a reviewer's
    rule wording VERBATIM the first time and grep-sweep every sibling phrasing in
    the same round; merge main before every ready comment; and a "CI green"
    claim requires the run to EXIST first. _PR #258 took nine external review
    rounds, five of them one design flaw discovered a clause at a time; three of
    the five were LIFETIME bugs — state minted per-attempt, cleared per-teardown,
    compared per-document, all claiming to be per-session._

28. **Main's post-merge CI was red for eleven hours across six merges, and
    nobody read it.** **A PR's green checks say nothing about the run its MERGE
    produces.** `gh run list --branch main --limit 5` is part of every release
    gate (RELEASING.md step 0) and every phase-close gate, and the post-merge
    ritual says which conclusion main's run reached, not just that the PR's did.
    _Every PR check was green while every push to main failed its `deploy` job;
    v0.32.0 was tagged, uploaded and walked at the erg against a server frozen
    at v0.31.0 that could not accept its own headline feature. A hardware walk
    found it._

29. **Leaving dead code behind with no ROADMAP row to remove it.** **When a
    change makes code unreachable — an arm, a helper, a plugin, a CSS block —
    the same PR adds a ROADMAP row naming what is dead, why, and what removes
    it.** A "decide later" ruling is not a row; it lives in a PR body, which is a
    presentation (RF14). Deleting the consumer and leaving the dependency is RF5
    with a package name. _`openExternalUrl`'s native arm lost its last caller,
    the review flagged it, the ruling was "decide at the whole-branch review",
    that review never returned to it, and it shipped with `@capacitor/browser`
    still a dependency for a path nothing could reach._

30. **Ruling an option OUT of a design gate on a cost nobody measured.** **A cost
    attached to an option is a factual claim and carries the same evidence bar
    as the design itself. Measure it, or write "untested" and let the gate decide
    with that on the table.** The tell is a disqualifying reason that sounds like
    a platform limit with no number beside it. **Corollary: the option you are
    about to recommend is the one you tested; the one you rule out in a clause is
    the one that needs the receipt.** **And it is not only design gates —
    anything you remove from a queue, a slate or an option list on a stated cost
    owes the same evidence**, because striking an item is a decision James does
    not get to make again. _The Library keyboard gate dismissed "paint the strip"
    as "guessing a height the platform won't tell us". Nobody tried it. The
    chosen option was built, reviewed and pushed — then found to delete the whole
    main navigation on a 1.21x pinch-zoom — and the rejected option needed no
    height at all. The implementation was thrown away and rebuilt as six lines
    of CSS._

31. **A fix is a new claim and gets the gate the original claim got — and a walk
    runsheet is a TIMED PROTOCOL between two machines.** **Three checks:**
    (1) **re-run the state-machine walk over the FIXED steps** — each step
    against the screen the previous step leaves the operator on, on BOTH
    machines; (2) **a runsheet carries a TIMER TABLE** — every clock, its value,
    what starts and clears it, and which human hold or controller gap can expire
    it — and every hold reads "hold until X, at most N, then Y"; (3) **a count,
    or a "we cannot tell X from Y", is settled by a command or the vendor's
    sentence, never by re-reading.** _The Scan NFC runsheet took seven PM gates;
    v1-v4 each failed on defects INSIDE the previous round's fix. It then
    contained not one duration, and the controller's own turn was the clock
    driving every other._

32. **Naming the PM5 in copy where the rower is not being told WHICH monitor.**
    **In user-facing copy the erg's display is "the monitor". "PM5" appears ONLY
    where it is the device's own advertised name doing a job** — disambiguating
    which monitor ("Looking for PM5 432331249"), or naming the source of a stored
    number where the reader must know it came from the machine
    (`MACHINE SUMMARY · PM5 · PER INTERVAL`). **The check is mechanical:**
    `grep -rn "PM5" app/src --include='*.ts' --include='*.tsx'` over string
    literals, and for each hit ask "would this sentence be less true with
    'monitor'?" — if not, it is the wrong word. Code identifiers, comments, wire
    notes and walk records are not copy. _Three such lines shipped on one
    surface; fixed in #331._

33. **A narrowed input interface that renames the producer's field, and a
    constant whose unit no assertion can reveal.** **When a domain function
    declares a narrow input interface described as "structurally what X
    carries", diff it against X's real declaration FIELD BY FIELD**, and make
    the field REQUIRED with `null` meaning absent so the compiler becomes the
    gate. **One test must build its input from the PRODUCER.** **And for any test
    whose expected value would be UNCHANGED by a unit error, list the constants
    that would not be; those are the untested ones**, and pin them at a boundary
    with independent literals. _A resting sample is marked `r`; the domain
    function spelled it `rest`, and because the field is OPTIONAL structural
    typing accepted the real `Sample` with the key simply absent — the rest
    exclusion was dead on every production path while every test, which built
    `rest` by hand, proved it worked. In the same function a deciseconds cap
    shipped at 6.0 s while claiming 60, and no assertion on the result could
    catch it because a weighted mean is scale-invariant. Both were found by
    review, after the author had run four mutation probes that all bit._

34. **Stating an invariant in a spec and then applying it to ONE of the places it
    governs — and defending the gap as scope.** **When a spec states an
    invariant, enumerate every site in the function or module it governs and say
    for each whether it holds — before calling the scope settled.** A change that
    half-applies its own stated principle is WORSE than one that never stated it,
    because it reads as though the case was considered and dismissed. **Treat
    "pre-existing, out of scope" with suspicion when the finding sits inside the
    very function under change:** pre-existing is a fact about history, not an
    argument about scope. _`nativeSignOut`'s plugin logout was moved after the
    local token clear and swallowed, per the spec — while the same function still
    awaited `api("/api/auth/signout")` FIRST, so a rower offline tapped Sign out
    and stayed fully signed in. It survived an antagonist pass, a code review and
    a PM gate; it took James asking "Is the offline fix not in this?"_

35. **A fix is a claim, and its gate can miss for a reason the original did not.**
    RF31 says a fix gets the gate the original claim got; this is the sharper
    half. **Run the reviewer's OWN mutant against your fix, not a mutant of your
    own choosing** — a fix verified by a probe you designed after the fix tests
    the fix's shape, not the defect. **And when a fix's gate passes on the first
    try, ask which arm of the predicate the test actually reaches.** _Measured
    three times in one branch: a verdict assertion added to the real-Postgres
    seam test whose mutant only fires on the null path; a setting flipped inside
    a refresh mock when `acquireAccessToken` takes its locked read BEFORE
    refreshing; and a fail-closed ordering claim that shipped with no gate at
    all, whose probe passed 178 of 178._

36. **A commit message is a claim about its own diff, and nothing checks it.**
    **Before writing a commit message, diff it against the diff:** every concrete
    claim ("removed X", "added Y", "N files") is checkable against
    `git diff --cached` in the moment it is written, and a claim that fails that
    check is worse than silence. This matters more than a PR body (RF14),
    because a PR body is read once and a commit message is what `git log` hands
    the next person forever. _A fix commit said it "removed two stray fields from
    link fixtures". It removed none — the count matched what was still in the
    tree, so the work had been intended, skipped, and then read as done. Caught
    by `git show <sha> -U0 | grep '^-'`._

37. **Moving a rule in a stylesheet silently changes which of two
    equal-specificity rules wins, and only a real browser can see it.** **Any
    change that MOVES a colour rule rather than editing it needs a browser
    gate**, and a repo whose client tests cannot see colour owes a sweep
    asserting that no bare class declares `color` on a verdict-bearing element.
    **Make that sweep's element list DERIVED, not typed out.** _The judged-colour
    rename moved verdict classes ~5000 lines UP `index.css`, above
    `.summary-row-pace { color: var(--ink) }` at identical (0,1,0) specificity,
    and every judged row on the post-workout summary rendered plain ink. No
    class-name assertion could catch it: Vitest imports every `.css` as `""` and
    jsdom does not resolve `var()`, so `toContain("var(--x)")` passes against a
    totally broken cascade. `index.css` already stated the rule in prose —
    prose is not a gate._

38. **A test whose value depends on how it navigated needs an assertion about the
    navigation.** **When a test's conclusion rests on a property of HOW it got
    there, that property is an assertion, not a comment.** **Ask which process
    boundary a gate actually crosses**, then take two legs and say which one IS
    the gate; **a same-document sentinel, asserted PRESENT in one leg and ABSENT
    in the other, is what keeps them honest** — neither leg alone is sound.
    _JC's seam test had two legs that only differ because one navigates by
    CLICK; swap it for `page.goto` and every colour assertion still passes while
    the two-legs claim is silently false. The mirror, from Phase RN: a CLICK
    navigation makes both legs BLIND where a reload made both PASS, because a
    module's in-memory state survives a same-document nav — so a phase whose
    whole claim was "the choice survived being written down" prescribed exactly
    that leg and called it load-bearing._

39. **A force-push can produce no CI run at all, and `gh pr checks` then says
    "no checks reported" — ABSENT, not red.** **Before any merge, assert the
    run's `headSha` EQUALS the PR's current head and its `conclusion` is
    `success`** — never that "a green run exists on this branch". _After an
    amend and a `--force-with-lease`, PR #371's head had ZERO runs and
    `gh run list` showed only the previous head's green; a wait loop scoped to
    the new SHA would have hung forever. The same trap bit a watcher in the same
    session: an `until` loop that exited on the first COMPLETED run reported a
    neighbouring PR's success as this merge's._

40. **Reading a KILLED test run as a flaky one, and retrying it into a machine
    that just proved it has no room.** Three signatures, none of which is a test
    result: **(a) an exit code ≥ 128 is a signal death** — 137 is SIGKILL and
    reads as memory on its own, 134 is SIGABRT and reads as memory only when
    stderr carries `Allocation failed`, 130 is your own Ctrl-C and 143 a
    SIGTERM; **(b) `pnpm exec` COLLAPSES all of them to exit 1** — which matters
    because the Commands section prescribes `pnpm exec vitest` as the scoped-run
    workaround, so the repo's own advice hides this signal; **(c) a fork-worker
    OOM exits 1 AND prints a full `Test Files` summary**, so the summary proves
    nothing and the tell is `Allocation failed` on stderr. **Never re-run a suite
    showing any of the three** — a retry is what turns one kill into a lost
    session. `pnpm test` routes through `app/scripts/test-run.sh`, which says so
    and writes evidence to `app/.test-kills/`. **And the lesson that generalises:
    when a claim is that no signal exists, re-run it through every INVOCATION
    SHAPE the production path uses before believing it** — this design's first
    draft asserted "the system gives us no signal" from measurements taken
    entirely through `pnpm exec`.

41. **A connected e2e fixture that streams frames makes every assertion about a
    pre-row state decoration.** `injectFakeMonitor` and the Just Row capture
    harness both default to a streaming timeline, and the first rowing frame
    OPENS THE RUN, which makes `axes.session !== "none"` and renders the
    connected surface **regardless of any pre-row flag, screen or setting**.
    **Any assertion about a state BEFORE the first pull runs on a motionless
    fixture (`events: []`), or is bounded below the fixture's own first frame.**
    **And when such a test passes on the first try, delete the producer it
    depends on and confirm it goes red** — "the surface appeared" is the one
    observable this fake hands you for free. _A phase gating a new pre-row
    preference deleted its store's `setItem` — the mutation its whole gate
    existed to catch — and all three e2e legs passed; on an empty timeline the
    same mutation fails both. It hit twice in one day in two different
    harnesses._

## Commands

- iOS: `pnpm ios:release` (full CLI TestFlight release from the current tag;
  derives `GOOGLE_IOS_CLIENT_ID` from Info.plist — docs/RELEASING.md),
  `pnpm ios:build` (bundle+sync only). **`GOOGLE_IOS_CLIENT_ID` does not fail
  loudly if unset** — `package.json:26` defaults it to empty, so the build
  SUCCEEDS and produces a bundle whose native Google sign-in is silently dead
  (`src/native/signin.ts:8` receives `""`). Export it, or use `ios:release`,
  which derives it from Info.plist,
  `pnpm ios:open` (Xcode, GUI fallback).
