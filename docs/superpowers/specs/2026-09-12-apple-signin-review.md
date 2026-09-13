# Apple sign-in — design review record

The draft design and rendered Gate 0 await James's approval. No product
implementation is present. The reviews below judged the design, not working
Apple authentication; no passing implementation, migration or hardware gate
is claimed.

## Scope

The PM phase-open pass recommended Apple on native and web, shared open
signup, and authenticated linking in both directions. James explicitly
chose Apple-first and allowed new rowers to create accounts. The rendered
design presents the additional shared-policy and linking recommendations
for his approval. Deletion remains the next slice; external availability
waits for that capability.

## Findings and disposition in the draft

| Lens | Finding | Folded into the design |
|---|---|---|
| Antagonist | A live stored session does not prove which account the callback browser currently holds; the ordinary cookie is Lax. | Cross-site Apple POST only stages linking proof; same-origin finalization compares the current session ID with the original session. The account-changed exit is rendered. |
| Antagonist | JSON parsing and global origin middleware reject Apple's form POST before the auth route. | An exact callback mount with bounded flat URL-encoded parsing precedes the origin check; success and cancellation both validate binding/state. |
| Antagonist | One mutable provider field cannot distinguish the two link proofs and pending signup. | Immutable existing/target provider intent, expected stage/version in every transition, and fresh state/nonce per authorization stage. |
| Antagonist | Native Google's ordinary restore path does not forward nonce. | New linking reauthentication requires the interactive `forcePrompt` branch and a server-verified matching nonce; legacy login stays compatible. |
| DBA / antagonist | Expiry denies authority but does not physically delete secrets. | Explicit startup/minute cleanup owner, failure handling, and the stopped-server retention limit; offline cancellation makes no immediate-server-deletion promise. |
| DBA / antagonist | Duplicating Apple subject in each grant can drift from its owner. | Subject remains on users; grants retain only the revocation-capable refresh token and client ID under a user/client key. |
| DBA | Anonymous attempts grow with public requests, not the household's user count. | Named admission and resident-row bounds, serialized minting, expiry index, and one link operation per originating session. These are proposed policy bounds, not measured load claims. |
| DBA | Tables, constraints, transaction ordering and rollback were not concrete. | Stored-shape/query table, named constraints, no provider I/O under DB locks, atomic completion before handing out a session, and the first Apple-only user's authentication rollback floor. |
| Controller | New confirmation responses would break installed Google clients. | New provider-neutral endpoints own confirmation; legacy endpoints retain direct-create and native token-response contracts. |

The original antagonist verdict was BLOCKED on mechanism corrections; the
original DBA spec verdict was FAIL on underdefined shapes. Their findings
are folded above; these are not rerun PASS verdicts. The implementation
plan must measure its concrete SQL and exercise the actual prescribed
code. The spec contains no executable implementation blocks, so hardening
lens 2 was skipped; the plan gets both lenses. The hardening loop is closed
after the full mechanism pass and author corrections, rather than another
bookkeeping review.

The installed Apple plugin's token persistence/logging and missing state
forwarding were established from version 8.5.5's Swift source. A new native
bridge is the proposed alternative, not a tested component. Real native/web
Apple subject continuity, developer-portal setup, native first-auth behavior
and the real browser callback remain explicit later gates.

## Existing evidence

The auth baseline at `60ee51b9` was run from the isolated worktree's `app/`
with Node 26 and `NODE_OPTIONS=--no-experimental-webstorage`, using
`pnpm exec vitest run --project unit --project client server/auth src/SignIn.test.tsx src/adapters/auth.test.tsx src/native/signin.test.ts`.
It passed 81 tests in 11 files. Both dependency roots were installed.
`git hook run pre-commit` with a deliberately old Node was rejected by the
actual Husky version guard. No baseline test proves proposed Apple behavior.

Rendered evidence and computed contrast live in `docs/design/apple-signin/`.
The renderer writes the capture list and dimensions to
`renders/layout-audit.json`; `contrast.json` records each pairing. Native
insets are desk mockups, not measurements from a phone. The controller
inspected welcome, You, first-account confirmation, linking confirmation,
and the current/proposed comparison.

## Proposed standing-agent memory, for the eventual design/implementation PR

**PM technique:** When a second provider creates accounts, check whether an
existing rower can reach the same account through either door; relay email
cannot supply that continuity. **PM ledger:** Apple-first scope recommends
both surfaces and explicit linking; the rendered two-prompt flow needs
James's approval. Deletion remains a separate implementation slice and the
external-release dependency.

**Antagonist techniques:** Trace credentials across every redirect method;
database session liveness and browser possession are different. Trace
middleware and parser order before reviewing callback handler logic.
**Antagonist ledger:** The anchor broke cross-site current-session proof,
callback reachability, undifferentiated attempt stages, and native Google's
nonce-free restore branch. Provider subject identity and no email merge held.

**DBA technique:** State logical validity and physical secret retention as
separate lifetimes; a sweep on later traffic supplies no idle-time deletion
bound. **DBA ledger:** The first draft did not define attempt/grant columns,
atomic completion or resident-row bounds. No SQL was prescribed or measured;
the later plan must measure auth tables and the users migration, not unrelated
session-log volume.
