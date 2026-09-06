import { Link } from "react-router-dom";
import { useBaselines } from "../api/useBaselines";
import { baselinesRowState } from "./baselinesRowState";

/**
 * The BASELINES door on You (Gate 0, 2026-09-05). One quiet mono row in the
 * DIAGNOSTICS idiom — label, state line, chevron — opening `/you/baselines`,
 * where the editor, the re-test shortcut and Reset baseline setup now live.
 *
 * IT ALWAYS RENDERS, unlike `Concept2Row` beside it: Concept2 is a
 * capability an account may not have, baselines are the app's own core
 * number and every account has the question. So there is no cell here that
 * returns nothing — a failed read shows `COULDN'T READ` and still opens the
 * screen, where the editor draws its own Retry.
 *
 * The row shows what the SERVER last said; the screen owns editing. That
 * partition is the same one the Concept2 row documents, and it is forced the
 * same way: routes are flat (`shell/AppRoutes.tsx`), so You is unmounted
 * whenever `/you/baselines` is open and no frame holds a mounted row beside
 * a half-typed draft.
 *
 * `baselinesRowState` (./baselinesRowState.ts) is the decision table.
 */
export default function BaselinesRow() {
  const state = useBaselines();
  const line = baselinesRowState(state);

  return (
    <Link to="/you/baselines" state={{ from: "/you" }} className="diag-row">
      <span>BASELINES</span>
      <span className="diag-row-end">
        {line !== null && <span className="diag-row-state">{line}</span>}
        <span aria-hidden="true">&rsaquo;</span>
      </span>
    </Link>
  );
}
