"""Replay the deployment plan's Compose interpolation check with synthetic data."""
import json
import os
from pathlib import Path
import re
import subprocess
import tempfile

root = Path(__file__).resolve().parents[4]
plan = (root / "docs/superpowers/plans/2026-09-13-apple-deployment.md").read_text()
names = [
    "FRONT_DOOR_ENABLED", "APPLE_NATIVE_CLIENT_ID", "APPLE_WEB_CLIENT_ID",
    "APPLE_TEAM_ID", "APPLE_KEY_ID", "APPLE_PRIVATE_KEY",
]
with tempfile.TemporaryDirectory(prefix="apple-compose-proof-") as directory:
    scratch = Path(directory)
    for filename, language in [("compose.yml", "yaml"), (".env.example", "dotenv")]:
        matches = re.findall(r"```" + language + r"\n(.*?)\n```", plan, re.S)
        assert len(matches) == 1, (filename, len(matches))
        (scratch / filename).write_text(matches[0] + "\n")
    environment = {k: v for k, v in os.environ.items() if k not in names}
    environment["POSTGRES_PASSWORD"] = "synthetic-apple-proof-password"

    def resolve(envfile):
        completed = subprocess.run([
            "docker", "compose", "--project-directory", str(root),
            "--env-file", str(envfile), "-f", str(scratch / "compose.yml"),
            "config", "--format", "json",
        ], env=environment, text=True, capture_output=True)
        # Never print resolved configuration or tool stderr: it may contain keys.
        assert completed.returncode == 0, "Compose interpolation failed"
        return json.loads(completed.stdout)["services"]

    defaults = resolve(scratch / ".env.example")
    key = subprocess.run([
        "openssl", "genpkey", "-algorithm", "EC", "-pkeyopt", "ec_paramgen_curve:P-256",
    ], check=True, text=True, capture_output=True).stdout
    expected = {
        "FRONT_DOOR_ENABLED": "1",
        "APPLE_NATIVE_CLIENT_ID": "test.synthetic.native",
        "APPLE_WEB_CLIENT_ID": "test.synthetic.web",
        "APPLE_TEAM_ID": "TESTTEAM12",
        "APPLE_KEY_ID": "TESTKEY123",
        "APPLE_PRIVATE_KEY": key,
    }
    fixture = scratch / "synthetic.env"
    fixture.write_text("\n".join(
        name + "=" + json.dumps(value) for name, value in expected.items()
    ) + "\n")
    configured = resolve(fixture)
    receipt = {
        "default_disabled": defaults["api"]["environment"]["FRONT_DOOR_ENABLED"] == "",
        "api_only": all(
            not any(name in service.get("environment", {}) for name in names)
            and not any(name in service.get("build", {}).get("args", {}) for name in names)
            for service_name, service in configured.items() if service_name != "api"
        ),
        "quoted_pem_newlines_preserved": configured["api"]["environment"]["APPLE_PRIVATE_KEY"] == key,
        "all_explicit_values_preserved": all(
            configured["api"]["environment"][name] == value for name, value in expected.items()
        ),
        "services_started": False,
        "real_credentials_used": False,
    }
    assert all(receipt[name] for name in [
        "default_disabled", "api_only", "quoted_pem_newlines_preserved",
        "all_explicit_values_preserved",
    ]), "Configuration transport contract failed"
    print(json.dumps(receipt, indent=2))
