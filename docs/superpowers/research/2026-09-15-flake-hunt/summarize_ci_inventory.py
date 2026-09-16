#!/usr/bin/env python3
"""Export a sanitized receipt from the ignored CI inventory."""

from __future__ import annotations

import argparse
import csv
import json
from collections import Counter
from pathlib import Path


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--evidence", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()
    data = json.loads((args.evidence / "manifest.json").read_text())
    runs = {row["id"]: row for row in data["runs"]}
    receipts = {row["job_id"]: row for row in data["log_receipts"]}
    rows = []
    for attempt in data["attempts"]:
        run = runs[attempt["run_id"]]
        if attempt["error"]:
            rows.append({
                "run_id": attempt["run_id"], "workflow_attempt": attempt["attempt"],
                "job_id": "", "job": "", "status": "metadata_error",
                "conclusion": "", "head_sha": run["head_sha"], "event": run["event"],
                "created_at": run["created_at"], "log": attempt["error"],
            })
        for job in attempt["jobs"]:
            receipt = receipts[job["id"]]
            rows.append({
                "run_id": attempt["run_id"], "workflow_attempt": attempt["attempt"],
                "job_id": job["id"], "job": job["name"], "status": job["status"],
                "conclusion": job["conclusion"], "head_sha": run["head_sha"],
                "event": run["event"], "created_at": run["created_at"],
                "log": "fetched" if receipt["path"] else receipt["error"],
            })
    if not rows:
        raise SystemExit("inventory contains no app/e2e job or metadata-error rows")
    args.output.parent.mkdir(parents=True, exist_ok=True)
    with args.output.open("w", newline="") as handle:
        writer = csv.DictWriter(
            handle, fieldnames=list(rows[0]), dialect="excel-tab", lineterminator="\n"
        )
        writer.writeheader()
        writer.writerows(rows)
    fetched = sum(r["log"] == "fetched" for r in rows)
    skipped_errors = sum(
        r["status"] == "completed" and r["conclusion"] == "skipped" and r["log"] != "fetched"
        for r in rows
    )
    other_errors = sum(r["log"] != "fetched" for r in rows) - skipped_errors
    summary = {
        "window": data["contract"],
        "runs": len(data["runs"]),
        "workflow_attempts": len(data["attempts"]),
        "jobs": len(rows),
        "job_conclusions": {
            f"{job}:{conclusion}": count
            for (job, conclusion), count in sorted(Counter((r["job"], r["conclusion"]) for r in rows).items())
        },
        "logs_fetched": fetched,
        "skipped_job_log_errors": skipped_errors,
        "other_log_or_metadata_errors": other_errors,
    }
    args.output.with_suffix(".summary.json").write_text(json.dumps(summary, indent=2) + "\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
