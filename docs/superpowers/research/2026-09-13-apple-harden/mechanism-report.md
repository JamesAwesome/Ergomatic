# Apple sign-in plan — harden mechanism lens

**BLOCKED.** Fix F1–F4 before adopting the candidate. F1–F3 are demonstrated mechanism/credential failures; F4 is an unsupported outcome guarantee in the new failure UI. The provider identity model, exact-session finalization, transaction boundary, and Google PKCE derivation survived the checks below. R1 is explicitly a bounded hardening concern, not a demonstrated device exploit.

This is the single full AUTH/stored-shape lens-1 dispatch. Read-only review: no candidate or integration checkout was edited, no commits were made, and no phone, PR, merge, or worktree operation was performed. Probes and this report live under `/tmp`. The isolated PostgreSQL container was stopped and automatically removed. Lens 2 and assembled product/release gates remain owed; do not repeat lens 1 for bookkeeping.

## Authority and exact sources

Approved authority: integration `docs/superpowers/specs/2026-09-12-apple-signin-design.md`, its rendered design directory, and the assembly/modules under `docs/superpowers/plans/2026-09-13-apple-*.md`. Plan references below use Task/symbol, never plan line numbers. The briefing, canonical antagonist role and whole bounded techniques file, CLAUDE.md, and canonical harden skill were read. Parent confirmed Phase 0 complete and committed the assembled plan/evidence at `ca95011e`; this review does not relitigate approved signup/linking/deletion sequencing.

Source references use these roots:

- **S:** `/Users/james/projects/github/jamesawesome/Ergomatic/.claude/worktrees/wave-a-apple-server-paste/app`, HEAD `0f4921d81d552747e0c48131412cd17c012f10f5`.
- **N:** `/tmp/ergomatic-apple-native-paste/app`, HEAD `202f60873823f8cff9c059b93eb19ba1190cbbdf`.
- **C:** `/Users/james/projects/github/jamesawesome/Ergomatic/.claude/worktrees/apple-client-plan-scratch/app`, HEAD `0ca9849567e7ba38cdd5ecc79aa6ce655b26f859`.

`git rev-parse HEAD; git status --short` confirmed S and N clean. C has only the declared borrowed shared contract/native bridge/tsconfig dependencies dirty; its owned sources are committed. `shasum -a 256` measured S attempts `6b6daaaf7cc41b1799ba0a8478c87d39b6612bed516552673e58434f4b1dc588`, S routes `93e7504c3e7366111e681edbc673670e5fc5bb8a664aae02911a48ac1ea95a44`, N plugin `a350ec81015bf9864814d4d43e9960a1a935daa17e6517261c35ee77901575e4`, C flow `9425797022d6c2ad8c5477cd4f7d9177ce6fb151a1f7ac961f7ad8bb169971e0`.

Actual implementation was read at those roots; complete plan patch bodies were not reread as a second source. Author test/build/mutation evidence and the DBA report were read as attributed evidence, not described as my own reruns.

## F1 — PROVEN: a losing callback deletes the winning stage

**Task 1 / server Task 3, `callback` and failure cleanup.** S `server/auth/frontDoorRoutes.ts:311` assigns `owned` before `attempts.claim(a)` at `:343`; the catch at `:355–357` calls the unversioned `cancel`. S `server/auth/attempts.ts:143–150` correctly rejects a stale expected version/stage, but `cancel` at `:439–441` deletes by ID, binding hash and surface alone.

**Authority:** the approved attempt contract says a mismatched stage/version changes nothing and an earlier callback cannot consume later authority. **Subject:** mounted Apple form POST → real attempt read/claim/accept → catch cleanup. **Producer:** two deliveries of the same valid callback from its owning browser overlap. Neither delivery needs forged tokens. A party replaying a captured callback controls delivery timing and needs the original browser binding; an unrelated browser lacking the binding cannot trigger this case.

**Probe:** `/tmp/apple-mechanism-probes/server.ts` imports the actual mounted app, route module, store, session module and migration. It uses PostgreSQL 18.4 and fake provider verification, because this question is callback/store ownership, not JWT validity. Two HTTP requests both read the same authorization snapshot. The second is held after that real read while the first completes; it then loses the real CAS. Output in `server.log`:

```text
afterWinner: stage=confirm, version=3, grant=true
afterLoser: redirect authError=attempt_expired; rows=[]
```

The winner had an actual pending grant in the database before the loser erased it. The database was not seeded past the attempt producer. The held read schedules a reachable HTTP concurrency ordering; it does not invent a SQL state. The same catch surrounds reauthentication/target callbacks, so later linking authority is exposed to the same cleanup rule.

**Correction:** separate an explicit holder-authorized cancel from failure cleanup. Failure cleanup must erase only the exact authorization/exchange snapshot owned by that handler (stage/version plus the existing immutable bindings); a failure before a successful claim must not erase a stage another handler claimed. Apply this rule to provider-error/malformed callback cleanup as well as claim errors. Only clear the attempt cookie when the cleanup still owns the operation it is clearing. Preserve immediate cleanup for a truly owned failed exchange.

**Gate:** add the held two-callback route→real-Postgres test, assert the winner's pending stage/grant survives and can complete, and mutate the conditional cleanup back to ID-only deletion. Also hold an older callback across successful reauthentication and assert its target stage survives. A sequential replay test cannot cover this ordering.

## F2 — PROVEN: native target authorization has no attempt-local single flight, and stale cancellation overwrites a newer view

**Task 3 / `authorizeLinkTarget`, `authorizeNative`, `LinkSignInMethod`.** C `src/adapters/authFlow.ts:583–595` invokes target authorization without moving the view to busy or taking an in-flight claim. The flow remains `link_authorize`; C `src/auth/LinkSignInMethod.tsx:60–72` renders an enabled provider button and enabled cancel controls. This contradicts the client report's claim that competing controls are removed/disabled while native authorization is busy.

A repeated action can run a second `authorizeNative` for the same generation. Native Apple rejects overlap as `busy` at N `ios/App/App/AppleAuthPlugin.swift:84–86`; the second caller's catch at C `authFlow.ts:329–340` then calls `cancelActive`, clearing the shared operation and deleting the server attempt belonging to the first caller. After an OS sheet dismisses, these same controls also remain live while proof/finalization HTTP is pending; that provides a repeat-action window independent of whether a double tap beats native sheet presentation.

The same catch checks generation **before** `await cancelActive` but writes its cancelled view **after** that await with no new check (`:330–337`). Browser Back can expose You, whose Add action calls `prepareLink`; an older cancellation response can then overwrite the newly prepared view even though its operation/generation is newer.

**Authority:** one logical operation owns each provider interaction and terminal update; the declared generation lifetime must survive every await. **Producer/attacker:** normal repeated target taps, or Back → prepare another link while cleanup is pending. No malicious actor, altered server state, or arbitrary provider exception is needed; `busy` and `cancelled` are real native plugin outcomes.

**Probes:** `client.cjs` transpiles the unchanged actual flow source in memory, invokes its actual `authorizeNative` function, and uses the documented bridge result shapes. First authorization is held, second returns `busy`; `client.log` records two provider calls, a `/cancel` before the first proof returns, and the first proof subsequently failing `attempt_expired`. `client-stale-cancel.cjs` holds the cancel response, advances the context through a new generation/operation, then releases it. Output:

```text
currentGeneration=2; operation=new;
views=[link_confirm, cancelled]
```

These probes establish the adapter consequences. Reachability of the repeat action is established by the actual enabled renderer/caller above; no physical double tap or Apple sheet was measured.

**Correction:** give target authorization an operation-local in-flight owner covering import/init, provider UI, proof POST and finalization. Reflect busy state in the rendered controls and keep controller-level protection so simultaneous handlers cannot both enter. Check captured generation/operation identity after asynchronous cancellation before updating any view; never let one invocation clean up a different invocation's shared slot. Check ownership before launching a provider after an asynchronous import/initialization as well. Keep explicit cancellation usable according to the approved interaction design.

**Gate:** start at the rendered target action with the real hook, hold native proof and then HTTP completion, and fire the action again. Assert one interaction, no destructive cancel, and the correct terminal result. Separately hold provider-cancel cleanup across Back/prepare-new-link and assert the new view survives. Mutate each deciding guard and prove the corresponding assertion fails. The existing late-begin mutation establishes only its own await boundary.

## F3 — PROVEN: Debug bridge logging discloses the Apple proof

**Task 2 / native credential lifetime and no-logs gate.** N `ios/App/App/AppleAuthPlugin.swift:143–151` resolves the ID token and authorization code through Capacitor. N `scripts/apple-auth-contract.test.ts:99–121` scans only the plugin for logging calls. The logging producer is outside that file:

- N `node_modules/@capacitor/ios/Capacitor/Capacitor/CapacitorBridge.swift:579–581` logs the serialized result prefix in `toJs`.
- Its `assets/native-bridge.js:943–945` invokes `logFromNative`, whose result logger outputs the response data.
- `CAPInstanceDescriptor.m:38` defaults to Debug logging; `CAPInstanceConfiguration.m:20–28` enables that mode for Debug; `CAPBridgeViewController.swift:34` forwards it to CAPLog and `JSExport.swift:19` exports it to JavaScript.
- N `capacitor.config.ts` has no logging override. The native plan explicitly prescribes a Debug simulator build.

**Authority:** provider credentials stay out of logs, with no Debug exception in the approved contract. **Producer:** an ordinary successful Apple authorization in the prescribed Debug build. A log reader need only read the console; they need not forge provider proof. Release defaults disable this vendor logging, so this is not a claim that default TestFlight Release logs tokens.

**Probe:** `bridge.cjs` executes the actual vendored native bridge in jsdom with the vendor-derived Debug/logging configuration. A synthetic Apple response is sent through `Capacitor.fromNative`; captured console output contains the entire synthetic authorization code (`credentialLogged:true` in `bridge.log`). It does not call a made-up logger or edit the vendor implementation. No real credential was used.

**Correction:** disable/redact credential-bearing bridge logging at its actual owner for supported build configurations. The simplest repository-level correction is a reviewed `loggingBehavior: "none"` configuration, with a gate on the synced native config and actual bridge logging behavior; the controller should choose the implementation while retaining useful noncredential diagnostics. Merely adding more forbidden spellings to the Apple plugin scan cannot gate this boundary.

**Gate:** send a unique synthetic credential through the vendor bridge with the built/synced app's logging configuration and assert that neither native nor JavaScript logs contain it. Re-enable the previous Debug logging configuration and prove the gate goes red.

## F4 — PROVEN: a transport failure is presented as proof that linking changed nothing

**Task 3 / `finalizeLink`, `setFailure`, `SignInMethods.linkNotice`.** C `authFlow.ts:247–252` awaits finalization; a lost response becomes generic `signin_failed` through `setFailure`. C `src/you/SignInMethods.tsx:43–46` tells the rower, “Nothing changed.” S `attempts.ts:424–431` commits the identity/grant before the HTTP success can reach the device. A connection loss after commit therefore renders that sentence after the account did change.

**Authority:** a transaction guarantees atomic database outcomes; an absent HTTP acknowledgement does not establish which outcome happened. The approved design asks for a retry notice on connection/persistence failure, not an assertion of rollback. **Producer:** normal network loss after the completion transaction commits. A client controlling connection closure can force the uncertainty; no unsupported database writer is involved. **Evidence:** direct producer/consumer source trace, not a measured real Apple/network incident.

**Correction:** generic transport/runtime failure copy must acknowledge uncertainty (for example, “We couldn’t confirm the result. Check your sign-in methods and try again.”), or refetch authoritative methods before reporting an outcome. Keep stronger no-change copy only for outcomes for which the server's invariant actually establishes it. Do not infer rollback from `fetch` rejection.

**Gate:** have the finalization producer commit successfully and suppress its response before the client receives it; assert that the client neither claims no change nor falsely reports success. Corrupt the failure mapping/copy back to the unsupported certainty and require red. This is one seam test, not a request for a broad network-resilience feature.

## R1 — SUSPECTED real-world consequence; PROVEN nondeterministic document boundary

The native lifetime table says the retained callback cannot resolve another call after WebView reload. The UUID at N `AppleAuthPlugin.swift:124` compares **native authorization identity**, not originating JavaScript document identity. Capacitor reset clears stored calls/listeners (`CapacitorBridge.swift:296–299`) but the retained CAPPluginCall success closure still calls `toJs` on the current WebView (`:509–521`, `:579–599`). JavaScript dispatches by callback ID alone (`native-bridge.js:948–978`), and the new document's ID counter starts from `Math.random() * 134217728` (`:836`). This is randomized collision avoidance, not deterministic isolation.

`bridge.cjs` initializes two documents using the same injected random seed, starts an Apple promise in the first and an unrelated-plugin promise in the second, then delivers the old Apple response. The second promise receives the Apple proof. That proves the consequence **conditional on ID overlap**; it does not establish a natural collision, an attacker capable of selecting Math.random in an uncompromised app, or a field exploit. The supported producer of an old call outliving its document is WebView reload; WebContent termination/recovery is source-visible but not measured on a device here.

Do not promote this injection into an exploitable-auth finding. Either retire the retained JS receiver at a proven document-lifecycle seam, or narrow the native table's absolute statement and explicitly retain this as hardening debt. If fixed here, gate a navigation with an outstanding Apple callback through the vendor delivery boundary; a source scan for the native UUID cannot prove document isolation. Preserve iOS 15 compatibility and check lifecycle hook call sites before choosing an API. The existing WebAuth plugin has a navigation abandonment pattern, but its documented preconditions/caveats must be read, not blindly copied.

## Attacked and held

**Identity and grants — deterministic enforcement.** S `providers.ts:80–92` verifies signature, issuer, exact audience, expiry and signed nonce; `:165–175` checks state and the initial Apple token; `:210–218` verifies the exchanged token and requires the same subject before retaining its bounded refresh credential. Subject lookup precedes new-profile requirements (`attempts.ts:369–373`). Apple reauth retains its grant across the Google target stage; the opposite direction gets the grant from Apple target proof (`:349–352`, `:359–390`). Account/profile linking uses the original user's PK and an absent-or-identical subject condition (`:425`), followed by grant write and attempt deletion in one transaction. The refresh grant has one user/client owner, and account display data is not overwritten by linking. Existing unrelated unique/database failures are not remapped to account conflict (`:95–108`).

The primary Apple token endpoint documentation says authorization-code validation returns a refresh token; refresh-token validation does not. Thus the candidate's requirement for a refresh token after **code** exchange does not conflate these methods. Client ID is selected from server configuration, not proof input. Pending grants discarded on cancellation/failure are not claimed to be remotely revoked; revocation/deletion remains the next approved slice. No evidence justifies expanding this slice to keep all failed exchanges forever.

**Attempt state and exact session — deterministic, except F1 cleanup.** Random operation/binding/state/nonce plus locked snapshot comparison distinguish stages; successful reauth rotates state/nonce. Original session is locked before attempt, matching the corrected DBA lock-order receipt. Cross-site Apple callback only stages target proof; same-origin finalization requires the currently resolved session ID to equal the original live session (`attempts.ts:413–429`). A merely live stored session is not mistaken for current possession. Different sessions of the same user still fail equality. The callback route is mounted with its own flat bounded parser before global origin rejection (`server/app.ts:81–89`); ordinary APIs retain origin checks. Attempt cookie is Secure/HttpOnly/SameSite=None with `/api/auth` path and bounded age (`frontDoorRoutes.ts:28–38`); final signed web projections remove tokens (`:136–145`). No request-supplied redirect destination is used.

**Google native proof — deterministic vendor branch.** C `src/native/signin.ts:43–47` initializes the plugin and requests `forcePrompt:true` plus the stage nonce. The actual installed `GoogleProvider.swift:34–59,81–105` routes that flag into interactive `GIDSignIn.signIn(...nonce:)`; it bypasses restore. The cancellation mapping exists in the installed SocialLogin plugin (`SocialLoginPlugin.swift:22–24,1087`), so the `USER_CANCELLED` spelling is sourced. Actual Google/Apple server and device interoperability remains unmeasured.

**Google web PKCE — held, INFERENCE with primary protocol backing.** The binding secret starts as 32 cryptographically random bytes (`attempts.ts:51,289–303`); only its hash reaches provider context. The verifier hashes that secret-derived value plus independently rotated nonce (`providers.ts:71–74`), yielding a 43-character base64url value. Under the SHA-256 preimage assumption this retains high-entropy secrecy from an authorization-URL observer; hashing a public nonce alone would not. The same per-stage derivation feeds S256 at authorization (`:152–155`) and token redemption (`:194`). A holder of the HttpOnly binding cookie can derive it if they also obtain the stage nonce, but that holder already possesses this operation's binding; PKCE does not claim to survive theft of all client secrets. The hash and verifier are absent from API views. There is no extra confidentiality claim after database compromise.

`pkce.ts` invokes the actual provider module and signed Google verification with synthetic keys. `pkce.log` reports `verifierLength:43`, valid syntax, authorization challenge equal to SHA-256 of the actual redeemed verifier, changed challenge after nonce rotation, and no Apple PKCE parameters. This is a protocol consistency probe, not a statistical entropy measurement or a real Google request. RFC 7636 §§4.1–4.6 and §7.1 support the syntax, transformation, matching and entropy requirements; the derivation choice itself remains correctly labelled INFERENCE. No invented PKCE support is asserted for Apple.

**Admission, expiry and cleanup — deterministic policies, not measured abuse detectors.** The shared route limiter charges new and legacy starts with one global key; its default in-memory scope matches the one API service topology, not an invented multi-instance rate guarantee. The resident anonymous cap is serialized by the database advisory lock (`attempts.ts:249–251,281–287`). Link rows instead have one-per-session uniqueness. Expiry gates authority before deletion; startup/minute sweeps and failure recovery are explicit (`frontDoor.ts:52–73`). Timer disposal is registered for SIGINT/SIGTERM. The numbers 120/minute, 512 rows, five minutes and sixty seconds are chosen policy bounds, not heuristics purporting to infer a user's identity or behavior. They can reject legitimate bursts and admit a distributed attack below the limits; the plan does not mislabel them as attack detection. DBA scale/lock evidence remains authoritative for measured cost, and I verified the fixed store hash matches that record.

**Default-off compatibility — deterministic configuration.** Exact literal `1` controls enablement; missing Apple config fails enabled boot, and disabled front-door preserves legacy Google allowlist. Legacy native response shape remains token/expiresAt/user. Open admission applies to both new and legacy Google flows only when enabled. Additive schema/old-image boot does not prove Apple-only account access: the deployment plan explicitly preserves the post-activation Apple-capable rollback floor and keeps public activation behind deletion. These are held plan boundaries, not completed portal/release gates.

## Primary sources and provenance

- **PRIMARY:** [RFC 7636](https://www.rfc-editor.org/rfc/rfc7636), §§4.1–4.6 and §7.1: high-entropy per-request verifier, 43–128 characters, S256 challenge and matching redemption. Read live; the actual derivation remains INFERENCE as stated above.
- **PRIMARY:** [Google OpenID Connect](https://developers.google.com/identity/openid-connect/openid-connect): state round trip, nonce in signed ID token, subject identity and issuer/audience verification. Read live and compared with actual provider code.
- **PRIMARY:** [Apple discovery](https://appleid.apple.com/.well-known/openid-configuration): RS256 and form_post; no advertised PKCE contract. Read live.
- **PRIMARY:** [Apple token validation](https://developer.apple.com/documentation/signinwithapplerestapi/generate-and-validate-tokens) and [TokenResponse](https://developer.apple.com/documentation/signinwithapplerestapi/tokenresponse): code is single-use/five-minute, code validation yields refresh credentials, refresh validation omits a new refresh token. Apple's JSON documentation payloads were fetched directly because the rendered web-tool page had no body.
- **PRIMARY:** [Apple TN3194](https://developer.apple.com/documentation/technotes/tn3194-handling-account-deletions-and-revoking-tokens-for-sign-in-with-apple): server credential handling and token revocation/account deletion expectations. Read its live documentation JSON. This pass does not reopen the approved minimum-refresh-token storage decision.
- **PRIMARY IMPLEMENTATION:** the installed Capacitor and SocialLogin source paths cited above. [Capacitor configuration](https://capacitorjs.com/docs/config) is the public configuration reference; the load-bearing logging defaults/call sites were settled from installed code, not assumed from that page.

## Reproduction, gates, and limits

All reviewer commands run with Node 26.5.0. `/tmp/apple-mechanism-probes/` contains unchanged-source in-memory probes and captured outputs. The database script imports actual candidate TS through tsx, and uses its committed Drizzle migration folder. The isolated container command was:

```sh
docker run --rm -d --name apple-mechanism-review-pg -p 127.0.0.1::5432 -e POSTGRES_PASSWORD=review postgres:18.4
docker port apple-mechanism-review-pg 5432/tcp
```

The observed port was 62918 (the script records it; update for a new container). Commands and final results:

```sh
node --import /tmp/apple-mechanism-probes/node_modules/tsx/dist/loader.mjs /tmp/apple-mechanism-probes/server.ts
node /tmp/apple-mechanism-probes/client.cjs
node /tmp/apple-mechanism-probes/client-stale-cancel.cjs
node /tmp/apple-mechanism-probes/bridge.cjs
node --import /tmp/apple-mechanism-probes/node_modules/tsx/dist/loader.mjs /tmp/apple-mechanism-probes/pkce.ts
docker stop apple-mechanism-review-pg
```

All final commands exited 0 and produced the deciding outputs described above. Exit 0 means the reproducer completed, not that the candidate passed. `bridge.log` also records jsdom's unimplemented prompt notices; its bridge dispatch and console instrumentation executed and produced the asserted payload. Initial local probe scaffolding errors (a CJS `exports` redeclaration and a repeated VM lexical declaration) were corrected in `/tmp`; they were not candidate failures.

No candidate mutation, full tests, coverage, lint, typecheck, build or hardware gate was rerun by this reviewer. Source authors' evidence remains separately attributed. The client report properly marks its scoped coverage command exit 1; it is not the whole-branch coverage gate. Full assembled checks, unmocked cross-provider browser flow, Apple portal grouping/native-web subject continuity, signed-device authorization, real native callback lifecycle and final PR/DBA/PM review remain unestablished here. No report sentence should promote source tests or this injected bridge collision into those measurements.

## Ready-to-paste technique proposal

Add under `Techniques that keep paying` in `.claude/agents/antagonist-techniques.md`:

- **A failed CAS can still erase the winner in its catch.** Hold two supported callbacks after they read the same authorization stage; let one commit, then release the loser and inspect the real row after cleanup. Apple auth's version guard rejected correctly while ID-only failure cleanup deleted the winner's pending credential. Trace ownership through the exception path, and through every await in client cancellation.
- **A plugin with no logging calls can still log its whole credential through the bridge.** Follow `call.resolve` into native serialization and JavaScript `fromNative`, then run the vendor bridge with the actual build's logging configuration; a plugin-only forbidden-string test cannot gate that producer. Native authorization identity also does not prove JavaScript document identity.

## Ready-to-paste combined ledger proposal

Append to `.claude/agents/antagonist-ledger.md` as the single combined hardening entry; the controller should fold lens 2 into this entry rather than add a pass history:

### 2026-09-13 — Apple sign-in implementation-plan hardening

**Mechanism lens BLOCKED** on server `0f4921d8`, native `202f6087`, client `0ca98495`; approved AUTH/stored-shape design, complete author paste-tests, no public activation. The full report and probe artifacts must be committed by the controller with the final corrected plan; reviewer artifacts currently live at `/tmp/apple-harden-mechanism.md` and `/tmp/apple-mechanism-probes/`.

- **Falsified:** stage/version CAS makes a stale callback harmless. Believed because the store rejects mismatched snapshots; two real mounted callbacks plus PostgreSQL showed the loser's unversioned catch cleanup delete the winner's `confirm` row and pending grant. Technique: hold both reads, commit the winner, then inspect after the loser finishes cleanup.
- **Falsified:** native target authorization removes competing actions and all generation checks protect late results. The target view retained enabled controls; overlapping authorization's `busy` error canceled the live attempt. Holding cancellation across a newer generation changed the newer view to cancelled. Technique: enumerate enabled consumers of the shared operation and inspect authority after each await, including cleanup.
- **Falsified:** scanning the Apple plugin for logging calls proves credentials are not logged. Default Debug Capacitor `fromNative` logged the complete synthetic proof. Technique: follow the credential through vendor serialization/logging and execute that actual bridge with build-derived configuration.
- **Falsified:** a finalization transport failure proves nothing changed. The transaction commits before HTTP delivery, while generic failure copy asserted rollback. Technique: separate the database commit observable from the client's acknowledgement observable.
- **Held:** subject-first identity, exact-current-session web finalization, transactional account/grant/session writes, server-selected audiences, native Google's forced nonce-bearing interactive branch, default-off activation and the Apple-only rollback floor. Google web PKCE's secret-derived per-stage verifier reproduced the actual authorization/redemption S256 match; its cryptographic construction remains labelled INFERENCE against RFC 7636.
- **Limited:** injecting equal Capacitor document callback seeds delivered an old Apple result to a new unrelated callback. That demonstrates the conditional routing consequence and probabilistic isolation, not a natural collision or device exploit. Portal/device continuity and complete assembled gates remain owed.
