/* ============================================================
   SETTINGS (index)

   There is no General tab any more, so /app/settings goes
   straight to Channels. authenticate.admin's redirect keeps the
   embedded app's shop and host parameters on the way.
   ============================================================ */

import type { LoaderFunctionArgs } from "react-router";

import { authenticate } from "../shopify.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const { redirect } = await authenticate.admin(request);
  return redirect("/app/settings/channels");
}

export default function SettingsIndex() {
  return null;
}
