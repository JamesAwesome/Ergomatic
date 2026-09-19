import { useState } from "react";
import { api } from "../api";

/**
 * `NAME` on `/you/account` — Gate 0 2026-09-19, option A (pack at
 * `docs/design/rename-gate0/`).
 *
 * WHY IT EXISTS. A rower Apple did not offer the name screen to lands as
 * `"Rower"`, and Apple never shows that screen twice — so before this, the
 * name was permanent. That permanence is what turned a failed Apple token
 * revoke from untidy into a real defect, which is why this shipped beside it
 * rather than after it.
 *
 * IT IS THE ONLY WRITER OF THE NAME AFTER CREATION, and that is a property of
 * the server, not of this file: `signin.ts` and `legacyGoogle` stopped
 * re-copying the provider's name on every sign-in in the same change. A
 * rename this screen makes is not undone by signing in tomorrow.
 *
 * `onRenamed` IS NOT OPTIONAL AND IS NOT DECORATION. You's header and its
 * initials read the same user object this writes to, so a save that does not
 * announce itself leaves two surfaces showing a name the account no longer
 * has. The caller re-reads `/api/me` rather than this component holding a
 * second copy of the truth.
 */
export default function NameEditor({
  name,
  onRenamed,
}: {
  name: string;
  onRenamed: () => void;
}) {
  const [value, setValue] = useState(name);
  const [state, setState] = useState<"idle" | "busy" | "saved">("idle");
  const [error, setError] = useState<string | null>(null);

  // Trimmed on BOTH sides of the comparison, so padding alone is not a
  // change: the server trims before storing, and offering Save for a
  // difference the server will discard would show SAVED over an unchanged
  // row.
  const next = value.trim();
  const dirty = next !== name.trim();

  async function save() {
    setState("busy");
    setError(null);
    try {
      const res = await api("/api/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: next }),
      });
      if (!res.ok) {
        // The server's own refusal, in the rower's words. 400 is the only
        // one it answers here and it means exactly one thing.
        setError(
          res.status === 400
            ? "A name cannot be empty."
            : "That did not save. Try again.",
        );
        setState("idle");
        return;
      }
      setState("saved");
      onRenamed();
    } catch {
      // A thrown fetch is offline or a dead server. The rower's typing is
      // deliberately left in the field: clearing it would lose their work to
      // report a failure they can simply retry.
      setError("That did not save. Try again.");
      setState("idle");
    }
  }

  return (
    <section className="auth-name">
      <h2 id="auth-name-heading">NAME</h2>
      <div className="auth-name-row">
        <input
          className="auth-name-input"
          aria-label="Your name"
          value={value}
          disabled={state === "busy"}
          onChange={(e) => {
            setValue(e.target.value);
            // A fresh edit clears the last outcome: leaving SAVED or a
            // refusal beside a field the rower is retyping describes a
            // value that is no longer on screen.
            if (state === "saved") setState("idle");
            if (error) setError(null);
          }}
        />
        {state === "saved" ? (
          <span className="auth-name-saved">SAVED</span>
        ) : (
          <button
            className="auth-name-save"
            disabled={!dirty || state === "busy"}
            onClick={() => void save()}
          >
            Save
          </button>
        )}
      </div>
      {error && (
        <p className="auth-name-note is-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
