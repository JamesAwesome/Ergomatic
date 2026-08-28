> **Archived 2026-08-28** from `ROADMAP.md` (lines 1135-1197 of the pre-rebalance file, main `39e9430`).
>
> This is the phase as it was written while it ran. It is a RECORD: nothing
> here is scheduled, and its open items were lifted into `ROADMAP.md`'s live
> slate before this file was created. Do not cite it for a live question.

## Phase 7A-fix-3 — program over a live piece

**Status:** Done (2026-08-07, PR #53). Design approved by adversarial
review; Stage 1 (instrumentation, the settle, the fake's honest empty-arm
model) and Stage 2 (the structural readback and its `"structure-mismatch"`
rejection) both shipped as Tasks 1-5, commits `5d42e01`..`78a949c` on
`phase-7a-fix-3`. Hardware sessions 4a (2026-08-07) and 4b both RAN, both
with every row PASS.
**Trigger:** FIRED — the merge-gate row's own live bisect (laptop session
3, 2026-08-06) found two unrelated program shapes arming structurally
EMPTY, each the one time it was sent while the target machine was still
`rowing`, while seven sends from a settled machine all armed correctly.
**Repro recipe:** send `program()` at a workout that is currently mid-piece
(`rowing`/`resting`); its own internal `sendPrepare()` terminate fires while
the machine is still live, and the send that follows is accepted, verified
armed, and structurally empty.
**Authority:** `docs/monitor/pm5-interface-notes.md` §19.13 for the
behaviour, §18 (laptop session 3, sessions 4a/4b) for the readings, and
§17 items 5/12/15/16/17 for what it does and does not close.

- [x] **Remedy A — settle after a mid-session terminate.** `program()`'s
      `sendPrepare()` step now waits, when the prepare's terminate fired
      while the machine was `rowing`/`resting`, for the documented Appendix
      E auto-cycle to reach `armed` plus one further tick
      (`DriverOptions.prepareSettleTicks`, default 10, its own
      `pendingPrepareSettle` slot, tick-bounded rather than wall-clock).
      Session 4a measured `armed` on tick 4 twice at the exact repro.
      Common-path latency is unchanged: the wait only arms when the prior
      state was `rowing`/`resting`. Task 2 (`5d42e01`→`6fd2636`/`9421033`).
- [x] **Remedy B — item 12's structural readback, as detection.**
      `verifyArmed` (`src/monitor/driver.ts`) resolves only on a fresh
      post-send tick that is `armed` AND whose 0x0031 structure fields
      match `expectedArmedStructure(p)` (`pm5/commands.ts`, sharing the
      encoder's own constants). A mismatch rejects with
      `ProgramRejectionReason: "structure-mismatch"` after 3 consecutive
      armed ticks reporting the SAME wrong structure (a payload still
      changing restarts the count, per session 4a's captured mid-cycle
      transients), or at `verifyTicks`' outer bound, which now DEFAULTS to
      20 instead of meaning unbounded. Task 4 (`970bf26`/`a7ac619`).
- [x] **Removed the fake's idle-terminate refusal (§17 item 15).**
      `src/monitor/transports/fake.ts`'s `onClearingFrameComplete` accepts a
      bare idle terminate unconditionally; the refusal survives only behind
      the explicit synthetic `FakeScript.refuseNextPrepare` hook, because
      real hardware never refused it. Task 3 (`e92cee9`/`50eae9b`).
- [x] **Revised `sendPrepare`'s doc comment.** `src/monitor/driver.ts`'s
      `sendPrepare` no longer claims hardware showed the PM refuse an idle
      terminate; it states the swallow-as-routine behaviour on its own
      terms and cites the retirement directly (§18 session 3 item 15,
      §19.4/§19.5). Task 3.

**Record:** §19.13 holds the finding, its two-shape/one-condition evidence
and the correction that the empty arm is no longer indistinguishable from a
healthy one; §18's sessions 4a and 4b hold the readings, including a real
PM5 caught by the readback with a typed `structure-mismatch` on a live
empty arm. Session 1's `:00`/`:00` Verdict (a) stays OPEN, with this
mechanism as its leading candidate explanation rather than its answer. The
minors this phase parked for the whole-branch reviewer are in Phase CL.

**Exit:** MET (2026-08-07) — green (2335 all-projects, e2e 210), session 4b
run with both rows PASS, and James's explicit approval given. Session 4a
resolving as outcome (a) meant the remedies shipped unconditionally on 4b,
which was validation rather than a further decision point.
