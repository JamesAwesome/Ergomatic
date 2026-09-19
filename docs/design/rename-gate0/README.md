# Rename your account · rendered Gate 0

**Why this exists.** A rower who signs in with Apple and is not offered the
name screen lands as `"Rower"` — `providers.ts:131`, and the
`?? email ?? "Rower"` chain in `google.ts:88` and `nativeVerify.ts:24`. Apple
does not show that consent screen twice, so signing in again cannot fix it.
Nothing in the product can change a name, so it is permanent.

That permanence is the whole reason the attempt-token work was worth doing at
the expensive end: a failed Apple revoke is only a real defect because the
rower it strands cannot rename themselves afterwards. James filed this row on
2026-09-19 so the cheap fix sat on the slate beside the expensive one rather
than behind it.

Open `index.html`; the left rail selects every board and both orientations.
No control here calls anything — the markup is a static copy of
`src/you/AccountScreen.tsx` and `src/you/SignInMethods.tsx` as they ship at
`708bfa8d`, with one proposed section added.

## The decision behind the pixels, already taken

**James, this session: provider names stop syncing entirely.** Three paths
write `users.name` today and they disagree — `legacyGoogle`
(`attempts.ts:1028`) and `signInWithClaims` → `updateProfile`
(`signin.ts:35`) overwrite it from the provider on **every** sign-in, while
the front door's `accept()` (`attempts.ts:730`) deliberately leaves it alone.
A rename added on top of that would survive an Apple sign-in and be silently
reverted by a Google one.

Rather than add a column to make the rename authoritative, the two overwriting
statements stop writing `name`. The cost, which James accepted explicitly: a
rower who changes their name at Google no longer sees it flow through.

**No migration, no backfill, no new state.** `users.name` is `notNull` and
already populated, so existing rowers see nothing change until they rename.
`users.updateProfile(id, name)` already exists and is live, so the write side
needs a route, not a store method.

## The two options

Both put one `NAME` section on `/you/account`. They differ only in where.

- **A — above `SIGN-IN METHODS`.** Reads identity → how you get in → how you
  leave. The field is the first thing under the title.
- **B — below `SIGN-IN METHODS`, above the delete box.** Nothing that exists
  today moves.

### Measured, not eyeballed (`renders/layout-audit.json`)

| | today | A | B |
|---|---|---|---|
| `NAME` field top, 390×844 | — | **124 px** | **270 px** |
| `SIGN-IN METHODS` top | 98 px | 189 px | 98 px |
| Delete box top | 252 px | 343 px | 343 px |
| Portrait scrolls? | no | **no** | **no** |
| Landscape scrolls? | **yes** | yes | yes |

Two things that table settles:

- **Neither option makes portrait scroll.** The screen has room for a third
  section at 390×844.
- **Landscape already scrolled before this change** (`06-today-landscape`,
  `scrolls: true`, with no name field present). A is not introducing that and
  the pack does not flag it, for the same reason the account-submenu pack did
  not: this is a scrolling subpage and always has been.

Hit targets: the input renders **44 px** tall and `Save` **62 × 44** — both
clear the repo's 44 px floor. The input is 272 px wide in portrait, 364 in
landscape.

## Contrast — every pairing computed

`node contrast.mjs` → `contrast.json`. **Twelve pairings, all pass.**

| pairing | ratio | needs |
|---|---|---|
| Typed name on the field | **17.11:1** | 4.5 |
| Field border on the page | **15.41:1** | 3 |
| Focused field border (accent) | **5.35:1** | 3 |
| `NAME` heading | **6.69:1** | 4.5 |
| Save label / border, enabled | **15.41:1** | 4.5 / 3 |
| Save label / border, disabled | **4.76:1** | 4.5 / 3 |
| Helper note | **6.69:1** | 4.5 |
| Refusal note | **5.35:1** | 4.5 |
| `SAVED` | **5.92:1** | 4.5 |
| Focus ring | **15.41:1** | 3 |

**This change introduces no new colour and no new field treatment.** The input
is `.baseline-field`'s own shape — `--surface` inside a 1 px `--ink` border,
focus swapping that border to `--accent` with a 1 px inset outline so nothing
shifts.

**The first draft of that table failed three rows, and the pack was wrong
rather than the app:** the mock had invented a `--rule-2` border at **1.26:1**
where the house field uses `--ink` at **15.41:1**. Recorded because a contrast
table that never failed anything is not evidence that it ran (RF6).

## States rendered (`05-states.png`, option A)

`idle` · `editing` (dirty, focused, Save enabled) · `saved` · `refused`
(empty name, Save still offered, note in `--accent`).

`Save` is disabled until the value differs from what is stored, so the
control cannot post a no-op.

## What this pack does NOT decide

- **The route and the write.** A `PATCH` on the existing account surface,
  reusing `users.updateProfile`. No new table, no new column.
- **Length and character limits.** The renders show a refusal for an empty
  name because empty is the one case the column forbids (`notNull`). Any
  other limit is a product call nobody has asked for yet.
- **Whether `SAVED` persists or fades.** Rendered as a state, not timed.

## Reproduce

```
node docs/design/rename-gate0/contrast.mjs   # 12 pairings, prints PASS/FAIL
node docs/design/rename-gate0/render.mjs     # 8 renders + layout-audit.json
```
