export type AuthProvider = "apple" | "google";
export type AuthPurpose = "signin" | "link" | "delete";
export interface AuthUser {
  id: string;
  email: string;
  name: string;
}
export interface AuthOptions {
  frontDoorEnabled: boolean;
  apple: { native: boolean; web: boolean };
  google: { native: boolean; web: boolean };
}
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
      authorizationUrl?: string;
    })
  | (AttemptView & {
      outcome: "confirm";
      profile: { email: string; name: string };
    })
  | (AttemptView & { outcome: "link_ready" })
  | (AttemptView & { outcome: "delete_ready" })
  | SignedIn;
export type NativeBegin = AuthStep & { bindingSecret: string };
export interface SignedIn {
  outcome: "signed_in";
  user: AuthUser;
  expiresAt: string;
  token?: string;
}
export type AuthErrorCode =
  | "invalid_request"
  | "invalid_proof"
  | "access_denied"
  | "attempt_expired"
  | "account_changed"
  | "account_conflict"
  | "email_required"
  | "unavailable"
  | "rate_limited"
  | "signin_failed";
export interface AuthError {
  error: AuthErrorCode;
  email?: string;
}
export interface NativeProof {
  bindingSecret: string;
  state: string;
  idToken: string;
  authorizationCode?: string;
  name?: string;
}
export type BeginAuth =
  | { purpose: "signin"; provider: AuthProvider }
  | { purpose: "link"; provider: AuthProvider }
  | { purpose: "delete"; provider: AuthProvider };

export interface AuthMethods {
  apple: boolean;
  google: boolean;
}
// Zero rows from the unlink UPDATE has three distinct causes (last provider,
// already unlinked, account gone) and each gets its own rower-facing
// message — a rower whose account is gone must never be told they cannot
// remove their last sign-in method. `appleRevoked` rides only "unlinked":
// it is meaningless for the other three outcomes.
//
// AND IT HAS NO CLIENT CONSUMER, deliberately. `removeMethod` drops it
// (`src/adapters/authFlow.ts`, the `unlinked` view member's own comment):
// the server returns it vacuously `true` for a Google unlink, where no
// Apple call happens at all, so surfacing it would claim something about
// Apple that never occurred. It is retained here for the RECORD — the
// route's own response, which the integration tests assert — not for a
// caller.
export type UnlinkOutcome =
  | { outcome: "unlinked"; appleRevoked: boolean }
  | { outcome: "last_provider" }
  | { outcome: "not_connected" }
  | { outcome: "account_gone" };
/** A deletion has ONE success shape: the account is gone either way.
 *  `appleRevoked` says whether NOTHING IS LEFT OUTSTANDING AT APPLE — every
 *  grant we held was accepted by Apple, OR there was no grant to revoke. It
 *  is vacuously `true` for a Google-only account, because `createAppleRevoke`
 *  returns `true` on an empty list, so it never means "Apple was contacted".
 *  False means we held at least one grant and at least one revoke failed.
 *
 *  Task 4 moved this here from `server/auth/attempts.ts`: the client is now a
 *  consumer, and one declaration both sides compile against is what makes a
 *  renamed field a build error rather than a silently absent one (RF33). */
export interface DeleteOutcome {
  outcome: "deleted";
  appleRevoked: boolean;
}
