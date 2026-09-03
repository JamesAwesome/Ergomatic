# Wave E PR2 — the rower-facing Concept2 surface (implementation plan)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Hardened 2026-09-03** (`.claude/skills/harden/SKILL.md`): both lenses and both paste-test placements are folded. Every prescribed block below has been placed at its real path and run — see the receipt.

**Revised 2026-09-03 (second revision), after an antagonist pass broke the first one's premise and a live measurement supplied a better producer.** Ruling (i) stands unchanged — **the app asks nothing about weight class, anywhere** — but WHERE the class comes from has changed, and that is the whole of this revision.

The first revision derived the class from the linked profile's `weight` + `gender`. Concept2's own help says that is not how the class is produced (observation 26, quoted verbatim there): _"Even though you may have entered a weight in your profile, you must designate L or H for every piece that you enter."_ The class is the rower's **declaration**. So the send path now reads the rower's own most recent declaration first, and derives from the profile only when there is none to read (observation 27's measurement made that possible: every result Concept2 returns carries `weight_class`, and one small page is a single 221 ms round trip).

Three consequences run through the whole plan. **The producer order is 1) the rower's latest declaration, 2) our derivation from the profile, 3) refuse** — with a plausibility band on the raw profile number, so four of the five wrong-unit readings refuse loudly instead of silently classifying (observation 24, corrected). **The SENT state names the class that was sent and where it came from**, because a class we DERIVED is a guess about a fact Concept2 lets its owner set, and a guess nobody sees can never be corrected. **Nothing is cached**: the class is read fresh on every send (ruling R13), because a declaration can change on Concept2 at any time with no signal to us.

**Two rules the declaration read carries, because without them the producer order is a loop rather than a chain (observation 29).**

- **WE NEVER READ OUR OWN WRITES BACK AS THE ROWER'S DECLARATION.** The results list Concept2 returns contains the rows Ergomatic itself posted, echoing the class we supplied, and nothing in the projection tells them apart from a real designation. Without an exclusion, send 1 derives a guess and send 2 reads that guess back as "the rower's declaration" — laundering it, and silencing the provenance line that exists to make it correctable. The read therefore excludes every result id this app wrote for this account, and **if every candidate row is ours, that is NOT a declaration**: the resolution falls through to the profile exactly as if the list were empty, and still reports its source as the profile.
- **A FAILED READ IS NOT AN EMPTY READ.** A `c2_error` on the declaration read returns a retryable failure; only a successful read that genuinely carries no usable class falls through to the derivation. Refusing when we have no data and guessing when we FAILED to read data is an asymmetry nothing argues for, and the guess it produces lands on a permanent third-party record.

Migration 0023 still drops the two columns that hold a class today. The consequences are folded into Tasks 2, 3, 4, 5, 7, 10, 11, 13 and 14; observations 7, 8, 24, 25, 26, 27 and 28 carry the evidence.

Written 2026-09-03 in worktree `/Users/james/projects/github/jamesawesome/Ergomatic-wt-c2pr2` (branch `wave-e-pr2-client`, base main `3e15378e`). Every `file:line` below was read in this worktree at that head. PR1 (#—), PR1.5, PR1.75a (#269) and PR1.75b (#277) are all merged; the server, the native plugin and `adapters/linkFlow.ts` all exist and are what this PR builds on.

**Goal:** Put the Concept2 link and the per-row send in front of a rower. A Concept2 card on You links, shows which account is linked, and unlinks; a Send block on a qualifying log row posts that row and shows whether Concept2 took it, with a link out to the result. The whole surface stays invisible until the server says `available: true`.

**Architecture:** Two components over one existing seam. `you/Concept2Card.tsx` reads `GET /api/concept2/link` through a new `api/useConcept2Link.ts` hook and drives `adapters/linkFlow.ts`'s `startLink` — the platform conditional already lives there and no new one is added. `log/Concept2SendBlock.tsx` renders inside `log/FromTheLog.tsx` after the plan footer, gated by a client mirror of the server's eligibility predicate, and posts `POST /api/concept2/results/:logId`. All copy decisions and every rendered state come from the Gate 0 amendment (Task 0); all branch logic lives in two pure modules (`you/concept2CardModel.ts`, `log/concept2Send.ts`) so it is testable without a DOM.

**Tech Stack:** React 19 + Vite, TypeScript ~6.0, Vitest 4 (`unit` / `client` / `integration` projects), Playwright, Express 5 + Drizzle (the two small server additions in Tasks 2 and 3). pnpm only, ESM only, server imports carry `.js` extensions. Node 26: `export PATH="$HOME/.local/share/nvm/v26.5.0/bin:$PATH"` first, per the agent briefing.

**Spec paths:**

- Parent spec: `docs/superpowers/specs/2026-08-31-concept2-logbook-design.md` (§Surfaces is PR2's Gate 0; §Architecture 4-8 the routes; §Stored shapes the sent-state contract)
- Activation design: `docs/superpowers/specs/2026-09-02-concept2-pr175-app-bind-design.md` (§3 mint contract, §4 native return, §7 callback pages)
- Approved board: `docs/design/handoffs/2026-08-31-concept2-connect/README.md` + `Concept2 connect.dc.html`
- **Gate 0 amendment (this plan's Task 0):** `docs/design/handoffs/2026-08-31-concept2-connect/amendment-2026-09-03.html`
- Device walk that measured the native arm: `docs/monitor/sessions/walk-2026-09-02-c2-native/README.md`
- Sandbox measurements (dedup granularity, logbook URL shape, eligible population): `docs/monitor/c2-crossconnect-2026-09/README.md`

## Global Constraints

Each line is quoted from the spec (§ named), the board, or the standing rules (`CLAUDE.md` / `.claude/agent-briefing.md`). Nothing here is invented by this plan.

- **Worktree:** `/Users/james/projects/github/jamesawesome/Ergomatic-wt-c2pr2` (branch `wave-e-pr2-client`). `git rev-parse --show-toplevel` before EVERY commit, confirming it prints that path (CLAUDE.md SDLC). Every shell write uses an absolute worktree path (RF20). Before relying on hooks: `pnpm install` at the worktree root AND in `app/`, then verify a deliberate lint error is blocked.
- **Gate 0 is a hard precondition, not a courtesy** (CLAUDE.md, verbatim): "Any spec whose scope includes user-visible COPY or LAYOUT gets a Gate 0: James approves the RENDERED thing before any implementation task starts." Task 0 below is that gate. **No implementation task starts until it returns APPROVED.**
- **Board fidelity** (handoff README §Fidelity, verbatim): "Colors, type, spacing, and copy are final and gate-approved (Gate 0, James, 2026-08-31). Recreate pixel-perfectly with the app's existing card idiom. All user-facing copy is approved as rendered: do not rewrite it." Every copy change this PR makes is enumerated in the amendment's §0 and carries the `file:line` that forces it. **No other word moves.**
- **Availability is a capability gate, not a hide** (spec §Architecture 8, verbatim): "the client renders NO Concept2 card and NO Send affordance when unavailable, and every link/upload route refuses server-side too."
- **Not linked → nothing on the log row** (board, approved amendment, verbatim): "The Concept2 block renders only when an account is linked. No pointer, no disabled control. The You card is the sole discovery surface."
- **Sent renders only for the live account** (spec §Stored shapes, anchor F8, verbatim): "the sent state renders only when the row's `c2_user_id` matches the live link's."
- **PII bound** (spec exit criterion 3, as amended by James's 2026-09-03 ruling, verbatim): "the link flow's request bodies carry NO new user attribute. The weight class is Concept2's own fact: read from Concept2 at send time, never asked, never stored by us." The app asks nothing about weight class at onboarding, at link, at send, or on the dev probe. This is the strongest form of the standing minimal-PII rule, not a weakening of it. **And the READ is minimal too:** the declaration page is projected down to FOUR fields per row before it leaves `client.fetchResults` — `id`, `type`, `weight_class` and the two date fields — and every one of them is load-bearing for the decision (`id` excludes our own writes, `type` says whether Concept2 required a class on that row at all, the dates stop a future-dated row pinning "newest" forever). **Nothing else about the rower's logbook is read, and none of the four is persisted, logged or rendered** — the one thing that reaches a log line is a COUNT of how many of the returned rows were ours.
- **House copy style:** no em-dashes in user-facing strings (periods / colons / middle dots). Time formatting follows the house elastic-positional format; this PR renders no durations.
- **Design hard requirements:** CSS custom properties only, never raw hex. Hit targets ≥ 44×44 px. Text contrast ≥ 4.5:1, **computed and stated as a number, never judged by eye** (RF6). 2px radii, no shadows, no animation.
- **Platform conditionals live ONLY in the adapter layer** (CLAUDE.md Native-first, lint-enforced via `no-restricted-imports`): `src/platform.ts`, `src/api.ts`, `src/native/`, `src/adapters/`. Neither component calls `isNative()`.
- **Gates (agent briefing's table, `app/src/` row):** `pnpm lint` · `typecheck` · `format:check` · `test --project unit --project client` · **`pnpm e2e`** · **`pnpm screenshots`** (a screen's layout changes — RF1). Tasks touching `app/server/` additionally run `test --project unit` and `--project integration` (Docker).
- **Test invocation, two footguns** (CLAUDE.md + briefing): `pnpm test --project client -- <pattern>` SILENTLY RUNS THE FULL SUITE, and a bare `vitest run` collides Node 26's webStorage with jsdom. For one file use exactly:

  ```bash
  cd /Users/james/projects/github/jamesawesome/Ergomatic-wt-c2pr2/app
  NODE_OPTIONS=--no-experimental-webstorage pnpm exec vitest run --project client <file>
  ```

  Read BOTH summary lines ("Test Files" and "Tests") — a file that fails to load collects zero tests and still reads green on one of them.
- **NO `&&` OR `||` IN ANY GATE BLOCK IN THIS PLAN.** One command per line, each run and each reported with its own result; `cd` gets its own line too. `A && B` hides B when A fails, and `A && B || C` is worse: the shell reports **C's** exit status, so a red suite reads green to anything checking `$?`. Every block below is written this way, and a fix round that reintroduces a chain is a defect in the fix round. Where a command needs the Node 26 flag it carries `NODE_OPTIONS=--no-experimental-webstorage` on its OWN line's invocation — a flag exported once and then chained is a flag that goes missing when the chain is split.
- **TDD + self-mutation:** failing test first, every task. Every NEW assertion gets a mutation probe run against a COMMITTED tree (RF21/RF22: commit the real change BEFORE probing, so every revert is a no-op; check `git status` before any `git checkout --`). Reports record the mutation and the exact failure text.
- **Per-file coverage** (RF2): the 90×4 gate is a repo-wide aggregate and will not notice an uncovered branch in a file this PR creates. Read the per-file rows in the HTML report under `app/coverage/` and state which source was used.
- **Realistic fixtures** (RF3): at least one test per client task starts from a real library workout (`app/server/seed/library/index.ts`'s `LIBRARY_WORKOUTS`) via the existing fixture builders, not a hand-built minimum. The three `StoredLog` builders this PR must touch already do (`SEA_FRET`).
- **Typed-lint ratchet:** no new suppressions; `pnpm lint:prune` after removing any.
- **Records** (RF14): anything with a life after merge goes in ROADMAP, DEVIATIONS, a ledger or the spec at the moment it is found, never only in the PR body.

## Paste-test receipt (agent briefing, "Plan authoring")

Every prescribed code block below was extracted to its REAL path in the worktree at head `df20687c` (branch `wave-e-pr2-client`, `git status --short` empty before the placement and again after the restore) and run through the repo's own gates — client AND server, tests included, with Docker up for the integration project.

| Gate | Command | Result |
| --- | --- | --- |
| typecheck | `pnpm typecheck` | 0 errors; `E2E TypeScript membership: 19/19` |
| lint | `pnpm lint` | 0 problems, no new suppressions |
| format | `pnpm format` then `pnpm format:check` | `All matched files use Prettier code style!` |
| unit | `NODE_OPTIONS=--no-experimental-webstorage pnpm exec vitest run --project unit` | 58 files, 1801 passed, 1 skipped |
| client | the same command, `--project client` | 177 files, 4788 passed |
| integration | the same command, `--project integration` (Docker up) | 25 files, 373 passed |
| the server build-config pin | `pnpm exec tsc -p tsconfig.server.build.json --noEmit` | 0 errors, and M40c run in full — see Task 10 step 0 |

Both summary lines ("Test Files" and "Tests") were read for every run — a file that fails to LOAD collects zero tests and still reads green on one of them.

**Second placement, 2026-09-03, for the producer chain this revision builds.** This SUPERSEDES an earlier second-placement receipt, which covered a derivation-only design that observation 26 falsified; do not cite that one. Placed at their real paths in this worktree at head `e74696f7`, `git status --short` empty before the placement and again after the restore.

**What was placed — a strictly larger slice than the superseded receipt covered, including step A7, which that one had to leave UNRUN:**

- `server/concept2/mapping.ts` — `pickDeclaredWeightClass`, `deriveWeightClass`, the four constants, the failure/source/weight types, and `buildC2Payload`'s signature change with all TWELVE of its call sites (`grep -c "buildC2Payload(" server/concept2/mapping.test.ts` -> `12`, run at `1d08ab46`; an earlier draft of this receipt said eleven, and `pnpm typecheck` names all twelve as TS2345 at lines 176, 196, 205, 214, 227, 238, 245, 264, 278, 279, 293 and 301).
- `server/concept2/client.ts` — the rewritten `fetchMe`, the new `fetchResults`, `readProfileWeight`, and the timeout bound on all four wire calls.
- `server/routes/concept2.ts` — **step A7 in full**: `flagIfSameGrant`, `resolveWeightClass`, the `LinkIdentity` narrowing, the whole-resolution retry, and the 200 body's two new fields.
- `src/log/concept2Send.ts` + its test, `src/api/useConcept2Link.ts`'s shape half, `StoredLog`'s two fields and the three fixtures they break.
- Every test block this revision prescribes, plus the measured ripple in `server/routes/concept2.test.ts` and `server/concept2/client.test.ts`.

| Gate | Command | Result |
| --- | --- | --- |
| typecheck | `pnpm typecheck` | 0 errors; `E2E TypeScript membership: 19/19` |
| lint | `pnpm lint` | 0 problems, no new suppressions |
| format | `pnpm format:check` | `All matched files use Prettier code style!` (after `prettier --write` on the placed files — the blocks below are written as Prettier formats them) |
| unit | `NODE_OPTIONS=--no-experimental-webstorage pnpm exec vitest run --project unit` | 58 files, **1815 passed, 1 skipped** |
| client | the same command, `--project client` | 172 files, **4712 passed** |

**Eleven probes were RUN, not listed** — each mutated in place and reverted by an inverse edit rather than `git checkout` (RF22: the tree carried the uncommitted placement):

| Mutation | Result |
| --- | --- |
| `deriveWeightClass`: `<=` → `<` on the men's threshold | `Tests 2 failed | 37 passed` — "classifies every case in the table" AND "puts the boundary rower in the LIGHT class" |
| thresholds swapped (men 6150, women 7500) | `Tests 2 failed | 37 passed` — the same two |
| `weight <= 0` clause dropped, guarding on `null` alone | `Tests 1 failed | 38 passed` — the table, on its `weight: 0` row |
| the plausibility band deleted | `Tests 2 failed | 37 passed` — "REFUSES four of the five wrong-unit readings" and "refuses an implausible weight WHATEVER the gender says" |
| `pickDeclaredWeightClass` iterates the page in reverse (oldest declaration wins) | `Tests 1 failed | 38 passed` — "takes the NEWEST readable class" |
| `pickDeclaredWeightClass` accepts any non-empty string | `Tests 2 failed | 37 passed` — "skips rows that carry no class" and "returns null when the page holds no declaration" |
| `readProfileWeight` drops its numeric-string arm | `Tests 1 failed | 33 passed` — "reads a finite numeric STRING as a weight …" |
| the timeout `signal` dropped from `fetchMe` | `Tests 1 failed | 33 passed` — "passes an abort signal to every one of the four calls" |
| the route ignores the declaration and always derives | `Tests 8+ failed` — headed by "sends the class the ROWER declared on their own most recent Concept2 row"; the rest fall out because the stub's `fetchMe` throws when unstubbed, which is the file's own convention |
| the auth retry re-reads only the profile, not the declaration | `Tests 2 failed | 112 passed` — "re-reads the DECLARATION on the refreshed token, not just the profile" and the needs_reauth test |
| a `no_class` failure falls through to the POST instead of returning | `Tests 1 failed | 113 passed` — on `expect(client.postResult).not.toHaveBeenCalled()` |

Five more on the client model, all biting their named test: `c2ProfileUrl` restored to the id-bearing public card; every `no_weight_class` reason collapsed to one line; `no_weight_class` folded in with `not_eligible`; `weightClassLine` naming the wrong producer; a bare 200 degraded to `failed`. Restored after each: `Tests 17 passed (17)`.

**What the placement FOUND, which is the reason it was worth running — three things, and one of them changed the design:**

1. **The plausibility band cannot catch a hundredths-of-a-POUND reading, and the first draft of this plan claimed it caught all five.** The band's own test went red on `16500`, which is inside 30-300 kg. A 2.2x unit error is undetectable from one number. The comment, the test and observation 24 now say "four of the five", and there is a test pinning the fifth so a later overclaim goes red.
2. **Adding a second read call to the upload path breaks ~20 existing route tests, and no earlier draft named them.** The fix is one default on `makeStubClient` (`fetchResults` → one measured `rower` row carrying `"H"`), after which only the tests this revision genuinely changes fail. **The count is SEVEN, not five** — `grep -c "toStrictEqual({ resultId" server/routes/concept2.test.ts` -> `6` (lines 1592, 1955, 2011, 2048, 2173, 2197), each of which gains the two new keys, plus the one test with `weightClass` in its own title. Measured by running the suite against the placement (below), not by reading.
3. **`makeStubClient` needs `fetchResults` at all** — a new method on a `as unknown as C2Client` cast is invisible to typecheck and shows up as a runtime TypeError.
4. **`makeFakeLogsStore` needs `sentC2ResultIds` for the same reason, and it is the fold's own cost.** The exclusion mechanism reads the logs store from inside the upload route; without a fake, EIGHTEEN existing upload tests answer 500 rather than the status they assert. Named here because it is invisible to `pnpm typecheck` (`fakes.ts` ends `as unknown as LogsStore`) and looks like a mass regression when it appears.

**What the placement does NOT cover, named rather than carried silently:** the schema drop and migration 0023, `server/stores/concept2.ts`, `server/testing/fakes.ts`, the mint's own `weightClass` removal (step A2), `adapters/linkFlow.ts`'s `startLink()`, the dev probe and the contract test. Those need the 76 `weightClass` occurrences in `server/routes/concept2.test.ts`, `server/stores/concept2.integration.test.ts` and `server/db/schema.integration.test.ts` ported, which is the implementation rather than a paste test. **A reviewer should treat steps A1-A4 and A10 as UNRUN prescriptions** — read as code, checked against the files they edit, but not compiled. Step A10's migration-test ripple in particular is the one place a reviewer's eye is doing work a compiler did everywhere else, and its raw-SQL half is invisible to both `pnpm typecheck` and `--project unit` by construction.

**Also not covered:** the `pnpm build` / `pnpm dist:grep` rows, and `--project integration` (its Docker stack was not booted for this placement — the integration project's Concept2 files are among the untouched ones above). Task 9 and Task 10 run those and record their own numbers; do not cite this receipt for them (RF12).

**What this receipt does NOT cover, named rather than carried silently:** the `pnpm build` / `pnpm dist:grep` rows. They were measured on an earlier tree, nothing in this revision touches a needle or the probe flag, and a bundle claim is settled by producing the artifact, never by inheriting a table row (RF12). Task 9 runs them and records its own numbers; do not cite this receipt for them.

**Third placement, for the exclusion mechanism and the copy this fold changes.** Placed at their real paths in this worktree at head `1d08ab46` (`git status --short` empty before the placement and again after the restore), covering `server/concept2/mapping.ts`'s producer block, `server/concept2/client.ts`'s `fetchResults`/`fetchMe`/timeout, `server/routes/concept2.ts`'s resolution + logging, `server/stores/logs.ts`'s `sentC2ResultIds`, `server/testing/fakes.ts`'s mirror of it, and `src/log/concept2Send.ts`'s copy set (placed standalone, with the two cross-module imports replaced by local shapes — the module's own consumers are unchanged by this fold and were not re-placed).

| Gate | Command | Result |
| --- | --- | --- |
| typecheck | `pnpm typecheck` | 0 errors; `E2E TypeScript membership: 19/19` |
| lint | `pnpm lint` | 0 problems, no new suppressions |
| format | `pnpm format:check` | red on 7 files as first written; `prettier --write` then green — the blocks below are written as Prettier printed them (see the receipt's F8 note) |
| unit | `NODE_OPTIONS=--no-experimental-webstorage pnpm exec vitest run --project unit` | `Test Files 2 failed \| 56 passed (58)` / `Tests 12 failed \| 1793 passed \| 1 skipped (1806)` — the 12 are exactly the named ripple: 7 in `routes/concept2.test.ts`, 5 in `client.test.ts` |
| client | the same command, `--project client` | `Test Files 172 passed (172)` / `Tests 4698 passed (4698)` |

**Ten probes run against this placement**, each mutated in place and reverted by an inverse edit (RF22: the tree carried the uncommitted placement):

| Mutation | Result |
| --- | --- |
| `pickDeclaredWeightClass`: the `ourResultIds` skip deleted | `Tests 10 failed \| 139 passed` — headed by "never reads OUR OWN writes back as the rower's declaration", "takes the NEWEST readable class, skipping our own row above it" and the route-level "never reads its OWN write back as the rower's declaration on the next send" |
| the route: a `c2_error` on the declaration read falls through to the profile | `Tests 8 failed \| 101 passed` — "reports a FAILED declaration read as retryable, never as our own guess" |
| `pickDeclaredWeightClass`: any `type` carries a class | `Tests 1 failed \| 39 passed` — "reads a class only off a type Concept2 REQUIRES one on" |
| `pickDeclaredWeightClass`: the future-date skip widened 100000x | `Tests 1 failed \| 39 passed` — "skips a row dated in the FUTURE, so one bad stamp cannot pin the declaration forever" |
| `deriveWeightClass`: `gender` compared raw, no case-fold | `Tests 1 failed \| 39 passed` — "case-folds gender, because the wire's letter case is documented only by example" |
| `C2_TIMEOUT_MS = 1` | `Tests 6 failed \| 22 passed` — "bounds every wire call at ten seconds, pinned with a literal rather than the constant it gates" (the other 5 are the named `fetchMe` ripple) |
| `noWeightCopy`: `NO_WEIGHT_SET` for the two middle tokens | `Tests 2 failed \| 1 passed` — "gives each server reason honest words…" and "never blames the rower's weight for a number OUR unit inference could not classify" |
| `noWeightCopy`: `no_gender` sent back to the logbook | `Tests 1 failed \| 2 passed` — "names no destination its only control cannot reach" |
| `noWeightCopy`: rewritten as a `Record` + `reason in MAP` lookup | `Tests 1 failed \| 2 passed` — "gives each server reason honest words…", on the `toString`/`constructor` rows, which render `undefined` under that form while `tsc` types the lookup as non-optional |
| (control) all restored | `mapping.test.ts` `Tests 40 passed (40)`; `concept2Send.test.ts` `Tests 3 passed (3)` |

**What this placement FOUND, beyond confirming the lens's twelve:**

1. **`?type=` IS a documented filter, and the "unproven" claim was under-read** — the vendor's Get Results table says `type | Fetches only results of this type. Must be one of rower, skierg, bike, dynamic, slides, paddle, water, snow, rollerski, multierg`. The design still selects on the FIELD, but now because it accepts THREE types rather than because the parameter is unproven.
2. **The non-rower question is answered by the vendor's own documented example, not left unmeasured** — see observation 27's correction. It was reachable the whole time on a page this plan already quotes.
3. **`date_utc` is nullable on Concept2's own example rows**, which is why the recency guard falls back to `date` and accepts a row whose timestamps are both absent.

**The receipt covers the server.** An earlier scoped-lint receipt (five client source files only) is what hid `vitest/prefer-strict-equal` and `vitest/no-conditional-expect` firing on this plan's own TEST blocks, and hid three server ripples entirely: `scripts/webauth-contract.test.ts`'s pinned key list, `src/monitor/Concept2LinkProbe.tsx`'s `LinkStatus` interface, and `server/db/schema.integration.test.ts`'s migration-boundary block. All three are now named in the tasks that cause them.

**And it covers the whole placement, not a delta.** Every task's blocks were placed together, because most of them only compile together — which is how the placement found the things a per-block check cannot see: a comment inside `LinkStatus`'s braces registering as a phantom key on the contract gate (Task 3 step 6b), an `unlink()` that left its arm live after a refusal and broke two of this plan's own prescribed tests (Task 4 step 3), a `You.test.tsx` harness whose `./api` factory has to delegate to global `fetch` or an unrelated baseline test stops finding its own field (Task 8), and a Just Row assertion literal taken from the TIMER fixture's clock rather than the monitor one's (Task 6 step 1).

Every prescribed block that the run CHANGED is written below as it ran green, not as it was first drafted.

## Plan deviations / observations (RF10 — the spec and the board against the code as read)

Numbered so review can cite them. Each is a place where an authority this plan inherits says something the code contradicts.

1. **The board points Surface 2 at the wrong file.** Handoff README §"About the Design Files": "`app/src/log/LogRow.tsx` area for Surface 2". `LogRow.tsx:221-281` is the LIST row's *content only* — the caller supplies the wrapper, and in both callers that wrapper is a `<Link>` (`HistoryList.tsx:188-198`, `Today.tsx:1683-1693`), so a button there would nest an interactive element inside an anchor. The list projection also lacks the fields the send state needs: `RecentLog` (`api/useRecentLogs.ts:20-106`) declares no `source`, `c2ResultId` or `c2UserId`. The board's own §Surface 2 says "Log detail", which is `FromTheLog.tsx`. **This plan builds Surface 2 in `FromTheLog.tsx` and touches `LogRow.tsx` not at all.**

2. **2c's timestamp cannot be rendered.** Board 2c: "Accepted by Concept2 · Aug 27, 11:31". `session_logs` gained exactly `c2ResultId` and `c2UserId` (`server/db/schema.ts:377-378`); there is no acceptance-timestamp column and `git grep` finds no `c2_sent_at`. Rendering `loggedAt` there would print the save clock under a line naming a different event. **Amendment change 4: the timestamp is dropped.**

3. **1b's Cancel button has no reachable presser, on either surface.** Native: `startLink` awaits `ASWebAuthenticationSession` (`adapters/linkFlow.ts:172-272`) and the sheet is presented over the app, so nothing behind it is tappable; the outcome then arrives in the promise. Web: `openExternalUrl` is `window.location.assign` (`adapters/webNavigate.ts`) and the document unloads. The board's second 1b variant ("CONFIRMING THE LINK") has the same problem — on web there is no document to confirm in, and on native the promise has already resolved. **Amendment change 3: both removed; one buttonless panel remains, visible only during the mint round trip.**

4. **The two `busy` outcomes are indistinguishable, and the code says they must not be.** `adapters/linkFlow.ts:148-155`, verbatim: *"PR2's card must therefore not render one string for both `busy` sources: the JS guard means 'your last tap is still working', the plugin's means 'a sheet is already up and your fresh mint just superseded the attempt it belongs to'."* But `startLink:287` and `pluginRejection:156` both return bare `{ kind: "busy" }` — the union cannot express it. **Task 2 makes the member `{ kind: "busy"; source: "guard" | "sheet" }`.** Typechecked: no existing consumer constructs a `busy` outcome, and `Concept2LinkProbe`'s `outcomeDetail` (`:98-107`) branches on `code`/`status`/`message`, none of which `busy` carries, so it needs no change.

5. **The client cannot build the "View on Concept2" URL.** PR0 measured the shape — `/profile/{c2_user_id}/log/{result_id}` (`docs/monitor/c2-crossconnect-2026-09/README.md`) — but not the origin, and the origin is a deployment fact: `server/index.ts:119` defaults `C2_BASE_URL` to `https://log-dev.concept2.com`, and a hardcoded `log.concept2.com` link 404s for the entire sandbox phase, which is the phase every walk happens in. **Task 3 returns `logbookBaseUrl` on `GET /api/concept2/link`, derived from the same `C2_BASE_URL` the client already talks through.** There is no client-side alternative that is not a guess.

6. **Adding `c2ResultId`/`c2UserId` to `StoredLog` breaks exactly three fixture builders.** Measured, not predicted — `tsc -p tsconfig.app.json --noEmit` on the scratch tree named all three and nothing else: `log/FromTheLog.test.tsx:30` (`storedRow`), `log/HistoryList.test.tsx:88` (`baseStoredRow`), `log/storedSummary.test.ts:47` (`baseRow`). All three build a full `StoredLog` from a `Partial` override, so a required-and-nullable field must be added to each literal. The repo's convention for this type is required-and-nullable, not optional (`storedSummary.ts:211-212`'s own reasoning: "the column is always selected, so 'absent' isn't a shape this row can actually carry"), so the fix is two lines per fixture, never loosening the type.

7. **The parent spec's `weight_class` premise is falsified on its evidence AND on its conclusion.** Spec §Research, verbatim: *"`GET /api/users/me` returns 13 fields, none of them weight — `weight_class` must be asked by us (V10)."* Both halves are wrong, and the second half is what the whole ask was built on. `GET /api/users/me` was measured live against log-dev on 2026-09-03 (user 2211, PR0 harness token) and returns **sixteen** fields: age_restricted, country, dob, email, email_permission, first_name, gender, health_data_permission, id, last_name, logbook_privacy, max_heart_rate, profile_image, roles, username, **weight**. There is no `weight_class` on the user object — but `weight` and `gender` both are, and those two are exactly what C2's own lightweight definition is written in terms of. **The class is derivable from Concept2's own profile, so it never had to be asked.** Task 13 corrects the spec line and the research record. See ruling (i).

8. **Concept2's API neither exposes the profile's weight-class default nor applies it, and this was measured rather than reasoned.** The logbook help says the profile carries a Weight Class default that "applies to the majority of your results" (SECONDARY — the help page 403s to fetchers; text from a web-search snippet), which reads as if the API would fill the field in. It does not. Measured 2026-09-03, log-dev, user 2211: `POST /api/users/me/results` with `{type:"rower", date, timezone, distance, time}` and NO `weight_class` answers **422**, verbatim body `{"message":"Could not create new result.","status_code":422,"errors":{"weight_class":["The weight class field is required."]}}`. Same-row control with `weight_class:"H"` → **201** (result 85831, deleted afterwards with `DELETE /api/users/me/results/85831` → 200). So: every upload must name a class on the wire, the profile default will not do it for us, and the profile does not expose the default for us to copy. **What the profile DOES expose is `weight` and `gender`, which is what the class is defined from — Task 3 derives it server-side at send time.** See ruling (i).

9. **The Linked card cannot name the Concept2 username today.** `GET /api/concept2/link` returns `{available, linked, weightClass, c2UserId, needsReauth}` (`server/routes/concept2.ts:535-546`) and `concept2_links` stores no username, though both completion paths hold `me.username` at exchange time (`routes/concept2.ts:378-411`, `:486-513`) and the Linked callback page prints it (`concept2/callbackPage.ts:156`). ROADMAP's C2-account-injection row says "detect-identity treatment (the callback/linked card naming which account the link goes to) ships with PR2's surface" — and a numeric id is not an identity a rower recognises. See ruling (ii); Task 3 implements variant B.

10. **`openExternalUrl` is the wrong adapter for a read-only link-out.** Its own header says PR2's link-out is its next consumer (`adapters/externalBrowser.ts:1-6`), but its web arm is `window.location.assign` — correct for the OAuth hop, and for "View on Concept2" it would throw the rower out of the app with the log row lost. **Task 2 adds `openReadOnlyUrl`** (web: a new context; native: the same `SFSafariViewController` sheet, which returns). The link-out is therefore a `<button>`, not an `<a href>`: on native a plain anchor drives the Capacitor WebView itself to concept2.com with no way back.

11. **`routes/concept2.ts:64-67`'s "intentional interval" comment is stale at this head.** It reads: *"Until PR1.75b ships the ASWebAuthenticationSession plugin nothing on the device can receive it — the design's named intentional interval, harmless while the flag is off."* PR1.75b merged as `3e15378e` (`git log --oneline -1`: "Wave E PR1.75b: the native half of the authenticated activation shape (#277)"). The interval has closed. **Task 13 reconciles it.**

12. **2d Duplicate is session-transient and the board reads as if it persists.** The 409 branch writes `c2ResultId`/`c2UserId` before responding (`routes/concept2.ts:875-899` — RF25's durable-recovery write), so the next mount of the detail screen reads the id off the row and renders **2c SENT**. 2d is what the rower sees in the seconds after the colliding tap and never again. Consequence for Task 11: 2d cannot be captured by a screenshot that seeds state and reloads — only by driving the tap.

13. **`Concept2LinkProbe` stays exactly as it is, dev-only.** It is not the product surface (its own header says so) and it is the ONLY instrument that can reach the Swift plugin (`Concept2LinkProbe.tsx:21-26`: no XCTest target, `src/native/**` is `v8 ignore`d, `pnpm e2e` runs on web). Its `data-c2-link-probe` literal is `dist-grep.sh:127`'s eighth needle and `ios-release.sh:42-45` refuses to run while its flag is exported. **The product card does not replace it, does not absorb its readout, and does not share its CSS.** See ruling (iv).

14. **The e2e stack is C2-dark by construction, and a committed test enforces it.** `scripts/compose-env.test.sh:46-49` runs the real `docker compose -f compose.yml -f compose.e2e.yml config` and asserts `C2_LINK_ENABLED: ""`; CI runs it (`.github/workflows/ci.yml:165-168`). No fake Concept2 server exists anywhere in the repo (`server/testing/fakes.ts` fakes stores, not HTTP; `concept2.integration.test.ts:206-214` injects a `vi.fn()` fetch). See ruling (v); Task 11 implements the recommended scope. **What this observation does NOT establish:** that lighting the flag for e2e would force a change to that script. It renders compose config in its own inline environment (`POSTGRES_PASSWORD=dummy TEST_AUTH_SECRET=dummy docker compose … config`, no `C2_LINK_ENABLED` set), so an `export` added to `app/scripts/e2e.sh` never reaches it and its assertion keeps passing untouched. Ruling (v)'s cost cell is corrected accordingly.

15. **"View on Concept2 →" in accent is accent's fifth meaning.** `docs/design/handoffs/2026-08-03-ui-fix/DESIGN.md:39-41`, verbatim: "Accent red now means exactly four things: the level-1 action, a resolved split or duration, a destructive control, the active tab mark." Unlink is the third and needs no dispensation; a link-out is none of the four. The in-repo precedent for a fifth candidate is `--action-connect` (`theme/tokens.css:33-41`), which got its own token rather than becoming accent's fifth thing. The board rendered the link-out in `#b5341f` and James approved that render on 2026-08-31. **Task 13 records it as a DEVIATIONS row rather than inventing a token nothing else would use** (amendment §5) — but it must be RECORDED, per RF9.

16. **`--ink-4` on `--surface-sunken` fails AA and the sunken panel is where this PR's muted text wants to go.** Computed (WCAG relative luminance, script in the amendment's §4): 4.48:1 against a 4.5:1 floor. Every REASON line therefore uses `--ink-3` (6.30:1). This is a constraint on Task 4's CSS, not an observation about existing code.

17. **PR1's `completed_at`/`tz` columns have no client producer, so the mapping branch they exist for has never fired.** `POST /api/logs` validates and stores both (`server/routes/data.ts:1705-1715`, `:1754-1755`), and `buildC2Payload` takes its accurate branch only when BOTH are non-null (`server/concept2/mapping.ts`: `row.completedAt !== null && row.tz !== null ? row.completedAt : row.loggedAt`). But `git grep -n '\btz\b' -- src/` returns NOTHING — no client code, test or otherwise, posts the field. The single client POST site is `LogSession.tsx:438`'s `postLog`, fed by `submit(fields)` from three doors plus `justrow/JustRowLog.tsx`, and no door sets either key. **Consequence: every Concept2 upload would carry the SAVE clock as its `date`, on a route whose dedup key is second-granular.** A validator is evidence that a field is ACCEPTED, never that it is SENT. **Task 6 is the missing producer, and it is TRIAD** (it changes what a stored number MEANS on a third party's record).

18. **`c2Username` can arrive as the empty string, and `??` does not catch it.** `client.ts`'s `fetchMe` returns `username: typeof data?.username === "string" ? data.username : null` — an empty string is a string, so `""` passes straight through. `routes/concept2.ts:408` then writes `me.username ?? \`#${me.c2UserId}\`` into the Linked callback page, which renders `Concept2  is now connected to …` for that value, under a comment claiming the page "never renders an empty identity". The card's `identityLine` would inherit the same hole through `??`. **Absent / empty / valued applies to every vendor-supplied STRING that reaches a rendered surface** — Task 1 and Task 3 both guard on `!== ""`, not on nullishness.

22. **The same hole is open one field over, on `logbookBaseUrl`, and both ends of it are ours.** `server/index.ts` reads `process.env.C2_BASE_URL ?? "https://log-dev.concept2.com"` — `??`, so `C2_BASE_URL=""` in a deploy env passes straight through — and `normalizeLink` (Task 1) guarded the field on `typeof` alone while guarding `c2Username` two lines above on `!== ""`. The result is `c2ResultUrl("", 2211, 339)` -> `/profile/2211/log/339`, a RELATIVE url: the web arm opens it as a new tab on **Ergomatic's own origin**, and the native arm hands it to `SFSafariViewController` as a bare path. **Task 3 changes the env read to `||` and Task 1 guards the field on `!== ""`.** This is observation 18's own lesson applied to the neighbouring field rather than restated: the rule was already written down and the second field still shipped without it.

23. **A 200 whose body is not JSON is a third read outcome, and folding it into the second loses the status.** `useConcept2Link`'s `.catch` reports `{status: null}`, which the card renders as `REASON: NO CONNECTION` — over a request that plainly connected. A proxy or an old image answering an HTML error page mid rolling deploy is the named case (`adapters/linkFlow.ts:124-127`). **Task 1 catches the parse SEPARATELY and reports the status the response actually carried.** Consequence for the mutation table, measured rather than reasoned: once the parse has its own arm, M6c (drop the `if (!res.ok)` guard) stops biting against a 502 with an HTML body — the mutant now reports 502 from the inner catch. What still bites it is a non-2xx whose body IS valid JSON, so Task 1 carries that test and M6c points at it.

19. **A back-forward-cache restore re-shows the card with no mount, so a mount-only read can freeze it mid-attempt.** On web, `startLink` resolves `navigating` and `openExternalUrl` unloads the document (`adapters/webNavigate.ts`); the card's only re-read is `useConcept2Link`'s mount effect. If the browser RESTORES the page from the bfcache on Back instead of reloading it, no mount runs, the effect does not re-fire, and the rower is looking at a buttonless OPENING CONCEPT2 panel over a link that has already succeeded. `useReturnToApp` was deleted on the reasoning "native resolves in a promise, web unloads" — true of native, and true of web only until a restore happens. **Task 1 subscribes to `pageshow`** (which fires on a restore as well as a load — the one event that does) and to `visibilitychange`, and re-reads on both.

20. **`upsertLink`'s input shape reaches 53 call sites through three builders, not the three fixtures observation 6 measured.** Those two measurements are of DIFFERENT types: observation 6 counts `StoredLog` literals, and a required `c2Username` on `upsertLink`'s input is a separate blast radius — `LINK_INPUT`/`freshLink` (`server/routes/concept2.test.ts`), `link()` (`server/stores/concept2.integration.test.ts`) and `makeFakeConcept2Store` (`server/testing/fakes.ts`). **Task 3 makes the input field OPTIONAL, defaulting to `null` internally.** The stored COLUMN and the `getLink` projection stay required-and-nullable; only the writer's input is optional, so a call site that has no username does not have to say so.

21. **The `GET /link` response's key list is pinned by a gate that only sees `key:` syntax.** `scripts/webauth-contract.test.ts`'s `linkResponseKeys()` parses the route's response literal with a regex requiring an explicit `key:`, and holds it equal to `src/monitor/Concept2LinkProbe.tsx`'s `LinkStatus` interface. An ES2015 shorthand property (`logbookBaseUrl,`) is INVISIBLE to it: the gate stays green while the key it exists to track is unpinned. **Task 3 writes `logbookBaseUrl: logbookBaseUrl,` explicitly and updates both sides of that gate** — neither file was named anywhere in this plan before the paste-test ran the full `unit` project.

24. **The unit of `weight` on `GET /api/users/me` is UNMEASURED, and Concept2's own documentation contradicts itself about it.** The only primary line the vendor publishes sits on the **Create User** endpoint — a write parameter on the client-credentials admin route, not the read this PR consumes. Fetched 2026-09-03 from `https://log.concept2.com/developers/documentation/` (HTTP 200), the table row reads verbatim:

    > `weight` | No | integer | **The weight in decigrams for the user, e.g. 7500 for 75kg.** Defaults to null if not set. | `7500`

    **PRIMARY for the write parameter; INFERENCE for the read field** — nothing states that `GET /users/me` echoes the same encoding, and the account we can measure carries `weight: null`, so no observation settles it. **The sentence also contradicts its own example:** 7500 decigrams is 750 g, while `7500 for 75kg` puts one unit at 0.01 kg. The EXAMPLE is the operative half — it is the only part that pins an actual correspondence — so the thresholds are written as hundredths of a kilogram (75 kg = `7500`, 61.5 kg = `6150`) and **the constant carries that unit in its identifier** (`LIGHTWEIGHT_MAX_MEN_HUNDREDTHS_KG`), so a unit mismatch is a loud rename rather than a silently wrong class.

    **"A wrong unit classifies every rower as one class" was written as a single risk and it is two, in opposite directions.** Tabulated against the actual predicate for a 75 kg rower: decigrams `750000` → everyone H; grams `75000` → everyone H; hundredths-lb `16530` → everyone H; **integer kg `75` → everyone L; integer lb `165` → everyone L.** The two "everyone L" readings put a heavyweight into Concept2's LIGHTWEIGHT rankings, which falsifies a competition record rather than merely disadvantaging its owner. That direction is the one worth a guard.

    **So the derivation carries a PLAUSIBILITY BAND on the raw number before it classifies** (`PLAUSIBLE_MIN/MAX_HUNDREDTHS_KG`, 3000..30000 = 30-300 kg), and a value outside it refuses with its own reason token rather than yielding a class. **Four of the five wrong readings then refuse loudly. The fifth does not, and the code and its test say so:** hundredths-of-a-pound differs from hundredths-of-a-kilogram by 2.2x, and no band wide enough to hold real rowers can exclude a 2.2x error. That residue is exactly what exit criterion 3b's TWO readings settle (Task 14), and it is bounded by the producer order: a rower who has declared a class on any recent Concept2 result never reaches this function at all.

    **3b is therefore a DESK step, not a walk step, and it gates the flag flip rather than this merge** (Task 14). It touches no erg, no phone and no PM5.

25. **Nothing in the repo reads the profile on the SEND path today, and the token machinery is built for one wire call, not two.** The upload route acquires a token through `acquireAccessToken` and makes exactly one wire call (`client.postResult`), with one refresh-and-retry and a locked repeat-401 branch that flags `needs_reauth` only when the link's CURRENT access token still matches the rejected one (`server/routes/concept2.ts`, the `stillSameGrant` block). Task 3 adds a SECOND wire call ahead of it, and a profile read that 401s must reach the SAME flag — otherwise a dead grant surfaces forever as a retryable `c2_error` and the rower is never told to reconnect. **`client.fetchMe`'s failure shape cannot express that today**: it returns a bare `{ ok: false }` for a 401, a 500 and a thrown fetch alike (`server/concept2/client.ts`, `if (!res.ok) return { ok: false }`). **Task 3 gives it `kind: "auth" | "c2_error"` and extracts the existing locked flag block into a named helper both repeat-401 sites call**, so the two answer identically rather than one being a copy of the other. **Countable ripple, MEASURED by placing the block rather than reasoned about** — and the first count this plan carried was wrong, which is why it is stated as a run rather than a list. Two production call sites (the web callback and the native exchange) only test `.ok` and read `c2UserId`/`username`, so neither changes. The TESTS are the ripple, and there are **nine assertions across two files**:

  - `server/routes/concept2.test.ts` — **five** stub sites, not the two an earlier draft named. `pnpm typecheck` reports all five: two write `mockResolvedValue({ ok: false })` (they become `{ ok: false, kind: "c2_error" }` — neither test is about a 401, and both callback paths answer 502 for either kind, so no assertion moves), and **three write a success stub that is now missing `weight` and `gender`** (`stubHappyExchange`'s shared helper plus two inline ones). Give those `weight: 8200, gender: "M"` — present-and-plausible, since none of these tests is about the derivation.
  - `server/concept2/client.test.ts` — **FIVE** assertions, and typecheck does NOT name them, because they are `toStrictEqual` on a RETURNED value rather than an argument. They fail at RUNTIME, and an implementer who trusts a green typecheck will meet them at the test run. Measured by running the suite against the placement: `Tests 5 failed | 23 passed`, and the file's own `describe("fetchMe")` holds exactly five `it()`s (`grep -n fetchMe server/concept2/client.test.ts` at `1d08ab46` -> the describe plus five call sites, lines 318, 341, 353, 361, 371). An earlier draft of this observation said four and enumerated five in the same paragraph. The two success cases gain `weight` and `gender`; `"PROBE 401 invalid-access-token body -> {ok:false}"` gains `kind: "auth"` and `status: 401` — **that one is the assertion that pins the discriminator, so it is the covering test for M9i**; the rejected-fetch and malformed-body cases gain `kind: "c2_error"` and their status. Their titles still read `-> {ok:false}`; widen each to name the kind it now asserts.

26. **Concept2 says the profile weight does NOT determine the class — the rower designates it, per piece.** The first revision's whole mechanism rested on the opposite. Concept2's logbook help, verbatim (SECONDARY — the help page 403s to fetchers, so this is a search snippet of Concept2's own text, 2026-09-03; the same provenance the thresholds already use):

    > "Lightweight and heavyweight are weight categories from the world of on-water rowing. **Even though you may have entered a weight in your profile, you must designate L or H for every piece that you enter.**"

    Corroborated three ways, none of them the same source: Concept2's own Utility documents a **"Weight Class Default"** setting SEPARATE from weight (archived.concept2.com, "Setting Machine Type and Weight Class Defaults"); ErgData carries its own Weight Class setting, and a c2forum thread ([t=205661](https://www.c2forum.com/viewtopic.php?t=205661)) is a rower complaining that ErgData uploaded **H** despite their Lightweight setting; and the API's **Edit User** surface exposes `weight` and no `weight_class`.

    **Consequence, stated as the failure it is:** a rower whose Concept2 default is L and whose profile weight is 76 kg gets **H** from a weight-derived design, and their Ergomatic rows sit in a different ranking category from every row they log through ErgData or the website. **Who is wrong: we are.** It is also RF11 in pure form — a competition category computed by us, written to a permanent third-party record, and shown to nobody, so nothing can ever compare it against the machine. Two changes answer it: **the declaration becomes the primary producer** (observation 27), and **the SENT state names the class and its source** so a derived guess is visible while Concept2's own per-result edit can still repair it (ruling R2).

27. **Concept2's results list carries the declaration, and one small page is a single cheap round trip.** MEASURED 2026-09-03 against log-dev (user 2211, a PR0 harness token whose scope is the production `SCOPE` constant `user:read,results:write` — so nothing here widens a scope): `GET /api/users/me/results?number=1` → **200**, one result. **Every result in the list carries `weight_class`** (all `"H"` on this account). The full key set per result: `comments, date, date_utc, distance, id, privacy, ranked, real_time, rest_distance, rest_time, source, stroke_data, stroke_rate, time, time_formatted, timezone, type, user_id, verified, weight_class, workout_type`. The list is **date-descending**, not id-descending: id 85561 dated `2026-09-02 10:00:30` sorted ahead of id 85562 dated `2026-09-02 10:00:00`. Pagination is `meta.pagination` with `total`, `count`, `per_page`, `current_page`, `total_pages`, `links.next`.

    **`?type=` is a DOCUMENTED filter, and the design still selects on the FIELD — for a different reason than an earlier draft gave.** That draft said the parameter was "accepted (200) but unproven as a filter", which was true of our own probe and under-read against the vendor page this plan already quotes. Fetched 2026-09-03 from `https://log.concept2.com/developers/documentation/` (HTTP 200), the Get Results parameter table's `type` row reads: _"Fetches only results of this type. Must be one of: rower, skierg, bike, dynamic, slides, paddle, water, snow, rollerski, multierg"_, with the worked example `GET /api/users/me/results?from=2015-05-01&to=2015-05-31&type=rower`. **PRIMARY.** We select on the field anyway because the read accepts THREE types (see below) and one query can name only one — and because a field read is auditable in the log line, while a filtered page is a claim about a server we cannot inspect.

    **WHETHER A NON-ROWER RESULT CARRIES A CLASS IS ANSWERED, and it was answerable the whole time on that same page.** Two rows from it, both PRIMARY, both fetched 2026-09-03:

    - the Add Result parameter table: _"`weight_class` | Depends | string | **Required if type is rower, dynamic or slides.** Value must be either H or L | H"_;
    - the Get Results 200 example body, whose SECOND result is `"type": "skierg"` and carries `"weight_class": "H"` anyway.

    So a non-rower row DOES carry a class, and on a type Concept2 does not require one for, that value is unmeasured noise rather than a designation. **`pickDeclaredWeightClass` therefore reads a class only off the three types the vendor requires one on** (`CLASS_BEARING_RESULT_TYPES`), and skips every other row and every row with no `type`. An earlier revision left this "UNMEASURED, exit criterion 3b settles it with one glance"; it is settled, and 3b keeps the glance only as a live confirmation.

    **`date_utc` can be null.** Both rows of that same documented example carry `"date_utc": null` (and `"timezone": null`), which is why the recency guard prefers `date_utc`, falls back to `date`, and accepts a row whose timestamps are BOTH absent rather than discarding a real declaration over a missing stamp.

    **Latency, measured from a dev laptop (NOT from the deploy host), 5 samples each, medians:** `?number=1` 216 ms, `?number=5` 221 ms, `GET /api/users/me` 220 ms. A small page is free, which is why `DECLARATION_PAGE_SIZE` is 5 rather than 1: five recent pieces survive a short run of BikeErg/SkiErg rows, whose `weight_class` is not required. **One page only** — the route never walks `links.next`; a rower with no readable class in five falls through to the profile.

    **What this does NOT establish, named rather than carried silently:** whether `?number=5` without a sort parameter is stably date-descending across ALL accounts. It was measured date-descending on one. The recency guard and the type filter bound what a bad order can do (a future-dated row is skipped whatever position it holds), but nothing here proves the order itself.

29. **Concept2's results list contains OUR OWN WRITES, and nothing in it says so.** This is the finding that changes the mechanism. The upload route posts a row with the class it resolved; Concept2's 201 echoes it back, and that row then appears on the very next `GET /api/users/me/results`. PRIMARY, `docs/monitor/c2-crossconnect-2026-09/raw-output.txt` lines 1-25: the 201 body carries `"weight_class": "H"` — the class we supplied — and `"source": "James Morelli"`, which is the rower's own name, not an application marker. There is no field on the row that distinguishes a result Ergomatic posted from one the rower entered on Concept2's website.

    **The failure that produces, stated as a sequence.** A rower who has declared nothing gets producer 2 on send 1: we DERIVE a class from their profile weight, post it, and the SENT state says `WEIGHT CLASS H · FROM YOUR CONCEPT2 WEIGHT` — honest, and correctable, because ruling R2 exists to make the guess visible. On send 2, that same row is the newest thing in their list, so producer 1 answers with our own guess and the SENT state says `FROM YOUR LAST CONCEPT2 ROW`. **The guess has been laundered into the rower's declaration, and the one line that existed to expose it has gone silent.** It is RF11 one level up: we write a number to a third party and then read it back as our oracle. The amendment's own justification for 2c ("a guess the rower can SEE is a guess the rower can fix; a guess they never see is one nothing can ever catch") is what this kills.

    **The fix, and why it is an exclusion rather than a stickiness flag.** `session_logs.c2_result_id` already stores every result id this app wrote, per row, alongside the `c2_user_id` that accepted it (`server/db/schema.ts`, the Wave E PR1 block). The declaration read projects `id` and drops every row whose id appears in that column for this user AND this Concept2 account — one local query, no new state, and correct across relink because ids belong to Concept2's namespace and a row written while account A was linked says nothing about account B. **If every candidate row is ours, the answer is "no declaration", not "our last class":** the resolution falls through to the profile and still reports `profile` as its source, so the provenance line keeps telling the truth on every send. The alternative considered and rejected was a session-scoped "never report `declaration` for a class we sent" flag — it would need a lifetime (RF27), it would still read our own row, and it would go wrong the moment the rower edits that row on Concept2's website, which is exactly the repair 2c is inviting them to make.

28. **There is no readable profile default, and no account-settings page we can name.** `GET /api/users/me/preferences`, `/settings` and `/profile` on the API host all answer **500 HTML** (measured 2026-09-03), so the Weight Class Default the help page describes is not exposed to us. And the link-out's destination was wrong on the evidence that was cited FOR it: `curl -sI https://log-dev.concept2.com/profile/2211` → 200 was read as "the path renders", but fetching the BODY (2026-09-03, 200, 13862 bytes) shows a PUBLIC read-only card — "Login Sign Up … james morelli Age: 38 Country: United States Logbook ID: 2211 Member since: August 21, 2026 … Quick Links Your Log Rankings". No weight, no form, no edit control. **A page that renders 200 to an anonymous fetcher is by construction not the rower's own account-edit form**, so that 200 is evidence AGAINST the destination it was cited for. Probed the same day on the same host: `/profile` (no id) → **302 → `/login`**, the authenticated-self signature; `/profile/edit`, `/profile/2211/edit`, `/account`, `/settings`, `/preferences` all → 404.

    **Compounding, and it makes the anonymous view the likely one:** the native arm of `openReadOnlyUrl` is `SFSafariViewController`, whose website data has been isolated from Safari since iOS 11 (SECONDARY — Okta, Branch.io and MacStories agree; Apple's own page returned title-only to a fetcher). That isolation is exactly why PR1.75b's OAuth hop uses `ASWebAuthenticationSession`. The rower's Concept2 session lives in Safari's jar, so the 2i sheet opens SIGNED OUT.

    **Task 5 therefore targets `{logbookBaseUrl}/profile`, and the target is PROVISIONAL** until one logged-in glance says which page carries the weight and weight-class fields (Task 14's desk step). No status code settles that, and the code comment says so rather than implying otherwise.

## Rulings required before implementation

Each is a named binary. **Task 0 presents these with the amendment; implementation does not start until every one is answered.** The plan below is written for the recommended option in each case; the "if the other" column says exactly what to delete or change.

| # | Question | Options | Recommended, and why | If the other |
| --- | --- | --- | --- | --- |
| **i** | Weight class: where is it set? | ~~**A** ask always. **B** ask only when Concept2 has no class.~~ | **RULED 2026-09-03 (James), and neither option: "I don't want that set in our app. I want it to be set on Concept2's side."** This SUPERSEDES the 2026-08-22 ruling ("a binary H/L asked only at Concept2 link time") and every draft of this plan that recommended A. **The app asks nothing about weight class, anywhere** — not at onboarding, not at link, not at send, not on the dev probe. The class is Concept2's own fact, resolved server-side on each send in this order: **(1) the rower's own most recent DECLARATION** — the newest of their recent Concept2 results whose `weight_class` reads H or L (observations 26, 27), which is the producer Concept2 itself uses; **(2) failing that, OUR derivation** from the linked profile's `weight` + `gender`, behind a plausibility band (observation 24); **(3) failing that, refuse** the send with 422 `no_weight_class` and tell the rower where to fix it (amendment 2i). Nothing about it is stored or cached (ruling R13); migration 0023 drops the two columns that hold it today. The SENT state names the class that was sent AND which producer supplied it (ruling R2), because a DERIVED class is a guess and Concept2 permits per-result editing. | Not applicable — this row records a ruling, not an open question. The cost is enumerated where it lands: Task 3 (server derivation, the mint contract, the migration), Task 4 (the ask and state 1k leave the card), Task 7 (the new failed state), Task 13 (the record). |
| **ii** | Linked-card identity: numeric or username? | **A** `Concept2 account #2211 · Ergomatic <email>`. **B** `Concept2 <username> · Ergomatic <email>`, storing the username. | **B.** The line exists to discharge the account-injection residual (ROADMAP's C2 row: the card "naming which account the link goes to" ships with PR2). A numeric id is not something a rower recognises, so A renders the mitigation without delivering it. B costs one nullable `text` column written at two sites that already hold the value, and it makes the card read the same as the Linked callback page the rower just saw. | Delete Task 3 entirely; `identityLine` (Task 1) already falls back to `account #<id>` when `c2Username` is null, so nothing else changes. PR2 then carries no migration and no stored shape. |
| **iii** | The 401/403 callback lines saying "here" | **A** reword (amendment §3). **B** leave as approved. | **A.** "here" is plain text with no anchor, deliberately — the template emits no outbound links because the callback URL carries `code` (`concept2/callbackPage.ts:52-56`, RFC 9700 §4.2). So the word names a destination it cannot take you to. The rewording removes the false affordance without adding a link. | Drop Task 12. No other task depends on it. |
| **iv** | Does the product card replace the dev probe's readout? | **A** probe unchanged, dev-only. **B** product card absorbs it. | **A.** The probe is the only instrument that can reach the Swift plugin, it prints things no rower should see (`Callback carried state`, raw outcome kinds, plugin error codes), and its literal is a `dist-grep` needle proving it is absent from production builds. B would put a walk instrument in a shipping bundle. | B needs the needle retired from `dist-grep.sh:127` and a new argument for why a diagnostic readout belongs on a rower's screen. Not recommended and not planned. |
| **v** | e2e fake-Concept2 scope | **A** `page.route` interception in Playwright + one real cross-layer seam test at the integration layer. **B** a fake C2 HTTP service in compose, `C2_LINK_ENABLED=1` in the e2e overlay. | **A.** B costs a fake Concept2 HTTP service, an image for it, and `C2_LINK_ENABLED=1` exported from `scripts/e2e.sh` — for coverage that Task 10's integration test already provides at the layer that matters (server writes → client predicate reads, over real Postgres). A's `page.route` has in-repo precedent (`e2e/onboarding.spec.ts:379-383`, `e2e/log.spec.ts:1015`). **Correction, folded 2026-09-03:** B does NOT require editing `scripts/compose-env.test.sh` — that script lives at the repo root and renders `docker compose config` in its OWN environment, so an `export` inside `e2e.sh` never reaches it and its `C2_LINK_ENABLED: ""` assertion keeps passing. The gate is not the obstacle; the service, the image and the OAuth-shaped fake are. | B is the only way to exercise the web OAuth hop end to end. It is a legitimate want; it is its own PR, and this plan names it as a follow-on rather than smuggling it in. |

Two further items the amendment asks James to approve but which need no code branch: the six copy/shape changes in its §0, and the new states it draws — 1f needs-reauth, 1g update-required, 1h unavailable, **1i the read failed**, **1j the unlink was refused**, 2f row-level reconnect, **2c-b sent with no link-out**, **2h Concept2 won't take this row**, **2i no weight on Concept2**, and the REASON lines.

**Three of those were added on 2026-09-03, and each replaces a state the earlier drawing got WRONG rather than one it merely lacked:** 2c-b replaces a SENT row that showed no result id at all when the server sent no logbook origin — the durable evidence an earlier amendment change had just declared load-bearing; 2h replaces a block that vanished under the rower's finger on a 422, which is the one answer meaning our two eligibility predicates disagree; and **2i is the ruling's own state** — the one place the rower is told that the class we no longer ask for is missing where it now lives, with a button that takes them there. **1i is the one that changes what a rower is TOLD** rather than how something looks: an earlier revision of the amendment drew a refused read as absence, which says "this deployment has no Concept2" to a rower whose deployment does.

**1k is retired by the same ruling.** It existed to re-ask for a stored class that `normalizeLink` could not read back. There is no stored class and no ask, so RECONNECT is disabled on `busy` alone.

## Wire contract summary (what this PR builds against)

Read at `3e15378e`. PR2 keys on `body.error`, never on status alone — **409 carries three different meanings** on the upload route.

| route | success | failures this surface renders |
| --- | --- | --- |
| `GET /api/concept2/link` (`routes/concept2.ts:519-548`) | `200 {available:false}` (flag off, HTTP 200 on purpose — `:524-529`) · `200 {available:true, linked:false}` · `200 {available:true, linked:true, weightClass, c2UserId, needsReauth}` — **after Task 3: `weightClass` is GONE and `c2Username`, `logbookBaseUrl` are added** | 401; 400 `ambiguous_auth` |
| `POST /api/concept2/connect` (`:218-283`) — via `startLink`, never called directly | `200 {authorizeUrl, state}` | 403 `unavailable`; **409 `update_required`** (`:244-247`). **After Task 3 the `400 field:"weightClass"` refusal is GONE** — the body carries no class and an old client that still sends one is ignored, not refused (ruling i) |
| `DELETE /api/concept2/link` (`:550-565`) | `204`, idempotent (deleting an absent link still 204s) | 403 `unavailable`; 401 |
| `POST /api/concept2/results/:logId` (`:569-906`) | `200 {resultId}` from the already-sent short-circuit at `:627-630`; **after Task 3 a fresh send answers `200 {resultId, weightClass, weightClassSource}`** (ruling R2) | **409 `duplicate`** + `c2ResultId` (`:896-898`) · **409 `needs_reauth`** (`:617-620`, `:848`) · **409 `unlinked`** (`:614`) · 422 `not_eligible` + `reason` (`:636`) · **422 `no_weight_class` + `reason` (NEW, Task 3)** · 403 `unavailable` (`:576`) · 404 (`:585`, `:609`) · 400 `field:"tz"` (`:596-601`) · 502 `c2_error` — **which Task 3 gives a second producer: a failed declaration or profile read, reported as the retryable thing it is rather than fallen through** |

**The two 422s are siblings and the client must tell them apart, because only one of them is fixable and the fix is not here.** `not_eligible` is decided locally from the row (source, close reason, totals) before any wire call; `no_weight_class` is decided from Concept2's own side, needs a token, and is repaired on Concept2's website — which is why 2i carries a link-out and 2h does not. Both key on `body.error`, never on the 422 alone.

**`no_weight_class` carries FOUR reason tokens, not two**, and they are wire vocabulary the client renders in its own words: `no_weight` (absent, or zero), `unreadable_weight` (present and unparseable — Concept2's API is Laravel and the read field is undocumented, so a `"7500"` string is a live possibility), `implausible_weight` (outside 30-300 kg, which is what a wrong UNIT looks like from here), `no_gender` (a profile Concept2's two-value, gendered definition cannot classify at all).

**FOUR tokens, THREE renderings, and every rendering is DRAWN on the Gate 0 page** (amendment 2i; Task 5's `noWeightCopy` is the mapping). The grouping is by what the rower can do about it, and two of the three sentences say what WE could not do rather than what they should fix:

- `no_weight` — a genuinely absent weight is theirs to set, so this one names the repair.
- `unreadable_weight` + `implausible_weight` — one rendering. An implausible number is most likely OUR unit inference being wrong (observation 24), so the copy must not assert that the rower's weight is bad.
- `no_gender`, **and any token this client does not recognise** — one rendering: we could not work a class out. It does not say "set your weight" (that rower's weight is not the broken thing) and it does not name the logbook, because 2i's only control opens the PROFILE and copy may never name a destination its control cannot reach.

**There is no fifth sentence.** An unrecognised token reuses the third rendering rather than getting a fallback of its own, so the set of sentences the route can produce is exactly the set the gate drew.

**A FAILED declaration read answers `502 {error:"c2_error"}`, not a fall-through and not a new token.** It is rendered by the existing "couldn't reach Concept2" family with a Send again — the same words a failed `postResult` gets, because it is the same fact from the rower's side. A distinct wire token would need a distinct drawn sentence for a state whose only honest advice is "try again"; what the operator needs instead is the log line below, which names the layer.

**The route logs one structured line per send.** There is no logging in this route today (`grep -n "console\." server/routes/concept2.ts` returns nothing at `1d08ab46`), so nothing tells an operator which of the three producers answered or that a read failed at all. One line, following `server/auth/middleware.ts`'s `auth_disagreement` convention (`console.warn(JSON.stringify({event, …}))`, the nearest sibling in the same request path) — `console.log` when a class resolved, `console.warn` when it did not. It carries the resolved source, the count of the rower's returned rows that were OUR OWN writes, and on failure the layer that failed with its status. **Never a token, never a result body, never anything from another rower's rows.**

**The two new 200 fields are read DEFENSIVELY by the client, not required.** An older image mid rolling deploy answers a bare `{resultId}`, and a SENT row with no provenance line is correct there — it is exactly what a later mount renders anyway, since nothing about the class is stored.

One route outside the Concept2 namespace is in scope, because Task 6 is its first client producer:

| route | fields Task 6 adds to the body | refusals |
| --- | --- | --- |
| `POST /api/logs` (`routes/data.ts:1705-1715`, `:1754-1755`) | `completedAt` (ISO 8601 string or null) · `tz` (canonical IANA zone or null) | 400 `field:"completedAt"` on a malformed stamp; 400 `field:"tz"` on anything not in `Intl.supportedValuesOf("timeZone")` plus `"UTC"`. A PARSEABLE stamp outside the plausible band is NOT a refusal: `checkCompletedAt` returns `{ok:true, value:null}` and the save survives with no stamp. |

`adapters/linkFlow.ts`'s `startLink() → LinkOutcome` (**Task 2 drops its only argument** — ruling i), **17 members** (`:79-106`: linked, navigating, declined, malformed, stateMismatch, exchangeFailed, serverError, mintFailed, updateRequired, busy, cancelled, abandoned, noWindow, noContext, contextInvalid, pluginError, networkError). Task 2's `busy` split WIDENS that member rather than adding one, so the count is unchanged by this PR. Every member's card treatment is tabulated in the amendment's §1e.

Eligibility, server-side and authoritative (`server/concept2/mapping.ts:60-72`): `source === "pm5"` AND `endedBy === "finished"` AND `workSeconds !== null` AND `workMeters !== null`. **Measured audience:** 6 of 20 prod rows pass this fence (`docs/monitor/c2-crossconnect-2026-09/README.md`, "Eligible-population count", recounted at #244 finding 4).

## Lifetime table (RF27)

Every piece of state this PR introduces, with its mint site, its clear sites, and what survives each boundary. **The invariants, stated first, because a mechanism is not an invariant:**

- **I1.** The card's view of the link is never inferred from an outcome. After every attempt the card re-reads `GET /api/concept2/link` and renders what the SERVER says. An outcome saying `linked` while the server disagrees must render as not-linked.
- **I2.** The unlink arm is armed by exactly one tap and disarmed by exactly one of: a second tap, four seconds elapsing, or the card unmounting. It can never survive a navigation away from You.
- **I3.** A row's sent state is a fact about the row and the LIVE link together. It is re-derived on every render from `(row.c2ResultId, row.c2UserId, link.c2UserId)` and is never cached across a link change.
- **I4.** **The weight class is never our state, at any lifetime.** There is no draft, no column, no cache, and no field on any request body this app composes from rower input. It is resolved from Concept2 on the send that uses it and discarded with the response — so a rower who declares a different class, or changes their weight, on Concept2 gets the new class on their next send, with nothing of ours to go stale. The only lifetime question this invariant can be asked is "where is it stored?", and the answer is "nowhere, by construction".
- **I4c (observation 29).** **We never read our own writes back as the rower's declaration.** The declaration read excludes every Concept2 result id this app wrote for the currently linked account, and when every candidate row is ours the answer is "no declaration" — the resolution falls through to the profile and still reports `profile` as its source. The state this rests on is not new and has no lifetime of its own: `session_logs.c2_result_id`/`c2_user_id` are the columns PR1 already writes, read fresh on each send. **The invariant is not "prefer a row we did not write"; it is that a class we produced can never come back to us wearing the rower's name.**
- **I4b (ruling R13).** **One resolution per REQUEST; never one per deployment, session, or link.** The class is read fresh on every send, because it is the rower's DECLARATION and it can change on Concept2 at any moment with no signal to us — a cached class writes a wrong competition category into a record we cannot edit, which is the exact failure observation 26 is about, and caching it would mean re-adding a stored column this PR is dropping. What IS reused is the single resolution across the route's internal 401 retry: re-reading between two attempts at the same row could send two different classes for one send, which is the split-authority defect I4 exists to prevent. **The measured cost of the ruling, stated plainly:** one send goes from one Concept2 round trip to two (about +220 ms when the declaration answers, +440 ms when the profile fallback also runs — laptop medians, observation 27), on a human-initiated action that already renders a SENDING state. Sends are one per workout, never on a render or a poll. If the auto-upload follow-on ever sends a batch, it resolves ONCE per batch, not once per row.
- **I5.** The card's view of the link is refreshed on every occasion the DOCUMENT becomes visible to the rower again, not only on mount. A restore that skips mounting must not leave a stale panel on screen (observation 19). The refresh is idempotent: it re-reads and re-renders, and it never mints, retries or cancels anything.
- **I5b.** After a RESTORE, no attempt state from before the document unloaded is still on screen. Re-reading the link alone does not discharge I5, because the panel the rower is stuck behind is drawn from the ATTEMPT (`outcome`/`busy`), not from the link: a restore preserves the JS heap, so a web attempt the rower DECLINED comes back with `outcome` still `navigating` and renders a buttonless OPENING CONCEPT2 panel with no Try again, forever. The half that fixes the succeeded case and the half that fixes the declined case are two different pieces of state and both are owed.
- **I6.** Every failure the rower can act on carries a discriminator. A read that failed says so and offers a retry; an unlink that failed says the link is unchanged. Neither is allowed to render as its own success, and neither is allowed to render as `unavailable`, which means something else entirely.

| State | Owner | Mint site | Clear sites | Survives unmount? | Survives relaunch? | Survives a link change? |
| --- | --- | --- | --- | --- | --- | --- |
| `link` (`Concept2Link \| null`) | `useConcept2Link` | mount effect's `reload()`, and every later `reload()` | replaced by every successful `reload()`; `null` only before the first read resolves | no | no | it IS the link |
| `failed` (`LinkReadFailure \| null`) | `useConcept2Link` | a non-`ok` response, or the `reload()` catch | set to `null` by any successful `reload()` | no | no | n/a |
| the attempt-clear `pageshow` listener (I5b) | `Concept2Card` | a mount-only effect with an empty dep array | that effect's cleanup (`removeEventListener`), on unmount and on nothing else | no | no | n/a: it clears an attempt, it does not hold a link |
| the `pageshow` + `visibilitychange` listeners | `useConcept2Link` | the same effect that runs the first `reload()`, via `window.addEventListener` | that effect's cleanup (`removeEventListener` for both), which runs on unmount and on nothing else — the effect's dep array is `[reload]` and `reload` is a `useCallback` with an empty dep array, so it is minted once per mount | no — removed on unmount, which is what stops a dead card re-reading | no | n/a: it observes the link, it does not hold one |
| `outcome` (`LinkOutcome \| null`) | `Concept2Card` | `startLink` resolving | set to `null` at the start of each `connect()`; cleared by a successful unlink; cleared on `pageshow` (I5b); unmount | no | no | superseded by the next attempt |
| `busy` | `Concept2Card` | `connect()` / `unlink()` entry | those functions' `finally` — every exit, never only the happy one; and `pageshow` (I5b), for the case where the document unloaded mid-attempt and no `finally` ever ran | no | no | n/a |
| `unlinkFailed` (`number \| null`, the refusing status) | `Concept2Card` | `unlink()`'s `else` branch, and its `catch` | set to `null` at the start of every `unlink()`; a successful unlink; unmount | no | no | n/a |
| `armed` + `disarmRef` timer | `Concept2Card` | `arm()` (one tap) | `disarm()` in `unlink()`'s `finally` — EVERY exit, refusals included, because "a second tap" is I2's own first disarmer and it has already happened — plus the 4 s timeout and the unmount cleanup (`useEffect(() => disarm, [disarm])`) | **no — cleared on unmount, which is I2's whole point** | no | n/a |
| `send` (`SendState`) | `Concept2SendBlock` | `post()` entry | replaced by each response; unmount | no | no | recomputed against the fresh link (I3) |
| `linkInFlight` | `adapters/linkFlow.ts` module scope | `startLink` entry (`:289`) | `startLink`'s `finally` (`:328-332`) | **yes — module scope survives component unmount** | no (a WebView reload destroys the module) | n/a |

**The `weightClass` draft row is GONE from this table, by ruling (i), and its absence is the point.** An earlier revision carried a per-mount draft minted by a tap on a radiogroup and cleared on unlink. There is no radiogroup, no draft, and no clear site, because the class is never ours to hold (I4). The one state the ruling ADDS is a `SendState` member on the block that already has one (Task 5/7) — not a new lifetime.

`linkInFlight` is the one piece of state that outlives the card, and deliberately: its own comment (`linkFlow.ts:108-113`) records that the AUTHORITY on "one link session per app process" is Swift's `activeSession`, and this flag exists only so a double-tap in one document does not mint twice. **This PR adds no module-scoped state of its own.**

**Web APIs this PR uses, against `IPHONEOS_DEPLOYMENT_TARGET = 15.0`** (`ios/App/App.xcodeproj/project.pbxproj:247`), per RF27:

- `window.open` (Task 2, web arm only) — universally available; the native arm never reaches it.
- `visibilitychange` / `document.visibilityState` (Task 1) — **already shipped in this app at this floor**: `src/adapters/appLifecycle.ts:76-80` and `src/adapters/keepAwake.ts` both subscribe to it on the web arm, on builds that have been through TestFlight. In-repo precedent, not a claim about WebKit (PRIMARY, this repo).
- `pageshow` (Task 1's hook AND Task 4's card) — no in-repo precedent, and no primary WebKit availability line is quoted here, so treat its presence as UNCONFIRMED at the floor (INFERENCE only). **The design does not depend on it:** both listeners are purely additive, so if `pageshow` never fires the card behaves exactly as it does today — a mount-only read, and an attempt panel that clears on the next mount — and nothing regresses. **`visibilitychange` is deliberately NOT used for the attempt clear**, only for the link re-read: it fires whenever the app returns to the foreground, including the instant the native consent sheet dismisses, unordered against `startLink`'s promise resolving — so clearing there would race `setOutcome` and could wipe the failure panel a declined native link had just drawn. `pageshow` cannot fire while an attempt is live in the same document, which is exactly why it is the safe one. That is why it ships without a floor citation rather than waiting for one. The implementer states in the task report whether the e2e Back case (Task 11) actually observed the refresh, which is the only evidence this repo can produce for it.

---

## Task 0: Gate 0 — the amendment, approved before anything is built

**This is a gate, not a build step. No task below starts until it returns APPROVED.**

**Files:**
- Already written: `docs/design/handoffs/2026-08-31-concept2-connect/amendment-2026-09-03.html`

**Interfaces:**
- Produces: James's ruling on (ii)-(v) — **(i) is already RULED, 2026-09-03** — on the amendment's six copy/shape changes, and on every new state it draws (1f, 1g, 1h, 1i, 1j, 2f, **2c-b**, **2h**, **2i**, and the REASON lines). Every task below cites the amendment for its copy.

- [ ] **Step 1: Present the rendered artifact.** Open `docs/design/handoffs/2026-08-31-concept2-connect/amendment-2026-09-03.html` in a browser beside the approved board (`Concept2 connect.dc.html`). Both orientations are rendered at real proportions in the file itself; no scaling, no description substitutes for opening it.

- [ ] **Step 2: STOP.** The gate is the approval, not the presentation (CLAUDE.md). Do not proceed on "looks fine" or on silence.

- [ ] **Step 3: Record the rulings** in the amendment's §6 and in the handoff README's "Approved amendments" list, in the same commit. Where a ruling goes against this plan's recommendation, apply the "If the other" column before starting Task 1.

---

## Task 1: The link hook and the card's pure model

**Files:**
- Create: `app/src/api/useConcept2Link.ts`
- Create: `app/src/you/concept2CardModel.ts`
- Test: `app/src/api/useConcept2Link.test.ts`, `app/src/you/concept2CardModel.test.ts`

**Interfaces:**
- Consumes: `LinkOutcome` from `adapters/linkFlow` (Task 2 widens `busy` and drops `weightClass` from the `linked` member; write this task's `describeFailure` against the widened member and land Task 2 first, or land them in one commit). **`WeightClass` is NOT consumed and no longer exists on the client** — ruling (i) removes the type from `adapters/linkFlow.ts` altogether.
- Produces: `Concept2Link`, `LINK_UNAVAILABLE`, `LinkReadFailure`, `normalizeLink(body: unknown): Concept2Link`, `useConcept2Link(): { link, failed, reload }`; `FAILED_LINE`, `LinkFailure`, `identityLine(link, email): string`, `describeFailure(outcome): LinkFailure | null`.

**`setLink` is deliberately NOT exported.** Invariant I1 says the card never infers the link from an outcome, and a setter on the hook is the one affordance that would let a future caller do exactly that. Every write to `link` goes through `reload()`, which reads the server. Nothing in this PR wanted the setter; it was on the interface only because the draft listed it.

- [ ] **Step 1: Write the failing tests.** `app/src/you/concept2CardModel.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import type { LinkOutcome } from "../adapters/linkFlow";
import { LINK_UNAVAILABLE, type Concept2Link } from "../api/useConcept2Link";
import { describeFailure, identityLine, FAILED_LINE } from "./concept2CardModel";

const LINKED: Concept2Link = {
  ...LINK_UNAVAILABLE,
  available: true,
  linked: true,
  c2UserId: 2211,
  c2Username: "jamesawesome",
  logbookBaseUrl: "https://log-dev.concept2.com",
};

describe("identityLine (Gate 0 amendment 1c)", () => {
  it("names the Concept2 username and the Ergomatic email, in the callback page's order", () => {
    expect(identityLine(LINKED, "james@jamestheaweso.me")).toBe(
      "Concept2 jamesawesome · Ergomatic james@jamestheaweso.me",
    );
  });

  it("falls back to the numeric account when no username is stored", () => {
    expect(
      identityLine({ ...LINKED, c2Username: null }, "james@jamestheaweso.me"),
    ).toBe("Concept2 account #2211 · Ergomatic james@jamestheaweso.me");
  });

  it("falls back for an EMPTY username too, which is a different shape from a missing one", () => {
    // Observation 18: `client.ts`'s `fetchMe` returns
    // `typeof data?.username === "string" ? data.username : null`, so the
    // empty string is a STRING and reaches the card intact. A `??` guard
    // would render "Concept2  · Ergomatic james@…" — a blank where the
    // account-injection mitigation is supposed to name an account.
    expect(
      identityLine({ ...LINKED, c2Username: "" }, "james@jamestheaweso.me"),
    ).toBe("Concept2 account #2211 · Ergomatic james@jamestheaweso.me");
  });

  it("says the word 'account' with no number when there is no id either", () => {
    expect(
      identityLine(
        { ...LINKED, c2Username: "", c2UserId: null },
        "james@jamestheaweso.me",
      ),
    ).toBe("Concept2 account · Ergomatic james@jamestheaweso.me");
  });
});

describe("describeFailure (Gate 0 amendment, the LinkOutcome table)", () => {
  it("returns null for the outcomes that are not failures", () => {
    const notFailures: LinkOutcome[] = [
      { kind: "linked", c2UserId: 2211, stateEchoed: true },
      { kind: "navigating" },
      { kind: "cancelled" },
      { kind: "updateRequired" },
      { kind: "busy", source: "guard" },
    ];
    for (const outcome of notFailures) {
      expect(describeFailure(outcome)).toBeNull();
    }
  });

  it("separates the two busy sources, which the union previously could not", () => {
    expect(describeFailure({ kind: "busy", source: "guard" })).toBeNull();
    expect(describeFailure({ kind: "busy", source: "sheet" })?.reason).toBe(
      "A LINK IS ALREADY OPEN · CLOSE IT AND TRY AGAIN",
    );
  });

  it("gives a declined link its own line, not the generic one", () => {
    const failure = describeFailure({ kind: "declined", stateEchoed: false });
    expect(failure?.line).toBe(
      "You cancelled at Concept2. Nothing was linked, nothing was saved.",
    );
    expect(failure?.reason).toBe("DECLINED AT CONCEPT2");
  });

  it("gives already_linked_elsewhere its own line and keeps every other exchange failure generic", () => {
    expect(
      describeFailure({
        kind: "exchangeFailed",
        status: 409,
        error: "already_linked_elsewhere",
        stateEchoed: true,
      })?.line,
    ).toBe(
      "That Concept2 account is already connected to a different Ergomatic account.",
    );
    const other = describeFailure({
      kind: "exchangeFailed",
      status: 400,
      error: "invalid_state",
      stateEchoed: true,
    });
    expect(other?.line).toBe(FAILED_LINE);
    expect(other?.reason).toBe("CONCEPT2 REFUSED THE EXCHANGE · 400");
  });

  it("carries the status into the reason for every server-hop failure", () => {
    expect(
      describeFailure({ kind: "mintFailed", status: 403, error: "unavailable" })
        ?.reason,
    ).toBe("COULDN'T START THE LINK · 403");
    expect(
      describeFailure({ kind: "serverError", status: 502, stateEchoed: false })
        ?.reason,
    ).toBe("ERGOMATIC'S SERVER DIDN'T ANSWER · 502");
  });

  it("carries the plugin's own code, which reaches no server log at all", () => {
    expect(
      describeFailure({ kind: "pluginError", code: "cannotStart", message: "x" })
        ?.reason,
    ).toBe("THIS DEVICE COULDN'T OPEN CONCEPT2 · CANNOTSTART");
  });

  it("uses no em-dash in any user-facing string (house style)", () => {
    const every: LinkOutcome[] = [
      { kind: "declined", stateEchoed: false },
      { kind: "abandoned" },
      { kind: "stateMismatch" },
      { kind: "malformed", stateEchoed: false },
      { kind: "networkError", message: "boom" },
      { kind: "noWindow" },
      { kind: "busy", source: "sheet" },
    ];
    for (const outcome of every) {
      const failure = describeFailure(outcome);
      expect(failure?.line).not.toContain("—");
      expect(failure?.reason).not.toContain("—");
    }
  });
});
```

  And `app/src/api/useConcept2Link.test.ts`:

**`toStrictEqual`, never `toEqual`** in every test block this plan prescribes: `vitest/prefer-strict-equal` is on in `eslint.config.js` and fired on this file's original draft. Likewise no assertion inside an `if`/`for` (`vitest/no-conditional-expect`) — where a loop is wanted, assert on a mapped array instead.

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { normalizeLink, LINK_UNAVAILABLE } from "./useConcept2Link";

// `document.visibilityState` is replaced with `Object.defineProperty`, which
// `vi.restoreAllMocks()` does NOT undo — the stub would leak to every later
// test in this file. Capture the original descriptor once and put it back in
// `afterEach`, the same shape `adapters/appLifecycle.test.ts` and
// `adapters/keepAwake.test.ts` already use.
const VISIBILITY_DESCRIPTOR = Object.getOwnPropertyDescriptor(
  Document.prototype,
  "visibilityState",
);

function stubVisibility(value: DocumentVisibilityState): void {
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    get: () => value,
  });
}

beforeEach(() => {
  vi.resetModules();
  vi.restoreAllMocks();
});
afterEach(() => {
  vi.doUnmock("../api");
  delete (document as unknown as Record<string, unknown>).visibilityState;
  if (VISIBILITY_DESCRIPTOR !== undefined) {
    Object.defineProperty(
      Document.prototype,
      "visibilityState",
      VISIBILITY_DESCRIPTOR,
    );
  }
});

describe("normalizeLink (routes/concept2.ts:519-548's three response shapes)", () => {
  it("reads a flag-off 200 as unavailable, never as unlinked", () => {
    // routes/concept2.ts:524-529 answers {available:false} with HTTP 200 on
    // purpose, so a flag-off server would otherwise read exactly like an
    // unlinked one (Concept2LinkProbe.tsx:118-121 names the same trap).
    expect(normalizeLink({ available: false })).toStrictEqual(LINK_UNAVAILABLE);
  });

  it("reads available-but-unlinked", () => {
    const link = normalizeLink({ available: true, linked: false });
    expect(link.available).toBe(true);
    expect(link.linked).toBe(false);
    expect(link.c2UserId).toBeNull();
  });

  it("reads the full linked shape", () => {
    expect(
      normalizeLink({
        available: true,
        linked: true,
        c2UserId: 2211,
        c2Username: "jamesawesome",
        needsReauth: true,
        logbookBaseUrl: "https://log-dev.concept2.com",
      }),
    ).toStrictEqual({
      available: true,
      linked: true,
      c2UserId: 2211,
      c2Username: "jamesawesome",
      needsReauth: true,
      logbookBaseUrl: "https://log-dev.concept2.com",
    });
  });

  it("drops a weightClass an old server still sends, rather than letting one into the client at all", () => {
    // Ruling (i): the class is never ours. During a rolling deploy a
    // client can meet a server instance that has not restarted and still
    // emits the key. `toStrictEqual` is what makes this bite — the
    // normalizer builds a fresh object rather than spreading `raw`, so
    // there is no path for a class to enter the client's shape.
    expect(
      normalizeLink({
        available: true,
        linked: true,
        weightClass: "L",
        c2UserId: 2211,
      }),
    ).toStrictEqual({
      available: true,
      linked: true,
      c2UserId: 2211,
      c2Username: null,
      needsReauth: false,
      logbookBaseUrl: null,
    });
  });

  it("reads an EMPTY username as no username, which is a different shape from a missing one", () => {
    // Observation 18. `""` is a string, so a `typeof === "string"` guard
    // alone lets it through and the identity line renders a blank where an
    // account name belongs.
    const link = normalizeLink({
      available: true,
      linked: true,
      c2UserId: 2211,
      c2Username: "",
    });
    expect(link.c2Username).toBeNull();
  });

  it("reads an EMPTY logbook origin as no origin, so no link-out is built on our own domain", () => {
    // The same absent/empty/valued rule as the username above, one field
    // over. `server/index.ts` reads `C2_BASE_URL || <default>`, but a `""`
    // arriving here anyway must not survive: `c2ResultUrl("", 2211, 339)`
    // is `/profile/2211/log/339`, a RELATIVE url that opens on Ergomatic's
    // own origin.
    const link = normalizeLink({
      available: true,
      linked: true,
      c2UserId: 2211,
      logbookBaseUrl: "",
    });
    expect(link.logbookBaseUrl).toBeNull();
  });

  it("degrades every unknown field rather than trusting it", () => {
    const link = normalizeLink({
      available: true,
      linked: true,
      c2UserId: "2211",
      c2Username: 7,
      logbookBaseUrl: 3,
    });
    expect(link.c2UserId).toBeNull();
    expect(link.c2Username).toBeNull();
    expect(link.logbookBaseUrl).toBeNull();
    expect(link.needsReauth).toBe(false);
  });

  it("reads a non-object body as unavailable", () => {
    expect(normalizeLink(null)).toStrictEqual(LINK_UNAVAILABLE);
    expect(normalizeLink("nope")).toStrictEqual(LINK_UNAVAILABLE);
  });
});

describe("useConcept2Link read failures (Gate 0 amendment 1i)", () => {
  it("reports the STATUS of a refused read, so the card can print a discriminator", async () => {
    // `api()` resolves on any status (`src/api.ts` — it does not throw on
    // non-2xx), so a 502 arrives as a normal resolution and has to be
    // turned into a failure explicitly. The status is what a tester
    // reporting "the Concept2 card is broken" carries back.
    const api = vi.fn(
      async () => new Response("<html>502</html>", { status: 502 }),
    );
    vi.doMock("../api", () => ({ api }));
    const { useConcept2Link } = await import("./useConcept2Link");
    const { result } = renderHook(() => useConcept2Link());
    await waitFor(() => expect(result.current.failed).not.toBeNull());
    expect(result.current.failed?.status).toBe(502);
    expect(result.current.link).toBeNull();
  });

  it("refuses a non-2xx that carries a perfectly good JSON body, rather than parsing it as a link", async () => {
    // The probe that gives `if (!res.ok)` something to guard. A 401 whose
    // body is JSON parses fine, so the ok-check is the ONLY thing standing
    // between an auth refusal and `normalizeLink` quietly reading it as
    // "no Concept2 on this deployment".
    const api = vi.fn(
      async () =>
        new Response(JSON.stringify({ error: "unauthorized" }), {
          status: 401,
          headers: { "Content-Type": "application/json" },
        }),
    );
    vi.doMock("../api", () => ({ api }));
    const { useConcept2Link } = await import("./useConcept2Link");
    const { result } = renderHook(() => useConcept2Link());
    await waitFor(() => expect(result.current.failed).not.toBeNull());
    expect(result.current.failed?.status).toBe(401);
    expect(result.current.link).toBeNull();
  });

  it("keeps the STATUS when a 200 answers with something that is not JSON at all", async () => {
    // A proxy or an old image mid rolling deploy answers 200 with HTML.
    // The connection plainly worked, so REASON: NO CONNECTION would be a
    // lie; the parse failure is caught on its own and reports 200.
    const api = vi.fn(
      async () =>
        new Response("<html>hello</html>", {
          status: 200,
          headers: { "Content-Type": "text/html" },
        }),
    );
    vi.doMock("../api", () => ({ api }));
    const { useConcept2Link } = await import("./useConcept2Link");
    const { result } = renderHook(() => useConcept2Link());
    await waitFor(() => expect(result.current.failed).not.toBeNull());
    expect(result.current.failed?.status).toBe(200);
    expect(result.current.link).toBeNull();
  });

  it("reports a null status when the request never completed at all", async () => {
    const api = vi.fn(async () => Promise.reject(new Error("offline")));
    vi.doMock("../api", () => ({ api }));
    const { useConcept2Link } = await import("./useConcept2Link");
    const { result } = renderHook(() => useConcept2Link());
    await waitFor(() => expect(result.current.failed).not.toBeNull());
    expect(result.current.failed?.status).toBeNull();
  });

  it("clears the failure on the next successful read, rather than latching it", async () => {
    let ok = false;
    const api = vi.fn(async () =>
      ok
        ? new Response(JSON.stringify({ available: true, linked: false }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          })
        : new Response("nope", { status: 500 }),
    );
    vi.doMock("../api", () => ({ api }));
    const { useConcept2Link } = await import("./useConcept2Link");
    const { result } = renderHook(() => useConcept2Link());
    await waitFor(() => expect(result.current.failed).not.toBeNull());
    ok = true;
    await act(async () => {
      await result.current.reload();
    });
    expect(result.current.failed).toBeNull();
    expect(result.current.link?.available).toBe(true);
  });
});

describe("useConcept2Link re-reads when the document comes back (observation 19, invariant I5)", () => {
  it("re-reads on pageshow, which is the ONLY event a bfcache restore fires", async () => {
    // A restore does not re-mount, so the mount effect never runs again and
    // a mount-only read would leave the card frozen mid-attempt behind a
    // buttonless OPENING CONCEPT2 panel.
    const api = vi.fn(
      async () =>
        new Response(JSON.stringify({ available: true, linked: false }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
    );
    vi.doMock("../api", () => ({ api }));
    const { useConcept2Link } = await import("./useConcept2Link");
    renderHook(() => useConcept2Link());
    await waitFor(() => expect(api).toHaveBeenCalledTimes(1));
    await act(async () => {
      window.dispatchEvent(new Event("pageshow"));
    });
    await waitFor(() => expect(api).toHaveBeenCalledTimes(2));
  });

  it("re-reads when the document becomes visible, and NOT when it becomes hidden", async () => {
    const api = vi.fn(
      async () =>
        new Response(JSON.stringify({ available: true, linked: false }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
    );
    vi.doMock("../api", () => ({ api }));
    const { useConcept2Link } = await import("./useConcept2Link");
    renderHook(() => useConcept2Link());
    await waitFor(() => expect(api).toHaveBeenCalledTimes(1));

    stubVisibility("hidden");
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(api).toHaveBeenCalledTimes(1);

    stubVisibility("visible");
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await waitFor(() => expect(api).toHaveBeenCalledTimes(2));
  });

  it("stops listening when the card unmounts, so a dead hook never re-reads", async () => {
    const api = vi.fn(
      async () =>
        new Response(JSON.stringify({ available: true, linked: false }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
    );
    vi.doMock("../api", () => ({ api }));
    const { useConcept2Link } = await import("./useConcept2Link");
    const { unmount } = renderHook(() => useConcept2Link());
    await waitFor(() => expect(api).toHaveBeenCalledTimes(1));
    unmount();
    window.dispatchEvent(new Event("pageshow"));
    document.dispatchEvent(new Event("visibilitychange"));
    await Promise.resolve();
    expect(api).toHaveBeenCalledTimes(1);
  });
});
```

  The `document.visibilityState` override idiom above is the repo's own — `src/adapters/appLifecycle.test.ts:12-30` and `src/adapters/keepAwake.test.ts:12-46` both do exactly this. Reuse it rather than inventing a third — **including the half that puts it back.** `vi.restoreAllMocks()` does not undo an `Object.defineProperty`, so a stub left in place leaks to every later test in the file; the block above captures `Document.prototype`'s original descriptor once and restores it in `afterEach`, which is what those two files do and what an earlier draft of this block left out.

- [ ] **Step 2: Run them and confirm they fail.**

```bash
cd /Users/james/projects/github/jamesawesome/Ergomatic-wt-c2pr2/app
NODE_OPTIONS=--no-experimental-webstorage pnpm exec vitest run --project client src/you/concept2CardModel.test.ts src/api/useConcept2Link.test.ts
```
Expected: FAIL, "Failed to resolve import" for both new modules.

- [ ] **Step 3: Create `app/src/api/useConcept2Link.ts`.**

```ts
import { useCallback, useEffect, useState } from "react";
import { api } from "../api";

/** The client's own view of `GET /api/concept2/link`
 *  (`server/routes/concept2.ts:519-548`), declared here rather than
 *  imported from the server, per this codebase's standing convention for
 *  client hooks (`api/useRecentLogs.ts:6-10`). NEVER a token: that
 *  response carries none, by construction (`routes/concept2.ts:541-543`).
 *
 *  Every field is required-and-nullable rather than optional. The route
 *  returns three different shapes and a client that told them apart by
 *  `undefined` would read a flag-off server (`{available:false}`, HTTP
 *  200) exactly like an unlinked one — the trap
 *  `Concept2LinkProbe.tsx:118-121` already names. `normalizeLink` below
 *  collapses all three into one total shape so no consumer has to. */
export interface Concept2Link {
  available: boolean;
  linked: boolean;
  // NO `weightClass`. Ruling (i): the class is Concept2's fact, derived
  // server-side at send time and never stored or shown by us. The route
  // stopped emitting the key in Task 3 and this shape stopped declaring
  // it in the same commit — `scripts/webauth-contract.test.ts` holds the
  // two equal and will not let one move without the other.
  c2UserId: number | null;
  c2Username: string | null;
  needsReauth: boolean;
  /** The Concept2 ORIGIN this deployment talks to, echoed from the
   *  server's own `C2_BASE_URL` (`server/index.ts`). The client cannot
   *  know whether it is `log.concept2.com` or `log-dev.concept2.com`, and
   *  a hardcoded guess 404s the View-on-Concept2 link-out for the whole
   *  sandbox phase (plan observation 5). */
  logbookBaseUrl: string | null;
}

export const LINK_UNAVAILABLE: Concept2Link = {
  available: false,
  linked: false,
  c2UserId: null,
  c2Username: null,
  needsReauth: false,
  logbookBaseUrl: null,
};

export function normalizeLink(body: unknown): Concept2Link {
  if (typeof body !== "object" || body === null) return LINK_UNAVAILABLE;
  const raw = body as Record<string, unknown>;
  if (raw.available !== true) return LINK_UNAVAILABLE;
  if (raw.linked !== true) return { ...LINK_UNAVAILABLE, available: true };
  return {
    available: true,
    linked: true,
    c2UserId: typeof raw.c2UserId === "number" ? raw.c2UserId : null,
    // `!== ""` as well as `typeof`, because ABSENT, EMPTY and VALUED are
    // three cases and only two of them are a username. Concept2's
    // `/users/me` documents `username` optional; `client.ts`'s `fetchMe`
    // passes any string through, empty included (observation 18). An
    // empty string here would render "Concept2  · Ergomatic james@…",
    // which is the account-injection mitigation rendering a blank where
    // it is supposed to name an account.
    c2Username:
      typeof raw.c2Username === "string" && raw.c2Username !== ""
        ? raw.c2Username
        : null,
    needsReauth: raw.needsReauth === true,
    // The SAME absent/empty/valued treatment as `c2Username` one field up,
    // and for a sharper reason: `server/index.ts` reads
    // `process.env.C2_BASE_URL || "https://log-dev.concept2.com"`, and a
    // `""` that reached here anyway would build
    // `/profile/2211/log/339` — a RELATIVE url, which the web arm opens as
    // a new tab on ERGOMATIC's own origin and the native arm hands to
    // `SFSafariViewController` as a bare path. A link-out that silently
    // points at ourselves is worse than no link-out, so `""` degrades to
    // `null` and the button does not render.
    logbookBaseUrl:
      typeof raw.logbookBaseUrl === "string" && raw.logbookBaseUrl !== ""
        ? raw.logbookBaseUrl
        : null,
  };
}

/** Why a read failed, in the only terms the card can show a rower.
 *  `status` is the HTTP status the read came back with, or `null` when the
 *  request never completed at all (offline, DNS, an aborted fetch). It
 *  exists because a card that says only "something went wrong" costs a
 *  walk: `LinkOutcome` already learned that lesson (the REASON lines), and
 *  the read is the one hop that had no discriminator. */
export interface LinkReadFailure {
  status: number | null;
}

/**
 * Reads the link on mount, on demand, and whenever the document comes back
 * in front of the rower.
 *
 * `.then`/`.catch` at the EFFECT boundary rather than an `async` effect
 * body, and NOT stylistic: `react-hooks/set-state-in-effect`
 * (`eslint.config.js`) rejects an effect that reaches a `setState`
 * synchronously, which an `async` function's pre-`await` body is. The
 * effect's first synchronous statement is `api(...)`, so the rule is
 * satisfied; the `.then` CALLBACK being `async` is fine, since it runs a
 * microtask later. This is the repo's own mount-fetch idiom
 * (`WorkoutDetail.tsx:52`, `Concept2LinkProbe.tsx:150-162`).
 *
 * `api()` does not throw on a non-2xx (`src/api.ts`), so a 401 or a 502
 * arrives here as an ordinary resolution and is turned into a failure
 * explicitly. THREE outcomes, not two, because a 200 whose body is not
 * JSON is a real case (a proxy or an old image answering an HTML error
 * page mid rolling deploy — `adapters/linkFlow.ts:124-127` names it): the
 * parse is caught SEPARATELY so it reports the status the response
 * genuinely carried. Letting it fall to the outer `.catch` would print
 * REASON: NO CONNECTION over a request that plainly connected.
 *
 * `failed` exists because a dropped request must not leave a stale `link`
 * on screen reading as a state nobody observed. It is NOT the same thing
 * as `available: false`: the server saying "this deployment has no
 * Concept2" is a capability answer and renders nothing, while a read that
 * failed is a fault the rower can retry (Gate 0 amendment 1h vs 1i).
 *
 * `pageshow` and `visibilitychange` (invariant I5, observation 19): the
 * web arm's `startLink` unloads the document, and the rower comes back by
 * Back. A browser that RESTORES the page from the back-forward cache runs
 * no mount, so a mount-only read leaves a buttonless OPENING CONCEPT2
 * panel over a link that already succeeded. `pageshow` is the one event
 * that fires on a restore as well as on a load. Both listeners are purely
 * additive: if neither ever fires, this hook behaves exactly as a
 * mount-only read, so nothing depends on their availability.
 */
export function useConcept2Link(): {
  link: Concept2Link | null;
  failed: LinkReadFailure | null;
  reload: () => Promise<void>;
} {
  const [link, setLink] = useState<Concept2Link | null>(null);
  const [failed, setFailed] = useState<LinkReadFailure | null>(null);

  const reload = useCallback(
    () =>
      api("/api/concept2/link")
        .then(async (res) => {
          if (!res.ok) {
            setFailed({ status: res.status });
            return;
          }
          let body: unknown;
          try {
            body = (await res.json()) as unknown;
          } catch {
            setFailed({ status: res.status });
            return;
          }
          setLink(normalizeLink(body));
          setFailed(null);
        })
        .catch(() => {
          setFailed({ status: null });
        }),
    [],
  );

  useEffect(() => {
    void reload();
    const onPageShow = () => void reload();
    const onVisibility = () => {
      // Only on the way BACK IN. Re-reading as the document hides would
      // fire a request nobody is waiting for and, on the web arm, would
      // race the unload the OAuth hop is in the middle of.
      if (document.visibilityState === "visible") void reload();
    };
    window.addEventListener("pageshow", onPageShow);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("pageshow", onPageShow);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [reload]);

  return { link, failed, reload };
}
```

- [ ] **Step 4: Create `app/src/you/concept2CardModel.ts`.**

```ts
import type { LinkOutcome } from "../adapters/linkFlow";
import type { Concept2Link } from "../api/useConcept2Link";

/** Board 1e, verbatim and gate-approved. Every failure that is not
 *  specifically about the rower's own choice reads this line. */
export const FAILED_LINE =
  "The connection didn't complete. Nothing was linked, nothing was saved.";

export interface LinkFailure {
  line: string;
  reason: string | null;
}

/** Gate 0 amendment 1c. Same order the Linked callback page uses
 *  ("Concept2 X is now connected to Ergomatic Y",
 *  `server/concept2/callbackPage.ts:156`), so a rower who just saw that
 *  page recognises this card.
 *
 *  The fallback is `account #<id>` — the SAME spelling the callback page
 *  uses, changed there in Task 3 for exactly this reason. One numeric
 *  identity, spelled one way, on both surfaces.
 *
 *  Guarded on `!== null && !== ""`, not on nullishness. `normalizeLink`
 *  already collapses `""` to `null` on the wire path, and this second
 *  guard is not redundant: `identityLine` is a pure exported function that
 *  a test, a future caller or a hand-built fixture can hand a raw
 *  `Concept2Link`, and observation 18's whole lesson is that this codebase
 *  has already shipped one `??` on this exact value. The doc comment that
 *  claimed "never an empty identity" was on the code that could render
 *  one. */
export function identityLine(link: Concept2Link, email: string): string {
  const c2 =
    link.c2Username !== null && link.c2Username !== ""
      ? link.c2Username
      : link.c2UserId === null
        ? "account"
        : `account #${String(link.c2UserId)}`;
  return `Concept2 ${c2} · Ergomatic ${email}`;
}

/**
 * `LinkOutcome` -> the card's failure copy. The table this implements is
 * the Gate 0 amendment's §1e; nothing here invents a string.
 *
 * TOTAL over the union with no `default`, deliberately: an eighteenth
 * member is a compile error here rather than a silent fall-through to a
 * generic message, which is the same mechanism `domain/types.ts`'s
 * `LogSource` switches rely on (that type's own comment: "total over
 * `LogSource` with no `default`, so a fifth member errors on its own").
 *
 * `busy` splits on `source` because `adapters/linkFlow.ts:148-155` says it
 * must: the JS guard means "your last tap is still working" (not a
 * failure at all) while the plugin's means "a sheet is already up and your
 * fresh mint just superseded the attempt it belongs to" (a failure the
 * rower has to act on).
 */
export function describeFailure(outcome: LinkOutcome): LinkFailure | null {
  switch (outcome.kind) {
    case "linked":
    case "navigating":
    case "cancelled":
    case "updateRequired":
      return null;
    case "busy":
      return outcome.source === "guard"
        ? null
        : {
            line: FAILED_LINE,
            reason: "A LINK IS ALREADY OPEN · CLOSE IT AND TRY AGAIN",
          };
    case "declined":
      return {
        line: "You cancelled at Concept2. Nothing was linked, nothing was saved.",
        reason: "DECLINED AT CONCEPT2",
      };
    case "abandoned":
      return { line: FAILED_LINE, reason: "THE BROWSER LEFT THE LINK" };
    case "stateMismatch":
      return {
        line: FAILED_LINE,
        reason: "THE RETURN DIDN'T MATCH THIS ATTEMPT",
      };
    case "malformed":
      return {
        line: FAILED_LINE,
        reason: "CONCEPT2 SENT SOMETHING WE COULDN'T READ",
      };
    case "exchangeFailed":
      return outcome.error === "already_linked_elsewhere"
        ? {
            line: "That Concept2 account is already connected to a different Ergomatic account.",
            reason: "ALREADY LINKED ELSEWHERE · 409",
          }
        : {
            line: FAILED_LINE,
            reason: `CONCEPT2 REFUSED THE EXCHANGE · ${String(outcome.status)}`,
          };
    case "serverError":
      return {
        line: FAILED_LINE,
        reason: `ERGOMATIC'S SERVER DIDN'T ANSWER · ${String(outcome.status)}`,
      };
    case "mintFailed":
      return {
        line: FAILED_LINE,
        reason: `COULDN'T START THE LINK · ${String(outcome.status)}`,
      };
    case "networkError":
      return { line: FAILED_LINE, reason: "NO CONNECTION" };
    case "noWindow":
    case "noContext":
    case "contextInvalid":
      return {
        line: FAILED_LINE,
        reason: `THIS DEVICE COULDN'T OPEN CONCEPT2 · ${outcome.kind.toUpperCase()}`,
      };
    case "pluginError":
      return {
        line: FAILED_LINE,
        reason: `THIS DEVICE COULDN'T OPEN CONCEPT2 · ${outcome.code.toUpperCase()}`,
      };
  }
}
```

- [ ] **Step 5: Run the tests and confirm they pass.** Same command as step 2. Read BOTH summary lines.

- [ ] **Step 6: Commit, then run the mutation probes** (RF22: commit first so every revert is a no-op against a clean file).

```bash
cd /Users/james/projects/github/jamesawesome/Ergomatic-wt-c2pr2
git rev-parse --show-toplevel   # MUST print the worktree path above
git add app/src/api/useConcept2Link.ts app/src/api/useConcept2Link.test.ts app/src/you/concept2CardModel.ts app/src/you/concept2CardModel.test.ts
git commit -m "Wave E PR2: the link hook and the card's pure failure model"
```

  Then, one at a time, applying the change, running the covering file, recording the exact failure text, and reverting with `git checkout --` after a `git status` check:

  | # | Mutation | Must fail |
  | --- | --- | --- |
  | M1 | `normalizeLink`: DELETE the whole `if (raw.available !== true) return LINK_UNAVAILABLE;` line | "reads a flag-off 200 as unavailable" — the mutant falls through to the `linked` check and returns `{...LINK_UNAVAILABLE, available: true}`. **Rewritten:** the draft's version (`raw.available === false && raw.linked === undefined`) was run and DID NOT BITE — the fixture is `{available:false}` with no `linked` key, which the mutated guard still catches, so all five tests stayed green |
  | M2 | `normalizeLink`: drop the `typeof raw.c2UserId === "number"` guard, returning `raw.c2UserId as number` | "degrades every unknown field" |
  | M2b | `normalizeLink`: weaken the username guard to `typeof raw.c2Username === "string"` (drop `&& raw.c2Username !== ""`) | "reads an EMPTY username as no username" |
  | M2c | `normalizeLink`: weaken the ORIGIN guard the same way (drop `&& raw.logbookBaseUrl !== ""`) | "reads an EMPTY logbook origin as no origin, so no link-out is built on our own domain" — observation 22's client end. RUN: red on exactly that test, 14 others green |
  | M3 | `describeFailure`: return `null` for `busy` unconditionally (the pre-split behaviour) | "separates the two busy sources" |
  | M4 | `describeFailure`: return `FAILED_LINE` for `declined` | "gives a declined link its own line" |
  | M5 | `identityLine`: swap to `` `Ergomatic ${email} · Concept2 ${c2}` `` | "names the Concept2 username and the Ergomatic email, in the callback page's order" |
  | M6 | `identityLine`: return `` `Concept2 ${link.c2Username ?? ""} · …` `` | "falls back to the numeric account" |
  | M6b | `identityLine`: weaken the guard to `link.c2Username !== null ? link.c2Username : …` (drop the `!== ""` clause) | "falls back for an EMPTY username too" |
  | M6c | `useConcept2Link`: drop the `if (!res.ok)` arm | **"refuses a non-2xx that carries a perfectly good JSON body"**, NOT the 502-with-HTML test beside it. Measured (observation 23): once the JSON parse has its own `catch` reporting `res.status`, a mutant that drops the ok-check still reports 502 for an HTML body, and the older test stays green against broken code. A 401 whose body parses cleanly is the case where the guard is the only thing between an auth refusal and `normalizeLink` reading it as "no Concept2 here". RUN: red on exactly that test |
  | M6d | `useConcept2Link`: remove the `pageshow` listener registration | "re-reads on pageshow" |
  | M6e | `useConcept2Link`: drop the `document.visibilityState === "visible"` condition, re-reading on every `visibilitychange` | "re-reads when the document becomes visible, and NOT when it becomes hidden" |
  | M6f | `useConcept2Link`: return no cleanup from the effect | "stops listening when the card unmounts" |

---

## Task 2: The two adapter changes — `busy` gets a source, and read-only link-outs get an arm

**Files:**
- Modify: `app/src/adapters/linkFlow.ts` (the `busy` union member, `pluginRejection`'s `busy` case, `startLink`'s guard return, the `:148-155` comment, **and the whole weight-class chain: the `WeightClass` type, `startLink`'s parameter, the mint body, the exchange-response shape and the `linked` member's field** — ruling i)
- Modify: `app/src/adapters/webNavigate.ts` (append `openWebInNewTab`)
- Modify: `app/src/adapters/externalBrowser.ts` (import and append `openReadOnlyUrl`)
- Test: `app/src/adapters/externalBrowser.test.ts` (append), `app/src/adapters/webNavigate.test.ts` (append), `app/src/adapters/linkFlow.test.ts` (append)

**Interfaces:**
- Produces: `LinkOutcome`'s `busy` member becomes `{ kind: "busy"; source: "guard" | "sheet" }`; `LinkOutcome`'s `linked` member LOSES `weightClass`; `startLink()` takes no argument and the exported `WeightClass` type is deleted; `openWebInNewTab(url: string): void`; `openReadOnlyUrl(url: string): void | Promise<void>`.

**Why this task exists, not folded into Task 3:** all three changes are in the lint-enforced adapter layer, all are consumed by BOTH components, and a reviewer can reject any one without touching a component. Observation 4 is the reason for the first; ruling (i) for the second; observation 10 for the third.

**The weight-class half must land in the SAME commit as Task 3's server half**, because the two ends of one wire cannot disagree across a commit: `startLink` stops SENDING `weightClass` while `POST /api/concept2/connect` still 400s without it, and every link attempt fails in between. Task 3's step ordering says the same thing from the server side.

- [ ] **Step 1: Write the failing tests.** Append to `app/src/adapters/webNavigate.test.ts`:

```ts
describe("openWebInNewTab", () => {
  it("opens a NEW context and never navigates this document", () => {
    // The distinction is the whole point (plan observation 10):
    // `navigateWeb` unloads the SPA, which is right for the OAuth hop and
    // would lose the rower's log row for a read-only look.
    const open = vi.fn();
    const assign = vi.fn();
    const original = window.location;
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { assign },
    });
    const originalOpen = window.open;
    window.open = open as unknown as typeof window.open;
    try {
      openWebInNewTab("https://log-dev.concept2.com/profile/2211/log/339");
      expect(open).toHaveBeenCalledWith(
        "https://log-dev.concept2.com/profile/2211/log/339",
        "_blank",
        "noopener,noreferrer",
      );
      expect(assign).not.toHaveBeenCalled();
    } finally {
      window.open = originalOpen;
      Object.defineProperty(window, "location", {
        configurable: true,
        value: original,
      });
    }
  });
});
```

  Append to `app/src/adapters/externalBrowser.test.ts`, in the same `vi.doMock` idiom that file already uses for `../platform` and `./webNavigate`:

```ts
describe("openReadOnlyUrl", () => {
  it("web: opens a new context, never the current document", async () => {
    const openWebInNewTab = vi.fn();
    const navigateWeb = vi.fn();
    vi.doMock("../platform", () => ({ isNative: () => false }));
    vi.doMock("./webNavigate", () => ({ navigateWeb, openWebInNewTab }));
    vi.resetModules();
    const { openReadOnlyUrl } = await import("./externalBrowser");
    await openReadOnlyUrl("https://log-dev.concept2.com/profile/2211/log/339");
    expect(openWebInNewTab).toHaveBeenCalledWith(
      "https://log-dev.concept2.com/profile/2211/log/339",
    );
    expect(navigateWeb).not.toHaveBeenCalled();
  });

  it("native: goes through the plugin wrapper, which presents a sheet the rower dismisses back into the app", async () => {
    const openNativeExternalUrl = vi.fn(async () => Promise.resolve());
    vi.doMock("../platform", () => ({ isNative: () => true }));
    vi.doMock("../native/externalBrowser", () => ({ openNativeExternalUrl }));
    vi.resetModules();
    const { openReadOnlyUrl } = await import("./externalBrowser");
    await openReadOnlyUrl("https://log-dev.concept2.com/profile/2211/log/339");
    expect(openNativeExternalUrl).toHaveBeenCalledWith(
      "https://log-dev.concept2.com/profile/2211/log/339",
    );
  });
});
```

  `app/src/adapters/linkFlow.test.ts` takes THREE changes, not the "fix the two assertions" one sentence an earlier draft carried. Find the existing sites with `git grep -n '"busy"' app/src/adapters/linkFlow.test.ts`.

  1. **The `it.each` plugin-rejection table cannot express the new shape, so `busy` comes OUT of it.** That block runs six rejection codes through ONE shared assertion (`toStrictEqual({ kind })`), and there is no way to give the `busy` row an extra `source` field without breaking the other five. Delete its `["busy", "busy"]` row and give the case its own test:

```ts
  it("the PLUGIN's busy names its own source, so the card can tell it from the JS guard's", async () => {
    // Pulled out of the table above: that block shares ONE
    // `toStrictEqual({ kind })` assertion across six rows, which cannot
    // express the extra `source` field without breaking the other five.
    // linkFlow.ts's own `case "busy"` comment requires the two sources to
    // render differently; before PR2 the union could not say which was
    // which.
    vi.doMock("../platform", () => ({ isNative: () => true }));
    mockApi(MINT_OK);
    mockPlugin(
      vi.fn(async () => {
        const err = new Error("rejected") as Error & { code: string };
        err.code = "busy";
        throw err;
      }),
    );
    vi.resetModules();
    const { startLink } = await import("./linkFlow");

    expect(await startLink()).toStrictEqual({
      kind: "busy",
      source: "sheet",
    });
  });
```

  2. **The concurrent-call assertion is fixed in place** — the one reading `expect(second).toStrictEqual({ kind: "busy" })` becomes `{ kind: "busy", source: "guard" }`.

  3. **And the new web-arm test is appended** to the `startLink on web` describe:

```ts
  it("the JS guard's busy names itself, so the card can tell it from the plugin's", async () => {
    // linkFlow.ts's `case "busy"` comment requires the two to render
    // differently. Before this change the union could not express it: both
    // returned a bare {kind:"busy"}.
    const api = vi.fn(
      async () =>
        new Promise<Response>(() => {
          // never resolves: the first attempt stays in flight
        }),
    );
    vi.doMock("../api", () => ({ api }));
    vi.doMock("../platform", () => ({ isNative: () => false }));
    vi.resetModules();
    const { startLink } = await import("./linkFlow");

    void startLink();
    const second = await startLink();
    expect(second).toStrictEqual({ kind: "busy", source: "guard" });
  });
```

  4. **The mint-body assertions ALREADY EXIST and are the ones ruling (i) turns.** Do not add new ones. `src/adapters/linkFlow.test.ts` pins both bodies with `toStrictEqual` today — the native one in `"mints with linkClient webauth-1, opens an EPHEMERAL session on the bare scheme, exchanges {code, state}, and reports the link"` and the web one in `"mints WITHOUT a linkClient declaration and hands off to a full-page navigation"`. Both read `JSON.parse(String(calls[0]!.init!.body))`. They become, respectively:

```ts
    expect(JSON.parse(String(calls[0]!.init!.body))).toStrictEqual({
      // Ruling (i), James 2026-09-03: "I don't want that set in our app."
      // `linkClient` is a claim about THIS BUILD's capability, not about
      // the rower, so it is what remains. `toStrictEqual` is what makes
      // this the assertion that catches a re-added field.
      linkClient: LINK_CLIENT,
    });
```

```ts
    // Web mints carry NOTHING: not a null class, not a conditionally
    // omitted one. `{}` is the whole body, and there is no code path that
    // can put a person in it.
    expect(JSON.parse(String(calls[0]!.init!.body))).toStrictEqual({});
```

  Both titles keep their wording: the native one still describes the `linkClient` declaration, and the web one still describes minting WITHOUT it. Neither title mentioned the class, so neither is stale.

  5. **Every `startLink({...})` call in the file loses its argument.** `git grep -c "startLink({" -- src/adapters/linkFlow.test.ts` returns **22** at head `8bfb2e41`; the implementer re-runs it and reports the count against the tree it edits. This is a mechanical edit and `pnpm typecheck` is what proves it complete — an argument passed to a zero-parameter function is an error, so none can survive silently.

  6. **The exchange stub's response shape loses `weightClass` too**, in the same file: `jsonResponse(200, { linked: true, c2UserId: 2211, weightClass: "H" })` becomes `jsonResponse(200, { linked: true, c2UserId: 2211 })`. This is a stub of `POST /api/concept2/exchange`, whose real response Task 3 changes; a stub that keeps sending a field the server no longer emits is a fixture that has stopped looking like production (RF3).

- [ ] **Step 2: Run and confirm failure.**

```bash
cd /Users/james/projects/github/jamesawesome/Ergomatic-wt-c2pr2/app
NODE_OPTIONS=--no-experimental-webstorage pnpm exec vitest run --project client src/adapters/webNavigate.test.ts src/adapters/externalBrowser.test.ts src/adapters/linkFlow.test.ts
```
Expected: FAIL — `openWebInNewTab`/`openReadOnlyUrl` are not exported, and `startLink`'s guard returns `{kind:"busy"}` with no `source`.

- [ ] **Step 3: Widen the `busy` member.** In `app/src/adapters/linkFlow.ts`, replace the union member (currently `  | { kind: "busy" }`) with:

```ts
  | { kind: "busy"; source: "guard" | "sheet" }
```

  Replace `pluginRejection`'s case:

```ts
    case "busy":
      return { kind: "busy", source: "sheet" };
```

  Replace `startLink`'s guard:

```ts
  if (linkInFlight) return { kind: "busy", source: "guard" };
```

  And replace the trailing sentence of the `case "busy"` comment block (currently *"PR2's card must therefore not render one string for both `busy` sources: the JS guard means …, the plugin's means …"*) with:

```ts
    // …superseded the attempt it belongs to". `source` carries that
    // distinction on the member itself (PR2, plan observation 4): the
    // union used to collapse both into one bare `{kind:"busy"}`, so the
    // requirement above was unimplementable. `guard` is the JS flag
    // immediately below; `sheet` is the plugin's own `activeSession`
    // claim, which is the AUTHORITY (design §2's lifetime table).
```

- [ ] **Step 3b: Take the weight class out of the adapter entirely (ruling i).** Four edits in `app/src/adapters/linkFlow.ts`, all in the same commit as Task 3's server half.

  1. **Delete the exported type.** `export type WeightClass = "H" | "L";` goes. It has no remaining consumer on the client once the three below land; `pnpm typecheck` names any that survives.

  2. **The `linked` outcome member loses its field.** Its declaration (`| { kind: "linked"; c2UserId: number; weightClass: WeightClass; stateEchoed: boolean }`) drops `weightClass`, and so does the construction in the exchange handler:

```ts
  if (res.ok) {
    // The exchange response no longer carries a class: ruling (i) dropped
    // the column it was read from (`concept2_attempts.weight_class`) and
    // the server stopped emitting it in the same migration. Nothing on
    // this side ever displayed it — the card shows the account, never a
    // class — so this is a removal, not a regression.
    const body = (await res.json()) as {
      linked: boolean;
      c2UserId: number;
    };
    return {
      kind: "linked",
      c2UserId: body.c2UserId,
      stateEchoed,
    };
  }
```

  3. **`startLink` takes no argument, and the mint body loses its only rower-supplied field:**

```ts
export async function startLink(): Promise<LinkOutcome> {
  if (linkInFlight) return { kind: "busy", source: "guard" };
  linkInFlight = true;
  try {
    const native = isNative();
    const res = await api("/api/concept2/connect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // The declaration is sent only where it means something. The server
      // reads it only when it derived `surface === "native"` from the bearer
      // (`routes/concept2.ts`), so a cookie caller asserting a native
      // capability would be a claim about a surface it is not on.
      //
      // Ruling (i), James 2026-09-03: nothing about the ROWER travels in
      // this body. The weight class Concept2 requires on a result is
      // Concept2's own fact, read from their profile server-side at send
      // time. `linkClient` is a claim about this BUILD, which is why it
      // survives and the class does not.
      body: JSON.stringify(native ? { linkClient: LINK_CLIENT } : {}),
    });
```

  4. **The doc comment above `startLink` gains the one sentence a reader needs** and loses nothing else: the function's own header already explains the native/web split, and there is no argument left to describe.

  **The empty `{}` is deliberate and is not an omission to tidy up later.** Sending no body at all would change the request's content type and the route's `isRec(req.body)` read; `{}` keeps the wire shape the server already parses and says, in the one place a reader looks, that we send nothing rather than that we forgot to.

- [ ] **Step 4: Add the two adapter functions.** Append to `app/src/adapters/webNavigate.ts`:

```ts
/** A NEW browsing context, never this document. Split from `navigateWeb`
 *  above because the two are opposites for the rower: that one unloads the
 *  SPA (right for the OAuth consent hop, where the app is meant to leave),
 *  this one keeps the app on screen behind a read-only look at Concept2's
 *  logbook. `noopener,noreferrer` because the opened page is a third
 *  party's and has no business holding a handle on us. */
export function openWebInNewTab(url: string): void {
  window.open(url, "_blank", "noopener,noreferrer");
}
```

  In `app/src/adapters/externalBrowser.ts`, change the import line to:

```ts
import { navigateWeb, openWebInNewTab } from "./webNavigate";
```

  and append:

```ts
/**
 * Opens `url` for a READ-ONLY look the rower comes back from — PR2's
 * "View on Concept2" link-out. Distinct from `openExternalUrl` above on
 * the web arm only: that one navigates this document (correct for the
 * OAuth hop) and would throw the rower out of the app with the log row
 * lost. Native takes the same `SFSafariViewController` sheet either way,
 * which the rower dismisses straight back into Ergomatic.
 *
 * This is also why callers render a `<button>` rather than an
 * `<a href>`: inside the Capacitor WebView a plain anchor drives the
 * WebView ITSELF to concept2.com, with no way back.
 */
export function openReadOnlyUrl(url: string): void | Promise<void> {
  if (isNative()) {
    return import("../native/externalBrowser").then(
      ({ openNativeExternalUrl }) => openNativeExternalUrl(url),
    );
  }
  openWebInNewTab(url);
}
```

- [ ] **Step 5: Run the tests, plus the two suites that could be broken by the union change.**

```bash
cd /Users/james/projects/github/jamesawesome/Ergomatic-wt-c2pr2/app
NODE_OPTIONS=--no-experimental-webstorage pnpm exec vitest run --project client src/adapters
NODE_OPTIONS=--no-experimental-webstorage pnpm exec vitest run --project client src/monitor/Concept2LinkProbe.test.tsx
NODE_OPTIONS=--no-experimental-webstorage pnpm exec vitest run --project unit scripts/webauth-contract.test.ts
```
  `scripts/webauth-contract.test.ts` PARSES `pluginRejection`'s switch (`linkFlow.ts:137-140`'s comment says so) — the case LABELS are untouched by this change, but run it and say so, rather than assuming.

- [ ] **Step 6: Commit, then probe.**

  | # | Mutation | Must fail |
  | --- | --- | --- |
  | M7 | `startLink`'s guard returns `{ kind: "busy", source: "sheet" }` | "the JS guard's busy names itself" |
  | M8 | `openReadOnlyUrl`'s web arm calls `navigateWeb(url)` | "web: opens a new context, never the current document" |
  | M9 | `openWebInNewTab` drops the `"noopener,noreferrer"` argument | "opens a NEW context and never navigates this document" |
  | M9b | `startLink`'s web mint body becomes `JSON.stringify({ weightClass: "H" })` — a class re-added, hardcoded | "mints WITHOUT a linkClient declaration and hands off to a full-page navigation", on its `toStrictEqual({})`. **This is ruling (i)'s only gate on the client, so it is the one probe that must be run and reported verbatim.** A `toMatchObject` here would leave it green, which is why step 4 keeps `toStrictEqual` |
  | M9c | the native mint body becomes `{ linkClient: LINK_CLIENT, weightClass: "H" }` | the native mint test's `toStrictEqual({ linkClient: LINK_CLIENT })`. Run BOTH arms: the web body and the native body are built by one ternary, and a probe on one arm says nothing about the other |

---

## Task 3: The server — `c2Username`, `logbookBaseUrl`, and the weight class moving to Concept2's side — **TRIAD**

**TRIAD, on two of the three counts: a STORED SHAPE (migration 0023 adds one column and drops two) and a NUMBER's meaning (`weight_class` on a third party's permanent record stops coming from a question we asked and starts coming from Concept2's own profile). It gets the full antagonist pass on this task and a PM gate on the PR, and it does NOT ride the fast path.**

**Gated on ruling (ii) = B for the `c2Username` half. If James picks A, skip that half (the column, both write sites, and the `GET /link` field); `logbookBaseUrl` is NOT optional and ships either way (observation 5), and **the weight-class half is RULED, not optional, and ships regardless of (ii)** — migration 0023 exists for it even if the username column never joins it.

**Files:**
- Modify: `app/server/db/schema.ts` (the `concept2Links` block; the `concept2AuthAttempts` block; the `weightClassEnum` declaration)
- Create: `app/drizzle/0023_<name>.sql` + `app/drizzle/meta/0023_snapshot.json` + journal entry, via `pnpm db:generate` (index confirmed free in step 1)
- Modify: `app/server/concept2/mapping.ts` (**new** `pickDeclaredWeightClass` and `deriveWeightClass` + their four constants and three types; `buildC2Payload`'s second parameter)
- Modify: `app/server/concept2/client.ts` (**new** `fetchResults`; `fetchMe` parses `weight`/`gender` and its failure shape gains `kind` + `status`; a timeout bound on all four wire calls)
- Modify: `app/server/stores/concept2.ts` (`upsertLink`'s input, `getLink`'s projection, `createAttempt`'s input, `consumeAttempt`'s projection, the `WeightClass` type export)
- Modify: **`app/server/stores/logs.ts`** (**new** `sentC2ResultIds(userId, c2UserId)` — the exclusion the declaration read needs, observation 29)
- Modify: `app/server/testing/fakes.ts` (`makeFakeConcept2Store`, mirroring both the added and the dropped columns; **and `makeFakeLogsStore`, which needs `sentC2ResultIds` or eighteen existing upload tests answer 500** — the file ends `as unknown as LogsStore`, so `pnpm typecheck` will not say so)
- Modify: `app/server/routes/concept2.ts` (both `upsertLink` calls pass `c2Username`; the Linked callback page's fallback; `GET /link` returns `c2Username` and `logbookBaseUrl` and **stops returning `weightClass`**; `Concept2RouterDeps` gains `logbookBaseUrl`; the mint stops requiring a class; the exchange response drops it; **the upload route reads the profile and derives the class**)
- Test: `app/server/concept2/mapping.test.ts` (the derivation table; `buildC2Payload`'s call sites), `app/server/concept2/client.test.ts` (`fetchMe`'s new fields and failure kinds)
- Modify: `app/server/index.ts` (pass `c2BaseUrl` in as `logbookBaseUrl`), `app/server/app.ts` (thread it)
- Modify: **`app/scripts/webauth-contract.test.ts`** — its pinned `GET /link` key list AND its own `LinkStatus` interface. Named because the paste-test's full `unit` run found it, and no earlier draft of this plan mentioned the file at all (observation 21).
- Modify: **`app/src/monitor/Concept2LinkProbe.tsx`** — the dev probe's `LinkStatus` interface, the other side of that same gate. The probe's BEHAVIOUR is unchanged (ruling iv); only its type declaration gains the two fields, because the gate holds it equal to the route.
- Modify: **`app/server/db/schema.integration.test.ts`** — BOTH describes, in opposite directions, and one test deleted outright (see step A10). Sixteen occurrences, five of which must be KEPT and are invisible to `typecheck` and `--project unit`.
- Modify: **`app/server/index.ts`** — a second change beside threading the origin: the env read becomes `||`, not `??` (observation 22).
- Test: `app/server/routes/concept2.test.ts` (append; ALSO fix its `buildApp` harness literal, its `freshLink` override type, one pre-existing `toStrictEqual` response assertion and one pre-existing rendered-page assertion — see steps 5b and 6b), `app/server/stores/concept2.integration.test.ts` (its `link()` builder is the second of the three; its override type widens too)

**Interfaces:**
- Produces: `concept2_links.c2_username text` (nullable); `GET /api/concept2/link` gains `c2Username: string | null` and `logbookBaseUrl: string` and LOSES `weightClass`; `pickDeclaredWeightClass(rows, { ourResultIds, now }) → WeightClass | null`; `deriveWeightClass(profile) → { ok: true; weightClass } | { ok: false; reason }`; `client.fetchResults(token, n) → { ok: true; rows: C2ResultRow[] } | { ok: false; kind; status }`; `logs.sentC2ResultIds(userId, c2UserId) → Set<number>`; `POST /api/concept2/results/:logId` gains `422 {error:"no_weight_class", reason:"no_weight" | "unreadable_weight" | "implausible_weight" | "no_gender"}` and a fresh send's `200` gains `weightClass` + `weightClassSource`. **`reason` is a WIRE TOKEN, not display copy** — the sibling it is modelled on (`not_eligible`) sends `EligibilityFailure`'s lowercase members and lets the client own the words, and amendment 2i's four lines are that client-side rendering.
- Removes: `concept2_links.weight_class`, `concept2_auth_attempts.weight_class`, the `weight_class` pgEnum, `POST /api/concept2/connect`'s `weightClass` requirement and its `400 field:"weightClass"`, and `weightClass` from `POST /api/concept2/exchange`'s response.
- `upsertLink`'s INPUT gains `c2Username?: string | null` — **optional, defaulting to `null` internally.** The stored column and the `getLink` projection stay required-and-nullable; only the writer's input is optional. Observation 20 is why: a required input field reaches **53 call sites** through three builders (`LINK_INPUT`/`freshLink` in `server/routes/concept2.test.ts`, `link()` in `server/stores/concept2.integration.test.ts`, `makeFakeConcept2Store` in `server/testing/fakes.ts`), none of which has a username to give. The two PRODUCTION write sites both pass one explicitly, so nothing real relies on the default.

- [ ] **Step 1: Check the migration index BEFORE generating.** Run and record the output in the task report (agent briefing: "Drizzle migrations apply by TIMESTAMP, not journal order … Check open PRs for a competing index before you generate one"):

```bash
cd /Users/james/projects/github/jamesawesome/Ergomatic-wt-c2pr2
ls app/drizzle/*.sql | tail -3
node -e "console.log(require('./app/drizzle/meta/_journal.json').entries.at(-1))"
gh pr list --json number,headRefName,files --jq '.[] | {number, headRefName, drizzle: [.files[].path | select(startswith("app/drizzle"))]}'
```
  **Measured at `0401ab61`:** `_journal.json`'s last entry is `0022_melodic_purple_man`, so **0023 is the next free index**. That is a fact about a moving target — re-run the three commands at generate time AND again immediately before opening the PR. A competing index means deleting this migration and regenerating off new main, never a journal merge.

  **Migration 0023 does THREE things in one file:** it ADDS `concept2_links.c2_username`, and it DROPS `concept2_links.weight_class` and `concept2_auth_attempts.weight_class` (with the now-unused `weight_class` enum type). They ship together because they are one deploy: a server that has stopped asking for a class must not still be inserting one, and a column that is `NOT NULL` with no default cannot survive a writer that stopped writing it.

- [ ] **Step 1b: Assert the predicate that actually makes the drop safe, and take the counts as corroboration.** **A count answers "does the drop destroy anything". It says nothing about whether an instance still running the OLD code is INSERTing** — and a writer is what makes a `NOT NULL` drop dangerous, not a row. The deciding predicate is `C2_LINK_ENABLED` being off on every running instance, so that is what gets asserted, first:

```bash
docker ps --format '{{.Names}}'
docker exec <each api container from that list> printenv C2_LINK_ENABLED
```

  **`printenv` exiting 1 with no output is the PASS** (the variable is unset). Any container printing `1` is a live writer: **STOP.** `compose.yml:64` passes the variable through as `${C2_LINK_ENABLED:-}`, so an unset host variable reaches the container as empty, and `server/index.ts` treats anything but `"1"` as off — the check reads the container's own environment rather than the host's, because the host's is not what the process sees.

  Then the counts, as corroboration:

```bash
psql "$DATABASE_URL" -c "select count(*) as links from concept2_links;" -c "select count(*) as attempts from concept2_auth_attempts;"
```

  **If either count is non-zero, STOP and do not deploy this migration.** A non-zero link count means a real rower has a live grant whose class we are about to drop, and the question of what happens to it is a design question that has not been asked. Zero is the expected answer and the only one this plan is written for; `0023`'s SQL carries no backfill and needs none.

  **State plainly, in the migration's own header and in the PR: 0023 is NOT old-image-compatible, and that is safe here for one stated reason.** Migration 0021 carries the repo's own precedent for this question — `it("adds surface as NOT NULL DEFAULT 'web' — a rollback-image insert without surface still succeeds and reads 'web'")` — and **0023 gets no equivalent, because its equivalent would go RED**: an old image's `INSERT` names `weight_class`, and after the drop that errors. The deploy is safe only because the predicate above holds (no writer exists), not because the shape is rollback-compatible. Omitting this would leave a reader to assume the 0021 precedent still applies.

---

### Part A — the weight class leaves our side (ruling i)

**Everything in Part A is forced by one ruling and lands in ONE commit with Task 2's step 3b.** The two ends of the mint wire cannot disagree across a commit: a client that stops sending `weightClass` against a server that still 400s without it fails every link attempt in between.

- [ ] **Step A1: Drop the two columns and the enum.** In `app/server/db/schema.ts`: delete `weightClass: weightClassEnum("weight_class").notNull(),` from BOTH `concept2Links` and `concept2AuthAttempts`, then delete `export const weightClassEnum = pgEnum("weight_class", ["H", "L"]);` itself — `pnpm typecheck` names anything still referring to it.

  **And reconcile the comment that argues FOR the column**, in the same edit rather than in a later sweep (RF9 / the review-record rule: correct the claim where it was USED, not only where it was argued). `concept2Links.needsReauthAt`'s comment currently reads *"…would destroy links — and re-ask the one PII question — on a server bug or a rotated C2_CLIENT_SECRET. With this flag a misclassified status costs a re-consent prompt, never the stored weight_class."* There is no PII question and no stored class. It becomes:

```ts
  // Set (never deleteLink) by any AUTOMATIC path when C2's token endpoint
  // answers 400/401 on a refresh: C2 documents those statuses for OUR
  // malformed request and OUR client credentials too (their 400 example
  // says `Check the "client_secret" parameter`), so an automatic delete
  // would destroy links on a server bug or a rotated C2_CLIENT_SECRET.
  // With this flag a misclassified status costs a re-consent prompt,
  // never the link itself. (Wave E PR2, ruling i: it used to cost the
  // stored weight class as well. There is no stored class any more — it
  // is read from Concept2's profile at send time — so re-consent is the
  // whole cost now.)
  // Cleared by the callback's upsert on successful relink. Measured
  // grounds: docs/monitor/c2-crossconnect-2026-09/refresh-probe-2026-08-31.md.
```

  Then `pnpm db:generate`, and hand-edit the generated SQL to carry the `0019`/`0021` header precedent plus a one-line note that the drop is safe because step 1b measured both tables empty.

- [ ] **Step A2: The mint stops asking, and does not start refusing.** In `app/server/routes/concept2.ts`'s `POST /api/concept2/connect`, delete the whole `weightClass` validation block (the `typeof`/`WEIGHT_CLASSES.includes` guard and its `400 field:"weightClass"`) and both `weightClass:` arguments to `store.createAttempt`. Leave the `body` read in place — it is still needed for `linkClient`. Add, where the guard was:

```ts
      // Ruling (i), James 2026-09-03: "I don't want that set in our app. I
      // want it to be set on Concept2's side." The mint takes nothing
      // about the rower. An older installed build still SENDS
      // `weightClass` in this body and is deliberately not refused — the
      // field is read by nothing, so the value is ignored rather than
      // 400'd. Refusing it would brick every unupdated build the moment
      // this deploys, for a field the server no longer has a use for.
```

  **The "ignore, do not 400" half is a compatibility decision with a named victim, so it is stated rather than assumed:** the installed TestFlight build from PR1.75b sends `{weightClass, linkClient}` on native. If this route 400'd on an unknown key, that build's Connect button would fail for a reason no copy explains. It sends the key; we drop it on the floor.

- [ ] **Step A3: The exchange response stops emitting a class, and `consumeAttempt` stops projecting one.** In `app/server/stores/concept2.ts`, `createAttempt`'s input loses `weightClass`, `consumeAttempt`'s projection and return lose it (it returns `{ fresh }` alone), and `export type WeightClass = "H" | "L"` MOVES rather than dies — it is still the wire vocabulary `buildC2Payload` writes, so it belongs where the derivation lives. Re-export it from `app/server/concept2/mapping.ts` and delete it here; `pnpm typecheck` names every importer.

  In `app/server/routes/concept2.ts`, both `upsertLink` calls drop `weightClass: consumed.weightClass`, and the native exchange's response literal becomes:

```ts
      // Never a token on this response — the same projection GET /link
      // makes. No `weightClass`: ruling (i) dropped the column it was read
      // from, and `adapters/linkFlow.ts`'s `linked` outcome stopped
      // declaring the field in the same commit.
      res.status(200).json({
        linked: true,
        c2UserId: me.c2UserId,
      });
```

- [ ] **Step A4: `GET /link` stops emitting the class**, and BOTH sides of the contract gate follow it down. The response literal loses `weightClass: link.weightClass,`; `scripts/webauth-contract.test.ts`'s pinned list loses `"weightClass"` (leaving `["available","c2UserId","c2Username","linked","logbookBaseUrl","needsReauth"]`, sorted); and `src/monitor/Concept2LinkProbe.tsx`'s `LinkStatus` loses `weightClass?: "H" | "L";`.

  **The probe's readout line changes too, and this is the one place ruling (iv) bends.** `Concept2LinkProbe.tsx` renders `` `linked (C2 user ${String(status.c2UserId)}, ${String(status.weightClass)}${reauth})` ``, which would print `undefined` against the new response. It becomes `` `linked (C2 user ${String(status.c2UserId)}${reauth})` ``. Ruling (iv) says the probe is not replaced and does not absorb the product card; it does not say the probe may print a field the server no longer sends. Its `startLink({ weightClass: "H" })` call also loses its argument (Task 2).

- [ ] **Step A5: bound every wire call, then teach the client the two reads the class comes from.** Three edits in `app/server/concept2/client.ts`, all placed and run (see the receipt).

  **(a) The timeout every call was missing.** A hung Concept2 call holds an Express handler — and, on the send path, a rower watching SENDING — for as long as the socket stays open, and this revision adds a THIRD call ahead of the post. Add beside `SCOPE`:

```ts
// Every wire call in this module is BOUNDED. Concept2 is a third party on the
// far side of the public internet, and an unbounded `fetch` holds an Express
// handler — and, on the upload path, a rower watching a SENDING state — for as
// long as the socket stays open. `AbortSignal.timeout` rejects the fetch with a
// `TimeoutError`, which every call site below already catches into its own
// RETRYABLE failure (`grantDead: false` / `kind: "c2_error"`), so a timeout is
// reported as exactly what it is: something to try again, never a dead grant.
//
// The value comes from this path's own measured latency rather than habit:
// against log-dev from a dev laptop, 5 samples each, medians on 2026-09-03 —
// `GET /api/users/me/results?number=1` 216 ms, `?number=5` 221 ms,
// `GET /api/users/me` 220 ms. 10 s is roughly 45x that, so it cannot clip a
// slow-but-working call. (Measured from a laptop, NOT from the deploy host;
// the deploy host's own latency to Concept2 is unmeasured.)
//
// WHAT IT BOUNDS, counted rather than felt. The send path's longest chain is
// NINE bounded calls, not three: refreshTokens, fetchResults, fetchMe,
// refreshTokens, fetchResults, fetchMe, postResult, refreshTokens,
// postResult. 90 s is therefore the arithmetic ceiling on that chain. The
// ceiling a TIMEOUT can actually reach is far lower, because a timeout
// classifies as `c2_error` and no `c2_error` on this route is retried: the
// nine-call chain requires the failures to be fast 401s. Nothing else caps
// SENDING — there is no client-side abort on the send fetch, no
// `server.requestTimeout`/`headersTimeout`, and no proxy timeout in-repo.
const C2_TIMEOUT_MS = 10_000;
```

  **And the value is PINNED, not merely present.** The prescribed gate below asserts that a signal exists, which `C2_TIMEOUT_MS = 1` would leave green (RF21's first smell / RF4). One more test pins the number with an INDEPENDENT literal — never the exported constant, which would retune itself:

```ts
    it("bounds every wire call at ten seconds, pinned with a literal rather than the constant it gates", async () => {
      const timeout = vi.spyOn(AbortSignal, "timeout");
      const fetchImpl = vi
        .fn()
        .mockResolvedValue(jsonResponse(200, { data: { id: 2211 } }));
      const client = createC2Client(cfg, fetchImpl);
      await client.fetchMe("t");
      expect(timeout).toHaveBeenCalledWith(10_000);
      const [, init] = fetchImpl.mock.calls[0] as [URL, RequestInit];
      expect(init.signal).toBeInstanceOf(AbortSignal);
      timeout.mockRestore();
    });
```

  RUN against the placement: `C2_TIMEOUT_MS = 1` gives `Tests 6 failed | 22 passed`, headed by this test's own title.

  …then add `signal: AbortSignal.timeout(C2_TIMEOUT_MS),` to the `fetchImpl` options of **all four** calls this module makes: `requestTokens`, `fetchMe`, `fetchResults` and `postResult`. Every one of them already catches a thrown fetch into its own retryable failure, so a `TimeoutError` classifies correctly with no other change.

  **(b) The vendor number's three states.** Add above `createC2Client`, with `import type { C2ProfileWeight, C2ResultRow } from "./mapping.js";` at the top of the file:

```ts
// The vendor NUMBER's three states, kept apart rather than folded (see
// `fetchMe`). A finite numeric STRING is accepted because this API is Laravel
// and the read field is undocumented; anything else PRESENT is reported as
// `"unreadable"` so the caller can say so instead of saying "not set".
function readProfileWeight(value: unknown): C2ProfileWeight {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : "unreadable";
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed === "") return "unreadable";
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : "unreadable";
  }
  return "unreadable";
}
```

  **(c) `fetchMe` gains the two derivation inputs, a `kind`, and a `status`; `fetchResults` is new.** Replace `fetchMe` with the block below and add `fetchResults` after it:

```ts
    // username: MEASURED present (string) on log-dev GET /api/users/me,
    // 2026-09-02, live response; read as optional so a missing field can
    // never render "undefined" (the route falls back to #<id>).
    //
    // `weight` and `gender` are read here because the send path's FALLBACK
    // producer derives Concept2's required `weight_class` from them when the
    // rower has made no declaration we can read (`mapping.ts`'s
    // `deriveWeightClass`). We ask the rower nothing and store nothing.
    //
    // `weight` has THREE states on the wire and this method reports all three
    // (`C2ProfileWeight`): absent -> null; a finite number or a finite numeric
    // STRING -> that number; anything else present -> `"unreadable"`. The
    // string arm is not defensive padding: this API is Laravel (its 422 body
    // is Laravel's exact validation shape) and the read field is undocumented
    // — the docs' own `GET /api/users/me` example lists 13 fields and omits
    // `weight` entirely — so `"7500"` is a live possibility, and folding it
    // into "not set" would tell a rower who HAS set a weight to go and set it,
    // forever, with nothing in the response saying why.
    //
    // The failure shape carries `kind` AND `status` because the caller's
    // correct answer differs: a 401 means the grant may be dead and must reach
    // the same `needs_reauth` flag a rejected `postResult` does, while a 500,
    // a timeout or a thrown fetch is retryable and must not send a rower back
    // through re-consent over a blip — and a 403 (Concept2's answer for
    // insufficient scope, and our grant is exactly `user:read,results:write`)
    // must not read as an anonymous "couldn't reach Concept2" with a retry
    // that can never work. `status` is `number | null` rather than
    // `postResult`'s older optional key so that "no status" is a value and not
    // an omission; `postResult`'s shape is left alone by this PR.
    async fetchMe(accessToken: string): Promise<
      | {
          ok: true;
          c2UserId: number;
          username: string | null;
          weight: C2ProfileWeight;
          gender: string | null;
        }
      | { ok: false; kind: "auth" | "c2_error"; status: number | null }
    > {
      let res: Response;
      try {
        res = await fetchImpl(new URL("/api/users/me", cfg.baseUrl), {
          headers: { authorization: `Bearer ${accessToken}` },
          signal: AbortSignal.timeout(C2_TIMEOUT_MS),
        });
      } catch {
        return { ok: false, kind: "c2_error", status: null };
      }
      if (res.status === 401) {
        return { ok: false, kind: "auth", status: 401 };
      }
      if (!res.ok) {
        return { ok: false, kind: "c2_error", status: res.status };
      }
      const parsed = await safeJson(res);
      const data = (
        parsed as
          | {
              data?: {
                id?: unknown;
                username?: unknown;
                weight?: unknown;
                gender?: unknown;
              };
            }
          | undefined
      )?.data;
      const id = data?.id;
      if (typeof id !== "number") {
        return { ok: false, kind: "c2_error", status: res.status };
      }
      const username =
        typeof data?.username === "string" ? data.username : null;
      const gender = typeof data?.gender === "string" ? data.gender : null;
      return {
        ok: true,
        c2UserId: id,
        username,
        weight: readProfileWeight(data?.weight),
        gender,
      };
    },

    // The PRIMARY producer of `weight_class` (mapping.ts's block comment):
    // Concept2's own help says the rower designates L or H for every piece,
    // so their most recent designation is the authority, and the profile
    // weight is only a fallback.
    //
    // MEASURED 2026-09-03 against log-dev (user 2211, a token whose scope is
    // this module's own `SCOPE` constant, so no scope widening is implied):
    // `GET /api/users/me/results?number=1` -> 200, one result; every result in
    // the list carries `weight_class`; the list is DATE-descending (id 85561
    // dated `2026-09-02 10:00:30` sorted ahead of id 85562 dated
    // `2026-09-02 10:00:00`), and `meta.pagination` carries `total`, `count`,
    // `per_page`, `current_page`, `total_pages` and `links.next`.
    //
    // This projects FOUR fields per row and keeps nothing else. The rower's
    // other logbook rows are not ours to hold, log or render, and each of the
    // four earns its place in the DECISION rather than being carried along:
    //
    //   `id`         so the caller can exclude the rows THIS APP wrote.
    //                Without it, a class we derived comes back on the next
    //                send wearing the rower's name (observation 29) — and
    //                nothing else on the row distinguishes ours: the 201
    //                echoes our `weight_class` and reports `source` as the
    //                rower's own name.
    //   `type`       because Concept2 requires a class only on some types
    //                ("Required if type is rower, dynamic or slides"), and
    //                its own documented example shows a `skierg` row
    //                carrying one anyway — an unmeasured value, not a
    //                designation.
    //   `date_utc` / `date`
    //                so a row dated in the FUTURE cannot pin "newest"
    //                forever. `date_utc` is NULLABLE (both rows of the
    //                vendor's own example carry null), hence the pair.
    //
    // One page only — the caller never walks `links.next` (a rower with no
    // usable declaration in the recent page falls through to the profile,
    // which is cheaper and quieter than paging a stranger's history).
    async fetchResults(
      accessToken: string,
      count: number,
    ): Promise<
      | { ok: true; rows: C2ResultRow[] }
      | { ok: false; kind: "auth" | "c2_error"; status: number | null }
    > {
      const url = new URL("/api/users/me/results", cfg.baseUrl);
      url.searchParams.set("number", String(count));
      let res: Response;
      try {
        res = await fetchImpl(url, {
          headers: { authorization: `Bearer ${accessToken}` },
          signal: AbortSignal.timeout(C2_TIMEOUT_MS),
        });
      } catch {
        return { ok: false, kind: "c2_error", status: null };
      }
      if (res.status === 401) {
        return { ok: false, kind: "auth", status: 401 };
      }
      if (!res.ok) {
        return { ok: false, kind: "c2_error", status: res.status };
      }
      const parsed = await safeJson(res);
      const rows = (parsed as { data?: unknown } | undefined)?.data;
      if (!Array.isArray(rows)) {
        return { ok: false, kind: "c2_error", status: res.status };
      }
      return {
        ok: true,
        rows: rows.map((entry) => {
          const row = entry as {
            id?: unknown;
            type?: unknown;
            weight_class?: unknown;
            date_utc?: unknown;
            date?: unknown;
          } | null;
          return {
            id: typeof row?.id === "number" ? row.id : null,
            type: typeof row?.type === "string" ? row.type : null,
            weightClass:
              typeof row?.weight_class === "string" ? row.weight_class : null,
            dateUtc: typeof row?.date_utc === "string" ? row.date_utc : null,
            date: typeof row?.date === "string" ? row.date : null,
          };
        }),
      };
    },
```

  **The five `fetchMe` stub sites go red on typecheck and are named rather than discovered** (observation 25) — `pnpm typecheck` reports all five: `stubHappyExchange`'s shared helper plus two inline success stubs gain `weight: 8200, gender: "M"` (present-and-plausible: none of those tests is about the derivation, and a `null` would silently make each one a test of the refusal branch), and the two `mockResolvedValue({ ok: false })` sites become `{ ok: false, kind: "c2_error", status: 500 }` — neither test is about a 401, and both callback paths answer 502 for either kind, so no assertion moves.

  **`server/concept2/client.test.ts`'s four `toStrictEqual` assertions are INVISIBLE to typecheck** (they assert a returned value, not an argument) and fail at the test run instead. Widen each title to name the kind it now asserts.

- [ ] **Step A6: The producer chain, as pure functions beside the payload they feed.** `app/server/concept2/mapping.ts` is the repo's module for pure Concept2 mapping and already owns `eligibilityFailure` and `buildC2Payload`; both of these are the same kind of thing and go there rather than into a new file or into `app/domain/` (which holds Erg Book logic and has no business knowing Concept2's competition categories).

```ts
/* -------------------------------------------------------------------------
 * Concept2's `weight_class`, and WHO produces it.
 *
 * Concept2 requires the field on every rower result (measured 2026-09-03
 * against log-dev: a POST without it answers 422
 * `{"errors":{"weight_class":["The weight class field is required."]}}`), and
 * ruling (i) says the app asks the rower nothing. So the server reads it from
 * Concept2. The question this block answers is which Concept2 fact IS the
 * class, and the vendor answers it in one sentence (SECONDARY — the logbook
 * help page 403s to fetchers, so this is a search snippet of Concept2's own
 * text, 2026-09-03):
 *
 *   "Lightweight and heavyweight are weight categories from the world of
 *    on-water rowing. Even though you may have entered a weight in your
 *    profile, you must designate L or H for every piece that you enter."
 *
 * The class is a DECLARATION, not a function of the profile weight. So the
 * producer order is:
 *
 *   1. The rower's own most recent declaration — the newest result in their
 *      logbook that is THEIRS TO HAVE DECLARED and whose `weight_class`
 *      reads "H" or "L" (`pickDeclaredWeightClass` below, over the ordered
 *      page `client.fetchResults` returns).
 *   2. Failing that, OUR derivation from the profile's `weight` + `gender`
 *      (`deriveWeightClass`). This is ours, not Concept2's, and the SENT
 *      state says so in as many words.
 *   3. Failing that, refuse the send (422 `no_weight_class`) rather than
 *      guessing a competition category onto a permanent third-party record.
 *
 * "THEIRS TO HAVE DECLARED" is doing real work, and producer 1 is a loop
 * without it: the results list contains the rows THIS APP posted, echoing
 * back the class we sent (`docs/monitor/c2-crossconnect-2026-09/
 * raw-output.txt` lines 1-25 — the 201 body carries our `weight_class` and
 * reports `source` as the rower's own name). Read naively, a class we
 * DERIVED on send 1 comes back as "the rower's declaration" on send 2, and
 * the provenance line that exists to make the guess correctable goes silent.
 * `pickDeclaredWeightClass` therefore takes the ids this app already wrote
 * for the linked account and skips them, and when every candidate is ours it
 * returns null — which is "no declaration", never "our last class".
 *
 * Nothing here is stored. The class is read on the send that uses it and
 * discarded with the response: a declaration can change on Concept2 at any
 * time with no signal to us, and a cached one would write a stale competition
 * category into a record we cannot edit.
 * ---------------------------------------------------------------------- */

export type WeightClass = "H" | "L";

/** Which producer answered — carried to the rower on the SENT state, because
 *  a class we DERIVED is a guess about a fact Concept2 lets its owner set,
 *  and a guess nobody is shown can never be corrected. Concept2 permits
 *  per-result editing, so naming the source at the moment the row lands is
 *  what makes a wrong one repairable. */
export type WeightClassSource = "declaration" | "profile";

/** Why the profile fallback can fail to yield a class at all.
 *
 *  Four members, not two, because the vendor NUMBER has more states than
 *  "set" and "not set" and folding them loses the one thing that would let an
 *  operator diagnose it: `no_weight` is absent-or-zero; `unreadable_weight`
 *  is present in a form we could not parse; `implausible_weight` is a number
 *  outside any human's range, which is what a WRONG UNIT looks like from
 *  here; `no_gender` is a profile whose `gender` is neither `M` nor `F`, for
 *  which C2's own two-category, gendered definition yields NO answer at all
 *  — that rower's class is only ever a declaration. */
export type WeightClassFailure =
  "no_weight" | "unreadable_weight" | "implausible_weight" | "no_gender";

/** The profile weight as the wire actually presents it: a parsed number, the
 *  string `"unreadable"` for a value that was PRESENT and not parseable, or
 *  `null` for absent. Three states, because the caller's honest answer
 *  differs for each and the middle one is otherwise indistinguishable from
 *  "you have not set a weight" — which would tell a rower who HAS set one to
 *  go and set it again, forever. */
export type C2ProfileWeight = number | "unreadable" | null;

/** One row of the rower's Concept2 results list, projected to the four
 *  fields the declaration read decides on (`client.fetchResults`'s own
 *  comment says what each is for). */
export interface C2ResultRow {
  id: number | null;
  type: string | null;
  weightClass: string | null;
  dateUtc: string | null;
  date: string | null;
}

/** The result types Concept2 REQUIRES a weight class on, and therefore the
 *  only types whose `weight_class` is a designation rather than noise.
 *  PRIMARY, `https://log.concept2.com/developers/documentation/` fetched
 *  2026-09-03, the Add Result parameter table, verbatim:
 *
 *    weight_class | Depends | string | Required if type is rower, dynamic
 *    or slides. Value must be either H or L | H
 *
 *  A row of any OTHER type may still carry a value — the same page's Get
 *  Results 200 example has a `"type": "skierg"` row carrying
 *  `"weight_class": "H"` — and that value is unmeasured, because nothing
 *  required the rower to mean it. Skipping those rows is the hedge, and it
 *  costs nothing: the rower falls through to the profile, or to the refusal
 *  that tells them where to fix it. */
export const CLASS_BEARING_RESULT_TYPES: readonly string[] = [
  "rower",
  "dynamic",
  "slides",
];

/** How far ahead of our own clock a result may be dated and still count as
 *  the rower's most recent declaration.
 *
 *  A logbook row can be entered by hand with any date, and "newest" has no
 *  recency bound of its own: without this, ONE row dated 2030 pins the
 *  declaration for every send this rower ever makes, and nothing in the app
 *  could tell them why. Skipping it is the safe direction — the fallback is
 *  an older real declaration, or the profile, or a refusal that names a
 *  repair — whereas honouring it is silently permanent. A day of slack
 *  absorbs clock skew and timezone-boundary rows without admitting a
 *  deliberate future date. */
export const FUTURE_ROW_SKEW_MS = 24 * 60 * 60 * 1000;

/** `date_utc` is NULLABLE on Concept2's own documented example rows (both of
 *  them carry `"date_utc": null`), so `date` is the fallback, read as UTC:
 *  it is local time with no offset, which is at worst ~14 h out and well
 *  inside the skew above. A row with NEITHER is taken at its list position
 *  rather than discarded — a missing stamp is not a reason to throw away a
 *  real designation. */
function rowInstantMs(row: C2ResultRow): number | null {
  const raw = row.dateUtc ?? row.date;
  if (raw === null) return null;
  const parsed = Date.parse(raw.includes("T") ? raw : `${raw.trim()}Z`);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Producer 1: the rower's own most recent designation.
 *
 *  `rows` arrives in the order Concept2 returned it, which is
 *  DATE-DESCENDING — measured 2026-09-03 on log-dev with
 *  `GET /api/users/me/results?number=1`, where id 85561 dated
 *  `2026-09-02 10:00:30` sorts ahead of id 85562 dated `2026-09-02 10:00:00`,
 *  so the order is by date and not by id. The first row that survives every
 *  skip below is therefore the newest declaration.
 *
 *  FOUR skips, and the FIRST is the one that keeps this function honest:
 *
 *   1. `ourResultIds` — a result THIS APP wrote. See the block comment
 *      above: without this, our own derived guess is read back as the
 *      rower's declaration on the very next send.
 *   2. a type Concept2 does not require a class on (`CLASS_BEARING_RESULT_TYPES`),
 *      and a row with no `type` at all.
 *   3. a `weight_class` that is not exactly "H" or "L". Selection is on the
 *      FIELD, not on `?type=` — that parameter IS documented as a filter,
 *      but it names one type and this read accepts three, and a field read
 *      is auditable in the route's own log line.
 *   4. a row dated further ahead than `FUTURE_ROW_SKEW_MS`.
 *
 *  Returning null means "this rower has declared nothing we can read", which
 *  is what the caller falls through on. It never means "use the last class
 *  we sent". */
export function pickDeclaredWeightClass(
  rows: readonly C2ResultRow[],
  opts: { ourResultIds: ReadonlySet<number>; now: number },
): WeightClass | null {
  for (const row of rows) {
    if (row.id !== null && opts.ourResultIds.has(row.id)) continue;
    if (row.type === null) continue;
    if (!CLASS_BEARING_RESULT_TYPES.includes(row.type)) continue;
    if (row.weightClass !== "H" && row.weightClass !== "L") continue;
    const at = rowInstantMs(row);
    if (at !== null && at > opts.now + FUTURE_ROW_SKEW_MS) continue;
    return row.weightClass;
  }
  return null;
}

/** Concept2's thresholds, which are Concept2's own: lightweight is 75 kg or
 *  less for men and 61.5 kg or less for women, heavyweight above, RowErg only
 *  (SECONDARY — logbook help and forum, 2026-09-03). "or less" is INCLUSIVE,
 *  which is why both comparisons are `<=` and why the table test pins the
 *  exact boundary on both sides.
 *
 *  Concept2 publishes the SAME boundary twice, in units that are not equal:
 *  165 lb is 74.84 kg, not 75.00, and 135 lb is 61.24 kg, not 61.50. Our kg
 *  pair is the more generous of the two, so a rower between 74.85 and 75.00 kg
 *  is L to us and H under the pound rule. Concept2 publishes both, so neither
 *  is wrong — this is recorded so nobody later "fixes" it.
 *
 *  THE UNIT IS AN INFERENCE AND THE IDENTIFIER SAYS SO. The only line
 *  Concept2 publishes about the encoding sits on the CREATE USER endpoint
 *  (`https://log.concept2.com/developers/documentation/`, fetched
 *  2026-09-03), verbatim:
 *
 *    weight | No | integer | The weight in decigrams for the user,
 *    e.g. 7500 for 75kg. Defaults to null if not set. | 7500
 *
 *  That sentence contradicts itself — 7500 decigrams is 750 g — and the
 *  EXAMPLE is the half that pins an actual correspondence: one unit is
 *  0.01 kg. Nothing states that `GET /api/users/me` echoes the same encoding,
 *  and that endpoint's own documented example omits `weight` entirely, so no
 *  observation settles it. Hence `_HUNDREDTHS_KG` in the names, and hence the
 *  plausibility band below, which is the part a machine can check. */
export const LIGHTWEIGHT_MAX_MEN_HUNDREDTHS_KG = 7500;
export const LIGHTWEIGHT_MAX_WOMEN_HUNDREDTHS_KG = 6150;

/** The band that turns the unit INFERENCE above into a loud refusal — for
 *  every candidate unit EXCEPT one, and the exception is stated because a
 *  guard oversold is worse than no guard.
 *
 *  Every candidate unit for the read field, against a 75 kg rower:
 *
 *    decigrams (the doc's word)  750000  -> outside, refused
 *    grams                        75000  -> outside, refused
 *    hundredths of a kilogram      7500  -> INSIDE, classified (assumed)
 *    hundredths of a pound        16530  -> INSIDE, classified (WRONG)
 *    integer kilograms               75  -> outside, refused
 *    integer pounds                 165  -> outside, refused
 *
 *  Without the band, the two integer readings classify EVERY rower as
 *  LIGHTWEIGHT, which files a heavyweight's rows in Concept2's lightweight
 *  rankings — falsifying a competition record rather than merely
 *  disadvantaging its owner. The band refuses those two and both
 *  metric-mass readings, loudly, with a reason token.
 *
 *  IT CANNOT REFUSE THE POUND READING, and no band can: hundredths-of-a-lb
 *  differs from hundredths-of-a-kg by 2.2x, and any band wide enough to hold
 *  real rowers (30-300 kg) contains both readings of all of them. Under that
 *  unit almost every rower reads HEAVY. That residue is what exit criterion
 *  3b's TWO readings exist for — a weight recorded with the profile's unit
 *  preference on kg and again on lb — and it is bounded by the fact that this
 *  function is the FALLBACK: a rower who has declared a class on any recent
 *  Concept2 result never reaches it.
 *
 *  30-300 kg is deliberately far wider than any rower: it is a UNIT check,
 *  not a body check. */
export const PLAUSIBLE_MIN_HUNDREDTHS_KG = 3000;
export const PLAUSIBLE_MAX_HUNDREDTHS_KG = 30000;

/** Producer 2: our derivation from the profile, used only when the rower has
 *  made no declaration we can read. */
export function deriveWeightClass(profile: {
  weight: C2ProfileWeight;
  gender: string | null;
}):
  | { ok: true; weightClass: WeightClass }
  | { ok: false; reason: WeightClassFailure } {
  const { weight, gender } = profile;
  if (weight === "unreadable") {
    return { ok: false, reason: "unreadable_weight" };
  }
  // `<= 0` and not just `null`: Concept2 defaults an unset weight to null,
  // but a 0 is a profile that has been touched and left empty, and it must
  // not classify as the lightest possible rower.
  if (weight === null || weight <= 0) return { ok: false, reason: "no_weight" };
  // The band runs BEFORE gender, so a wrong unit refuses for every profile
  // rather than only for the two genders we can classify.
  if (
    weight < PLAUSIBLE_MIN_HUNDREDTHS_KG ||
    weight > PLAUSIBLE_MAX_HUNDREDTHS_KG
  ) {
    return { ok: false, reason: "implausible_weight" };
  }
  // `M`/`F` is DOCUMENTED, and the read side's letter case is documented
  // only by EXAMPLE — so the comparison case-folds rather than trusting the
  // example. Both rows are PRIMARY,
  // `https://log.concept2.com/developers/documentation/` fetched 2026-09-03:
  //
  //   Create User parameter table:
  //     gender | Yes | string | Must be one of: F, M | M
  //   Get User (`GET /api/users/{user}`), the documented 200 example body:
  //     "gender": "M"
  //
  // The first is a WRITE parameter and pins the vocabulary; the second is
  // this endpoint's own example and is the only statement about what the
  // READ returns. Neither is an enumeration of what a live account may hold,
  // and this project has not yet read a real value (exit criterion 3b's
  // session does, in one glance). Case-folding and trimming cost nothing and
  // turn a plausible `"m"` from a silent refusal into a classification.
  const normalized = gender === null ? null : gender.trim().toUpperCase();
  if (normalized === "M") {
    return {
      ok: true,
      weightClass: weight <= LIGHTWEIGHT_MAX_MEN_HUNDREDTHS_KG ? "L" : "H",
    };
  }
  if (normalized === "F") {
    return {
      ok: true,
      weightClass: weight <= LIGHTWEIGHT_MAX_WOMEN_HUNDREDTHS_KG ? "L" : "H",
    };
  }
  // Concept2's category is two-valued and its thresholds are gendered, so a
  // profile outside `M`/`F` has no derivable class at all — not a missing
  // weight, and never told to the rower as one. Their class can only ever be
  // a declaration (producer 1).
  return { ok: false, reason: "no_gender" };
}
```

  **If the live value turns out to be something else entirely** (`"Male"`, a numeric code), the profile fallback is dead for every rower and each one silently gets `no_gender` — whose copy happens to be reasonable, which is exactly what would let it go unnoticed. That is why 3b reads James's own value rather than inferring it from the doc example, and why the route's log line carries the failure reason: a deployment where every send logs `no_gender` says so in one grep.

  **`buildC2Payload`'s second parameter stops being a link.** It is declared `link: { weightClass: "H" | "L" }` today and was fed from the stored link row; it is now fed from the resolution, and a parameter named `link` that is not a link is exactly the kind of stale name that outlives a refactor. It becomes `weightClass: WeightClass`, with `weight_class: weightClass` in the payload. Ripple, measured with `grep -c "buildC2Payload(" server/concept2/mapping.test.ts` -> **`12`** (an earlier draft said eleven): **twelve call sites, all in `server/concept2/mapping.test.ts`** — lines 176, 196, 205, 214, 227, 238, 245, 264, 278, 279, 293, 301, which is also exactly the TS2345 list `pnpm typecheck` prints against the placement. Every one passes that file's local `LINK` constant, so the cheapest correct edit is one line — `const LINK = "H" as const;` — rather than twelve; the constant then still names what it is, and a reviewer sees twelve unchanged call sites instead of twelve to check.

- [ ] **Step A7: The upload route resolves the class from Concept2, and a 401 on either read reaches the same flag a rejected post does.** Four edits in `app/server/routes/concept2.ts`'s upload handler. All four were placed and run — see the receipt.

  **(a) One page-size constant, measured rather than felt.** Beside `TOKEN_REFRESH_SKEW_MS`:

```ts
// How many of the rower's most recent Concept2 results the send path reads to
// find their latest weight-class DECLARATION (ruling i, producer 1). FIVE,
// and the number is measured rather than felt: against log-dev from a dev
// laptop, 5 samples each, medians on 2026-09-03, `?number=1` answered in
// 216 ms and `?number=5` in 221 ms — a small page is free, so take the one
// that survives a short run of recent non-rower pieces (a BikeErg or SkiErg
// result is not required to carry a class). One page only: the route never
// walks `meta.pagination.links.next`, and a rower with no readable class in
// these five falls through to the profile derivation, which is quieter than
// paging their history.
const DECLARATION_PAGE_SIZE = 5;
```

  **(b) Extract the existing locked repeat-401 block into a named helper**, beside `acquireAccessToken` and sharing its closure. This is a refactor of TRIAD code and it earns its place: there are now THREE wire calls that can come back 401, and the alternative is a second copy of an eighteen-line justification that must stay in step with the first forever. The body and the whole existing comment move verbatim; only the name and the call sites are new:

```ts
      // Both wire calls this route makes can come back 401, and both must
      // answer identically — hence one helper rather than two copies. The
      // flag must be bound to the SAME link that actually produced the 401:
      // a fresh unconditional `withLinkLock` would flag whatever link exists
      // at that moment, and a callback relink landing in between would clear
      // `needsReauthAt` (upsertLink's own contract) and then have this
      // re-flag the NEW grant on the OLD grant's rejection (I4's
      // authority-split class). If the link's CURRENT access token still
      // matches the rejected one, the grant this route tried is still live —
      // flag it. If it does not match, a relink or rotation happened
      // concurrently and the NEW grant was never tried at all, so the honest
      // answer is a retryable c2_error rather than a needs_reauth that sends
      // the rower through re-consent for a grant that may be fine.
      async function flagIfSameGrant(rejectedToken: string): Promise<boolean> {
        return store.withLinkLock<boolean>(userId, async (locked) => {
          const matches =
            locked !== null && locked.accessToken === rejectedToken;
          if (matches) {
            return { action: "flagReauth", result: true };
          }
          return { action: "none", result: false };
        });
      }
```

  The existing `postResult` repeat-401 branch becomes `const stillSameGrant = await flagIfSameGrant(accessToken);` with its comment replaced by a one-line pointer to the helper.

  **(b2) The exclusion query, in `app/server/stores/logs.ts`.** One owner-scoped read beside `recordC2Result`, which is the writer it mirrors. It runs only when the declaration page came back OK and is therefore skipped entirely on a failed read:

```ts
    // Wave E PR2 (observation 29): the Concept2 result ids THIS app wrote to
    // the given Concept2 account, so the declaration read can exclude them.
    // Owner-scoped AND account-scoped: result ids live in Concept2's
    // namespace, and a row written while account A was linked says nothing
    // about account B — scoping to the LIVE link's `c2UserId` is what makes
    // this correct across a relink. Served by the existing
    // `session_logs_user_id_idx`; no new index (the per-user row count here
    // is the rower's own log, and the eligible population measured on prod
    // was 6 of 20 rows).
    async sentC2ResultIds(
      userId: string,
      c2UserId: number,
    ): Promise<Set<number>> {
      const rows = await db
        .select({ c2ResultId: sessionLogs.c2ResultId })
        .from(sessionLogs)
        .where(
          and(
            eq(sessionLogs.userId, userId),
            eq(sessionLogs.c2UserId, c2UserId),
            isNotNull(sessionLogs.c2ResultId),
          ),
        );
      return new Set(rows.map((r) => r.c2ResultId as number));
    },
```

  `and`, `eq` and `isNotNull` are already imported in that file (`lastDonePerWorkout` uses `isNotNull`). **`server/testing/fakes.ts`'s `makeFakeLogsStore` needs the same method**, filtering its in-memory rows on `c2UserId` and a non-null `c2ResultId` — without it eighteen existing upload tests answer 500, and `pnpm typecheck` will not tell you, because that file ends `as unknown as LogsStore`.

  **(c) The producer chain, as one helper.** Beside the one above, so the two reads are resolved as a UNIT and the caller has one thing to retry:

```ts
      // Producer order for Concept2's `weight_class` (ruling i;
      // `concept2/mapping.ts`'s block comment carries the vendor sentence
      // that forces it): the rower's own most recent DECLARATION first, our
      // derivation from their profile second, a refusal third. We never
      // guess a competition category onto a permanent third-party record.
      //
      // A FAILED read is not an EMPTY read (lens 2 F2). A `c2_error` on the
      // declaration page returns here, retryable, naming the layer that
      // failed; only a page that came back and genuinely carries no usable
      // class falls through to the profile. Refusing when we have no data
      // and guessing when we FAILED TO READ data is an asymmetry nothing
      // argues for, and the thing it guesses is a competition category on a
      // permanent third-party record. The only failure this helper surfaces
      // as `auth` is one the CALLER must re-run wholesale on a refreshed
      // token.
      //
      // `ourResultIds` is observation 29: the results list contains the rows
      // this app posted, and nothing on them says so. `ourRowsSkipped` rides
      // out purely so the log line can report it — it is a count of OUR OWN
      // writes, never anything about the rower's other rows.
      type WeightClassResolution =
        | {
            ok: true;
            weightClass: WeightClass;
            source: WeightClassSource;
            ourRowsSkipped: number;
          }
        | { ok: false; kind: "auth" }
        | {
            ok: false;
            kind: "c2_error";
            layer: "declaration" | "profile";
            status: number | null;
          }
        | { ok: false; kind: "no_class"; reason: WeightClassFailure };

      async function resolveWeightClass(
        token: string,
        c2UserId: number,
      ): Promise<WeightClassResolution> {
        const list = await client.fetchResults(token, DECLARATION_PAGE_SIZE);
        if (!list.ok) {
          if (list.kind === "auth") return { ok: false, kind: "auth" };
          return {
            ok: false,
            kind: "c2_error",
            layer: "declaration",
            status: list.status,
          };
        }
        const ourResultIds = await logs.sentC2ResultIds(userId, c2UserId);
        const ourRowsSkipped = list.rows.filter(
          (row) => row.id !== null && ourResultIds.has(row.id),
        ).length;
        const declared = pickDeclaredWeightClass(list.rows, {
          ourResultIds,
          now: now().getTime(),
        });
        if (declared !== null) {
          return {
            ok: true,
            weightClass: declared,
            source: "declaration",
            ourRowsSkipped,
          };
        }
        const me = await client.fetchMe(token);
        if (!me.ok) {
          if (me.kind === "auth") return { ok: false, kind: "auth" };
          return {
            ok: false,
            kind: "c2_error",
            layer: "profile",
            status: me.status,
          };
        }
        const derived = deriveWeightClass(me);
        if (!derived.ok) {
          return { ok: false, kind: "no_class", reason: derived.reason };
        }
        return {
          ok: true,
          weightClass: derived.weightClass,
          source: "profile",
          ourRowsSkipped,
        };
      }
```

  **(c2) The log line, because nothing in this route says which layer answered.** `grep -n "console\." server/routes/concept2.ts` returns NOTHING at this head: an operator watching a rower fail to send has no way to tell a refused profile from an unreachable Concept2 from a declaration we read correctly. One line per send, copying `server/auth/middleware.ts`'s `auth_disagreement` shape (`console.warn(JSON.stringify({ event, … }))`) — the nearest sibling in this codebase's own request path, and the convention this block follows rather than inventing one:

```ts
      // One line per send, naming WHICH producer answered — the route had no
      // logging at all before this. `console.log` on success and
      // `console.warn` on failure follows `auth/middleware.ts`'s convention
      // (`auth_via` logs, `auth_disagreement` warns).
      //
      // What it carries and what it must never carry: our own `logId` and
      // the resolved source; a COUNT of how many returned rows were OUR OWN
      // writes (the diagnostic that would have exposed observation 29 in
      // production); and on failure the layer, its status, or the refusal
      // reason. Never a token, never a result body, never a Concept2 result
      // id, never anything about another rower's rows.
      function logWeightClass(outcome: WeightClassResolution): void {
        const base = { event: "c2_weight_class", logId };
        if (outcome.ok) {
          console.log(
            JSON.stringify({
              ...base,
              source: outcome.source,
              ourRowsSkipped: outcome.ourRowsSkipped,
            }),
          );
          return;
        }
        console.warn(
          JSON.stringify({
            ...base,
            failure: outcome.kind,
            layer: outcome.kind === "c2_error" ? outcome.layer : undefined,
            status: outcome.kind === "c2_error" ? outcome.status : undefined,
            reason: outcome.kind === "no_class" ? outcome.reason : undefined,
          }),
        );
      }
```

  **(d) The resolution, between the token and the payload**, replacing the first `buildC2Payload` line:

```ts
      let accessToken = tokenOutcome.accessToken;
      let lockedLink = tokenOutcome.link;

      // Ruling (i): the weight class Concept2 requires on every rower result
      // is Concept2's, and we ask the rower for nothing. It is resolved HERE,
      // on the send that uses it — never stored, never cached across requests
      // (ruling R13). A declaration can change on Concept2 at any moment with
      // no signal to us, and a stale one writes a wrong competition category
      // into a record we cannot edit. The cost is one extra round trip per
      // send (~220 ms measured, +~440 ms when the profile fallback also runs)
      // on a human-initiated action that already renders SENDING; sends are
      // one per workout, never on a render or a poll. What IS reused is one
      // resolution per REQUEST across the internal 401 retry below — a
      // re-read between two attempts at the same row could send two different
      // classes for one send, which is the split-authority defect I4 exists
      // to prevent.
      let resolved = await resolveWeightClass(accessToken, lockedLink.c2UserId);
      if (!resolved.ok && resolved.kind === "auth") {
        const retryOutcome = await acquireAccessToken({
          staleAccessToken: accessToken,
        });
        if (!retryOutcome.ok) {
          res.status(retryOutcome.status).json(retryOutcome.body);
          return;
        }
        accessToken = retryOutcome.accessToken;
        lockedLink = retryOutcome.link;
        // The WHOLE resolution re-runs on the fresh token, declaration read
        // included: retrying only the profile would silently demote a rower
        // who HAS a declaration to our own derivation, purely because their
        // first token had expired.
        resolved = await resolveWeightClass(accessToken, lockedLink.c2UserId);
        if (!resolved.ok && resolved.kind === "auth") {
          // I2's rule, one wire call earlier than it used to apply: a repeat
          // 401 after a GENUINE refresh is a dead grant, not a stale token.
          // Same helper, same answer, same never-delete.
          logWeightClass(resolved);
          const stillSameGrant = await flagIfSameGrant(accessToken);
          res
            .status(stillSameGrant ? 409 : 502)
            .json(
              stillSameGrant
                ? { error: "needs_reauth" }
                : { error: "c2_error" },
            );
          return;
        }
      }
      logWeightClass(resolved);
      if (!resolved.ok) {
        if (resolved.kind !== "no_class") {
          // A read that FAILED, not a read that came back empty — the
          // difference matters because only one of them may be guessed past.
          // It answers the existing retryable family (502 `c2_error`, the
          // same words a failed post gets) rather than a new wire token,
          // because from the rower's side it is the same fact and the only
          // honest advice is "try again". WHICH layer failed is in the log
          // line above, where an operator needs it.
          res.status(502).json({ error: "c2_error" });
          return;
        }
        // A SECOND 422, and the client must tell it from `not_eligible`: that
        // one is decided from the ROW and cannot be repaired, this one is
        // decided from Concept2's own side and IS repairable — by designating
        // a class on a Concept2 result, or by fixing the profile weight.
        // Amendment 2i is the state that says so and carries the button.
        res
          .status(422)
          .json({ error: "no_weight_class", reason: resolved.reason });
        return;
      }

      let payload = buildC2Payload(
        mappingRow,
        resolved.weightClass,
        effectiveTz,
      );
      let postResult = await client.postResult(accessToken, payload);
```

  **The `!resolved.ok` ladder is written as a nested check rather than two flat guards, and that is load-bearing, not style.** `resolved` is a `let` reassigned inside the retry block, so TypeScript's control-flow analysis re-widens it afterwards: a flat `if (!resolved.ok && resolved.kind === "c2_error")` followed by `if (!resolved.ok) { … resolved.reason }` does not compile, because the compiler cannot rule out the `auth` member. Measured by placing it.

  **`logWeightClass(resolved)` sits on both exits, and the placement of the first one is deliberate.** The repeat-401 branch logs BEFORE `flagIfSameGrant`, because that helper takes a lock and the log line is about the resolution, not about what the lock decided. Every other outcome — resolved, refused, failed — goes through the single call below the retry block, so there is exactly one line per send and no path that emits two.

  …and the retry's payload rebuild becomes:

```ts
        // Same class, deliberately: resolved ONCE per request (ruling R13),
        // reused across this retry so one send can never carry two classes.
        payload = buildC2Payload(mappingRow, resolved.weightClass, effectiveTz);
```

  **The 200 response carries the class and its producer** (ruling R2). Replace the success `res.status(200)` line:

```ts
        // The class and WHERE IT CAME FROM ride the response so the rower can
        // see them on the SENT state (ruling R2, amendment 2c). Concept2's
        // own help makes the class the rower's DECLARATION, so a class we
        // DERIVED is a guess — and a guess nobody is ever shown can never be
        // corrected, even though Concept2 permits per-result editing. Neither
        // value is stored: this is the one moment they exist, which is
        // exactly the moment the disagreement is created.
        res.status(200).json({
          resultId: postResult.resultId,
          weightClass: resolved.weightClass,
          weightClassSource: resolved.source,
        });
        return;
```

  **`lockedLink` is now only ever read for `c2UserId`.** Narrow `LinkIdentity` to `{ c2UserId: number }`, drop `weightClass: locked.weightClass` from where `acquireAccessToken` builds it, and reconcile the comment above it — it currently argues for a field that is leaving. `pnpm typecheck` proves nothing else read it.

  **Note what the already-sent short-circuit does NOT gain.** It answers `200 {resultId}` with no class, because no class was resolved on that request and inventing one would be a claim about a send that happened in the past. The client reads both new fields defensively for exactly this reason.

- [ ] **Step A8: The tests, and what each is allowed to prove.** Three layers, because the pure functions, the route and the seam fail differently. All of the blocks below were placed and run.

  **1. The pure tables, in `app/server/concept2/mapping.test.ts`.** Two describes. The boundary is pinned on both sides in the MEASURED unit with **INDEPENDENT literals**, never derived from the exported constants — a test that imports the number it exists to gate proves nothing about it (RF21's first smell). **The blocks are here rather than "in the placement", because every other task in this plan carries its blocks and an implementer working from titles cannot reproduce the counts the mutation table states:**

```ts
const NOW = Date.parse("2026-09-03T12:00:00Z");

function resultRow(over: Partial<C2ResultRow> = {}): C2ResultRow {
  return {
    id: 85561,
    type: "rower",
    weightClass: "H",
    dateUtc: "2026-09-02 10:00:30",
    date: "2026-09-02 06:00:30",
    ...over,
  };
}

describe("pickDeclaredWeightClass", () => {
  it("never reads OUR OWN writes back as the rower's declaration", () => {
    // Observation 29. The row is indistinguishable from a real declaration
    // in every projected field EXCEPT its id, which is why the id is
    // projected — and the second assertion proves the fixture is a
    // declaration in every other respect, so the first one is really about
    // the exclusion and not about some other skip.
    const ours = resultRow({ id: 90001, weightClass: "H" });
    expect(
      pickDeclaredWeightClass([ours], {
        ourResultIds: new Set([90001]),
        now: NOW,
      }),
    ).toBeNull();
    expect(
      pickDeclaredWeightClass([ours], { ourResultIds: new Set(), now: NOW }),
    ).toBe("H");
  });

  it("takes the NEWEST readable class, skipping our own row above it", () => {
    // Two survivors that DISAGREE, so list order is what decides — a
    // fixture whose survivors agreed would let a reversed iteration pass.
    expect(
      pickDeclaredWeightClass(
        [
          resultRow({ id: 85561, weightClass: "L" }),
          resultRow({ id: 85560, weightClass: "H" }),
        ],
        { ourResultIds: new Set(), now: NOW },
      ),
    ).toBe("L");
    expect(
      pickDeclaredWeightClass(
        [
          resultRow({ id: 90001, weightClass: "H" }),
          resultRow({ id: 85561, weightClass: "L" }),
          resultRow({ id: 85560, weightClass: "H" }),
        ],
        { ourResultIds: new Set([90001]), now: NOW },
      ),
    ).toBe("L");
  });

  it("reads a class only off a type Concept2 REQUIRES one on", () => {
    // The vendor's ten documented types, in the order its own table lists
    // them. The three that answer are the three the Add Result table names
    // ("Required if type is rower, dynamic or slides"); a `skierg` row
    // carrying a class is the vendor's OWN example, and it is noise.
    const seen = (
      [
        "rower",
        "dynamic",
        "slides",
        "skierg",
        "bike",
        "paddle",
        "water",
        "snow",
        "rollerski",
        "multierg",
      ] as const
    ).map((type) =>
      pickDeclaredWeightClass([resultRow({ type, weightClass: "L" })], {
        ourResultIds: new Set(),
        now: NOW,
      }),
    );
    expect(seen).toStrictEqual([
      "L",
      "L",
      "L",
      null,
      null,
      null,
      null,
      null,
      null,
      null,
    ]);
  });

  it("skips a row dated in the FUTURE, so one bad stamp cannot pin the declaration forever", () => {
    expect(
      pickDeclaredWeightClass(
        [
          resultRow({ id: 1, weightClass: "L", dateUtc: "2030-01-01 00:00:00" }),
          resultRow({ id: 2, weightClass: "H" }),
        ],
        { ourResultIds: new Set(), now: NOW },
      ),
    ).toBe("H");
  });

  it("takes a row whose timestamps are BOTH absent, because Concept2's own example carries a null date_utc", () => {
    expect(
      pickDeclaredWeightClass(
        [resultRow({ weightClass: "L", dateUtc: null, date: null })],
        { ourResultIds: new Set(), now: NOW },
      ),
    ).toBe("L");
  });

  it("skips rows whose class is not exactly H or L, and returns null when the page holds none", () => {
    // Not only absent and empty: a lowercase letter and a spelled-out word
    // are not wire classes, and sending one would be refused by Concept2
    // (or worse, accepted as something else).
    expect(
      pickDeclaredWeightClass(
        [
          resultRow({ weightClass: null }),
          resultRow({ weightClass: "" }),
          resultRow({ weightClass: "l" }),
          resultRow({ weightClass: "Heavyweight" }),
        ],
        { ourResultIds: new Set(), now: NOW },
      ),
    ).toBeNull();
    expect(
      pickDeclaredWeightClass([], { ourResultIds: new Set(), now: NOW }),
    ).toBeNull();
  });
});

describe("deriveWeightClass", () => {
  it("case-folds gender, because the wire's letter case is documented only by example", () => {
    expect(deriveWeightClass({ weight: 7000, gender: "m" })).toStrictEqual({
      ok: true,
      weightClass: "L",
    });
    expect(deriveWeightClass({ weight: 7000, gender: " F " })).toStrictEqual({
      ok: true,
      weightClass: "H",
    });
  });

  it("classifies every case in the table", () => {
    // INDEPENDENT literals: 7500 / 6150 are written here, never imported
    // from the module they gate (RF21's first smell). "or less" is
    // inclusive, so the boundary itself is LIGHT on both sides.
    const table = [
      { weight: 7500, gender: "M", expected: "L" },
      { weight: 7501, gender: "M", expected: "H" },
      { weight: 6150, gender: "F", expected: "L" },
      { weight: 6151, gender: "F", expected: "H" },
    ] as const;
    expect(
      table.map((c) =>
        deriveWeightClass({ weight: c.weight, gender: c.gender }),
      ),
    ).toStrictEqual(table.map((c) => ({ ok: true, weightClass: c.expected })));
  });

  it("REFUSES four of the five wrong-unit readings of a 75 kg rower", () => {
    // decigrams, grams, hundredths-kg (the assumed unit), hundredths-lb,
    // integer kg, integer lb. The THIRD is the assumed-correct reading and
    // the FOURTH is the one no band can catch — this test records that
    // rather than implying the guard is complete, so a later overclaim
    // goes red here.
    const readings = [750000, 75000, 7500, 16530, 75, 165];
    expect(
      readings.map((weight) => deriveWeightClass({ weight, gender: "M" }).ok),
    ).toStrictEqual([false, false, true, true, false, false]);
  });

  it("tells 'present but unreadable' apart from 'not set', and refuses a profile it cannot classify", () => {
    expect(
      deriveWeightClass({ weight: "unreadable", gender: "M" }),
    ).toStrictEqual({ ok: false, reason: "unreadable_weight" });
    expect(deriveWeightClass({ weight: null, gender: "M" })).toStrictEqual({
      ok: false,
      reason: "no_weight",
    });
    expect(deriveWeightClass({ weight: 0, gender: "M" })).toStrictEqual({
      ok: false,
      reason: "no_weight",
    });
    expect(deriveWeightClass({ weight: 7000, gender: null })).toStrictEqual({
      ok: false,
      reason: "no_gender",
    });
    // The band runs BEFORE the gender branch, so a wrong unit refuses for
    // every profile rather than only for the two we can classify.
    expect(deriveWeightClass({ weight: 750000, gender: "X" })).toStrictEqual({
      ok: false,
      reason: "implausible_weight",
    });
  });
});
```

  RUN against the placement: `Tests 40 passed (40)` for the whole file. Mutation results are in the table below.

  **2. The route, in `app/server/routes/concept2.test.ts`'s upload describe.** Written against that file's real helpers (`buildApp`, `asA`, `makeStubClient`, `freshLink`, `seedEligibleLog`) — read them; there is nothing named `makeApp` or `mintState`. **`makeStubClient` gains a `fetchResults` default, and this is the edit that keeps ~20 existing upload tests green:**

```ts
    // Ruling (i): the upload path reads the rower's most recent Concept2
    // results to find their own weight-class DECLARATION before it ever
    // considers the profile. This default is the account we measured — every
    // result on log-dev user 2211 carries `weight_class`, all "H", type
    // `rower` — so it is the machine's own ordinary state, not a value
    // chosen to make a gate pass. A test about the PROFILE fallback must
    // override it with `{ ok: true, rows: [] }`, or it silently exercises
    // the declaration path instead.
    fetchResults: vi.fn(async () => ({
      ok: true as const,
      rows: [
        {
          id: 90001,
          type: "rower",
          weightClass: "H",
          dateUtc: "2026-09-02 10:00:30",
          date: "2026-09-02 06:00:30",
        },
      ],
    })),
```

  Eight new tests go in that describe, and each names the thing it is allowed to prove:

  - `"sends the class the ROWER declared on their own most recent Concept2 row"` — asserts the POSTED BODY (the only place the claim is observable) **and** that `fetchMe` was never called.
  - `"falls back to OUR derivation from the profile, and says which producer answered"` — `rows: []`, `weight: 7000, gender: "M"` → `weight_class: "L"`, `weightClassSource: "profile"`.
  - **`"never reads its OWN write back as the rower's declaration on the next send"` — observation 29's gate, and it is an RF24 seam: it starts UPSTREAM of the producer.** Both blocks are below.
  - **`"reports a FAILED declaration read as retryable, never as our own guess"`.** This REPLACES a test an earlier revision prescribed — `"a failed declaration read falls through to the profile rather than failing the send"` — which blessed the very behaviour lens 2 F2 identified as the defect. **Delete that one; do not keep both.** A network blip must not change a competition category on a permanent record.
  - `"refuses with no_weight_class and reaches Concept2's results endpoint NOT AT ALL when neither producer answers"` — the assertion that matters is `expect(client.postResult).not.toHaveBeenCalled()`; a 422 that still POSTed would have written a class we invented onto a permanent record.
  - `"passes the profile's OWN failure reason through, so an unreadable weight is not reported as an unset one"`.
  - `"flags needs_reauth when the class reads 401 twice, rather than reporting a retryable error forever"` — observation 25's whole reason.
  - `"re-reads the DECLARATION on the refreshed token, not just the profile"` — asserts `fetchResults`'s SECOND call carried the new token.

  The two this fold adds, written against the file's real helpers and RUN:

```ts
  it("never reads its OWN write back as the rower's declaration on the next send", async () => {
    // RF24, and the only shape that can catch observation 29: this test
    // STARTS upstream of the producer. Send 1 writes a row; Concept2 then
    // echoes that row back on the results list carrying the class we sent;
    // send 2 must still answer `profile`, because a class we produced is
    // not a declaration however it comes back to us.
    //
    // Two independent observables, because the echoed class necessarily
    // EQUALS what we sent — the posted body cannot discriminate here, which
    // is exactly why ruling R2 put the source on the response.
    const store = makeFakeConcept2Store();
    await store.upsertLink(userA.id, freshLink());
    const client = makeStubClient();
    const page: { rows: unknown[] } = { rows: [] };
    vi.mocked(client.fetchResults).mockImplementation(async () => ({
      ok: true as const,
      rows: page.rows as never,
    }));
    vi.mocked(client.fetchMe).mockResolvedValue({
      ok: true,
      c2UserId: 2211,
      username: "jmorelli",
      weight: 7000,
      gender: "M",
    });
    vi.mocked(client.postResult).mockResolvedValue({ ok: true, resultId: 340 });
    const { app, logs } = buildApp({ store, client });
    const first = await seedEligibleLog(logs, userA.id);
    const second = await seedEligibleLog(logs, userA.id);

    const one = await asA(
      request(app).post(`/api/concept2/results/${first}`).send({ tz: "UTC" }),
    );
    expect(one.status).toBe(200);
    expect(one.body.weightClassSource).toBe("profile");

    // Concept2 now returns OUR row. Nothing on it says so except the id.
    page.rows = [
      {
        id: 340,
        type: "rower",
        weightClass: "L",
        dateUtc: "2026-09-03 11:00:00",
        date: "2026-09-03 07:00:00",
      },
    ];
    vi.mocked(client.fetchMe).mockClear();

    const two = await asA(
      request(app).post(`/api/concept2/results/${second}`).send({ tz: "UTC" }),
    );
    expect(two.status).toBe(200);
    expect(two.body.weightClassSource).toBe("profile");
    // The fallback really RAN, rather than the source string alone being
    // right for some other reason.
    expect(client.fetchMe).toHaveBeenCalledTimes(1);
  });

  it("reports a FAILED declaration read as retryable, never as our own guess", async () => {
    // Lens 2 F2. The rower may well have a declaration; we could not read
    // it. Deriving here would put OUR guess on a permanent third-party
    // record because of a 500, and the rower would never know a read had
    // failed at all.
    const store = makeFakeConcept2Store();
    await store.upsertLink(userA.id, freshLink());
    const client = makeStubClient();
    vi.mocked(client.fetchResults).mockResolvedValue({
      ok: false,
      kind: "c2_error",
      status: 500,
    });
    const { app, logs } = buildApp({ store, client });
    const id = await seedEligibleLog(logs, userA.id);

    const res = await asA(
      request(app).post(`/api/concept2/results/${id}`).send({ tz: "UTC" }),
    );
    expect(res.status).toBe(502);
    expect(res.body).toStrictEqual({ error: "c2_error" });
    expect(client.fetchMe).not.toHaveBeenCalled();
    expect(client.postResult).not.toHaveBeenCalled();
  });
```

  **SEVEN existing tests change, not four, and one changes for a reason worth naming.** `grep -c "toStrictEqual({ resultId" server/routes/concept2.test.ts` -> **`6`** (lines 1592, 1955, 2011, 2048, 2173, 2197); each gains the two new keys. Plus `it("sources weightClass and c2UserId from the LOCKED read …")`, which loses half its subject: the class no longer lives on the link, so it becomes `"sources c2UserId from the LOCKED read, not the earlier unlocked getLink"` and drops its `weight_class` assertion, keeping the `c2UserId` one — which is I4's remaining half and still worth a gate. **The already-sent short-circuit's own tests do NOT appear in that failing set, which is the evidence that its bare `{resultId}` really is unchanged.**

  **3. The seam.** Task 10's RF24 gate gains rows for this — see that task. It is the only test in this PR that starts at Concept2's own results-list shape and ends at the bytes on Concept2's results endpoint.

- [ ] **Step A9: Reconcile every surface that still speaks of a class we no longer hold.** `git grep -n "weightClass\|weight_class\|WEIGHT_CLASSES\|WeightClass" -- app/` after Part A must return only these, and **the task report pastes the ACTUAL output and names every hit that does not count** — a "grep finds nothing" sentence with no output is not evidence:

  - `server/concept2/mapping.ts`'s `WeightClass`/`WeightClassSource`/`WeightClassFailure`, the two producers and their test;
  - `buildC2Payload`'s `weight_class` wire key and the route's resolved send;
  - `server/concept2/client.ts`'s `fetchResults` projection of the `weight_class` field;
  - **`server/db/schema.integration.test.ts`'s migration-0021 describe**, whose raw-SQL `weight_class` inserts are KEPT on purpose (step A10) — this is the hit most likely to be "cleaned up" by someone reading this grep as a checklist;
  - `scripts/c2-crossconnect.ts`, the PR0 desk harness, which keeps its own hardcoded `weight_class`: it is the instrument that MEASURED the 422 this ruling rests on, and it talks to Concept2 directly rather than through our routes.

  Also reconcile the two dev-only surfaces the field leaves: `Concept2LinkProbe.tsx`'s readout line (step A4) and its `LinkStatus` interface.

- [ ] **Step A10: The migration's test ripple runs in TWO directions, and the sites that must be KEPT are invisible to typecheck.** `app/server/db/schema.integration.test.ts` carries **16** `weightClass`/`weight_class` occurrences (`git grep -c`, head `e74696f7`) across **two** describes that run against **different migration caps**, and they need opposite treatment. An earlier draft scoped this file as "two `db.insert` calls", which is what an implementer would have worked from.

  **`describe("migration 0018: …")` runs the FULL `migrate()`.** After 0023 it has no column, so:
  - the two `"weight_class"` entries in the `concept2_links` and `concept2_auth_attempts` column-list assertions are DELETED;
  - `weightClass: "H"` / `expect(link.weightClass).toBe("H")` in the links round-trip and `weightClass: "L"` / `expect(attempt.weightClass).toBe("L")` in the attempts round-trip are DELETED;
  - **`it("rejects a weight_class value outside the enum at the DB layer")` is DELETED OUTRIGHT.** Its whole subject is the enum type being dropped, and its assertion is `rejects.toThrow(/invalid input value for enum weight_class/)`. Keeping it means keeping the type.

  **`describe("migration 0021: …")` runs against a folder capped at 0021** (its own `staging` assertion pins `appliedBefore: 21, appliedAfter: 22`), where `weight_class` is still `NOT NULL` with no default. So:
  - its five raw-SQL inserts naming `weight_class` are **KEPT, unchanged** — they are that image's own statements, and they are invisible to `pnpm typecheck` AND to `--project unit`, so nothing would tell an implementer who removed them;
  - its **two typed `db.insert(concept2Links)` calls in the D1 unique-constraint test break in the direction the plan did not anticipate.** Once step A1 deletes the field from the Drizzle object, those inserts OMIT a column the capped DB still requires, and D1 fails with a **not-null violation instead of the unique violation it asserts**. The fix is to convert both to raw `pool.query` SQL that still names `weight_class` — **not** to "remove the field", which is what breaks them.

    **AND THE ASSERTION MOVES IN THE SAME EDIT, or the conversion swaps one failure for another.** D1 asserts `rejects.toMatchObject({ cause: { message: /concept2_links_c2_user_id_unique/ } })`, and its own in-file comment says the `cause` nesting exists BECAUSE the typed builder wraps pg's error in a `DrizzleQueryError`. Raw `pool.query` throws pg's error directly and has no `.cause`, so the converted test goes red on the shape rather than on the constraint. Assert the pg error itself — `rejects.toThrow(/concept2_links_c2_user_id_unique/)` — and **rewrite the comment that explains the nesting in the same edit**, since it is about to describe a wrapper that is no longer there (the review-record rule: correct the claim where it is USED, not only where it was argued). Both halves are invisible to `pnpm typecheck` and to `--project unit`; only `--project integration` sees either.

  Run `--project integration` on this file specifically after the change; `--project unit` cannot see any of it.

---

### Part B — `c2Username` and `logbookBaseUrl` (ruling ii)

- [ ] **Step 2: Write the failing route tests.** These are written against the file's REAL helpers, read at this head: `buildApp({ store, client, available })` returning `{ app, store, logs, client, setAvailable }`, `mintAndGetState(app)` (web/cookie by default), `asA` (bearer) and `asACookie` (cookie), `freshLink(overrides)` over `LINK_INPUT` (whose `c2UserId` is 2211), `makeStubClient()` and `stubHappyExchange(client)`. **There is nothing named `makeApp` or `mintState` in this file** — an earlier draft's blocks called both, which is why its M12/M12b/M12c probes gated tests that could not be pasted or run.

  The first three go in the `link (GET/DELETE /api/concept2/link)` describe, immediately before `"GET: needsReauth reflects a set needsReauthAt"`:

```ts
  it("GET /link names the linked Concept2 username and the logbook origin", async () => {
    // The username discharges the account-injection detect-identity
    // treatment (ROADMAP's C2 row: the card "naming which account the link
    // goes to" ships with PR2). The origin exists because the client cannot
    // know whether this deployment talks to log.concept2.com or log-dev
    // (plan observation 5), and a wrong origin 404s the link-out silently.
    const store = makeFakeConcept2Store();
    await store.upsertLink(
      userA.id,
      freshLink({ c2Username: "jamesawesome" }),
    );
    const { app } = buildApp({ store });
    const res = await asA(request(app).get("/api/concept2/link"));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      available: true,
      linked: true,
      c2UserId: 2211,
      c2Username: "jamesawesome",
      logbookBaseUrl: LOGBOOK_BASE_URL,
    });
    expect(res.body).not.toHaveProperty("accessToken");
    expect(res.body).not.toHaveProperty("refreshToken");
  });

  it("GET /link reports a null username rather than omitting the field", async () => {
    const store = makeFakeConcept2Store();
    await store.upsertLink(userA.id, freshLink({ c2Username: null }));
    const { app } = buildApp({ store });
    const res = await asA(request(app).get("/api/concept2/link"));
    expect(res.body.c2Username).toBeNull();
  });

  it("GET /link leaks neither new field while the flag is off", async () => {
    const { app } = buildApp({ available: false });
    const res = await asA(request(app).get("/api/concept2/link"));
    expect(res.body).toStrictEqual({ available: false });
  });
```

  `freshLink`'s override type is `Partial<typeof LINK_INPUT & { expiresAt: Date }>`, so it must widen to admit the new field: `Partial<typeof LINK_INPUT & { expiresAt: Date; c2Username: string | null }>`.

  The two WRITE-SITE tests go in the callback describe, beside its existing `"a username-less fetchMe falls back to the numeric id"` case, because they start at the WRITER (the callback handler) rather than at `store.upsertLink` — which is what makes them a check on the route's own `c2Username: me.username || null` argument rather than on the store's ability to hold a string:

```ts
  it("a real callback exchange stores the username GET /link then reports", async () => {
    const store = makeFakeConcept2Store();
    const client = makeStubClient();
    stubHappyExchange(client);
    vi.mocked(client.fetchMe).mockResolvedValue({
      ok: true,
      c2UserId: 2211,
      username: "jamesawesome",
      // `weight`/`gender` are required on the success shape after step A5.
      // Present-and-plausible here because this test is about the
      // username; the derivation's own cases live in mapping.test.ts.
      weight: 8200,
      gender: "M",
    });
    const { app } = buildApp({ store, client });
    const state = await mintAndGetState(app);
    const done = await asACookie(
      request(app).get(`/api/concept2/callback?state=${state}&code=abc123`),
    );
    expect(done.status).toBe(200);
    const res = await asA(request(app).get("/api/concept2/link"));
    expect(res.body.c2Username).toBe("jamesawesome");
  });

  it("stores NO username rather than an empty one when Concept2 sends a blank", async () => {
    // `""` is what `client.ts`'s fetchMe passes through for a blank field
    // (observation 18); `??` would store it and the card would render a gap
    // where the account name belongs.
    const store = makeFakeConcept2Store();
    const client = makeStubClient();
    stubHappyExchange(client);
    vi.mocked(client.fetchMe).mockResolvedValue({
      ok: true,
      c2UserId: 2211,
      username: "",
      weight: 8200,
      gender: "M",
    });
    const { app } = buildApp({ store, client });
    const state = await mintAndGetState(app);
    await asACookie(
      request(app).get(`/api/concept2/callback?state=${state}&code=abc123`),
    );
    const res = await asA(request(app).get("/api/concept2/link"));
    expect(res.body.c2Username).toBeNull();
  });
```

- [ ] **Step 3: Run it, confirm it fails** (`pnpm exec vitest run --project unit server/routes/concept2.test.ts` with the `NODE_OPTIONS` prefix), expecting a type error on `c2Username` and a missing `logbookBaseUrl` in the response.

- [ ] **Step 4: Add the column.** In `app/server/db/schema.ts`'s `concept2Links` table, after `c2UserId`:

```ts
  // Wave E PR2 (Gate 0 amendment 1c, ruling ii): the linked account's
  // Concept2 username, captured at exchange from the same `GET
  // /api/users/me` response `c2_user_id` comes from. NULLABLE and no
  // backfill: Concept2 documents `username` as optional (PR1.75a plan
  // observation 3 measured it PRESENT on log-dev, 2026-09-02, but the
  // field is read as optional and the card falls back to `account #<id>`).
  // Exists because the You card's identity line is the account-injection
  // residual's detect-identity treatment (ROADMAP's C2 row), and a numeric
  // id is not an identity a rower recognises.
  c2Username: text("c2_username"),
```

  Then `pnpm db:generate` and hand-edit the generated SQL to carry the header the `0019`/`0021` precedent uses.

- [ ] **Step 5: Thread it through the store, the fake, and both write sites.** In `app/server/stores/concept2.ts`, add the field to `upsertLink`'s input type **as OPTIONAL** and default it internally:

```ts
  /** Wave E PR2. OPTIONAL on the input and `null` by default, while the
   *  COLUMN and `getLink`'s projection stay required-and-nullable. The
   *  asymmetry is deliberate and measured: a required input reaches 53
   *  existing call sites through three builders (`LINK_INPUT`/`freshLink`,
   *  `link()`, `makeFakeConcept2Store`), none of which has a username to
   *  give — while both PRODUCTION writers pass one explicitly, so nothing
   *  real depends on the default. A caller that HAS a username must still
   *  say so; a caller that has none does not have to say `null`. */
  c2Username?: string | null;
```

  …with `c2Username: input.c2Username ?? null` in the `values`/`set` clauses, and the field added to the row `getLink` returns. Mirror the same optional shape in `app/server/testing/fakes.ts`'s `makeFakeConcept2Store`.

  In `app/server/routes/concept2.ts`, both `upsertLink` calls already hold the value — the web callback at the `renderCallbackPage("linked", …)` site reads `me.username` and the native exchange has the identical `me`:

```ts
      await store.upsertLink(user.id, {
        c2UserId: me.c2UserId,
        // `||`, not `??`: ABSENT, EMPTY and VALUED are three cases and only
        // one of them is a username. `client.ts`'s `fetchMe` returns any
        // string it finds, empty included (observation 18), and storing
        // `""` would put a blank where the card's identity line names an
        // account. `|| null` collapses both non-identities to the one the
        // column already means.
        c2Username: me.username || null,
        accessToken: tokenResult.tokens.accessToken,
        refreshToken: tokenResult.tokens.refreshToken,
        expiresAt: tokenResult.tokens.expiresAt,
        // No `weightClass`: step A1 dropped the column. `consumed` is now
        // read only for its freshness verdict.
      });
```

  (and the same addition in the `POST /exchange` handler's `upsertLink` call, with `userId` in place of `user.id`).

- [ ] **Step 5b: Fix the callback page's sibling fallback, in the same task.** `routes/concept2.ts:405-408` currently reads `c2Username: me.username ?? \`#${me.c2UserId}\``. Two defects, one line:

```ts
        // `||`, not `??` (observation 18): an empty username is a string
        // and would render "Concept2  is now connected to Ergomatic …" —
        // under a comment that used to claim this page "never renders an
        // empty identity".
        //
        // `account #<id>`, not `#<id>`: ONE spelling of the numeric
        // identity across both surfaces. The card's `identityLine`
        // (Task 1) renders "Concept2 account #2211 · Ergomatic …", and a
        // rower who sees "#2211" here and "account #2211" a screen later
        // has to work out they are the same thing.
        c2Username: me.username || `account #${String(me.c2UserId)}`,
```

  This is the same defect class as the card's, one seam over, and it lives in the same file as the write sites above — fixing it here is what makes the empty-username guard a CLASS fix rather than an instance fix. `callbackPage.ts` itself is unchanged: it escapes and renders whatever it is handed.

  **This change turns an EXISTING committed test red, and the plan names the file and the string rather than letting the implementer discover it.** `routes/concept2.test.ts`'s `"a username-less fetchMe falls back to the numeric id on the Linked page (observation 3)"` asserts, verbatim:

```ts
    expect(res.text.replace(/<[^>]+>/g, "")).toContain(
      "Concept2 #2211 is now connected to Ergomatic a@x.com.",
    );
```

  Update that expected string to `"Concept2 account #2211 is now connected to Ergomatic a@x.com."`. Two neighbours that DO NOT change, checked rather than assumed: `server/concept2/callbackPage.test.ts` and `server/routes/concept2.integration.test.ts` both drive the page with a REAL username, so neither touches the fallback branch.

  Then add the covering test for the new spelling, beside it in the callback describe (the route owns the fallback, `callbackPage.ts` owns the escaping):

```ts
  it("names the numeric account the SAME way the card does when Concept2 sends no username", async () => {
    // Two shapes, one fallback: absent and empty are both "no identity",
    // and both must read `account #2211` — the exact spelling the card's
    // `identityLine` uses, so a rower meets one identity, not two.
    const rendered: string[] = [];
    for (const username of [null, ""] as const) {
      const store = makeFakeConcept2Store();
      const client = makeStubClient();
      stubHappyExchange(client);
      vi.mocked(client.fetchMe).mockResolvedValue({
        ok: true,
        c2UserId: 2211,
        username,
        weight: 8200,
        gender: "M",
      });
      const { app } = buildApp({ store, client });
      const state = await mintAndGetState(app);
      const res = await asACookie(
        request(app).get(`/api/concept2/callback?state=${state}&code=abc123`),
      );
      rendered.push(res.text.replace(/<[^>]+>/g, ""));
    }
    expect(
      rendered.map((text) =>
        text.includes("Concept2 account #2211 is now connected to"),
      ),
    ).toStrictEqual([true, true]);
  });
```

  A `for` loop with one assertion on the mapped array, never `expect` inside the loop — `vitest/no-conditional-expect` and this plan's own mapped-assertion rule. Each iteration needs its OWN `store`/`client`, because a second callback against a store that already holds the link takes a different branch.

- [ ] **Step 6: Return both fields.** `Concept2RouterDeps` gains:

```ts
  // The Concept2 ORIGIN this deployment talks to (`server/index.ts`'s
  // `c2BaseUrl`). Returned on `GET /link` because the client builds the
  // View-on-Concept2 URL and cannot know whether we are pointed at
  // log.concept2.com or log-dev.concept2.com — a hardcoded guess 404s for
  // the whole sandbox phase, which is the phase every walk happens in.
  logbookBaseUrl: string;
```

  and the `GET /link` linked response becomes:

```ts
      res.json({
        available: true,
        linked: true,
        // No `weightClass` (step A4, ruling i): there is no stored class,
        // and the card never showed one. Both sides of
        // `scripts/webauth-contract.test.ts`'s key gate drop it in the
        // same commit.
        //
        // PR2 needs the linked account's identity to render the sent-state
        // contract (spec F8: "sent" only when a row's c2_user_id matches
        // the LIVE link's) and to build the View-on-Concept2 URL
        // (/profile/{c2_user_id}/log/{result_id}). Still no token on this
        // response — only the numeric account id, the username, and our
        // own configured origin.
        c2UserId: link.c2UserId,
        c2Username: link.c2Username,
        // EXPLICIT `key: value`, never the ES2015 shorthand
        // `logbookBaseUrl,` — observation 21. `scripts/webauth-contract.
        // test.ts`'s `linkResponseKeys()` parses this literal with a regex
        // that requires a `key:`, and holds the result equal to
        // `Concept2LinkProbe.tsx`'s `LinkStatus`. Shorthand makes this key
        // INVISIBLE to that gate: the gate stays green while the thing it
        // exists to track goes unpinned. The redundancy is the point.
        logbookBaseUrl: logbookBaseUrl,
        needsReauth: link.needsReauthAt !== null,
      });
```

  Thread `logbookBaseUrl` from `app/server/index.ts`'s existing `c2BaseUrl` through `app/server/app.ts`'s `AppDeps.concept2`, exactly as `webRedirectUri` is threaded today.

  **And change that env read from `??` to `||` in the same step** (observation 22) — it is the server end of the same absent/empty/valued rule Task 1 applies to the wire end, and splitting the two halves across tasks is how one of them ships alone:

```ts
// `||`, not `??` (Wave E PR2): `C2_BASE_URL=""` in a deploy env is a
// STRING and survives `??`, and an empty origin builds a RELATIVE
// View-on-Concept2 URL that opens on Ergomatic's own domain. Absent and
// empty are the same non-answer here, and both take the default.
const c2BaseUrl = process.env.C2_BASE_URL || "https://log-dev.concept2.com";
```

- [ ] **Step 6b: Update BOTH sides of the contract gate, and the two test harness literals.** None of these were in the plan before the paste-test ran the full `unit` project; each is a hard failure, not a warning.

  1. **`app/scripts/webauth-contract.test.ts`** — the test "the probe's LinkStatus interface names exactly the keys GET /api/concept2/link emits" carries an INDEPENDENT pinned literal list (`["available","c2UserId","linked","needsReauth","weightClass"]`, sorted) as well as a set comparison, "without it, deleting a key from BOTH files at once would keep the set equality green" (that test's own comment). **Add `c2Username` and `logbookBaseUrl`, REMOVE `weightClass`** (step A4), leaving `["available","c2UserId","c2Username","linked","logbookBaseUrl","needsReauth"]` in sort order. The independent literal is exactly what makes the removal safe to review: dropping the key from the route and the probe together would keep the set comparison green, and only this list notices. Read `linkResponseKeys()` before writing the response literal: it strips `//` comments, then matches `res.json({...})` with `[^{}]*` and pulls keys with `(?:^|[{,])\s*(\w+)\s*:` — so an ES2015 shorthand key is not a key to it, and a nested object literal inside the response would break the read entirely.
  2. **`app/src/monitor/Concept2LinkProbe.tsx`** — add the same two fields (`c2Username?: string | null;` and `logbookBaseUrl?: string;`) to its `LinkStatus` interface, which is what `linkStatusKeys()` parses. The probe's behaviour, copy and CSS are untouched (ruling iv); this is a type declaration the gate above holds equal to the route.

     **PUT NO `//` COMMENT INSIDE THAT INTERFACE'S BRACES.** `linkStatusKeys()` reads the body with `/([A-Za-z_$][\w$]*)\??:/g` and does NOT strip comments, unlike its sibling `linkResponseKeys()` which does. Measured: a comment beginning `// Wave E PR2: two fields the PRODUCT card reads` made the gate fail with a phantom key `"PR2"` in the emitted-vs-declared diff — a red gate for a reason that has nothing to do with the contract, and a confusing one to debug. The explanation belongs in the interface's own preceding doc comment, and that comment should say so, so the next person adding a field does not repeat it.
  3. **`app/server/routes/concept2.test.ts`'s `buildApp`** and **`app/server/routes/concept2.integration.test.ts`'s `baseDeps`** — both construct a `Concept2RouterDeps` literal and must now supply `logbookBaseUrl`. Use a value that is obviously not production (`"https://log-dev.concept2.test"`, named as a `LOGBOOK_BASE_URL` constant beside the file's existing `WEB_REDIRECT_URI`) so M11's hardcode mutation has something to disagree with. **`concept2.test.ts` builds a SECOND such literal**, in its `createApp wiring (RF24: the seam the router-level tests skip)` describe, which constructs `AppDeps.concept2` directly rather than going through `buildApp` — it needs the field too, and `pnpm typecheck` is what names it.
  4. **`app/server/routes/concept2.test.ts`'s `"GET: available, linked — carries c2UserId, tokens never serialized"`** — a pre-existing test that pins the whole response with `toStrictEqual` against a hardcoded five-key literal. It goes red the moment either new key is added, regardless of anything else in this plan, and no earlier draft's Files list named it. Add `c2Username: null` (that test calls `freshLink()` with no username override) and `logbookBaseUrl: LOGBOOK_BASE_URL`. Being pinned strictly is the point of that test; loosening it to `toMatchObject` would give up the leak check it exists for.

- [ ] **Step 6c: Convert the migration-boundary block's two inserts to raw SQL.** `app/server/db/schema.integration.test.ts` has a describe block that deliberately caps a real database at migration 0021 to prove an older deployment still works. Drizzle's typed `.insert(concept2Links).values(...)` builder emits EVERY declared column in its generated SQL, including ones the call never names — so the moment `c2_username` joins the schema, those two inserts reference a column that database genuinely does not have, and the block goes red without anything about it changing.

  **This is not a new technique; the file already carries it.** That block's own existing comment says "raw SQL because the typed builder already declares `surface`, which this table does not have yet". Apply the same treatment to the two `concept2Links` inserts, with a comment naming `c2_username` the way that one names `surface`. Do NOT relax the migration cap to make it pass — the cap is what the block tests.

  **The conversion forces a matching change to the block's OWN assertion, which is easy to miss.** Today the second insert's unique-violation is asserted through the typed builder, so the real Postgres text lives on `.cause` and the assertion reads `.rejects.toMatchObject({ cause: { message: expect.stringMatching(/concept2_links_c2_user_id_unique/) } })` — the file's own comment explains why. Once BOTH inserts are raw `pool.query()`, pg's error IS the top-level `.message`, and the assertion becomes `.rejects.toThrow(/concept2_links_c2_user_id_unique/)` — matching the `surface` precedent a few lines above, which is the technique this step already cites but whose assertion-shape consequence it did not.

- [ ] **Step 6d: The store's own round-trip, with its OWN c2UserIds.** Append to `app/server/stores/concept2.integration.test.ts`'s `upsertLink / getLink / deleteLink` describe. Widen its local `link()` builder's override type with `c2Username: string | null`, then:

```ts
    it("round-trips c2Username, and stores null when the caller gives none", async () => {
      // Wave E PR2. Two users, two c2UserIds, because D1's UNIQUE on
      // `c2_user_id` is GLOBAL and every test in this describe block shares
      // one Postgres schema — `link()`'s own default (555) is already held
      // by `userA` from the first test in the file, so reusing it here
      // would 409 rather than assert anything.
      const store = createConcept2Store(db);
      const named = await createUserStore(db).createUser({
        googleSub: "c2-store-user-named",
        email: "named@c2-store.test",
        name: "N",
      });
      const anon = await createUserStore(db).createUser({
        googleSub: "c2-store-user-anon",
        email: "anon@c2-store.test",
        name: "A",
      });
      await store.upsertLink(
        named.id,
        link({ c2UserId: 608, c2Username: "jamesawesome" }),
      );
      // No `c2Username` key at all: the input field is OPTIONAL and the
      // COLUMN is required-and-nullable, which is the asymmetry the store's
      // own comment records.
      await store.upsertLink(anon.id, link({ c2UserId: 609 }));
      expect((await store.getLink(named.id))?.c2Username).toBe("jamesawesome");
      expect((await store.getLink(anon.id))?.c2Username).toBeNull();
    });
```

  The file's own header states the "every test that lands a link uses its own c2UserId" rule, and its `link()` default makes it trivial to violate by accident — a first draft of exactly this test did, and 409'd instead of asserting.

- [ ] **Step 7: Run the server gates.**

```bash
cd /Users/james/projects/github/jamesawesome/Ergomatic-wt-c2pr2/app
pnpm lint
pnpm typecheck
pnpm format:check
NODE_OPTIONS=--no-experimental-webstorage pnpm exec vitest run --project unit
NODE_OPTIONS=--no-experimental-webstorage pnpm exec vitest run --project integration
```

- [ ] **Step 8: Commit, then probe.**

  | # | Mutation | Must fail |
  | --- | --- | --- |
  | M10 | `GET /link` omits `c2Username` from the response object | "GET /link names the linked Concept2 username and the logbook origin" |
  | M11 | `GET /link` returns `logbookBaseUrl: "https://log.concept2.com"` hardcoded | same test |
  | M12 | the web callback's `upsertLink` drops `c2Username: me.username \|\| null` | the round-trip assertion in step 2. **The paste-test found no plan test covering this write** and had to add one — so the assertion must exist before this probe is meaningful: a `GET /link` after a real callback exchange, asserting the stored username came back |
  | M12b | the web callback's `upsertLink` uses `me.username ?? null` | needs a fixture where `fetchMe` returns `username: ""` — assert the stored value is `null`, not `""` |
  | M12c | `routes/concept2.ts`'s Linked-page fallback returns `` `#${String(me.c2UserId)}` `` (the pre-PR2 spelling) | "names the numeric account the SAME way the card does" |
  | M13 | the flag-off branch returns `{available:false, logbookBaseUrl}` | "GET /link leaks neither field while the flag is off" |
  **Re-measured 2026-09-03 against the blocks exactly as written above** (`mapping.test.ts` baseline `Tests 40 passed (40)`). The counts an earlier revision carried were measured against a 39-test file and against fixtures this fold changed; do not carry those forward. **Two of these did NOT bite as first written, and the fixtures above are the fix** — recorded here rather than quietly corrected, because a probe that stops biting when its fixture changes is RF21 arriving by drift:

  | # | Mutation | Must fail |
  | --- | --- | --- |
  | M9d | `deriveWeightClass`: flip `<=` to `<` on the men's threshold | RUN: `Tests 1 failed | 39 passed` — "classifies every case in the table". The boundary is the only place the two operators disagree, which is why the table pins 7500 and 6150 exactly rather than only 7490/7510 |
  | M9e | `deriveWeightClass`: swap the two thresholds (men 6150, women 7500) | RUN: `2 failed | 38 passed` — the table AND the case-fold test. A swap a men-only fixture would never notice, which is why the table carries both genders |
  | M9f | `deriveWeightClass`: drop the `weight <= 0` clause, guarding on `weight === null` alone | RUN: `1 failed | 39 passed` — "tells 'present but unreadable' apart from 'not set' …", on its `weight: 0` case. Without it a zeroed profile classifies as the lightest possible rower and a wrong class lands on a permanent Concept2 record |
  | M9f2 | `deriveWeightClass`: delete the plausibility band | RUN: `2 failed | 38 passed` — "REFUSES four of the five wrong-unit readings" and the refusal table's implausible case. Without the band an integer-kg reading classes every rower LIGHTWEIGHT, filing heavyweights in Concept2's lightweight rankings |
  | M9f3 | `pickDeclaredWeightClass`: iterate the page in reverse | RUN: `1 failed | 39 passed` — "takes the NEWEST readable class, skipping our own row above it". **This probe went GREEN against the fixture as first drafted** (its two rows were "our H" then "their L", so reversing them still returned L). It bites only because that test now carries two SURVIVING rows that disagree |
  | M9f4 | `pickDeclaredWeightClass`: accept any class string that is not null or empty | RUN: `1 failed | 39 passed` — "skips rows whose class is not exactly H or L …". **Also GREEN as first drafted**, whose only holes were `null` and `""` — precisely the two the mutant still skips. It bites because the fixture now carries `"l"` and `"Heavyweight"` |
  | M9f5 | `pickDeclaredWeightClass`: delete the `ourResultIds` skip | RUN: `Tests 10 failed | 139 passed` across `mapping.test.ts` + `routes/concept2.test.ts` — "never reads OUR OWN writes back as the rower's declaration", "takes the NEWEST readable class, skipping our own row above it", and the route-level RF24 seam. **This is observation 29's probe and the one that matters most**: without it a class we derived is laundered into the rower's declaration on their next send, and the provenance line goes quiet |
  | M9f6 | `pickDeclaredWeightClass`: accept every `type` | RUN: `1 failed | 39 passed` — "reads a class only off a type Concept2 REQUIRES one on". A `skierg` row's class is unmeasured noise; the vendor's own example carries one |
  | M9f7 | `pickDeclaredWeightClass`: widen `FUTURE_ROW_SKEW_MS` 100000x | RUN: `1 failed | 39 passed` — "skips a row dated in the FUTURE …". One hand-entered 2030 row would otherwise pin this rower's declaration forever, with nothing in the app able to say why |
  | M9f8 | `deriveWeightClass`: compare `gender` raw, no trim/upper | RUN: `1 failed | 39 passed` — "case-folds gender …". If the live value is `"m"`, every rower gets `no_gender` and its copy is reasonable enough to hide it |
  | M9g | the upload route: ignore the declaration and always derive from the profile | RUN: red on "sends the class the ROWER declared on their own most recent Concept2 row" (plus 7 more, because `makeStubClient`'s `fetchMe` throws when unstubbed — the file's own convention). **The named test's fixture makes it bite on its own merits**: the declaration is `"L"` and the profile is absent, so the mutant cannot accidentally agree |
  | M9g3 | the route: a `c2_error` on the declaration read falls through to the profile (the behaviour an earlier revision prescribed a test FOR) | RUN: `Tests 8 failed | 101 passed` — "reports a FAILED declaration read as retryable, never as our own guess" |
  | M9g4 | `logWeightClass` deleted, or its `source` field dropped | no test asserts on stdout, and that is stated rather than papered over: the log line is an OPERATOR instrument, not a product behaviour, and its evidence is the placement's own captured output (`{"event":"c2_weight_class","logId":"…","source":"declaration","ourRowsSkipped":0}`, printed by the route tests). A gate on console output would pin a diagnostic's wording; what must not regress is the RESOLUTION, and M9f5/M9g/M9g3 gate that |
  | M9g2 | the upload route: the 401 retry re-reads only the profile, not the declaration | RUN: `2 failed | 112 passed` — "re-reads the DECLARATION on the refreshed token, not just the profile". Without it, a rower whose token merely expired is silently demoted from their own declaration to our guess |
  | M9h | the upload route: a `no_class` failure falls through to the POST instead of returning 422 | RUN: `1 failed | 113 passed` — on `expect(client.postResult).not.toHaveBeenCalled()`. The status assertion alone would not bite a mutant that POSTs first and answers 422 afterwards |
  | M9i | `fetchMe`: return `{ ok: false, kind: "c2_error", status: 401 }` for a 401 (the pre-PR2 collapse) | "flags needs_reauth when the class reads 401 twice" — the route answers 502 and `needsReauthAt` stays null. This is observation 25's probe and the reason the discriminator exists |
  | M9i2 | `readProfileWeight`: drop the numeric-string arm | RUN: `1 failed | 33 passed` — "reads a finite numeric STRING as a weight …". A rower who HAS a weight would otherwise be told forever to go and set one |
  | M9i3 | drop the `signal` from any one of the four `fetchImpl` calls | RUN: `1 failed | 33 passed` — "passes an abort signal to every one of the four calls". **What this proves and what it does not:** that a signal is attached, and (with its sibling test) that an abort classifies as retryable. It does NOT prove the 10 s value — M9i4 does |
  | M9i4 | `C2_TIMEOUT_MS = 1` | RUN: `Tests 6 failed | 22 passed` — "bounds every wire call at ten seconds, pinned with a literal rather than the constant it gates" (the other 5 are the named `fetchMe` ripple). The value is pinned by an INDEPENDENT literal via `vi.spyOn(AbortSignal, "timeout")`; deriving the expectation from `C2_TIMEOUT_MS` would retune the test with the constant (RF21's first smell) |
  | M9j | the 200 response drops `weightClass`/`weightClassSource` | the SIX `toStrictEqual({ resultId })` body assertions in the upload describe. Ruling R2's whole point is that a derived class is VISIBLE at the moment it is written |
  | M9k | the postResult retry path re-runs `resolveWeightClass` instead of reusing `resolved` | no existing test bites, and that is the finding (ruling R13's own invariant): add one that stubs `fetchResults` to answer `["L"]` then `["H"]` across two calls and asserts BOTH `postResult` bodies carry `weight_class: "L"`. Recorded as a probe that must be MADE to bite rather than one that already does |
  | M13b | write `logbookBaseUrl,` as ES2015 shorthand in the response literal | "the probe's LinkStatus interface names exactly the keys GET /api/concept2/link emits" — the key vanishes from `linkResponseKeys()`'s output while the pinned list and `LinkStatus` still carry it. **This probe is the whole reason the explicit form is prescribed**, and it only bites once step 6b(1) and (2) are both done: written shorthand FROM THE START, with neither file updated, all three stay silently consistent and the key ships unpinned |

---

## Task 4: The Concept2 card, and its CSS

**Files:**
- Create: `app/src/you/Concept2Card.tsx`
- Modify: `app/src/index.css` (append the `.c2-card*` block)
- Test: `app/src/you/Concept2Card.test.tsx`

**Interfaces:**
- Consumes: `useConcept2Link` (Task 1), `describeFailure`/`identityLine` (Task 1), `startLink`'s widened `LinkOutcome` (Task 2). **`OptionGroup` is NOT consumed** — ruling (i) removed the only control this card would have used it for, and this task imports nothing from `src/onboarding/`.
- Produces: `default Concept2Card({ email }: { email: string })`, `UNLINK_DISARM_MS`.

**Three things in this task's component are NOT in the board or in an earlier draft, and each is a state a rower can actually reach.** They are called out here rather than left to be discovered in the diff:

1. **The card clears its own attempt state on `pageshow` (invariant I5b).** Task 1's hook re-reads the LINK on a bfcache restore, which fixes the case where the link SUCCEEDED. It does nothing for the case where the rower DECLINED: the panel they are stuck behind is drawn from `outcome`/`busy`, and a restore preserves the JS heap, so a declined web attempt comes back showing a buttonless OPENING CONCEPT2 panel with no Try again, forever. That is the exact state observation 19 exists to prevent, and re-reading the link alone leaves it standing. `pageshow` ONLY, never `visibilitychange` — the component's own comment carries the reason, and the lifetime table's Web-API list states it too.
2. **RECONNECT is disabled on `busy` alone, and there is nothing else it can be disabled on (ruling i).** An earlier revision wired it to a stored weight class and drew a state (1k) for the case where that class could not be read back — a button that could never be pressed, and a re-ask to rescue it. Both are retired with the ask. The needs-reauth card now offers one live RECONNECT that calls `startLink()` with no argument, exactly like Connect on the unlinked card.
3. **`unlink()` disarms in its `finally`, on EVERY exit.** Invariant I2 names "a second tap" as its first disarmer and the second tap has already happened; disarming only on success leaves a live `Tap again to unlink` sitting under a REASON line, where one stray tap re-fires a DELETE the rower never decided to repeat. Measured: with the disarm on the success path only, TWO of this task's own prescribed tests fail — both look for `Unlink Concept2` after a refused DELETE and find `Tap again to unlink` instead.

**RF8 does not apply to this task any more, and saying so is the point.** An earlier revision reused `OptionGroup` for a weight-class radiogroup — the right call for a control this card was going to have. Ruling (i) deleted the control, so this card hand-rolls no ARIA pattern and reuses none: it renders buttons and text. If a later change puts a radiogroup back on this surface, RF8 applies again and `OptionGroup` is the answer.

**RF23 enumeration (the board's §"RF23 note" asks for it on the log row; it applies here too).** What already sits on You and could offer or write the same thing: `BaselineEditor` (writes baselines), `RetestShortcut` (navigates to a test), `ResetBaselineSetup` (destroys baselines), the DIAGNOSTICS row (navigates), `Concept2LinkProbe` (dev-only; DOES offer a real link). **The probe is the one overlap and it is deliberate and dev-only** — it never ships in a release build (`dist-grep.sh:127`'s eighth needle), so no rower ever sees two Connect buttons. Nothing on You offers an unlink or a Concept2 link in a production build. No existing offer is displaced. **And ruling (i) removes the one RF23 hazard this card carried:** a weight-class control on You would have been a second place the rower's body weight is stated, disagreeing with the one on Concept2 — RF23's exact shape, two mechanisms proposing one value, with the better-informed one (Concept2's own profile) losing silently. There is now exactly one place it is set, and it is not ours.

- [ ] **Step 1: Write the failing tests.** `app/src/you/Concept2Card.test.tsx` — the file's mocking follows `src/monitor/Concept2LinkProbe.test.tsx:14-59` exactly (`vi.doMock` + `vi.resetModules()` + dynamic import, with `afterEach` unmocking `../api`, `../adapters/linkFlow`, `../platform`):

```tsx
import { describe, it, expect, vi, afterEach } from "vitest";
import {
  render,
  screen,
  act,
  waitFor,
  fireEvent,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { LinkOutcome } from "../adapters/linkFlow";

afterEach(() => {
  vi.resetModules();
  vi.restoreAllMocks();
  vi.useRealTimers();
  vi.doUnmock("../api");
  vi.doUnmock("../adapters/linkFlow");
});

function mount(status: unknown, startLink = vi.fn()) {
  const api = vi.fn(
    async (_path: string, _init?: RequestInit) =>
      new Response(JSON.stringify(status), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
  );
  vi.doMock("../api", () => ({ api }));
  vi.doMock("../adapters/linkFlow", () => ({ startLink }));
  return { api, startLink };
}

async function renderCard() {
  vi.resetModules();
  const { default: Concept2Card } = await import("./Concept2Card");
  render(<Concept2Card email="james@jamestheaweso.me" />);
}

const LINKED = {
  available: true,
  linked: true,
  c2UserId: 2211,
  c2Username: "jamesawesome",
  needsReauth: false,
  logbookBaseUrl: "https://log-dev.concept2.com",
};

describe("Concept2Card availability (spec §Architecture 8: a capability gate, not a cosmetic hide)", () => {
  it("renders NOTHING when the server says the surface is unavailable", async () => {
    const { api } = mount({ available: false });
    await renderCard();
    // Await a POSITIVE observable owned by the async work before asserting
    // an absence. There is no DOM signal here by construction (the whole
    // point is that nothing renders), so the observable is the mount
    // effect's own request. M14 is what proves this can go red: with the
    // `!link.available` clause dropped the card renders and this fails.
    // The earlier draft awaited a `c2-probe-settled` testid that no
    // prescribed component ever renders, and the paste-test measured M14
    // NOT BITING against it.
    await waitFor(() => expect(api).toHaveBeenCalledWith("/api/concept2/link"));
    expect(screen.queryByText("CONCEPT2")).toBeNull();
  });
});

describe("Concept2Card read failed (Gate 0 amendment 1i)", () => {
  it("says the read failed and offers a Retry, rather than going silent like an unavailable server", async () => {
    // 1h and 1i are different answers and must not share one rendering.
    // `{available:false}` means "this deployment has no Concept2" and
    // renders nothing. A failed read means "we could not find out", which
    // is a fault, is retryable, and would be a lie if drawn as absence.
    const api = vi.fn(
      async () => new Response("<html>502</html>", { status: 502 }),
    );
    vi.doMock("../api", () => ({ api }));
    vi.doMock("../adapters/linkFlow", () => ({ startLink: vi.fn() }));
    await renderCard();
    expect(
      await screen.findByText("Couldn't reach Concept2 linking."),
    ).toBeTruthy();
    expect(screen.getByText("REASON: THE SERVER ANSWERED 502")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Retry" })).toBeTruthy();
    // Never the unlinked card: no Connect, no weight-class ask.
    expect(
      screen.queryByRole("button", { name: "CONNECT TO CONCEPT2" }),
    ).toBeNull();
  });

  it("names NO CONNECTION when the request never completed", async () => {
    const api = vi.fn(async () => Promise.reject(new Error("offline")));
    vi.doMock("../api", () => ({ api }));
    vi.doMock("../adapters/linkFlow", () => ({ startLink: vi.fn() }));
    await renderCard();
    expect(await screen.findByText("REASON: NO CONNECTION")).toBeTruthy();
  });

  it("Retry re-reads, and a card that comes back renders the real state", async () => {
    let ok = false;
    const api = vi.fn(async () =>
      ok
        ? new Response(JSON.stringify({ available: true, linked: false }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          })
        : new Response("nope", { status: 500 }),
    );
    vi.doMock("../api", () => ({ api }));
    vi.doMock("../adapters/linkFlow", () => ({ startLink: vi.fn() }));
    await renderCard();
    await screen.findByRole("button", { name: "Retry" });
    ok = true;
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(
      await screen.findByRole("button", { name: "CONNECT TO CONCEPT2" }),
    ).toBeTruthy();
    expect(screen.queryByText("Couldn't reach Concept2 linking.")).toBeNull();
  });
});

describe("Concept2Card unlinked (board 1a, Gate 0 amendment change 1)", () => {
  it("asks the rower NOTHING and offers a live Connect from the first paint (ruling i)", async () => {
    // James, 2026-09-03: "I don't want that set in our app. I want it to
    // be set on Concept2's side." An earlier revision dimmed Connect until
    // a weight class was picked; there is no question to answer now, so a
    // dimmed Connect would be a control waiting on nothing.
    mount({ available: true, linked: false });
    await renderCard();
    const connect = await screen.findByRole("button", {
      name: "CONNECT TO CONCEPT2",
    });
    expect(connect).not.toBeDisabled();
    // No radiogroup, and no input of any kind: this card collects nothing.
    // Asserted as an ABSENCE only after the positive observable above
    // resolved, so it cannot pass by arriving early.
    expect(screen.queryByRole("radiogroup")).toBeNull();
    expect(screen.queryByRole("radio")).toBeNull();
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("calls startLink with NO arguments, so nothing about the rower can travel with it", async () => {
    // Exit criterion 3 as amended: the link flow's request bodies carry NO
    // new user attribute. `toHaveBeenCalledWith()` with an empty argument
    // list is the assertion — `toHaveBeenCalled()` alone would stay green
    // against a card that started passing something again.
    const startLink = vi.fn(async (): Promise<LinkOutcome> => ({
      kind: "navigating",
    }));
    mount({ available: true, linked: false }, startLink);
    await renderCard();
    await userEvent.click(
      await screen.findByRole("button", { name: "CONNECT TO CONCEPT2" }),
    );
    expect(startLink).toHaveBeenCalledWith();
  });
});

describe("Concept2Card linked (Gate 0 amendment 1c)", () => {
  it("names both principals, and no weight class exists to show", async () => {
    mount(LINKED);
    await renderCard();
    expect(
      await screen.findByText(
        "Concept2 jamesawesome · Ergomatic james@jamestheaweso.me",
      ),
    ).toBeTruthy();
    expect(screen.getByText("LINKED ✓")).toBeTruthy();
    // The board's approved amendment said "Weight class does not show on
    // linked cards"; ruling (i) makes that true of every card, because
    // there is no class anywhere in the client to show. Kept as an
    // assertion rather than deleted: it is the cheapest gate on a future
    // change putting one back.
    expect(screen.queryByText(/Heavyweight|Lightweight/)).toBeNull();
  });
});

describe("Concept2Card unlink (board 1d: two taps, 4 s auto-disarm)", () => {
  it("does not delete on the first tap", async () => {
    const { api } = mount(LINKED);
    await renderCard();
    await userEvent.click(
      await screen.findByRole("button", { name: "Unlink Concept2" }),
    );
    expect(
      screen.getByRole("button", { name: "Tap again to unlink" }),
    ).toBeTruthy();
    expect(
      api.mock.calls.filter((c) => c[1]?.method === "DELETE"),
    ).toHaveLength(0);
  });

  it("deletes on the second tap", async () => {
    const { api } = mount(LINKED);
    await renderCard();
    await userEvent.click(
      await screen.findByRole("button", { name: "Unlink Concept2" }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Tap again to unlink" }),
    );
    const deletes = api.mock.calls.filter((c) => c[1]?.method === "DELETE");
    expect(deletes).toHaveLength(1);
    expect(deletes[0]?.[0]).toBe("/api/concept2/link");
  });

  it("disarms on its own after 4 s, so a forgotten arm cannot be completed by a later stray tap", async () => {
    // `fireEvent.click`, NOT `userEvent`, for this one interaction. Root
    // caused by the paste-test down to a minimal two-test repro: an
    // earlier test in the file using the module-level `userEvent.click`
    // API leaves state that makes a LATER
    // `userEvent.setup({ advanceTimers })` click misbehave — the label
    // reverts as if the 4 s timer had already fired, immediately after the
    // click. Converting every click in the file to `.setup()` instances
    // did not fix it, and neither did installing fake timers only after
    // the render settled. `fireEvent.click` has no internal pointer or
    // timer machinery and was stable across three repeated runs.
    mount(LINKED);
    await renderCard();
    const unlink = await screen.findByRole("button", {
      name: "Unlink Concept2",
    });
    vi.useFakeTimers();
    fireEvent.click(unlink);
    expect(
      screen.getByRole("button", { name: "Tap again to unlink" }),
    ).toBeTruthy();
    // INDEPENDENT literals, never the production constant (RF21's own
    // "a test that imports the constant it exists to gate proves nothing").
    act(() => {
      vi.advanceTimersByTime(3999);
    });
    expect(
      screen.getByRole("button", { name: "Tap again to unlink" }),
    ).toBeTruthy();
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(
      screen.getByRole("button", { name: "Unlink Concept2" }),
    ).toBeTruthy();
  });

  it("says the link is unchanged when the DELETE is refused, instead of appearing to do nothing", async () => {
    // Gate 0 amendment 1j. Without the `else`, a refused DELETE takes the
    // `finally` and nothing else: the arm clears, the card re-renders
    // LINKED, and the rower's second tap looks like it silently failed —
    // or worse, like it worked and the card is wrong.
    const api = vi.fn(async (_path: string, init?: RequestInit) =>
      init?.method === "DELETE"
        ? new Response("nope", { status: 500 })
        : new Response(JSON.stringify(LINKED), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
    );
    vi.doMock("../api", () => ({ api }));
    vi.doMock("../adapters/linkFlow", () => ({ startLink: vi.fn() }));
    await renderCard();
    await userEvent.click(
      await screen.findByRole("button", { name: "Unlink Concept2" }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Tap again to unlink" }),
    );
    expect(
      await screen.findByText("Couldn't unlink. Your link is unchanged."),
    ).toBeTruthy();
    expect(screen.getByText("REASON: THE SERVER ANSWERED 500")).toBeTruthy();
    // The link is genuinely still there, and the card still says so.
    expect(screen.getByText("LINKED ✓")).toBeTruthy();
  });

  it("clears the unlink failure when a later unlink succeeds", async () => {
    let deleteOk = false;
    let linked = true;
    const api = vi.fn(async (_path: string, init?: RequestInit) => {
      if (init?.method === "DELETE") {
        if (deleteOk) linked = false;
        return new Response(null, { status: deleteOk ? 204 : 500 });
      }
      return new Response(
        JSON.stringify(linked ? LINKED : { available: true, linked: false }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });
    vi.doMock("../api", () => ({ api }));
    vi.doMock("../adapters/linkFlow", () => ({ startLink: vi.fn() }));
    await renderCard();
    await userEvent.click(
      await screen.findByRole("button", { name: "Unlink Concept2" }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Tap again to unlink" }),
    );
    await screen.findByText("Couldn't unlink. Your link is unchanged.");
    deleteOk = true;
    await userEvent.click(
      screen.getByRole("button", { name: "Unlink Concept2" }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Tap again to unlink" }),
    );
    expect(
      await screen.findByRole("button", { name: "CONNECT TO CONCEPT2" }),
    ).toBeTruthy();
    expect(
      screen.queryByText("Couldn't unlink. Your link is unchanged."),
    ).toBeNull();
  });

  it("a relink offers Connect again and asks nothing, exactly as the first link did (invariant I4)", async () => {
    // Ruling (i) retired this test's original subject — there is no draft
    // class to reset on unlink, because there is no draft. What survives
    // is the property worth keeping: after an unlink the card returns to
    // the unlinked state cleanly, with a live Connect and no residue of
    // the account just removed. Drives the real sequence rather than
    // mounting the end state, so the return is observed rather than
    // assumed.
    let linked = false;
    const api = vi.fn(async (_path: string, init?: RequestInit) => {
      if (init?.method === "DELETE") {
        linked = false;
        return new Response(null, { status: 204 });
      }
      return new Response(
        JSON.stringify(linked ? LINKED : { available: true, linked: false }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });
    const startLink = vi.fn(async (): Promise<LinkOutcome> => {
      linked = true;
      return { kind: "linked", c2UserId: 2211, stateEchoed: true };
    });
    vi.doMock("../api", () => ({ api }));
    vi.doMock("../adapters/linkFlow", () => ({ startLink }));
    await renderCard();
    await userEvent.click(
      await screen.findByRole("button", { name: "CONNECT TO CONCEPT2" }),
    );
    await screen.findByText("LINKED ✓");
    await userEvent.click(
      screen.getByRole("button", { name: "Unlink Concept2" }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Tap again to unlink" }),
    );
    const connect = await screen.findByRole("button", {
      name: "CONNECT TO CONCEPT2",
    });
    expect(connect).not.toBeDisabled();
    expect(screen.queryByRole("radiogroup")).toBeNull();
    // No residue of the account just removed: the identity line is gone.
    expect(screen.queryByText(/jamesawesome/)).toBeNull();
  });
});

describe("Concept2Card outcomes (Gate 0 amendment 1e/1f/1g)", () => {
  it("renders the failure line and its REASON", async () => {
    const startLink = vi.fn(async (): Promise<LinkOutcome> => ({
      kind: "exchangeFailed",
      status: 502,
      error: "c2_error",
      stateEchoed: true,
    }));
    mount({ available: true, linked: false }, startLink);
    await renderCard();
    await userEvent.click(
      await screen.findByRole("button", { name: "CONNECT TO CONCEPT2" }),
    );
    expect(
      await screen.findByText("REASON: CONCEPT2 REFUSED THE EXCHANGE · 502"),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy();
  });

  it("renders the update-required panel with no retry, because retrying this build cannot work", async () => {
    const startLink = vi.fn(async (): Promise<LinkOutcome> => ({
      kind: "updateRequired",
    }));
    mount({ available: true, linked: false }, startLink);
    await renderCard();
    await userEvent.click(
      await screen.findByRole("button", { name: "CONNECT TO CONCEPT2" }),
    );
    expect(
      await screen.findByText(
        "Update Ergomatic to link your Concept2 account.",
      ),
    ).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
  });

  it("re-reads the server after every attempt instead of trusting the outcome (invariant I1)", async () => {
    const startLink = vi.fn(async (): Promise<LinkOutcome> => ({
      kind: "linked",
      c2UserId: 2211,
      stateEchoed: true,
    }));
    // The server disagrees: it still says unlinked. The card must believe
    // the server, which is exactly what Concept2LinkProbe.tsx:173-176
    // says this surface exists to surface.
    const { api } = mount({ available: true, linked: false }, startLink);
    await renderCard();
    await userEvent.click(
      await screen.findByRole("button", { name: "CONNECT TO CONCEPT2" }),
    );
    // `waitFor`, not a bare assertion: `connect()` awaits `startLink` and
    // THEN `reload()`, and `userEvent`'s act wrapper does not guarantee both
    // microtask hops have flushed by the time the click resolves. A bare
    // count here makes M19 (delete the `await reload()`) bite intermittently
    // instead of reliably, which is a probe that proves nothing.
    await waitFor(() =>
      expect(
        api.mock.calls.filter((c) => c[0] === "/api/concept2/link"),
      ).toHaveLength(2),
    );
    expect(screen.queryByText(/Concept2 jamesawesome/)).toBeNull();
  });

  it("reconnects with a live button and no question, the same way Connect does (ruling i)", async () => {
    // An earlier revision had RECONNECT read a STORED class and disabled
    // itself when that class could not be read back — a button nothing
    // could press, plus a state (1k) drawn to rescue it. Neither exists:
    // there is no stored class, so `busy` is the only thing that can
    // disable this button.
    const startLink = vi.fn(async (): Promise<LinkOutcome> => ({
      kind: "navigating",
    }));
    mount({ ...LINKED, needsReauth: true }, startLink);
    await renderCard();
    const reconnect = await screen.findByRole("button", {
      name: "RECONNECT CONCEPT2",
    });
    expect(reconnect).not.toBeDisabled();
    await userEvent.click(reconnect);
    expect(startLink).toHaveBeenCalledWith();
    expect(screen.queryByRole("radiogroup")).toBeNull();
  });
});

describe("Concept2Card comes back from Concept2 (observation 19, invariant I5)", () => {
  it("a restore mid-attempt leaves a reachable card, not a frozen OPENING panel", async () => {
    // The web arm resolves `navigating` and unloads the document. A
    // back-forward-cache restore runs NO mount, and it preserves the JS
    // heap — so `outcome` is still `{kind:"navigating"}` and the card is
    // still drawing a buttonless OPENING CONCEPT2 panel over a link that
    // did NOT succeed (the rower declined, or the exchange failed). Re-
    // reading the link alone does not fix that: the panel is drawn from
    // `outcome`, not from `link`.
    const startLink = vi.fn(async (): Promise<LinkOutcome> => ({
      kind: "navigating",
    }));
    mount({ available: true, linked: false }, startLink);
    await renderCard();
    await userEvent.click(
      await screen.findByRole("button", { name: "CONNECT TO CONCEPT2" }),
    );
    expect(await screen.findByText("OPENING CONCEPT2")).toBeTruthy();

    await act(async () => {
      window.dispatchEvent(new Event("pageshow"));
    });
    expect(
      await screen.findByRole("button", { name: "CONNECT TO CONCEPT2" }),
    ).toBeTruthy();
    expect(screen.queryByText("OPENING CONCEPT2")).toBeNull();
  });
});

describe("Concept2Card unlink failure does not latch (Gate 0 amendment 1j)", () => {
  it("clears the previous REASON the moment a new unlink starts", async () => {
    // Without the clear at the top of `unlink()`, the panel from the FIRST
    // refusal sits over the second attempt while it is still in flight —
    // a stale status line describing a request that is not the one running.
    let attempt = 0;
    const api = vi.fn(async (_path: string, init?: RequestInit) => {
      if (init?.method === "DELETE") {
        attempt += 1;
        if (attempt === 1) return new Response("nope", { status: 500 });
        return new Promise<Response>(() => {
          // never resolves: the second unlink stays in flight
        });
      }
      return new Response(JSON.stringify(LINKED), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });
    vi.doMock("../api", () => ({ api }));
    vi.doMock("../adapters/linkFlow", () => ({ startLink: vi.fn() }));
    await renderCard();
    await userEvent.click(
      await screen.findByRole("button", { name: "Unlink Concept2" }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Tap again to unlink" }),
    );
    await screen.findByText("REASON: THE SERVER ANSWERED 500");

    await userEvent.click(
      screen.getByRole("button", { name: "Unlink Concept2" }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Tap again to unlink" }),
    );
    await waitFor(() =>
      expect(screen.queryByText("REASON: THE SERVER ANSWERED 500")).toBeNull(),
    );
    expect(
      screen.queryByText("Couldn't unlink. Your link is unchanged."),
    ).toBeNull();
  });
});
```

  **On awaiting before asserting an absence.** No test above uses a `c2-probe-settled` testid; no prescribed component renders one, and the paste-test measured M14 not biting against a `findByTestId` that could never resolve — a wait that never happens is not a wait. Where the assertion is "nothing rendered", the positive observable is the mount effect's own request (`await waitFor(() => expect(api).toHaveBeenCalledWith("/api/concept2/link"))`). Where anything at all renders, use `findByText`/`findByRole` on the real element, which is stronger. **Every absence assertion in this file must be paired with a mutation that makes the thing appear** — that is what proves the wait is real, and it is why M14 and M15 are listed.

- [ ] **Step 2: Run and confirm failure** (module not found).

- [ ] **Step 3: Create `app/src/you/Concept2Card.tsx`.**

```tsx
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../api";
import { startLink, type LinkOutcome } from "../adapters/linkFlow";
import { useConcept2Link, type LinkReadFailure } from "../api/useConcept2Link";
import { describeFailure, identityLine } from "./concept2CardModel";

/**
 * Wave E PR2, Surface 1 (board `docs/design/handoffs/2026-08-31-concept2-
 * connect/README.md` states 1a-1e, amended 2026-09-03 by
 * `amendment-2026-09-03.html` states 1f-1j). The rower's only door to the
 * Concept2 link: connect, see which account is linked, unlink.
 *
 * IT ASKS NOTHING. James, 2026-09-03: "I don't want that set in our app. I
 * want it to be set on Concept2's side." The weight class Concept2 needs on
 * every result is read from Concept2 on the send that uses it — the rower's
 * own most recent declaration first, our derivation from their profile as a
 * fallback (`server/concept2/mapping.ts`) — so this card holds no rower
 * attribute, renders no input, and sends no body of its own.
 *
 * NO PLATFORM CONDITIONAL LIVES HERE. `adapters/linkFlow.ts` owns the one
 * `isNative()` branch this feature has (that module's own header), and
 * this card reads only its `LinkOutcome`. On native the whole flow
 * resolves inside `startLink`'s promise; on web `startLink` resolves
 * `navigating` and the document unloads, so the outcome is learned from
 * the mount read on the rower's next visit. That asymmetry is why the
 * board's 1b Cancel button and its "CONFIRMING THE LINK" variant are gone
 * (amendment change 3): neither has a reachable presser on either surface.
 *
 * NOT the dev probe (`monitor/Concept2LinkProbe.tsx`), which stays exactly
 * as it is: it prints outcome kinds, plugin error codes and the
 * state-echo measurement a walk needs and a rower must never see, and its
 * `data-c2-link-probe` literal is `scripts/dist-grep.sh`'s eighth needle
 * proving it is absent from a release build.
 */
export const UNLINK_DISARM_MS = 4000;

/** One spelling of "what went wrong on the wire", for both the read and
 *  the unlink. `null` status means the request never completed at all. */
function reasonFor(failure: LinkReadFailure): string {
  return failure.status === null
    ? "NO CONNECTION"
    : `THE SERVER ANSWERED ${String(failure.status)}`;
}

export default function Concept2Card({ email }: { email: string }) {
  const { link, failed, reload } = useConcept2Link();
  const [outcome, setOutcome] = useState<LinkOutcome | null>(null);
  const [busy, setBusy] = useState(false);
  const [unlinkFailed, setUnlinkFailed] = useState<LinkReadFailure | null>(
    null,
  );
  const [armed, setArmed] = useState(false);
  const disarmRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const disarm = useCallback(() => {
    if (disarmRef.current !== null) {
      clearTimeout(disarmRef.current);
      disarmRef.current = null;
    }
    setArmed(false);
  }, []);

  // Invariant I2 (plan's lifetime table): the arm can never survive
  // leaving You. Returning `disarm` as the effect's cleanup is what
  // guarantees it, including for the timer.
  useEffect(() => disarm, [disarm]);

  // Invariant I5's OTHER half. `useConcept2Link` re-reads the link on a
  // back-forward-cache restore; on its own that fixes only the case where
  // the link SUCCEEDED, because the panel the rower is stuck behind is
  // drawn from `outcome`/`busy`, not from `link`. A restore preserves the
  // JS heap, so a web attempt that was declined or failed comes back with
  // `outcome` still `{kind:"navigating"}` and `busy` possibly still `true`
  // — a buttonless OPENING CONCEPT2 panel with no Try again, forever.
  // Clearing the attempt state on the same event is what makes the card
  // reachable again.
  //
  // `pageshow` ONLY, deliberately, and NOT `visibilitychange`. `pageshow`
  // is the restore event and it cannot fire while an attempt is genuinely
  // live in this document — a restore means the document was unloaded and
  // came back, which on the web arm is exactly the stuck case, and on the
  // native arm never happens (the consent sheet is a native view over a
  // live WebView; nothing navigates). `visibilitychange` fires whenever
  // the app returns to the foreground, INCLUDING the moment the native
  // sheet dismisses — a tick before or after `startLink`'s promise
  // resolves, unordered — so clearing there would race `setOutcome` and
  // could wipe the failure panel a declined native link just drew.
  useEffect(() => {
    const clearAttempt = () => {
      setOutcome(null);
      setBusy(false);
    };
    window.addEventListener("pageshow", clearAttempt);
    return () => {
      window.removeEventListener("pageshow", clearAttempt);
    };
  }, []);

  function arm() {
    if (disarmRef.current !== null) clearTimeout(disarmRef.current);
    disarmRef.current = setTimeout(() => {
      disarmRef.current = null;
      setArmed(false);
    }, UNLINK_DISARM_MS);
    setArmed(true);
  }

  // Invariant I1: the card never infers its own state from an outcome, it
  // re-reads the server. An outcome saying `linked` while `GET /link`
  // disagrees renders as NOT linked, deliberately.
  // Takes no argument, and there is nothing it could take: `startLink`
  // sends a mint body with nothing of the rower's in it (ruling i). Used
  // unchanged by both Connect and RECONNECT.
  async function connect(): Promise<void> {
    setBusy(true);
    setOutcome(null);
    try {
      const result = await startLink();
      setOutcome(result);
      await reload();
    } finally {
      // In the `finally`, never only the happy path: one thrown request
      // would otherwise wedge the card until the document reloads (the
      // same reasoning as `linkFlow.ts:328-332`'s own guard release).
      setBusy(false);
    }
  }

  async function unlink(): Promise<void> {
    setBusy(true);
    setUnlinkFailed(null);
    try {
      const res = await api("/api/concept2/link", { method: "DELETE" });
      // 204 normally; 404 means another tab already unlinked, which is the
      // outcome we wanted (`FromTheLog.tsx:365-371` takes the identical
      // line for DELETE /api/logs/:id: "an error toast for an operation
      // that succeeded" is the defect being avoided).
      if (res.ok || res.status === 404) {
        setOutcome(null);
        // Invariant I4 needs no clear site here any more: an earlier
        // revision reset a weight-class draft on unlink so a relink would
        // ask again. There is no draft, and nothing about the removed
        // account survives in this component — `link` is re-read below and
        // `outcome` is cleared above.
        await reload();
      } else {
        // RF25's shape, at the UI seam: a lower layer reported a failure
        // and the caller must not proceed as if it succeeded. Without this
        // branch the only visible effect of a refused DELETE is the arm
        // clearing in the `finally`, which reads to the rower as either
        // "nothing happened" or "it worked and the card is wrong". The
        // grant is still live; say so.
        setUnlinkFailed({ status: res.status });
      }
    } catch {
      setUnlinkFailed({ status: null });
    } finally {
      // Invariant I2 names three disarmers and "a second tap" is the first
      // of them — so the arm is spent on EVERY exit, not only the happy
      // one. Disarming only on success leaves a live "Tap again to unlink"
      // sitting under a REASON line, where one stray tap re-fires a DELETE
      // the rower has not decided to repeat.
      disarm();
      setBusy(false);
    }
  }

  // Amendment 1h: nothing renders while the surface is unavailable, or
  // before the first read resolves. A capability gate, not a cosmetic
  // hide, and a card that does not yet know what it is showing shows
  // nothing rather than a wrong state.
  //
  // Amendment 1i, and NOT the same silence: a read that FAILED is a
  // different answer from a deployment that has no Concept2, and drawing
  // them the same way tells a rower whose server does have it that it does
  // not. `failed` wins over a stale `link` on purpose (invariant I1) —
  // including when a background re-read from `pageshow` fails over a card
  // that was fine a moment ago. The cost is one transient panel; the
  // alternative is a link state nobody observed staying on screen, and the
  // panel carries a Retry that fixes it in one tap.
  if (failed !== null) {
    return (
      <section className="c2-card" aria-labelledby="c2-card-label">
        <div className="c2-card-head">
          <h2 className="c2-card-label" id="c2-card-label">
            CONCEPT2
          </h2>
          <span className="c2-card-status">COULDN&apos;T READ</span>
        </div>
        <div className="c2-card-panel">
          <p className="c2-card-panel-label">COULDN&apos;T READ CONCEPT2</p>
          <p className="c2-card-panel-line">
            Couldn&apos;t reach Concept2 linking.
          </p>
          <p className="c2-card-panel-reason">REASON: {reasonFor(failed)}</p>
        </div>
        <button
          type="button"
          className="c2-card-retry"
          onClick={() => void reload()}
        >
          Retry
        </button>
      </section>
    );
  }

  if (link === null || !link.available) return null;

  const failure = outcome === null ? null : describeFailure(outcome);
  const opening =
    busy ||
    (outcome !== null && outcome.kind === "navigating") ||
    (outcome !== null && outcome.kind === "busy" && outcome.source === "guard");
  const updateRequired =
    outcome !== null && outcome.kind === "updateRequired" && !link.linked;

  const status = link.linked
    ? link.needsReauth
      ? "RECONNECT NEEDED"
      : "LINKED ✓"
    : opening
      ? "WAITING"
      : "NOT LINKED";

  return (
    <section className="c2-card" aria-labelledby="c2-card-label">
      <div className="c2-card-head">
        <h2 className="c2-card-label" id="c2-card-label">
          CONCEPT2
        </h2>
        <span
          className={`c2-card-status${link.linked ? " c2-card-status-on" : ""}`}
        >
          {status}
        </span>
      </div>

      {link.linked && (
        <p className="c2-card-identity">{identityLine(link, email)}</p>
      )}

      {link.linked && link.needsReauth && (
        <>
          <div className="c2-card-panel">
            <p className="c2-card-panel-label">
              CONCEPT2 STOPPED ACCEPTING THIS LINK
            </p>
            <p className="c2-card-panel-line">
              Your link is kept. Reconnect to send rows again.
            </p>
          </div>
          {/* `busy` is the ONLY thing that can disable this button
              (ruling i). An earlier revision also gated it on a stored
              weight class and drew a state for the case where that class
              could not be read back — a button nothing could press. There
              is no stored class to be unreadable. */}
          <button
            type="button"
            className="c2-card-primary"
            disabled={busy}
            onClick={() => void connect()}
          >
            RECONNECT CONCEPT2
          </button>
        </>
      )}

      {link.linked && !link.needsReauth && !armed && (
        <p className="c2-card-helper">
          Finished monitor rows can be sent from the log. Send state shows on
          each row.
        </p>
      )}

      {link.linked && armed && (
        <p className="c2-card-explain">
          Unlink removes this app&apos;s access. Rows already sent stay on
          Concept2.
        </p>
      )}

      {/* Amendment 1j. Sits above the Unlink control it belongs to, so the
          rower reads the outcome and then sees the button that produced
          it. Says the link is UNCHANGED explicitly: the dangerous reading
          of a failed destructive action is that it half-worked. */}
      {link.linked && unlinkFailed !== null && (
        <div className="c2-card-panel">
          <p className="c2-card-panel-label">UNLINK DIDN&apos;T HAPPEN</p>
          <p className="c2-card-panel-line">
            Couldn&apos;t unlink. Your link is unchanged.
          </p>
          <p className="c2-card-panel-reason">
            REASON: {reasonFor(unlinkFailed)}
          </p>
        </div>
      )}

      {link.linked && (
        <>
          <hr className="c2-card-hair" />
          <button
            type="button"
            className={`c2-card-danger${armed ? " c2-card-danger-armed" : ""}`}
            disabled={busy}
            onClick={() => {
              if (armed) void unlink();
              else arm();
            }}
          >
            {armed ? "Tap again to unlink" : "Unlink Concept2"}
          </button>
          {armed && (
            <p className="c2-card-foot">DISARMS ON ITS OWN AFTER 4 SECONDS</p>
          )}
        </>
      )}

      {!link.linked && opening && (
        <div className="c2-card-panel">
          <p className="c2-card-panel-label">OPENING CONCEPT2</p>
          <p className="c2-card-panel-line">
            Approve access on Concept2&apos;s page.
          </p>
        </div>
      )}

      {!link.linked && !opening && updateRequired && (
        <div className="c2-card-panel">
          <p className="c2-card-panel-label">UPDATE NEEDED</p>
          <p className="c2-card-panel-line">
            Update Ergomatic to link your Concept2 account.
          </p>
        </div>
      )}

      {!link.linked && !opening && !updateRequired && failure !== null && (
        <>
          <div className="c2-card-panel">
            <p className="c2-card-panel-label">THE LINK DIDN&apos;T FINISH</p>
            <p className="c2-card-panel-line">{failure.line}</p>
            {failure.reason !== null && (
              <p className="c2-card-panel-reason">REASON: {failure.reason}</p>
            )}
          </div>
          <button
            type="button"
            className="c2-card-retry"
            disabled={busy}
            onClick={() => void connect()}
          >
            Try again
          </button>
        </>
      )}

      {!link.linked && !opening && !updateRequired && failure === null && (
        <>
          <p className="c2-card-explain">
            Sends finished monitor rows to your Concept2 logbook. Manual, per
            row, from the log.
          </p>
          <hr className="c2-card-hair" />
          {/* Ruling (i): nothing is asked here. The hairline still marks
              the break between the explanation and the action; what used
              to sit between them was a WEIGHT CLASS section and a
              two-option radiogroup. The copy below says where the class
              comes from rather than leaving the rower to wonder where the
              question went — and it names CONCEPT2, not the profile,
              because the profile is only the FALLBACK producer
              (observation 29): the class comes from the rower's own most
              recent Concept2 row first. Naming the profile here would be
              wrong for every rower who has ever declared a class, and it
              would promise a page this card cannot open. */}
          <p className="c2-card-helper">
            Your weight class comes from Concept2.
          </p>
          <button
            type="button"
            className="c2-card-primary"
            disabled={busy}
            onClick={() => void connect()}
          >
            CONNECT TO CONCEPT2
          </button>
          <p className="c2-card-foot">
            OPENS CONCEPT2 IN YOUR BROWSER &middot; YOU COME BACK HERE
          </p>
        </>
      )}
    </section>
  );
}
```

- [ ] **Step 4: Append the CSS.** In `app/src/index.css`, after the `.you-*` block. **Tokens only, never raw hex** (agent briefing). Every pairing's ratio is the amendment's §4 table, recomputed here rather than taken on faith:

```css
/* Wave E PR2, Surface 1 (board 1a-1e + Gate 0 amendment 1f-1j). House card
   idiom: --surface ground, 1px --rule, 2px radius, 16px padding, 12px gap
   — the board's own values, which are tokens.css's verbatim.

   Contrast, computed (WCAG relative luminance), NOT eyeballed (RF6):
   --ink on --surface 17.11:1 · --ink-2 on --surface 10.81:1 · --ink-3 on
   --surface 7.43:1 · --ink-4 on --surface 5.29:1 · --ink on
   --surface-sunken 14.50:1 · --ink-3 on --surface-sunken 6.30:1 ·
   --accent on --surface 5.94:1 · --on-color on --accent 5.94:1 ·
   --on-color on --ink 17.11:1. All clear the 4.5:1 AA floor.

   THE ONE VALUE THIS BLOCK REFUSES: --ink-4 on --surface-sunken measures
   4.48:1 and FAILS. The panel's muted line (.c2-card-panel-reason) is
   therefore --ink-3, not the --ink-4 every other muted line on this card
   uses. Anything added to .c2-card-panel later inherits that constraint. */
.c2-card {
  background: var(--surface);
  border: 1px solid var(--rule);
  border-radius: var(--radius);
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.c2-card-head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 12px;
}

.c2-card-label {
  margin: 0;
  font-family: var(--font-mono);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.16em;
  color: var(--ink);
}

.c2-card-status {
  font-family: var(--font-mono);
  font-size: 11px;
  letter-spacing: 0.12em;
  color: var(--ink-4);
  white-space: nowrap;
}

.c2-card-status-on {
  color: var(--ink);
  font-weight: 600;
}

/* Gate 0 amendment 1c. `overflow-wrap: anywhere` for the same reason
   `.you-identity` carries `min-width: 0` (You.tsx's own comment): a long
   address must not push this card a whole line taller. */
.c2-card-identity {
  margin: 0;
  font-size: 12px;
  color: var(--ink-3);
  overflow-wrap: anywhere;
}

.c2-card-explain {
  margin: 0;
  font-size: 14px;
  color: var(--ink);
}

.c2-card-helper {
  margin: 0;
  font-size: 12px;
  color: var(--ink-3);
}

.c2-card-section {
  margin: 0;
  font-family: var(--font-mono);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.16em;
  color: var(--ink);
}

.c2-card-foot {
  margin: 0;
  text-align: center;
  font-family: var(--font-mono);
  font-size: 11px;
  letter-spacing: 0.08em;
  color: var(--ink-4);
}

.c2-card-hair {
  margin: 0;
  border: 0;
  height: 1px;
  background: var(--rule-2);
}

.c2-card-panel {
  background: var(--surface-sunken);
  border: 1px solid var(--rule);
  border-radius: var(--radius);
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.c2-card-panel-label {
  margin: 0;
  font-family: var(--font-mono);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.16em;
  color: var(--ink);
}

.c2-card-panel-line {
  margin: 0;
  font-size: 14px;
  color: var(--ink);
}

/* --ink-3, NOT --ink-4: see this block's own header. 6.30:1 on
   --surface-sunken, against 4.48:1 for the value it would otherwise
   inherit from .c2-card-foot's family. */
.c2-card-panel-reason {
  margin: 0;
  font-family: var(--font-mono);
  font-size: 11px;
  letter-spacing: 0.08em;
  color: var(--ink-3);
}

.c2-card-primary {
  min-height: 48px;
  background: var(--ink);
  border: 1px solid var(--ink);
  border-radius: 0;
  color: var(--on-color);
  font-family: var(--font-mono);
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.16em;
}

/* Board 1a: "Until a class is picked, Connect is dimmed and inert."
   The LABEL carries the state as well as the border — a border-only
   distinction would be a 1.73:1 signal (--rule-3 on --surface). */
.c2-card-primary:disabled {
  background: transparent;
  border-color: var(--rule-3);
  color: var(--ink-3);
}

.c2-card-retry {
  min-height: 52px;
  background: transparent;
  border: 1px solid var(--ink);
  border-radius: 0;
  color: var(--ink);
  font-family: var(--font-sans);
  font-size: 16px;
  font-weight: 600;
}

/* Board 1c/1d. Accent's third canonical job, a destructive control
   (docs/design/handoffs/2026-08-03-ui-fix/DESIGN.md), so it needs no
   dispensation — unlike the log row's link-out, which is recorded as a
   DEVIATIONS row (this PR's Task 13). Outlined at rest, filled when armed:
   index.css's own "4 · destructive" comment sets that vocabulary. */
.c2-card-danger {
  min-height: 52px;
  background: transparent;
  border: 1px solid var(--accent);
  border-radius: 0;
  color: var(--accent);
  font-family: var(--font-sans);
  font-size: 16px;
  font-weight: 600;
}

.c2-card-danger-armed {
  background: var(--accent);
  border-color: var(--accent);
  color: var(--on-color);
}

/* Board 3a: two columns inside the card in landscape (copy + helper left;
   control, Connect, footnote right). `.c2-card > *` is not re-flowed —
   only the unlinked card's dense middle needs it, and the grid is applied
   to the fragment's own wrapper so the head row stays full width. */
@media (orientation: landscape) and (max-height: 500px) {
  .c2-card {
    padding: 14px 16px;
    gap: 10px;
  }
}
```

  **The OptionGroup override that used to follow is DELETED (ruling i).** An earlier revision appended `.c2-card .onb-options` / `.c2-card .onb-option` rules to reshape onboarding's stacked radio rows into the board's 2-column segmented control. There is no control, so there are no rules: this card imports nothing from `src/onboarding/` and adds no `.onb-*` selectors.

  **RF5 applies to the change, not to a deletion of dead CSS**, and the direction here is the safe one — the rules were never written, so nothing is orphaned. The check that DOES apply: after Task 4, `git grep -n "onb-option" -- app/src/index.css` must return only onboarding's own rules, with no `.c2-card` prefix among them. Paste the output into the task report.

- [ ] **Step 5: Run the tests, then the scoped gates.**

```bash
cd /Users/james/projects/github/jamesawesome/Ergomatic-wt-c2pr2/app
NODE_OPTIONS=--no-experimental-webstorage pnpm exec vitest run --project client src/you/Concept2Card.test.tsx
pnpm lint
pnpm typecheck
pnpm format:check
```

- [ ] **Step 6: Commit, then probe.**

  | # | Mutation | Must fail |
  | --- | --- | --- |
  | M14 | drop the `!link.available` clause from the early return | "renders NOTHING when the server says the surface is unavailable". **This probe did NOT bite in the paste-test** and the reason was the test, not the mutation: it awaited a `c2-probe-settled` testid nothing renders, so the assertion ran before the mount read resolved and passed against a card that was about to appear. Fixed by the real settle wait now in that test |
  | M15 | drop the `failed !== null` early-return BLOCK entirely, so a failed read falls through to `link === null` | "says the read failed and offers a Retry" — the panel never renders. **This probe was structurally unable to bite in the paste-test** ("`failed` and `link === null` are indistinguishable via any test that fails the FIRST read"), and it is amendment 1i that fixed it rather than a better test: once a failed read has its OWN rendering, the two states are distinguishable by construction |
  | M15b | make the read-failed branch return `null` instead of the panel, i.e. draw a failed read exactly like an unavailable one | same test. This is the probe that proves 1h and 1i are two states and not one |
  | M15c | `reasonFor`: return `"NO CONNECTION"` unconditionally | "names NO CONNECTION when the request never completed" stays green; **"says the read failed and offers a Retry" goes red** on its `THE SERVER ANSWERED 502` assertion — the pair is what pins the discriminator |
  | M16 | render a `<OptionGroup>` (or any `role="radiogroup"`) back onto the unlinked card and gate Connect on it | "asks the rower NOTHING and offers a live Connect from the first paint" — both the `not.toBeDisabled()` and the three absence assertions go red. **This is ruling (i)'s gate on the card and it must be run**, because every other assertion here would stay green against a card that started asking again |
  | M16b | `connect()` passes `{ weightClass: "H" }` to `startLink` | "calls startLink with NO arguments" — `toHaveBeenCalledWith()` with an empty list is what bites; `toHaveBeenCalled()` would not |
  | M17 | make the first Unlink tap call `unlink()` directly | "does not delete on the first tap" |
  | M18 | change `UNLINK_DISARM_MS` to `8000` | "disarms on its own after 4 s" — this is the probe that proves the deadline test uses INDEPENDENT literals rather than the production constant (RF21) |
  | M19 | delete the `await reload()` from `connect()` | "re-reads the server after every attempt". That test's count assertion is wrapped in `waitFor`, deliberately: `connect()` awaits `startLink` and THEN `reload()`, and `userEvent`'s act wrapper does not guarantee both microtask hops have flushed when the click resolves — a bare count makes this probe bite intermittently, which is a probe that proves nothing |
  | M20 | `disabled={busy || link.c2UserId === null}` on RECONNECT — any second clause at all | "reconnects with a live button and no question", on its `not.toBeDisabled()`. Stands in for the retired class gate: the invariant is that `busy` is the ONLY disabler |
  | M21 | remove `setOutcome(null)` from `unlink()`'s success branch | "a relink offers Connect again and asks nothing" — the linked outcome survives the unlink and the card re-renders from it. **Replaces the retired `setWeightClass(null)` probe**, which had nothing left to mutate once ruling (i) removed the draft; the covering test keeps its connect → unlink → Connect flow, because the property it proves (no residue of the removed account) still holds and is still worth a gate |
  | M21b | delete the `else { setUnlinkFailed(...) }` branch from `unlink()`, leaving only the `finally` | "says the link is unchanged when the DELETE is refused" |
  | M21c | remove the `pageshow` listener registration from the attempt-clear effect | **"a restore mid-attempt leaves a reachable card, not a frozen OPENING panel"**. This is the probe REWRITTEN: its earlier form ("set `unlinkFailed` but do not clear it at the top of `unlink()`") could not bite at all, because the panel it targets is gated `link.linked && unlinkFailed !== null` and the covering scenario made `link.linked` false anyway — the gate hid the mutant. RUN: red on exactly that test, 20 others green |
  | M21d | drop `setUnlinkFailed(null)` from the top of `unlink()` | "clears the previous REASON the moment a new unlink starts". The `link.linked` gate makes a latched failure unobservable AFTER a successful unlink, so that is not the case to test; what IS observable is a stale REASON sitting over the NEXT attempt while it is still in flight. RUN: red on exactly that test |
  | M21e | move `disarm()` out of `unlink()`'s `finally` and back onto the success path only | "clears the unlink failure when a later unlink succeeds" AND "clears the previous REASON the moment a new unlink starts" — both go looking for `Unlink Concept2` after a refusal and find an armed control. RUN: 2 failed, 19 passed |


---

## Task 5: The send block's pure model, and the `StoredLog` fields it reads

**Files:**
- Modify: `app/src/log/storedSummary.ts` (add `c2ResultId`, `c2UserId` to `StoredLog`)
- Modify: `app/src/log/FromTheLog.test.tsx` (fixture `storedRow`), `app/src/log/HistoryList.test.tsx` (`baseStoredRow`), `app/src/log/storedSummary.test.ts` (`baseRow`)
- Create: `app/src/log/concept2Send.ts`
- Test: `app/src/log/concept2Send.test.ts`

**Interfaces:**
- Produces: `isSendable(row): boolean`, `sentResultId(row, link): number | null`, `c2ResultUrl(base, c2UserId, resultId): string`, **`c2ProfileUrl(base): string` — no id, see observation 28**, `SendState` (whose `sent` member now carries `weightClass` + `weightClassSource`, and whose `noWeight` member carries a `line` as well as a `reason`), `readSendResponse(status, body): SendState`, `weightClassLine(send): string | null`.

- [ ] **Step 1: Add the two fields and fix the three fixtures.** In `app/src/log/storedSummary.ts`, after `workMeters` in `StoredLog`:

```ts
  // Wave E PR1 (spec §Stored shapes): C2's own result id, and WHICH
  // Concept2 account accepted it. Both server-written at upload, never
  // client input (`server/stores/logs.ts`'s own comment: "c2ResultId/
  // c2UserId are NEVER client input"). Required-and-nullable, the same
  // convention as `machineWorkSeconds` above: `GET /api/logs/:id` returns
  // `db.select()` over every column (`stores/logs.ts`'s `get()`), so
  // "absent" is not a shape this row can carry; `null` is the common case.
  // PR2 is the first reader — the sent state renders only when
  // `c2UserId` matches the LIVE link's (spec anchor F8).
  c2ResultId: number | null;
  c2UserId: number | null;
```

  **MEASURED consequence** (`tsc -p tsconfig.app.json --noEmit`, scratch tree, 2026-09-03): exactly three errors, in the three fixture builders named above and nowhere else. Add to each literal:

```ts
    c2ResultId: null,
    c2UserId: null,
```

  at `FromTheLog.test.tsx`'s `storedRow` (after `source: "pm5",`), `HistoryList.test.tsx`'s `baseStoredRow` (after `source: "pm5",`), and `storedSummary.test.ts`'s `baseRow` (after `source: "manual",`). Do NOT loosen the type to optional to avoid this; observation 6 records why.

- [ ] **Step 2: Write the failing tests.** `app/src/log/concept2Send.test.ts` (placed and run — `Tests 17 passed (17)`):

```ts
import { describe, it, expect } from "vitest";
import { LINK_UNAVAILABLE, type Concept2Link } from "../api/useConcept2Link";
import {
  c2ProfileUrl,
  c2ResultUrl,
  isSendable,
  readSendResponse,
  sentResultId,
  weightClassLine,
} from "./concept2Send";

const LINK: Concept2Link = {
  ...LINK_UNAVAILABLE,
  available: true,
  linked: true,
  c2UserId: 2211,
  c2Username: "jamesawesome",
  logbookBaseUrl: "https://log-dev.concept2.com",
};

const ELIGIBLE = {
  source: "pm5" as const,
  endedBy: "finished" as const,
  workSeconds: 1234.5,
  workMeters: 5000,
};

describe("isSendable (mirrors server/concept2/mapping.ts's eligibilityFailure)", () => {
  it("accepts a finished pm5 row with both work columns", () => {
    expect(isSendable(ELIGIBLE)).toBe(true);
  });

  it("refuses every non-pm5 door", () => {
    expect(
      (["timer", "manual", "no-reading"] as const).map((source) =>
        isSendable({ ...ELIGIBLE, source }),
      ),
    ).toStrictEqual([false, false, false]);
  });

  it("refuses a row missing either work column", () => {
    expect(isSendable({ ...ELIGIBLE, workSeconds: null })).toBe(false);
    expect(isSendable({ ...ELIGIBLE, workMeters: null })).toBe(false);
  });
});

describe("sentResultId (spec anchor F8: sent belongs to an ACCOUNT, not just a row)", () => {
  it("returns the id when the row's account is the live link's", () => {
    expect(sentResultId({ c2ResultId: 339, c2UserId: 2211 }, LINK)).toBe(339);
  });

  it("returns null when the row was accepted by a DIFFERENT account", () => {
    expect(sentResultId({ c2ResultId: 339, c2UserId: 999 }, LINK)).toBeNull();
  });
});

describe("the two Concept2 URLs", () => {
  it("builds /profile/{c2_user_id}/log/{result_id} on the server's own origin", () => {
    expect(c2ResultUrl("https://log-dev.concept2.com", 2211, 339)).toBe(
      "https://log-dev.concept2.com/profile/2211/log/339",
    );
  });

  it("sends the rower to the ID-LESS profile path, because the id-bearing one is a public read-only card", () => {
    // Measured 2026-09-03: `/profile/2211` renders 200 to an ANONYMOUS
    // fetcher — Age, Country, Logbook ID, Login/Sign Up chrome, no weight and
    // no form — while `/profile` 302s to `/login`, which is the
    // authenticated-self signature. A 200 to a signed-out fetcher is evidence
    // AGAINST a page being the rower's own settings form.
    expect(c2ProfileUrl("https://log-dev.concept2.com")).toBe(
      "https://log-dev.concept2.com/profile",
    );
  });
});

describe("readSendResponse (409 carries THREE meanings, 422 carries TWO; never key on status)", () => {
  it("reads a 200 as sent, carrying the class and WHICH producer supplied it", () => {
    expect(
      readSendResponse(200, {
        resultId: 339,
        weightClass: "L",
        weightClassSource: "declaration",
      }),
    ).toStrictEqual({
      kind: "sent",
      resultId: 339,
      weightClass: "L",
      weightClassSource: "declaration",
    });
  });

  it("reads an OLDER server's bare 200 as sent with no provenance, rather than as a failure", () => {
    // Mid rolling deploy the route answers `{resultId}` alone. A SENT row
    // with no provenance line is exactly what a later mount renders anyway,
    // since nothing about the class is stored.
    expect(readSendResponse(200, { resultId: 339 })).toStrictEqual({
      kind: "sent",
      resultId: 339,
      weightClass: null,
      weightClassSource: null,
    });
  });

  it("tells the three 409s apart by body.error, not by status", () => {
    expect(
      readSendResponse(409, { error: "duplicate", c2ResultId: 339 }),
    ).toStrictEqual({ kind: "duplicate", resultId: 339 });
    expect(readSendResponse(409, { error: "needs_reauth" })).toStrictEqual({
      kind: "reauth",
    });
    expect(readSendResponse(409, { error: "unlinked" })).toStrictEqual({
      kind: "gone",
    });
  });

  it("SHOWS an eligibility refusal, because it means the two predicates disagree", () => {
    expect(
      readSendResponse(422, { error: "not_eligible", reason: "not_finished" }),
    ).toStrictEqual({
      kind: "failed",
      reason: "CONCEPT2 WON'T TAKE THIS ROW · NOT FINISHED",
    });
  });

  it("tells the two 422s apart, because only one of them is the rower's to fix", () => {
    expect(
      readSendResponse(422, { error: "no_weight_class", reason: "no_weight" })
        .kind,
    ).toBe("noWeight");
    expect(
      readSendResponse(422, { error: "not_eligible", reason: "not_finished" })
        .kind,
    ).toBe("failed");
  });

  it("gives each server reason honest words, and never tells a rower we cannot classify to set a weight", () => {
    // Four tokens, three renderings, and the last two rows are lens 2 F12:
    // a `Record` + `reason in MAP` lookup admits `Object.prototype` keys,
    // so `"toString"` would render an `undefined` line while `tsc` types
    // the lookup as non-optional. The switch cannot be reached that way.
    const rendered = (
      [
        "no_weight",
        "unreadable_weight",
        "implausible_weight",
        "no_gender",
        "something_new",
        "toString",
        "constructor",
      ] as const
    ).map((reason) => {
      const state = readSendResponse(422, {
        error: "no_weight_class",
        reason,
      });
      return state.kind === "noWeight" ? state.reason : state.kind;
    });
    expect(rendered).toStrictEqual([
      "SET YOUR WEIGHT ON CONCEPT2",
      "COULDN'T READ YOUR CONCEPT2 WEIGHT",
      "COULDN'T READ YOUR CONCEPT2 WEIGHT",
      "COULDN'T GET A CLASS FROM CONCEPT2",
      "COULDN'T GET A CLASS FROM CONCEPT2",
      "COULDN'T GET A CLASS FROM CONCEPT2",
      "COULDN'T GET A CLASS FROM CONCEPT2",
    ]);
  });

  it("never blames the rower's weight for a number OUR unit inference could not classify", () => {
    // An implausible number is most likely our own unit being wrong
    // (observation 24), so the copy says what WE could not do.
    const state = readSendResponse(422, {
      error: "no_weight_class",
      reason: "implausible_weight",
    });
    expect(state.kind === "noWeight" && state.line).not.toContain("no weight");
    expect(state.kind === "noWeight" && state.line).toContain(
      "we couldn't read",
    );
  });

  it("names no destination its only control cannot reach", () => {
    const lines = (
      [
        "no_weight",
        "unreadable_weight",
        "implausible_weight",
        "no_gender",
      ] as const
    ).map((reason) => {
      const state = readSendResponse(422, { error: "no_weight_class", reason });
      return state.kind === "noWeight" ? state.line : "";
    });
    // 2i's one control opens the PROFILE. No sentence may send the rower to
    // the logbook, where the class is set per result and this button cannot
    // go — which is what the copy said before lens 2 F3.
    expect(lines.join(" ")).not.toContain("logbook");
    expect(lines.join(" ")).not.toContain("—");
  });

  it("degrades a malformed 200 rather than rendering SENT with no id", () => {
    expect(readSendResponse(200, {}).kind).toBe("failed");
    expect(readSendResponse(409, { error: "duplicate" }).kind).toBe("failed");
  });

  it("uses no em-dash in any reason or line (house style)", () => {
    const strings = (
      [
        [502, { error: "c2_error" }],
        [404, {}],
        [418, {}],
        [422, { error: "no_weight_class", reason: "no_weight" }],
        [422, { error: "no_weight_class", reason: "no_gender" }],
      ] as const
    ).flatMap(([status, body]) => {
      const state = readSendResponse(status, body);
      if (state.kind === "failed") return [state.reason];
      if (state.kind === "noWeight") return [state.reason, state.line];
      return [];
    });
    expect(strings.join(" ")).not.toContain("—");
    expect(strings.slice(0, 3)).toStrictEqual([
      "CONCEPT2 ERROR · 502",
      "THIS ROW IS GONE",
      "COULDN'T SEND THIS ROW · 418",
    ]);
  });
});

describe("weightClassLine (ruling R2: a class we GUESSED is shown at the moment it is written)", () => {
  it("names the class and the producer, in two different words for two different producers", () => {
    expect(
      weightClassLine({
        kind: "sent",
        resultId: 1,
        weightClass: "H",
        weightClassSource: "declaration",
      }),
    ).toBe("WEIGHT CLASS H · FROM YOUR LAST CONCEPT2 ROW");
    expect(
      weightClassLine({
        kind: "sent",
        resultId: 1,
        weightClass: "L",
        weightClassSource: "profile",
      }),
    ).toBe("WEIGHT CLASS L · FROM YOUR CONCEPT2 WEIGHT");
  });

  it("renders nothing for a SENT state with no class, which is every later mount", () => {
    // Nothing about the class is stored (I4), so a row re-read from the
    // record carries a result id and no provenance. The line is absent
    // rather than invented.
    expect(
      weightClassLine({
        kind: "sent",
        resultId: 1,
        weightClass: null,
        weightClassSource: null,
      }),
    ).toBeNull();
    expect(weightClassLine({ kind: "duplicate", resultId: 1 })).toBeNull();
  });
});
```

- [ ] **Step 3: Run, confirm failure, then create `app/src/log/concept2Send.ts`.**

```ts
import type { Concept2Link } from "../api/useConcept2Link";
import type { StoredLog } from "./storedSummary";

/** Client mirror of `server/concept2/mapping.ts`'s `eligibilityFailure`
 *  (that function's four clauses, same order). The SERVER is authoritative
 *  — it re-checks and 422s — so this predicate exists only to decide
 *  whether the block renders at all (board: "Non-qualifying rows: the
 *  block does not render, ever"). The two are pinned equal by
 *  `server/routes/concept2Send.integration.test.ts`, the same cross-tree
 *  shape `routes/partial.integration.test.ts` already uses for the PARTIAL
 *  predicate. */
export function isSendable(
  row: Pick<StoredLog, "source" | "endedBy" | "workSeconds" | "workMeters">,
): boolean {
  return (
    row.source === "pm5" &&
    row.endedBy === "finished" &&
    row.workSeconds !== null &&
    row.workMeters !== null
  );
}

/** Spec §Stored shapes, anchor F8, verbatim: "the sent state renders only
 *  when the row's `c2_user_id` matches the live link's". A row carrying
 *  account A's result id, read while account B is linked, is NOT sent for
 *  this rower — the link-out would point at a row the current grant cannot
 *  see. Re-derived on every render (invariant I3), never cached. */
export function sentResultId(
  row: Pick<StoredLog, "c2ResultId" | "c2UserId">,
  link: Concept2Link,
): number | null {
  if (row.c2ResultId === null || row.c2UserId === null) return null;
  if (link.c2UserId === null || row.c2UserId !== link.c2UserId) return null;
  return row.c2ResultId;
}

/** PR0 measurement: "the logbook web URL is `/profile/{c2_user_id}/log/
 *  {result_id}`" (`docs/monitor/c2-crossconnect-2026-09/README.md`). The
 *  ORIGIN comes from the server (`logbookBaseUrl`, echoed from
 *  `C2_BASE_URL`) because the client cannot know whether this deployment
 *  talks to `log.concept2.com` or `log-dev.concept2.com`, and a hardcoded
 *  guess 404s for the whole sandbox phase (plan observation 5). */
export function c2ResultUrl(
  logbookBaseUrl: string,
  c2UserId: number,
  resultId: number,
): string {
  return `${logbookBaseUrl}/profile/${String(c2UserId)}/log/${String(resultId)}`;
}

/** The rower's OWN Concept2 account page — amendment 2i's link-out, where
 *  they set the weight (or the class) the send needs.
 *
 *  NO id in the path, and the id-bearing form is the thing this function
 *  exists to avoid. Both were measured on 2026-09-03 against log-dev:
 *
 *    `/profile/2211` -> 200 to an ANONYMOUS fetcher, 13862 bytes, whose
 *    entire visible text is "Login Sign Up … james morelli Age: 38
 *    Country: United States Logbook ID: 2211 Member since: August 21, 2026
 *    … Quick Links Your Log Rankings". No weight. No form. No edit control.
 *    A page that renders to a signed-out fetcher is by construction not the
 *    rower's own account-edit form.
 *
 *    `/profile` (no id) -> 302 to `/login`, which is the authenticated-self
 *    signature. `/profile/edit`, `/profile/2211/edit`, `/account`,
 *    `/settings` and `/preferences` all 404.
 *
 *  So the id-less path is the one that lands a rower in their own account
 *  after signing in — and signing in is the likely case, because the native
 *  arm opens `SFSafariViewController`, whose website data has been isolated
 *  from Safari since iOS 11 (SECONDARY — the same isolation that forced
 *  PR1.75b's OAuth hop onto `ASWebAuthenticationSession`). The rower arrives
 *  in a cookie jar that is not Safari's.
 *
 *  PROVISIONAL until one logged-in glance (exit criterion 3b's session) says
 *  which page actually carries the weight and weight-class fields. No status
 *  code can settle that, and this comment does not pretend otherwise. */
export function c2ProfileUrl(logbookBaseUrl: string): string {
  return `${logbookBaseUrl}/profile`;
}

/** Which producer supplied the class on a send that just succeeded
 *  (`weightClassSource` on the route's 200). Rendered on the SENT state so a
 *  DERIVED class — a guess about a fact Concept2 lets its owner declare — is
 *  visible at the moment it is written, while Concept2's own per-result edit
 *  can still repair it. Never stored: on a later mount the row carries only
 *  its result id, and this line is absent. */
export type WeightClassSource = "declaration" | "profile";

export type SendState =
  | { kind: "idle" }
  | { kind: "sending" }
  | {
      kind: "sent";
      resultId: number;
      weightClass: "H" | "L" | null;
      weightClassSource: WeightClassSource | null;
    }
  | { kind: "duplicate"; resultId: number }
  | { kind: "reauth" }
  /** The block's own preconditions stopped holding mid-session: unlinked
   *  in another tab, or the flag flipped off. The block disappears; it
   *  never shows a retry for something retrying cannot fix.
   *
   *  `not_eligible` is deliberately NOT one of these. It means the client
   *  predicate and the server's disagree about the SAME row — a fault on
   *  our side, not a precondition lapsing — and it is drawn as a `failed`
   *  with its own reason (amendment 2h), so the divergence is visible in
   *  the field and not only in CI. */
  | { kind: "gone" }
  /** Amendment 2i, ruling (i). Concept2 requires a weight class on every
   *  rower result and we ask for none: the server reads the rower's own most
   *  recent declaration, falls back to deriving one from their profile, and
   *  this is the answer when neither producer can supply one. It is a
   *  `failed` with a LINK-OUT and a retry rather than a plain `failed`,
   *  because it is the one send failure the rower can actually repair, and
   *  the place to repair it is not in this app. Distinct from
   *  `not_eligible`, which is about the ROW and cannot be repaired at all.
   *
   *  `line` and `reason` are BOTH carried because the four server tokens do
   *  not all mean "set your weight": a profile whose `gender` is neither `M`
   *  nor `F` has no derivable class at all, and telling that rower to set a
   *  weight would send them to fix a field that is not broken. */
  | { kind: "noWeight"; line: string; reason: string }
  | { kind: "failed"; reason: string };

function field(body: unknown, key: string): unknown {
  return typeof body === "object" && body !== null && key in body
    ? (body as Record<string, unknown>)[key]
    : null;
}

/** Amendment 2i's copy: FOUR server tokens, THREE renderings, and every
 *  one of them drawn on the Gate 0 page.
 *
 *  The tokens are the SERVER's vocabulary and the words are the client's,
 *  the same split `not_eligible` uses. The renderings are grouped by what
 *  the rower can actually DO about it, and every sentence is answerable
 *  from the one control this state has (OPEN CONCEPT2 PROFILE).
 *
 *  `unreadable_weight` and `implausible_weight` share one rendering, and
 *  it says what WE could not do rather than what they should fix: an
 *  implausible number is most likely our own unit inference being wrong
 *  (`server/concept2/mapping.ts`'s band comment), so blaming the rower's
 *  weight sends them after a field that is probably fine. The two tokens
 *  stay distinct on the WIRE so the route's log line can tell a value we
 *  could not parse from one that parsed and was absurd.
 *
 *  `no_gender` and any token we do not recognise share the third: we
 *  could not work a class out, and the destination is the same. It does
 *  NOT say "set your weight" (that rower's weight is not the broken
 *  thing) and it does NOT name the logbook, because this state's only
 *  control opens the PROFILE and copy must never name a destination its
 *  control cannot reach. */
const NO_WEIGHT_SET = {
  line: "Concept2 needs a weight class on every result, and your Concept2 profile has no weight set. Set it there, then send this row again.",
  reason: "SET YOUR WEIGHT ON CONCEPT2",
};

const WEIGHT_UNREADABLE = {
  line: "Concept2 needs a weight class on every result, and we couldn't read the weight on your Concept2 profile. Open Concept2 to check it, then send this row again.",
  reason: "COULDN'T READ YOUR CONCEPT2 WEIGHT",
};

const CLASS_UNDERIVABLE = {
  line: "Concept2 needs a weight class on every result, and we couldn't work one out from your Concept2 profile. Open Concept2 to check it, then send this row again.",
  reason: "COULDN'T GET A CLASS FROM CONCEPT2",
};

/** A SWITCH, not a `Record` lookup. A `reason in NO_WEIGHT_COPY` guard over
 *  a `Record<string, X>` admits `Object.prototype` keys — a wire token of
 *  `"toString"` passes the guard and yields an `undefined` line, which the
 *  compiler hides because `Record` types the lookup as non-optional (this
 *  app sets no `noUncheckedIndexedAccess`). A switch cannot be reached that
 *  way, is exhaustive over the wire vocabulary, and needs no
 *  `Object.hasOwn` — which is Safari 15.4, above this app's
 *  `IPHONEOS_DEPLOYMENT_TARGET = 15.0` floor and used nowhere in this repo
 *  (RF27's availability rule).
 *
 *  There is deliberately NO fourth "unknown token" rendering: an
 *  unrecognised token means Concept2's side gave us something we could not
 *  turn into a class, which is exactly what `CLASS_UNDERIVABLE` says. That
 *  keeps the set of sentences this client can produce equal to the set the
 *  Gate 0 page drew. */
function noWeightCopy(reason: unknown): { line: string; reason: string } {
  switch (reason) {
    case "no_weight":
      return NO_WEIGHT_SET;
    case "unreadable_weight":
    case "implausible_weight":
      return WEIGHT_UNREADABLE;
    case "no_gender":
      return CLASS_UNDERIVABLE;
    default:
      return CLASS_UNDERIVABLE;
  }
}

/**
 * `POST /api/concept2/results/:logId`'s answer -> the block's state.
 *
 * EVERY branch keys on `body.error`, never on the status alone, because
 * that route answers 409 with three different meanings:
 * `unlinked`, `needs_reauth` and `duplicate`. Branching on `409` would
 * collapse a rower who must reconnect, a rower who unlinked, and a row
 * Concept2 already has. The same applies to the two 422s.
 */
export function readSendResponse(status: number, body: unknown): SendState {
  const error = field(body, "error");
  if (status === 200) {
    const resultId = field(body, "resultId");
    if (typeof resultId !== "number") {
      return {
        kind: "failed",
        reason: "CONCEPT2 ANSWERED WITHOUT A RESULT ID",
      };
    }
    // The class and its producer are read DEFENSIVELY, not required: an
    // older server (mid rolling deploy) answers a bare `{resultId}`, and a
    // SENT row with no provenance line is correct there — it is the same
    // thing a later mount renders, since nothing about the class is stored.
    const weightClass = field(body, "weightClass");
    const source = field(body, "weightClassSource");
    return {
      kind: "sent",
      resultId,
      weightClass:
        weightClass === "H" || weightClass === "L" ? weightClass : null,
      weightClassSource:
        source === "declaration" || source === "profile" ? source : null,
    };
  }
  if (error === "duplicate") {
    const resultId = field(body, "c2ResultId");
    // The 409's id is what makes the duplicate state useful AND durable:
    // the route writes it to the row before answering (RF25), so the next
    // mount reads SENT. Without an id there is nothing to link to and
    // nothing was recorded — that is a failure, not a duplicate.
    return typeof resultId === "number"
      ? { kind: "duplicate", resultId }
      : {
          kind: "failed",
          reason: "CONCEPT2 REJECTED A DUPLICATE WITHOUT AN ID",
        };
  }
  if (error === "needs_reauth") return { kind: "reauth" };
  if (error === "unlinked" || error === "unavailable") return { kind: "gone" };
  // Amendment 2i. Its own kind, not a `failed`, because it is the only send
  // failure that renders a BUTTON going somewhere: the repair is on
  // Concept2's side and the rower has no other way to find it.
  if (error === "no_weight_class") {
    const copy = noWeightCopy(field(body, "reason"));
    return { kind: "noWeight", line: copy.line, reason: copy.reason };
  }
  // `not_eligible` is NOT one of the `gone` cases, and folding it in with
  // them was a defect: `unlinked` and `unavailable` mean the block's own
  // preconditions stopped holding and it should not be on screen at all. A
  // 422 `not_eligible` means the CLIENT predicate and the SERVER predicate
  // disagree about this row — exactly the drift
  // `server/routes/concept2Send.integration.test.ts` exists to detect — and
  // drawing it as the block silently vanishing on tap shows the rower a
  // control that was there a second ago and now is not, while telling
  // nobody. It is a failure, it names itself, and the divergence becomes
  // visible in the field rather than only in CI.
  if (error === "not_eligible") {
    const reason = field(body, "reason");
    return {
      kind: "failed",
      reason: `CONCEPT2 WON'T TAKE THIS ROW · ${
        typeof reason === "string"
          ? reason.toUpperCase().replace(/_/g, " ")
          : "NOT ELIGIBLE"
      }`,
    };
  }
  if (status === 404) return { kind: "failed", reason: "THIS ROW IS GONE" };
  if (status === 400 && field(body, "field") === "tz") {
    return { kind: "failed", reason: "COULDN'T READ THIS DEVICE'S TIME ZONE" };
  }
  if (status === 502) return { kind: "failed", reason: "CONCEPT2 ERROR · 502" };
  return {
    kind: "failed",
    reason: `COULDN'T SEND THIS ROW · ${String(status)}`,
  };
}

/** The SENT state's provenance sub-line (ruling R2). Null when the send
 *  carried no class — an older server, or a SENT state re-derived from the
 *  stored row on a later mount. */
export function weightClassLine(send: SendState): string | null {
  if (send.kind !== "sent") return null;
  if (send.weightClass === null || send.weightClassSource === null) return null;
  return `WEIGHT CLASS ${send.weightClass} · ${
    send.weightClassSource === "declaration"
      ? "FROM YOUR LAST CONCEPT2 ROW"
      : "FROM YOUR CONCEPT2 WEIGHT"
  }`;
}
```

- [ ] **Step 4: Run the whole `src/log` client suite** (the fixture change touches three existing files):

```bash
cd /Users/james/projects/github/jamesawesome/Ergomatic-wt-c2pr2/app
NODE_OPTIONS=--no-experimental-webstorage pnpm exec vitest run --project client src/log
```

- [ ] **Step 5: Commit, then probe.**

  | # | Mutation | Must fail |
  | --- | --- | --- |
  | M22 | `isSendable`: drop the `endedBy === "finished"` clause | "refuses every close that is not a natural finish" |
  | M23 | `isSendable`: drop the `source === "pm5"` clause | "refuses every non-pm5 door" |
  | M24 | `sentResultId`: drop the `row.c2UserId !== link.c2UserId` clause | "returns null when the row was accepted by a DIFFERENT account" |
  | M25 | `readSendResponse`: branch on `status === 409` before reading `error` | "tells the three 409s apart by body.error" |
  | M26 | `readSendResponse`: return `{kind:"sent", resultId: 0}` for a bodyless 200 | "degrades a malformed 200" |
  | M28b | `readSendResponse`: fold `not_eligible` back in with `unlinked`/`unavailable` as `{kind:"gone"}` | "SHOWS an eligibility refusal, because it means the two predicates disagree". `unlinked` and `unavailable` mean the block's own preconditions lapsed and it should not be on screen; a 422 means the client mirror of `eligibilityFailure` and the server's own copy answered differently about the SAME row, which is the one divergence the cross-tree seam test exists to catch — and a block that vanishes on tap reports it to nobody. RUN: red on exactly that test |
  | M27 | `c2ResultUrl`: swap `c2UserId` and `resultId` | "builds /profile/{c2_user_id}/log/{result_id}" |
  | M27b | `c2ProfileUrl`: return the ID-BEARING `` `${logbookBaseUrl}/profile/${c2UserId}` `` | RUN: red on "sends the rower to the ID-LESS profile path …". That path was MEASURED to render a public read-only card with no weight and no form (observation 28), so the mutant sends every rower to a page they cannot edit |
  | M28c | `readSendResponse`: fold `no_weight_class` in with `not_eligible` | RUN: `2 failed | 15 passed` — "tells the two 422s apart" and the four-reason test. The kind comes back `failed`, so 2i's link-out never renders and the one repairable send failure is drawn as an unrepairable one |
  | M28d | `readSendResponse`: render `NO_WEIGHT_COPY.no_weight` for every reason token | RUN: `1 failed | 16 passed` — "gives each server reason its OWN honest words, and never tells a gender-unclassifiable rower to set a weight". That rower's weight is not the broken thing |
  | M29 | `weightClassLine`: swap the two producer phrases | RUN: `1 failed | 16 passed` — "names the class and the producer, in two different words for two different producers". A DERIVED class labelled as the rower's own declaration is worse than no label |
  | M30 | `readSendResponse`: treat a 200 with no `weightClass` as `failed` | RUN: `1 failed | 16 passed` — "reads an OLDER server's bare 200 as sent with no provenance". Mid rolling deploy this would draw a successful send as a failure and invite a duplicate |

---

## Task 6: The save path posts the run's own close stamp — **TRIAD**

**TRIAD (a number's MEANING).** Not because the diff is large — it is roughly one field on two doors — but because after it, the `date` Concept2 stores against a rower's row changes from the moment they tapped Save to the moment they stopped rowing. That is a different number on a third party's permanent record, on a route whose dedup key is second-granular. CLAUDE.md's triad rule applies in full: a complete antagonist pass on this task's premises and the PM final-PR gate.

**This task must land BEFORE Task 7.** Task 7 puts a Send button in front of a rower; every row sent through it before this task exists carries the wrong date, and rows are not re-datable once Concept2 has them.

**Files:**
- Create: `app/src/session/completionStamp.ts` (+ `.test.ts`)
- Modify: `app/src/session/LogSession.tsx` (`LogFormFields` gains two optional keys; `handleMonitorSave` sets them)
- Modify: `app/src/justrow/JustRowLog.tsx` (the monitor door's `submit` call — the app's OTHER `source: "pm5"` producer)
- Modify: **`app/server/routes/data.ts`** — `POST /api/logs` degrades an unrecognised `tz` instead of refusing the request (step 4b; this is the TRIAD half that protects the rower's own row)
- Test: `app/src/session/LogSession.test.tsx` (append), `app/src/justrow/JustRowLog.test.tsx` (append), `app/server/routes/completedAt.integration.test.ts` (append the seam case AND replace its tz-refusal case), **`app/server/routes/data.test.ts`** (its `it.each` tz-refusal block is rewritten — step 4b)
- Modify (Task 13): `app/server/db/schema.ts`'s `tz` comment, and the parent spec's mapping row

**Interfaces:**
- Produces: `completionStamp(run: { completedAt: string | null }): { completedAt: string | null; tz: string }`.
- `LogFormFields` gains `completedAt?: string | null` and `tz?: string`. Optional, like `deviceName` and the hero fields beside them: a door that has no close stamp puts no key on the wire and the server's own `?? null` default stands (`routes/data.ts:1754-1755`).

### Why this task exists

PR1 shipped both halves of one feature and neither half's owner built the other (observation 17). The server validates and stores `completedAt`/`tz` on `POST /api/logs`; `buildC2Payload` reads them:

```ts
  const instant =
    row.completedAt !== null && row.tz !== null ? row.completedAt : row.loggedAt;
  const tz = row.completedAt !== null && row.tz !== null ? row.tz : effectiveTz;
```

The branch is PAIRED — one field without the other changes nothing — and `git grep -n '\btz\b' -- src/` returns no hits at all. So the accurate branch has never fired and cannot fire, and every upload Task 7 makes possible would carry the save clock: minutes to hours after the row was actually rowed, and by an amount that varies with how long the rower spent on the summary screen.

`server/db/schema.ts`'s own comment already said whose job this was — *"tz: the client's IANA zone; posted at save from PR2 on"* — and no earlier draft of this plan mentioned it. **A comment naming a future PR is a requirement addressed to that PR**, and the technique that finds them is one command: grep the repo for the PR's own name before planning it.

### Which doors post, and which do not

Read the doors, do not assume them. `src/session/LogSession.tsx`'s `submit(fields)` is fed from three call sites plus one in `src/justrow/JustRowLog.tsx`, and `postLog` (`LogSession.tsx:438`) is the app's single `POST /api/logs` site.

| door | `source` | posts the pair? | why |
| --- | --- | --- | --- |
| monitor summary (`LogSession.tsx`'s `handleMonitorSave`) | `pm5` | **yes** | it holds a `MonitorRun`, whose `completedAt` is the stamp written when the session actually closed (`monitor/monitorRun.ts`: `completedAt !== null` IS what "closed" means on that record) |
| Just Row monitor door (`JustRowLog.tsx`'s `handleSave`, the `source: "pm5"` branch) | `pm5` | **yes** | same shape, same record (`entry.run`), same eligibility fence. Naming only the first door would fix the instance and leave the class — a free row that ends `finished` is as uploadable as any other |
| session/timer door (`LogSession.tsx`'s `handleSave`) | `timer` | no | `eligibilityFailure`'s FIRST gate is `row.source !== "pm5" -> "not_monitor"` (`server/concept2/mapping.ts`), so the row can never reach `buildC2Payload` at all — and there is no `MonitorRun` here, so the only instant available IS the save clock, which `loggedAt` already records |
| Just Row timer door | `timer` | no | same |
| Log-it-after door (`ManualDoorLog`) | `manual` / `no-reading` | no | same fence, and a by-hand entry has no close instant even in principle |

**A zone with no stamp is worse than neither.** `buildC2Payload`'s branch is paired, so posting `tz` alone changes no upload — it would only store one more attribute about the rower's device on rows that can never be uploaded. Standing ruling: ask as little as we can, and store nothing with no reader.

- [ ] **Step 1: Write the failing tests.** Create `app/src/session/completionStamp.test.ts`:

```ts
import { describe, it, expect, vi, afterEach } from "vitest";
import { completionStamp } from "./completionStamp";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("completionStamp (Wave E PR2: the producer server/db/schema.ts's tz comment named)", () => {
  it("carries the run's OWN close stamp, not the clock at save time", () => {
    // The whole point: C2's `date` is the END of the workout (spec anchor
    // K3), and `loggedAt` is minutes-to-hours later.
    expect(
      completionStamp({ completedAt: "2026-09-01T09:10:20.000Z" }).completedAt,
    ).toBe("2026-09-01T09:10:20.000Z");
  });

  it("carries a canonical IANA zone the route will accept", () => {
    // routes/data.ts's `tzError` checks membership of
    // `Intl.supportedValuesOf("timeZone")` plus "UTC" — NOT "Intl parses
    // it", which also admits offsets like "+05:00" and legacy aliases.
    const { tz } = completionStamp({ completedAt: null });
    expect([...Intl.supportedValuesOf("timeZone"), "UTC"]).toContain(tz);
  });

  it("passes a missing stamp through as null rather than inventing one", () => {
    // An interrupted run has `completedAt: null` and must stay that way:
    // substituting `new Date()` here would post the save clock while
    // CLAIMING to be the close stamp, which is worse than posting nothing
    // (the server's fallback to `loggedAt` is at least honest about what
    // it is).
    expect(completionStamp({ completedAt: null }).completedAt).toBeNull();
  });

  it("still names the zone when there is no stamp, and the pair is what the server reads", () => {
    // Documented, not asserted as a virtue: `buildC2Payload`'s branch is
    // PAIRED, so a tz with a null stamp is inert on the upload. It rides
    // anyway because the upload route persists the request's zone on a
    // first legacy send, and a zone stored beside a null stamp costs
    // nothing and is true.
    expect(typeof completionStamp({ completedAt: null }).tz).toBe("string");
  });
});
```

  Append to `app/src/session/LogSession.test.tsx`, at the end of the `monitor door wire shape` describe. These use the file's OWN harness, read at this head — `buildMonitorFixture()`/`buildSessionFixture()`, `saveMonitorRun`, `mockWorkouts`, `mockBaselines`, `mockApi`, `renderManualLog(MONITOR_WORKOUT_ID, "?from=monitor")` for the monitor door and `renderLog()` for the timer door, `chooseHeldAndPain()`, `SAVE_BUTTON`, and `parsedBodies(apiFn)`:

```tsx
  it("the monitor door posts the run's close stamp and this device's zone", async () => {
    // Observation 17: PR1 shipped the validator and no producer, so this
    // pair has never crossed the wire. Without it every Concept2 upload
    // carries the SAVE clock as its date, minutes to hours after the row
    // was rowed and by however long the rower sat on the summary screen.
    const { run, workout } = buildMonitorFixture();
    saveMonitorRun(run);
    mockWorkouts([workout]);
    mockBaselines();
    const apiFn = mockApi(() =>
      Promise.resolve(
        new Response(JSON.stringify({ id: "log-monitor-stamp" }), {
          status: 201,
        }),
      ),
    );
    await renderManualLog(MONITOR_WORKOUT_ID, "?from=monitor");
    await screen.findByRole("heading", { name: "Hoarfrost" });

    await chooseHeldAndPain();
    await userEvent.click(screen.getByRole("button", { name: SAVE_BUTTON }));
    await screen.findByText("TODAY SCREEN");

    const body = parsedBodies(apiFn)[0]!;
    expect(body.completedAt).toBe(run.completedAt);
    expect(body.tz).toBe(Intl.DateTimeFormat().resolvedOptions().timeZone);
  });

  it("the timer door posts NEITHER field, because a timer row can never be uploaded", async () => {
    // The fence is `source !== "pm5" -> not_monitor`. Posting a zone on a
    // row nothing can read it from is one more stored attribute for
    // nothing, against the standing "ask as little as we can" ruling.
    const { workout } = buildSessionFixture();
    mockWorkouts([workout]);
    mockBaselines();
    const apiFn = mockApi(() =>
      Promise.resolve(
        new Response(JSON.stringify({ id: "log-timer-no-stamp" }), {
          status: 201,
        }),
      ),
    );
    await renderLog();
    await screen.findByRole("heading", { name: "Hoarfrost" });

    await chooseHeldAndPain();
    await userEvent.click(screen.getByRole("button", { name: SAVE_BUTTON }));
    await screen.findByText("TODAY SCREEN");

    const body = parsedBodies(apiFn)[0]!;
    expect(body.source).toBe("timer");
    expect("completedAt" in body).toBe(false);
    expect("tz" in body).toBe(false);
  });
```

  And to `app/src/justrow/JustRowLog.test.tsx`, using its own `mockApi`/`commitHandoff`/`closedFreeRow`/`renderDoor`/`savedBody`:

```tsx
  it("the Just Row MONITOR door posts the close stamp too, not just the session door's", async () => {
    // The class, not the instance: this is the app's other `source: "pm5"`
    // producer, over the same `MonitorRun` record, behind the same
    // eligibility fence. Fixing only `LogSession.tsx` would leave a free
    // row that ends `finished` uploading with its save clock as C2's date.
    const fn = mockApi(() => new Response(JSON.stringify({ id: "log-1" })));
    commitHandoff(closedFreeRow().startedAt, null, closedFreeRow());
    await renderDoor();

    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      const body = savedBody(fn);
      // `closedFreeRow`'s own literal — the MONITOR fixture's close
      // stamp, not `completedTimerRun`'s, which is a different clock on a
      // door that posts neither field. Written out, never read back
      // through the production path.
      expect(body.completedAt).toBe("2026-09-01T09:10:20.000Z");
      expect(body.tz).toBe(Intl.DateTimeFormat().resolvedOptions().timeZone);
    });
  });
```

  **That literal is the MONITOR fixture's, and an earlier draft used the TIMER fixture's by mistake** (`completedTimerRun`'s default `2026-09-02T21:52:34.000Z`, which belongs to a door that posts neither field). `closedFreeRow` closes at `2026-09-01T09:10:20.000Z`. Two same-shaped fixtures in one file, one of them irrelevant to the door under test: read the builder the test actually calls.

- [ ] **Step 2: Run them and confirm they fail.**

```bash
cd /Users/james/projects/github/jamesawesome/Ergomatic-wt-c2pr2/app
NODE_OPTIONS=--no-experimental-webstorage pnpm exec vitest run --project client src/session/completionStamp.test.ts src/session/LogSession.test.tsx src/justrow/JustRowLog.test.tsx
```

- [ ] **Step 3: Create `app/src/session/completionStamp.ts`.**

```ts
/**
 * Wave E PR2. The two fields `POST /api/logs` has validated and stored
 * since PR1 and nothing has ever sent (plan observation 17):
 * `session_logs.completed_at` and `session_logs.tz`.
 *
 * WHY A MODULE OF ITS OWN, for four lines. It is the upstream half of an
 * A-writes-then-B-reads seam (RF24), and the only way to gate that seam is
 * a test that starts at the producer. A server-side test can import THIS
 * — it has no imports at all, so it drags no React, no `window` and no
 * `import.meta.env` across the tree boundary — and build the request body
 * with the same function the app uses. Inlining these two keys at each
 * door would leave the seam ungateable: every available test would seed a
 * hand-written body, which is exactly the shape that let
 * `MACHINE CONFIRMED · WORK ONLY` reach zero of sixteen production rows.
 *
 * WHY IT MATTERS, in one sentence: Concept2's `date` is the END of the
 * workout (spec anchor K3), `loggedAt` is when the rower tapped Save, and
 * the gap between them is however long they spent on the summary screen.
 *
 * `Intl.DateTimeFormat().resolvedOptions().timeZone` returns a canonical
 * IANA zone name, which is what `routes/data.ts`'s `tzError` accepts
 * (membership of `Intl.supportedValuesOf("timeZone")` plus `"UTC"` — not
 * "Intl parses it", which would also admit `"+05:00"`).
 */
export function completionStamp(run: { completedAt: string | null }): {
  completedAt: string | null;
  tz: string;
} {
  return {
    // Passed through, NEVER defaulted to `new Date()`. An interrupted run
    // genuinely has no close stamp, and substituting the current instant
    // would post the save clock while claiming to be the close stamp —
    // strictly worse than the server's honest `loggedAt` fallback.
    completedAt: run.completedAt,
    tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
  };
}
```

- [ ] **Step 4: Widen `LogFormFields` and set the pair at both monitor doors.** In `app/src/session/LogSession.tsx`, after `deviceName`:

```ts
  // Wave E PR2 (plan observation 17). Optional, exactly like `deviceName`
  // above: the doors that have no close stamp put no key on the wire and
  // the server's `?? null` default stands. Only the two `source: "pm5"`
  // doors set them — every other member is refused by
  // `eligibilityFailure`'s first gate before a payload is ever built, so a
  // zone stored on one of those rows has no reader.
  completedAt?: string | null;
  tz?: string;
```

  In `handleMonitorSave`'s object literal, beside `endedBy`:

```ts
          ...completionStamp(monitorRun),
```

  And the identical line in `app/src/justrow/JustRowLog.tsx`'s `handleSave`, inside the `source: "pm5"` branch, spread from `run` (`const { run } = entry;` is already in scope there).

- [ ] **Step 4b: Make `POST /api/logs` degrade an unrecognised zone instead of refusing the save — TRIAD, and the invariant it exists to hold is:** **a Concept2 field can never cost a rower their row.**

  Before this task no client ever sent `tz`, so `tzError`'s 400 branch has never fired in production. After it, BOTH monitor doors send the field on every save, and that branch is reached by every rowed session. `tzError` checks membership of the SERVER image's `Intl.supportedValuesOf("timeZone")` — a list that legitimately differs from the phone's across an app-store build and a server image (`Europe/Kyiv`/`Europe/Kiev`, `America/Nuuk`/`America/Godthab` are the ordinary tzdata skew) — and **the disagreeing list is ours.** A 400 there turns a completed workout into a failed save over a field that exists only to date a THIRD PARTY's copy of it.

  The route's own sibling already models the right posture: an implausible `completedAt` is `{ok: true, value: null}`, not a refusal. Do the same. In `app/server/routes/data.ts`, add a normalizer beside `tzError`:

```ts
/** The value `tz` is STORED as once it has passed `tzError`. Separate from
 *  the check because `POST /api/logs` degrades rather than refuses (see its
 *  own note at the call site) and still must not store `""` or `undefined`
 *  as if either were a zone. */
export function normalizeTz(value: unknown): string | null {
  return typeof value === "string" && value !== "" ? value : null;
}
```

  and replace the `POST /api/logs` refusal with a degrade (the `tz` key in the `stores.logs.create` call becomes the bare `tz`):

```ts
    const tz = tzError(body.tz) === null ? normalizeTz(body.tz) : null;
```

  **The STRICT check stays where a refusal costs nothing** — the upload route (`server/routes/concept2.ts`), whose 400 `field:"tz"` refuses one Concept2 send and leaves the rower's own record untouched. That asymmetry is the whole point and the code comment says it.

  **This contradicts two committed tests, and they are REPLACED, not deleted:**

  - `app/server/routes/data.test.ts`'s `it.each` block titled `"rejects an invalid tz (%s) with 400, field named"` becomes `"degrades an invalid tz (%s) to null and SAVES the row"`, asserting `201` and reading the stored row back through `stores.logs.get(userA.id, res.body.id)` to confirm `tz` is `null`. Add a fourth row to its table: the EMPTY STRING, which is a string and would survive a `?? null`.
  - `app/server/routes/completedAt.integration.test.ts`'s `"rejects a non-IANA tz with 400, field named — nothing is persisted"` becomes two cases against the real column: `tz: "Not/AZone"` -> 201 with `tz` null, and `tz: ""` -> 201 with `tz` null. Both post an ELIGIBLE pm5 body (`source: "pm5"`, `deviceName`, `endedBy: "finished"`, both work columns) — the file's `logBody()` helper defaults to `source: "manual"`, and a bare `source: "pm5"` override without a `deviceName` 400s for an unrelated reason and reads exactly like this change failing.

  Both rewrites carry a comment naming the invariant, so the next reader does not "restore" the refusal.

- [ ] **Step 5: Add the seam case — one test that starts upstream of the producer.** Append to `app/server/routes/completedAt.integration.test.ts`, which already stands up a migrated container, the real stores and the real route. Its existing cases prove the COLUMN round-trips; this one proves the client's own body reaches `buildC2Payload`'s accurate branch:

```ts
// `formatC2Date` as well as `buildC2Payload` — the last assertion calls it,
// and an earlier draft imported only the second, which does not compile.
import { completionStamp } from "../../src/session/completionStamp.js";
import { buildC2Payload, formatC2Date } from "../concept2/mapping.js";

it("a row posted with the CLIENT's own completion stamp gives Concept2 the workout's end, not the save clock", async () => {
  // RF24: this test starts UPSTREAM of the writer. The body is built with
  // the SAME `completionStamp` the monitor door calls, so deleting `tz`
  // from that function — the deciding production source — makes this go
  // red. A hand-written body here would gate nothing: it would prove the
  // server can store two fields, which `completedAt.integration.test.ts`
  // already proved, and say nothing about whether anything sends them.
  const closed = "2026-09-01T09:10:20.000Z";
  const bearer = await bearerToken();
  const created = await request(app)
    .post("/api/logs")
    .set("Authorization", bearer)
    .send(
      logBody({
        source: "pm5",
        deviceName: "PM5 432331249 Row",
        endedBy: "finished",
        workSeconds: 1234.5,
        workMeters: 5000,
        ...completionStamp({ completedAt: closed }),
      }),
    );
  expect(created.status).toBe(201);
  const detail = await request(app)
    .get(`/api/logs/${String(created.body.id)}`)
    .set("Authorization", bearer);
  const row = detail.body as Record<string, unknown>;
  expect(row.completedAt).not.toBeNull();
  expect(row.tz).not.toBeNull();

  // The oracle is INDEPENDENT of the row: what Concept2 would be told,
  // against what the rower's own monitor said. `effectiveTz` is
  // deliberately a DIFFERENT zone from the posted one, so a payload built
  // off the fallback branch is distinguishable from one built off the
  // paired branch by more than a few hours of drift.
  const payload = buildC2Payload(
    {
      loggedAt: new Date(row.loggedAt as string),
      completedAt: new Date(row.completedAt as string),
      tz: row.tz as string,
      workSeconds: 1234.5,
      workMeters: 5000,
      restSeconds: null,
      restMeters: null,
      machineSummary: null,
      source: "pm5",
      endedBy: "finished",
    },
    "H",
    "Pacific/Kiritimati",
  );
  expect(payload.timezone).toBe(row.tz);
  expect(payload.date).toBe(
    formatC2Date(new Date(closed), row.tz as string),
  );
});
```

  `bearerToken()` and `logBody()` are that file's own helpers, read at this head — it authenticates through `POST /api/auth/native` and builds its body from a `logBody(extra)` that defaults to `source: "manual"`, so the eligible-pm5 fields are passed as the override. `buildC2Payload`'s `SessionLogRow` is an independent structural mirror of the stored row, not the Drizzle type, and its `loggedAt` is `Date` while the JSON body's is a string.

- [ ] **Step 6: Run the gates.** This task touches `app/src/` AND `app/server/` (a test), so both rows of the briefing's gate table apply.

```bash
cd /Users/james/projects/github/jamesawesome/Ergomatic-wt-c2pr2/app
pnpm lint
pnpm typecheck
pnpm format:check
NODE_OPTIONS=--no-experimental-webstorage pnpm exec vitest run --project unit
NODE_OPTIONS=--no-experimental-webstorage pnpm exec vitest run --project client src/session src/justrow
NODE_OPTIONS=--no-experimental-webstorage pnpm exec vitest run --project integration
```

- [ ] **Step 7: Commit, then probe.** Every one of these mutates PRODUCTION source, never a fixture (RF22: mutate the deciding source).

  | # | Mutation | Must fail |
  | --- | --- | --- |
  | M41 | `completionStamp`: drop `tz` from the returned object | the seam test in step 5 — `buildC2Payload` falls to the `loggedAt`/`effectiveTz` branch and `payload.timezone` comes back `"Pacific/Kiritimati"`. **This is the probe that proves the seam test is a seam test:** it bites only because the test builds its body with the production function |
  | M42 | `completionStamp`: return `completedAt: new Date().toISOString()` instead of passing `run.completedAt` through | "passes a missing stamp through as null rather than inventing one" |
  | M43 | `handleMonitorSave`: remove the `...completionStamp(monitorRun)` spread | "the monitor door posts the run's close stamp and this device's zone" |
  | M44 | `JustRowLog.tsx`'s monitor door: remove the same spread | "the Just Row MONITOR door posts the close stamp too" — **and if this one does not bite, the Just Row door has no covering test and the class fix is an instance fix**; say so rather than accepting the green |
  | M45 | the session/timer door: ADD the spread (a mutation that makes the code do MORE, not less) | "the timer door posts NEITHER field" — the probe that proves the no-post rows are asserted rather than merely unmentioned |
  | M46 | `routes/data.ts`: restore the refusal (`badRequest(res, tzErr, "tz"); return;`) in place of the degrade | BOTH rewritten blocks — `data.test.ts`'s four-row `it.each` and the two integration cases. This is the probe for the TRIAD invariant itself: with the refusal back, an unrecognised zone loses the whole save |
  | M47 | `normalizeTz`: drop the `!== ""` clause | the empty-string rows of the same two blocks — `""` is a string, so `typeof` alone stores it and the column holds a value that is not a zone |

- [ ] **Step 8: Record what a walk must see.** This task changes a number on a permanent third-party record, so the design's exit evidence gains one observation, and it is not discharged by any gate in this repo (Task 14, and the walk card that carries exit criterion 2):

  > **The date Concept2 shows for an uploaded row equals the moment the rower STOPPED ROWING, not the moment they tapped Save.** The precondition that makes a NO possible: sit on the summary screen for a measurable interval — three minutes is plenty — before tapping Save, then read the C2 logbook entry's own date against the PM5's end-of-piece time. Without that deliberate gap the two clocks agree to within the noise and the observation proves nothing.

  Step 4b adds no walk observation of its own and should not: no gate in this repo can produce a phone whose tzdata disagrees with the server's, and the degrade is invisible when they agree. What it DOES owe the record is a line in the PR: the route now stores `null` where it used to 400, so a row saved from a device with an unknown zone uploads with `loggedAt`/`effectiveTz` — the same fallback every pre-PR2 row takes — instead of not existing.

---

## Task 7: The send block, its CSS, and its place in the log detail

**Files:**
- Create: `app/src/log/Concept2SendBlock.tsx`
- Modify: `app/src/log/FromTheLog.tsx` (import + one render slot)
- Modify: `app/src/index.css` (append the `.c2-send*` block)
- Test: `app/src/log/Concept2SendBlock.test.tsx`, `app/src/log/FromTheLog.test.tsx` (append the placement and absence cases)

**Interfaces:**
- Consumes: Task 5's model, Task 1's hook, Task 2's `openReadOnlyUrl`.
- Produces: `default Concept2SendBlock({ row }: { row: StoredLog })`.

**Task 6 lands first, and this is the task that makes it urgent.** This is where a rower gains a button that puts a row on Concept2, and a row uploaded before Task 6's producer exists carries the SAVE clock as its date on a record nobody can re-date. Do not build this ahead of that one to unblock a review round.

**Placement, and why it is the only order that satisfies both authorities.** The board: "end of the log-detail scroll, after the 'Logged to <plan>' line". `FromTheLog.tsx:564-569`'s own placement rule for the delete affordance: "Bottom of the view, below the plan footer — last, quiet, away from Edit." Both hold only if the send block sits BETWEEN the plan footer (`:560-562`) and the delete trigger (`:570`). That is the slot.

**RF23 enumeration for this surface.** What already sits on the log-detail screen and could offer or write the same thing: the heroes block (renders numbers, offers nothing), the read-back/Edit affordance (`:530-537`, writes held/pain/thumbs/notes — not this row's totals), the intervals table (read-only), `MachineConfirmedBlock` (`:549`, renders the machine's own work totals and verification code — the EVIDENCE this send is built on, and it offers no action), `TraceChart` (`:558`), the plan footer (`:560`), and Delete session (`:570-607`, destroys the row). **No existing control offers to send, publish, export or link this row anywhere.** The nearest neighbour is `MachineConfirmedBlock`, which states what the machine measured; the send block states what Concept2 did with it. They do not compete, and the board's own RF23 note reached the same conclusion ("send is not Edit"). One thing to watch and to test: **Delete session destroys a row that may already be on Concept2, and the board's unlink copy establishes the house position ("Rows already sent stay on Concept2")** — the delete confirm copy is NOT changed by this PR, and Task 13 records the question rather than answering it silently.

- [ ] **Step 1: Write the failing tests.** `app/src/log/Concept2SendBlock.test.tsx`, in the same `vi.doMock` idiom as Task 4's file. **These are real, runnable tests, not skeletons** — the earlier draft's `it()` bodies were prose comments, which cannot be pasted, cannot fail, and hid from the paste-test the one thing a prescribed test is for.

```tsx
import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LIBRARY_WORKOUTS } from "../../server/seed/library/index.js";
import type { StoredLog } from "./storedSummary";

afterEach(() => {
  vi.resetModules();
  vi.restoreAllMocks();
  vi.doUnmock("../api");
  vi.doUnmock("../adapters/externalBrowser");
});

const LINKED = {
  available: true,
  linked: true,
  c2UserId: 2211,
  c2Username: "jamesawesome",
  needsReauth: false,
  logbookBaseUrl: "https://log-dev.concept2.com",
};

/** RF3: a REAL stored row over a seeded library workout (SEA_FRET), never
 *  a hand-built minimum.
 *
 *  DUPLICATED locally rather than imported from `FromTheLog.test.tsx`,
 *  which is this file's own established precedent for a small fixture and
 *  is NOT merely a style choice: importing a `.test.tsx` MODULE executes
 *  every top-level `describe`/`it` in it a second time, registered inside
 *  THIS file's run. Measured: the two files together collect 140 tests
 *  instead of 77, and this file alone collects 77 instead of 14.
 *  `FromTheLog.test.tsx` says the same thing about its own
 *  `realisticSeries` fixture. */
const SEA_FRET = LIBRARY_WORKOUTS.find((w) => w.title === "Sea Fret")!;

function eligibleRow(over: Partial<StoredLog> = {}): StoredLog {
  return {
    id: "log-1",
    workoutId: null,
    workoutTitle: SEA_FRET.title,
    workoutType: SEA_FRET.type,
    loggedAt: "2026-08-18T18:57:00.000Z",
    held: null,
    pain: null,
    notes: null,
    thumbs: null,
    deviceName: "PM5 432331249",
    source: "pm5",
    c2ResultId: null,
    c2UserId: null,
    steps: [],
    avgSplitSeconds: 130,
    timeSeconds: 1550,
    distanceMeters: 6000,
    planKey: null,
    planIndex: null,
    machineWorkSeconds: null,
    machineWorkMeters: null,
    machineSummary: null,
    restSeconds: null,
    restMeters: null,
    endedBy: "finished",
    workSeconds: 1234.5,
    workMeters: 5000,
    ...over,
  };
}

/** One `api` mock for both endpoints this component talks to: the link
 *  read its hook makes on mount, and the upload it posts on tap. */
function mockApi(opts: {
  link?: unknown;
  linkStatus?: number;
  send?: { status: number; body?: unknown; text?: string };
}) {
  const openReadOnlyUrl = vi.fn();
  const api = vi.fn(async (path: string, _init?: RequestInit) => {
    if (path === "/api/concept2/link") {
      return new Response(JSON.stringify(opts.link ?? LINKED), {
        status: opts.linkStatus ?? 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    const send = opts.send ?? { status: 200, body: { resultId: 339 } };
    return new Response(send.text ?? JSON.stringify(send.body ?? {}), {
      status: send.status,
      headers: {
        "Content-Type":
          send.text === undefined ? "application/json" : "text/html",
      },
    });
  });
  vi.doMock("../api", () => ({ api }));
  vi.doMock("../adapters/externalBrowser", () => ({ openReadOnlyUrl }));
  return { api, openReadOnlyUrl };
}

async function renderBlock(row: StoredLog) {
  vi.resetModules();
  const { default: Concept2SendBlock } = await import("./Concept2SendBlock");
  render(<Concept2SendBlock row={row} />);
}

describe("Concept2SendBlock absence (board: not linked -> nothing on the row)", () => {
  it("renders nothing when no account is linked", async () => {
    const { api } = mockApi({ link: { available: true, linked: false } });
    await renderBlock(eligibleRow());
    // The positive observable is the hook's own request; there is no DOM
    // signal by construction. M29 is what proves this can go red.
    await waitFor(() => expect(api).toHaveBeenCalledWith("/api/concept2/link"));
    expect(screen.queryByText("CONCEPT2")).toBeNull();
  });

  it("renders nothing when the surface is unavailable", async () => {
    const { api } = mockApi({ link: { available: false } });
    await renderBlock(eligibleRow());
    await waitFor(() => expect(api).toHaveBeenCalledWith("/api/concept2/link"));
    expect(screen.queryByText("CONCEPT2")).toBeNull();
  });

  it("renders nothing when the link read fails, and offers no retry here", async () => {
    // Deliberately NOT the card's 1i treatment. The You card is the sole
    // discovery surface and owns the retry; a log row that cannot find out
    // whether an account is linked says nothing rather than growing a
    // second Concept2 error panel on a screen about a rowing session.
    const { api } = mockApi({ linkStatus: 502 });
    await renderBlock(eligibleRow());
    await waitFor(() => expect(api).toHaveBeenCalledWith("/api/concept2/link"));
    expect(screen.queryByText("CONCEPT2")).toBeNull();
  });

  it("renders nothing for every non-qualifying row, with an account linked", async () => {
    // RF3 and the eligibility fence, one row per clause. Mapped, never a
    // conditional expect.
    const shapes: Partial<StoredLog>[] = [
      { source: "timer" },
      { source: "manual" },
      { source: "no-reading" },
      { endedBy: "link-lost" },
      { endedBy: "rower" },
      { endedBy: null },
      { workSeconds: null },
      { workMeters: null },
    ];
    const seen: (string | null)[] = [];
    for (const shape of shapes) {
      const { api } = mockApi({});
      await renderBlock(eligibleRow(shape));
      await waitFor(() =>
        expect(api).toHaveBeenCalledWith("/api/concept2/link"),
      );
      seen.push(screen.queryByText("CONCEPT2")?.textContent ?? null);
      cleanup();
    }
    expect(seen).toStrictEqual(shapes.map(() => null));
  });
});

describe("Concept2SendBlock idle -> sent (board 2a/2b/2c, amendment change 4)", () => {
  it("posts the row with this device's IANA zone, which the route requires on EVERY upload", async () => {
    // routes/concept2.ts:592-601 400s without it, even when the row already
    // carries a stored zone.
    const { api } = mockApi({});
    await renderBlock(eligibleRow({ id: "log-1" }));
    await userEvent.click(
      await screen.findByRole("button", { name: "Send to Concept2" }),
    );
    const post = api.mock.calls.find(
      ([path]) => path === "/api/concept2/results/log-1",
    );
    expect(post).toBeTruthy();
    expect(post?.[1]?.method).toBe("POST");
    const body = JSON.parse(String(post?.[1]?.body)) as { tz?: unknown };
    expect([...Intl.supportedValuesOf("timeZone"), "UTC"]).toContain(body.tz);
  });

  it("renders SENT with the result id and NO timestamp", async () => {
    // Amendment change 4: nothing stores WHEN Concept2 accepted the row, so
    // printing `loggedAt` here would put the save clock under a line naming
    // a different event.
    mockApi({});
    await renderBlock(eligibleRow());
    await userEvent.click(
      await screen.findByRole("button", { name: "Send to Concept2" }),
    );
    expect(await screen.findByText("Accepted by Concept2.")).toBeTruthy();
    expect(screen.getByText(/RESULT 339/)).toBeTruthy();
    expect(screen.queryByText(/Accepted by Concept2 ·/)).toBeNull();
  });

  it("opens the result through the read-only adapter, never by navigating this document", async () => {
    const { openReadOnlyUrl } = mockApi({});
    await renderBlock(eligibleRow());
    await userEvent.click(
      await screen.findByRole("button", { name: "Send to Concept2" }),
    );
    await userEvent.click(
      await screen.findByRole("button", { name: "View on Concept2 →" }),
    );
    // The origin is the SERVER's own (observation 5) — a hardcoded
    // log.concept2.com 404s for the whole sandbox phase.
    expect(openReadOnlyUrl).toHaveBeenCalledWith(
      "https://log-dev.concept2.com/profile/2211/log/339",
    );
  });
});

describe("Concept2SendBlock stored sent state (spec anchor F8)", () => {
  it("renders SENT on mount for a row already carrying the LIVE link's result", async () => {
    mockApi({});
    await renderBlock(eligibleRow({ c2ResultId: 339, c2UserId: 2211 }));
    expect(await screen.findByText("Accepted by Concept2.")).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: "Send to Concept2" }),
    ).toBeNull();
  });

  it("keeps the result id when the server sends no logbook origin, and promises no link", async () => {
    // `url` is null whenever `logbookBaseUrl` is — an older image mid
    // rolling deploy is the named case. Gating the id on the BUTTON's
    // condition made a SENT row render "Accepted by Concept2." and nothing
    // else: no id, no link, and no way for a tester to say which row
    // landed. The sub-line also drops its "OPENS YOUR CONCEPT2 LOGBOOK"
    // half, which would name a destination that is not on screen.
    mockApi({ link: { ...LINKED, logbookBaseUrl: null } });
    await renderBlock(eligibleRow({ c2ResultId: 339, c2UserId: 2211 }));
    expect(await screen.findByText("Accepted by Concept2.")).toBeTruthy();
    expect(screen.getByText("RESULT 339")).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: "View on Concept2 →" }),
    ).toBeNull();
    expect(screen.queryByText(/OPENS YOUR CONCEPT2 LOGBOOK/)).toBeNull();
  });

  it("renders the OFFER for a row accepted by a DIFFERENT account", async () => {
    // The current grant cannot see account 999's row, so "sent" would point
    // at something this rower cannot open (anchor F8's own case).
    mockApi({});
    await renderBlock(eligibleRow({ c2ResultId: 339, c2UserId: 999 }));
    expect(
      await screen.findByRole("button", { name: "Send to Concept2" }),
    ).toBeTruthy();
    expect(screen.queryByText("Accepted by Concept2.")).toBeNull();
  });
});

describe("Concept2SendBlock refusals (amendment 2d/2e/2f)", () => {
  it("renders ALREADY THERE with the colliding result's own link", async () => {
    const { openReadOnlyUrl } = mockApi({
      send: { status: 409, body: { error: "duplicate", c2ResultId: 512 } },
    });
    await renderBlock(eligibleRow());
    await userEvent.click(
      await screen.findByRole("button", { name: "Send to Concept2" }),
    );
    expect(await screen.findByText("ALREADY THERE")).toBeTruthy();
    expect(screen.getByText(/RESULT 512/)).toBeTruthy();
    await userEvent.click(
      screen.getByRole("button", { name: "View on Concept2 →" }),
    );
    expect(openReadOnlyUrl).toHaveBeenCalledWith(
      "https://log-dev.concept2.com/profile/2211/log/512",
    );
  });

  it("renders RECONNECT NEEDED with no retry, because retrying cannot help", async () => {
    mockApi({ send: { status: 409, body: { error: "needs_reauth" } } });
    await renderBlock(eligibleRow());
    await userEvent.click(
      await screen.findByRole("button", { name: "Send to Concept2" }),
    );
    expect(await screen.findByText("RECONNECT NEEDED")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Retry send" })).toBeNull();
  });

  it("sends the rower to their Concept2 account AND offers Send again, because the repair is one visit away (amendment 2i)", async () => {
    // Ruling (i)'s one rower-facing consequence. The class is Concept2's
    // fact and we ask for none, so this is the state where neither producer
    // could supply one — and the ONLY send failure whose repair exists, on a
    // screen that is not ours. `Send again` is not decoration: the native
    // link-out RETURNS to a still-mounted block, and the panel's own
    // sentence tells the rower to come back and send.
    const { openReadOnlyUrl } = mockApi({
      send: {
        status: 422,
        body: { error: "no_weight_class", reason: "no_weight" },
      },
    });
    await renderBlock(eligibleRow());
    await userEvent.click(
      await screen.findByRole("button", { name: "Send to Concept2" }),
    );
    expect(
      await screen.findByText("REASON: SET YOUR WEIGHT ON CONCEPT2"),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Send again" })).toBeTruthy();
    await userEvent.click(
      screen.getByRole("button", { name: "OPEN CONCEPT2 PROFILE" }),
    );
    // The ID-LESS path (observation 28), the server's own origin rather than
    // a hardcoded one (M34d), and the read-only adapter rather than
    // `openExternalUrl` — an account page is a look the rower comes back
    // from.
    expect(openReadOnlyUrl).toHaveBeenCalledWith(
      "https://log-dev.concept2.com/profile",
    );
  });

  it("gives a profile Concept2 cannot classify its OWN sentence, never SET YOUR WEIGHT", async () => {
    // `no_gender`: Concept2's category is two-valued with gendered
    // thresholds, so there is no derivation at all — and that rower's weight
    // is not the broken thing. Telling them to set it sends them after a
    // field that is fine, forever.
    mockApi({
      send: {
        status: 422,
        body: { error: "no_weight_class", reason: "no_gender" },
      },
    });
    await renderBlock(eligibleRow());
    await userEvent.click(
      await screen.findByRole("button", { name: "Send to Concept2" }),
    );
    expect(
      await screen.findByText("REASON: COULDN'T GET A CLASS FROM CONCEPT2"),
    ).toBeTruthy();
    expect(screen.queryByText(/no weight set/)).toBeNull();
    // And it does not name a destination this state's one control cannot
    // reach: the class is PER-RESULT, while the button opens the profile.
    expect(screen.queryByText(/logbook/)).toBeNull();
  });

  it("names the class it sent AND where it came from, on the send that sent it", async () => {
    // Ruling R2. A DERIVED class is a guess about a fact Concept2 lets its
    // owner declare, and Concept2 permits per-result editing — so the guess
    // is visible at the moment it is written, or it can never be corrected.
    mockApi({
      send: {
        status: 200,
        body: {
          resultId: 339,
          weightClass: "H",
          weightClassSource: "profile",
        },
      },
    });
    await renderBlock(eligibleRow());
    await userEvent.click(
      await screen.findByRole("button", { name: "Send to Concept2" }),
    );
    expect(
      await screen.findByText("WEIGHT CLASS H · FROM YOUR CONCEPT2 WEIGHT"),
    ).toBeTruthy();
  });

  it("renders a SENT row read back from the RECORD with no class line, because nothing about the class is stored", async () => {
    // I4, made visible: a row that already carries `c2ResultId` renders SENT
    // on mount with no send in this session, so there is no class to name.
    // The line is ABSENT rather than invented.
    mockApi({});
    await renderBlock(
      eligibleRow({ c2ResultId: 339, c2UserId: 2211 }),
    );
    expect(await screen.findByText("SENT")).toBeTruthy();
    expect(screen.queryByText(/WEIGHT CLASS/)).toBeNull();
  });

  it("still names the repair and still offers Send again when the server sent no logbook origin", async () => {
    // Observation 22 one surface over: with no origin there is no safe URL
    // to build, and a relative `/profile` would open on Ergomatic's own
    // domain. The sentence, the REASON and `Send again` still tell the rower
    // what to do; only the shortcut is missing.
    mockApi({
      link: { ...LINKED, logbookBaseUrl: null },
      send: {
        status: 422,
        body: { error: "no_weight_class", reason: "no_weight" },
      },
    });
    await renderBlock(eligibleRow());
    await userEvent.click(
      await screen.findByRole("button", { name: "Send to Concept2" }),
    );
    expect(
      await screen.findByText("REASON: SET YOUR WEIGHT ON CONCEPT2"),
    ).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: "OPEN CONCEPT2 PROFILE" }),
    ).toBeNull();
    expect(screen.getByRole("button", { name: "Send again" })).toBeTruthy();
  });

  it("renders SEND FAILED with a REASON and a retry", async () => {
    mockApi({ send: { status: 502, body: { error: "c2_error" } } });
    await renderBlock(eligibleRow());
    await userEvent.click(
      await screen.findByRole("button", { name: "Send to Concept2" }),
    );
    expect(
      await screen.findByText("REASON: CONCEPT2 ERROR · 502"),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Retry send" })).toBeTruthy();
  });

  it("disappears rather than offering a retry when the server says unlinked", async () => {
    mockApi({ send: { status: 409, body: { error: "unlinked" } } });
    await renderBlock(eligibleRow());
    await userEvent.click(
      await screen.findByRole("button", { name: "Send to Concept2" }),
    );
    await waitFor(() => expect(screen.queryByText("CONCEPT2")).toBeNull());
  });

  it("SAYS SO when the server refuses the row as ineligible, instead of vanishing on tap", async () => {
    // The client mirror of `eligibilityFailure` said yes and the server's
    // own copy said no about the SAME row. Drawing that as the block
    // disappearing shows the rower a control that was there a second ago
    // and now is not, and reports the divergence to nobody.
    mockApi({
      send: {
        status: 422,
        body: { error: "not_eligible", reason: "no_work_totals" },
      },
    });
    await renderBlock(eligibleRow());
    await userEvent.click(
      await screen.findByRole("button", { name: "Send to Concept2" }),
    );
    expect(
      await screen.findByText(
        "REASON: CONCEPT2 WON'T TAKE THIS ROW · NO WORK TOTALS",
      ),
    ).toBeTruthy();
  });

  it("survives a non-JSON error body without throwing", async () => {
    // The rolling-deploy case `adapters/linkFlow.ts:124-127` names: an old
    // image answering with HTML.
    mockApi({ send: { status: 502, text: "<html>502 Bad Gateway</html>" } });
    await renderBlock(eligibleRow());
    await userEvent.click(
      await screen.findByRole("button", { name: "Send to Concept2" }),
    );
    expect(
      await screen.findByText("REASON: CONCEPT2 ERROR · 502"),
    ).toBeTruthy();
  });
});
```

  **`storedRow` is DUPLICATED into this file, not imported from `FromTheLog.test.tsx`, and that is a correctness fix rather than a style preference.** Exporting it and importing the `.test.tsx` MODULE executes every top-level `describe`/`it` in `FromTheLog.test.tsx` a SECOND time, registered inside this file's own run: measured, the two files together collect 140 tests instead of 77, and this file alone collects 77 instead of 14. `FromTheLog.test.tsx` already states the same house convention on its own `realisticSeries` fixture ("duplicated per this file's own established precedent of NOT sharing small fixtures across test files"). The local copy pulls `SEA_FRET` from `LIBRARY_WORKOUTS` the same way, so it is still a real library workout (RF3) and not a hand-built minimum.

  `cleanup` DOES need importing from `@testing-library/react` — the non-qualifying loop calls it between renders.

  **What "renders SENT on mount" proves, and what it does not.** It hands the component a row that already carries `c2ResultId`/`c2UserId` and asserts the RENDER. It says nothing about whether anything ever writes those columns, or whether a written row reads back that way — the mocked `api` sits downstream of every producer in the system. That is not a weakness to fix here; it is the division of labour RF24 asks for, and **Task 10 owns the seam.** The same caution applies to the `log-concept2-sent.png` capture, which injects the two fields with `page.route` on `**/api/logs/*` rather than seeding the column: in a C2-dark stack the only writer of `c2_result_id` is a route that 403s, so a "seed the column and reload" capture cannot exist at all (Task 11). State both limits in the task report rather than letting a green suite and a good-looking screenshot read as end-to-end evidence.

  And `app/src/log/FromTheLog.test.tsx` takes TWO changes, one of them to a test that already exists.

  **1. Fix the call-count regression IN PLACE.** This file's `"shows an error message with a Retry"` test ends `expect(apiMock).toHaveBeenCalledTimes(2)`, and the new component's own `GET /api/concept2/link` on every ready-state mount makes it three. Scope the assertion to the endpoint it is about; do NOT loosen it to a range, which would give up the thing it exists for (that Retry makes exactly ONE more attempt at the log, not two):

```tsx
    // SCOPED to the endpoint this test is about, never a bare total.
    // Wave E PR2 mounts `Concept2SendBlock` on the ready state, and its
    // hook reads `GET /api/concept2/link` on every mount — a third call
    // through the same `api` mock, which a bare `toHaveBeenCalledTimes(2)`
    // reads as a regression.
    const logCalls = apiMock.mock.calls.filter(([path]) =>
      String(path).startsWith("/api/logs/log-1"),
    );
    expect(logCalls).toHaveLength(2);
```

  (An earlier draft prescribed this fix as a SECOND standalone `it()`, which is unexecutable: its body references an `apiMock` that exists only inside the existing test's scope. The prose was right about what to do; the block was in the wrong place.)

  **2. Append the placement test**, in its own describe. The fixture MUST carry a plan: `view.planFooter` is conditional, so a planless row has no `Logged to` line and the test throws before it can measure order.

```tsx
describe("Concept2 send block placement (Wave E PR2, Surface 2)", () => {
  const LINKED = {
    available: true,
    linked: true,
    c2UserId: 2211,
    c2Username: "jamesawesome",
    needsReauth: false,
    logbookBaseUrl: "https://log-dev.concept2.com",
  };

  it("places the Concept2 block between the plan footer and Delete session", async () => {
    // ORDER, not presence: presence alone passes with the block anywhere
    // on the screen, which is what M31 exists to prove.
    mockApi((path) =>
      path === "/api/concept2/link"
        ? new Response(JSON.stringify(LINKED), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          })
        : new Response(
            JSON.stringify(
              storedRow({
                planKey: "sprint",
                planIndex: 11,
                source: "pm5",
                endedBy: "finished",
                workSeconds: 1234.5,
                workMeters: 5000,
              }),
            ),
            { status: 200 },
          ),
    );
    await renderFromTheLog();
    const footer = await screen.findByText(/^Logged to/);
    const block = await screen.findByRole("region", { name: "CONCEPT2" });
    const del = screen.getByRole("button", { name: /Delete session/ });
    const before = Node.DOCUMENT_POSITION_FOLLOWING;
    expect(footer.compareDocumentPosition(block) & before).toBeTruthy();
    expect(block.compareDocumentPosition(del) & before).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run, confirm failure. Step 3: create the component.**

```tsx
import { useState } from "react";
import { api } from "../api";
import { openReadOnlyUrl } from "../adapters/externalBrowser";
import { useConcept2Link } from "../api/useConcept2Link";
import {
  c2ResultUrl,
  isSendable,
  readSendResponse,
  sentResultId,
  type SendState,
} from "./concept2Send";
import type { StoredLog } from "./storedSummary";

/**
 * Wave E PR2, Surface 2 (board 2a-2e, amended 2026-09-03: 2c loses its
 * timestamp, 2d gains the specific result link, 2e gains a REASON, 2f is
 * new). Renders ONLY when an account is linked AND the row qualifies;
 * otherwise absent entirely, with no pointer and no disabled control —
 * the You card is the sole discovery surface (board's approved amendment).
 *
 * Reads the fetched `StoredLog` and the live link, and nothing else. It is
 * not part of `buildStoredSummary`'s view model, for the same reason
 * `MachineConfirmedBlock` above it is not (`FromTheLog.tsx:60-64`): its
 * inputs are stored facts about this row's relationship to a THIRD PARTY,
 * not derived readings of the session.
 */
export default function Concept2SendBlock({ row }: { row: StoredLog }) {
  const { link, failed, reload } = useConcept2Link();
  const [send, setSend] = useState<SendState>({ kind: "idle" });

  async function post(): Promise<void> {
    setSend({ kind: "sending" });
    try {
      const res = await api(`/api/concept2/results/${row.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Required on EVERY upload, even when the row already carries a
        // stored zone (`routes/concept2.ts:592-601`). The route persists
        // it on first use so every later retry renders one stable C2 date
        // — the dedup-stability property C2's second-granular key needs.
        body: JSON.stringify({
          tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
        }),
      });
      let body: unknown = null;
      try {
        body = await (res.json() as Promise<unknown>);
      } catch {
        // Not JSON at all: an old image's HTML during a rolling deploy is
        // the named case (`adapters/linkFlow.ts:124-127`).
        body = null;
      }
      const next = readSendResponse(res.status, body);
      setSend(next);
      // The preconditions this block renders on stopped holding. Re-read
      // rather than keeping a stale link on screen.
      if (next.kind === "gone" || next.kind === "reauth") await reload();
    } catch {
      setSend({ kind: "failed", reason: "NO CONNECTION" });
    }
  }

  // `failed !== null` since Task 1's hook reports WHY a read failed rather
  // than a bare boolean. The block stays silent either way: the You card is
  // the sole discovery surface and owns the read-failed treatment
  // (amendment 1i), and a second Concept2 error panel on a screen about a
  // rowing session would be noise the rower cannot act on from here.
  if (failed !== null || link === null || !link.available || !link.linked) {
    return null;
  }
  if (!isSendable(row)) return null;

  // Invariant I3: re-derived every render from the row and the LIVE link,
  // never cached across a link change.
  const stored = sentResultId(row, link);
  const resultId =
    send.kind === "sent" || send.kind === "duplicate" ? send.resultId : stored;
  const state: SendState["kind"] =
    send.kind === "duplicate"
      ? "duplicate"
      : resultId !== null
        ? "sent"
        : send.kind;

  if (state === "gone") return null;

  const url =
    resultId !== null && link.c2UserId !== null && link.logbookBaseUrl !== null
      ? c2ResultUrl(link.logbookBaseUrl, link.c2UserId, resultId)
      : null;

  // Amendment 2i's link-out. Same origin rule as `url` above and for the
  // same reason (observation 22): an empty origin would build `/profile`, a
  // RELATIVE path that opens on Ergomatic's own domain. NO `c2UserId` — the
  // id-bearing path was measured to render a PUBLIC read-only card with no
  // weight and no form, while the id-less one 302s to login and lands the
  // rower in their own account (observation 28).
  const profileUrl =
    link.logbookBaseUrl !== null ? c2ProfileUrl(link.logbookBaseUrl) : null;

  const status =
    state === "sent"
      ? "SENT"
      : state === "duplicate"
        ? "ALREADY THERE"
        : state === "reauth"
          ? "RECONNECT NEEDED"
          : state === "noWeight"
            ? "NO WEIGHT CLASS"
            : state === "failed"
              ? "SEND FAILED"
              : state === "sending"
                ? "SENDING"
                : "NOT SENT";

  return (
    <section className="c2-send" aria-labelledby="c2-send-label">
      <div className="c2-send-head">
        <h2 className="c2-send-label" id="c2-send-label">
          CONCEPT2
        </h2>
        <span
          className={`c2-send-status${state === "idle" ? "" : " c2-send-status-on"}`}
        >
          {status}
        </span>
      </div>

      {(state === "idle" || state === "sending") && (
        <>
          <button
            type="button"
            className="c2-send-action"
            disabled={state === "sending"}
            onClick={() => void post()}
          >
            {state === "sending" ? "Sending to Concept2 …" : "Send to Concept2"}
          </button>
          <p className="c2-send-helper">
            Sends this row&apos;s work time and meters to your Concept2 logbook.
          </p>
        </>
      )}

      {/* Amendment change 4: no timestamp. Nothing stores when Concept2
          accepted the row (`server/db/schema.ts` carries `c2_result_id` and
          `c2_user_id` and no acceptance clock), and printing `loggedAt`
          here would put the save time under a line naming a different
          event. The result id below is the durable evidence. */}
      {state === "sent" && (
        <p className="c2-send-line">Accepted by Concept2.</p>
      )}

      {/* Amendment change 5: this state is SESSION-TRANSIENT. The route
          records the colliding id before answering (`routes/concept2.ts:
          890-898`, RF25), so the next mount of this screen reads it off
          the row and renders SENT above instead. */}
      {state === "duplicate" && (
        <p className="c2-send-line">
          Concept2 already has this row: same date, time and distance. Nothing
          changed.
        </p>
      )}

      {/* A BUTTON, not an anchor: inside the Capacitor WebView a plain
          `<a href>` drives the WebView itself to concept2.com with no way
          back (`adapters/externalBrowser.ts`'s own note on
          `openReadOnlyUrl`). 44px hit row. */}
      {url !== null && (
        <button
          type="button"
          className="c2-send-linkout"
          onClick={() => void openReadOnlyUrl(url)}
        >
          View on Concept2 →
        </button>
      )}

      {/* The id renders on `resultId` ALONE, never on the link-out's
          condition. `url` is null whenever `logbookBaseUrl` is — an older
          server mid rolling deploy, or an origin that arrived empty — and
          gating the id on the button meant a SENT row rendering
          "Accepted by Concept2." and nothing else: no id, no link, no way
          for a tester to say WHICH row landed. Amendment change 4 removed
          the timestamp on the grounds that "the result id below is the
          durable evidence", so this is that evidence disappearing.
          With no link-out the sub-line drops "OPENS YOUR CONCEPT2
          LOGBOOK", which would promise a destination that is not on
          screen. */}
      {resultId !== null && (
        <p className="c2-send-foot">
          {url !== null ? (
            <>RESULT {resultId} &middot; OPENS YOUR CONCEPT2 LOGBOOK</>
          ) : (
            <>RESULT {resultId}</>
          )}
        </p>
      )}

      {/* Ruling R2. Concept2's own help makes the weight class the rower's
          DECLARATION, and the send path reads that declaration first — but
          when there is none to read we DERIVE one from their profile, and a
          derived class is a guess about a fact its owner is entitled to set.
          A guess nobody is shown can never be corrected, and Concept2 permits
          per-result editing, so the class and its producer are named at the
          moment the row lands.

          Session-scoped by construction, not by oversight: nothing about the
          class is stored (I4), so this line renders on the response of the
          send that just happened and is absent on every later mount, where
          2c renders exactly as it did before. `weightClassLine` returns null
          for every other state, including a SENT re-derived from the row. */}
      {weightClassLine(send) !== null && (
        <p className="c2-send-foot">{weightClassLine(send)}</p>
      )}

      {state === "reauth" && (
        <p className="c2-send-line">
          Concept2 stopped accepting this link. Reconnect on the You tab, then
          send this row again.
        </p>
      )}

      {/* Amendment 2i, ruling (i). The failed-state chrome of 2f/2g, plus a
          link-out that goes to Concept2. It keeps `Send again` — and the
          earlier revision's reason for removing it was wrong on its own
          terms: the panel's own sentence tells the rower to fix something
          on Concept2 and come back, so a state that offers no way to come
          back tells them to do something it cannot let them do. The 1g
          parallel does not hold either: nothing a rower can do fixes a
          stale app build, while EVERYTHING about this state is fixable in
          one visit, which is why it has a link-out at all. On native the
          link-out is `SFSafariViewController`, which RETURNS to the app
          (observation 10) onto a still-mounted block — so `Send again` is
          the affordance the return lands on.

          The line is the SERVER's own reason rendered in our words: four
          tokens, and `no_gender` deliberately does not read "set your
          weight", because that rower's weight is not the broken thing.

          The URL is built from the LIVE link (invariant I3) and renders
          only when the origin is readable; an empty one would build a
          RELATIVE path opening on Ergomatic's own domain (observation 22).
          With no URL the rower still gets the sentence, the REASON and
          `Send again` — only the shortcut is missing. */}
      {state === "noWeight" && send.kind === "noWeight" && (
        <>
          <p className="c2-send-line">{send.line}</p>
          <p className="c2-send-reason">REASON: {send.reason}</p>
          {profileUrl !== null && (
            <button
              type="button"
              className="c2-send-linkout"
              onClick={() => void openReadOnlyUrl(profileUrl)}
            >
              OPEN CONCEPT2 PROFILE
            </button>
          )}
          <button
            type="button"
            className="c2-send-action"
            onClick={() => void post()}
          >
            Send again
          </button>
        </>
      )}

      {state === "failed" && send.kind === "failed" && (
        <>
          <p className="c2-send-line">
            The send didn&apos;t reach Concept2. This row is unchanged.
          </p>
          <p className="c2-send-reason">REASON: {send.reason}</p>
          <button
            type="button"
            className="c2-send-action"
            onClick={() => void post()}
          >
            Retry send
          </button>
        </>
      )}
    </section>
  );
}
```

- [ ] **Step 4: Mount it in `FromTheLog.tsx`.** Add the import beside the others, then insert between the plan footer and the delete affordance — i.e. immediately after the `{view.planFooter !== undefined && (…)}` block and immediately before the `{!deleteStaged ? (` block:

```tsx
          {/* Wave E PR2, Surface 2. Board: "end of the log-detail scroll,
              after the 'Logged to <plan>' line"; the delete affordance's
              own rule a few lines below is "bottom of the view, below the
              plan footer" — both hold only in this order, so the send
              block sits between them. Reads `row` directly, never the view
              model, same constraint `MachineConfirmedBlock` carries. */}
          <Concept2SendBlock row={row} />
```

- [ ] **Step 5: Append the CSS** — `.c2-send*`, mirroring `.c2-card*`'s values with the board's 2-block padding (`14px 16px`, `10px` gap). Full rule set, tokens only:

```css
/* Wave E PR2, Surface 2 (board 2a-2e + Gate 0 amendment 2f). Same house
   card as `.c2-card`, the board's own 14px/16px padding and 10px gap.
   Contrast, computed (RF6): --ink on --surface 17.11:1 (labels, statuses),
   --ink-2 on --surface 10.81:1 (send lines), --ink-3 on --surface 7.43:1
   (helper, REASON), --ink-4 on --surface 5.29:1 (footnote, idle status),
   --accent on --surface 5.94:1 (link-out). All clear 4.5:1.

   The link-out's accent is accent's FIFTH job, outside the four
   docs/design/handoffs/2026-08-03-ui-fix/DESIGN.md names. Recorded as a
   DEVIATIONS row rather than given its own token (Gate 0 amendment §5,
   James's ruling): the four-meaning rule exists to stop accent meaning
   "selected" or a fifth workout type, and one link-out on one screen is a
   different exception. */
.c2-send {
  background: var(--surface);
  border: 1px solid var(--rule);
  border-radius: var(--radius);
  padding: 14px 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.c2-send-head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 12px;
}

.c2-send-label {
  margin: 0;
  font-family: var(--font-mono);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.16em;
  color: var(--ink);
}

.c2-send-status {
  font-family: var(--font-mono);
  font-size: 11px;
  letter-spacing: 0.12em;
  color: var(--ink-4);
  white-space: nowrap;
}

.c2-send-status-on {
  color: var(--ink);
  font-weight: 600;
}

.c2-send-line {
  margin: 0;
  font-size: 13px;
  color: var(--ink-2);
}

.c2-send-helper {
  margin: 0;
  font-size: 12px;
  color: var(--ink-3);
}

.c2-send-reason {
  margin: 0;
  font-family: var(--font-mono);
  font-size: 11px;
  letter-spacing: 0.08em;
  color: var(--ink-3);
}

.c2-send-foot {
  margin: 0;
  font-family: var(--font-mono);
  font-size: 11px;
  letter-spacing: 0.08em;
  color: var(--ink-4);
}

.c2-send-action {
  min-height: 48px;
  background: transparent;
  border: 1px solid var(--ink);
  border-radius: 0;
  color: var(--ink);
  font-family: var(--font-sans);
  font-size: 15px;
  font-weight: 600;
}

.c2-send-action:disabled {
  border-color: var(--rule-3);
  color: var(--ink-3);
}

/* Board 2c: "44px hit row". A BUTTON styled as a link, not an anchor —
   see the component for why. Left-aligned, full width, so the whole row
   is the target rather than just the words. */
.c2-send-linkout {
  min-height: var(--tap);
  display: flex;
  align-items: center;
  background: transparent;
  border: 0;
  padding: 0;
  color: var(--accent);
  font-family: var(--font-sans);
  font-size: 14px;
  font-weight: 600;
  text-align: left;
}
```

- [ ] **Step 6: Run the log client suite and the scoped gates.** Then commit and probe.

  | # | Mutation | Must fail |
  | --- | --- | --- |
  | M28 | drop `if (!isSendable(row)) return null;` | "renders nothing for every non-qualifying row" |
  | M29 | drop `!link.linked` from the early return | "renders nothing when no account is linked" |
  | M30 | send the POST with no body | "posts the row with this device's IANA zone" |
  | M31 | render the block after the delete trigger in `FromTheLog.tsx` | "places the Concept2 block between the plan footer and Delete session" — this is the probe that proves the placement test asserts ORDER and not mere presence (RF21's "an assertion measuring a DIFFERENT element than the one the fix changed") |
  | M32 | `openReadOnlyUrl` swapped for `openExternalUrl` | "opens the result through the read-only adapter" |
  | M33 | render `Accepted by Concept2 · {row.loggedAt}` | "renders SENT with the result id and NO timestamp" |
  | M34 | drop the `send.kind === "duplicate"` arm from `state`, so a 409 renders as SENT | "renders ALREADY THERE with the colliding result's own link" |
  | M34c | drop the `Send again` button from the `noWeight` block | the 2i test in step 1 — the panel's own sentence tells the rower to fix it on Concept2 and send again, and without the button there is no way to do the second half |
  | M34d | build `profileUrl` from a hardcoded `"https://log.concept2.com"` instead of `link.logbookBaseUrl` | the 2i test's URL assertion. Same defect class as M11 one surface over: a production origin 404s for the entire sandbox phase, which is the phase every walk happens in |
  | M34e | render `send.reason` where `send.line` belongs (one string for both slots) | "gives a profile Concept2 cannot classify its OWN sentence" — the panel loses the sentence that says what to do |
  | M34f | render the class line on `resultId !== null` instead of on `weightClassLine(send)` | "renders a SENT row read back from the RECORD with no class line" — a remounted row would print a class nothing stored |
  | M34b | gate the result-id line on the link-out's condition again (`{resultId !== null && url !== null && (`) | "keeps the result id when the server sends no logbook origin, and promises no link". `url` is null whenever `logbookBaseUrl` is — an older image mid rolling deploy, or an origin that arrived empty — and with the id gated on the button a SENT row rendered `Accepted by Concept2.` and nothing else: no id, no link, no way for a tester to say WHICH row landed. Amendment change 4 dropped the timestamp on the grounds that "the result id below is the durable evidence", so this is that evidence disappearing. RUN: red on exactly that test |

---

## Task 8: Mount the card on You

**Files:**
- Modify: `app/src/You.tsx`
- Test: `app/src/You.test.tsx` (append)

**Interfaces:**
- Consumes: `Concept2Card` (Task 4).

**Placement:** after `ResetBaselineSetup` (`You.tsx:89`) and before the dev-only probe (`:97-101`), which itself stays above the DIAGNOSTICS row (`:102-115`, whose comment requires it stay the LAST child). So the order becomes: BASELINES · RetestShortcut · ResetBaselineSetup · **Concept2Card** · [dev probe] · DIAGNOSTICS.

- [ ] **Step 1: Change the file's harness FIRST, then write the tests.** `You.test.tsx` already neutralises the dev probe wholesale (`vi.mock("./monitor/Concept2LinkProbe", …)`); do NOT neutralise the product card the same way — the point is that it renders.

  **There is no `api` mock in this file to "add the endpoint to".** Read at this head: `renderYou(user = {...})` takes a USER object, not an options bag; the file mocks only the probe; and one test stubs global `fetch` for its own purposes. Once `Concept2Card` mounts, EVERY test in the file runs `api("/api/concept2/link")` through the real `src/api.ts`, the rejection lands after the assertions, `setFailed` fires outside `act()`, and the read-failed panel — which renders the text `CONCEPT2` — appears in tests that never asked for it. **Task 8 owns a harness change for the whole file**, and the whole file is re-run, not just the three new cases.

```tsx
// Wave E PR2: You now mounts the PRODUCT Concept2 card, whose hook reads
// `GET /api/concept2/link` on every mount. That read has to be answered for
// the WHOLE FILE, not only in the new cases.
//
// `./api` is mocked rather than `./api/useConcept2Link`, which would test
// the mock. `src/api.ts` exports exactly one symbol, so this factory is
// total. The card's DEFAULT answer is `{available:false}` — the state every
// deployment is in today — so no existing test's screen changes; a case
// that wants a card sets `c2Link.body` first.
//
// EVERY OTHER PATH IS DELEGATED TO GLOBAL `fetch`, which is what the real
// `api()` does. That is not tidiness: this file's baseline-reset test
// stubs `fetch` and counts `/api/baselines` GETs through it, so a factory
// that answered everything itself would silently break it (measured: the
// editor never loads and its `2k split` field is never found).
//
// `vi.hoisted` because `vi.mock`'s factory is hoisted above ordinary
// declarations: a plain `const` referenced inside it throws "Cannot access
// before initialization".
const c2Link = vi.hoisted(() => ({ body: { available: false } as unknown }));

vi.mock("./api", () => ({
  api: vi.fn(async (path: string, init?: RequestInit) =>
    path === "/api/concept2/link"
      ? new Response(JSON.stringify(c2Link.body), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      : fetch(path, init),
  ),
}));

beforeEach(() => {
  c2Link.body = { available: false };
  vi.mocked(api).mockClear();
});
```

  (`api` is imported at the top of the file for `vi.mocked(api)`; `waitFor` and `beforeEach` join the existing imports.)

  Then the three cases:

```tsx
describe("You: the Concept2 card", () => {
  const user = { id: "u1", email: "a@x.com", name: "Ada Rower" };

  it("renders the Concept2 card between the baseline reset and the diagnostics row", async () => {
    // DOCUMENT ORDER, not presence: the DIAGNOSTICS row's own comment
    // requires it stay the LAST child, and presence alone would pass with
    // the card sitting below it.
    c2Link.body = { available: true, linked: false };
    renderYou(user);
    const card = await screen.findByRole("region", { name: "CONCEPT2" });
    const reset = screen.getByRole("button", { name: /Reset baseline setup/i });
    const diagnostics = screen.getByRole("link", { name: /DIAGNOSTICS/ });
    const following = Node.DOCUMENT_POSITION_FOLLOWING;
    expect(reset.compareDocumentPosition(card) & following).toBeTruthy();
    expect(card.compareDocumentPosition(diagnostics) & following).toBeTruthy();
  });

  it("passes the signed-in rower's own email to the card, so the identity line names both principals", async () => {
    // Gate 0 amendment 1c. The card cannot fetch this: `Me` is You's prop,
    // and the whole point of the line is that it names BOTH principals.
    c2Link.body = {
      available: true,
      linked: true,
      c2UserId: 2211,
      c2Username: "jamesawesome",
      needsReauth: false,
      logbookBaseUrl: "https://log-dev.concept2.com",
    };
    renderYou({ id: "u1", email: "james@jamestheaweso.me", name: "James A" });
    expect(
      await screen.findByText(
        "Concept2 jamesawesome · Ergomatic james@jamestheaweso.me",
      ),
    ).toBeTruthy();
  });

  it("renders no Concept2 card at all when the server reports the surface unavailable", async () => {
    // The whole-screen half of Concept2Card's own unit case: You itself
    // must not reserve space, add a heading, or draw a hairline for an
    // absent card. Awaiting POSITIVE observables first — a section of You
    // that is always there, and the card's own mount read — so the absence
    // is asserted against a settled screen rather than one that has not
    // rendered yet.
    renderYou(user);
    expect(await screen.findByText("BASELINES")).toBeTruthy();
    await waitFor(() =>
      expect(vi.mocked(api)).toHaveBeenCalledWith("/api/concept2/link"),
    );
    expect(screen.queryByRole("region", { name: "CONCEPT2" })).toBeNull();
    expect(screen.queryByText("CONNECT TO CONCEPT2")).toBeNull();
  });
});
```

  Two selectors verified rather than assumed: `ResetBaselineSetup` does expose a button named `Reset baseline setup`, and the DIAGNOSTICS row is a `<Link>` (role `link`, `href="/you/diagnostics"`) — both read at this head, both places agents have lost time here before (the briefing's aria-label note).

- [ ] **Step 2: Run, confirm failure, then edit `You.tsx`.** Add the import and, after the `<ResetBaselineSetup …/>` element:

```tsx
      {/* Wave E PR2, Surface 1 (board + Gate 0 amendment 2026-09-03). The
          rower's only door to the Concept2 link. Renders NOTHING unless
          the server reports `available: true` — a capability gate, not a
          cosmetic hide (spec §Architecture 8), so You looks exactly as it
          does today on any deployment with `C2_LINK_ENABLED` unset, which
          is every deployment until the flag flip.
          ABOVE the dev-only probe and the DIAGNOSTICS row, both of which
          keep their own positions (the probe is a walk instrument, not a
          product surface; the row's own comment requires it stay last). */}
      <Concept2Card email={user.email} />
```

- [ ] **Step 3: Run `You.test.tsx` plus the whole client project. Step 4: commit and probe.**

  | # | Mutation | Must fail |
  | --- | --- | --- |
  | M35 | move `<Concept2Card>` below the DIAGNOSTICS `<Link>` | "renders the Concept2 card between the baseline reset and the diagnostics row" |
  | M36 | pass `email={user.name}` | "passes the signed-in rower's own email to the card" |

---

## Task 9: `dist:grep` and the production-bundle claim

**Files:**
- Modify: none expected. **Read** `app/scripts/dist-grep.sh:89-127`.
- Test: the gate itself.

**Why this is its own task, not a step:** RF12 — "any claim of the form 'X is not in the production bundle' is settled by `pnpm build` plus a string-literal grep over `dist/`, in both directions." PR2 adds real user-facing Concept2 strings to the shipped bundle for the first time, and the existing eighth needle (`"C2 link probe (dev harness)"`) must still come back clean.

- [ ] **Step 1: Build and run the gate.**

```bash
cd /Users/james/projects/github/jamesawesome/Ergomatic-wt-c2pr2/app
pnpm build
pnpm dist:grep; echo "expected 0: $?"
```
Expected: PASS, all eight needles absent.

- [ ] **Step 2: Prove the probe needle can still go red** (RF21: a green gate nobody proved can fail is decoration). Rebuild with the flag on, confirm the gate FAILS on the eighth needle, then rebuild without it and confirm it passes again:

```bash
cd /Users/james/projects/github/jamesawesome/Ergomatic-wt-c2pr2/app
VITE_ENABLE_C2_LINK_PROBE=1 pnpm build
pnpm dist:grep; echo "expected NON-ZERO: $?"
pnpm build
pnpm dist:grep; echo "expected 0: $?"
```

- [ ] **Step 3: Prove the PRODUCT card IS present**, in the other direction — the claim being made is that the card ships, hidden by the server flag rather than absent from the bundle (spec §Architecture 8: "Client code ships in the bundle either way — hidden, not absent; nothing in it is secret"):

```bash
cd /Users/james/projects/github/jamesawesome/Ergomatic-wt-c2pr2/app
grep -rl "CONNECT TO CONCEPT2" dist/client; echo "expected 0 (the literal IS in the bundle): $?"
```

- [ ] **Step 4: Record all three results in the task report.** No needle is added: nothing this PR ships is dev-only.

---

## Task 10: The RF24 seam test — one gate that starts upstream of the producer

**Files:**
- Create: `app/server/routes/concept2Send.integration.test.ts`
- Modify: `app/tsconfig.server.json` and `app/tsconfig.server.build.json` (step 0 — a config change this file's import chain forces)

**Interfaces:**
- Consumes: the real router, the real Postgres, the real logs store, and the CLIENT's own `isSendable`/`sentResultId` (Task 5).

**Why.** RF24, verbatim: "The check is not 'are the gates green' — it is 'which test STARTS upstream of the producer?' For any A-writes-then-B-reads seam, one test must begin before A and assert after B." The seam here is `POST /api/concept2/results/:logId` writes `c2_result_id`/`c2_user_id` → the log detail screen reads them off `GET /api/logs/:id` and renders SENT. Every other gate in this PR enters the pipe below the break: `Concept2SendBlock.test.tsx` mocks the API, `concept2Send.test.ts` hands the predicate a hand-built row, `concept2.test.ts` stops at the route's own response. **Nothing mounts the reader after the producer writes** — which is exactly the shape that let `MACHINE CONFIRMED · WORK ONLY` reach zero of sixteen production rows through three green gates.

The cross-tree import has a type-only precedent — `app/server/routes/partial.integration.test.ts` does `import type { RecentLog } from "../../src/api/useRecentLogs.js"`, with its own comment explaining the exception to "server code never imports from the client tree". **But a `import type` is ERASED, and this file's reaches are RUNTIME ones**, so the precedent does not settle whether the specifier resolves. That was measured rather than assumed.

**Precondition, VERIFIED (2026-09-03, worktree `/Users/james/projects/github/jamesawesome/Ergomatic-wt-c2pr2`, head `df20687c`, Docker up).** A scratch file at `app/server/routes/__c2pr2_resolver_probe.integration.test.ts` importing `{ PARTIAL_CLOSE_REASONS, historyChipWord }` from `"../../src/log/storedSummary.js"` and reading both at runtime:

```bash
cd /Users/james/projects/github/jamesawesome/Ergomatic-wt-c2pr2/app
NODE_OPTIONS=--no-experimental-webstorage pnpm exec vitest run --project integration server/routes/__c2pr2_resolver_probe.integration.test.ts
```

Output: `Test Files  1 passed (1)` / `Tests  1 passed (1)`. **The `.js` specifier DOES resolve to `src/*.ts` at runtime under the `integration` project, from `server/routes/`.** The scratch file was deleted afterwards and `git status --short` came back empty. No redesign is needed and Task 6/10 keep their imports as written.

**One trap that cost a first attempt, worth stating because it looks exactly like a resolver failure:** the specifier is relative to the FILE'S OWN DIRECTORY. From `app/server/routes/x.ts`, `../../src/…` is `app/src/…`; from `app/server/x.ts` the same string is `<repo>/src/…`, which does not exist and reports `Cannot find module`. Both of this plan's cross-tree files live in `server/routes/`, which is why `../../` is right for them — do not copy the specifier one directory up without recounting.

- [ ] **Step 0: The config change this import chain forces — and the narrower one that keeps the shipped server honest.** The precedent file solved a type-only reach across the boundary by adding `src/vite-env.d.ts` to `tsconfig.server.json`'s `include` (its own comment says why). This file's chain goes further: `src/log/concept2Send.js` → `src/api/useConcept2Link.js` → `src/adapters/linkFlow.js` → `src/adapters/externalBrowser.js` → `src/adapters/webNavigate.js`, which uses `window`. `tsconfig.server.json` has `"lib": ["ES2023"]`, so `tsc -p tsconfig.server.json --noEmit` fails on it.

  **The choice made, stated rather than implied.** Two options were on the table: break the type chain (move `Concept2Link` into a runtime-free module so the adapter graph is not dragged in), or widen the type-check config's `lib`. **We widen the lib**, because breaking the chain means splitting `useConcept2Link.ts` into a shape module and a hook module purely to satisfy a compiler flag, which buys nothing a reader would thank us for. **Re-verify this before implementing:** the earlier reasoning turned on `WeightClass` being imported from `adapters/linkFlow`, and ruling (i) deleted that import (Task 1). If the chain is now broken anyway, this whole step may be unnecessary — run the server build-config pin against the real tree and report which it is, rather than applying a widening the code no longer needs.

  ```jsonc
  // app/tsconfig.server.json — the TYPE-CHECK config, which includes tests
  "lib": ["ES2023", "DOM"],
  ```

  **And then close the hole that opens.** `tsconfig.server.build.json` merely `extends` this file, so it would inherit `DOM` and the SHIPPED server would typecheck a stray `window` or `document` without complaint. That is a real loosening, small but permanent, and the paste-test's note that the build config "excludes test files and is unaffected" is only true of what it EMITS. Pin it back explicitly:

  ```jsonc
  // app/tsconfig.server.build.json — what actually compiles the server
  "compilerOptions": { "lib": ["ES2023"] },
  ```

  **Prove the pin, do not assert it** (RF21: a gate nobody made go red is decoration). RUN, measured 2026-09-03 at head `df20687c`: appending `const __c2pr2_probe = document.title;` to `app/server/index.ts` and running `pnpm exec tsc -p tsconfig.server.build.json --noEmit` gives TWO errors —

  ```
  server/index.ts(171,7): error TS6133: '__c2pr2_probe' is declared but its value is never read.
  server/index.ts(171,23): error TS2584: Cannot find name 'document'. Do you need to change your target library? Try changing the 'lib' compiler option to include 'dom'.
  ```

  **Read TS2584, not the error count.** TS6133 is `noUnusedLocals` firing on the probe variable and fires with or without the pin; TS2584 is the pin doing its job. Removing the `"lib": ["ES2023"]` line and re-running leaves TS6133 alone — `document` is now accepted — which is M40c biting. Restore the pin, remove the probe line (with an editor, NOT `git checkout --`, since `server/index.ts` also carries this task's real `logbookBaseUrl` edit — RF22), and confirm 0 errors. Record all three outputs in the task report.

- [ ] **Step 1: Write the test.** Runnable code, not a skeleton: the earlier draft's four `it()` bodies were prose, so nothing here could be pasted, run, or made to fail.

```ts
import {
  describe,
  it,
  expect,
  beforeAll,
  beforeEach,
  afterAll,
  vi,
} from "vitest";
import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from "@testcontainers/postgresql";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import request from "supertest";
import type pg from "pg";
import { createApp } from "../app.js";
import { baseDeps } from "../testDeps.js";
import { createDb, type Db } from "../db/index.js";
import { createSessionStore } from "../auth/sessions.js";
import { createUserStore } from "../auth/users.js";
import { createArticleReadsStore } from "../stores/articleReads.js";
import { createBaselinesStore } from "../stores/baselines.js";
import { createLogsStore } from "../stores/logs.js";
import { createPlanStateStore } from "../stores/planState.js";
import { createPreferencesStore } from "../stores/preferences.js";
import { createTestHistoryStore } from "../stores/testHistory.js";
import { createWorkoutsStore } from "../stores/workouts.js";
import { createConcept2Store } from "../stores/concept2.js";
import { createC2Client } from "../concept2/client.js";
import { eligibilityFailure } from "../concept2/mapping.js";
import type { Stores } from "./data.js";
// The CLIENT's own predicates and its own wire PARSER, imported across the
// tree boundary — the precedent is `routes/partial.integration.test.ts`,
// whose header explains the exception to "server code never imports from
// the client tree": this file is a TEST, and its entire purpose is to hold
// the two trees' views of one seam equal. A hand-copied predicate here
// would be a third mirror and would agree with whichever side it was
// copied from.
//
// `normalizeLink` matters as much as the predicates. Every other gate that
// reads `GET /api/concept2/link` compares its keys against the DEV PROBE's
// interface (`scripts/webauth-contract.test.ts`), which no rower ever sees;
// the product reader is `normalizeLink`, and casting the route's body to
// `Concept2Link` here would let the route rename a key while every suite
// stayed green and the card silently rendered `account #2211` forever.
import { isSendable, sentResultId } from "../../src/log/concept2Send.js";
import { normalizeLink } from "../../src/api/useConcept2Link.js";
import type { StoredLog } from "../../src/log/storedSummary.js";

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => "application/json" },
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  } as unknown as Response;
}

function tokenBody() {
  return {
    access_token: "at-send-seam",
    token_type: "Bearer",
    expires_in: 604800,
    refresh_token: "rt-send-seam",
  };
}

function meBody(c2UserId: number, username: string) {
  return { data: { id: c2UserId, username } };
}

// RAW lines 1-26 shape (docs/monitor/c2-crossconnect-2026-09/
// raw-output.txt): a 201 nests the new result under `data`.
function created201(id: number, c2UserId: number) {
  return { data: { id, user_id: c2UserId } };
}

// The 409's colliding id is TOP LEVEL, not under `data` — read off
// `concept2/client.ts`'s own `postResult` before writing this, and the same
// shape `concept2.integration.test.ts` transcribes as `RAW_409_BODY`. A
// `{message, data:{id}}` body would make `postResult` return `c2_error`
// instead of `duplicate`, and the durable-recovery write this test exists
// to gate would never happen — the test would prove only that a malformed
// 409 is refused.
function duplicate409(id: number) {
  return { message: "Duplicate Result", id, status: 409 };
}

const WEB_REDIRECT_URI = "https://ergomatic.example/api/concept2/callback";
const LOGBOOK_BASE_URL = "https://log-dev.concept2.test";

function finishedLogBody(extra: Record<string, unknown> = {}) {
  return {
    workoutId: null,
    workoutTitle: "Steady State",
    workoutType: "AT",
    held: null,
    pain: null,
    notes: null,
    steps: [{ label: "2000 m" }],
    deviceName: "PM5 432331249 Row",
    source: "pm5",
    endedBy: "finished",
    workSeconds: 254.8,
    workMeters: 935,
    restSeconds: 120,
    restMeters: 274,
    machineSummary: { avgStrokeRate: 24, workoutType: 8 },
    completedAt: "2026-08-25T21:42:03.110Z",
    tz: "America/New_York",
    ...extra,
  };
}

// D1 makes `concept2_links.c2_user_id` UNIQUE for the whole database, and
// every test in this file shares one container. Each linking test therefore
// gets its OWN id — the sibling file's header states the same rule, and
// reusing one literal across three `it()`s is exactly how a later test's
// callback answers 409 Already linked instead of the outcome it asserts.
const C2_USER_SENT = 700339;
const C2_USER_DUP = 700340;
const C2_USER_FIRST = 700341;
const C2_USER_SECOND = 700342;
// Ruling (i)'s two seam cases. Distinct ids because `concept2_links`'
// UNIQUE on `c2_user_id` is GLOBAL and every test in this file shares one
// Postgres schema — reusing an id here 409s instead of asserting anything
// (the same trap `server/stores/concept2.integration.test.ts` documents).
const C2_USER_WEIGHT = 700343;
const C2_USER_NOWEIGHT = 700344;

describe("the Concept2 send seam: the route writes, the log detail reads (RF24)", () => {
  let container: StartedPostgreSqlContainer;
  let pool: pg.Pool;
  let db: Db;
  let app: ReturnType<typeof createApp>;
  let sessions: ReturnType<typeof createSessionStore>;
  let fetchMock: ReturnType<typeof vi.fn<typeof fetch>>;

  beforeAll(async () => {
    container = await new PostgreSqlContainer("postgres:18.4").start();
    ({ pool, db } = createDb(container.getConnectionUri()));
    await migrate(db, { migrationsFolder: "drizzle" });

    const stores: Stores = {
      baselines: createBaselinesStore(db),
      workouts: createWorkoutsStore(db),
      logs: createLogsStore(db),
      planState: createPlanStateStore(db),
      preferences: createPreferencesStore(db),
      testHistory: createTestHistoryStore(db),
      articleReads: createArticleReadsStore(db),
    };

    fetchMock = vi.fn();
    const client = createC2Client(
      {
        baseUrl: LOGBOOK_BASE_URL,
        clientId: "send-seam-client-id",
        clientSecret: "send-seam-client-secret",
      },
      fetchMock,
    );
    sessions = createSessionStore(db);

    app = createApp(
      baseDeps({
        sessions,
        users: createUserStore(db),
        allowlist: new Set([
          "send-eligibility@c2send.test",
          "send-sent@c2send.test",
          "send-dup@c2send.test",
          "send-relink@c2send.test",
        ]),
        nativeVerifier: async (idToken: string) => ({
          sub: idToken,
          email: `${idToken}@c2send.test`,
          emailVerified: true,
          name: idToken,
        }),
        stores,
        concept2: {
          available: () => true,
          store: createConcept2Store(db),
          client,
          webRedirectUri: WEB_REDIRECT_URI,
          logbookBaseUrl: LOGBOOK_BASE_URL,
        },
      }),
    );
  });

  afterAll(async () => {
    await pool.end().catch(() => {});
    await container.stop().catch(() => {});
  });

  beforeEach(() => {
    fetchMock.mockReset();
  });

  async function signIn(
    idToken: string,
  ): Promise<{ bearer: string; userId: string }> {
    const minted = await request(app)
      .post("/api/auth/native")
      .send({ idToken });
    expect(minted.status).toBe(200);
    return {
      bearer: `Bearer ${minted.body.token}`,
      userId: minted.body.user.id,
    };
  }

  /** The SUPPORTED producer of a link: a real mint plus a real callback
   *  exchange, never a direct `store.upsertLink`. */
  async function linkAccount(opts: {
    userId: string;
    c2UserId: number;
    username: string;
  }): Promise<void> {
    const { token } = await sessions.createSession(opts.userId);
    const cookie = `erg_session=${token}`;
    fetchMock.mockImplementation(async (input: Parameters<typeof fetch>[0]) => {
      const url = String(input);
      if (url.endsWith("/oauth/access_token")) {
        return jsonResponse(200, tokenBody());
      }
      if (url.endsWith("/api/users/me")) {
        return jsonResponse(200, meBody(opts.c2UserId, opts.username));
      }
      throw new Error(`unexpected fetch url while linking: ${url}`);
    });
    const minted = await request(app)
      .post("/api/concept2/connect")
      .set("Cookie", cookie)
      // Empty body: ruling (i) removed the only field this mint took, and
      // the route no longer refuses one that omits it.
      .send({});
    expect(minted.status).toBe(200);
    const done = await request(app)
      .get(
        `/api/concept2/callback?state=${String(minted.body.state)}&code=abc123`,
      )
      .set("Cookie", cookie);
    expect(done.status).toBe(200);
    fetchMock.mockReset();
  }

  /** The SUPPORTED producer of a row: `POST /api/logs`, never an insert. */
  async function postLog(
    bearer: string,
    over: Record<string, unknown> = {},
  ): Promise<string> {
    const created = await request(app)
      .post("/api/logs")
      .set("Authorization", bearer)
      .send(finishedLogBody(over));
    expect(created.status).toBe(201);
    return created.body.id as string;
  }

  async function readRow(bearer: string, logId: string): Promise<StoredLog> {
    const detail = await request(app)
      .get(`/api/logs/${logId}`)
      .set("Authorization", bearer);
    expect(detail.status).toBe(200);
    return detail.body as StoredLog;
  }

  /** The link as the CARD reads it: through the production parser, off the
   *  real route's body. */
  async function readLink(bearer: string) {
    const res = await request(app)
      .get("/api/concept2/link")
      .set("Authorization", bearer);
    expect(res.status).toBe(200);
    return normalizeLink(res.body);
  }

  it("the eligibility predicate the CLIENT renders on and the one the SERVER enforces agree, row for row", async () => {
    // Every shape goes in through POST /api/logs — the SUPPORTED producer,
    // never a direct insert — and comes back through GET /api/logs/:id, so
    // both predicates read a row the database actually stored.
    const { bearer } = await signIn("send-eligibility");
    const shapes: { name: string; over: Record<string, unknown> }[] = [
      { name: "pm5 finished with both work columns", over: {} },
      { name: "pm5 finished, no workSeconds", over: { workSeconds: null } },
      { name: "pm5 finished, no workMeters", over: { workMeters: null } },
      { name: "pm5 ended by the rower", over: { endedBy: "rower" } },
      { name: "pm5 link lost", over: { endedBy: "link-lost" } },
      { name: "pm5 interrupted", over: { endedBy: "interrupted" } },
      { name: "pm5 program failed", over: { endedBy: "program-failed" } },
      { name: "pm5 program dropped", over: { endedBy: "program-dropped" } },
      { name: "pm5 with no close reason at all", over: { endedBy: null } },
      {
        name: "timer",
        over: { source: "timer", deviceName: undefined, endedBy: null },
      },
      {
        name: "manual",
        over: { source: "manual", deviceName: undefined, endedBy: null },
      },
      {
        name: "no-reading",
        over: { source: "no-reading", deviceName: undefined, endedBy: null },
      },
    ];

    const rows: StoredLog[] = [];
    for (const { over } of shapes) {
      rows.push(await readRow(bearer, await postLog(bearer, over)));
    }

    // Ordered lists, so a disagreement names the SHAPE rather than just
    // failing a boolean. Both sides are computed from the same stored row.
    const client = rows.map(
      (row, i) => `${shapes[i]!.name}: ${String(isSendable(row))}`,
    );
    const server = rows.map(
      (row, i) =>
        `${shapes[i]!.name}: ${String(
          eligibilityFailure({
            source: row.source,
            endedBy: row.endedBy ?? null,
            workSeconds: row.workSeconds,
            workMeters: row.workMeters,
          }) === null,
        )}`,
    );
    expect(client).toStrictEqual(server);

    // Pinned as an INDEPENDENT literal as well as compared: without it,
    // dropping the same clause from BOTH predicates would keep the
    // equality green and prove nothing (the shape
    // `webauth-contract.test.ts` already guards against on its key list).
    expect(client).toStrictEqual([
      "pm5 finished with both work columns: true",
      "pm5 finished, no workSeconds: false",
      "pm5 finished, no workMeters: false",
      "pm5 ended by the rower: false",
      "pm5 link lost: false",
      "pm5 interrupted: false",
      "pm5 program failed: false",
      "pm5 program dropped: false",
      "pm5 with no close reason at all: false",
      "timer: false",
      "manual: false",
      "no-reading: false",
    ]);
  });

  it("a row sent through the real route reads back as SENT to the client's own predicate", async () => {
    // STARTS UPSTREAM of the writer: nothing below is seeded into the
    // column, and no response is hand-built.
    const { bearer, userId } = await signIn("send-sent");
    await linkAccount({
      userId,
      c2UserId: C2_USER_SENT,
      username: "jamesawesome",
    });
    const logId = await postLog(bearer);
    fetchMock.mockImplementation(async () =>
      jsonResponse(201, created201(339, C2_USER_SENT)),
    );
    const sent = await request(app)
      .post(`/api/concept2/results/${logId}`)
      .set("Authorization", bearer)
      .send({ tz: "Europe/London" });
    expect(sent.status).toBe(200);

    const row = await readRow(bearer, logId);
    // The link comes from the ROUTE, through the PRODUCTION PARSER: a
    // hand-written `Concept2Link` here would let the two sides disagree
    // about `c2UserId` and this test would never notice, and a bare cast
    // would let a renamed key reach the card as `undefined`.
    const link = await readLink(bearer);
    expect(link.c2Username).toBe("jamesawesome");
    expect(link.logbookBaseUrl).toBe(LOGBOOK_BASE_URL);
    expect(sentResultId(row, link)).toBe(339);
  });

  it("the class the ROWER DECLARED on Concept2 is the class Concept2 gets back (ruling i, RF24)", async () => {
    // THE seam ruling (i) creates: a value that entered the process from
    // Concept2's own RESULTS LIST leaves it on Concept2's results endpoint,
    // over the real route, the real store and real Postgres. Every other
    // gate on this path seeds past one end or the other.
    //
    // The declaration is "L" and the profile is HEAVY (8200 = 82 kg, over
    // the men's 7500), so the two producers DISAGREE. That is deliberate:
    // a mutant that skips the declaration and derives from the profile
    // sends "H" and this assertion goes red. A fixture where both
    // producers agreed would let that mutant pass, which is RF21's first
    // smell.
    const { bearer, userId } = await signIn("send-declared");
    await linkAccount({
      userId,
      c2UserId: C2_USER_WEIGHT,
      username: "jamesawesome",
    });
    const logId = await postLog(bearer);
    const posted: unknown[] = [];
    fetchMock.mockImplementation(async (input: unknown, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/api/users/me/results?")) {
        // The measured list shape (observation 27): `data` is an array of
        // results, newest first by DATE, each carrying `weight_class`. The
        // first entry is a non-rower piece with no class, so this row also
        // gates the "skip the hole, do not treat it as a declaration" half.
        return jsonResponse(200, {
          data: [{ id: 1 }, { id: 2, weight_class: "L" }],
          meta: { pagination: { total: 2, links: {} } },
        });
      }
      if (url.endsWith("/api/users/me")) {
        return jsonResponse(200, {
          data: {
            id: C2_USER_WEIGHT,
            username: "jamesawesome",
            weight: 8200,
            gender: "M",
          },
        });
      }
      posted.push(JSON.parse(String(init?.body)));
      return jsonResponse(201, created201(340, C2_USER_WEIGHT));
    });

    const sent = await request(app)
      .post(`/api/concept2/results/${logId}`)
      .set("Authorization", bearer)
      .send({ tz: "Europe/London" });

    expect(sent.status).toBe(200);
    expect(sent.body.weightClassSource).toBe("declaration");
    expect(posted).toStrictEqual([
      expect.objectContaining({ weight_class: "L" }),
    ]);
  });

  it("falls back to our derivation over the real wire when the rower has declared nothing (ruling i, RF24)", async () => {
    // THE seam ruling (i) creates, and the only test in this PR that
    // starts at a Concept2 PROFILE shape and ends at the bytes on
    // Concept2's results endpoint. Every other gate on this path seeds
    // past one end or the other: `mapping.test.ts` calls the pure
    // function, `concept2.test.ts` stubs `client.fetchMe` above the wire,
    // and the client tests mock the whole route.
    //
    // The profile is a LIGHT one on purpose. A heavy fixture would let
    // M40e (derive `"H"` unconditionally) pass, which is RF21's first
    // smell: a mutation that agrees with the fixture it is probed against.
    const { bearer, userId } = await signIn("send-weight");
    await linkAccount({
      userId,
      c2UserId: C2_USER_WEIGHT,
      username: "jamesawesome",
    });
    const logId = await postLog(bearer);
    const posted: unknown[] = [];
    fetchMock.mockImplementation(async (input: unknown, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/api/users/me/results?")) {
        // A rower with no declaration on file: an empty page, which is the
        // shape a brand-new Concept2 account returns.
        return jsonResponse(200, { data: [] });
      }
      if (url.endsWith("/api/users/me")) {
        // 7000 = 70.00 kg per the doc example this repo quotes verbatim in
        // `server/concept2/mapping.ts` — under the 7500 men's threshold,
        // so the derived class is `L`.
        return jsonResponse(200, {
          data: { id: C2_USER_WEIGHT, username: "jamesawesome", weight: 7000, gender: "M" },
        });
      }
      posted.push(JSON.parse(String(init?.body)));
      return jsonResponse(201, created201(340, C2_USER_WEIGHT));
    });

    const sent = await request(app)
      .post(`/api/concept2/results/${logId}`)
      .set("Authorization", bearer)
      .send({ tz: "Europe/London" });

    expect(sent.status).toBe(200);
    expect(sent.body.weightClassSource).toBe("profile");
    expect(posted).toStrictEqual([
      expect.objectContaining({ weight_class: "L" }),
    ]);
  });

  it("a profile with no weight stops the send BEFORE Concept2's results endpoint is touched", async () => {
    // The negative half at the same layer. The assertion that matters is
    // the empty `posted` array: a 422 that had already POSTed would have
    // written a row to a permanent third-party record carrying a class we
    // invented, and the status alone would not have said so.
    const { bearer, userId } = await signIn("send-noweight");
    await linkAccount({
      userId,
      c2UserId: C2_USER_NOWEIGHT,
      username: "jamesawesome",
    });
    const logId = await postLog(bearer);
    const posted: unknown[] = [];
    fetchMock.mockImplementation(async (input: unknown, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/api/users/me")) {
        return jsonResponse(200, {
          data: {
            id: C2_USER_NOWEIGHT,
            username: "jamesawesome",
            weight: null,
            gender: "M",
          },
        });
      }
      posted.push(JSON.parse(String(init?.body)));
      return jsonResponse(201, created201(341, C2_USER_NOWEIGHT));
    });

    const refused = await request(app)
      .post(`/api/concept2/results/${logId}`)
      .set("Authorization", bearer)
      .send({ tz: "Europe/London" });

    expect(refused.status).toBe(422);
    expect(refused.body).toStrictEqual({
      error: "no_weight_class",
      reason: "no_weight",
    });
    expect(posted).toStrictEqual([]);
    // And the row is untouched, so the client still renders the OFFER
    // rather than a half-sent state.
    expect(sentResultId(await readRow(bearer, logId), await readLink(bearer))).toBeNull();
  });

  it("a 409 duplicate reaches the client's predicate as SENT too, because the route records it (RF25)", async () => {
    // The durable-recovery path: the route writes the colliding id BEFORE
    // responding, so the next mount reads SENT off the row. Drop that write
    // and the rower is told "already there" once and then shown an unsent
    // row forever.
    const { bearer, userId } = await signIn("send-dup");
    await linkAccount({
      userId,
      c2UserId: C2_USER_DUP,
      username: "dupuser",
    });
    const logId = await postLog(bearer);
    fetchMock.mockImplementation(async () =>
      jsonResponse(409, duplicate409(512)),
    );
    const sent = await request(app)
      .post(`/api/concept2/results/${logId}`)
      .set("Authorization", bearer)
      .send({ tz: "Europe/London" });
    expect(sent.status).toBe(409);
    expect(sent.body.error).toBe("duplicate");

    const row = await readRow(bearer, logId);
    const link = await readLink(bearer);
    expect(sentResultId(row, link)).toBe(512);
  });

  it("a row accepted by a DIFFERENT Concept2 account reads back as NOT sent", async () => {
    // Spec anchor F8. The stored row is unchanged; what changed is which
    // account is live, and the link-out would point at a row this grant
    // cannot open.
    const { bearer, userId } = await signIn("send-relink");
    await linkAccount({
      userId,
      c2UserId: C2_USER_FIRST,
      username: "first",
    });
    const logId = await postLog(bearer);
    fetchMock.mockImplementation(async () =>
      jsonResponse(201, created201(339, C2_USER_FIRST)),
    );
    const sent = await request(app)
      .post(`/api/concept2/results/${logId}`)
      .set("Authorization", bearer)
      .send({ tz: "Europe/London" });
    expect(sent.status).toBe(200);
    expect(
      sentResultId(await readRow(bearer, logId), await readLink(bearer)),
    ).toBe(339);

    const removed = await request(app)
      .delete("/api/concept2/link")
      .set("Authorization", bearer);
    expect(removed.status).toBe(204);
    await linkAccount({
      userId,
      c2UserId: C2_USER_SECOND,
      username: "second",
    });

    const row = await readRow(bearer, logId);
    const link = await readLink(bearer);
    expect(link.c2UserId).toBe(C2_USER_SECOND);
    expect(sentResultId(row, link)).toBeNull();
  });
});
```

  **Three things in that file were read out of the code rather than assumed, and each would have made a green test that proves nothing:**

  1. **The 409's colliding id is TOP LEVEL.** `concept2/client.ts`'s `postResult` reads `(parsed as {id?: unknown})?.id`; the nested `data.id` path is the 201-success shape only. An earlier draft's stub answered `{ message: "duplicate", data: { id: 512 } }`, which makes `postResult` return `c2_error` instead of `duplicate` — the durable-recovery write never happens and the test proves only that a malformed 409 is refused. The sibling file already transcribes the real shape as `RAW_409_BODY = { message: "Duplicate Result", id: 85560, status: 409 }`.
  2. **Every linking test needs its OWN `c2UserId`.** D1's UNIQUE on `c2_user_id` is global and all four tests share one container, so a single reused literal makes the second test's callback answer 409 Already linked rather than the outcome it asserts. Hence the four named constants.
  3. **The link is read through `normalizeLink`, not cast.** A cast is what let observation 21's class survive one file over: every other gate on this response compares its keys to the DEV PROBE's interface, and the product reader is `normalizeLink`. With a cast, renaming `c2Username` on the route leaves the whole suite green while the card renders `account #2211` forever.

  `linkAccount` drives the SUPPORTED producer — a real mint plus a real callback exchange over the stubbed `fetch` — never `store.upsertLink`; the same seam `concept2.integration.test.ts` already injects.

- [ ] **Step 2: Run it** (`--project integration`, Docker required). **Step 3: commit, then probe.**

  | # | Mutation | Must fail |
  | --- | --- | --- |
  | M37 | delete `c2ResultId`/`c2UserId` from the client's `StoredLog` | typecheck fails in this file — which is the point: the seam is now compile-coupled |
  | M38 | `routes/concept2.ts`'s duplicate branch: remove the write before responding | "a 409 duplicate reaches the client's predicate as SENT too" |
  | M39 | `mapping.ts`'s `eligibilityFailure`: drop the `endedBy !== "finished"` clause | "the eligibility predicate … agree, row for row" — the comparison AND the pinned literal both go red. **Neither M39 nor M40 could be run in the paste-test**, because the test they gate existed only as prose |
  | M40 | `concept2Send.ts`'s `isSendable`: accept `"no-reading"` as well as `"pm5"` | same test, from the other side |
  | M40b | drop the `endedBy` clause from BOTH predicates at once | the pinned literal list. This is the probe that proves the comparison is not a mirror — without the literal, two identically-wrong predicates agree perfectly. RUN: red on exactly that test |
  | M40e | `mapping.ts`'s `deriveWeightClass`: return `{ ok: true, weightClass: "H" }` unconditionally | the FALLBACK seam row — the LIGHT profile's row reaches Concept2's endpoint carrying `H` |
  | M40e2 | the route: skip the declaration and always derive from the profile | the DECLARATION seam row — its profile is deliberately HEAVY while its declaration is `L`, so the mutant's row reaches Concept2's endpoint carrying `H`. **These two rows are the only gates in the PR that start at Concept2's own wire shapes and end at the bytes on Concept2's results endpoint**, which is what RF24 asks for: every other test on this path seeds past either the reads or the payload build |
  | M40d | rename the route's response key (`c2Username:` -> `c2username:`) | "a row sent through the real route reads back as SENT to the client's own predicate" — the assertion on `link.c2Username`. This is the probe that proves the seam is read through the PRODUCT parser and not through a cast; before `normalizeLink` was wired in here, this rename left every suite in the repo green. RUN: red on exactly that test |
  | M40c | `tsconfig.server.build.json`: remove the explicit `"lib": ["ES2023"]` | step 0's `document.title` probe stops failing, i.e. the shipped server can now reach browser globals |

---

## Task 11: e2e flows and screenshots

**Files:**
- Create: `app/e2e/concept2.spec.ts`
- Modify: `app/e2e/screenshots.spec.ts` (append captures), `app/e2e/design.spec.ts` (append structural assertions)
- Modify: `docs/screenshots/` (the new captures)

**Scope, per ruling (v)=A.** The e2e stack is C2-dark by construction and a committed CI test enforces it (`scripts/compose-env.test.sh:46-49`), so these flows fake the server's Concept2 answers in the browser with `page.route` — the precedent is `e2e/onboarding.spec.ts:379-383` and `e2e/log.spec.ts:1015`. **Say this out loud in the spec file's header:** these prove the CLIENT's states and its wiring, not the server's, and Task 10 is what proves the seam. A real fake-Concept2 service is named as a follow-on in Task 13's ROADMAP row, not smuggled in here.

- [ ] **Step 1: Write `app/e2e/concept2.spec.ts`.** Sign in via `signInViaBackdoor`, seed a real eligible monitor row with `design.spec.ts:2212`'s `seedCompletedMonitorRun` helper (or the `postLog` shape at `log.spec.ts:66`, with `source: "pm5"`, `endedBy: "finished"` and both work columns — RF3: real shapes, not minima), then route `**/api/concept2/**` per test:

  - **`the surface is invisible while the server says unavailable`** — route `GET /link` to `{available:false}`; assert no `CONCEPT2` text on You and none on the log detail. This is the state every deployment is in today, so it is the one that must never regress.
  - **`connect asks nothing and hands off`** — `{available:true, linked:false}`; assert Connect is LIVE on first paint and that the card renders no `radiogroup` and no `textbox` (ruling i); route `POST /connect` to `{authorizeUrl: "/api/concept2/callback?stub=1", state: "s"}` and assert the navigation is attempted, and that the intercepted mint body is `{}`.
  - **`a linked account names itself and unlinks in two taps`** — `{available:true, linked:true, …}`; assert the identity line; tap Unlink; assert no DELETE fired; tap again; assert the DELETE and that the card returns to the unlinked state.
  - **`a qualifying row offers Send; a timer row does not`** — two seeded rows, one `pm5`/`finished`, one `timer`; open each detail door; assert the block on one and its total absence on the other.
  - **`send -> SENT with the result link`** — route `POST /results/*` to `200 {resultId: 339, weightClass: "H", weightClassSource: "profile"}`; tap Send; assert `Accepted by Concept2.`, `RESULT 339`, `WEIGHT CLASS H · FROM YOUR CONCEPT2 WEIGHT` (ruling R2), and that the link-out's target is `https://log-dev.concept2.com/profile/2211/log/339`. (Assert the URL the button would open, not a navigation: `openReadOnlyUrl`'s web arm opens a new context and Playwright would need a popup handler; use `page.waitForEvent("popup")` if asserting the real open, and say which you did.)
  - **`send -> 409 duplicate -> ALREADY THERE`** and **`send -> 502 -> SEND FAILED with a REASON and a retry`**.
  - **`send -> 422 no_weight_class -> the account link-out`** (amendment 2i, ruling i) — route `POST /results/*` to `422 {error:"no_weight_class", reason:"no_weight"}`; tap Send; assert `REASON: SET YOUR WEIGHT ON CONCEPT2`, that `Send again` IS offered, and that `OPEN CONCEPT2 PROFILE` targets `https://log-dev.concept2.com/profile` — **no id** (observation 28). Then assert the same 422 with `reason: "no_gender"` renders `REASON: COULDN'T GET A CLASS FROM CONCEPT2`, does NOT say "no weight set", and does NOT name the logbook (a destination this state's one control cannot reach): the four tokens do not collapse to one line, and this is the flow where a collapse would be invisible to the unit tests.
  - **`coming BACK from Concept2 re-reads the link, without a remount`** — observation 19 and invariant I5, and the only gate in this repo that can observe the bfcache path at all. Route `GET /link` to `{available:true, linked:false}`; open You; stub the mint so the hop lands on a page inside the app's own origin (a stubbed callback page is enough — nothing about the real OAuth hop is being tested here); tap Connect and let the document navigate; **flip the routed `GET /link` to a LINKED response**; then `await page.goBack()` and assert the card reads `LINKED ✓` with its identity line, with no reload driven by the test. If the browser reloads rather than restoring, the mount read gets there first and the test passes for the boring reason — **say which happened in the task report**, because "it passed" and "the listener fired" are different facts and only the second one is evidence for the `pageshow` half of Task 1.
  - **`a read that fails says so and retries`** — route `GET /link` to a 502; assert `Couldn't reach Concept2 linking.` and a `REASON` naming the status; re-route to `{available:true, linked:false}`; tap `Retry`; assert the unlinked card appears. Amendment 1i, and the counterpart of the invisibility case above: these two must not look the same on screen.
  - **`an unlink the server refuses says the link is unchanged`** — linked; route `DELETE /link` to a 500; two taps; assert `Couldn't unlink. Your link is unchanged.` and that the card still reads `LINKED ✓`. Amendment 1j.

- [ ] **Step 2: Append structural design assertions to `design.spec.ts`** — per `docs/TESTING.md`'s structural-design rule: every tappable in the card and the block measures ≥ 44px, and the card's own computed colours resolve to the tokens this plan names (not to raw hex). Measure the flex ITEM, never an inline element (RF21's second smell: `scrollWidth`/`clientWidth` are `0` on inline elements).

- [ ] **Step 3: Append screenshots**, seeded with REAL data (RF7) and each awaiting a real element before capturing (`screenshots.spec.ts:325-338`'s own lesson: the one capture that skipped the `waitFor` committed a blank cream rectangle):

  | capture | seed |
  | --- | --- |
  | `you-concept2-unlinked.png` | `{available:true, linked:false}`. Connect is live on first paint and the card asks nothing (ruling i) — **this capture is the visual record of what the ruling changed**, so read it against the board's 1a and say in the report that the WEIGHT CLASS section and its two-option control are gone |
  | `you-concept2-linked.png` | linked, username `jamesawesome`, real signed-in email |
  | `you-concept2-armed.png` | linked, one tap on Unlink |
  | `log-concept2-idle.png` | a real eligible monitor row, linked account |
  | `log-concept2-sent.png` | the same row, with `c2ResultId: 339` / `c2UserId: 2211` injected by `page.route("**/api/logs/*", …)` on the DETAIL response — **not** seeded into the column |
  | `you-concept2-read-failed.png` | `GET /link` routed to a 502, so the card shows amendment 1i's panel and its Retry |
  | `log-concept2-no-weight.png` | a real eligible monitor row, linked account, `POST /results/*` routed to `422 {error:"no_weight_class", reason:"no_weight"}` and the tap driven — amendment 2i, with both its buttons in frame. **Driven, never seeded:** like 2d this state has no stored representation, so a seeded reload renders the idle offer instead |
  | `log-concept2-sent.png` | the SENT state captured from a DRIVEN send whose 200 carries `weightClass`/`weightClassSource`, so the provenance line is in frame (ruling R2). **Driven, never seeded, for a reason worth stating:** the class is not stored, so a seeded row renders SENT with no line — a capture taken that way would silently show the design without the thing this revision added |

  **`log-concept2-sent.png` cannot seed the column, and the reason is worth stating rather than working around.** The only writer of `c2_result_id` anywhere in the system is `POST /api/concept2/results/:logId`, and in the e2e stack that route 403s `unavailable` before it does anything (`C2_LINK_ENABLED` is empty by construction — observation 14). A capture step that says "seed state X" must be able to name a WRITER of X that is reachable in the environment the capture runs in; here there is none, so the row's shape is injected at the response instead. The capture therefore proves the RENDER of the sent state and nothing about the seam — Task 10 owns that — and the task report says so beside the image.

  **2d Duplicate is not capturable this way either, for a different reason** (observation 12): the route's write makes the next mount read SENT, so a seeded-and-reloaded duplicate renders 2c. If a duplicate capture is wanted it must drive the tap against a routed 409 in the same page. Decide, and say which.

- [ ] **Step 4: Run both browser gates and OPEN THE IMAGES.**

```bash
cd /Users/james/projects/github/jamesawesome/Ergomatic-wt-c2pr2/app
pnpm e2e
pnpm screenshots
```
  Then read each new PNG and describe what is in it in the task report (RF7: "open the image and look at it"). A capture showing an empty card or a fallback dash is a failure of this step, not of a later review.

- [ ] **Step 5: Commit, then probe.** At least: make the card render while `available:false` and confirm the invisibility test goes red; shrink a tappable to 40px and confirm the structural assertion goes red; remove the `pageshow` listener from Task 1's hook and report what the Back case does — **if it still passes, that case is measuring the browser reloading rather than restoring, and it is not evidence for I5**; make the read-failed panel `return null` and confirm the 1i case goes red. **There are TWO `pageshow` listeners now** — the hook's link re-read and the card's attempt clear (invariant I5b) — so remove them one at a time and say which case each one reddens; removing only the hook's leaves the declined-attempt case passing and would read as evidence the card is fine when it is not.

---

## Task 12: The callback pages' 401/403 copy

**Gated on ruling (iii) = A. If B, skip this task entirely.**

**Files:**
- Modify: `app/server/concept2/callbackPage.ts`
- Test: `app/server/concept2/callbackPage.test.ts`

- [ ] **Step 1: Write the failing tests.** Both use mapped assertions rather than an `expect` inside a loop (`vitest/no-conditional-expect`, and this plan's own rule — a conditional expect silently asserts NOTHING when its condition is false, which for a "no anchors anywhere" claim is the failure mode being tested for).

```ts
it("names no destination the page cannot take you to", () => {
  // callbackPage.ts's own constraint: this template emits NO anchors and NO
  // subresources, because the callback URL carries `code` and the first
  // outbound link would leak it in Referer (RFC 9700 §4.2). A bare "here"
  // therefore points at nothing. Gate 0 amendment §3, ruling (iii).
  const notSignedIn = renderCallbackPage("notSignedIn");
  expect(notSignedIn.html).toContain(
    "Open Ergomatic in this browser and sign in, then start the link again from the app.",
  );
  const wrongAccount = renderCallbackPage("wrongAccount");
  expect(wrongAccount.html).toContain(
    "Sign in as that account in this browser, or start a new link from the account you&#39;re using.",
  );
  expect(
    (["notSignedIn", "wrongAccount"] as const).map((kind) =>
      /\bhere\b/.test(renderCallbackPage(kind).html),
    ),
  ).toStrictEqual([false, false]);
});

it("still emits no anchor and no subresource on any page", () => {
  // The constraint the rewording must not quietly relax.
  const kinds = [
    "alreadyLinked", "expired", "incomplete", "notSignedIn",
    "wrongAccount", "unavailable", "failed",
  ] as const;
  expect(
    kinds.map((kind) => {
      const { html } = renderCallbackPage(kind);
      return [/<a\b/, /<link\b/, /<img\b/, /<script\b/].some((re) =>
        re.test(html),
      );
    }),
  ).toStrictEqual(kinds.map(() => false));
});
```

- [ ] **Step 2: Apply the copy.** Delete the `SIGN_IN_HERE` constant (keeping the no-anchors comment above it, which is about the template and not about the word); the two `action` strings become literals. **`callbackPage.test.ts`'s own `cases` table pins both sentences verbatim** and goes red on this change — update its `notSignedIn` and `wrongAccount` rows in the same edit, `you&#39;re` entity included, or the two new tests below pass while the table fails.

```ts
  notSignedIn: {
    status: 401,
    label: "NOT SIGNED IN",
    statement: "No Ergomatic session in this browser.",
    // Gate 0 amendment §3 (ruling iii, 2026-09-03): was "Sign in to
    // Ergomatic here, …". This template emits no anchors by design (the
    // constraint above), so "here" named a destination the page could not
    // take the rower to. No link is added; the false affordance is removed.
    action:
      "Open Ergomatic in this browser and sign in, then start the link again from the app.",
  },
  wrongAccount: {
    status: 403,
    label: "WRONG ACCOUNT",
    statement: "This link was started by a different Ergomatic account.",
    // `you&#39;re`, the HTML ENTITY, not a literal apostrophe. `action`
    // renders UNESCAPED (read `shell()`), so the literal source and the
    // literal test the earlier draft prescribed could not both be right —
    // the source said `you're` and the test asserted `you&#39;re`. This
    // is drift this PR would have introduced: the string being replaced
    // used a literal apostrophe because nothing had to match it.
    action:
      "Sign in as that account in this browser, or start a new link from the account you&#39;re using.",
  },
```

  **Read `shell()` before writing either string.** Which parts of a `PageSpec` are escaped and which are interpolated raw is the fact this step turns on, and getting it wrong produces either a visible `&#39;` on the rower's screen or a test that can never pass.

- [ ] **Step 3: Run the server unit project. Step 4: commit, then probe** — restore "here" in one page and confirm the `/\bhere\b/` assertion goes red; add an `<a href="/">` to `shell()` and confirm the no-anchor assertion goes red (that second probe is what proves the constraint test is not decoration).

---

## Task 13: Reconciliation — the record made to describe this head

**Files:**
- Modify: `docs/superpowers/specs/2026-08-31-concept2-logbook-design.md`, `docs/design/handoffs/2026-08-31-concept2-connect/README.md`, `docs/design/DEVIATIONS.md`, `ROADMAP.md`, `app/server/routes/concept2.ts` (comment only), `app/src/adapters/externalBrowser.ts` (comment only)

**The rule this task serves** (CLAUDE.md): "A review record describes the current head, not the head where it was written… After withdrawing a claim, grep its PHRASING across every file that repeated it — the withdrawn words themselves — and reconcile each hit or state why it stands."

- [ ] **Step 1: Run the base-vs-head phrase census.** Not a hand-transcribed table (agent briefing: "If a census is needed, the plan carries the SCRIPT and a base-vs-head diff, never the numbers"). Run this at the START of the task and again immediately before the PR opens, and put both outputs in the PR's Record block:

```bash
cd /Users/james/projects/github/jamesawesome/Ergomatic-wt-c2pr2
for phrase in \
  "Until PR1.75b ships" \
  "intentional interval" \
  "none of them weight" \
  "returns 13 fields" \
  "weightClass" \
  "weight_class" \
  "WEIGHT CLASS" \
  "weight class" \
  "Heavyweight" \
  "Lightweight" \
  "asked once" \
  "one PII question" \
  "ONE new user attribute" \
  "OptionGroup" \
  "1k" \
  "LogRow.tsx" \
  "Accepted by Concept2 ·" \
  "Sign in to Ergomatic here" \
  "Sign in as that account here" \
  "Open your Concept2 logbook" \
  "conditional" \
  "WAITING FOR CONCEPT2" \
  "CONFIRMING THE LINK" \
  "PR2's read-only" \
  "accent means exactly four things" \
  "posted at save from PR2 on" \
  "fallback for legacy rows" \
  "never renders an empty identity" \
; do
  printf '\n=== %s ===\n' "$phrase"
  git grep -n -F -- "$phrase" -- ':!docs/superpowers/plans/2026-09-03-concept2-pr2-client.md' \
    ':!.claude/agents/*-ledger.md' ':!docs/history' || echo "(none)"
done
```
  Every hit is either reconciled in this task or has a stated reason it stands (a merged plan is a record and is never rewritten; the two agent ledgers are never edited; `docs/history/` is a RECORD).

  The `|| echo "(none)"` in that loop is the ONE permitted `||` in this plan's shell, and it is not a gate: `git grep` exits 1 on no match, which is the expected and interesting outcome here. Every actual gate block is one command per line (Global Constraints).

- [ ] **Step 2: The specific reconciliations.**

  1. **`app/server/routes/concept2.ts:64-67`** — the "Until PR1.75b ships the ASWebAuthenticationSession plugin nothing on the device can receive it — the design's named intentional interval" comment. PR1.75b merged as `3e15378e`. Rewrite to record that the redirect is live on device and that live-portal registration is the remaining cutover step.
  2. **The parent spec's `weight_class` premise, and the two rulings that replaced it.** Already reconciled in the same commit as this revision, and listed here so a reviewer can check the spec against the plan rather than take either on trust: the §Research `weight` bullets now carry Concept2's own "you must designate L or H for every piece" sentence and the results-list measurement (observation 27) alongside the sixteen-field profile list; the §The mapping row for `weight_class` names the producer ORDER rather than a derivation; exit criterion 3 carries the strengthened PII bound; and **exit criterion 3b is now a DESK step with TWO readings** rather than a walk step with one. The stored-shape rows are noted as dropped by migration 0023.

     **This is the reconciliation most likely to be done HALF (the review-record rule's named failure).** The claim was ARGUED in §Research and USED in at least five other places — the ruling bullet, two stored-shape rows, the mint description, exit criterion 3, and the handoff README's conditional-ask amendment. Step 1's census is what finds them; correcting §Research alone and leaving the rest is exactly the partial reconciliation PR #246 needed two extra rounds to clear.
  3. **The board's `LogRow.tsx` pointer** — the handoff README's "About the Design Files" section. Correct to `FromTheLog.tsx` with observation 1's reason.
  4. **The board's approved-amendments list** — record the six Gate 0 changes and every new state the amendment draws (1f, 1g, 1h, 1i, 1j, 2f, **2c-b**, **2h**, **2i**, and the REASON lines), with the amendment file's path, so the README describes the surface as built. **And correct the README's own weight-class claims, which are the board's, not the amendment's:** its "The weight-class question is asked once" line, its "Weight class ask is CONDITIONAL" ruling bullet, the WEIGHT CLASS section in its 1a spec, the "Weight class does not show on linked cards" line, the declined-copy sentence, and its diagnostics row's "stored weight class (H/L) when the ask was shown". Every one describes a surface that no longer exists. **The README's own head note is reconciled in this revision's commit** and now names the producer order rather than the derivation.
  5. **`docs/design/DEVIATIONS.md`** — a row for the link-out's accent (observation 15 / amendment §5), naming the four canonical meanings, this fifth use, the ruling, and why a token was not minted. DEVIATIONS documents CURRENT STATE (RF9), so write it as the state, not as a history.
  6. **`app/src/adapters/externalBrowser.ts:1-6`** — its header says "PR2's read-only 'View on Concept2' link-out is the next one". It is no longer next; it is here, and it takes `openReadOnlyUrl`, not `openExternalUrl`. Reconcile.

  9. **`app/server/db/schema.ts`'s `tz` comment** — *"tz: the client's IANA zone; posted at save from PR2 on, or written by the upload route's first legacy send"*. As of Task 6 the first clause is TRUE for the first time, and the second is what happens to rows saved before this build. Rewrite it to say which is which as of this head, and name Task 6's `completionStamp` as the producer, so the next reader can find it in one grep instead of discovering there is none. The `completedAt` half of the same comment gets the same treatment.

  10. **The parent spec's mapping row** — it describes the `loggedAt`/`effectiveTz` branch as the "fallback for legacy rows". Before Task 6 that was not a fallback, it was the ONLY path, and the sentence has been describing an intention rather than the code since PR1 merged. Correct it where it is ARGUED and everywhere it is USED: state that the paired branch went live with PR2's client producer, that "legacy" means rows saved by a build predating it, and that the two are distinguishable in the database by `completed_at IS NULL`.

  12. **`POST /api/logs`'s tz refusal, wherever it is described as a refusal.** Task 6 step 4b makes an unrecognised zone a DEGRADE on that route while the upload route keeps its strict 400, and two committed tests said the opposite in their own titles. Add `"tz must be an IANA timezone name"`, `"rejects an invalid tz"` and `"rejects a non-IANA tz"` to step 1's phrase census and reconcile every hit: the spec's own §Stored shapes line if it names the refusal, `server/db/schema.ts`'s `tz` comment (which item 9 below already rewrites), and the two test titles themselves. The invariant sentence — **a Concept2 field can never cost a rower their row** — goes in the spec beside the mapping row, not only in a code comment, because it is a product rule and the next person to tighten a validator needs to meet it.

  11. **`app/server/routes/concept2.ts:405-407`'s "never renders an empty identity" comment** — Task 3 step 5b makes that claim true; until then it sat above a `??` that could render exactly one. Reconcile it to say WHY (`||`, because an empty string is a string), rather than deleting it: the claim is the useful part and the guard is what earns it.
  7. **`ROADMAP.md`'s Wave E PR2 checkbox** (`:1275-1278`) — tick it, and add the follow-ons this PR names rather than leaving them in the PR body (RF14): (a) the fake-Concept2 e2e service that ruling (v) declined; (b) **the weight-unit DESK leg, plus the logged-in glance that goes with it** — the FALLBACK producer derives from a `weight` field whose unit is an INFERENCE (observation 24), and the plausibility band catches four of the five wrong readings but not the pound one. Two readings settle it (profile unit preference on kg, then on lb), and the same session answers observation 28's open question by looking at which Concept2 page actually carries the weight and weight-class fields. **It touches no erg and no phone: it is a desk step, and it gates the FLAG FLIP, not this merge.** It belongs in ROADMAP because it outlives this PR; (c) **the delete-vs-sent question** raised in Task 7's RF23 enumeration — deleting a row that is already on Concept2 leaves the Concept2 row standing, which matches the unlink copy's position but is nowhere stated to the rower at the delete confirm; (d) **rows saved before Task 6** carry `completed_at IS NULL` and will always upload with their save clock as C2's date — there is no backfill and there cannot be one, since the close instant was never recorded. Say so as a known, permanent property of pre-PR2 rows rather than letting a future reader read it as a bug.
  8. **`ROADMAP.md`'s "still owed after both PRs" list** (`:1262-1274`) — remove "PR2's surface + its Gate 0 identity-copy amendment" once this PR lands it, leaving the flag flip, write approval and live-portal registration.

- [ ] **Step 3: Run `pnpm lint typecheck format:check`.** Root markdown is NOT Prettier-formatted (CLAUDE.md) — **never run `prettier --write` on `ROADMAP.md` or `CLAUDE.md`**; wrap by hand to match the surrounding text.

---

## Task 14: The PR, its fold, and the release call

**Files:**
- No source changes. The PR body, the ROADMAP if the census moved anything, and the release recommendation.

- [ ] **Step 1: Reconcile before opening** (agent briefing's controller checklist): `git merge origin/main`; gates green on the merged tree; a CI run EXISTS for the exact head and is green (an empty check rollup is not green); the body names the current head and every figure in it is current; re-run Task 13's census.

- [ ] **Step 2: The fold.** Above the fold, exactly this. **Measured, not felt** (CLAUDE.md's countable form is ~120 words and ~25 per bullet): **107 words total, 5 bullets, longest bullet 22 words.** Recounted 2026-09-03 over the block below (after ruling (i) shortened the first bullet) by stripping `**` markers and splitting on whitespace — an earlier claim of 23 counted the markers as part of a word, and an earlier 112 predated the bullet's rewrite. If the text changes, recount with the same method; do not carry these numbers forward unchanged, and do not restate them anywhere else in the plan.

```markdown
This PR puts Concept2 in front of the rower: link an account on You, send a finished monitor row from its log page, see where it landed.

- **You gains a Concept2 card.** Connect, and which account is linked. It asks nothing. Unlink takes two taps.
- **A finished monitor row gains Send.** It says SENT, ALREADY THERE, or why it failed, and links to the result on Concept2.
- **Nothing appears until the server says so.** Every deployment today looks exactly as it does now.
- **Testers see this once the flag flips**, which still waits on Concept2's write approval.
- **Try it:** You tab, then any PM5 row you finished.
```

- [ ] **Step 3: Everything else goes in a collapsed `<details>` block titled "Record (for agents and audits)"** — the Gate 0 approval, the rulings and their answers, every mutation probe with the exact failure text, per-file coverage for the six new source files (`api/useConcept2Link.ts`, `you/concept2CardModel.ts`, `you/Concept2Card.tsx`, `log/concept2Send.ts`, `log/Concept2SendBlock.tsx`, `session/completionStamp.ts`) from the HTML report under `app/coverage/`, saying that is the source rather than the text reporter, which omits some directories, the `dist:grep` red-then-green proof, the census outputs, and the screenshots.

  **The Record also names Task 6 explicitly, and the fold does not.** No bullet above the fold says "we fixed the date" — from a rower's side there is nothing to announce, because the feature simply works correctly the first time they see it, and a bullet would advertise a defect that never reached them. The Record states it plainly: PR1 shipped the `completed_at`/`tz` columns with no client producer, so `buildC2Payload`'s accurate branch had never fired; Task 6 is that producer; rows saved before this build have no close stamp and never will.

- [ ] **Step 4: The risk note.** Name what a reviewer should probe: the two cross-tree predicates staying in step, the `busy` union change against `scripts/webauth-contract.test.ts`, the two ends of the mint wire landing in one commit (Task 2's step 3b and Task 3's Part A), whether the class Concept2 gets back is the one the ROWER declared (the two RF24 seam rows are the only gates that can answer it), whether the plausibility band's stated limit is honest — it catches four of five wrong units and the fifth is settled only by the desk step — the `lib` widening in `tsconfig.server.json` and the explicit pin that stops it reaching the shipped server, whether Task 6's stamp is genuinely the run's own close instant on every door that posts it, and the one thing no gate in this repo can reach — the native arm, which only a device walk sees.

- [ ] **Step 5: Gates.** This PR is TRIAD on all three counts, not "adjacent": Task 6 changes what a NUMBER means on a third party's permanent record, ruling (ii)=B adds a STORED SHAPE, and the whole surface is the only door through which a rower creates or destroys an OAuth grant. **The full cycle applies**: the design gate was Task 0, this plan went through the `harden` skill's two lenses before implementation, and the PM final-PR gate runs on the PR. State all three, and state what each one found — a gate reported without its findings is a gate nobody can audit.

- [ ] **Step 6: The release call.** **This PR is the wave's first tester-visible piece** — PR0 through PR1.75b were all dark. So:
  - **The notes cover the whole feature, not this PR's diff.** PR1's routes, PR1.5's browser hop, PR1.75a's server binding and PR1.75b's native return all shipped with no note, because none of them changed anything a tester could see. The note a tester reads is "connect your Concept2 logbook and send finished rows to it", written once, here.
  - **RF15:** before cutting the tag, run `git log <prev-tag>..main --oneline` **WITHOUT `--merges`** (main is squash-merged and has no merge commits) and account for every entry with a note or a stated reason it needs none. Parallel sessions make this the normal case.
  - **The word "sync" appears in no note for this wave** (spec §Out of scope, PM): nothing here syncs.
  - **THE SERVER DEPLOYS BEFORE THE TESTFLIGHT BUILD, and this is an ordering constraint, not a preference.** This PR's client calls `startLink()` with no argument, and its server stops requiring `weightClass` at the mint. Ship the build first and every link attempt from it 400s on `field:"weightClass"` against the old server, for a reason no copy explains. The reverse order is safe by construction: the new server deliberately IGNORES a `weightClass` an older installed build still sends (step A2) rather than refusing it.
  - **The recommendation itself is conditional and must say so:** the surface ships dark. `C2_LINK_ENABLED=1` on a real cohort is gated on Concept2's write approval being CONFIRMED and the live-portal registration of the native redirect (ROADMAP's C2 register row) — neither is code, and neither is this PR's to discharge. So: **release recommended** (the app changes, testers get the capability the moment the flag flips), with the note saying plainly that the card appears only once the connection is switched on.
  - **Agent configs:** say explicitly which, or "no change needed: <why>". Candidates this plan already surfaced: the paste-test finding that a required-and-nullable field addition names its own broken fixtures, and that the same measurement does NOT transfer to a different type's input (observations 6 and 20 counted three and fifty-three respectively, for two changes that look identical); RF16's second corollary earning another instance (observation 7: a real citation, under-read); and the technique behind observation 17 — **when planning PR N, grep the repo for the PR's own name, because a comment assigning work to it is a requirement nobody else is tracking**.

---

## Self-review

**Spec coverage.** §Surfaces 1 (You card: unlinked, waiting, linked, unlink-confirm, link-failed) → Tasks 4 and 8. §Surfaces 2 (log row: idle, sending, sent with link-out, duplicate, failed; non-qualifying and not-linked absence) → Tasks 5 and 7. §Architecture 4 (`GET`/`DELETE /link`) → Tasks 1, 3, 4. §Architecture 5 (upload route, 409 recovery) → Tasks 5, 7, 10. §Architecture 8 (availability as a capability gate) → Tasks 4, 7, 11. §Stored shapes (sent-state authority, F8) → Tasks 5 and 10; (the close stamp, anchor K3) → Task 6. Exit criterion 3, as amended by ruling (i) (**no** new PII attribute) → Task 2's mint-body assertions and Task 4's "asks the rower NOTHING" / "calls startLink with NO arguments" pair. Exit criterion 2 (a linked user sends an eligible row ON THE PHONE, with duplicate and failure each observed for real) → **NOT discharged by this PR: it needs a device walk against a flag-on server, and that walk is a separate card.** Named here rather than implied. Task 6 adds one observation to that walk (its step 8), and it is the only one with a stated precondition that makes a NO possible.

**Gaps, stated.** (a-1) **The unit of Concept2's `weight` field is an INFERENCE, and the FALLBACK producer rests on it** (observation 24). Concept2's only published line sits on a different endpoint and contradicts its own example. The plausibility band converts four of the five candidate units into a loud refusal; **the fifth, hundredths-of-a-pound, is undetectable from one number and the code and its test say so** rather than implying the band is complete. Two things bound it: the desk step in Task 13's ROADMAP row (two readings, kg then lb — a precondition of the FLAG FLIP, not of this merge), and the producer order itself, since a rower who has declared a class on any recent Concept2 result never reaches the derivation at all. (a-2) **Whether a NON-rower Concept2 result carries a `weight_class`** is unmeasured — every row on the account we can read is `rower` (observation 27). If one does, we would take it, which is still that rower's own designation for that piece. The same desk step settles it with one glance. (a0) The `pnpm build` / `pnpm dist:grep` claims were not re-measured in this revision; Task 9 runs them and records its own numbers, and the paste-test receipt says so rather than carrying an inherited row. (a) The web OAuth hop is exercised by no automated gate — ruling (v) declines the fake-Concept2 service and Task 11 says so in the spec header. (b) The native arm is reachable by no gate in this repo (RF19); `Concept2LinkProbe` plus a walk is the whole instrument, and this PR does not add one. (c) Exit criterion 2 above. (d) `pageshow`'s availability at the deployment floor is unconfirmed by any primary source; the design degrades to a mount-only read if it never fires, and Task 11's Back case is the only evidence this repo can produce (see the lifetime table's Web-API list). (e) Rows saved before Task 6 carry no close stamp and will upload with their save clock forever — no backfill is possible, because the instant was never recorded. (f) Task 6 step 4b's degrade cannot be observed on any device this project can produce: it fires only when the phone's zone list and the server image's disagree, and every gate here runs both on one machine. What the change is defended by is the invariant, not an observation — a refusal on that route costs a rower a completed workout, and the field it refuses over exists only to date a third party's copy of it.

**Type consistency.** `Concept2Link` is defined once (Task 1) and consumed by Tasks 3, 4, 5, 7, 10. `LinkReadFailure` once (Task 1), consumed by Task 4 for BOTH the failed read and the failed unlink — one spelling of "what went wrong on the wire", so `reasonFor` has one caller shape rather than two. `SendState` once (Task 5), consumed by Task 7. `LinkOutcome`'s `busy` member is widened in Task 2 and read in Task 1's `describeFailure` — **land Task 2 before or with Task 1**, since `describeFailure`'s `busy` arm does not compile against the current union. `isSendable`/`sentResultId` are named identically in Tasks 5, 7 and 10. `logbookBaseUrl` is the same name in the server response (Task 3), the client type (Task 1) and the URL builder (Task 5). `completionStamp` (Task 6) is imported by the client door that posts and by the server test that gates the seam — it has no imports of its own, deliberately, so the cross-tree hop drags nothing with it.

**Ordering.** Task 2 before or with Task 1 (the union). **Task 3's Part A before or with Task 5**: the 200 body's two new fields and the client's reading of them are two ends of one wire, and the client reads them defensively so the two CAN land apart — but only in that direction (server first), which is the same ordering the release call states. **Task 6 before Task 7**: Task 7 puts a Send button in front of a rower, and every row sent before Task 6 exists carries the wrong date on a record that cannot be re-dated. Task 3 before Task 4 (the card reads `c2Username`). Task 10 after Tasks 5 and 7 (it imports both trees' predicates). Everything else is independent.

**Completeness of the prescribed code.** Every `it()` body in this plan is runnable code, and "runnable" means it was RUN: the whole prescribed set was placed at its real paths at head `df20687c`, compiled, linted and executed together, and this revision's own blocks were placed again at head `e74696f7` (see the receipt). Every block below is written as it ran green. Where a block depends on a harness helper, the plan now names that helper by its REAL name read at this head — `buildApp`/`mintAndGetState`/`asACookie`/`freshLink` in `concept2.test.ts`, `buildMonitorFixture`/`parsedBodies`/`renderManualLog` in `LogSession.test.tsx`, `closedFreeRow`/`savedBody`/`commitHandoff` in `JustRowLog.test.tsx`, `bearerToken`/`logBody` in `completedAt.integration.test.ts`, `renderFromTheLog`/`storedRow`/`mockApi` in `FromTheLog.test.tsx` — rather than a plausible-sounding stand-in. An earlier draft invented `makeApp` and `mintState`, which is why three of its mutation probes gated tests that could not be pasted.

**What the placement changed, and why none of it is bookkeeping.** Each of these is a block that would have failed in a task round: a comment inside `LinkStatus`'s braces reads as a key to the contract gate (Task 3 step 6b); `unlink()` disarming only on success broke two of this plan's own tests and contradicted invariant I2 (Task 4); `You.test.tsx`'s `./api` factory has to delegate to global `fetch` or an unrelated baseline test loses its own field (Task 8); the Just Row assertion literal belonged to the TIMER fixture, not the monitor one (Task 6); `Concept2SendBlock.test.tsx` importing `FromTheLog.test.tsx` re-registers 63 foreign tests inside its own run (Task 7); and four prescribed `vi.fn(async (path, init) => …)` mocks tripped `noUnusedParameters` on the parameter each one does not read.

**Mutation adequacy is stated per probe, not asserted in aggregate.** Every probe added or rewritten in this revision carries the exact test it must redden and, where it was run, the observed result. Two probes were REWRITTEN because they could not bite as specified — M21c (the panel it targeted was hidden by a `link.linked` gate the covering scenario flipped) and M6c (a sibling change to the read path meant the mutant still reported the right status against the old test) — and both now name a different, reachable case rather than being deleted or left green.
