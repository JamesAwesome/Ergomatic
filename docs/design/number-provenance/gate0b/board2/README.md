# Gate 0B — board 2 (the trace chart's x axis: M3, M6, M9)

**Read `BOARD2.md`.** This file says how the frames were made and what is
deliberately not committed.

Rendered 2026-09-18 in Chromium against this worktree's compose stack, at
390x844 portrait and 844x390 landscape.

## Nothing here changes product code, and that is on purpose

Board 1's harness (`app/e2e/gate0b.spec.ts`) needed no product change, so it
was committed and later deleted by the PR that implemented the ruling. This
board's four axis treatments do not exist on `main` — drawing them takes a
prototype inside `traceModel.ts` and `TraceChart.tsx`, and a dev-only seam
reaching `main` is what `pnpm dist:grep` exists to prevent.

So the whole prototype lives in **`board2-variants.patch`** instead, six
files in one diff:

| file | what it is |
| --- | --- |
| `app/src/log/traceModel.ts` | the four axis transforms + the stopped-span finder |
| `app/src/log/TraceChart.tsx` | reads `?axis=`, `?rest=`, `?stops=`, `?mark=`; draws the marks |
| `app/e2e/gate0b-board2.spec.ts` | the capture harness and the contrast measurement |
| `app/src/log/board2Probe.test.ts` | replays the programmed captures into stored series |
| `app/src/log/board2FreeRow.test.ts` | replays the free row through the real producer |
| `app/src/log/board2Axis.test.ts` | the geometry readout, per candidate per fixture |

To reproduce:

```
git apply docs/design/number-provenance/gate0b/board2/board2-variants.patch
cd app && pnpm e2e e2e/gate0b-board2.spec.ts
```

`axis=today` is `main` unchanged, which is what makes the before/after in
`frames/` a comparison rather than four drawings.

## What is in `frames/`

- `<fixture>-<axis>-<orientation>.png` — the chart alone.
- `…-in-context.png` — the same chart with the `MACHINE CONFIRMED · WORK
  ONLY` block above it, because M3 is about the chart sitting under that
  header.
- `…-stopmark…` — the separable stopped-span proposal; `…-rules` is the
  full-strength treatment the contrast measurement forced.
- `geometry-{portrait,landscape}.json` — band and mark widths, polyline
  segment counts and tick labels, read off the rendered DOM.
- `contrast.json` — every colour pairing this board introduces, composited
  and measured from the live cascade (RF6).

Fixtures and their captures: `fixtures/README.md`.
