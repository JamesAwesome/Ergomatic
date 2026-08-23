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
// 44px row, unchanged — and it means this component renders only what its
// name says: the connection mark and the device caption, plus ONE
// dev-only exception below.
//
// THE "HOLD-OPEN ARMED" CHIP (Phase RC spec 1 Task 3). A third,
// conditional child: `window.__pm5HoldOpen__` is a dev instrument
// (`transports/index.ts`'s own `declare global` comment on that field has
// the full contract) that only ever gets SET inside the same
// `fakeMonitorEnabled` gate `recording.ts`'s tap lives behind — a real
// deploy's build never sets it, so this chip never renders there either,
// which is why no committed e2e/screenshots capture shows it (nothing in
// either suite calls `arm()`). The 1s poll below, not a subscribed
// callback, matches `holdOpen.ts`'s own shape: `status()` is a plain
// synchronous read with no change-notification of its own, the same
// reason `Timer.tsx`'s repaint loop polls on an interval rather than
// subscribing to a session object that has no event to fire. Only
// `"armed"` renders the chip — `"holding"`'s own readout is `status()`/
// `ring()` on the console (spec §3), not a second chip state, because the
// connected screen unmounts at finish, before a hold can ever reach
// `"holding"` while this component is still mounted to show it.
import { useEffect, useState } from "react";
import type { SurfaceModel } from "./surfaceModel";

const HOLD_OPEN_POLL_MS = 1000;

export default function ConnectionLine({ model }: { model: SurfaceModel }) {
  const [holdOpenArmed, setHoldOpenArmed] = useState(false);

  useEffect(() => {
    // M3 fix (final-review): a real deploy's `window.__pm5HoldOpen__` is
    // ALWAYS `undefined` (this component's own header — it is set only
    // inside the same `fakeMonitorEnabled` gate the instrument lives
    // behind) and it is assigned at transport resolution, BEFORE this
    // component ever mounts — so a production session polled it once a
    // second for the entire life of every connected session for a value
    // that could never change. Bailing out before `setInterval` costs
    // nothing there and changes nothing for a dev/e2e session where the
    // global genuinely exists.
    if (typeof window === "undefined" || window.__pm5HoldOpen__ === undefined) {
      return;
    }
    function poll(): void {
      setHoldOpenArmed(window.__pm5HoldOpen__?.status().state === "armed");
    }
    poll();
    const id = setInterval(poll, HOLD_OPEN_POLL_MS);
    return () => clearInterval(id);
  }, []);

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
      {holdOpenArmed && <span className="hold-open-chip">HOLD-OPEN ARMED</span>}
    </div>
  );
}
