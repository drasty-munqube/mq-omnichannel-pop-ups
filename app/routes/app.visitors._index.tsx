/* ============================================================
   VISITORS (moved)

   Visitors are part of the one list on the Contacts page now.
   This route sends old links and bookmarks there, keeping any
   filter, search and page in the address.
   ============================================================ */

import type { LoaderFunctionArgs } from "react-router";

import { authenticate } from "../shopify.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const { redirect } = await authenticate.admin(request);
  const params = new URLSearchParams(new URL(request.url).search);
  params.delete("tab");
  /* Without a filter, an old Visitors link meant "not signed up". */
  if (!params.get("filter")) params.set("filter", "anonymous");
  return redirect(`/app/contacts?${params.toString()}`);
}

/* Never rendered: the loader always redirects. */
export default function VisitorsMoved() {
  return null;
}
