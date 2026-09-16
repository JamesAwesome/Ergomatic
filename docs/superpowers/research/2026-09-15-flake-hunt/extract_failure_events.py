#!/usr/bin/env python3
"""Export every named final failure and retry recovery from bounded job logs."""

from __future__ import annotations

import argparse
import csv
import json
import re
from collections import Counter
from pathlib import Path

ANSI = re.compile(r"\x1b\[[0-9;]*[A-Za-z]")
SUMMARY = re.compile(r"\s(\d+) (flaky|failed)\s*$")


def family(title: str) -> str:
    if "resetting the baselines brings the doors back" in title:
        return "stored baseline reset"
    if "selecting MY WORKOUTS narrows" in title:
        return "Library SOURCE filter save/read"
    if "linking Apple proves Google then Apple" in title:
        return "Apple link Google-proof continuation"
    if "You's hero prints the seed's LIFETIME" in title:
        return "Stats delete/read"
    if "renders each release's version, date, and every item" in title:
        return "Releases synchronous render timeout"
    return "unclassified"


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--evidence", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()
    data = json.loads((args.evidence / "manifest.json").read_text())
    runs = {row["id"]: row for row in data["runs"]}
    receipts = {row["job_id"]: row for row in data["log_receipts"]}
    job_context = {
        job["id"]: (attempt, runs[attempt["run_id"]], job)
        for attempt in data["attempts"]
        for job in attempt["jobs"]
    }
    events: list[dict] = []
    for job_id, (attempt, run, job) in job_context.items():
        receipt = receipts[job_id]
        if not receipt["path"]:
            continue
        raw = Path(receipt["path"]).read_text(encoding="utf-8", errors="replace").splitlines()
        lines = [ANSI.sub("", line) for line in raw]
        for index, line in enumerate(lines):
            match = SUMMARY.search(line) if job["name"] == "e2e" else None
            if not match:
                continue
            wanted = int(match.group(1))
            titles = []
            for later in lines[index + 1 : index + wanted + 12]:
                if "[chromium] › " in later:
                    titles.append(later.split("[chromium] › ", 1)[1].strip().rstrip("─ "))
                if len(titles) == wanted:
                    break
            if len(titles) != wanted:
                raise SystemExit(f"job {job_id}: flaky summary named {wanted}, extracted {len(titles)}")
            for title in titles:
                first_line = next(
                    (
                        number
                        for number, text in enumerate(lines[:index], 1)
                        if re.search(r"\d+\) \[chromium\] › ", text) and title in text
                    ),
                    None,
                )
                if first_line is None:
                    raise SystemExit(f"job {job_id}: no first-attempt block for {title}")
                failure = next(
                    (text.strip() for text in lines[first_line:first_line + 20] if re.search(r"(?:Error|TypeError):", text)),
                    "failure detail unavailable in bounded block",
                )
                events.append({
                    "family": family(title), "run_id": attempt["run_id"],
                    "workflow_attempt": attempt["attempt"], "job_id": job_id,
                    "head_sha": run["head_sha"], "job_conclusion": job["conclusion"],
                    "outcome": "retry_recovered" if match.group(2) == "flaky" else "retries_exhausted", "title": title,
                    "failure": failure, "source_log_line": first_line,
                })
        if job["name"] == "app":
            for index, line in enumerate(lines):
                if " FAIL " not in line:
                    continue
                title = line.split(" FAIL ", 1)[1].strip()
                failure = next(
                    (text.strip() for text in lines[index + 1:index + 12] if re.search(r"(?:Error|AssertionError):", text)),
                    "failure detail unavailable in bounded block",
                )
                events.append({
                    "family": family(title), "run_id": attempt["run_id"],
                    "workflow_attempt": attempt["attempt"], "job_id": job_id,
                    "head_sha": run["head_sha"], "job_conclusion": job["conclusion"],
                    "outcome": "job_failed", "title": title,
                    "failure": failure, "source_log_line": index + 1,
                })
    args.output.parent.mkdir(parents=True, exist_ok=True)
    fields = list(events[0]) if events else []
    if not fields:
        raise SystemExit("no bounded recurrent failure events extracted")
    with args.output.open("w", newline="") as handle:
        writer = csv.DictWriter(
            handle, fieldnames=fields, dialect="excel-tab", lineterminator="\n"
        )
        writer.writeheader()
        writer.writerows(sorted(events, key=lambda row: (row["run_id"], row["job_id"], row["title"])))
    summary = {
        "events": len(events),
        "by_family_and_outcome": {
            f"{name}:{outcome}": count
            for (name, outcome), count in sorted(Counter((row["family"], row["outcome"]) for row in events).items())
        },
        "retry_recovered_jobs": len({row["job_id"] for row in events if row["outcome"] == "retry_recovered"}),
        "recovered_and_exhausted_jobs": sorted(
            {row["job_id"] for row in events if row["outcome"] == "retry_recovered"}
            & {row["job_id"] for row in events if row["outcome"] == "retries_exhausted"}
        ),
    }
    args.output.with_suffix(".summary.json").write_text(json.dumps(summary, indent=2) + "\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
