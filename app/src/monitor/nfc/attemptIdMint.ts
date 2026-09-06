// Phase NF: the attempt-ID mint behind the shared connection-entry owner
// (`ConnectAction.tsx`). Its own module so the component file exports only
// components (react-refresh) and so the routed Scan-NFC test can inject a
// fixed literal and assert it, unchanged, at the transport seam.
import type { ConnectionAttemptId } from "../../../domain/monitor/types.js";

let mint: () => ConnectionAttemptId = () => crypto.randomUUID();

/** `crypto.randomUUID()` — the same generator the session id uses. */
export function mintAttemptId(): ConnectionAttemptId {
  return mint();
}

export function setAttemptIdMintForTests(
  override: (() => ConnectionAttemptId) | null,
): void {
  mint = override ?? (() => crypto.randomUUID());
}
