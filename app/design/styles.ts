/* ============================================================
   MQ COMPONENT STYLES

   Style factories for the recurring UI in this app — buttons,
   inputs, cards, badges, modals, tables, skeletons.

   These return plain `CSSProperties` so they drop straight into
   the existing inline-style markup without changing a single
   handler, prop or piece of logic. Interaction states that CSS
   can own (hover/active/focus-visible) live in `motion.css`,
   keyed off the `data-mq` attributes these helpers set — so a
   component gets full state feedback without React state.
   ============================================================ */

import type { CSSProperties } from "react";

import {
  color,
  danger,
  fontFamily,
  fontWeight,
  layout,
  neutral,
  radius,
  shadow,
  space,
  text,
  transition,
  zIndex,
} from "./tokens";

/* ------------------------------------------------------------
   BUTTON
------------------------------------------------------------ */

export type ButtonVariant =
  | "primary"
  | "secondary"
  | "tertiary"
  | "accent"
  | "danger";

export type ButtonSize = "sm" | "md" | "lg";

const buttonPadding: Record<ButtonSize, string> = {
  sm: `0 ${space[5]}`,
  md: `0 ${space[6]}`,
  lg: `0 ${space[7]}`,
};

const buttonHeight: Record<ButtonSize, string> = {
  sm: layout.controlSm,
  md: layout.controlMd,
  lg: layout.controlLg,
};

const buttonFontSize: Record<ButtonSize, string> = {
  sm: "12px",
  md: "13px",
  lg: "14px",
};

export function button(
  variant: ButtonVariant = "primary",
  size: ButtonSize = "md",
  options: { disabled?: boolean; fullWidth?: boolean } = {},
): CSSProperties {
  const base: CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: space[4],
    height: buttonHeight[size],
    padding: buttonPadding[size],
    width: options.fullWidth ? "100%" : undefined,
    fontFamily: fontFamily.sans,
    fontSize: buttonFontSize[size],
    fontWeight: fontWeight.semibold,
    letterSpacing: "-0.004em",
    lineHeight: 1,
    borderRadius: radius.md,
    borderStyle: "solid",
    borderWidth: "1px",
    cursor: options.disabled ? "not-allowed" : "pointer",
    opacity: options.disabled ? 0.55 : 1,
    whiteSpace: "nowrap",
    transition: transition.base,
    /* keeps the press animation from blurring text */
    backfaceVisibility: "hidden",
  };

  switch (variant) {
    case "primary":
      return {
        ...base,
        background: color.primary,
        borderColor: color.primary,
        color: color.textOnFilled,
        boxShadow: shadow.xs,
      };

    case "accent":
      return {
        ...base,
        background: color.accent,
        borderColor: color.accent,
        color: color.textOnFilled,
        boxShadow: shadow.xs,
      };

    case "secondary":
      return {
        ...base,
        background: color.surface,
        borderColor: color.borderStrong,
        color: color.primary,
        boxShadow: shadow.xs,
      };

    case "tertiary":
      return {
        ...base,
        background: "transparent",
        borderColor: "transparent",
        color: color.text,
      };

    case "danger":
      return {
        ...base,
        background: color.dangerSurface,
        borderColor: color.dangerBorder,
        color: color.dangerText,
      };
  }
}

/* Attribute spread that wires a control into motion.css so it
   gets hover lift, press scale and a focus ring for free. */
export const interactive = {
  "data-mq": "interactive",
} as const;

export const pressable = {
  "data-mq": "pressable",
} as const;

/* ------------------------------------------------------------
   INPUT / TEXTAREA / SELECT
------------------------------------------------------------ */

export function input(
  options: { invalid?: boolean; size?: ButtonSize } = {},
): CSSProperties {
  const size = options.size ?? "md";

  return {
    width: "100%",
    boxSizing: "border-box",
    height: size === "sm" ? layout.controlSm : layout.controlMd,
    padding: `0 ${space[5]}`,
    fontFamily: fontFamily.sans,
    fontSize: text.body.fontSize,
    color: color.textStrong,
    background: options.invalid
      ? color.dangerSurface
      : color.surface,
    border: `1px solid ${
      options.invalid ? danger[400] : color.border
    }`,
    borderRadius: radius.md,
    outline: "none",
    transition: transition.base,
  };
}

export function textarea(
  options: { invalid?: boolean } = {},
): CSSProperties {
  return {
    ...input(options),
    height: "auto",
    minHeight: "96px",
    padding: `${space[5]} ${space[5]}`,
    lineHeight: text.body.lineHeight,
    resize: "vertical",
  };
}

export function fieldLabel(): CSSProperties {
  return {
    display: "block",
    marginBottom: space[4],
    ...text.label,
    color: color.text,
  };
}

export function fieldHint(
  options: { invalid?: boolean } = {},
): CSSProperties {
  return {
    ...text.bodySm,
    color: options.invalid
      ? color.dangerText
      : color.textMuted,
  };
}

/* ------------------------------------------------------------
   CARD / SURFACE
------------------------------------------------------------ */

export function card(
  options: {
    padding?: keyof typeof space;
    elevation?: "flat" | "raised" | "floating";
    selected?: boolean;
    interactive?: boolean;
  } = {},
): CSSProperties {
  const elevation = options.elevation ?? "flat";

  return {
    background: options.selected
      ? color.surfaceSelected
      : color.surface,
    border: `1px solid ${
      options.selected ? color.primary : color.border
    }`,
    borderRadius: radius.lg,
    padding:
      options.padding === undefined
        ? undefined
        : space[options.padding],
    boxShadow:
      elevation === "floating"
        ? shadow.lg
        : elevation === "raised"
          ? shadow.sm
          : shadow.xs,
    cursor: options.interactive ? "pointer" : undefined,
    transition: transition.base,
    boxSizing: "border-box",
  };
}

export function sectionHeader(): CSSProperties {
  return {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space[5],
    padding: `${space[6]} ${space[7]}`,
    borderBottom: `1px solid ${color.borderSubtle}`,
  };
}

/* ------------------------------------------------------------
   BADGE
------------------------------------------------------------ */

export type BadgeTone =
  | "neutral"
  | "success"
  | "warning"
  | "danger"
  | "info"
  | "accent";

export function badge(
  tone: BadgeTone = "neutral",
): CSSProperties {
  const tones: Record<
    BadgeTone,
    { bg: string; fg: string }
  > = {
    neutral: { bg: neutral[100], fg: color.textMuted },
    success: {
      bg: color.successSurface,
      fg: color.successText,
    },
    warning: {
      bg: color.warningSurface,
      fg: color.warningText,
    },
    danger: {
      bg: color.dangerSurface,
      fg: color.dangerText,
    },
    info: { bg: color.infoSurface, fg: color.infoText },
    accent: {
      bg: color.accentSubtle,
      fg: color.accentOnSubtle,
    },
  };

  return {
    display: "inline-flex",
    alignItems: "center",
    gap: space[2],
    padding: `${space[1]} ${space[3]}`,
    borderRadius: radius.sm,
    background: tones[tone].bg,
    color: tones[tone].fg,
    fontSize: "10px",
    fontWeight: fontWeight.bold,
    letterSpacing: "0.03em",
    lineHeight: 1.4,
    whiteSpace: "nowrap",
  };
}

/* ------------------------------------------------------------
   MODAL
------------------------------------------------------------ */

export function modalOverlay(): CSSProperties {
  return {
    position: "fixed",
    inset: 0,
    zIndex: zIndex.overlay,
    background: "rgba(23, 32, 51, 0.46)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: space[7],
    boxSizing: "border-box",
    overflowY: "auto",
  };
}

export function modalPanel(
  options: { width?: string } = {},
): CSSProperties {
  return {
    width: "100%",
    maxWidth: options.width ?? "480px",
    background: color.surface,
    borderRadius: radius.xl,
    boxShadow: shadow.xl,
    boxSizing: "border-box",
    overflow: "hidden",
  };
}

/* ------------------------------------------------------------
   TABLE
------------------------------------------------------------ */

export function tableHead(
  gridTemplateColumns: string,
): CSSProperties {
  return {
    display: "grid",
    gridTemplateColumns,
    gap: space[5],
    alignItems: "center",
    padding: `${space[5]} ${space[7]}`,
    background: color.surfaceSunken,
    borderBottom: `1px solid ${color.borderSubtle}`,
    color: color.textSubtle,
    ...text.eyebrow,
    fontSize: "10px",
  };
}

export function tableRow(
  gridTemplateColumns: string,
  options: { selected?: boolean } = {},
): CSSProperties {
  return {
    display: "grid",
    gridTemplateColumns,
    gap: space[5],
    alignItems: "center",
    padding: `${space[6]} ${space[7]}`,
    borderBottom: `1px solid ${color.borderSubtle}`,
    background: options.selected
      ? color.surfaceSelected
      : color.surface,
    transition: transition.base,
    boxSizing: "border-box",
  };
}

/* ------------------------------------------------------------
   SKELETON

   Pair with `data-mq="skeleton"` so motion.css runs the
   shimmer and stops it under prefers-reduced-motion.
------------------------------------------------------------ */

export function skeleton(
  options: { width?: string; height?: string; circle?: boolean } = {},
): CSSProperties {
  return {
    width: options.width ?? "100%",
    height: options.height ?? "12px",
    borderRadius: options.circle
      ? radius.circle
      : radius.sm,
    background: neutral[100],
    backgroundImage: `linear-gradient(90deg, ${neutral[100]} 0%, ${neutral[50]} 50%, ${neutral[100]} 100%)`,
    backgroundSize: "200% 100%",
  };
}

/* ------------------------------------------------------------
   EMPTY STATE
------------------------------------------------------------ */

export function emptyState(): CSSProperties {
  return {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: space[4],
    minHeight: "260px",
    padding: space[9],
    textAlign: "center",
    color: color.textMuted,
    ...text.body,
  };
}

/* ------------------------------------------------------------
   PAGE SCAFFOLD
------------------------------------------------------------ */

export function pageHeader(): CSSProperties {
  return {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: space[7],
    flexWrap: "wrap",
    paddingBottom: space[7],
  };
}

export function pageTitle(): CSSProperties {
  return {
    margin: 0,
    ...text.h1,
    color: color.textStrong,
  };
}

export function pageSubtitle(): CSSProperties {
  return {
    margin: `${space[3]} 0 0`,
    ...text.bodyLg,
    color: color.textMuted,
  };
}

export function eyebrow(
  tone: "accent" | "muted" = "accent",
): CSSProperties {
  return {
    ...text.eyebrow,
    color:
      tone === "accent"
        ? color.accentOnSubtle
        : color.textSubtle,
  };
}
