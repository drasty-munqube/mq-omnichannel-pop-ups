/* ============================================================
   SETTINGS LAYOUT

   The Settings page with its sections as tabs. Each tab is its
   own child route, so a section can be linked to directly and
   has its own loader:

     /app/settings                        General (store setup,
                                          what to expect)
     /app/settings/email-templates        Email templates list
     /app/settings/email-templates/:id    Template builder
   ============================================================ */

import { NavLink, Outlet } from "react-router";

import {
  color,
  fontWeight,
  space,
  transition,
} from "../design/tokens";

const TABS = [
  { to: "/app/settings", label: "General", end: true },
  { to: "/app/settings/email-templates", label: "Email Templates", end: false },
];

export default function SettingsLayout() {
  return (
    <s-page heading="Settings" inlineSize="large">
      <nav
        aria-label="Settings sections"
        style={{
          display: "flex",
          gap: space[6],
          borderBottom: `1px solid ${color.border}`,
          marginBottom: space[7],
          overflowX: "auto",
        }}
      >
        {TABS.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            end={tab.end}
            prefetch="intent"
            style={({ isActive }) => ({
              padding: `${space[5]} ${space[1]}`,
              marginBottom: "-1px",
              borderBottom: `2px solid ${isActive ? color.primary : "transparent"}`,
              color: isActive ? color.textStrong : color.textMuted,
              fontSize: "14px",
              fontWeight: isActive ? fontWeight.semibold : fontWeight.medium,
              textDecoration: "none",
              whiteSpace: "nowrap",
              transition: transition.base,
            })}
          >
            {tab.label}
          </NavLink>
        ))}
      </nav>

      <Outlet />
    </s-page>
  );
}
