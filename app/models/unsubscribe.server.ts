/* ============================================================
   UNSUBSCRIBE (server)

   {{unsubscribeUrl}} in an email becomes a personal link:
     <app url>/unsubscribe?t=<token>
   The token carries the shop and the shopper's email and is
   signed with the app secret, so nobody can unsubscribe someone
   else by editing the link.

   Unsubscribing adds the address to EmailSuppression with reason
   "unsubscribed", and the send loop skips suppressed addresses,
   so no further emails go to it from this shop.
   ============================================================ */

import crypto from "node:crypto";

import db from "../db.server";

function secret() {
  return process.env.UNSUBSCRIBE_SECRET || process.env.SHOPIFY_API_SECRET || "";
}

function sign(payload: string) {
  return crypto.createHmac("sha256", secret()).update(payload).digest("base64url");
}

export function makeUnsubscribeToken(shop: string, email: string) {
  const payload = Buffer.from(JSON.stringify({ s: shop, e: email.trim().toLowerCase() })).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function readUnsubscribeToken(token: string | null | undefined): { shop: string; email: string } | null {
  if (!token || !secret()) return null;
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;

  const expected = Buffer.from(sign(payload));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !crypto.timingSafeEqual(expected, given)) return null;

  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (typeof data?.s !== "string" || typeof data?.e !== "string" || !data.s || !data.e) return null;
    return { shop: data.s, email: data.e };
  } catch {
    return null;
  }
}

/* Null when the app URL or secret is missing (for example a
   misconfigured local setup); callers fall back to the store link. */
export function unsubscribeUrl(shop: string, email: string) {
  const base = (process.env.SHOPIFY_APP_URL || "").replace(/\/+$/, "");
  if (!base || !secret()) return null;
  return `${base}/unsubscribe?t=${makeUnsubscribeToken(shop, email)}`;
}

export async function unsubscribeEmail(shop: string, email: string) {
  const address = email.trim().toLowerCase();
  await db.emailSuppression.upsert({
    where: { shop_email: { shop, email: address } },
    create: { shop, email: address, reason: "unsubscribed" },
    update: {},
  });
}

export async function isUnsubscribed(shop: string, email: string) {
  const row = await db.emailSuppression.findFirst({
    where: { shop, email: email.trim().toLowerCase() },
    select: { id: true },
  });
  return !!row;
}
