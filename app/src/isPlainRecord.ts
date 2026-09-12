/** The one shape guard every localStorage reader in `src/` shares. Was
 *  declared four times byte-identically (`monitor/monitorRun.ts`,
 *  `builder/builderDraft.ts`, `session/draft.ts`, `session/run.ts`) until
 *  Phase MD PR 1 folded them here. An array is `typeof "object"` and so is
 *  `null`; neither is a record a validator may index into. */
export function isPlainRecord(
  value: unknown,
): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
