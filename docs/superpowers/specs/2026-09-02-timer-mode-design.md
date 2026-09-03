# Timer mode, both ways up + three free-row copy notes — design

**Status: Gate 0 PASSED (James, 2026-09-02, rev 1c: "Approved"). Spec rev 1.
Antagonist: SKIPPED, said aloud — no new mechanism, no wire semantics, no
stored shape; CSS and copy on shipped screens. PM: none (pure UI).**
Handoff: `docs/design/handoffs/2026-09-02-timer-mode/` (seven boards, each
an edit of a phone-size capture in `mechanical-reference/`).

## What and why

On the phone (build 823) the Timer's END control is plain header text in
portrait and an accent box in landscape, and both orientations leave a
dead band at the bottom — portrait because the ◀ ▶ row is pinned to the
viewport's bottom edge with `margin-top: auto`, landscape because the
layout's rows do not grow. James: "Timer mode is really fucked up." The
free row exposed it (one phase, nothing to fill the middle), but the
defects are the shipped programmed timer's own, so the fix is for both.
Three free-row copy notes batched at #268's and #272's PM gates ride
along: the door's band, a time-only History row, and the no-plan button.

## Rulings

1. One END: the accent-outlined 44×44 box (the connected surface's own
   End, which landscape already mirrors) in BOTH orientations.
2. No dead band: portrait's ◀ ▶ row sits under Pause as one control
   group; landscape's middle row grows to fill and its controls sit on
   the bottom edge.
3. The door band reads exactly: `Start a free row session.` (James's
   line, rev 1c).
4. A History row with neither an average nor a distance prints
   `TIME m:ss` under its name (the detail's own label); every other row
   unchanged.
5. With no plan the lone save button reads `Save` on BOTH log doors
   (`PostWorkoutSummary` and `JustRowLog`); `Save without logging`
   survives only beneath `Log against plan`.

## Mechanism (each names its shipped seam)

1. **END** (`index.css:4095` `.timer-end` base rule; landscape override at
   ~:4836): the landscape box rule becomes the base rule; the landscape
   block keeps only what differs (nothing, or the gutter placement). The
   portrait header (`Timer.tsx:799`) keeps its markup; its grid gives the
   END cell 44 px.
2. **Portrait gap** (`index.css:4718` `.timer-controls { margin-top: auto }`):
   drop the auto margin; the arrows row follows Pause with the shipped
   8 px gap. The `.timer-screen` min-height formula (`:4136-4141`) stays —
   the screen still fills the viewport; only the controls stop clinging
   to its bottom.
3. **Landscape gap** (the landscape `.timer-screen` grid, ~:4836 block):
   `grid-template-rows: auto 1fr auto` with the hero row centred
   (`align-items: center`) and the controls row last; the gutter's END
   stays bottom-aligned. Free-row and programmed share the rule.
4. **Door band** (`JustRow.tsx:164`): the string.
5. **History TIME line** (`LogRow.tsx:179` `heroSnippet`): when BOTH
   `avgSplitSeconds` and `distanceMeters` are undefined and the row has a
   `timeSeconds`, return `TIME ${fmtDuration(timeSeconds / 60)}`; otherwise
   unchanged. `RecentLog` already carries `timeSeconds` (verify; add to the
   list projection if not — additive).
6. **No-plan label** (`PostWorkoutSummary.tsx:629`, `JustRowLog.tsx:438`
   via the shared `SaveStack`): when `plan === null` the lone lead button's
   text is `Save`; its handler and class are unchanged. Every test and
   e2e pin that presses `Save without logging` in a NO-PLAN state moves to
   `Save`; pins in a plan state stay.

## Exit criteria

1. Structural (served stylesheet, comment-stripped): exactly one
   `.timer-end` rule set applies in both orientations with the box
   properties (width/height 44, accent border); `.timer-controls` carries
   no `margin-top: auto`; the landscape `.timer-screen` grid declares
   `auto 1fr auto`.
2. Geometry (`e2e/design.spec.ts`, `boundingBox`, at 393×852 AND 852×393,
   programmed AND free row): END is 44×44 in both; portrait: the arrows
   row's top is within 12 px of Pause's bottom; landscape: the controls
   row's bottom is within 16 px of the viewport bottom and the face's
   vertical centre is within 24 px of the hero row's centre. Mutations
   named: restore `margin-top: auto` → portrait red; restore `auto auto
   auto` rows → landscape red; restore the transparent END → both red.
3. Copy: the band string verbatim; `TIME 0:04` under a time-only History
   row and NO such line on a row with an average or distance; `Save`
   alone with no plan on both doors, `Save without logging` beneath
   `Log against plan` with one — all in client tests and one e2e each.
4. Captures: `timer` and `timer-landscape` re-taken (they change on
   purpose), plus `justrow-timer`/`justrow-timer-landscape`, `justrow-door`,
   `justrow-log-timer` (button), `justrow-history-chip` (TIME line);
   opened and compared to the boards.

## PR shape

One PR, not fast path (six product files: `index.css`, `Timer.tsx` if the
header grid needs it, `JustRow.tsx`, `LogRow.tsx`, `PostWorkoutSummary.tsx`,
`JustRowLog.tsx`/`SaveStack`). James reviews. ROADMAP's Timer-mode row and
the batched copy-notes row close with it.
