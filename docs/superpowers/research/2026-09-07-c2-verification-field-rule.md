# When does Concept2 offer the Verification Code field?

**PRIMARY, measured live 2026-09-07** against `log-dev.concept2.com`, account
2211, by driving a real logged-in Chromium with Playwright. James logged in; the
script read every page. Twenty-one purpose-built rows, all deleted afterwards
(the log was confirmed back to its eighteen real rows).

## The rule

On the Edit Workout form, the `verification_code` input is **always present in
the DOM** and its **visibility** carries the rule:

> Visible if and only if the row's **overall distance** is one of
> `100, 500, 1000, 2000, 5000, 6000, 10000, 21097, 42195, 100000` metres,
> **or** its **overall time** is one of `1:00, 4:00, 30:00, 60:00`.
> The match is exact — to the metre and to the tenth of a second.

"Overall" means work plus rest, which is what the form displays. Established by
a crossed experiment earlier the same day, confirmed by James by eye: a row with
work 1820 m + 180 m rest (overall 2000) shows the field, and a row with work
2000 m + 180 m rest (overall 2180) does not. Work alone explains neither.

## The measurements

Desktop and iPhone 14 Pro viewports gave **identical** results on every row, so
the rule is not responsive.

| Case | Overall | Field |
| --- | --- | --- |
| Controls, both observed by James by eye first | 6233 m / 30:00 · 200 m | visible · hidden |
| Every listed distance | 100, 500, 1000, 2000, 5000, 6000, 10000, 21097, 42195, 100000 m | **all visible** |
| Every listed time | 1:00, 4:00, 30:00, 60:00 | **all visible** |
| Distance boundary | 1999 m, 2001 m | **both hidden** |
| Time boundary | 29:59.9, 30:00.1 | **both hidden** |
| Off the list | 3000 m, 750 m, 45:00 | **all hidden** |

Zero disagreement with Concept2's own published list
(`log.concept2.com/help`, quoted in the parity spec) and zero disagreement with
the two rows James had already photographed.

## Two side findings

- **A row that is already verified renders no editable form at all.** Row 86028
  (`verified: true`) returns a page with no `distance` input. Any UI reasoning
  about "go and edit it on Concept2" has to account for that.
- **The API ignores this rule entirely.** Row 86049 is 200 m, a figure that
  never shows the field, and it is `verified: true` because a code was posted
  for it through the API on 2026-09-07. The website's restriction is presentational.

## The method note worth keeping

The first detector asked whether the input was **present**. It is always
present, so the detector could never go red — RF21, in an instrument rather than
a test. It was caught immediately because the run started with two controls
whose answers James had already established with his own eyes, and the run
aborts rather than reporting when a control disagrees. **Any scripted oracle for
a UI claim starts with a case whose answer is already known by other means.**
Switching from `count() > 0` to `isVisible()` made every row agree.
