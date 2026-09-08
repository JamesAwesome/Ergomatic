#!/usr/bin/env python3
"""Decode `Erg Machine Type` out of every committed PM5 recording.

Phase MT added a predicate over a WIRE field that had never had a consumer.
Every gate in that change drives our own `buildAdditionalStatus1Bytes` into our
own `parseAdditionalStatus1` — encoder and parser share the offset, so no test
in the branch can catch a wrong one. That is recurring failure 11's mirror.

This is the non-mirror check, and it answers the risk that actually matters.
The danger was never the SkiErg nobody owns: it was a FALSE refusal bricking
the one RowErg this cohort has. If any committed capture carried a value in the
denylist, that erg would now be refused.

Run from the repo root:

    python3 docs/monitor/sessions/erg-machine-type-census.py

Result, 2026-09-08, over all 12 committed recordings:

    0x0032: 5410 notifications carry the field -> {0: 5410}
    0x0038:   23 notifications carry the field -> {0: 23}

`0` is `ERGMACHINE_TYPE_STATIC_D` (rev 1.30, Appendix A) — a rower, and not in
the denylist. Ships as a script rather than as those two numbers so a later
walk re-runs it instead of trusting a transcription that has since expired.
"""

import collections
import glob
import gzip
import json

# `domain/monitor/pm5/uuids.ts`'s `pm5Uuid()` base, and the offsets
# `parse.ts` reads the field from on each carrier.
CARRIERS = {
    "ce060032-43e5-11e4-916c-0800200c9a66": ("0x0032", 16),
    "ce060038-43e5-11e4-916c-0800200c9a66": ("0x0038", 18),
}


def main() -> None:
    counts: dict[str, collections.Counter[int]] = collections.defaultdict(
        collections.Counter
    )
    # A frame SHORTER than the offset is a pre-V1.26/V1.27 monitor that omits
    # the field entirely. Counted separately rather than skipped, because
    # "absent" is a distinct outcome the app deliberately proceeds on.
    short: collections.Counter[str] = collections.Counter()

    files = sorted(
        glob.glob("docs/monitor/sessions/**/*.jsonl.gz", recursive=True)
    )
    for path in files:
        with gzip.open(path, "rt") as handle:
            for line in handle:
                event = json.loads(line)
                if event.get("dir") != "rx":
                    continue
                carrier = CARRIERS.get(event.get("char"))
                if carrier is None:
                    continue
                name, offset = carrier
                raw = bytes.fromhex(event["hex"].replace(" ", ""))
                if len(raw) > offset:
                    counts[name][raw[offset]] += 1
                else:
                    short[name] += 1

    print(f"files scanned: {len(files)}")
    for name in ("0x0032", "0x0038"):
        total = sum(counts[name].values())
        print(
            f"{name}: {total} notifications carry the field -> "
            f"{dict(counts[name])}; {short[name]} too short to carry it"
        )


if __name__ == "__main__":
    main()
