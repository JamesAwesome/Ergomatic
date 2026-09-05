# Recovery v1 connection failure — findings, September 5, 2026

The Mac lost the phone's Wi-Fi debugging tunnel 28 seconds after a
successful listing, and the phone flapped in and out of CoreDevice's device
list for the next seven minutes. The Mac's own Wi-Fi association stayed up
throughout, and the Mac did not sleep. The phone-side cause is not observed.
The phone was reachable at 01:22:56Z over the same transport and the
installed identity then matched 0.23.0/789 at the setup-v3 installation URL.

All facts below are PRIMARY, read from the Mac's unified log
(`/usr/bin/log show`, processes `remotepairingd`, `remoted`,
`CoreDeviceService`, `airportd`) and from `pmset -g log`. Times are local
(UTC−4). No phone action beyond read-only listings occurred.

## Timeline

| Local time | Observation |
| --- | --- |
| 21:08:47 | First listing: tunnel established over `en0` (802.11) to the phone; RSD heartbeat succeeded in 26 ms. Identity 0.23.0/789 matched. |
| 21:08:58 | Tunnel closed normally ("No active usage assertions") when the listing finished. Device remained `Available`. |
| 21:09:15 | Controller's prelaunch listing requested a new tunnel. |
| 21:09:33 | Control channel `tcp-200` receive timed out (`Operation timed out`); remotepairingd removed the phone as a lost device. This is the CoreDeviceError 4000 / NWError 60 the controller recorded. |
| 21:10:06–21:10:40 | remotepairingd re-resolved the phone over Bonjour every 11 s and cancelled each attempt unanswered. |
| 21:11 | James's read-only listing returned CoreDeviceError 1011: the phone was not in the device list at all. |
| 21:12:07 | Phone rediscovered (new device record). |
| 21:16:17 | Phone lost and rediscovered again within 108 ms (a flap). |
| 21:22:56 | Claude's read-only listing succeeded: `transportType localNetwork`, `tunnelState connected`, identity 0.23.0/789, installation URL identical to setup v3's `install.json`. |

Mac side during the drop: `airportd` reported a steady channel score and
no roam, disassociation or power change between 21:08:40 and 21:10:00.
`pmset` shows no sleep or wake; `caffeinate` assertions were held.

## What this does and does not establish

- The link that failed is the wireless CoreDevice tunnel over the home
  Wi-Fi. There was no USB connection at any point (`transportType` was
  `localNetwork` in every record, including the desk-time device info).
- The Mac end of that link was healthy. The phone end stopped answering;
  why is NOT observed. Locking, distance from the access point, Wi-Fi power
  management on the phone and a network event on the access point are all
  consistent with the log and none is shown by it. Do not cite any of them
  as the cause.
- The setup-v3 PASS and the recovery abort are not in tension: reachability
  was real at 21:08:47 and gone by 21:09:33. Reachability is a property of
  the minute, not of the session.
- No installed-build mismatch exists. `currentInstalledIdentity` in
  `recovery-v1-abort-summary.json` is superseded by this check.

## James's account (SECONDARY, 2026-09-05)

James reports that part of why the phone was unreachable is that the
operator was never told to have the phone ready before the walk's first
listing. V1's protocol put unlock and PM5 setup AFTER **Start**, inside the
clock, while the controller's fresh listing ran immediately on Start. The
phone's state during the 21:09:15 listing is therefore not established as
"at the erg, unlocked, in hand"; the Mac log alone cannot distinguish that
from a network event. This does not identify the phone-side mechanism, but
it removes one unobserved-state class from the first listing: the ready
state belongs in the invitation, so that **go** itself asserts it.

## Consequence for a resumed walk

The existing controller already aborts correctly on a failed listing and
made no phone mutation; nothing in it needs changing. Three additions are
proposed for `NF-RECOVERY-v2`, all outside the app and all read-only:

1. **Transport preflight** immediately before the consent invitation: a
   read-only `device info details` and `device info apps` must both succeed
   and report `tunnelState connected` plus the matching identity. Their
   `transportType` is recorded in the run's `operator-session.json`.
2. **Wired transport preferred.** If a USB-C cable can reach from the Mac
   to the phone at the PM5's NFC spot, connect it before the ready reply;
   the walk's own first in-clock listing records `transportType`; the
   pre-invitation preflight records the transport as it stood before any
   cable. This is a transport choice that removes the failed
   link, not a claim about why it failed (INFERENCE: CoreDevice uses the
   wired channel when one is present — verified only by the preflight's
   own `transportType` readout, never assumed). Wi-Fi remains acceptable if
   the preflight passes; losses recurred more than once within a span
   shorter than the eight-minute walk, so a mid-walk drop on Wi-Fi is a
   live risk, and the existing stop rules cover it.

3. **Ready state stated in the invitation.** The consent text tells James
   what must already be true when he replies **go**: phone unlocked with
   Ergomatic open, in his hand at the erg, on the cable if one reaches. The
   first listing then runs against a phone known to be awake and present,
   and v1's post-Start unlock step disappears from the clock.

Raw Mac log extracts are retained privately under the command card's root
in `reconnection-check-claude-1/` together with the successful
`details.json` and `installed-apps.json`. Allowlisted machine summary:
[recovery-connection-findings.json](recovery-connection-findings.json).
