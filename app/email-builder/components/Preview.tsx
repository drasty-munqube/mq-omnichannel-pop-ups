/* ============================================================
   EMAIL PREVIEW

   Renders the template through the same renderEmailTemplate()
   that produces the saved and sent HTML, inside a sandboxed
   iframe so the email's own <style> cannot leak into the admin
   and nothing in it can run script.
   ============================================================ */

import { useEffect, useMemo, useRef, useState } from "react";

import { button, modalOverlay, modalPanel } from "../../design/styles";
import {
  color,
  fontWeight,
  radius,
  space,
  text,
  zIndex,
} from "../../design/tokens";
import { renderEmailTemplate } from "../render";
import { sampleVariables, type EmailTemplateDoc } from "../schema";

export type PreviewDevice = "desktop" | "mobile";

export function previewVariables(shop?: string) {
  return sampleVariables(shop ? { "shop.url": `https://${shop}` } : {});
}

export function EmailPreviewFrame({
  doc,
  variables,
  device = "desktop",
  title = "Email preview",
}: {
  doc: EmailTemplateDoc;
  variables: Record<string, string>;
  device?: PreviewDevice;
  title?: string;
}) {
  const frame = useRef<HTMLIFrameElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(480);
  const [available, setAvailable] = useState(0);

  /* Desktop shows the real desktop layout, scaled down to fit the
     panel, instead of letting a narrow panel trigger the mobile
     rules. Mobile renders at a phone's width. */
  useEffect(() => {
    const el = wrap.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => setAvailable(el.clientWidth));
    observer.observe(el);
    setAvailable(el.clientWidth);
    return () => observer.disconnect();
  }, []);

  const html = useMemo(
    () => renderEmailTemplate(doc, { variables }).html,
    [doc, variables],
  );

  /* The frame has no script permission, so its height is read
     from the parent once it loads and again if it resizes. */
  useEffect(() => {
    const el = frame.current;
    if (!el) return;
    let observer: ResizeObserver | null = null;

    const measure = () => {
      const body = el.contentDocument?.body;
      if (body) setHeight(Math.max(240, body.scrollHeight + 8));
    };

    const onLoad = () => {
      measure();
      const body = el.contentDocument?.body;
      if (body && typeof ResizeObserver !== "undefined") {
        observer = new ResizeObserver(measure);
        observer.observe(body);
      }
    };

    el.addEventListener("load", onLoad);
    return () => {
      el.removeEventListener("load", onLoad);
      observer?.disconnect();
    };
  }, [html]);

  const natural =
    device === "mobile"
      ? 375
      : Math.max(640, doc.settings.width + 2 * Math.max(doc.settings.padding ?? 24, 8));
  const scale = available > 0 && available < natural ? available / natural : 1;

  return (
    <div
      ref={wrap}
      style={{
        display: "flex",
        justifyContent: scale < 1 ? "flex-start" : "center",
        background: doc.settings.backgroundColor,
        borderRadius: radius.md,
        overflow: "hidden",
        height: Math.ceil(height * scale),
      }}
    >
      <iframe
        ref={frame}
        title={title}
        srcDoc={html}
        sandbox="allow-same-origin"
        style={{
          width: natural,
          flexShrink: 0,
          height,
          border: 0,
          display: "block",
          transform: scale < 1 ? `scale(${scale})` : undefined,
          transformOrigin: "top left",
          background: doc.settings.backgroundColor,
          boxShadow: device === "mobile" ? "0 0 0 1px rgba(23,32,51,0.08)" : "none",
        }}
      />
    </div>
  );
}

export function DeviceSwitch({
  device,
  onChange,
}: {
  device: PreviewDevice;
  onChange: (device: PreviewDevice) => void;
}) {
  return (
    <div
      role="radiogroup"
      aria-label="Preview size"
      style={{
        display: "inline-flex",
        padding: space[1],
        gap: space[1],
        background: color.surfaceSunken,
        border: `1px solid ${color.border}`,
        borderRadius: radius.md,
      }}
    >
      {(["desktop", "mobile"] as const).map((value) => {
        const active = value === device;
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(value)}
            style={{
              height: "28px",
              padding: `0 ${space[5]}`,
              border: 0,
              borderRadius: radius.sm,
              background: active ? color.surface : "transparent",
              color: active ? color.textStrong : color.textMuted,
              fontSize: "12px",
              fontWeight: fontWeight.semibold,
              cursor: "pointer",
            }}
          >
            {value === "desktop" ? "Desktop" : "Mobile"}
          </button>
        );
      })}
    </div>
  );
}

/* The inbox line above the email: from, subject, preview text. */
export function InboxHeader({
  doc,
  variables,
}: {
  doc: EmailTemplateDoc;
  variables: Record<string, string>;
}) {
  const rendered = useMemo(
    () => renderEmailTemplate({ ...doc, blocks: [] }, { variables }),
    [doc, variables],
  );
  return (
    <div
      style={{
        padding: `${space[5]} ${space[6]}`,
        border: `1px solid ${color.border}`,
        borderRadius: radius.md,
        background: color.surface,
        marginBottom: space[5],
      }}
    >
      <div style={{ ...text.bodySm, color: color.textMuted }}>
        {doc.email.fromName || variables["shop.name"] || "Your store"}
        {doc.email.replyTo ? ` · reply to ${doc.email.replyTo}` : ""}
      </div>
      <div
        style={{
          ...text.body,
          fontWeight: fontWeight.semibold,
          color: color.textStrong,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {rendered.subject || "(no subject)"}
      </div>
      <div
        style={{
          ...text.bodySm,
          color: color.textSubtle,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {rendered.previewText || "No preview text"}
      </div>
    </div>
  );
}

export function PreviewModal({
  doc,
  name,
  shop,
  onClose,
}: {
  doc: EmailTemplateDoc;
  name: string;
  shop?: string;
  onClose: () => void;
}) {
  const [device, setDevice] = useState<PreviewDevice>("desktop");
  const variables = useMemo(() => previewVariables(shop), [shop]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      role="presentation"
      style={{ ...modalOverlay(), zIndex: zIndex.modal, alignItems: "flex-start" }}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Preview of ${name}`}
        style={{ ...modalPanel({ width: "880px" }), marginTop: space[6] }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: space[5],
            padding: `${space[6]} ${space[7]}`,
            borderBottom: `1px solid ${color.borderSubtle}`,
            flexWrap: "wrap",
          }}
        >
          <div style={{ minWidth: 0 }}>
            <div style={{ ...text.h3, color: color.textStrong }}>Preview</div>
            <div style={{ ...text.bodySm, color: color.textMuted }}>
              {name} · sample values shown for variables
            </div>
          </div>
          <div style={{ display: "flex", gap: space[4], alignItems: "center" }}>
            <DeviceSwitch device={device} onChange={setDevice} />
            <button type="button" onClick={onClose} style={button("secondary", "sm")}>
              Close
            </button>
          </div>
        </div>
        <div
          style={{
            padding: space[7],
            background: color.surfaceSunken,
            maxHeight: "calc(100vh - 180px)",
            overflowY: "auto",
          }}
        >
          <InboxHeader doc={doc} variables={variables} />
          <EmailPreviewFrame doc={doc} variables={variables} device={device} />
        </div>
      </div>
    </div>
  );
}
