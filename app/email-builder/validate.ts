/* ============================================================
   TEMPLATE PARSING AND VALIDATION

   Two jobs, used by both the builder and the server.

   normalizeTemplate() takes anything (a request body, a JSONB
   column) and returns a well-formed document or a reason it
   cannot. It rebuilds every block from its defaults and keeps
   only known properties of the right type, so nothing extra a
   client sends ever reaches the database.

   validateTemplate() checks the values: required fields, URLs,
   emails, colors, number ranges, variables. The builder runs it
   to show errors next to the right block; the server runs it
   again before saving, because the browser is not trusted.
   ============================================================ */

import {
  BLOCK_DEFAULTS,
  FONT_STACKS,
  FONT_WEIGHTS,
  LIMITS,
  SOCIAL_NETWORKS,
  TEMPLATE_VERSION,
  VARIABLE_KEYS,
  canNestInColumn,
  defaultSettings,
  newBlockId,
  sampleVariables,
  type Block,
  type BlockType,
  type EmailTemplateDoc,
  type LeafBlock,
  type SocialProps,
} from "./schema";

export type ValidationError = {
  /* where to show it: "name", "email.subject", "settings.width",
     or a block field such as "block.url" */
  field: string;
  message: string;
  blockId?: string;
};

export type TemplateMeta = {
  name: string;
  status?: string;
};

const BLOCK_TYPES = Object.keys(BLOCK_DEFAULTS) as BlockType[];

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/* ------------------------------------------------------------
   PRIMITIVE CHECKS
------------------------------------------------------------ */

export function isHexColor(value: unknown): value is string {
  return typeof value === "string" && /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(value);
}

export function isEmail(value: string) {
  return /^[^\s@<>()",;:]+@[^\s@<>()",;:]+\.[^\s@<>()",;:]{2,}$/.test(value);
}

const TOKEN = /\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g;

export function unknownVariables(value: string): string[] {
  const unknown: string[] = [];
  for (const match of value.matchAll(TOKEN)) {
    if (!VARIABLE_KEYS.includes(match[1])) unknown.push(match[1]);
  }
  return unknown;
}

/* A link may be a real URL, or start with a variable that will
   become one ({{shop.url}}/collections/all). Checked by filling
   the variables with sample values and parsing the result. */
export function checkUrl(value: string, required: boolean): string | null {
  const trimmed = value.trim();
  if (!trimmed) return required ? "A link is required." : null;
  if (trimmed.length > LIMITS.maxUrl) return "This link is too long.";

  const unknown = unknownVariables(trimmed);
  if (unknown.length) return `Unknown variable {{${unknown[0]}}}.`;

  const samples = sampleVariables();
  const filled = trimmed.replace(TOKEN, (_m, key: string) => samples[key] ?? "");

  if (/^(mailto|tel):/i.test(filled)) {
    return filled.length > 7 ? null : "Enter a complete link.";
  }

  try {
    const url = new URL(filled);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return "Links must start with https://, http://, mailto: or tel:.";
    }
    if (!url.hostname.includes(".") && url.hostname !== "localhost") {
      return "Enter a complete link, such as https://example.com.";
    }
    return null;
  } catch {
    return "Enter a complete link, such as https://example.com.";
  }
}

/* ------------------------------------------------------------
   NORMALIZE
------------------------------------------------------------ */

/* Keep a value only if it has the same type as the default. */
function pick<T extends Record<string, unknown>>(
  defaults: T,
  raw: unknown,
): T {
  const out: Record<string, unknown> = { ...defaults };
  if (!isObject(raw)) return out as T;

  for (const key of Object.keys(defaults)) {
    const fallback = defaults[key];
    const value = raw[key];
    if (value === undefined) continue;

    if (typeof fallback === "number") {
      const n = typeof value === "number" ? value : Number(value);
      if (Number.isFinite(n)) out[key] = n;
    } else if (typeof fallback === "string") {
      if (typeof value === "string") out[key] = value;
    } else if (typeof fallback === "boolean") {
      if (typeof value === "boolean") out[key] = value;
    }
  }
  return out as T;
}

function normalizeSocialLinks(raw: unknown): SocialProps["links"] {
  const defaults = BLOCK_DEFAULTS.social().links;
  const source = isObject(raw) ? raw : {};
  const links = {} as SocialProps["links"];

  for (const { key } of SOCIAL_NETWORKS) {
    links[key] = pick(
      { enabled: defaults[key].enabled, url: defaults[key].url },
      source[key],
    );
  }
  return links;
}

function normalizeBlock(
  raw: unknown,
  seen: Set<string>,
  insideColumn: boolean,
): { block: Block | null; error?: string } {
  if (!isObject(raw)) return { block: null, error: "A block is not an object." };

  const type = raw.type as BlockType;
  if (!BLOCK_TYPES.includes(type)) {
    return { block: null, error: `Unknown block type "${String(raw.type)}".` };
  }
  if (insideColumn && !canNestInColumn(type)) {
    return { block: null, error: `A ${type} block cannot go inside a column.` };
  }

  let id = typeof raw.id === "string" && /^[\w-]{1,64}$/.test(raw.id) ? raw.id : "";
  if (!id || seen.has(id)) id = newBlockId();
  seen.add(id);

  if (type === "columns") {
    const rawColumns = Array.isArray(raw.columns) ? raw.columns : [[], []];
    const columns: [LeafBlock[], LeafBlock[]] = [[], []];

    for (const column of [0, 1] as const) {
      const cells = Array.isArray(rawColumns[column]) ? rawColumns[column] : [];
      for (const cell of cells) {
        const result = normalizeBlock(cell, seen, true);
        if (!result.block) return { block: null, error: result.error };
        columns[column].push(result.block as LeafBlock);
      }
    }

    return {
      block: {
        id,
        type: "columns",
        properties: pick(BLOCK_DEFAULTS.columns(), raw.properties),
        columns,
      },
    };
  }

  const defaults = BLOCK_DEFAULTS[type]() as Record<string, unknown>;

  if (type === "social") {
    const rest = { ...defaults };
    delete rest.links;
    const properties = {
      ...pick(rest, raw.properties),
      links: normalizeSocialLinks(
        isObject(raw.properties) ? raw.properties.links : undefined,
      ),
    };
    return { block: { id, type, properties } as Block };
  }

  return {
    block: { id, type, properties: pick(defaults, raw.properties) } as Block,
  };
}

/* Upgrade older document shapes. Only version 1 exists today. */
function migrateTemplate(
  raw: Record<string, unknown>,
): { raw: Record<string, unknown> | null; error?: string } {
  const version = typeof raw.version === "number" ? raw.version : 1;
  if (version > TEMPLATE_VERSION) {
    return {
      raw: null,
      error: "This template was saved by a newer version of the app.",
    };
  }
  return { raw: { ...raw, version: TEMPLATE_VERSION } };
}

export function normalizeTemplate(
  input: unknown,
): { doc: EmailTemplateDoc; error?: undefined } | { doc: null; error: string } {
  let value = input;

  if (typeof value === "string") {
    try {
      value = JSON.parse(value);
    } catch {
      return { doc: null, error: "The template is not valid JSON." };
    }
  }

  if (!isObject(value)) {
    return { doc: null, error: "The template is not an object." };
  }

  const migrated = migrateTemplate(value);
  if (!migrated.raw) return { doc: null, error: migrated.error as string };
  const raw = migrated.raw;

  if (!Array.isArray(raw.blocks)) {
    return { doc: null, error: "The template has no block list." };
  }

  const seen = new Set<string>();
  const blocks: Block[] = [];

  for (const item of raw.blocks) {
    const result = normalizeBlock(item, seen, false);
    if (!result.block) return { doc: null, error: result.error as string };
    blocks.push(result.block);
  }

  const settings = pick(defaultSettings(), raw.settings);
  if (!(settings.fontFamily in FONT_STACKS)) settings.fontFamily = "sans";

  const email = pick(
    { subject: "", previewText: "", fromName: "", replyTo: "" },
    raw.email,
  );

  return {
    doc: { version: TEMPLATE_VERSION, settings, email, blocks },
  };
}

/* ------------------------------------------------------------
   VALIDATE
------------------------------------------------------------ */

type Push = (field: string, message: string) => void;

function range(push: Push, field: string, label: string, value: number, min: number, max: number) {
  if (!Number.isFinite(value) || value < min || value > max) {
    push(field, `${label} must be between ${min} and ${max}.`);
  }
}

function color(push: Push, field: string, label: string, value: string) {
  if (!isHexColor(value)) push(field, `${label} must be a hex color such as #1A2B3C.`);
}

function textField(
  push: Push,
  field: string,
  label: string,
  value: string,
  options: { required?: boolean; max?: number } = {},
) {
  const max = options.max ?? LIMITS.maxText;
  if (options.required && !value.trim()) {
    push(field, `${label} is required.`);
    return;
  }
  if (value.length > max) push(field, `${label} must be ${max} characters or fewer.`);
  const unknown = unknownVariables(value);
  if (unknown.length) push(field, `Unknown variable {{${unknown[0]}}} in ${label.toLowerCase()}.`);
}

function url(push: Push, field: string, value: string, required: boolean) {
  const problem = checkUrl(value, required);
  if (problem) push(field, problem);
}

const ALIGN = ["left", "center", "right"];

function align(push: Push, value: string) {
  if (!ALIGN.includes(value)) push("alignment", "Alignment must be left, center or right.");
}

function validateBlock(block: Block, errors: ValidationError[]) {
  const push: Push = (field, message) => errors.push({ field, message, blockId: block.id });

  switch (block.type) {
    case "text": {
      const p = block.properties;
      textField(push, "text", "Text", p.text, { required: true });
      range(push, "fontSize", "Font size", p.fontSize, 8, 72);
      range(push, "lineHeight", "Line height", p.lineHeight, 1, 3);
      range(push, "padding", "Padding", p.padding, 0, 80);
      range(push, "margin", "Margin", p.margin, 0, 80);
      if (!FONT_WEIGHTS.includes(p.fontWeight as (typeof FONT_WEIGHTS)[number])) {
        push("fontWeight", "Choose a font weight from the list.");
      }
      if (!(p.fontFamily in FONT_STACKS)) push("fontFamily", "Choose a font from the list.");
      color(push, "color", "Text color", p.color);
      align(push, p.alignment);
      break;
    }
    case "heading": {
      const p = block.properties;
      textField(push, "text", "Heading", p.text, { required: true, max: LIMITS.maxShortText });
      if (!["h1", "h2", "h3"].includes(p.level)) push("level", "Level must be H1, H2 or H3.");
      range(push, "fontSize", "Font size", p.fontSize, 12, 72);
      range(push, "padding", "Padding", p.padding, 0, 80);
      if (!FONT_WEIGHTS.includes(p.fontWeight as (typeof FONT_WEIGHTS)[number])) {
        push("fontWeight", "Choose a font weight from the list.");
      }
      if (!(p.fontFamily in FONT_STACKS)) push("fontFamily", "Choose a font from the list.");
      color(push, "color", "Color", p.color);
      align(push, p.alignment);
      break;
    }
    case "image": {
      const p = block.properties;
      url(push, "src", p.src, true);
      url(push, "linkUrl", p.linkUrl, false);
      textField(push, "alt", "Alt text", p.alt, { max: LIMITS.maxShortText });
      range(push, "width", "Width", p.width, 0, LIMITS.maxWidth);
      range(push, "height", "Height", p.height, 0, 2000);
      range(push, "borderRadius", "Border radius", p.borderRadius, 0, 200);
      range(push, "padding", "Padding", p.padding, 0, 80);
      align(push, p.alignment);
      break;
    }
    case "button": {
      const p = block.properties;
      textField(push, "text", "Button text", p.text, { required: true, max: 100 });
      url(push, "url", p.url, true);
      color(push, "backgroundColor", "Background", p.backgroundColor);
      color(push, "textColor", "Text color", p.textColor);
      range(push, "fontSize", "Font size", p.fontSize, 10, 40);
      range(push, "borderRadius", "Border radius", p.borderRadius, 0, 60);
      range(push, "padding", "Padding", p.padding, 4, 40);
      if (p.width !== "auto" && p.width !== "full") push("width", "Width must be auto or full.");
      align(push, p.alignment);
      break;
    }
    case "divider": {
      const p = block.properties;
      color(push, "color", "Color", p.color);
      range(push, "thickness", "Thickness", p.thickness, 1, 20);
      range(push, "width", "Width", p.width, 10, 100);
      range(push, "margin", "Margin", p.margin, 0, 80);
      align(push, p.alignment);
      break;
    }
    case "spacer": {
      range(push, "height", "Height", block.properties.height, 4, 200);
      break;
    }
    case "columns": {
      const p = block.properties;
      if (!["50-50", "33-67", "67-33"].includes(p.ratio)) push("ratio", "Choose a column layout.");
      range(push, "gap", "Gap", p.gap, 0, 60);
      range(push, "padding", "Padding", p.padding, 0, 60);
      for (const column of block.columns) {
        for (const child of column) {
          if (!canNestInColumn(child.type)) {
            errors.push({
              field: "type",
              message: `A ${child.type} block cannot go inside a column.`,
              blockId: child.id,
            });
          }
          validateBlock(child, errors);
        }
      }
      break;
    }
    case "social": {
      const p = block.properties;
      const enabled = SOCIAL_NETWORKS.filter(({ key }) => p.links[key].enabled);
      if (!enabled.length) push("links", "Turn on at least one social link.");
      for (const { key, label } of enabled) {
        const problem = checkUrl(p.links[key].url, true);
        if (problem) push(`links.${key}`, `${label}: ${problem}`);
      }
      color(push, "color", "Button color", p.color);
      color(push, "textColor", "Text color", p.textColor);
      range(push, "fontSize", "Font size", p.fontSize, 10, 24);
      range(push, "padding", "Padding", p.padding, 0, 80);
      align(push, p.alignment);
      break;
    }
    case "footer": {
      const p = block.properties;
      textField(push, "text", "Footer text", p.text, { max: 1000 });
      textField(push, "companyName", "Company name", p.companyName, { max: LIMITS.maxShortText });
      textField(push, "address", "Address", p.address, { max: 500 });
      textField(push, "unsubscribeText", "Unsubscribe text", p.unsubscribeText, { max: 100 });
      url(push, "unsubscribeUrl", p.unsubscribeUrl, p.unsubscribeText.trim() !== "");
      range(push, "fontSize", "Font size", p.fontSize, 9, 24);
      range(push, "padding", "Padding", p.padding, 0, 80);
      color(push, "color", "Color", p.color);
      align(push, p.alignment);
      break;
    }
  }
}

export function validateTemplate(
  doc: EmailTemplateDoc,
  meta?: TemplateMeta,
): { ok: boolean; errors: ValidationError[] } {
  const errors: ValidationError[] = [];
  const push: Push = (field, message) => errors.push({ field, message });

  if (meta) {
    textField(push, "name", "Template name", meta.name, { required: true, max: LIMITS.maxName });
    if (meta.status !== undefined && !["draft", "active"].includes(meta.status)) {
      push("status", "Status must be draft or active.");
    }
  }

  const { email, settings, blocks } = doc;

  textField(push, "email.subject", "Subject", email.subject, {
    required: true,
    max: LIMITS.maxShortText,
  });
  textField(push, "email.previewText", "Preview text", email.previewText, {
    max: LIMITS.maxShortText,
  });
  textField(push, "email.fromName", "From name", email.fromName, { max: 100 });
  if (/[<>"\r\n]/.test(email.fromName)) {
    push("email.fromName", "From name cannot contain < > \" or line breaks.");
  }
  if (email.replyTo.trim() && !isEmail(email.replyTo.trim())) {
    push("email.replyTo", "Reply-to must be a valid email address.");
  }

  range(push, "settings.width", "Email width", settings.width, LIMITS.minWidth, LIMITS.maxWidth);
  color(push, "settings.backgroundColor", "Background color", settings.backgroundColor);
  color(push, "settings.contentBackgroundColor", "Body background", settings.contentBackgroundColor);
  range(push, "settings.padding", "Page padding", settings.padding, 0, 80);
  range(push, "settings.contentPadding", "Body padding", settings.contentPadding, 0, 60);
  range(push, "settings.borderRadius", "Corner radius", settings.borderRadius, 0, 40);
  range(push, "settings.borderWidth", "Border", settings.borderWidth, 0, 8);
  color(push, "settings.borderColor", "Border color", settings.borderColor);
  if (!ALIGN.includes(settings.alignment)) {
    push("settings.alignment", "Alignment must be left, center or right.");
  }

  let total = 0;
  for (const block of blocks) {
    total += 1 + (block.type === "columns" ? block.columns[0].length + block.columns[1].length : 0);
    validateBlock(block, errors);
  }
  if (total > LIMITS.maxBlocks) {
    push("blocks", `A template can hold at most ${LIMITS.maxBlocks} blocks.`);
  }

  return { ok: errors.length === 0, errors };
}
