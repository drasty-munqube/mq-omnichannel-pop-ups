import { useState } from "react";
import { Check, Copy } from "lucide-react";

/* ============================================================
   COPY SNIPPET

   Shared by the Settings and Websites screens, which both hand
   the merchant an embed snippet to paste elsewhere.

   Embedded apps run inside an iframe where navigator.clipboard
   can be blocked by permissions policy, so the modern API is
   tried first and the old textarea + execCommand trick is the
   fallback. Neither path is allowed to throw.
   ============================================================ */

export function CopyButton({
  value,
  label = "Copy code",
  compact = false,
  ariaLabel,
}: {
  value: string;
  label?: string;
  /* A small light button, for tables with many values. */
  compact?: boolean;
  ariaLabel?: string;
}) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    let ok = false;

    try {
      await navigator.clipboard.writeText(value);
      ok = true;
    } catch {
      try {
        const area =
          document.createElement("textarea");

        area.value = value;
        area.style.position = "fixed";
        area.style.opacity = "0";

        document.body.appendChild(area);
        area.select();

        ok = document.execCommand("copy");

        document.body.removeChild(area);
      } catch {
        ok = false;
      }
    }

    if (ok) {
      setCopied(true);
      window.setTimeout(
        () => setCopied(false),
        2000,
      );
    }
  };

  const Glyph = copied ? Check : Copy;

  /* Compact: an icon only, for IDs and values in tables. The
     label stays available as the tooltip and to screen readers. */
  if (compact) {
    const name = copied ? "Copied" : ariaLabel || label;
    return (
      <button
        type="button"
        onClick={copy}
        aria-label={name}
        title={copied ? "Copied" : label}
        style={{
          width: 28,
          height: 28,
          padding: 0,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          color: copied ? "#0A6E4A" : "#5B6573",
          background: copied ? "#D9F2E6" : "#FFFFFF",
          border: `1px solid ${copied ? "#A7DCC4" : "#D5DAE1"}`,
          borderRadius: 6,
          cursor: "pointer",
          flexShrink: 0,
        }}
      >
        <Glyph aria-hidden size={14} strokeWidth={2} />
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={copy}
      aria-label={ariaLabel}
      style={{
        padding: "8px 14px",
        fontSize: 13,
        fontWeight: 600,
        color: copied ? "#0A6E4A" : "#FFFFFF",
        background: copied
          ? "#D9F2E6"
          : "#1F2937",
        border: "none",
        borderRadius: 8,
        cursor: "pointer",
        whiteSpace: "nowrap",
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
      }}
    >
      <Glyph aria-hidden size={14} strokeWidth={2} />
      {copied ? "Copied" : label}
    </button>
  );
}

export function CodeBlock({
  code,
}: {
  code: string;
}) {
  return (
    <pre
      style={{
        margin: 0,
        padding: 14,
        overflowX: "auto",
        fontSize: 12.5,
        lineHeight: 1.6,
        color: "#E5E7EB",
        background: "#111827",
        borderRadius: 10,
        fontFamily:
          "ui-monospace, SFMono-Regular, Menlo, monospace",
      }}
    >
      <code>{code}</code>
    </pre>
  );
}

/* ------------------------------------------------------------
   The snippet a merchant copies, pinned to one campaign.
   data-campaign narrows the website down to that campaign only;
   the campaign's own device, frequency and cooldown rules still
   apply on top.

   There is no shop-wide variant any more: every snippet is
   handed out from inside a campaign, so the code someone copies
   is always tied to what they were looking at.
   ------------------------------------------------------------ */

export function buildCampaignSnippet(
  appUrl: string,
  shop: string,
  campaignId: string,
) {
  return [
    "<script",
    `  src="${appUrl}/mq-widget.js"`,
    `  data-shop="${shop}"`,
    `  data-campaign="${campaignId}"`,
    "  async",
    "></script>",
  ].join("\n");
}
