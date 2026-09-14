import { useEffect, useRef } from "react";
import {
  ownsDeleteScreen,
  type AuthFlowController,
} from "../adapters/authFlow";

/** The confirm screen, reached only after the rower has re-proved the
 *  provider they already hold — `delete_ready` is the server saying so.
 *
 *  IT PROMISES NOTHING ABOUT APPLE. At the moment this is read the revoke
 *  has not happened; whether anything is left outstanding at Apple is a
 *  fact that only exists after the deletion, and the Welcome screen states
 *  it there (`SignIn.tsx`).
 *
 *  IT DOES NOT NAME CONCEPT2 (Gate 0 ruling 2, James, 2026-09-14). The link
 *  row IS deleted with the account, but we never deauthorize at Concept2's
 *  end, and naming it here would imply we do. */
export default function DeleteAccount({
  auth,
  onDeleted,
}: {
  auth: AuthFlowController;
  onDeleted: () => void;
}) {
  const view = auth.view;
  const deleted = view.kind === "deleted";
  // THE REQUEST IS IN FLIGHT AND THE ACCOUNT MAY ALREADY BE GONE. Both
  // controls go inert for its whole length: a second Delete is a second
  // irreversible request, and a Cancel bumps the flow's generation, which
  // makes the deletion's own success unreportable.
  const deleting = view.kind === "busy" && view.purpose === "delete";
  // The callback is read through a ref so a caller that rebuilds it every
  // render cannot re-fire the handover; the effect keys on the transition
  // alone, which happens once per account.
  const onDeletedRef = useRef(onDeleted);
  useEffect(() => {
    onDeletedRef.current = onDeleted;
  }, [onDeleted]);
  // THIS SCREEN OWNS THE `deleted` MOMENT even though it draws nothing for
  // it. Handing the view straight back to the router instead would unmount
  // this component in the same commit that set `deleted`, and the effect
  // below — the one that signs the rower out — would never run.
  useEffect(() => {
    if (deleted) onDeletedRef.current();
  }, [deleted]);
  if (!ownsDeleteScreen(view) || deleted) return null;
  return (
    <main className="auth-flow-screen auth-delete-screen">
      <header className="auth-flow-header">
        <button
          className="auth-back"
          disabled={deleting}
          onClick={() => void auth.cancel()}
        >
          ← CANCEL
        </button>
        <h1>Delete this account?</h1>
      </header>
      <div className="auth-flow-body">
        {/* THE LIST IS THE WARNING. It is the only thing on this screen a
            rower cannot work out for themselves; an adjective about
            permanence is not (James, 2026-09-14: state facts, not prose). */}
        <div className="auth-delete-copy">
          <p className="auth-delete-scope">
            Deletes your workouts, session log, plan, baselines, and test
            history.
          </p>
          <p className="auth-delete-aside">Signs you out on this device.</p>
        </div>
        <div className="auth-actions">
          <button
            className="button-l1"
            disabled={deleting}
            onClick={() => void auth.confirmDelete()}
          >
            Delete account
          </button>
          <button
            className="button-l2"
            disabled={deleting}
            onClick={() => void auth.cancel()}
          >
            Cancel
          </button>
        </div>
      </div>
    </main>
  );
}
