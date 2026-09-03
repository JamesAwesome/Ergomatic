# Wave E PR2 — the rower-facing Concept2 surface (implementation plan)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Hardened 2026-09-03** (`.claude/skills/harden/SKILL.md`): both lenses and both paste-test placements are folded, and this is the final revision before implementation. Every prescribed block below has been placed at its real path and run — see the receipt.

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
- **PII bound** (spec exit criterion 3, verbatim): "the link flow's request bodies carry exactly ONE new user attribute, `weight_class`." Reconnect after `needs_reauth` re-uses the STORED class and asks nothing.
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

**What this receipt does NOT cover, named rather than carried silently:** the `pnpm build` / `pnpm dist:grep` rows. They were measured on an earlier tree, nothing in this revision touches a needle or the probe flag, and a bundle claim is settled by producing the artifact, never by inheriting a table row (RF12). Task 9 runs them and records its own numbers; do not cite this receipt for them.

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

7. **The parent spec's `weight_class` premise is falsified on its evidence, and survives on its conclusion.** Spec §Research, verbatim: *"`GET /api/users/me` returns 13 fields, none of them weight — `weight_class` must be asked by us (V10)."* The 1.75a plan MEASURED that response live on 2026-09-02 (observation 3): sixteen fields, and `weight` **is** one of them (age_restricted, country, dob, email, email_permission, first_name, gender, health_data_permission, id, last_name, logbook_privacy, max_heart_rate, profile_image, roles, username, weight). The conclusion still holds — `weight` is a number, `weight_class` is C2's `H`/`L` competition binary, and deriving one from the other needs the unit and the gender-specific threshold — but the sentence as written is wrong and is cited by the board's conditional-ask amendment. **Task 13 corrects the spec line.** See ruling (i).

8. **The board's conditional weight-class ask cannot be built without changing the mint contract.** Board approved amendment, verbatim: "do NOT ask H/L if Concept2 already has a weight class on the account. Check after the OAuth exchange; ask only when blank on Concept2." `POST /api/concept2/connect` requires `weightClass` and 400s without it (`server/routes/concept2.ts:229-238`), so the ask must precede the authorize hop and cannot be conditioned on anything only reachable after it. Making it conditional means a two-phase link — a change to a shipped TRIAD route. **Amendment change 1: unconditional.** See ruling (i).

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

## Rulings required before implementation

Each is a named binary. **Task 0 presents these with the amendment; implementation does not start until every one is answered.** The plan below is written for the recommended option in each case; the "if the other" column says exactly what to delete or change.

| # | Question | Options | Recommended, and why | If the other |
| --- | --- | --- | --- | --- |
| **i** | Weight-class ask: conditional or unconditional? | **A** ask always. **B** ask only when Concept2 has no class. | **A.** B is unbuildable without a two-phase link: the mint requires `weightClass` and 400s without it (`routes/concept2.ts:229-238`), so the ask must precede the hop, and there is nothing to condition on — C2's `/users/me` carries `weight` (a number) and `gender`, never `weight_class` (observation 7). Deriving H/L from kg would need the unit (unmeasured) and would have us guess a competition category on the rower's behalf. Cost of A: a rower with a class already on Concept2 answers one extra question, once. | B needs a new spec: a mint that accepts no class, a post-exchange read of the rower's latest rower result's `weight_class`, a `results:read` scope check, and a second ask surface. That is its own PR and its own TRIAD gate. |
| **ii** | Linked-card identity: numeric or username? | **A** `Concept2 account #2211 · Ergomatic <email>`. **B** `Concept2 <username> · Ergomatic <email>`, storing the username. | **B.** The line exists to discharge the account-injection residual (ROADMAP's C2 row: the card "naming which account the link goes to" ships with PR2). A numeric id is not something a rower recognises, so A renders the mitigation without delivering it. B costs one nullable `text` column written at two sites that already hold the value, and it makes the card read the same as the Linked callback page the rower just saw. | Delete Task 3 entirely; `identityLine` (Task 1) already falls back to `account #<id>` when `c2Username` is null, so nothing else changes. PR2 then carries no migration and no stored shape. |
| **iii** | The 401/403 callback lines saying "here" | **A** reword (amendment §3). **B** leave as approved. | **A.** "here" is plain text with no anchor, deliberately — the template emits no outbound links because the callback URL carries `code` (`concept2/callbackPage.ts:52-56`, RFC 9700 §4.2). So the word names a destination it cannot take you to. The rewording removes the false affordance without adding a link. | Drop Task 12. No other task depends on it. |
| **iv** | Does the product card replace the dev probe's readout? | **A** probe unchanged, dev-only. **B** product card absorbs it. | **A.** The probe is the only instrument that can reach the Swift plugin, it prints things no rower should see (`Callback carried state`, raw outcome kinds, plugin error codes), and its literal is a `dist-grep` needle proving it is absent from production builds. B would put a walk instrument in a shipping bundle. | B needs the needle retired from `dist-grep.sh:127` and a new argument for why a diagnostic readout belongs on a rower's screen. Not recommended and not planned. |
| **v** | e2e fake-Concept2 scope | **A** `page.route` interception in Playwright + one real cross-layer seam test at the integration layer. **B** a fake C2 HTTP service in compose, `C2_LINK_ENABLED=1` in the e2e overlay. | **A.** B costs a fake Concept2 HTTP service, an image for it, and `C2_LINK_ENABLED=1` exported from `scripts/e2e.sh` — for coverage that Task 10's integration test already provides at the layer that matters (server writes → client predicate reads, over real Postgres). A's `page.route` has in-repo precedent (`e2e/onboarding.spec.ts:379-383`, `e2e/log.spec.ts:1015`). **Correction, folded 2026-09-03:** B does NOT require editing `scripts/compose-env.test.sh` — that script lives at the repo root and renders `docker compose config` in its OWN environment, so an `export` inside `e2e.sh` never reaches it and its `C2_LINK_ENABLED: ""` assertion keeps passing. The gate is not the obstacle; the service, the image and the OAuth-shaped fake are. | B is the only way to exercise the web OAuth hop end to end. It is a legitimate want; it is its own PR, and this plan names it as a follow-on rather than smuggling it in. |

Two further items the amendment asks James to approve but which need no code branch: the six copy/shape changes in its §0, and the new states it draws — 1f needs-reauth, 1g update-required, 1h unavailable, **1i the read failed**, **1j the unlink was refused**, **1k needs-reauth with an unreadable stored class**, 2f row-level reconnect, **2c-b sent with no link-out**, **2h Concept2 won't take this row**, and the REASON lines.

**Three of those were added on 2026-09-03, and each replaces a state the earlier drawing got WRONG rather than one it merely lacked:** 1k replaces a RECONNECT button that could never be pressed (`normalizeLink` degrades an unreadable class to `null`, and the button was wired to it alone); 2c-b replaces a SENT row that showed no result id at all when the server sent no logbook origin — the durable evidence an earlier amendment change had just declared load-bearing; and 2h replaces a block that vanished under the rower's finger on a 422, which is the one answer meaning our two eligibility predicates disagree. **1i is the one that changes what a rower is TOLD** rather than how something looks: an earlier revision of the amendment drew a refused read as absence, which says "this deployment has no Concept2" to a rower whose deployment does.

## Wire contract summary (what this PR builds against)

Read at `3e15378e`. PR2 keys on `body.error`, never on status alone — **409 carries three different meanings** on the upload route.

| route | success | failures this surface renders |
| --- | --- | --- |
| `GET /api/concept2/link` (`routes/concept2.ts:519-548`) | `200 {available:false}` (flag off, HTTP 200 on purpose — `:524-529`) · `200 {available:true, linked:false}` · `200 {available:true, linked:true, weightClass, c2UserId, needsReauth}` **+ `c2Username`, `logbookBaseUrl` after Task 3** | 401; 400 `ambiguous_auth` |
| `POST /api/concept2/connect` (`:218-283`) — via `startLink`, never called directly | `200 {authorizeUrl, state}` | 403 `unavailable`; 400 field-named `weightClass`; **409 `update_required`** (`:244-247`) |
| `DELETE /api/concept2/link` (`:550-565`) | `204`, idempotent (deleting an absent link still 204s) | 403 `unavailable`; 401 |
| `POST /api/concept2/results/:logId` (`:569-906`) | `200 {resultId}` — including the already-sent short-circuit at `:627-630` | **409 `duplicate`** + `c2ResultId` (`:896-898`) · **409 `needs_reauth`** (`:617-620`, `:848`) · **409 `unlinked`** (`:614`) · 422 `not_eligible` + `reason` (`:636`) · 403 `unavailable` (`:576`) · 404 (`:585`, `:609`) · 400 `field:"tz"` (`:596-601`) · 502 `c2_error` |

One route outside the Concept2 namespace is in scope, because Task 6 is its first client producer:

| route | fields Task 6 adds to the body | refusals |
| --- | --- | --- |
| `POST /api/logs` (`routes/data.ts:1705-1715`, `:1754-1755`) | `completedAt` (ISO 8601 string or null) · `tz` (canonical IANA zone or null) | 400 `field:"completedAt"` on a malformed stamp; 400 `field:"tz"` on anything not in `Intl.supportedValuesOf("timeZone")` plus `"UTC"`. A PARSEABLE stamp outside the plausible band is NOT a refusal: `checkCompletedAt` returns `{ok:true, value:null}` and the save survives with no stamp. |

`adapters/linkFlow.ts`'s `startLink({weightClass}) → LinkOutcome`, **17 members** (`:79-106`: linked, navigating, declined, malformed, stateMismatch, exchangeFailed, serverError, mintFailed, updateRequired, busy, cancelled, abandoned, noWindow, noContext, contextInvalid, pluginError, networkError). Task 2's `busy` split WIDENS that member rather than adding one, so the count is unchanged by this PR. Every member's card treatment is tabulated in the amendment's §1e.

Eligibility, server-side and authoritative (`server/concept2/mapping.ts:60-72`): `source === "pm5"` AND `endedBy === "finished"` AND `workSeconds !== null` AND `workMeters !== null`. **Measured audience:** 6 of 20 prod rows pass this fence (`docs/monitor/c2-crossconnect-2026-09/README.md`, "Eligible-population count", recounted at #244 finding 4).

## Lifetime table (RF27)

Every piece of state this PR introduces, with its mint site, its clear sites, and what survives each boundary. **The invariants, stated first, because a mechanism is not an invariant:**

- **I1.** The card's view of the link is never inferred from an outcome. After every attempt the card re-reads `GET /api/concept2/link` and renders what the SERVER says. An outcome saying `linked` while the server disagrees must render as not-linked.
- **I2.** The unlink arm is armed by exactly one tap and disarmed by exactly one of: a second tap, four seconds elapsing, or the card unmounting. It can never survive a navigation away from You.
- **I3.** A row's sent state is a fact about the row and the LIVE link together. It is re-derived on every render from `(row.c2ResultId, row.c2UserId, link.c2UserId)` and is never cached across a link change.
- **I4.** The weight-class draft is transient and per-mount. It is never persisted, never sent except in a mint body, and is cleared by a successful unlink so a relink asks again.
- **I5.** The card's view of the link is refreshed on every occasion the DOCUMENT becomes visible to the rower again, not only on mount. A restore that skips mounting must not leave a stale panel on screen (observation 19). The refresh is idempotent: it re-reads and re-renders, and it never mints, retries or cancels anything.
- **I5b.** After a RESTORE, no attempt state from before the document unloaded is still on screen. Re-reading the link alone does not discharge I5, because the panel the rower is stuck behind is drawn from the ATTEMPT (`outcome`/`busy`), not from the link: a restore preserves the JS heap, so a web attempt the rower DECLINED comes back with `outcome` still `navigating` and renders a buttonless OPENING CONCEPT2 panel with no Try again, forever. The half that fixes the succeeded case and the half that fixes the declined case are two different pieces of state and both are owed.
- **I6.** Every failure the rower can act on carries a discriminator. A read that failed says so and offers a retry; an unlink that failed says the link is unchanged. Neither is allowed to render as its own success, and neither is allowed to render as `unavailable`, which means something else entirely.

| State | Owner | Mint site | Clear sites | Survives unmount? | Survives relaunch? | Survives a link change? |
| --- | --- | --- | --- | --- | --- | --- |
| `link` (`Concept2Link \| null`) | `useConcept2Link` | mount effect's `reload()`, and every later `reload()` | replaced by every successful `reload()`; `null` only before the first read resolves | no | no | it IS the link |
| `failed` (`LinkReadFailure \| null`) | `useConcept2Link` | a non-`ok` response, or the `reload()` catch | set to `null` by any successful `reload()` | no | no | n/a |
| the attempt-clear `pageshow` listener (I5b) | `Concept2Card` | a mount-only effect with an empty dep array | that effect's cleanup (`removeEventListener`), on unmount and on nothing else | no | no | n/a: it clears an attempt, it does not hold a link |
| the `pageshow` + `visibilitychange` listeners | `useConcept2Link` | the same effect that runs the first `reload()`, via `window.addEventListener` | that effect's cleanup (`removeEventListener` for both), which runs on unmount and on nothing else — the effect's dep array is `[reload]` and `reload` is a `useCallback` with an empty dep array, so it is minted once per mount | no — removed on unmount, which is what stops a dead card re-reading | no | n/a: it observes the link, it does not hold one |
| `weightClass` draft | `Concept2Card` | the rower's tap on the radiogroup | successful unlink; unmount | no | no | reset on unlink (I4) |
| `outcome` (`LinkOutcome \| null`) | `Concept2Card` | `startLink` resolving | set to `null` at the start of each `connect()`; cleared by a successful unlink; cleared on `pageshow` (I5b); unmount | no | no | superseded by the next attempt |
| `busy` | `Concept2Card` | `connect()` / `unlink()` entry | those functions' `finally` — every exit, never only the happy one; and `pageshow` (I5b), for the case where the document unloaded mid-attempt and no `finally` ever ran | no | no | n/a |
| `unlinkFailed` (`number \| null`, the refusing status) | `Concept2Card` | `unlink()`'s `else` branch, and its `catch` | set to `null` at the start of every `unlink()`; a successful unlink; unmount | no | no | n/a |
| `armed` + `disarmRef` timer | `Concept2Card` | `arm()` (one tap) | `disarm()` in `unlink()`'s `finally` — EVERY exit, refusals included, because "a second tap" is I2's own first disarmer and it has already happened — plus the 4 s timeout and the unmount cleanup (`useEffect(() => disarm, [disarm])`) | **no — cleared on unmount, which is I2's whole point** | no | n/a |
| `send` (`SendState`) | `Concept2SendBlock` | `post()` entry | replaced by each response; unmount | no | no | recomputed against the fresh link (I3) |
| `linkInFlight` | `adapters/linkFlow.ts` module scope | `startLink` entry (`:289`) | `startLink`'s `finally` (`:328-332`) | **yes — module scope survives component unmount** | no (a WebView reload destroys the module) | n/a |

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
- Produces: James's ruling on (i)-(v), on the amendment's six copy/shape changes, and on every new state it draws (1f, 1g, 1h, 1i, 1j, **1k**, 2f, **2c-b**, **2h**, and the REASON lines). Every task below cites the amendment for its copy.

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
- Consumes: `WeightClass` and `LinkOutcome` from `adapters/linkFlow` (Task 2 widens `busy`; write this task's `describeFailure` against the widened member and land Task 2 first, or land them in one commit).
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
  weightClass: "H",
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
      { kind: "linked", c2UserId: 2211, weightClass: "H", stateEchoed: true },
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
      "You cancelled at Concept2. Nothing was linked, nothing was saved. Your weight class pick is kept.",
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
        weightClass: "L",
        c2UserId: 2211,
        c2Username: "jamesawesome",
        needsReauth: true,
        logbookBaseUrl: "https://log-dev.concept2.com",
      }),
    ).toStrictEqual({
      available: true,
      linked: true,
      weightClass: "L",
      c2UserId: 2211,
      c2Username: "jamesawesome",
      needsReauth: true,
      logbookBaseUrl: "https://log-dev.concept2.com",
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
      weightClass: "X",
      c2UserId: "2211",
      c2Username: 7,
      logbookBaseUrl: 3,
    });
    expect(link.weightClass).toBeNull();
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
import type { WeightClass } from "../adapters/linkFlow";

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
  weightClass: WeightClass | null;
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
  weightClass: null,
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
    weightClass:
      raw.weightClass === "H" || raw.weightClass === "L"
        ? raw.weightClass
        : null,
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
  "The connection didn't complete. Nothing was linked, nothing was saved. Your weight class pick is kept.";

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
        line: "You cancelled at Concept2. Nothing was linked, nothing was saved. Your weight class pick is kept.",
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
- Modify: `app/src/adapters/linkFlow.ts` (the `busy` union member, `pluginRejection`'s `busy` case, `startLink`'s guard return, and the `:148-155` comment)
- Modify: `app/src/adapters/webNavigate.ts` (append `openWebInNewTab`)
- Modify: `app/src/adapters/externalBrowser.ts` (import and append `openReadOnlyUrl`)
- Test: `app/src/adapters/externalBrowser.test.ts` (append), `app/src/adapters/webNavigate.test.ts` (append), `app/src/adapters/linkFlow.test.ts` (append)

**Interfaces:**
- Produces: `LinkOutcome`'s `busy` member becomes `{ kind: "busy"; source: "guard" | "sheet" }`; `openWebInNewTab(url: string): void`; `openReadOnlyUrl(url: string): void | Promise<void>`.

**Why this task exists, not folded into Task 3:** both changes are in the lint-enforced adapter layer, both are consumed by BOTH components, and a reviewer can reject either without touching a component. Observation 4 is the reason for the first; observation 10 for the second.

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

    expect(await startLink({ weightClass: "H" })).toStrictEqual({
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

    void startLink({ weightClass: "H" });
    const second = await startLink({ weightClass: "H" });
    expect(second).toStrictEqual({ kind: "busy", source: "guard" });
  });
```

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

---

## Task 3: The server's two additions — `c2Username` and `logbookBaseUrl`

**Gated on ruling (ii) = B. If James picks A, skip the `c2Username` half entirely (the migration, the schema column, both write sites, and the `GET /link` field); `logbookBaseUrl` is NOT optional and ships either way (observation 5).**

**Files:**
- Modify: `app/server/db/schema.ts` (the `concept2Links` block)
- Create: `app/drizzle/0023_<name>.sql` + `app/drizzle/meta/0023_snapshot.json` + journal entry, via `pnpm db:generate` (index confirmed free in step 1)
- Modify: `app/server/stores/concept2.ts` (`upsertLink`'s input, `getLink`'s projection, the type)
- Modify: `app/server/testing/fakes.ts` (`makeFakeConcept2Store`, mirroring the column — one of the three builders the optional input protects)
- Modify: `app/server/routes/concept2.ts` (both `upsertLink` calls pass `c2Username`; the Linked callback page's fallback; `GET /link` returns `c2Username` and `logbookBaseUrl`; `Concept2RouterDeps` gains `logbookBaseUrl`)
- Modify: `app/server/index.ts` (pass `c2BaseUrl` in as `logbookBaseUrl`), `app/server/app.ts` (thread it)
- Modify: **`app/scripts/webauth-contract.test.ts`** — its pinned `GET /link` key list AND its own `LinkStatus` interface. Named because the paste-test's full `unit` run found it, and no earlier draft of this plan mentioned the file at all (observation 21).
- Modify: **`app/src/monitor/Concept2LinkProbe.tsx`** — the dev probe's `LinkStatus` interface, the other side of that same gate. The probe's BEHAVIOUR is unchanged (ruling iv); only its type declaration gains the two fields, because the gate holds it equal to the route.
- Modify: **`app/server/db/schema.integration.test.ts`** — the migration-0021 describe block's two `db.insert(concept2Links)` calls (see step 7).
- Modify: **`app/server/index.ts`** — a second change beside threading the origin: the env read becomes `||`, not `??` (observation 22).
- Test: `app/server/routes/concept2.test.ts` (append; ALSO fix its `buildApp` harness literal, its `freshLink` override type, one pre-existing `toStrictEqual` response assertion and one pre-existing rendered-page assertion — see steps 5b and 6b), `app/server/stores/concept2.integration.test.ts` (its `link()` builder is the second of the three; its override type widens too)

**Interfaces:**
- Produces: `concept2_links.c2_username text` (nullable); `GET /api/concept2/link` gains `c2Username: string | null` and `logbookBaseUrl: string` on the linked-and-available response.
- `upsertLink`'s INPUT gains `c2Username?: string | null` — **optional, defaulting to `null` internally.** The stored column and the `getLink` projection stay required-and-nullable; only the writer's input is optional. Observation 20 is why: a required input field reaches **53 call sites** through three builders (`LINK_INPUT`/`freshLink` in `server/routes/concept2.test.ts`, `link()` in `server/stores/concept2.integration.test.ts`, `makeFakeConcept2Store` in `server/testing/fakes.ts`), none of which has a username to give. The two PRODUCTION write sites both pass one explicitly, so nothing real relies on the default.

- [ ] **Step 1: Check the migration index BEFORE generating.** Run and record the output in the task report (agent briefing: "Drizzle migrations apply by TIMESTAMP, not journal order … Check open PRs for a competing index before you generate one"):

```bash
cd /Users/james/projects/github/jamesawesome/Ergomatic-wt-c2pr2
ls app/drizzle/*.sql | tail -3
node -e "console.log(require('./app/drizzle/meta/_journal.json').entries.at(-1))"
gh pr list --json number,headRefName,files --jq '.[] | {number, headRefName, drizzle: [.files[].path | select(startswith("app/drizzle"))]}'
```
  **Measured at `0401ab61`:** `_journal.json`'s last entry is `0022_melodic_purple_man`, so **0023 is the next free index**. That is a fact about a moving target — re-run the three commands at generate time AND again immediately before opening the PR. A competing index means deleting this migration and regenerating off new main, never a journal merge.

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
        weightClass: consumed.weightClass,
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
        weightClass: link.weightClass,
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

  1. **`app/scripts/webauth-contract.test.ts`** — the test "the probe's LinkStatus interface names exactly the keys GET /api/concept2/link emits" carries an INDEPENDENT pinned literal list (`["available","c2UserId","linked","needsReauth","weightClass"]`, sorted) as well as a set comparison, "without it, deleting a key from BOTH files at once would keep the set equality green" (that test's own comment). Add `c2Username` and `logbookBaseUrl` to the pinned list, in sort order. Read `linkResponseKeys()` before writing the response literal: it strips `//` comments, then matches `res.json({...})` with `[^{}]*` and pulls keys with `(?:^|[{,])\s*(\w+)\s*:` — so an ES2015 shorthand key is not a key to it, and a nested object literal inside the response would break the read entirely.
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
  | M13b | write `logbookBaseUrl,` as ES2015 shorthand in the response literal | "the probe's LinkStatus interface names exactly the keys GET /api/concept2/link emits" — the key vanishes from `linkResponseKeys()`'s output while the pinned list and `LinkStatus` still carry it. **This probe is the whole reason the explicit form is prescribed**, and it only bites once step 6b(1) and (2) are both done: written shorthand FROM THE START, with neither file updated, all three stay silently consistent and the key ships unpinned |

---

## Task 4: The Concept2 card, and its CSS

**Files:**
- Create: `app/src/you/Concept2Card.tsx`
- Modify: `app/src/index.css` (append the `.c2-card*` block)
- Test: `app/src/you/Concept2Card.test.tsx`

**Interfaces:**
- Consumes: `useConcept2Link` (Task 1), `describeFailure`/`identityLine` (Task 1), `startLink`'s widened `LinkOutcome` (Task 2), `OptionGroup` (`src/onboarding/OptionGroup.tsx`, unchanged).
- Produces: `default Concept2Card({ email }: { email: string })`, `UNLINK_DISARM_MS`.

**Three things in this task's component are NOT in the board or in an earlier draft, and each is a state a rower can actually reach.** They are called out here rather than left to be discovered in the diff:

1. **The card clears its own attempt state on `pageshow` (invariant I5b, amendment 1k's sibling).** Task 1's hook re-reads the LINK on a bfcache restore, which fixes the case where the link SUCCEEDED. It does nothing for the case where the rower DECLINED: the panel they are stuck behind is drawn from `outcome`/`busy`, and a restore preserves the JS heap, so a declined web attempt comes back showing a buttonless OPENING CONCEPT2 panel with no Try again, forever. That is the exact state observation 19 exists to prevent, and re-reading the link alone leaves it standing. `pageshow` ONLY, never `visibilitychange` — the component's own comment carries the reason, and the lifetime table's Web-API list states it too.
2. **A needs-reauth card whose stored class is unreadable asks for it again (amendment 1k).** `normalizeLink` degrades any `weightClass` that is not exactly `"H"`/`"L"` — `""` included — to `null`, and a RECONNECT wired to `link.weightClass` alone is then permanently disabled under CONCEPT2 STOPPED ACCEPTING THIS LINK, with no reason line and no route out that the copy offers. `reconnectClass = link.weightClass ?? weightClass` plus the ask, rendered only when the stored class is genuinely missing, so exit criterion 3's "asked once" still holds for every ordinary reconnect.
3. **`unlink()` disarms in its `finally`, on EVERY exit.** Invariant I2 names "a second tap" as its first disarmer and the second tap has already happened; disarming only on success leaves a live `Tap again to unlink` sitting under a REASON line, where one stray tap re-fires a DELETE the rower never decided to repeat. Measured: with the disarm on the success path only, TWO of this task's own prescribed tests fail — both look for `Unlink Concept2` after a refused DELETE and find `Tap again to unlink` instead.

**RF8:** the weight-class control is `OptionGroup`, the house roving-tabindex radiogroup, reused — not a fourth hand-rolled one. Its `value: V | null` state is exactly what board 1a needs ("Until a class is picked, Connect is dimmed and inert"), and `OptionGroup.tsx:9-12` records that this nothing-selected case is its own, already covered by its own keyboard tests.

**RF23 enumeration (the board's §"RF23 note" asks for it on the log row; it applies here too).** What already sits on You and could offer or write the same thing: `BaselineEditor` (writes baselines), `RetestShortcut` (navigates to a test), `ResetBaselineSetup` (destroys baselines), the DIAGNOSTICS row (navigates), `Concept2LinkProbe` (dev-only; DOES offer a real link). **The probe is the one overlap and it is deliberate and dev-only** — it never ships in a release build (`dist-grep.sh:127`'s eighth needle), so no rower ever sees two Connect buttons. Nothing on You offers a weight class, an unlink, or a Concept2 link in a production build. No existing offer is displaced.

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
  weightClass: "H",
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
  it("asks the weight class unconditionally and keeps Connect inert until one is picked", async () => {
    mount({ available: true, linked: false });
    await renderCard();
    const connect = await screen.findByRole("button", {
      name: "CONNECT TO CONCEPT2",
    });
    expect(connect).toBeDisabled();
    expect(
      screen.getByRole("radiogroup", { name: "Weight class" }),
    ).toBeTruthy();
    await userEvent.click(screen.getByRole("radio", { name: "Heavyweight" }));
    expect(connect).not.toBeDisabled();
  });

  it("sends the picked class to startLink, and nothing else", async () => {
    const startLink = vi.fn(async (): Promise<LinkOutcome> => ({
      kind: "navigating",
    }));
    mount({ available: true, linked: false }, startLink);
    await renderCard();
    await userEvent.click(
      await screen.findByRole("radio", { name: "Lightweight" }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "CONNECT TO CONCEPT2" }),
    );
    // Exit criterion 3: exactly ONE new user attribute crosses the wire.
    expect(startLink).toHaveBeenCalledWith({ weightClass: "L" });
  });
});

describe("Concept2Card linked (Gate 0 amendment 1c)", () => {
  it("names both principals and shows no weight class", async () => {
    mount(LINKED);
    await renderCard();
    expect(
      await screen.findByText(
        "Concept2 jamesawesome · Ergomatic james@jamestheaweso.me",
      ),
    ).toBeTruthy();
    expect(screen.getByText("LINKED ✓")).toBeTruthy();
    // Board's own approved amendment: "Weight class does not show on linked cards".
    expect(screen.queryByText(/Heavyweight/)).toBeNull();
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

  it("a relink asks for the weight class again, rather than reusing the one picked for the account just removed (invariant I4)", async () => {
    // M21's covering test, rewritten. The earlier draft asserted this from
    // a card that started LINKED, where the weight-class draft had never
    // been set at all — so removing `setWeightClass(null)` from `unlink()`
    // changed nothing observable and the probe could not bite. This one
    // drives the real sequence: pick a class, connect, unlink, and find
    // Connect inert again.
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
      return {
        kind: "linked",
        c2UserId: 2211,
        weightClass: "H",
        stateEchoed: true,
      };
    });
    vi.doMock("../api", () => ({ api }));
    vi.doMock("../adapters/linkFlow", () => ({ startLink }));
    await renderCard();
    await userEvent.click(
      await screen.findByRole("radio", { name: "Heavyweight" }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "CONNECT TO CONCEPT2" }),
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
    expect(connect).toBeDisabled();
    expect(
      screen.getByRole("radiogroup", { name: "Weight class" }),
    ).toBeTruthy();
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
      await screen.findByRole("radio", { name: "Heavyweight" }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "CONNECT TO CONCEPT2" }),
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
      await screen.findByRole("radio", { name: "Heavyweight" }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "CONNECT TO CONCEPT2" }),
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
      weightClass: "H",
      stateEchoed: true,
    }));
    // The server disagrees: it still says unlinked. The card must believe
    // the server, which is exactly what Concept2LinkProbe.tsx:173-176
    // says this surface exists to surface.
    const { api } = mount({ available: true, linked: false }, startLink);
    await renderCard();
    await userEvent.click(
      await screen.findByRole("radio", { name: "Heavyweight" }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "CONNECT TO CONCEPT2" }),
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

  it("reconnects from the STORED weight class and asks nothing (exit criterion 3)", async () => {
    const startLink = vi.fn(async (): Promise<LinkOutcome> => ({
      kind: "navigating",
    }));
    mount({ ...LINKED, weightClass: "L", needsReauth: true }, startLink);
    await renderCard();
    await userEvent.click(
      await screen.findByRole("button", { name: "RECONNECT CONCEPT2" }),
    );
    expect(startLink).toHaveBeenCalledWith({ weightClass: "L" });
    expect(screen.queryByRole("radiogroup")).toBeNull();
  });
});

describe("Concept2Card needs re-auth with no readable class (Gate 0 amendment 1k)", () => {
  it("asks the class again rather than offering a RECONNECT nothing can press", async () => {
    // `normalizeLink` degrades any weightClass that is not exactly "H"/"L"
    // — `""` included — to null. Wiring RECONNECT to `link.weightClass`
    // alone then renders CONCEPT2 STOPPED ACCEPTING THIS LINK above a
    // button that can never be pressed, with no reason line and no other
    // route out except unlinking, which the copy does not offer.
    const startLink = vi.fn(async (): Promise<LinkOutcome> => ({
      kind: "navigating",
    }));
    mount({ ...LINKED, needsReauth: true, weightClass: null }, startLink);
    await renderCard();
    const reconnect = await screen.findByRole("button", {
      name: "RECONNECT CONCEPT2",
    });
    expect(reconnect).toBeDisabled();
    expect(
      screen.getByRole("radiogroup", { name: "Weight class" }),
    ).toBeTruthy();
    await userEvent.click(screen.getByRole("radio", { name: "Lightweight" }));
    expect(reconnect).not.toBeDisabled();
    await userEvent.click(reconnect);
    expect(startLink).toHaveBeenCalledWith({ weightClass: "L" });
  });

  it("still asks NOTHING when the stored class IS readable (exit criterion 3)", async () => {
    mount({ ...LINKED, needsReauth: true, weightClass: "L" });
    await renderCard();
    await screen.findByRole("button", { name: "RECONNECT CONCEPT2" });
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
      await screen.findByRole("radio", { name: "Heavyweight" }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "CONNECT TO CONCEPT2" }),
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
import {
  startLink,
  type LinkOutcome,
  type WeightClass,
} from "../adapters/linkFlow";
import { useConcept2Link, type LinkReadFailure } from "../api/useConcept2Link";
import OptionGroup from "../onboarding/OptionGroup";
import { describeFailure, identityLine } from "./concept2CardModel";

/**
 * Wave E PR2, Surface 1 (board `docs/design/handoffs/2026-08-31-concept2-
 * connect/README.md` states 1a-1e, amended 2026-09-03 by
 * `amendment-2026-09-03.html` states 1f-1k). The rower's only door to the
 * Concept2 link: connect, see which account is linked, unlink.
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

const WEIGHT_OPTIONS: readonly { value: WeightClass; label: string }[] = [
  { value: "H", label: "Heavyweight" },
  { value: "L", label: "Lightweight" },
];

/** One spelling of "what went wrong on the wire", for both the read and
 *  the unlink. `null` status means the request never completed at all. */
function reasonFor(failure: LinkReadFailure): string {
  return failure.status === null
    ? "NO CONNECTION"
    : `THE SERVER ANSWERED ${String(failure.status)}`;
}

export default function Concept2Card({ email }: { email: string }) {
  const { link, failed, reload } = useConcept2Link();
  const [weightClass, setWeightClass] = useState<WeightClass | null>(null);
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
  async function connect(chosen: WeightClass): Promise<void> {
    setBusy(true);
    setOutcome(null);
    try {
      const result = await startLink({ weightClass: chosen });
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
        // Invariant I4: a relink asks again rather than silently reusing
        // the class the rower picked for an account they just removed.
        setWeightClass(null);
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

  // Amendment 1k. The stored class is normally what reconnect mints from,
  // and asking again would break exit criterion 3's "asked once". But
  // `normalizeLink` degrades any `weightClass` that is not exactly "H" or
  // "L" — including `""` and a value a future server renames — to `null`,
  // and a RECONNECT button wired to `link.weightClass` alone is then
  // permanently disabled with nothing on screen saying why. Falling back
  // to the draft turns a dead end into one tap, and it asks for the class
  // only in the case where we genuinely do not have one.
  const reconnectClass = link.weightClass ?? weightClass;

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
              Your link and weight class are kept. Reconnect to send rows again.
            </p>
          </div>
          {link.weightClass === null && (
            <>
              <p className="c2-card-section">WEIGHT CLASS</p>
              <p className="c2-card-explain">
                Your stored weight class couldn&apos;t be read. Pick it again to
                reconnect.
              </p>
              <OptionGroup
                options={WEIGHT_OPTIONS}
                value={weightClass}
                onChange={setWeightClass}
                ariaLabel="Weight class"
              />
            </>
          )}
          <button
            type="button"
            className="c2-card-primary"
            disabled={busy || reconnectClass === null}
            onClick={() => {
              if (reconnectClass !== null) void connect(reconnectClass);
            }}
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
            disabled={busy || weightClass === null}
            onClick={() => {
              if (weightClass !== null) void connect(weightClass);
            }}
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
          <p className="c2-card-section">WEIGHT CLASS</p>
          <p className="c2-card-explain">
            Concept2 requires a weight class. Asked once, at connect.
          </p>
          <OptionGroup
            options={WEIGHT_OPTIONS}
            value={weightClass}
            onChange={setWeightClass}
            ariaLabel="Weight class"
          />
          <p className="c2-card-helper">
            Lightweight: 61.5 kg or under (women) &middot; 75 kg or under (men).
            Otherwise heavyweight.
          </p>
          <button
            type="button"
            className="c2-card-primary"
            disabled={busy || weightClass === null}
            onClick={() => {
              if (weightClass !== null) void connect(weightClass);
            }}
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
/* Wave E PR2, Surface 1 (board 1a-1e + Gate 0 amendment 1f-1k). House card
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

  Also append the OptionGroup override so the weight control is the board's 2-column segmented shape rather than onboarding's stacked rows (`.onb-options` is `flex-direction: column`, `index.css:8749-8753`):

```css
/* Board 1a: "segmented binary control, 2 equal columns, 1px solid
   --rule-3, min-height 44px, selected = --ink fill / --on-color text,
   unselected = --ink-3 on card". `OptionGroup` is reused wholesale (RF8:
   the house roving-tabindex radiogroup and its keyboard tests, not a
   fourth hand-roll); only its LAYOUT differs from onboarding's stacked
   48px rows, so this scopes the override to the card. */
.c2-card .onb-options {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.c2-card .onb-option {
  min-height: 44px;
  justify-content: center;
  border-color: var(--rule-3);
  color: var(--ink-3);
  font-size: 15px;
  font-weight: 600;
}

/* `border` and `padding` in FULL, not just `border-color`. The base rule
   (`index.css`, "2px accent border when checked") sets
   `border: 2px solid var(--accent); padding: 0 13px;` — its own comment
   says the 2px border eats 1px of padding each side so checking never
   shifts the label. Overriding only `border-color` here would inherit
   that 2px width and 13px padding, giving the card a control the board
   does not draw: 1px at rest, 2px when checked, with the label moving.
   Restating both is what makes the selected state the board's flat
   `--ink` fill at a constant 1px. */
.c2-card .onb-option[aria-checked="true"] {
  background: var(--ink);
  border: 1px solid var(--ink);
  padding: 0 14px;
  color: var(--on-color);
}
```

  Two things this block gets right that a first draft did not, both worth keeping in a review's eye:

  - **No `flex-direction: row`.** The rule sets `display: grid`, under which `flex-direction` does nothing at all. An inert declaration in a stylesheet is a false statement about what the rule does, and the next reader has to run the cascade to find out.
  - **Specificity is checked, not assumed.** `.c2-card .onb-option[aria-checked="true"]` is (0,3,0) against the base rule's (0,2,0), so it wins — but confirm it in the browser, because if it did not, the base checked rule would need the `.c2-card` prefix instead and the whole approach would change.

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
  | M16 | `disabled={busy}` on the Connect button (drop the `weightClass === null` clause) | "asks the weight class unconditionally and keeps Connect inert" |
  | M17 | make the first Unlink tap call `unlink()` directly | "does not delete on the first tap" |
  | M18 | change `UNLINK_DISARM_MS` to `8000` | "disarms on its own after 4 s" — this is the probe that proves the deadline test uses INDEPENDENT literals rather than the production constant (RF21) |
  | M19 | delete the `await reload()` from `connect()` | "re-reads the server after every attempt". That test's count assertion is wrapped in `waitFor`, deliberately: `connect()` awaits `startLink` and THEN `reload()`, and `userEvent`'s act wrapper does not guarantee both microtask hops have flushed when the click resolves — a bare count makes this probe bite intermittently, which is a probe that proves nothing |
  | M20 | reconnect passes `weightClass` (the draft) instead of `link.weightClass` | "reconnects from the STORED weight class" |
  | M21 | remove `setWeightClass(null)` from `unlink()` | "a relink asks for the weight class again". **The covering test is rewritten** as a connect → unlink flow: against the earlier draft's LINKED-from-mount card the draft class was never set, so this mutation changed nothing observable and the probe could not bite |
  | M21b | delete the `else { setUnlinkFailed(...) }` branch from `unlink()`, leaving only the `finally` | "says the link is unchanged when the DELETE is refused" |
  | M21c | remove the `pageshow` listener registration from the attempt-clear effect | **"a restore mid-attempt leaves a reachable card, not a frozen OPENING panel"**. This is the probe REWRITTEN: its earlier form ("set `unlinkFailed` but do not clear it at the top of `unlink()`") could not bite at all, because the panel it targets is gated `link.linked && unlinkFailed !== null` and the covering scenario made `link.linked` false anyway — the gate hid the mutant. RUN: red on exactly that test, 20 others green |
  | M21d | drop `setUnlinkFailed(null)` from the top of `unlink()` | "clears the previous REASON the moment a new unlink starts". The `link.linked` gate makes a latched failure unobservable AFTER a successful unlink, so that is not the case to test; what IS observable is a stale REASON sitting over the NEXT attempt while it is still in flight. RUN: red on exactly that test |
  | M21e | move `disarm()` out of `unlink()`'s `finally` and back onto the success path only | "clears the unlink failure when a later unlink succeeds" AND "clears the previous REASON the moment a new unlink starts" — both go looking for `Unlink Concept2` after a refusal and find an armed control. RUN: 2 failed, 19 passed |
  | M-1k | `reconnectClass = link.weightClass` (drop the `?? weightClass` fallback) and stop rendering the ask | "asks the class again rather than offering a RECONNECT nothing can press" |

---

## Task 5: The send block's pure model, and the `StoredLog` fields it reads

**Files:**
- Modify: `app/src/log/storedSummary.ts` (add `c2ResultId`, `c2UserId` to `StoredLog`)
- Modify: `app/src/log/FromTheLog.test.tsx` (fixture `storedRow`), `app/src/log/HistoryList.test.tsx` (`baseStoredRow`), `app/src/log/storedSummary.test.ts` (`baseRow`)
- Create: `app/src/log/concept2Send.ts`
- Test: `app/src/log/concept2Send.test.ts`

**Interfaces:**
- Produces: `isSendable(row): boolean`, `sentResultId(row, link): number | null`, `c2ResultUrl(base, c2UserId, resultId): string`, `SendState`, `readSendResponse(status, body): SendState`.

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

- [ ] **Step 2: Write the failing tests.** `app/src/log/concept2Send.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { LINK_UNAVAILABLE, type Concept2Link } from "../api/useConcept2Link";
import {
  c2ResultUrl,
  isSendable,
  readSendResponse,
  sentResultId,
} from "./concept2Send";

const LINK: Concept2Link = {
  ...LINK_UNAVAILABLE,
  available: true,
  linked: true,
  weightClass: "H",
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

describe("isSendable (mirrors server/concept2/mapping.ts:60-72)", () => {
  it("accepts a finished pm5 row with both work columns", () => {
    expect(isSendable(ELIGIBLE)).toBe(true);
  });

  it("refuses every non-pm5 door", () => {
    for (const source of ["timer", "manual", "no-reading"] as const) {
      expect(isSendable({ ...ELIGIBLE, source })).toBe(false);
    }
  });

  it("refuses every close that is not a natural finish", () => {
    for (const endedBy of [
      "rower",
      "link-lost",
      "program-failed",
      "program-dropped",
      "interrupted",
      null,
    ] as const) {
      expect(isSendable({ ...ELIGIBLE, endedBy })).toBe(false);
    }
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
    // unlink-then-relink-a-different-account: rendering "sent" here would
    // point at a row the current grant cannot see (anchor F8's own case).
    expect(sentResultId({ c2ResultId: 339, c2UserId: 999 }, LINK)).toBeNull();
  });

  it("returns null for an unsent row", () => {
    expect(sentResultId({ c2ResultId: null, c2UserId: null }, LINK)).toBeNull();
  });
});

describe("c2ResultUrl (PR0's measured shape, the server's origin)", () => {
  it("builds /profile/{c2_user_id}/log/{result_id} on the server's own origin", () => {
    expect(c2ResultUrl("https://log-dev.concept2.com", 2211, 339)).toBe(
      "https://log-dev.concept2.com/profile/2211/log/339",
    );
  });
});

describe("readSendResponse (409 carries THREE meanings; never key on status)", () => {
  it("reads a 200 as sent", () => {
    expect(readSendResponse(200, { resultId: 339 })).toStrictEqual({
      kind: "sent",
      resultId: 339,
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

  it("treats an availability or unlink refusal as the block disappearing, never as a failure the rower retries", () => {
    // These two mean the block's own preconditions stopped holding: the
    // flag flipped off, or the rower unlinked in another tab. There is
    // nothing to retry and nothing to say.
    expect(readSendResponse(403, { error: "unavailable" })).toStrictEqual({
      kind: "gone",
    });
    expect(readSendResponse(409, { error: "unlinked" })).toStrictEqual({
      kind: "gone",
    });
  });

  it("SHOWS an eligibility refusal, because it means the two predicates disagree", () => {
    // Split from the case above deliberately. A 422 is not a precondition
    // lapsing, it is the client's mirror of `eligibilityFailure` and the
    // server's own copy answering differently about the same row — the one
    // divergence the cross-tree seam test exists to catch. A block that
    // vanishes on tap reports it to nobody.
    expect(
      readSendResponse(422, { error: "not_eligible", reason: "not_finished" }),
    ).toStrictEqual({
      kind: "failed",
      reason: "CONCEPT2 WON'T TAKE THIS ROW · NOT FINISHED",
    });
    expect(readSendResponse(422, { error: "not_eligible" })).toStrictEqual({
      kind: "failed",
      reason: "CONCEPT2 WON'T TAKE THIS ROW · NOT ELIGIBLE",
    });
  });

  it("names the tz refusal specifically, by its field", () => {
    expect(
      readSendResponse(400, {
        error: "tz must be an IANA timezone name",
        field: "tz",
      }),
    ).toStrictEqual({
      kind: "failed",
      reason: "COULDN'T READ THIS DEVICE'S TIME ZONE",
    });
  });

  it("degrades a malformed 200 rather than rendering SENT with no id", () => {
    expect(readSendResponse(200, {}).kind).toBe("failed");
    expect(readSendResponse(409, { error: "duplicate" }).kind).toBe("failed");
  });

  it("uses no em-dash in any reason (house style)", () => {
    // Mapped, never `if (…) expect(…)`: `vitest/no-conditional-expect` is
    // on in `eslint.config.js` and fired on this block's first draft. The
    // rule is right — a conditional expect silently asserts NOTHING when
    // the condition is false, which for a "no em-dash anywhere" claim is
    // the failure mode being tested for.
    const reasons = (
      [
        [502, { error: "c2_error" }],
        [404, {}],
        [418, {}],
      ] as const
    ).map(([status, body]) => {
      const state = readSendResponse(status, body);
      return state.kind === "failed" ? state.reason : null;
    });
    expect(reasons).toStrictEqual([
      "CONCEPT2 ERROR · 502",
      "THIS ROW IS GONE",
      "COULDN'T SEND THIS ROW · 418",
    ]);
    expect(reasons.join(" ")).not.toContain("—");
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

export type SendState =
  | { kind: "idle" }
  | { kind: "sending" }
  | { kind: "sent"; resultId: number }
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
  | { kind: "failed"; reason: string };

function field(body: unknown, key: string): unknown {
  return typeof body === "object" && body !== null && key in body
    ? (body as Record<string, unknown>)[key]
    : null;
}

/**
 * `POST /api/concept2/results/:logId`'s answer -> the block's state.
 *
 * EVERY branch keys on `body.error`, never on the status alone, because
 * that route answers 409 with three different meanings:
 * `unlinked` (`routes/concept2.ts:614`), `needs_reauth` (`:618`, `:848`)
 * and `duplicate` (`:897`). Branching on `409` would collapse a rower who
 * must reconnect, a rower who unlinked, and a row Concept2 already has.
 */
export function readSendResponse(status: number, body: unknown): SendState {
  const error = field(body, "error");
  if (status === 200) {
    const resultId = field(body, "resultId");
    return typeof resultId === "number"
      ? { kind: "sent", resultId }
      : { kind: "failed", reason: "CONCEPT2 ANSWERED WITHOUT A RESULT ID" };
  }
  if (error === "duplicate") {
    const resultId = field(body, "c2ResultId");
    // The 409's id is what makes the duplicate state useful AND durable:
    // the route writes it to the row before answering (`:890-895`, RF25),
    // so the next mount reads SENT. Without an id there is nothing to
    // link to and nothing was recorded — that is a failure, not a
    // duplicate.
    return typeof resultId === "number"
      ? { kind: "duplicate", resultId }
      : {
          kind: "failed",
          reason: "CONCEPT2 REJECTED A DUPLICATE WITHOUT AN ID",
        };
  }
  if (error === "needs_reauth") return { kind: "reauth" };
  if (error === "unlinked" || error === "unavailable") return { kind: "gone" };
  // `not_eligible` is NOT one of those, and folding it in with them was a
  // defect: `unlinked` and `unavailable` mean the block's own preconditions
  // stopped holding and it should not be on screen at all. A 422 means the
  // CLIENT predicate and the SERVER predicate disagree about this row —
  // exactly the drift `server/routes/concept2Send.integration.test.ts`
  // exists to detect — and drawing it as the block silently vanishing on
  // tap shows the rower a control that was there a second ago and now is
  // not, while telling nobody. It is a failure, it names itself, and the
  // divergence becomes visible in the field rather than only in CI.
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
    { weightClass: "H" },
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
  weightClass: "H",
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
    weightClass: "H",
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

  const status =
    state === "sent"
      ? "SENT"
      : state === "duplicate"
        ? "ALREADY THERE"
        : state === "reauth"
          ? "RECONNECT NEEDED"
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

      {state === "reauth" && (
        <p className="c2-send-line">
          Concept2 stopped accepting this link. Reconnect on the You tab, then
          send this row again.
        </p>
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
      weightClass: "H",
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

  **The choice made, stated rather than implied.** Two options were on the table: break the type chain (move `Concept2Link` into a runtime-free module so `WeightClass` no longer drags the adapter graph in), or widen the type-check config's `lib`. **We widen the lib**, because breaking the chain means either duplicating the `WeightClass` union — a second definition of a two-member type that must agree with `linkFlow`'s forever — or splitting `useConcept2Link.ts` into a shape module and a hook module purely to satisfy a compiler flag. Neither buys anything a reader would thank us for.

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
      .send({ weightClass: "H" });
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
  - **`connect asks the weight class, then hands off`** — `{available:true, linked:false}`; assert Connect is disabled, pick Heavyweight, assert enabled; route `POST /connect` to `{authorizeUrl: "/api/concept2/callback?stub=1", state: "s"}` and assert the navigation is attempted.
  - **`a linked account names itself and unlinks in two taps`** — `{available:true, linked:true, …}`; assert the identity line; tap Unlink; assert no DELETE fired; tap again; assert the DELETE and that the card returns to the unlinked state.
  - **`a qualifying row offers Send; a timer row does not`** — two seeded rows, one `pm5`/`finished`, one `timer`; open each detail door; assert the block on one and its total absence on the other.
  - **`send -> SENT with the result link`** — route `POST /results/*` to `200 {resultId: 339}`; tap Send; assert `Accepted by Concept2.`, `RESULT 339`, and that the link-out's target is `https://log-dev.concept2.com/profile/2211/log/339`. (Assert the URL the button would open, not a navigation: `openReadOnlyUrl`'s web arm opens a new context and Playwright would need a popup handler; use `page.waitForEvent("popup")` if asserting the real open, and say which you did.)
  - **`send -> 409 duplicate -> ALREADY THERE`** and **`send -> 502 -> SEND FAILED with a REASON and a retry`**.
  - **`coming BACK from Concept2 re-reads the link, without a remount`** — observation 19 and invariant I5, and the only gate in this repo that can observe the bfcache path at all. Route `GET /link` to `{available:true, linked:false}`; open You; stub the mint so the hop lands on a page inside the app's own origin (a stubbed callback page is enough — nothing about the real OAuth hop is being tested here); tap Connect and let the document navigate; **flip the routed `GET /link` to a LINKED response**; then `await page.goBack()` and assert the card reads `LINKED ✓` with its identity line, with no reload driven by the test. If the browser reloads rather than restoring, the mount read gets there first and the test passes for the boring reason — **say which happened in the task report**, because "it passed" and "the listener fired" are different facts and only the second one is evidence for the `pageshow` half of Task 1.
  - **`a read that fails says so and retries`** — route `GET /link` to a 502; assert `Couldn't reach Concept2 linking.` and a `REASON` naming the status; re-route to `{available:true, linked:false}`; tap `Retry`; assert the unlinked card appears. Amendment 1i, and the counterpart of the invisibility case above: these two must not look the same on screen.
  - **`an unlink the server refuses says the link is unchanged`** — linked; route `DELETE /link` to a 500; two taps; assert `Couldn't unlink. Your link is unchanged.` and that the card still reads `LINKED ✓`. Amendment 1j.

- [ ] **Step 2: Append structural design assertions to `design.spec.ts`** — per `docs/TESTING.md`'s structural-design rule: every tappable in the card and the block measures ≥ 44px, and the card's own computed colours resolve to the tokens this plan names (not to raw hex). Measure the flex ITEM, never an inline element (RF21's second smell: `scrollWidth`/`clientWidth` are `0` on inline elements).

- [ ] **Step 3: Append screenshots**, seeded with REAL data (RF7) and each awaiting a real element before capturing (`screenshots.spec.ts:325-338`'s own lesson: the one capture that skipped the `waitFor` committed a blank cream rectangle):

  | capture | seed |
  | --- | --- |
  | `you-concept2-unlinked.png` | `{available:true, linked:false}`, Heavyweight picked so Connect is live |
  | `you-concept2-linked.png` | linked, username `jamesawesome`, real signed-in email |
  | `you-concept2-armed.png` | linked, one tap on Unlink |
  | `log-concept2-idle.png` | a real eligible monitor row, linked account |
  | `log-concept2-sent.png` | the same row, with `c2ResultId: 339` / `c2UserId: 2211` injected by `page.route("**/api/logs/*", …)` on the DETAIL response — **not** seeded into the column |
  | `you-concept2-read-failed.png` | `GET /link` routed to a 502, so the card shows amendment 1i's panel and its Retry |

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
  2. **The parent spec's `weight_class` premise** — "GET /api/users/me returns 13 fields, none of them weight (V10)". Replace with the MEASURED list (sixteen fields, `weight` present, no `weight_class`), the date and provenance of the measurement (1.75a plan observation 3, live log-dev response 2026-09-02), and the conclusion that survives: `weight` is a mass, `weight_class` is C2's competition binary, and deriving one from the other needs a unit we have not measured and a gender-specific threshold. **Correct the claim where it was ARGUED and everywhere it was USED** — the board's conditional-ask amendment cites it.
  3. **The board's `LogRow.tsx` pointer** — the handoff README's "About the Design Files" section. Correct to `FromTheLog.tsx` with observation 1's reason.
  4. **The board's approved-amendments list** — record the six Gate 0 changes and every new state the amendment draws (1f, 1g, 1h, 1i, 1j, **1k**, 2f, **2c-b**, **2h**, and the REASON lines), with the amendment file's path, so the README describes the surface as built.
  5. **`docs/design/DEVIATIONS.md`** — a row for the link-out's accent (observation 15 / amendment §5), naming the four canonical meanings, this fifth use, the ruling, and why a token was not minted. DEVIATIONS documents CURRENT STATE (RF9), so write it as the state, not as a history.
  6. **`app/src/adapters/externalBrowser.ts:1-6`** — its header says "PR2's read-only 'View on Concept2' link-out is the next one". It is no longer next; it is here, and it takes `openReadOnlyUrl`, not `openExternalUrl`. Reconcile.

  9. **`app/server/db/schema.ts`'s `tz` comment** — *"tz: the client's IANA zone; posted at save from PR2 on, or written by the upload route's first legacy send"*. As of Task 6 the first clause is TRUE for the first time, and the second is what happens to rows saved before this build. Rewrite it to say which is which as of this head, and name Task 6's `completionStamp` as the producer, so the next reader can find it in one grep instead of discovering there is none. The `completedAt` half of the same comment gets the same treatment.

  10. **The parent spec's mapping row** — it describes the `loggedAt`/`effectiveTz` branch as the "fallback for legacy rows". Before Task 6 that was not a fallback, it was the ONLY path, and the sentence has been describing an intention rather than the code since PR1 merged. Correct it where it is ARGUED and everywhere it is USED: state that the paired branch went live with PR2's client producer, that "legacy" means rows saved by a build predating it, and that the two are distinguishable in the database by `completed_at IS NULL`.

  12. **`POST /api/logs`'s tz refusal, wherever it is described as a refusal.** Task 6 step 4b makes an unrecognised zone a DEGRADE on that route while the upload route keeps its strict 400, and two committed tests said the opposite in their own titles. Add `"tz must be an IANA timezone name"`, `"rejects an invalid tz"` and `"rejects a non-IANA tz"` to step 1's phrase census and reconcile every hit: the spec's own §Stored shapes line if it names the refusal, `server/db/schema.ts`'s `tz` comment (which item 9 below already rewrites), and the two test titles themselves. The invariant sentence — **a Concept2 field can never cost a rower their row** — goes in the spec beside the mapping row, not only in a code comment, because it is a product rule and the next person to tighten a validator needs to meet it.

  11. **`app/server/routes/concept2.ts:405-407`'s "never renders an empty identity" comment** — Task 3 step 5b makes that claim true; until then it sat above a `??` that could render exactly one. Reconcile it to say WHY (`||`, because an empty string is a string), rather than deleting it: the claim is the useful part and the guard is what earns it.
  7. **`ROADMAP.md`'s Wave E PR2 checkbox** (`:1275-1278`) — tick it, and add the follow-ons this PR names rather than leaving them in the PR body (RF14): (a) the fake-Concept2 e2e service that ruling (v) declined; (b) the conditional weight-class ask, if ruling (i) went to A, as the two-phase-link design it would need; (c) **the delete-vs-sent question** raised in Task 7's RF23 enumeration — deleting a row that is already on Concept2 leaves the Concept2 row standing, which matches the unlink copy's position but is nowhere stated to the rower at the delete confirm; (d) **rows saved before Task 6** carry `completed_at IS NULL` and will always upload with their save clock as C2's date — there is no backfill and there cannot be one, since the close instant was never recorded. Say so as a known, permanent property of pre-PR2 rows rather than letting a future reader read it as a bug.
  8. **`ROADMAP.md`'s "still owed after both PRs" list** (`:1262-1274`) — remove "PR2's surface + its Gate 0 identity-copy amendment" once this PR lands it, leaving the flag flip, write approval and live-portal registration.

- [ ] **Step 3: Run `pnpm lint typecheck format:check`.** Root markdown is NOT Prettier-formatted (CLAUDE.md) — **never run `prettier --write` on `ROADMAP.md` or `CLAUDE.md`**; wrap by hand to match the surrounding text.

---

## Task 14: The PR, its fold, and the release call

**Files:**
- No source changes. The PR body, the ROADMAP if the census moved anything, and the release recommendation.

- [ ] **Step 1: Reconcile before opening** (agent briefing's controller checklist): `git merge origin/main`; gates green on the merged tree; a CI run EXISTS for the exact head and is green (an empty check rollup is not green); the body names the current head and every figure in it is current; re-run Task 13's census.

- [ ] **Step 2: The fold.** Above the fold, exactly this. **Measured, not felt** (CLAUDE.md's countable form is ~120 words and ~25 per bullet): **112 words total, 5 bullets, longest bullet 22 words.** Recounted 2026-09-03 over the block below by splitting on whitespace and stripping markdown emphasis from each bullet before counting — the earlier claim of 23 counted the `**` markers as part of a word. If the text changes, recount with the same method; do not carry these numbers forward unchanged, and do not restate them anywhere else in the plan.

```markdown
This PR puts Concept2 in front of the rower: link an account on You, send a finished monitor row from its log page, see where it landed.

- **You gains a Concept2 card.** Connect, one weight-class question, and which account is linked. Unlink takes two taps.
- **A finished monitor row gains Send.** It says SENT, ALREADY THERE, or why it failed, and links to the result on Concept2.
- **Nothing appears until the server says so.** Every deployment today looks exactly as it does now.
- **Testers see this once the flag flips**, which still waits on Concept2's write approval.
- **Try it:** You tab, then any PM5 row you finished.
```

- [ ] **Step 3: Everything else goes in a collapsed `<details>` block titled "Record (for agents and audits)"** — the Gate 0 approval, the rulings and their answers, every mutation probe with the exact failure text, per-file coverage for the six new source files (`api/useConcept2Link.ts`, `you/concept2CardModel.ts`, `you/Concept2Card.tsx`, `log/concept2Send.ts`, `log/Concept2SendBlock.tsx`, `session/completionStamp.ts`) from the HTML report under `app/coverage/`, saying that is the source rather than the text reporter, which omits some directories, the `dist:grep` red-then-green proof, the census outputs, and the screenshots.

  **The Record also names Task 6 explicitly, and the fold does not.** No bullet above the fold says "we fixed the date" — from a rower's side there is nothing to announce, because the feature simply works correctly the first time they see it, and a bullet would advertise a defect that never reached them. The Record states it plainly: PR1 shipped the `completed_at`/`tz` columns with no client producer, so `buildC2Payload`'s accurate branch had never fired; Task 6 is that producer; rows saved before this build have no close stamp and never will.

- [ ] **Step 4: The risk note.** Name what a reviewer should probe: the two cross-tree predicates staying in step, the `busy` union change against `scripts/webauth-contract.test.ts`, the `.onb-option` CSS override's specificity, the `lib` widening in `tsconfig.server.json` and the explicit pin that stops it reaching the shipped server, whether Task 6's stamp is genuinely the run's own close instant on every door that posts it, and the one thing no gate in this repo can reach — the native arm, which only a device walk sees.

- [ ] **Step 5: Gates.** This PR is TRIAD on all three counts, not "adjacent": Task 6 changes what a NUMBER means on a third party's permanent record, ruling (ii)=B adds a STORED SHAPE, and the whole surface is the only door through which a rower creates or destroys an OAuth grant. **The full cycle applies**: the design gate was Task 0, this plan went through the `harden` skill's two lenses before implementation, and the PM final-PR gate runs on the PR. State all three, and state what each one found — a gate reported without its findings is a gate nobody can audit.

- [ ] **Step 6: The release call.** **This PR is the wave's first tester-visible piece** — PR0 through PR1.75b were all dark. So:
  - **The notes cover the whole feature, not this PR's diff.** PR1's routes, PR1.5's browser hop, PR1.75a's server binding and PR1.75b's native return all shipped with no note, because none of them changed anything a tester could see. The note a tester reads is "connect your Concept2 logbook and send finished rows to it", written once, here.
  - **RF15:** before cutting the tag, run `git log <prev-tag>..main --oneline` **WITHOUT `--merges`** (main is squash-merged and has no merge commits) and account for every entry with a note or a stated reason it needs none. Parallel sessions make this the normal case.
  - **The word "sync" appears in no note for this wave** (spec §Out of scope, PM): nothing here syncs.
  - **The recommendation itself is conditional and must say so:** the surface ships dark. `C2_LINK_ENABLED=1` on a real cohort is gated on Concept2's write approval being CONFIRMED and the live-portal registration of the native redirect (ROADMAP's C2 register row) — neither is code, and neither is this PR's to discharge. So: **release recommended** (the app changes, testers get the capability the moment the flag flips), with the note saying plainly that the card appears only once the connection is switched on.
  - **Agent configs:** say explicitly which, or "no change needed: <why>". Candidates this plan already surfaced: the paste-test finding that a required-and-nullable field addition names its own broken fixtures, and that the same measurement does NOT transfer to a different type's input (observations 6 and 20 counted three and fifty-three respectively, for two changes that look identical); RF16's second corollary earning another instance (observation 7: a real citation, under-read); and the technique behind observation 17 — **when planning PR N, grep the repo for the PR's own name, because a comment assigning work to it is a requirement nobody else is tracking**.

---

## Self-review

**Spec coverage.** §Surfaces 1 (You card: unlinked, waiting, linked, unlink-confirm, link-failed) → Tasks 4 and 8. §Surfaces 2 (log row: idle, sending, sent with link-out, duplicate, failed; non-qualifying and not-linked absence) → Tasks 5 and 7. §Architecture 4 (`GET`/`DELETE /link`) → Tasks 1, 3, 4. §Architecture 5 (upload route, 409 recovery) → Tasks 5, 7, 10. §Architecture 8 (availability as a capability gate) → Tasks 4, 7, 11. §Stored shapes (sent-state authority, F8) → Tasks 5 and 10; (the close stamp, anchor K3) → Task 6. Exit criterion 3 (one new PII attribute) → Task 4's tests. Exit criterion 2 (a linked user sends an eligible row ON THE PHONE, with duplicate and failure each observed for real) → **NOT discharged by this PR: it needs a device walk against a flag-on server, and that walk is a separate card.** Named here rather than implied. Task 6 adds one observation to that walk (its step 8), and it is the only one with a stated precondition that makes a NO possible.

**Gaps, stated.** (a0) The `pnpm build` / `pnpm dist:grep` claims were not re-measured in this revision; Task 9 runs them and records its own numbers, and the paste-test receipt says so rather than carrying an inherited row. (a) The web OAuth hop is exercised by no automated gate — ruling (v) declines the fake-Concept2 service and Task 11 says so in the spec header. (b) The native arm is reachable by no gate in this repo (RF19); `Concept2LinkProbe` plus a walk is the whole instrument, and this PR does not add one. (c) Exit criterion 2 above. (d) `pageshow`'s availability at the deployment floor is unconfirmed by any primary source; the design degrades to a mount-only read if it never fires, and Task 11's Back case is the only evidence this repo can produce (see the lifetime table's Web-API list). (e) Rows saved before Task 6 carry no close stamp and will upload with their save clock forever — no backfill is possible, because the instant was never recorded. (f) Task 6 step 4b's degrade cannot be observed on any device this project can produce: it fires only when the phone's zone list and the server image's disagree, and every gate here runs both on one machine. What the change is defended by is the invariant, not an observation — a refusal on that route costs a rower a completed workout, and the field it refuses over exists only to date a third party's copy of it.

**Type consistency.** `Concept2Link` is defined once (Task 1) and consumed by Tasks 3, 4, 5, 7, 10. `LinkReadFailure` once (Task 1), consumed by Task 4 for BOTH the failed read and the failed unlink — one spelling of "what went wrong on the wire", so `reasonFor` has one caller shape rather than two. `SendState` once (Task 5), consumed by Task 7. `LinkOutcome`'s `busy` member is widened in Task 2 and read in Task 1's `describeFailure` — **land Task 2 before or with Task 1**, since `describeFailure`'s `busy` arm does not compile against the current union. `isSendable`/`sentResultId` are named identically in Tasks 5, 7 and 10. `logbookBaseUrl` is the same name in the server response (Task 3), the client type (Task 1) and the URL builder (Task 5). `completionStamp` (Task 6) is imported by the client door that posts and by the server test that gates the seam — it has no imports of its own, deliberately, so the cross-tree hop drags nothing with it.

**Ordering.** Task 2 before or with Task 1 (the union). **Task 6 before Task 7**: Task 7 puts a Send button in front of a rower, and every row sent before Task 6 exists carries the wrong date on a record that cannot be re-dated. Task 3 before Task 4 (the card reads `c2Username`). Task 10 after Tasks 5 and 7 (it imports both trees' predicates). Everything else is independent.

**Completeness of the prescribed code.** Every `it()` body in this plan is runnable code, and "runnable" means it was RUN: the whole prescribed set was placed at its real paths at head `df20687c`, compiled, linted and executed together, and every block below is written as it ran green. Where a block depends on a harness helper, the plan now names that helper by its REAL name read at this head — `buildApp`/`mintAndGetState`/`asACookie`/`freshLink` in `concept2.test.ts`, `buildMonitorFixture`/`parsedBodies`/`renderManualLog` in `LogSession.test.tsx`, `closedFreeRow`/`savedBody`/`commitHandoff` in `JustRowLog.test.tsx`, `bearerToken`/`logBody` in `completedAt.integration.test.ts`, `renderFromTheLog`/`storedRow`/`mockApi` in `FromTheLog.test.tsx` — rather than a plausible-sounding stand-in. An earlier draft invented `makeApp` and `mintState`, which is why three of its mutation probes gated tests that could not be pasted.

**What the placement changed, and why none of it is bookkeeping.** Each of these is a block that would have failed in a task round: a comment inside `LinkStatus`'s braces reads as a key to the contract gate (Task 3 step 6b); `unlink()` disarming only on success broke two of this plan's own tests and contradicted invariant I2 (Task 4); `You.test.tsx`'s `./api` factory has to delegate to global `fetch` or an unrelated baseline test loses its own field (Task 8); the Just Row assertion literal belonged to the TIMER fixture, not the monitor one (Task 6); `Concept2SendBlock.test.tsx` importing `FromTheLog.test.tsx` re-registers 63 foreign tests inside its own run (Task 7); and four prescribed `vi.fn(async (path, init) => …)` mocks tripped `noUnusedParameters` on the parameter each one does not read.

**Mutation adequacy is stated per probe, not asserted in aggregate.** Every probe added or rewritten in this revision carries the exact test it must redden and, where it was run, the observed result. Two probes were REWRITTEN because they could not bite as specified — M21c (the panel it targeted was hidden by a `link.linked` gate the covering scenario flipped) and M6c (a sibling change to the read path meant the mutant still reported the right status against the old test) — and both now name a different, reachable case rather than being deleted or left green.
