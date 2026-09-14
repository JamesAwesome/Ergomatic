import { useState } from "react";
import { SignInButton } from "./adapters/auth";
import type { AuthFlowController } from "./adapters/authFlow";
import AuthProviderButton from "./auth/AuthProviderButton";

function providerName(provider: "apple" | "google") {
  return provider === "apple" ? "Apple" : "Google";
}

function Welcome({ auth }: { auth: AuthFlowController }) {
  const busy = auth.view.kind === "busy";
  return (
    <main className="signin">
      <h1>Ergomatic</h1>
      <p className="tagline">Rowing workout tracker &amp; planner.</p>
      {auth.view.kind === "error" && auth.view.purpose === "signin" && (
        <p className="notice auth-notice-error" role="alert">
          {auth.view.code === "access_denied"
            ? `${auth.view.email ?? "This account"} isn't invited to this Ergomatic. Ask the owner to add you.`
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

function UsualSignIn({
  auth,
  provider,
}: {
  auth: AuthFlowController;
  provider: "apple" | "google";
}) {
  const add = provider === "apple" ? "Google" : "Apple";
  return (
    <main className="signin">
      <h1>Sign in to your account</h1>
      <p className="auth-intro">
        Use your usual sign-in. Then open You → Sign-in methods to add {add}.
        Your workouts stay with the account you already have.
      </p>
      <AuthProviderButton
        provider={provider}
        onClick={() => void auth.startSignIn(provider)}
      />
      <button className="auth-back" onClick={auth.reset}>
        ← ALL SIGN-IN OPTIONS
      </button>
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
    if (auth.view.kind === "usual") {
      return <UsualSignIn auth={auth} provider={auth.view.provider} />;
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
