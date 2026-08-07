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
