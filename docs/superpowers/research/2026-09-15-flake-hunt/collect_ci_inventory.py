#!/usr/bin/env python3
"""Collect bounded CI inventory evidence through a fixed instant.

Metadata is fetched concurrently; job logs are capped at two downloads and
parsed one at a time. Raw inputs stay under the ignored evidence directory.
"""

from __future__ import annotations

import argparse
import concurrent.futures
import datetime as dt
import hashlib
import json
import os
import re
import subprocess
import sys
import tempfile
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

REPO = "JamesAwesome/Ergomatic"
WORKFLOW = "ci.yml"
JOB_NAMES = {"app", "e2e"}
INTERESTING = re.compile(
    r"(failed|flaky|retry|timed out|timeout|error:|fatal|out of memory|"
    r"heap|signal|killed|quotaexceeded|expect\(|assertionerror|401|"
    r"container.*(?:retry|failed|error)|testcontainers)", re.I
)
ANSI = re.compile(r"\x1b\[[0-9;]*[A-Za-z]")


class SafeRedirect(urllib.request.HTTPRedirectHandler):
    """Never forward GitHub credentials to the signed log-blob host."""

    def redirect_request(self, req, fp, code, msg, headers, newurl):
        redirected = super().redirect_request(req, fp, code, msg, headers, newurl)
        if redirected and urllib.parse.urlparse(newurl).netloc != urllib.parse.urlparse(req.full_url).netloc:
            redirected.remove_header("Authorization")
        return redirected


OPENER = urllib.request.build_opener(SafeRedirect())


def request(token: str, path: str, *, raw: bool = False):
    req = urllib.request.Request(
        f"https://api.github.com/{path}",
        headers={
            "Accept": "application/vnd.github+json",
            "Authorization": f"Bearer {token}",
            "X-GitHub-Api-Version": "2022-11-28",
            "User-Agent": "ergomatic-flake-inventory",
        },
    )
    response = OPENER.open(req, timeout=120)
    return response if raw else json.load(response)


def paged(token: str, path: str, key: str) -> list[dict]:
    rows: list[dict] = []
    page = 1
    join = "&" if "?" in path else "?"
    while True:
        body = request(token, f"{path}{join}per_page=100&page={page}")
        batch = body[key]
        rows.extend(batch)
        if len(batch) < 100:
            return rows
        page += 1


def fetch_attempt_jobs(token: str, run: dict, attempt: int) -> dict:
    try:
        jobs = paged(
            token,
            f"repos/{REPO}/actions/runs/{run['id']}/attempts/{attempt}/jobs?",
            "jobs",
        )
        return {
            "run_id": run["id"],
            "attempt": attempt,
            "jobs": [
                j for j in jobs
                if j["name"].lower() in JOB_NAMES and j.get("run_attempt") == attempt
            ],
            "error": None,
        }
    except Exception as exc:  # retained in manifest, not converted to absence
        return {
            "run_id": run["id"],
            "attempt": attempt,
            "jobs": [],
            "error": f"{type(exc).__name__}: {exc}",
        }


def download_log(token: str, job: dict, logs: Path) -> dict:
    target = logs / f"{job['id']}.log"
    completion = logs / f"{job['id']}.complete.json"
    temporary = None
    marker_temp = None
    try:
        if target.exists():
            if not completion.exists():
                raise ValueError("unverified legacy cache: no completion receipt; preserve and explicitly recollect if needed")
            saved = json.loads(completion.read_text())
            with target.open("rb") as handle:
                digest = hashlib.file_digest(handle, "sha256").hexdigest()
            if saved != {"job_id": job["id"], "bytes": target.stat().st_size, "sha256": digest, "complete": True}:
                raise ValueError("cached log differs from completed download receipt")
            return {"job_id": job["id"], "path": str(target), "cached": True, "error": None}
        with request(token, f"repos/{REPO}/actions/jobs/{job['id']}/logs", raw=True) as src:
            digest = hashlib.sha256()
            count = 0
            with tempfile.NamedTemporaryFile(dir=logs, prefix=f".{job['id']}-", delete=False) as dst:
                temporary = Path(dst.name)
                while chunk := src.read(1024 * 1024):
                    dst.write(chunk)
                    digest.update(chunk)
                    count += len(chunk)
            expected = getattr(src, "headers", {}).get("Content-Length")
            if expected is not None and count != int(expected):
                raise ValueError(f"incomplete transfer: expected {expected} bytes, got {count}")
        with tempfile.NamedTemporaryFile(mode="w", dir=logs, prefix=f".{job['id']}-", delete=False) as marker:
            marker_temp = Path(marker.name)
            json.dump({"job_id": job["id"], "bytes": count, "sha256": digest.hexdigest(), "complete": True}, marker)
        os.replace(temporary, target)
        os.replace(marker_temp, completion)
        return {"job_id": job["id"], "path": str(target), "cached": False, "error": None}
    except Exception as exc:
        return {"job_id": job["id"], "path": None, "cached": False, "error": f"{type(exc).__name__}: {exc}"}
    finally:
        for path in (temporary, marker_temp):
            if path is not None:
                path.unlink(missing_ok=True)


def parse_log(path: Path) -> dict:
    hits: list[dict] = []
    total = 0
    with path.open("r", encoding="utf-8", errors="replace") as handle:
        for number, raw_line in enumerate(handle, 1):
            total += 1
            line = ANSI.sub("", raw_line.rstrip())
            if INTERESTING.search(line):
                hits.append({"line": number, "text": line[-1200:]})
    return {"line_count": total, "interesting": hits}


def iso(value: str) -> dt.datetime:
    return dt.datetime.fromisoformat(value.replace("Z", "+00:00"))


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--start", required=True)
    parser.add_argument("--end", required=True)
    parser.add_argument("--evidence", required=True, type=Path)
    args = parser.parse_args()
    token = subprocess.check_output(["gh", "auth", "token"], text=True).strip()
    args.evidence.mkdir(parents=True, exist_ok=True)
    logs = args.evidence / "logs"
    logs.mkdir(exist_ok=True)

    old_manifest = args.evidence / "manifest.json"
    cached = json.loads(old_manifest.read_text()) if old_manifest.exists() else None
    if cached and cached.get("contract", {}).get("window_start") == args.start and cached.get("contract", {}).get("window_end") == args.end:
        runs = cached["runs"]
        attempts = cached["attempts"]
    else:
        created = urllib.parse.quote(f"{args.start}..{args.end}", safe=".:T-Z")
        runs = paged(token, f"repos/{REPO}/actions/workflows/{WORKFLOW}/runs?created={created}&", "workflow_runs")
        runs = [r for r in runs if iso(args.start) <= iso(r["created_at"]) <= iso(args.end)]
        units = [(run, attempt) for run in runs for attempt in range(1, run["run_attempt"] + 1)]
        with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
            attempts = list(pool.map(lambda x: fetch_attempt_jobs(token, *x), units))

    jobs_by_id = {job["id"]: job for attempt in attempts for job in attempt["jobs"]}
    jobs = list(jobs_by_id.values())
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
        receipts = list(pool.map(lambda job: download_log(token, job, logs), jobs))
    receipt_by_job = {r["job_id"]: r for r in receipts}

    parsed_dir = args.evidence / "parsed"
    parsed_dir.mkdir(exist_ok=True)
    parsed = {}
    for index, job in enumerate(jobs, 1):
        receipt = receipt_by_job[job["id"]]
        if receipt["path"]:
            result = parse_log(Path(receipt["path"]))
            parsed_path = parsed_dir / f"{job['id']}.json"
            parsed_path.write_text(json.dumps(result, indent=2) + "\n")
            parsed[str(job["id"])] = {
                "path": str(parsed_path),
                "line_count": result["line_count"],
                "interesting_count": len(result["interesting"]),
            }
        if index % 50 == 0:
            print(f"parsed {index}/{len(jobs)}", file=sys.stderr)

    manifest = {
        "contract": {
            "repository": REPO,
            "workflow": WORKFLOW,
            "window_start": args.start,
            "window_end": args.end,
            "job_names": sorted(JOB_NAMES),
            "download_concurrency": 2,
            "parse_concurrency": 1,
        },
        "runs": runs,
        "attempts": attempts,
        "log_receipts": receipts,
        "parsed": parsed,
    }
    (args.evidence / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    print(json.dumps({
        "runs": len(runs),
        "attempts": len(attempts),
        "jobs": len(jobs),
        "metadata_errors": sum(bool(a["error"]) for a in attempts),
        "log_errors": sum(bool(r["error"]) for r in receipts),
    }))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
