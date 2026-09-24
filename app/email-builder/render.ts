/* ============================================================
   EMAIL RENDERER

   Template JSON  ->  email-safe HTML.

   The same function draws the builder's live preview, the
   Preview dialog, the saved HTML snapshot, and (later) the
   email that is actually sent, so what a merchant sees is what
   a customer gets.

   Email clients are not browsers. Outlook for Windows renders
   with Word, Gmail strips most <style>, and nothing runs script.
   So the output is table-based, every style is inline, widths
   are in pixels with a max-width fallback, and the only <style>
   block holds optional mobile tweaks that degrade safely.

   Nothing a merchant types is trusted: text is HTML-escaped,
   links are limited to http, https, mailto and tel, colors must
   be hex, numbers are clamped, and fonts are picked from a
   fixed list. There is no raw-HTML block, by design.
   ============================================================ */

import {
  FONT_STACKS,
  SOCIAL_NETWORKS,
  type Alignment,
  type Block,
  type EmailTemplateDoc,
  type FontKey,
  type LeafBlock,
} from "./schema";

export type RenderOptions = {
  /* Values for {{variables}}. Leave out (or pass null) to keep the
     tokens in the output, which is what the saved snapshot does. */
  variables?: Record<string, string> | null;
};

export type RenderedEmail = {
  html: string;
  subject: string;
  previewText: string;
};

type Context = {
  variables: Record<string, string> | null;
  /* pixels available to the block being drawn */
  width: number;
  baseFont: FontKey;
};

/* ------------------------------------------------------------
   SAFETY HELPERS
------------------------------------------------------------ */

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const TOKEN = /\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g;

/* Replaces known variables and leaves anything unknown exactly
   as written, so a typo shows up in the preview instead of
   silently disappearing. */
export function substituteVariables(
  text: string,
  variables: Record<string, string> | null | undefined,
): string {
  if (!variables) return text;
  return text.replace(TOKEN, (match, key: string) =>
    Object.prototype.hasOwnProperty.call(variables, key) ? variables[key] : match,
  );
}

function clamp(value: number, min: number, max: number, fallback: number) {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.round(value * 100) / 100));
}

function hex(value: string, fallback: string) {
  return /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(value) ? value : fallback;
}

function alignment(value: Alignment): Alignment {
  return value === "left" || value === "right" ? value : "center";
}

function font(key: FontKey | undefined, fallback: FontKey) {
  const stack = FONT_STACKS[key as FontKey] ?? FONT_STACKS[fallback];
  return stack.css;
}

/* Text for display: substitute, escape, keep line breaks. */
function text(value: string, ctx: Context) {
  return escapeHtml(substituteVariables(value, ctx.variables)).replace(
    /\r?\n/g,
    "<br>",
  );
}

/* Text for an attribute value: substitute and escape, no <br>. */
function attr(value: string, ctx: Context) {
  return escapeHtml(substituteVariables(value, ctx.variables).replace(/\s+/g, " "));
}

function hasControlOrSpace(value: string) {
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);
    if (code <= 0x20 || code === 0x7f) return true;
  }
  return false;
}

/* A link as it can appear in an href. Anything that is not
   http(s), mailto or tel becomes "#". With variables kept as
   tokens, a link that starts with one is left for send time. */
export function safeUrl(value: string, variables: Record<string, string> | null) {
  const raw = substituteVariables(value.trim(), variables);
  if (!raw) return "";

  if (!variables && /^\{\{\s*[a-zA-Z0-9_.]+\s*\}\}/.test(raw)) {
    return escapeHtml(raw);
  }

  if (/^(https?:\/\/|mailto:|tel:)/i.test(raw) && !hasControlOrSpace(raw)) {
    return escapeHtml(raw);
  }

  return "#";
}

/* ------------------------------------------------------------
   LAYOUT HELPERS
------------------------------------------------------------ */

const TABLE =
  'role="presentation" cellpadding="0" cellspacing="0" border="0"';

function row(content: string, tdAttrs: string, tdStyle: string) {
  return (
    `<table ${TABLE} width="100%" style="border-collapse:collapse;width:100%;">` +
    `<tr><td ${tdAttrs} style="${tdStyle}">${content}</td></tr></table>`
  );
}

/* ------------------------------------------------------------
   BLOCKS
------------------------------------------------------------ */

function renderLeaf(block: LeafBlock, ctx: Context): string {
  switch (block.type) {
    case "text": {
      const p = block.properties;
      const pad = clamp(p.padding, 0, 80, 12);
      const margin = clamp(p.margin, 0, 80, 0);
      const align = alignment(p.alignment);
      const inner = row(
        text(p.text, ctx),
        `align="${align}"`,
        [
          `padding:${pad}px`,
          `font-family:${font(p.fontFamily, ctx.baseFont)}`,
          `font-size:${clamp(p.fontSize, 8, 72, 16)}px`,
          `font-weight:${clamp(p.fontWeight, 100, 900, 400)}`,
          `line-height:${clamp(p.lineHeight, 1, 3, 1.6)}`,
          `color:${hex(p.color, "#374151")}`,
          `text-align:${align}`,
          "word-break:break-word",
        ].join(";"),
      );
      return margin ? row(inner, "", `padding:${margin}px 0`) : inner;
    }

    case "heading": {
      const p = block.properties;
      const level = p.level === "h2" || p.level === "h3" ? p.level : "h1";
      const align = alignment(p.alignment);
      const style = [
        "margin:0",
        `font-family:${font(p.fontFamily, ctx.baseFont)}`,
        `font-size:${clamp(p.fontSize, 12, 72, 28)}px`,
        `font-weight:${clamp(p.fontWeight, 100, 900, 700)}`,
        "line-height:1.25",
        `color:${hex(p.color, "#172033")}`,
        `text-align:${align}`,
        "word-break:break-word",
      ].join(";");
      return row(
        `<${level} style="${style}">${text(p.text, ctx)}</${level}>`,
        `align="${align}"`,
        `padding:${clamp(p.padding, 0, 80, 12)}px`,
      );
    }

    case "image": {
      const p = block.properties;
      const pad = clamp(p.padding, 0, 80, 12);
      const align = alignment(p.alignment);
      const available = Math.max(40, ctx.width - pad * 2);
      const fill = !p.width || p.width >= available;
      const width = fill ? available : clamp(p.width, 1, available, available);
      const height = p.height ? clamp(p.height, 1, 2000, 0) : 0;
      const radius = clamp(p.borderRadius, 0, 200, 0);
      const src = safeUrl(p.src, ctx.variables);

      if (!src || src === "#") {
        const placeholder =
          `<table ${TABLE} width="${width}" align="${align}"${fill ? ' class="mq-img"' : ""} style="width:${width}px;max-width:100%;">` +
          `<tr><td align="center" style="height:${height || 140}px;background:#EEF1F4;border:1px dashed #CBD3DC;border-radius:${radius}px;font-family:${font(ctx.baseFont, "sans")};font-size:13px;color:#6B7785;">` +
          `Add an image URL</td></tr></table>`;
        return row(placeholder, `align="${align}"`, `padding:${pad}px`);
      }

      const style = [
        "display:block",
        "border:0",
        "outline:none",
        "text-decoration:none",
        `width:${width}px`,
        "max-width:100%",
        height ? `height:${height}px` : "height:auto",
        radius ? `border-radius:${radius}px` : "",
        height ? "object-fit:cover" : "",
      ]
        .filter(Boolean)
        .join(";");

      let img =
        `<img src="${src}" alt="${attr(p.alt, ctx)}" width="${width}"` +
        (height ? ` height="${height}"` : "") +
        `${fill ? ' class="mq-img"' : ""} style="${style}">`;

      const link = safeUrl(p.linkUrl, ctx.variables);
      if (link && link !== "#") {
        img = `<a href="${link}" target="_blank" style="text-decoration:none;">${img}</a>`;
      }

      // align on the cell centers the image; margin auto helps clients that ignore it
      return row(
        `<div style="text-align:${align};">${img}</div>`,
        `align="${align}"`,
        `padding:${pad}px`,
      );
    }

    case "button": {
      const p = block.properties;
      const align = alignment(p.alignment);
      const bg = hex(p.backgroundColor, "#0B3D66");
      const fg = hex(p.textColor, "#FFFFFF");
      const radius = clamp(p.borderRadius, 0, 60, 6);
      const pad = clamp(p.padding, 4, 40, 12);
      const size = clamp(p.fontSize, 10, 40, 16);
      const full = p.width === "full";
      const href = safeUrl(p.url, ctx.variables) || "#";

      const button =
        `<table ${TABLE} ${full ? 'width="100%"' : ""} align="${align}" style="border-collapse:separate;${full ? "width:100%;" : ""}">` +
        `<tr><td align="center" bgcolor="${bg}" style="border-radius:${radius}px;background-color:${bg};">` +
        `<a href="${href}" target="_blank" style="display:${full ? "block" : "inline-block"};padding:${pad}px ${pad * 2}px;font-family:${font(ctx.baseFont, "sans")};font-size:${size}px;font-weight:600;line-height:1.2;color:${fg};text-decoration:none;border-radius:${radius}px;">` +
        `${text(p.text, ctx)}</a></td></tr></table>`;

      return row(button, `align="${align}"`, "padding:12px 16px");
    }

    case "divider": {
      const p = block.properties;
      const align = alignment(p.alignment);
      const thickness = clamp(p.thickness, 1, 20, 1);
      const width = clamp(p.width, 10, 100, 100);
      const line =
        `<table ${TABLE} width="${width}%" align="${align}" style="width:${width}%;border-collapse:collapse;">` +
        `<tr><td style="border-top:${thickness}px solid ${hex(p.color, "#E1E6EC")};font-size:0;line-height:0;height:0;">&nbsp;</td></tr></table>`;
      return row(line, `align="${align}"`, `padding:${clamp(p.margin, 0, 80, 16)}px 16px`);
    }

    case "spacer": {
      const h = clamp(block.properties.height, 4, 200, 24);
      return row("&nbsp;", `height="${h}"`, `height:${h}px;font-size:0;line-height:${h}px;`);
    }

    case "social": {
      const p = block.properties;
      const align = alignment(p.alignment);
      const bg = hex(p.color, "#EEF1F4");
      const fg = hex(p.textColor, "#172033");
      const size = clamp(p.fontSize, 10, 24, 13);

      const cells = SOCIAL_NETWORKS.filter(({ key }) => p.links[key]?.enabled)
        .map(({ key, label }) => {
          const href = safeUrl(p.links[key].url, ctx.variables) || "#";
          return (
            `<td style="padding:4px;">` +
            `<a href="${href}" target="_blank" style="display:inline-block;padding:6px 14px;background-color:${bg};color:${fg};border-radius:999px;font-family:${font(ctx.baseFont, "sans")};font-size:${size}px;font-weight:600;line-height:1.2;text-decoration:none;">${label}</a></td>`
          );
        })
        .join("");

      if (!cells) return "";

      return row(
        `<table ${TABLE} align="${align}" style="border-collapse:collapse;"><tr>${cells}</tr></table>`,
        `align="${align}"`,
        `padding:${clamp(p.padding, 0, 80, 12)}px`,
      );
    }

    case "footer": {
      const p = block.properties;
      const align = alignment(p.alignment);
      const color = hex(p.color, "#6B7785");
      const parts: string[] = [];
      const para = (html: string) =>
        `<p style="margin:0 0 6px 0;">${html}</p>`;

      if (p.companyName.trim()) parts.push(para(`<strong>${text(p.companyName, ctx)}</strong>`));
      if (p.address.trim()) parts.push(para(text(p.address, ctx)));
      if (p.text.trim()) parts.push(para(text(p.text, ctx)));

      const href = safeUrl(p.unsubscribeUrl, ctx.variables);
      if (p.unsubscribeText.trim() && href) {
        parts.push(
          para(
            `<a href="${href}" target="_blank" style="color:${color};text-decoration:underline;">${text(p.unsubscribeText, ctx)}</a>`,
          ),
        );
      }

      return row(
        parts.join(""),
        `align="${align}"`,
        [
          `padding:${clamp(p.padding, 0, 80, 16)}px`,
          `font-family:${font(ctx.baseFont, "sans")}`,
          `font-size:${clamp(p.fontSize, 9, 24, 12)}px`,
          "line-height:1.5",
          `color:${color}`,
          `text-align:${align}`,
        ].join(";"),
      );
    }
  }
}

export const COLUMN_RATIOS: Record<string, [number, number]> = {
  "50-50": [0.5, 0.5],
  "33-67": [1 / 3, 2 / 3],
  "67-33": [2 / 3, 1 / 3],
};

/* Pixel widths of the two cells inside a Columns block. */
export function columnWidths(
  totalWidth: number,
  ratio: string,
  gap: number,
  padding: number,
): [number, number] {
  const [a] = COLUMN_RATIOS[ratio] ?? COLUMN_RATIOS["50-50"];
  const usable = Math.max(80, totalWidth - padding * 2 - gap);
  const left = Math.round(usable * a);
  return [left, usable - left];
}

export function renderBlockHtml(block: Block, ctx: Context): string {
  if (block.type !== "columns") return renderLeaf(block, ctx);

  const p = block.properties;
  const gap = clamp(p.gap, 0, 60, 16);
  const pad = clamp(p.padding, 0, 60, 12);
  const [leftWidth, rightWidth] = columnWidths(ctx.width, p.ratio, gap, pad);

  const cell = (children: LeafBlock[], width: number, side: "left" | "right") => {
    const inner =
      children.map((child) => renderLeaf(child, { ...ctx, width })).join("") || "&nbsp;";
    const spacing =
      side === "left" ? `padding-right:${gap / 2}px` : `padding-left:${gap / 2}px`;
    return (
      `<td class="mq-col" width="${width + gap / 2}" valign="top" ` +
      `style="width:${width + gap / 2}px;vertical-align:top;${spacing};">${inner}</td>`
    );
  };

  return row(
    `<table ${TABLE} width="100%" style="border-collapse:collapse;width:100%;"><tr>` +
      cell(block.columns[0], leftWidth, "left") +
      cell(block.columns[1], rightWidth, "right") +
      `</tr></table>`,
    "",
    `padding:${pad}px`,
  );
}

/* Pixels available to top-level blocks inside the email body. */
export function bodyInnerWidth(settings: EmailTemplateDoc["settings"]) {
  const width = clamp(settings.width, 320, 800, 600);
  const pad = clamp(settings.contentPadding ?? 0, 0, 60, 0);
  const border = clamp(settings.borderWidth ?? 0, 0, 8, 0);
  return Math.max(200, width - pad * 2 - border * 2);
}

export function blockContext(
  doc: EmailTemplateDoc,
  options: RenderOptions = {},
  width?: number,
): Context {
  return {
    variables: options.variables ?? null,
    width: width ?? clamp(doc.settings.width, 320, 800, 600),
    baseFont: doc.settings.fontFamily in FONT_STACKS ? doc.settings.fontFamily : "sans",
  };
}

/* ------------------------------------------------------------
   DOCUMENT
------------------------------------------------------------ */

export function renderEmailTemplate(
  doc: EmailTemplateDoc,
  options: RenderOptions = {},
): RenderedEmail {
  const settings = doc.settings;
  const width = clamp(settings.width, 320, 800, 600);
  const bodyPad = clamp(settings.contentPadding ?? 0, 0, 60, 0);
  const border = clamp(settings.borderWidth ?? 0, 0, 8, 0);
  /* blocks get the body width minus its padding and border */
  const ctx = blockContext(doc, options, bodyInnerWidth(settings));
  const bg = hex(settings.backgroundColor, "#F5F5F5");
  const contentBg = hex(settings.contentBackgroundColor, "#FFFFFF");
  const pagePad = clamp(settings.padding ?? 24, 0, 80, 24);
  const radius = clamp(settings.borderRadius ?? 0, 0, 40, 0);
  const align = alignment(settings.alignment ?? "center");
  const borderCss = border
    ? `border:${border}px solid ${hex(settings.borderColor ?? "", "#E1E6EC")};`
    : "";
  const radiusCss = radius
    ? `border-radius:${radius}px;border-collapse:separate;overflow:hidden;`
    : "border-collapse:collapse;";

  const subject = substituteVariables(doc.email.subject, ctx.variables);
  const previewText = substituteVariables(doc.email.previewText, ctx.variables);

  const body = doc.blocks.map((block) => renderBlockHtml(block, ctx)).join("");

  /* Pads the inbox preview so the client does not pull body text
     in after the preview line. */
  const previewPad = "&#847;&zwnj;&nbsp;".repeat(60);

  const html = `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<meta name="format-detection" content="telephone=no,address=no,email=no,date=no,url=no">
<title>${escapeHtml(subject)}</title>
<style>
body{margin:0;padding:0;width:100%!important;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;}
table{border-collapse:collapse;}
img{border:0;outline:none;text-decoration:none;-ms-interpolation-mode:bicubic;}
@media only screen and (max-width:${width + 24}px){
.mq-container{width:100%!important;max-width:100%!important;}
.mq-col{display:block!important;width:100%!important;max-width:100%!important;padding-left:0!important;padding-right:0!important;}
.mq-img{width:100%!important;max-width:100%!important;height:auto!important;}
}
</style>
</head>
<body style="margin:0;padding:0;background-color:${bg};">
<div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">${escapeHtml(previewText)}${previewPad}</div>
<table ${TABLE} width="100%" bgcolor="${bg}" style="width:100%;background-color:${bg};border-collapse:collapse;">
<tr><td align="${align}" style="padding:${pagePad}px ${Math.max(pagePad, 8)}px;">
<!--[if mso]><table ${TABLE} width="${width}" align="${align}"><tr><td><![endif]-->
<table ${TABLE} class="mq-container" width="${width}" align="${align}" bgcolor="${contentBg}" style="width:${width}px;max-width:${width}px;background-color:${contentBg};${borderCss}${radiusCss}">
<tr><td style="padding:${bodyPad}px;">${body}</td></tr>
</table>
<!--[if mso]></td></tr></table><![endif]-->
</td></tr>
</table>
</body>
</html>`;

  return { html, subject, previewText };
}
