// Phase NF: the success haptic behind `✓ PM5 found`. Best-effort by
// contract (design spec 2026-09-03, "User-visible states and copy"): a
// rejection is instrumented by the caller and never delays or fails
// Bluetooth discovery; the visual state is the confirmation. Platform
// conditional lives here, per the native-first policy; the native arm's
// `@capacitor/haptics` import is reached by dynamic `import()` so it never
// lands in the web bundle (`scripts/dist-grep.sh`'s `Haptics` needle).

import { isNative } from "../platform";

export async function successHaptic(): Promise<void> {
  if (!isNative()) return;
  const { nativeSuccessHaptic } = await import("../native/haptics");
  await nativeSuccessHaptic();
}
