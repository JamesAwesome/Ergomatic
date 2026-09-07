/**
 * The PM5's verification code, from the first 8 bytes of 0x003F's payload:
 * two little-endian u32 words, each rendered as uppercase hex `XXXX-XXXX` —
 * the rendering the PM5's own Verification screen uses (PRIMARY,
 * photographed on walk-2026-08-23; `FromTheLog.test.tsx` derives
 * `AF99-4706 C021-B054` by hand from the exit-7 walk's bytes). Two shapes
 * of the same two words:
 *  - `displayVerificationCode` — the screen's form, a space between words.
 *  - `wireVerificationCode` — the form Concept2's results API accepted
 *    live (`docs/superpowers/research/2026-09-05-c2-verification-measurement.md`:
 *    `verification_code: D9BD-F964-32E2-7F18` → 201, `verified: true`).
 * `null` when fewer than 8 bytes are present, or when any of the eight is
 * not a whole byte (0..255) — never a padded guess and never a plausible
 * wrong code. The write door bands the stored array the same way
 * (`server/routes/data.ts`); this guard protects the Log screen's display
 * and the upload from a value that got past it (review L4).
 */
export function verificationWords(
  bytes: readonly number[],
): [string, string] | null {
  if (bytes.length < 8) return null;
  for (let i = 0; i < 8; i += 1) {
    const b = bytes[i]!;
    if (!Number.isInteger(b) || b < 0 || b > 255) return null;
  }
  const word = (o: number): string =>
    (
      ((bytes[o + 3]! << 24) |
        (bytes[o + 2]! << 16) |
        (bytes[o + 1]! << 8) |
        bytes[o]!) >>>
      0
    )
      .toString(16)
      .toUpperCase()
      .padStart(8, "0");
  const dash = (w: string): string => `${w.slice(0, 4)}-${w.slice(4)}`;
  return [dash(word(0)), dash(word(4))];
}

export function displayVerificationCode(
  bytes: readonly number[],
): string | null {
  const words = verificationWords(bytes);
  return words === null ? null : `${words[0]} ${words[1]}`;
}

export function wireVerificationCode(bytes: readonly number[]): string | null {
  const words = verificationWords(bytes);
  return words === null ? null : `${words[0]}-${words[1]}`;
}
