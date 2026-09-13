# Native Apple desk evidence

Commands and conclusions are recorded in `../2026-09-13-apple-native.md`.
These are the original author build/check logs and controller mutation logs
from the retained candidate at `202f6087`. Large logs use gzip; the SHA256
manifest names and hashes the original uncompressed bytes. No phone install
or runtime authorization is represented by this archive.

F3 correction evidence is numbered `20-46` and belongs to source commit
`81ce60409d78034bf2ceb62e4b9d0cfd1a19ca8b`. The full report is
`f3-native-logging-report.md`; `38-f3-source.patch` is the complete committed
patch. `29-f3-xcode-build.log.gz` is the corrected unsigned Debug simulator
build. The bridge probes use synthetic credentials and actual synced/built
configuration; they are not device observations.
