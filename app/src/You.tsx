import type { Me } from "./useMe";
import { signOut as authSignOut } from "./adapters/auth";
import BaselineEditor from "./you/BaselineEditor";

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
}

export default function You({
  user,
  onSignedOut,
}: {
  user: Me;
  onSignedOut: () => void;
}) {
  return (
    <main className="screen">
      <section className="you">
        <div className="avatar" aria-hidden="true">
          {initials(user.name)}
        </div>
        <div>
          <p className="you-name">{user.name}</p>
          <p className="you-email">{user.email}</p>
        </div>
        <button
          className="button-outline"
          onClick={async () => {
            await authSignOut();
            onSignedOut();
          }}
        >
          Sign out
        </button>
      </section>
      <h2 className="section-heading">BASELINES</h2>
      <BaselineEditor />
    </main>
  );
}
