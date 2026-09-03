import glob, gzip, json, collections, os, sys

# 0x0031 General Status; rowingState = byte 9 (readU8(bytes,9)).
SUFFIX = "0031"
total = collections.Counter()
grand_changes = 0
grand_frames = 0
for path in sorted(glob.glob("docs/monitor/sessions/**/*.jsonl*", recursive=True)):
    if path.endswith(".jsonl") and os.path.exists(path + ".gz"):
        continue  # skip the plain twin of a gz
    op = gzip.open if path.endswith(".gz") else open
    counts = collections.Counter()
    changes = 0
    prev = None
    with op(path, "rt") as fh:
        for line in fh:
            line = line.strip()
            if not line:
                continue
            try:
                ev = json.loads(line)
            except Exception:
                continue
            if ev.get("dir") != "rx" or "hex" not in ev:
                continue
            char = str(ev.get("char", ""))
            # match the 0x0031 characteristic: ce060031-...
            if "ce060031" not in char:
                continue
            b = bytes.fromhex(ev["hex"])
            if len(b) < 10:
                continue
            v = b[9]
            counts[v] += 1
            if prev is not None and v != prev:
                changes += 1
            prev = v
    if counts:
        print(f"{os.path.basename(path):55s} frames={sum(counts.values()):5d} values={dict(sorted(counts.items()))} changes={changes}")
        total.update(counts)
        grand_changes += changes
        grand_frames += sum(counts.values())
print()
print("TOTAL frames:", grand_frames, "values:", dict(sorted(total.items())), "changes:", grand_changes)
