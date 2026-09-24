/* ============================================================
   SETTINGS > EMAIL TEMPLATES > BUILDER

   /app/settings/email-templates/new   create
   /app/settings/email-templates/:id   edit

   GET   loader         load one template this shop owns
   POST  intent=save    create (id "new") or update
   POST  intent=delete  delete, then back to the list

   The browser sends the whole template JSON on save; the server
   re-parses and re-validates it (models/email-template.server)
   before anything is written.
   ============================================================ */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import {
  Link,
  useActionData,
  useBlocker,
  useLoaderData,
  useNavigate,
  useNavigation,
  useParams,
  useSubmit,
} from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";

import { button, modalOverlay, modalPanel } from "../design/styles";
import { color, space, text, zIndex } from "../design/tokens";
import {
  EmailBuilder,
  type SavedSignal,
} from "../email-builder/components/EmailBuilder";
import { PreviewModal } from "../email-builder/components/Preview";
import { defaultTemplate } from "../email-builder/schema";
import type { Draft } from "../email-builder/state";
import type { ValidationError } from "../email-builder/validate";
import {
  deleteEmailTemplate,
  getEmailTemplate,
  saveEmailTemplate,
  type EmailTemplateRecord,
} from "../models/email-template.server";
import { authenticate } from "../shopify.server";

const LIST = "/app/settings/email-templates";

export async function loader({ request, params }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const id = params.templateId ?? "new";

  if (id === "new") {
    return { shop: session.shop, template: null, notFound: false };
  }

  const template = await getEmailTemplate(session.shop, id);
  return { shop: session.shop, template, notFound: !template };
}

type ActionResult =
  | { ok: true; intent: "save"; created: boolean; template: EmailTemplateRecord }
  | { ok: true; intent: "delete" }
  | { ok: false; intent: string; error: string; errors: ValidationError[] };

export async function action({ request, params }: ActionFunctionArgs): Promise<ActionResult> {
  const { session } = await authenticate.admin(request);
  const id = params.templateId ?? "new";
  const formData = await request.formData();
  const intent = String(formData.get("intent") || "");

  try {
    if (intent === "save") {
      const result = await saveEmailTemplate(session.shop, {
        id: id === "new" ? null : id,
        name: formData.get("name"),
        status: formData.get("status"),
        content: String(formData.get("content") || ""),
      });
      return result.ok
        ? { ok: true, intent: "save", created: id === "new", template: result.template }
        : { ok: false, intent, error: result.error, errors: result.errors };
    }

    if (intent === "delete" && id !== "new") {
      const deleted = await deleteEmailTemplate(session.shop, id);
      return deleted
        ? { ok: true, intent: "delete" }
        : { ok: false, intent, error: "Template not found.", errors: [] };
    }

    return { ok: false, intent, error: "Unknown action.", errors: [] };
  } catch (error) {
    console.error(`EMAIL TEMPLATE ${intent.toUpperCase()} ERROR:`, error);
    return {
      ok: false,
      intent,
      error: "The template could not be saved because of a server error. Your changes are still here; please try again.",
      errors: [],
    };
  }
}

function toDraft(template: EmailTemplateRecord): Draft {
  return { name: template.name, status: template.status, doc: template.content };
}

export default function EmailTemplateEditor() {
  const { template, shop, notFound } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const navigate = useNavigate();
  const submit = useSubmit();
  const shopify = useAppBridge();
  const { templateId = "new" } = useParams();

  const [saved, setSaved] = useState<SavedSignal>(null);
  const [previewDraft, setPreviewDraft] = useState<Draft | null>(null);

  const dirtyRef = useRef(false);
  const bypassRef = useRef(false);

  const saving =
    navigation.state !== "idle" && navigation.formData?.get("intent") === "save";

  /* Built once per template; the builder owns the state after. */
  const initial = useMemo<Draft>(
    () =>
      template
        ? toDraft(template)
        : { name: "Untitled template", status: "draft", doc: defaultTemplate() },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [template?.id],
  );

  /* ---------------- unsaved changes ---------------- */

  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      dirtyRef.current &&
      !bypassRef.current &&
      currentLocation.pathname !== nextLocation.pathname,
  );

  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!dirtyRef.current) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, []);

  const onDirtyChange = useCallback((dirty: boolean) => {
    dirtyRef.current = dirty;
  }, []);

  /* ---------------- save results ---------------- */

  useEffect(() => {
    if (!actionData) return;

    if (actionData.ok && actionData.intent === "save") {
      shopify.toast.show(actionData.created ? "Template created" : "Template saved");
      dirtyRef.current = false;
      if (actionData.created) {
        /* Move from /new to the real id so the next save updates
           this row instead of creating another. */
        bypassRef.current = true;
        navigate(`${LIST}/${actionData.template.id}`, { replace: true });
        return;
      }
      setSaved({ draft: toDraft(actionData.template), at: Date.now() });
    } else if (!actionData.ok) {
      shopify.toast.show(actionData.error, { isError: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actionData]);

  useEffect(() => {
    bypassRef.current = false;
  }, [templateId]);

  const onSave = (draft: Draft) => {
    const formData = new FormData();
    formData.append("intent", "save");
    formData.append("name", draft.name);
    formData.append("status", draft.status);
    formData.append("content", JSON.stringify(draft.doc));
    submit(formData, { method: "post" });
  };

  if (notFound) {
    return (
      <div style={{ padding: space[9], textAlign: "center" }}>
        <h2 style={{ margin: 0, ...text.h2, color: color.textStrong }}>Template not found</h2>
        <p style={{ ...text.body, color: color.textMuted }}>
          It may have been deleted, or it belongs to a different store.
        </p>
        <Link to={LIST} style={{ ...button("secondary", "md"), textDecoration: "none" }}>
          Back to email templates
        </Link>
      </div>
    );
  }

  const failed = actionData && !actionData.ok ? actionData : null;

  return (
    <>
      <EmailBuilder
        key={template?.id ?? "new"}
        initial={initial}
        isNew={!template}
        shop={shop}
        saving={saving}
        saved={saved}
        serverError={failed?.error ?? null}
        serverErrors={failed?.errors ?? []}
        backTo={LIST}
        onBack={() => navigate(LIST)}
        onSave={onSave}
        onDirtyChange={onDirtyChange}
        onPreview={setPreviewDraft}
        onNotify={(message, isError) => shopify.toast.show(message, { isError: !!isError })}
      />

      {previewDraft ? (
        <PreviewModal
          doc={previewDraft.doc}
          name={previewDraft.name || "Untitled template"}
          shop={shop}
          onClose={() => setPreviewDraft(null)}
        />
      ) : null}

      {blocker.state === "blocked" ? (
        <div style={{ ...modalOverlay(), zIndex: zIndex.modal }}>
          <div role="alertdialog" aria-modal="true" aria-labelledby="mq-leave-title" style={modalPanel()}>
            <div style={{ padding: space[7] }}>
              <h3 id="mq-leave-title" style={{ margin: 0, ...text.h3, color: color.textStrong }}>
                Leave without saving?
              </h3>
              <p style={{ margin: `${space[4]} 0 0`, ...text.body, color: color.textMuted }}>
                You have unsaved changes to this template. If you leave now they will be lost.
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
              <button type="button" style={button("secondary", "md")} onClick={() => blocker.reset?.()}>
                Stay
              </button>
              <button type="button" style={button("danger", "md")} onClick={() => blocker.proceed?.()}>
                Leave
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
