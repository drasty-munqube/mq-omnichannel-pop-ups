/* ============================================================
   SELECT

   The one dropdown used across the admin. It is the browser's own
   <select> (so keyboard, screen readers and mobile pickers work
   as usual), with the browser's arrow hidden and the Lucide
   chevron drawn in its place, the same in every browser.

   Takes every normal <select> prop. The width, max width, min
   width and flex from `style` go on the wrapper, so the select
   keeps the size its page gave it.
   ============================================================ */

import { ChevronDown } from "lucide-react";
import type { CSSProperties, SelectHTMLAttributes } from "react";

import { color } from "../design/tokens";

type Props = SelectHTMLAttributes<HTMLSelectElement> & { style?: CSSProperties };

export function Select({ style = {}, children, ...props }: Props) {
  const { width, maxWidth, minWidth, flex, margin, marginTop, marginBottom, ...rest } = style;
  const small = parseFloat(String(rest.fontSize ?? "14")) <= 12;
  const iconSize = small ? 14 : 16;

  return (
    <span
      style={{
        position: "relative",
        display: width === "100%" ? "flex" : "inline-flex",
        alignItems: "center",
        width,
        maxWidth,
        minWidth,
        flex,
        margin,
        marginTop,
        marginBottom,
        verticalAlign: "middle",
      }}
    >
      <select
        {...props}
        style={{
          ...rest,
          width: "100%",
          minWidth: 0,
          appearance: "none",
          WebkitAppearance: "none",
          MozAppearance: "none",
          paddingRight: small ? "28px" : "36px",
          textOverflow: "ellipsis",
          cursor: props.disabled ? "not-allowed" : rest.cursor ?? "pointer",
        }}
      >
        {children}
      </select>
      <ChevronDown
        aria-hidden
        size={iconSize}
        strokeWidth={2}
        style={{
          position: "absolute",
          right: small ? "9px" : "12px",
          pointerEvents: "none",
          color: typeof rest.color === "string" ? rest.color : color.textMuted,
          opacity: props.disabled ? 0.5 : 1,
        }}
      />
    </span>
  );
}
