export default function SignIn() {
  const params = new URLSearchParams(window.location.search)
  const denied = params.get('denied')
  const failed = params.get('error') === 'signin_failed'

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
      <a className="button-primary" href="/api/auth/signin">
        Continue with Google
      </a>
    </main>
  )
}
