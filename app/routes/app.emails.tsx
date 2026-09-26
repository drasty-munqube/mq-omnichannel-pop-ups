/* ============================================================
   EMAILS (log page, like resend.com/emails)

   Every email the app has queued or sent for this shop: who it
   went to, which campaign and template, and how far it got
   (queued, sent, delivered, opened, clicked, bounced, failed).
   Delivery states come from Resend webhooks.

   GET   ?status=&q=&page=   filtered, paginated list
   POST  intent=retry        put a failed email back in the queue
   ============================================================ */

import { useEffect, useState } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import {
  Form,
  Link,
  useActionData,
  useLoaderData,
  useNavigation,
  useSubmit,
} from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";

import { badge, button, input, modalOverlay, modalPanel, tableHead, tableRow } from "../design/styles";
import { color, fontWeight, space, text, zIndex } from "../design/tokens";
import { AuditDate, stickyEnd } from "../components/audit-cells";
import { RowActions } from "../components/row-actions";
import { activeEmailProvider } from "../models/delivery.server";
import { listEmailLog, retryEmailDelivery } from "../models/email-events.server";
import {
  EMAIL_FILTERS,
  EMAIL_PAGE_SIZE,
  EMAIL_STATUS,
  canRetry,
  isEmailFilter,
  type EmailFilterKey,
} from "../models/email-status";
import { authenticate } from "../shopify.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const url = new URL(request.url);
  const statusParam = url.searchParams.get("status");
  const filter: EmailFilterKey = isEmailFilter(statusParam) ? statusParam : "all";
  const q = (url.searchParams.get("q") || "").slice(0, 200);
  const page = Math.max(1, Math.min(10_000, Number(url.searchParams.get("page")) || 1));

  const provider = activeEmailProvider();
  const setup = {
    provider,
    webhookReady: Boolean(process.env.RESEND_WEBHOOK_SECRET),
  };

  try {
    const log = await listEmailLog(session.shop, { filter, q, page });
    return { ...log, filter, q, page, setup, loadError: false };
  } catch (error) {
    console.error("EMAIL LOG ERROR:", error);
    return { total: 0, rows: [], filter, q, page, setup, loadError: true };
  }
}

export async function action({ request }: ActionFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = String(formData.get("intent") || "");
  const id = String(formData.get("deliveryId") || "").trim();

  if (intent !== "retry" || !id) {
    return { ok: false, message: "Unknown action." };
  }

  try {
    const result = await retryEmailDelivery(session.shop, id);
    return result.ok
      ? { ok: true, message: "Email queued to send again" }
      : { ok: false, message: result.error };
  } catch (error) {
    console.error("EMAIL RETRY ERROR:", error);
    return { ok: false, message: "Something went wrong. Please try again." };
  }
}

type Row = Awaited<ReturnType<typeof listEmailLog>>["rows"][number];

const COLUMNS = "minmax(200px, 1.6fr) minmax(200px, 1.6fr) 120px 110px 56px";

function StatusBadge({ status }: { status: Row["status"] }) {
  const info = EMAIL_STATUS[status];
  return <span style={badge(info.tone)}>{info.label.toUpperCase()}</span>;
}

function hrefFor(filter: string, q: string, page = 1) {
  const params = new URLSearchParams();
  if (filter !== "all") params.set("status", filter);
  if (q) params.set("q", q);
  if (page > 1) params.set("page", String(page));
  const s = params.toString();
  return `/app/emails${s ? `?${s}` : ""}`;
}

function Details({ row, onClose }: { row: Row; onClose: () => void }) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const steps: { label: string; at: string | null; bad?: boolean }[] = [
    { label: "Queued", at: row.createdAt },
    { label: "Sent", at: row.sentAt },
    { label: "Delivered", at: row.deliveredAt },
    { label: "Opened", at: row.openedAt },
    { label: "Clicked", at: row.clickedAt },
  ];
  if (row.bouncedAt) steps.push({ label: "Bounced", at: row.bouncedAt, bad: true });
  if (row.complainedAt) steps.push({ label: "Marked as spam", at: row.complainedAt, bad: true });

  return (
    <div role="presentation" style={{ ...modalOverlay(), zIndex: zIndex.modal }} onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="mq-email-title"
        style={{ ...modalPanel(), maxWidth: "560px", width: "calc(100% - 32px)" }}
        onClick={(event) => event.stopPropagation()}
      >
        <div style={{ padding: space[7], display: "grid", gap: space[5] }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: space[4], alignItems: "flex-start" }}>
            <div style={{ minWidth: 0 }}>
              <h3 id="mq-email-title" style={{ margin: 0, ...text.h3, color: color.textStrong, overflowWrap: "anywhere" }}>
                {row.subject || "Discount email"}
              </h3>
              <div style={{ ...text.body, color: color.textMuted, marginTop: space[2], overflowWrap: "anywhere" }}>
                To {row.to}
              </div>
            </div>
            <StatusBadge status={row.status} />
          </div>

          <dl style={{ margin: 0, display: "grid", gridTemplateColumns: "120px 1fr", rowGap: space[3], columnGap: space[4], ...text.body }}>
            <dt style={{ color: color.textMuted }}>Campaign</dt>
            <dd style={{ margin: 0, color: color.text }}>{row.campaignName || "—"}</dd>
            <dt style={{ color: color.textMuted }}>Template</dt>
            <dd style={{ margin: 0, color: color.text }}>{row.templateName || "Built-in coupon email"}</dd>
            <dt style={{ color: color.textMuted }}>Sent with</dt>
            <dd style={{ margin: 0, color: color.text, textTransform: "capitalize" }}>{row.provider || "—"}</dd>
            <dt style={{ color: color.textMuted }}>Attempts</dt>
            <dd style={{ margin: 0, color: color.text }}>{row.attempts}</dd>
          </dl>

          <div>
            <div style={{ ...text.eyebrow, color: color.textSubtle, marginBottom: space[3] }}>Timeline</div>
            <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: space[3] }}>
              {steps.map((step) => (
                <li key={step.label} style={{ display: "grid", gridTemplateColumns: "14px 1fr auto", gap: space[4], alignItems: "center" }}>
                  <span
                    aria-hidden
                    style={{
                      width: "10px",
                      height: "10px",
                      borderRadius: "999px",
                      background: step.at ? (step.bad ? color.dangerText : color.successText) : color.borderStrong,
                    }}
                  />
                  <span style={{ ...text.body, color: step.at ? color.textStrong : color.textMuted, fontWeight: step.at ? fontWeight.medium : undefined }}>
                    {step.label}
                  </span>
                  {step.at ? <AuditDate value={step.at} /> : <span style={{ ...text.bodySm, color: color.textMuted }}>Not yet</span>}
                </li>
              ))}
            </ol>
          </div>

          {row.error ? (
            <div role="note" style={{ padding: space[5], borderRadius: "10px", background: color.dangerSurface, color: color.dangerText, ...text.body, overflowWrap: "anywhere" }}>
              {row.error}
            </div>
          ) : null}
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", padding: `${space[5]} ${space[7]}`, borderTop: `1px solid ${color.borderSubtle}`, background: color.surfaceSunken }}>
          <button type="button" style={button("secondary", "md")} onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

export default function EmailsPage() {
  const { rows, total, filter, q, page, setup, loadError } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const submit = useSubmit();
  const shopify = useAppBridge();
  const [viewing, setViewing] = useState<Row | null>(null);

  const retryingId =
    navigation.state === "submitting" ? String(navigation.formData?.get("deliveryId") || "") : "";

  useEffect(() => {
    if (actionData) shopify.toast.show(actionData.message, { isError: !actionData.ok });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actionData]);

  const retry = (id: string) => {
    const formData = new FormData();
    formData.append("intent", "retry");
    formData.append("deliveryId", id);
    submit(formData, { method: "post" });
  };

  const pages = Math.max(1, Math.ceil(total / EMAIL_PAGE_SIZE));

  return (
    <s-page heading="Emails" inlineSize="large">
      <s-section>
        <p style={{ margin: `0 0 ${space[5]}`, ...text.body, color: color.textMuted }}>
          Every discount email sent to shoppers, and how far it got.
        </p>

        {!setup.provider ? (
          <div role="note" style={{ marginBottom: space[5], padding: space[5], borderRadius: "10px", background: color.warningSurface, color: color.warningText, ...text.body }}>
            Email sending is not set up. Add RESEND_API_KEY, MAIL_FROM and EMAIL_PROVIDER=resend to the app&apos;s environment.
          </div>
        ) : setup.provider === "resend" && !setup.webhookReady ? (
          <div role="note" style={{ marginBottom: space[5], padding: space[5], borderRadius: "10px", background: color.infoSurface, color: color.infoText, ...text.body }}>
            Emails are sending. To see Delivered, Opened, Clicked and Bounced here, add a Resend webhook for /webhooks/resend and set RESEND_WEBHOOK_SECRET.
          </div>
        ) : null}

        <div style={{ display: "flex", gap: space[4], flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", marginBottom: space[5] }}>
          <nav aria-label="Filter emails" style={{ display: "flex", gap: space[2], flexWrap: "wrap" }}>
            {EMAIL_FILTERS.map((f) => (
              <Link
                key={f.key}
                to={hrefFor(f.key, q)}
                aria-current={filter === f.key ? "page" : undefined}
                style={{
                  ...button(filter === f.key ? "primary" : "secondary", "sm"),
                  textDecoration: "none",
                }}
              >
                {f.label}
              </Link>
            ))}
          </nav>
          <Form method="get" role="search" style={{ display: "flex", gap: space[3], flex: "1 1 220px", maxWidth: "360px" }}>
            {filter !== "all" ? <input type="hidden" name="status" value={filter} /> : null}
            <input
              name="q"
              type="search"
              defaultValue={q}
              placeholder="Search by email"
              aria-label="Search by email"
              style={{ ...input(), flex: 1, minWidth: 0 }}
            />
            <button type="submit" style={button("secondary", "md")}>Search</button>
          </Form>
        </div>

        {loadError ? (
          <p style={{ ...text.body, color: color.dangerText }}>Emails could not be loaded. Please refresh the page.</p>
        ) : rows.length === 0 ? (
          <div style={{ padding: `${space[9]} ${space[6]}`, textAlign: "center", border: `1px dashed ${color.borderStrong}`, borderRadius: "12px" }}>
            <div style={{ ...text.h4, color: color.textStrong }}>
              {filter === "all" && !q ? "No emails yet" : "No emails match"}
            </div>
            <div style={{ ...text.body, color: color.textMuted, marginTop: space[3] }}>
              {filter === "all" && !q
                ? "When a shopper signs up through a campaign with a reward, their discount email shows up here."
                : "Try another filter or search."}
            </div>
          </div>
        ) : (
          <div style={{ overflowX: "auto", border: `1px solid ${color.border}`, borderRadius: "12px" }}>
            <div style={{ minWidth: "780px" }}>
              <div style={tableHead(COLUMNS)}>
                <span>To</span>
                <span>Subject</span>
                <span>Status</span>
                <span>Date</span>
                <span style={stickyEnd(color.surfaceSunken)}>Actions</span>
              </div>
              {rows.map((row) => {
                const actions = [{ label: "View details", onSelect: () => setViewing(row) }];
                if (canRetry(row.status)) {
                  actions.push({
                    label: retryingId === row.id ? "Sending…" : "Send again",
                    onSelect: () => retry(row.id),
                  });
                }
                return (
                  <div key={row.id} style={tableRow(COLUMNS)}>
                    <div style={{ minWidth: 0 }}>
                      <button
                        type="button"
                        onClick={() => setViewing(row)}
                        title={row.to}
                        style={{ all: "unset", cursor: "pointer", display: "block", maxWidth: "100%", ...text.body, fontWeight: fontWeight.semibold, color: color.textStrong, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                      >
                        {row.to}
                      </button>
                      <div style={{ ...text.bodySm, color: color.textMuted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {row.campaignName || "Deleted campaign"}
                      </div>
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div title={row.subject || ""} style={{ ...text.body, color: color.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {row.subject || (row.status === "queued" ? "Waiting to send" : "—")}
                      </div>
                      <div style={{ ...text.bodySm, color: color.textMuted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {row.templateName || "Built-in coupon email"}
                      </div>
                    </div>
                    <span>
                      <StatusBadge status={row.status} />
                    </span>
                    <AuditDate value={row.sentAt || row.createdAt} />
                    <div style={stickyEnd(color.surface)}>
                      <RowActions name={row.to} actions={actions} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {pages > 1 ? (
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: space[4], marginTop: space[5], flexWrap: "wrap" }}>
            <span style={{ ...text.bodySm, color: color.textMuted }}>
              Page {page} of {pages} · {total} emails
            </span>
            <div style={{ display: "flex", gap: space[3] }}>
              {page > 1 ? (
                <Link to={hrefFor(filter, q, page - 1)} style={{ ...button("secondary", "sm"), textDecoration: "none" }}>
                  Previous
                </Link>
              ) : null}
              {page < pages ? (
                <Link to={hrefFor(filter, q, page + 1)} style={{ ...button("secondary", "sm"), textDecoration: "none" }}>
                  Next
                </Link>
              ) : null}
            </div>
          </div>
        ) : null}
      </s-section>

      {viewing ? <Details row={viewing} onClose={() => setViewing(null)} /> : null}
    </s-page>
  );
}
