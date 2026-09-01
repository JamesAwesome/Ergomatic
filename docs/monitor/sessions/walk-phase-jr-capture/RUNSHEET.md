# Walk runsheet — Phase JR Just Row capture

## Medium and entry

Laptop Chrome with Web Bluetooth only. No phone and no heart-rate requirement.
From the feature worktree's `app/` directory, run `bash scripts/walk-lab.sh
up`, use the printed backdoor login, then open `/justrow/observe`.

The screen opens on **JUST ROW OBSERVER · Not connected**. **Tap Connect** and
pick the PM5 from Chrome's chooser. The tap is not a convenience:
`navigator.bluetooth.requestDevice()` only runs while the page holds a
transient user activation, and a URL you typed does not carry one — a screen
that connected on its own would fail here with `SecurityError: Must be
handling a user gesture to show a permission request.`

Wait for `<PM5 name> connected` **and a non-zero `N events captured`** before
pulling. The heading alone only proves the Bluetooth link came up; the count
is what proves notifications are actually arriving, and it should climb every
second once you are rowing. If it stays at its opening value, stop — the
capture is empty and the row would be wasted.

This screen subscribes but never programs, so pulling from the PM5 main menu
is the native Just Row entry. The printed card's generic **LOG SCREEN**
download instruction does not apply here: this observe-only screen creates no
MonitorRun or Log screen; use its **Download capture** control instead.

## Budget

Three pieces:

1. One Just Row past 5:00 with a 30-second stop/resume, then Menu end.
2. One short Just Row left to the machine's idle timeout.
3. One already-rowing-at-connect capture only if time remains.

The first piece is the only deliberate long row: the 5-minute auto-split is the
evidence, not a fitness target.

Give one instruction at a time; make no mid-piece asks.

**Between pieces:** use **Download capture** BEFORE **Disconnect**, every
time. Disconnect returns the screen to **Not connected**, and the next piece
starts by tapping **Connect** again — a fresh chooser pick each time. The
order matters because each connect installs a new recording tap and replaces
the previous one, so a capture not downloaded before the next Connect is gone.

The first download is the exact artefact that closes OPEN 1/2/4/5/6/7; the
timeout run resolves OPEN 3.

## Evidence destination and closeout

Move the exact downloaded `pm5-recording-<timestamp>.jsonl.gz` (or plain
`.jsonl` fallback) into `docs/monitor/sessions/walk-YYYY-MM-DD-justrow/`
before analysis. Record the actual filename, PM5 serial/firmware if visible,
and the result of every OPEN question in that directory's `README.md`. Amend
the Just Row design rather than leaving evidence only in the README.
