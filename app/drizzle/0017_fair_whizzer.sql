-- Wave F PR 1 (lifecycle design spec §1, "The migration, owned"): the sixth
-- ended_by value, additive only. No default, no backfill, no column
-- change — every existing row's ended_by is untouched; a legacy row that
-- predates this task still reads back exactly as it always has. Placed
-- BEFORE 'interrupted' only because that is where drizzle-kit ordered it
-- in server/db/schema.ts's endedByEnum array; Postgres ADD VALUE position
-- has no semantic meaning for this column (no ordering comparison is ever
-- made on it).
ALTER TYPE "public"."ended_by" ADD VALUE 'program-dropped' BEFORE 'interrupted';