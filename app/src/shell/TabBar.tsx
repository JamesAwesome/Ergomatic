import { NavLink } from "react-router-dom";

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
