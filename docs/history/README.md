# Phase history

Every phase Ergomatic has run, archived verbatim from `ROADMAP.md` at the
2026-08-28 rebalance. Before that day the roadmap was 7,868 lines and 40 of its
54 phase sections described finished work; this directory is where those bodies
went, and `ROADMAP.md` became forward-looking only.

## How to read these files

**They are a RECORD, not a plan.** Nothing in this directory is scheduled. Each
file is the phase as it was written while it ran, including the corrections,
the reversals and the reasoning that was later overturned — that trail is the
reason the bodies were kept rather than deleted.

**Do not cite a file here for a live question.** Every open item was lifted into
`ROADMAP.md`'s live slate or its open-item register before this directory was
created, and that is where each one is maintained. If you find work here that
looks unfinished, check the roadmap first: it is either already in a wave, in
the register, or was killed with a stated reason.

**Line numbers and file paths inside these bodies have drifted.** They were
accurate when written. A citation like `useMonitorSession.ts:3145` may be a
hundred lines off today. Treat any code reference here as a starting point for
a search, never as an address.

## Three kinds of file

- **Closed phases** — the work shipped and the phase exited. Most of this
  directory.
- **Live-at-archive phases** (`phase-8b`, `phase-9`, `phase-cl2`, `phase-jr`,
  `phase-lm`, `phase-prod`, `phase-ps`, `triggered-follow-ons`) — these were
  still open when the rebalance ran. Their banner says where the work went. The
  body is kept only so no detail was lost in the rewrite.
- **Killed phases** (`phase-8c`, `phase-10`, `phase-lq`, `phase-ur`) — decided
  against on 2026-08-28, with the reason in the banner. Three of the four
  argued against themselves in their own text. The banner exists so the
  decision is not accidentally re-litigated.

## Where the rest of it went

- **Phase PROD** was redistributed rather than killed; its taxonomy research
  moved to `docs/superpowers/research/2026-08-26-intensity-vocabulary.md`.
- **Phase UR's** research moved to `docs/monitor/undefined-rest.md`.
- **The bugfix rounds'** merged-PR changelog is `bugfix-rounds.md` here; its
  four live items are in the roadmap's open-item register.
