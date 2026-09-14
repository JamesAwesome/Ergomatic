# Scoped spec review — Apple review fixes

**Verdict: FINDING (1 MEDIUM)**
**Candidate:** `1a3000d4` against `86ed0636fd37c5969bdd369813534c4690de964d`
**Method:** static review of committed objects (`git show`/`git diff`) plus existing receipts; no live working-tree app files or runtime gates were used.

## MEDIUM — a native denial is collapsed when its cleanup acknowledgement fails

The approved requirement says to preserve `access_denied` end to end and “never silently turn the dedicated denial into signin_failed” (`task-brief.md:11`), while retaining cleanup authority after an unacknowledged cancel (`task-brief.md:23`). The candidate correctly decodes the code and bounded email (`app/src/adapters/authFlow.ts:90-101,152-171`), and the native server response exposes only the `AuthFailure` email (`app/server/auth/frontDoorRoutes.ts:69-76`).

However, after a native proof request returns `access_denied`, `authorizeNative` always attempts cleanup. If that cancel request is unacknowledged, the non-provider-error branch replaces the original `AuthRequestError("access_denied", email)` with a new `AuthRequestError("signin_failed")` while retaining the operation (`app/src/adapters/authFlow.ts:464-500`, specifically `488-497`). The UI then shows generic retry copy instead of the approved invitation denial (`app/src/SignIn.tsx:16-20`; link equivalent `app/src/you/SignInMethods.tsx:21-26`). This is source-proven. Cleanup authority is retained, so the impact is incorrect denial meaning rather than lost credentials or access.

The deciding native-denial test covers only a successful follow-up cancel (`app/src/adapters/authFlow.test.tsx:1152-1193`). Add the ordinary synthetic case where proof returns `access_denied` with its saved email and cancel is rejected; require the dedicated denial view/email to remain, then require a later acknowledged cleanup to recover. The narrow correction is to retain the original denial error when retaining the operation; it need not claim cancellation success or add copy.

## Requirements confirmed in candidate

Static inspection found the idle router recovery, rendered/controller/server two-provider gates, independent attempt/session startup and minute sweeps, wrapper removal, unchanged documented global limiter, retryable acknowledged cancellation with generation/operation ownership, and the app-owned full-message Console override. The native plugin uses immutable instance seams, six-level fallback, empty missing messages, dev-only `Swift.print`, and return-none without resolution (`app/ios/App/App/ErgomaticConsolePlugin.swift:4-38`); production registration is in `MyViewController.capacitorDidLoad` (`app/ios/App/App/MyViewController.swift:17-21`). Existing receipts report 114 focused client, 17 server/native-contract, 43 Postgres, three native unit, and Debug/Release compiled bridge tests passing. Final browser/full-branch evidence remains pending and cannot clear the original platform-blocked Apple review.

## Recheck disposition — PASS

**Correction:** `970fb10eba9c90dc296b21cd9d10c04a34e0fee6` against `1a3000d4`.

The correction is limited to `authFlow.ts` and its test. When cleanup is unacknowledged, the production branch now retains the original `AuthRequestError` only when it is `access_denied`; other failures keep the existing uncertainty mapping. It passes that retained error and `retainOperation=true` to `setFailure` (`app/src/adapters/authFlow.ts:488-501`). This preserves the actionable email and denial meaning without claiming cancellation success or dropping retry authority.

The new synthetic regression makes the proof request return `access_denied`, rejects the first cancel acknowledgement, requires the denial/email view to remain, then acknowledges the second cancel and requires the cancelled terminal state (`app/src/adapters/authFlow.test.tsx:1195-1248`). The supplied evidence records the test failing before the source correction, failing under a mutation that removes the denial precedence, and passing after restoration; the implementer reports all 41 `authFlow` tests plus lint, format, and typecheck hooks green. I did not rerun them in this read-only recheck.

The sole scoped finding is closed. The spec review is **PASS at `970fb10eba9c90dc296b21cd9d10c04a34e0fee6`**. Final aggregate/runtime evidence remains root-owned, and this does not change the original platform-blocked review's incomplete status.
