/* ============================================================
   LOGS (email log page, like resend.com/emails)

   Shown as "Logs" in the app menu. The URL stays /app/emails so
   existing links and bookmarks keep working.

   Every email the app has queued or sent for this shop: who it
   went to, which campaign and template, and how far it got
   (queued, sent, delivered, opened, clicked, bounced, failed).
   Delivery states come from Resend webhooks.

   Each row opens that email's page with its live Timeline
   (app.emails.$deliveryId.tsx).

   GET   ?status=&q=&page=   filtered, paginated list
   POST  intent=retry        put a failed email back in the queue
   ============================================================ */

import { useEffect } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import {
  Form,
  Link,
  useActionData,
  useLoaderData,
  useNavigate,
  useNavigation,
  useSubmit,
} from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";

import { badge, button, input, tableHead, tableRow } from "../design/styles";
import { color, fontWeight, layout, space, text } from "../design/tokens";
import { AuditDate, stickyEnd } from "../components/audit-cells";
import { RowActions } from "../components/row-actions";
import { activeEmailProvider } from "../models/delivery.server";
import { listEmailLog, retryEmailDelivery } from "../models/email-events.server";
import {
  EMAIL_FILTERS,
  EMAIL_PAGE_SIZE,
  EMAIL_STATUS,
  canRetry,
  emailPath,
  isEmailFilter,
  type EmailFilterKey,
} from "../models/email-status";
import { authenticate } from "../shopify.server";
import { ChevronLeft, ChevronRight, Search } from "lucide-react";
import { IconButton } from "../components/icon-button";
import { SearchField } from "../components/search-field";

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

export default function EmailsPage() {
  const { rows, total, filter, q, page, setup, loadError } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const submit = useSubmit();
  const shopify = useAppBridge();
  const navigate = useNavigate();
  /* Loading state while an email's page opens. */
  const openingEmail = navigation.state === "loading" && /^\/app\/emails\/[^/]+$/.test(navigation.location?.pathname || "");

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
    <s-page heading="Logs" inlineSize="large">
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
            <SearchField
              name="q"
              defaultValue={q}
              placeholder="Search by email"
              aria-label="Search by email"
              style={{ ...input(), flex: 1, minWidth: 0 }}
            />
            <IconButton type="submit" icon={Search} label="Search" />
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
          <div
            aria-busy={openingEmail}
            style={{ overflowX: "auto", border: `1px solid ${color.border}`, borderRadius: "12px", opacity: openingEmail ? 0.6 : 1, transition: "opacity 150ms" }}
          >
            <div style={{ minWidth: "780px" }}>
              <div style={tableHead(COLUMNS)}>
                <span>To</span>
                <span>Subject</span>
                <span>Status</span>
                <span>Date</span>
                <span style={stickyEnd(color.surfaceSunken)}>Actions</span>
              </div>
              {rows.map((row) => {
                const actions = [{ label: "View timeline", onSelect: () => navigate(emailPath(row.id)) }];
                if (canRetry(row.status)) {
                  actions.push({
                    label: retryingId === row.id ? "Sending…" : "Send again",
                    onSelect: () => retry(row.id),
                  });
                }
                return (
                  <div key={row.id} style={tableRow(COLUMNS)}>
                    <div style={{ minWidth: 0 }}>
                      <Link
                        to={emailPath(row.id)}
                        title={row.to}
                        style={{ display: "block", maxWidth: "100%", ...text.body, fontWeight: fontWeight.semibold, color: color.textStrong, textDecoration: "none", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                      >
                        {row.to}
                      </Link>
                      <div style={{ ...text.bodySm, color: color.textMuted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {row.campaignName || "Deleted campaign"}
                      </div>
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <Link to={emailPath(row.id)} title={row.subject || ""} style={{ display: "block", ...text.body, color: color.text, textDecoration: "none", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {row.subject || (row.status === "queued" ? "Waiting to send" : "—")}
                      </Link>
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
                <Link to={hrefFor(filter, q, page - 1)} aria-label="Previous page" title="Previous page" style={{ ...button("secondary", "sm"), width: layout.controlSm, boxSizing: "border-box", padding: 0, textDecoration: "none" }}>
                  <ChevronLeft aria-hidden size={16} strokeWidth={2} />
                </Link>
              ) : null}
              {page < pages ? (
                <Link to={hrefFor(filter, q, page + 1)} aria-label="Next page" title="Next page" style={{ ...button("secondary", "sm"), width: layout.controlSm, boxSizing: "border-box", padding: 0, textDecoration: "none" }}>
                  <ChevronRight aria-hidden size={16} strokeWidth={2} />
                </Link>
              ) : null}
            </div>
          </div>
        ) : null}
      </s-section>

    </s-page>
  );
}
