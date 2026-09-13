# Apple review corrections — PR #425

Status: implementation and final verification in progress. This round begins at `86ed0636fd37c5969bdd369813534c4690de964d`; historical checks for that head are not checks for the changed source.

## Approved scope and dispositions

James authorized one coordinated fix round with “Handle them” after Claude's comments and the independent static review were reconciled. One subagent owns the app changes; the controller owns documentation and integrates review/evidence. The existing two-provider architecture, global admission policy, access policy and rendered wording/layout are retained.

| Feedback | Accepted correction |
| --- | --- |
| [Denied access loses its meaning](https://github.com/JamesAwesome/Ergomatic/pull/425#discussion_r4000137564) | Preserve `access_denied` and the verified/saved account email in JSON and web returns. Use the existing invitation notice; relay addresses are actionable. Consume and scrub the added `authEmail` return field. |
| [Native diagnostics disabled](https://github.com/JamesAwesome/Ergomatic/pull/425#discussion_r4000137601) | Keep generic credential-result logging disabled and restore application `console.*` through the public native Console override. Require a compiled WKWebView-to-native-stdout gate; historical JavaScript forwarding alone was insufficient. |
| [Idle linking route is blank](https://github.com/JamesAwesome/Ergomatic/pull/425#discussion_r4000137644) | Recover an idle/direct linking route to You while preserving active linking and consumed terminal navigation. Browser Back/BFCache/native eviction were not established by the source finding. |
| [Expired session rows accumulate](https://github.com/JamesAwesome/Ergomatic/pull/425#discussion_r4000137674) | Run existing session expiry cleanup from the front-door startup/minute owner, independently of attempt-cleanup failures. No new timer, index or migration. |
| [Unavailable methods still offer Add](https://github.com/JamesAwesome/Ergomatic/pull/425#discussion_r4000137709) | Keep method rows visible and disable Add unless both required proof providers are available on the current surface. Apply the same invariant to controller entry and retry. |
| [Unused native Google wrapper](https://github.com/JamesAwesome/Ergomatic/pull/425#discussion_r4000137764) | Remove the uncalled wrapper and wrapper-only tests; retain the initialized production proof path. No unmeasured bundle-size claim. |
| [Constant limiter key](https://github.com/JamesAwesome/Ergomatic/pull/425#discussion_r4000137822) | Explain the intentional global key beside its declaration; keep the approved 120/minute and 512 resident anonymous-attempt limits. |
| Independent static finding: failed cancel reports success | Retain only cleanup authority after an unacknowledged cancel, show the existing failure notice, and permit retry before advancing. Keep generation/operation ownership across asynchronous completions. Explicit local teardown relies on the existing server expiry bound. |
| Independent static finding: obsolete operative plans | Replace superseded native/deployment replacement blocks with current contracts and immutable historical links; remove active instructions for the retired environment switch and label historical results by source. |

Claude's [design comment](https://github.com/JamesAwesome/Ergomatic/pull/425#issuecomment-5654475759) also proposes provider extensibility work. A generic identity/provider architecture is outside the approved two-provider slice. The documented API/HTTP-local limitations remain deliberate. Apple's primary contract scopes user identifiers and private relay addresses to a developer team; grouping alone is not a documented reason to predict a new subject/address. [Deployment guidance](../../../deploy.md#apple-sign-in-setup) cites that contract and retains the real native/web continuity gate.

## Native mechanism and database evidence

[Native source research](native-logging-fix-research.md) and the single [mechanism pass plus controller disposition](native-logging-harden.md) establish the public registration seam and required oracle. The proposed arbitrary 4,068-character truncation was declined; preserve vendor full-message behavior. No executable implementation blocks were prescribed, so the prescribed-code lens is skipped for this delta. Runtime validation belongs to the implementation evidence, not those source-only reports.

The [DBA schedule measurement](db-cost/report.md) passes without an `expires_at` index or migration: at 100,000 sessions the 10,000-row expiry DELETE took 6.421 ms median; the subsequent scan over 90,000 live sessions took 2.523 ms per minute. Exact fixtures, plans, lock probes and commands are alongside that report. The isolated synthetic database was stopped after measurement. Production host performance is unmeasured.

## Review boundary

This is a separately authorized correction round. The original broad implementation review was interrupted by a platform cybersecurity-risk block and remains incomplete. Its unfinished execution was not resumed, reassigned or rephrased, and its archived probe was not run. A new scoped fix review or passing tests cannot clear that verdict. The PR remains draft; no merge, deployment, phone installation, live provider login or upload is part of this round.
