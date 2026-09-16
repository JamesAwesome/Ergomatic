"""Offline tiny fixtures for collection completion and exhaustive title export."""
import csv
import importlib.util
import io
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

HERE = Path(__file__).parent
spec = importlib.util.spec_from_file_location("collector", HERE / "collect_ci_inventory.py")
collector = importlib.util.module_from_spec(spec)
spec.loader.exec_module(collector)


class BrokenDownload(io.BytesIO):
    def read(self, size=-1):
        if self.tell():
            raise OSError("fabricated interrupted transfer")
        return super().read(3)


class InventoryFixtures(unittest.TestCase):
    def test_cache_requires_completed_transfer_and_valid_bytes(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            with patch.object(collector, "request", return_value=BrokenDownload(b"partial")):
                self.assertIn("interrupted", collector.download_log("unused", {"id": 7}, root)["error"])
            self.assertFalse((root / "7.log").exists())
            (root / "7.log").write_bytes(b"legacy truncated cache")
            with patch.object(collector, "request", side_effect=AssertionError("no implicit legacy redownload")):
                receipt = collector.download_log("unused", {"id": 7}, root)
                self.assertIsNotNone(receipt["error"], "nonempty is not completion")
            (root / "7.log").unlink()
            with patch.object(collector, "request", return_value=io.BytesIO(b"complete log")):
                self.assertIsNone(collector.download_log("unused", {"id": 7}, root)["error"])
            with patch.object(collector, "request", side_effect=AssertionError("completed cache should be reused")):
                self.assertTrue(collector.download_log("unused", {"id": 7}, root)["cached"])
                (root / "7.log").write_bytes(b"corrupt")
                self.assertIsNotNone(collector.download_log("unused", {"id": 7}, root)["error"])

    def test_exports_unclassified_app_and_exhausted_e2e_beside_recovery(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            app = root / "1.log"
            app.write_text("timestamp FAIL client WorkoutDetail.test.tsx > still navigates when preferences errored\nAssertionError: expected [ false ] to strictly equal []\n")
            e2e = root / "2.log"
            e2e.write_text("  1) [chromium] › e2e/design.spec.ts:1:1 › unknown final failure\n Error: bad layout\n  2) [chromium] › e2e/stats.spec.ts:2:1 › recovery\n Error: first failure\n  1 failed\n    [chromium] › e2e/design.spec.ts:1:1 › unknown final failure\n  1 flaky\n    [chromium] › e2e/stats.spec.ts:2:1 › recovery\n")
            (root / "manifest.json").write_text(json.dumps({
                "runs": [{"id": 10, "head_sha": "abc"}],
                "attempts": [{"run_id": 10, "attempt": 1, "jobs": [{"id": 1, "name": "app", "conclusion": "failure"}, {"id": 2, "name": "e2e", "conclusion": "failure"}]}],
                "log_receipts": [{"job_id": 1, "path": str(app)}, {"job_id": 2, "path": str(e2e)}],
            }))
            output = root / "events.tsv"
            subprocess.run([sys.executable, "-B", str(HERE / "extract_failure_events.py"), "--evidence", str(root), "--output", str(output)], check=True)
            with output.open() as handle:
                rows = list(csv.DictReader(handle, delimiter="\t"))
            self.assertEqual(len(rows), 3)
            self.assertEqual({r["outcome"] for r in rows}, {"job_failed", "retries_exhausted", "retry_recovered"})
            self.assertTrue(any("still navigates" in r["title"] for r in rows))
            summary = json.loads(output.with_suffix(".summary.json").read_text())
            self.assertEqual(summary["recovered_and_exhausted_jobs"], [2])
            self.assertNotIn(b"\r", output.read_bytes())


if __name__ == "__main__":
    unittest.main()
