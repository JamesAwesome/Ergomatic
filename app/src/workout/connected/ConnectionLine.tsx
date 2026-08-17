// The connection indicator (design spec §2A): an 8px square plus the
// device's own advertised name, mono `--c-size-control` (13px both
// orientations) at 0.10em tracking, `--ink-2`. Filled while the link is up,
// hollow once it is lost. "It is the same caption family as every other
// label, deliberately unremarkable." (CR2 spec 3 Task 6: this used to read
// "mono 11 `--ink-3`" — the pre-redesign size this span shipped with —
// `index.css`'s own rule comment has the wiring that closed the gap.)
//
// THE STATUS CAPTION NO LONGER LIVES HERE (Task 6 fix round, CRITICAL 1).
// It used to render as a `trailing` prop threaded into a third child span
// nested INSIDE this component's own `.connected-line` box. Task 6's own
// review found three committed portrait captures with the status text
// overprinting the device id and/or END — §2C's table draws the status on
// ITS OWN LINE below the header row ("Header: PM5 id + END … Status line
// mono 21"), not sharing this row at all. A nested span cannot become a
// second flex line of a DIFFERENT container by CSS alone (it is laid out
// inside `.connected-line`'s OWN nested flex box, not the shell header's),
// so the status moved OUT to `ConnectedSurface.tsx`, which now renders it
// as a direct sibling of this component and the End button, both still
// inside `.connected-header`. That one relocation is what lets portrait CSS
// wrap ONLY the status onto a new line (`order`/`flex-basis: 100%` on
// `.connected-line-trailing`, `index.css`'s own header comment has the
// mechanism) while landscape keeps every child on the original single
// 44px row, unchanged — and it means this component now renders only what
// its name says: the connection mark and the device caption, nothing else.
import type { SurfaceModel } from "./surfaceModel";

export default function ConnectionLine({ model }: { model: SurfaceModel }) {
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
    </div>
  );
}
