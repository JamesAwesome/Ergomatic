# Wave E PR2 — the rower-facing Concept2 surface (implementation plan)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**REV 1** — written 2026-09-03 in worktree `/Users/james/projects/github/jamesawesome/Ergomatic-wt-c2pr2` (branch `wave-e-pr2-client`, base main `3e15378e`). Every `file:line` below was read in this worktree at that head. PR1 (#—), PR1.5, PR1.75a (#269) and PR1.75b (#277) are all merged; the server, the native plugin and `adapters/linkFlow.ts` all exist and are what this PR builds on.

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
  `cd /Users/james/projects/github/jamesawesome/Ergomatic-wt-c2pr2/app && NODE_OPTIONS=--no-experimental-webstorage pnpm exec vitest run --project client <file>`
  Read BOTH summary lines ("Test Files" and "Tests") — a file that fails to load collects zero tests and still reads green on one of them.
- **TDD + self-mutation:** failing test first, every task. Every NEW assertion gets a mutation probe run against a COMMITTED tree (RF21/RF22: commit the real change BEFORE probing, so every revert is a no-op; check `git status` before any `git checkout --`). Reports record the mutation and the exact failure text.
- **Per-file coverage** (RF2): the 90×4 gate is a repo-wide aggregate and will not notice an uncovered branch in a file this PR creates. Read the per-file rows in the HTML report under `app/coverage/` and state which source was used.
- **Realistic fixtures** (RF3): at least one test per client task starts from a real library workout (`app/server/seed/library/index.ts`'s `LIBRARY_WORKOUTS`) via the existing fixture builders, not a hand-built minimum. The three `StoredLog` builders this PR must touch already do (`SEA_FRET`).
- **Typed-lint ratchet:** no new suppressions; `pnpm lint:prune` after removing any.
- **Records** (RF14): anything with a life after merge goes in ROADMAP, DEVIATIONS, a ledger or the spec at the moment it is found, never only in the PR body.

## Paste-test receipt (agent briefing, "Plan authoring")

Every prescribed code block below was extracted to its real path in a scratch copy of `app/` (`rsync` minus `node_modules`, with the worktree's `node_modules` symlinked) and run through the repo's own gates. **The worktree itself was never modified** — `git diff --stat` in the worktree is empty and `git status --short` shows only this file and the amendment HTML.

| Gate | Command (run 2026-09-03 against the scratch copy of `3e15378e`) | Result |
| --- | --- | --- |
| typecheck | `tsc -p tsconfig.app.json --noEmit` | **0 errors** after the fixture fix in Task 5 step 1; **3 errors before it** (see observation 6) |
| lint | `node node_modules/eslint/bin/eslint.js src/you/Concept2Card.tsx src/log/Concept2SendBlock.tsx src/api/useConcept2Link.ts src/you/concept2CardModel.ts src/log/concept2Send.ts` | **0 problems** |

`pnpm lint` in full, `format:check`, and every test project were NOT run against the scratch tree (pnpm refuses to operate on a symlinked `node_modules`). The implementer runs them for real, per task.

## Plan deviations / observations (RF10 — the spec and the board against the code as read)

Numbered so review can cite them. Each is a place where an authority this plan inherits says something the code contradicts.

1. **The board points Surface 2 at the wrong file.** Handoff README §"About the Design Files": "`app/src/log/LogRow.tsx` area for Surface 2". `LogRow.tsx:221-281` is the LIST row's *content only* — the caller supplies the wrapper, and in both callers that wrapper is a `<Link>` (`HistoryList.tsx:188-198`, `Today.tsx:1683-1693`), so a button there would nest an interactive element inside an anchor. The list projection also lacks the fields the send state needs: `RecentLog` (`api/useRecentLogs.ts:20-106`) declares no `source`, `c2ResultId` or `c2UserId`. The board's own §Surface 2 says "Log detail", which is `FromTheLog.tsx`. **This plan builds Surface 2 in `FromTheLog.tsx` and touches `LogRow.tsx` not at all.**

2. **2c's timestamp cannot be rendered.** Board 2c: "Accepted by Concept2 · Aug 27, 11:31". `session_logs` gained exactly `c2ResultId` and `c2UserId` (`server/db/schema.ts:377-378`); there is no acceptance-timestamp column and `git grep` finds no `c2_sent_at`. Rendering `loggedAt` there would print the save clock under a line naming a different event. **Amendment change 4: the timestamp is dropped.**

3. **1b's Cancel button has no reachable presser, on either surface.** Native: `startLink` awaits `ASWebAuthenticationSession` (`adapters/linkFlow.ts:172-272`) and the sheet is presented over the app, so nothing behind it is tappable; the outcome then arrives in the promise. Web: `openExternalUrl` is `window.location.assign` (`adapters/webNavigate.ts`) and the document unloads. The board's second 1b variant ("CONFIRMING THE LINK") has the same problem — on web there is no document to confirm in, and on native the promise has already resolved. **Amendment change 3: both removed; one buttonless panel remains, visible only during the mint round trip.**

4. **The two `busy` outcomes are indistinguishable, and the code says they must not be.** `adapters/linkFlow.ts:148-155`, verbatim: *"PR2's card must therefore not render one string for both `busy` sources: the JS guard means 'your last tap is still working', the plugin's means 'a sheet is already up and your fresh mint just superseded the attempt it belongs to'."* But `startLink:287` and `pluginRejection:156` both return bare `{ kind: "busy" }` — the union cannot express it. **Task 2 makes the member `{ kind: "busy"; source: "guard" | "sheet" }`.** Typechecked: no existing consumer constructs a `busy` outcome, and `Concept2LinkProbe`'s `outcomeDetail` (`:98-107`) branches on `code`/`status`/`message`, none of which `busy` carries, so it needs no change.

5. **The client cannot build the "View on Concept2" URL.** PR0 measured the shape — `/profile/{c2_user_id}/log/{result_id}` (`docs/monitor/c2-crossconnect-2026-09/README.md`) — but not the origin, and the origin is a deployment fact: `server/index.ts:119` defaults `C2_BASE_URL` to `https://log-dev.concept2.com`, and a hardcoded `log.concept2.com` link 404s for the entire sandbox phase, which is the phase every walk happens in. **Task 3 returns `logbookBaseUrl` on `GET /api/concept2/link`, derived from the same `C2_BASE_URL` the client already talks through.** There is no client-side alternative that is not a guess.

6. **Adding `c2ResultId`/`c2UserId` to `StoredLog` breaks exactly three fixture builders.** Measured, not predicted — `tsc -p tsconfig.app.json --noEmit` on the scratch tree named all three and nothing else: `log/FromTheLog.test.tsx:30` (`storedRow`), `log/HistoryList.test.tsx:88` (`baseStoredRow`), `log/storedSummary.test.ts:47` (`baseRow`). All three build a full `StoredLog` from a `Partial` override, so a required-and-nullable field must be added to each literal. The repo's convention for this type is required-and-nullable, not optional (`storedSummary.ts:211-212`'s own reasoning: "the column is always selected, so 'absent' isn't a shape this row can actually carry"), so the fix is two lines per fixture, never loosening the type.

7. **The parent spec's `weight_class` premise is falsified on its evidence, and survives on its conclusion.** Spec §Research, verbatim: *"`GET /api/users/me` returns 13 fields, none of them weight — `weight_class` must be asked by us (V10)."* The 1.75a plan MEASURED that response live on 2026-09-02 (observation 3): sixteen fields, and `weight` **is** one of them (age_restricted, country, dob, email, email_permission, first_name, gender, health_data_permission, id, last_name, logbook_privacy, max_heart_rate, profile_image, roles, username, weight). The conclusion still holds — `weight` is a number, `weight_class` is C2's `H`/`L` competition binary, and deriving one from the other needs the unit and the gender-specific threshold — but the sentence as written is wrong and is cited by the board's conditional-ask amendment. **Task 12 corrects the spec line.** See ruling (i).

8. **The board's conditional weight-class ask cannot be built without changing the mint contract.** Board approved amendment, verbatim: "do NOT ask H/L if Concept2 already has a weight class on the account. Check after the OAuth exchange; ask only when blank on Concept2." `POST /api/concept2/connect` requires `weightClass` and 400s without it (`server/routes/concept2.ts:229-238`), so the ask must precede the authorize hop and cannot be conditioned on anything only reachable after it. Making it conditional means a two-phase link — a change to a shipped TRIAD route. **Amendment change 1: unconditional.** See ruling (i).

9. **The Linked card cannot name the Concept2 username today.** `GET /api/concept2/link` returns `{available, linked, weightClass, c2UserId, needsReauth}` (`server/routes/concept2.ts:535-546`) and `concept2_links` stores no username, though both completion paths hold `me.username` at exchange time (`routes/concept2.ts:378-411`, `:486-513`) and the Linked callback page prints it (`concept2/callbackPage.ts:156`). ROADMAP's C2-account-injection row says "detect-identity treatment (the callback/linked card naming which account the link goes to) ships with PR2's surface" — and a numeric id is not an identity a rower recognises. See ruling (ii); Task 3 implements variant B.

10. **`openExternalUrl` is the wrong adapter for a read-only link-out.** Its own header says PR2's link-out is its next consumer (`adapters/externalBrowser.ts:1-6`), but its web arm is `window.location.assign` — correct for the OAuth hop, and for "View on Concept2" it would throw the rower out of the app with the log row lost. **Task 2 adds `openReadOnlyUrl`** (web: a new context; native: the same `SFSafariViewController` sheet, which returns). The link-out is therefore a `<button>`, not an `<a href>`: on native a plain anchor drives the Capacitor WebView itself to concept2.com with no way back.

11. **`routes/concept2.ts:64-67`'s "intentional interval" comment is stale at this head.** It reads: *"Until PR1.75b ships the ASWebAuthenticationSession plugin nothing on the device can receive it — the design's named intentional interval, harmless while the flag is off."* PR1.75b merged as `3e15378e` (`git log --oneline -1`: "Wave E PR1.75b: the native half of the authenticated activation shape (#277)"). The interval has closed. **Task 12 reconciles it.**

12. **2d Duplicate is session-transient and the board reads as if it persists.** The 409 branch writes `c2ResultId`/`c2UserId` before responding (`routes/concept2.ts:875-899` — RF25's durable-recovery write), so the next mount of the detail screen reads the id off the row and renders **2c SENT**. 2d is what the rower sees in the seconds after the colliding tap and never again. Consequence for Task 10: 2d cannot be captured by a screenshot that seeds state and reloads — only by driving the tap.

13. **`Concept2LinkProbe` stays exactly as it is, dev-only.** It is not the product surface (its own header says so) and it is the ONLY instrument that can reach the Swift plugin (`Concept2LinkProbe.tsx:21-26`: no XCTest target, `src/native/**` is `v8 ignore`d, `pnpm e2e` runs on web). Its `data-c2-link-probe` literal is `dist-grep.sh:127`'s eighth needle and `ios-release.sh:42-45` refuses to run while its flag is exported. **The product card does not replace it, does not absorb its readout, and does not share its CSS.** See ruling (iv).

14. **The e2e stack is C2-dark by construction, and a committed test enforces it.** `scripts/compose-env.test.sh:46-49` runs the real `docker compose -f compose.yml -f compose.e2e.yml config` and asserts `C2_LINK_ENABLED: ""`; CI runs it (`.github/workflows/ci.yml:165-168`). No fake Concept2 server exists anywhere in the repo (`server/testing/fakes.ts` fakes stores, not HTTP; `concept2.integration.test.ts:206-214` injects a `vi.fn()` fetch). See ruling (v); Task 10 implements the recommended scope.

15. **"View on Concept2 →" in accent is accent's fifth meaning.** `docs/design/handoffs/2026-08-03-ui-fix/DESIGN.md:39-41`, verbatim: "Accent red now means exactly four things: the level-1 action, a resolved split or duration, a destructive control, the active tab mark." Unlink is the third and needs no dispensation; a link-out is none of the four. The in-repo precedent for a fifth candidate is `--action-connect` (`theme/tokens.css:33-41`), which got its own token rather than becoming accent's fifth thing. The board rendered the link-out in `#b5341f` and James approved that render on 2026-08-31. **Task 12 records it as a DEVIATIONS row rather than inventing a token nothing else would use** (amendment §5) — but it must be RECORDED, per RF9.

16. **`--ink-4` on `--surface-sunken` fails AA and the sunken panel is where this PR's muted text wants to go.** Computed (WCAG relative luminance, script in the amendment's §4): 4.48:1 against a 4.5:1 floor. Every REASON line therefore uses `--ink-3` (6.30:1). This is a constraint on Task 4's CSS, not an observation about existing code.

## Rulings required before implementation

Each is a named binary. **Task 0 presents these with the amendment; implementation does not start until every one is answered.** The plan below is written for the recommended option in each case; the "if the other" column says exactly what to delete or change.

| # | Question | Options | Recommended, and why | If the other |
| --- | --- | --- | --- | --- |
| **i** | Weight-class ask: conditional or unconditional? | **A** ask always. **B** ask only when Concept2 has no class. | **A.** B is unbuildable without a two-phase link: the mint requires `weightClass` and 400s without it (`routes/concept2.ts:229-238`), so the ask must precede the hop, and there is nothing to condition on — C2's `/users/me` carries `weight` (a number) and `gender`, never `weight_class` (observation 7). Deriving H/L from kg would need the unit (unmeasured) and would have us guess a competition category on the rower's behalf. Cost of A: a rower with a class already on Concept2 answers one extra question, once. | B needs a new spec: a mint that accepts no class, a post-exchange read of the rower's latest rower result's `weight_class`, a `results:read` scope check, and a second ask surface. That is its own PR and its own TRIAD gate. |
| **ii** | Linked-card identity: numeric or username? | **A** `Concept2 account #2211 · Ergomatic <email>`. **B** `Concept2 <username> · Ergomatic <email>`, storing the username. | **B.** The line exists to discharge the account-injection residual (ROADMAP's C2 row: the card "naming which account the link goes to" ships with PR2). A numeric id is not something a rower recognises, so A renders the mitigation without delivering it. B costs one nullable `text` column written at two sites that already hold the value, and it makes the card read the same as the Linked callback page the rower just saw. | Delete Task 3 entirely; `identityLine` (Task 1) already falls back to `account #<id>` when `c2Username` is null, so nothing else changes. PR2 then carries no migration and no stored shape. |
| **iii** | The 401/403 callback lines saying "here" | **A** reword (amendment §3). **B** leave as approved. | **A.** "here" is plain text with no anchor, deliberately — the template emits no outbound links because the callback URL carries `code` (`concept2/callbackPage.ts:52-56`, RFC 9700 §4.2). So the word names a destination it cannot take you to. The rewording removes the false affordance without adding a link. | Drop Task 11. No other task depends on it. |
| **iv** | Does the product card replace the dev probe's readout? | **A** probe unchanged, dev-only. **B** product card absorbs it. | **A.** The probe is the only instrument that can reach the Swift plugin, it prints things no rower should see (`Callback carried state`, raw outcome kinds, plugin error codes), and its literal is a `dist-grep` needle proving it is absent from production builds. B would put a walk instrument in a shipping bundle. | B needs the needle retired from `dist-grep.sh:127` and a new argument for why a diagnostic readout belongs on a rower's screen. Not recommended and not planned. |
| **v** | e2e fake-Concept2 scope | **A** `page.route` interception in Playwright + one real cross-layer seam test at the integration layer. **B** a fake C2 HTTP service in compose, `C2_LINK_ENABLED=1` in the e2e overlay. | **A.** B means editing `scripts/compose-env.test.sh:46-49`, a real committed gate that asserts the e2e stack is C2-dark, plus a new service, a new image and a new OAuth-shaped fake — for coverage that Task 9's integration test already provides at the layer that matters (server writes → client predicate reads, over real Postgres). A's `page.route` has in-repo precedent (`e2e/onboarding.spec.ts:379-383`, `e2e/log.spec.ts:1015`). | B is the only way to exercise the web OAuth hop end to end. It is a legitimate want; it is its own PR, and this plan names it as a follow-on rather than smuggling it in. |

Two further items the amendment asks James to approve but which need no code branch: the six copy/shape changes in its §0, and the five new states (1f needs-reauth, 1g update-required, 1h unavailable, 2f row-level reconnect, and the REASON lines).

## Wire contract summary (what this PR builds against)

Read at `3e15378e`. PR2 keys on `body.error`, never on status alone — **409 carries three different meanings** on the upload route.

| route | success | failures this surface renders |
| --- | --- | --- |
| `GET /api/concept2/link` (`routes/concept2.ts:519-548`) | `200 {available:false}` (flag off, HTTP 200 on purpose — `:524-529`) · `200 {available:true, linked:false}` · `200 {available:true, linked:true, weightClass, c2UserId, needsReauth}` **+ `c2Username`, `logbookBaseUrl` after Task 3** | 401; 400 `ambiguous_auth` |
| `POST /api/concept2/connect` (`:218-283`) — via `startLink`, never called directly | `200 {authorizeUrl, state}` | 403 `unavailable`; 400 field-named `weightClass`; **409 `update_required`** (`:244-247`) |
| `DELETE /api/concept2/link` (`:550-565`) | `204`, idempotent (deleting an absent link still 204s) | 403 `unavailable`; 401 |
| `POST /api/concept2/results/:logId` (`:569-906`) | `200 {resultId}` — including the already-sent short-circuit at `:627-630` | **409 `duplicate`** + `c2ResultId` (`:896-898`) · **409 `needs_reauth`** (`:617-620`, `:848`) · **409 `unlinked`** (`:614`) · 422 `not_eligible` + `reason` (`:636`) · 403 `unavailable` (`:576`) · 404 (`:585`, `:609`) · 400 `field:"tz"` (`:596-601`) · 502 `c2_error` |

`adapters/linkFlow.ts`'s `startLink({weightClass}) → LinkOutcome`, 16 members (`:79-106`), 17 after Task 2's `busy` split is counted by source. Every member's card treatment is tabulated in the amendment's §1e.

Eligibility, server-side and authoritative (`server/concept2/mapping.ts:60-72`): `source === "pm5"` AND `endedBy === "finished"` AND `workSeconds !== null` AND `workMeters !== null`. **Measured audience:** 6 of 20 prod rows pass this fence (`docs/monitor/c2-crossconnect-2026-09/README.md`, "Eligible-population count", recounted at #244 finding 4).

## Lifetime table (RF27)

Every piece of state this PR introduces, with its mint site, its clear sites, and what survives each boundary. **The invariants, stated first, because a mechanism is not an invariant:**

- **I1.** The card's view of the link is never inferred from an outcome. After every attempt the card re-reads `GET /api/concept2/link` and renders what the SERVER says. An outcome saying `linked` while the server disagrees must render as not-linked.
- **I2.** The unlink arm is armed by exactly one tap and disarmed by exactly one of: a second tap, four seconds elapsing, or the card unmounting. It can never survive a navigation away from You.
- **I3.** A row's sent state is a fact about the row and the LIVE link together. It is re-derived on every render from `(row.c2ResultId, row.c2UserId, link.c2UserId)` and is never cached across a link change.
- **I4.** The weight-class draft is transient and per-mount. It is never persisted, never sent except in a mint body, and is cleared by a successful unlink so a relink asks again.

| State | Owner | Mint site | Clear sites | Survives unmount? | Survives relaunch? | Survives a link change? |
| --- | --- | --- | --- | --- | --- | --- |
| `link` (`Concept2Link \| null`) | `useConcept2Link` | mount effect's `reload()` | replaced by every `reload()`; `null` only before the first read resolves | no | no | it IS the link |
| `failed` (read failed) | `useConcept2Link` | the `reload()` catch | cleared by any successful `reload()` | no | no | n/a |
| `weightClass` draft | `Concept2Card` | the rower's tap on the radiogroup | successful unlink; unmount | no | no | reset on unlink (I4) |
| `outcome` (`LinkOutcome \| null`) | `Concept2Card` | `startLink` resolving | set to `null` at the start of each `connect()`; cleared by a successful unlink; unmount | no | no | superseded by the next attempt |
| `busy` | `Concept2Card` | `connect()` / `unlink()` entry | those functions' `finally` — every exit, never only the happy one | no | no | n/a |
| `armed` + `disarmRef` timer | `Concept2Card` | `arm()` (one tap) | `disarm()` (second tap or successful unlink), the 4 s timeout, and the unmount cleanup (`useEffect(() => disarm, [disarm])`) | **no — cleared on unmount, which is I2's whole point** | no | n/a |
| `send` (`SendState`) | `Concept2SendBlock` | `post()` entry | replaced by each response; unmount | no | no | recomputed against the fresh link (I3) |
| `linkInFlight` | `adapters/linkFlow.ts` module scope | `startLink` entry (`:289`) | `startLink`'s `finally` (`:328-332`) | **yes — module scope survives component unmount** | no (a WebView reload destroys the module) | n/a |

`linkInFlight` is the one piece of state that outlives the card, and deliberately: its own comment (`linkFlow.ts:108-113`) records that the AUTHORITY on "one link session per app process" is Swift's `activeSession`, and this flag exists only so a double-tap in one document does not mint twice. **This PR adds no module-scoped state of its own.** No new Web or OS API is used, so no availability floor against `IPHONEOS_DEPLOYMENT_TARGET` is owed — `window.open` (Task 2) is universally available and is the web arm only.

---

## Task 0: Gate 0 — the amendment, approved before anything is built

**This is a gate, not a build step. No task below starts until it returns APPROVED.**

**Files:**
- Already written: `docs/design/handoffs/2026-08-31-concept2-connect/amendment-2026-09-03.html`

**Interfaces:**
- Produces: James's ruling on (i)-(v), on the amendment's six copy/shape changes, and on the five new states. Every task below cites the amendment for its copy.

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
- Produces: `Concept2Link`, `LINK_UNAVAILABLE`, `normalizeLink(body: unknown): Concept2Link`, `useConcept2Link(): { link, failed, setLink, reload }`; `FAILED_LINE`, `LinkFailure`, `identityLine(link, email): string`, `describeFailure(outcome): LinkFailure | null`.

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

```ts
import { describe, it, expect } from "vitest";
import { normalizeLink, LINK_UNAVAILABLE } from "./useConcept2Link";

describe("normalizeLink (routes/concept2.ts:519-548's three response shapes)", () => {
  it("reads a flag-off 200 as unavailable, never as unlinked", () => {
    // routes/concept2.ts:524-529 answers {available:false} with HTTP 200 on
    // purpose, so a flag-off server would otherwise read exactly like an
    // unlinked one (Concept2LinkProbe.tsx:118-121 names the same trap).
    expect(normalizeLink({ available: false })).toEqual(LINK_UNAVAILABLE);
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
    ).toEqual({
      available: true,
      linked: true,
      weightClass: "L",
      c2UserId: 2211,
      c2Username: "jamesawesome",
      needsReauth: true,
      logbookBaseUrl: "https://log-dev.concept2.com",
    });
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
    expect(normalizeLink(null)).toEqual(LINK_UNAVAILABLE);
    expect(normalizeLink("nope")).toEqual(LINK_UNAVAILABLE);
  });
});
```

- [ ] **Step 2: Run them and confirm they fail.**

```bash
cd /Users/james/projects/github/jamesawesome/Ergomatic-wt-c2pr2/app && \
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
    c2Username: typeof raw.c2Username === "string" ? raw.c2Username : null,
    needsReauth: raw.needsReauth === true,
    logbookBaseUrl:
      typeof raw.logbookBaseUrl === "string" ? raw.logbookBaseUrl : null,
  };
}

/**
 * Reads the link once on mount and on demand. `.then`/`.catch` rather than
 * `async`/`await` inside the effect, and NOT stylistic:
 * `react-hooks/set-state-in-effect` (`eslint.config.js`) rejects an effect
 * that reaches a `setState` synchronously, which an `async` function's
 * pre-`await` body is. This is the repo's own mount-fetch idiom
 * (`WorkoutDetail.tsx:52`, `Concept2LinkProbe.tsx:150-162`).
 *
 * `failed` exists for the same reason that hook's does: a dropped request
 * must not leave a stale `link` on screen reading as a state nobody
 * observed. The card renders NOTHING while `failed` (Gate 0 amendment 1h).
 */
export function useConcept2Link(): {
  link: Concept2Link | null;
  failed: boolean;
  setLink: (next: Concept2Link) => void;
  reload: () => Promise<void>;
} {
  const [link, setLink] = useState<Concept2Link | null>(null);
  const [failed, setFailed] = useState(false);

  const reload = useCallback(
    () =>
      api("/api/concept2/link")
        .then((res) => res.json() as Promise<unknown>)
        .then((body) => {
          setLink(normalizeLink(body));
          setFailed(false);
        })
        .catch(() => {
          setFailed(true);
        }),
    [],
  );

  useEffect(() => {
    void reload();
  }, [reload]);

  return { link, failed, setLink, reload };
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
 *  page recognises this card. The numeric fallback is what a link with no
 *  stored username renders — never an empty identity. */
export function identityLine(link: Concept2Link, email: string): string {
  const c2 =
    link.c2Username ??
    (link.c2UserId === null ? "account" : `account #${String(link.c2UserId)}`);
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
cd /Users/james/projects/github/jamesawesome/Ergomatic-wt-c2pr2 && git rev-parse --show-toplevel
git add app/src/api/useConcept2Link.ts app/src/api/useConcept2Link.test.ts app/src/you/concept2CardModel.ts app/src/you/concept2CardModel.test.ts
git commit -m "Wave E PR2: the link hook and the card's pure failure model"
```

  Then, one at a time, applying the change, running the covering file, recording the exact failure text, and reverting with `git checkout --` after a `git status` check:

  | # | Mutation | Must fail |
  | --- | --- | --- |
  | M1 | `normalizeLink`: change `if (raw.available !== true)` to `if (raw.available === false && raw.linked === undefined)` | "reads a flag-off 200 as unavailable" |
  | M2 | `normalizeLink`: drop the `typeof raw.c2UserId === "number"` guard, returning `raw.c2UserId as number` | "degrades every unknown field" |
  | M3 | `describeFailure`: return `null` for `busy` unconditionally (the pre-split behaviour) | "separates the two busy sources" |
  | M4 | `describeFailure`: return `FAILED_LINE` for `declined` | "gives a declined link its own line" |
  | M5 | `identityLine`: swap to `` `Ergomatic ${email} · Concept2 ${c2}` `` | "names the Concept2 username and the Ergomatic email, in the callback page's order" |
  | M6 | `identityLine`: return `` `Concept2 ${link.c2Username ?? ""} · …` `` | "falls back to the numeric account" |

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

  Append to `app/src/adapters/linkFlow.test.ts`:

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
  expect(second).toEqual({ kind: "busy", source: "guard" });
});
```

- [ ] **Step 2: Run and confirm failure.**

```bash
cd /Users/james/projects/github/jamesawesome/Ergomatic-wt-c2pr2/app && \
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
cd /Users/james/projects/github/jamesawesome/Ergomatic-wt-c2pr2/app && \
  NODE_OPTIONS=--no-experimental-webstorage pnpm exec vitest run --project client src/adapters src/monitor/Concept2LinkProbe.test.tsx && \
  pnpm exec tsx scripts/webauth-contract.test.ts 2>/dev/null || \
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
- Create: `app/drizzle/00NN_<name>.sql` + `app/drizzle/meta/00NN_snapshot.json` + journal entry, via `pnpm db:generate`
- Modify: `app/server/stores/concept2.ts` (`upsertLink`'s input, `getLink`'s projection, the type)
- Modify: `app/server/testing/fakes.ts` (`makeFakeConcept2Store`, mirroring the column)
- Modify: `app/server/routes/concept2.ts` (both `upsertLink` calls pass `c2Username`; `GET /link` returns `c2Username` and `logbookBaseUrl`; `Concept2RouterDeps` gains `logbookBaseUrl`)
- Modify: `app/server/index.ts` (pass `c2BaseUrl` in as `logbookBaseUrl`), `app/server/app.ts` (thread it)
- Test: `app/server/routes/concept2.test.ts` (append), `app/server/db/schema.integration.test.ts` (append a migration describe)

**Interfaces:**
- Produces: `concept2_links.c2_username text` (nullable); `GET /api/concept2/link` gains `c2Username: string | null` and `logbookBaseUrl: string` on the linked-and-available response.

- [ ] **Step 1: Check the migration index BEFORE generating.** Run and record the output in the task report (agent briefing: "Drizzle migrations apply by TIMESTAMP, not journal order … Check open PRs for a competing index before you generate one"):

```bash
cd /Users/james/projects/github/jamesawesome/Ergomatic-wt-c2pr2 && ls app/drizzle/*.sql | tail -3
node -e "console.log(require('./app/drizzle/meta/_journal.json').entries.at(-1))"
gh pr list --json number,headRefName,files --jq '.[] | {number, headRefName, drizzle: [.files[].path | select(startswith("app/drizzle"))]}'
```
  Re-run both immediately before opening the PR. A competing index means deleting this migration and regenerating off new main, never a journal merge.

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
  expect(res.body).toEqual({ available: false });
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

- [ ] **Step 5: Thread it through the store, the fake, and both write sites.** In `app/server/stores/concept2.ts`, add `c2Username: string | null` to `upsertLink`'s input type and its `values`/`set` clauses, and to the row `getLink` returns. Mirror it in `app/server/testing/fakes.ts`'s `makeFakeConcept2Store`. In `app/server/routes/concept2.ts`, both `upsertLink` calls already hold the value — the web callback at the `renderCallbackPage("linked", …)` site reads `me.username` and the native exchange has the identical `me`:

```ts
      await store.upsertLink(user.id, {
        c2UserId: me.c2UserId,
        c2Username: me.username,
        accessToken: tokenResult.tokens.accessToken,
        refreshToken: tokenResult.tokens.refreshToken,
        expiresAt: tokenResult.tokens.expiresAt,
        weightClass: consumed.weightClass,
      });
```

  (and the same addition in the `POST /exchange` handler's `upsertLink` call, with `userId` in place of `user.id`).

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
        logbookBaseUrl,
        needsReauth: link.needsReauthAt !== null,
      });
```

  Thread `logbookBaseUrl` from `app/server/index.ts`'s existing `c2BaseUrl` (`:119`) through `app/server/app.ts`'s `AppDeps.concept2`, exactly as `webRedirectUri` is threaded today.

- [ ] **Step 7: Run the server gates.**

```bash
cd /Users/james/projects/github/jamesawesome/Ergomatic-wt-c2pr2/app && \
  pnpm lint && pnpm typecheck && pnpm format:check && \
  NODE_OPTIONS=--no-experimental-webstorage pnpm exec vitest run --project unit && \
  NODE_OPTIONS=--no-experimental-webstorage pnpm exec vitest run --project integration
```

- [ ] **Step 8: Commit, then probe.**

  | # | Mutation | Must fail |
  | --- | --- | --- |
  | M10 | `GET /link` omits `c2Username` from the response object | "GET /link names the linked Concept2 username and the logbook origin" |
  | M11 | `GET /link` returns `logbookBaseUrl: "https://log.concept2.com"` hardcoded | same test |
  | M12 | the web callback's `upsertLink` drops `c2Username: me.username` | the integration round-trip in step 2's third test |
  | M13 | the flag-off branch returns `{available:false, logbookBaseUrl}` | "GET /link leaks neither field while the flag is off" |

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
import { render, screen, act } from "@testing-library/react";
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
    mount({ available: false });
    await renderCard();
    expect(await screen.findByTestId("c2-probe-settled")).toBeTruthy();
    expect(screen.queryByText("CONCEPT2")).toBeNull();
  });

  it("renders NOTHING when the link read fails outright", async () => {
    const api = vi.fn(async () => Promise.reject(new Error("offline")));
    vi.doMock("../api", () => ({ api }));
    vi.doMock("../adapters/linkFlow", () => ({ startLink: vi.fn() }));
    await renderCard();
    expect(screen.queryByText("CONCEPT2")).toBeNull();
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
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    mount(LINKED);
    await renderCard();
    await user.click(await screen.findByRole("button", { name: "Unlink Concept2" }));
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

  *(The `c2-probe-settled` testid in the first case is a stand-in for whatever settle signal the implementer chooses — a `findBy` on a sibling that the same mount effect resolves. RF: never assert an absence before awaiting a positive readiness signal owned by the async work; pick a real observable and name it in the task report.)*

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
import { useConcept2Link } from "../api/useConcept2Link";
import OptionGroup from "../onboarding/OptionGroup";
import { describeFailure, identityLine } from "./concept2CardModel";

/**
 * Wave E PR2, Surface 1 (board `docs/design/handoffs/2026-08-31-concept2-
 * connect/README.md` states 1a-1e, amended 2026-09-03 by
 * `amendment-2026-09-03.html` states 1f-1h). The rower's only door to the
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

export default function Concept2Card({ email }: { email: string }) {
  const { link, failed, reload } = useConcept2Link();
  const [weightClass, setWeightClass] = useState<WeightClass | null>(null);
  const [outcome, setOutcome] = useState<LinkOutcome | null>(null);
  const [busy, setBusy] = useState(false);
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
      }
    } finally {
      setBusy(false);
    }
  }

  // Amendment 1h: nothing renders while the surface is unavailable, while
  // the read failed, or before the first read resolves. A card that cannot
  // say what it is showing shows nothing rather than a wrong state.
  if (failed || link === null || !link.available) return null;

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
/* Wave E PR2, Surface 1 (board 1a-1e + Gate 0 amendment 1f-1h). House card
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
   DEVIATIONS row (this PR's Task 12). Outlined at rest, filled when armed:
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
  flex-direction: row;
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

.c2-card .onb-option[aria-checked="true"] {
  background: var(--ink);
  border-color: var(--ink);
  color: var(--on-color);
}
```

  **Before finishing this step, read `.onb-option`'s existing checked rule** (`index.css`, the "2px accent border when checked" comment at `:8755-8757`) and confirm this override wins on specificity; if it does not, the checked rule needs the same `.c2-card ` prefix. Do not assume.

- [ ] **Step 5: Run the tests, then the scoped gates.**

```bash
cd /Users/james/projects/github/jamesawesome/Ergomatic-wt-c2pr2/app && \
  NODE_OPTIONS=--no-experimental-webstorage pnpm exec vitest run --project client src/you/Concept2Card.test.tsx && \
  pnpm lint && pnpm typecheck && pnpm format:check
```

- [ ] **Step 6: Commit, then probe.**

  | # | Mutation | Must fail |
  | --- | --- | --- |
  | M14 | drop the `!link.available` clause from the early return | "renders NOTHING when the server says the surface is unavailable" |
  | M15 | drop the `failed` clause from the early return | "renders NOTHING when the link read fails outright" |
  | M16 | `disabled={busy}` on the Connect button (drop the `weightClass === null` clause) | "asks the weight class unconditionally and keeps Connect inert" |
  | M17 | make the first Unlink tap call `unlink()` directly | "does not delete on the first tap" |
  | M18 | change `UNLINK_DISARM_MS` to `8000` | "disarms on its own after 4 s" — this is the probe that proves the deadline test uses INDEPENDENT literals rather than the production constant (RF21) |
  | M19 | delete the `await reload()` from `connect()` | "re-reads the server after every attempt" |
  | M20 | reconnect passes `weightClass` (the draft) instead of `link.weightClass` | "reconnects from the STORED weight class" |
  | M21 | remove `setWeightClass(null)` from `unlink()` | needs a new test: unlink then re-render, assert Connect is inert again (invariant I4). **Write it in this task.** |

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
    expect(readSendResponse(200, { resultId: 339 })).toEqual({
      kind: "sent",
      resultId: 339,
    });
  });

  it("tells the three 409s apart by body.error, not by status", () => {
    expect(readSendResponse(409, { error: "duplicate", c2ResultId: 339 })).toEqual(
      { kind: "duplicate", resultId: 339 },
    );
    expect(readSendResponse(409, { error: "needs_reauth" })).toEqual({
      kind: "reauth",
    });
    expect(readSendResponse(409, { error: "unlinked" })).toEqual({
      kind: "gone",
    });
  });

  it("treats an eligibility or availability refusal as the block disappearing, never as a failure the rower retries", () => {
    expect(readSendResponse(422, { error: "not_eligible", reason: "not_finished" })).toEqual({
      kind: "gone",
    });
    expect(readSendResponse(403, { error: "unavailable" })).toEqual({
      kind: "gone",
    });
  });

  it("names the tz refusal specifically, by its field", () => {
    expect(
      readSendResponse(400, {
        error: "tz must be an IANA timezone name",
        field: "tz",
      }),
    ).toEqual({
      kind: "failed",
      reason: "COULDN'T READ THIS DEVICE'S TIME ZONE",
    });
  });

  it("degrades a malformed 200 rather than rendering SENT with no id", () => {
    expect(readSendResponse(200, {}).kind).toBe("failed");
    expect(readSendResponse(409, { error: "duplicate" }).kind).toBe("failed");
  });

  it("uses no em-dash in any reason (house style)", () => {
    for (const [status, body] of [
      [502, { error: "c2_error" }],
      [404, {}],
      [418, {}],
    ] as const) {
      const state = readSendResponse(status, body);
      if (state.kind === "failed") expect(state.reason).not.toContain("—");
    }
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
cd /Users/james/projects/github/jamesawesome/Ergomatic-wt-c2pr2/app && \
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

## Task 6: The send block, its CSS, and its place in the log detail

**Files:**
- Create: `app/src/log/Concept2SendBlock.tsx`
- Modify: `app/src/log/FromTheLog.tsx` (import + one render slot)
- Modify: `app/src/index.css` (append the `.c2-send*` block)
- Test: `app/src/log/Concept2SendBlock.test.tsx`, `app/src/log/FromTheLog.test.tsx` (append the placement and absence cases)

**Interfaces:**
- Consumes: Task 5's model, Task 1's hook, Task 2's `openReadOnlyUrl`.
- Produces: `default Concept2SendBlock({ row }: { row: StoredLog })`.

**Placement, and why it is the only order that satisfies both authorities.** The board: "end of the log-detail scroll, after the 'Logged to <plan>' line". `FromTheLog.tsx:564-569`'s own placement rule for the delete affordance: "Bottom of the view, below the plan footer — last, quiet, away from Edit." Both hold only if the send block sits BETWEEN the plan footer (`:560-562`) and the delete trigger (`:570`). That is the slot.

**RF23 enumeration for this surface.** What already sits on the log-detail screen and could offer or write the same thing: the heroes block (renders numbers, offers nothing), the read-back/Edit affordance (`:530-537`, writes held/pain/thumbs/notes — not this row's totals), the intervals table (read-only), `MachineConfirmedBlock` (`:549`, renders the machine's own work totals and verification code — the EVIDENCE this send is built on, and it offers no action), `TraceChart` (`:558`), the plan footer (`:560`), and Delete session (`:570-607`, destroys the row). **No existing control offers to send, publish, export or link this row anywhere.** The nearest neighbour is `MachineConfirmedBlock`, which states what the machine measured; the send block states what Concept2 did with it. They do not compete, and the board's own RF23 note reached the same conclusion ("send is not Edit"). One thing to watch and to test: **Delete session destroys a row that may already be on Concept2, and the board's unlink copy establishes the house position ("Rows already sent stay on Concept2")** — the delete confirm copy is NOT changed by this PR, and Task 12 records the question rather than answering it silently.

- [ ] **Step 1: Write the failing tests.** `app/src/log/Concept2SendBlock.test.tsx`, in the same `vi.doMock` idiom:

```tsx
describe("Concept2SendBlock absence (board: not linked -> nothing on the row)", () => {
  it("renders nothing when no account is linked", async () => { /* mount({available:true, linked:false}) with an ELIGIBLE row; expect queryByText("CONCEPT2") to be null AFTER awaiting the settle signal */ });
  it("renders nothing when the surface is unavailable", async () => { /* {available:false} */ });
  it("renders nothing for every non-qualifying row, linked or not", async () => {
    // RF3: build these from the real `storedRow` fixture (SEA_FRET), not a
    // hand-built minimum — a timer row, a link-lost row, a work-column-less
    // row. Each: linked account, and still no block.
  });
});

describe("Concept2SendBlock idle -> sent (board 2a/2b/2c, amendment change 4)", () => {
  it("posts the row with this device's IANA zone, which the route requires on every upload", async () => {
    // routes/concept2.ts:592-601 400s without it, EVEN when the row already
    // has one stored. Assert the POST path and that the body carries a `tz`.
  });
  it("renders SENT with the result id and NO timestamp", async () => {
    // Amendment change 4: nothing stores when Concept2 accepted the row.
    expect(await screen.findByText("Accepted by Concept2.")).toBeTruthy();
    expect(screen.getByText(/RESULT 339/)).toBeTruthy();
    expect(screen.queryByText(/Accepted by Concept2 ·/)).toBeNull();
  });
  it("opens the result through the read-only adapter, never by navigating this document", async () => {
    // Task 2's openReadOnlyUrl, mocked; assert the exact URL built from the
    // server's own logbookBaseUrl (plan observation 5).
    expect(openReadOnlyUrl).toHaveBeenCalledWith(
      "https://log-dev.concept2.com/profile/2211/log/339",
    );
  });
});

describe("Concept2SendBlock stored sent state (spec anchor F8)", () => {
  it("renders SENT on mount for a row already carrying the LIVE link's result", async () => { /* row.c2ResultId=339, row.c2UserId=2211, link 2211 */ });
  it("renders IDLE for a row accepted by a DIFFERENT account", async () => { /* row.c2UserId=999, link 2211: the offer is back, because this account has not sent it */ });
});

describe("Concept2SendBlock refusals (amendment 2d/2e/2f)", () => {
  it("renders ALREADY THERE with the colliding result's own link", async () => { /* 409 duplicate + c2ResultId */ });
  it("renders RECONNECT NEEDED with no retry, because retrying cannot help", async () => { /* 409 needs_reauth */ });
  it("renders SEND FAILED with a REASON and a retry", async () => { /* 502 c2_error */ });
  it("disappears rather than offering a retry when the server says unlinked", async () => { /* 409 unlinked */ });
  it("survives a non-JSON error body without throwing", async () => { /* a 502 with an HTML body — the rolling-deploy case linkFlow.ts:124-127 names */ });
});
```

  And append to `app/src/log/FromTheLog.test.tsx`:

```tsx
it("places the Concept2 block between the plan footer and Delete session", async () => {
  // Both placement authorities hold only in this order: the board ("end of
  // the scroll, after the Logged to <plan> line") and FromTheLog.tsx's own
  // delete rule ("bottom of the view, below the plan footer"). Asserted by
  // DOCUMENT ORDER, not by presence — presence alone would pass with the
  // block anywhere on the screen.
  // …render a linked, eligible row, then compare
  // compareDocumentPosition of the plan footer, the c2 section, and the
  // delete trigger.
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

  if (failed || link === null || !link.available || !link.linked) return null;
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

## Task 7: Mount the card on You

**Files:**
- Modify: `app/src/You.tsx`
- Test: `app/src/You.test.tsx` (append)

**Interfaces:**
- Consumes: `Concept2Card` (Task 4).

**Placement:** after `ResetBaselineSetup` (`You.tsx:89`) and before the dev-only probe (`:97-101`), which itself stays above the DIAGNOSTICS row (`:102-115`, whose comment requires it stay the LAST child). So the order becomes: BASELINES · RetestShortcut · ResetBaselineSetup · **Concept2Card** · [dev probe] · DIAGNOSTICS.

- [ ] **Step 1: Write the failing tests.** `You.test.tsx` already neutralises the probe wholesale (`You.test.tsx:13`, `vi.mock("./monitor/Concept2LinkProbe", …)`); do NOT neutralise the product card the same way — the point is that it renders.

```tsx
it("renders the Concept2 card between the baseline reset and the diagnostics row", async () => {
  // Document order, not presence: the DIAGNOSTICS row's own comment
  // (You.tsx:102-115) requires it stay the last child, and the card must
  // not displace it.
});

it("passes the signed-in rower's own email to the card, so the identity line names both principals", async () => {
  // Gate 0 amendment 1c. The card cannot fetch this — `Me` is You's prop.
});

it("renders no Concept2 card at all when the server reports the surface unavailable", async () => {
  // The whole-screen half of Task 4's own unit case: You itself must not
  // reserve space, add a heading, or draw a hairline for an absent card.
});
```

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

## Task 8: `dist:grep` and the production-bundle claim

**Files:**
- Modify: none expected. **Read** `app/scripts/dist-grep.sh:89-127`.
- Test: the gate itself.

**Why this is its own task, not a step:** RF12 — "any claim of the form 'X is not in the production bundle' is settled by `pnpm build` plus a string-literal grep over `dist/`, in both directions." PR2 adds real user-facing Concept2 strings to the shipped bundle for the first time, and the existing eighth needle (`"C2 link probe (dev harness)"`) must still come back clean.

- [ ] **Step 1: Build and run the gate.**

```bash
cd /Users/james/projects/github/jamesawesome/Ergomatic-wt-c2pr2/app && pnpm build && pnpm dist:grep
```
Expected: PASS, all eight needles absent.

- [ ] **Step 2: Prove the probe needle can still go red** (RF21: a green gate nobody proved can fail is decoration). Rebuild with the flag on, confirm the gate FAILS on the eighth needle, then rebuild without it and confirm it passes again:

```bash
cd /Users/james/projects/github/jamesawesome/Ergomatic-wt-c2pr2/app && \
  VITE_ENABLE_C2_LINK_PROBE=1 pnpm build && pnpm dist:grep; echo "expected NON-ZERO: $?"
pnpm build && pnpm dist:grep; echo "expected 0: $?"
```

- [ ] **Step 3: Prove the PRODUCT card IS present**, in the other direction — the claim being made is that the card ships, hidden by the server flag rather than absent from the bundle (spec §Architecture 8: "Client code ships in the bundle either way — hidden, not absent; nothing in it is secret"):

```bash
cd /Users/james/projects/github/jamesawesome/Ergomatic-wt-c2pr2/app && \
  grep -rl "CONNECT TO CONCEPT2" dist/client && echo "PRESENT, as designed"
```

- [ ] **Step 4: Record all three results in the task report.** No needle is added: nothing this PR ships is dev-only.

---

## Task 9: The RF24 seam test — one gate that starts upstream of the producer

**Files:**
- Create: `app/server/routes/concept2Send.integration.test.ts`

**Interfaces:**
- Consumes: the real router, the real Postgres, the real logs store, and the CLIENT's own `isSendable`/`sentResultId` (Task 5).

**Why.** RF24, verbatim: "The check is not 'are the gates green' — it is 'which test STARTS upstream of the producer?' For any A-writes-then-B-reads seam, one test must begin before A and assert after B." The seam here is `POST /api/concept2/results/:logId` writes `c2_result_id`/`c2_user_id` → the log detail screen reads them off `GET /api/logs/:id` and renders SENT. Every other gate in this PR enters the pipe below the break: `Concept2SendBlock.test.tsx` mocks the API, `concept2Send.test.ts` hands the predicate a hand-built row, `concept2.test.ts` stops at the route's own response. **Nothing mounts the reader after the producer writes** — which is exactly the shape that let `MACHINE CONFIRMED · WORK ONLY` reach zero of sixteen production rows through three green gates.

The cross-tree import is not novel: `app/server/routes/partial.integration.test.ts:32` already does `import type { RecentLog } from "../../src/api/useRecentLogs.js"` and compares the server's SQL predicate against the client's TypeScript one in one file, with that file's own comment (`:54-62`) explaining the exception to "server code never imports from the client tree".

- [ ] **Step 1: Write the test.**

```ts
// Header, following partial.integration.test.ts:54-62's own precedent for
// the cross-tree import: this file is a TEST, not server code, and its
// entire purpose is to hold the two trees' views of one seam equal.
import { isSendable, sentResultId } from "../../src/log/concept2Send.js";
import type { StoredLog } from "../../src/log/storedSummary.js";
import type { Concept2Link } from "../../src/api/useConcept2Link.js";

describe("the Concept2 send seam: the route writes, the log detail reads (RF24)", () => {
  it("the eligibility predicate the CLIENT renders on and the one the SERVER enforces agree, row for row", async () => {
    // Seed one row per shape through POST /api/logs — every LogSource, every
    // endedBy, with and without the work columns — then GET each back and
    // compare `isSendable(row as StoredLog)` against
    // `eligibilityFailure(...) === null` on the same stored row. Ordered
    // lists, so a disagreement names the shape.
  });

  it("a row sent through the real route reads back as SENT to the client's own predicate", async () => {
    // STARTS UPSTREAM: seed a link row and an eligible session_log; POST
    // /api/concept2/results/:logId against a stubbed C2 fetch returning 201
    // {id: 339} (transcribed from PR0's real sandbox response,
    // docs/monitor/c2-crossconnect-2026-09/raw-output.txt); then GET
    // /api/logs/:id and run the CLIENT's `sentResultId` over the body.
    const detail = await request(app).get(`/api/logs/${logId}`).set(auth(USER_ID));
    const row = detail.body as StoredLog;
    const link: Concept2Link = { /* as GET /api/concept2/link returned it */ };
    expect(sentResultId(row, link)).toBe(339);
  });

  it("a 409 duplicate reaches the client's predicate as SENT too, because the route records it (RF25)", async () => {
    // Same shape, C2 stub answering 409 with the colliding id. The route
    // writes before responding (routes/concept2.ts:890-895); the READER
    // must see it. This is the durable-recovery path, and it is the one
    // that would silently show "unsent forever" if the write were dropped.
  });

  it("a row accepted by a DIFFERENT Concept2 account reads back as NOT sent", async () => {
    // Send as account A, then relink to B, then re-read: sentResultId must
    // return null (spec anchor F8).
  });
});
```

- [ ] **Step 2: Run it** (`--project integration`, Docker required). **Step 3: commit, then probe.**

  | # | Mutation | Must fail |
  | --- | --- | --- |
  | M37 | delete `c2ResultId`/`c2UserId` from the client's `StoredLog` | typecheck fails in this file — which is the point: the seam is now compile-coupled |
  | M38 | `routes/concept2.ts`'s duplicate branch: remove the `recordC2Result` call before responding | "a 409 duplicate reaches the client's predicate as SENT too" |
  | M39 | `mapping.ts`'s `eligibilityFailure`: drop the `endedBy` clause | "the eligibility predicate the CLIENT renders on and the one the SERVER enforces agree" |
  | M40 | `concept2Send.ts`'s `isSendable`: accept `"no-reading"` as well as `"pm5"` | same test, from the other side |

---

## Task 10: e2e flows and screenshots

**Files:**
- Create: `app/e2e/concept2.spec.ts`
- Modify: `app/e2e/screenshots.spec.ts` (append captures), `app/e2e/design.spec.ts` (append structural assertions)
- Modify: `docs/screenshots/` (the new captures)

**Scope, per ruling (v)=A.** The e2e stack is C2-dark by construction and a committed CI test enforces it (`scripts/compose-env.test.sh:46-49`), so these flows fake the server's Concept2 answers in the browser with `page.route` — the precedent is `e2e/onboarding.spec.ts:379-383` and `e2e/log.spec.ts:1015`. **Say this out loud in the spec file's header:** these prove the CLIENT's states and its wiring, not the server's, and Task 9 is what proves the seam. A real fake-Concept2 service is named as a follow-on in Task 12's ROADMAP row, not smuggled in here.

- [ ] **Step 1: Write `app/e2e/concept2.spec.ts`.** Sign in via `signInViaBackdoor`, seed a real eligible monitor row with `design.spec.ts:2212`'s `seedCompletedMonitorRun` helper (or the `postLog` shape at `log.spec.ts:66`, with `source: "pm5"`, `endedBy: "finished"` and both work columns — RF3: real shapes, not minima), then route `**/api/concept2/**` per test:

  - **`the surface is invisible while the server says unavailable`** — route `GET /link` to `{available:false}`; assert no `CONCEPT2` text on You and none on the log detail. This is the state every deployment is in today, so it is the one that must never regress.
  - **`connect asks the weight class, then hands off`** — `{available:true, linked:false}`; assert Connect is disabled, pick Heavyweight, assert enabled; route `POST /connect` to `{authorizeUrl: "/api/concept2/callback?stub=1", state: "s"}` and assert the navigation is attempted.
  - **`a linked account names itself and unlinks in two taps`** — `{available:true, linked:true, …}`; assert the identity line; tap Unlink; assert no DELETE fired; tap again; assert the DELETE and that the card returns to the unlinked state.
  - **`a qualifying row offers Send; a timer row does not`** — two seeded rows, one `pm5`/`finished`, one `timer`; open each detail door; assert the block on one and its total absence on the other.
  - **`send -> SENT with the result link`** — route `POST /results/*` to `200 {resultId: 339}`; tap Send; assert `Accepted by Concept2.`, `RESULT 339`, and that the link-out's target is `https://log-dev.concept2.com/profile/2211/log/339`. (Assert the URL the button would open, not a navigation: `openReadOnlyUrl`'s web arm opens a new context and Playwright would need a popup handler; use `page.waitForEvent("popup")` if asserting the real open, and say which you did.)
  - **`send -> 409 duplicate -> ALREADY THERE`** and **`send -> 502 -> SEND FAILED with a REASON and a retry`**.

- [ ] **Step 2: Append structural design assertions to `design.spec.ts`** — per `docs/TESTING.md`'s structural-design rule: every tappable in the card and the block measures ≥ 44px, and the card's own computed colours resolve to the tokens this plan names (not to raw hex). Measure the flex ITEM, never an inline element (RF21's second smell: `scrollWidth`/`clientWidth` are `0` on inline elements).

- [ ] **Step 3: Append screenshots**, seeded with REAL data (RF7) and each awaiting a real element before capturing (`screenshots.spec.ts:325-338`'s own lesson: the one capture that skipped the `waitFor` committed a blank cream rectangle):

  | capture | seed |
  | --- | --- |
  | `you-concept2-unlinked.png` | `{available:true, linked:false}`, Heavyweight picked so Connect is live |
  | `you-concept2-linked.png` | linked, username `jamesawesome`, real signed-in email |
  | `you-concept2-armed.png` | linked, one tap on Unlink |
  | `log-concept2-idle.png` | a real eligible monitor row, linked account |
  | `log-concept2-sent.png` | the same row with `c2ResultId`/`c2UserId` already stored, so it reads SENT on mount |

  **2d Duplicate is not capturable this way** (observation 12): the route's write makes the next mount read SENT, so a seeded-and-reloaded duplicate renders 2c. If a duplicate capture is wanted it must drive the tap against a routed 409 in the same page. Decide, and say which.

- [ ] **Step 4: Run both browser gates and OPEN THE IMAGES.**

```bash
cd /Users/james/projects/github/jamesawesome/Ergomatic-wt-c2pr2/app && pnpm e2e && pnpm screenshots
```
  Then read each new PNG and describe what is in it in the task report (RF7: "open the image and look at it"). A capture showing an empty card or a fallback dash is a failure of this step, not of a later review.

- [ ] **Step 5: Commit, then probe.** At least: make the card render while `available:false` and confirm the invisibility test goes red; shrink a tappable to 40px and confirm the structural assertion goes red.

---

## Task 11: The callback pages' 401/403 copy

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
    action:
      "Sign in as that account in this browser, or start a new link from the account you're using.",
  },
```

- [ ] **Step 3: Run the server unit project. Step 4: commit, then probe** — restore "here" in one page and confirm the `/\bhere\b/` assertion goes red; add an `<a href="/">` to `shell()` and confirm the no-anchor assertion goes red (that second probe is what proves the constraint test is not decoration).

---

## Task 12: Reconciliation — the record made to describe this head

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
; do
  printf '\n=== %s ===\n' "$phrase"
  git grep -n -F -- "$phrase" -- ':!docs/superpowers/plans/2026-09-03-concept2-pr2-client.md' \
    ':!.claude/agents/*-ledger.md' ':!docs/history' || echo "(none)"
done
```
  Every hit is either reconciled in this task or has a stated reason it stands (a merged plan is a record and is never rewritten; the two agent ledgers are never edited; `docs/history/` is a RECORD).

- [ ] **Step 2: The specific reconciliations.**

  1. **`app/server/routes/concept2.ts:64-67`** — the "Until PR1.75b ships the ASWebAuthenticationSession plugin nothing on the device can receive it — the design's named intentional interval" comment. PR1.75b merged as `3e15378e`. Rewrite to record that the redirect is live on device and that live-portal registration is the remaining cutover step.
  2. **The parent spec's `weight_class` premise** — "GET /api/users/me returns 13 fields, none of them weight (V10)". Replace with the MEASURED list (sixteen fields, `weight` present, no `weight_class`), the date and provenance of the measurement (1.75a plan observation 3, live log-dev response 2026-09-02), and the conclusion that survives: `weight` is a mass, `weight_class` is C2's competition binary, and deriving one from the other needs a unit we have not measured and a gender-specific threshold. **Correct the claim where it was ARGUED and everywhere it was USED** — the board's conditional-ask amendment cites it.
  3. **The board's `LogRow.tsx` pointer** — the handoff README's "About the Design Files" section. Correct to `FromTheLog.tsx` with observation 1's reason.
  4. **The board's approved-amendments list** — record the six Gate 0 changes and the five new states, with the amendment file's path, so the README describes the surface as built.
  5. **`docs/design/DEVIATIONS.md`** — a row for the link-out's accent (observation 15 / amendment §5), naming the four canonical meanings, this fifth use, the ruling, and why a token was not minted. DEVIATIONS documents CURRENT STATE (RF9), so write it as the state, not as a history.
  6. **`app/src/adapters/externalBrowser.ts:1-6`** — its header says "PR2's read-only 'View on Concept2' link-out is the next one". It is no longer next; it is here, and it takes `openReadOnlyUrl`, not `openExternalUrl`. Reconcile.
  7. **`ROADMAP.md`'s Wave E PR2 checkbox** (`:1275-1278`) — tick it, and add the follow-ons this PR names rather than leaving them in the PR body (RF14): (a) the fake-Concept2 e2e service that ruling (v) declined; (b) the conditional weight-class ask, if ruling (i) went to A, as the two-phase-link design it would need; (c) **the delete-vs-sent question** raised in Task 6's RF23 enumeration — deleting a row that is already on Concept2 leaves the Concept2 row standing, which matches the unlink copy's position but is nowhere stated to the rower at the delete confirm.
  8. **`ROADMAP.md`'s "still owed after both PRs" list** (`:1262-1274`) — remove "PR2's surface + its Gate 0 identity-copy amendment" once this PR lands it, leaving the flag flip, write approval and live-portal registration.

- [ ] **Step 3: Run `pnpm lint typecheck format:check`.** Root markdown is NOT Prettier-formatted (CLAUDE.md) — **never run `prettier --write` on `ROADMAP.md` or `CLAUDE.md`**; wrap by hand to match the surrounding text.

---

## Task 13: The PR, its fold, and the release call

**Files:**
- No source changes. The PR body, the ROADMAP if the census moved anything, and the release recommendation.

- [ ] **Step 1: Reconcile before opening** (agent briefing's controller checklist): `git merge origin/main`; gates green on the merged tree; a CI run EXISTS for the exact head and is green (an empty check rollup is not green); the body names the current head and every figure in it is current; re-run Task 12's census.

- [ ] **Step 2: The fold.** Above the fold, exactly this. **Measured, not felt** (CLAUDE.md's countable form is ~120 words and ~25 per bullet): **112 words total, 5 bullets, longest bullet 23 words** — counted with `python3 -c "print(len(text.split()))"` over the block below on 2026-09-03. If the text changes, recount; do not carry these numbers forward unchanged.

```markdown
This PR puts Concept2 in front of the rower: link an account on You, send a finished monitor row from its log page, see where it landed.

- **You gains a Concept2 card.** Connect, one weight-class question, and which account is linked. Unlink takes two taps.
- **A finished monitor row gains Send.** It says SENT, ALREADY THERE, or why it failed, and links to the result on Concept2.
- **Nothing appears until the server says so.** Every deployment today looks exactly as it does now.
- **Testers see this once the flag flips**, which still waits on Concept2's write approval.
- **Try it:** You tab, then any PM5 row you finished.
```

- [ ] **Step 3: Everything else goes in a collapsed `<details>` block titled "Record (for agents and audits)"** — the Gate 0 approval, the rulings and their answers, every mutation probe with the exact failure text, per-file coverage for the five new source files (`api/useConcept2Link.ts`, `you/concept2CardModel.ts`, `you/Concept2Card.tsx`, `log/concept2Send.ts`, `log/Concept2SendBlock.tsx`) from the HTML report under `app/coverage/`, saying that is the source rather than the text reporter, which omits some directories, the `dist:grep` red-then-green proof, the census outputs, and the screenshots.

- [ ] **Step 4: The risk note.** Name what a reviewer should probe: the two cross-tree predicates staying in step, the `busy` union change against `scripts/webauth-contract.test.ts`, the `.onb-option` CSS override's specificity, and the one thing no gate in this repo can reach — the native arm, which only a device walk sees.

- [ ] **Step 5: Gates.** This PR is TRIAD-adjacent at minimum: it is the only surface through which a rower creates or destroys an OAuth grant, and with ruling (ii)=B it also carries a stored shape. **Run the full cycle: a full antagonist pass on this plan before implementation** (the phase's anchor pass never saw PR2's surface, and CLAUDE.md's own skip rule forbids waving a novel mechanism through), **and the PM final-PR gate on the PR.** State both, and state that the design gate was Task 0.

- [ ] **Step 6: The release call.** **This PR is the wave's first tester-visible piece** — PR0 through PR1.75b were all dark. So:
  - **The notes cover the whole feature, not this PR's diff.** PR1's routes, PR1.5's browser hop, PR1.75a's server binding and PR1.75b's native return all shipped with no note, because none of them changed anything a tester could see. The note a tester reads is "connect your Concept2 logbook and send finished rows to it", written once, here.
  - **RF15:** before cutting the tag, run `git log <prev-tag>..main --oneline` **WITHOUT `--merges`** (main is squash-merged and has no merge commits) and account for every entry with a note or a stated reason it needs none. Parallel sessions make this the normal case.
  - **The word "sync" appears in no note for this wave** (spec §Out of scope, PM): nothing here syncs.
  - **The recommendation itself is conditional and must say so:** the surface ships dark. `C2_LINK_ENABLED=1` on a real cohort is gated on Concept2's write approval being CONFIRMED and the live-portal registration of the native redirect (ROADMAP's C2 register row) — neither is code, and neither is this PR's to discharge. So: **release recommended** (the app changes, testers get the capability the moment the flag flips), with the note saying plainly that the card appears only once the connection is switched on.
  - **Agent configs:** say explicitly which, or "no change needed: <why>". Candidates this plan already surfaced: the paste-test finding that a required-and-nullable field addition names its own broken fixtures (a technique, for the briefing), and RF16's second corollary earning another instance (observation 7: a real citation, under-read).

---

## Self-review

**Spec coverage.** §Surfaces 1 (You card: unlinked, waiting, linked, unlink-confirm, link-failed) → Tasks 4, 7. §Surfaces 2 (log row: idle, sending, sent with link-out, duplicate, failed; non-qualifying and not-linked absence) → Tasks 5, 6. §Architecture 4 (`GET`/`DELETE /link`) → Tasks 1, 3, 4. §Architecture 5 (upload route, 409 recovery) → Tasks 5, 6, 9. §Architecture 8 (availability as a capability gate) → Tasks 4, 6, 10. §Stored shapes (sent-state authority, F8) → Tasks 5, 9. Exit criterion 3 (one new PII attribute) → Task 4's tests. Exit criterion 2 (a linked user sends an eligible row ON THE PHONE, with duplicate and failure each observed for real) → **NOT discharged by this PR: it needs a device walk against a flag-on server, and that walk is a separate card.** Named here rather than implied.

**Gaps, stated.** (a) The web OAuth hop is exercised by no automated gate — ruling (v) declines the fake-Concept2 service and Task 10 says so in the spec header. (b) The native arm is reachable by no gate in this repo (RF19); `Concept2LinkProbe` plus a walk is the whole instrument, and this PR does not add one. (c) Exit criterion 2 above.

**Type consistency.** `Concept2Link` is defined once (Task 1) and consumed by Tasks 3, 4, 5, 6, 9. `SendState` once (Task 5), consumed by Task 6. `LinkOutcome`'s `busy` member is widened in Task 2 and read in Task 1's `describeFailure` — **land Task 2 before or with Task 1**, since `describeFailure`'s `busy` arm does not compile against the current union. `isSendable`/`sentResultId` are named identically in Tasks 5, 6 and 9. `logbookBaseUrl` is the same name in the server response (Task 3), the client type (Task 1) and the URL builder (Task 5).

**Placeholders.** Tasks 6 step 1 and 9 step 1 carry test SKELETONS with prose bodies rather than complete code, deliberately and visibly: each names its seed, its assertion and its reason, and the surrounding cases are complete. Every other code step is complete, and every complete block in this plan typechecks and lints (see the paste-test receipt).
