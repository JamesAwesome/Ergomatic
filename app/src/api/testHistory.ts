import { api } from "../api";

/** Phase BL PR B (baseline-onboarding spec rev 2, "Recording
 *  (decoupled)", James's ruling): every designated-test session with a
 *  measurable result records to test_history — accept OR decline; the
 *  post-test prompt governs only the baseline write. The save flow fires
 *  this ONCE, right after POST /api/logs returns its 201, BEFORE the
 *  prompt renders — so declining (or killing the app at the prompt)
 *  changes nothing about the record.
 *
 *  Fire-and-forget on purpose: recording must never block or complicate
 *  a save (the same rule the series sacrifice and deviceName drop
 *  follow), so a failure here is silent — the honest residual is that a
 *  network drop in this exact window loses the record. `logId` is the
 *  server-side idempotency key: a double-fire (retry, remount) returns
 *  the original row instead of appending a fabricated delta-0 duplicate,
 *  proven in server/routes/testHistoryDecouple.integration.test.ts. */
export function recordTestResult(input: {
  distance: "2k" | "6k";
  splitSeconds: number;
  logId: string;
}): void {
  void api("/api/test-history", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  }).catch(() => {});
}
