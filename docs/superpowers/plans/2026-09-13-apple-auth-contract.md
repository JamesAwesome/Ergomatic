# Apple front-door client/server contract

Contract for the approved `2026-09-12-apple-signin-design.md`; routine API naming decisions owned by the server plan. Auth types live in `app/shared/auth.ts`, never the rowing domain. Server implementation and native/UI plans consume this same contract.

## Routes and credentials

| Route | Input | Success |
|---|---|---|
| GET `/api/auth/options` | none | `{frontDoorEnabled:boolean, apple:{native:boolean,web:boolean}, google:{native:boolean,web:boolean}}` |
| POST `/api/auth/native/attempts` | `{purpose:"signin",provider}` or `{purpose:"link",provider}` | `NativeBegin` below; link requires current bearer |
| POST `/api/auth/web/attempts` | same union; same-origin browser request | `AuthStep`; sets attempt cookie; link requires current cookie session |
| GET `/api/auth/web/attempts/:id` | attempt cookie | `AuthStep`; resumes after redirect/reload |
| POST `/api/auth/native/attempts/:id/proof` | `{bindingSecret,state,idToken,authorizationCode?,name?}` | `AuthStep`; Apple requires code; Google does not; native Apple `name?:string` (maximum 200 characters) |
| POST `/api/auth/{native,web}/attempts/:id/confirm` | native `{bindingSecret}`; web `{}` plus cookie | `SignedIn`; only `confirm` can create an account |
| POST `/api/auth/{native,web}/attempts/:id/finalize` | native `{bindingSecret}` plus current bearer; web `{}` plus attempt/current session cookies | `{outcome:"linked"}`; only `link_ready` attaches identity |
| POST `/api/auth/{native,web}/attempts/:id/cancel` | native `{bindingSecret}`; web `{}` plus cookie | 204; only matching binding may erase operation |
| GET `/api/auth/methods` | current bearer or cookie | `{apple:boolean,google:boolean}` |
| POST `/api/auth/apple/callback` | exact bounded flat URL-encoded Apple `form_post` | 303 redirect below; route-specific parser mounted before global origin check |
| GET `/api/auth/google/callback` | new nonce-bound Google callback (separate from legacy) | 303 redirect below |

All new endpoints are unavailable (503 `unavailable`) while `FRONT_DOOR_ENABLED=false`, except `/options`, which always reports actual availability. Legacy `/api/auth/signin`, `/api/auth/callback`, `/api/auth/native`, `/api/auth/signout`, and `/api/me` retain their contracts. Missing `/options` on an older server falls back to legacy Google. While enabled, legacy Google retains direct creation and native `{token,expiresAt,user}` success; it no longer uses `ALLOWED_EMAILS` for signup. `C2_ALLOWED_EMAILS` remains separate.

## Response unions

```ts
export type AuthProvider = "apple" | "google";
export type AuthPurpose = "signin" | "link";
export interface AuthUser { id: string; email: string; name: string }
export interface AttemptView {
  attemptId: string;
  purpose: AuthPurpose;
  targetProvider: AuthProvider;
  expiresAt: string;
}
export type AuthStep =
  | (AttemptView & {
      outcome: "authorize";
      provider: AuthProvider;
      stage: "signin" | "reauth" | "target";
      nonce: string;
      state: string;
      // Present only for web; client navigates this exact server URL.
      authorizationUrl?: string;
    })
  | (AttemptView & {
      outcome: "confirm";
      profile: { email: string; name: string };
    })
  | (AttemptView & { outcome: "link_ready" })
  | SignedIn;
export type NativeBegin = AuthStep & { bindingSecret: string };
export type SignedIn = {
  outcome: "signed_in";
  user: AuthUser;
  expiresAt: string;
  // Native only. Web receives HttpOnly session cookie, never this field.
  token?: string;
};
export type AuthErrorCode =
  | "invalid_request" | "invalid_proof" | "attempt_expired"
  | "account_changed" | "account_conflict" | "email_required"
  | "unavailable" | "rate_limited" | "signin_failed";
export interface AuthError { error: AuthErrorCode }
```

`provider` in the begin request is immutable target intent. Existing provider is derived from the original account (the opposite connected provider), never selected by callback input. `authorize.provider` tells the adapter which provider to invoke for this proof. Public `stage` describes user flow; database stage/version never come from client input. Every successful reauth rotates nonce/state. Native Google always uses `forcePrompt:true` with this nonce. Native Apple bridge input is `{nonce,state}`; output is `{idToken,authorizationCode,state,name?}`. Tokens stay in the adapter operation, never general screen state, persisted preferences, analytics or logs.

## Web return protocol

A web begin sets `erg_auth_attempt=<id>.<secret>` with HttpOnly, Secure, SameSite=None, Path=/api/auth and a five-minute max age. Redirect carries only `/?authAttempt=<id>`; no credential, email, nonce, state or provider exception. Client removes that query key using `history.replaceState` after reading it, calls the resume endpoint, and uses `purpose` to select Welcome or You. `authorize` after existing-provider proof requires navigating the new `authorizationUrl`; `confirm` displays Create; `link_ready` triggers same-origin finalization with the CURRENT session. The cross-site Apple callback never attaches a provider. A returning signin sets the ordinary Lax session cookie and redirects to `/?authResult=signed_in`; client reloads `/api/me`. Cancellation redirects to `/?authResult=cancelled&authPurpose=signin|link&authProvider=apple|google`; failure to `/?authError=<allowlisted-code>&authPurpose=signin|link&authProvider=apple|google`. `authProvider` is the immutable target provider and only appears on bound returns. Invalid/unbound callbacks omit it and use generic signin purpose and do not erase a valid unrelated attempt. All return paths are server constants, never request-supplied return URLs.

The cancellation return is silent. The UI preserves prior local route for native cancellation. Web return purpose `link` selects You. A POST failure may be retried only by starting a new operation; provider authorization codes cannot be safely replayed after claimed exchange. Discarding confirmation calls cancel, then guides the rower to usual signin and You.

## HTTP mapping and lifecycle

400 `invalid_request` = absent, empty, overbound, malformed or wrong-shaped input. 401 `invalid_proof` = provider signature/issuer/audience/nonce/state or binding failure; no raw exception. 401 `unauthenticated` remains the existing protected-route middleware response. 409 `account_changed` = current resolved session differs from original; 409 `account_conflict` = target already owned or account already has a different subject. 410 `attempt_expired` = missing, consumed, expired or wrong-stage attempt. 422 `email_required` = a new identity lacks nonempty verified email; returning subject resolution happens first. 429 `rate_limited` = admission limiter or resident anonymous cap. 503 `unavailable` = disabled/missing provider config or cleanup-unhealthy new start. 500 `signin_failed` = other persistence/runtime failure. No response contains provider credentials except native successful Ergomatic session token.

Authorization, each proof stage and confirmation have independent five-minute windows; reauth freshness never exceeds five minutes. No polling extends authority. Cancel/success delete the attempt and pending credential; expiry rejects immediately and sweep physically removes rows. Native holds binding only until terminal outcome; web reload resumes only its cookie-bound operation. Exact original session ID must still be live at link completion and equal the current resolved session ID, even when both IDs belong to one user.
