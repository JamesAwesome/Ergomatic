# Apple sign-in Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let new rowers create accounts with Apple or Google and let existing rowers attach the other provider to their current account.

**Architecture:** Provider identity is the verified subject, never the email. Server-owned, short-lived attempts bind provider proofs and account confirmation to one operation; linking additionally requires fresh proof and the exact original live session. Native AuthenticationServices and web OAuth feed the same server flow.

**Tech Stack:** TypeScript, React 19, Express 5, PostgreSQL 18, Drizzle, openid-client, jose, Capacitor and Swift AuthenticationServices; Node 26 and pnpm.

**Spec:** `docs/superpowers/specs/2026-09-12-apple-signin-design.md`, approved with rendered Gate 0 by James on 2026-09-12.

## Global Constraints

- Worktree: `.claude/worktrees/wave-a-apple`; no source edits to main, no merge or phone install under this approval.
- Native deployment floor: iOS 15.0; native bundle ID `haus.waffle.ergomatic`.
- `FRONT_DOOR_ENABLED` defaults false; Apple and open admission remain dark together until deletion is available for external TestFlight.
- Preserve existing Google endpoint response contracts and the older-server Google fallback.
- Apple Hide My Email addresses are opaque; no email-based identity join or merge. Missing display name is `Rower`.
- New Apple accounts require a nonempty verified email; returning accounts resolve subject before profile requirements.
- All attempt stages expire after five minutes; reauthentication freshness never exceeds five minutes. Global anonymous admission is 120/minute and 512 live rows maximum.
- Apple grants retain the minimum refresh credential per user/client for the deletion slice. No tokens in logs or general UI state.
- Current live session must equal the original session before linking commits, including web same-origin finalization after the cross-site callback.
- User-visible copy and layout follow `docs/design/apple-signin/`; targets at least 44×44 px, text contrast at least 4.5:1, CSS custom properties, no animation or shadows.
- Parent coordinates integration; task authors own separate candidate worktrees and must not revert others' edits.

## Authoring and integration

All source modules are authored and paste-tested; independent hardening is next. The source contract is `2026-09-13-apple-auth-contract.md` beside this file. Each module carries its complete code and paste-test receipts; the assembled plan proceeds through the repository's harden gates before product integration.

Candidate adoption uses the repository-approved inline-author shape: retain and adopt the exact paste-tested code in task-sized commits, with the independent review half of subagent-driven development. Re-transcribing the same code is unnecessary. The PR records this shape.

### Task 1: Server identity and attempt lifecycle

**Files and executable steps:** `2026-09-13-apple-server.md` beside this plan.

**Interfaces:** Produces `app/shared/auth.ts` and the routes in the shared contract. Consumes verified Apple or Google proof plus the operation binding and, for links, the exact current session. Owns migration, providers, atomic stores, API mounting, boot configuration and cleanup lifecycle.

- [x] Complete and paste-test the server module, including real PostgreSQL behavior.
- [ ] Fold the mechanism/code hardening and DBA plan findings.
- [ ] Adopt the candidate, verify its task gates, commit real work before mutation probes, then complete spec and quality review.

### Task 2: Native Apple authorization bridge

**Files and executable steps:** `2026-09-13-apple-native.md` beside this plan.

**Interfaces:** Produces `AppleAuth.authorize({nonce:string,state:string})` returning `{idToken:string,authorizationCode:string,state:string,name?:string}`. Owns the thin native TypeScript interface, Swift plugin, controller registration, entitlement and Xcode membership. Does not own adapter orchestration.

- [x] Complete and paste-test the native module with an unsigned simulator build.
- [ ] Fold applicable hardening findings.
- [ ] Adopt the candidate, verify its task gates and complete spec and quality review.

### Task 3: Welcome, confirmation and sign-in methods

**Files and executable steps:** `2026-09-13-apple-client.md` beside this plan.

**Interfaces:** Consumes Task 1's shared contract and Task 2's thin bridge. Owns provider orchestration, native Google interactive nonce proof, auth return handling and the approved Welcome/You/confirmation/linking surfaces.

- [x] Complete and paste-test the client module against the shared contract.
- [ ] Fold applicable hardening findings.
- [ ] Adopt the candidate, verify client and browser behavior, then complete spec and quality review.

### Task 4: Integrated release and review evidence

**Files and executable content:** `app/src/adapters/linkFlow.test.ts` (queued empty-state regression; complete tested patch and mutation receipts in `apple-callback-evidence/`), `2026-09-13-apple-deployment.md` beside this plan; `.env.example`, `compose.yml`, `docs/deploy.md`, `docs/RELEASING.md`, approved spec/review records and relevant standing-agent ledger proposals.

**Interfaces:** Consumes server configuration names and migration behavior. Produces deploy instructions that keep the feature dark, name Apple portal prerequisites and preserve Apple-only account access through an explicit rollback floor.

- [x] Validate composed configuration and deployment instructions against the implemented server.
- [ ] Run branch lint, typecheck, format, unit/client/integration, build and production-bundle gates; run named browser specs locally and inspect screenshots.
- [ ] Complete whole-branch spec/quality, DBA PR and PM final-PR reviews; fold findings in one coordinated fix wave.
- [ ] Open one coherent PR, verify CI for its exact head and present the review verdict plus proposed/overdue roadmap rows to James for the repository-required handback.
