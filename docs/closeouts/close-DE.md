# close-phase DE — worklist

Frozen at `708bfa8d` (main, 2026-09-19). Span: ROADMAP.md 344..481, terminator
`## Phase PS — career stats on the You tab`. Span text: `close-DE.span.txt`.

Enumeration: **3 bullets in span, all ticked checkboxes, zero open.** The stop
rule is satisfied at invocation, which is why this phase did not get a
close-out session of its own. Pass 2 returns one out-of-span mention — Wave C's
type-words row noting that "Phase DE replaced difficulty with effort" — which
is descriptive.

**Deterministic:** span, pass 1, pass 2, DONE-against-tree, CI gate, anchor diff.
**Heuristic:** pass 3 (recall bounded by a word list I invented) — and on this
freeze it was run only where a row named a defect that could live elsewhere.
**Heuristic with a durable counter:** the pull-in cap. No pull-ins.

Key is the SLUG. Line numbers are "as of 708bfa8d" convenience only.

**Closed together with Phases MT and PS as ONE doc-class PR (James, 2026-09-19):** one
antagonist exit pass and one PM close gate cover all three. No BUILD row, no
DECIDE row and no tag hand-back remain in any of them — every deliverable is
already in a released tag.

## Rows

```
SLUG                 | DISP | title (first clause)                     | status | receipt
pr1-remove-difficulty| DONE | PR 1 — remove difficulty                 | closed | #309 798216a9, v0.39.0
pr2-pain-to-effort   | DONE | PR 2 — rename pain -> effort             | closed | #310 2472133a, v0.39.0 (migration 0024)
pr3-drop-compat      | DONE | PR 3 — drop compat                       | closed | #400 13adce4b, v0.46.0 (migration 0029)
0029-drops-on-prod   | DONE | whether 0029's DROPs landed on production| closed | INFERRED from boot order (migrate() is a top-level await before listen; that deploy passed) and SETTLED by James 2026-09-19: custom workouts are created on production "all the time", and workouts.difficulty was NOT NULL with no default
releasing-0029-tag   | DONE | RELEASING.md said 0029 was untagged      | closed | #481; git tag --contains 13adce4b -> v0.46.0
```

## Exit criteria (ROADMAP's **Exit** paragraph; spec §6)

1. The two phase-close greps — pasted below. MET.
2. e2e and screenshots green — rests on CI at v0.39.0 and v0.46.0. INFERRED.
3. The by-hand stale-build check recorded in PR 2's body — #310's body carries
   "Stale-build check (spec §6.3), run by hand 2026-09-05" with its transcript. MET.
4. Release note in rower words — `releaseNotes.ts`, v0.39.0. MET.

### The greps, run at `708bfa8d`

```
$ grep -rni 'pain' domain server src e2e scripts --exclude='*.test.*' | grep -viE 'paint'   # per-file counts
   7 src/news/content/releaseNotes.ts
   3 src/news/Reader.tsx
   3 server/db/schema.ts
   3 e2e/news.spec.ts
   2 domain/bulk.ts
   1 src/news/content/bodies/effortScale.tsx
   1 src/news/content/articles.tsx
   1 src/library/libraryFilters.ts
   1 server/routes/data.ts
   1 domain/types.ts

$ ls server/routes/effortCompat.ts
ls: server/routes/effortCompat.ts: No such file or directory

$ grep -rli 'difficult' server --exclude='*.test.*' | wc -l
       0

$ grep -rhoE '\b[a-zA-Z]*[eE]ffort[A-Za-z]*\b' domain src --exclude='*.test.*' | sort -u   # the pace-word family command, spec §2
bestEffort collapseEffort effort Effort EffortBar effortCaption effortful effortLevels EffortPicker efforts effortScale EffortScaleBody effortShare effortStr effortWord expectedEffort isEffortLevel onEffort onEffortChange refEffort setEffort toggleEffortLevel 
```

Read against criterion 1: every `pain` hit is a release note, the `pain-scale`
slug redirect (`Reader.tsx`, `articles.tsx`, `news.spec.ts`), the legacy bulk
header kept on purpose (`domain/bulk.ts`), a bodily "pain" in the effort
article, or a comment naming the rename. `effortCompat.ts` is deleted and
`difficult` has zero hits in `server/`. **One honest miss on "`effort` means
one thing":** `bestEffort` in `src/monitor/useMonitorSession.ts` is the English
idiom for a fire-and-forget helper, not the 1–5 figure. Every other name in the
family is the figure. Noted, not fixed — a rename under `app/src/` is outside a
doc-class close, and the helper is unambiguous in context.
