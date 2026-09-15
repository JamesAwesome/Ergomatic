import { useEffect, useRef, type ReactNode, type RefObject } from "react";

/**
 * The dialog machinery a bottom sheet needs, with zero knowledge of what it
 * holds: backdrop, `role="dialog"`/`aria-modal="true"`, and the focus trap
 * this codebase's first such element originally shipped without (Md4,
 * whole-branch review — see the extraction's own history in
 * `library/FilterSheet.tsx`, the sheet this was lifted out of whole).
 *
 * The focusable set is computed from what the browser will actually Tab to
 * — enabled buttons, links, and anything with a non-negative `tabindex` —
 * so a caller's scroll region or a disabled primary cannot silently break
 * containment. An earlier version assumed every focusable was an enabled
 * `<button>`; `ConnectionLogSheet`'s tabbable log list and both filter
 * sheets' disabled primaries each falsified that, and each leaked.
 *
 * `onDismiss` fires on backdrop tap, Escape, or (per the caller's own
 * unmount) a route/tab change — discarding whatever the caller's own draft
 * state was is the CALLER's job, not this component's; SheetShell only ever
 * reports "go away."
 *
 * `primary.describedBy` (Round 2 fix round, 2026-08-04, M1): optional —
 * introduced when Today's FILTER sheet moved its live count off the
 * button's own accessible name onto a separate caption, once its own
 * primary became the constant "Apply Filter" (the Revision), which
 * orphaned the count from the accessible tree entirely: a disabled button
 * isn't focusable, so a screen-reader user landing on "Apply Filter,
 * dimmed" never learned why. Wiring the id straight onto `aria-describedby`
 * (not `aria-live`, which would announce every draft toggle as the rower
 * taps through cells) restores that. Library's own FilterSheet.tsx adopted
 * the identical "Apply Filter" + caption contract in the
 * library-filter-unification round (Task 2) — both filter sheets pass
 * `describedBy` now, neither carries the count in the button's own name
 * any more.
 *
 * `primary` is OPTIONAL (Phase 7B Task 7). Both filter sheets have a
 * level-1 commit and pass one; the connected-mode diagnostics sheet
 * (`workout/connected/ConnectionLogSheet.tsx`) has none — the connected
 * handoff §5 gives it a level-3 `COPY LOG` over a level-2 `Close`, and the
 * house's one-L1-per-screen rule means a shell that always emitted a
 * `.button-l1` would have handed that sheet a second primary it does not
 * want. Omitting the prop renders no button at all; the caller's own
 * controls in `children` are still the focus trap's `focusableElements()`,
 * since that reads what the browser will Tab to (see its own doc below)
 * rather than a list this component keeps. */
export function SheetShell({
  open,
  titleId,
  onDismiss,
  opener,
  primary,
  focusTitleOnOpen = false,
  children,
}: {
  open: boolean;
  titleId: string;
  onDismiss: () => void;
  opener: RefObject<HTMLElement | null>;
  /** Focus the dialog itself rather than its first button when it opens.
   *  DEFAULT FALSE, so every existing caller is untouched.
   *
   *  The default is right for a sheet whose controls sit at the top. It is
   *  WRONG for one whose only control is a Close at the very end of a long
   *  scrolling body: focusing that button scrolls the sheet to its bottom,
   *  and the rower lands mid-sentence with the title, the first group
   *  heading and its first rows above the viewport. Measured at 844×390 on
   *  the tile-source sheet: `scrollTop` 332 of 642, title 283px above the
   *  top edge. */
  focusTitleOnOpen?: boolean;
  primary?: {
    label: string;
    disabled: boolean;
    onPress: () => void;
    describedBy?: string;
  };
  children: ReactNode;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);

  /** The controls the browser will Tab to, in document order: enabled
   *  buttons and form fields, links, and anything with a non-negative
   *  `tabindex`.
   *
   *  NOT an exhaustive enumeration of focusable HTML — `summary` and
   *  `[contenteditable]` are absent — and that matters MORE than it used to,
   *  because the handler below hard-stops on anything unlisted: an
   *  unenumerated control cannot be Tabbed PAST. Before that handler existed
   *  such an element matched neither end and the browser advanced normally.
   *  No caller renders one today (measured: all four); add to this list
   *  rather than working around it.
   *
   *  NOT just `button`. A DISABLED button is matched by that selector and
   *  cannot hold focus, so with a disabled primary — which both filter
   *  sheets have whenever their result count is zero — `activeElement` was
   *  never `last`, forward Tab fell out of the modal, and `last.focus()`
   *  was a no-op so Shift+Tab from `first` did nothing at all. Measured:
   *  twelve Tabs out of Library's FILTER sheet reached a workout link
   *  behind the scrim.
   *
   *  And a tabbable NON-button leaks the other way: `ConnectionLogSheet`
   *  gives its log list `tabIndex={0}` on purpose (WCAG 2.1.1, a scroll
   *  region needs to be reachable), and it sits BEFORE the first button, so
   *  Shift+Tab off it escaped onto the connected surface's pane controls
   *  mid-session. This component's own doc comment used to assert that
   *  `button` was the complete focusable set; that premise was false. */
  function focusableElements(): HTMLElement[] {
    const dialog = dialogRef.current;
    if (!dialog) return [];
    return Array.from(
      dialog.querySelectorAll<HTMLElement>(
        [
          "button:not([disabled])",
          "a[href]",
          'input:not([type="hidden"]):not([disabled])',
          "select:not([disabled])",
          "textarea:not([disabled])",
          '[tabindex]:not([tabindex="-1"])',
        ].join(", "),
      ),
    );
  }

  // Moves focus into the sheet when it opens (the first control) and
  // restores it to `opener` (the caller's own trigger element) once it
  // closes — captured by the CALLER rather than read fresh from
  // `document.activeElement` here, so the restore target is whatever
  // opened this specific sheet, not whatever happens to have focus at the
  // moment this effect runs.
  useEffect(() => {
    if (!open) return;
    if (focusTitleOnOpen) {
      // The dialog carries `tabIndex={-1}` so it can hold focus without
      // entering the tab order; the trap below still wraps the buttons.
      dialogRef.current?.focus();
      dialogRef.current?.scrollTo?.({ top: 0 });
    } else {
      focusableElements()[0]?.focus();
    }
    const restoreTarget = opener.current;
    return () => {
      restoreTarget?.focus?.();
    };
  }, [open, opener, focusTitleOnOpen]);

  // THE PAGE BEHIND A MODAL MUST NOT SCROLL (James, 2026-09-15, reading the
  // provenance sheet on his phone: "the screen behind it can still scroll").
  // The backdrop covers the viewport and swallows taps, but nothing stopped
  // the document itself moving under a wheel, a trackpad swipe or a drag that
  // began on the scrim — so the rower's own log slid around behind the sheet
  // they were reading. Every sheet in the app had this; it is fixed here
  // rather than per caller.
  //
  // `overflow: hidden` ALONE, and deliberately no `window.scrollTo` to put
  // the position back. The first version of this saved `scrollY` and restored
  // it on close, which broke two of Library's own tests — they count calls to
  // `scrollTo`, and the screen already owns its restoration. Two mechanisms
  // proposing one screen's scroll position is RF23, and this repo has already
  // shipped that bug once as the unmount clamp echo that wrote 0 over a saved
  // position. `overflow: hidden` does not move the document, so there is
  // nothing to put back; the `position: fixed` lock is what loses the offset,
  // and that is exactly why it is not used here.
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

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
      // ONE PREDICATE, not a list of special cases. Focus inside the dialog
      // that is not on an enumerated control — the dialog itself under
      // `focusTitleOnOpen`, or anything a future caller adds — wraps to the
      // end it is heading for. The previous version special-cased exactly
      // the dialog and left every other such position leaking.
      if (!focusable.includes(document.activeElement as HTMLElement)) {
        e.preventDefault();
        (e.shiftKey ? last : first).focus();
        return;
      }
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
    // `data-swipe-ignore` (Phase CS Item A, task-2 brief, Step 5): defence
    // in depth for the connected surface's swipe guard
    // (`workout/connected/swipe.ts`'s `isSwipeBlocked`), not the primary
    // one — the connected surface's own `logSheetOpen`/`blocked` boolean
    // already stops a swipe while any sheet using this shell is open. This
    // is a `<div onClick>`, not a real button, so it needs a named
    // opt-out to be caught by the "onClick/onPointerDown only on <button>
    // or `[data-swipe-ignore]`" house rule the connected surface's own
    // tests sweep for — and it makes the attribute a real, tested first
    // consumer rather than an escape hatch nothing exercises.
    <div
      className="filter-sheet-backdrop"
      onClick={onDismiss}
      data-swipe-ignore
    >
      <div
        ref={dialogRef}
        className="filter-sheet"
        tabIndex={-1}
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
