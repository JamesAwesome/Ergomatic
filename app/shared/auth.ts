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
  | { purpose: "link"; provider: AuthProvider };

export interface AuthMethods {
  apple: boolean;
  google: boolean;
}
