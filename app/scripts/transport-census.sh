#!/usr/bin/env bash
# Phase NF: every Transport implementation, decorator and factory must have
# an explicit scanTarget stance (forward when the inner has it, omit when it
# does not, implement, or document "no capability by design"). Prints one
# line per site so the PR record can carry a base-vs-head diff of THIS
# output rather than transcribed numbers (agent-briefing, "Plan authoring"),
# and then GATES: a transport file with no `scanTarget` mention has no
# stance, and the script exits non-zero (wired into `pnpm lint`; review
# SF4 found it as a printer nothing ran).
set -euo pipefail
cd "$(dirname "$0")/.."
echo "== scan() definers (implementations and decorators)"
grep -rn "async scan()\|scan(): Promise<DiscoveredMonitor\[\]>\|^    scan,$\|scan: () => fake.scan()" src/monitor/transports src/adapters --include='*.ts' | grep -v "\.test\.ts" || true
echo "== scanTarget stances"
grep -rn "scanTarget" src/monitor/transports src/adapters --include='*.ts' | grep -v "\.test\.ts" || true
echo "== call sites outside the transport layer"
grep -rn "\.scan()\|\.scanTarget(" src --include='*.ts' --include='*.tsx' | grep -v "\.test\." | grep -v "src/monitor/transports/" || true
echo "== gate: every transport file names a scanTarget stance"
missing=0
for f in src/monitor/transports/*.ts src/adapters/monitorTransport.ts; do
  case "$f" in *.test.ts) continue ;; esac
  if ! grep -q "scanTarget" "$f"; then
    echo "NO STANCE: $f"
    missing=1
  fi
done
if [ "$missing" -ne 0 ]; then
  echo "transport-census: FAIL (a transport file has no scanTarget stance)"
  exit 1
fi
echo "transport-census: OK"
