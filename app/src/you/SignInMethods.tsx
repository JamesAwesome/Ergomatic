import type { AuthProvider } from "../../shared/auth";
import type { AuthFlowController } from "../adapters/authFlow";
import { useAuthMethods } from "../api/useAuthMethods";

function name(provider: AuthProvider): "Apple" | "Google" {
  return provider === "apple" ? "Apple" : "Google";
}

function methodsNotice(auth: AuthFlowController): React.ReactNode {
  const view = auth.view;
  if (view.kind === "linked") {
    return (
      <p className="notice auth-notice-success" role="status">
        {name(view.targetProvider)} is now connected. You can sign in either
        way.
      </p>
    );
  }
  // A REMOVAL THAT CHANGED NOTHING has three causes and the server tells them
  // apart. The third is the reason it bothers: a rower whose account is
  // already gone must never be told they cannot remove their last sign-in
  // method, which would be a lie about an account that no longer exists.
  if (view.kind === "unlink_refused") {
    if (view.reason === "last_provider") {
      return (
        <p className="notice auth-notice-error" role="alert">
          Add another sign-in method before removing this one.
        </p>
      );
    }
    if (view.reason === "not_connected") {
      return (
        <p className="notice auth-notice-error" role="alert">
          That sign-in method isn’t connected to this account.
        </p>
      );
    }
    return (
      <p className="notice auth-notice-error" role="alert">
        This account no longer exists. Nothing was changed.
      </p>
    );
  }
  // We do not know whether it happened. The list re-reads itself either way
  // (`methodsRefreshKey` below), so the honest line is the uncertain one.
  if (view.kind === "unlink_failed") {
    return (
      <p className="notice auth-notice-error" role="alert">
        We couldn’t confirm the result. Check your sign-in methods and try
        again.
      </p>
    );
  }
  if (
    view.kind === "cancelled" &&
    (view.purpose === "link" || view.purpose === "delete")
  ) {
    return null;
  }
  // ONE COMBINED GUARD, and the delete purpose belongs IN it. A branch added
  // below a `purpose !== "link"` guard is unreachable, which reproduces the
  // exact "nothing happened" defect this screen exists to fix (finding I1:
  // a failed web delete used to bounce the rower here with no message).
  if (
    view.kind !== "error" ||
    (view.purpose !== "link" && view.purpose !== "delete")
  ) {
    return null;
  }
  // Above the link branches, and code-blind on purpose: every way a delete
  // re-auth can fail says the same true thing to the rower, and none of the
  // link-specific codes mean anything here.
  if (view.purpose === "delete") {
    return (
      <p className="notice auth-notice-error" role="alert">
        We couldn’t confirm it was you. Nothing was deleted.
      </p>
    );
  }
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
  // THE WRITE HAPPENED SERVER-SIDE AND THE READ NEVER RE-RAN (RF24, on the
  // client). `useAuthMethods` refetches only when this key string changes,
  // so without these three the row keeps rendering CONNECTED with a live
  // Remove for a provider that is already gone, and the second tap answers
  // `not_connected`.
  if (view.kind === "unlinked") return `unlinked-${view.provider}`;
  // A refused or failed unlink can mean the server disagrees with what this
  // screen shows (already removed, or the account is gone), so re-read
  // rather than trust it.
  if (view.kind === "unlink_refused") {
    return `refused-${view.provider}-${view.reason}`;
  }
  if (view.kind === "unlink_failed") {
    return `unlink-failed-${view.provider}-${view.code}`;
  }
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
  const notice = methodsNotice(auth);
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
  // REMOVE IS OFFERED ONLY WHERE REMOVING IS POSSIBLE (Gate 0, 2026-09-14).
  // On a last remaining method there is no control at all, rather than a
  // disabled one with no explanation — the rower has nothing to act on, so
  // there is nothing to grey out.
  const removable = methods.methods.apple && methods.methods.google;
  // A SECOND TAP IS NOT A SECOND REMOVAL. `removeMethod` sets `busy` and
  // this screen draws nothing for it, so without this the control stayed
  // live for the whole round trip: two DELETEs, the second answering
  // `not_connected` — a refusal notice for a removal that succeeded.
  const busy = auth.view.kind === "busy";
  // A delete re-proves a provider the rower ALREADY HOLDS (attempts.ts:
  // "A delete must name a provider the rower actually holds"), and that
  // provider's proof must be available on this surface. Apple first, to
  // match the order this list is drawn in.
  const deleteProvider =
    methods.methods.apple && auth.options.apple
      ? ("apple" as const)
      : methods.methods.google && auth.options.google
        ? ("google" as const)
        : undefined;
  return (
    <div className="auth-account-block">
      {/* OUTSIDE the list section, so it spans both columns in landscape.
          Inside it, the notice wraps to three lines in a half-width column
          and drags the quarantine box beside it off the fold. */}
      {notice && <div className="auth-account-notice">{notice}</div>}
      <section className="auth-methods" aria-labelledby="auth-methods-heading">
        <h2 id="auth-methods-heading">SIGN-IN METHODS</h2>
        <div className="auth-method-list">
          {(["apple", "google"] as const).map((provider) => {
            const connected = methods.methods[provider];
            return connected ? (
              <div className="auth-method-row" key={provider}>
                <span className="auth-method-name">{name(provider)}</span>
                <span className="auth-method-tail">
                  <span className="auth-method-connected">CONNECTED</span>
                  {removable && (
                    <button
                      className="auth-method-remove"
                      aria-label={`Remove ${name(provider)}`}
                      disabled={busy}
                      onClick={() => void auth.removeMethod(provider)}
                    >
                      Remove
                    </button>
                  )}
                </span>
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
      {/* THE QUARANTINE BOX (Gate 0 ruling 1, James, 2026-09-14: "in its own
          quarantined section" — a rule was not enough separation). The
          BORDER is the containment: it says this block is not part of the
          list above. It holds the label and the button and nothing else —
          no explanatory sentence, because "delete" already means what it
          means and the confirm screen's list is where the facts live.
          In landscape it sits BESIDE the list (index.css), never below,
          where a 320px-tall screen would push it off (the RC-24 failure). */}
      <section
        className="auth-danger-zone"
        aria-labelledby="auth-account-heading"
      >
        <h2 id="auth-account-heading">ACCOUNT</h2>
        <button
          className="auth-delete-account"
          disabled={deleteProvider === undefined}
          onClick={() =>
            void (deleteProvider && auth.startDelete(deleteProvider))
          }
        >
          Delete account
        </button>
      </section>
    </div>
  );
}
