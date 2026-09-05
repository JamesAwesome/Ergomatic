# NF-RECOVERY-v1 — stopped before app launch

James explicitly said **Start**. The initial fresh app listing verified
0.23.0/789 and the latest authorized installation URL. The capture controller's
second, immediately-before-launch listing then failed with CoreDevice control
channel errors and Network.NWError 60; its log reports a timeout. The app was
never launched by this run. No Inspector, NFC reader or recovery case started.

The original conservative clock began at 2026-09-05T01:08:41.972859Z, with an
eight-minute deadline at 01:16:41.972859Z. The controller finished at
01:09:33.864Z, **51.891 seconds after that start**. Its internal 18.316-second
clock excludes earlier setup. James was then told to move the phone away and
leave the erg. Exact message-delivery time is unavailable; release preceded
the next tool timestamp at 01:10:46Z. Do not call machine duration the full
operator time. No clock or retry remains active.

`cleanupVerified:false` in the unmodified controller result means cleanup was
not attempted: the listing failed before `consoleLaunchAttempted` became true.
There is no normal-console.log or normal-launch.json. The guard correctly
prevented cleanup from launching an app after a failed read-only preflight.
Host PID 13869/session 43291 exited and PID absence was checked. No signal,
phone cleanup, launch or installation is now owed by this run.

After James said **I'm ready now**, one read-only reconnection listing failed
immediately (exit 1, CoreDeviceError 1011). It did not launch or install anything.
Current phone reachability and current installed identity are unknown; this is
not evidence of another installed-build mismatch. Do not attribute the timeout
to locking, Wi-Fi, distance or a cable without evidence. Last successful phone
idle/capture/reload proof remains setup v3.

All four recovery cases remain unrun. The Start permission and this run are
consumed. James subsequently requested saving status and handing off to Claude;
do not restart device work during this handoff. The existing protocol's PM
review is retained, but a resumed session needs its readiness condition checked
and the required PM/user agreement; no automatic retry or install is authorized.

Allowlisted [machine summary](recovery-v1-abort-summary.json).
Raw evidence stays private at the command card's root under
`authorized-recovery-v1-bu5vy2wb/`; the later read-only connection failure is
`recovery-reconnection-xt21wo2n/`. Never print raw native logs or account data.
