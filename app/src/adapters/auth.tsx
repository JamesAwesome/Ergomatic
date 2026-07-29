import { isNative } from "../platform";

/** The ONLY place screens may reach platform-specific auth behavior.
 *  Native modules stay behind dynamic imports so Capacitor plugins never
 *  land in the web bundle. */
// signOut and SignInButton are one adapter seam by design (native-first
// policy, CLAUDE.md); this module is never edited during a Fast Refresh
// session, so mixing a plain export with the component export is fine.
// eslint-disable-next-line react-refresh/only-export-components
export async function signOut(): Promise<void> {
  if (isNative()) {
    const { nativeSignOut } = await import("../native/signin");
    await nativeSignOut();
  } else {
    await fetch("/api/auth/signout", { method: "POST" });
  }
}

export function SignInButton({
  onSignedIn,
  onError,
}: {
  onSignedIn?: () => void;
  onError: (message: string) => void;
}) {
  if (!isNative()) {
    return (
      <a className="button-primary" href="/api/auth/signin">
        Continue with Google
      </a>
    );
  }
  async function signInNative() {
    try {
      const { initNativeAuth, nativeSignIn } = await import("../native/signin");
      await initNativeAuth();
      await nativeSignIn();
      onSignedIn?.();
    } catch (err) {
      onError(
        err instanceof Error
          ? err.message
          : "That sign-in didn't work. Give it another try.",
      );
    }
  }
  return (
    <button className="button-primary" onClick={signInNative}>
      Continue with Google
    </button>
  );
}
