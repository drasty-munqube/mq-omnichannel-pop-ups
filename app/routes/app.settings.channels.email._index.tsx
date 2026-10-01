/* ============================================================
   SETTINGS > CHANNELS > EMAIL (domain list)

   This store's sending domains, like resend.com/domains. The
   loader syncs with Resend first (Resend is the source of
   truth), so status changes and domains removed in Resend show
   up here on every visit.

   GET   loader                 synced list + importable domains
   POST  intent=verify          re-check one domain's DNS
   POST  intent=delete          delete one domain
   POST  intent=bulk-delete     delete the selected domains
   POST  intent=import          add existing Resend domains here

   All Resend calls happen on the server. The API key is never
   sent to the browser.
   ============================================================ */

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import {
  Link,
  useActionData,
  useLoaderData,
  useLocation,
  useNavigate,
  useNavigation,
  useRevalidator,
  useSearchParams,
  useSubmit,
} from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";

import { AuditDate, stickyEnd } from "../components/audit-cells";
import {
  Breadcrumbs,
  ConfirmDialog,
  DomainStatusBadge,
  EMAIL_CHANNEL_PATH,
  Notice,
  domainPath,
  selectStyle,
} from "../components/domain-ui";
import { RowActions } from "../components/row-actions";
import { button, input, modalOverlay, modalPanel, skeleton, tableHead, tableRow } from "../design/styles";
import { color, fontWeight, radius, space, text, zIndex } from "../design/tokens";
import { actorName } from "../models/actor.server";
import { DOMAIN_REGIONS, VERIFICATION_FILTERS, regionLabel, verificationState } from "../models/email-domain";
import {
  deleteShopDomain,
  deleteShopDomains,
  importShopDomains,
  listShopDomains,
  verifyShopDomain,
  type DomainRow,
} from "../models/email-domains.server";
import { authenticate } from "../shopify.server";
import { Select } from "../components/select";
import { Plus, RefreshCw, RotateCcw, Trash2, X } from "lucide-react";
import { IconButton } from "../components/icon-button";
import { SearchField } from "../components/search-field";

export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);
  try {
    return { ...(await listShopDomains(session.shop)), loadError: false };
  } catch (error) {
    console.error("EMAIL DOMAINS LOAD ERROR:", error);
    return { configured: true, domains: [], importable: [], syncError: null, loadError: true };
  }
}

export async function action({ request }: ActionFunctionArgs) {
  const auth = await authenticate.admin(request);
  const shop = auth.session.shop;
  const form = await request.formData();
  const intent = String(form.get("intent") || "");
  const id = String(form.get("domainId") || "").trim();
  const ids = form.getAll("domainIds").map((v) => String(v).trim()).filter(Boolean);

  try {
    if (intent === "verify") {
      const result = await verifyShopDomain(shop, id);
      return result.ok
        ? { ok: true, message: "Checking DNS records. This can take a few minutes." }
        : { ok: false, message: result.error };
    }

    if (intent === "delete") {
      const result = await deleteShopDomain(shop, id);
      return result.ok ? { ok: true, message: `${result.name} deleted` } : { ok: false, message: result.error };
    }

    if (intent === "bulk-delete") {
      if (ids.length === 0) return { ok: false, message: "Select at least one domain." };
      const result = await deleteShopDomains(shop, ids);
      if (result.failed === 0) {
        return { ok: true, message: `${result.deleted} domain${result.deleted === 1 ? "" : "s"} deleted` };
      }
      return {
        ok: false,
        message: `${result.deleted} deleted, ${result.failed} could not be deleted. ${result.errors[0] || ""}`.trim(),
      };
    }

    if (intent === "import") {
      const result = await importShopDomains(shop, actorName(auth), ids);
      if (!result.ok) return { ok: false, message: result.error };
      if (result.imported === 0) return { ok: false, message: "Those domains were already added by another store." };
      return {
        ok: true,
        message: `${result.imported} domain${result.imported === 1 ? "" : "s"} imported${result.skipped ? `, ${result.skipped} skipped` : ""}`,
      };
    }
  } catch (error) {
    console.error("EMAIL DOMAINS ACTION ERROR:", error);
    return { ok: false, message: "Something went wrong. Please try again." };
  }

  return { ok: false, message: "Unknown action." };
}

const COLUMNS = "32px minmax(220px, 2fr) 170px minmax(170px, 1fr) 120px 56px";

type Importable = ReturnType<typeof useLoaderData<typeof loader>>["importable"][number];

function ImportDialog({
  domains,
  busy,
  onImport,
  onClose,
}: {
  domains: Importable[];
  busy: boolean;
  onImport: (ids: string[]) => void;
  onClose: () => void;
}) {
  const [picked, setPicked] = useState<string[]>([]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  const toggle = (id: string) =>
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  return (
    <div role="presentation" style={{ ...modalOverlay(), zIndex: zIndex.modal }} onClick={(event) => event.target === event.currentTarget && !busy && onClose()}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="mq-import-title"
        style={{ ...modalPanel(), maxWidth: "560px", width: "calc(100% - 32px)" }}
      >
        <div style={{ padding: space[7], display: "grid", gap: space[4] }}>
          <h3 id="mq-import-title" style={{ margin: 0, ...text.h3, color: color.textStrong }}>
            Import from Resend
          </h3>
          <p style={{ margin: 0, ...text.body, color: color.textMuted }}>
            Domains already in the connected Resend account that no store in this app has added yet.
          </p>

          {domains.length === 0 ? (
            <div style={{ padding: space[7], textAlign: "center", border: `1px dashed ${color.borderStrong}`, borderRadius: radius.lg, ...text.body, color: color.textMuted }}>
              Nothing to import. Every domain in Resend is already added.
            </div>
          ) : (
            <ul style={{ listStyle: "none", margin: 0, padding: 0, border: `1px solid ${color.border}`, borderRadius: radius.lg, maxHeight: "320px", overflowY: "auto" }}>
              {domains.map((d, i) => (
                <li key={d.id} style={{ borderTop: i ? `1px solid ${color.borderSubtle}` : undefined }}>
                  <label style={{ display: "flex", gap: space[5], alignItems: "center", padding: `${space[5]} ${space[6]}`, cursor: "pointer" }}>
                    <input type="checkbox" checked={picked.includes(d.id)} onChange={() => toggle(d.id)} />
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: "block", ...text.body, fontWeight: fontWeight.semibold, color: color.textStrong, overflowWrap: "anywhere" }}>
                        {d.name}
                      </span>
                      <span style={{ ...text.bodySm, color: color.textMuted }}>{regionLabel(d.region)}</span>
                    </span>
                    <DomainStatusBadge status={d.status} />
                  </label>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: space[4], padding: `${space[5]} ${space[7]}`, borderTop: `1px solid ${color.borderSubtle}`, background: color.surfaceSunken }}>
          <button type="button" style={button("secondary", "md", { disabled: busy })} disabled={busy} onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            style={button("primary", "md", { disabled: busy || picked.length === 0 })}
            disabled={busy || picked.length === 0}
            onClick={() => onImport(picked)}
          >
            {busy ? "Importing…" : picked.length ? `Import ${picked.length}` : "Import"}
          </button>
        </div>
      </div>
    </div>
  );
}

function SkeletonRows() {
  return (
    <>
      {[0, 1, 2].map((i) => (
        <div key={i} style={tableRow(COLUMNS)} aria-hidden>
          <span />
          <span data-mq="skeleton" style={skeleton({ width: "70%", height: "14px" })} />
          <span data-mq="skeleton" style={skeleton({ width: "90px", height: "18px" })} />
          <span data-mq="skeleton" style={skeleton({ width: "80%" })} />
          <span data-mq="skeleton" style={skeleton({ width: "70px" })} />
          <span />
        </div>
      ))}
    </>
  );
}

export default function EmailDomainsPage() {
  const { configured, domains, importable, syncError, loadError } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const revalidator = useRevalidator();
  const submit = useSubmit();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const shopify = useAppBridge();

  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");
  const [region, setRegion] = useState("all");
  const [selected, setSelected] = useState<string[]>([]);
  const [confirm, setConfirm] = useState<{ ids: string[]; label: string } | null>(null);
  const [importing, setImporting] = useState(false);

  const busyIntent = navigation.state === "submitting" ? String(navigation.formData?.get("intent") || "") : "";
  const busyId = navigation.state === "submitting" ? String(navigation.formData?.get("domainId") || "") : "";
  const reloading =
    revalidator.state === "loading" ||
    (navigation.state === "loading" && navigation.location?.pathname === location.pathname && !busyIntent);

  /* Toast for actions on this page, and for a delete that
     happened on a domain's own page before coming back here. */
  useEffect(() => {
    if (!actionData) return;
    shopify.toast.show(actionData.message, { isError: !actionData.ok });
    if (actionData.ok) {
      setConfirm(null);
      setImporting(false);
      setSelected([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actionData]);

  useEffect(() => {
    const deleted = searchParams.get("deleted");
    const gone = searchParams.get("gone");
    if (deleted) shopify.toast.show(`${deleted} deleted`);
    if (gone) shopify.toast.show(`${gone} was removed in Resend, so it is no longer listed here.`);
    if (deleted || gone) navigate(EMAIL_CHANNEL_PATH, { replace: true, preventScrollReset: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  /* Drop selections for rows that disappeared after a sync. */
  useEffect(() => {
    setSelected((s) => s.filter((id) => domains.some((d) => d.id === id)));
  }, [domains]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return domains.filter(
      (d) =>
        (status === "all" || verificationState(d.status) === status) &&
        (region === "all" || d.region === region) &&
        (!needle || d.name.toLowerCase().includes(needle)),
    );
  }, [domains, q, status, region]);

  const post = useCallback(
    (intent: string, fields: Record<string, string | string[]>) => {
      const form = new FormData();
      form.append("intent", intent);
      for (const [key, value] of Object.entries(fields)) {
        for (const v of Array.isArray(value) ? value : [value]) form.append(key, v);
      }
      submit(form, { method: "post" });
    },
    [submit],
  );

  const runDelete = () => {
    if (!confirm) return;
    if (confirm.ids.length === 1) post("delete", { domainId: confirm.ids[0] });
    else post("bulk-delete", { domainIds: confirm.ids });
  };

  const allVisibleSelected = filtered.length > 0 && filtered.every((d) => selected.includes(d.id));
  const toggleAll = () =>
    setSelected(allVisibleSelected ? selected.filter((id) => !filtered.some((d) => d.id === id)) : [...new Set([...selected, ...filtered.map((d) => d.id)])]);
  const toggleOne = (id: string) =>
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  const filtersOn = q.trim() !== "" || status !== "all" || region !== "all";

  const rowActions = (d: DomainRow) => [
    { label: "View", onSelect: () => navigate(domainPath(d.id)) },
    {
      label: busyIntent === "verify" && busyId === d.id ? "Verifying…" : "Verify DNS records",
      onSelect: () => post("verify", { domainId: d.id }),
      disabled: !configured || d.status === "verified",
    },
    {
      label: "Delete",
      danger: true,
      onSelect: () => setConfirm({ ids: [d.id], label: d.name }),
      disabled: !configured,
    },
  ];

  return (
    <s-section>
      <Breadcrumbs items={[{ label: "Channels", to: "/app/settings/channels" }, { label: "Email" }]} />

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: space[5], flexWrap: "wrap", marginBottom: space[6] }}>
        <div style={{ minWidth: 0, flex: "1 1 260px" }}>
          <h2 style={{ margin: 0, ...text.h2, color: color.textStrong }}>Domains</h2>
          <p style={{ margin: `${space[2]} 0 0`, ...text.body, color: color.textMuted }}>
            Verify a domain you own to send campaign emails from it. Records and status come straight from Resend.
          </p>
        </div>
        <div style={{ display: "flex", gap: space[4], flexWrap: "wrap" }}>
          <IconButton
            icon={RefreshCw}
            label="Refresh"
            busyLabel="Syncing"
            spin
            busy={reloading}
            disabled={!configured}
            onClick={() => revalidator.revalidate()}
          />
          {/* Import from Resend is hidden for now. Uncomment to bring it back.
          <button
            type="button"
            style={button("secondary", "md", { disabled: !configured })}
            disabled={!configured}
            onClick={() => setImporting(true)}
          >
            Import from Resend{importable.length ? ` (${importable.length})` : ""}
          </button>
          */}
          {configured ? (
            <Link to={`${EMAIL_CHANNEL_PATH}/new`} style={{ ...button("primary", "md"), textDecoration: "none" }}>
              <Plus aria-hidden size={15} strokeWidth={2} />
              Add domain
            </Link>
          ) : (
            <button type="button" style={button("primary", "md", { disabled: true })} disabled>
              <Plus aria-hidden size={15} strokeWidth={2} />
              Add domain
            </button>
          )}
        </div>
      </div>

      {!configured ? (
        <Notice tone="warning">
          Resend is not connected. Add <code>RESEND_DOMAINS_API_KEY</code> (a Resend API key with Full access) to the
          app&apos;s environment, then restart the app. The key stays on the server and is never shown here.
        </Notice>
      ) : null}

      {syncError ? (
        <Notice
          tone="danger"
          action={
            <IconButton icon={RotateCcw} label="Try again" size="sm" onClick={() => revalidator.revalidate()} />
          }
        >
          {syncError} {domains.length ? "Showing the last saved list." : null}
        </Notice>
      ) : null}

      {loadError ? (
        <Notice
          tone="danger"
          action={
            <IconButton icon={RotateCcw} label="Try again" size="sm" onClick={() => revalidator.revalidate()} />
          }
        >
          Domains could not be loaded. Please try again.
        </Notice>
      ) : null}

      {domains.length > 0 ? (
        <div style={{ display: "flex", gap: space[4], flexWrap: "wrap", alignItems: "center", marginBottom: space[5] }}>
          <SearchField
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search domains"
            aria-label="Search domains"
            style={{ ...input(), flex: "1 1 220px", maxWidth: "340px", minWidth: 0 }}
          />
          <Select aria-label="Filter by status" value={status} onChange={(e) => setStatus(e.target.value)} style={selectStyle()}>
            <option value="all">All statuses</option>
            {VERIFICATION_FILTERS.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </Select>
          <Select aria-label="Filter by region" value={region} onChange={(e) => setRegion(e.target.value)} style={selectStyle()}>
            <option value="all">All regions</option>
            {DOMAIN_REGIONS.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </Select>
          {filtersOn ? (
            <IconButton
              icon={X}
              label="Clear filters"
              variant="tertiary"
              size="sm"
              onClick={() => {
                setQ("");
                setStatus("all");
                setRegion("all");
              }}
            />
          ) : null}
          {selected.length > 0 ? (
            <button
              type="button"
              style={{ ...button("danger", "md"), marginLeft: "auto" }}
              onClick={() => setConfirm({ ids: selected, label: `${selected.length} domains` })}
            >
              <Trash2 aria-hidden size={16} strokeWidth={2} />
              Delete selected ({selected.length})
            </button>
          ) : null}
        </div>
      ) : null}

      {domains.length === 0 && !loadError ? (
        reloading ? (
          <div style={{ border: `1px solid ${color.border}`, borderRadius: radius.lg, overflow: "hidden" }}>
            <SkeletonRows />
          </div>
        ) : (
          <div style={{ padding: `${space[10]} ${space[6]}`, textAlign: "center", border: `1px dashed ${color.borderStrong}`, borderRadius: radius.lg }}>
            <div style={{ ...text.h4, color: color.textStrong }}>No domains yet</div>
            <p style={{ margin: `${space[3]} auto 0`, maxWidth: "420px", ...text.body, color: color.textMuted }}>
              Add a domain you own, such as mail.yourstore.com, then add the DNS records we show you at your domain
              provider.
            </p>
            <div style={{ display: "flex", gap: space[4], justifyContent: "center", flexWrap: "wrap", marginTop: space[6] }}>
              {configured ? (
                <Link to={`${EMAIL_CHANNEL_PATH}/new`} style={{ ...button("primary", "md"), textDecoration: "none" }}>
                  <Plus aria-hidden size={15} strokeWidth={2} />
                  Add domain
                </Link>
              ) : null}
              {/* Import from Resend is hidden for now. Uncomment to bring it back.
              {configured && importable.length > 0 ? (
                <button type="button" style={button("secondary", "md")} onClick={() => setImporting(true)}>
                  Import from Resend ({importable.length})
                </button>
              ) : null}
              */}
            </div>
          </div>
        )
      ) : domains.length > 0 ? (
        <div style={{ overflowX: "auto", border: `1px solid ${color.border}`, borderRadius: radius.lg, opacity: reloading ? 0.6 : 1, transition: "opacity 150ms" }} aria-busy={reloading}>
          <div style={{ minWidth: "780px" }}>
            <div style={tableHead(COLUMNS)}>
              <input
                type="checkbox"
                aria-label="Select all shown domains"
                checked={allVisibleSelected}
                onChange={toggleAll}
                disabled={filtered.length === 0}
              />
              <span>Domain</span>
              <span>Status</span>
              <span>Region</span>
              <span>Created</span>
              <span style={stickyEnd(color.surfaceSunken)}>Actions</span>
            </div>

            {filtered.length === 0 ? (
              <div style={{ padding: `${space[9]} ${space[6]}`, textAlign: "center", ...text.body, color: color.textMuted }}>
                No domains match. Try another search or filter.
              </div>
            ) : (
              filtered.map((d) => {
                const isSelected = selected.includes(d.id);
                return (
                  <div key={d.id} style={tableRow(COLUMNS, { selected: isSelected })}>
                    <input
                      type="checkbox"
                      aria-label={`Select ${d.name}`}
                      checked={isSelected}
                      onChange={() => toggleOne(d.id)}
                    />
                    <Link
                      to={domainPath(d.id)}
                      title={d.name}
                      style={{ minWidth: 0, ...text.body, fontWeight: fontWeight.semibold, color: color.textStrong, textDecoration: "none", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                    >
                      {d.name}
                    </Link>
                    <span>
                      <DomainStatusBadge status={d.status} />
                    </span>
                    <span title={regionLabel(d.region)} style={{ ...text.body, color: color.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {regionLabel(d.region)}
                    </span>
                    <AuditDate value={d.createdAt} />
                    <div style={stickyEnd(isSelected ? color.surfaceSelected : color.surface)}>
                      <RowActions name={d.name} actions={rowActions(d)} />
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      ) : null}

      {domains.length > 0 ? (
        <div style={{ marginTop: space[4], ...text.bodySm, color: color.textMuted }}>
          {filtered.length === domains.length
            ? `${domains.length} domain${domains.length === 1 ? "" : "s"}`
            : `${filtered.length} of ${domains.length} domains`}
        </div>
      ) : null}

      {confirm ? (
        <ConfirmDialog
          title={confirm.ids.length === 1 ? `Delete ${confirm.label}?` : `Delete ${confirm.ids.length} domains?`}
          confirmLabel="Delete"
          busy={busyIntent === "delete" || busyIntent === "bulk-delete"}
          onCancel={() => setConfirm(null)}
          onConfirm={runDelete}
        >
          {confirm.ids.length === 1
            ? "The domain is removed from Resend too. Emails can no longer be sent from it until you add and verify it again."
            : "These domains are removed from Resend too. Emails can no longer be sent from them until you add and verify them again."}
        </ConfirmDialog>
      ) : null}

      {importing ? (
        <ImportDialog
          domains={importable}
          busy={busyIntent === "import"}
          onClose={() => setImporting(false)}
          onImport={(ids) => post("import", { domainIds: ids })}
        />
      ) : null}
    </s-section>
  );
}
