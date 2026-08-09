import { useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { droppedWarmupNotice } from "../../domain/bulk.js";

interface BulkError {
  line: number | null;
  message: string;
}

interface BulkResponse {
  created: unknown[];
  errors: BulkError[];
  // 2026-08-09 warmup-setting spec §6: a count of well-formed `wu <minutes>`
  // lines the server silently dropped (never a Step any more, but still
  // explicitly recognized rather than an "unknown step word" error — see
  // domain/bulk.ts's own `tryParseWarmupLine` comment). `droppedWarmupNotice`
  // is the one shared copy for this fact — `session/draft.ts`'s legacy
  // local-draft strip renders the identical wording for the other door a
  // stray `wu` can arrive from.
  droppedWarmups: number;
}

// Verbatim from domain/bulk.test.ts's own "parses one valid multi-block
// paste" fixture minus its leading legacy number (app/domain/bulk.ts owns
// the grammar) — a real, currently passing example rather than field-name
// placeholders, so a rower can copy its shape directly instead of guessing
// what TYPE/difficulty accept. The header is "title | TYPE | difficulty |
// pain"; a legacy five-field form with a leading number is still accepted
// and the number discarded (see bulk.ts's parseHeader), but the four-field
// shape is what this help teaches since the number is dead weight now.
// No `wu` line (block2-review F1): this is the worked example a rower is
// invited to copy, and this same screen scolds a `wu` paste with the
// dropped-warm-ups notice below — teaching the dead keyword here would
// trip that notice on the very first import that follows the example.
const GRAMMAR_EXAMPLE = `Ladder Day | AT | medium | 3
x4
w 1' 6k-2 @22 r5
r 5`;

// Spells out the header shape in words, matching parseHeader's own error
// message verbatim (app/domain/bulk.ts) — the example above shows a real
// header but never states the placeholder names, so a rower whose paste
// doesn't fit either shape has no error message to go on and this text is
// what tells them what's optional.
const GRAMMAR_HELP =
  'header: "title | TYPE | difficulty | pain" (a leading number, e.g. "12 | ...", is still accepted and ignored)';

/** Bulk-paste import screen: posts raw text to the server, which owns all
 *  parsing (app/domain/bulk.ts) — this component never parses, pre-validates,
 *  or lints the pasted text itself, so there's no second grammar to drift. */
export default function BulkImport({ onImported }: { onImported: () => void }) {
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
    <main className="screen">
      <Link to="/library" className="back-link">
        ← BACK
      </Link>
      <h1 className="screen-title">Import</h1>
      <div className="bulk-import-panel">
        <textarea
          className="bulk-import-textarea"
          aria-label="Bulk import text"
          placeholder="One workout per block, blank line between"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <p className="bulk-import-grammar">{GRAMMAR_HELP}</p>
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
            {result.droppedWarmups > 0 && (
              <p className="bulk-import-notice">
                {droppedWarmupNotice(result.droppedWarmups)}
              </p>
            )}
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
    </main>
  );
}
