/* ============================================================
   EMAIL DOMAIN UI PIECES

   Shared by the domain list, the Add domain form and a domain's
   own page under Settings > Channels > Email.
   ============================================================ */

import { useEffect, type CSSProperties, type ReactNode } from "react";
import { Link } from "react-router";

import { badge, button, modalOverlay, modalPanel } from "../design/styles";
import { color, fontWeight, radius, space, text, zIndex } from "../design/tokens";
import { statusMeta } from "../models/email-domain";

export const EMAIL_CHANNEL_PATH = "/app/settings/channels/email";

export function domainPath(id: string) {
  return `${EMAIL_CHANNEL_PATH}/${encodeURIComponent(id)}`;
}

export function DomainStatusBadge({ status }: { status: string }) {
  const meta = statusMeta(status);
  return (
    <span style={badge(meta.tone)} title={meta.help || undefined}>
      <span
        aria-hidden
        style={{ width: "6px", height: "6px", borderRadius: "999px", background: meta.dot, flexShrink: 0 }}
      />
      {meta.label.toUpperCase()}
    </span>
  );
}

export function Breadcrumbs({ items }: { items: { label: string; to?: string }[] }) {
  return (
    <nav aria-label="Breadcrumb" style={{ marginBottom: space[5] }}>
      <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexWrap: "wrap", gap: space[3], ...text.bodySm }}>
        {items.map((item, i) => (
          <li key={`${item.label}-${i}`} style={{ display: "flex", gap: space[3], alignItems: "center", minWidth: 0 }}>
            {i > 0 ? <span aria-hidden style={{ color: color.textSubtle }}>/</span> : null}
            {item.to ? (
              <Link to={item.to} style={{ color: color.textMuted, textDecoration: "none" }}>
                {item.label}
              </Link>
            ) : (
              <span
                aria-current="page"
                style={{ color: color.textStrong, fontWeight: fontWeight.medium, overflowWrap: "anywhere" }}
              >
                {item.label}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}

export function Notice({
  tone,
  children,
  action,
}: {
  tone: "warning" | "danger" | "info" | "success";
  children: ReactNode;
  action?: ReactNode;
}) {
  const palette = {
    warning: { bg: color.warningSurface, fg: color.warningText },
    danger: { bg: color.dangerSurface, fg: color.dangerText },
    info: { bg: color.infoSurface, fg: color.infoText },
    success: { bg: color.successSurface, fg: color.successText },
  }[tone];
  return (
    <div
      role={tone === "danger" ? "alert" : "note"}
      style={{
        display: "flex",
        gap: space[5],
        alignItems: "center",
        justifyContent: "space-between",
        flexWrap: "wrap",
        marginBottom: space[5],
        padding: space[5],
        borderRadius: "10px",
        background: palette.bg,
        color: palette.fg,
        ...text.body,
      }}
    >
      <div style={{ flex: "1 1 260px", minWidth: 0 }}>{children}</div>
      {action}
    </div>
  );
}

/* A confirm dialog. Escape and a click outside cancel. */
export function ConfirmDialog({
  title,
  children,
  confirmLabel,
  busy,
  onConfirm,
  onCancel,
}: {
  title: string;
  children: ReactNode;
  confirmLabel: string;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) onCancel();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [busy, onCancel]);

  return (
    <div role="presentation" style={{ ...modalOverlay(), zIndex: zIndex.modal }} onClick={(event) => event.target === event.currentTarget && !busy && onCancel()}>
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="mq-confirm-title"
        style={{ ...modalPanel(), maxWidth: "460px", width: "calc(100% - 32px)" }}
      >
        <div style={{ padding: space[7], display: "grid", gap: space[4] }}>
          <h3 id="mq-confirm-title" style={{ margin: 0, ...text.h3, color: color.textStrong }}>
            {title}
          </h3>
          <div style={{ ...text.body, color: color.text }}>{children}</div>
        </div>
        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            gap: space[4],
            flexWrap: "wrap",
            padding: `${space[5]} ${space[7]}`,
            borderTop: `1px solid ${color.borderSubtle}`,
            background: color.surfaceSunken,
          }}
        >
          <button type="button" style={button("secondary", "md", { disabled: busy })} disabled={busy} onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            style={{ ...button("danger", "md", { disabled: busy }), background: color.dangerSolid, color: "#fff", borderColor: color.dangerSolid }}
            disabled={busy}
            onClick={onConfirm}
          >
            {busy ? "Working…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export function selectStyle(): CSSProperties {
  return {
    height: "38px",
    padding: `0 ${space[8]} 0 ${space[5]}`,
    border: `1px solid ${color.border}`,
    borderRadius: radius.md,
    background: color.surface,
    color: color.textStrong,
    ...text.body,
    cursor: "pointer",
  };
}
