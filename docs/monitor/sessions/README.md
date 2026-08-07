# Raw hardware-session captures

The bridge-mirrored lab logs the interface notes cite as evidence
(`docs/monitor/pm5-interface-notes.md` §18 names each by filename).
Gzipped verbatim — every `[event]` frame line, every `exportLog()` dump,
byte-for-byte as captured at the erg. `zcat <file>` to read.

| File | Session | §18 section |
|---|---|---|
| `pm5-session3-final.log.gz` | Session 3 (2026-08-06) — the merge-gate row + the live bisect that found the mid-session empty arm | session 3 |
| `pm5-session4a-final.log.gz` | Session 4a (2026-08-07) — the item-12 readings, the empty arm's wire capture, the settle's two tick-4 measurements | session 4a |
| `pm5-session4b-final.log.gz` | Session 4b (2026-08-07) — the two-row proof: settle-ON structured arm (third tick-4), settle-OFF typed structure-mismatch on a real empty arm | session 4b |

Session 1 has no raw capture (narrative only — predates the bridge's
log mirroring; recorded honestly as such in §19.1's inventory). The
session-2 capture is a byte-identical prefix of session 3's file (one
archive, not two — §19.1's corrected inventory).
