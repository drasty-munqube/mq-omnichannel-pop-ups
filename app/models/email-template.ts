/* ============================================================
   EMAIL TEMPLATE (shared)

   A simple, form-based email: logo, heading, message, one
   button and a footer, plus colors. Used by the editor in the
   browser (live preview) and by the server (validation, and the
   HTML snapshot saved with each template).

   No imports on purpose, so it runs the same in the browser, on
   the server and in plain `node` tests.

   Stored in EmailTemplate.content as JSON with a version number,
   so the shape can grow later without breaking old rows.
   ============================================================ */

export const TEMPLATE_VERSION = 1;

export type TemplateStatus = "draft" | "active";

export type EmailTemplateData = {
  name: string;
  status: TemplateStatus;

  /* inbox */
  subject: string;
  previewText: string;
  fromName: string;
  replyTo: string;

  /* content */
  logoUrl: string;
  heading: string;
  body: string;
  buttonText: string;
  buttonUrl: string;
  footerText: string;

  /* style */
  backgroundColor: string;
  contentBackgroundColor: string;
  textColor: string;
  buttonColor: string;
  buttonTextColor: string;
  alignment: "left" | "center";
};

export type TemplateErrors = Partial<Record<keyof EmailTemplateData, string>>;

export const EMAIL_VARIABLES = [
  { key: "customer.firstName", label: "First name", sample: "John" },
  { key: "customer.lastName", label: "Last name", sample: "Doe" },
  { key: "customer.email", label: "Email", sample: "john@example.com" },
  { key: "shop.name", label: "Shop name", sample: "MunQube" },
  { key: "shop.url", label: "Shop URL", sample: "https://example.com" },
  { key: "campaign.name", label: "Campaign", sample: "Summer Campaign" },
  { key: "discount.code", label: "Discount code", sample: "SAVE10" },
  { key: "unsubscribeUrl", label: "Unsubscribe URL", sample: "https://example.com/unsubscribe" },
] as const;

export function sampleVariables(overrides: Record<string, string> = {}) {
  const values: Record<string, string> = {};
  for (const v of EMAIL_VARIABLES) values[v.key] = v.sample;
  return { ...values, ...overrides };
}

export function defaultTemplate(): EmailTemplateData {
  return {
    name: "Untitled template",
    status: "draft",
    subject: "Your discount from {{shop.name}}",
    previewText: "Here is the code you asked for",
    fromName: "",
    replyTo: "",
    logoUrl: "",
    heading: "Thanks, {{customer.firstName}}!",
    body: "Here is your discount code:\n\n{{discount.code}}\n\nUse it at checkout on your next order.",
    buttonText: "Shop now",
    buttonUrl: "{{shop.url}}",
    footerText: "You are receiving this email because you signed up at {{shop.name}}.",
    backgroundColor: "#F5F5F5",
    contentBackgroundColor: "#FFFFFF",
    textColor: "#172033",
    buttonColor: "#0B3D66",
    buttonTextColor: "#FFFFFF",
    alignment: "center",
  };
}

/* ------------------------------------------------------------
   PARSE

   Builds a clean template from anything (a form post, a JSON
   column). Only known fields of the right type survive.
------------------------------------------------------------ */

export function normalizeTemplate(raw: unknown): EmailTemplateData {
  const base = defaultTemplate();
  const source =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};

  const out = { ...base } as Record<string, unknown>;
  for (const key of Object.keys(base) as (keyof EmailTemplateData)[]) {
    const value = source[key];
    if (typeof value === "string") out[key] = value;
  }

  out.status = out.status === "active" ? "active" : "draft";
  out.alignment = out.alignment === "left" ? "left" : "center";
  return out as EmailTemplateData;
}

/* What goes into the JSON column (name/status live in columns). */
export function toContent(t: EmailTemplateData) {
  const rest: Partial<EmailTemplateData> = { ...t };
  delete rest.name;
  delete rest.status;
  return { version: TEMPLATE_VERSION, ...rest };
}

/* ------------------------------------------------------------
   VALIDATE
------------------------------------------------------------ */

const TOKEN = /\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g;
const KNOWN = EMAIL_VARIABLES.map((v) => v.key as string);

function unknownVariable(value: string) {
  for (const m of value.matchAll(TOKEN)) {
    if (!KNOWN.includes(m[1])) return m[1];
  }
  return null;
}

export function isHexColor(value: string) {
  return /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(value);
}

export function isEmail(value: string) {
  return /^[^\s@<>()",;:]+@[^\s@<>()",;:]+\.[^\s@<>()",;:]{2,}$/.test(value);
}

/* A link may be a normal https:// URL or start with a variable
   that becomes one, such as {{shop.url}}/collections/all. */
export function checkUrl(value: string, required: boolean): string | null {
  const v = value.trim();
  if (!v) return required ? "A link is required." : null;
  const unknown = unknownVariable(v);
  if (unknown) return `Unknown variable {{${unknown}}}.`;

  const samples = sampleVariables();
  const filled = v.replace(TOKEN, (_m, key: string) => samples[key] ?? "");
  try {
    const url = new URL(filled);
    if (url.protocol !== "https:" && url.protocol !== "http:") {
      return "Links must start with https:// or http://.";
    }
    if (!url.hostname.includes(".")) return "Enter a full link, such as https://example.com.";
    return null;
  } catch {
    return "Enter a full link, such as https://example.com.";
  }
}

export function validateTemplate(t: EmailTemplateData): TemplateErrors {
  const errors: TemplateErrors = {};
  const text = (key: keyof EmailTemplateData, label: string, max: number, required = false) => {
    const value = String(t[key] ?? "");
    if (required && !value.trim()) {
      errors[key] = `${label} is required.`;
    } else if (value.length > max) {
      errors[key] = `${label} must be ${max} characters or fewer.`;
    } else {
      const unknown = unknownVariable(value);
      if (unknown) errors[key] = `Unknown variable {{${unknown}}}.`;
    }
  };

  text("name", "Template name", 120, true);
  text("subject", "Subject", 250, true);
  text("previewText", "Preview text", 250);
  text("fromName", "From name", 100);
  text("heading", "Heading", 250);
  text("body", "Message", 5000, true);
  text("buttonText", "Button text", 100);
  text("footerText", "Footer", 1000);

  if (/[<>"\r\n]/.test(t.fromName)) errors.fromName = "From name cannot contain < > \" or line breaks.";
  if (t.replyTo.trim() && !isEmail(t.replyTo.trim())) errors.replyTo = "Enter a valid email address.";

  const logo = checkUrl(t.logoUrl, false);
  if (logo) errors.logoUrl = logo;

  /* A button needs both parts, or neither. */
  if (t.buttonText.trim() || t.buttonUrl.trim()) {
    if (!t.buttonText.trim()) errors.buttonText = "Add button text, or clear the link.";
    const link = checkUrl(t.buttonUrl, true);
    if (link) errors.buttonUrl = link;
  }

  for (const [key, label] of [
    ["backgroundColor", "Background"],
    ["contentBackgroundColor", "Email background"],
    ["textColor", "Text color"],
    ["buttonColor", "Button color"],
    ["buttonTextColor", "Button text color"],
  ] as const) {
    if (!isHexColor(t[key])) errors[key] = `${label} must be a hex color such as #1A2B3C.`;
  }

  return errors;
}

/* ------------------------------------------------------------
   RENDER

   Email clients are not browsers, so the HTML is table-based
   with inline styles. Everything typed is escaped; links other
   than http(s) become "#". Pass `variables` to fill {{...}}
   (preview, sending); leave them out to keep the tokens (the
   saved snapshot).
------------------------------------------------------------ */

export function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function fillVariables(text: string, variables: Record<string, string> | null) {
  if (!variables) return text;
  return text.replace(TOKEN, (match, key: string) =>
    Object.prototype.hasOwnProperty.call(variables, key) ? variables[key] : match,
  );
}

function safeUrl(value: string, variables: Record<string, string> | null) {
  const raw = fillVariables(value.trim(), variables);
  if (!raw) return "";
  if (!variables && /^\{\{\s*[a-zA-Z0-9_.]+\s*\}\}/.test(raw)) return escapeHtml(raw);
  if (/^https?:\/\/[^\s"'<>]+$/i.test(raw)) return escapeHtml(raw);
  return "#";
}

function hex(value: string, fallback: string) {
  return isHexColor(value) ? value : fallback;
}

export function renderEmailTemplate(
  t: EmailTemplateData,
  variables: Record<string, string> | null = null,
) {
  const text = (v: string) => escapeHtml(fillVariables(v, variables)).replace(/\r?\n/g, "<br>");
  const align = t.alignment === "left" ? "left" : "center";
  const bg = hex(t.backgroundColor, "#F5F5F5");
  const card = hex(t.contentBackgroundColor, "#FFFFFF");
  const ink = hex(t.textColor, "#172033");
  const btn = hex(t.buttonColor, "#0B3D66");
  const btnInk = hex(t.buttonTextColor, "#FFFFFF");
  const font = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
  const T = 'role="presentation" cellpadding="0" cellspacing="0" border="0"';

  const subject = fillVariables(t.subject, variables);
  const previewText = fillVariables(t.previewText, variables);

  const rows: string[] = [];

  const logo = safeUrl(t.logoUrl, variables);
  if (logo && logo !== "#") {
    rows.push(
      `<tr><td align="${align}" style="padding:32px 32px 8px;"><img src="${logo}" alt="${escapeHtml(fillVariables(t.fromName || "Logo", variables))}" width="140" style="display:inline-block;width:140px;max-width:100%;height:auto;border:0;"></td></tr>`,
    );
  }

  if (t.heading.trim()) {
    rows.push(
      `<tr><td align="${align}" style="padding:${logo ? 16 : 36}px 32px 8px;font-family:${font};font-size:26px;line-height:1.3;font-weight:700;color:${ink};text-align:${align};">${text(t.heading)}</td></tr>`,
    );
  }

  rows.push(
    `<tr><td align="${align}" style="padding:12px 32px;font-family:${font};font-size:16px;line-height:1.6;color:${ink};text-align:${align};">${text(t.body)}</td></tr>`,
  );

  const href = safeUrl(t.buttonUrl, variables);
  if (t.buttonText.trim() && href) {
    rows.push(
      `<tr><td align="${align}" style="padding:16px 32px 28px;"><table ${T} align="${align}" style="border-collapse:separate;"><tr><td bgcolor="${btn}" style="border-radius:6px;background-color:${btn};"><a href="${href}" target="_blank" style="display:inline-block;padding:13px 28px;font-family:${font};font-size:16px;font-weight:600;line-height:1.2;color:${btnInk};text-decoration:none;border-radius:6px;">${text(t.buttonText)}</a></td></tr></table></td></tr>`,
    );
  }

  const unsubscribe = variables ? safeUrl("{{unsubscribeUrl}}", variables) : "{{unsubscribeUrl}}";
  rows.push(
    `<tr><td align="${align}" style="padding:20px 32px 32px;border-top:1px solid #EEF1F4;font-family:${font};font-size:12px;line-height:1.5;color:#6B7785;text-align:${align};">${t.footerText.trim() ? `${text(t.footerText)}<br>` : ""}<a href="${unsubscribe}" target="_blank" style="color:#6B7785;text-decoration:underline;">Unsubscribe</a></td></tr>`,
  );

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<title>${escapeHtml(subject)}</title>
<style>
body{margin:0;padding:0;-webkit-text-size-adjust:100%;}
@media only screen and (max-width:620px){.mq-card{width:100%!important;}}
</style>
</head>
<body style="margin:0;padding:0;background-color:${bg};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(previewText)}</div>
<table ${T} width="100%" bgcolor="${bg}" style="background-color:${bg};">
<tr><td align="center" style="padding:24px 12px;">
<table ${T} class="mq-card" width="600" style="width:600px;max-width:600px;background-color:${card};border-radius:8px;border-collapse:separate;">
${rows.join("\n")}
</table>
</td></tr>
</table>
</body>
</html>`;

  return { html, subject, previewText };
}
