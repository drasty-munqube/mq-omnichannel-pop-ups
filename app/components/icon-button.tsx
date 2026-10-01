/* ============================================================
   ICON BUTTON

   A square button that shows only a Lucide icon, for actions
   whose meaning the icon carries on its own (Refresh, Delete,
   Duplicate). The label is kept as the tooltip and for screen
   readers. While `busy`, the icon spins (Refresh) or dims, and
   the button is disabled.
   ============================================================ */

import type { LucideIcon } from "lucide-react";
import type { ButtonHTMLAttributes, CSSProperties } from "react";

import { button, type ButtonVariant } from "../design/styles";

const SPIN_CSS = "@keyframes mq-icon-spin{to{transform:rotate(360deg)}}";

export function IconButton({
  icon: Icon,
  label,
  busyLabel,
  busy = false,
  spin = false,
  variant = "secondary",
  size = "md",
  style,
  disabled,
  ...props
}: Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children" | "variant"> & {
  icon: LucideIcon;
  /* Tooltip and accessible name, e.g. "Refresh". */
  label: string;
  /* Said instead while busy, e.g. "Refreshing". */
  busyLabel?: string;
  busy?: boolean;
  /* Spin the icon while busy (for Refresh). */
  spin?: boolean;
  variant?: ButtonVariant;
  size?: "sm" | "md";
  style?: CSSProperties;
}) {
  const off = Boolean(disabled) || busy;
  const name = busy && busyLabel ? busyLabel : label;
  const base = button(variant, size, { disabled: off });

  return (
    <button
      type="button"
      {...props}
      disabled={off}
      aria-label={name}
      aria-busy={busy || undefined}
      title={name}
      style={{ ...base, width: base.height, padding: 0, flexShrink: 0, ...style }}
    >
      {busy && spin ? <style dangerouslySetInnerHTML={{ __html: SPIN_CSS }} /> : null}
      <Icon
        aria-hidden
        size={size === "sm" ? 15 : 17}
        strokeWidth={2}
        style={busy && spin ? { animation: "mq-icon-spin 900ms linear infinite" } : undefined}
      />
    </button>
  );
}
