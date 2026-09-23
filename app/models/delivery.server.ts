import nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";

import db from "../db.server";
import { couponEmail } from "./coupon-email";

/* ============================================================
   COUPON DELIVERY

   A popup submission promises the shopper a code. This is the
   part that keeps that promise.

   Two rules shape the whole file.

   The code is never taken from the request. The browser sends a
   campaign id and the campaign's own reward code is read from
   the database here, so nobody can open dev tools and ask for a
   discount they were not offered.

   Nothing is sent while the shopper is waiting. The submission
   writes a row and returns; the sending happens after, and can
   be retried. An SMTP handshake that takes four seconds must
   not become four seconds of spinner on somebody's storefront.
   ============================================================ */

export type DeliveryChannel = "email";

export { couponEmail } from "./coupon-email";

const MAX_ATTEMPTS = 5;

/* ------------------------------------------------------------
   TRANSPORT

   Built once and reused. A transport per message opens a new
   connection every time, which is slower and is what gets a
   sender rate limited.

   Missing configuration is not a crash. The app has to keep
   serving popups on a shop that has not set up email at all;
   deliveries simply stay pending and say why.
   ------------------------------------------------------------ */

let transporter: Transporter | null = null;
let transportError: string | null = null;

function getTransport() {
  if (transporter || transportError) {
    return transporter;
  }

  const host = process.env.EMAIL_HOST;
  const user = process.env.EMAIL_USER;
  const pass = process.env.EMAIL_PASS;

  if (!host || !user || !pass) {
    transportError =
      "Email is not configured (EMAIL_HOST, EMAIL_USER, EMAIL_PASS).";
    return null;
  }

  transporter = nodemailer.createTransport({
    host,
    port: Number(process.env.EMAIL_PORT) || 465,
    secure: process.env.EMAIL_SECURE !== "false",
    auth: { user, pass },
    pool: true,
    maxConnections: 3,
  });

  return transporter;
}

export function emailConfigured() {
  return Boolean(
    process.env.EMAIL_HOST &&
      process.env.EMAIL_USER &&
      process.env.EMAIL_PASS,
  );
}

/* ------------------------------------------------------------
   QUEUE

   Called from saveSubmission. Never throws: a coupon that
   cannot be queued must not cost the merchant the contact.
   ------------------------------------------------------------ */

export async function queueCouponDelivery(input: {
  shop: string;
  contactId: string;
  campaignId?: string | null;
  email?: string | null;
}) {
  if (!input.campaignId || !input.email) {
    return null;
  }

  try {
    const campaign = await db.campaign.findFirst({
      where: { id: input.campaignId, shop: input.shop },
      select: { rewardDiscountCode: true },
    });

    const code = campaign?.rewardDiscountCode;

    /* A campaign without a reward owes nobody anything. */
    if (!code) {
      return null;
    }

    return await db.discountDelivery.create({
      data: {
        shop: input.shop,
        contactId: input.contactId,
        campaignId: input.campaignId,
        channel: "email",
        destination: input.email,
        code,
      },
    });
  } catch (error) {
    /* The unique index rejecting a second row is the guard doing
       its job, not a failure worth shouting about. */
    if (
      !String(error).includes("Unique constraint")
    ) {
      console.error("QUEUE DELIVERY ERROR:", error);
    }

    return null;
  }
}

/* ------------------------------------------------------------
   SEND

   Claims rows one at a time by bumping attempts before the send
   rather than after. If the process dies mid-send, the attempt
   is still counted, so a message that reliably kills the worker
   cannot be retried forever.
   ------------------------------------------------------------ */

async function sendOne(job: {
  id: string;
  destination: string;
  code: string;
  attempts: number;
}) {
  const transport = getTransport();

  if (!transport) {
    throw new Error(
      transportError || "Email is not configured.",
    );
  }

  const { subject, text, html } = couponEmail(job.code);

  const info = await transport.sendMail({
    from:
      process.env.MAIL_FROM ||
      process.env.EMAIL_USER,
    to: job.destination,
    subject,
    text,
    html,
  });

  return info.messageId || null;
}

export async function runPendingDeliveries(
  shop: string,
  limit = 25,
) {
  if (!emailConfigured()) {
    return { sent: 0, failed: 0, skipped: true };
  }

  const jobs = await db.discountDelivery.findMany({
    where: {
      shop,
      status: "pending",
      attempts: { lt: MAX_ATTEMPTS },
    },
    orderBy: { createdAt: "asc" },
    take: limit,
  });

  let sent = 0;
  let failed = 0;

  for (const job of jobs) {
    await db.discountDelivery.update({
      where: { id: job.id },
      data: { attempts: { increment: 1 } },
    });

    try {
      const providerId = await sendOne(job);

      await db.discountDelivery.update({
        where: { id: job.id },
        data: {
          status: "sent",
          sentAt: new Date(),
          providerId,
          error: null,
        },
      });

      sent += 1;
    } catch (error) {
      const attempts = job.attempts + 1;
      const givingUp = attempts >= MAX_ATTEMPTS;

      await db.discountDelivery.update({
        where: { id: job.id },
        data: {
          status: givingUp ? "failed" : "pending",
          error: String(
            error instanceof Error
              ? error.message
              : error,
          ).slice(0, 500),
        },
      });

      if (givingUp) {
        failed += 1;
      }

      console.error(
        "DELIVERY ATTEMPT FAILED:",
        job.id,
        error,
      );
    }
  }

  return { sent, failed, skipped: false };
}

/* Fire and forget, for the moment right after a submission. The
   scheduled pass is what actually guarantees delivery; this only
   makes the common case fast. Render's free instance sleeps on
   idle, so anything left running past the response can die. */

export function kickDeliveries(shop: string) {
  if (!emailConfigured()) {
    return;
  }

  void runPendingDeliveries(shop, 5).catch(
    (error) => {
      console.error("KICK DELIVERIES ERROR:", error);
    },
  );
}
