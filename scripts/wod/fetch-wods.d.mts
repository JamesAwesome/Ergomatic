// Co-located hand-written declarations for fetch-wods.mjs (plain JS, no
// build step — see the file's own header). Lets app/server/wodFetch.test.ts
// import it under strict/noImplicitAny without pulling this repo-root
// scripts/ dir into any app/ tsconfig's rootDir. Shape is intentionally
// loose (optional fields covering both the success and error record
// variants) — the real contract is enforced by the tests, not this type.
export interface WodRecord {
  date: string;
  equipment?: string;
  title?: string;
  raw?: string;
  sourceUrl?: string;
  error?: string;
  excerpt?: string;
  retrievedAt?: string;
}

export declare function extractWod(html: string, date: string): WodRecord;

export declare function appendNew(
  records: WodRecord[],
  jsonlPath: string,
): { appended: number; skipped: number };

export declare function fetchRange(
  fromDate: string,
  toDate: string,
  opts?: {
    out?: string;
    delayMs?: number;
    fetchImpl?: (url: string) => Promise<Response>;
    sleep?: (ms: number) => Promise<void>;
  },
): Promise<{ appended: number; skipped: number }>;
