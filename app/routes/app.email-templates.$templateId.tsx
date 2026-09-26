/* ============================================================
   EMAIL TEMPLATE EDITOR

   /app/email-templates/new   create
   /app/email-templates/:id   edit

   GET   loader         one template this shop owns
   POST  intent=save    create (id "new") or update, then back to the list
   POST  intent=delete  delete, then back to the list

   One email, two tabs, always in sync (see email-sync.ts):
     Design  a simple form; each change updates that part of the
             HTML in place
     HTML    the full HTML code; each change updates the form
   Both share one live preview on the right, which is exactly the
   email that is sent.
   The preview uses the same renderEmailTemplate() the server
   uses for the saved HTML, with sample values for variables.
   ============================================================ */

import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import {
  Link,
  redirect,
  useActionData,
  useBlocker,
  useLoaderData,
  useNavigate,
  useNavigation,
  useParams,
  useSubmit,
} from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";

import {
  button,
  card,
  fieldHint,
  fieldLabel,
  input,
  modalOverlay,
  modalPanel,
  textarea,
} from "../design/styles";
import { color, fontWeight, radius, space, text, zIndex } from "../design/tokens";
import {
  EMAIL_VARIABLES,
  MAX_HTML_LENGTH,
  defaultTemplate,
  designToHtml,
  renderEmailTemplate,
  sampleVariables,
  validateTemplate,
  type EmailTemplateData,
  type TemplateErrors,
} from "../models/email-template";
import {
  DESIGN_KEYS,
  applyDesignToHtml,
  isDesignKey,
  readDesignFromHtml,
} from "../models/email-sync";
import {
  deleteEmailTemplate,
  getEmailTemplate,
  saveEmailTemplate,
  type EmailTemplateRow,
} from "../models/email-template.server";
import { actorName } from "../models/actor.server";
import { getShopInfo } from "../models/shop-info.server";
import { authenticate } from "../shopify.server";

const LIST = "/app/email-templates";

export async function loader({ request, params }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const id = params.templateId ?? "new";
  /* The preview uses the store's real name and URL. */
  const shopInfo = await getShopInfo(session.shop);
  if (id === "new") return { shop: session.shop, shopInfo, template: null, notFound: false };

  const template = await getEmailTemplate(session.shop, id);
  return { shop: session.shop, shopInfo, template, notFound: !template };
}

type ActionResult =
  | { ok: true; created: boolean; template: EmailTemplateRow }
  | { ok: false; error: string; errors: TemplateErrors };

export async function action({ request, params }: ActionFunctionArgs) {
  const auth = await authenticate.admin(request);
  const { session } = auth;
  const id = params.templateId ?? "new";
  const formData = await request.formData();
  const intent = String(formData.get("intent") || "");

  try {
    if (intent === "delete" && id !== "new") {
      await deleteEmailTemplate(session.shop, id);
      return redirect(LIST);
    }

    if (intent === "save") {
      let input: unknown = null;
      try {
        input = JSON.parse(String(formData.get("data") || ""));
      } catch {
        return { ok: false, error: "The form data was not valid.", errors: {} } satisfies ActionResult;
      }
      const result = await saveEmailTemplate(session.shop, id === "new" ? null : id, input, actorName(auth));
      return (result.ok
        ? { ok: true, created: id === "new", template: result.template }
        : { ok: false, error: result.error, errors: result.errors }) satisfies ActionResult;
    }

    return { ok: false, error: "Unknown action.", errors: {} } satisfies ActionResult;
  } catch (error) {
    console.error("EMAIL TEMPLATE SAVE ERROR:", error);
    return {
      ok: false,
      error: "Could not save because of a server error. Your changes are still here; please try again.",
      errors: {},
    } satisfies ActionResult;
  }
}

/* ------------------------------------------------------------
   SMALL FORM PIECES
------------------------------------------------------------ */

type FieldKey = keyof EmailTemplateData;

function Field({ label, error, hint, children }: { label: string; error?: string; hint?: string; children: ReactNode }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
      <span style={fieldLabel()}>{label}</span>
      {children}
      {error ? (
        <span role="alert" style={{ ...fieldHint({ invalid: true }), marginTop: space[2] }}>{error}</span>
      ) : hint ? (
        <span style={{ ...fieldHint(), marginTop: space[2] }}>{hint}</span>
      ) : null}
    </label>
  );
}

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section style={{ ...card({ elevation: "flat" }), padding: space[7], display: "flex", flexDirection: "column", gap: space[6] }}>
      <h2 style={{ margin: 0, ...text.h4, color: color.textStrong }}>{title}</h2>
      {children}
    </section>
  );
}

const CSS = `
.mq-et-grid{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:20px;align-items:start;}
.mq-et-preview{position:sticky;top:12px;}
.mq-et-two{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px;}
@media (max-width:980px){.mq-et-grid{grid-template-columns:minmax(0,1fr);}.mq-et-preview{position:static;}}
@media (max-width:560px){.mq-et-two{grid-template-columns:minmax(0,1fr);}}
.mq-et-code{width:100%;box-sizing:border-box;min-height:560px;resize:vertical;padding:14px 16px;border-radius:8px;border:1px solid #1E293B;background:#0F172A;color:#E2E8F0;font:13px/1.55 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;tab-size:2;white-space:pre;overflow:auto;caret-color:#F8FAFC;}
.mq-et-code:focus{outline:2px solid #7C9CFF;outline-offset:1px;}
.mq-et-code[aria-invalid="true"]{border-color:#E5484D;}
`;

/* ------------------------------------------------------------
   PAGE
------------------------------------------------------------ */

export default function EmailTemplateEditor() {
  const { template, shopInfo, notFound } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>() as ActionResult | undefined;
  const navigation = useNavigation();
  const navigate = useNavigate();
  const submit = useSubmit();
  const shopify = useAppBridge();
  const { templateId = "new" } = useParams();

  /* The HTML is the email. Templates saved before HTML existed
     get it made from their Design fields, so both tabs start
     from the same email. */
  const initial = useMemo(() => {
    const t = template?.data ?? defaultTemplate();
    return t.customHtml.trim() ? t : { ...t, customHtml: designToHtml(t) };
  }, [template]);
  const [data, setData] = useState<EmailTemplateData>(initial);
  const [saved, setSaved] = useState(() => JSON.stringify(initial));
  const [showErrors, setShowErrors] = useState(false);
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmResetAll, setConfirmResetAll] = useState(false);

  /* Reset when switching to another template (or new -> saved id).
     The form is read back from the HTML (browser only), so the two
     tabs can never start out of step. */
  useEffect(() => {
    const synced = { ...initial, ...readDesignFromHtml(initial.customHtml).values };
    setData(synced);
    setSaved(JSON.stringify(synced));
    setShowErrors(false);
  }, [initial]);

  /* Switching between the Design and HTML tabs is not a change. */
  const dirty = useMemo(
    () => JSON.stringify({ ...data, mode: "" }) !== JSON.stringify({ ...(JSON.parse(saved) as EmailTemplateData), mode: "" }),
    [data, saved],
  );
  const saving = navigation.state !== "idle" && navigation.formData?.get("intent") === "save";
  const deleting = navigation.state !== "idle" && navigation.formData?.get("intent") === "delete";

  /* Parts of the Design that are not in the HTML (deleted in the
     code, or HTML pasted from elsewhere) cannot be edited in the form. */
  const missing = useMemo(() => readDesignFromHtml(data.customHtml).missing, [data.customHtml]);

  /* The HTML is checked as the email; Design fields are checked too
     (bad links or colors are not written into the HTML). */
  const clientErrors = useMemo(() => {
    const htmlErrors = validateTemplate(data);
    const designErrors = validateTemplate({ ...data, mode: "form", customHtml: "" });
    const merged: TemplateErrors = { ...htmlErrors };
    for (const key of DESIGN_KEYS) {
      if (designErrors[key] && !missing.has(key)) merged[key] = designErrors[key];
    }
    return merged;
  }, [data, missing]);
  const serverErrors = actionData && !actionData.ok ? actionData.errors : {};
  const errors: TemplateErrors = showErrors ? { ...serverErrors, ...clientErrors } : {};

  /* ---- unsaved changes ---- */
  const allowLeave = useRef(false);
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      dirty && !allowLeave.current && currentLocation.pathname !== nextLocation.pathname,
  );
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (!dirty) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  /* ---- save result ---- */
  useEffect(() => {
    if (!actionData) return;
    if (actionData.ok) {
      /* Saved: back to the Email templates list. */
      shopify.toast.show(actionData.created ? "Template created" : "Template saved");
      setSaved(JSON.stringify(actionData.template.data));
      setShowErrors(false);
      allowLeave.current = true;
      navigate(LIST);
    } else {
      setShowErrors(true);
      shopify.toast.show(actionData.error, { isError: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actionData]);

  useEffect(() => {
    allowLeave.current = false;
  }, [templateId]);

  const save = useCallback(() => {
    if (Object.keys(clientErrors).length) {
      setShowErrors(true);
      shopify.toast.show("Please fix the highlighted fields.", { isError: true });
      return;
    }
    const formData = new FormData();
    formData.append("intent", "save");
    formData.append("data", JSON.stringify(data));
    submit(formData, { method: "post" });
  }, [clientErrors, data, submit, shopify]);

  /* ---- editing + variables ---- */
  /* Design fields also update their part of the HTML. */
  const set = <K extends FieldKey>(key: K, value: EmailTemplateData[K]) =>
    setData((d) => {
      const next = { ...d, [key]: value };
      if (isDesignKey(key)) next.customHtml = applyDesignToHtml(d.customHtml, next, [key]);
      return next;
    });

  /* HTML edits update the Design fields. */
  const setCode = (code: string) =>
    setData((d) => ({ ...d, customHtml: code, ...readDesignFromHtml(code).values }));

  /* Remember the last text field the merchant was typing in, so
     a variable chip inserts at their cursor. */
  const lastField = useRef<{ key: FieldKey; el: HTMLInputElement | HTMLTextAreaElement } | null>(null);
  const track = (key: FieldKey) => (event: { currentTarget: HTMLInputElement | HTMLTextAreaElement }) => {
    lastField.current = { key, el: event.currentTarget };
  };

  const insertVariable = (token: string) => {
    const fallbackKey: FieldKey = data.mode === "html" ? "customHtml" : "body";
    const tracked = lastField.current;
    /* Only use the remembered field if it belongs to the mode on screen. */
    const usable = tracked && (data.mode === "html" ? tracked.key === "customHtml" || tracked.key === "subject" || tracked.key === "previewText" : tracked.key !== "customHtml");
    const target = usable ? tracked : { key: fallbackKey, el: (fallbackKey === "customHtml" ? codeRef.current : null) as unknown as HTMLTextAreaElement };
    const current = String(data[target.key] ?? "");
    const start = target.el?.selectionStart ?? current.length;
    const end = target.el?.selectionEnd ?? current.length;
    const next = current.slice(0, start) + token + current.slice(end);
    if (target.key === "customHtml") setCode(next);
    else set(target.key, next as never);
    requestAnimationFrame(() => {
      if (target.el) {
        target.el.focus();
        target.el.setSelectionRange(start + token.length, start + token.length);
      }
    });
  };

  /* ---- Design / HTML mode ---- */
  const codeRef = useRef<HTMLTextAreaElement>(null);
  const importRef = useRef<HTMLInputElement>(null);
  const [confirmReset, setConfirmReset] = useState(false);

  const switchMode = (next: "form" | "html") => {
    if (next === data.mode) return;
    setConfirmReset(false);
    set("mode", next);
  };

  /* Start the HTML over from the Design fields (drops custom code). */
  const resetFromDesign = () => {
    setData((d) => ({ ...d, customHtml: designToHtml(d) }));
    setConfirmReset(false);
    shopify.toast.show("HTML rebuilt from the Design");
  };

  const importHtmlFile = (file: File | undefined) => {
    if (!file) return;
    if (file.size > MAX_HTML_LENGTH * 2) {
      shopify.toast.show("That file is too large for an email template.", { isError: true });
      return;
    }
    file.text().then(
      (content) => {
        setCode(content);
        shopify.toast.show(`Imported ${file.name}`);
      },
      () => shopify.toast.show("Could not read that file.", { isError: true }),
    );
  };

  /* Tab inserts two spaces instead of leaving the editor. */
  const onCodeKeyDown = (event: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== "Tab" || event.shiftKey || event.metaKey || event.ctrlKey || event.altKey) return;
    event.preventDefault();
    const el = event.currentTarget;
    const { selectionStart: start, selectionEnd: end, value } = el;
    const next = value.slice(0, start) + "  " + value.slice(end);
    setCode(next);
    requestAnimationFrame(() => el.setSelectionRange(start + 2, start + 2));
  };

  const gone = (key: FieldKey) => isDesignKey(key) && missing.has(key);
  const GONE_HINT = "Not in the HTML code, edit it there.";

  const textInput = (key: FieldKey, label: string, opts: { placeholder?: string; hint?: string; type?: string } = {}) => (
    <Field label={label} error={errors[key]} hint={gone(key) ? GONE_HINT : opts.hint}>
      <input
        type={opts.type ?? "text"}
        disabled={gone(key)}
        value={String(data[key])}
        placeholder={opts.placeholder}
        onChange={(e) => set(key, e.target.value as never)}
        onFocus={track(key)}
        onSelect={track(key)}
        aria-invalid={errors[key] ? true : undefined}
        style={input({ invalid: !!errors[key] })}
      />
    </Field>
  );

  const colorInput = (key: FieldKey, label: string) => {
    const value = String(data[key]);
    const six = /^#[0-9a-f]{6}$/i.test(value) ? value : "#000000";
    return (
      <Field label={label} error={errors[key]} hint={gone(key) ? GONE_HINT : undefined}>
        <div style={{ display: "flex", gap: space[3], opacity: gone(key) ? 0.5 : 1 }}>
          <input
            type="color"
            disabled={gone(key)}
            aria-label={`${label} picker`}
            value={six}
            onChange={(e) => set(key, e.target.value.toUpperCase() as never)}
            style={{ width: "38px", height: "38px", padding: 2, border: `1px solid ${color.border}`, borderRadius: radius.md, background: color.surface, cursor: "pointer", flexShrink: 0 }}
          />
          <input
            type="text"
            disabled={gone(key)}
            value={value}
            maxLength={7}
            onChange={(e) => set(key, e.target.value.trim().toUpperCase() as never)}
            style={{ ...input({ invalid: !!errors[key] }), fontFamily: "ui-monospace, Menlo, monospace" }}
          />
        </div>
      </Field>
    );
  };

  /* ---- preview ---- */
  const previewValues = useMemo(
    () => sampleVariables({ "shop.name": shopInfo.name, "shop.url": shopInfo.url }),
    [shopInfo.name, shopInfo.url],
  );
  /* Deferred, so typing in a large HTML document stays smooth. */
  const previewData = useDeferredValue(data);
  const preview = useMemo(() => renderEmailTemplate(previewData, previewValues), [previewData, previewValues]);
  const frame = useRef<HTMLIFrameElement>(null);
  const [frameHeight, setFrameHeight] = useState(560);
  const measure = () => {
    const body = frame.current?.contentDocument?.body;
    if (body) setFrameHeight(Math.max(320, body.scrollHeight + 8));
  };

  if (notFound) {
    return (
      <s-page heading="Email template" inlineSize="large">
        <s-section>
          <p style={{ ...text.body, color: color.textMuted }}>
            This template was not found. It may have been deleted.
          </p>
          <Link to={LIST} style={{ ...button("secondary", "md"), textDecoration: "none" }}>
            Back to Email templates
          </Link>
        </s-section>
      </s-page>
    );
  }

  const errorCount = Object.keys(errors).length;

  return (
    <s-page heading={template ? "Edit email template" : "New email template"} inlineSize="large">
      <style>{CSS}</style>

      {/* ---------- top bar ---------- */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: space[5], flexWrap: "wrap", marginBottom: space[6] }}>
        <div style={{ display: "flex", alignItems: "center", gap: space[5], flexWrap: "wrap" }}>
          <Link to={LIST} style={{ ...button("tertiary", "sm"), textDecoration: "none" }}>
            ← Email templates
          </Link>
          <span style={{ ...text.bodySm, color: dirty ? color.warningText : color.textSubtle }}>
            {saving ? "Saving…" : dirty ? "Unsaved changes" : template ? "All changes saved" : "Not saved yet"}
          </span>
        </div>
        <div style={{ display: "flex", gap: space[3] }}>
          {template ? (
            <button type="button" style={button("danger", "md")} onClick={() => setConfirmDelete(true)}>
              Delete
            </button>
          ) : null}
          {/* Reset: throw away unsaved edits and go back to the last
              saved version (or the starting template if never saved). */}
          <button
            type="button"
            style={button("secondary", "md", { disabled: !dirty || saving })}
            disabled={!dirty || saving}
            title={dirty ? "Discard unsaved changes" : "No unsaved changes"}
            onClick={() => setConfirmResetAll(true)}
          >
            Reset
          </button>
          <button type="button" style={button("primary", "md", { disabled: saving })} disabled={saving} onClick={save}>
            {saving ? "Saving…" : template ? "Save" : "Create template"}
          </button>
        </div>
      </div>

      {errorCount ? (
        <div role="alert" style={{ marginBottom: space[6], padding: `${space[5]} ${space[6]}`, borderRadius: radius.md, border: `1px solid ${color.dangerBorder}`, background: color.dangerSurface, color: color.dangerText, ...text.body }}>
          {actionData && !actionData.ok && !Object.keys(actionData.errors).length
            ? actionData.error
            : `Please fix ${errorCount} ${errorCount === 1 ? "field" : "fields"} marked in red.`}
        </div>
      ) : null}

      {/* ---------- Design / HTML ---------- */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: space[5], flexWrap: "wrap", marginBottom: space[6] }}>
        <div role="tablist" aria-label="Editor mode" style={{ display: "flex", gap: space[1], padding: space[1], background: color.surfaceSunken, border: `1px solid ${color.border}`, borderRadius: radius.md }}>
          {([
            ["form", "Design"],
            ["html", "HTML code"],
          ] as const).map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={data.mode === value}
              onClick={() => switchMode(value)}
              style={{ height: "32px", padding: `0 ${space[6]}`, border: 0, borderRadius: radius.sm, background: data.mode === value ? color.surface : "transparent", boxShadow: data.mode === value ? "0 1px 2px rgba(23,32,51,0.08)" : "none", color: data.mode === value ? color.textStrong : color.textMuted, fontSize: "13px", fontWeight: fontWeight.semibold, cursor: "pointer" }}
            >
              {label}
            </button>
          ))}
        </div>
        <span style={{ ...text.bodySm, color: color.textMuted }}>
          Design and HTML code edit the same email. The preview shows exactly what is sent.
        </span>
      </div>

      <div className="mq-et-grid">
        {/* ---------- form ---------- */}
        <div style={{ display: "flex", flexDirection: "column", gap: space[6] }}>
          <Card title="Details">
            <div className="mq-et-two">
              {textInput("name", "Template name")}
              <Field label="Status">
                <select value={data.status} onChange={(e) => set("status", e.target.value === "active" ? "active" : "draft")} style={input()}>
                  <option value="draft">Draft</option>
                  <option value="active">Active</option>
                </select>
              </Field>
            </div>
          </Card>

          <Card title="Inbox">
            {textInput("subject", "Subject")}
            {textInput("previewText", "Preview text", { hint: "Shown after the subject in most inboxes." })}
            <div className="mq-et-two">
              {textInput("fromName", "From name", { placeholder: "Your store name" })}
              {textInput("replyTo", "Reply-to email", { type: "email", placeholder: "support@example.com" })}
            </div>
          </Card>

          {data.mode === "html" ? (
            <Card title="HTML code">
              <div style={{ display: "flex", flexWrap: "wrap", gap: space[3], alignItems: "center" }}>
                <input
                  ref={importRef}
                  type="file"
                  accept=".html,.htm,text/html"
                  style={{ display: "none" }}
                  onChange={(e) => {
                    importHtmlFile(e.target.files?.[0]);
                    e.target.value = "";
                  }}
                />
                <button type="button" style={button("secondary", "sm")} onClick={() => importRef.current?.click()}>
                  Import .html file
                </button>
                {confirmReset ? (
                  <>
                    <span style={{ ...text.bodySm, color: color.warningText }}>Rebuild the HTML from the Design fields? Custom code will be lost.</span>
                    <button type="button" style={button("danger", "sm")} onClick={resetFromDesign}>Yes, rebuild</button>
                    <button type="button" style={button("tertiary", "sm")} onClick={() => setConfirmReset(false)}>Cancel</button>
                  </>
                ) : (
                  <button type="button" style={button("tertiary", "sm")} onClick={() => setConfirmReset(true)}>
                    Rebuild from Design
                  </button>
                )}
              </div>

              <Field label="Email HTML" error={errors.customHtml}>
                <textarea
                  ref={codeRef}
                  className="mq-et-code"
                  value={data.customHtml}
                  spellCheck={false}
                  autoCapitalize="off"
                  autoCorrect="off"
                  wrap="off"
                  placeholder={"<table width=\"100%\">\n  <tr><td>Hello {{customer.firstName}}, your code is {{discount.code}}</td></tr>\n</table>"}
                  onChange={(e) => setCode(e.target.value)}
                  onKeyDown={onCodeKeyDown}
                  onFocus={track("customHtml")}
                  onSelect={track("customHtml")}
                  aria-invalid={errors.customHtml ? true : undefined}
                />
              </Field>
              <div style={{ display: "flex", justifyContent: "space-between", gap: space[4], flexWrap: "wrap", ...text.bodySm, color: color.textMuted }}>
                <span>
                  {data.customHtml.split("\n").length === 1 ? "1 line" : `${data.customHtml.split("\n").length} lines`} · {data.customHtml.length.toLocaleString()} / {MAX_HTML_LENGTH.toLocaleString()} characters
                </span>
                <span>Scripts and event handlers are removed when saved.</span>
              </div>
              {data.customHtml.trim() && !/\{\{\s*discount\.code\s*\}\}/.test(data.customHtml) ? (
                <div role="note" style={{ padding: `${space[4]} ${space[5]}`, borderRadius: radius.md, background: color.warningSurface, color: color.warningText, ...text.bodySm }}>
                  Add {"{{discount.code}}"} somewhere in the HTML. Without it, campaigns send the built-in coupon email instead, so the shopper still gets their code.
                </div>
              ) : null}
              {data.customHtml.trim() && !/\{\{\s*unsubscribeUrl\s*\}\}/.test(data.customHtml) ? (
                <div role="note" style={{ padding: `${space[4]} ${space[5]}`, borderRadius: radius.md, background: color.infoSurface, color: color.infoText, ...text.bodySm }}>
                  Tip: link {"{{unsubscribeUrl}}"} in your footer so shoppers can unsubscribe.
                </div>
              ) : null}
              <div>
                <div style={{ ...fieldLabel(), marginBottom: space[3] }}>Insert variable</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: space[3] }}>
                  {EMAIL_VARIABLES.map((v) => (
                    <button
                      key={v.key}
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => insertVariable(`{{${v.key}}}`)}
                      title={`{{${v.key}}}`}
                      style={{ border: `1px solid ${color.border}`, background: color.accentSubtle, color: color.accentOnSubtle, borderRadius: radius.pill, padding: `${space[2]} ${space[5]}`, fontSize: "12px", fontWeight: fontWeight.semibold, cursor: "pointer" }}
                    >
                      {v.label}
                    </button>
                  ))}
                </div>
                <div style={{ ...fieldHint(), marginTop: space[3] }}>
                  Goes in at your cursor in the code. The preview shows sample values.
                </div>
              </div>
            </Card>
          ) : null}

          {data.mode === "form" ? (
          <>
          {missing.size ? (
            <div role="note" style={{ padding: `${space[5]} ${space[6]}`, borderRadius: radius.md, background: color.warningSurface, color: color.warningText, ...text.body }}>
              Some parts of this email are not in its HTML code (they were removed there, or the HTML came from elsewhere), so they can&apos;t be edited here. Edit them in HTML code, or use &ldquo;Rebuild from Design&rdquo; there to start the HTML over.
            </div>
          ) : null}
          <Card title="Content">
            {textInput("logoUrl", "Logo URL", { placeholder: "https://cdn.shopify.com/...", hint: "Optional. A public https:// image link." })}
            {textInput("heading", "Heading")}
            <Field label="Message" error={errors.body} hint={gone("body") ? GONE_HINT : "Press Enter for a new line."}>
              <textarea
                rows={7}
                disabled={gone("body")}
                value={data.body}
                onChange={(e) => set("body", e.target.value)}
                onFocus={track("body")}
                onSelect={track("body")}
                aria-invalid={errors.body ? true : undefined}
                style={{ ...textarea({ invalid: !!errors.body }), minHeight: "150px" }}
              />
            </Field>
            <div>
              <div style={{ ...fieldLabel(), marginBottom: space[3] }}>Insert variable</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: space[3] }}>
                {EMAIL_VARIABLES.map((v) => (
                  <button
                    key={v.key}
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => insertVariable(`{{${v.key}}}`)}
                    title={`{{${v.key}}}`}
                    style={{ border: `1px solid ${color.border}`, background: color.accentSubtle, color: color.accentOnSubtle, borderRadius: radius.pill, padding: `${space[2]} ${space[5]}`, fontSize: "12px", fontWeight: fontWeight.semibold, cursor: "pointer" }}
                  >
                    {v.label}
                  </button>
                ))}
              </div>
              <div style={{ ...fieldHint(), marginTop: space[3] }}>
                Goes into the field you last clicked. The preview shows sample values.
              </div>
            </div>
            <div className="mq-et-two">
              {textInput("buttonText", "Button text", { hint: "Leave both empty for no button." })}
              {textInput("buttonUrl", "Button link", { placeholder: "https://… or {{shop.url}}" })}
            </div>
            <Field label="Footer" error={errors.footerText} hint={gone("footerText") ? GONE_HINT : undefined}>
              <textarea
                rows={2}
                disabled={gone("footerText")}
                value={data.footerText}
                onChange={(e) => set("footerText", e.target.value)}
                onFocus={track("footerText")}
                onSelect={track("footerText")}
                style={{ ...textarea({ invalid: !!errors.footerText }), minHeight: "64px" }}
              />
            </Field>
          </Card>

          <Card title="Style">
            <Field label="Alignment" hint={gone("alignment") ? GONE_HINT : undefined}>
              <select disabled={gone("alignment")} value={data.alignment} onChange={(e) => set("alignment", e.target.value === "left" ? "left" : "center")} style={input()}>
                <option value="center">Center</option>
                <option value="left">Left</option>
              </select>
            </Field>
            <div className="mq-et-two">
              {colorInput("buttonColor", "Button color")}
              {colorInput("buttonTextColor", "Button text color")}
              {colorInput("textColor", "Text color")}
              {colorInput("contentBackgroundColor", "Email background")}
              {colorInput("backgroundColor", "Page background")}
            </div>
          </Card>
          </>
          ) : null}
        </div>

        {/* ---------- preview ---------- */}
        <aside className="mq-et-preview" style={{ ...card({ elevation: "flat" }), overflow: "hidden" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: space[4], padding: `${space[5]} ${space[6]}`, borderBottom: `1px solid ${color.borderSubtle}` }}>
            <span style={{ ...text.h4, color: color.textStrong }}>Live preview</span>
            <div role="radiogroup" aria-label="Preview size" style={{ display: "flex", gap: space[1], padding: space[1], background: color.surfaceSunken, border: `1px solid ${color.border}`, borderRadius: radius.md }}>
              {(["desktop", "mobile"] as const).map((d) => (
                <button
                  key={d}
                  type="button"
                  role="radio"
                  aria-checked={device === d}
                  onClick={() => setDevice(d)}
                  style={{ height: "28px", padding: `0 ${space[5]}`, border: 0, borderRadius: radius.sm, background: device === d ? color.surface : "transparent", color: device === d ? color.textStrong : color.textMuted, fontSize: "12px", fontWeight: fontWeight.semibold, cursor: "pointer" }}
                >
                  {d === "desktop" ? "Desktop" : "Mobile"}
                </button>
              ))}
            </div>
          </div>
          <div style={{ padding: `${space[5]} ${space[6]}`, borderBottom: `1px solid ${color.borderSubtle}` }}>
            <div style={{ ...text.bodySm, color: color.textMuted }}>{data.fromName || previewValues["shop.name"]}</div>
            <div style={{ ...text.body, fontWeight: fontWeight.semibold, color: color.textStrong }}>{preview.subject || "(no subject)"}</div>
            <div style={{ ...text.bodySm, color: color.textSubtle }}>{preview.previewText}</div>
          </div>
          <div style={{ background: data.backgroundColor, display: "flex", justifyContent: "center", overflowX: "auto" }}>
            <iframe
              ref={frame}
              title="Email preview"
              srcDoc={preview.html}
              sandbox="allow-same-origin"
              onLoad={measure}
              style={{ width: device === "mobile" ? "375px" : "100%", maxWidth: "100%", height: frameHeight, border: 0, display: "block" }}
            />
          </div>
        </aside>
      </div>

      {/* ---------- reset confirm ---------- */}
      {confirmResetAll ? (
        <div role="presentation" style={{ ...modalOverlay(), zIndex: zIndex.modal }}>
          <div role="alertdialog" aria-modal="true" aria-labelledby="mq-et-reset" style={modalPanel()}>
            <div style={{ padding: space[7] }}>
              <h3 id="mq-et-reset" style={{ margin: 0, ...text.h3, color: color.textStrong }}>Reset this template?</h3>
              <p style={{ margin: `${space[4]} 0 0`, ...text.body, color: color.textMuted }}>
                {template
                  ? "All unsaved changes in Design and HTML code will be lost, and the template goes back to its last saved version."
                  : "Everything you changed will be lost, and the template goes back to the starting design."}
              </p>
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: space[4], padding: `${space[5]} ${space[7]}`, borderTop: `1px solid ${color.borderSubtle}`, background: color.surfaceSunken }}>
              <button type="button" style={button("secondary", "md")} onClick={() => setConfirmResetAll(false)}>Cancel</button>
              <button
                type="button"
                style={button("danger", "md")}
                onClick={() => {
                  /* Back to the saved version, on the tab they are on. */
                  setData({ ...(JSON.parse(saved) as EmailTemplateData), mode: data.mode });
                  setShowErrors(false);
                  setConfirmReset(false);
                  setConfirmResetAll(false);
                  lastField.current = null;
                  shopify.toast.show(template ? "Changes discarded" : "Template reset");
                }}
              >
                Reset
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* ---------- delete confirm ---------- */}
      {confirmDelete ? (
        <div role="presentation" style={{ ...modalOverlay(), zIndex: zIndex.modal }}>
          <div role="alertdialog" aria-modal="true" aria-labelledby="mq-et-del" style={modalPanel()}>
            <div style={{ padding: space[7] }}>
              <h3 id="mq-et-del" style={{ margin: 0, ...text.h3, color: color.textStrong }}>Delete this email template?</h3>
              <p style={{ margin: `${space[4]} 0 0`, ...text.body, color: color.textMuted }}>This cannot be undone.</p>
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: space[4], padding: `${space[5]} ${space[7]}`, borderTop: `1px solid ${color.borderSubtle}`, background: color.surfaceSunken }}>
              <button type="button" style={button("secondary", "md")} disabled={deleting} onClick={() => setConfirmDelete(false)}>Cancel</button>
              <button
                type="button"
                style={button("danger", "md", { disabled: deleting })}
                disabled={deleting}
                onClick={() => {
                  allowLeave.current = true;
                  const formData = new FormData();
                  formData.append("intent", "delete");
                  submit(formData, { method: "post" });
                }}
              >
                {deleting ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* ---------- leave without saving ---------- */}
      {blocker.state === "blocked" ? (
        <div role="presentation" style={{ ...modalOverlay(), zIndex: zIndex.modal }}>
          <div role="alertdialog" aria-modal="true" aria-labelledby="mq-et-leave" style={modalPanel()}>
            <div style={{ padding: space[7] }}>
              <h3 id="mq-et-leave" style={{ margin: 0, ...text.h3, color: color.textStrong }}>Leave without saving?</h3>
              <p style={{ margin: `${space[4]} 0 0`, ...text.body, color: color.textMuted }}>Your unsaved changes will be lost.</p>
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: space[4], padding: `${space[5]} ${space[7]}`, borderTop: `1px solid ${color.borderSubtle}`, background: color.surfaceSunken }}>
              <button type="button" style={button("secondary", "md")} onClick={() => blocker.reset?.()}>Stay</button>
              <button type="button" style={button("danger", "md")} onClick={() => blocker.proceed?.()}>Leave</button>
            </div>
          </div>
        </div>
      ) : null}
    </s-page>
  );
}
