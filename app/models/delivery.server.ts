import nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";
import dns from "node:dns";
import net from "node:net";

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
   PROVIDERS

   Render's free web services block outbound SMTP (ports 25, 465
   and 587), so Gmail SMTP times out there no matter how it is
   configured. Production sends over HTTPS instead, which no host
   blocks. The first provider that is configured wins:

     BREVO_API_KEY   Brevo transactional API (free, 300/day)
     RESEND_API_KEY  Resend API (needs a verified domain)
     EMAIL_HOST ...  plain SMTP, fine locally or on a paid host

   MAIL_FROM is the sender for all three, as
   "Store name <you@example.com>". With Brevo that address must
   be a verified sender in the Brevo dashboard.
   ------------------------------------------------------------ */

type Provider = "brevo" | "resend" | "smtp";

function activeProvider(): Provider | null {
  if (process.env.BREVO_API_KEY) return "brevo";
  if (process.env.RESEND_API_KEY) return "resend";
  if (
    process.env.EMAIL_HOST &&
    process.env.EMAIL_USER &&
    process.env.EMAIL_PASS
  ) {
    return "smtp";
  }
  return null;
}

export function emailConfigured() {
  return activeProvider() !== null;
}

function sender() {
  const raw = (
    process.env.MAIL_FROM ||
    process.env.EMAIL_USER ||
    ""
  ).trim();
  const match = raw.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/);

  if (match) {
    return {
      raw,
      name: match[1].trim() || undefined,
      email: match[2].trim(),
    };
  }

  return { raw, name: undefined, email: raw };
}

const HTTP_TIMEOUT_MS = 15_000;

async function postJson(
  url: string,
  headers: Record<string, string>,
  body: unknown,
) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...headers,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
  });

  const text = await response.text();

  if (!response.ok) {
    throw new Error(
      `HTTP ${response.status}: ${text.slice(0, 300)}`,
    );
  }

  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return {};
  }
}

type Message = {
  to: string;
  subject: string;
  text: string;
  html: string;
};

async function sendViaBrevo(message: Message) {
  const from = sender();

  if (!from.email) {
    throw new Error("MAIL_FROM is not set.");
  }

  const result = await postJson(
    "https://api.brevo.com/v3/smtp/email",
    { "api-key": process.env.BREVO_API_KEY as string },
    {
      sender: from.name
        ? { name: from.name, email: from.email }
        : { email: from.email },
      to: [{ email: message.to }],
      subject: message.subject,
      htmlContent: message.html,
      textContent: message.text,
    },
  );

  return (result.messageId as string) || null;
}

async function sendViaResend(message: Message) {
  const from = sender();

  if (!from.email) {
    throw new Error("MAIL_FROM is not set.");
  }

  const result = await postJson(
    "https://api.resend.com/emails",
    {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
    },
    {
      from: from.raw,
      to: [message.to],
      subject: message.subject,
      html: message.html,
      text: message.text,
    },
  );

  return (result.id as string) || null;
}

/* SMTP transport, built once and reused. */

let transporter: Transporter | null = null;

async function getTransport() {
  if (transporter) {
    return transporter;
  }

  const host = process.env.EMAIL_HOST as string;
  const user = process.env.EMAIL_USER as string;
  const pass = process.env.EMAIL_PASS as string;

  // Some hosts advertise an IPv6 interface that is not routable,
  // and nodemailer picks a random address from the IPv4+IPv6 pool.
  // Connecting by an IPv4 address avoids ENETUNREACH; tls.servername
  // keeps the certificate checked against the real hostname.
  let connectHost = host;
  let servername: string | undefined;

  if (!net.isIP(host)) {
    try {
      const addresses = await dns.promises.resolve4(host);
      if (addresses.length > 0) {
        connectHost =
          addresses[Math.floor(Math.random() * addresses.length)];
        servername = host;
      }
    } catch {
      // Fall back to the hostname; nodemailer resolves it itself.
    }
  }

  transporter = nodemailer.createTransport({
    host: connectHost,
    port: Number(process.env.EMAIL_PORT) || 465,
    secure: process.env.EMAIL_SECURE !== "false",
    auth: { user, pass },
    pool: true,
    maxConnections: 3,
    // Fail fast instead of hanging for two minutes when the port
    // is blocked, so the row gets an honest error quickly.
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
    ...(servername ? { tls: { servername } } : {}),
  });

  return transporter;
}

async function sendViaSmtp(message: Message) {
  const transport = await getTransport();
  const from = sender();

  const info = await transport.sendMail({
    from: from.raw || process.env.EMAIL_USER,
    to: message.to,
    subject: message.subject,
    text: message.text,
    html: message.html,
  });

  return info.messageId || null;
}

async function sendOne(job: { destination: string; code: string }) {
  const provider = activeProvider();
  const { subject, text, html } = couponEmail(job.code);
  const message = { to: job.destination, subject, text, html };

  switch (provider) {
    case "brevo":
      return sendViaBrevo(message);
    case "resend":
      return sendViaResend(message);
    case "smtp":
      return sendViaSmtp(message);
    default:
      throw new Error(
        "Email is not configured. Set BREVO_API_KEY (or RESEND_API_KEY, or EMAIL_HOST/EMAIL_USER/EMAIL_PASS).",
      );
  }
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
    if (!String(error).includes("Unique constraint")) {
      console.error("QUEUE DELIVERY ERROR:", error);
    }

    return null;
  }
}

/* ------------------------------------------------------------
   SEND LOOP

   Each row is claimed with a conditional update (same id, still
   pending, same attempt count). If two runs overlap, only one
   wins the claim and the other skips the row, so nobody gets the
   email twice. The attempt is counted before the send, so a
   message that kills the process cannot be retried forever.

   Every write uses updateMany, so a row deleted mid-send (for
   example from the database dashboard) is skipped instead of
   crashing the whole run.
   ------------------------------------------------------------ */

export async function runPendingDeliveries(shop: string, limit = 25) {
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
    const claim = await db.discountDelivery.updateMany({
      where: {
        id: job.id,
        status: "pending",
        attempts: job.attempts,
      },
      data: { attempts: { increment: 1 } },
    });

    if (claim.count === 0) {
      continue;
    }

    try {
      const providerId = await sendOne(job);

      await db.discountDelivery.updateMany({
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

      await db.discountDelivery.updateMany({
        where: { id: job.id },
        data: {
          status: givingUp ? "failed" : "pending",
          error: String(
            error instanceof Error ? error.message : error,
          ).slice(0, 500),
        },
      });

      if (givingUp) {
        failed += 1;
      }

      console.error("DELIVERY ATTEMPT FAILED:", job.id, error);
    }
  }

  return { sent, failed, skipped: false };
}

/* Fire and forget, right after a submission, so the shopper
   is not kept waiting on the send. Anything still pending is
   picked up by the next run. */

export function kickDeliveries(shop: string) {
  if (!emailConfigured()) {
    return;
  }

  void runPendingDeliveries(shop, 5).catch((error) => {
    console.error("KICK DELIVERIES ERROR:", error);
  });
}
