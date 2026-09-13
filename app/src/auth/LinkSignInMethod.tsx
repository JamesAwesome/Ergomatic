import type { AuthProvider } from "../../shared/auth";
import type { AuthFlowController } from "../adapters/authFlow";
import AuthProviderButton from "./AuthProviderButton";

function providerName(provider: AuthProvider): "Apple" | "Google" {
  return provider === "apple" ? "Apple" : "Google";
}

export default function LinkSignInMethod({
  auth,
}: {
  auth: AuthFlowController;
}) {
  if (
    auth.view.kind !== "link_confirm" &&
    auth.view.kind !== "link_authorize"
  ) {
    return null;
  }
  const target = auth.view.targetProvider;
  const usual: AuthProvider = target === "apple" ? "google" : "apple";
  const firstDone = auth.view.kind === "link_authorize";
  return (
    <main className="auth-flow-screen">
      <header className="auth-flow-header">
        <button className="auth-back" onClick={() => void auth.cancel()}>
          ← CANCEL
        </button>
        <h1>Add {providerName(target)}</h1>
        <p className="auth-intro">
          Confirm {providerName(usual)}, then sign in with{" "}
          {providerName(target)}. Your workouts stay with this account.
        </p>
      </header>
      <div className="auth-flow-body">
        <div className="auth-steps">
          <div className={`auth-step${firstDone ? " auth-step-done" : ""}`}>
            <span
              className="auth-step-index"
              aria-label={firstDone ? "Usual sign-in confirmed" : undefined}
            >
              {firstDone ? "✓" : "1"}
            </span>
            <div>
              <strong>Confirm your usual {providerName(usual)} sign-in</strong>
              <small>Keep your workouts in this account.</small>
            </div>
          </div>
          <div className="auth-step">
            <span className="auth-step-index">2</span>
            <div>
              <strong>Sign in with {providerName(target)}</strong>
              <small>
                Add {providerName(target)} as another way to sign in.
              </small>
            </div>
          </div>
        </div>
        <div className="auth-actions">
          <AuthProviderButton
            provider={firstDone ? target : usual}
            disabled={firstDone && auth.targetAuthorizationBusy}
            label={
              firstDone ? undefined : `Confirm with ${providerName(usual)}`
            }
            onClick={() =>
              void (firstDone
                ? auth.authorizeLinkTarget()
                : auth.startPreparedLink())
            }
          />
          <button className="button-l2" onClick={() => void auth.cancel()}>
            Cancel
          </button>
        </div>
      </div>
    </main>
  );
}
