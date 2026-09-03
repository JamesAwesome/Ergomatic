# Walk 2026-09-03 — connect programs the erg sooner (PR #283)

Phone walk, native build 0.35.0 (848) from Xcode, worktree
`Ergomatic-wt-conn`, branch `connect-program-first`. No rowing. No
recordings (the recording seam is web-only). Evidence: three diagnostics
rings copied off the door, byte-identical COPY exports. James's own words
on arriving: "at the erg, all working".

Scope: this PM5, these three connects, 2026-09-03. Serial and firmware not
captured.

## Provenance

| Ring | Leg |
| --- | --- |
| `ring-2-free-row.json` | free row, connect then cancel |
| `ring-1-cancel-midsend.json` | second free row, cancelled, PM5 confirmed terminated |
| `ring-3-programmed-workout.json` | a real five-interval workout, armed then cancelled |

## The measurement

Run `python3 docs/monitor/sessions/ack-latency-census.py` from the repo
root. Before this branch it reported native rings at 1698-2060 ms; with
these three it reports 202-2060 ms, the new ones being the fast end.

**Free row, first CSAFE write to its ack:**

| Ring | Gap |
| --- | --- |
| `ring-2-free-row` | 202 ms |
| `ring-1-cancel-midsend` | 325 ms |

Against a prior corpus of 1698-2060 ms across thirteen native rings. The
erg takes the program roughly eight times sooner.

**Programmed workout** — the endpoint the rower watches is the SECOND ack,
where the PM5 accepts the programming frame, not the prepare's:

| Moment | This walk | Prior corpus |
| --- | --- | --- |
| first write | +10 ms | +10 ms |
| prepare ack | +360 ms | ~1800 ms |
| **programming ack, the erg's screen** | **+1799 ms** | **2700-2969 ms** |
| our `armed`, after readback | +2882 ms | ~2969 ms |

About 900 ms earlier on the erg. The app's own ready is only ~90 ms
earlier, because its readback confirmation waits for the first 0x0031,
which now arrives after the deferred subscriptions drain. That trade is
deliberate and worth stating: the change moves the ERG, not the phone's
confirmation, and the erg is what the complaint was about.

## The regression the hardening predicted did NOT happen

Lens 1 found that releasing the subscriptions on the first write, or on
the prepare, would put them between the prepare's ack and the programming
chunks and make a workout ~400 ms slower. Ring 3 settles it on hardware:
`status-subscribe: arm` fires at +1798, one millisecond after the
programming ack at +1799, and the six chunk writes run unbroken from +362
to +1258 with no subscribe among them.

## Findings

1. **PASS, free row.** 202 and 325 ms, from a corpus that had never been
   under 1698 ms.
2. **PASS, programmed workout.** The erg accepts at 1799 ms against a
   prior 2700-2969 ms, and the release lands after the programming ack
   exactly as designed.
3. **PASS, the release path is the arm.** All three rings record
   `status-subscribe: arm`. The fallback did not fire, which is what
   should happen when a connect arms.
4. **PASS, cancel.** Both free-row rings write the terminate and get an
   ack; `ring-1` also carries the PM5's own `terminated` frame and a
   `close-no-record`. The workout ring cancels the same way.
5. Observation: every ack in this walk carried a status byte of `0x01` or
   `0x81`. Both are accepts; the difference is the CSAFE frame-toggle bit
   (interface-notes §19.2, where a wrong mechanism for that alternation
   was once invented and withdrawn).
