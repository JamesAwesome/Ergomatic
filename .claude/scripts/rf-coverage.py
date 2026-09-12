#!/usr/bin/env python3
"""Flag rules that the compression may have dropped from CLAUDE.md.

For every **bolded span** in the PRE-compression entry (those are where this
file states its rules), check how much of its distinctive vocabulary survives
in the POST-compression entry. Low coverage is a candidate for human review,
not a verdict -- the entries were deliberately reworded.

Checks CLAUDE.md only. Checking the history file would pass trivially, since
that file is the original verbatim (RF21).
"""
import re, subprocess, sys

STOP = set("""a an the and or but if of to in on at by for with from as is are was were be been
being it its this that these those not no nor so than then there here when where which who whom
whose what how why all any both each few more most other some such only own same too very can will
just should now does do did doing done has have had having you your yours we our us they them their
i me my one two three into over under again further once about against between through during before
after above below up down out off again""".split())

def tokens(s):
    s = re.sub(r"[*_`]", " ", s.lower())
    out = set()
    for t in re.findall(r"[a-z0-9][a-z0-9_./:#-]{2,}", s):
        if t not in STOP and not t.isdigit():
            out.add(t)
    return out

def entries(text):
    body = text.split("## Recurring failures", 1)[1]
    body = re.split(r"\n## ", body, 1)[0]
    starts = [(m.start(), int(m.group(1))) for m in re.finditer(r"^(\d+)\. \*\*", body, re.M)]
    out = {}
    for i, (pos, n) in enumerate(starts):
        endpos = starts[i+1][0] if i+1 < len(starts) else len(body)
        out[n] = body[pos:endpos]
    return out

old = entries(subprocess.run(["git","show",f"{sys.argv[1]}:CLAUDE.md"],
                             capture_output=True, text=True, check=True).stdout)
new = entries(open("CLAUDE.md").read())

assert set(old) == set(new) == set(range(1,42)), "entry sets differ"

rows, flagged = [], []
for n in range(1, 42):
    spans = [s for s in re.findall(r"\*\*(.+?)\*\*", old[n], re.S) if len(s.split()) >= 4]
    newtok = tokens(new[n])
    worst = 1.0
    for s in spans:
        t = tokens(s)
        if not t:
            continue
        cov = len(t & newtok) / len(t)
        worst = min(worst, cov)
        if cov < 0.55:
            flagged.append((n, round(cov, 2), " ".join(s.split())[:110]))
    rows.append((n, len(spans), round(worst, 2)))

print(f"{'RF':>3} {'rules':>5} {'worst-coverage':>15}")
for n, c, w in rows:
    mark = "  <-- check" if w < 0.55 else ""
    print(f"{n:>3} {c:>5} {w:>15.2f}{mark}")
print()
if flagged:
    print(f"{len(flagged)} rule span(s) below 0.55 coverage -- read these by hand:\n")
    for n, cov, s in flagged:
        print(f"  RF{n} ({cov}): {s}")
else:
    print("every bolded rule span from the original is >=0.55 covered in the new entry")
sys.exit(0)
