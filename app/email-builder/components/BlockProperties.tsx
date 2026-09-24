/* ============================================================
   BLOCK PROPERTIES PANEL

   One form per block type. Every change is a partial patch of
   the block's properties; the builder applies it and the
   preview re-renders from the new document.
   ============================================================ */

import type { ReactNode } from "react";

import { color, space, text } from "../../design/tokens";
import {
  FONT_STACKS,
  FONT_WEIGHTS,
  SOCIAL_NETWORKS,
  type Block,
  type FontKey,
  type SocialNetwork,
} from "../schema";
import {
  ALIGN_OPTIONS,
  ColorInput,
  NumberInput,
  Segmented,
  SelectInput,
  TextInput,
  Toggle,
} from "./fields";

type Patch = Record<string, unknown>;

const FONT_OPTIONS = (Object.keys(FONT_STACKS) as FontKey[]).map((key) => ({
  value: key,
  label: FONT_STACKS[key].label,
}));

const WEIGHT_OPTIONS = FONT_WEIGHTS.map((w) => ({
  value: w as number,
  label:
    { 400: "Regular", 500: "Medium", 600: "Semibold", 700: "Bold", 800: "Extra bold" }[w] ??
    String(w),
}));

function Grid({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
        gap: space[5],
      }}
    >
      {children}
    </div>
  );
}

function Stack({ children }: { children: ReactNode }) {
  return <div style={{ display: "flex", flexDirection: "column", gap: space[6] }}>{children}</div>;
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section style={{ display: "flex", flexDirection: "column", gap: space[5] }}>
      <div style={{ ...text.eyebrow, color: color.textSubtle }}>{title}</div>
      {children}
    </section>
  );
}

export function BlockProperties({
  block,
  onChange,
  errorFor,
}: {
  block: Block;
  onChange: (patch: Patch, field: string) => void;
  errorFor: (field: string) => string | null;
}) {
  const set = (field: string) => (value: unknown) => onChange({ [field]: value }, field);

  switch (block.type) {
    case "text": {
      const p = block.properties;
      return (
        <Stack>
          <TextInput
            label="Text"
            multiline
            rows={6}
            variables
            value={p.text}
            onChange={set("text")}
            error={errorFor("text")}
            hint="Press Enter for a new line."
          />
          <Group title="Typography">
            <SelectInput label="Font" value={p.fontFamily} options={FONT_OPTIONS} onChange={set("fontFamily")} error={errorFor("fontFamily")} />
            <Grid>
              <NumberInput label="Font size" suffix="px" min={8} max={72} value={p.fontSize} onChange={set("fontSize")} error={errorFor("fontSize")} />
              <SelectInput label="Weight" value={p.fontWeight} options={WEIGHT_OPTIONS} onChange={set("fontWeight")} error={errorFor("fontWeight")} />
              <NumberInput label="Line height" step={0.1} min={1} max={3} value={p.lineHeight} onChange={set("lineHeight")} error={errorFor("lineHeight")} />
              <ColorInput label="Color" value={p.color} onChange={set("color")} error={errorFor("color")} />
            </Grid>
            <Segmented label="Alignment" value={p.alignment} options={ALIGN_OPTIONS} onChange={set("alignment")} />
          </Group>
          <Group title="Spacing">
            <Grid>
              <NumberInput label="Padding" suffix="px" min={0} max={80} value={p.padding} onChange={set("padding")} error={errorFor("padding")} />
              <NumberInput label="Margin" suffix="px" min={0} max={80} value={p.margin} onChange={set("margin")} error={errorFor("margin")} />
            </Grid>
          </Group>
        </Stack>
      );
    }

    case "heading": {
      const p = block.properties;
      return (
        <Stack>
          <TextInput label="Heading text" variables value={p.text} onChange={set("text")} error={errorFor("text")} />
          <Segmented
            label="Level"
            value={p.level}
            options={[
              { value: "h1", label: "H1" },
              { value: "h2", label: "H2" },
              { value: "h3", label: "H3" },
            ]}
            onChange={(level) =>
              onChange({ level, fontSize: level === "h1" ? 28 : level === "h2" ? 22 : 18 }, "level")
            }
          />
          <Group title="Typography">
            <SelectInput label="Font" value={p.fontFamily} options={FONT_OPTIONS} onChange={set("fontFamily")} />
            <Grid>
              <NumberInput label="Font size" suffix="px" min={12} max={72} value={p.fontSize} onChange={set("fontSize")} error={errorFor("fontSize")} />
              <SelectInput label="Weight" value={p.fontWeight} options={WEIGHT_OPTIONS} onChange={set("fontWeight")} />
            </Grid>
            <ColorInput label="Color" value={p.color} onChange={set("color")} error={errorFor("color")} />
            <Segmented label="Alignment" value={p.alignment} options={ALIGN_OPTIONS} onChange={set("alignment")} />
          </Group>
          <NumberInput label="Padding" suffix="px" min={0} max={80} value={p.padding} onChange={set("padding")} error={errorFor("padding")} />
        </Stack>
      );
    }

    case "image": {
      const p = block.properties;
      return (
        <Stack>
          <TextInput
            label="Image URL"
            type="url"
            placeholder="https://cdn.shopify.com/..."
            value={p.src}
            onChange={set("src")}
            error={errorFor("src")}
            hint="Use a public https:// link, such as a file from Shopify Content > Files."
          />
          <TextInput label="Alt text" value={p.alt} onChange={set("alt")} error={errorFor("alt")} hint="Shown when images are blocked, and read by screen readers." />
          <TextInput label="Link URL" type="url" variables placeholder="Optional" value={p.linkUrl} onChange={set("linkUrl")} error={errorFor("linkUrl")} />
          <Group title="Size">
            <Grid>
              <NumberInput label="Width" suffix="px" min={0} max={800} value={p.width} onChange={set("width")} error={errorFor("width")} hint="0 = full width" />
              <NumberInput label="Height" suffix="px" min={0} max={2000} value={p.height} onChange={set("height")} error={errorFor("height")} hint="0 = automatic" />
              <NumberInput label="Corner radius" suffix="px" min={0} max={200} value={p.borderRadius} onChange={set("borderRadius")} error={errorFor("borderRadius")} />
              <NumberInput label="Padding" suffix="px" min={0} max={80} value={p.padding} onChange={set("padding")} error={errorFor("padding")} />
            </Grid>
            <Segmented label="Alignment" value={p.alignment} options={ALIGN_OPTIONS} onChange={set("alignment")} />
          </Group>
        </Stack>
      );
    }

    case "button": {
      const p = block.properties;
      return (
        <Stack>
          <TextInput label="Button text" variables value={p.text} onChange={set("text")} error={errorFor("text")} />
          <TextInput label="Link URL" type="url" variables value={p.url} onChange={set("url")} error={errorFor("url")} />
          <Group title="Style">
            <Grid>
              <ColorInput label="Background" value={p.backgroundColor} onChange={set("backgroundColor")} error={errorFor("backgroundColor")} />
              <ColorInput label="Text color" value={p.textColor} onChange={set("textColor")} error={errorFor("textColor")} />
              <NumberInput label="Font size" suffix="px" min={10} max={40} value={p.fontSize} onChange={set("fontSize")} error={errorFor("fontSize")} />
              <NumberInput label="Corner radius" suffix="px" min={0} max={60} value={p.borderRadius} onChange={set("borderRadius")} error={errorFor("borderRadius")} />
              <NumberInput label="Padding" suffix="px" min={4} max={40} value={p.padding} onChange={set("padding")} error={errorFor("padding")} />
              <SelectInput
                label="Width"
                value={p.width}
                options={[
                  { value: "auto" as const, label: "Fit text" },
                  { value: "full" as const, label: "Full width" },
                ]}
                onChange={set("width")}
              />
            </Grid>
            <Segmented label="Alignment" value={p.alignment} options={ALIGN_OPTIONS} onChange={set("alignment")} />
          </Group>
        </Stack>
      );
    }

    case "divider": {
      const p = block.properties;
      return (
        <Stack>
          <ColorInput label="Color" value={p.color} onChange={set("color")} error={errorFor("color")} />
          <Grid>
            <NumberInput label="Thickness" suffix="px" min={1} max={20} value={p.thickness} onChange={set("thickness")} error={errorFor("thickness")} />
            <NumberInput label="Width" suffix="%" min={10} max={100} value={p.width} onChange={set("width")} error={errorFor("width")} />
            <NumberInput label="Margin" suffix="px" min={0} max={80} value={p.margin} onChange={set("margin")} error={errorFor("margin")} />
          </Grid>
          <Segmented label="Alignment" value={p.alignment} options={ALIGN_OPTIONS} onChange={set("alignment")} />
        </Stack>
      );
    }

    case "spacer":
      return (
        <Stack>
          <NumberInput label="Height" suffix="px" min={4} max={200} value={block.properties.height} onChange={set("height")} error={errorFor("height")} />
        </Stack>
      );

    case "columns": {
      const p = block.properties;
      return (
        <Stack>
          <SelectInput
            label="Layout"
            value={p.ratio}
            options={[
              { value: "50-50" as const, label: "Two equal columns" },
              { value: "33-67" as const, label: "Narrow left, wide right" },
              { value: "67-33" as const, label: "Wide left, narrow right" },
            ]}
            onChange={set("ratio")}
          />
          <Grid>
            <NumberInput label="Gap" suffix="px" min={0} max={60} value={p.gap} onChange={set("gap")} error={errorFor("gap")} />
            <NumberInput label="Padding" suffix="px" min={0} max={60} value={p.padding} onChange={set("padding")} error={errorFor("padding")} />
          </Grid>
          <p style={{ margin: 0, ...text.bodySm, color: color.textMuted }}>
            Drag blocks into either column. Columns stack on top of each other on phones.
            Columns and footers cannot go inside a column.
          </p>
        </Stack>
      );
    }

    case "social": {
      const p = block.properties;
      const setLink = (key: SocialNetwork, patch: Partial<{ enabled: boolean; url: string }>) =>
        onChange({ links: { ...p.links, [key]: { ...p.links[key], ...patch } } }, `links.${key}`);

      return (
        <Stack>
          {errorFor("links") ? (
            <span role="alert" style={{ ...text.bodySm, color: color.dangerText }}>
              {errorFor("links")}
            </span>
          ) : null}
          {SOCIAL_NETWORKS.map(({ key, label }) => (
            <div key={key} style={{ display: "flex", flexDirection: "column", gap: space[4] }}>
              <Toggle label={label} checked={p.links[key].enabled} onChange={(enabled) => setLink(key, { enabled })} />
              {p.links[key].enabled ? (
                <TextInput
                  label={`${label} URL`}
                  type="url"
                  variables={key === "website"}
                  value={p.links[key].url}
                  onChange={(url) => setLink(key, { url })}
                  error={errorFor(`links.${key}`)}
                />
              ) : null}
            </div>
          ))}
          <Group title="Style">
            <Grid>
              <ColorInput label="Button color" value={p.color} onChange={set("color")} error={errorFor("color")} />
              <ColorInput label="Text color" value={p.textColor} onChange={set("textColor")} error={errorFor("textColor")} />
              <NumberInput label="Font size" suffix="px" min={10} max={24} value={p.fontSize} onChange={set("fontSize")} error={errorFor("fontSize")} />
              <NumberInput label="Padding" suffix="px" min={0} max={80} value={p.padding} onChange={set("padding")} error={errorFor("padding")} />
            </Grid>
            <Segmented label="Alignment" value={p.alignment} options={ALIGN_OPTIONS} onChange={set("alignment")} />
          </Group>
        </Stack>
      );
    }

    case "footer": {
      const p = block.properties;
      return (
        <Stack>
          <TextInput label="Company name" variables value={p.companyName} onChange={set("companyName")} error={errorFor("companyName")} />
          <TextInput label="Address" multiline rows={2} value={p.address} onChange={set("address")} error={errorFor("address")} />
          <TextInput label="Footer text" multiline rows={3} variables value={p.text} onChange={set("text")} error={errorFor("text")} />
          <Grid>
            <TextInput label="Unsubscribe text" value={p.unsubscribeText} onChange={set("unsubscribeText")} error={errorFor("unsubscribeText")} />
            <TextInput label="Unsubscribe link" variables value={p.unsubscribeUrl} onChange={set("unsubscribeUrl")} error={errorFor("unsubscribeUrl")} />
          </Grid>
          <Group title="Style">
            <Grid>
              <NumberInput label="Font size" suffix="px" min={9} max={24} value={p.fontSize} onChange={set("fontSize")} error={errorFor("fontSize")} />
              <ColorInput label="Color" value={p.color} onChange={set("color")} error={errorFor("color")} />
              <NumberInput label="Padding" suffix="px" min={0} max={80} value={p.padding} onChange={set("padding")} error={errorFor("padding")} />
            </Grid>
            <Segmented label="Alignment" value={p.alignment} options={ALIGN_OPTIONS} onChange={set("alignment")} />
          </Group>
        </Stack>
      );
    }
  }
}
