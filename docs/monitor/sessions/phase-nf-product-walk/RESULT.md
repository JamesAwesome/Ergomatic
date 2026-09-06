# NF-PRODUCT-v8 — walk RESULT (2026-09-06, James's iPhone 17 Pro "Kaito" + his PM5)

**Verdict: legs 1, 3, 4, 5 PASS; leg 2 INCONCLUSIVE (premise false). The
shipped Scan NFC route works on real hardware: one tap on the PM5's tag reads
its name, the app connects to exactly that PM5 with no picker, programs the
workout, reaches READY, rows a pull, ends, and saves.**

## Identity and setup

- Build `0.23.0/9001` (agvtool-stamped walk build of PR #316 head `d27ee17d`;
  code last changed at `ffa9f7ab`, `05ded2ce` merges main). Installed with
  James's explicit permission ("yes", 2026-09-06 ~16:05); identity read off
  the produced `.app` AND off the phone (`installed-apps.json`:
  `0.23.0 / 9001`).
- Console: `devicectl … launch --console -t 1200`, alive at every boundary,
  stopped by the controller after block C. Redacted capture:
  `console-nfc-diagnostics.txt` (the 29 `NFC_GATE_DIAGNOSTIC` lines only —
  the raw log carried a session token and was NOT committed).
- Preconditions confirmed by James: Auto-Lock Never, Do Not Disturb on,
  System Haptics on, signed in, walk workout imported by bulk paste, Scan NFC
  present on its detail screen, PM5 on Connect Device, Flipper loaded, plan
  ACTIVE (so `Save without logging`).
- Go at 16:12; block C report at 16:28: **~16-17 min wall clock including
  the controller's turns**, against a 15 min cap. The overrun was one extra
  controller turn (a clarifying question after block A). No timeout on
  either machine fired at any gap.

## The seven reader sessions (from the console; times from `begin.initiated`)

| Gen | Leg | rf active | Ending | Meaning |
| --- | --- | --- | --- | --- |
| 1 | 1 | 141 ms | 200 at 5.3 s | real tag read (our stop after the read) → connect → READY |
| 2 | 2 | 106 ms | 200 at 5.0 s | real tag read → targeted scan CONNECTED in 2-3 s (PM5 still advertising) |
| 3 | James's own extra test | 104 ms | read error **102** at 2.2 s, then 200 at 4.8 s | tag connection lost mid-read; the phone showed an NDEF read error |
| 4 | James's own extra test | 97 ms | 200 at 3.8 s | read, worked |
| 5 | 3 (first scan) | 97 ms | 200 at 2.1 s | sheet Cancel, quiet |
| 6 | 3 (second scan) | 98 ms | 200 at 5.3 s | read → READY |
| 7 | 4 | 96 ms | **202** at 6.0 s | side-button lock: iOS ended the reader (`SessionTerminatedUnexpectedly`, vendor-documented); the app showed a QUIET return |

Seven starts against a budget of six: two were James's own, outside the script
(he said so); leg 4's seventh was offered as his call and he took it.

## Legs

1. **Primary target — PASS.** Name shown, no device list, READY, one pull,
   END → TAP AGAIN → the one summary → `Save without logging` → Today. No red
   text. Photo skipped by James ("not needed").
2. **Not advertising — INCONCLUSIVE, premise false.** After leg 1's END the
   PM5 was off Connect Device, yet the targeted scan found it and connected
   in 2-3 s (`Choosing your monitor` with no buttons for 2-3 s, then READY).
   **New fact for the spec, stated by James at the erg: the PM5 advertises
   whenever it is awake and not already connected, on ANY screen — Connect
   Device is not a precondition — and an NFC tap wakes a sleeping PM5.** So
   the leg's premise was never stageable, and the approved copy `Open
   Connect Device on this PM5` asks for something the rower does not need
   to do (follow-on PR, Gate 0). The
   `Open Connect Device on this PM5, then try again.` path stays proven at
   the desk only (`e2e/connected.spec.ts`).
3. **Re-arm — PASS.** Scan NFC → sheet Cancel (quiet), Connect, cancel,
   Scan NFC → READY; one session at a time; both buttons back after every
   cancel. **Observation (not reproduced in leg 5):** at this leg's Connect
   tap the app "just started connecting to the PM5 without me choosing" — no
   list sheet seen. Leg 5's Connect showed the list.
4. **Background during a live reader — PASS, decided.** Code **202** on the
   console (iOS ended the session on backgrounding) and a quiet return with
   both buttons back — outcome (a). The runsheet's "202 → `NFC scan
   stopped. Try again.`" did not render because the app's own `pause` abort
   settled the attempt first and the late 202 ending was ignored as a
   settled attempt's event. Both halves of the design behaved; the copy
   mapping for a 202 that WINS the race remains unexercised.
5. **Manual Connect unchanged — PASS.** The `Looking for your PM5` list
   appeared, James picked the PM5, READY.

## Findings for the follow-on PR (ROADMAP NF block carries them)

- **Scan NFC is absent on Just Row** (`JustRow.tsx` passes
  `nfcCapability="unsupported"` on purpose; the spec never ruled on Just Row).
  James noticed it at the erg. Own row, Gate 0.
- **The NDEF read-error path** (code 102, tag lost mid-read) showed the
  system's NDEF read error text, not our `NFC scan stopped. Try again.`.
- **Connect without a list, once** (leg 3). Not reproduced in leg 5.
- **`Choosing your monitor` with no buttons on the NFC path** (already filed
  from the hardening).

## Countable phase exits (spec)

2 (Gate 0 matches the shipped UI): PASS by James's eye at the erg and the
captures. 4 (one valid scan → armed/ready/live/log, no picker, no second
confirmation): PASS, leg 1. 5 (unsupported tag / not-advertising copy): the
unsupported half is desk-proven (e2e + parser mutations); the not-advertising
half is desk-proven only — leg 2 could not stage the premise. 6 (manual
Connect unchanged): PASS, leg 5, with the leg-3 observation recorded. 7 (no
NFC listener/BLE scan left after every terminal path): the seven sessions
each ended (a `200`/`202` ending line per generation, none open at the end);
the JS-side cleanup is the automated suite's. 9 (walk legs green on the
required tree): four PASS, one INCONCLUSIVE with its premise falsified and
its copy path desk-proven.
