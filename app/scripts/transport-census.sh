#!/usr/bin/env bash
# Phase NF: every Transport implementation, decorator and factory must have
# an explicit scanTarget stance (forward when the inner has it, omit when it
# does not, implement, or document "no capability by design"). Prints one
# line per site so the PR record can carry a base-vs-head diff of THIS
# output rather than transcribed numbers (agent-briefing, "Plan authoring").
set -euo pipefail
cd "$(dirname "$0")/.."
echo "== scan() definers (implementations and decorators)"
grep -rn "async scan()\|scan(): Promise<DiscoveredMonitor\[\]>\|^    scan,$\|scan: () => fake.scan()" src/monitor/transports src/adapters --include='*.ts' | grep -v "\.test\.ts" || true
echo "== scanTarget stances"
grep -rn "scanTarget" src/monitor/transports src/adapters --include='*.ts' | grep -v "\.test\.ts" || true
echo "== call sites outside the transport layer"
grep -rn "\.scan()\|\.scanTarget(" src --include='*.ts' --include='*.tsx' | grep -v "\.test\." | grep -v "src/monitor/transports/" || true
