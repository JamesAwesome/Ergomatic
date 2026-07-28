import SignIn from './SignIn'
import You from './You'
import { useMe } from './useMe'

export default function App() {
  const [me, signedOut] = useMe()

  if (me.state === 'loading') return null
  if (me.state === 'out') return <SignIn />

  return (
    <main>
      <h1>Ergomatic</h1>
      <p>Rowing workout tracker &amp; planner.</p>
      <You user={me.user} onSignedOut={signedOut} />
    </main>
  )
}
