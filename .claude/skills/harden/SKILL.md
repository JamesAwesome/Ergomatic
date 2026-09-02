---
name: harden
description: Harden a spec or plan before implementation starts — two adversarial lenses, a countable stop rule, and one ledger entry. Use when a design or implementation plan is written and about to be built, especially TRIAD work (a number's meaning, a stored shape, auth). Not for fast-path changes, which have no spec.
---

# harden

You are hardening a written spec or plan before anyone implements it. Your
output is a revised document plus one ledger entry, produced in AT MOST two
adversarial dispatches.

**This skill exists because the loop it replaces ran eleven passes on one
plan** (Wave E PR1.75b, 2026-09-02). Six of those found drift in bookkeeping
the plan invented; the two highest-value late finds came from lenses that had
never been run. The session's own estimate of passes 5-10: roughly a third
of it, spent on record hygiene a reviewer sweeps in one round. Every rule
below is that session's receipt.

## Phase 0 — refuse, or clear the churn generators

**Do not open the loop until the document passes this check.** Each item
below generated its own review rounds on the plan that produced this skill,
and hardening a document that carries them means hardening its bookkeeping.
Fix them yourself, in one edit, before dispatching anything:

1. **Unmeasured numbers.** Every expected count, line count and gate pass
   value names the command that produced it and the tree it ran against. A
   number with no command is deleted or measured — never attacked.
2. **Plan-internal line citations.** `:41`, `:292-296` pointing into the
   document itself. Rewrite as Task/step/symbol; they cannot survive the
   first fold.
3. **Self-describing bookkeeping.** Pass counts, revision tallies,
   hand-transcribed corpus tables. Delete them. A census ships as its SCRIPT
   plus a base-vs-head diff, never as transcribed numbers.
4. **Untested prescribed blocks.** The author owes the paste-test
   (agent-briefing, "Plan authoring"): every code block at its real path
   through `pnpm typecheck` and `pnpm lint`, prescribed tests against
   prescribed implementation, every shell block and mutation instruction
   RUN. If it has not happened, it happens now — by you, not by a dispatch.
   Discovering that pasted code does not compile is the most expensive
   possible use of an antagonist.

Say which of the four you fixed. If the document is clean, say that.

## The two lenses

Run them in order. Each is ONE dispatch. Neither repeats.

### Lens 1 — mechanism (the antagonist, delta or full)

Dispatch `antagonist` under the phase-grouped rules in CLAUDE.md: full pass
at phase open or for TRIAD work, delta pass against the phase's vetted
ground otherwise, and a SPOKEN skip when neither applies. Its brief names
the four shapes that carry the kill-shots:

- **Vendor hooks and lifecycle.** For any hook the design depends on, find
  its CALL SITES in the vendored source — not its declaration — and confirm
  the call site is reachable in the failure case the design chose it for.
  Capacitor's `load()` runs once at view-controller construction; a WebView
  reload never re-runs it, so the design's in-flight claim leaked forever.
- **Invented mechanisms.** Reconcilers, accumulators, schedulers, state
  machines, single-flight guards. For every "by construction" claim, name
  the VALUE that makes two instances distinguishable; if the guard reads a
  shared slot rather than an identity, the guarantee is ordering luck.
- **Session-scoped state.** RF27's lifetime table: every ref, guard and
  counter, its mint site, its clear sites, what survives teardown, relaunch
  and re-arm. Invariants, never mechanisms.
- **What the spec asserts on the system's behalf.** Does the real system
  (the PM5, iOS, the browser, the vendor API) HAVE the concept? If not, name
  who is wrong when it matters.

### Lens 2 — the prescribed code, read as code

A separate dispatch, and NOT the antagonist: this lens reads the plan's code
blocks the way a reviewer reads a diff, which is the thing eleven passes
never did. The four finding classes below are the ones that survived the long
loop and were caught later by per-task review, so name them in the brief:

- **A fail-open default.** Every option, flag and config key: what happens
  when the caller omits it? `prefersEphemeralWebBrowserSession` defaulted
  false, which is the shared-cookie session the design added it to prevent.
- **A self-comparing test.** A test importing the constant it exists to
  gate, or asserting against the same source it measures. Pin contracts with
  independent literals.
- **A dropped diagnostic.** An error whose code or message reaches no log,
  no readout and no record — so the operator taps and nothing happens.
- **An untested seam.** For any A-writes-then-B-reads pair, ONE test must
  start upstream of A and assert after B (RF24).

And two mechanical reads over every prescribed block:

- **Absent, empty, valued.** Run each input through all three. `?code=`
  present-but-empty parses to `""`, not `null`, and survived eleven passes.
- **"Who is the attacker in this sentence?"** For every claim of the form
  "X cannot happen", name the party who would want it to and what they
  control.

## The stop rule (countable, not felt)

**A finding is BOOKKEEPING when its fix changes none of these four:** a code
block, a gate command, an expected value, or a walk step or precondition.
Anything else — wording, citation formatting, a count restated, a claim
argued in one place and used in another — is bookkeeping.

Fold bookkeeping findings, then stop. Do not spend a pass on them.

**The loop ends at whichever comes first:** both lenses have run, or a pass
returns only bookkeeping. There is no third lens and no verification pass.
If lens 2's fixes are substantial enough to want re-checking, that is what
per-task review and the PR's own review rounds are for — they run anyway,
and they swept this exact class in one round.

## Specs versus plans

A spec gets lens 1 always and lens 2 only where it prescribes executable
content. Say the skip aloud: "no prescribed blocks; lens 2 skipped."

A plan gets both.

## The ledger

ONE entry per hardening run, not per pass. Eleven entries for one plan added
549 lines to a ledger every future antagonist must read
(`git diff --numstat 606d3f72 15fb3c61 -- .claude/agents/antagonist-ledger.md`,
branch `wave-e-pr175b-native`), which made each pass more expensive than the
one before it.

The entry carries TECHNIQUES, not history: for each real find, the claim, why
it was believed, and the technique that settled it. Bookkeeping findings do
not appear. Per CLAUDE.md, the agent PROPOSES the entry as ready-to-paste
markdown and the controller lands it — agents write to no checkout.

## Not for

Fast-path work (no spec, nothing to attack), pure-UI and docs changes, and
any document whose author has not yet run the paste-test. Send the last one
back rather than hardening it.
