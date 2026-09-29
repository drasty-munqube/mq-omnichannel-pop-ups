import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { eraseVisitorsForContacts } from "../models/visitors.server";

/* ============================================================
   MANDATORY GDPR WEBHOOK — customers/redact

   Fired 10 days after a customer redaction request, instructing
   the app to erase that customer's data. The only place this
   app stores customer-identifying data is Contact (popup
   submissions), matched here by the email/phone Shopify sends.
   ============================================================ */

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic, payload } =
    await authenticate.webhook(request);

  console.log(`Received ${topic} webhook for ${shop}`);

  const customer = (payload as { customer?: { id?: number | string; email?: string; phone?: string } })
    .customer;
  const email = customer?.email;
  const phone = customer?.phone;
  const customerId = customer?.id != null ? String(customer.id) : null;

  if (email || phone || customerId) {
    const where = {
      shop,
      OR: [
        ...(email ? [{ email: { equals: email, mode: "insensitive" as const } }] : []),
        ...(phone ? [{ phone }] : []),
        ...(customerId ? [{ shopifyCustomerId: customerId }] : []),
      ],
    };
    /* Their visitor ids and journey go too. */
    const doomed = await db.contact.findMany({ where, select: { id: true } });
    await eraseVisitorsForContacts(shop, doomed.map((c) => c.id), customerId);
    await db.contact.deleteMany({ where });
  }

  return new Response();
};
