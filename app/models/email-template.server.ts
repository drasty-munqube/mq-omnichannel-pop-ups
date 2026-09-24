/* ============================================================
   EMAIL TEMPLATES (server)

   Every function takes the shop from the authenticated admin
   session and puts it in the WHERE clause of every query. There
   is no function here that reads or writes a template by id
   alone, so one store can never see, change or delete another
   store's template, even by guessing an id.

   Writes use updateMany/deleteMany with { id, shop } so the
   ownership check and the write are one statement, not a read
   followed by a write another request could slip between.
   ============================================================ */

import db from "../db.server";
import {
  renderEmailTemplate,
  type RenderedEmail,
} from "../email-builder/render";
import type { EmailTemplateDoc } from "../email-builder/schema";
import {
  normalizeTemplate,
  validateTemplate,
  type ValidationError,
} from "../email-builder/validate";

export type TemplateStatus = "draft" | "active";

export type EmailTemplateRecord = {
  id: string;
  name: string;
  status: TemplateStatus;
  subject: string;
  previewText: string;
  fromName: string;
  replyTo: string;
  content: EmailTemplateDoc;
  createdAt: string;
  updatedAt: string;
};

export type SaveResult =
  | { ok: true; template: EmailTemplateRecord }
  | { ok: false; error: string; errors: ValidationError[] };

type Row = {
  id: string;
  name: string;
  status: string;
  subject: string;
  previewText: string;
  fromName: string;
  replyTo: string;
  content: unknown;
  createdAt: Date;
  updatedAt: Date;
};

const SELECT = {
  id: true,
  name: true,
  status: true,
  subject: true,
  previewText: true,
  fromName: true,
  replyTo: true,
  content: true,
  createdAt: true,
  updatedAt: true,
} as const;

function toRecord(row: Row): EmailTemplateRecord | null {
  const parsed = normalizeTemplate(row.content);
  if (!parsed.doc) {
    console.error("EMAIL TEMPLATE UNREADABLE:", row.id, parsed.error);
    return null;
  }
  return {
    id: row.id,
    name: row.name,
    status: row.status === "active" ? "active" : "draft",
    subject: row.subject,
    previewText: row.previewText,
    fromName: row.fromName,
    replyTo: row.replyTo,
    content: parsed.doc,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function listEmailTemplates(shop: string) {
  const rows = await db.emailTemplate.findMany({
    where: { shop },
    orderBy: { updatedAt: "desc" },
    select: SELECT,
  });
  return rows
    .map(toRecord)
    .filter((r): r is EmailTemplateRecord => r !== null);
}

export async function getEmailTemplate(shop: string, id: string) {
  if (!id) return null;
  const row = await db.emailTemplate.findFirst({
    where: { id, shop },
    select: SELECT,
  });
  return row ? toRecord(row) : null;
}

/* Create when `id` is empty, otherwise update. The document is
   re-parsed and re-validated here whatever the browser said. */
export async function saveEmailTemplate(
  shop: string,
  input: { id?: string | null; name: unknown; status: unknown; content: unknown },
): Promise<SaveResult> {
  const parsed = normalizeTemplate(input.content);
  if (!parsed.doc) {
    return { ok: false, error: parsed.error, errors: [{ field: "content", message: parsed.error }] };
  }

  const doc = parsed.doc;
  const name = typeof input.name === "string" ? input.name.trim() : "";
  const status: TemplateStatus = input.status === "active" ? "active" : "draft";

  const check = validateTemplate(doc, { name, status });
  if (!check.ok) {
    return {
      ok: false,
      error: "Please fix the highlighted fields before saving.",
      errors: check.errors,
    };
  }

  const { html } = renderEmailTemplate(doc);

  const data = {
    name,
    status,
    subject: doc.email.subject.trim(),
    previewText: doc.email.previewText.trim(),
    fromName: doc.email.fromName.trim(),
    replyTo: doc.email.replyTo.trim(),
    content: doc as unknown as object,
    html,
  };

  if (input.id) {
    const result = await db.emailTemplate.updateMany({
      where: { id: input.id, shop },
      data,
    });
    if (result.count === 0) {
      return {
        ok: false,
        error: "This template no longer exists. It may have been deleted.",
        errors: [],
      };
    }
    const saved = await getEmailTemplate(shop, input.id);
    return saved
      ? { ok: true, template: saved }
      : { ok: false, error: "Saved, but the template could not be reloaded.", errors: [] };
  }

  const created = await db.emailTemplate.create({
    data: { ...data, shop },
    select: SELECT,
  });
  const record = toRecord(created);
  return record
    ? { ok: true, template: record }
    : { ok: false, error: "Saved, but the template could not be reloaded.", errors: [] };
}

/* "Welcome" becomes "Welcome Copy", then "Welcome Copy 2", so
   two duplicates never share a name. Copies start as drafts. */
export async function duplicateEmailTemplate(shop: string, id: string) {
  const source = await db.emailTemplate.findFirst({
    where: { id, shop },
  });
  if (!source) return null;

  const base = `${source.name} Copy`;
  const taken = await db.emailTemplate.count({
    where: { shop, name: { startsWith: base } },
  });
  const name = (taken === 0 ? base : `${base} ${taken + 1}`).slice(0, 120);

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
    select: SELECT,
  });
  return toRecord(created);
}

export async function deleteEmailTemplate(shop: string, id: string) {
  if (!id) return false;
  const result = await db.emailTemplate.deleteMany({
    where: { id, shop },
  });
  return result.count > 0;
}

/* For whatever sends email later: load a template this shop
   owns and render it with real values. */
export async function renderSavedEmailTemplate(
  shop: string,
  id: string,
  variables: Record<string, string>,
): Promise<RenderedEmail | null> {
  const template = await getEmailTemplate(shop, id);
  if (!template) return null;
  return renderEmailTemplate(template.content, { variables });
}
