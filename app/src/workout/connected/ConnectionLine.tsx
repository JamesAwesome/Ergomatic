// The connection indicator (handoff §3): an 8px square plus the device's
// own advertised name in mono 11 `--ink-3`. Filled while the link is up,
// hollow once it is lost. "It is the same caption family as every other
// label, deliberately unremarkable."
//
// The right-hand slot differs per pane (LIVE puts the phase status there,
// GRID composes the ordinal with the session's own time left, CR2 spec 3
// Task 5), so the caller supplies it — as a full `ReactNode`, not a plain
// string, because GRID's own composition wraps its countdown half in a
// `--marker`-gold span (`ConnectedSurface.tsx`'s own header comment has the
// reasoning for why that composition lives at the CALLER, not here: this
// component stays a dumb slot, same as `TokenRow`'s own `trailing` prop
// takes a node rather than growing a second, string-only sibling prop).

import type { ReactNode } from "react";
import type { SurfaceModel } from "./surfaceModel";

export default function ConnectionLine({
  model,
  trailing = null,
}: {
  model: SurfaceModel;
  trailing?: ReactNode;
}) {
  return (
    <div className="connected-line">
      <span
        className={
          model.linked
            ? "connected-line-mark"
            : "connected-line-mark connected-line-mark-hollow"
        }
        aria-hidden="true"
      />
      <span className="connected-line-device">{model.deviceCaption}</span>
      {trailing !== null && (
        <span className="connected-line-trailing">{trailing}</span>
      )}
    </div>
  );
}
