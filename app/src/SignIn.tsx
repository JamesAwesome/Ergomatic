import { useState } from "react";
import { SignInButton } from "./adapters/auth";
import { ownsAttachScreen } from "./adapters/authFlow";
import type { AuthFlowController } from "./adapters/authFlow";
import AuthProviderButton from "./auth/AuthProviderButton";

function providerName(provider: "apple" | "google") {
  return provider === "apple" ? "Apple" : "Google";
}

/** The same two-initial fallback the confirm screen uses inline, lifted so
 *  both identity cards on the attach confirmation can share it. */
function initialsOf(name: string) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]!.toUpperCase())
      .join("") || "R"
  );
}

function Welcome({ auth }: { auth: AuthFlowController }) {
  const busy = auth.view.kind === "busy";
  return (
    <main className="signin">
      <h1>Ergomatic</h1>
      <p className="tagline">Rowing workout tracker &amp; planner.</p>
      {/* AFTER A DELETION (Wave A PR 1 Task 4). The account is gone either
          way; `appleRevoked: false` means we held at least one Apple grant
          and at least one revoke failed, which is the only case with
          anything left for the rower to do. The copy states the resulting
          STATE — "is still listed" — rather than our failure to reach
          Apple, because a rower can act on the first and not the second.
          It is Apple's own documented remedy for this case, not ours. */}
      {auth.view.kind === "deleted" && (
        <p className="notice auth-notice-success" role="status">
          {auth.view.appleRevoked
            ? "Your account is deleted."
            : "Your account is deleted. Ergomatic is still listed in your Apple ID settings, under Sign in with Apple. You can remove it there."}
        </p>
      )}
      {/* WAVE A PR 1 TASK 5. `account_conflict` on a fresh signin attempt
          means the provider subject already belongs to a different
          Ergomatic account (unique-constraint conflict, attempts.ts:137).
          The recovery deletion makes possible: sign in to THAT account,
          delete it, then add this sign-in from You. */}
      {auth.view.kind === "error" && auth.view.purpose === "signin" && (
        <p className="notice auth-notice-error" role="alert">
          {auth.view.code === "access_denied"
            ? `${auth.view.email ?? "This account"} isn't invited to this Ergomatic. Ask the owner to add you.`
            : auth.view.code === "account_conflict"
              ? `That ${auth.view.targetProvider ? `${providerName(auth.view.targetProvider)} ` : ""}sign-in already belongs to another Ergomatic account. To use it here, sign in to that account, delete it from You, then add this sign-in.`
              : "That sign-in didn’t work. Give it another try."}
        </p>
      )}
      <div className="auth-stack">
        {auth.options.state === "ready" && auth.options.apple && (
          <AuthProviderButton
            provider="apple"
            disabled={busy}
            onClick={() => void auth.startSignIn("apple")}
          />
        )}
        {auth.options.state === "ready" && auth.options.google && (
          <AuthProviderButton
            provider="google"
            disabled={busy}
            onClick={() => void auth.startSignIn("google")}
          />
        )}
      </div>
    </main>
  );
}

function ConfirmAccount({
  auth,
  view,
}: {
  auth: AuthFlowController;
  view: Extract<AuthFlowController["view"], { kind: "confirm" }>;
}) {
  const provider = providerName(view.targetProvider);
  return (
    <main className="auth-flow-screen">
      <header className="auth-flow-header">
        <button className="auth-back" onClick={() => void auth.cancel()}>
          ← BACK
        </button>
        <h1>Create your account</h1>
        <p className="auth-intro">
          Your workouts and training plan will be saved here.
        </p>
      </header>
      <div className="auth-flow-body">
        <section className="auth-identity">
          <div className="avatar" aria-hidden="true">
            {view.profile.name
              .split(/\s+/)
              .filter(Boolean)
              .slice(0, 2)
              .map((part) => part[0]!.toUpperCase())
              .join("") || "R"}
          </div>
          <div className="auth-identity-copy">
            <p className="auth-identity-name">{view.profile.name}</p>
            <p className="auth-identity-email">{view.profile.email}</p>
          </div>
        </section>
        <div className="auth-explain">
          <p>
            This makes a new Ergomatic account. If you already row here, sign in
            the way you usually do and add {provider} from You.
          </p>
        </div>
        <div className="auth-actions">
          <button
            className="button-l1"
            onClick={() => void auth.confirmAccount()}
          >
            Create account
          </button>
          <button
            className="button-l2"
            onClick={() => void auth.useUsualSignIn()}
          >
            I already have an account
          </button>
        </div>
      </div>
    </main>
  );
}

/** WAVE A PR2: the post-proof confirmation, rendered on the SIGN-IN screen
 *  because that is where the rower still is — `onSignedIn` is deliberately
 *  not called until they choose, so `me` stays out and this screen stays
 *  mounted.
 *
 *  IT NAMES THREE THINGS, and the third is what makes it a control rather
 *  than a notice: the identity being attached, the account it attaches TO,
 *  and that the rower is already signed in. "Attach this to WHICH account?"
 *  is a question they cannot answer without the second. */
export function AttachConfirm({ auth }: { auth: AuthFlowController }) {
  // THE SCREEN REMEMBERS ITS OWN PAYLOAD, because it has to outlive the view
  // that carried it. `confirmAttach` flips the view to `busy`, which has no
  // `carried` and no `account` — and the screen must keep drawing through its
  // own request, or the disabled controls below are an attribute on a
  // component that has already unmounted. `DeleteAccount` gets this for free:
  // its copy is static, so it needs nothing from the view.
  type Payload = Extract<
    AuthFlowController["view"],
    { kind: "attach_confirm" }
  >;
  const live = auth.view.kind === "attach_confirm" ? auth.view : null;
  const [remembered, setRemembered] = useState<Payload | null>(live);
  // ADJUSTING STATE DURING RENDER, which is React's own documented pattern for
  // "a value derived from props that must survive a prop change". A ref read
  // during render and a setState inside an effect are both rejected by the
  // compiler's lint here, and both would be worse: the effect version renders
  // once with nothing.
  if (live && live !== remembered) setRemembered(live);
  // The live view first, the remembered one once it flips to `busy`.
  const view = live ?? remembered;
  if (!view || !ownsAttachScreen(auth.view)) return null;
  const target = providerName(view.targetProvider);
  // BOTH CONTROLS GO INERT FOR THE REQUEST'S WHOLE LENGTH, the same guard
  // `DeleteAccount` uses. Relying on this component unmounting when the view
  // flips to `busy` is weaker: `confirmAttach` and `declineAttach` share a
  // generation, so a second tap landing in the same tick would be guarded
  // only by a render closure.
  const busy = auth.view.kind === "busy" && auth.view.purpose === "signin";
  return (
    <main className="auth-flow-screen">
      <header className="auth-flow-header">
        <h1>Attach {target} to this account?</h1>
        <p className="auth-intro">
          You are signed in. Nothing has been attached yet.
        </p>
      </header>
      <div className="auth-flow-body">
        <p className="auth-field-label">ATTACHING</p>
        <section className="auth-identity">
          <div className="avatar" aria-hidden="true">
            {initialsOf(view.carried.name)}
          </div>
          <div className="auth-identity-copy">
            <p className="auth-identity-name">{view.carried.name}</p>
            <p className="auth-identity-email auth-identity-email-full">
              {view.carried.email}
            </p>
          </div>
          <span className="auth-identity-mark">{target.toUpperCase()}</span>
        </section>
        <p className="auth-attach-arrow" aria-hidden="true">
          &darr; TO &darr;
        </p>
        <p className="auth-field-label">THIS ACCOUNT</p>
        <section className="auth-identity">
          <div className="avatar" aria-hidden="true">
            {initialsOf(view.account.name)}
          </div>
          <div className="auth-identity-copy">
            <p className="auth-identity-name">{view.account.name}</p>
            <p className="auth-identity-email auth-identity-email-full">
              {view.account.email}
            </p>
          </div>
        </section>
        <div className="auth-explain">
          <p>
            After this you can sign in either way. Your workouts, plan and log
            are unchanged.
          </p>
        </div>
        <div className="auth-actions">
          <button
            className="button-l1"
            disabled={busy}
            onClick={() => void auth.confirmAttach()}
          >
            Attach {target}
          </button>
          <button
            className="button-l2"
            disabled={busy}
            onClick={() => void auth.declineAttach()}
          >
            Not now
          </button>
        </div>
      </div>
    </main>
  );
}

function EmailNeeded({ auth }: { auth: AuthFlowController }) {
  return (
    <main className="auth-flow-screen">
      <header className="auth-flow-header">
        <button className="auth-back" onClick={auth.reset}>
          ← BACK
        </button>
        <h1>Email needed</h1>
        <p className="auth-intro">
          We need an email to create a new Ergomatic account.
        </p>
      </header>
      <div className="auth-flow-body">
        <p className="notice auth-notice-error" role="alert">
          This Apple account didn’t provide an email address. Continue with
          Google.
        </p>
        <div className="auth-explain">
          <p>
            No account was created. If this Apple sign-in is already linked to
            an Ergomatic account, returning sign-in still works from its Apple
            identity.
          </p>
        </div>
        <div className="auth-actions">
          <AuthProviderButton
            provider="google"
            onClick={() => void auth.startSignIn("google")}
          />
          <button className="button-l2" onClick={auth.reset}>
            Back to all options
          </button>
        </div>
      </div>
    </main>
  );
}

function LegacySignIn({
  denied,
  failed,
  nativeError,
  onSignedIn,
  onNativeError,
}: {
  denied: string | null;
  failed: boolean;
  nativeError: string | null;
  onSignedIn?: () => void;
  onNativeError: (message: string) => void;
}) {
  return (
    <main className="signin">
      <h1>Ergomatic</h1>
      <p className="tagline">Rowing workout tracker &amp; planner.</p>
      {denied && (
        <p className="notice" role="alert">
          {denied} isn&apos;t invited to this Ergomatic. Ask the owner to add
          you.
        </p>
      )}
      {failed && (
        <p className="notice" role="alert">
          That sign-in didn&apos;t work. Give it another try.
        </p>
      )}
      {nativeError && (
        <p className="notice" role="alert">
          {nativeError}
        </p>
      )}
      <SignInButton onSignedIn={onSignedIn} onError={onNativeError} />
    </main>
  );
}

export default function SignIn({
  onSignedIn,
  auth,
}: {
  onSignedIn?: () => void;
  auth?: AuthFlowController;
}) {
  const params = new URLSearchParams(window.location.search);
  const denied = params.get("denied");
  const failed = params.get("error") === "signin_failed";
  const [nativeError, setNativeError] = useState<string | null>(null);

  if (auth) {
    if (auth.view.kind === "confirm") {
      return <ConfirmAccount auth={auth} view={auth.view} />;
    }
    if (auth.view.kind === "attach_confirm") {
      return <AttachConfirm auth={auth} />;
    }
    if (
      auth.view.kind === "error" &&
      auth.view.purpose === "signin" &&
      auth.view.code === "email_required" &&
      auth.view.targetProvider === "apple"
    ) {
      return <EmailNeeded auth={auth} />;
    }
    if (auth.options.state === "ready" && auth.options.legacyGoogle) {
      return (
        <LegacySignIn
          denied={denied}
          failed={failed}
          nativeError={nativeError}
          onSignedIn={onSignedIn}
          onNativeError={setNativeError}
        />
      );
    }
    return <Welcome auth={auth} />;
  }

  return (
    <LegacySignIn
      denied={denied}
      failed={failed}
      nativeError={nativeError}
      onSignedIn={onSignedIn}
      onNativeError={setNativeError}
    />
  );
}
