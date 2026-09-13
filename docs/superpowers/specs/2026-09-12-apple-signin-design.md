# Wave A — Apple sign-in and account access

## What and why

A new rower can use Apple or Google to create an Ergomatic account on the
iPhone or the web. An existing rower can add the other sign-in method to the
same account and keep their rowing history. Apple’s private email address
never becomes a reason to create a link or merge two accounts.

**APPROVED — James approved the design and rendered Gate 0 on 2026-09-12.**
The approval includes new rowers creating accounts, Apple Hide My Email,
and explicit linking in both directions. Google remains available. The
implementation follows the shared signup policy and screens below. James
approved the account-access amendment on 2026-09-13: restricted access by
default, the same allowlist for both providers, and removal blocking existing
sessions after configuration reload.
Base inspected: `60ee51b9`; worktree: `.claude/worktrees/wave-a-apple`.

## Scope and sequence

One coherent implementation PR covers Apple on iPhone and web, open account
creation through both providers, and adding either provider to an existing
account. These all protect the same outcome: the sign-in method opens the
account the rower intended. Account deletion follows as its own Wave A PR;
this slice retains the Apple credentials that deletion will need. Door 2’s
partial-baseline disclosure remains separate. This slice does not close Wave A.

**Code sequence is separate from public availability.** Apple-first can be
built and validated first, but the new front door is enabled for external
TestFlight only with in-app deletion available. The earlier Wave A research
already established that account-creation and deletion obligations travel
together; this is not a new reason to reorder implementation. Provider
availability and account access are separate, as defined below. An additive
unauthenticated auth-options endpoint lets the updated app show
only available provider controls; a missing endpoint on an older server
falls back to the current Google door. Merging this code does not select
public access or waive the deletion release gate.

Google’s existing authorization endpoints and installed clients remain
compatible, including their successful `{token}` native response. The new
client uses new provider-neutral endpoints for first-account confirmation;
legacy Google endpoints retain their direct-create response contract after
successful authentication. They do not start returning a pending-account
response to an installed client that cannot handle one. `C2_ALLOWED_EMAILS`
remains the separate Concept2 rollout policy; it is not a signup policy.

### Account access — approved amendment, 2026-09-13

`ACCESS_MODE` replaces the `FRONT_DOOR_ENABLED` environment switch. Its
accepted values are `restricted` and `public`, with surrounding whitespace
ignored. Missing or blank selects `restricted`; any other value rejects
startup. Restricted mode requires membership in `ALLOWED_EMAILS` for both
new and existing accounts, through Apple or Google, on native and web,
including legacy Google endpoints. An empty restricted allowlist admits
nobody. Public mode admits accounts without consulting the allowlist; it
does not relax provider verification or account-linking requirements.
Email matching retains the existing trim-and-lowercase normalization.

Resolve an existing account by its verified provider subject first, then
check its saved `users.email`. The provider's current email cannot substitute
for that account access key. Returning legacy Google logins therefore stop
overwriting the saved email in both the Google-only sign-in helper and the
combined-flow legacy Google path; an updated display name may still be saved.
Linking continues to preserve the account profile. For a new
account, use the nonempty verified email supplied by its provider. Apple
Hide My Email works: an Apple-first account uses its actual relay address
in the allowlist, while Apple linked to a Google-created account uses that
account's saved email. Matching emails never link or merge accounts.

Check access before creating an account, minting a session, or completing
a sign-in. Recheck a pending signup at confirmation, since an attempt can
survive a process restart with different access configuration. If a concurrent
signup already won the provider subject, authorize the returned canonical
account email before storing its grant or minting its session; an allowed
candidate email cannot admit a disallowed existing account.

Resolve active cookie and bearer sessions against the same policy inside
session resolution, before refreshing or returning a session. This applies
to direct callers as well as protected-route middleware. A denied bearer
credential must not fall back to an allowed cookie; a denied secondary
credential must not be refreshed during disagreement checks. Linking
transitions must also reject an original session whose account no longer
has access, including reads and provider callback/proof transitions. Denial
must not advance or attach the link.

Configuration is loaded at server startup. Once the deployment reloads the
changed configuration, removing an account email denies its next protected
request and later sign-ins through either provider. Requests already admitted
by the previous process may finish. Accounts, workouts and other account data
remain stored. No permanent session-revocation state or client cache wipe is
introduced: a still-unexpired token can become eligible again if the account
is reallowed. Existing session-denial and sign-in error screens are reused;
this amendment does not add copy or layout or promise immediate client
navigation on every denied data request.

| State | Created and replaced | Lifetime and removal |
|---|---|---|
| Access policy | One immutable snapshot of the validated mode and normalized allowlist at process startup | Replaced on process/container restart; never stored in a session or attempt |
| Session | Existing session mint paths | Access denial does not delete or refresh it; existing signout, expiry cleanup and account-deletion behavior remain |
| Pending auth attempt | Existing begin/proof transitions | May survive restart; every subsequent transition uses the running process's policy; existing completion, cancel and expiry cleanup remain |

Apple availability comes from its configuration. All five Apple settings
absent or blank preserves Google-only operation, including HTTP localhost.
Any Apple setting present requires the complete locally valid Apple configuration
and HTTPS site URL; partial or invalid configuration rejects startup.
Complete locally valid Apple configuration enables Apple and the new provider flow
in either access mode. Google keeps its existing credential-based
availability. No replacement Apple feature switch is introduced. The
auth-options response retains its existing capability field for client
compatibility; it does not expose or choose the access policy. Local boot
validation does not establish Apple portal association or credential
acceptance; real provider authorization and native/web continuity remain
release gates.

The existing deployment is staging and should use restricted access with
explicit tester emails. Future production may select public access after
its release gates are met. The existing secret-gated E2E sign-in helper
remains test-only; ordinary test fixtures choose their access policy
explicitly, and production defaults never open access to accommodate tests.

The PM phase-open recommendation is Apple on both surfaces and explicit
linking in both directions. Native-only Apple would leave an Apple-only
account without the standing web fallback. Separate accounts without a link
door would leave a Google rower’s history inaccessible after choosing Apple.

## The rower’s flow — Gate 0

The rendered authority is `docs/design/apple-signin/`. It compares current
and proposed screens at real portrait and landscape dimensions, with native
safe areas and a web variant. It carries measured contrast and target sizes.
James approves the rendered artifact before implementation.

- The welcome screen offers equally sized **Continue with Apple** and
  **Continue with Google** controls. Apple uses its official artwork and an
  approved black/white treatment. The app’s typography and cream background
  remain familiar.
- In the new client flow, a recognized provider identity signs into its existing account. An
  unrecognized identity reaches **Create your account** before any user row
  is created. **Create account** proceeds to the existing onboarding.
  **I already have an account** discards that pending signup and directs the
  rower to use their usual sign-in, then add the other method on You. It does
  not silently create a spare account or attempt to merge data.
- You gains **Sign-in methods**. Each provider says whether it is connected;
  the missing provider has an add action. Linking first asks the rower to
  authenticate with their connected provider, then authenticate with the
  provider they are adding. The confirmation explains these two steps.
- Successful linking returns to You with both methods connected and the
  same profile, baselines, logs, and Concept2 link. A provider already owned
  by another Ergomatic account produces a conflict notice and changes neither
  account. This slice has no account merging or remove-provider control.
- Cancellation returns quietly to the prior screen. A verification,
  connection, expired-attempt, or persistence failure produces a short retry
  notice. The app never displays raw provider exceptions or tokens. If the
  account changed during linking, return to that current account and say
  **Your account changed. Start linking again.** Attach nothing.
- A private-relay address is displayed as the address Apple supplied. A
  missing first-auth name uses **Rower**. Linking never overwrites the
  existing account’s name or email with the added provider’s profile.

**Proposed compatibility limit:** a new Apple identity must supply a
nonempty verified email; otherwise show a recoverable notice offering
Google, and create nothing. Returning/linked Apple identities are resolved
by subject first and do not require another email or name claim. Apple
documents that managed accounts can supply no email; supporting email-less
new accounts requires a deliberate change to the app’s email contract,
rather than a fabricated address. This limitation must be visible in design
approval and the error-state mockup.

## Identity and persisted data

**Authority:** `(provider, verified subject)` identifies a login. Email is
profile data. Apple says: “Use the user identifier instead of an email
address to identify the user.” [Apple identity-token guidance](https://developer.apple.com/documentation/signinwithapple/receiving-a-users-identity-token)
(PRIMARY). The current `users.email` has no unique constraint; Google lookup
uses `google_sub` (`server/db/schema.ts`, `users`; `server/auth/signin.ts`,
`signInWithClaims`).

Recommended storage is a nullable unique `users.apple_sub` beside the
nullable unique `google_sub` delivered in #409. Keep the deliberately
supported sub-less shape; do not add an unrelated at-least-one-provider
constraint. A generic identity table remains a possible later migration;
it requires a Google backfill and compatibility transition that the added
column does not (`2026-09-12-wave-a-pr1-census.md`, identity-table option).
The implementation does not add a third provider or remove Google.

Account creation, attaching a subject, and moving pending Apple credentials
into their account-owned record are transactional. Uniqueness is enforced
by Postgres. Concurrent completion cannot create two users for the same
subject or attach it to two accounts. Attaching the same subject to the same
account is idempotent; replacing an already attached different subject is
refused. Only exact named constraint conflicts become an account-conflict
response; unrelated database failures remain failures.

Apple grants are separate from the user’s display profile: one row per
`(user_id, client_id)`, cascading from the user, with the refresh token
needed for revocation. The Apple subject is read from the owning user;
it is not duplicated in the grant row. The native bundle ID
and web Services ID are different audiences and can produce client-bound
grants. The associated App ID and Services ID must belong to the configured
Apple group; successful cross-surface login to one user is a release gate,
not an assumption proved by a mocked subject.

Apple’s deletion guidance says to “securely store the token response”;
its revocation API needs an access or refresh token and the matching client
ID. [TN3194](https://developer.apple.com/documentation/technotes/tn3194-handling-account-deletions-and-revoking-tokens-for-sign-in-with-apple),
[revoke tokens](https://developer.apple.com/documentation/signinwithapplerestapi/revoke-tokens)
(PRIMARY). The revocation endpoint accepts a refresh token, so retain that
minimum revocation-capable credential and its client ID. Identity/access
tokens remain transient verification inputs. The retained credential stays
server-side, never in API projections, browser storage, app preferences,
logs, or error text. Follow the existing server credential trust boundary
used by `concept2Links`, rather than adding an unexplained second encryption
scheme (`server/db/schema.ts`, `concept2Links`). The DBA spec pass must judge
the concrete columns, constraints, growth and cleanup before approval.

Auth attempts are a separate short-lived store. A row binds a random
attempt ID to provider, purpose, surface, nonce/state, a browser/device
binding secret hash, expiry, and (for linking) the original user and session
identity. Pending first-account confirmation may retain the verified
provider profile and exchanged Apple refresh token until account creation.
It never has an Ergomatic user session. Explicit cancel and successful
completion erase pending credentials immediately. Expiry ends authority
immediately; physical deletion has the separate cleanup contract below.

### Stored shapes and query contract

All names below are the proposed contract, not claims about measured SQL.
The plan supplies and measures the migration and real queries. Text fields
are bounded at input; no provider-supplied JSON blob is stored.

| Relation | Columns and constraints |
|---|---|
| `users` addition | `apple_sub`: nullable text; named UNIQUE `users_apple_sub_unique`. Existing primary key and Google uniqueness remain. |
| `apple_grants` | `user_id`: non-null uuid FK to users, ON DELETE CASCADE; `client_id`: non-null text; `refresh_token`: non-null text; `updated_at`: non-null timestamptz. Composite PK `apple_grants_pkey` on `(user_id, client_id)`. Client IDs must be one of the two boot-validated configured Apple clients; only the verified exchange selects it. No duplicated subject. |
| `auth_attempts` | `id`: random non-null uuid PK; `binding_hash`: non-null text; `surface`: non-null text (native/web); `purpose`: non-null text (signin/link); immutable `target_provider`: non-null text (apple/google); immutable `existing_provider`: nullable text (apple/google, link only); `stage`: non-null text (authorize/exchanging/confirm/reauth_authorize/reauth_exchanging/target_authorize/target_exchanging/link_ready); `version`: non-null positive integer; `state` and `nonce`: non-null random text rotated for each authorization stage; `original_session_id`: nullable uuid FK to sessions, ON DELETE CASCADE; `created_at`, `expires_at`: non-null timestamptz; `reauthenticated_at`: nullable timestamptz; `verified_subject`, `verified_email`, `verified_name`, `apple_client_id`, `apple_refresh_token`: nullable bounded text. User identity for linking is derived by joining the original session; it is not duplicated in this row. |
| Attempt constraints | Named `auth_attempts_surface_check`, `auth_attempts_purpose_check`, `auth_attempts_provider_check`, `auth_attempts_stage_check` admit only the listed values. `auth_attempts_session_check`: link requires original session and an existing provider different from target; signin forbids both. `auth_attempts_expiry_check`: expiry is later than creation. Unique `auth_attempts_state_unique`; unique partial `auth_attempts_link_session_unique` on non-null original session. `auth_attempts_expires_at_idx` supports deletion by expiry. Named `auth_attempts_version_check` requires a positive version. Stage/verified-field consistency is validated on every transition; client input never selects stage, version or verified fields. |

Each signup/returning lookup selects by its provider’s unique subject. You’s
status projection reads the already resolved user by PK and exposes only
provider-connected booleans. Grant upsert uses `(user_id, client_id)`; a later
delete-account read selects by the leading `user_id` key. No route returns
an unbounded row set or credential column.

Attempt lookup/transition/consume predicates include ID, binding hash,
surface, purpose, immutable provider intent, expected stage/version, and
unexpired `expires_at`; linking also
joins the exact original unexpired session. A mismatched predicate changes
nothing. Claiming an authorization stage as its matching exchange stage is
atomic and increments its version, so a replay cannot start a second code
exchange. Provider HTTP calls run outside database
transactions. Their validated result advances only the same still-live
claimed operation; a canceled/deleted row cannot be resurrected.
For linking, existing-provider proof must resolve to the original user
before setting `reauthenticated_at` and minting target state/nonce. Target
completion requires that timestamp within five minutes and its expected
stage/version. First-account Create consumes only `confirm`; a callback
from an earlier stage cannot consume authority from a later stage.

The completion transaction conditionally consumes the bound valid attempt,
rechecks the session for linking, inserts/conditionally attaches the user
identity, writes the Apple grant, and (for signin/create) inserts the
Ergomatic session. The provider update includes the original user PK and
the condition that the target subject is absent or already equal. Any
failure rolls back all those writes; no token is returned until commit.
There is no user creation followed by a separately fallible grant save.

**Explicit proposed bounds, not measured traffic claims:** authorization
and each link-proof stage expire after five minutes; post-exchange account
confirmation expires after five minutes without renewal. New anonymous
operations are limited to 120 starts per minute across this service, using
the maintained `express-rate-limit` package with a global key rather than
guessing a client IP through the proxy. Version 8.7.0 was returned by
`npm view express-rate-limit version` this session; recheck at installation.
Its documented global-key and fail-closed settings provide this mechanism
([package configuration](https://express-rate-limit.mintlify.app/reference/configuration),
PRIMARY). This is a shared admission limit, not a claim to stop targeted
denial of service or to identify an attacker by IP. Existing Google legacy
account-creation requests receive the same bound and a supported error
response if it fires.

The database additionally caps live anonymous attempts at 512. Minting
serializes that count-and-insert decision using one fixed transaction-level
Postgres advisory lock, after deleting expired attempts. Replacing the
same bound operation does not consume another slot; a full table rejects
new starts without touching in-flight operations. That limit remains true
across service processes and limiter resets. Link rows are bounded to one
per originating session. Users grow with completed accounts; grant rows are
at most two per Apple-linked user under the two-client configuration.

`server/auth/attempts.ts` owns expiry checks and physical cleanup.
`server/index.ts` runs its sweep at startup before auth readiness and every
60 seconds while serving. Failed cleanup is logged without secret data and
new anonymous starts fail closed until a successful sweep; existing
unexpired login/link completion remains available. Shutdown clears the
timer. No design claims physical deletion during a stopped server: expired
rows can remain on disk until restart, but can confer no authority. Backup
retention belongs to the existing backup/deletion policy, not to a TTL
claim. The native operation also discards in-memory credentials on every
terminal outcome.

The migration is additive before Apple users exist. The first Apple-only
account makes the release an authentication rollback floor: an older
server can read its row but cannot authenticate it with Apple. The
implementation PR updates `docs/RELEASING.md` and the deployment/recovery
contract before enabling Apple; schema compatibility alone is insufficient.
Migration lock duration, index size and query latency remain unmeasured
until the plan’s concrete SQL is run against users/attempts/grants at the
scales that govern them.

## Native and web authentication

Use a small first-party Capacitor `AuthenticationServices` bridge following
the existing `WebAuthPlugin` registration pattern. It accepts the server’s
nonce and state, sets both on the Apple request, and returns the identity
token, authorization code, echoed state and optional first-auth name once.
It stores and logs none of them. It rejects an overlapping request and
releases its delegate/controller after success, cancellation or failure.
The app's checked deployment target is iOS 15.0
(`ios/App/App.xcodeproj/project.pbxproj`, deployment settings); bridge APIs
must be available at that floor. The native implementation gate compiles
against that target and may not silently raise it.

**Why the installed plugin’s Apple arm is not the chosen route:** inspected
`@capgo/capacitor-social-login` 8.5.5 `AppleProvider.swift` stores the ID token
in UserDefaults and prints token-bearing data; its TypeScript state option
is not forwarded by the Swift implementation. Google continues through its
existing plugin. There is no invented Apple “logout”: the new bridge keeps
no provider session to clear; Ergomatic’s existing local-first session
teardown remains authoritative.

The server verifies the Apple signature, issuer, exact path-specific
audience, expiry and nonce, plus the attempt/state binding, then exchanges
the single-use authorization code with Apple. The exchange response must
resolve to the same subject and expected client. The code’s five-minute
lifetime comes from [Apple token validation](https://developer.apple.com/documentation/signinwithapplerestapi/generate-and-validate-tokens)
(PRIMARY). ID-token signatures are RS256; the developer client secret is
ES256. Neither value is inferred from the other.

For web, use the existing `openid-client`/`jose` stack with Apple-specific
authorization and callback routes. Request state and nonce. **Do not copy
Google’s PKCE requirement:** Apple’s current discovery and documented
authorization/token requests do not advertise a PKCE contract. [Apple
discovery](https://appleid.apple.com/.well-known/openid-configuration),
[authorization request](https://developer.apple.com/documentation/signinwithapplerestapi/request-an-authorization-to-the-sign-in-with-apple-server)
(PRIMARY).

Apple’s name/email callback is URL-encoded `form_post`. A separate HttpOnly,
Secure, SameSite=None attempt cookie binds that callback to its initiating
browser; the ordinary Ergomatic session cookie remains Lax. A state value
alone is correlation, not browser identity. Mount only the exact Apple callback POST with a bounded flat URL-encoded
parser before the global origin middleware. Both success and Apple’s
`user_cancelled_authorize` response validate binding/state before advancing
or canceling an attempt. Only purpose-bound single-use validation can
advance an attempt. Normal origin checks remain
on every other mutating route. Real Apple web login uses the registered
HTTPS return URL; a plain-HTTP local Apple callback is not a supported
deployment. Missing/empty state, code, binding cookie, nonce or audience is
a failure, never a default. Google’s existing GET callback stays compatible.

For linking, the cross-site Apple POST stages verified proof only; it never
attaches a provider. It redirects to You, whose same-origin finalization
POST supplies the CURRENT Ergomatic session and the attempt binding. The
transaction compares that resolved session’s exact ID with
`original_session_id`; a live old database session alone is insufficient.
This handles account switching while the ordinary Lax session cookie is
absent on Apple’s cross-site POST. Native finalization likewise compares
the current bearer’s resolved session with the original session.

For native attempts the binding secret is held only by the initiating app
operation and is required at completion. Platform modules remain in the
adapter/native boundary. Provider tokens never enter general screen state.

## Linking and attempt lifetime

An existing 60-day Ergomatic session is insufficient by itself to add a
permanent credential. The rower proves their existing connected provider
again, with a subject that resolves to the original user, and then proves
the new provider. This is the proposed security/product choice, not a claim
that Apple demands two prompts. Each proof is bound to the same operation;
sign-out, account switch, expiry, cancellation, replay or a different session
invalidates the link. The linking transaction must recheck that the original
session still exists, belongs to the original user, and equals the session
currently presented by this browser/app before attaching.

Native Google reauthentication uses `forcePrompt: true` plus the operation’s
nonce, and the server requires the matching signed nonce claim. The
installed plugin’s interactive branch forwards nonce; its ordinary restore
branch does not (`GoogleProvider.swift`, interactive login versus
restorePreviousSignIn). Legacy Google login stays compatible. A previously
valid Google ID token without this attempt’s nonce cannot prove the link
operation. Web reauthentication likewise requires nonce-bound proof of the
existing provider identity; it never silently swaps the original session.

| State | Minted | Cleared | Relaunch / reload / sign-out |
|---|---|---|---|
| Server attempt and binding hash | Begin login/link | Atomic consume, cancel, expiry cleanup | Expired rows confer no authority; link requires its original live session |
| Web attempt binding cookie | Web begin | Completion/cancel; cookie expiry | Reload may resume only the same unexpired operation; another browser cannot |
| Native operation/binding secret | Native begin | Any terminal outcome | Not persisted; relaunch abandons it |
| Fresh existing-provider proof | Successful link reauthentication | Link completion/cancel/expiry | Bound to original operation and session; never reusable by another operation |
| Pending signup profile/grant | Verified unknown identity | Create/cancel/expiry | Only its bound continuation can create; no authenticated user session yet |
| Apple grant | Account creation/link/sign-in exchange | Account deletion/revocation policy in following slice | Server-owned; survives sign-out for later revocation |

The plan pins the specified lifetimes and request bounds with independent
test literals. Their owner is the new auth-attempt store; no lifetime may extend
an authorization code beyond Apple’s five-minute validity. Database age
checks and conditional consume enforce expiry/single use, following
`concept2AuthAttempts` and `consumeAttemptFor` without borrowing their
mandatory-user shape for anonymous signup.

## Evidence and gates

The initial scoped auth baseline at `60ee51b9` passed 81 tests across 11
files using unit/client projects and the `server/auth`, `SignIn`, auth
adapter and native-signin filters, with the repository-required webStorage
flag. Both worktree dependency roots were installed; an intentionally old
Node on `git hook run pre-commit` was rejected by the real hook. These are
baseline/setup receipts, not evidence for the proposed Apple behavior.

Implementation gates must start before the supported auth producer and
assert the resulting account/session, not seed an already-linked row and
call that a sign-in test. Cover signed JWT validation and code exchange;
wrong issuer/audience/nonce/state; absent/empty inputs; callback cookie and
origin binding; cancellation; missing first-auth name; relay email; replay;
cross-user and cross-session linking; and persistence failure before any
session is handed to the client. Real-Postgres tests hold conflicting rows
on a separate connection to prove one subject/one owner and atomic grant
retention. Mutations corrupt each deciding source, including a producer-to-
consumer browser test and a native bridge compile/source boundary check.

The full antagonist and DBA spec findings are recorded with their draft
corrections in `2026-09-12-apple-signin-review.md`. Gate 0 and James’s spec
approval precede the implementation plan. No executable implementation
blocks are prescribed here, so hardening lens 2 is skipped for this spec. The plan
gets both lenses. Implementation uses task-sized delegated ownership,
two-stage branch review, DBA and PM final-PR gates, and James’s merge word.

Before a real Apple test, prepare App ID capability/entitlement, Services ID
association and exact HTTPS return URL, server-only Team ID/Key ID/private
key, audience config, and provisioning. Missing required config fails
clearly at boot/build; it cannot ship a visible dead Apple button. Portal
configuration and native/web shared-sub behavior are not yet measured.

Phone installation and the operator session each retain the repository’s
separate permission/readiness gates. Desk preparation comes first. The
Apple-slice exit is an existing Google rower returning to the same data via
Apple on phone and web, a new Hide My Email rower returning to one account on
both, a new Google signup, and a conflicting link refusing without mutation.

## Primary research and corrections

- [Apple authentication](https://developer.apple.com/documentation/signinwithapple/authenticating-users-with-sign-in-with-apple):
  native AuthenticationServices, first-auth name, account linking guidance.
- [Identity tokens](https://developer.apple.com/documentation/signinwithapple/receiving-a-users-identity-token):
  subject is identity; email can be relay and remains in subsequent tokens.
- [Native state](https://developer.apple.com/documentation/authenticationservices/asauthorizationopenidrequest/state)
  and [nonce](https://developer.apple.com/documentation/authenticationservices/asauthorizationopenidrequest/nonce):
  the OS has both; the chosen bridge must actually forward them.
- [Web configuration](https://developer.apple.com/help/account/capabilities/configure-sign-in-with-apple-for-the-web):
  Services ID association and HTTPS return URL.
- [Apple sign-in HIG](https://developer.apple.com/design/human-interface-guidelines/sign-in-with-apple):
  official artwork, approved titles and black/white button treatment.

The prior ROADMAP wording “name and email on first auth ONLY” is corrected:
the first-auth-only limitation concerns name/the user object; Apple says
email is included in subsequent identity tokens. The generic identity-table
alternative remains recorded in the earlier census; choosing the narrower
column does not claim an unmeasured performance advantage.
