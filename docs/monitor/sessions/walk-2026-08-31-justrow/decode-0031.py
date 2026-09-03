#!/usr/bin/env python3
"""Decode a pm5-recording/v1 capture's 0x0031 frames: print every change of
(workoutType @ offset 6, workoutState @ offset 8) with its time. The census
the connect-programs spec (2026-09-02) cites was produced by this script.
Usage: python3 decode-0031.py <recording.jsonl.gz>"""
import gzip, json, sys
from collections import Counter
rows = [json.loads(l) for l in gzip.open(sys.argv[1], "rt")]
fr = [r for r in rows if r.get("dir") == "rx" and (r.get("char") or "").startswith("ce060031")]
print("0x0031 rx frames:", len(fr))
print("(type,state) counts:", Counter((bytes.fromhex(r["hex"])[6], bytes.fromhex(r["hex"])[8]) for r in fr).most_common())
prev = None
for r in fr:
    b = bytes.fromhex(r["hex"]); key = (b[6], b[8])
    if key != prev:
        print(f"t={r['t']/1000:8.1f}s  workoutType={b[6]}  state={b[8]}")
        prev = key
