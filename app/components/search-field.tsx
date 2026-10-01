/* ============================================================
   SEARCH FIELD

   A text input with the Lucide search icon inside it on the left.
   Takes every normal <input> prop. The width, max width, min width
   and flex from `style` go on the wrapper, so the field keeps the
   size its page gave it.
   ============================================================ */

import { Search } from "lucide-react";
import type { CSSProperties, InputHTMLAttributes } from "react";

import { color } from "../design/tokens";

type Props = InputHTMLAttributes<HTMLInputElement> & { style?: CSSProperties };

export function SearchField({ style = {}, type = "search", ...props }: Props) {
  const { width, maxWidth, minWidth, flex, ...rest } = style;

  return (
    <span style={{ position: "relative", display: "flex", alignItems: "center", width, maxWidth, minWidth, flex }}>
      <Search
        aria-hidden
        size={16}
        strokeWidth={2}
        style={{ position: "absolute", left: "12px", pointerEvents: "none", color: color.textSubtle }}
      />
      <input {...props} type={type} style={{ ...rest, width: "100%", minWidth: 0, paddingLeft: "36px" }} />
    </span>
  );
}
