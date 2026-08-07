import { NavLink } from "react-router-dom";
import { clearLibraryFilters } from "../library/libraryFilters";
import { clearLibraryScroll } from "../library/libraryScroll";

// A fresh Library visit forgets BOTH halves of "where you were" — the
// scroll position and the filters it was measured against. Clearing one
// without the other would restore a position against the wrong list (the
// filter-BACK bug) or silently keep filters the rower thought they left.
function clearLibraryReturnState() {
  clearLibraryScroll();
  clearLibraryFilters();
}

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
          // Library's own Link/BackLink returns both navigate to "/library"
          // with no `location.state` at all, so Library's mount can't tell
          // a BACK return from a fresh tab visit apart (see libraryScroll.ts).
          // Clearing right here, at the one link that IS unambiguously a
          // fresh visit, is the distinction: a tab tap always starts at the
          // top with no filters; a BACK return (never through this link)
          // still restores both.
          onClick={
            tab.path === "/library" ? clearLibraryReturnState : undefined
          }
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
