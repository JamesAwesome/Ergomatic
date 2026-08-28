# The intensity vocabulary: O2 / AT / TR / AN

**Extracted 2026-08-28** from `ROADMAP.md`'s Phase PROD section (lines
1751-1861 of the pre-rebalance file, main `39e9430`), where it sat above the
phase's own status line. It is research, not a plan: it exists so the design
pass does not re-derive it, and so the REJECTED options stay rejected for their
actual reasons.

**The work it feeds** is Wave C's type-disclosure item. Sources are cited
because two claims in the originating thread were stated unsourced and had to
be retracted (recurring failure 16).

---

### What the research settled about O2 / AT / TR / AN (2026-08-26)

Recorded here so the design pass this phase owes does not re-derive it, and
so the REJECTED options stay rejected for their actual reasons. Sources are
cited because two claims in this thread were stated unsourced and had to be
retracted (recurring failure 16).

**A rename was investigated and rejected — but NOT on the cost grounds first
argued.** The database is cheap: PostgreSQL `ALTER TYPE ... RENAME VALUE` is
catalog-only, no table rewrite, ordering preserved
(<https://www.postgresql.org/docs/current/sql-altertype.html>), so
`workouts.type` is four DDL lines and `session_logs.workout_type` (plain
`text`, `schema.ts:147`, NOT the pgEnum at `:46`) is one UPDATE. The real
cost is ~1230 literal occurrences across 88 files, five e2e specs, 84
captures — and, decisively, **eight documented invariants that stop being
READABLE**: the strict `O2 > AT > TR > AN` plan pyramid (`plans.test.ts:49`),
the `["AN","TR"]`-speed vs `["O2","AT"]`-endurance partition (`:71-79`), the
deload rule, the monotone spm/pain authoring bands
(`library.test.ts:65-79`), `patterns.json`'s quota grid, and the pinned
app-wide display order. Neutral names (`Type1..Type4`) preserve every one of
them MECHANICALLY and destroy their legibility. **"Does a rename break the
code" and "does it break the audit" are different questions; for a taxonomy
the second is the expensive one.**

**The maintainability argument for genericising was measured and does not
hold.** `git log -L1,1:app/domain/types.ts` returns two commits in the
repo's life: the file's creation, and a prettier quote change. **The members
have never changed.** The only nearby taxonomy event went the other way —
`PlanCode`'s `"TEST"` member was RETIRED (ROADMAP:1445). And the decoupling
the instinct wants already exists: `typeWords.ts` is the display registry;
`TypeBadge` simply chooses to render the code instead of the word.

**Why not heart-rate zones 1-5,** the genuinely wider vocabulary (Apple ships
zones with no names at all; number-primary products cover ~420M accounts):
this app has **no heart rate** (`judge.ts:44-47` says so), so adopting an
HR-defined ladder for bands actually defined by pace offset and rest ratio
asserts a concept the system does not have — the same shape as the PAUSED
state the PM5 does not have. It is also not a clean relabel: our four map to
five zones with O2 spanning two of them and AN having no HR zone at all. And
"Zone 2" is itself contested — in the 3-zone model it sits BETWEEN the
thresholds, in the 5-zone model just BELOW the first, so the same label names
non-overlapping intensities (Sitko et al., *IJSPP* 2025;20(11):1614-1617,
a 14-expert panel convened to settle one label).

**Why not plain words alone** (Easy / Steady / Hard / Sprint): they were
MEASURED failing. Given the descriptors the WHO and NHS publish, 129
participants self-selected 58.7% of max HR for "moderate" against a 64-76%
guideline, and 52% asked to walk at a health-beneficial pace walked at light
effort (Canning et al., *PLoS ONE* 2014;9(5):e97927); a second study (n=498)
found numeric ratings separated intensity levels while verbal cues did not
(Kim et al., *JMIR Public Health Surveill* 2020;6(2):e16303). They would also
**collide with the app's own EASY / MEDIUM / HARD difficulty axis**, printed
on the same rows — a card would read "Sprint · EASY".

**The one durable finding under all of it:** ordered labels communicate RANK
reliably and MAGNITUDE unreliably (Dawes et al., *Arch Phys Med Rehabil*
2005;86(5):912-916 — every group placed Borg's anchor words in the right
ORDER, and disagreed on their spacing). Which is why the pyramid figure
teaches in two seconds: it ranks by POSITION, not by hue.

**Where the vocabulary actually comes from, cited.** UT2/UT1/AT/TR/AN is
Concept2 UK's own ladder, from the *Indoor Rowing Training Guide* (O'Neill,
Atkinson & Atkinson, "produced by Concept II Ltd"; TR expands to "Oxygen
Transportation") — copy at
<https://trondhjems-roklub.no/files/c2_training_v1.pdf>. **No current
Concept2 consumer product uses it:** their heart-rate article ships Zone 1-5
(<https://www.concept2.com/blog/heart-rate-training-with-your-concept2-erg>),
their Workout of the Day explicitly refuses zones for three defined plain
words — "Hard" / "Sustainable" / "Light pressure"
(<https://www.concept2.com/training/wod>) — their training plans are labelled
by goal only, and their Logbook API carries no intensity field at all beyond
a numbered `heart_rate_zone` 0-5
(<https://log.concept2.com/developers/documentation/>). The ladder survives
in club rowing (British Rowing's seven-band matrix, which bolts an RPE column
onto the codes precisely because the plain words were not landing between
coach and rower) and in ErgZone. **A peer teardown of seven connected-rowing
products (Hydrow, Peloton Row, Aviron, Ergatta, CityRow, Asensei, Kinomap)
found ZERO shipping a two-letter intensity code, and zero shipping this
ladder.** Their three strategies are: collapse intensity into the type name
(Hydrow's Breathe / Sweat / Drive — "Sweat" is anaerobic threshold with the
jargon stripped), COMPUTE it and never name it (Ergatta's auto-recalibrating
intensity, Peloton Row's "Harder than your usual"), or omit it entirely
(Aviron). Where a code does survive, it is glossed at every point of use, not
in a help article (Ergatta's Meteor / Echo / Pulse). Note the explanation
cost this implies: **Hydrow ships a YouTube video per label for three plain
English verbs.** Nobody found three or four words self-explanatory.

**Live defects the design pass found.** Three real bugs, filed as their own
items under "Triggered follow-ons" (TL-1 misaligned descriptor, TL-2 two
plain-word sets, TL-3 the pyramid's sub-floor text) rather than recorded only
here. **Two of the three are independently fixable and should NOT wait for
this phase.** They cross-reference this item; this item cross-references them.

**Rejected with reasons, so it is not re-proposed: an intensity COLOUR
ramp.** A warm ramp needs a red at the hot end and lands back on `--accent`,
which is the exact bug that made `--type-tr` an alias of `--ink`
(`tokens.css:113-131`, DEVIATIONS row 59). The app already carries three
distinct reds (`--accent`, `--judge-slower`, `--pain-ramp-5`), and
**`--pain-ramp-3` #8a5f18 is byte-identical to `--type-at`**, a collision
that has already been misread as a type once (`ClassificationCard.tsx:47-51`).
The "black reads as disabled" complaint is real but is a convention read, not
a contrast failure: TR measures **17.11:1**, the best of the four. The word
fixes the read; no disabled control says HARD INTERVALS.

**Copy note, separable and NOT decided:** the rank breaks at position four.
`LOW & SLOW` -> `COMFORTABLY HARD` -> `HARD INTERVALS` climbs cleanly;
`SPEED WORK` reads as a different CATEGORY, and is itself coach jargon.
`ALL-OUT SPRINTS` would preserve the ascent and still fit every layout
measured. A copy change with its own gate; do not fold it in silently.
And never reuse `EASY` or `HARD` as a type word — that is the difficulty
vocabulary, printed on the same rows.
