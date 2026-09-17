import { useState } from "react";

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
}: {
  value: string;
  label?: string;
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

  return (
    <button
      type="button"
      onClick={copy}
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
      }}
    >
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
   The one snippet every external website needs. Kept here so
   Settings and Websites can never drift apart.
   ------------------------------------------------------------ */

export function buildSnippet(
  appUrl: string,
  shop: string,
) {
  return [
    "<script",
    `  src="${appUrl}/mq-widget.js"`,
    `  data-shop="${shop}"`,
    "  async",
    "></script>",
  ].join("\n");
}

/* ------------------------------------------------------------
   Same snippet, pinned to one campaign. data-campaign narrows
   the website down to that campaign only; the campaign's own
   device, frequency and cooldown rules still apply on top.
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
