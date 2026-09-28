/* ============================================================
   LOGS > ONE EMAIL (/app/emails/:deliveryId)

   Subject, from, to, sent time, status, and the live Timeline of
   every event Resend reported for this email.

   Events arrive through the Resend webhook (/webhooks/resend) and
   are stored per email. While this page is open and visible it
   re-reads them every 5 seconds (from our database only). Resend
   itself is asked at most once a minute, to backfill older emails
   and catch a missed webhook. The API key stays on the server.

   GET   loader           email, events, latest status from Resend
   POST  intent=sync      ask Resend now (Refresh)
   POST  intent=retry     put a failed email back in the queue
   ============================================================ */

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { Link, useActionData, useLoaderData, useRevalidator, useSubmit, useNavigation } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";

import { AuditDate } from "../components/audit-cells";
import { CopyButton } from "../components/copy-snippet";
import { Breadcrumbs, Notice } from "../components/domain-ui";
import { EmailTimeline } from "../components/email-timeline";
import { badge, button, card } from "../design/styles";
import { color, fontFamily, space, text } from "../design/tokens";
import { getEmailDetail, retryEmailDelivery } from "../models/email-events.server";
import { EMAIL_STATUS, canRetry } from "../models/email-status";
import { buildTimeline, eventMeta, isFinalEvent } from "../models/email-timeline";
import { authenticate } from "../shopify.server";

const POLL_MS = 5_000;

export async function loader({ request, params }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const webhookReady = Boolean(process.env.RESEND_WEBHOOK_SECRET);
  try {
    const detail = await getEmailDetail(session.shop, String(params.deliveryId || ""));
    if (!detail) return { detail: null, webhookReady, loadError: false, loadedAt: new Date().toISOString() };
    return { detail, webhookReady, loadError: false, loadedAt: new Date().toISOString() };
  } catch (error) {
    console.error("EMAIL DETAIL ERROR:", error);
    return { detail: null, webhookReady, loadError: true, loadedAt: new Date().toISOString() };
  }
}

export async function action({ request, params }: ActionFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const id = String(params.deliveryId || "");
  const form = await request.formData();
  const intent = String(form.get("intent") || "");

  try {
    if (intent === "sync") {
      const detail = await getEmailDetail(session.shop, id, { sync: "force" });
      if (!detail) return { ok: false, message: "Email not found." };
      return detail.syncError
        ? { ok: false, message: detail.syncError }
        : { ok: true, message: detail.email.provider === "resend" ? "Checked with Resend" : "Refreshed" };
    }
    if (intent === "retry") {
      const result = await retryEmailDelivery(session.shop, id);
      return result.ok ? { ok: true, message: "Email queued to send again" } : { ok: false, message: result.error };
    }
  } catch (error) {
    console.error("EMAIL DETAIL ACTION ERROR:", error);
    return { ok: false, message: "Something went wrong. Please try again." };
  }
  return { ok: false, message: "Unknown action." };
}

function DetailRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <dt style={{ color: color.textMuted }}>{label}</dt>
      <dd style={{ margin: 0, color: color.textStrong, minWidth: 0, overflowWrap: "anywhere" }}>{children}</dd>
    </>
  );
}

function useLivePolling(active: boolean) {
  const revalidator = useRevalidator();
  const ref = useRef(revalidator);
  ref.current = revalidator;
  useEffect(() => {
    if (!active) return;
    const tick = () => {
      if (document.visibilityState === "visible" && ref.current.state === "idle") ref.current.revalidate();
    };
    const timer = window.setInterval(tick, POLL_MS);
    const onVisible = () => document.visibilityState === "visible" && tick();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [active]);
  return revalidator;
}

export default function EmailDetailPage() {
  const { detail, webhookReady, loadError, loadedAt } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const submit = useSubmit();
  const shopify = useAppBridge();

  /* Queued emails and ones still in flight change most; a failed
     or bounced email can still get late events, so keep polling
     everything while the page is open. */
  const revalidator = useLivePolling(Boolean(detail) && !loadError);
  const busyIntent = navigation.state === "submitting" ? String(navigation.formData?.get("intent") || "") : "";

  useEffect(() => {
    if (actionData) shopify.toast.show(actionData.message, { isError: !actionData.ok });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actionData]);

  const [clock, setClock] = useState<string | null>(null);
  useEffect(() => setClock(new Date(loadedAt).toLocaleTimeString()), [loadedAt]);

  const entries = useMemo(() => (detail ? buildTimeline(detail.email, detail.events) : []), [detail]);

  const post = (intent: string) => {
    const form = new FormData();
    form.append("intent", intent);
    submit(form, { method: "post" });
  };

  const crumbs = (label: string) => <Breadcrumbs items={[{ label: "Logs", to: "/app/emails" }, { label }]} />;

  if (loadError) {
    return (
      <s-page heading="Logs" inlineSize="large">
        <s-section>
          {crumbs("Email")}
          <Notice
            tone="danger"
            action={
              <button type="button" style={button("secondary", "sm")} onClick={() => revalidator.revalidate()}>
                Try again
              </button>
            }
          >
            This email could not be loaded. Please try again.
          </Notice>
        </s-section>
      </s-page>
    );
  }

  if (!detail) {
    return (
      <s-page heading="Logs" inlineSize="large">
        <s-section>
          {crumbs("Email")}
          <div style={{ padding: `${space[10]} ${space[6]}`, textAlign: "center", border: `1px dashed ${color.borderStrong}`, borderRadius: "12px" }}>
            <div style={{ ...text.h4, color: color.textStrong }}>Email not found</div>
            <p style={{ margin: `${space[3]} 0 ${space[6]}`, ...text.body, color: color.textMuted }}>
              It may have been removed, or it belongs to another store.
            </p>
            <Link to="/app/emails" style={{ ...button("secondary", "md"), textDecoration: "none" }}>
              Back to Logs
            </Link>
          </div>
        </s-section>
      </s-page>
    );
  }

  const { email, apiLastEvent, syncError } = detail;
  const status = EMAIL_STATUS[email.status];
  const providerEvents = entries.filter((e) => e.type !== "queued");
  const viaResend = email.provider === "resend";
  const apiAhead =
    apiLastEvent && !entries.some((e) => e.type.replace(/^email\./, "").replace("delivery_delayed", "delayed") === apiLastEvent);

  return (
    <s-page heading="Logs" inlineSize="large">
      <s-section>
        {crumbs(email.subject || "Email")}

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: space[6], flexWrap: "wrap", marginBottom: space[6] }}>
          <div style={{ minWidth: 0, flex: "1 1 320px" }}>
            <div style={{ display: "flex", gap: space[4], alignItems: "center", flexWrap: "wrap" }}>
              <h2 style={{ margin: 0, ...text.h2, color: color.textStrong, overflowWrap: "anywhere" }}>
                {email.subject || (email.status === "queued" ? "Waiting to send" : "Discount email")}
              </h2>
              <span style={badge(status.tone)}>{status.label.toUpperCase()}</span>
            </div>
            <div style={{ ...text.bodySm, color: color.textMuted, marginTop: space[3], display: "flex", alignItems: "center", gap: space[3] }}>
              <span
                aria-hidden
                style={{ width: "8px", height: "8px", borderRadius: "999px", background: isFinalEvent(email.lastEvent) ? color.borderStrong : color.successSolid }}
              />
              <span aria-live="polite">
                {revalidator.state === "loading" ? "Updating…" : `Live · updated ${clock ?? ""}`}
              </span>
            </div>
          </div>
          <div style={{ display: "flex", gap: space[4], flexWrap: "wrap" }}>
            <Link to="/app/emails" style={{ ...button("secondary", "md"), textDecoration: "none" }}>
              Back
            </Link>
            <button
              type="button"
              style={button("secondary", "md", { disabled: Boolean(busyIntent) })}
              disabled={Boolean(busyIntent)}
              onClick={() => post("sync")}
            >
              {busyIntent === "sync" ? "Refreshing…" : "Refresh"}
            </button>
            {canRetry(email.status) ? (
              <button
                type="button"
                style={button("primary", "md", { disabled: Boolean(busyIntent) })}
                disabled={Boolean(busyIntent)}
                onClick={() => post("retry")}
              >
                {busyIntent === "retry" ? "Sending…" : "Send again"}
              </button>
            ) : null}
          </div>
        </div>

        {viaResend && !webhookReady ? (
          <Notice tone="info">
            Live events need the Resend webhook. Add a webhook for /webhooks/resend in Resend and set RESEND_WEBHOOK_SECRET.
            Until then only the latest status from Resend is shown.
          </Notice>
        ) : null}
        {syncError ? <Notice tone="warning">{syncError}</Notice> : null}
        {apiAhead ? (
          <Notice tone="info">
            Resend reports this email as <strong>{eventMeta(`email.${apiLastEvent === "delayed" ? "delivery_delayed" : apiLastEvent}`).label}</strong>.
            That event is not in the timeline yet. It appears when its webhook arrives, or when you replay it from the Resend
            dashboard.
          </Notice>
        ) : null}
        {email.error ? <Notice tone="danger">{email.error}</Notice> : null}

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: space[6], alignItems: "start" }}>
          <div style={{ ...card({ padding: 7 }) }}>
            <h3 style={{ margin: `0 0 ${space[5]}`, ...text.h4, color: color.textStrong }}>Details</h3>
            <dl style={{ margin: 0, display: "grid", gridTemplateColumns: "110px minmax(0, 1fr)", rowGap: space[4], columnGap: space[4], ...text.body }}>
              <DetailRow label="From">{email.from || "—"}</DetailRow>
              <DetailRow label="To">{email.to}</DetailRow>
              <DetailRow label="Sent">{email.sentAt ? <AuditDate value={email.sentAt} /> : "Not sent yet"}</DetailRow>
              <DetailRow label="Status">
                <span style={badge(status.tone)}>{status.label.toUpperCase()}</span>
              </DetailRow>
              <DetailRow label="Campaign">{email.campaignName || "Deleted campaign"}</DetailRow>
              <DetailRow label="Template">{email.templateName || "Built-in coupon email"}</DetailRow>
              <DetailRow label="Sent with">
                <span style={{ textTransform: "capitalize" }}>{email.provider || "—"}</span>
              </DetailRow>
              <DetailRow label="Attempts">{email.attempts}</DetailRow>
              {email.providerId ? (
                <DetailRow label="Resend ID">
                  <span style={{ display: "flex", gap: space[3], alignItems: "center", minWidth: 0 }}>
                    <code style={{ fontFamily: fontFamily.mono, fontSize: "12px", overflowWrap: "anywhere", minWidth: 0 }}>{email.providerId}</code>
                    <CopyButton value={email.providerId} label="Copy" compact ariaLabel="Copy Resend ID" />
                  </span>
                </DetailRow>
              ) : null}
            </dl>
          </div>

          <div style={{ ...card({ padding: 7 }) }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: space[4], marginBottom: space[5] }}>
              <h3 style={{ margin: 0, ...text.h4, color: color.textStrong }}>Timeline</h3>
              <span style={{ ...text.bodySm, color: color.textMuted }}>
                {providerEvents.length} event{providerEvents.length === 1 ? "" : "s"}
              </span>
            </div>
            {providerEvents.length === 0 ? (
              <div style={{ padding: `${space[6]} ${space[5]}`, marginBottom: space[6], textAlign: "center", border: `1px dashed ${color.borderStrong}`, borderRadius: "10px" }}>
                <div style={{ ...text.h4, color: color.textStrong }}>No events yet</div>
                <div style={{ ...text.bodySm, color: color.textMuted, marginTop: space[2] }}>
                  {email.status === "queued"
                    ? "The email is waiting to send. Events show up here as soon as Resend reports them."
                    : viaResend
                      ? "Events show up here as soon as Resend reports them."
                      : "This email was not sent through Resend, so only the app's own steps are shown."}
                </div>
              </div>
            ) : null}
            <EmailTimeline entries={entries} />
          </div>
        </div>
      </s-section>
    </s-page>
  );
}
