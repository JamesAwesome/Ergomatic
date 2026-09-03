#!/usr/bin/env python3
"""First CSAFE write to its first ack, across every committed walk ring.

The number the connect-latency spec rests on. Run from the repo root:
    python3 docs/monitor/sessions/ack-latency-census.py

A ring is a diagnostics-door COPY export: a JSON array of {seq, atMs, kind,
detail}. Rings that carry no write, no ack, or no atMs (the older format)
are skipped and counted.

NATIVE vs WEB is read off the ring itself, not off a filename: only
`capacitorBle.ts` carries `describeLastScan`, so only a native session can
emit an `already-connected-guard` entry (`useMonitorSession.ts` records it
behind `hasDescribeLastScan`). Cross-checked against the walk READMEs,
which name each leg as laptop or phone: the split agrees on all 16.
"""
import glob
import json
import os

rows, skipped = [], 0
for path in sorted(glob.glob("docs/monitor/sessions/*/*.json")):
    try:
        ring = json.load(open(path))
    except Exception:
        skipped += 1
        continue
    if not isinstance(ring, list) or not ring:
        skipped += 1
        continue
    if not all(isinstance(e, dict) and "kind" in e and "atMs" in e for e in ring):
        skipped += 1
        continue
    writes = [e for e in ring if e["kind"] == "write"]
    acks = [e for e in ring if e["kind"] == "ack"]
    if not writes or not acks:
        skipped += 1
        continue
    notify = [e for e in ring if e["kind"] == "notify-first"]
    native = any(e["kind"] == "already-connected-guard" for e in ring)
    t0 = ring[0]["atMs"]
    rows.append((
        "native" if native else "web",
        os.path.basename(os.path.dirname(path)),
        os.path.basename(path),
        writes[0]["atMs"] - t0,
        acks[0]["atMs"] - t0,
        acks[0]["atMs"] - writes[0]["atMs"],
        len(notify),
    ))

print(f"{'stack':6s} {'walk':32s} {'ring':44s} {'write+':>7s} {'ack+':>7s} {'gap':>7s} {'nf':>3s}")
for stack, walk, ring, w, a, gap, nf in sorted(rows):
    print(f"{stack:6s} {walk:32s} {ring:44s} {w:7d} {a:7d} {gap:7d} {nf:3d}")
for stack in ("native", "web"):
    gaps = [r[5] for r in rows if r[0] == stack]
    if gaps:
        print(f"\n{stack}: {len(gaps)} rings, gap {min(gaps)}-{max(gaps)} ms")
print(f"{skipped} files skipped (no write, no ack, or no atMs)")
