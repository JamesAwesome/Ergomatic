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

// Fix round 2 (task-2-report.md): `isUniqueViolation` alone says "SOME
// unique constraint on this statement was violated" — it cannot say WHICH.
// A statement touching more than one unique index (e.g. an INSERT that
// could conflict on either a table's primary key or a separate UNIQUE
// column) needs the constraint's own name to map a 23505 to the RIGHT
// typed error rather than an invariant a future edit could silently break.
// node-postgres's `DatabaseError` (the class the driver throws for a
// backend ErrorResponse, thrown/wrapped exactly as `pgCode`'s own comment
// describes) carries the failing constraint's name as a plain field:
// `constraint: string | undefined;` —
// node_modules/pg-protocol/dist/messages.d.ts:49 (pg-protocol@1.16.0, the
// package pg's driver re-exports this class from). Confirmed against a
// real violation during Task 2's mutation testing, where the serialized
// error carried `constraint: 'concept2_links_c2_user_id_unique'` verbatim.
export function pgConstraint(err: unknown): string | undefined {
  if (typeof err !== "object" || err === null) return undefined;
  const constraint = (err as { constraint?: string }).constraint;
  if (constraint) return constraint;
  const cause = (err as { cause?: unknown }).cause;
  return pgConstraint(cause);
}
