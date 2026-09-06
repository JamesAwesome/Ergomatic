# Desk feasibility review — 2026-09-04

**Recommendation: first design the smallest discriminating trace and capture
path. No walk is ready or approved.** The PM5 read and targeted BLE
connection are feasible on the captured hardware; the recovery test procedure
is not yet a dependable operator workflow. This review changes documentation
only: no device operation, app build, install or production code change.

## What the requested actions actually support

Evidence labels: DEVICE = this session's recorded observation, PRIMARY =
Apple documentation/installed SDK, SOURCE = inspected code, UNKNOWN = not
established. A SOURCE-supported action is not automatically DEVICE-proven.

| Requested action | Evidence and limit | Disposition |
| --- | --- | --- |
| Scan the PM5 and connect without a picker | DEVICE: two complete NFC/live-name/BLE connect-disconnect attempts in REPAIRED-NORMAL.md and background-final-receipt.json. | Feasible for this phone/PM5/build; not workout-programming proof. |
| Swipe Home while the native NFC sheet is live | DEVICE: James reported the swipe could not be performed; the later popup route delivered cancellation before pause (BACKGROUND-OBSERVATIONS.md). PRIMARY: NFC UI is modal; genuine background entry terminates a reader. No documented guarantee of the requested gesture was found. | Withdraw as a known-working instruction. Do not claim all iPhones forbid the gesture or that the popup proved active-reader background drain. |
| Tap Reload WebView while NFC is live | SOURCE: control exists only after held-stage state; enabled only after partial export. PRIMARY: underlying app UI is covered by the modal sheet. DEVICE: a reload was observed after stopped A; a live-sheet phone tap was not established. | Not a general visible phone control. No future walk may depend on accessing it through the sheet. |
| Use Safari Inspector to trigger controls | DEVICE: console delivery and a stopped-A document reload worked; initial readiness also returned false before probe mount. No reliable unattended agent control of this attached Inspector has been established. | Technically available in demonstrated states, but repeated operator typing is not an acceptable default workflow. |
| Start B after A stops | DEVICE: native start and old-A release acknowledgment occurred, then B ended invalidated without records. SOURCE: NDEF start resolves immediately after begin(), not after RF-active notification. | Initiation observed, successful recovery unproved. Do not promise that the acknowledgment means scanning is active. |
| Hold a native connect completion | DEVICE: held-connect-a receipt plus console progress/stop proves one held-and-stopped connect stage. | This stage is reachable. Query/read holds and a successful B remain unproved; compiling their code does not prove reachability. |
| Present PM5 and Flipper together to force two detected tags | DEVICE: Flipper alone was readable; combined attempts returned only one record. PRIMARY: the delegate supports arrays of detected NDEF tags, not a guarantee that two nearby objects will be detected together. | This physical setup is unproved. No repeat until a bounded PM-approved feasibility question justifies it. |
| Copy a receipt to clipboard | DEVICE: clipboard-unavailable status occurred while complete framed console exports arrived. | Clipboard is not an evidence prerequisite. Automatic controller capture should replace operator copying. |
| Reload and retain the complete failed attempt | SOURCE: receipt state is document-owned; reload metadata does not include full receipts. DEVICE: old B has console evidence but no recovered complete receipt. | Current workflow can lose evidence unless exported before transfer. Rehearse and validate capture through failure and reload before operator use. |

## Load-bearing platform facts

PRIMARY, checked 2026-09-04: the local build SDK is iPhoneOS26.5, while the
walked phone reports iOS26.6.1. SDK documentation is not a measurement of the
phone's timing or gesture behavior.

- Apple's [active-reader callback](https://developer.apple.com/documentation/corenfc/nfcndefreadersessiondelegate/readersessiondidbecomeactive(_:))
  describes when RF scanning has become active. The installed SDK
  `NFCNDEFReaderSession.h:74-80` says: "RF is enabled and reader is scanning
  for tags." The NDEF-specific callback is available from iOS13, below this
  project's iOS15 floor. It is distinct from app foreground activity.
- PRIMARY local SDK `NFCReaderSession.h:51-58` separates initiating a session,
  successful activation, and session-start errors delivered via invalidation.
  `NFCNDEFReaderSession.h:119-130` describes the modal system UI and background
  termination. This supports rejecting a persistent-background scan premise,
  not a claim that every attempted Home gesture will succeed or fail.
- Apple exposes distinct [reader error codes](https://developer.apple.com/documentation/corenfc/nfcreadererror-swift.struct),
  including unexpected termination and system busy. The installed SDK header
  `NFCError.h:36-40,65-69` likewise distinguishes those cases. Their existence
  does not identify which occurred in this walk.
- The same SDK header has both a FIFO-queue note for subsequent NDEF sessions
  (`NFCNDEFReaderSession.h:95`) and an older initializer note about system-busy
  rejection (`:126-127`). Treat those as insufficient to predict this exact
  reopen sequence. Capture actual activation/error facts; do not invent a
  delay or infer system-busy from the documentation tension.
- [Detected NDEF tags](https://developer.apple.com/documentation/corenfc/nfcndefreadersessiondelegate/readersession(_:diddetect:))
  arrive as an array; SDK `NFCNDEFReaderSession.h:62-71` confirms that API.
  Radio detection of both physical objects in this setup remains unobserved.

SDK header root:
`/Applications/Xcode.app/Contents/Developer/Platforms/iPhoneOS.platform/Developer/SDKs/iPhoneOS26.5.sdk/System/Library/Frameworks/CoreNFC.framework/Headers/`.
Web results supplied the active-callback/error descriptions; some direct
documentation opens returned JavaScript shells and their Markdown links were
not readable through the web tool. The installed SDK was read directly for
the additional platform contracts above. No secondary-source claim is used.

## Concrete diagnostic gaps, not a guessed root cause

SOURCE at reviewed local overlay SHA-256
`a3479c9408eabf54557bfd9995372cac030a8f60d11c00fb5c90b63e2ece962f`:
installed `NfcPlugin.swift:149-170` calls session.begin() then resolves the
bridge call. There is no NDEF readerSessionDidBecomeActive implementation.
`app/src/monitor/nfc/GateMinusOneProbe.tsx:702-726` treats that resolution as
native readiness before releasing the old held callback. Thus the recorded
acknowledgment proves initiation/ownership acceptance, not RF activation.
INFERENCE: observing the actual activation callback would discriminate those
states. This is an observability gap, not proof that it caused B's failure.

SOURCE: installed `NfcPlugin.swift:5-15,135-144` collapses all other native
errors to invalidated and emits only reason/attemptId. The preserved receipts
therefore cannot recover the native error code. A future diagnostic should
retain an allowlisted error category/code, originating operation and actual
activation milestone, without dumping NSError.userInfo or device identities.
It must report observations, not change start semantics or guess a retry timer
under the label of logging.

SOURCE: `GateMinusOneProbe.tsx:498-518,924-940` makes reload controls conditional;
`:157-186,786-789` stores only handoff metadata across document reload;
`:739-755` exports independently of clipboard success. These existing seams
support simplifying the workflow, but auto-capture, cross-document retention
and agent-controlled advancement are not built or proven by this review.

## Recommended desk-only design scope

First design the smallest discriminating trace and capture path, not the whole
guided-case workflow or implementation of Scan NFC. One recovery attempt needs
three distinct observations: initiation requested/acknowledged, actual RF-active
callback if delivered, and native ending/error category with originating
operation. Keep start semantics unchanged. If no activation callback precedes
an ending, record its absence in that captured sequence, not a guessed cause.

Use the existing controller console/capture path as the first candidate. It
already transported complete receipts despite clipboard failure. The design
must preserve failure evidence before any reload and stop on missing capture;
it cannot require James to repair the evidence by repeatedly typing commands.
Retain only allowlisted native domain/category and numeric error code, not
NSError.userInfo, device identities or arbitrary error descriptions. The exact
diagnostic contract and tests belong to the subsequent bounded design, not a
new storage mechanism invented in this review.

Guided cases, automatic advancement and scenario-UI changes are conditional
follow-ons only if existing controls cannot safely deliver the necessary trace
under the approved typing budget. No guessed delays, automatic retries,
start-semantics change or storage subsystem is proposed. No operator action
may rely on reaching a control through a native modal.

This recommendation is not implementation approval. Any selected user-visible
change must receive its rendered design approval; native diagnostics and any
new persisted shape receive their normal design/hardening/testing gates.
Desk rehearsal must cover failure/capture before proposing a hardware run.

## PM review

`/root/walk_policy_pm`: PASS on these feasibility findings and the canonical
action-feasibility clause; narrow next desk scope to the trace/capture design
above. The first draft's broader guided-case rewrite was rejected as premature
and is replaced here, not approved by implication. Reducing operator burden
remains a mandatory future-walk constraint. Cost: recovery remains unproved
longer. No implementation, rendered UI or hardware walk is approved.

## Future walk readiness

NOT READY. There is no honest revised runtime estimate or approved runsheet
yet. After the diagnostic repair is designed and rehearsed, propose ONE
question with a pinned build, exact usable actions, independent evidence,
total operator-time hard stop and declared attempt/typing budgets. New action
feasibility may be the explicitly bounded experiment; it may not be smuggled
in as a proven prerequisite. PM approval and James's separate agreement are
both required. No request to resume hardware is made here.
