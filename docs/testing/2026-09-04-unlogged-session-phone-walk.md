# Unsaved-workout phone acceptance — proposed, not run

Governed by the approved [recovery design](../superpowers/specs/2026-09-03-unlogged-session-design.md) and the canonical `.claude/skills/hardware-walk/SKILL.md` operator contract. No budget approval, native build installation, release or rowing has occurred for this check.

## Proposed operator card

WALK PLAN · Recover and save a completed programmed workout after leaving its summary

Total rowing: 1 piece, 1 minute of actual work — the BUDGET.

Piece 1: Recovery Door — proves completion → leave unsaved → another-workout warning → View unsaved → Today → selected PM5 summary → explicit Save → saved history → no warning for the consumed record. Row to completion. No second piece is authorized.

Captures you'll be asked for: 3, each after rowing, one request at a time: original completed PM5 summary before leaving; recovered PM5 summary before saving; saved history detail. No capture requests during work.

Phone needed: YES because this acceptance criterion is native recovery. Heart rate is NOT required.

Recordings: NO — phone walk; photographs, operator observations and saved rows are the evidence. Native builds have no recording-download control.

## Preconditions

- Finish browser/design evidence and final code review; have the antagonist's phase-close exit pass judge that evidence and this protocol before the walk. The PM phase-close verdict follows the actual native evidence, not a proposed walk.
- Present the operator card to James and obtain budget approval before any walk boot or device action. Resolve and record the exact candidate SHA, native build and API target. An older installed release cannot validate this branch. This plan does not authorize a merge, upload or release.
- Preserve any pre-existing unsaved workout. Do not begin if doing so would displace it; this is not permission to discard.
- Read the current components before giving tap instructions. Use actual controls, one instruction at a time; wait for READY before asking James to row. Nothing must tick at READY. Repeat that heart rate is not needed before the piece.
- After completion, use a different existing workout only to stage the warning. Do not confirm replacement or begin another rowing piece. After saving, the no-warning check must not add rowing.
- On save failure, preserve the record and investigate. A second piece requires a revised approved budget.

## Import card and author preflight

```text
93 | Recovery Door | O2 | easy | 1
w 1' 6k @20
```

The exact block passed the existing parser and workout validator, then the real local bulk API under an isolated test account on September 4 at 12:38 UTC. `POST /api/workouts/bulk` returned HTTP 200, no errors and one created row (`1c99bb18-7cc4-49e3-87df-a85f23c752e1`): O2/easy/pain 1; one time work step of 1 minute; reference 6k offset 0; rate 20; no rest. Workspace HEAD was `db4e7863`; the already-running test stack on port 8251 reported health version `e2e`, not an independent SHA stamp. No James-account or phone action occurred. This establishes import admission, not device programming or rowing.

## Evidence and exit

Compare retained title, elapsed, distance and available actuals in the original and recovered summary photographs. The third photograph and saved row establish successful persistence. Operator observations establish the warning, Today access and no warning after consumption. Every tap/result is recorded when it occurs, not checked off in advance.

This is preservation/navigation evidence, not an independent arithmetic or wire oracle. No photograph is claimed as a same-frame PM5 comparison. Record phone/build identity and PM5 serial if available without another capture; disclose uncaptured firmware. Clearance is limited to this phone, PM5 and run.

The walk does not establish BLE reconnect behavior, durability after a rejected local write, damaged-data reconstruction or firmware-general correctness. No native clearance is claimed until the walk actually succeeds. Teardown any stack the walk starts; the automated-test stack remains under its test task until those gates finish.
