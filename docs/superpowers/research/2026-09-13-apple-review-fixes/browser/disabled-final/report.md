# Disabled Add final browser recheck

Raw `.log`, served HTML and CSS references resolve after extracting `runtime-logs.tar.gz` at the evidence root; [artifact instructions](../../artifacts.md) preserve their exact bytes.

**PASS at `c7fce22337bb03b486a7c2fd074c1fb1c7f96385`.** The served minified CSS contains `button.auth-method-row:disabled .auth-method-action{color:inherit}` and came from web image `sha256:73ee8306efa718833ffb2033decdd174ff91a979c89cd78f0b66a5ba91a3c52b` ([identity.log](identity.log)).

The single relevant case passed with one worker in 708 ms:

```sh
ERGOMATIC_E2E_WORKERS=1 pnpm exec playwright test --project=chromium \
  e2e/appleAuth.spec.ts \
  --grep 'signed-in methods disable Add when either proof is unavailable and idle deep links return to You'
```

Evidence: [named-test-corrected.log](named-test-corrected.log). An initial anchored grep selected zero tests and executed no test code ([named-test.log](named-test.log)).

Both new images were inspected at their exact requested viewports:

- [Portrait 390x844](captures/unavailable-add-portrait-390x844.png) — disabled row `350x54` at x=20.
- [Landscape 844x390](captures/unavailable-add-landscape-844x390.png) — disabled row `440x54` at x=202.

The only visual value changed from the original captures is the `Add Apple ›` color: `rgb(63, 60, 53)` became `rgb(160, 154, 140)`, now equal to the provider name and parent row. The new captures read consistently disabled. The 2.48:1 disabled-text contrast is exempt from the AA text requirement. Width, height, copy, provider ordering, dividers, and surrounding layout are unchanged; neither viewport has horizontal overflow.

Computed browser styles are `rgb(160, 154, 140)` for row, provider, and action, with `not-allowed` on each. This cursor value did not change in `c7fce223`: the previous report's pointer wording was an unmeasured source inference that overlooked the later `button:disabled` cascade. [capture-metrics.json](capture-metrics.json) is the first cursor measurement in this gate.

Axe still reports the previously recorded `page-has-heading-one` issue on the existing You page at both viewports; there are no new findings. Hashes: [capture-sha256.txt](capture-sha256.txt).

This follow-up uses the existing synthetic options/methods fixtures and test sign-in backdoor. It does not exercise real provider pages, native runtime, or the original platform-blocked gate.

Final teardown removed only the `ergomatic-17458` containers/network and retained `ergomatic-17458_pgdata`; `ergomatic-99321` was untouched ([stack-stop.log](stack-stop.log)).
