#!/usr/bin/env python3
"""Does 0x0031's Elapsed Time keep counting during a WORK interval when the
rower stops?

Decodes a PM5 wire recording's 0x0031 frames and prints elapsed against the
HOST clock across every stretch where the rower was not rowing, so the answer
is read off the SHAPE rather than a two-way split (walk card v5's outcome
table: FROZE / RAN / GRACE THEN FROZE / INCONCLUSIVE).

Offsets from docs/monitor/pm5-interface-notes.md §10, cross-checked against
app/domain/monitor/pm5/parse.ts:
    0-2 elapsed 0.01 s LE | 3-5 distance 0.1 m LE
    7 intervalType | 8 workoutState | 9 rowingState (0=Inactive, 1=Active)

Workout states (§5): 1 WORKOUTROW (free row), 4 INTERVALWORKTIME,
5 INTERVALWORKDISTANCE — 4 and 5 are the programmed work states this walk is
about. 3 is INTERVALREST, 12 WORKOUTLOGGED.

    python3 decode-work-clock.py <recording.jsonl[.gz]>
"""
import gzip
import json
import sys

CHAR_0031 = "ce060031-43e5-11e4-916c-0800200c9a66"
STATE = {0: "WAITTOBEGIN", 1: "WORKOUTROW", 3: "INTERVALREST",
         4: "INTERVALWORKTIME", 5: "INTERVALWORKDISTANCE", 10: "WORKOUTEND",
         11: "TERMINATE", 12: "WORKOUTLOGGED", 13: "REARM"}
PROGRAMMED_WORK = {4, 5}


def u24le(b, o):
    return b[o] | (b[o + 1] << 8) | (b[o + 2] << 16)


def frames(path):
    opener = gzip.open if path.endswith(".gz") else open
    with opener(path, "rt") as fh:
        for line in fh:
            try:
                obj = json.loads(line)
            except Exception:
                continue
            if obj.get("char") != CHAR_0031 or "hex" not in obj:
                continue
            raw = bytes.fromhex(obj["hex"])
            if len(raw) < 11:
                continue
            yield {
                "host": obj["t"] / 1000.0,
                "elapsed": u24le(raw, 0) / 100.0,
                "dist": u24le(raw, 3) / 10.0,
                "state": raw[8],
                "rowing": raw[9],
            }


def main(path):
    fs = list(frames(path))
    if not fs:
        sys.exit(f"no 0x0031 frames in {path}")
    span = fs[-1]["host"] - fs[0]["host"]
    rate = (len(fs) - 1) / span if span > 0 else 0.0
    print(f"{path}\n{len(fs)} frames over {span:.1f}s host  ({rate:.2f} Hz)")
    seen = sorted({f["state"] for f in fs})
    print("states: " + ", ".join(f"{s}={STATE.get(s, '?')}" for s in seen))

    # Every stretch of NOT-ROWING, with what the clock did across it.
    runs, cur = [], None
    for f in fs:
        if f["rowing"] == 0:
            if cur is None:
                cur = {"t0": f["host"], "e0": f["elapsed"], "d0": f["dist"],
                       "states": set(), "n": 0}
            cur["t1"], cur["e1"] = f["host"], f["elapsed"]
            cur["states"].add(f["state"])
            cur["n"] += 1
        else:
            if cur is not None:
                runs.append(cur)
            cur = None
    if cur is not None:
        runs.append(cur)

    print(f"\n{'host span':>11} {'wall':>8} {'clock moved':>12} {'verdict':>16}"
          "  states")
    for r in runs:
        wall = r["t1"] - r["t0"]
        moved = r["e1"] - r["e0"]
        if wall < 3:
            verdict = "(too short)"
        elif moved < -0.05:
            # elapsed DECREASED: a re-base, not a freeze. A Terminate
            # re-bases the clock backward (CSAFE-DEF footnote 12) and a
            # new interval resets it to 0 — calling either "FROZE" would
            # be a wrong answer to this walk's own question.
            verdict = "RE-BASED"
        elif moved < 0.05:
            verdict = "FROZE"
        elif abs(moved - wall) < 0.5 * wall:
            verdict = "RAN"
        else:
            verdict = "GRACE THEN FROZE"
        names = "+".join(STATE.get(s, str(s)) for s in sorted(r["states"]))
        programmed = "  <== PROGRAMMED WORK" if (
            r["states"] & PROGRAMMED_WORK and wall >= 3) else ""
        print(f"{r['t0']:6.1f}-{r['t1']:<4.0f} {wall:7.2f}s {moved:11.2f}s "
              f"{verdict:>16}  {names}{programmed}")

    decisive = [r for r in runs
                if r["states"] & PROGRAMMED_WORK and (r["t1"] - r["t0"]) >= 10]
    print()
    if not decisive:
        print("INCONCLUSIVE — no stop of >=10s in a PROGRAMMED work state "
              "(4/5). This is what every capture in the corpus looked like "
              "before this walk.")
    else:
        for r in decisive:
            wall, moved = r["t1"] - r["t0"], r["e1"] - r["e0"]
            if moved < -0.05:
                call = "RE-BASED (not an answer — the clock reset)"
            elif moved < 0.05:
                call = "FROZE"
            elif abs(moved - wall) < 0.5 * wall:
                call = "RAN"
            else:
                call = "GRACE THEN FROZE"
            print(f"DECISIVE: {wall:.2f}s stopped in "
                  f"{'+'.join(STATE.get(s, str(s)) for s in sorted(r['states']))}"
                  f", clock moved {moved:.2f}s -> {call}")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    main(sys.argv[1])
