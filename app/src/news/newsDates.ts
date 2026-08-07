// "WED 5 AUG" — the masthead's own format (design 2a).
export function mastheadDate(d: Date): string {
  return d
    .toLocaleDateString("en-GB", {
      weekday: "short",
      day: "numeric",
      month: "short",
    })
    .replaceAll(",", "")
    .toUpperCase();
}

// "4 AUG" from ISO "2026-08-04" (WHAT'S NEW's version line).
export function releaseDate(iso: string): string {
  const [y, m, day] = iso.split("-").map(Number);
  return new Date(Date.UTC(y!, m! - 1, day!))
    .toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      timeZone: "UTC",
    })
    .toUpperCase();
}

// "JUL 2026" from ISO "2026-07-01" (the reader's own `updatedAt` meta line).
// UTC-anchored parse+format for the same reason releaseDate is: a naive
// local-timezone format of a UTC-midnight ISO date can print the wrong
// month in any timezone west of UTC.
export function updatedLabel(iso: string): string {
  const [y, m, day] = iso.split("-").map(Number);
  return new Date(Date.UTC(y!, m! - 1, day!))
    .toLocaleDateString("en-GB", {
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    })
    .toUpperCase();
}
