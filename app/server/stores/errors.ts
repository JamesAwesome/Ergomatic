export class StoreConflictError extends Error {
  constructor(message = "conflict") {
    super(message);
    this.name = "StoreConflictError";
  }
}

// Postgres unique_violation. See https://www.postgresql.org/docs/current/errcodes-appendix.html
const UNIQUE_VIOLATION = "23505";

function pgCode(err: unknown): string | undefined {
  if (typeof err !== "object" || err === null) return undefined;
  const code = (err as { code?: string }).code;
  if (code) return code;
  // drizzle-orm wraps the driver error in a DrizzleQueryError; the pg error
  // with the actual SQLSTATE code lives on `.cause`.
  const cause = (err as { cause?: unknown }).cause;
  return pgCode(cause);
}

export function isUniqueViolation(err: unknown): boolean {
  return pgCode(err) === UNIQUE_VIOLATION;
}
