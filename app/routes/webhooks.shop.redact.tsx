import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";

/* ============================================================
   MANDATORY GDPR WEBHOOK — shop/redact

   Fired 48 hours after a shop uninstalls the app, instructing
   the app to erase everything it stored for that shop. Sessions
   are already cleared by webhooks.app.uninstalled.tsx, but this
   is the backstop Shopify requires regardless of whether that
   ran, so every shop-scoped table is cleared here too.
   ============================================================ */

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic } = await authenticate.webhook(request);

  console.log(`Received ${topic} webhook for ${shop}`);

  await db.$transaction([
    db.session.deleteMany({ where: { shop } }),
    db.contact.deleteMany({ where: { shop } }),
    db.campaign.deleteMany({ where: { shop } }),
    db.popup.deleteMany({ where: { shop } }),
    db.site.deleteMany({ where: { shop } }),
    db.popupEvent.deleteMany({ where: { shop } }),
  ]);

  return new Response();
};
