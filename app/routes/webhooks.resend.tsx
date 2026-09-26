/* ============================================================
   RESEND WEBHOOK  (POST /webhooks/resend)

   Resend calls this for every email event (sent, delivered,
   opened, clicked, bounced, complained, failed...). The request
   is only trusted after its Svix signature checks out against
   RESEND_WEBHOOK_SECRET (from Resend > Webhooks), so nobody can
   post fake "delivered" or "bounced" events.

   Always answers 2xx for events we cannot match (for example
   emails sent from a local dev server), so Resend does not keep
   retrying them.
   ============================================================ */

import type { ActionFunctionArgs } from "react-router";

import { recordEmailEvent, verifyResendSignature } from "../models/email-events.server";

export async function loader() {
  return new Response("Method Not Allowed", { status: 405 });
}

export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  const secret = process.env.RESEND_WEBHOOK_SECRET || "";
  if (!secret) {
    console.error("RESEND WEBHOOK: RESEND_WEBHOOK_SECRET is not set.");
    return new Response("Webhook not configured", { status: 503 });
  }

  // The signature covers the exact bytes, so read the raw body.
  const rawBody = await request.text();

  const valid = verifyResendSignature(
    rawBody,
    {
      id: request.headers.get("svix-id"),
      timestamp: request.headers.get("svix-timestamp"),
      signature: request.headers.get("svix-signature"),
    },
    secret,
  );

  if (!valid) {
    return new Response("Invalid signature", { status: 401 });
  }

  let event: unknown;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  try {
    const result = await recordEmailEvent(event as Parameters<typeof recordEmailEvent>[0]);
    return Response.json({ ok: true, result });
  } catch (error) {
    // 500 lets Resend retry later (for example a database blip).
    console.error("RESEND WEBHOOK ERROR:", error);
    return new Response("Error", { status: 500 });
  }
}
