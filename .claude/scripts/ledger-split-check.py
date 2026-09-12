#!/usr/bin/env python3
"""Prove a ledger split lost nothing.

Every line of the pre-split ledger must appear in exactly one of the two
output files, in order. The only permitted additions are the ledger's
appended "Where the dated record lives" pointer and the ledger's own new
header. Additions are checked too: content after the pointer section, or a
missing ledger header, fail.

Run from the repo root against the PRE-SPLIT ref:

    python3 .claude/scripts/ledger-split-check.py 6d2454fd

This is the proof for the split itself, not a standing gate — the cut lines
below are the ones that split ran at. Proven able to fail: deleting one line
from a ledger, altering one line of a techniques file, and appending a section
after the pointer each make it exit 1. Both splits are always reported, pass
or fail.
"""
import subprocess, sys

# (techniques file, ledger file, line the dated record starts at in the pre-split original)
SPLITS = [
    (".claude/agents/antagonist-techniques.md", ".claude/agents/antagonist-ledger.md", 174),
    (".claude/agents/pm-techniques.md", ".claude/agents/pm-ledger.md", 79),
]
POINTER_HEADING = "## Where the dated record lives"

# Intentional edits made to the distilled half AFTER the split, each with its
# reason. The check applies these to the pre-split original before comparing,
# so a declared edit passes and an undeclared one still fails.
DECLARED_EDITS = {
    ".claude/agents/antagonist-techniques.md": [
        # "(this engagement)" was frozen from one 2026-08 dispatch and is
        # meaningless in a file that is now explicitly the durable half.
        ("## Attacked and NOT broken (this engagement)", "## Attacked and NOT broken"),
    ],
}
LEDGER_MARK = "Not read up front"


def strip_trailing_blanks(lines):
    while lines and not lines[-1].strip():
        lines.pop()
    return lines


def main(ref="HEAD"):
    failures = []
    for techniques, ledger, cut in SPLITS:
        original = subprocess.run(["git", "show", f"{ref}:{ledger}"],
                                  capture_output=True, text=True, check=True).stdout.splitlines()
        now_tech = open(techniques).read().splitlines()
        now_ledger = open(ledger).read().splitlines()
        local = []

        # the techniques file is original[:cut-1] plus exactly one pointer section
        if POINTER_HEADING not in now_tech:
            local.append(f"{techniques}: pointer section missing")
        else:
            ptr = now_tech.index(POINTER_HEADING)
            kept = strip_trailing_blanks(now_tech[:ptr])
            want = strip_trailing_blanks(original[:cut - 1])
            for before, after in DECLARED_EDITS.get(techniques, []):
                if before not in want:
                    local.append(f"{techniques}: declared edit no longer applies: {before!r}")
                want = [after if l == before else l for l in want]
            if kept != want:
                local.append(f"{techniques}: kept head differs from original[:{cut-1}]")
            # nothing may be appended after the pointer section but the pointer itself
            if any(l.startswith("## ") for l in now_tech[ptr + 1:]):
                local.append(f"{techniques}: content added after the pointer section")

        # the ledger is its new header plus original[cut-1:], verbatim
        if LEDGER_MARK not in "\n".join(now_ledger[:8]):
            local.append(f"{ledger}: header missing or not in the first 8 lines")
        body_start = next((i for i, l in enumerate(now_ledger) if l.startswith("## ")), None)
        if body_start is None:
            local.append(f"{ledger}: no section headings found")
        elif now_ledger[body_start:] != original[cut - 1:]:
            local.append(f"{ledger}: body differs from original[{cut-1}:]")

        if local:
            failures += local
        else:
            kept_n, rec_n, orig_n = len(want), len(original[cut - 1:]), len(original)
            blanks = orig_n - kept_n - rec_n
            assert blanks >= 0, "split invented lines"
            print(f"OK  {ledger}: {kept_n} distilled + {rec_n} dated record + {blanks} blank "
                  f"separator = {orig_n} original lines, no loss")
    for f in failures:
        print("FAIL " + f)
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1] if len(sys.argv) > 1 else "HEAD"))
