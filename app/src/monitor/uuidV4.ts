// ONE UUID v4 generator for every identity this layer mints (the logical
// session id, the connection attempt id). `crypto.randomUUID()` where it
// exists; otherwise a hand-rolled v4 from `getRandomValues()`. The fallback
// is not decoration: `IPHONEOS_DEPLOYMENT_TARGET` is 15.0 and
// `crypto.randomUUID()` arrives in WKWebView at 15.4 — PR #258 round 4's P1
// was an unconditional call throwing synchronously inside a click handler
// (`useMonitorSession.ts`'s `defaultSessionId` doc comment carries the
// account). Hardening lens 2 found the Phase NF attempt mint had repeated
// the unconditional call; both now share this function.
export function newUuidV4(): string {
  const c = globalThis.crypto;
  if (typeof c?.randomUUID === "function") return c.randomUUID();
  const bytes = c.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0"));
  return (
    `${hex[0]}${hex[1]}${hex[2]}${hex[3]}-${hex[4]}${hex[5]}-` +
    `${hex[6]}${hex[7]}-${hex[8]}${hex[9]}-` +
    `${hex[10]}${hex[11]}${hex[12]}${hex[13]}${hex[14]}${hex[15]}`
  );
}
