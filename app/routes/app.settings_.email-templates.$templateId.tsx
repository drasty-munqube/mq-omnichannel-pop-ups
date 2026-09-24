/* ============================================================
   SETTINGS > EMAIL TEMPLATE EDITOR

   /app/settings/email-templates/new   create
   /app/settings/email-templates/:id   edit

   GET   loader         one template this shop owns
   POST  intent=save    create (id "new") or update
   POST  intent=delete  delete, then back to Settings

   A simple form on the left and a live preview on the right.
   The preview uses the same renderEmailTemplate() the server
   uses for the saved HTML, with sample values for variables.
   ============================================================ */

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
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
  defaultTemplate,
  renderEmailTemplate,
  sampleVariables,
  validateTemplate,
  type EmailTemplateData,
  type TemplateErrors,
} from "../models/email-template";
import {
  deleteEmailTemplate,
  getEmailTemplate,
  saveEmailTemplate,
  type EmailTemplateRow,
} from "../models/email-template.server";
import { authenticate } from "../shopify.server";

const SETTINGS = "/app/settings";

export async function loader({ request, params }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const id = params.templateId ?? "new";
  if (id === "new") return { shop: session.shop, template: null, notFound: false };

  const template = await getEmailTemplate(session.shop, id);
  return { shop: session.shop, template, notFound: !template };
}

type ActionResult =
  | { ok: true; created: boolean; template: EmailTemplateRow }
  | { ok: false; error: string; errors: TemplateErrors };

export async function action({ request, params }: ActionFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const id = params.templateId ?? "new";
  const formData = await request.formData();
  const intent = String(formData.get("intent") || "");

  try {
    if (intent === "delete" && id !== "new") {
      await deleteEmailTemplate(session.shop, id);
      return redirect(SETTINGS);
    }

    if (intent === "save") {
      let input: unknown = null;
      try {
        input = JSON.parse(String(formData.get("data") || ""));
      } catch {
        return { ok: false, error: "The form data was not valid.", errors: {} } satisfies ActionResult;
      }
      const result = await saveEmailTemplate(session.shop, id === "new" ? null : id, input);
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
`;

/* ------------------------------------------------------------
   PAGE
------------------------------------------------------------ */

export default function EmailTemplateEditor() {
  const { template, shop, notFound } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>() as ActionResult | undefined;
  const navigation = useNavigation();
  const navigate = useNavigate();
  const submit = useSubmit();
  const shopify = useAppBridge();
  const { templateId = "new" } = useParams();

  const initial = useMemo(() => template?.data ?? defaultTemplate(), [template]);
  const [data, setData] = useState<EmailTemplateData>(initial);
  const [saved, setSaved] = useState(() => JSON.stringify(initial));
  const [showErrors, setShowErrors] = useState(false);
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  const [confirmDelete, setConfirmDelete] = useState(false);

  /* Reset when switching to another template (or new -> saved id). */
  useEffect(() => {
    setData(initial);
    setSaved(JSON.stringify(initial));
    setShowErrors(false);
  }, [initial]);

  const dirty = JSON.stringify(data) !== saved;
  const saving = navigation.state !== "idle" && navigation.formData?.get("intent") === "save";
  const deleting = navigation.state !== "idle" && navigation.formData?.get("intent") === "delete";

  const clientErrors = useMemo(() => validateTemplate(data), [data]);
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
      shopify.toast.show(actionData.created ? "Template created" : "Template saved");
      setSaved(JSON.stringify(actionData.template.data));
      setData(actionData.template.data);
      setShowErrors(false);
      if (actionData.created) {
        allowLeave.current = true;
        navigate(`/app/settings/email-templates/${actionData.template.id}`, { replace: true });
      }
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
  const set = <K extends FieldKey>(key: K, value: EmailTemplateData[K]) =>
    setData((d) => ({ ...d, [key]: value }));

  /* Remember the last text field the merchant was typing in, so
     a variable chip inserts at their cursor. */
  const lastField = useRef<{ key: FieldKey; el: HTMLInputElement | HTMLTextAreaElement } | null>(null);
  const track = (key: FieldKey) => (event: { currentTarget: HTMLInputElement | HTMLTextAreaElement }) => {
    lastField.current = { key, el: event.currentTarget };
  };

  const insertVariable = (token: string) => {
    const target = lastField.current ?? { key: "body" as FieldKey, el: null as unknown as HTMLTextAreaElement };
    const current = String(data[target.key] ?? "");
    const start = target.el?.selectionStart ?? current.length;
    const end = target.el?.selectionEnd ?? current.length;
    const next = current.slice(0, start) + token + current.slice(end);
    set(target.key, next as never);
    requestAnimationFrame(() => {
      if (target.el) {
        target.el.focus();
        target.el.setSelectionRange(start + token.length, start + token.length);
      }
    });
  };

  const textInput = (key: FieldKey, label: string, opts: { placeholder?: string; hint?: string; type?: string } = {}) => (
    <Field label={label} error={errors[key]} hint={opts.hint}>
      <input
        type={opts.type ?? "text"}
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
      <Field label={label} error={errors[key]}>
        <div style={{ display: "flex", gap: space[3] }}>
          <input
            type="color"
            aria-label={`${label} picker`}
            value={six}
            onChange={(e) => set(key, e.target.value.toUpperCase() as never)}
            style={{ width: "38px", height: "38px", padding: 2, border: `1px solid ${color.border}`, borderRadius: radius.md, background: color.surface, cursor: "pointer", flexShrink: 0 }}
          />
          <input
            type="text"
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
  const previewValues = useMemo(() => sampleVariables({ "shop.url": `https://${shop}` }), [shop]);
  const preview = useMemo(() => renderEmailTemplate(data, previewValues), [data, previewValues]);
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
          <Link to={SETTINGS} style={{ ...button("secondary", "md"), textDecoration: "none" }}>
            Back to Settings
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
          <Link to={SETTINGS} style={{ ...button("tertiary", "sm"), textDecoration: "none" }}>
            ← Settings
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

          <Card title="Content">
            {textInput("logoUrl", "Logo URL", { placeholder: "https://cdn.shopify.com/...", hint: "Optional. A public https:// image link." })}
            {textInput("heading", "Heading")}
            <Field label="Message" error={errors.body} hint="Press Enter for a new line.">
              <textarea
                rows={7}
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
            <Field label="Footer" error={errors.footerText}>
              <textarea
                rows={2}
                value={data.footerText}
                onChange={(e) => set("footerText", e.target.value)}
                onFocus={track("footerText")}
                onSelect={track("footerText")}
                style={{ ...textarea({ invalid: !!errors.footerText }), minHeight: "64px" }}
              />
            </Field>
          </Card>

          <Card title="Style">
            <Field label="Alignment">
              <select value={data.alignment} onChange={(e) => set("alignment", e.target.value === "left" ? "left" : "center")} style={input()}>
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
