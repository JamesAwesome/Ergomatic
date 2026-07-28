export function parseAllowlist(raw: string | undefined): Set<string> {
  return new Set(
    (raw ?? '')
      .split(',')
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean),
  )
}

export function isAllowed(allowlist: Set<string>, email: string): boolean {
  return allowlist.has(email.trim().toLowerCase())
}
