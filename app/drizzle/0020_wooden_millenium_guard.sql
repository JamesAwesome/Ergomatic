-- Just Row unconnected (spec `docs/superpowers/specs/2026-09-02-just-row-unconnected-design.md`
-- rev 5, §Mechanism "stored shape (c)", TRIAD): `session_logs.source` —
-- WHICH DOOR a log came through, as a stored fact. `pm5` = the connected
-- door; `timer` = the phone's clock (a Timer-closed SessionRun, or the
-- time-only Just Row); `manual` = `Log it after`. NOT NULL, no default:
-- every writer states it, and the route derives it for an installed build
-- that predates the column (`server/logSource.ts`, dated sunset).
--
-- Three statements, not the one `drizzle-kit` generated (`ADD COLUMN ...
-- NOT NULL` fails outright on any table with rows and no default):
--   1. add the column NULLABLE;
--   2. BACKFILL every existing row with the read side's old inference —
--      `device_name IS NOT NULL` ⇒ 'pm5'; else any step whose
--      `actualSource` is 'stopwatch' ⇒ 'timer'; else 'manual'. This is
--      `src/log/storedSummary.ts`'s deleted `sourceLabel` guess verbatim,
--      so every row that rendered PM5 / TIMER / LOGGED BY HAND before this
--      migration renders the SAME word after it, from a column. It is
--      knowingly wrong about one row (a connected session the app never
--      heard a pull from, saved through the manual door) — the guess was
--      already wrong there, and the column exists so that no future row
--      is. `server/logSource.ts`'s `deriveLogSource` is the same rule in
--      TS; `routes/source.integration.test.ts` runs THIS file's CASE
--      against five rows and asserts the two agree.
--      `steps` is `jsonb` (`0001_tan_thunderball`:43), so
--      `jsonb_array_elements` needs no cast; `->>` reads the text value.
--   3. SET NOT NULL, which now holds for every row.
-- Not `DEFAULT 'manual'`: a default is a fourth, silent writer, and the
-- spec's whole point is that absence is never read as a value.
--
-- Index 0020, generated off `jr-unconnected` after 0019 merged in #249's
-- wake; `gh pr list` showed no other open PR carrying a drizzle file
-- (#265 jr-close, #267 wave-f-pr3) at generation — re-check before merge.
CREATE TYPE "public"."log_source" AS ENUM('pm5', 'timer', 'manual');--> statement-breakpoint
ALTER TABLE "session_logs" ADD COLUMN "source" "log_source";--> statement-breakpoint
UPDATE "session_logs" SET "source" = CASE
  WHEN "device_name" IS NOT NULL THEN 'pm5'::"log_source"
  WHEN EXISTS (
    SELECT 1 FROM jsonb_array_elements("steps") AS s
    WHERE s->>'actualSource' = 'stopwatch'
  ) THEN 'timer'::"log_source"
  ELSE 'manual'::"log_source"
END;--> statement-breakpoint
ALTER TABLE "session_logs" ALTER COLUMN "source" SET NOT NULL;
