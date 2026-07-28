import type { Me } from './useMe'

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('')
}

export default function You({ user, onSignedOut }: { user: Me; onSignedOut: () => void }) {
  async function signOut() {
    await fetch('/api/auth/signout', { method: 'POST' })
    onSignedOut()
  }

  return (
    <section className="you">
      <div className="avatar" aria-hidden="true">
        {initials(user.name)}
      </div>
      <div>
        <p className="you-name">{user.name}</p>
        <p className="you-email">{user.email}</p>
      </div>
      <button className="button-outline" onClick={signOut}>
        Sign out
      </button>
    </section>
  )
}
