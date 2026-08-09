import { NavLink } from "react-router-dom";
import { clearLibraryFilters } from "../library/libraryFilters";
import { clearLibraryScroll } from "../library/libraryScroll";
import { clearNewsScroll } from "../news/newsScroll";

// A fresh Library visit forgets BOTH halves of "where you were" — the
// scroll position and the filters it was measured against. Clearing one
// without the other would restore a position against the wrong list (the
// filter-BACK bug) or silently keep filters the rower thought they left.
function clearLibraryReturnState() {
  clearLibraryScroll();
  clearLibraryFilters();
}

// CL item / ROADMAP "News scroll memory": News has no filters of its own
// to clear alongside the scroll position (unlike Library above) — just
// the one saved value.
const CLEAR_ON_TAB: Partial<Record<string, () => void>> = {
  "/library": clearLibraryReturnState,
  "/news": clearNewsScroll,
};

// TABS is a fixed, non-component export alongside the TabBar component.
// react-refresh's allowConstantExport only recognizes literal/unary/
// template/binary expressions, not array literals, so this array trips the
// fast-refresh warning even though it never changes at runtime.
// eslint-disable-next-line react-refresh/only-export-components
export const TABS = [
  { path: "/today", label: "TODAY" },
  { path: "/news", label: "NEWS" },
  { path: "/library", label: "LIBRARY" },
  { path: "/plan", label: "PLAN" },
  { path: "/you", label: "YOU" },
];

export default function TabBar() {
  return (
    <nav className="tabbar" aria-label="Main">
      {TABS.map((tab) => (
        <NavLink
          key={tab.path}
          to={tab.path}
          // Library's own Link/BackLink returns carry no `location.state`
          // at all, so Library's mount can't tell a BACK return from a
          // fresh tab visit apart by looking at what it arrived with.
          // News is in the same position for a different reason: a return
          // via Reader's own ← BACK/✕ controls DOES carry state
          // (`useReadingTrail`'s `{ trail, origin }`), but News's own
          // mount never inspects it — that shape means nothing to News's
          // scroll restore, so a stateful reading-chain return and a bare
          // stateless browser back are equally valid "restore" signals
          // (see libraryScroll.ts/newsScroll.ts). Either way, THIS
          // `<NavLink>` is the one link that IS unambiguously a fresh
          // visit — it never carries reading-chain state and is the only
          // door a rower can use to jump to a tab on purpose — so clearing
          // right here is the distinction: a tab tap always starts at the
          // top (with no filters, for Library); a BACK return (never
          // through this link) still restores everything.
          onClick={CLEAR_ON_TAB[tab.path]}
          className={({ isActive }) => (isActive ? "tab tab-active" : "tab")}
        >
          {({ isActive }) => (
            <>
              <span
                className="tab-mark"
                aria-hidden="true"
                data-active={isActive}
              />
              {tab.label}
            </>
          )}
        </NavLink>
      ))}
    </nav>
  );
}
