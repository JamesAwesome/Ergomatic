import { NavLink } from "react-router-dom";
import { clearLibraryScroll } from "../library/libraryScroll";

// TABS is a fixed, non-component export alongside the TabBar component.
// react-refresh's allowConstantExport only recognizes literal/unary/
// template/binary expressions, not array literals, so this array trips the
// fast-refresh warning even though it never changes at runtime.
// eslint-disable-next-line react-refresh/only-export-components
export const TABS = [
  { path: "/today", label: "TODAY" },
  { path: "/library", label: "LIBRARY" },
  { path: "/plan", label: "PLAN" },
  { path: "/trend", label: "TREND" },
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
          // top; a BACK return (never through this link) still restores.
          onClick={tab.path === "/library" ? clearLibraryScroll : undefined}
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
