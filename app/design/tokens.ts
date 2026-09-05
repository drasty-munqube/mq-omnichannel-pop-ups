/* ============================================================
   MQ DESIGN TOKENS

   Single source of truth for every visual value in the admin.
   The app styles with inline `style={{}}` objects, so tokens
   ship as a typed module rather than CSS variables — import
   what you need instead of hardcoding hex values.

   Derived from the palette already in use so the redesign
   stays recognisable: navy #0B3D66, purple #7651D8,
   ink #172033. The duplicate greys (11 of them) collapse
   into one cool-neutral ramp.
   ============================================================ */

/* ------------------------------------------------------------
   COLOR
------------------------------------------------------------ */

export const navy = {
  50: "#F2F7FB",
  100: "#E3EDF6",
  200: "#C3D9EA",
  300: "#93BAD7",
  400: "#4E8CBC",
  500: "#0F4D80",
  600: "#0B3D66",
  700: "#082D4C",
  800: "#061F35",
  900: "#04141F",
} as const;

export const purple = {
  50: "#F4F0FE",
  100: "#E6DDFC",
  200: "#CFC0F8",
  300: "#B39BF1",
  400: "#9576E6",
  500: "#7651D8",
  600: "#6546D7",
  700: "#5335B0",
  800: "#3F2887",
} as const;

export const neutral = {
  0: "#FFFFFF",
  25: "#FAFBFC",
  50: "#F6F7F9",
  100: "#EEF1F4",
  200: "#E1E6EC",
  300: "#CBD3DC",
  400: "#9AA6B4",
  500: "#6B7785",
  600: "#4F5B6B",
  700: "#374151",
  800: "#232D3B",
  900: "#172033",
} as const;

export const success = {
  50: "#E7F7EF",
  100: "#CDEEDF",
  400: "#1FAF6E",
  500: "#18946A",
  600: "#157A50",
  700: "#0F5C3C",
} as const;

export const warning = {
  50: "#FFF8E8",
  100: "#FBEBC6",
  400: "#E0A722",
  600: "#B4780A",
  700: "#8A5A00",
} as const;

export const danger = {
  50: "#FEF3F2",
  100: "#FBDDDB",
  300: "#F0B9B9",
  400: "#E0574F",
  600: "#C62828",
  700: "#9F1F1F",
} as const;

export const info = {
  50: "#EDF5FF",
  500: "#1677FF",
  600: "#0F5FD1",
} as const;

/* Semantic aliases — prefer these in components.
   Swapping a brand color should mean editing this block only. */

export const color = {
  /* brand */
  primary: navy[600],
  primaryHover: navy[500],
  primaryPressed: navy[700],
  primarySubtle: navy[50],
  primaryOnSubtle: navy[600],

  accent: purple[500],
  accentHover: purple[400],
  accentPressed: purple[600],
  accentSubtle: purple[50],
  accentOnSubtle: purple[600],

  /* text */
  textStrong: neutral[900],
  text: neutral[700],
  textMuted: neutral[500],
  textSubtle: neutral[400],
  textOnFilled: neutral[0],

  /* surfaces */
  surface: neutral[0],
  surfaceRaised: neutral[0],
  surfaceSunken: neutral[50],
  surfaceHover: neutral[25],
  surfaceSelected: navy[50],
  canvas: neutral[50],

  /* lines */
  border: neutral[200],
  borderStrong: neutral[300],
  borderSubtle: neutral[100],
  borderFocus: purple[500],

  /* status */
  successText: success[600],
  successSurface: success[50],
  successSolid: success[400],

  warningText: warning[600],
  warningSurface: warning[50],
  warningSolid: warning[400],

  dangerText: danger[600],
  dangerSurface: danger[50],
  dangerBorder: danger[300],
  dangerSolid: danger[600],

  infoText: info[600],
  infoSurface: info[50],
  infoSolid: info[500],
} as const;

/* ------------------------------------------------------------
   TYPOGRAPHY

   Inter is already served from Shopify's CDN in root.tsx and is
   the Shopify admin's own face, so UI text stays native. Large
   headings get tightened tracking for the premium feel rather
   than a second font (no extra network request, no clash).
------------------------------------------------------------ */

export const fontFamily = {
  sans: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif',
  mono: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace',
} as const;

export const fontWeight = {
  regular: 400,
  medium: 500,
  semibold: 600,
  bold: 700,
} as const;

type TextStyle = {
  fontSize: string;
  lineHeight: string | number;
  fontWeight: number;
  letterSpacing: string;
  textTransform?: "uppercase";
};

export const text: Record<
  | "display"
  | "h1"
  | "h2"
  | "h3"
  | "h4"
  | "bodyLg"
  | "body"
  | "bodySm"
  | "label"
  | "caption"
  | "eyebrow",
  TextStyle
> = {
  display: {
    fontSize: "30px",
    lineHeight: "1.2",
    fontWeight: fontWeight.bold,
    letterSpacing: "-0.021em",
  },
  h1: {
    fontSize: "24px",
    lineHeight: "1.25",
    fontWeight: fontWeight.bold,
    letterSpacing: "-0.018em",
  },
  h2: {
    fontSize: "20px",
    lineHeight: "1.3",
    fontWeight: fontWeight.semibold,
    letterSpacing: "-0.014em",
  },
  h3: {
    fontSize: "16px",
    lineHeight: "1.4",
    fontWeight: fontWeight.semibold,
    letterSpacing: "-0.008em",
  },
  h4: {
    fontSize: "14px",
    lineHeight: "1.45",
    fontWeight: fontWeight.semibold,
    letterSpacing: "-0.004em",
  },
  bodyLg: {
    fontSize: "14px",
    lineHeight: "1.55",
    fontWeight: fontWeight.regular,
    letterSpacing: "0",
  },
  body: {
    fontSize: "13px",
    lineHeight: "1.55",
    fontWeight: fontWeight.regular,
    letterSpacing: "0",
  },
  bodySm: {
    fontSize: "12px",
    lineHeight: "1.5",
    fontWeight: fontWeight.regular,
    letterSpacing: "0",
  },
  label: {
    fontSize: "12px",
    lineHeight: "1.4",
    fontWeight: fontWeight.semibold,
    letterSpacing: "0",
  },
  caption: {
    fontSize: "11px",
    lineHeight: "1.4",
    fontWeight: fontWeight.medium,
    letterSpacing: "0.005em",
  },
  eyebrow: {
    fontSize: "11px",
    lineHeight: "1.2",
    fontWeight: fontWeight.bold,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
  },
};

/* ------------------------------------------------------------
   SPACE / RADIUS / SHADOW
------------------------------------------------------------ */

export const space = {
  0: "0px",
  1: "2px",
  2: "4px",
  3: "6px",
  4: "8px",
  5: "12px",
  6: "16px",
  7: "20px",
  8: "24px",
  9: "32px",
  10: "40px",
  11: "48px",
  12: "64px",
} as const;

export const radius = {
  sm: "6px",
  md: "8px",
  lg: "12px",
  xl: "16px",
  pill: "999px",
  circle: "50%",
} as const;

export const shadow = {
  none: "none",
  xs: "0 1px 2px rgba(23, 32, 51, 0.05)",
  sm: "0 1px 3px rgba(23, 32, 51, 0.07), 0 1px 2px rgba(23, 32, 51, 0.04)",
  md: "0 4px 12px rgba(23, 32, 51, 0.08), 0 1px 3px rgba(23, 32, 51, 0.05)",
  lg: "0 12px 28px rgba(23, 32, 51, 0.12), 0 4px 8px rgba(23, 32, 51, 0.06)",
  xl: "0 24px 56px rgba(23, 32, 51, 0.18), 0 8px 16px rgba(23, 32, 51, 0.08)",
  focus: `0 0 0 3px ${purple[100]}`,
  focusStrong: "0 0 0 3px rgba(118, 81, 216, 0.32)",
} as const;

/* ------------------------------------------------------------
   MOTION

   Transform/opacity only, 150-400ms, natural easing.
   Every consumer must degrade under prefers-reduced-motion —
   `motion.css` handles that globally.
------------------------------------------------------------ */

export const duration = {
  instant: "100ms",
  fast: "150ms",
  base: "200ms",
  slow: "300ms",
  slower: "400ms",
} as const;

export const easing = {
  /* decelerate — entering elements */
  out: "cubic-bezier(0.16, 1, 0.3, 1)",
  /* accelerate — leaving elements */
  in: "cubic-bezier(0.4, 0, 1, 1)",
  /* standard — state changes, hovers */
  standard: "cubic-bezier(0.2, 0, 0, 1)",
  /* slight overshoot — press/pop feedback */
  spring: "cubic-bezier(0.34, 1.4, 0.64, 1)",
} as const;

/* Ready-made transition strings for inline styles. */
export const transition = {
  base: `background-color ${duration.base} ${easing.standard}, border-color ${duration.base} ${easing.standard}, color ${duration.base} ${easing.standard}, box-shadow ${duration.base} ${easing.standard}, transform ${duration.fast} ${easing.standard}`,
  transform: `transform ${duration.fast} ${easing.standard}`,
  fade: `opacity ${duration.base} ${easing.standard}`,
} as const;

/* ------------------------------------------------------------
   LAYOUT
------------------------------------------------------------ */

export const layout = {
  /* control heights — was 34/38/40/44 at random */
  controlSm: "32px",
  controlMd: "38px",
  controlLg: "44px",
  /* the builder's three panes */
  builderLeftPane: "280px",
  builderRightPane: "400px",
  /* breakpoints, for matchMedia and container queries */
  breakpoint: {
    sm: 640,
    md: 900,
    lg: 1200,
    xl: 1500,
  },
} as const;

export const zIndex = {
  dropdown: 20,
  sticky: 40,
  overlay: 9000,
  modal: 9500,
  toast: 9900,
} as const;
