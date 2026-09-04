# Repaired reader: interruption observations

Device/build provenance is unchanged from REPAIRED-NORMAL.md. These are
observations on this iPhone and these attempts, not a general iOS guarantee.

## Second connection

`second-connection-receipt.json` retains the first successful attempt and
the fresh 2026-09-04T16:18:35.712Z attempt. The latter was labelled
`background`, but it read the PM5 and completed targeted BLE connection and
disconnection without a separately observed background cancellation. Its
three redacted NFC records equal the first successful attempt byte for byte;
both matched `PM5 432331249 Row` with sixteen trailing zero bytes. Full DOM
records matched the final export except the permitted six address bytes.
This is a second connection/payload observation, not background recovery proof.

## Lifecycle diagnostic

James reports that he could not swipe out while the native NFC sheet was
open, could enter a popup, and found the connection sheet gone on returning
to Ergomatic. The specific popup and its causal role were not identified.

Controller collected the native console through devicectl session 38554.
Temporary App listeners reported NFC_TRACE_READY. The observed ordering was:

1. Reader start after App.getState returned true.
2. appStateChange false.
3. Native reader ending userCancelled, followed by stopScanning settlement
   and NFC/App listener-removal calls.
4. Diagnostic pause, then resume, then appStateChange true.
5. A new reader start after another App.getState returned true.
6. appStateChange false; export and status `Hold your iPhone near the PM5.`
7. Diagnostic listeners removed; NFC_TRACE_STOPPED.
8. A second userCancelled ending, stopScanning settlement and cleanup calls.

The two new attempts are 16:24:25.676Z and 16:25:04.658Z; both were exported
with scenario `normal`, zero records and no BLE connection. Preserve those
actual labels rather than relabelling operator intent. The supplied frame
envelope was exported before the second reader ending. Reassembly and strict
receipt serialization passed. The receipt's readerEndings array is empty;
native userCancelled observations above come from the console, not that array.

After the second ending, James ran the capture helper again. The final
`background-final.frames.json` strictly reassembles to
`background-final-receipt.json`, retaining all four attempts unchanged.
The latest DOM raw records were an empty array, matching the last attempt.
Both cancellation reasons remain console evidence: the ordinary `normal`
scenario does not preselect a reader-ending action for the receipt array.

This proves a delivered pause/resume, a cancelled reader before pause, and
acceptance of a fresh reader afterward. It does not exercise the probe's
pause-triggered drain of an active reader: the first reader ended beforehand.
It does not prove stale-callback isolation, successful post-background BLE
recovery, or the multi-tag singleton-error producer. Whole Gate -1 remains
NO-GO. No further swipe repetition is requested.
