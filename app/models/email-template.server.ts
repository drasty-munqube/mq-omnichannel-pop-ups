/* ============================================================
   EMAIL TEMPLATES (server)

   CRUD for Settings > Email templates. Every query has the shop
   from the admin session in its WHERE clause, so a store can
   only ever see, change or delete its own templates, even if it
   guesses another store's id.
   ============================================================ */

import db from "../db.server";
import {
  normalizeTemplate,
  renderEmailTemplate,
  toContent,
  validateTemplate,
  type EmailTemplateData,
  type TemplateErrors,
} from "./email-template";

export type EmailTemplateRow = {
  id: string;
  name: string;
  status: "draft" | "active";
  subject: string;
  updatedAt: string;
  data: EmailTemplateData;
};

type DbRow = {
  id: string;
  name: string;
  status: string;
  subject: string;
  previewText: string;
  fromName: string;
  replyTo: string;
  content: unknown;
  updatedAt: Date;
};

function toRow(row: DbRow): EmailTemplateRow {
  const data = normalizeTemplate({
    ...(row.content && typeof row.content === "object" ? row.content : {}),
    name: row.name,
    status: row.status,
    subject: row.subject,
    previewText: row.previewText,
    fromName: row.fromName,
    replyTo: row.replyTo,
  });
  return {
    id: row.id,
    name: row.name,
    status: data.status,
    subject: row.subject,
    updatedAt: row.updatedAt.toISOString(),
    data,
  };
}

export async function listEmailTemplates(shop: string) {
  const rows = await db.emailTemplate.findMany({
    where: { shop },
    orderBy: { updatedAt: "desc" },
  });
  return rows.map(toRow);
}

export async function getEmailTemplate(shop: string, id: string) {
  if (!id) return null;
  const row = await db.emailTemplate.findFirst({ where: { id, shop } });
  return row ? toRow(row) : null;
}

export type SaveResult =
  | { ok: true; template: EmailTemplateRow }
  | { ok: false; error: string; errors: TemplateErrors };

/* Create when id is null, otherwise update. Input is re-parsed
   and re-validated here; the browser is not trusted. */
export async function saveEmailTemplate(
  shop: string,
  id: string | null,
  input: unknown,
): Promise<SaveResult> {
  const data = normalizeTemplate(input);
  data.name = data.name.trim();

  const errors = validateTemplate(data);
  if (Object.keys(errors).length) {
    return { ok: false, error: "Please fix the highlighted fields.", errors };
  }

  const values = {
    name: data.name,
    status: data.status,
    subject: data.subject.trim(),
    previewText: data.previewText.trim(),
    fromName: data.fromName.trim(),
    replyTo: data.replyTo.trim(),
    content: toContent(data) as object,
    html: renderEmailTemplate(data).html,
  };

  if (id) {
    const result = await db.emailTemplate.updateMany({
      where: { id, shop },
      data: values,
    });
    if (result.count === 0) {
      return { ok: false, error: "This template no longer exists.", errors: {} };
    }
    const saved = await getEmailTemplate(shop, id);
    return saved
      ? { ok: true, template: saved }
      : { ok: false, error: "This template no longer exists.", errors: {} };
  }

  const created = await db.emailTemplate.create({ data: { ...values, shop } });
  return { ok: true, template: toRow(created) };
}

/* "Welcome" -> "Welcome (copy)", then "(copy 2)". Copies start as drafts. */
export async function duplicateEmailTemplate(shop: string, id: string) {
  const source = await db.emailTemplate.findFirst({ where: { id, shop } });
  if (!source) return null;

  const base = `${source.name} (copy`;
  const taken = await db.emailTemplate.count({
    where: { shop, name: { startsWith: base } },
  });
  const name = (taken === 0 ? `${source.name} (copy)` : `${source.name} (copy ${taken + 1})`).slice(0, 120);

  const created = await db.emailTemplate.create({
    data: {
      shop,
      name,
      status: "draft",
      subject: source.subject,
      previewText: source.previewText,
      fromName: source.fromName,
      replyTo: source.replyTo,
      content: source.content as object,
      html: source.html,
    },
  });
  return toRow(created);
}

export async function deleteEmailTemplate(shop: string, id: string) {
  if (!id) return false;
  const result = await db.emailTemplate.deleteMany({ where: { id, shop } });
  return result.count > 0;
}

/* For sending later: this shop's template, filled with real values. */
export async function renderSavedEmailTemplate(
  shop: string,
  id: string,
  variables: Record<string, string>,
) {
  const template = await getEmailTemplate(shop, id);
  return template ? renderEmailTemplate(template.data, variables) : null;
}
