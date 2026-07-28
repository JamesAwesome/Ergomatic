import { useState } from 'react'
import { isNative } from './platform'

export default function SignIn({ onSignedIn }: { onSignedIn?: () => void }) {
  const params = new URLSearchParams(window.location.search)
  const denied = params.get('denied')
  const failed = params.get('error') === 'signin_failed'
  const [nativeError, setNativeError] = useState<string | null>(null)

  async function signInNative() {
    setNativeError(null)
    try {
      const { initNativeAuth, nativeSignIn } = await import('./native/signin')
      await initNativeAuth()
      await nativeSignIn()
      onSignedIn?.()
    } catch (err) {
      setNativeError(err instanceof Error ? err.message : "That sign-in didn't work. Give it another try.")
    }
  }

  return (
    <main className="signin">
      <h1>Ergomatic</h1>
      <p className="tagline">Rowing workout tracker &amp; planner.</p>
      {denied && (
        <p className="notice" role="alert">
          {denied} isn&apos;t invited to this Ergomatic. Ask James to add you.
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
      {isNative() ? (
        <button className="button-primary" onClick={signInNative}>
          Continue with Google
        </button>
      ) : (
        <a className="button-primary" href="/api/auth/signin">
          Continue with Google
        </a>
      )}
    </main>
  )
}
