/* ============================================================
   CONTACT JOURNEY  (GET /app/journey/:contactId)

   JSON for the "View journey" dialog on the Contacts page: the
   anonymous visitors linked to a contact and every event they
   produced, first visit to signup. Admin only, scoped to the
   shop of the signed-in session.
   ============================================================ */

import type { LoaderFunctionArgs } from "react-router";

import { getContactJourney } from "../models/visitors.server";
import { authenticate } from "../shopify.server";

export async function loader({ request, params }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);
  try {
    const journey = await getContactJourney(session.shop, String(params.contactId || ""));
    if (!journey) return Response.json({ ok: false, error: "Contact not found." }, { status: 404 });
    return Response.json({ ok: true, journey });
  } catch (error) {
    console.error("JOURNEY ERROR:", error);
    return Response.json({ ok: false, error: "The journey could not be loaded." }, { status: 500 });
  }
}

export type JourneyResponse =
  | { ok: true; journey: NonNullable<Awaited<ReturnType<typeof getContactJourney>>> }
  | { ok: false; error: string };
