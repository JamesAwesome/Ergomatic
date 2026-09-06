import { clearDraft, loadDraft, type SessionDraft } from "./draft";
import { clearRun, loadRun, type SessionRun } from "./run";

/** Draft identity has a different mint site from the run's startedAt.
 * Only the exact draft captured with a still-current run belongs to it. */
export function clearSelectedTimer(
  run: SessionRun,
  draft: SessionDraft | null,
) {
  if (loadRun()?.startedAt !== run.startedAt) return;
  clearRun();
  if (draft !== null && JSON.stringify(loadDraft()) === JSON.stringify(draft))
    clearDraft();
}
