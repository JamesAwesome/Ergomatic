# Wave E PR B — the link-outs leave the app (implementation plan)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A rower who taps **View on Concept2 →** on a row they just sent lands
on that row, not on Concept2's *"The user has made this result private"* page.
The three read-only link-outs stop opening an in-app sheet with its own cookie
jar and start opening the phone's default browser, where the rower's Concept2
session already lives. James, 2026-09-04: _"opening in safari is fine because
it will be clear you're changing apps."_

**Architecture:** One adapter function loses one branch. `openReadOnlyUrl`
(`app/src/adapters/externalBrowser.ts`) becomes the web arm unconditionally —
`window.open(url, "_blank", "noopener,noreferrer")` — which inside the
Capacitor WebView is handed to the system by `@capacitor/ios`'s own
`WebViewDelegationHandler`. Nothing else in the app changes: same three
buttons, same labels, same 44px rows, same call sites. **Whether that is
actually true of the phone is UNPROVEN and is the first thing this plan does**
(Task 3, the probe). On a pass, `@capacitor/browser` loses its last consumer
and is removed. On a fail, an `isNative()` branch comes back over
`@capacitor/app-launcher`, and the removal is cancelled.

**Tech Stack:** React 19 + Vite, TypeScript ~6.0, Vitest 4, Playwright,
Capacitor 8.5.0 (iOS). pnpm only, ESM only. Node 26 —
`export PATH="$HOME/.local/share/nvm/v26.5.0/bin:$PATH"` first, per the agent
briefing.

**Spec:** `docs/superpowers/specs/2026-09-04-concept2-walk-fixes.md` (REV 3,
head `39028c13`). **This plan implements §5.2 / §6.2 / §6.3 / §8-PR-B ONLY.**
§5.1 (PR A — the row and the screen) and §5.4 (PR C — which number is
authoritative) are separate PRs, later, in that order — ruled by James on
2026-09-04 (§2 ruling 4).

**Approved design:**
`docs/design/handoffs/2026-08-31-concept2-connect/amendment-2026-09-03.html`
§7, drawn at `3fe5f2c2` and approved by James at `39028c13` (§2 ruling 7).
**Gate 0 for this PR is already closed** — see Task 0, which verifies rather
than re-presents.

**Written 2026-09-04** in worktree
`/Users/james/projects/github/jamesawesome/Ergomatic-wt-c2walk` (branch
`wave-e-c2-walk-fixes`, head `39028c13`). Every `file:line` below was read in
this worktree at that head; every command shown as measured was run there.

---

## The spine of this plan: nothing in CI can prove this change

Read this before Task 1. It is not a caveat, it is the shape of the work.

Every instrument this repo owns is blind to the one thing PR B changes, and
each is blind for a different reason:

| Instrument | Why it cannot go red on this change |
| --- | --- |
| `Concept2SendBlock.test.tsx` | `vi.doMock("../adapters/externalBrowser", …)` (`:104`, `:125`, `:238`). It asserts `openReadOnlyUrl` was CALLED with a URL. True before, true after, true if the URL opens in a sheet. |
| `src/native/**` coverage | Excluded at `vitest.config.ts:48`; `src/native/externalBrowser.ts:1-4` carries its own `v8 ignore` block. The deleted arm was never measured. |
| `app/e2e/concept2.spec.ts` (the driven link-out, `:483-508`) | `isNative()` is `false` under Playwright, so this drives the WEB arm — the arm that **does not change**. It stays green through this PR and through a mutation of it. It is kept because it protects the web arm. It is **not** a gate on this change. |
| `pnpm dist:grep` | Proves dev-only seams are absent from `dist/`. Says nothing about which browser a shipped chunk opens. No needle mentions a browser plugin (`app/scripts/dist-grep.sh`, read at head). |
| CI's iOS surface | There is none. `.github/workflows/ci.yml` runs `bash -n app/scripts/ios-release.sh` and `bash -n app/scripts/ios-google-client-id.sh` and `bash app/scripts/ios-release.test.sh` (`:169-173`). **No job builds the app, opens Xcode, or validates `Package.swift`.** So Task 4's dependency removal has no automated check at all — which is exactly why §6.3 splits this PR into two commits and two walks. |

**The device walk is the gate.** Task 3 is not a verification step at the end;
it is a precondition in the middle, and Tasks 4-5 do not exist until it
answers. Exit criterion B5 requires the PR body to say this in its own words
and to name `app/e2e/concept2.spec.ts:483-508` as the test that stays green
while proving nothing about it. **A claim of "gated" on this PR is a false
claim.**

---

## Global Constraints

Each line is quoted from the spec (§ named), the approved design page, or the
standing rules (`CLAUDE.md` / `.claude/agent-briefing.md`). Nothing here is
invented by this plan.

- **Worktree:** `/Users/james/projects/github/jamesawesome/Ergomatic-wt-c2walk`
  (branch `wave-e-c2-walk-fixes`). `git rev-parse --show-toplevel` before
  EVERY commit, confirming it prints that path (CLAUDE.md SDLC). Every shell
  write uses an absolute worktree path (RF20) — the shell's cwd resets between
  tool calls, and a bare `>` redirect after a reset writes to the main
  checkout. Before relying on hooks: `pnpm install` at the worktree root AND
  in `app/`, then verify a deliberate lint error is blocked.
- **Never merge, close or approve the PR. Never remove the worktree.** Present
  the verdict and stop (CLAUDE.md SDLC).
- **Fast path: NO.** Checked mechanically against the spec's §7: PR B touches
  a platform adapter and removes a shipped dependency, so check (5) fails —
  the failure mode is a rower's link-out silently opening the wrong thing on a
  shipped build, which no test can see.
- **Scope.** PR B alone. **No file under `app/src/you/`, no new route, no
  change to what any screen draws, no change to the send payload.** If a step
  reaches into PR A's or PR C's surface, stop and say so rather than finishing
  and disclosing (CLAUDE.md, escalate mid-change).
- **No pixel moves** (approved design §7, verbatim): _"Three buttons keep
  their labels, their colour, their 44px row and their position; the tap opens
  the phone's default browser instead of an in-app sheet."_ **No copy string
  changes anywhere in this PR.**
- **L2, one behaviour for all three** (spec §5.2): the result link on a SENT
  row, the result link on an ALREADY THERE row, and `OPEN CONCEPT2 PROFILE`
  on the no-weight refusal all take the same path. Mechanically two call sites
  of one function (`log/Concept2SendBlock.tsx:189` and `:245`) and three
  rendered states. **No state gets a different browser, and no call site grows
  a variant.**
- **L4, the consent hop is not touched** (spec §5.2): the OAuth authorize leg
  stays `ASWebAuthenticationSession` on native (`adapters/linkFlow.ts:332`)
  and `navigateWeb` on web. RFC 8252 §8.12 forbids an embedded user-agent
  there. The handoff README's "system browser" copy for **Connect**
  (`README.md:141-152`, `:309`) describes that hop and stands unchanged.
- **L5, the platform conditional does not multiply** (spec §5.2): after this
  change `openReadOnlyUrl` has either ZERO platform branches (probe pass) or
  exactly one, in the adapter layer, with a comment naming the WebKit
  behaviour that forced it and citing the walk that observed it. **Nothing
  platform-conditional appears in a component** — lint-enforced by
  `eslint.config.js`'s `no-restricted-imports` block, which exempts only
  `src/platform.ts`, `src/api.ts`, `src/native/**`, `src/adapters/**` and the
  two monitor transports.
- **L6, no dependency without a consumer** (spec §5.2): if nothing imports
  `@capacitor/browser`, it is not in `app/package.json` and not in the iOS SPM
  manifest. RF5 with a package name instead of a CSS class.
- **`pnpm screenshots` is NOT run** (exit criterion B6, and the standing
  "no screenshots for copy" rule): no screen's layout changes. Captures are
  not taken for mechanism-only diffs.
- **Gates (agent briefing's table, `app/src/` row):** `pnpm lint` ·
  `pnpm typecheck` · `pnpm format:check` ·
  `pnpm test --project unit --project client` · **`pnpm e2e`**. Run from
  `app/`. `pnpm e2e` is a `bash scripts/e2e.sh` invocation and is never
  replaced by a bare `playwright` call.
- **Test invocation, two footguns** (CLAUDE.md + briefing):
  `pnpm test --project client -- <pattern>` SILENTLY RUNS THE FULL SUITE, and
  a bare `vitest run` collides Node 26's webStorage global with jsdom's
  `localStorage`. For one file use exactly:

  ```
  cd /Users/james/projects/github/jamesawesome/Ergomatic-wt-c2walk/app
  NODE_OPTIONS=--no-experimental-webstorage pnpm exec vitest run --project client <file>
  ```

  Read BOTH summary lines ("Test Files" and "Tests") — a file that fails to
  load collects zero tests and still reads green on one of them.
- **NO `&&` OR `||` IN ANY GATE BLOCK IN THIS PLAN.** One command per line,
  each run and each reported with its own result; `cd` gets its own line.
  `A && B` hides B when A fails, and `A && B || C` reports **C's** exit
  status, so a red suite reads green to anything checking `$?`.
- **TDD + self-mutation:** failing test first. Every NEW assertion gets a
  mutation probe run against a **committed** tree (RF22: commit the real
  change BEFORE probing, so every revert is a no-op; run `git status` before
  any `git checkout --`). Every mutation anchor is grepped first and confirmed
  to return exactly ONE hit before it is applied. Reports record the mutation
  and the exact failure text.
- **Per-file coverage** (RF2): the 90×4 gate is a repo-wide aggregate. Read
  the per-file rows for `src/adapters/externalBrowser.ts` in the HTML report
  under `app/coverage/` and state which source was used.
- **Typed-lint ratchet:** no new suppressions. `pnpm lint:prune` after
  removing any.
- **Records** (RF14): anything with a life after merge goes in ROADMAP, a
  ledger, DEVIATIONS or the spec **at the moment it is found**, never only in
  the PR body.
- **Comment sweep before finishing** (briefing): grep for comments describing
  what you just changed. Task 6 is that sweep and it is not optional — this PR
  withdraws a mechanism that four source files and one design page assert.
- **PR body shape** (CLAUDE.md, "Write for James first"): line one is
  **"This PR [outcome]"**; then ~6 bullets, one line each, ~120 words above the
  fold and ~25 words per bullet — **counted, not felt**. Everything else goes
  in a collapsed `<details>` block titled **"Record (for agents and audits)"**.
- **Agent gates, spoken rather than silent** (spec §7): the antagonist runs a
  **DELTA pass on PR B's spec** — already scoped, and §3.4's in-tree
  counter-claim is the ground it must cover. **No PM gate on PR B** (the slate
  gate covers the ordering; PR B changes no capability a tester receives, only
  which browser one already-shipped button opens). **No PM final-PR gate**:
  PR B is not TRIAD — no stored shape, no number's meaning, no auth.

---

## Paste-test receipt (agent briefing, "Plan authoring")

Every prescribed code block in Task 1 was extracted to its REAL path in this
worktree at head `39028c13` (`git status --short` empty before the placement
and again after the restore) and run through the repo's own gates.

| What | Result |
| --- | --- |
| `pnpm typecheck` with Task 1's `externalBrowser.ts`, `externalBrowser.test.ts` and the `linkFlow.ts` `await` removal in place | **PASS.** Last line: `E2E TypeScript membership: 20/20`. |
| `pnpm lint` on the same tree | **PASS**, no output, exit 0 (`eslint .` plus the suppression census). |
| `pnpm exec prettier --check` on the three files | **FAILED on the test file**, fixed with `--write`; the block in Task 1 is the **post-Prettier** text and now checks clean. `externalBrowser.ts` and `linkFlow.ts` were clean as written. |
| `NODE_OPTIONS=--no-experimental-webstorage pnpm exec vitest run --project client src/adapters/externalBrowser.test.ts src/adapters/linkFlow.test.ts src/log/Concept2SendBlock.test.tsx` | **`Test Files 3 passed (3)` · `Tests 57 passed (57)`.** Both summary lines read. |
| Task 1's prescribed mutation, applied to the prescribed implementation | **BIT.** See the proof contract below for the verbatim failure text. |
| `npm view @capacitor/app-launcher version` | `8.0.1` (re-measured 2026-09-04, refreshing spec §3.4). |
| `npm view @capacitor/app-launcher peerDependencies` | `{ '@capacitor/core': '>=8.0.0' }` — satisfied by our `@capacitor/core@8.5.0`. |
| `bash scripts/version.sh` | `VERSION=0.37.0` / `BUILD=854` / `DESCRIBE=v0.37.0-6-g39028c13` at this head. |
| `command -v agvtool` · `xcode-select -p` | `/usr/bin/agvtool` · `/Applications/Xcode.app/Contents/Developer` — so `pnpm ios:build` WILL print the stamp line rather than the skip warning. |

**What was NOT paste-tested, said plainly.** Two things, and neither could be:

1. **The file deletions** (`app/src/native/externalBrowser.ts`, and Task 4's
   `package.json` / `Package.swift` changes). Deleting a tracked file was not
   attempted for a plan-authoring dry run. What WAS established instead is the
   fact the deletion depends on:
   `grep -rn "native/externalBrowser" app/src app/e2e` returns seven hits and
   **no other file**: four in `app/src/adapters/externalBrowser.ts` (`:36` and
   `:54`, doc-comment references the prescribed replacement drops; `:60` and
   `:81`, the two dynamic imports Task 1 removes) and three in
   `app/src/adapters/externalBrowser.test.ts` (`:25`, `:48`, `:83`), which
   Task 1's rewritten test file drops. After Task 1 the module has **no
   importer**, which is the whole of L6's premise.
2. **The FALLBACK shape** (Task 3, Branch B). It needs `@capacitor/app-launcher`
   installed, and the standing rule is that a version is verified **at the
   moment of adding**, not from a plan written days earlier. Branch B's code is
   prescribed as a shape with its own paste-test as its first step. **It is
   the one block in this plan that has not been run.**

---

## Plan deviations / observations (RF10 — the spec against the code as read)

The brief is not automatically right. Ten things did not survive reading the
tree at `39028c13`, and four of them change what a task does.

1. **Gate 0 for PR B is ALREADY DRAWN AND ALREADY APPROVED. Do not
   re-present it.** Spec §4.3 says PR B's artifact "is the withdrawal … struck
   on the amendment page", and exit criterion B4 asks for it. **It is done:**
   `3fe5f2c2` added §7 (`PR B — the link-outs leave the app`, §7.1 "What the
   rower is looking at after the tap", §7.2 "What a rower loses by leaving"),
   struck the withdrawn sentence **inside 2c's own callout where it was
   argued** rather than beneath it, and `39028c13` records James's approval of
   that drawing (§2 ruling 7). Task 0 verifies and records; it presents
   nothing.
2. **§4.1's line citation is stale.** It cites the withdrawn sentence at
   `amendment-2026-09-03.html:2187-2190`. At head the withdrawal lives at
   `:2455-2465`, inside 2c's callout. Cite the callout, not the numbers — the
   page grew ~1993 lines at `3fe5f2c2` and every line number in the spec's §4
   moved with it.
3. **The `SFSafariViewController` census is SIX source files, not five.**
   `grep -rl SFSafariViewController app/src` (run at head) returns
   `src/adapters/externalBrowser.ts`, `src/api/useConcept2Link.ts`,
   `src/log/concept2Send.ts`, `src/log/Concept2SendBlock.tsx`,
   `src/monitor/Concept2LinkProbe.tsx`, `src/native/externalBrowser.ts` —
   **6**. Exit criterion B4 says five. Task 6 works from the measured six and
   the PR body states the new count against **6**, not 5.
4. **There is a FOURTH in-tree copy of the anchor counter-claim, and §4.2 does
   not name it.** §3.4 quotes `adapters/externalBrowser.ts:75-77` ("inside the
   Capacitor WebView a plain anchor drives the WebView ITSELF to concept2.com,
   with no way back"). The same testimony is restated as a JSX comment in a
   second file, `log/Concept2SendBlock.tsx:181-184`: _"A BUTTON, not an
   anchor: inside the Capacitor WebView a plain `<a href>` drives the WebView
   itself to concept2.com with no way back."_ CLAUDE.md's rule is explicit —
   **after withdrawing a claim, grep its PHRASING across every file that
   repeated it**, and correcting where a claim was ARGUED while leaving it
   where it was USED is the failure. Task 6 covers both.
5. **A LINT ERROR the spec does not mention, and it is the only compile-level
   consequence of the deletion.** Removing `openExternalUrl`'s dead native arm
   narrows its return type from `void | Promise<void>` to `void`. Its one
   production caller does `await openExternalUrl(authorizeUrl)`
   (`adapters/linkFlow.ts:330`), and `@typescript-eslint/await-thenable` is
   `"error"` in this repo (`app/eslint.config.js:50`). **`pnpm lint` goes red
   until that `await` comes off**, and the same applies to the two
   `await openReadOnlyUrl(…)` calls in `externalBrowser.test.ts`. Measured:
   with the `await`s removed, `pnpm typecheck` and `pnpm lint` are both green.
   Task 1 prescribes all three removals in the same commit.
6. **`Package.swift` is not hand-edited.** Spec §5.2 says the dependency is
   removed "from `app/ios/App/CapApp-SPM/Package.swift:19,32`". That file's
   own first line reads `// DO NOT MODIFY THIS FILE - managed by Capacitor CLI
   commands`. Task 4 edits `package.json`, runs `pnpm install`, then
   `npx cap sync ios`, and commits **what the CLI regenerates**. And
   `cap sync` copies `webDir` = `dist/client`, which is gitignored — so a
   `vite build` has to run first, or the sync fails on a missing input
   (the briefing's prerequisite-chain rule, which caught exactly this before).
7. **No CI job can catch a broken Commit 2 binary.** `.github/workflows/ci.yml`
   has no iOS build and no `Package.swift` validation (`:169-173` is
   `bash -n` on two shell scripts plus `ios-release.test.sh`). This is the
   evidence for §6.3's rule that the merge gate is the walk on the **final**
   build, and it is why Task 5 exists as its own task rather than a footnote.
8. **§3.4's parenthetical is false at this head.** It says "this worktree has
   no `node_modules` installed". It does. Both quoted Capacitor sites were
   re-read here, in the pinned 8.5.0 package
   (`node_modules/.pnpm/@capacitor+ios@8.5.0_@capacitor+core@8.5.0/node_modules/@capacitor/ios/Capacitor/Capacitor/WebViewDelegationHandler.swift`),
   and both match the spec's quotations verbatim: `createWebViewWith` at
   `:328-333`, and `decidePolicyFor`'s `!isApplicationNavigation,
   toplevelNavigation` → `UIApplication.shared.open` → `decisionHandler(.cancel)`
   at `:102-115`. The spec's §3.4 inference is confirmed as an accurate
   reading of the pinned source. **It is still an inference about WebKit**, not
   evidence about the phone.
9. **Our own dependency's source CONTRADICTS our own comment, and that is worth
   carrying into the walk.** `decidePolicyFor` cancels an outside-origin
   top-level navigation and hands it to `UIApplication.shared.open` — so under
   Capacitor 8.5.0 a plain `<a href="https://log.concept2.com/…">` should NOT
   drive the WebView to concept2.com. The comment at
   `adapters/externalBrowser.ts:75-77` asserts that it does. Either that
   testimony predates the pinned version, or it describes a case this read
   misses, or it was never measured. **W3 keeps its fourth NO outcome anyway** —
   a prediction our own tree makes is exactly the one that must have a slot, or
   it goes unobserved on the walk that exists to settle it.
10. **Two ROADMAP lines a probe pass falsifies, and neither is in the spec's
    reconciliation list.** `ROADMAP.md:842` names `@capacitor/browser` as
    PR1.5's mechanism, and `ROADMAP.md:901` says verbatim: _"`@capacitor/browser`
    stays for PR2's read-only link-out."_ On a pass that sentence is false.
    Task 6 reconciles both. (`docs/design/handoffs/2026-08-31-concept2-connect/README.md:143`
    also names the package, but as a record of PR1.5's *retired* arm — it is
    history and stands. `docs/design/DEVIATIONS.md` mentions neither the
    package nor the sheet: `grep -n "Browser\|sheet\|SFSafari"` returns
    nothing, so no row is owed there.)

---

## The proof contract for this PR's one new assertion (RF26)

Task 1 adds one behavioural assertion. RF26 requires its five-part contract
stated **before** it is built, and requires that no part of the PR overstate
what it proves.

1. **The production invariant.** `openReadOnlyUrl` sends the URL to a NEW
   browsing context (`openWebInNewTab`) and never to this document
   (`navigateWeb`), **regardless of platform** — there is no platform branch
   left to take.
2. **The supported producer and reachable ordering.** `log/Concept2SendBlock.tsx`
   calls `openReadOnlyUrl(url)` from a button's `onClick` on a rower's tap
   (`:189` for the result link, `:245` for the profile link). The test drives
   the adapter directly, which is the same entry point.
3. **The independent observable.** The `openWebInNewTab` / `navigateWeb`
   doubles injected through `vi.doMock("./webNavigate", …)` — a seam that
   exists solely so this can be observed (`adapters/webNavigate.ts`'s own
   header records why a same-module `vi.spyOn` does not work here).
4. **The deciding-source mutation and its expected failure.** Reintroduce a
   platform branch in `openReadOnlyUrl`:
   `if (isNative()) { navigateWeb(url); return; }`. **Run against the
   prescribed implementation, this bit:**

   ```
   FAIL  |client| src/adapters/externalBrowser.test.ts > openReadOnlyUrl (native) > opens a NEW context, never this document — the same destination on both platforms
   AssertionError: expected "vi.fn()" to be called once with arguments: [ Array(1) ]
   Number of calls: 0
   Test Files  1 failed (1)
        Tests  1 failed | 3 passed (4)
   ```

   The `(web)` case stayed green, which is the point: the new **native** half
   is what carries the contract, and the pre-existing web half could not have
   caught this.
5. **The strongest conclusion anything may state.** *"`openReadOnlyUrl` has no
   platform branch, and a reintroduced one fails the suite."* **NOT** "the
   link-out opens in Safari" — that is a claim about WebKit and iOS, and its
   only evidence is Task 3's walk. Spec, test title, code comments and PR body
   all stay inside this sentence.

---

## Task 0: Gate 0 — verify it is closed; present nothing

**Nothing to build. This task exists so the standing design gate is checked
rather than assumed, and so the next agent does not re-run an approved gate.**

- [ ] **Step 1.** Confirm the withdrawal is on the page, struck where it was
      argued rather than appended beneath: open
      `docs/design/handoffs/2026-08-31-concept2-connect/amendment-2026-09-03.html`
      and read 2c's callout (the paragraph beginning **"WITHDRAWN 2026-09-04,
      and replaced here rather than corrected beneath"**) and §7 with its two
      sub-sections. Confirm the page carries §7.1's four NO outcomes and the
      W0 precondition.
- [ ] **Step 2.** Confirm the approval:
      `git log --oneline -3` names `3fe5f2c2` (the drawing) and `39028c13`
      (James's ruling 7, "Approved the Gate 0 drawing at 3fe5f2c2").
- [ ] **Step 3.** Record in the task report: **Gate 0 CLOSED for PR B at
      `39028c13`. Nothing is presented; implementation may start.** If either
      step fails, **STOP** — the gate is a hard precondition, not a courtesy.
- [ ] **Step 4.** Note for the PR body's Record block: exit criterion B4's
      first half is satisfied at the base commit, not by this PR's diff. B4's
      second half — the code comments — is Task 6.

---

## Task 1: Commit 1 — delete the branch

**Files:** modify `app/src/adapters/externalBrowser.ts`,
`app/src/adapters/externalBrowser.test.ts`, `app/src/adapters/linkFlow.ts`;
delete `app/src/native/externalBrowser.ts`.

**This commit is what the walk tests.** It does NOT remove the dependency —
that is Task 4, on a separate commit and a separate binary (§6.3).

- [ ] **Step 1 (failing test first).** Replace
      `app/src/adapters/externalBrowser.test.ts` with the block below.
      Run it against the **unchanged** adapter and confirm it goes RED on the
      two native cases (the current adapter takes the dynamic-import branch,
      so neither `webNavigate` double is called). Record both summary lines.

  ```
  cd /Users/james/projects/github/jamesawesome/Ergomatic-wt-c2walk/app
  NODE_OPTIONS=--no-experimental-webstorage pnpm exec vitest run --project client src/adapters/externalBrowser.test.ts
  ```

  The test file, post-Prettier and exactly as paste-tested:

  ```ts
  import { afterEach, describe, expect, it, vi } from "vitest";

  // The web arm is NOT tested by calling the real `window.location.assign` —
  // jsdom throws "Not implemented: navigation (except hash changes)" the
  // moment that call is actually invoked, and a direct `vi.spyOn(window.
  // location, "assign")` fails outright with "TypeError: Cannot redefine
  // property: assign" (verified empirically against this repo's jsdom
  // version). A same-module `vi.spyOn` on this module's own call to a
  // co-located helper was tried first and also failed to intercept (the
  // real, unmocked navigation ran and threw) — Vitest/Vite's ESM transform
  // binds a same-file call to the local declaration, not the mutable exports
  // object. `webNavigate.ts` therefore exists as its own module purely so
  // `vi.doMock` — the established idiom for `../platform`/`../native/*` — can
  // replace it.
  //
  // **PR B: `../platform` is still mocked here, and that is the POINT.**
  // Neither export branches on platform any more, so each case below is run
  // with `isNative()` forced BOTH ways and asserts the SAME destination. A
  // reintroduced `isNative()` branch fails these tests rather than sliding
  // past them (mutation recorded in the PR body). No gate in this repo can
  // observe what the phone actually does with `window.open` — that is the
  // device walk's job, and only the walk's.
  afterEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
    vi.doUnmock("../platform");
    vi.doUnmock("./webNavigate");
  });

  describe.each([
    ["web", false],
    ["native", true],
  ])("openExternalUrl (%s)", (_label, native) => {
    it("navigates THIS document via webNavigate's navigateWeb, synchronously (no Promise)", async () => {
      vi.doMock("../platform", () => ({ isNative: () => native }));
      const navigateWeb = vi.fn();
      const openWebInNewTab = vi.fn();
      vi.doMock("./webNavigate", () => ({ navigateWeb, openWebInNewTab }));
      vi.resetModules();
      const { openExternalUrl } = await import("./externalBrowser");

      const result = openExternalUrl("https://log.concept2.com/oauth/authorize");

      expect(result).toBeUndefined();
      expect(navigateWeb).toHaveBeenCalledExactlyOnceWith(
        "https://log.concept2.com/oauth/authorize",
      );
      expect(openWebInNewTab).not.toHaveBeenCalled();
    });
  });

  describe.each([
    ["web", false],
    ["native", true],
  ])("openReadOnlyUrl (%s)", (_label, native) => {
    it("opens a NEW context, never this document — the same destination on both platforms", async () => {
      vi.doMock("../platform", () => ({ isNative: () => native }));
      const navigateWeb = vi.fn();
      const openWebInNewTab = vi.fn();
      vi.doMock("./webNavigate", () => ({ navigateWeb, openWebInNewTab }));
      vi.resetModules();
      const { openReadOnlyUrl } = await import("./externalBrowser");

      const result = openReadOnlyUrl(
        "https://log-dev.concept2.com/profile/2211/log/339",
      );

      expect(result).toBeUndefined();
      expect(openWebInNewTab).toHaveBeenCalledExactlyOnceWith(
        "https://log-dev.concept2.com/profile/2211/log/339",
      );
      expect(navigateWeb).not.toHaveBeenCalled();
    });
  });
  ```

  **Why `../platform` is still mocked in a file whose subject no longer reads
  it:** the mock is the mutation's landing pad. Forcing `isNative()` both ways
  and asserting one destination is what makes a reintroduced branch fail. A
  test that simply stopped mocking platform would pass with the branch back in
  under Vitest, where `isNative()` is always `false` — RF21's exact shape.

- [ ] **Step 2 (implement).** Replace `app/src/adapters/externalBrowser.ts`
      with the block below, and **delete `app/src/native/externalBrowser.ts`**.
      Before deleting, confirm the module has no other importer:

  ```
  cd /Users/james/projects/github/jamesawesome/Ergomatic-wt-c2walk
  grep -rn "native/externalBrowser" app/src app/e2e
  ```

  Measured at head: seven hits, all in two files —
  `app/src/adapters/externalBrowser.ts` at `:36`, `:54` (doc-comment
  references dropped by this step's replacement) and `:60`, `:81` (the two
  dynamic imports this step removes), and `app/src/adapters/externalBrowser.test.ts`
  at `:25`, `:48`, `:83`, which Step 1's rewrite already dropped.
  **If a hit appears in any THIRD file, STOP** — the premise of L6 has
  changed.

  ```ts
  // Wave E PR1.5, narrowed at PR1.75b and again at PR2's walk fallout (PR B):
  // opens an external URL for the rower. Two exports, one per intent, and
  // NEITHER branches on platform any more.
  //
  // `openExternalUrl` serves the OAuth consent hop, and `adapters/linkFlow.ts`'s
  // WEB arm is its only consumer (a full-page navigation to Concept2's consent
  // screen, whose outcome is read from `GET /api/concept2/link` on the next
  // mount). The native link never reached it: `linkFlow.ts` completes that leg
  // through `ASWebAuthenticationSession` (PR1.75b), so this function's native
  // arm was dead code from that PR onward and is gone.
  //
  // `openReadOnlyUrl` serves the read-only link-outs the rower comes BACK from
  // — `log/Concept2SendBlock.tsx`'s "View on Concept2 →" and "OPEN CONCEPT2
  // PROFILE". It used to take `@capacitor/browser`'s `Browser.open` on native,
  // which is `SFSafariViewController` — a sheet with its OWN cookie jar. James
  // walked it on 2026-09-03 and the sheet, signed out, rendered Concept2's
  // "The user has made this result private" page instead of the row he had
  // just sent. **Both arms are now the same arm:** `window.open(url, "_blank",
  // "noopener,noreferrer")`, which inside the Capacitor WebView is handed to
  // the system by `@capacitor/ios`'s own `WebViewDelegationHandler` and opens
  // in the phone's default browser, where the rower's Concept2 session lives.
  // James's ruling, 2026-09-04: "opening in safari is fine because it will be
  // clear you're changing apps."
  //
  // **This file has NO platform conditional and must not regrow one.** The
  // only evidence that the WebView hands the URL to the system is a device
  // walk — `isNative()` is false under Vitest and Playwright, so no gate in
  // this repo can observe it. See `docs/monitor/sessions/<the PR B walk>/`.

  import { navigateWeb, openWebInNewTab } from "./webNavigate";

  /**
   * Opens `url` for the rower to complete the Concept2 OAuth consent screen.
   * Plain navigation: this document leaves for Concept2 and the outcome is
   * read back from `GET /api/concept2/link` on the next mount. Its only
   * consumer is `adapters/linkFlow.ts`'s WEB arm.
   */
  export function openExternalUrl(url: string): void {
    navigateWeb(url);
  }

  /**
   * Opens `url` for a READ-ONLY look the rower comes back from — PR2's
   * "View on Concept2" link-out. Distinct from `openExternalUrl` above:
   * that one navigates THIS document (correct for the OAuth hop, where the
   * app is meant to leave) and would throw the rower out of the app with the
   * log row lost; this one opens a new context and leaves Ergomatic mounted
   * behind it.
   */
  export function openReadOnlyUrl(url: string): void {
    openWebInNewTab(url);
  }
  ```

  **The `<the PR B walk>` placeholder is filled in at Task 6**, with the real
  session directory name, once the walk has produced one. Do not leave a
  placeholder in the merged tree.

- [ ] **Step 3 (the lint consequence — observation 5).** `openExternalUrl` now
      returns `void`, so `await openExternalUrl(authorizeUrl)` violates
      `@typescript-eslint/await-thenable` (`app/eslint.config.js:50`, `"error"`).
      Confirm the anchor is unique, then remove the `await`:

  ```
  cd /Users/james/projects/github/jamesawesome/Ergomatic-wt-c2walk/app
  grep -c "await openExternalUrl(authorizeUrl);" src/adapters/linkFlow.ts
  ```

  Measured at head: **1**. If it is not 1, stop and re-anchor (RF22's
  duplicate-line corollary). `adapters/linkFlow.ts:330` becomes
  `openExternalUrl(authorizeUrl);` — the surrounding `if (!native) { … return
  { kind: "navigating" }; }` is unchanged, and `linkFlow.test.ts:561-594`
  (which mocks `openExternalUrl` as a plain `vi.fn()`) passes untouched.

- [ ] **Step 4 (gates).** One command per line, each reported with its own
      result. Expected values are the paste-test's measured ones.

  ```
  cd /Users/james/projects/github/jamesawesome/Ergomatic-wt-c2walk/app
  pnpm typecheck
  pnpm lint
  pnpm format:check
  NODE_OPTIONS=--no-experimental-webstorage pnpm exec vitest run --project client src/adapters/externalBrowser.test.ts src/adapters/linkFlow.test.ts src/log/Concept2SendBlock.test.tsx
  pnpm test --project unit --project client
  pnpm e2e
  ```

  `pnpm e2e` is required by the briefing's `app/src/` row (RF1) and by
  exit criterion B6. **`app/e2e/concept2.spec.ts:483-508` must stay green** —
  and Task 7's PR body must say that staying green proves nothing about this
  change.

- [ ] **Step 5 (commit — the real change BEFORE the probe, RF22).**
      `git rev-parse --show-toplevel` and confirm it prints the worktree path.
      Then commit Steps 1-3 together.

- [ ] **Step 6 (the mutation, against the committed tree).** Confirm the
      anchor is unique, apply, run, record the exact failure text, then
      `git checkout --` the file (a no-op revert, because Step 5 committed
      first — check `git status` before the checkout regardless).

  ```
  cd /Users/james/projects/github/jamesawesome/Ergomatic-wt-c2walk/app
  grep -c "  openWebInNewTab(url);" src/adapters/externalBrowser.ts
  ```

  Expected: **1**. Mutation: insert
  `if (isNative()) { navigateWeb(url); return; }` at the top of
  `openReadOnlyUrl`, with the `import { isNative } from "../platform";` it
  needs. Expected failure — measured, verbatim, in the proof contract above:
  `openReadOnlyUrl (native)` fails with
  `expected "vi.fn()" to be called once with arguments: [ Array(1) ] / Number of calls: 0`,
  `Tests 1 failed | 3 passed (4)`. **The `(web)` case stays green**; record
  that too, because it is the evidence that the pre-existing half could not
  have caught this.

- [ ] **Step 7 (per-file coverage, RF2).** Run `pnpm test:coverage`, open
      `app/coverage/index.html`, read the row for
      `src/adapters/externalBrowser.ts`, and state the four numbers and which
      source you used (the HTML report is authoritative; the text reporter
      omits directories).

---

## Task 2: Write the walk card, and check it against James's shell

**The walk is the gate, so the card is a deliverable, not a note.** RF13: an
instruction handed to James is a claim about the system and gets the same
evidence bar as any other. Card text is in Task 3; this task is the checking.

- [ ] **Step 1.** Write Task 3's card to
      `docs/superpowers/plans/2026-09-04-concept2-prb-walk.md` (absolute path,
      RF20).
- [ ] **Step 2 (RF13 pre-flight table).** Every command in the card is RUN or
      the code that serves it is READ, at the branch's current head, and the
      results go in a pre-flight table at the foot of the card — the shape
      `2026-09-02-concept2-pr175b-walk.md` uses. At minimum:
      `package.json`'s `ios:build` line and both env mappings;
      `scripts/ios-version.sh`'s stamp line and its `agvtool`/`xcode-select`
      guard; `bash scripts/version.sh`'s current output; `command -v agvtool`;
      and the exact strings the card asks James to read, each with its
      `file:line`.
- [ ] **Step 3 (HIS shell).** Every block is **bash** — `export FOO=...` and
      `VAR=value cmd` are not fish, and fish is his default shell. The card
      says so in a blockquote under its title and nothing in it is translated
      on the fly.
- [ ] **Step 4 (what the commands WRITE, not only what they print).**
      `pnpm ios:build` ends in `scripts/ios-version.sh`, which runs `agvtool`
      and rewrites **two TRACKED files**: `app/ios/App/App.xcodeproj/project.pbxproj`
      and `app/ios/App/App/Info.plist`. The card names them, names who restores
      them (the implementer, before any commit), and gives the exact
      `git restore` line. Never commit version stamps.
- [ ] **Step 5 (the precondition that makes a NO possible).** Confirm the card
      carries W0 and states why: without a Safari session at the logbook host,
      *"opened signed in"* cannot be told apart from *"opened in a sheet"*, and
      every observation below it is decoration.

---

## Task 3: The device walk — the probe, and the branch on its answer

**This task is a precondition, not a verification.** Tasks 4 and 5 do not
exist until W3 answers. Present the card and STOP; do not predict the outcome
in any record written before the walk runs.

### The walk card

> **Run every block in `bash`** — type `bash`, paste, and `exit` when done.
> These are bash snippets and this machine's default shell is fish, which
> rejects them. Nothing here is fish-compatible.

**What this proves:** that tapping a Concept2 link-out on the phone opens the
phone's default browser, signed in, on the rower's own row. **Nothing in this
repo's gates can reach it:** the unit tests mock the adapter, `src/native/**`
is coverage-exempt, `pnpm e2e` runs the web arm, and CI never builds the app.
This card is the whole instrument.

**No erg. No rowing budget. ~10 minutes.** Phone, Xcode, and a Concept2
account already linked in the app with at least one row already sent.

**All commands run from
`/Users/james/projects/github/jamesawesome/Ergomatic-wt-c2walk`.**

#### W0 — the precondition, BEFORE the build is launched

Ergomatic's link-outs are built from the **server's own** `logbookBaseUrl`
(`api/useConcept2Link.ts`), so the host depends on what this deployment's
`C2_BASE_URL` is pointed at — `server/index.ts:124` defaults it to
`https://log-dev.concept2.com`. **Read the host off the app rather than
assuming it:** on the CURRENT installed build, open a sent row's log detail
and note which origin `View on Concept2 →` goes to.

Then, in **mobile Safari — not the app** — open **that** host, and confirm the
rower is signed in.

**This is the discriminator.** If Safari has no session, "opened signed in"
cannot be told apart from "opened in a sheet", and W4 cannot fail honestly.
**Record that this was checked, and which host.**

#### The build

```
cd /Users/james/projects/github/jamesawesome/Ergomatic-wt-c2walk/app
export GOOGLE_IOS_CLIENT_ID="$(bash scripts/ios-google-client-id.sh ios/App/App/Info.plist)"
pnpm ios:build
pnpm ios:open
```

Then Run to the phone from Xcode.

- **No tunnel, no local Postgres, no `.env`.** PR B is a client-only change;
  the server is untouched. `pnpm ios:build` defaults `VITE_API_BASE` to
  `https://ergomatic.waffle.haus` (`package.json`'s `ios:build` line), which is
  the deployment the shipped surface already runs on and the one James walked
  on 2026-09-03 and 2026-09-04.
- **`GOOGLE_IOS_CLIENT_ID` does not fail loudly if unset** — `package.json`
  defaults it to empty and the build SUCCEEDS with a bundle whose native
  Google sign-in is silently dead. The `export` line above is not optional.
- **Watch for `ios-version: stamped <VERSION> (<BUILD>)`** — that line is the
  success signal for the last step. At head `39028c13` `bash scripts/version.sh`
  prints `VERSION=0.37.0 BUILD=854`; `BUILD` is `git rev-list --count HEAD`, so
  it moves with every commit on the branch. It rewrites two TRACKED files
  (`App.xcodeproj/project.pbxproj`, `App/Info.plist`) — expected, and restored
  before anything is committed.
- **Do not release this build.**

#### The seven checks

- [ ] **W1.** Ergomatic → **You** → the Concept2 card reads **`LINKED ✓`**.
      *(This is the base build's surface. PR A moves it behind a row; PR A is
      not in this PR and the card is still on You.)*
- [ ] **W2.** Open the log detail of a row already sent to Concept2. The
      CONCEPT2 block reads **`SENT`** with **`RESULT <id>`**.
- [ ] **W3.** Tap **View on Concept2 →**. **Observe which app is now in
      front, and record which of five things happened.**

  - **PASS = Safari.** URL bar, tab bar, and a **`← Ergomatic`** chip at the
    top left.
  - **NO (a):** the sheet appears anyway — a **`Done`** button at the top
    left, no tab bar, no URL bar.
  - **NO (b):** nothing happens at all (WebKit dropped the `noopener`
    `window.open`).
  - **NO (c):** a different app opens.
  - **NO (d):** **the Ergomatic WebView ITSELF navigates to concept2.com,
    with no way back.** This is the outcome our own tree predicts for a plain
    anchor (`adapters/externalBrowser.ts:75-77`) — unmeasured testimony that
    Capacitor 8.5.0's own `decidePolicyFor` appears to contradict, which is
    exactly why it gets a slot rather than a dismissal.

  **"It didn't open Safari" is not a record. Which of the five happened is.**
  Take a photograph or a screen capture.

- [ ] **W4.** Read the page that loaded. **PASS = the actual result** — the
      row's own numbers. **FAIL = "The user has made this result private"**,
      which is the walk's original symptom and means the cookie jar is still
      wrong.
- [ ] **W5.** Return to Ergomatic via the top-left chip. **Record what is on
      screen:** the log row still showing `SENT` / `RESULT <id>` (warm return),
      or Today (cold relaunch — iOS reclaimed the app). **Both are acceptable
      outcomes**; the point is to record which one a real return produces,
      because the approved design page §7.2 promises the first.
- [ ] **W6.** On that return, confirm the CONCEPT2 block is **still rendered**
      and has not been replaced by nothing. `useConcept2Link` re-reads
      `GET /api/concept2/link` on every foreground transition
      (`api/useConcept2Link.ts:200-215` — one effect registering `pageshow`
      and `visibilitychange`, each calling `reload()`), and a failed read makes
      `Concept2SendBlock` render `null` (`:77-79`). If it flickers, record it —
      **pre-existing behaviour that PR B makes more frequent**, not something
      PR B introduces.
- [ ] **W7 — the second call site, honestly scoped.** The no-weight refusal
      cannot be provoked at will on an account whose weight class Concept2
      already knows. **If it cannot be reached, do not claim it walked.** It
      shares one function with W3 (`Concept2SendBlock.tsx:189` and `:245` both
      call `openReadOnlyUrl`) and that identity is an INFERENCE from a two-line
      read — record it as one. If it *can* be reached, tap
      `OPEN CONCEPT2 PROFILE` and record whether the id-less `/profile` lands
      on the rower's own account now that Safari carries the session.

#### Afterwards

```
cd /Users/james/projects/github/jamesawesome/Ergomatic-wt-c2walk
git diff --stat -- app/ios
```

That must show ONLY `project.pbxproj` and `Info.plist` (the version keys).
Then:

```
git -C /Users/james/projects/github/jamesawesome/Ergomatic-wt-c2walk restore app/ios/App/App.xcodeproj/project.pbxproj app/ios/App/App/Info.plist
```

Never commit version stamps.

### Recording the walk

- [ ] Create `docs/monitor/sessions/walk-<YYYY-MM-DD>-c2-linkout/README.md`
      (the date it actually ran) and commit: the build's head SHA, W0's host
      and its signed-in check, W1-W7 each with PASS/FAIL/NOT-REACHED, **which
      of the five W3 outcomes occurred**, the W3 photograph, the W4 page, and
      W5's warm-or-cold answer. This directory is exit criterion B1's evidence
      and RF14's home for it — not the PR body.

### The branch

- [ ] **Branch A — W3 = Safari and W4 = the result. PASS.** Proceed to
      Task 4. The probe's inference is now an observation, and
      `@capacitor/browser` has no consumer.

- [ ] **Branch B — any of NO (a)-(d), or W4 shows the privacy page. FAIL.**
      **Task 4 is CANCELLED** (L6's premise is false — a branch survives, so
      the plugin may still be needed) and this PR becomes the fallback shape:

  1. **Verify the version at the moment of adding, not from this plan.**
     `npm view @capacitor/app-launcher version` and
     `npm view @capacitor/app-launcher peerDependencies`. Measured 2026-09-04:
     `8.0.1` and `{ '@capacitor/core': '>=8.0.0' }`, satisfied by
     `@capacitor/core@8.5.0`. **Re-run both.**
  2. Restore an `isNative()` branch in `openReadOnlyUrl` — **in the adapter
     layer only** (L5) — over a new `src/native/appLauncher.ts` wrapper
     reached by dynamic `import()`, following the idiom
     `src/native/keepAwake.ts` and `appLifecycle.ts` already set, including
     the `v8 ignore` block every file in that directory carries.
  3. The branch carries a comment naming **the WebKit behaviour that forced
     it and citing the walk that observed it** (exit criterion B2's second
     half), with the NO outcome recorded by letter.
  4. Add the plugin to `app/package.json`, `pnpm install`, `pnpm build`,
     `npx cap sync ios`, commit the regenerated `Package.swift`.
  5. **Re-walk from W1.** A new plugin is a new binary.
  6. Task 1's test grows a native case asserting the launcher wrapper is
     reached and `openWebInNewTab` is not — with its own mutation, its own
     recorded failure text, and its own **paste-test**, because this branch's
     code is the one block in this plan that was never run.
  7. Task 6's reconciliation shrinks: the two ROADMAP lines about
     `@capacitor/browser` stay true, and the census target changes.

  **This branch is a real outcome, not a contingency to skim.** Whichever one
  runs, the PR body says which and why.

---

## Task 4: Commit 2 — the dependency loses its last consumer

**Branch A only. Skip entirely on Branch B.**

**Files:** delete nothing further under `src/`; modify `app/package.json`,
`app/pnpm-lock.yaml`, `app/ios/App/CapApp-SPM/Package.swift` (regenerated,
never hand-edited).

- [ ] **Step 1 (prove there is no consumer, in both directions).**

  ```
  cd /Users/james/projects/github/jamesawesome/Ergomatic-wt-c2walk
  grep -rn "@capacitor/browser" app/src app/e2e
  grep -rn "Browser.open\|from \"@capacitor/browser\"" app/src
  ```

  Both must return **nothing** after Task 1. Paste the actual output (the
  briefing's rule: for every "grep X finds nothing" sentence, paste the
  output and name any hit that does not count).

- [ ] **Step 2 (remove it).** Delete the `"@capacitor/browser": "^8.0.4"` line
      from `app/package.json` (measured at head: `package.json:38`). Then, one
      command per line:

  ```
  cd /Users/james/projects/github/jamesawesome/Ergomatic-wt-c2walk/app
  pnpm install
  pnpm build
  npx cap sync ios
  ```

  **`pnpm build` is not optional and is not a gate here** — `cap sync` copies
  `webDir`, which `capacitor.config.ts` sets to `dist/client`, and that path
  is gitignored. Without a build the sync has no input (the briefing's
  prerequisite-chain rule).

- [ ] **Step 3 (confirm the CLI, not you, removed it).**

  ```
  cd /Users/james/projects/github/jamesawesome/Ergomatic-wt-c2walk
  git diff -- app/ios/App/CapApp-SPM/Package.swift
  grep -rn "@capacitor/browser\|CapacitorBrowser" app/package.json app/ios
  ```

  The diff must show exactly two lines gone — the `.package(name:
  "CapacitorBrowser", …)` dependency (measured at head: `Package.swift:19`)
  and the `.product(name: "CapacitorBrowser", …)` target entry (`:32`) — and
  the grep must return nothing. **If `Package.swift` is unchanged, the sync
  did not run against the new `node_modules`; do not hand-edit it.** Its first
  line reads `// DO NOT MODIFY THIS FILE - managed by Capacitor CLI commands`.

- [ ] **Step 4 (exit criterion B3's own grep, verbatim).**

  ```
  cd /Users/james/projects/github/jamesawesome/Ergomatic-wt-c2walk
  grep -rn '@capacitor/browser' app/src app/package.json app/ios
  ls app/src/native/externalBrowser.ts
  ```

  First returns nothing; second reports the file does not exist.

- [ ] **Step 5 (gates).** Full set again — a lockfile and a native manifest
      changed, and `pnpm build` ran:

  ```
  cd /Users/james/projects/github/jamesawesome/Ergomatic-wt-c2walk/app
  pnpm typecheck
  pnpm lint
  pnpm format:check
  pnpm test --project unit --project client
  pnpm build
  pnpm dist:grep
  pnpm e2e
  ```

  `pnpm dist:grep` is CI's own step right after `pnpm build`
  (`.github/workflows/ci.yml:71-77`) and is run here for the same reason.
  **It says nothing about which browser a chunk opens** — do not report it as
  evidence for this change.

- [ ] **Step 6 (commit).** `git rev-parse --show-toplevel` first. This is
      **Commit 2**, separate from Task 1's, because §6.3 requires the walk on
      the final build and a walk of Commit 1 says nothing about Commit 2's
      binary.

---

## Task 5: Re-walk W1-W4 on the rebuilt binary

**Branch A only, and it is the merge gate** (§6.3: *"The merge gate is the
walk on the final build."*). Nothing in CI builds this binary, so nothing else
can tell us the app still launches with the plugin gone.

- [ ] **Step 1.** Rebuild and re-run to the phone with Task 3's build block,
      on the Commit-2 tree.
- [ ] **Step 2.** Re-run **W1-W4 only**. W5-W7 are unchanged by a dependency
      removal and are not re-run; say so rather than leaving it implied.
- [ ] **Step 3.** **The three things that could break here and nowhere else:**
      (a) the app fails to launch — an SPM target referencing a package the
      manifest no longer carries; (b) the app launches but You never reaches
      `LINKED ✓` — a plugin bridge that failed to register; (c) W3 opens
      nothing — the removal took something the WebView path needed. Each is a
      NO with its own name, and each ends the PR in its current shape.
- [ ] **Step 4.** Append the re-walk to the same
      `docs/monitor/sessions/walk-<date>-c2-linkout/README.md`, under its own
      heading, naming the Commit-2 SHA. Exit criterion B3 requires the
      **rebuilt** app to have been re-walked; a record that does not name which
      build it walked does not satisfy it.

---

## Task 6: Reconciliation — the comments, the records, the phrase sweep

**Comments-and-docs only, so the gate scope is lint · typecheck ·
format:check** (briefing's table). This task is where exit criterion B4's
second half lands, and it is not optional: this PR withdraws a mechanism that
**six source files** assert.

- [ ] **Step 1 (the census, measured not remembered).**

  ```
  cd /Users/james/projects/github/jamesawesome/Ergomatic-wt-c2walk
  grep -rn SFSafariViewController app/src
  grep -rln SFSafariViewController app/src
  ```

  At head `39028c13` the second returns **6 files** (see observation 3 — the
  spec's B4 says five). After Task 1, `src/native/externalBrowser.ts` and two
  of `src/adapters/externalBrowser.ts`'s three hits are already gone with the
  files and header they lived in. **The PR body states the new count and
  accounts for every survivor by name.**

- [ ] **Step 2 (`log/Concept2SendBlock.tsx:222-225`).** Current text, verbatim:
      _"On native the link-out is `SFSafariViewController`, which RETURNS to
      the app onto a still-mounted block, so `Send again` is the affordance the
      return lands on."_ **The conclusion survives and the premise does not**
      (spec §4.2): `Send again` stays — a state that tells the rower to fix
      something on Concept2 and offers no way to finish is worse than useless —
      but the reason is no longer "the sheet dismisses back onto a mounted
      block". Rewrite it to what the approved page §7.2 establishes: on a warm
      return the app is backgrounded rather than navigated, so the block is
      still mounted; on a cold relaunch the rower lands on Today and the row is
      still in the log, un-sent, with Send reachable from its detail screen.

- [ ] **Step 3 (`log/Concept2SendBlock.tsx:181-184` — the fourth instance the
      spec does not name; observation 4).** The JSX comment above the result
      link-out repeats the anchor testimony: _"A BUTTON, not an anchor: inside
      the Capacitor WebView a plain `<a href>` drives the WebView itself to
      concept2.com with no way back."_ The approved page labels that claim
      TESTIMONY rather than measurement. **Bring this comment into line with
      the one it cites** — a `<button>` is still right (a click handler, not a
      navigation, is what `openReadOnlyUrl` needs), and after the walk the
      comment can say what was actually observed instead of what was asserted.
      Cite the walk record.

- [ ] **Step 4 (`log/concept2Send.ts:96-101`).** The premise **INVERTS**
      (spec §4.2): _"signing in is the likely case, because the native arm
      opens `SFSafariViewController`, whose website data has been isolated from
      Safari since iOS 11."_ In Safari the rower's Concept2 session is present,
      so signing in becomes the **unlikely** case. **The conclusion holds and
      gets stronger** — target the id-less `{origin}/profile`, never
      `/profile/{id}`: signed in, the id-less path is the rower's own profile;
      signed out, it 302s to `/login` and lands there after. **Correct the
      sentence; do not change the constant.** The `PROVISIONAL` note about
      which page carries the weight fields stays — W7 is the chance to settle
      it, not this PR's job.

- [ ] **Step 5 (`api/useConcept2Link.ts:74-81`).** _"a RELATIVE url, which the
      web arm opens as a new tab on ERGOMATIC's own origin and the native arm
      hands to `SFSafariViewController` as a bare path."_ **After PR B both
      arms are the same arm.** The degradation of `""` to `null` is still
      right; only the mechanism half of the sentence is stale.

- [ ] **Step 6 (`monitor/Concept2LinkProbe.tsx:11`).** **Leave it.** It names
      the sheet as a record of a **retired** PR1.5 card ("Its PR1.5 ancestor
      was the opposite — it opened … in `SFSafariViewController`"). It is
      history and it stands. Name it in the PR body as an accounted survivor.

- [ ] **Step 7 (ROADMAP — observation 10, Branch A only).** Reconcile in
      place, never appended beneath a contradiction:
      **`ROADMAP.md:901`** says verbatim _"`@capacitor/browser` stays for PR2's
      read-only link-out."_ That is false after this PR. **`ROADMAP.md:842`**
      names the package as PR1.5's mechanism — check whether it reads as
      history or as a live claim, and correct it if the latter. Wrap by hand
      to match the surrounding text: **root markdown is not Prettier-formatted
      and running `prettier --write` on `ROADMAP.md` reflows the whole file.**

- [ ] **Step 8 (the ROADMAP row the spec says is owed).** Spec §10: *"The
      **three** PRs take their rows in the Wave E block when the first one
      opens; that is owed."* **PR B is the first one.** Add the three rows to
      the Wave E block in this PR — RF17's exact failure is a phase whose
      roadmap learns about it only when a gate demands it.

- [ ] **Step 9 (the phrase sweep, CLAUDE.md's own rule).** After withdrawing a
      claim, grep its **phrasing** across every file that repeated it — the
      withdrawn words themselves — and reconcile each hit or state why it
      stands:

  ```
  cd /Users/james/projects/github/jamesawesome/Ergomatic-wt-c2walk
  grep -rn "no way back" app/src
  grep -rn "still on screen" app/src docs/design ROADMAP.md
  grep -rn "SFSafariViewController" app/src docs/design ROADMAP.md
  grep -rn "@capacitor/browser" app/src app/package.json app/ios ROADMAP.md docs/design
  ```

  **Measured at head, and the result is a warning about the method itself.**
  `grep -rn "no way back" app/src` returns FOUR hits, of which **three are
  unrelated** (`src/index.css:4916` and `src/session/Timer.tsx:1001`, both
  about a foot strap; `src/monitor/useMonitorSession.ts:334`, about
  `frameSilence`) — name them as non-hits rather than letting the count stand.
  Exactly ONE is this PR's subject: `src/adapters/externalBrowser.ts:77`.
  **And the grep MISSES the fourth instance entirely** — Step 3's JSX comment
  at `Concept2SendBlock.tsx:181-184` wraps the phrase across two comment lines
  ("with no way / back"), so a line grep cannot see it. That is why Step 3
  names it by hand, and it is the reason a phrase census in this repo
  normalises comment leaders and whitespace rather than trusting a line
  grep.

- [ ] **Step 10 (the placeholder).** Fill `<the PR B walk>` in
      `adapters/externalBrowser.ts`'s header with the real session directory
      name. `grep -rn "<the PR B walk>" app/src` must return nothing.

- [ ] **Step 11 (gates).**

  ```
  cd /Users/james/projects/github/jamesawesome/Ergomatic-wt-c2walk/app
  pnpm lint
  pnpm typecheck
  pnpm format:check
  ```

---

## Task 7: Final gates, the PR, and the release call

- [ ] **Step 1 (merge main first).** `git merge origin/main` on the branch,
      resolve, and re-run the gates on the merged tree. A parallel PR has cost
      a full review round here before (briefing's pre-re-review checklist).
- [ ] **Step 2 (the whole gate, regardless of task scope).**

  ```
  cd /Users/james/projects/github/jamesawesome/Ergomatic-wt-c2walk/app
  pnpm lint
  pnpm typecheck
  pnpm format:check
  pnpm test --project unit --project client
  pnpm build
  pnpm dist:grep
  pnpm e2e
  ```

- [ ] **Step 3 (RF28 — main's own CI, not just the PR's).**
      `gh run list --branch main --limit 5` and say which conclusion main's
      most recent run reached. A PR's green checks say nothing about the run
      its merge produces, and main was red for eleven hours across six merges
      while every PR check was green.
- [ ] **Step 4 (the PR body).** Line one **"This PR [outcome]"**, then ~6
      bullets, ~120 words above the fold, ~25 words per bullet — **counted**.
      Everything else in a collapsed `<details>` titled **"Record (for agents
      and audits)"**. It must contain:
  - **Exit criterion B5, in the PR's own words:** no CI gate on this repo can
    go red on this change; `app/e2e/concept2.spec.ts:483-508` stays green
    while proving nothing about it; the walk is the only evidence. **A claim
    of "gated" here is a false claim.**
  - **B7:** which of the five W3 outcomes occurred, or PASS with the evidence
    that distinguishes Safari from the sheet.
  - **B1:** the walk record's path, including W0's precondition check, the W3
    capture and the W4 page.
  - **B2 / B3:** the `grep` outputs, verbatim.
  - **B4:** the new `SFSafariViewController` count with every survivor named,
    and the note that the design-page withdrawal was already approved at the
    base commit (Task 0) rather than done by this diff.
  - **B6:** the gate results, and **`pnpm screenshots` NOT run**, with the
    reason — no screen's layout changes.
  - The mutation, its exact failure text, and the fact that the `(web)` case
    stayed green.
  - The five-part proof contract, and the sentence naming the strongest
    conclusion anything in this PR may state.
  - **A risk note:** the one thing a reviewer should probe — that
    `openReadOnlyUrl`'s behaviour on a phone is attested by exactly one walk,
    by one person, on one iOS version, and that a future Capacitor bump could
    change `WebViewDelegationHandler` under us with no test to notice.
- [ ] **Step 5 (present and STOP).** **No merge without James's explicit
      approval.** Green CI and a clean review are necessary and not sufficient.
      Do not remove the worktree.
- [ ] **Step 6 (after merge — both halves, in one breath).**
  - **TestFlight release recommendation** (docs/RELEASING.md): "recommended:
    <reasons>" or "not needed". This is rower-visible on the phone and only on
    the phone, so it is a strong candidate for a build.
  - **Agent-config check** (CLAUDE.md, non-fast-path merges): say explicitly
    "agent configs updated: <what>" or "no change needed: <why>". Two
    candidates this PR has already generated: an antagonist-ledger entry on
    **an in-tree comment as an unmeasured counter-claim that outlived its own
    dependency's source**, and a CLAUDE.md/RF note on **a change whose only
    instrument is a walk** — how to write a plan whose spine is a walk rather
    than a suite.

---

## Self-review

Before reporting done, check each of these and say so:

- [ ] Every gate command was run one per line, each result reported. No `&&`,
      no `||`.
- [ ] Every mutation anchor was grepped first and returned exactly one hit;
      every mutation's failure text is recorded verbatim.
- [ ] `git rev-parse --show-toplevel` printed the worktree path before every
      commit.
- [ ] `git status` on the MAIN checkout is clean (RF20 — five stray writes
      have happened).
- [ ] No file under `app/src/you/`, no new route, no copy string changed.
- [ ] The PR body's above-the-fold section was **counted** (~120 words,
      ~25/bullet), not judged.
- [ ] Nothing anywhere in the tree claims this change is gated by CI.
- [ ] The walk record names which build each leg walked.
