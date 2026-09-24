/* ============================================================
   SETTINGS > EMAIL TEMPLATES (list)

   GET     loader            list this shop's templates
   POST    intent=duplicate  copy one as a new draft
   POST    intent=delete     delete one

   Create and edit live on the builder route,
   app.settings.email-templates.$templateId.tsx.
   ============================================================ */

import { useEffect, useState } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import {
  Link,
  useActionData,
  useLoaderData,
  useNavigate,
  useNavigation,
  useSubmit,
} from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";

import {
  badge,
  button,
  card,
  emptyState,
  modalOverlay,
  modalPanel,
  tableHead,
  tableRow,
} from "../design/styles";
import { color, fontWeight, space, text, zIndex } from "../design/tokens";
import { PreviewModal } from "../email-builder/components/Preview";
import {
  deleteEmailTemplate,
  duplicateEmailTemplate,
  listEmailTemplates,
  type EmailTemplateRecord,
} from "../models/email-template.server";
import { authenticate } from "../shopify.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);

  try {
    const templates = await listEmailTemplates(session.shop);
    return { templates, shop: session.shop, loadError: null as string | null };
  } catch (error) {
    console.error("LIST EMAIL TEMPLATES ERROR:", error);
    return {
      templates: [] as EmailTemplateRecord[],
      shop: session.shop,
      loadError: "Email templates could not be loaded. Please refresh the page.",
    };
  }
}

type ActionResult =
  | { ok: true; intent: "duplicate"; name: string }
  | { ok: true; intent: "delete" }
  | { ok: false; intent: string; error: string };

export async function action({ request }: ActionFunctionArgs): Promise<ActionResult> {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = String(formData.get("intent") || "");
  const templateId = String(formData.get("templateId") || "").trim();

  if (!templateId) {
    return { ok: false, intent, error: "Template ID is required." };
  }

  try {
    if (intent === "duplicate") {
      const copy = await duplicateEmailTemplate(session.shop, templateId);
      return copy
        ? { ok: true, intent, name: copy.name }
        : { ok: false, intent, error: "Template not found." };
    }

    if (intent === "delete") {
      const deleted = await deleteEmailTemplate(session.shop, templateId);
      return deleted
        ? { ok: true, intent }
        : { ok: false, intent, error: "Template not found. It may already be deleted." };
    }

    return { ok: false, intent, error: "Unknown action." };
  } catch (error) {
    console.error(`EMAIL TEMPLATE ${intent.toUpperCase()} ERROR:`, error);
    return { ok: false, intent, error: "Something went wrong. Please try again." };
  }
}

const COLUMNS = "minmax(180px, 2fr) minmax(160px, 2fr) 90px 150px 300px";

function formatDate(iso: string) {
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export default function EmailTemplatesList() {
  const { templates, shop, loadError } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const navigate = useNavigate();
  const submit = useSubmit();
  const shopify = useAppBridge();

  const [previewing, setPreviewing] = useState<EmailTemplateRecord | null>(null);
  const [deleting, setDeleting] = useState<EmailTemplateRecord | null>(null);

  const busyIntent =
    navigation.state === "submitting" ? String(navigation.formData?.get("intent") || "") : "";
  const busyId =
    navigation.state === "submitting" ? String(navigation.formData?.get("templateId") || "") : "";

  useEffect(() => {
    if (!actionData) return;
    if (actionData.ok) {
      if (actionData.intent === "delete") {
        setDeleting(null);
        shopify.toast.show("Template deleted");
      } else {
        shopify.toast.show(`Created "${actionData.name}"`);
      }
    } else {
      shopify.toast.show(actionData.error, { isError: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actionData]);

  const run = (intent: "duplicate" | "delete", templateId: string) => {
    const formData = new FormData();
    formData.append("intent", intent);
    formData.append("templateId", templateId);
    submit(formData, { method: "post" });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: space[6] }}>
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: space[6],
          flexWrap: "wrap",
        }}
      >
        <div style={{ maxWidth: "620px" }}>
          <h2 style={{ margin: 0, ...text.h2, color: color.textStrong }}>Email templates</h2>
          <p style={{ margin: `${space[3]} 0 0`, ...text.body, color: color.textMuted }}>
            Design reusable emails with drag and drop. Templates are saved to this store only.
          </p>
        </div>
        <Link
          to="/app/settings/email-templates/new"
          style={{ ...button("primary", "md"), textDecoration: "none" }}
        >
          + Create email template
        </Link>
      </div>

      {loadError ? (
        <div
          role="alert"
          style={{
            padding: space[6],
            borderRadius: "8px",
            border: `1px solid ${color.dangerBorder}`,
            background: color.dangerSurface,
            color: color.dangerText,
          }}
        >
          {loadError}
        </div>
      ) : null}

      <div style={{ ...card({ elevation: "flat" }), overflow: "hidden" }}>
        {templates.length === 0 ? (
          <div style={emptyState()}>
            <div style={{ ...text.h3, color: color.textStrong }}>No email templates yet</div>
            <div>Create your first template to start building emails.</div>
            <Link
              to="/app/settings/email-templates/new"
              style={{ ...button("secondary", "md"), textDecoration: "none", marginTop: space[4] }}
            >
              Create email template
            </Link>
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <div style={{ minWidth: "900px" }}>
              <div style={tableHead(COLUMNS)} role="row">
                <span>Template name</span>
                <span>Subject</span>
                <span>Status</span>
                <span>Updated</span>
                <span style={{ textAlign: "right" }}>Actions</span>
              </div>

              {templates.map((template) => {
                const busy = busyId === template.id;
                return (
                  <div key={template.id} role="row" style={tableRow(COLUMNS)}>
                    <Link
                      to={`/app/settings/email-templates/${template.id}`}
                      style={{
                        ...text.body,
                        fontWeight: fontWeight.semibold,
                        color: color.textStrong,
                        textDecoration: "none",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {template.name}
                    </Link>
                    <span
                      title={template.subject}
                      style={{
                        ...text.body,
                        color: color.text,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {template.subject}
                    </span>
                    <span>
                      <span style={badge(template.status === "active" ? "success" : "neutral")}>
                        {template.status === "active" ? "ACTIVE" : "DRAFT"}
                      </span>
                    </span>
                    <span style={{ ...text.bodySm, color: color.textMuted }}>
                      {formatDate(template.updatedAt)}
                    </span>
                    <div style={{ display: "flex", gap: space[3], justifyContent: "flex-end" }}>
                      <button
                        type="button"
                        style={button("secondary", "sm")}
                        onClick={() => navigate(`/app/settings/email-templates/${template.id}`)}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        style={button("secondary", "sm", { disabled: busy })}
                        disabled={busy}
                        onClick={() => run("duplicate", template.id)}
                      >
                        {busy && busyIntent === "duplicate" ? "Copying…" : "Duplicate"}
                      </button>
                      <button
                        type="button"
                        style={button("secondary", "sm")}
                        onClick={() => setPreviewing(template)}
                      >
                        Preview
                      </button>
                      <button
                        type="button"
                        style={button("danger", "sm", { disabled: busy })}
                        disabled={busy}
                        onClick={() => setDeleting(template)}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {previewing ? (
        <PreviewModal
          doc={previewing.content}
          name={previewing.name}
          shop={shop}
          onClose={() => setPreviewing(null)}
        />
      ) : null}

      {deleting ? (
        <div
          role="presentation"
          style={{ ...modalOverlay(), zIndex: zIndex.modal }}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && busyIntent !== "delete") setDeleting(null);
          }}
        >
          <div role="alertdialog" aria-modal="true" aria-labelledby="mq-delete-title" style={modalPanel()}>
            <div style={{ padding: space[7] }}>
              <h3 id="mq-delete-title" style={{ margin: 0, ...text.h3, color: color.textStrong }}>
                Delete this email template?
              </h3>
              <p style={{ margin: `${space[4]} 0 0`, ...text.body, color: color.textMuted }}>
                &ldquo;{deleting.name}&rdquo; will be permanently deleted. This cannot be undone.
              </p>
            </div>
            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                gap: space[4],
                padding: `${space[5]} ${space[7]}`,
                borderTop: `1px solid ${color.borderSubtle}`,
                background: color.surfaceSunken,
              }}
            >
              <button
                type="button"
                style={button("secondary", "md")}
                disabled={busyIntent === "delete"}
                onClick={() => setDeleting(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                style={button("danger", "md", { disabled: busyIntent === "delete" })}
                disabled={busyIntent === "delete"}
                onClick={() => run("delete", deleting.id)}
              >
                {busyIntent === "delete" ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
