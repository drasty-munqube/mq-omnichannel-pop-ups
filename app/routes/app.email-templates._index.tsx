/* ============================================================
   EMAIL TEMPLATES (list page)

   Its own page in the app menu, below Analytics.

   GET   loader            this shop's templates
   POST  intent=duplicate  copy one as a new draft
   POST  intent=delete     delete one

   Create and edit happen on app.email-templates.$templateId.tsx
   (/app/email-templates/new or /app/email-templates/:id).
   ============================================================ */

import { useEffect, useState } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import {
  Link,
  useActionData,
  useNavigate,
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
import { color, fontWeight, radius, shadow, space, text, zIndex } from "../design/tokens";
import {
  deleteEmailTemplate,
  duplicateEmailTemplate,
  listEmailTemplates,
  type EmailTemplateRow,
} from "../models/email-template.server";
import { actorName } from "../models/actor.server";
import { AUDIT_GRID, AUDIT_HEADERS } from "../models/audit-format";
import { AuditCells, stickyEnd } from "../components/audit-cells";
import { authenticate } from "../shopify.server";
import { RowActions } from "../components/row-actions";


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
  const auth = await authenticate.admin(request);
  const { session } = auth;
  const formData = await request.formData();
  const intent = String(formData.get("intent") || "");
  const id = String(formData.get("templateId") || "").trim();

  if (!id) return { ok: false, intent, message: "Template ID is required." };

  try {
    if (intent === "duplicate") {
      const copy = await duplicateEmailTemplate(session.shop, id, actorName(auth));
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

const COLUMNS = `minmax(150px,2fr) minmax(150px,2fr) 84px ${AUDIT_GRID} 56px`;

function EmailTemplatesSection() {
  const { templates, loadError } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const submit = useSubmit();
  const navigate = useNavigate();
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
    <s-section>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: space[5], flexWrap: "wrap", marginBottom: space[6] }}>
        <span style={{ ...text.body, color: color.textMuted }}>
          Reusable emails for this store, such as the discount email sent after a popup.
        </span>
        <Link to="/app/email-templates/new" style={{ ...button("primary", "md"), textDecoration: "none" }}>
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
          <div style={{ minWidth: "1000px" }}>
            <div style={tableHead(COLUMNS)}>
              <span>Name</span>
              <span>Subject</span>
              <span>Status</span>
              {AUDIT_HEADERS.map((h) => (
                <span key={h}>{h}</span>
              ))}
              <span style={stickyEnd(color.surfaceSunken)}>Actions</span>
            </div>
            {templates.map((t) => {
              const busy = busyId === t.id;
              return (
                <div key={t.id} style={tableRow(COLUMNS)}>
                  <Link
                    to={`/app/email-templates/${t.id}`}
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
                  <AuditCells createdBy={t.createdBy} updatedBy={t.updatedBy} createdAt={t.createdAt} updatedAt={t.updatedAt} />
                  <div style={stickyEnd(color.surface)}>
                  <RowActions
                    name={t.name}
                    actions={[
                      { label: "Edit", onSelect: () => navigate(`/app/email-templates/${t.id}`) },
                      {
                        label: busy && busyIntent === "duplicate" ? "Copying…" : "Duplicate",
                        onSelect: () => run("duplicate", t.id),
                        disabled: busy,
                      },
                      { label: "Delete", onSelect: () => setDeleting(t), danger: true, disabled: busy },
                    ]}
                  />
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

export default function EmailTemplatesPage() {
  return (
    <s-page heading="Email templates" inlineSize="large">
      <EmailTemplatesSection />
    </s-page>
  );
}
