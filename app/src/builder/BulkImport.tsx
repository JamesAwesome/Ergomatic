import { useState } from "react";
import { api } from "../api";

interface BulkError {
  line: number | null;
  message: string;
}

interface BulkResponse {
  created: unknown[];
  errors: BulkError[];
}

// Verbatim from domain/bulk.test.ts's own "parses one valid multi-block
// paste" fixture (app/domain/bulk.ts owns the grammar) — a real, currently
// passing example rather than field-name placeholders, so a rower can copy
// its shape directly instead of guessing what TYPE/difficulty accept.
const GRAMMAR_EXAMPLE = `12 | Ladder Day | AT | medium | 3
wu 10
x4
w 1' 6k-2 @22 r5
r 5`;

/** Bulk-paste import panel: posts raw text to the server, which owns all
 *  parsing (app/domain/bulk.ts) — this component never parses, pre-validates,
 *  or lints the pasted text itself, so there's no second grammar to drift. */
export default function BulkImport({ onImported }: { onImported: () => void }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<BulkResponse | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  async function handleSubmit() {
    setSubmitError(null);
    setSubmitting(true);
    try {
      const res = await api("/api/workouts/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      if (!res.ok) {
        setSubmitError("Couldn't import. Try again.");
        setResult(null);
        return;
      }
      const body = (await res.json()) as BulkResponse;
      setResult(body);
      // Only a clean sweep navigates away. A partial result (some created,
      // some failed) must keep the rower on this panel so they can read
      // which line failed and why, fix it, and paste again — navigating
      // away would bury that feedback.
      if (body.errors.length === 0) onImported();
    } catch {
      setSubmitError("Couldn't import. Try again.");
      setResult(null);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="bulk-import">
      <button
        type="button"
        className="builder-add-row"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        + PASTE TO BULK IMPORT
      </button>
      {open && (
        <div className="bulk-import-panel">
          <textarea
            className="bulk-import-textarea"
            aria-label="Bulk import text"
            placeholder="One workout per block, blank line between"
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <pre className="bulk-import-help">{GRAMMAR_EXAMPLE}</pre>
          <button
            type="button"
            className="button-outline bulk-import-submit"
            onClick={handleSubmit}
            disabled={submitting || text.trim().length === 0}
          >
            Import
          </button>
          {submitError && <p className="field-error">{submitError}</p>}
          {result && (
            <div className="bulk-import-result" role="alert">
              <p className="mono-status">{result.created.length} created</p>
              {result.errors.length > 0 && (
                <ul className="bulk-import-errors">
                  {result.errors.map((err, i) => (
                    <li key={i} className="field-error">
                      {err.line !== null ? `line ${err.line}: ` : ""}
                      {err.message}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
