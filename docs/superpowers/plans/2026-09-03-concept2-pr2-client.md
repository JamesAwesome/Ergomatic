# Wave E PR2 — the rower-facing Concept2 surface (implementation plan)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Hardened 2026-09-03: lens 1 + paste-test folded** (`.claude/skills/harden/SKILL.md`).

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

Every prescribed code block below was extracted to its REAL path in the worktree, at head `0401ab61`, and run through the repo's own gates — client AND server, tests included, with Docker up for the integration project. The tree was restored afterwards (`git status --short` and `git diff --stat` both empty at `0401ab61`).

| Gate | Command | Result |
| --- | --- | --- |
| typecheck | `pnpm typecheck` | 0 errors |
| lint | `pnpm lint` | 0 problems |
| format | `pnpm format:check` | clean; `pnpm format` reflowed nothing |
| unit | `pnpm test --project unit` | 58 files, 1797 passed, 1 skipped |
| client | `pnpm test --project client` | 176 files, 4757 passed |
| integration | `pnpm test --project integration` | 24 files, 369 passed |
| bundle | `pnpm build` then `pnpm dist:grep` | PASS, 8/8 needles absent |
| bundle, red proof | `VITE_ENABLE_C2_LINK_PROBE=1 pnpm build` then `pnpm dist:grep` | exit 1, naming the eighth needle |
| bundle, restored | `pnpm build` then `pnpm dist:grep` | PASS again |
| product card present | `grep -rl "CONNECT TO CONCEPT2" dist/client` | present, as designed |
| shell blocks | `bash -n` over every prescribed block | syntax-clean |
| mutations | 40 prescribed probes, applied and reverted one at a time | 34 bit; M1, M15, M21, M14 did not, and are rewritten below; M39/M40's covering test is now written out in full |

**The receipt covers the server.** The earlier scoped-lint receipt (five client source files only) is what hid `vitest/prefer-strict-equal` and `vitest/no-conditional-expect` firing on this plan's own TEST blocks, and hid three server ripples entirely: `scripts/webauth-contract.test.ts`'s pinned key list, `src/monitor/Concept2LinkProbe.tsx`'s `LinkStatus` interface, and `server/db/schema.integration.test.ts`'s migration-boundary block. All three are now named in the tasks that cause them.

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

Two further items the amendment asks James to approve but which need no code branch: the six copy/shape changes in its §0, and the new states it draws — 1f needs-reauth, 1g update-required, 1h unavailable, **1i the read failed**, **1j the unlink was refused**, 2f row-level reconnect, and the REASON lines. **1i is the one that changes what a rower is TOLD** rather than how something looks: an earlier revision of the amendment drew a refused read as absence, which says "this deployment has no Concept2" to a rower whose deployment does.

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

`adapters/linkFlow.ts`'s `startLink({weightClass}) → LinkOutcome`, 16 members (`:79-106`), 17 after Task 2's `busy` split is counted by source. Every member's card treatment is tabulated in the amendment's §1e.

Eligibility, server-side and authoritative (`server/concept2/mapping.ts:60-72`): `source === "pm5"` AND `endedBy === "finished"` AND `workSeconds !== null` AND `workMeters !== null`. **Measured audience:** 6 of 20 prod rows pass this fence (`docs/monitor/c2-crossconnect-2026-09/README.md`, "Eligible-population count", recounted at #244 finding 4).

## Lifetime table (RF27)

Every piece of state this PR introduces, with its mint site, its clear sites, and what survives each boundary. **The invariants, stated first, because a mechanism is not an invariant:**

- **I1.** The card's view of the link is never inferred from an outcome. After every attempt the card re-reads `GET /api/concept2/link` and renders what the SERVER says. An outcome saying `linked` while the server disagrees must render as not-linked.
- **I2.** The unlink arm is armed by exactly one tap and disarmed by exactly one of: a second tap, four seconds elapsing, or the card unmounting. It can never survive a navigation away from You.
- **I3.** A row's sent state is a fact about the row and the LIVE link together. It is re-derived on every render from `(row.c2ResultId, row.c2UserId, link.c2UserId)` and is never cached across a link change.
- **I4.** The weight-class draft is transient and per-mount. It is never persisted, never sent except in a mint body, and is cleared by a successful unlink so a relink asks again.
- **I5.** The card's view of the link is refreshed on every occasion the DOCUMENT becomes visible to the rower again, not only on mount. A restore that skips mounting must not leave a stale panel on screen (observation 19). The refresh is idempotent: it re-reads and re-renders, and it never mints, retries or cancels anything.
- **I6.** Every failure the rower can act on carries a discriminator. A read that failed says so and offers a retry; an unlink that failed says the link is unchanged. Neither is allowed to render as its own success, and neither is allowed to render as `unavailable`, which means something else entirely.

| State | Owner | Mint site | Clear sites | Survives unmount? | Survives relaunch? | Survives a link change? |
| --- | --- | --- | --- | --- | --- | --- |
| `link` (`Concept2Link \| null`) | `useConcept2Link` | mount effect's `reload()`, and every later `reload()` | replaced by every successful `reload()`; `null` only before the first read resolves | no | no | it IS the link |
| `failed` (`LinkReadFailure \| null`) | `useConcept2Link` | a non-`ok` response, or the `reload()` catch | set to `null` by any successful `reload()` | no | no | n/a |
| the `pageshow` + `visibilitychange` listeners | `useConcept2Link` | the same effect that runs the first `reload()`, via `window.addEventListener` | that effect's cleanup (`removeEventListener` for both), which runs on unmount and on nothing else — the effect's dep array is `[reload]` and `reload` is a `useCallback` with an empty dep array, so it is minted once per mount | no — removed on unmount, which is what stops a dead card re-reading | no | n/a: it observes the link, it does not hold one |
| `weightClass` draft | `Concept2Card` | the rower's tap on the radiogroup | successful unlink; unmount | no | no | reset on unlink (I4) |
| `outcome` (`LinkOutcome \| null`) | `Concept2Card` | `startLink` resolving | set to `null` at the start of each `connect()`; cleared by a successful unlink; unmount | no | no | superseded by the next attempt |
| `busy` | `Concept2Card` | `connect()` / `unlink()` entry | those functions' `finally` — every exit, never only the happy one | no | no | n/a |
| `unlinkFailed` (`number \| null`, the refusing status) | `Concept2Card` | `unlink()`'s `else` branch, and its `catch` | set to `null` at the start of every `unlink()`; a successful unlink; unmount | no | no | n/a |
| `armed` + `disarmRef` timer | `Concept2Card` | `arm()` (one tap) | `disarm()` (second tap or successful unlink), the 4 s timeout, and the unmount cleanup (`useEffect(() => disarm, [disarm])`) | **no — cleared on unmount, which is I2's whole point** | no | n/a |
| `send` (`SendState`) | `Concept2SendBlock` | `post()` entry | replaced by each response; unmount | no | no | recomputed against the fresh link (I3) |
| `linkInFlight` | `adapters/linkFlow.ts` module scope | `startLink` entry (`:289`) | `startLink`'s `finally` (`:328-332`) | **yes — module scope survives component unmount** | no (a WebView reload destroys the module) | n/a |

`linkInFlight` is the one piece of state that outlives the card, and deliberately: its own comment (`linkFlow.ts:108-113`) records that the AUTHORITY on "one link session per app process" is Swift's `activeSession`, and this flag exists only so a double-tap in one document does not mint twice. **This PR adds no module-scoped state of its own.**

**Web APIs this PR uses, against `IPHONEOS_DEPLOYMENT_TARGET = 15.0`** (`ios/App/App.xcodeproj/project.pbxproj:247`), per RF27:

- `window.open` (Task 2, web arm only) — universally available; the native arm never reaches it.
- `visibilitychange` / `document.visibilityState` (Task 1) — **already shipped in this app at this floor**: `src/adapters/appLifecycle.ts:76-80` and `src/adapters/keepAwake.ts` both subscribe to it on the web arm, on builds that have been through TestFlight. In-repo precedent, not a claim about WebKit (PRIMARY, this repo).
- `pageshow` (Task 1) — no in-repo precedent, and no primary WebKit availability line is quoted here, so treat its presence as UNCONFIRMED at the floor (INFERENCE only). **The design does not depend on it:** the listener is a pure additive refresh, so if `pageshow` never fires the card behaves exactly as it does today — a mount-only read — and nothing regresses. That is why it ships without a floor citation rather than waiting for one. The implementer states in the task report whether the e2e Back case (Task 11) actually observed the refresh, which is the only evidence this repo can produce for it.

---

## Task 0: Gate 0 — the amendment, approved before anything is built

**This is a gate, not a build step. No task below starts until it returns APPROVED.**

**Files:**
- Already written: `docs/design/handoffs/2026-08-31-concept2-connect/amendment-2026-09-03.html`

**Interfaces:**
- Produces: James's ruling on (i)-(v), on the amendment's six copy/shape changes, and on every new state it draws (1f, 1g, 1h, 1i, 1j, 2f, and the REASON lines). Every task below cites the amendment for its copy.

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

beforeEach(() => {
  vi.resetModules();
  vi.restoreAllMocks();
});
afterEach(() => {
  vi.doUnmock("../api");
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
    const api = vi.fn(async () => new Response("<html>502</html>", { status: 502 }));
    vi.doMock("../api", () => ({ api }));
    const { useConcept2Link } = await import("./useConcept2Link");
    const { result } = renderHook(() => useConcept2Link());
    await waitFor(() => expect(result.current.failed).not.toBeNull());
    expect(result.current.failed?.status).toBe(502);
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

    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => "hidden",
    });
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(api).toHaveBeenCalledTimes(1);

    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => "visible",
    });
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

  The `document.visibilityState` override idiom above is the repo's own — `src/adapters/appLifecycle.test.ts:12-30` and `src/adapters/keepAwake.test.ts:12-46` both do exactly this. Reuse it rather than inventing a third.

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
   *  server's own `C2_BASE_URL` (`server/index.ts:119`). The client cannot
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
    logbookBaseUrl:
      typeof raw.logbookBaseUrl === "string" ? raw.logbookBaseUrl : null,
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
 * explicitly. Without that, `res.json()` on an HTML error body would throw
 * into the `catch` and lose the status on the way.
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
          const body = (await res.json()) as unknown;
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
 * TOTAL over the union with no `default`, deliberately: a seventeenth
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
  | M3 | `describeFailure`: return `null` for `busy` unconditionally (the pre-split behaviour) | "separates the two busy sources" |
  | M4 | `describeFailure`: return `FAILED_LINE` for `declined` | "gives a declined link its own line" |
  | M5 | `identityLine`: swap to `` `Ergomatic ${email} · Concept2 ${c2}` `` | "names the Concept2 username and the Ergomatic email, in the callback page's order" |
  | M6 | `identityLine`: return `` `Concept2 ${link.c2Username ?? ""} · …` `` | "falls back to the numeric account" |
  | M6b | `identityLine`: weaken the guard to `link.c2Username !== null ? link.c2Username : …` (drop the `!== ""` clause) | "falls back for an EMPTY username too" |
  | M6c | `useConcept2Link`: drop the `if (!res.ok)` arm, so a 502 falls through to `res.json()` | "reports the STATUS of a refused read" — the mutant reaches the `catch` and reports `status: null` |
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

  Append to `app/src/adapters/linkFlow.test.ts` — and fix the **two assertions already in that file** that compare against a bare `{kind:"busy"}` and break the moment the member gains `source`. Find them with `git grep -n '"busy"' app/src/adapters/linkFlow.test.ts` and add the field each one's scenario actually produces. This is a consequence of the union change, not a separate defect, and it is named here because the paste-test hit it and the earlier draft's Files list did not predict it.

```ts
it("the JS guard's busy names itself, so the card can tell it from the plugin's", async () => {
  // linkFlow.ts:148-155 requires the two to render differently. Before this
  // change the union could not express it: both returned bare {kind:"busy"}.
  const api = vi.fn(
    async () =>
      new Promise<Response>(() => {
        /* never resolves: the first attempt stays in flight */
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
- Test: `app/server/routes/concept2.test.ts` (append; ALSO fix its `buildApp` harness literal — see step 6), `app/server/stores/concept2.integration.test.ts` (its `link()` builder is the second of the three)

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

- [ ] **Step 2: Write the failing route test.** Append to `app/server/routes/concept2.test.ts`:

```ts
it("GET /link names the linked Concept2 username and the logbook origin", async () => {
  // The username discharges the account-injection detect-identity treatment
  // (ROADMAP's C2 row: the card "naming which account the link goes to"
  // ships with PR2). The origin exists because the client cannot know
  // whether this deployment talks to log.concept2.com or log-dev
  // (plan observation 5), and a wrong origin 404s the link-out silently.
  await store.upsertLink(USER_ID, {
    c2UserId: 2211,
    c2Username: "jamesawesome",
    accessToken: "a",
    refreshToken: "r",
    expiresAt: new Date(Date.now() + 86_400_000),
    weightClass: "H",
  });
  const res = await request(app).get("/api/concept2/link").set(auth(USER_ID));
  expect(res.status).toBe(200);
  expect(res.body).toMatchObject({
    available: true,
    linked: true,
    c2UserId: 2211,
    c2Username: "jamesawesome",
    logbookBaseUrl: "https://log-dev.concept2.test",
  });
  expect(res.body).not.toHaveProperty("accessToken");
  expect(res.body).not.toHaveProperty("refreshToken");
});

it("GET /link reports a null username rather than omitting the field", async () => {
  await store.upsertLink(USER_ID, {
    c2UserId: 2211,
    c2Username: null,
    accessToken: "a",
    refreshToken: "r",
    expiresAt: new Date(Date.now() + 86_400_000),
    weightClass: "H",
  });
  const res = await request(app).get("/api/concept2/link").set(auth(USER_ID));
  expect(res.body.c2Username).toBeNull();
});

it("GET /link leaks neither field while the flag is off", async () => {
  const dark = makeApp({ available: () => false });
  const res = await request(dark).get("/api/concept2/link").set(auth(USER_ID));
  expect(res.body).toStrictEqual({ available: false });
});

it("a real callback exchange stores the username GET /link then reports", async () => {
  // M12's covering test, and it did not exist in any earlier draft — the
  // paste-test had to write one before it could probe the write site at
  // all. This one starts at the WRITER (the callback handler) rather than
  // at `store.upsertLink`, which is what makes it a check on the route's
  // own `c2Username: me.username || null` argument rather than on the
  // store's ability to hold a string.
  const app = makeApp({ me: { ok: true, c2UserId: 2211, username: "jamesawesome" } });
  await request(app).get(`/api/concept2/callback?code=c&state=${await mintState(app)}`);
  const res = await request(app).get("/api/concept2/link").set(auth(USER_ID));
  expect(res.body.c2Username).toBe("jamesawesome");
});

it("stores NO username rather than an empty one when Concept2 sends a blank", async () => {
  // M12b. `""` is what `client.ts`'s fetchMe passes through for a blank
  // field (observation 18); `??` would store it and the card would render
  // a gap where the account name belongs.
  const app = makeApp({ me: { ok: true, c2UserId: 2211, username: "" } });
  await request(app).get(`/api/concept2/callback?code=c&state=${await mintState(app)}`);
  const res = await request(app).get("/api/concept2/link").set(auth(USER_ID));
  expect(res.body.c2Username).toBeNull();
});
```

  `makeApp`'s `me` override and `mintState` are named here as the shapes this file already has for driving a full callback exchange — **read the file's existing helpers and use their real names and signatures** rather than these. If no helper can drive a callback end to end, that is itself the finding: say so, and put the two tests in `concept2.integration.test.ts` instead, where the exchange path is already exercised.

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

  Add the covering test to `app/server/concept2/callbackPage.test.ts`'s neighbour, `routes/concept2.test.ts` (the route owns the fallback, the page owns the escaping):

```ts
it("names the numeric account the SAME way the card does when Concept2 sends no username", async () => {
  // Two shapes, one fallback: absent and empty are both "no identity".
  const rendered = await Promise.all(
    [null, ""].map(async (username) => {
      const app = makeApp({ me: { ok: true, c2UserId: 2211, username } });
      const res = await request(app).get(`/api/concept2/callback?code=c&state=${await mintState(app)}`);
      return res.text;
    }),
  );
  expect(rendered[0]).toContain("Concept2 account #2211 is now connected to");
  expect(rendered[1]).toContain("Concept2 account #2211 is now connected to");
});
```

  (`makeApp`/`mintState` are this file's own existing helpers — read them before writing the call, rather than assuming these names.)

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

  Thread `logbookBaseUrl` from `app/server/index.ts`'s existing `c2BaseUrl` (`:119`) through `app/server/app.ts`'s `AppDeps.concept2`, exactly as `webRedirectUri` is threaded today.

- [ ] **Step 6b: Update BOTH sides of the contract gate, and the two test harness literals.** None of these were in the plan before the paste-test ran the full `unit` project; each is a hard failure, not a warning.

  1. **`app/scripts/webauth-contract.test.ts`** — the test "the probe's LinkStatus interface names exactly the keys GET /api/concept2/link emits" carries an INDEPENDENT pinned literal list (`["available","c2UserId","linked","needsReauth","weightClass"]`, sorted) as well as a set comparison, "without it, deleting a key from BOTH files at once would keep the set equality green" (that test's own comment). Add `c2Username` and `logbookBaseUrl` to the pinned list, in sort order. Read `linkResponseKeys()` before writing the response literal: it strips `//` comments, then matches `res.json({...})` with `[^{}]*` and pulls keys with `(?:^|[{,])\s*(\w+)\s*:` — so an ES2015 shorthand key is not a key to it, and a nested object literal inside the response would break the read entirely.
  2. **`app/src/monitor/Concept2LinkProbe.tsx`** — add the same two fields to its `LinkStatus` interface, which is what `linkStatusKeys()` parses. The probe's behaviour, copy and CSS are untouched (ruling iv); this is a type declaration the gate above holds equal to the route.
  3. **`app/server/routes/concept2.test.ts`'s `buildApp`** and **`app/server/routes/concept2.integration.test.ts`'s `baseDeps`** — both construct a `Concept2RouterDeps` literal and must now supply `logbookBaseUrl`. Use a value that is obviously not production (`"https://log-dev.concept2.test"`) so M11's hardcode mutation has something to disagree with.

- [ ] **Step 6c: Convert the migration-boundary block's two inserts to raw SQL.** `app/server/db/schema.integration.test.ts` has a describe block that deliberately caps a real database at migration 0021 to prove an older deployment still works. Drizzle's typed `.insert(concept2Links).values(...)` builder emits EVERY declared column in its generated SQL, including ones the call never names — so the moment `c2_username` joins the schema, those two inserts reference a column that database genuinely does not have, and the block goes red without anything about it changing.

  **This is not a new technique; the file already carries it.** That block's own existing comment says "raw SQL because the typed builder already declares `surface`, which this table does not have yet". Apply the same treatment to the two `concept2Links` inserts, with a comment naming `c2_username` the way that one names `surface`. Do NOT relax the migration cap to make it pass — the cap is what the block tests.

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

**RF8:** the weight-class control is `OptionGroup`, the house roving-tabindex radiogroup, reused — not a fourth hand-rolled one. Its `value: V | null` state is exactly what board 1a needs ("Until a class is picked, Connect is dimmed and inert"), and `OptionGroup.tsx:9-12` records that this nothing-selected case is its own, already covered by its own keyboard tests.

**RF23 enumeration (the board's §"RF23 note" asks for it on the log row; it applies here too).** What already sits on You and could offer or write the same thing: `BaselineEditor` (writes baselines), `RetestShortcut` (navigates to a test), `ResetBaselineSetup` (destroys baselines), the DIAGNOSTICS row (navigates), `Concept2LinkProbe` (dev-only; DOES offer a real link). **The probe is the one overlap and it is deliberate and dev-only** — it never ships in a release build (`dist-grep.sh:127`'s eighth needle), so no rower ever sees two Connect buttons. Nothing on You offers a weight class, an unlink, or a Concept2 link in a production build. No existing offer is displaced.

- [ ] **Step 1: Write the failing tests.** `app/src/you/Concept2Card.test.tsx` — the file's mocking follows `src/monitor/Concept2LinkProbe.test.tsx:14-59` exactly (`vi.doMock` + `vi.resetModules()` + dynamic import, with `afterEach` unmocking `../api`, `../adapters/linkFlow`, `../platform`):

```tsx
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, act, waitFor, fireEvent } from "@testing-library/react";
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
    await waitFor(() =>
      expect(api).toHaveBeenCalledWith("/api/concept2/link"),
    );
    expect(screen.queryByText("CONCEPT2")).toBeNull();
  });
});

describe("Concept2Card read failed (Gate 0 amendment 1i)", () => {
  it("says the read failed and offers a Retry, rather than going silent like an unavailable server", async () => {
    // 1h and 1i are different answers and must not share one rendering.
    // `{available:false}` means "this deployment has no Concept2" and
    // renders nothing. A failed read means "we could not find out", which
    // is a fault, is retryable, and would be a lie if drawn as absence.
    const api = vi.fn(async () => new Response("<html>502</html>", { status: 502 }));
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
    expect(screen.getByRole("radiogroup", { name: "Weight class" })).toBeTruthy();
    await userEvent.click(screen.getByRole("radio", { name: "Heavyweight" }));
    expect(connect).not.toBeDisabled();
  });

  it("sends the picked class to startLink, and nothing else", async () => {
    const startLink = vi.fn(
      async (): Promise<LinkOutcome> => ({ kind: "navigating" }),
    );
    mount({ available: true, linked: false }, startLink);
    await renderCard();
    await userEvent.click(await screen.findByRole("radio", { name: "Lightweight" }));
    await userEvent.click(screen.getByRole("button", { name: "CONNECT TO CONCEPT2" }));
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
    expect(screen.getByRole("button", { name: "Tap again to unlink" })).toBeTruthy();
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
    await userEvent.click(screen.getByRole("button", { name: "Tap again to unlink" }));
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
    const unlink = await screen.findByRole("button", { name: "Unlink Concept2" });
    vi.useFakeTimers();
    fireEvent.click(unlink);
    expect(screen.getByRole("button", { name: "Tap again to unlink" })).toBeTruthy();
    // INDEPENDENT literals, never the production constant (RF21's own
    // "a test that imports the constant it exists to gate proves nothing").
    act(() => {
      vi.advanceTimersByTime(3999);
    });
    expect(screen.getByRole("button", { name: "Tap again to unlink" })).toBeTruthy();
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(screen.getByRole("button", { name: "Unlink Concept2" })).toBeTruthy();
  });

  it("says the link is unchanged when the DELETE is refused, instead of appearing to do nothing", async () => {
    // Gate 0 amendment 1j. Without the `else`, a refused DELETE takes the
    // `finally` and nothing else: the arm clears, the card re-renders
    // LINKED, and the rower's second tap looks like it silently failed —
    // or worse, like it worked and the card is wrong.
    const api = vi.fn(async (path: string, init?: RequestInit) =>
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
    await userEvent.click(screen.getByRole("button", { name: "Tap again to unlink" }));
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
    const api = vi.fn(async (path: string, init?: RequestInit) => {
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
    await userEvent.click(screen.getByRole("button", { name: "Tap again to unlink" }));
    await screen.findByText("Couldn't unlink. Your link is unchanged.");
    deleteOk = true;
    await userEvent.click(screen.getByRole("button", { name: "Unlink Concept2" }));
    await userEvent.click(screen.getByRole("button", { name: "Tap again to unlink" }));
    expect(
      await screen.findByRole("button", { name: "CONNECT TO CONCEPT2" }),
    ).toBeTruthy();
    expect(screen.queryByText("Couldn't unlink. Your link is unchanged.")).toBeNull();
  });

  it("a relink asks for the weight class again, rather than reusing the one picked for the account just removed (invariant I4)", async () => {
    // M21's covering test, rewritten. The earlier draft asserted this from
    // a card that started LINKED, where the weight-class draft had never
    // been set at all — so removing `setWeightClass(null)` from `unlink()`
    // changed nothing observable and the probe could not bite. This one
    // drives the real sequence: pick a class, connect, unlink, and find
    // Connect inert again.
    let linked = false;
    const api = vi.fn(async (path: string, init?: RequestInit) => {
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
      return { kind: "linked", c2UserId: 2211, weightClass: "H", stateEchoed: true };
    });
    vi.doMock("../api", () => ({ api }));
    vi.doMock("../adapters/linkFlow", () => ({ startLink }));
    await renderCard();
    await userEvent.click(await screen.findByRole("radio", { name: "Heavyweight" }));
    await userEvent.click(screen.getByRole("button", { name: "CONNECT TO CONCEPT2" }));
    await screen.findByText("LINKED ✓");
    await userEvent.click(screen.getByRole("button", { name: "Unlink Concept2" }));
    await userEvent.click(screen.getByRole("button", { name: "Tap again to unlink" }));
    const connect = await screen.findByRole("button", {
      name: "CONNECT TO CONCEPT2",
    });
    expect(connect).toBeDisabled();
    expect(screen.getByRole("radiogroup", { name: "Weight class" })).toBeTruthy();
  });
});

describe("Concept2Card outcomes (Gate 0 amendment 1e/1f/1g)", () => {
  it("renders the failure line and its REASON", async () => {
    const startLink = vi.fn(
      async (): Promise<LinkOutcome> => ({
        kind: "exchangeFailed",
        status: 502,
        error: "c2_error",
        stateEchoed: true,
      }),
    );
    mount({ available: true, linked: false }, startLink);
    await renderCard();
    await userEvent.click(await screen.findByRole("radio", { name: "Heavyweight" }));
    await userEvent.click(screen.getByRole("button", { name: "CONNECT TO CONCEPT2" }));
    expect(
      await screen.findByText("REASON: CONCEPT2 REFUSED THE EXCHANGE · 502"),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy();
  });

  it("renders the update-required panel with no retry, because retrying this build cannot work", async () => {
    const startLink = vi.fn(
      async (): Promise<LinkOutcome> => ({ kind: "updateRequired" }),
    );
    mount({ available: true, linked: false }, startLink);
    await renderCard();
    await userEvent.click(await screen.findByRole("radio", { name: "Heavyweight" }));
    await userEvent.click(screen.getByRole("button", { name: "CONNECT TO CONCEPT2" }));
    expect(
      await screen.findByText("Update Ergomatic to link your Concept2 account."),
    ).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
  });

  it("re-reads the server after every attempt instead of trusting the outcome (invariant I1)", async () => {
    const startLink = vi.fn(
      async (): Promise<LinkOutcome> => ({
        kind: "linked",
        c2UserId: 2211,
        weightClass: "H",
        stateEchoed: true,
      }),
    );
    // The server disagrees: it still says unlinked. The card must believe
    // the server, which is exactly what Concept2LinkProbe.tsx:173-176
    // says this surface exists to surface.
    const { api } = mount({ available: true, linked: false }, startLink);
    await renderCard();
    await userEvent.click(await screen.findByRole("radio", { name: "Heavyweight" }));
    await userEvent.click(screen.getByRole("button", { name: "CONNECT TO CONCEPT2" }));
    expect(
      api.mock.calls.filter((c) => c[0] === "/api/concept2/link"),
    ).toHaveLength(2);
    expect(screen.queryByText(/Concept2 jamesawesome/)).toBeNull();
  });

  it("reconnects from the STORED weight class and asks nothing (exit criterion 3)", async () => {
    const startLink = vi.fn(
      async (): Promise<LinkOutcome> => ({ kind: "navigating" }),
    );
    mount({ ...LINKED, weightClass: "L", needsReauth: true }, startLink);
    await renderCard();
    await userEvent.click(
      await screen.findByRole("button", { name: "RECONNECT CONCEPT2" }),
    );
    expect(startLink).toHaveBeenCalledWith({ weightClass: "L" });
    expect(screen.queryByRole("radiogroup")).toBeNull();
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
import {
  useConcept2Link,
  type LinkReadFailure,
} from "../api/useConcept2Link";
import OptionGroup from "../onboarding/OptionGroup";
import { describeFailure, identityLine } from "./concept2CardModel";

/**
 * Wave E PR2, Surface 1 (board `docs/design/handoffs/2026-08-31-concept2-
 * connect/README.md` states 1a-1e, amended 2026-09-03 by
 * `amendment-2026-09-03.html` states 1f-1j). The rower's only door to the
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
  const [unlinkFailed, setUnlinkFailed] = useState<LinkReadFailure | null>(null);
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
        disarm();
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
              Your link and weight class are kept. Reconnect to send rows again.
            </p>
          </div>
          <button
            type="button"
            className="c2-card-primary"
            disabled={busy || link.weightClass === null}
            onClick={() => {
              if (link.weightClass !== null) void connect(link.weightClass);
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
  | M19 | delete the `await reload()` from `connect()` | "re-reads the server after every attempt" |
  | M20 | reconnect passes `weightClass` (the draft) instead of `link.weightClass` | "reconnects from the STORED weight class" |
  | M21 | remove `setWeightClass(null)` from `unlink()` | "a relink asks for the weight class again". **The covering test is rewritten** as a connect → unlink flow: against the earlier draft's LINKED-from-mount card the draft class was never set, so this mutation changed nothing observable and the probe could not bite |
  | M21b | delete the `else { setUnlinkFailed(...) }` branch from `unlink()`, leaving only the `finally` | "says the link is unchanged when the DELETE is refused" |
  | M21c | set `unlinkFailed` but do NOT clear it at the top of `unlink()` | "clears the unlink failure when a later unlink succeeds" — a latched failure would sit over a card whose link is genuinely gone |

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

  it("treats an eligibility or availability refusal as the block disappearing, never as a failure the rower retries", () => {
    expect(
      readSendResponse(422, { error: "not_eligible", reason: "not_finished" }),
    ).toStrictEqual({ kind: "gone" });
    expect(readSendResponse(403, { error: "unavailable" })).toStrictEqual({
      kind: "gone",
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
  /** The block's own preconditions stopped holding mid-session (unlinked
   *  in another tab, the flag flipped off, the server disagreeing about
   *  eligibility). The block disappears; it never shows a retry for
   *  something retrying cannot fix. */
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
  if (
    error === "unlinked" ||
    error === "not_eligible" ||
    error === "unavailable"
  ) {
    return { kind: "gone" };
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
  | M27 | `c2ResultUrl`: swap `c2UserId` and `resultId` | "builds /profile/{c2_user_id}/log/{result_id}" |

---

## Task 6: The save path posts the run's own close stamp — **TRIAD**

**TRIAD (a number's MEANING).** Not because the diff is large — it is roughly one field on two doors — but because after it, the `date` Concept2 stores against a rower's row changes from the moment they tapped Save to the moment they stopped rowing. That is a different number on a third party's permanent record, on a route whose dedup key is second-granular. CLAUDE.md's triad rule applies in full: a complete antagonist pass on this task's premises and the PM final-PR gate.

**This task must land BEFORE Task 7.** Task 7 puts a Send button in front of a rower; every row sent through it before this task exists carries the wrong date, and rows are not re-datable once Concept2 has them.

**Files:**
- Create: `app/src/session/completionStamp.ts` (+ `.test.ts`)
- Modify: `app/src/session/LogSession.tsx` (`LogFormFields` gains two optional keys; `handleMonitorSave` sets them)
- Modify: `app/src/justrow/JustRowLog.tsx` (the monitor door's `submit` call — the app's OTHER `source: "pm5"` producer)
- Test: `app/src/session/LogSession.test.tsx` (append), `app/src/justrow/JustRowLog.test.tsx` (append), `app/server/routes/completedAt.integration.test.ts` (append the seam case)
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

  Append to `app/src/session/LogSession.test.tsx` — read the file's existing monitor-door harness and reuse it; these are the assertions, not a new harness:

```tsx
it("the monitor door posts the run's close stamp and this device's zone", async () => {
  // Observation 17: PR1 shipped the validator and no producer, so this
  // pair has never crossed the wire. Without it every Concept2 upload
  // carries the SAVE clock as its date.
  // …render the monitor door over a MonitorRun with a known `completedAt`,
  // tap Save, then:
  const body = JSON.parse(String(logsCall[1].body)) as Record<string, unknown>;
  expect(body.completedAt).toBe(RUN.completedAt);
  expect(body.tz).toBe(Intl.DateTimeFormat().resolvedOptions().timeZone);
});

it("the timer door posts NEITHER field, because a timer row can never be uploaded", async () => {
  // The fence is `source !== "pm5" -> not_monitor`. Posting a zone on a
  // row nothing can read it from is one more stored attribute for nothing.
  // …render the session door, tap Save, then:
  const body = JSON.parse(String(logsCall[1].body)) as Record<string, unknown>;
  expect(body).not.toHaveProperty("completedAt");
  expect(body).not.toHaveProperty("tz");
});
```

  And to `app/src/justrow/JustRowLog.test.tsx` — that file already has a `/api/logs` body reader (`fn.mock.calls.find(([path]) => path === "/api/logs")`) and a fixture with a known `completedAt`; use both:

```tsx
it("the Just Row MONITOR door posts the close stamp too, not just the session door's", async () => {
  // The class, not the instance: this is the app's other `source: "pm5"`
  // producer, over the same `MonitorRun` record, behind the same
  // eligibility fence.
  expect(body.completedAt).toBe("2026-09-02T21:52:34.000Z");
  expect(body.tz).toBe(Intl.DateTimeFormat().resolvedOptions().timeZone);
});
```

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

- [ ] **Step 5: Add the seam case — one test that starts upstream of the producer.** Append to `app/server/routes/completedAt.integration.test.ts`, which already stands up a migrated container, the real stores and the real route. Its existing cases prove the COLUMN round-trips; this one proves the client's own body reaches `buildC2Payload`'s accurate branch:

```ts
import { completionStamp } from "../../src/session/completionStamp.js";
import { buildC2Payload } from "../concept2/mapping.js";

it("a row posted with the CLIENT's own completion stamp gives Concept2 the workout's end, not the save clock", async () => {
  // RF24: this test starts UPSTREAM of the writer. The body is built with
  // the SAME `completionStamp` the monitor door calls, so deleting `tz`
  // from that function — the deciding production source — makes this go
  // red. A hand-written body here would gate nothing: it would prove the
  // server can store two fields, which `completedAt.integration.test.ts`
  // already proved, and say nothing about whether anything sends them.
  const closed = "2026-09-01T09:10:20.000Z";
  const post = await request(app)
    .post("/api/logs")
    .set(auth(USER_ID))
    .send({
      /* …the file's existing eligible pm5 body… */
      ...completionStamp({ completedAt: closed }),
    });
  const detail = await request(app)
    .get(`/api/logs/${String(post.body.id)}`)
    .set(auth(USER_ID));
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

  Read `buildC2Payload`'s real `SessionLogRow` shape before writing that literal (`server/concept2/mapping.ts`) — it is an independent structural mirror of the stored row, not the Drizzle type, and its `loggedAt` is `Date` while the JSON body's is a string.

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

- [ ] **Step 8: Record what a walk must see.** This task changes a number on a permanent third-party record, so the design's exit evidence gains one observation, and it is not discharged by any gate in this repo (Task 14, and the walk card that carries exit criterion 2):

  > **The date Concept2 shows for an uploaded row equals the moment the rower STOPPED ROWING, not the moment they tapped Save.** The precondition that makes a NO possible: sit on the summary screen for a measurable interval — three minutes is plenty — before tapping Save, then read the C2 logbook entry's own date against the PM5's end-of-piece time. Without that deliberate gap the two clocks agree to within the noise and the observation proves nothing.

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
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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

/** RF3: a REAL stored row, from `FromTheLog.test.tsx`'s own `storedRow`
 *  builder over the seeded library workout (SEA_FRET), never a hand-built
 *  minimum. Import that builder rather than copying it — a copy drifts
 *  from production the day the type changes, which is exactly how a whole
 *  phase's `wu`/`r` branch shipped with an accessibility defect. */
function eligibleRow(over: Partial<StoredLog> = {}): StoredLog {
  return storedRow({
    source: "pm5",
    endedBy: "finished",
    workSeconds: 1234.5,
    workMeters: 5000,
    c2ResultId: null,
    c2UserId: null,
    ...over,
  });
}

/** One `api` mock for both endpoints this component talks to: the link
 *  read its hook makes on mount, and the upload it posts on tap. */
function mockApi(opts: {
  link?: unknown;
  linkStatus?: number;
  send?: { status: number; body?: unknown; text?: string };
}) {
  const openReadOnlyUrl = vi.fn();
  const api = vi.fn(async (path: string, init?: RequestInit) => {
    if (path === "/api/concept2/link") {
      return new Response(JSON.stringify(opts.link ?? LINKED), {
        status: opts.linkStatus ?? 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    const send = opts.send ?? { status: 200, body: { resultId: 339 } };
    return new Response(send.text ?? JSON.stringify(send.body ?? {}), {
      status: send.status,
      headers: { "Content-Type": send.text === undefined ? "application/json" : "text/html" },
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
      await waitFor(() => expect(api).toHaveBeenCalledWith("/api/concept2/link"));
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
    expect(await screen.findByText("REASON: CONCEPT2 ERROR · 502")).toBeTruthy();
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

  it("survives a non-JSON error body without throwing", async () => {
    // The rolling-deploy case `adapters/linkFlow.ts:124-127` names: an old
    // image answering with HTML.
    mockApi({ send: { status: 502, text: "<html>502 Bad Gateway</html>" } });
    await renderBlock(eligibleRow());
    await userEvent.click(
      await screen.findByRole("button", { name: "Send to Concept2" }),
    );
    expect(await screen.findByText("REASON: CONCEPT2 ERROR · 502")).toBeTruthy();
  });
});
```

  Two things to settle against the real files before running this, rather than assuming: `storedRow`'s real name and signature in `FromTheLog.test.tsx` (export it if it is currently module-private), and whether `cleanup` needs importing from `@testing-library/react` or is already automatic under this project's vitest config.

  **What "renders SENT on mount" proves, and what it does not.** It hands the component a row that already carries `c2ResultId`/`c2UserId` and asserts the RENDER. It says nothing about whether anything ever writes those columns, or whether a written row reads back that way — the mocked `api` sits downstream of every producer in the system. That is not a weakness to fix here; it is the division of labour RF24 asks for, and **Task 10 owns the seam.** The same caution applies to the `log-concept2-sent.png` capture, which injects the two fields with `page.route` on `**/api/logs/*` rather than seeding the column: in a C2-dark stack the only writer of `c2_result_id` is a route that 403s, so a "seed the column and reload" capture cannot exist at all (Task 11). State both limits in the task report rather than letting a green suite and a good-looking screenshot read as end-to-end evidence.

  And append to `app/src/log/FromTheLog.test.tsx`:

```tsx
it("places the Concept2 block between the plan footer and Delete session", async () => {
  // DOCUMENT ORDER, not presence: presence alone passes with the block
  // anywhere on the screen, which is what M31 exists to prove.
  // …render a linked, eligible row through this file's existing harness…
  const footer = screen.getByText(/Logged to/);
  const block = screen.getByRole("region", { name: "CONCEPT2" });
  const del = screen.getByRole("button", { name: /Delete session/ });
  const before = Node.DOCUMENT_POSITION_FOLLOWING;
  expect(footer.compareDocumentPosition(block) & before).toBeTruthy();
  expect(block.compareDocumentPosition(del) & before).toBeTruthy();
});

it("makes NO extra /api/logs request by mounting the Concept2 block", async () => {
  // A REGRESSION this PR causes, found by the paste-test: this file's
  // "shows an error message with a Retry" test asserted `apiMock` had been
  // called exactly twice, and the new component's own
  // `GET /api/concept2/link` on every ready-state mount makes it three.
  // Fix the existing assertion by SCOPING it to the endpoint it is about,
  // never by loosening it to a range — and pin the scoping here so a later
  // change cannot quietly reintroduce a broad count.
  const logCalls = apiMock.mock.calls.filter(([path]) =>
    String(path).startsWith("/api/logs/log-1"),
  );
  expect(logCalls).toHaveLength(2);
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
      {state === "sent" && <p className="c2-send-line">Accepted by Concept2.</p>}

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

      {url !== null && resultId !== null && (
        <>
          {/* A BUTTON, not an anchor: inside the Capacitor WebView a plain
              `<a href>` drives the WebView itself to concept2.com with no
              way back (`adapters/externalBrowser.ts`'s own note on
              `openReadOnlyUrl`). 44px hit row. */}
          <button
            type="button"
            className="c2-send-linkout"
            onClick={() => void openReadOnlyUrl(url)}
          >
            View on Concept2 →
          </button>
          <p className="c2-send-foot">
            RESULT {resultId} &middot; OPENS YOUR CONCEPT2 LOGBOOK
          </p>
        </>
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

---

## Task 8: Mount the card on You

**Files:**
- Modify: `app/src/You.tsx`
- Test: `app/src/You.test.tsx` (append)

**Interfaces:**
- Consumes: `Concept2Card` (Task 4).

**Placement:** after `ResetBaselineSetup` (`You.tsx:89`) and before the dev-only probe (`:97-101`), which itself stays above the DIAGNOSTICS row (`:102-115`, whose comment requires it stay the LAST child). So the order becomes: BASELINES · RetestShortcut · ResetBaselineSetup · **Concept2Card** · [dev probe] · DIAGNOSTICS.

- [ ] **Step 1: Write the failing tests.** `You.test.tsx` already neutralises the probe wholesale (`You.test.tsx:13`, `vi.mock("./monitor/Concept2LinkProbe", …)`); do NOT neutralise the product card the same way — the point is that it renders.

```tsx
// This file's existing harness mocks `./api` and renders <You user={...} />;
// reuse it. `linkBody` below is whatever that harness needs to make
// `GET /api/concept2/link` answer — add the endpoint to its `api` mock
// rather than mocking `./api/useConcept2Link`, which would test the mock.

it("renders the Concept2 card between the baseline reset and the diagnostics row", async () => {
  // DOCUMENT ORDER, not presence: the DIAGNOSTICS row's own comment
  // (You.tsx:102-115) requires it stay the LAST child, and presence alone
  // would pass with the card sitting below it.
  await renderYou({ link: { available: true, linked: false } });
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
  await renderYou({
    user: { email: "james@jamestheaweso.me", name: "James Awesome" },
    link: {
      available: true,
      linked: true,
      weightClass: "H",
      c2UserId: 2211,
      c2Username: "jamesawesome",
      needsReauth: false,
      logbookBaseUrl: "https://log-dev.concept2.com",
    },
  });
  expect(
    await screen.findByText(
      "Concept2 jamesawesome · Ergomatic james@jamestheaweso.me",
    ),
  ).toBeTruthy();
});

it("renders no Concept2 card at all when the server reports the surface unavailable", async () => {
  // The whole-screen half of Task 4's unit case: You itself must not
  // reserve space, add a heading, or draw a hairline for an absent card.
  // Awaiting a POSITIVE observable first — a section of You that is always
  // there — so the absence is asserted against a settled screen and not
  // against a render that has not happened yet.
  const { api } = await renderYou({ link: { available: false } });
  expect(await screen.findByText("BASELINES")).toBeTruthy();
  await waitFor(() => expect(api).toHaveBeenCalledWith("/api/concept2/link"));
  expect(screen.queryByRole("region", { name: "CONCEPT2" })).toBeNull();
  expect(screen.queryByText("CONNECT TO CONCEPT2")).toBeNull();
});
```

  `renderYou` above stands for this file's existing render helper — read it and use its real name and options. Two selectors to verify rather than assume before running: whether `ResetBaselineSetup` exposes a button with that accessible name, and whether the DIAGNOSTICS row is a `<Link>` (role `link`) or something else. Both are one `git grep` each, and both have burned agents here before (the briefing's aria-label note).

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

The cross-tree import is not novel: `app/server/routes/partial.integration.test.ts:32` already does `import type { RecentLog } from "../../src/api/useRecentLogs.js"` and compares the server's SQL predicate against the client's TypeScript one in one file, with that file's own comment (`:54-62`) explaining the exception to "server code never imports from the client tree".

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

  **Prove the pin, do not assert it** (RF21: a gate nobody made go red is decoration). Add `const x = document.title;` to any file under `app/server/`, run `pnpm exec tsc -p tsconfig.server.build.json`, confirm it FAILS, remove it, confirm it passes. Record both outputs in the task report. If it does not fail, the pin is not doing anything and this step is not done.

- [ ] **Step 1: Write the test.** Runnable code, not a skeleton: the earlier draft's four `it()` bodies were prose, so nothing here could be pasted, run, or made to fail.

```ts
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import request from "supertest";
// Header, following partial.integration.test.ts:54-62's own precedent for
// the cross-tree import: this file is a TEST, not server code, and its
// entire purpose is to hold the two trees' views of one seam equal. A
// hand-copied predicate here would be a third mirror and would agree with
// whichever side it was copied from.
import { isSendable, sentResultId } from "../../src/log/concept2Send.js";
import type { StoredLog } from "../../src/log/storedSummary.js";
import type { Concept2Link } from "../../src/api/useConcept2Link.js";
import { eligibilityFailure } from "../concept2/mapping.js";

// The container / migrate / real-stores / real-app harness is the one
// `completedAt.integration.test.ts` and `endedBy.integration.test.ts`
// already use — copy that beforeAll/afterAll block verbatim rather than
// inventing a third shape. `postLog`, `linkAccount` and `c2Stub` below are
// this file's own small helpers over it.

describe("the Concept2 send seam: the route writes, the log detail reads (RF24)", () => {
  it("the eligibility predicate the CLIENT renders on and the one the SERVER enforces agree, row for row", async () => {
    // M39/M40's covering test, and it did NOT exist in any earlier draft:
    // the paste-test could not run either probe, because the shape-by-shape
    // comparison they gate was written as prose rather than as code.
    //
    // Every shape goes in through POST /api/logs — the SUPPORTED producer,
    // never a direct insert — and comes back through GET /api/logs/:id, so
    // both predicates read a row the database actually stored.
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
      { name: "timer", over: { source: "timer", deviceName: undefined } },
      { name: "manual", over: { source: "manual", deviceName: undefined } },
      { name: "no-reading", over: { source: "no-reading", deviceName: undefined } },
    ];

    const rows = await Promise.all(
      shapes.map(async ({ over }) => {
        const id = await postLog(over);
        const detail = await request(app)
          .get(`/api/logs/${id}`)
          .set(auth(USER_ID));
        return detail.body as StoredLog;
      }),
    );

    // Ordered lists, so a disagreement names the SHAPE rather than just
    // failing a boolean. Both sides are computed from the same stored row.
    const client = rows.map((row, i) => `${shapes[i]!.name}: ${String(isSendable(row))}`);
    const server = rows.map(
      (row, i) =>
        `${shapes[i]!.name}: ${String(
          eligibilityFailure({
            source: row.source,
            endedBy: row.endedBy,
            workSeconds: row.workSeconds,
            workMeters: row.workMeters,
          }) === null,
        )}`,
    );
    expect(client).toStrictEqual(server);

    // Pinned as an INDEPENDENT literal as well as compared: without it,
    // dropping the same clause from BOTH predicates would keep the
    // equality green and prove nothing (the shape `webauth-contract.
    // test.ts` already guards against on its own key list).
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
    await linkAccount({ c2UserId: 2211, c2Username: "jamesawesome" });
    const logId = await postLog({});
    // 201 {id: 339} is PR0's real sandbox response shape, transcribed from
    // docs/monitor/c2-crossconnect-2026-09/raw-output.txt.
    c2Stub.mockResolvedValueOnce(
      new Response(JSON.stringify({ data: { id: 339, user_id: 2211 } }), {
        status: 201,
        headers: { "Content-Type": "application/json" },
      }),
    );
    const sent = await request(app)
      .post(`/api/concept2/results/${logId}`)
      .set(auth(USER_ID))
      .send({ tz: "Europe/London" });
    expect(sent.status).toBe(200);

    const detail = await request(app)
      .get(`/api/logs/${logId}`)
      .set(auth(USER_ID));
    const row = detail.body as StoredLog;
    const linkRes = await request(app)
      .get("/api/concept2/link")
      .set(auth(USER_ID));
    // The link comes from the ROUTE, not from a literal: a hand-written
    // `Concept2Link` here would let the two sides disagree about
    // `c2UserId` and this test would never notice.
    const link = linkRes.body as Concept2Link;
    expect(sentResultId(row, link)).toBe(339);
  });

  it("a 409 duplicate reaches the client's predicate as SENT too, because the route records it (RF25)", async () => {
    // The durable-recovery path (routes/concept2.ts:890-898): the route
    // writes the colliding id BEFORE responding, so the next mount reads
    // SENT off the row. Drop that write and the rower is told "already
    // there" once and then shown an unsent row forever.
    await linkAccount({ c2UserId: 2211, c2Username: "jamesawesome" });
    const logId = await postLog({});
    c2Stub.mockResolvedValueOnce(
      new Response(
        JSON.stringify({ message: "duplicate", data: { id: 512 } }),
        { status: 409, headers: { "Content-Type": "application/json" } },
      ),
    );
    const sent = await request(app)
      .post(`/api/concept2/results/${logId}`)
      .set(auth(USER_ID))
      .send({ tz: "Europe/London" });
    expect(sent.status).toBe(409);
    expect(sent.body.error).toBe("duplicate");

    const detail = await request(app)
      .get(`/api/logs/${logId}`)
      .set(auth(USER_ID));
    const linkRes = await request(app)
      .get("/api/concept2/link")
      .set(auth(USER_ID));
    expect(
      sentResultId(detail.body as StoredLog, linkRes.body as Concept2Link),
    ).toBe(512);
  });

  it("a row accepted by a DIFFERENT Concept2 account reads back as NOT sent", async () => {
    // Spec anchor F8. The stored row is unchanged; what changed is which
    // account is live, and the link-out would point at a row this grant
    // cannot open.
    await linkAccount({ c2UserId: 2211, c2Username: "jamesawesome" });
    const logId = await postLog({});
    c2Stub.mockResolvedValueOnce(
      new Response(JSON.stringify({ data: { id: 339, user_id: 2211 } }), {
        status: 201,
        headers: { "Content-Type": "application/json" },
      }),
    );
    await request(app)
      .post(`/api/concept2/results/${logId}`)
      .set(auth(USER_ID))
      .send({ tz: "Europe/London" });

    await request(app).delete("/api/concept2/link").set(auth(USER_ID));
    await linkAccount({ c2UserId: 9999, c2Username: "someone-else" });

    const detail = await request(app)
      .get(`/api/logs/${logId}`)
      .set(auth(USER_ID));
    const linkRes = await request(app)
      .get("/api/concept2/link")
      .set(auth(USER_ID));
    expect(
      sentResultId(detail.body as StoredLog, linkRes.body as Concept2Link),
    ).toBeNull();
  });
});
```

  **Read before writing, do not assume:** the upload route's real 409-duplicate body shape and how it reads the colliding id out of C2's answer (`routes/concept2.ts`, the `:890-898` region) — the stub above must produce what the route actually parses, or the test proves only that a 409 is a 409. Same for `linkAccount`: `concept2.integration.test.ts:206-214` already injects a `vi.fn()` fetch for the C2 hop, and `c2Stub` should be that same seam, not a new one.

- [ ] **Step 2: Run it** (`--project integration`, Docker required). **Step 3: commit, then probe.**

  | # | Mutation | Must fail |
  | --- | --- | --- |
  | M37 | delete `c2ResultId`/`c2UserId` from the client's `StoredLog` | typecheck fails in this file — which is the point: the seam is now compile-coupled |
  | M38 | `routes/concept2.ts`'s duplicate branch: remove the write before responding | "a 409 duplicate reaches the client's predicate as SENT too" |
  | M39 | `mapping.ts`'s `eligibilityFailure`: drop the `endedBy !== "finished"` clause | "the eligibility predicate … agree, row for row" — the comparison AND the pinned literal both go red. **Neither M39 nor M40 could be run in the paste-test**, because the test they gate existed only as prose |
  | M40 | `concept2Send.ts`'s `isSendable`: accept `"no-reading"` as well as `"pm5"` | same test, from the other side |
  | M40b | drop the `endedBy` clause from BOTH predicates at once | the pinned literal list. This is the probe that proves the comparison is not a mirror — without the literal, two identically-wrong predicates agree perfectly |
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

- [ ] **Step 5: Commit, then probe.** At least: make the card render while `available:false` and confirm the invisibility test goes red; shrink a tappable to 40px and confirm the structural assertion goes red; remove the `pageshow` listener from Task 1's hook and report what the Back case does — **if it still passes, that case is measuring the browser reloading rather than restoring, and it is not evidence for I5**; make the read-failed panel `return null` and confirm the 1i case goes red.

---

## Task 12: The callback pages' 401/403 copy

**Gated on ruling (iii) = A. If B, skip this task entirely.**

**Files:**
- Modify: `app/server/concept2/callbackPage.ts`
- Test: `app/server/concept2/callbackPage.test.ts`

- [ ] **Step 1: Write the failing test.**

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
  for (const kind of ["notSignedIn", "wrongAccount"] as const) {
    expect(renderCallbackPage(kind).html).not.toMatch(/\bhere\b/);
  }
});

it("still emits no anchor and no subresource on any page", () => {
  // The constraint the rewording must not quietly relax.
  for (const kind of [
    "alreadyLinked", "expired", "incomplete", "notSignedIn",
    "wrongAccount", "unavailable", "failed",
  ] as const) {
    const { html } = renderCallbackPage(kind);
    expect(html).not.toMatch(/<a\b/);
    expect(html).not.toMatch(/<link\b/);
    expect(html).not.toMatch(/<img\b/);
    expect(html).not.toMatch(/<script\b/);
  }
});
```

- [ ] **Step 2: Apply the copy.** Delete the `SIGN_IN_HERE` constant and its comment; the two `action` strings become literals:

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
  4. **The board's approved-amendments list** — record the six Gate 0 changes and every new state the amendment draws (1f, 1g, 1h, 1i, 1j, 2f, and the REASON lines), with the amendment file's path, so the README describes the surface as built.
  5. **`docs/design/DEVIATIONS.md`** — a row for the link-out's accent (observation 15 / amendment §5), naming the four canonical meanings, this fifth use, the ruling, and why a token was not minted. DEVIATIONS documents CURRENT STATE (RF9), so write it as the state, not as a history.
  6. **`app/src/adapters/externalBrowser.ts:1-6`** — its header says "PR2's read-only 'View on Concept2' link-out is the next one". It is no longer next; it is here, and it takes `openReadOnlyUrl`, not `openExternalUrl`. Reconcile.

  9. **`app/server/db/schema.ts`'s `tz` comment** — *"tz: the client's IANA zone; posted at save from PR2 on, or written by the upload route's first legacy send"*. As of Task 6 the first clause is TRUE for the first time, and the second is what happens to rows saved before this build. Rewrite it to say which is which as of this head, and name Task 6's `completionStamp` as the producer, so the next reader can find it in one grep instead of discovering there is none. The `completedAt` half of the same comment gets the same treatment.

  10. **The parent spec's mapping row** — it describes the `loggedAt`/`effectiveTz` branch as the "fallback for legacy rows". Before Task 6 that was not a fallback, it was the ONLY path, and the sentence has been describing an intention rather than the code since PR1 merged. Correct it where it is ARGUED and everywhere it is USED: state that the paired branch went live with PR2's client producer, that "legacy" means rows saved by a build predating it, and that the two are distinguishable in the database by `completed_at IS NULL`.

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

**Gaps, stated.** (a) The web OAuth hop is exercised by no automated gate — ruling (v) declines the fake-Concept2 service and Task 11 says so in the spec header. (b) The native arm is reachable by no gate in this repo (RF19); `Concept2LinkProbe` plus a walk is the whole instrument, and this PR does not add one. (c) Exit criterion 2 above. (d) `pageshow`'s availability at the deployment floor is unconfirmed by any primary source; the design degrades to a mount-only read if it never fires, and Task 11's Back case is the only evidence this repo can produce (see the lifetime table's Web-API list). (e) Rows saved before Task 6 carry no close stamp and will upload with their save clock forever — no backfill is possible, because the instant was never recorded.

**Type consistency.** `Concept2Link` is defined once (Task 1) and consumed by Tasks 3, 4, 5, 7, 10. `LinkReadFailure` once (Task 1), consumed by Task 4 for BOTH the failed read and the failed unlink — one spelling of "what went wrong on the wire", so `reasonFor` has one caller shape rather than two. `SendState` once (Task 5), consumed by Task 7. `LinkOutcome`'s `busy` member is widened in Task 2 and read in Task 1's `describeFailure` — **land Task 2 before or with Task 1**, since `describeFailure`'s `busy` arm does not compile against the current union. `isSendable`/`sentResultId` are named identically in Tasks 5, 7 and 10. `logbookBaseUrl` is the same name in the server response (Task 3), the client type (Task 1) and the URL builder (Task 5). `completionStamp` (Task 6) is imported by the client door that posts and by the server test that gates the seam — it has no imports of its own, deliberately, so the cross-tree hop drags nothing with it.

**Ordering.** Task 2 before or with Task 1 (the union). **Task 6 before Task 7**: Task 7 puts a Send button in front of a rower, and every row sent before Task 6 exists carries the wrong date on a record that cannot be re-dated. Task 3 before Task 4 (the card reads `c2Username`). Task 10 after Tasks 5 and 7 (it imports both trees' predicates). Everything else is independent.

**Completeness of the prescribed code.** Every `it()` body in this plan is runnable code. The earlier draft carried prose bodies in three files — the send block's, You's, and the seam test's — and the cost was measurable: the paste-test could not run any of those three, M39 and M40 had no covering test to bite, and the two seam-shaped defects the plan most needed gating were the ones with no executable gate. Where a block still needs something read before it will run (a harness helper's real name, a route's real 409 body), the step says so explicitly and names the file to read.
