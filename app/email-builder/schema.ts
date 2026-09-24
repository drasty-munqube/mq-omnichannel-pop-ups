/* ============================================================
   EMAIL TEMPLATE SCHEMA

   The JSON document a template is saved as, and the registry of
   block types the builder offers.

   This file has no imports on purpose. The builder (browser),
   the API (server) and the renderer all share it, and plain
   Node scripts and tests can load it directly.

   Adding a block type later means: add its props type and a
   union member here, a default in BLOCK_DEFAULTS, a palette
   entry in BLOCK_LIBRARY, a rule in validate.ts, a case in
   render.ts, and a form in the properties panel. Nothing else
   needs to know it exists.
   ============================================================ */

/* Bump when the shape changes, and teach migrateTemplate() in
   validate.ts to upgrade the older shape. Saved templates keep
   the version they were written with. */
export const TEMPLATE_VERSION = 1;

export type Alignment = "left" | "center" | "right";

export type FontKey =
  | "sans"
  | "helvetica"
  | "georgia"
  | "times"
  | "courier"
  | "verdana"
  | "trebuchet";

/* Only these stacks can reach the rendered HTML. A saved font is
   a key, never a raw CSS string, so nothing typed into the
   builder can be smuggled into a style attribute. */
export const FONT_STACKS: Record<FontKey, { label: string; css: string }> = {
  sans: {
    label: "System sans",
    css: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
  },
  helvetica: { label: "Helvetica / Arial", css: "Helvetica, Arial, sans-serif" },
  verdana: { label: "Verdana", css: "Verdana, Geneva, sans-serif" },
  trebuchet: { label: "Trebuchet", css: "'Trebuchet MS', Helvetica, sans-serif" },
  georgia: { label: "Georgia", css: "Georgia, 'Times New Roman', serif" },
  times: { label: "Times", css: "'Times New Roman', Times, serif" },
  courier: { label: "Courier", css: "'Courier New', Courier, monospace" },
};

export const FONT_WEIGHTS = [400, 500, 600, 700, 800] as const;

/* ------------------------------------------------------------
   BLOCK PROPERTIES
------------------------------------------------------------ */

export type TextProps = {
  text: string;
  fontSize: number;
  fontFamily: FontKey;
  fontWeight: number;
  color: string;
  alignment: Alignment;
  lineHeight: number;
  padding: number;
  margin: number;
};

export type HeadingProps = {
  text: string;
  level: "h1" | "h2" | "h3";
  fontSize: number;
  fontFamily: FontKey;
  fontWeight: number;
  color: string;
  alignment: Alignment;
  padding: number;
};

export type ImageProps = {
  src: string;
  alt: string;
  /* pixels; 0 means "fill the available width" */
  width: number;
  /* pixels; 0 means "keep the aspect ratio" */
  height: number;
  alignment: Alignment;
  linkUrl: string;
  borderRadius: number;
  padding: number;
};

export type ButtonProps = {
  text: string;
  url: string;
  backgroundColor: string;
  textColor: string;
  fontSize: number;
  borderRadius: number;
  width: "auto" | "full";
  alignment: Alignment;
  padding: number;
};

export type DividerProps = {
  color: string;
  thickness: number;
  /* percent of the row */
  width: number;
  margin: number;
  alignment: Alignment;
};

export type SpacerProps = {
  height: number;
};

export type ColumnsProps = {
  ratio: "50-50" | "33-67" | "67-33";
  gap: number;
  padding: number;
};

export type SocialNetwork =
  | "instagram"
  | "facebook"
  | "linkedin"
  | "x"
  | "website";

export const SOCIAL_NETWORKS: { key: SocialNetwork; label: string }[] = [
  { key: "instagram", label: "Instagram" },
  { key: "facebook", label: "Facebook" },
  { key: "linkedin", label: "LinkedIn" },
  { key: "x", label: "X" },
  { key: "website", label: "Website" },
];

export type SocialLink = { enabled: boolean; url: string };

export type SocialProps = {
  links: Record<SocialNetwork, SocialLink>;
  alignment: Alignment;
  color: string;
  textColor: string;
  fontSize: number;
  padding: number;
};

export type FooterProps = {
  text: string;
  companyName: string;
  address: string;
  unsubscribeText: string;
  unsubscribeUrl: string;
  alignment: Alignment;
  fontSize: number;
  color: string;
  padding: number;
};

/* ------------------------------------------------------------
   BLOCKS
------------------------------------------------------------ */

type BlockOf<T extends string, P> = {
  id: string;
  type: T;
  properties: P;
};

export type TextBlock = BlockOf<"text", TextProps>;
export type HeadingBlock = BlockOf<"heading", HeadingProps>;
export type ImageBlock = BlockOf<"image", ImageProps>;
export type ButtonBlock = BlockOf<"button", ButtonProps>;
export type DividerBlock = BlockOf<"divider", DividerProps>;
export type SpacerBlock = BlockOf<"spacer", SpacerProps>;
export type SocialBlock = BlockOf<"social", SocialProps>;
export type FooterBlock = BlockOf<"footer", FooterProps>;

/* A leaf is anything that is not a container. */
export type LeafBlock =
  | TextBlock
  | HeadingBlock
  | ImageBlock
  | ButtonBlock
  | DividerBlock
  | SpacerBlock
  | SocialBlock
  | FooterBlock;

export type ColumnsBlock = BlockOf<"columns", ColumnsProps> & {
  /* always two columns for now; each holds leaf blocks only */
  columns: [LeafBlock[], LeafBlock[]];
};

export type Block = LeafBlock | ColumnsBlock;
export type BlockType = Block["type"];

export type BlockPropsMap = {
  text: TextProps;
  heading: HeadingProps;
  image: ImageProps;
  button: ButtonProps;
  divider: DividerProps;
  spacer: SpacerProps;
  columns: ColumnsProps;
  social: SocialProps;
  footer: FooterProps;
};

/* Which blocks may sit inside a column. Columns never nest, and
   a footer belongs at the bottom of the email, not in a cell. */
export const COLUMN_CHILD_TYPES: BlockType[] = [
  "text",
  "heading",
  "image",
  "button",
  "divider",
  "spacer",
  "social",
];

export function canNestInColumn(type: BlockType) {
  return COLUMN_CHILD_TYPES.includes(type);
}

/* ------------------------------------------------------------
   TEMPLATE
------------------------------------------------------------ */

/* Page = the area around the email. Body = the email itself. */
export type TemplateSettings = {
  /* page */
  backgroundColor: string;
  padding: number;
  /* body */
  alignment: Alignment;
  width: number;
  contentBackgroundColor: string;
  contentPadding: number;
  borderRadius: number;
  borderWidth: number;
  borderColor: string;
  fontFamily: FontKey;
};

export type TemplateEmail = {
  subject: string;
  previewText: string;
  fromName: string;
  replyTo: string;
};

export type EmailTemplateDoc = {
  version: number;
  settings: TemplateSettings;
  email: TemplateEmail;
  blocks: Block[];
};

export const LIMITS = {
  minWidth: 320,
  maxWidth: 800,
  maxBlocks: 150,
  maxText: 5000,
  maxShortText: 250,
  maxName: 120,
  maxUrl: 2000,
} as const;

/* ------------------------------------------------------------
   DYNAMIC VARIABLES

   Saved exactly as typed ({{customer.firstName}}); replaced only
   at render time, with sample values in the builder and real
   values when sending.
------------------------------------------------------------ */

export const EMAIL_VARIABLES: {
  key: string;
  label: string;
  sample: string;
}[] = [
  { key: "customer.firstName", label: "Customer first name", sample: "John" },
  { key: "customer.lastName", label: "Customer last name", sample: "Doe" },
  { key: "customer.email", label: "Customer email", sample: "john@example.com" },
  { key: "shop.name", label: "Shop name", sample: "MunQube" },
  { key: "shop.url", label: "Shop URL", sample: "https://example.com" },
  { key: "campaign.name", label: "Campaign name", sample: "Summer Campaign" },
  { key: "discount.code", label: "Discount code", sample: "SAVE10" },
  { key: "unsubscribeUrl", label: "Unsubscribe URL", sample: "https://example.com/unsubscribe" },
];

export const VARIABLE_KEYS = EMAIL_VARIABLES.map((v) => v.key);

export function sampleVariables(
  overrides: Record<string, string> = {},
): Record<string, string> {
  const values: Record<string, string> = {};
  for (const variable of EMAIL_VARIABLES) {
    values[variable.key] = variable.sample;
  }
  return { ...values, ...overrides };
}

export function variableToken(key: string) {
  return `{{${key}}}`;
}

/* ------------------------------------------------------------
   DEFAULTS
------------------------------------------------------------ */

export const BLOCK_DEFAULTS: { [K in BlockType]: () => BlockPropsMap[K] } = {
  text: () => ({
    text: "Hello {{customer.firstName}},\n\nThanks for being part of {{shop.name}}.",
    fontSize: 16,
    fontFamily: "sans",
    fontWeight: 400,
    color: "#374151",
    alignment: "left",
    lineHeight: 1.6,
    padding: 12,
    margin: 0,
  }),
  heading: () => ({
    text: "Welcome, {{customer.firstName}}",
    level: "h1",
    fontSize: 28,
    fontFamily: "sans",
    fontWeight: 700,
    color: "#172033",
    alignment: "center",
    padding: 12,
  }),
  image: () => ({
    src: "",
    alt: "",
    width: 0,
    height: 0,
    alignment: "center",
    linkUrl: "",
    borderRadius: 0,
    padding: 12,
  }),
  button: () => ({
    text: "Visit store",
    url: "{{shop.url}}",
    backgroundColor: "#0B3D66",
    textColor: "#FFFFFF",
    fontSize: 16,
    borderRadius: 6,
    width: "auto",
    alignment: "center",
    padding: 12,
  }),
  divider: () => ({
    color: "#E1E6EC",
    thickness: 1,
    width: 100,
    margin: 16,
    alignment: "center",
  }),
  spacer: () => ({ height: 24 }),
  columns: () => ({ ratio: "50-50", gap: 16, padding: 12 }),
  social: () => ({
    links: {
      instagram: { enabled: true, url: "https://instagram.com/" },
      facebook: { enabled: true, url: "https://facebook.com/" },
      linkedin: { enabled: false, url: "" },
      x: { enabled: false, url: "" },
      website: { enabled: true, url: "{{shop.url}}" },
    },
    alignment: "center",
    color: "#EEF1F4",
    textColor: "#172033",
    fontSize: 13,
    padding: 12,
  }),
  footer: () => ({
    text: "You are receiving this email because you signed up at {{shop.name}}.",
    companyName: "{{shop.name}}",
    address: "",
    unsubscribeText: "Unsubscribe",
    unsubscribeUrl: "{{unsubscribeUrl}}",
    alignment: "center",
    fontSize: 12,
    color: "#6B7785",
    padding: 16,
  }),
};

/* The palette, in the order the component panel shows it. */
export const BLOCK_LIBRARY: {
  type: BlockType;
  label: string;
  description: string;
  icon: string;
}[] = [
  { type: "heading", label: "Heading", description: "H1, H2 or H3 title", icon: "H" },
  { type: "text", label: "Text", description: "Paragraph copy", icon: "¶" },
  { type: "image", label: "Image", description: "Picture or logo", icon: "▣" },
  { type: "button", label: "Button", description: "Call to action", icon: "▭" },
  { type: "divider", label: "Divider", description: "Horizontal rule", icon: "—" },
  { type: "spacer", label: "Spacer", description: "Vertical space", icon: "↕" },
  { type: "columns", label: "Columns", description: "Two side-by-side cells", icon: "▥" },
  { type: "social", label: "Social", description: "Social profile links", icon: "@" },
  { type: "footer", label: "Footer", description: "Legal and unsubscribe", icon: "▁" },
];

export function blockLabel(type: BlockType) {
  return BLOCK_LIBRARY.find((b) => b.type === type)?.label ?? type;
}

let idCounter = 0;

export function newBlockId() {
  idCounter = (idCounter + 1) % 1_000_000;
  const random = Math.random().toString(36).slice(2, 8);
  return `b_${Date.now().toString(36)}${idCounter.toString(36)}${random}`;
}

export function createBlock(type: BlockType): Block {
  if (type === "columns") {
    return {
      id: newBlockId(),
      type: "columns",
      properties: BLOCK_DEFAULTS.columns(),
      columns: [[], []],
    };
  }

  return {
    id: newBlockId(),
    type,
    properties: BLOCK_DEFAULTS[type](),
  } as LeafBlock;
}

export function defaultSettings(): TemplateSettings {
  return {
    backgroundColor: "#F5F5F5",
    padding: 24,
    alignment: "center",
    width: 600,
    contentBackgroundColor: "#FFFFFF",
    contentPadding: 0,
    borderRadius: 0,
    borderWidth: 0,
    borderColor: "#E1E6EC",
    fontFamily: "sans",
  };
}

/* A new template starts with a small, sensible layout rather
   than an empty page, so the preview shows something real. */
export function defaultTemplate(): EmailTemplateDoc {
  return {
    version: TEMPLATE_VERSION,
    settings: defaultSettings(),
    email: {
      subject: "Welcome {{customer.firstName}}",
      previewText: "Thanks for joining {{shop.name}}",
      fromName: "",
      replyTo: "",
    },
    blocks: [
      createBlock("heading"),
      createBlock("text"),
      createBlock("button"),
      createBlock("footer"),
    ],
  };
}

export function emptyTemplate(): EmailTemplateDoc {
  return {
    version: TEMPLATE_VERSION,
    settings: defaultSettings(),
    email: { subject: "", previewText: "", fromName: "", replyTo: "" },
    blocks: [],
  };
}
