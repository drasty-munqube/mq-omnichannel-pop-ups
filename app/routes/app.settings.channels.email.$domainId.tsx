/* ============================================================
   SETTINGS > CHANNELS > EMAIL > ONE DOMAIN

   Header (name, status, region, created date), then two tabs:

     Records        the DNS records exactly as Resend returns
                    them, each value with a copy button, plus a
                    recommended DMARC record.
     Configuration  TLS mode and open / click tracking.

   While Resend is still checking (status pending) the page
   re-reads the domain every 10 seconds for up to 5 minutes.
   Refresh re-reads it on demand.

   GET   loader           live domain from Resend (cache refreshed)
   POST  intent=verify    ask Resend to check the DNS records
   POST  intent=update    save configuration
   POST  intent=delete    delete in Resend and here, back to list
   ============================================================ */

import { useEffect, useMemo, useRef, useState } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import {
  redirect,
  useActionData,
  useLoaderData,
  useNavigation,
  useRevalidator,
  useSearchParams,
  useSubmit,
} from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";

import { AuditDate } from "../components/audit-cells";
import { CopyButton } from "../components/copy-snippet";
import {
  Breadcrumbs,
  ConfirmDialog,
  DomainStatusBadge,
  EMAIL_CHANNEL_PATH,
  Notice,
} from "../components/domain-ui";
import { button, card, fieldHint, fieldLabel, input } from "../design/styles";
import { color, fontFamily, fontWeight, radius, space, text } from "../design/tokens";
import {
  dmarcRecommendation,
  isChecking,
  recordGroup,
  regionLabel,
  statusMeta,
  type DomainRecord,
  type TlsMode,
} from "../models/email-domain";
import {
  deleteShopDomain,
  friendlyError,
  getCachedShopDomain,
  getShopDomain,
  updateShopDomain,
  verifyShopDomain,
} from "../models/email-domains.server";
import { authenticate } from "../shopify.server";

const POLL_MS = 10_000;
const POLL_FOR_MS = 5 * 60_000;

export async function loader({ request, params }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const id = String(params.domainId || "");

  try {
    const detail = await getShopDomain(session.shop, id);
    if (detail.kind === "missing") throw new Response("Domain not found", { status: 404 });
    if (detail.kind === "gone") {
      throw redirect(`${EMAIL_CHANNEL_PATH}?gone=${encodeURIComponent(detail.name)}`);
    }
    const d = detail.domain;
    return {
      row: detail.row,
      live: {
        records: d.records,
        openTracking: Boolean(d.open_tracking),
        clickTracking: Boolean(d.click_tracking),
        trackingSubdomain: d.tracking_subdomain || "",
      },
      error: null as string | null,
    };
  } catch (error) {
    if (error instanceof Response) throw error;
    const row = await getCachedShopDomain(session.shop, id);
    if (!row) throw new Response("Domain not found", { status: 404 });
    return { row, live: null, error: friendlyError(error, "DETAIL") };
  }
}

export async function action({ request, params }: ActionFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const id = String(params.domainId || "");
  const form = await request.formData();
  const intent = String(form.get("intent") || "");

  try {
    if (intent === "verify") {
      const result = await verifyShopDomain(session.shop, id);
      return result.ok
        ? { ok: true, message: "Checking DNS records. This page updates on its own." }
        : { ok: false, message: result.error };
    }

    if (intent === "update") {
      const tls = String(form.get("tls") || "");
      const result = await updateShopDomain(session.shop, id, {
        tls: tls === "enforced" ? "enforced" : tls === "opportunistic" ? "opportunistic" : undefined,
        open_tracking: form.get("open_tracking") === "on",
        click_tracking: form.get("click_tracking") === "on",
        tracking_subdomain: String(form.get("tracking_subdomain") || ""),
      });
      return result.ok ? { ok: true, message: "Configuration saved" } : { ok: false, message: result.error };
    }

    if (intent === "delete") {
      const result = await deleteShopDomain(session.shop, id);
      if (result.ok) return redirect(`${EMAIL_CHANNEL_PATH}?deleted=${encodeURIComponent(result.name)}`);
      return { ok: false, message: result.error };
    }
  } catch (error) {
    console.error("EMAIL DOMAIN ACTION ERROR:", error);
    return { ok: false, message: "Something went wrong. Please try again." };
  }

  return { ok: false, message: "Unknown action." };
}

/* ------------------------------------------------------------
   RECORDS
------------------------------------------------------------ */

const RECORD_COLUMNS = "70px minmax(150px, 1fr) minmax(240px, 2fr) 70px 70px 130px";

function ValueCell({ value, label }: { value: string; label: string }) {
  return (
    <div style={{ display: "flex", gap: space[3], alignItems: "flex-start", minWidth: 0 }}>
      <code
        style={{
          flex: 1,
          minWidth: 0,
          fontFamily: fontFamily.mono,
          fontSize: "12px",
          lineHeight: 1.5,
          color: color.textStrong,
          wordBreak: "break-all",
        }}
      >
        {value || "—"}
      </code>
      {value ? <CopyButton value={value} label="Copy" compact ariaLabel={`Copy ${label}`} /> : null}
    </div>
  );
}

function RecordTable({ title, records, note }: { title: string; records: (DomainRecord & { key: string })[]; note?: string }) {
  return (
    <div style={{ display: "grid", gap: space[4] }}>
      <div>
        <h3 style={{ margin: 0, ...text.h4, color: color.textStrong }}>{title}</h3>
        {note ? <p style={{ margin: `${space[2]} 0 0`, ...text.bodySm, color: color.textMuted }}>{note}</p> : null}
      </div>
      <div style={{ overflowX: "auto", border: `1px solid ${color.border}`, borderRadius: radius.lg }}>
        <div style={{ minWidth: "760px" }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: RECORD_COLUMNS,
              gap: space[5],
              padding: `${space[4]} ${space[6]}`,
              background: color.surfaceSunken,
              borderBottom: `1px solid ${color.borderSubtle}`,
              ...text.eyebrow,
              fontSize: "10px",
              color: color.textSubtle,
            }}
          >
            <span>Type</span>
            <span>Name</span>
            <span>Content</span>
            <span>TTL</span>
            <span>Priority</span>
            <span>Status</span>
          </div>
          {records.map((r, i) => (
            <div
              key={r.key}
              style={{
                display: "grid",
                gridTemplateColumns: RECORD_COLUMNS,
                gap: space[5],
                alignItems: "start",
                padding: `${space[5]} ${space[6]}`,
                borderTop: i ? `1px solid ${color.borderSubtle}` : undefined,
                background: color.surface,
              }}
            >
              <span style={{ ...text.body, fontWeight: fontWeight.semibold, color: color.textStrong }}>{r.type}</span>
              <ValueCell value={r.name} label={`${r.type} name`} />
              <ValueCell value={r.value} label={`${r.type} content`} />
              <span style={{ ...text.body, color: color.text }}>{r.ttl || "Auto"}</span>
              <span style={{ ...text.body, color: color.text }}>
                {r.priority === undefined || r.priority === null ? "—" : r.priority}
              </span>
              <span>{r.status ? <DomainStatusBadge status={r.status} /> : null}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function RecordsTab({ records }: { records: DomainRecord[] }) {
  const groups = useMemo(() => {
    const order: string[] = [];
    const map = new Map<string, (DomainRecord & { key: string })[]>();
    records.forEach((r, i) => {
      const g = recordGroup(String(r.record || ""));
      if (!map.has(g)) {
        map.set(g, []);
        order.push(g);
      }
      map.get(g)!.push({ ...r, key: `${r.record}-${r.type}-${r.name}-${i}` });
    });
    return order.map((g) => ({ title: g, records: map.get(g)! }));
  }, [records]);

  const dmarc = dmarcRecommendation();

  return (
    <div style={{ display: "grid", gap: space[8] }}>
      <p style={{ margin: 0, ...text.body, color: color.textMuted }}>
        Add these records at the company where you manage DNS for this domain (for example Namecheap, GoDaddy or
        Cloudflare), then press Verify DNS records. Copy each value exactly. Some providers add your domain to the name
        on their own, so if yours does, enter only the part shown here.
      </p>

      {groups.length === 0 ? (
        <Notice tone="info">Resend has not returned any records for this domain yet. Press Refresh in a moment.</Notice>
      ) : (
        groups.map((g) => <RecordTable key={g.title} title={g.title} records={g.records} />)
      )}

      <div style={{ ...card({ padding: 7 }), background: color.surfaceSunken, display: "grid", gap: space[5] }}>
        <div>
          <h3 style={{ margin: 0, ...text.h4, color: color.textStrong }}>Recommended: DMARC</h3>
          <p style={{ margin: `${space[2]} 0 0`, ...text.bodySm, color: color.textMuted }}>
            Not required by Resend, but Gmail and Yahoo expect it from bulk senders and it improves inbox placement. This
            record only asks for reports, so it is safe to add now. Add it to your main domain; if it already has a
            _dmarc record, keep the existing one.
          </p>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: space[5] }}>
          <div>
            <div style={fieldLabel()}>Type</div>
            <code style={{ fontFamily: fontFamily.mono, fontSize: "12px" }}>{dmarc.type}</code>
          </div>
          <div>
            <div style={fieldLabel()}>Name</div>
            <ValueCell value={dmarc.name} label="DMARC name" />
          </div>
          <div>
            <div style={fieldLabel()}>Content</div>
            <ValueCell value={dmarc.value} label="DMARC content" />
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------
   CONFIGURATION
------------------------------------------------------------ */

function Toggle({
  name,
  label,
  help,
  checked,
  onChange,
}: {
  name: string;
  label: string;
  help: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label style={{ display: "flex", gap: space[5], alignItems: "flex-start", cursor: "pointer" }}>
      <input
        type="checkbox"
        name={name}
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        style={{ marginTop: "3px", width: "16px", height: "16px" }}
      />
      <span style={{ ...text.body, fontWeight: fontWeight.semibold, color: color.textStrong }}>
        {label}
        <span style={{ display: "block", ...fieldHint(), fontWeight: fontWeight.regular }}>{help}</span>
      </span>
    </label>
  );
}

function ConfigurationTab({
  initial,
  saving,
  disabled,
  onSave,
}: {
  initial: { tls: TlsMode; openTracking: boolean; clickTracking: boolean; trackingSubdomain: string };
  saving: boolean;
  disabled: boolean;
  onSave: (form: FormData) => void;
}) {
  const [tls, setTls] = useState<TlsMode>(initial.tls);
  const [openTracking, setOpenTracking] = useState(initial.openTracking);
  const [clickTracking, setClickTracking] = useState(initial.clickTracking);
  const [sub, setSub] = useState(initial.trackingSubdomain);

  useEffect(() => {
    setTls(initial.tls);
    setOpenTracking(initial.openTracking);
    setClickTracking(initial.clickTracking);
    setSub(initial.trackingSubdomain);
  }, [initial.tls, initial.openTracking, initial.clickTracking, initial.trackingSubdomain]);

  const dirty =
    tls !== initial.tls ||
    openTracking !== initial.openTracking ||
    clickTracking !== initial.clickTracking ||
    sub.trim() !== initial.trackingSubdomain;

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onSave(new FormData(event.currentTarget));
      }}
      style={{ display: "grid", gap: space[8], maxWidth: "680px" }}
    >
      <input type="hidden" name="intent" value="update" />

      <fieldset style={{ border: 0, margin: 0, padding: 0, display: "grid", gap: space[4] }}>
        <legend style={{ ...text.h4, color: color.textStrong, marginBottom: space[4] }}>Transport security (TLS)</legend>
        {(
          [
            {
              value: "opportunistic",
              label: "Opportunistic",
              help: "Use an encrypted connection when the receiving server supports it, and send anyway when it does not. Best for most stores.",
            },
            {
              value: "enforced",
              label: "Enforced",
              help: "Only send over an encrypted connection. Email to servers without TLS is not delivered.",
            },
          ] as const
        ).map((o) => (
          <label
            key={o.value}
            style={{
              display: "flex",
              gap: space[5],
              alignItems: "flex-start",
              padding: space[5],
              border: `1px solid ${tls === o.value ? color.primary : color.border}`,
              background: tls === o.value ? color.surfaceSelected : color.surface,
              borderRadius: radius.md,
              cursor: "pointer",
            }}
          >
            <input type="radio" name="tls" value={o.value} checked={tls === o.value} onChange={() => setTls(o.value)} style={{ marginTop: "3px" }} />
            <span style={{ ...text.body, fontWeight: fontWeight.semibold, color: color.textStrong }}>
              {o.label}
              <span style={{ display: "block", ...fieldHint(), fontWeight: fontWeight.regular }}>{o.help}</span>
            </span>
          </label>
        ))}
        <span style={fieldHint()}>Resend does not report this setting back, so this shows the last value saved from this app.</span>
      </fieldset>

      <fieldset style={{ border: 0, margin: 0, padding: 0, display: "grid", gap: space[6] }}>
        <legend style={{ ...text.h4, color: color.textStrong, marginBottom: space[4] }}>Tracking</legend>
        <Toggle
          name="open_tracking"
          label="Open tracking"
          help="Adds a tiny invisible image so you can see when an email is opened. Some inboxes block it, so opens are an estimate."
          checked={openTracking}
          onChange={setOpenTracking}
        />
        <Toggle
          name="click_tracking"
          label="Click tracking"
          help="Routes links through Resend so you can see which ones were clicked."
          checked={clickTracking}
          onChange={setClickTracking}
        />
        {openTracking || clickTracking ? (
          <div>
            <label htmlFor="tracking-sub" style={fieldLabel()}>
              Tracking subdomain (optional)
            </label>
            <input
              id="tracking-sub"
              name="tracking_subdomain"
              value={sub}
              onChange={(e) => setSub(e.target.value)}
              placeholder="links"
              autoComplete="off"
              style={{ ...input(), maxWidth: "260px" }}
            />
            <div style={{ ...fieldHint(), marginTop: space[3] }}>
              Tracked links use this subdomain. Resend adds a Tracking record to the Records tab that you need to add at
              your DNS provider.
            </div>
          </div>
        ) : (
          <input type="hidden" name="tracking_subdomain" value="" />
        )}
      </fieldset>

      <div style={{ display: "flex", gap: space[4], justifyContent: "flex-end" }}>
        <button
          type="submit"
          disabled={!dirty || saving || disabled}
          style={button("primary", "md", { disabled: !dirty || saving || disabled })}
        >
          {saving ? "Saving…" : "Save configuration"}
        </button>
      </div>
    </form>
  );
}

/* ------------------------------------------------------------
   PAGE
------------------------------------------------------------ */

export default function EmailDomainPage() {
  const { row, live, error } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const revalidator = useRevalidator();
  const submit = useSubmit();
  const shopify = useAppBridge();
  const [searchParams, setSearchParams] = useSearchParams();

  const tab = searchParams.get("tab") === "configuration" ? "configuration" : "records";
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pollStartedAt, setPollStartedAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const revalidatorRef = useRef(revalidator);
  revalidatorRef.current = revalidator;

  const busyIntent = navigation.state === "submitting" ? String(navigation.formData?.get("intent") || "") : "";
  const refreshing = revalidator.state === "loading";
  const meta = statusMeta(row.status);
  const checking = isChecking(row.status);

  useEffect(() => {
    if (!actionData) return;
    shopify.toast.show(actionData.message, { isError: !actionData.ok });
    setConfirmDelete(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actionData]);

  useEffect(() => {
    if (searchParams.get("created")) {
      shopify.toast.show("Domain added. Now add the DNS records below.");
      const next = new URLSearchParams(searchParams);
      next.delete("created");
      setSearchParams(next, { replace: true, preventScrollReset: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* Poll while Resend is checking, for up to five minutes from
     when checking was first seen on this visit. */
  useEffect(() => {
    if (!checking) {
      setPollStartedAt(null);
      return;
    }
    setPollStartedAt((t) => t ?? Date.now());
  }, [checking]);

  const polling = checking && pollStartedAt !== null && now - pollStartedAt < POLL_FOR_MS;

  useEffect(() => {
    if (!checking || pollStartedAt === null) return;
    const timer = window.setInterval(() => {
      const t = Date.now();
      setNow(t);
      if (t - pollStartedAt >= POLL_FOR_MS) return;
      if (document.visibilityState === "visible" && revalidatorRef.current.state === "idle") {
        revalidatorRef.current.revalidate();
      }
    }, POLL_MS);
    return () => window.clearInterval(timer);
  }, [checking, pollStartedAt]);

  const post = (form: FormData) => submit(form, { method: "post" });
  const intent = (name: string) => {
    const form = new FormData();
    form.append("intent", name);
    post(form);
  };

  const setTab = (next: "records" | "configuration") => {
    const params = new URLSearchParams(searchParams);
    if (next === "records") params.delete("tab");
    else params.set("tab", next);
    setSearchParams(params, { replace: true, preventScrollReset: true });
  };

  const noticeTone =
    meta.tone === "success" ? "success" : meta.tone === "danger" || meta.tone === "accent" ? "danger" : meta.tone === "warning" ? "warning" : "info";

  return (
    <s-section>
      <Breadcrumbs
        items={[
          { label: "Channels", to: "/app/settings/channels" },
          { label: "Email", to: EMAIL_CHANNEL_PATH },
          { label: row.name },
        ]}
      />

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: space[6], flexWrap: "wrap", marginBottom: space[6] }}>
        <div style={{ minWidth: 0, flex: "1 1 300px" }}>
          <div style={{ display: "flex", gap: space[4], alignItems: "center", flexWrap: "wrap" }}>
            <h2 style={{ margin: 0, ...text.h2, color: color.textStrong, overflowWrap: "anywhere" }}>{row.name}</h2>
            <DomainStatusBadge status={row.status} />
          </div>
          <dl style={{ display: "flex", flexWrap: "wrap", gap: `${space[3]} ${space[8]}`, margin: `${space[4]} 0 0`, ...text.bodySm }}>
            <div>
              <dt style={{ color: color.textMuted }}>Region</dt>
              <dd style={{ margin: 0, color: color.textStrong, fontWeight: fontWeight.medium }}>{regionLabel(row.region)}</dd>
            </div>
            <div>
              <dt style={{ color: color.textMuted }}>Created</dt>
              <dd style={{ margin: 0 }}>
                <AuditDate value={row.createdAt} />
              </dd>
            </div>
          </dl>
        </div>

        <div style={{ display: "flex", gap: space[4], flexWrap: "wrap" }}>
          <button
            type="button"
            style={button("secondary", "md", { disabled: refreshing })}
            disabled={refreshing}
            onClick={() => revalidator.revalidate()}
          >
            {refreshing ? "Refreshing…" : "Refresh"}
          </button>
          <button
            type="button"
            style={button("danger", "md", { disabled: Boolean(busyIntent) })}
            disabled={Boolean(busyIntent)}
            onClick={() => setConfirmDelete(true)}
          >
            Delete
          </button>
          <button
            type="button"
            style={button("primary", "md", { disabled: Boolean(busyIntent) || Boolean(error) })}
            disabled={Boolean(busyIntent) || Boolean(error)}
            onClick={() => intent("verify")}
          >
            {busyIntent === "verify" ? "Verifying…" : "Verify DNS records"}
          </button>
        </div>
      </div>

      {error ? (
        <Notice
          tone="danger"
          action={
            <button type="button" style={button("secondary", "sm")} onClick={() => revalidator.revalidate()}>
              Try again
            </button>
          }
        >
          {error} The details below are the last saved copy.
        </Notice>
      ) : meta.help ? (
        <Notice tone={noticeTone}>
          <strong>{meta.label}.</strong> {meta.help}
          {checking ? (
            <span style={{ display: "block", marginTop: space[2], ...text.bodySm }}>
              {polling
                ? "This page checks again every 10 seconds."
                : "Still checking. Press Refresh to see the latest status."}
            </span>
          ) : null}
        </Notice>
      ) : null}

      <div role="tablist" aria-label="Domain details" style={{ display: "flex", gap: space[2], borderBottom: `1px solid ${color.border}`, marginBottom: space[7] }}>
        {(
          [
            ["records", "Records"],
            ["configuration", "Configuration"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            style={{
              all: "unset",
              cursor: "pointer",
              padding: `${space[4]} ${space[5]}`,
              marginBottom: "-1px",
              borderBottom: `2px solid ${tab === key ? color.primary : "transparent"}`,
              ...text.body,
              fontWeight: tab === key ? fontWeight.semibold : fontWeight.medium,
              color: tab === key ? color.textStrong : color.textMuted,
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "records" ? (
        live ? (
          <RecordsTab records={live.records} />
        ) : (
          <Notice tone="info">Records load from Resend. Press Try again once Resend can be reached.</Notice>
        )
      ) : (
        <ConfigurationTab
          initial={{
            tls: row.tls === "enforced" ? "enforced" : "opportunistic",
            openTracking: live?.openTracking ?? false,
            clickTracking: live?.clickTracking ?? false,
            trackingSubdomain: live?.trackingSubdomain ?? "",
          }}
          saving={busyIntent === "update"}
          disabled={!live}
          onSave={post}
        />
      )}

      {confirmDelete ? (
        <ConfirmDialog
          title={`Delete ${row.name}?`}
          confirmLabel="Delete domain"
          busy={busyIntent === "delete"}
          onCancel={() => setConfirmDelete(false)}
          onConfirm={() => intent("delete")}
        >
          The domain is removed from Resend too. Emails can no longer be sent from it until you add and verify it again.
          This cannot be undone.
        </ConfirmDialog>
      ) : null}
    </s-section>
  );
}
