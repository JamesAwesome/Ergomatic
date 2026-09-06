// Phase NF: the process-scoped NFC capability cache behind
// `WorkoutDetail`'s probe. Only a RESOLUTION is cached — `"supported"` or
// `"unsupported"` — never a timeout or a rejection (hardening lens 1, F11),
// and never persisted.
import type { NfcCapability } from "../../adapters/nfcReader";

let cached: NfcCapability | null = null;

export function readCachedNfcCapability(): NfcCapability | null {
  return cached;
}

export function cacheNfcCapability(value: NfcCapability): void {
  cached = value;
}

export function resetNfcCapabilityCacheForTests(): void {
  cached = null;
}
