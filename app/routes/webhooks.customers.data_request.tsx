import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";

/* ============================================================
   MANDATORY GDPR WEBHOOK — customers/data_request

   Fired when a customer asks a merchant for the data an app has
   stored about them. Shopify requires every app to subscribe to
   this topic; there's no automatic response API, so this just
   logs the request for the merchant to act on manually within
   Shopify's 30-day window.
   ============================================================ */

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic, payload } =
    await authenticate.webhook(request);

  console.log(
    `Received ${topic} webhook for ${shop}`,
    payload,
  );

  return new Response();
};
