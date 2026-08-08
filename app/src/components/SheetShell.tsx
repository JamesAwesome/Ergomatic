import { useEffect, useRef, type ReactNode, type RefObject } from "react";

/**
 * The dialog machinery a bottom sheet needs, with zero knowledge of what it
 * holds: backdrop, `role="dialog"`/`aria-modal="true"`, and the focus trap
 * this codebase's first such element originally shipped without (Md4,
 * whole-branch review — see the extraction's own history in
 * `library/FilterSheet.tsx`, the sheet this was lifted out of whole).
 *
 * Every button rendered inside `children` and the `primary` control is
 * assumed to be a real `<button>` (no links/inputs/other focusable kinds),
 * so `querySelectorAll("button")` is the complete, correctly-ordered
 * focusable set — kept as a small helper rather than a library so a future
 * group added by a caller is included automatically as long as it's a
 * button.
 *
 * `onDismiss` fires on backdrop tap, Escape, or (per the caller's own
 * unmount) a route/tab change — discarding whatever the caller's own draft
 * state was is the CALLER's job, not this component's; SheetShell only ever
 * reports "go away."
 *
 * `primary.describedBy` (Round 2 fix round, 2026-08-04, M1): optional —
 * Library's FilterSheet.tsx carries the live count IN the button's own
 * accessible name ("Show N workouts"), so it needs nothing here. Today's
 * FILTER sheet moved that count to a separate caption once its own primary
 * became the constant "Apply Filter" (the Revision), which orphaned the
 * count from the accessible tree entirely: a disabled button isn't
 * focusable, so a screen-reader user landing on "Apply Filter, dimmed"
 * never learned why. Wiring the id straight onto `aria-describedby` (not
 * `aria-live`, which would announce every draft toggle as the rower taps
 * through cells) restores that — TodayFilterSheet.tsx is the one caller
 * that passes it.
 *
 * `primary` is OPTIONAL (Phase 7B Task 7). Both filter sheets have a
 * level-1 commit and pass one; the connected-mode diagnostics sheet
 * (`workout/connected/ConnectionLogSheet.tsx`) has none — the connected
 * handoff §5 gives it a level-3 `COPY LOG` over a level-2 `Close`, and the
 * house's one-L1-per-screen rule means a shell that always emitted a
 * `.button-l1` would have handed that sheet a second primary it does not
 * want. Omitting the prop renders no button at all; the caller's own
 * buttons in `children` are still the focus trap's `focusableElements()`,
 * since that reads every `<button>` in the dialog rather than a list this
 * component keeps. */
export function SheetShell({
  open,
  titleId,
  onDismiss,
  opener,
  primary,
  children,
}: {
  open: boolean;
  titleId: string;
  onDismiss: () => void;
  opener: RefObject<HTMLElement | null>;
  primary?: {
    label: string;
    disabled: boolean;
    onPress: () => void;
    describedBy?: string;
  };
  children: ReactNode;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);

  function focusableElements(): HTMLElement[] {
    const dialog = dialogRef.current;
    if (!dialog) return [];
    return Array.from(dialog.querySelectorAll<HTMLElement>("button"));
  }

  // Moves focus into the sheet when it opens (the first control) and
  // restores it to `opener` (the caller's own trigger element) once it
  // closes — captured by the CALLER rather than read fresh from
  // `document.activeElement` here, so the restore target is whatever
  // opened this specific sheet, not whatever happens to have focus at the
  // moment this effect runs.
  useEffect(() => {
    if (!open) return;
    focusableElements()[0]?.focus();
    const restoreTarget = opener.current;
    return () => {
      restoreTarget?.focus?.();
    };
  }, [open, opener]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onDismiss();
        return;
      }
      if (e.key !== "Tab") return;
      // Containment, not a full roving-tabindex implementation: every
      // in-between Tab press is left to the browser's own default focus
      // order (which already visits every button here top-to-bottom), and
      // only the two ends wrap — Tab past the last control lands back on
      // the first, Shift+Tab before the first lands on the last, so the
      // sheet never leaks focus onto whatever it visually covers while
      // `aria-modal="true"` claims that content is inert.
      const focusable = focusableElements();
      if (focusable.length === 0) return;
      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onDismiss]);

  if (!open) return null;

  return (
    <div className="filter-sheet-backdrop" onClick={onDismiss}>
      <div
        ref={dialogRef}
        className="filter-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
        {primary !== undefined && (
          <button
            type="button"
            className="button-l1"
            disabled={primary.disabled}
            aria-describedby={primary.describedBy}
            onClick={primary.onPress}
          >
            {primary.label}
          </button>
        )}
      </div>
    </div>
  );
}
