/* ============================================================
   SETTINGS

   Covers the Shopify storefront, which does not use an embed
   snippet at all, and the rules that decide whether a popup
   actually appears.

   A campaign's embed snippet for other websites lives in the
   campaign itself, on the Websites step of the editor, so the
   code a merchant copies is always tied to the campaign they
   were looking at.
   ============================================================ */

import { useEffect, useState } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import {
  Link,
  useActionData,
  useLoaderData,
  useNavigation,
  useSubmit,
} from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";

import {
  badge,
  button,
  modalOverlay,
  modalPanel,
  tableHead,
  tableRow,
} from "../design/styles";
import { color, fontWeight, space, text, zIndex } from "../design/tokens";
import {
  deleteEmailTemplate,
  duplicateEmailTemplate,
  listEmailTemplates,
  type EmailTemplateRow,
} from "../models/email-template.server";
import { authenticate } from "../shopify.server";

/* ------------------------------------------------------------
   EMAIL TEMPLATES (listing)

   GET   loader            this shop's templates
   POST  intent=duplicate  copy one as a new draft
   POST  intent=delete     delete one

   Create and edit happen on
   app.settings_.email-templates.$templateId.tsx
   (/app/settings/email-templates/new or /:id).
   ------------------------------------------------------------ */

export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);
  try {
    return { templates: await listEmailTemplates(session.shop), loadError: false };
  } catch (error) {
    console.error("LIST EMAIL TEMPLATES ERROR:", error);
    return { templates: [] as EmailTemplateRow[], loadError: true };
  }
}

export async function action({ request }: ActionFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = String(formData.get("intent") || "");
  const id = String(formData.get("templateId") || "").trim();

  if (!id) return { ok: false, intent, message: "Template ID is required." };

  try {
    if (intent === "duplicate") {
      const copy = await duplicateEmailTemplate(session.shop, id);
      return copy
        ? { ok: true, intent, message: `Created "${copy.name}"` }
        : { ok: false, intent, message: "Template not found." };
    }
    if (intent === "delete") {
      const deleted = await deleteEmailTemplate(session.shop, id);
      return deleted
        ? { ok: true, intent, message: "Template deleted" }
        : { ok: false, intent, message: "Template not found." };
    }
    return { ok: false, intent, message: "Unknown action." };
  } catch (error) {
    console.error("EMAIL TEMPLATE ACTION ERROR:", intent, error);
    return { ok: false, intent, message: "Something went wrong. Please try again." };
  }
}

const COLUMNS = "minmax(160px,2fr) minmax(160px,2fr) 90px 140px 230px";

function formatDate(iso: string) {
  try {
    return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function EmailTemplatesSection() {
  const { templates, loadError } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const submit = useSubmit();
  const shopify = useAppBridge();
  const [deleting, setDeleting] = useState<EmailTemplateRow | null>(null);

  const busyId =
    navigation.state === "submitting" ? String(navigation.formData?.get("templateId") || "") : "";
  const busyIntent =
    navigation.state === "submitting" ? String(navigation.formData?.get("intent") || "") : "";

  useEffect(() => {
    if (!actionData) return;
    shopify.toast.show(actionData.message, { isError: !actionData.ok });
    if (actionData.ok && actionData.intent === "delete") setDeleting(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actionData]);

  const run = (intent: "duplicate" | "delete", templateId: string) => {
    const formData = new FormData();
    formData.append("intent", intent);
    formData.append("templateId", templateId);
    submit(formData, { method: "post" });
  };

  return (
    <s-section heading="Email templates">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: space[5], flexWrap: "wrap", marginBottom: space[6] }}>
        <span style={{ ...text.body, color: color.textMuted }}>
          Reusable emails for this store, such as the discount email sent after a popup.
        </span>
        <Link to="/app/settings/email-templates/new" style={{ ...button("primary", "md"), textDecoration: "none" }}>
          + Create template
        </Link>
      </div>

      {loadError ? (
        <p style={{ ...text.body, color: color.dangerText }}>
          Email templates could not be loaded. Please refresh the page.
        </p>
      ) : templates.length === 0 ? (
        <div style={{ padding: `${space[9]} ${space[6]}`, textAlign: "center", border: `1px dashed ${color.borderStrong}`, borderRadius: "12px" }}>
          <div style={{ ...text.h4, color: color.textStrong }}>No email templates yet</div>
          <div style={{ ...text.body, color: color.textMuted, marginTop: space[3] }}>
            Create one to get started.
          </div>
        </div>
      ) : (
        <div style={{ overflowX: "auto", border: `1px solid ${color.border}`, borderRadius: "12px" }}>
          <div style={{ minWidth: "820px" }}>
            <div style={tableHead(COLUMNS)}>
              <span>Name</span>
              <span>Subject</span>
              <span>Status</span>
              <span>Updated</span>
              <span style={{ textAlign: "right" }}>Actions</span>
            </div>
            {templates.map((t) => {
              const busy = busyId === t.id;
              return (
                <div key={t.id} style={tableRow(COLUMNS)}>
                  <Link
                    to={`/app/settings/email-templates/${t.id}`}
                    style={{ ...text.body, fontWeight: fontWeight.semibold, color: color.textStrong, textDecoration: "none", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                  >
                    {t.name}
                  </Link>
                  <span title={t.subject} style={{ ...text.body, color: color.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {t.subject}
                  </span>
                  <span>
                    <span style={badge(t.status === "active" ? "success" : "neutral")}>
                      {t.status === "active" ? "ACTIVE" : "DRAFT"}
                    </span>
                  </span>
                  <span style={{ ...text.bodySm, color: color.textMuted }}>{formatDate(t.updatedAt)}</span>
                  <div style={{ display: "flex", gap: space[3], justifyContent: "flex-end" }}>
                    <Link to={`/app/settings/email-templates/${t.id}`} style={{ ...button("secondary", "sm"), textDecoration: "none" }}>
                      Edit
                    </Link>
                    <button type="button" disabled={busy} style={button("secondary", "sm", { disabled: busy })} onClick={() => run("duplicate", t.id)}>
                      {busy && busyIntent === "duplicate" ? "Copying…" : "Duplicate"}
                    </button>
                    <button type="button" disabled={busy} style={button("danger", "sm", { disabled: busy })} onClick={() => setDeleting(t)}>
                      Delete
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {deleting ? (
        <div role="presentation" style={{ ...modalOverlay(), zIndex: zIndex.modal }}>
          <div role="alertdialog" aria-modal="true" aria-labelledby="mq-del-title" style={modalPanel()}>
            <div style={{ padding: space[7] }}>
              <h3 id="mq-del-title" style={{ margin: 0, ...text.h3, color: color.textStrong }}>
                Delete this email template?
              </h3>
              <p style={{ margin: `${space[4]} 0 0`, ...text.body, color: color.textMuted }}>
                &ldquo;{deleting.name}&rdquo; will be deleted permanently.
              </p>
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: space[4], padding: `${space[5]} ${space[7]}`, borderTop: `1px solid ${color.borderSubtle}`, background: color.surfaceSunken }}>
              <button type="button" style={button("secondary", "md")} disabled={busyIntent === "delete"} onClick={() => setDeleting(null)}>
                Cancel
              </button>
              <button type="button" style={button("danger", "md", { disabled: busyIntent === "delete" })} disabled={busyIntent === "delete"} onClick={() => run("delete", deleting.id)}>
                {busyIntent === "delete" ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </s-section>
  );
}

export default function Settings() {
  return (
    <s-page
      heading="Settings"
      inlineSize="large"
    >
      <EmailTemplatesSection />

      {/* ---------- shopify storefront ---------- */}

      <s-section heading="This Shopify store">
        <s-paragraph>
          Your own storefront does not need the
          snippet. It uses the theme app embed
          instead, which is faster and keeps
          working if this app moves to a new
          domain.
        </s-paragraph>

        <s-unordered-list>
          <s-list-item>
            Open Online Store, then Themes, then
            Customize.
          </s-list-item>
          <s-list-item>
            Open App embeds from the left sidebar.
          </s-list-item>
          <s-list-item>
            Turn on MQ Popups and press Save.
          </s-list-item>
        </s-unordered-list>
      </s-section>

      {/* ---------- what to expect ---------- */}

      <s-section heading="Before you test">
        <s-unordered-list>
          <s-list-item>
            A campaign only shows if both the
            campaign and the popup it is linked to
            are set to Live.
          </s-list-item>
          <s-list-item>
            A campaign also has to be allowed on
            that website. Campaigns run on all
            websites by default, and you can narrow
            that down in the campaign editor.
          </s-list-item>
          <s-list-item>
            Frequency rules apply. If a visitor has
            already seen it as many times as the
            campaign allows, or is inside a re-show
            cooldown, nothing appears for them.
          </s-list-item>
          <s-list-item>
            Device rules apply. A campaign limited
            to desktop will not appear on a narrow
            window, even on a desktop machine.
          </s-list-item>
          <s-list-item>
            Page rules work on other websites as
            far as they can. A page saved as a path
            is matched against the page someone is
            on. A Shopify page type, such as every
            product page, does not exist on another
            website, so a campaign built only from
            those runs there only if you picked
            that website by name on the Websites
            step.
          </s-list-item>
          <s-list-item>
            Triggers still apply. If a campaign
            waits for a scroll depth or a delay,
            the popup appears only once that is
            reached. An exit-intent campaign waits
            for the visitor to look like they are
            leaving, so it will not appear at all
            on a page nobody scrolls or leaves.
          </s-list-item>
        </s-unordered-list>
      </s-section>
    </s-page>
  );
}
