import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";

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

  const customer = (payload as { customer?: { email?: string; phone?: string } })
    .customer;
  const email = customer?.email;
  const phone = customer?.phone;

  if (email || phone) {
    await db.contact.deleteMany({
      where: {
        shop,
        OR: [
          ...(email ? [{ email }] : []),
          ...(phone ? [{ phone }] : []),
        ],
      },
    });
  }

  return new Response();
};
