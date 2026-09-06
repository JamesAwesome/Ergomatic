// Phase NF (design spec 2026-09-03 §1): THE platform conditional for NFC —
// the one place the app decides whether it has an NFC reader at all, per
// the native-first policy (`keepAwake.ts`, `appLifecycle.ts`,
// `monitorTransport.ts` all draw the same line). Native reaches
// `src/native/nfc.ts` — the only importer of `@capgo/capacitor-nfc` — by
// dynamic `import()` inside the branch. The plugin's chunk DOES ship in
// `dist/` (Rollup emits it as a lazy chunk; `scripts/dist-grep.sh`'s header
// says so and explains why no identifier needle can gate it) — what the
// gate proves is that the SCRIPTED reader below folds away: its
// `scripted start failure` literal is a dist-grep needle.
//
// Web and the simulator are `unsupported`: no button, no placeholder. The
// ONE exception is the scripted reader behind the SAME build-time-foldable
// gate the fake PM5 transport lives behind (`transports/index.ts`'s
// `fakeMonitorEnabled`): an e2e or unit test sets `window.__nfcScript__`
// before the page loads and the real detail screen, parser, handoff and
// session run over native-shaped events. A production build folds the
// whole branch away.

import type { NfcRecord } from "../../domain/monitor/nfc.js";
import type { ConnectionAttemptId } from "../../domain/monitor/types.js";
import type { ConnectionAttemptTrace } from "../monitor/nfc/connectionAttemptTrace";
import { isNative } from "../platform";

export type NfcCapability = "supported" | "unsupported";

export interface NfcReadOptions {
  attemptId: ConnectionAttemptId;
  alertMessage: string;
  /** Detail unmount or foreground loss. An abort after native start awaits
   *  the explicit stop; an abort before it prevents the start. */
  signal: AbortSignal;
  trace: ConnectionAttemptTrace;
}

export interface NfcReader {
  capability(): Promise<NfcCapability>;
  /** One foreground NDEF session for one attempt. Resolves with the
   *  validated records of the ONE tag read; rejects with one of the named
   *  endings below. Every path stops the session and removes every
   *  listener before settling. */
  readOne(options: NfcReadOptions): Promise<readonly NfcRecord[]>;
}

// The ending vocabulary travels by NAME (the same rule `capacitorBle.ts`
// applies to its radio errors): the detail coordinator keys on `err.name`
// and never reads prose.
export class NfcCancelledError extends Error {
  constructor() {
    super("The rower cancelled the NFC sheet.");
    this.name = "NfcCancelledError";
  }
}
export class NfcTimeoutError extends Error {
  constructor() {
    super("No NFC tag was detected before the system timeout.");
    this.name = "NfcTimeoutError";
  }
}
/** `cause` is the patched controller's own account of why IT ended the
 *  session (spec "Reader-ending seam", option A); absent on a system
 *  invalidation (Core NFC 202/203). */
export class NfcInvalidatedError extends Error {
  override readonly cause?: "multipleTags" | "tagFailure";
  constructor(cause?: "multipleTags" | "tagFailure") {
    super("The NFC reader session was invalidated.");
    this.name = "NfcInvalidatedError";
    if (cause !== undefined) this.cause = cause;
  }
}
export class NfcAbortError extends Error {
  constructor() {
    super("The NFC attempt was aborted.");
    this.name = "NfcAbortError";
  }
}
export class NfcStartError extends Error {
  constructor(raw: string) {
    super(`NFC start failed: ${raw}`);
    this.name = "NfcStartError";
  }
}
export class NfcUnsupportedError extends Error {
  constructor() {
    super("NFC is not available on this surface.");
    this.name = "NfcUnsupportedError";
  }
}

const unsupportedReader: NfcReader = {
  capability: () => Promise.resolve("unsupported"),
  readOne: () => Promise.reject(new NfcUnsupportedError()),
};

function lazyReader(loaded: Promise<NfcReader>): NfcReader {
  return {
    capability: () => loaded.then((r) => r.capability()),
    readOne: (o) => loaded.then((r) => r.readOne(o)),
  };
}

export function resolveNfcReader(): NfcReader {
  if (isNative()) {
    return lazyReader(
      import("../native/nfc").then(({ createNativeNfcReader }) =>
        createNativeNfcReader(),
      ),
    );
  }
  // Both operands are statically `false` in a real deploy's build
  // (`transports/index.ts`'s own header on this exact expression), so the
  // block folds away and `scriptedNfcReader.ts` never ships.
  const fakeGateOpen =
    import.meta.env.DEV || import.meta.env.VITE_ENABLE_FAKE_MONITOR === "1";
  if (fakeGateOpen) {
    const script = window.__nfcScript__;
    if (script) {
      return lazyReader(
        import("../monitor/nfc/scriptedNfcReader").then(
          ({ createScriptedNfcReader }) => createScriptedNfcReader(script),
        ),
      );
    }
  }
  return unsupportedReader;
}
