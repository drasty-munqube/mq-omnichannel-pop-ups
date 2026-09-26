import nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";
import dns from "node:dns";
import net from "node:net";

import db from "../db.server";
import { couponEmail } from "./coupon-email";
import { getEmailTemplate } from "./email-template.server";
import { renderEmailTemplate } from "./email-template";

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
   blocks.

   EMAIL_PROVIDER=resend|brevo|smtp picks one explicitly. When it
   is not set (or names a provider that is not configured), the
   first configured one wins, in this order:

     BREVO_API_KEY   Brevo transactional API (free, 300/day)
     RESEND_API_KEY  Resend API (needs a verified domain)
     EMAIL_HOST ...  plain SMTP, fine locally or on a paid host

   MAIL_FROM is the sender for all three, as
   "Store name <you@example.com>". With Brevo that address must
   be a verified sender in the Brevo dashboard.
   ------------------------------------------------------------ */

type Provider = "brevo" | "resend" | "smtp";

function providerConfigured(provider: Provider) {
  switch (provider) {
    case "brevo":
      return Boolean(process.env.BREVO_API_KEY);
    case "resend":
      return Boolean(process.env.RESEND_API_KEY);
    case "smtp":
      return Boolean(
        process.env.EMAIL_HOST &&
          process.env.EMAIL_USER &&
          process.env.EMAIL_PASS,
      );
  }
}

function activeProvider(): Provider | null {
  const chosen = (process.env.EMAIL_PROVIDER || "").trim().toLowerCase();

  if (chosen === "brevo" || chosen === "resend" || chosen === "smtp") {
    if (providerConfigured(chosen)) return chosen;
    console.warn(
      `EMAIL_PROVIDER=${chosen} but it is not configured; falling back.`,
    );
  }

  for (const provider of ["brevo", "resend", "smtp"] as const) {
    if (providerConfigured(provider)) return provider;
  }
  return null;
}

export function emailConfigured() {
  return activeProvider() !== null;
}

/* For the Emails page: which provider is sending right now. */
export function activeEmailProvider() {
  return activeProvider();
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

/* A provider answered with an error. `status` decides what the
   queue does with it:
     429       rate or daily limit: wait, do not use up an attempt
     400, 422  the message itself is bad (for example an invalid
               address): retrying cannot help, fail it now
     other     network, 5xx, auth: normal retry */
export class ProviderError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "ProviderError";
    this.status = status;
  }
  get rateLimited() {
    return this.status === 429;
  }
  get permanent() {
    return this.status === 400 || this.status === 422;
  }
}

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
    throw new ProviderError(
      response.status,
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
  // Optional overrides from the campaign's email template.
  // The sending address itself always stays MAIL_FROM, which
  // is the one the provider has verified.
  fromName?: string;
  replyTo?: string;
  // Resend only: the same key within 24h returns the first send's
  // result instead of sending again, so a retry after a timeout
  // cannot give the shopper two emails.
  idempotencyKey?: string;
  // Resend only: shown and filterable in the Resend dashboard.
  tags?: { name: string; value: string }[];
  // Which saved template was used, if any (for tags and logs).
  templateId?: string;
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
      sender:
        message.fromName || from.name
          ? {
              name: message.fromName || from.name,
              email: from.email,
            }
          : { email: from.email },
      to: [{ email: message.to }],
      ...(message.replyTo
        ? { replyTo: { email: message.replyTo } }
        : {}),
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
      ...(message.idempotencyKey
        ? { "Idempotency-Key": message.idempotencyKey }
        : {}),
    },
    {
      from: message.fromName
        ? `${message.fromName} <${from.email}>`
        : from.raw,
      to: [message.to],
      ...(message.replyTo
        ? { reply_to: message.replyTo }
        : {}),
      subject: message.subject,
      html: message.html,
      text: message.text,
      ...(message.tags?.length ? { tags: message.tags } : {}),
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

  const address = from.email || process.env.EMAIL_USER || "";

  const info = await transport.sendMail({
    from:
      message.fromName && address
        ? { name: message.fromName, address }
        : from.raw || process.env.EMAIL_USER,
    to: message.to,
    ...(message.replyTo ? { replyTo: message.replyTo } : {}),
    subject: message.subject,
    text: message.text,
    html: message.html,
  });

  return info.messageId || null;
}

/* ------------------------------------------------------------
   MESSAGE

   Uses the email template picked in the campaign's Email step.
   Falls back to the built-in coupon email when the campaign has
   no template, the template was deleted, or the template does
   not contain {{discount.code}} (sending it would leave the
   shopper without the code they signed up for).
   ------------------------------------------------------------ */

type DeliveryJob = {
  id?: string;
  round?: number;
  shop: string;
  campaignId: string;
  contactId: string;
  destination: string;
  code: string;
};

const EMAIL_PATTERN = /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/;

function cleanHeader(value: string, max: number) {
  return value.replace(/[\r\n"<>]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
}

function htmlToText(html: string) {
  return html
    .replace(/<(style|head|title)[\s\S]*?<\/\1>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|h[1-6]|table)>/gi, "\n")
    .replace(/<a\s[^>]*href="([^"#][^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, "$2 ($1)")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n\s*\n+/g, "\n\n")
    .trim();
}

/* Contact.fields is whatever the popup form collected, keyed by
   field label. Pick a first/last name when one is obvious. */
function nameParts(fields: unknown) {
  const out = { first: "", last: "" };
  if (!fields || typeof fields !== "object") return out;

  for (const [key, raw] of Object.entries(fields as Record<string, unknown>)) {
    if (typeof raw !== "string" || !raw.trim()) continue;
    const k = key.toLowerCase().replace(/[^a-z]/g, "");
    const value = raw.trim().slice(0, 80);

    if (!out.first && (k === "firstname" || k === "fname")) out.first = value;
    else if (!out.last && (k === "lastname" || k === "lname" || k === "surname")) out.last = value;
    else if (!out.first && (k === "name" || k === "fullname" || k === "yourname")) {
      const [first, ...rest] = value.split(/\s+/);
      out.first = first;
      if (!out.last) out.last = rest.join(" ");
    }
  }

  return out;
}

export async function buildDeliveryMessage(job: DeliveryJob): Promise<Message> {
  const fallback = (): Message => {
    const { subject, text, html } = couponEmail(job.code);
    return { to: job.destination, subject, text, html };
  };

  const campaign = await db.campaign.findFirst({
    where: { id: job.campaignId, shop: job.shop },
    select: { name: true, emailTemplateId: true },
  });

  if (!campaign?.emailTemplateId) {
    return fallback();
  }

  const template = await getEmailTemplate(job.shop, campaign.emailTemplateId);

  if (!template) {
    return fallback();
  }

  const data = template.data;
  const content = [data.subject, data.previewText, data.heading, data.body, data.buttonText, data.footerText].join("\n");

  if (!/\{\{\s*discount\.code\s*\}\}/.test(content)) {
    console.warn(
      "EMAIL TEMPLATE HAS NO {{discount.code}}, USING BUILT-IN COUPON EMAIL:",
      template.id,
    );
    return fallback();
  }

  const contact = await db.contact.findFirst({
    where: { id: job.contactId, shop: job.shop },
    select: { fields: true },
  });

  const name = nameParts(contact?.fields);
  const shopUrl = `https://${job.shop}`;

  const variables: Record<string, string> = {
    "customer.firstName": name.first,
    "customer.lastName": name.last,
    "customer.email": job.destination,
    "shop.name": job.shop.replace(/\.myshopify\.com$/i, ""),
    "shop.url": shopUrl,
    "campaign.name": campaign.name,
    "discount.code": job.code,
    // No unsubscribe flow exists yet; the store link is the
    // safest real destination.
    unsubscribeUrl: shopUrl,
  };

  const rendered = renderEmailTemplate(data, variables);
  const fromName = cleanHeader(renderFill(data.fromName, variables), 80);
  const replyTo = data.replyTo.trim();

  return {
    to: job.destination,
    subject: cleanHeader(rendered.subject, 200) || couponEmail(job.code).subject,
    html: rendered.html,
    text: htmlToText(rendered.html),
    fromName: fromName || undefined,
    replyTo: EMAIL_PATTERN.test(replyTo) ? replyTo : undefined,
    templateId: template.id,
  };
}

function renderFill(text: string, variables: Record<string, string>) {
  return text.replace(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g, (match, key: string) =>
    Object.prototype.hasOwnProperty.call(variables, key) ? variables[key] : "",
  );
}

/* Resend tag values may only hold letters, numbers, _ and -. */
function tagValue(value: string) {
  return value.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 256) || "none";
}

async function sendOne(job: DeliveryJob) {
  const provider = activeProvider();
  const message = await buildDeliveryMessage(job);

  if (job.id) {
    /* Round 0 keeps the original key. A manual "Resend" bumps the
       round, so the provider treats it as a new message. */
    message.idempotencyKey = job.round
      ? `coupon-delivery-${job.id}-r${job.round}`
      : `coupon-delivery-${job.id}`;
  }

  message.tags = [
    { name: "type", value: "coupon" },
    { name: "shop", value: tagValue(job.shop) },
    { name: "campaign_id", value: tagValue(job.campaignId) },
    { name: "template_id", value: tagValue(message.templateId || "builtin") },
    ...(job.id ? [{ name: "delivery_id", value: tagValue(job.id) }] : []),
  ];

  let providerId: string | null;

  switch (provider) {
    case "brevo":
      providerId = await sendViaBrevo(message);
      break;
    case "resend":
      providerId = await sendViaResend(message);
      break;
    case "smtp":
      providerId = await sendViaSmtp(message);
      break;
    default:
      throw new Error(
        "Email is not configured. Set BREVO_API_KEY (or RESEND_API_KEY, or EMAIL_HOST/EMAIL_USER/EMAIL_PASS).",
      );
  }

  return {
    providerId,
    provider,
    subject: message.subject.slice(0, 300),
    templateId: message.templateId || null,
  };
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

  /* Addresses that bounced or complained before are not mailed
     again. One query for the whole batch. */
  const suppressed = new Set(
    jobs.length
      ? (
          await db.emailSuppression.findMany({
            where: {
              shop,
              email: {
                in: jobs.map((job) => job.destination.trim().toLowerCase()),
              },
            },
            select: { email: true },
          })
        ).map((row) => row.email)
      : [],
  );

  for (const job of jobs) {
    if (suppressed.has(job.destination.trim().toLowerCase())) {
      await db.discountDelivery.updateMany({
        where: { id: job.id, status: "pending" },
        data: {
          status: "failed",
          lastEvent: "suppressed",
          lastEventAt: new Date(),
          error:
            "Not sent: this address bounced or reported spam earlier.",
        },
      });
      failed += 1;
      continue;
    }

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
      const result = await sendOne(job);
      const now = new Date();

      await db.discountDelivery.updateMany({
        where: { id: job.id },
        data: {
          status: "sent",
          sentAt: now,
          providerId: result.providerId,
          provider: result.provider,
          subject: result.subject,
          templateId: result.templateId,
          error: null,
        },
      });

      /* A fast webhook may already have recorded "delivered";
         only fill lastEvent when nothing is there yet. */
      await db.discountDelivery.updateMany({
        where: { id: job.id, lastEvent: null },
        data: { lastEvent: "sent", lastEventAt: now },
      });

      sent += 1;
    } catch (error) {
      /* Rate or daily limit: give the attempt back and stop this
         run. The row stays pending and goes out on a later run. */
      if (error instanceof ProviderError && error.rateLimited) {
        await db.discountDelivery.updateMany({
          where: { id: job.id, status: "pending" },
          data: {
            attempts: { decrement: 1 },
            error: String(error.message).slice(0, 500),
          },
        });
        console.warn("EMAIL PROVIDER RATE LIMITED, WILL RETRY LATER:", job.id);
        break;
      }

      const attempts = job.attempts + 1;
      /* A message the provider rejects outright (bad address,
         invalid payload) fails now instead of retrying 5 times. */
      const givingUp =
        attempts >= MAX_ATTEMPTS ||
        (error instanceof ProviderError && error.permanent);

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
