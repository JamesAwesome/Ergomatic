-- Warmup-setting design (2026-08-09, §6, adversarial B4): `wu` leaves the
-- `Step` authoring union. No read path revalidates already-stored steps, so
-- any workout row written before this migration may still carry `{"k":
-- "wu", "minutes": N}` entries, which would hit an unhandled step kind the
-- moment a client fetches it against the new bundle. This migration runs at
-- boot, before the API serves a single request (spec ordering requirement),
-- so no client can ever observe a stored `wu` step again.
--
-- The containment operator and this exact statement shape were verified
-- live against postgres:18.4 before pinning (not assumed from the plan's
-- sketch):
--   * `steps @> '[{"k":"wu"}]'::jsonb` DOES partial-object-match: an array
--     element with EXTRA keys beyond "k" (e.g. the real `{"k":"wu",
--     "minutes":5}` shape) still satisfies containment against the bare
--     `{"k":"wu"}` probe. Confirmed true/false/true across a matching row,
--     a non-matching row, and a mixed-element row.
--   * A nested `"k":"wu"` buried inside another element's own field (not a
--     top-level array member) does NOT match — containment is scoped to
--     top-level array elements, not the whole document. Confirmed with a
--     `{"k":"w", ..., "nested": {"k":"wu"}}` row: zero rows updated.
--   * Re-running the UPDATE against already-stripped rows updates zero
--     rows (idempotent): the WHERE clause's containment check is false
--     once no top-level wu element remains.
--   * `WITH ORDINALITY` + `ORDER BY ordinality` inside the rebuild keeps
--     non-wu elements byte-identical AND in their original order,
--     including workouts with more than one `wu` element — confirmed
--     against a 5-element array with two interior `wu` entries.
--   * A workout whose ONLY step was `wu` rebuilds to `steps = '[]'`, which
--     satisfies the `steps` column's NOT NULL constraint; nothing in this
--     phase's scope revalidates the shape of existing rows either way.
UPDATE "workouts" SET "steps" = (
  SELECT COALESCE(jsonb_agg(s.value ORDER BY s.ordinality), '[]'::jsonb)
  FROM jsonb_array_elements("steps") WITH ORDINALITY AS s(value, ordinality)
  WHERE s.value ->> 'k' <> 'wu'
) WHERE "steps" @> '[{"k":"wu"}]'::jsonb;
