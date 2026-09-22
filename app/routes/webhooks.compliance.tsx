import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";

/* ============================================================
   MANDATORY COMPLIANCE WEBHOOKS

   Shopify treats customers/data_request, customers/redact and
   shop/redact as compliance topics, not ordinary webhook
   topics. They are declared in shopify.app.toml under
   compliance_topics, which registers all three against a single
   endpoint, so all three arrive here and are told apart by the
   topic Shopify sends.

   The per-topic route files are kept alongside this one because
   Shopify can keep testing the older URLs for a while after a
   config change.
   ============================================================ */

export const action = async ({
  request,
}: ActionFunctionArgs) => {
  const { shop, topic, payload } =
    await authenticate.webhook(request);

  console.log(
    `Received compliance webhook ${topic} for ${shop}`,
  );

  switch (topic) {
    /* --------------------------------------------------------
       A customer asked the merchant what this app stores about
       them. There is no API to answer with, so the request is
       logged for the merchant to handle inside Shopify's
       30-day window.
       -------------------------------------------------------- */
    case "CUSTOMERS_DATA_REQUEST": {
      console.log("Data request payload:", payload);
      break;
    }

    /* --------------------------------------------------------
       Erase one customer. The only customer-identifying data
       this app holds is Contact rows from popup submissions,
       matched on the email or phone Shopify sends.
       -------------------------------------------------------- */
    case "CUSTOMERS_REDACT": {
      const customer = (
        payload as {
          customer?: {
            email?: string;
            phone?: string;
          };
        }
      ).customer;

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

      break;
    }

    /* --------------------------------------------------------
       Erase everything for a shop, 48 hours after uninstall.
       Sessions are already cleared by the uninstall webhook,
       but this has to work whether or not that ran.
       -------------------------------------------------------- */
    case "SHOP_REDACT": {
      await db.$transaction([
        db.session.deleteMany({ where: { shop } }),
        db.contact.deleteMany({ where: { shop } }),
        db.campaign.deleteMany({ where: { shop } }),
        db.popup.deleteMany({ where: { shop } }),
        db.site.deleteMany({ where: { shop } }),
      ]);

      break;
    }

    default: {
      console.log(
        `Unhandled compliance topic: ${topic}`,
      );
    }
  }

  return new Response();
};
