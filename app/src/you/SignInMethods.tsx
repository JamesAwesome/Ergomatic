import type { AuthProvider } from "../../shared/auth";
import type { AuthFlowController } from "../adapters/authFlow";
import { useAuthMethods } from "../api/useAuthMethods";

function name(provider: AuthProvider): "Apple" | "Google" {
  return provider === "apple" ? "Apple" : "Google";
}

function linkNotice(auth: AuthFlowController): React.ReactNode {
  const view = auth.view;
  if (view.kind === "linked") {
    return (
      <p className="notice auth-notice-success" role="status">
        {name(view.targetProvider)} is now connected. You can sign in either
        way.
      </p>
    );
  }
  if (view.kind === "cancelled" && view.purpose === "link") return null;
  if (view.kind !== "error" || view.purpose !== "link") return null;
  if (view.code === "access_denied") {
    return (
      <p className="notice auth-notice-error" role="alert">
        {view.email ?? "This account"} isn&apos;t invited to this Ergomatic. Ask
        the owner to add you.
      </p>
    );
  }
  if (view.code === "account_changed") {
    return (
      <p className="notice auth-notice-error" role="alert">
        Your account changed. Start linking again. Neither account was modified.
      </p>
    );
  }
  if (view.code === "account_conflict" && view.targetProvider) {
    return (
      <p className="notice auth-notice-error" role="alert">
        That {name(view.targetProvider)} sign-in is already connected to another
        Ergomatic account. Nothing changed.
      </p>
    );
  }
  if (view.code === "signin_failed" || view.code === "attempt_expired") {
    return (
      <p className="notice auth-notice-error" role="alert">
        We couldn’t confirm the result. Check your sign-in methods and try
        again.
      </p>
    );
  }
  return (
    <p className="notice auth-notice-error" role="alert">
      That linking attempt didn’t work. Nothing changed. Start linking again.
    </p>
  );
}

function methodsRefreshKey(view: AuthFlowController["view"]): string {
  if (view.kind === "linked") return `linked-${view.targetProvider}`;
  if (
    view.kind === "error" &&
    view.purpose === "link" &&
    (view.code === "signin_failed" || view.code === "attempt_expired")
  ) {
    return `uncertain-${view.targetProvider ?? "unknown"}`;
  }
  return "current";
}

export default function SignInMethods({ auth }: { auth: AuthFlowController }) {
  const methods = useAuthMethods(methodsRefreshKey(auth.view));
  const notice = linkNotice(auth);
  if (auth.options.state !== "ready" || !auth.options.frontDoorEnabled) {
    return null;
  }
  if (methods.state !== "ready") {
    return notice ? <section className="auth-methods">{notice}</section> : null;
  }
  const retryProvider =
    auth.view.kind === "error" &&
    auth.view.purpose === "link" &&
    (auth.view.code === "account_changed" ||
      ((auth.view.code === "attempt_expired" ||
        auth.view.code === "signin_failed") &&
        auth.view.targetProvider !== undefined &&
        !methods.methods[auth.view.targetProvider]))
      ? auth.view.targetProvider
      : undefined;
  const linkAvailable = auth.options.apple && auth.options.google;
  return (
    <section className="auth-methods" aria-labelledby="auth-methods-heading">
      {notice}
      <h2 id="auth-methods-heading">SIGN-IN METHODS</h2>
      <div className="auth-method-list">
        {(["apple", "google"] as const).map((provider) => {
          const connected = methods.methods[provider];
          return connected ? (
            <div className="auth-method-row" key={provider}>
              <span className="auth-method-name">{name(provider)}</span>
              <span className="auth-method-connected">CONNECTED</span>
            </div>
          ) : (
            <button
              className="auth-method-row"
              key={provider}
              aria-label={`Add ${name(provider)}`}
              disabled={!linkAvailable}
              onClick={() => void auth.prepareLink(provider)}
            >
              <span className="auth-method-name">{name(provider)}</span>
              <span className="auth-method-action">
                Add {name(provider)} <span aria-hidden="true">›</span>
              </span>
            </button>
          );
        })}
      </div>
      {retryProvider && (
        <button
          className="button-l2 auth-link-retry"
          disabled={!linkAvailable}
          onClick={() => void auth.prepareLink(retryProvider)}
        >
          Start linking again
        </button>
      )}
    </section>
  );
}
