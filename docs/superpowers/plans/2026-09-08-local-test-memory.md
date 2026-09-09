# Local Test Memory Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop local test runs from being killed for memory, and make the kill announce itself so nobody retries it as flake.

**Architecture:** A bash wrapper owns every local Vitest invocation, reads the child's exit status deterministically (via `PIPESTATUS`, never a pipe tail), and prints one of three verdicts. Worker caps land as env-overridable config defaults that are inert under CI. The pre-push gate narrows to `--changed` plus an unconditional second invocation for the whole-tree gates `--changed` structurally cannot select.

**Tech Stack:** bash 3.2.57, Vitest 4.1.11, Playwright, husky, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-09-08-local-test-memory-design.md` — read it alongside this plan; every task below argues from it.

## Global Constraints

- **Bash is 3.2.57** (`/bin/bash`, the only bash on the machine). No `mapfile`, no associative arrays, no `${var,,}`. Nothing enforces this in CI; the implementer is the gate.
- **`.husky` hook bodies run under `sh -e`** (`.husky/_/h` line 19: `sh -e "$s" "$@"`). Every fallible command in a hook is wrapped in `if`/`||`, including command substitutions. A bare failing statement aborts the hook.
- **Never invoke Vitest through `pnpm exec`** in anything this plan writes: it collapses a signal death to exit 1. Use `node_modules/.bin/vitest` (a signal-preserving `exec` shim) or `pnpm run`.
- **The classifier's needle is `Allocation failed`** — matching exactly the 2 fatal V8 OOM strings in the Node binary. Not `out of memory`, which matches 14 including recoverable `ERR_HTTP2_NO_MEM` and wasm errors.
- **`NODE_OPTIONS=--no-experimental-webstorage` must survive every path.** Dropping it costs 1582 false failures. Duplicate `--max-old-space-size` is last-wins, so the wrapper's value goes FIRST and the caller's `${NODE_OPTIONS:-}` after.
- **No `prettier --write`** on root markdown or anything under `docs/` — they are formatted by nothing, and reflowing buries the edit.
- **Worktree only.** Run `git rev-parse --show-toplevel` before every commit and confirm it prints the worktree path. Run `pnpm install` at the worktree root AND in `app/`, then verify hooks fire, before relying on them.

---

## A correction to the spec, to apply in Task 1

The approved spec's rule 1 reads **"exit ≥ 128 → memory banner"**. Measured, that is too broad and would commit the over-claim the spec guards against elsewhere (recurring failure 26):

```
SIGINT   -> exit 130     # Ctrl-C. The operator did this deliberately.
SIGTERM  -> exit 143     # a timeout or a supervisor
SIGABRT  -> exit 134     # V8 fatal, including OOM
SIGKILL  -> exit 137     # the OS, including a memory kill
```

Under the spec as written, **every Ctrl-C prints `MEMORY KILL`**. Task 1 implements the split below and Task 6 reconciles the spec text; do not implement rule 1 verbatim.

| Exit | Verdict |
| --- | --- |
| 130 (SIGINT) | **silent** — a deliberate interrupt is not a finding |
| 134, 137 | memory banner |
| any other ≥ 128 | signal banner: killed, not flake, cause not memory |
| — | then rule 2, then rule 3 |

---

## File Structure

| File | Responsibility |
| --- | --- |
| `app/scripts/test-run.sh` | CREATE. Runs Vitest, classifies the exit, prints a verdict, propagates the code. The only file that knows the classification rules. |
| `app/scripts/test-run.test.sh` | CREATE. Fixture-per-row gate for the classifier. Runs in CI. |
| `app/scripts/test-kill-capture.sh` | CREATE. Writes one forensic file per classified kill. Sourced by the wrapper so the wrapper stays readable. |
| `app/scripts/test-run-advisory.sh` | CREATE. Preflight peer/memory advisory + pidfile lifetime. Sourced by the wrapper. Never fails a run. |
| `app/scripts/measure-test-memory.sh` | CREATE. Peak-RSS sampler (spec appendix, verbatim). |
| `app/scripts/count-test-workers.sh` | CREATE. Path-scoped worker counter (spec appendix, verbatim). |
| `app/vitest.config.ts` | MODIFY. `maxWorkers` default 4, env-overridable, inert under CI. |
| `app/playwright.config.ts` | MODIFY. `workers` default 2, same shape. |
| `app/scripts/testEnv.ts` | CREATE. `isCI` + `workerCap`, shared by both configs so the two cannot drift. Lives under `scripts/` because that is what the `unit` project's include globs collect — at `app/testEnv.test.ts` it would match NO project, and `passWithNoTests` would render its absence as a pass. |
| `app/package.json` | MODIFY. Route `test`, `test:coverage`, `test:watch` through the wrapper; add `test:full`. |
| `.husky/pre-push` | MODIFY. Ref guard, two invocations, `sh -e`-safe. |
| `.github/workflows/ci.yml` | MODIFY. Named step for `test-run.test.sh`. |
| `.gitignore` | MODIFY. Ignore `app/.test-kills/`. |
| `CLAUDE.md`, `.claude/agent-briefing.md`, `docs/TESTING.md`, `README.md` | MODIFY. RF37 + the five-site e2e amendment. |

---

### Task 1: The classifier, its gate, and the package.json wiring

**Files:**
- Create: `app/scripts/test-run.sh`
- Create: `app/scripts/test-run.test.sh`
- Modify: `app/package.json` (scripts block)
- Modify: `.github/workflows/ci.yml` (add a named step to the `scripts` job)

**Interfaces:**
- Consumes: nothing.
- Produces: `app/scripts/test-run.sh`, invoked as `bash scripts/test-run.sh [vitest args...]`. Exits with the child's code. Sources `test-kill-capture.sh` and `test-run-advisory.sh` **if they exist** (Tasks 2 and 3 add them), so this task is independently shippable. Exports `TEST_RUN_VERDICT` (`memory` | `signal` | `incomplete` | empty) for those sourced files to read.

- [ ] **Step 1: Write the failing gate**

Create `app/scripts/test-run.test.sh`. It drives the classifier through a fake child so no real suite is needed:

```bash
#!/usr/bin/env bash
# Gate for test-run.sh's exit classifier. Runs in CI's `scripts` job.
#
# The invariant: a run that was KILLED never reads as a test failure, and a
# run that merely FAILED is never promoted to a memory verdict (RF26). Each
# case below drives the classifier with a fake child that reproduces one
# real signature; the "no banner" rows are what stop the over-claim.
set -uo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
fails=0

check() { # name, expected-substring-or-EMPTY, actual
  if [ "$2" = "EMPTY" ]; then
    if [ -z "$3" ]; then echo "ok    $1"; else echo "FAIL  $1 -- expected no banner, got: $3"; fails=$((fails+1)); fi
  else
    case "$3" in
      *"$2"*) echo "ok    $1" ;;
      *) echo "FAIL  $1 -- expected '$2', got: $3"; fails=$((fails+1)) ;;
    esac
  fi
}

# Runs the classifier against a fake child. $1=exit code, $2=stdout, $3=stderr.
# Returns only the banner lines (those starting with '!!').
classify() {
  FAKE_RC="$1" FAKE_OUT="$2" FAKE_ERR="$3" \
    bash "$HERE/test-run.sh" --self-test 2>&1 | grep '^!!' || true
}

SUMMARY=" Test Files  1 passed (1)"

check "134 SIGABRT is a memory kill"        "MEMORY KILL"          "$(classify 134 "" "")"
check "137 SIGKILL is a memory kill"        "MEMORY KILL"          "$(classify 137 "" "")"
check "130 SIGINT is silent (Ctrl-C)"       "EMPTY"                "$(classify 130 "" "")"
check "143 SIGTERM is a signal, not memory" "KILLED BY SIGNAL"     "$(classify 143 "" "")"
check "fork OOM: exit 1 WITH a summary"     "MEMORY KILL"          "$(classify 1 "$SUMMARY" "FATAL ERROR: Reached heap limit Allocation failed - JavaScript heap out of memory")"
check "third V8 string, no 'heap' wording"  "MEMORY KILL"          "$(classify 1 "$SUMMARY" "FATAL ERROR: Allocation failed - process out of memory")"
check "non-zero, no summary => incomplete"  "SUITE DID NOT COMPLETE" "$(classify 1 "" "node: --bogus is not allowed in NODE_OPTIONS")"
check "a real test failure is not a kill"   "EMPTY"                "$(classify 1 " Test Files  1 failed (1)" "")"
check "a clean pass says nothing"           "EMPTY"                "$(classify 0 "$SUMMARY" "")"
check "empty --changed selection"           "EMPTY"                "$(classify 0 "No test files found, exiting with code 0" "")"
check "caught ERR_HTTP2_NO_MEM not promoted" "EMPTY"               "$(classify 1 " Test Files  1 failed (1)" "Error [ERR_HTTP2_NO_MEM]: Out of memory")"
# Deliberately LOWERCASE. The line above says "Out of memory" with a capital
# O, so it cannot catch an over-broad `grep -qF "out of memory"` needle --
# it would miss on case rather than on correctness, and pass for the wrong
# reason. Verified: with only the capital-O row, the over-match mutation
# does NOT bite; with this row it does.
check "lowercase 'out of memory' not promoted" "EMPTY"              "$(classify 1 " Test Files  1 failed (1)" "MEMALLOC: Error allocating memory, we are most likely out of memory")"

if [ "$fails" -ne 0 ]; then echo "$fails failure(s)"; exit 1; fi
echo "all classifier cases pass"
```

- [ ] **Step 2: Run it and watch it fail**

Run: `bash app/scripts/test-run.test.sh`
Expected: FAIL — `test-run.sh: No such file or directory`, non-zero exit.

- [ ] **Step 3: Write the wrapper**

Create `app/scripts/test-run.sh`:

```bash
#!/usr/bin/env bash
# Runs Vitest and says plainly when the run was KILLED rather than failed.
#
# Why this exists: a killed run and a flaky test look alike unless you read
# the exit status, and the status only survives on a signal-preserving
# invocation. `pnpm exec` collapses 134/137 to 1 -- measured -- so this
# script calls node_modules/.bin/vitest directly. See the spec's
# "The signal exists, and two things destroy it".
set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_ROOT="$(cd "$HERE/.." && pwd)"

# --no-experimental-webstorage FIRST so a caller's later --max-old-space-size
# wins (duplicate flags are last-wins). ${NODE_OPTIONS:-} because set -u.
NODE_OPTIONS="--no-experimental-webstorage ${NODE_OPTIONS:-}"
export NODE_OPTIONS

OUT="$(mktemp)"; ERR="$(mktemp)"
# ONE trap for the whole script. A second `trap ... EXIT` REPLACES the first
# (verified), and Task 3 sources an advisory that needs cleanup too -- so it
# sets _PEER_FILE rather than trapping. ${_PEER_FILE:-} because set -u.
_cleanup() { rm -f "$OUT" "$ERR" "${_PEER_FILE:-}" 2>/dev/null; }
trap _cleanup EXIT

if [ "${1:-}" = "--self-test" ]; then
  # Gate hook: classify a fabricated child instead of running Vitest.
  rc="${FAKE_RC:-0}"
  printf '%s' "${FAKE_OUT:-}" > "$OUT"
  printf '%s' "${FAKE_ERR:-}" > "$ERR"
else
  [ -f "$HERE/test-run-advisory.sh" ] && . "$HERE/test-run-advisory.sh"
  # stdout streams live via tee; stderr is captured and replayed after.
  # On a clean run stderr is empty (measured: 260 bytes stdout, 0 stderr),
  # so nothing useful is deferred. PIPESTATUS[0] -- NOT $? -- because a
  # pipe's status is its tail's, which makes a SIGKILL read as exit 0.
  "$APP_ROOT/node_modules/.bin/vitest" run "$@" 2>"$ERR" | tee "$OUT"
  rc=${PIPESTATUS[0]}
  cat "$ERR" >&2
fi

# Rules in order, first match wins. 130 is a deliberate Ctrl-C and is silent.
TEST_RUN_VERDICT=""
if [ "$rc" -eq 130 ]; then
  TEST_RUN_VERDICT=""
elif [ "$rc" -eq 134 ] || [ "$rc" -eq 137 ]; then
  TEST_RUN_VERDICT="memory"
elif [ "$rc" -ge 128 ]; then
  TEST_RUN_VERDICT="signal"
elif grep -qF "Allocation failed" "$ERR"; then
  TEST_RUN_VERDICT="memory"          # the fork case: exit 1 WITH a summary
elif [ "$rc" -ne 0 ] && ! grep -qF "Test Files" "$OUT"; then
  TEST_RUN_VERDICT="incomplete"
fi
export TEST_RUN_VERDICT

DETAIL=""
if [ -n "$TEST_RUN_VERDICT" ] && [ -f "$HERE/test-kill-capture.sh" ]; then
  . "$HERE/test-kill-capture.sh"     # sets DETAIL to the capture path
fi

case "$TEST_RUN_VERDICT" in
  memory)
    echo "!! MEMORY KILL -- the suite ran out of memory and did not complete." >&2
    echo "!! NOT a flaky test. Do not re-run it.${DETAIL:+ Details: $DETAIL}" >&2 ;;
  signal)
    echo "!! KILLED BY SIGNAL $((rc - 128)) -- the suite did not complete." >&2
    echo "!! NOT a flaky test, and not a memory kill.${DETAIL:+ Details: $DETAIL}" >&2 ;;
  incomplete)
    echo "!! SUITE DID NOT COMPLETE -- no test summary was printed." >&2
    echo "!! NOT a flaky test, and not necessarily memory. Read the output above." >&2 ;;
esac

exit "$rc"
```

- [ ] **Step 4: Run the gate and watch it pass**

Run: `bash app/scripts/test-run.test.sh`
Expected: 12 `ok` lines, `all classifier cases pass`, exit 0.

- [ ] **Step 5: Prove the gate bites (RF21)**

Make each mutation, run the gate, confirm the named case fails, then revert. Record what each failure said.

**All four have been run against the prescribed implementation and
observed to fail the named case**; the fifth is verified by hand in Step 6.

| Mutation | Case that must fail |
| --- | --- |
| Change the needle to `JavaScript heap out of memory` | "third V8 string, no 'heap' wording" |
| Change the needle to `out of memory` | "lowercase 'out of memory' not promoted" — **not** the capital-O row, which misses on case |
| Add `&& ! grep -qF "Test Files" "$OUT"` to the `Allocation failed` branch | "fork OOM: exit 1 WITH a summary" |
| Change `-eq 130` to `-eq 129` | "130 SIGINT is silent (Ctrl-C)" |
| Change `rc=${PIPESTATUS[0]}` to `rc=$?` | (not covered by the gate — verify by hand in Step 6) |

- [ ] **Step 6: Prove the pipeline status by hand**

Run, exactly as written — **without** `pipefail`, and reading both values in
one command:

```bash
bash -c 'node -e "process.kill(process.pid,\"SIGKILL\")" 2>/dev/null | tee /dev/null; echo "PIPESTATUS[0]=${PIPESTATUS[0]}  dollar-question=$?"'
```

Expected: `PIPESTATUS[0]=137  dollar-question=0` — they differ, which is
exactly why the wrapper reads the former.

**Two traps in this probe, both of which defeated an earlier version of it:**

- **Do not set `pipefail` in the probe.** With it, `$?` becomes 137 too and
  the two coincide, so the probe demonstrates nothing. (The wrapper itself
  *does* set `pipefail` — belt and braces — but the probe exists to show why
  `PIPESTATUS[0]` is load-bearing on its own.)
- **Read both in the SAME command.** Any intervening command, `st=$?`
  included, resets `PIPESTATUS` — so a probe that stashes the exit code first
  reads `PIPESTATUS[0]=0` and looks like the opposite result.

- [ ] **Step 7: Wire package.json**

In `app/package.json`, replace the three test scripts and add a fourth. Note `test:full` is today's `test` verbatim, and that `NODE_OPTIONS` is no longer set here because the wrapper owns it:

```json
"test": "bash scripts/test-run.sh",
"test:full": "bash scripts/test-run.sh",
"test:watch": "NODE_OPTIONS=--no-experimental-webstorage vitest",
"test:coverage": "bash scripts/test-run.sh --coverage",
```

**`test:watch` deliberately does NOT route through the wrapper**, narrowing
the spec's A1 sentence. Watch mode is an interactive, long-lived TTY session;
the wrapper pipes stdout through `tee` and defers stderr, which would break
the live reporter — and a watch run is by definition being watched by a human
who sees the kill. Task 6 records the narrowing in the spec.

- [ ] **Step 8: Verify the wiring end to end**

Run: `cd app && pnpm test --project unit`
Expected: the unit suite passes, exit 0, no banner.

Run: `cd app && NODE_OPTIONS=--max-old-space-size=48 pnpm test --project client`
Expected: a `!! MEMORY KILL` banner and a non-zero exit. This is the end-to-end proof that the wrapper's NODE_OPTIONS ordering lets a caller impose a cap.

- [ ] **Step 9: Add the CI step**

In `.github/workflows/ci.yml`, in the `scripts` job, after the ios-release step:

```yaml
      - name: Lint + test the test-run classifier
        run: |
          bash -n app/scripts/test-run.sh
          bash app/scripts/test-run.test.sh
```

That job is `ubuntu-latest` and has no `pnpm install`, which is why the gate drives the classifier through `--self-test` rather than a real suite.

- [ ] **Step 10: Commit**

```bash
git rev-parse --show-toplevel   # MUST print the worktree path
git add app/scripts/test-run.sh app/scripts/test-run.test.sh app/package.json .github/workflows/ci.yml
git commit -m "Phase MEM: a killed test run says so instead of reading as flake"
```

---

### Task 2: The kill capture

**Files:**
- Create: `app/scripts/test-kill-capture.sh`
- Modify: `.gitignore`
- Modify: `app/scripts/test-run.test.sh` (two new cases)

**Interfaces:**
- Consumes: `TEST_RUN_VERDICT`, `rc`, `OUT`, `ERR`, `APP_ROOT` from `test-run.sh`'s scope (it is sourced, not executed).
- Produces: sets `DETAIL` to the absolute path of the file it wrote, or leaves it empty on any failure.

- [ ] **Step 1: Write the failing cases**

Append to `app/scripts/test-run.test.sh`, before the final `if [ "$fails" -ne 0 ]`:

```bash
# --- capture (Task 2) ---
CAPDIR="$(cd "$HERE/.." && pwd)/.test-kills"
rm -rf "$CAPDIR"
classify 137 "" "" >/dev/null
n=$(ls -1 "$CAPDIR" 2>/dev/null | wc -l | tr -d ' ')
check "a kill writes exactly one capture file" "1" "$n"
body="$(cat "$CAPDIR"/* 2>/dev/null)"
check "the capture names the exit code"        "exit=137"  "$body"
check "the capture names the signal"           "signal=9"  "$body"
rm -rf "$CAPDIR"

# A capture failure must never change the command's exit code.
mkdir -p "$CAPDIR" && chmod 500 "$CAPDIR"
FAKE_RC=137 bash "$HERE/test-run.sh" --self-test >/dev/null 2>&1
check "an unwritable capture dir still exits 137" "137" "$?"
chmod 700 "$CAPDIR"; rm -rf "$CAPDIR"
```

- [ ] **Step 2: Run it and watch it fail**

Run: `bash app/scripts/test-run.test.sh`
Expected: FAIL on "a kill writes exactly one capture file" — expected `1`, got `0`.

- [ ] **Step 3: Write the capture**

Create `app/scripts/test-kill-capture.sh`:

```bash
# Sourced by test-run.sh when a run is classified as killed. Writes one
# forensic file so the NEXT real kill answers what the spec could not:
# whether these runs die to a per-process V8 limit or to machine pressure.
#
# Anchored on APP_ROOT, never on cwd: `pnpm run` sets cwd to the package
# dir, so a relative "app/.test-kills" resolves to app/app/.test-kills
# there while being correct from the repo root.
#
# Every operation is swallowed. A capture that cannot be written must
# never change the exit code of the command being captured.
DETAIL=""
_cap_dir="$APP_ROOT/.test-kills"
if mkdir -p "$_cap_dir" 2>/dev/null; then
  _cap_file="$_cap_dir/$(date +%Y%m%dT%H%M%S)-$$.txt"
  {
    echo "verdict=$TEST_RUN_VERDICT"
    echo "exit=$rc"
    [ "$rc" -ge 128 ] && echo "signal=$((rc - 128))"
    echo "date=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
    echo "argv=$*"
    echo "--- stderr (last 40) ---"
    tail -40 "$ERR" 2>/dev/null
    echo "--- vm_stat ---"
    vm_stat 2>/dev/null
    echo "--- swap ---"
    sysctl vm.swapusage 2>/dev/null
    echo "--- memorystatus kills (last 5m) ---"
    # /usr/bin/log, not `log`: it resolves to a shell builtin in some shells.
    /usr/bin/log show --last 5m --predicate 'eventMessage CONTAINS "memorystatus: killing"' 2>/dev/null | tail -20
  } > "$_cap_file" 2>/dev/null && DETAIL="$_cap_file"
fi
```

- [ ] **Step 4: Run the gate and watch it pass**

Run: `bash app/scripts/test-run.test.sh`
Expected: all cases `ok`, including the four new ones.

- [ ] **Step 5: Prove the capture is ignored by git**

```bash
mkdir -p app/.test-kills && : > app/.test-kills/probe.txt
git check-ignore -v app/.test-kills/probe.txt   # expect exit 0 AFTER the next step
```

Add to `.gitignore`:

```
# Forensics written by app/scripts/test-run.sh on a killed run. Local only —
# the SDLC teardown gate checks `git status` on the main checkout, so an
# un-ignored capture directory would trip it on the first real memory kill.
app/.test-kills/
```

Re-run `git check-ignore -v app/.test-kills/probe.txt` — expect exit 0 and the rule printed. Then `rm -rf app/.test-kills`.

- [ ] **Step 6: Verify the path anchor**

Run: `cd app && pnpm test --project unit` then `cd .. && bash app/scripts/test-run.sh --project unit`
Expected: neither creates `app/app/`. Confirm with `test ! -d app/app && echo ok`.

- [ ] **Step 7: Commit**

```bash
git rev-parse --show-toplevel
git add app/scripts/test-kill-capture.sh app/scripts/test-run.test.sh .gitignore
git commit -m "Phase MEM: capture the evidence the next real kill will carry"
```

---

### Task 3: The preflight advisory

**Files:**
- Create: `app/scripts/test-run-advisory.sh`
- Create: `app/scripts/test-run-advisory.test.sh`
- Modify: `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: `APP_ROOT` from `test-run.sh`'s scope.
- Produces: prints a NOTE to stderr when peers are live; registers this run's entry and removes it via an `EXIT` trap. Never exits non-zero, never blocks.

- [ ] **Step 1: Write the failing gate**

Create `app/scripts/test-run-advisory.test.sh`:

```bash
#!/usr/bin/env bash
# Gate for the preflight advisory's LIFETIME rules (RF27). The invariant is
# not the wording: it is that the advisory never blocks, never fails a run,
# and never mistakes a reused pid for a live peer.
set -uo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
fails=0
check() { if [ "$2" = "$3" ]; then echo "ok    $1"; else echo "FAIL  $1 -- expected '$2' got '$3'"; fails=$((fails+1)); fi; }

DIR="$(mktemp -d)"; export ERGOMATIC_TEST_PEERDIR="$DIR"
APP_ROOT="$(cd "$HERE/.." && pwd)"

# A live peer is reported.
sleep 30 & peer=$!
started="$(ps -o lstart= -p $peer | tr -s ' ')"
printf 'pid=%s\nstarted=%s\nworktree=/somewhere/else\n' "$peer" "$started" > "$DIR/$peer.peer"
out="$( . "$HERE/test-run-advisory.sh" 2>&1 )"
case "$out" in *"another Ergomatic test run is live"*) r=0 ;; *) r=1 ;; esac
check "a live peer is reported" "0" "$r"
kill $peer 2>/dev/null; wait $peer 2>/dev/null

# A dead pid is swept, not reported.
printf 'pid=999999\nstarted=whenever\nworktree=/x\n' > "$DIR/999999.peer"
out="$( . "$HERE/test-run-advisory.sh" 2>&1 )"
case "$out" in *"another Ergomatic test run is live"*) r=1 ;; *) r=0 ;; esac
check "a dead pid is not reported" "0" "$r"
check "a dead pid's entry is swept" "0" "$([ -f "$DIR/999999.peer" ] && echo 1 || echo 0)"

# PID REUSE: a live pid whose start time differs is NOT a peer.
sleep 30 & other=$!
printf 'pid=%s\nstarted=Thu Jan  1 00:00:00 1970\nworktree=/x\n' "$other" > "$DIR/$other.peer"
out="$( . "$HERE/test-run-advisory.sh" 2>&1 )"
case "$out" in *"another Ergomatic test run is live"*) r=1 ;; *) r=0 ;; esac
check "a reused pid is not a live peer" "0" "$r"
kill $other 2>/dev/null; wait $other 2>/dev/null

# An unreadable peer dir must be silent and must not fail.
export ERGOMATIC_TEST_PEERDIR=/proc/nonexistent/nope
( . "$HERE/test-run-advisory.sh" ) >/dev/null 2>&1
check "an unusable peer dir does not fail the run" "0" "$?"

rm -rf "$DIR"
if [ "$fails" -ne 0 ]; then echo "$fails failure(s)"; exit 1; fi
echo "all advisory cases pass"
```

- [ ] **Step 2: Run it and watch it fail**

Run: `bash app/scripts/test-run-advisory.test.sh`
Expected: FAIL — `test-run-advisory.sh: No such file or directory`.

- [ ] **Step 3: Write the advisory**

Create `app/scripts/test-run-advisory.sh`:

```bash
# Sourced by test-run.sh before the suite starts. Warns that another run is
# live; never blocks (James, 2026-09-08).
#
# One file per run, not one shared file: a shared file cannot represent two
# live peers, and its "ignore and rewrite" step is the operation that erases
# a live one. Identity is (pid, start time, worktree) because pid alone is a
# heuristic -- this machine forks 4-10 workers per run, so reuse is real.
_peer_dir="${ERGOMATIC_TEST_PEERDIR:-/tmp/ergomatic-test-runs}"
if mkdir -p "$_peer_dir" 2>/dev/null; then
  _live=0
  for _f in "$_peer_dir"/*.peer; do
    [ -f "$_f" ] || continue
    _pid=""; _started=""; _wt=""
    while IFS='=' read -r _k _v; do
      case "$_k" in pid) _pid="$_v" ;; started) _started="$_v" ;; worktree) _wt="$_v" ;; esac
    done < "$_f"
    [ -n "$_pid" ] || { rm -f "$_f" 2>/dev/null; continue; }
    _now="$(ps -o lstart= -p "$_pid" 2>/dev/null | tr -s ' ')"
    if [ -z "$_now" ] || [ "$_now" != "$_started" ]; then
      rm -f "$_f" 2>/dev/null            # dead, or the pid was reused
      continue
    fi
    _live=$((_live + 1))
    echo "NOTE: another Ergomatic test run is live (pid $_pid, $_wt, started $_started)." >&2
  done
  if [ "$_live" -gt 0 ]; then
    _free="$(vm_stat 2>/dev/null | awk '/Pages free/{gsub(/\./,"",$3); printf "%d MB", $3*16384/1048576}')"
    _swap="$(sysctl -n vm.swapusage 2>/dev/null | awk '{print $6" / "$3}')"
    # workers= is the only place the cap actually in force becomes visible.
    _w="${ERGOMATIC_TEST_WORKERS:-4}"
    echo "      Free ${_free:-unknown}, swap ${_swap:-unknown}, workers=${_w}. Consider a scoped run." >&2
  fi
  _me="$_peer_dir/$$.peer"
  {
    echo "pid=$$"
    echo "started=$(ps -o lstart= -p $$ 2>/dev/null | tr -s ' ')"
    echo "worktree=${APP_ROOT:-unknown}"
  } > "$_me" 2>/dev/null && _PEER_FILE="$_me"
  # NOT a trap: test-run.sh owns the single EXIT trap, and a second one here
  # would silently replace it, leaking its two temp files every run.
fi
true   # the advisory must never be the reason a run fails
```

- [ ] **Step 4: Run the gate and watch it pass**

Run: `bash app/scripts/test-run-advisory.test.sh`
Expected: 5 `ok` lines, `all advisory cases pass`.

- [ ] **Step 5: Prove the gate bites**

| Mutation | Case that must fail |
| --- | --- |
| Drop the `[ "$_now" != "$_started" ]` clause | "a reused pid is not a live peer" |
| Replace the `if`/`fi` block with `&&`-chaining AND delete the trailing `true` | "an unusable peer dir does not fail the run" |

**Not** "replace the guard with an unguarded `mkdir -p`" — that mutation
cannot bite, and an earlier draft of this plan prescribed it. `if <false>;
then …; fi` with no `else` returns **0** (verified), so the `if` is not what
protects the invariant; the trailing `true` is. A mutation must remove the
thing that actually holds the invariant up, which means collapsing the `if`
into `&&`-chaining and dropping the `true` together.

- [ ] **Step 6: Verify the trap clears the entry**

Run: `ls /tmp/ergomatic-test-runs/ 2>/dev/null | wc -l` before and after `cd app && pnpm test --project unit`.
Expected: the same number both times (the run's own entry is removed on exit).

- [ ] **Step 7: Add the CI step and commit**

In `ci.yml`'s `scripts` job:

```yaml
      - name: Lint + test the test-run advisory
        run: |
          bash -n app/scripts/test-run-advisory.sh
          bash app/scripts/test-run-advisory.test.sh
```

```bash
git rev-parse --show-toplevel
git add app/scripts/test-run-advisory.sh app/scripts/test-run-advisory.test.sh .github/workflows/ci.yml
git commit -m "Phase MEM: warn when another run is already using the machine"
```

---

### Task 4: The worker caps and the measurement scripts

**Files:**
- Create: `app/scripts/testEnv.ts`
- Create: `app/scripts/testEnv.test.ts`
- Create: `app/scripts/measure-test-memory.sh`, `app/scripts/count-test-workers.sh`
- Modify: `app/vitest.config.ts`, `app/playwright.config.ts`

**Interfaces:**
- Produces: `isCI(v?: string): boolean` and `workerCap(v: string | undefined, fallback: number): number`, imported by both configs.

- [ ] **Step 1: Write the failing test**

Create `app/scripts/testEnv.test.ts`. Note the literals are independent of the implementation — pinning a contract with the production symbol proves nothing (RF21):

```ts
import { describe, expect, it } from "vitest";
import { isCI, workerCap } from "./testEnv";

describe("isCI", () => {
  // CI is a STRING. Truthiness would make "false" and "0" enable CI mode
  // and silently remove both worker caps on the machine they protect.
  it.each([
    [undefined, false], ["", false], ["false", false], ["0", false],
    ["true", true], ["1", true],
  ])("isCI(%p) === %p", (v, expected) => {
    expect(isCI(v as string | undefined)).toBe(expected);
  });
});

describe("workerCap", () => {
  it.each([
    [undefined, 4], ["", 4], ["0", 4], ["abc", 4], ["true", 4],
    ["8", 8],
    ["-2", 1],          // Playwright's resolveWorkers throws below 1
    ["1.5", 1],         // a fractional worker count is not a setting
    ["999", 16],        // an unbounded ceiling defeats the whole point
    ["Infinity", 16],
  ])("workerCap(%p, 4) === %p", (v, expected) => {
    expect(workerCap(v as string | undefined, 4)).toBe(expected);
  });

  it("uses the caller's fallback, not a baked-in 4", () => {
    expect(workerCap(undefined, 2)).toBe(2);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd app && NODE_OPTIONS=--no-experimental-webstorage pnpm exec vitest run --project unit scripts/testEnv`
Expected: FAIL — cannot resolve `./testEnv`. **If it instead reports "No test files found" and exits 0, stop:** the file is outside every project include and the gate cannot go red.

- [ ] **Step 3: Write the helpers**

Create `app/scripts/testEnv.ts`:

```ts
/**
 * Shared by vitest.config.ts and playwright.config.ts so the two cannot
 * drift. Both are pure so the unit suite can pin them.
 */

/**
 * `process.env.CI` is a STRING, so truthiness is the wrong test: "false"
 * and "0" are both truthy and would silently remove the worker caps.
 */
export const isCI = (v: string | undefined = process.env.CI): boolean =>
  !!v && v !== "false" && v !== "0";

/**
 * Local worker ceiling. Measured on a 16 GB / 4-performance-core Mac:
 * 4 workers = 38 s / 1.84 GB peak, unset (9) = 25 s / 2.76 GB, and 6 is
 * strictly dominated by 4 (41 s AND 2.63 GB). Override with
 * ERGOMATIC_TEST_WORKERS / ERGOMATIC_E2E_WORKERS on a bigger machine.
 *
 * trunc: a fractional worker count is not a setting.
 * max(1): Playwright's resolveWorkers throws below 1.
 * min(16): an unbounded ceiling admits Infinity on the machine this
 *          exists to protect, which is the opposite of the goal.
 */
export const workerCap = (v: string | undefined, fallback: number): number =>
  Math.max(1, Math.min(16, Math.trunc(Number(v)) || fallback));
```

- [ ] **Step 4: Run it and watch it pass**

Run: `cd app && NODE_OPTIONS=--no-experimental-webstorage pnpm exec vitest run --project unit scripts/testEnv`
Expected: PASS, all cases. Confirm the run reports a non-zero test count.

- [ ] **Step 5: Wire both configs**

In `app/vitest.config.ts`, add the import and one key to the top-level `test` block (verified: a top-level `maxWorkers` reaches `projects[]` — unset → 9 workers, 2 → 2, 4 → 4):

```ts
import { isCI, workerCap } from "./scripts/testEnv";
// ... inside `test: {`, alongside `projects` and `coverage`:
    maxWorkers: isCI() ? undefined : workerCap(process.env.ERGOMATIC_TEST_WORKERS, 4),
```

In `app/playwright.config.ts`, alongside `fullyParallel`:

```ts
import { isCI, workerCap } from "./scripts/testEnv";
// ...
  workers: isCI() ? undefined : workerCap(process.env.ERGOMATIC_E2E_WORKERS, 2),
```

- [ ] **Step 6: Add the measurement scripts**

Create `app/scripts/measure-test-memory.sh` and `app/scripts/count-test-workers.sh` **verbatim from the spec's Appendix** (they are already paste-tested there against no-args, a missing command, an unwritable log dir, an instant command, and a non-zero child). Then `chmod +x` both.

- [ ] **Step 7: Verify the caps take effect, and record the numbers**

```bash
cd app
A="$(pwd)"
bash scripts/count-test-workers.sh /tmp/w-default.log "$A" \
  env ERGOMATIC_TEST_WORKERS= ./node_modules/.bin/vitest run --project client
bash scripts/count-test-workers.sh /tmp/w-8.log "$A" \
  env ERGOMATIC_TEST_WORKERS=8 ./node_modules/.bin/vitest run --project client
bash scripts/count-test-workers.sh /tmp/w-ci.log "$A" \
  env CI=true ./node_modules/.bin/vitest run --project client
```

Expected: `peak=4` for the default, `peak=8` for the override, `peak=9` under CI. Any run reporting `start_floor` other than 0 is INVALID — another worktree's suite is running; wait and repeat.

**Record the three numbers in the PR body.** If the default does not read 4, stop: the propagation claim has regressed and the config is not doing what the spec says.

- [ ] **Step 8: Measure B2's untested cost**

The spec tags Playwright's cost at 2 workers UNTESTED (RF30). Measure it now and replace the tag:

```bash
cd app && time pnpm e2e                                   # at the new default of 2
cd app && time ERGOMATIC_E2E_WORKERS=5 pnpm e2e           # at the old default
```

Record both wall-clock figures in the PR body and in the spec's B2 paragraph. If 2 is more than ~2x slower, raise the default to 3 and say so.

- [ ] **Step 9: Run the gates and commit**

```bash
cd app && pnpm typecheck && pnpm lint && pnpm test --project unit --project client
git rev-parse --show-toplevel
git add app/testEnv.ts app/testEnv.test.ts app/vitest.config.ts app/playwright.config.ts app/scripts/measure-test-memory.sh app/scripts/count-test-workers.sh
git commit -m "Phase MEM: cap local workers at a measured 4, overridable, inert in CI"
```

---

### Task 5: The tiered pre-push gate

**Files:**
- Modify: `.husky/pre-push`
- Create: `scripts/pre-push.test.sh`
- Modify: `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: `app/scripts/test-run.sh` from Task 1.

- [ ] **Step 1: Write the failing gate**

Create `scripts/pre-push.test.sh`. It runs the hook BODY under `sh -e`, which is how husky invokes it (`.husky/_/h` line 19) — the whole point, since a bare fallible statement aborts there:

```bash
#!/usr/bin/env bash
# Gate for the tiered pre-push hook. Runs the hook body the way husky does
# -- `sh -e` -- because that is where the interesting failure lives: under
# errexit a bare failing guard ABORTS the hook instead of falling back, and
# husky then prints "script failed", which reads exactly like the test
# failure this whole phase exists to stop mistaking.
set -uo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/.." && pwd)"
fails=0
check() { if [ "$2" = "$3" ]; then echo "ok    $1"; else echo "FAIL  $1 -- expected '$2' got '$3'"; fails=$((fails+1)); fi; }

# DRY_RUN makes the hook echo its invocations instead of running them.
run_hook() { ( cd "$ROOT" && DRY_RUN=1 PREPUSH_BASE="$1" sh -e .husky/pre-push 2>&1 ); }

out="$(run_hook refs/remotes/origin/main)"; rc=$?
check "a resolvable base exits 0"            "0" "$rc"
case "$out" in *"--changed"*) r=0 ;; *) r=1 ;; esac
check "a resolvable base uses --changed"     "0" "$r"

out="$(run_hook refs/remotes/origin/does-not-exist)"; rc=$?
check "an unresolvable base still exits 0"   "0" "$rc"
case "$out" in *"FALLBACK"*) r=0 ;; *) r=1 ;; esac
check "an unresolvable base falls back loud" "0" "$r"
case "$out" in *"--changed"*) r=1 ;; *) r=0 ;; esac
check "the fallback does NOT use --changed"  "0" "$r"

# The whole-tree gates cannot be selected by --changed, so they must be a
# SECOND invocation -- `--changed X scripts/` INTERSECTS and finds nothing.
out="$(run_hook refs/remotes/origin/main)"
# Both dry-run lines contain "scripts/test-run.sh", so a bare `grep -c
# 'scripts/'` counts 2 and fails against a CORRECT hook. Anchor on the
# second invocation's distinctive argument instead.
check "the scripts/ gates run unconditionally" "1" "$(printf '%s' "$out" | grep -c -- '--project unit scripts/')"
check "there are two vitest invocations"       "2" "$(printf '%s' "$out" | grep -c 'test-run.sh')"

# Docker-free: the integration project must never be admitted.
case "$out" in *"--project integration"*) r=1 ;; *) r=0 ;; esac
check "integration project is never admitted" "0" "$r"

if [ "$fails" -ne 0 ]; then echo "$fails failure(s)"; exit 1; fi
echo "all pre-push cases pass"
```

- [ ] **Step 2: Run it and watch it fail**

Run: `bash scripts/pre-push.test.sh`
Expected: FAIL on "a resolvable base uses --changed" — the current hook has no such flag.

- [ ] **Step 3: Rewrite the hook**

Replace `.husky/pre-push`:

```sh
. "$(dirname "$0")/common.sh"
# Tiered gate. This body runs under `sh -e` (.husky/_/h), so EVERY fallible
# command is wrapped -- a bare failing statement aborts the hook, and husky
# then prints "script failed", which reads like a test failure.
#
# Two invocations, not one: `--changed` selects through vite's module graph,
# so a test whose subject is a file it READS (every census/contract suite
# under scripts/) is structurally unselectable, and `--changed X scripts/`
# INTERSECTS to nothing. Measured: vitest.config.ts selects 0 tests.
#
# --project flags are kept so the hook stays Docker-free; dropping them
# re-admits the integration project (testcontainers, 120s timeouts).
BASE="${PREPUSH_BASE:-refs/remotes/origin/main}"
SCOPE="--project unit --project client"

run() {
  if [ -n "${DRY_RUN:-}" ]; then echo "would run: $*"; else "$@"; fi
}

if git rev-parse --verify --quiet "$BASE" >/dev/null 2>&1; then
  run pnpm --dir app exec bash scripts/test-run.sh --changed "$BASE" $SCOPE || exit 1
else
  echo "pre-push: FALLBACK -- '$BASE' does not resolve, running the full scoped suite." >&2
  run pnpm --dir app exec bash scripts/test-run.sh $SCOPE || exit 1
fi

# The whole-tree gates, always.
run pnpm --dir app exec bash scripts/test-run.sh --project unit scripts/ || exit 1
```

Note: `pnpm exec bash …` is safe — the prohibition is on `pnpm exec vitest`, and here `bash` is the child whose status pnpm reports, while `test-run.sh` itself invokes vitest directly and reads `PIPESTATUS`. Verify this in Step 5.

- [ ] **Step 4: Run the gate and watch it pass**

Run: `bash scripts/pre-push.test.sh`
Expected: 8 `ok` lines.

- [ ] **Step 5: Prove the signal survives the hook's invocation shape**

Run: `cd app && NODE_OPTIONS=--max-old-space-size=48 pnpm --dir . exec bash scripts/test-run.sh --project client; echo "exit=$?"`
Expected: a `!! MEMORY KILL` banner and a non-zero exit. If the exit is 1 with no banner, the wrapper's own classification still works — but record the code, because `pnpm exec` around `bash` would then be collapsing it and the hook must switch to `pnpm --dir app run`.

- [ ] **Step 6: Prove the gate bites**

| Mutation | Case that must fail |
| --- | --- |
| Replace the `if git rev-parse …` with a bare `git rev-parse --verify --quiet "$BASE"` | "an unresolvable base still exits 0" |
| Delete the final `scripts/` invocation | "the scripts/ gates run unconditionally" |
| Append `scripts/` to the `--changed` invocation instead of a second run | "there are two vitest invocations" |
| Drop `$SCOPE` from the fallback | "integration project is never admitted" |

- [ ] **Step 7: Verify against a real push**

```bash
git checkout -b mem-probe-throwaway && echo "// probe" >> app/src/App.tsx && git commit -am "probe"
git push --dry-run origin mem-probe-throwaway   # observe: a narrow set + the scripts/ gates
git checkout - && git branch -D mem-probe-throwaway && git checkout app/src/App.tsx
```

- [ ] **Step 8: Add the CI step and commit**

```yaml
      - name: Lint + test the pre-push tier
        run: |
          bash -n .husky/pre-push
          bash scripts/pre-push.test.sh
```

```bash
git rev-parse --show-toplevel
git add .husky/pre-push scripts/pre-push.test.sh .github/workflows/ci.yml
git commit -m "Phase MEM: pre-push runs what changed, plus the gates --changed cannot see"
```

---

### Task 6: The rules, in all five places

**Files:**
- Modify: `CLAUDE.md` (RF37; the Commands bullet; RF1)
- Modify: `.claude/agent-briefing.md` (gate table)
- Modify: `docs/TESTING.md`
- Modify: `README.md`
- Modify: `docs/superpowers/specs/2026-09-08-local-test-memory-design.md` (rule 1 correction)
- Modify: `ROADMAP.md`

- [ ] **Step 1: Find every site — repo-wide, not from a list**

Run: `grep -rn "pnpm e2e" --include='*.md' . | grep -v node_modules | grep -v docs/history`
Record the hits. A grep over sites you already thought of cannot find the one you forgot — this is the failure C6 itself committed.

- [ ] **Step 2: Add RF37 to CLAUDE.md**

Append to the recurring-failures list:

```markdown
37. **Reading a KILLED test run as a flaky one, and retrying it into a
    machine that just proved it has no room (Phase MEM, 2026-09-08).**
    Three signatures, none of which is a test result:
    **(a) An exit code ≥ 128 is a signal death.** 134 is SIGABRT (a V8
    fatal, including OOM), 137 is SIGKILL. 130 is your own Ctrl-C and 143
    a SIGTERM — killed, but not memory.
    **(b) `pnpm exec` COLLAPSES all of them to exit 1.** Measured: raw
    node and `pnpm run` both preserve 134/137; `pnpm exec` reports 1 with
    `ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL`. This matters because the
    Commands section above prescribes `pnpm exec vitest` as the scoped-run
    workaround — **the repo's own advice hides this signal**, so when you
    use that form, a kill is indistinguishable from a failure by status.
    **(c) A fork-worker OOM exits 1 AND prints a full `Test Files`
    summary.** Vitest defaults to `pool: "forks"` and each fork has its own
    4192 MB heap limit, so the parent survives. The presence of a summary
    proves nothing; the tell is `Allocation failed` on stderr.
    **Never re-run a suite showing any of the three.** `pnpm test` routes
    through `app/scripts/test-run.sh`, which says so out loud and writes
    the evidence to `app/.test-kills/`. A retry is not free: it is the
    thing that turns one kill into a lost session.
    **And the lesson that generalises past this bug:** the first draft of
    the design asserted "the system gives us no signal", derived entirely
    from measurements taken through `pnpm exec`. When a claim is that no
    signal exists, re-run it through every INVOCATION SHAPE the production
    path uses before believing it.
```

- [ ] **Step 3: Amend RF1 and the Commands bullet in CLAUDE.md**

RF1's prescription becomes: for a diff touching `app/src/`, run the named e2e specs locally against an already-booted stack, and **read the e2e job on the PR** for the full suite. `pnpm screenshots` is unchanged.

The Commands bullet on the `pnpm exec vitest` workaround gains one sentence: *"Note this form collapses a signal death to exit 1 — see recurring failure 37. Prefer `pnpm test --project client` when you do not need a file filter."*

Add the two env vars to Commands:

```markdown
- `ERGOMATIC_TEST_WORKERS` / `ERGOMATIC_E2E_WORKERS` — local worker
  ceilings, defaulting to 4 and 2. Tuned for a 16 GB / 4-performance-core
  Mac running several agent sessions; **raise or unset them on a bigger
  machine**. Both are inert under CI.
```

- [ ] **Step 4: Amend the other three sites**

`.claude/agent-briefing.md`'s gate table row, `docs/TESTING.md`, and `README.md` — each to the same wording as RF1. Wrap by hand to match the surrounding text; do NOT run Prettier on these.

- [ ] **Step 5: Correct rule 1 in the spec**

In the spec's A1 table, replace the single `exit ≥ 128` row with the four-way split from this plan's "A correction to the spec" section, and add a sentence recording why: `exit ≥ 128` as written would print `MEMORY KILL` on every Ctrl-C.

- [ ] **Step 6: Verify the sweep is complete**

Run: `grep -rn "pnpm e2e" --include='*.md' . | grep -v node_modules | grep -v docs/history`
Every remaining hit is either amended or is a deliberate reference (e.g. this plan). State which for each.

- [ ] **Step 7: Tick the ROADMAP**

Update the Phase MEM section: what shipped, the three recorded worker numbers from Task 4 Step 7, the measured Playwright cost from Step 8 (replacing the UNTESTED tag), and the open A0 question — which stays open until a real kill writes a capture.

- [ ] **Step 8: Commit**

```bash
git rev-parse --show-toplevel
git add CLAUDE.md .claude/agent-briefing.md docs/TESTING.md README.md ROADMAP.md docs/superpowers/specs/2026-09-08-local-test-memory-design.md
git commit -m "Phase MEM: RF37, and the e2e tier amendment in all five places"
```

---

## Final verification

- [ ] `cd app && pnpm typecheck && pnpm lint`
- [ ] `cd app && pnpm test --project unit --project client` — passes, no banner
- [ ] `bash app/scripts/test-run.test.sh && bash app/scripts/test-run-advisory.test.sh && bash scripts/pre-push.test.sh`
- [ ] `cd app && pnpm e2e` — once, to confirm the 2-worker default is sound
- [ ] `git status` on the MAIN checkout is clean (no stray writes, no `.test-kills/`)
- [ ] PR body records: the three worker counts, both e2e wall-clock figures, and every mutation probe with what its failure said
