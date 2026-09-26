/* ============================================================
   EMAIL SYNC (browser only)

   Keeps the Design form and the HTML code of one email in sync.

   The HTML made from the Design form marks each part with a
   data-mq attribute (heading, body, button, logo, footer, card,
   page...). So:

     readDesignFromHtml   HTML edited  -> form fields
     applyDesignToHtml    form edited  -> only that part of the
                                          HTML is changed, the
                                          rest of the merchant's
                                          code is left alone

   A part the merchant deleted from the HTML is reported as
   missing, and the form shows it as not available instead of
   guessing where to put it back.

   Uses DOMParser, so it only runs in the browser. Server-side
   rendering gets empty results and changes nothing.
   ============================================================ */

import { checkUrl, isHexColor, type EmailTemplateData } from "./email-template";

export type DesignKey =
  | "logoUrl"
  | "heading"
  | "body"
  | "buttonText"
  | "buttonUrl"
  | "footerText"
  | "backgroundColor"
  | "contentBackgroundColor"
  | "textColor"
  | "buttonColor"
  | "buttonTextColor"
  | "alignment";

export const DESIGN_KEYS: DesignKey[] = [
  "logoUrl",
  "heading",
  "body",
  "buttonText",
  "buttonUrl",
  "footerText",
  "backgroundColor",
  "contentBackgroundColor",
  "textColor",
  "buttonColor",
  "buttonTextColor",
  "alignment",
];

export function isDesignKey(key: string): key is DesignKey {
  return (DESIGN_KEYS as string[]).includes(key);
}

const canParse = () => typeof DOMParser !== "undefined";

function parse(html: string) {
  return new DOMParser().parseFromString(html, "text/html");
}

function serialize(doc: Document, original: string) {
  const doctype = /^\s*<!doctype[^>]*>/i.exec(original)?.[0];
  return `${doctype ? `${doctype.trim()}\n` : ""}${doc.documentElement.outerHTML}`;
}

const q = (doc: Document, name: string) => doc.querySelector<HTMLElement>(`[data-mq="${name}"]`);
const rowOf = (doc: Document, name: string) => doc.querySelector<HTMLElement>(`[data-mq-row="${name}"]`);
const isHidden = (el: HTMLElement | null) => !!el && el.style.display === "none";

/* <br> becomes a new line; tags go; entities are decoded. */
function htmlToText(el: HTMLElement) {
  const clone = el.cloneNode(true) as HTMLElement;
  clone.querySelectorAll("br").forEach((br) => br.replaceWith("\n"));
  return (clone.textContent || "").replace(/ /g, " ").replace(/^\n+|\n+$/g, "");
}

function textToHtml(doc: Document, el: HTMLElement, value: string) {
  el.textContent = "";
  value.split(/\r?\n/).forEach((line, i) => {
    if (i > 0) el.appendChild(doc.createElement("br"));
    if (line) el.appendChild(doc.createTextNode(line));
  });
}

function toHex(value: string) {
  const v = value.trim();
  if (isHexColor(v)) {
    return (v.length === 4 ? `#${v[1]}${v[1]}${v[2]}${v[2]}${v[3]}${v[3]}` : v).toUpperCase();
  }
  const m = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i.exec(v);
  if (!m) return null;
  return `#${[m[1], m[2], m[3]].map((n) => Math.min(255, Number(n)).toString(16).padStart(2, "0")).join("")}`.toUpperCase();
}

function colorOf(el: HTMLElement | null, prop: "backgroundColor" | "color", attr?: string) {
  if (!el) return null;
  return toHex(el.style[prop] || "") ?? (attr ? toHex(el.getAttribute(attr) || "") : null);
}

/* ------------------------------------------------------------
   HTML -> form
------------------------------------------------------------ */

export function readDesignFromHtml(html: string): {
  values: Partial<Pick<EmailTemplateData, DesignKey>>;
  missing: Set<DesignKey>;
} {
  const values: Partial<Pick<EmailTemplateData, DesignKey>> = {};
  const missing = new Set<DesignKey>();
  if (!canParse() || !html.trim()) return { values, missing };

  const doc = parse(html);
  const found = <K extends DesignKey>(key: K, value: EmailTemplateData[K] | null | undefined) => {
    if (value === null || value === undefined) missing.add(key);
    else values[key] = value;
  };

  const logo = q(doc, "logo");
  found("logoUrl", logo ? (isHidden(rowOf(doc, "logo")) ? "" : logo.getAttribute("src") || "") : null);

  const heading = q(doc, "heading");
  found("heading", heading ? (isHidden(rowOf(doc, "heading")) ? "" : htmlToText(heading)) : null);

  const body = q(doc, "body");
  found("body", body ? htmlToText(body) : null);

  const button = q(doc, "button");
  const buttonHidden = isHidden(rowOf(doc, "button"));
  found("buttonText", button ? (buttonHidden ? "" : (button.textContent || "").trim()) : null);
  found("buttonUrl", button ? (buttonHidden ? "" : button.getAttribute("href") || "") : null);

  const footer = q(doc, "footer");
  found("footerText", footer ? (isHidden(footer) ? "" : htmlToText(footer)) : null);

  found("backgroundColor", colorOf(q(doc, "page"), "backgroundColor", "bgcolor"));
  found("contentBackgroundColor", colorOf(q(doc, "card"), "backgroundColor", "bgcolor"));
  found("textColor", colorOf(body, "color"));
  found("buttonColor", colorOf(q(doc, "button-bg"), "backgroundColor", "bgcolor"));
  found("buttonTextColor", colorOf(button, "color"));

  const align = (body?.getAttribute("align") || body?.style.textAlign || "").toLowerCase();
  found("alignment", body ? (align === "left" ? "left" : "center") : null);

  return { values, missing };
}

/* ------------------------------------------------------------
   form -> HTML (only the changed parts)
------------------------------------------------------------ */

const setRow = (doc: Document, name: string, visible: boolean) => {
  const row = rowOf(doc, name);
  if (row) row.style.display = visible ? "" : "none";
};

export function applyDesignToHtml(html: string, t: EmailTemplateData, keys: DesignKey[]): string {
  if (!canParse() || !html.trim() || keys.length === 0) return html;
  const doc = parse(html);
  let changed = false;

  for (const key of keys) {
    switch (key) {
      case "logoUrl": {
        const img = q(doc, "logo");
        const url = t.logoUrl.trim();
        if (!img || (url && checkUrl(url, false))) break;
        img.setAttribute("src", url);
        setRow(doc, "logo", !!url);
        /* Less space above the heading when a logo sits there. */
        const heading = q(doc, "heading");
        if (heading) heading.style.paddingTop = url ? "16px" : "36px";
        changed = true;
        break;
      }
      case "heading": {
        const el = q(doc, "heading");
        if (!el) break;
        textToHtml(doc, el, t.heading);
        setRow(doc, "heading", !!t.heading.trim());
        changed = true;
        break;
      }
      case "body": {
        const el = q(doc, "body");
        if (!el) break;
        textToHtml(doc, el, t.body);
        changed = true;
        break;
      }
      case "buttonText":
      case "buttonUrl": {
        const a = q(doc, "button");
        if (!a) break;
        const url = t.buttonUrl.trim();
        if (key === "buttonText") a.textContent = t.buttonText;
        if (key === "buttonUrl" && (!url || !checkUrl(url, true))) a.setAttribute("href", url);
        setRow(doc, "button", !!t.buttonText.trim() && !!(a.getAttribute("href") || "").trim());
        changed = true;
        break;
      }
      case "footerText": {
        const el = q(doc, "footer");
        if (!el) break;
        textToHtml(doc, el, t.footerText);
        el.style.display = t.footerText.trim() ? "" : "none";
        changed = true;
        break;
      }
      case "backgroundColor": {
        if (!isHexColor(t.backgroundColor)) break;
        for (const name of ["page", "page-body"]) {
          const el = q(doc, name);
          if (!el) continue;
          el.style.backgroundColor = t.backgroundColor;
          if (el.hasAttribute("bgcolor")) el.setAttribute("bgcolor", t.backgroundColor);
          changed = true;
        }
        break;
      }
      case "contentBackgroundColor": {
        const el = q(doc, "card");
        if (!el || !isHexColor(t.contentBackgroundColor)) break;
        el.style.backgroundColor = t.contentBackgroundColor;
        changed = true;
        break;
      }
      case "textColor": {
        if (!isHexColor(t.textColor)) break;
        doc.querySelectorAll<HTMLElement>("[data-mq-ink]").forEach((el) => {
          el.style.color = t.textColor;
          changed = true;
        });
        break;
      }
      case "buttonColor": {
        const el = q(doc, "button-bg");
        if (!el || !isHexColor(t.buttonColor)) break;
        el.style.backgroundColor = t.buttonColor;
        el.setAttribute("bgcolor", t.buttonColor);
        changed = true;
        break;
      }
      case "buttonTextColor": {
        const el = q(doc, "button");
        if (!el || !isHexColor(t.buttonTextColor)) break;
        el.style.color = t.buttonTextColor;
        changed = true;
        break;
      }
      case "alignment": {
        const align = t.alignment === "left" ? "left" : "center";
        doc.querySelectorAll<HTMLElement>("[data-mq-align]").forEach((el) => {
          el.setAttribute("align", align);
          el.style.textAlign = align;
          changed = true;
        });
        q(doc, "button-table")?.setAttribute("align", align);
        break;
      }
    }
  }

  return changed ? serialize(doc, html) : html;
}
