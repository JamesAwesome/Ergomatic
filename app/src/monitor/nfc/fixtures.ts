import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { NfcRecord } from "../../../domain/monitor/nfc.js";

/** The canonical Gate -1 capture (`docs/monitor/nfc/README.md`): three
 *  records read from James's PM5 on 2026-09-04, six address bytes zeroed. */
const FIXTURE_URL = new URL(
  "../../../../docs/monitor/nfc/pm5-tag-2026-09-04-iphone.json",
  import.meta.url,
);

export interface Pm5NfcFixture {
  schema: "ergomatic/pm5-nfc-records/v1";
  source: string;
  records: (NfcRecord & { id: number[] })[];
}

export function loadPm5NfcFixture(): Pm5NfcFixture {
  return JSON.parse(
    readFileSync(fileURLToPath(FIXTURE_URL), "utf8"),
  ) as Pm5NfcFixture;
}

/** The literal the fixture's PM5 record decodes to. Kept as an independent
 *  literal on purpose: a parser test must not derive its expectation from
 *  the parser (RF21). */
export const FIXTURE_PM5_NAME = "PM5 432331249 Row";
