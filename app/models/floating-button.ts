/* ============================================================
   FLOATING BUTTON (shared, browser-safe)

   The small button (the teaser) that opens a popup's offer. It is
   shown first when the campaign's trigger fires, and it comes back
   when a shopper closes the offer, so they can open it again.

   Chosen per campaign in the campaign wizard (Campaign.floatingButton),
   sent with each campaign to both widget scripts
   (extensions/mq-popup-embed and public/mq-widget.js), which keep
   the same five values.
   ============================================================ */

import type { CSSProperties } from "react";

export const FLOATING_BUTTON_POSITIONS = ["bottom_right", "bottom_left", "left_wall", "right_wall", "none"] as const;

export type FloatingButtonPosition = (typeof FLOATING_BUTTON_POSITIONS)[number];

/* Where it sat before this setting existed, so older popups look
   the same. */
export const DEFAULT_FLOATING_BUTTON: FloatingButtonPosition = "bottom_right";

export function normalizeFloatingButton(value: unknown): FloatingButtonPosition {
  return (FLOATING_BUTTON_POSITIONS as readonly string[]).includes(String(value))
    ? (value as FloatingButtonPosition)
    : DEFAULT_FLOATING_BUTTON;
}

export const FLOATING_BUTTON_OPTIONS: {
  value: FloatingButtonPosition;
  label: string;
  help: string;
  tag?: string;
}[] = [
  { value: "bottom_right", label: "Bottom right", help: "A small pill in the bottom right corner." },
  { value: "bottom_left", label: "Bottom left", help: "A small pill in the bottom left corner. Handy when a chat button already sits on the right." },
  { value: "left_wall", label: "Left edge", help: "A slim tab in the middle of the left edge of the screen." },
  { value: "right_wall", label: "Right edge", help: "A slim tab in the middle of the right edge of the screen." },
  {
    value: "none",
    label: "No floating button",
    help: "The offer opens on its own when the trigger fires. Once a shopper closes it, they cannot open it again on that page.",
    tag: "Fewer signups",
  },
];

/* Placement of the button inside a small preview frame. */
export function floatingButtonPreviewStyle(position: FloatingButtonPosition): CSSProperties {
  switch (position) {
    case "bottom_left":
      return { left: "16px", bottom: "16px" };
    case "left_wall":
      return {
        left: 0,
        top: "50%",
        writingMode: "vertical-rl",
        transform: "translateY(-50%) rotate(180deg)",
        borderRadius: "12px 0 0 12px",
      };
    case "right_wall":
      return { right: 0, top: "50%", writingMode: "vertical-rl", transform: "translateY(-50%)", borderRadius: "12px 0 0 12px" };
    default:
      return { right: "16px", bottom: "16px" };
  }
}

export const isEdgePosition = (position: FloatingButtonPosition) => position === "left_wall" || position === "right_wall";
