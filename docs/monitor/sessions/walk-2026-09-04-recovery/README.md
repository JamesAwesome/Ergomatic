# Unsaved-workout native acceptance — recovery/save confirmed by operator

James approved the phone protocol and its budget on September 4: one completed
one-minute Recovery Door piece, three post-piece captures requested separately,
no heart rate and no native recordings. No second piece is authorized.

## Candidate and preflight

- Candidate source: `d8709c6d315f4da37be937c5597e57903e69b1e2` on
  `codex/unlogged-session-door`; clean before native build.
- Tag-derived candidate version: 0.36.1 (875), describe
  `v0.36.1-33-gd8709c6d`. This is a direct local acceptance build, not a
  TestFlight release, tag or merge.
- Target phone: Kaito, iPhone 17 Pro, iOS 26.6.1 (23G83), wired and developer
  mode enabled. Installed app before preparation reports 0.23.0 (789).
- API: `https://ergomatic.waffle.haus`; preflight `GET /api/health` reports
  `ok: true`, `db: true`, version `v0.36.1-1-g04b7964e`. No server changes
  are required by this branch.
- Read-only local backup of the phone app's Library succeeded before install.
  It is private temporary evidence, not committed. A query limited to
  `ergomatic.sessionRun` and `ergomatic.monitorRun` in the copied WebKit
  local-storage database returned no rows. Confirm the visible Today state
  before starting; no discard is authorized. James subsequently confirmed
  Today shows nothing unsaved on the installed candidate.
- `pnpm ios:build` completed with the Google iOS client ID derived by the
  repository script and the production API target explicitly supplied.
  `pnpm dist:grep` passed all eight dev-only exclusions.
- Release-configuration `xcodebuild` and `codesign --verify --deep --strict`
  succeeded. The resulting app reports 0.36.1 (875); direct installation on
  Kaito succeeded at 12:07 EDT. No uninstall occurred.
- The built and packaged main JavaScript assets share SHA-256
  `b7dc9269fdc8d4822b2703dd12db2e2b496a8110388ae89e7dfc8675a34922c4`.
  Generated tag-derived version stamps in the source project were restored
  surgically after building; they are not product changes.

## Evidence status

James reported READY after receiving the import/connect instructions. He was
then instructed to complete the one-minute piece and leave the summary unsaved.
At his later request, the same candidate was reinstalled at 12:44 EDT after a
fresh private Library backup, without uninstalling. Device inspection again
confirmed 0.36.1 (875), and the app launched successfully.

James then said "it works". Asked whether that meant the build opens or that
he recovered and saved the workout successfully, he answered "the latter".
This is explicit operator confirmation of successful native recovery and Save
on this candidate, not merely a launch check. The exact navigation sequence,
landscape warning visibility and absence of a later warning were not separately
reported. Asked whether Recovery Door disappeared from Today's Unsaved workout
section after saving, James answered "Yes". This separately confirms visible
retirement after Save, not a later Start/Connect warning check. Three phone
screenshots arrived, transcribed below.
They do not contain saved history or an identified original/recovered summary
pair, so successful saving is supported by James's explicit confirmation and
numerical preservation is not independently verified. Do not repeat rowing
to recreate missing photographs or exceed the three-capture budget.

## Screenshot transcription — SCREEN evidence

All three attachments are phone-only portrait screenshots, not same-frame PM5
comparisons. They are correlated by the Recovery Door session context and
12:46–12:47 status-bar times; attachment order does not establish navigation
order. Original/recovered summary identity was not separately reported.

| File                                                       | Visible evidence                                                                                                                                                                                                                                                                          |
| ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [01-today-unsaved.jpg](01-today-unsaved.jpg)               | 12:47. Today → UNSAVED WORKOUT → Recovery Door, PM5 · Sep 4 · Not saved. Review & save and explicit discard cross visible. The planned session below is SESSION 19 OF 84, O2.                                                                                                             |
| [02-summary-save-actions.jpg](02-summary-save-actions.jpg) | 12:47. Summary lower section: interval 1, 1:00, target 2:05.0, actual 2:13.9, rate 25 / 20, deviation +8.9. Pace chart visible. Actions: Log against plan · SESSION 19 OF 84; Save without logging; DISCARD WITHOUT SAVING. These are pre-save actions, not a saved-history confirmation. |
| [03-completion-summary.jpg](03-completion-summary.jpg)     | 12:46. WORKOUT COMPLETE; Recovery Door; SEP 4 · 12:12 · PM5 432331249 Row. AVG SPLIT 2:14.5; TIME 1:00; DISTANCE 223; 1:00 total. Target 2:05.0 and expected pain 1/5.                                                                                                                    |

The headline 60 seconds / 223 metres × 500 = 134.529 seconds per 500 m,
which rounds to the displayed 2:14.5. That is an internal display check only,
not an independent measurement oracle. The interval split is transcribed as
its own displayed value, not asserted equal to the rounded-distance headline.

The approved protocol is
[the phone walk](../../../testing/2026-09-04-unlogged-session-phone-walk.md).
The app identifies the monitor as PM5 432331249 Row; no physical serial-label
photo or firmware version was captured. This confirmation is limited to
this phone and reported run, not a wire, arithmetic or firmware-general oracle.
PM phase-close judgment and merge approval are not established by this report.

No walk Docker stack was started: this native candidate targets the existing
production API. The earlier automated-test stack is not a phone evidence source.
