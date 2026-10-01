/* ============================================================
   REFERENCE LINK

   A page address or referrer shown in the admin (visitor pages,
   the contact Journey, email Logs). A web address opens in a new
   tab, with the Lucide external-link icon after it. Anything else
   (a relative path, "android-app://...") is shown as plain text
   with a link icon, and is never made clickable.
   ============================================================ */

import { ExternalLink, Link2 } from "lucide-react";
import type { CSSProperties } from "react";

import { color, fontWeight } from "../design/tokens";

const isWebUrl = (value: string) => /^https?:\/\//i.test(value);

export function RefLink({
  url,
  short = false,
  nowrap = false,
  style,
}: {
  url: string;
  /* Hide the "https://" in the visible text. */
  short?: boolean;
  /* One line, cut with an ellipsis (the full address is the tooltip). */
  nowrap?: boolean;
  style?: CSSProperties;
}) {
  const label = short ? url.replace(/^https?:\/\//i, "") : url;
  const textStyle: CSSProperties = nowrap
    ? { minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }
    : { minWidth: 0, overflowWrap: "anywhere" };
  const wrap: CSSProperties = { display: "inline-flex", alignItems: "center", gap: "4px", maxWidth: "100%", minWidth: 0, ...style };

  if (!isWebUrl(url)) {
    return (
      <span title={url} style={wrap}>
        <Link2 aria-hidden size={13} strokeWidth={2} style={{ flexShrink: 0, color: color.textSubtle }} />
        <span style={textStyle}>{label}</span>
      </span>
    );
  }

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      title={url}
      style={{ ...wrap, color: color.primary, fontWeight: fontWeight.medium, textDecoration: "none" }}
    >
      <span style={textStyle}>{label}</span>
      <ExternalLink aria-hidden size={13} strokeWidth={2} style={{ flexShrink: 0 }} />
    </a>
  );
}
