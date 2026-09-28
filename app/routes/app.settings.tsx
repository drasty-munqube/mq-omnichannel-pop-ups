/* ============================================================
   SETTINGS (layout)

   Settings has one section today, Channels:

     /app/settings           redirects to /app/settings/channels
     /app/settings/channels  app.settings.channels.*

   The old General tab was removed. Its route file now only
   redirects, so older links to /app/settings keep working.
   ============================================================ */

import { Outlet } from "react-router";

export default function SettingsLayout() {
  return (
    <s-page heading="Settings" inlineSize="large">
      <Outlet />
    </s-page>
  );
}
