# Evidence for the "say which number this is" design pass

## `2026-09-14-season-axis-clipped.jpg`

James's own phone, 2026-09-14, You → Stats, the SEASON 2027 chart. **The
`1` is missing from both of the top two gridline labels** — they read
`L50,000` and `L00,000` where the values are 150,000 and 100,000. `50,000`
below them, one glyph narrower, renders whole. The season stands at
104,153 m that day, which is what pushed the axis past six glyphs.

**Why it is committed rather than described.** It is the only PRIMARY
evidence that member M8 is live, and the spec's own §1.3 records that our
screenshot suite CANNOT reproduce it: the e2e seed's widest tick is six
glyphs, so the frame lives beyond the data our captures produce. A
measurement in Chromium (probe `6b76f902`) gets as far as "0.4 of a glyph
of clearance at six glyphs, overflow at seven by arithmetic" and no
further. This picture is the rest of the argument, and it is also board 5
of the Gate 0 — the "what it replaces" half, which nothing in the repo can
draw.

The red ring is James's own annotation.

**What it is not.** It is not a capture this repo produced, so it carries a
status bar, a real battery level and real figures. It is a photograph of a
defect, held to the same standard as a hardware walk's own recordings in
`docs/monitor/sessions/`: evidence of what the device did, kept because
nothing we own can re-derive it.
