/* ============================================================
   EMAIL TEMPLATE BUILDER

   Components | Canvas | Live preview

   All editing happens in local state (see ../state.ts); the
   document only goes to the server when Save is pressed. The
   canvas and the preview both draw blocks with the renderer in
   ../render.ts, so there is one rendering system, not two.

   Drag and drop uses the browser's native HTML5 events, the
   same approach the popup editor already uses, so no new
   library is added. Touch screens do not fire HTML5 drag
   events, so every drag action also has a click equivalent:
   click a component to add it, and use the up/down buttons on a
   selected block to move it.
   ============================================================ */

import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type CSSProperties,
  type DragEvent,
  type ReactNode,
} from "react";

import { badge, button, card } from "../../design/styles";
import {
  color,
  fontWeight,
  radius,
  shadow,
  space,
  text,
  zIndex,
} from "../../design/tokens";
import { blockContext, bodyInnerWidth, columnWidths, renderBlockHtml } from "../render";
import {
  BLOCK_LIBRARY,
  EMAIL_VARIABLES,
  FONT_STACKS,
  LIMITS,
  blockLabel,
  createBlock,
  type Block,
  type BlockType,
  type ColumnsBlock,
  type EmailTemplateDoc,
  type FontKey,
  variableToken,
} from "../schema";
import {
  draftSignature,
  historyReducer,
  initHistory,
  type Draft,
} from "../state";
import {
  ROOT,
  canDrop,
  columnKey,
  countBlocks,
  duplicateBlock,
  findBlock,
  getContainer,
  insertBlock,
  moveBlock,
  moveBy,
  removeBlock,
  updateBlockProperties,
  type ContainerKey,
} from "../tree";
import { validateTemplate, type ValidationError } from "../validate";
import { BlockProperties } from "./BlockProperties";
import {
  ALIGN_OPTIONS,
  ColorInput,
  InlineInput,
  NumberInput,
  Segmented,
  SelectInput,
} from "./fields";
import { Icon } from "./icons";
import {
  DeviceSwitch,
  EmailPreviewFrame,
  InboxHeader,
  previewVariables,
  type PreviewDevice,
} from "./Preview";

type DragPayload =
  | { kind: "new"; type: BlockType }
  | { kind: "move"; type: BlockType; id: string };

type DropTarget = { container: ContainerKey; index: number };

export type SavedSignal = { draft: Draft; at: number } | null;

const CSS = `
.mq-eb-grid{display:grid;grid-template-columns:60px minmax(0,1fr) 360px;gap:16px;align-items:start;}
.mq-eb-tools{position:sticky;top:12px;display:flex;flex-direction:column;align-items:center;gap:4px;padding:8px 6px;
  background:${color.surface};border:1px solid ${color.border};border-radius:16px;box-shadow:${shadow.sm};z-index:${zIndex.sticky};}
.mq-eb-tool{position:relative;width:40px;height:40px;display:flex;align-items:center;justify-content:center;border:0;border-radius:10px;
  background:transparent;color:${color.text};cursor:grab;transition:background-color 120ms ease,color 120ms ease;}
.mq-eb-tool:hover,.mq-eb-tool[aria-expanded="true"]{background:${color.surfaceSunken};color:${color.accentOnSubtle};}
.mq-eb-tool::after{content:attr(data-label);position:absolute;left:calc(100% + 8px);top:50%;transform:translateY(-50%);
  padding:4px 8px;border-radius:6px;background:${color.textStrong};color:#fff;font-size:12px;font-weight:600;white-space:nowrap;
  opacity:0;pointer-events:none;transition:opacity 120ms ease;}
.mq-eb-tool:hover::after{opacity:1;}
.mq-eb-right{position:sticky;top:12px;max-height:calc(100vh - 24px);overflow-y:auto;}
.mq-eb-header-grid{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);column-gap:24px;}
.mq-eb-mobile-bar,.mq-eb-backdrop{display:none;}
.mq-eb-drawer-close{display:none!important;}
.mq-eb-block{position:relative;outline:1px solid transparent;outline-offset:-1px;transition:outline-color 120ms ease;}
.mq-eb-block:hover{outline:1px dashed ${color.borderStrong};}
.mq-eb-block[data-selected="true"]{outline:2px solid ${color.accent};}
.mq-eb-block[data-invalid="true"]{outline:2px solid ${color.dangerSolid};}
.mq-eb-block[data-dragging="true"]{opacity:.4;}
.mq-eb-chip{display:none;}
.mq-eb-block:hover>.mq-eb-chip,.mq-eb-block[data-selected="true"]>.mq-eb-chip{display:block;}
.mq-eb-preview-xl{display:none;}
.mq-eb-tp[data-active="false"]{display:none;}
@media (min-width:1560px){
  .mq-eb-grid{grid-template-columns:60px minmax(0,1fr) 330px 400px;}
  .mq-eb-preview-xl{display:block;position:sticky;top:12px;max-height:calc(100vh - 24px);overflow-y:auto;}
  .mq-eb-tab-preview,.mq-eb-tp-preview{display:none!important;}
  .mq-eb-tp-style{display:block!important;}
}
@media (max-width:1199px){
  .mq-eb-grid{grid-template-columns:60px minmax(0,1fr) 300px;}
}
@media (max-width:899px){
  .mq-eb-grid{grid-template-columns:minmax(0,1fr);}
  .mq-eb-tools{flex-direction:row;overflow-x:auto;top:0;justify-content:flex-start;}
  .mq-eb-tool::after{display:none;}
  .mq-eb-right{position:fixed;left:0;right:0;bottom:0;top:auto;max-height:80vh;z-index:${zIndex.modal};
    border-radius:16px 16px 0 0!important;transform:translateY(105%);transition:transform 220ms ease;box-shadow:${shadow.xl};}
  .mq-eb-right[data-open="true"]{transform:none;}
  .mq-eb-backdrop[data-open="true"]{display:block;position:fixed;inset:0;background:rgba(23,32,51,.4);z-index:${zIndex.modal - 1};}
  .mq-eb-drawer-close{display:inline-flex!important;}
  .mq-eb-mobile-bar{display:flex;}
}
@media (max-width:640px){
  .mq-eb-header-grid{grid-template-columns:minmax(0,1fr);}
}
`;

function useDebounced<T>(value: T, delay: number) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return debounced;
}

function IconButton({
  label,
  onClick,
  disabled,
  children,
  tone = "neutral",
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: ReactNode;
  tone?: "neutral" | "danger";
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      style={{
        width: "26px",
        height: "26px",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        border: 0,
        borderRadius: radius.sm,
        background: "transparent",
        color: tone === "danger" ? "#FFB4B4" : color.textOnFilled,
        fontSize: "13px",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.4 : 1,
      }}
    >
      {children}
    </button>
  );
}

export function EmailBuilder({
  initial,
  isNew,
  shop,
  saving,
  saved,
  serverError,
  serverErrors,
  backTo,
  onBack,
  onSave,
  onDirtyChange,
  onPreview,
  onNotify,
}: {
  initial: Draft;
  isNew: boolean;
  shop: string;
  saving: boolean;
  saved: SavedSignal;
  serverError: string | null;
  serverErrors: ValidationError[];
  backTo: string;
  onBack: () => void;
  onSave: (draft: Draft) => void;
  onDirtyChange: (dirty: boolean) => void;
  onPreview: (draft: Draft) => void;
  onNotify: (message: string, isError?: boolean) => void;
}) {
  const [history, dispatch] = useReducer(historyReducer, initial, initHistory);
  const draft = history.present;
  const doc = draft.doc;

  const [savedSig, setSavedSig] = useState(() => draftSignature(initial));
  const [hasSaved, setHasSaved] = useState(!isNew);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [rightTab, setRightTab] = useState<"style" | "preview">("style");
  const [showErrors, setShowErrors] = useState(false);
  const [device, setDevice] = useState<PreviewDevice>("desktop");
  const [varsOpen, setVarsOpen] = useState(false);
  /* Wide screens show the preview as its own column, so the
     iframe is only mounted in whichever place is visible. */
  const [wide, setWide] = useState(false);

  useEffect(() => {
    const query = window.matchMedia("(min-width: 1560px)");
    const update = () => setWide(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);

  const dragRef = useRef<DragPayload | null>(null);
  const dropRef = useRef<DropTarget | null>(null);

  const dirty = draftSignature(draft) !== savedSig;
  const variables = useMemo(() => previewVariables(shop), [shop]);
  const previewDoc = useDebounced(doc, 150);

  useEffect(() => {
    onDirtyChange(dirty);
  }, [dirty, onDirtyChange]);

  /* After a successful save, adopt the server's copy as the new
     "clean" state without losing undo history. */
  useEffect(() => {
    if (!saved) return;
    dispatch({ type: "replace", draft: saved.draft });
    setSavedSig(draftSignature(saved.draft));
    setHasSaved(true);
    setShowErrors(false);
  }, [saved]);

  useEffect(() => {
    if (serverErrors.length) setShowErrors(true);
  }, [serverErrors]);

  /* ---------------- validation ---------------- */

  const validation = useMemo(
    () => validateTemplate(doc, { name: draft.name, status: draft.status }),
    [doc, draft.name, draft.status],
  );

  const errors = useMemo(() => {
    if (!showErrors) return [];
    const seen = new Set(validation.errors.map((e) => `${e.blockId}|${e.field}`));
    return [
      ...validation.errors,
      ...serverErrors.filter((e) => !seen.has(`${e.blockId}|${e.field}`)),
    ];
  }, [showErrors, validation.errors, serverErrors]);

  const invalidBlocks = useMemo(
    () => new Set(errors.filter((e) => e.blockId).map((e) => e.blockId as string)),
    [errors],
  );

  const errorFor = useCallback(
    (field: string, blockId?: string) =>
      errors.find((e) => e.field === field && e.blockId === blockId)?.message ?? null,
    [errors],
  );

  /* ---------------- editing ---------------- */

  const editDoc = useCallback(
    (update: (doc: EmailTemplateDoc) => EmailTemplateDoc, coalesceKey?: string) =>
      dispatch({
        type: "edit",
        coalesceKey,
        update: (d) => {
          const nextDoc = update(d.doc);
          return nextDoc === d.doc ? d : { ...d, doc: nextDoc };
        },
      }),
    [],
  );

  const editBlocks = useCallback(
    (update: (blocks: Block[]) => Block[], coalesceKey?: string) =>
      editDoc((d) => {
        const blocks = update(d.blocks);
        return blocks === d.blocks ? d : { ...d, blocks };
      }, coalesceKey),
    [editDoc],
  );

  const select = (id: string | null) => {
    setSelectedId(id);
    if (id) setRightTab("style");
  };

  const addBlock = (type: BlockType, target?: DropTarget) => {
    if (countBlocks(doc.blocks) >= LIMITS.maxBlocks) {
      onNotify(`A template can hold at most ${LIMITS.maxBlocks} blocks.`, true);
      return;
    }
    const block = createBlock(type);
    let where = target;

    if (!where) {
      /* Click-to-add goes after the selected block if it can live
         there, otherwise at the end of the email. */
      const found = selectedId ? findBlock(doc.blocks, selectedId) : null;
      where =
        found && canDrop(doc.blocks, found.container, block)
          ? { container: found.container, index: found.index + 1 }
          : { container: ROOT, index: doc.blocks.length };
    }

    const next = insertBlock(doc.blocks, where.container, where.index, block);
    if (next === doc.blocks) {
      onNotify(`${blockLabel(type)} cannot go there.`, true);
      return;
    }
    editBlocks(() => next);
    select(block.id);
    setDrawerOpen(false);
  };

  const removeSelected = (id: string) => {
    editBlocks((blocks) => removeBlock(blocks, id));
    if (selectedId === id) select(null);
  };

  const duplicate = (id: string) => {
    const result = duplicateBlock(doc.blocks, id);
    if (!result.newId) return;
    editBlocks(() => result.blocks);
    select(result.newId);
  };

  const setEmail = (field: keyof EmailTemplateDoc["email"]) => (value: string) =>
    editDoc((d) => ({ ...d, email: { ...d.email, [field]: value } }), `email.${field}`);

  const setSetting = <K extends keyof EmailTemplateDoc["settings"]>(field: K) =>
    (value: EmailTemplateDoc["settings"][K]) =>
      editDoc((d) => ({ ...d, settings: { ...d.settings, [field]: value } }), `settings.${field}`);

  /* ---------------- save ---------------- */

  const save = () => {
    if (saving) return;
    if (!validation.ok) {
      setShowErrors(true);
      const first = validation.errors[0];
      if (first?.blockId) {
        select(first.blockId);
      } else {
        select(null);
        setRightTab("style");
      }
      onNotify(
        `Fix ${validation.errors.length} ${validation.errors.length === 1 ? "issue" : "issues"} before saving.`,
        true,
      );
      return;
    }
    onSave(draft);
  };

  const saveRef = useRef(save);
  saveRef.current = save;

  /* ---------------- keyboard ---------------- */

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const mod = event.metaKey || event.ctrlKey;
      const target = event.target as HTMLElement | null;
      const typing =
        !!target &&
        (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT");

      if (mod && event.key.toLowerCase() === "s") {
        event.preventDefault();
        saveRef.current();
        return;
      }
      if (typing) return;
      if (mod && event.key.toLowerCase() === "z") {
        event.preventDefault();
        dispatch({ type: event.shiftKey ? "redo" : "undo" });
      } else if (mod && event.key.toLowerCase() === "y") {
        event.preventDefault();
        dispatch({ type: "redo" });
      } else if (event.key === "Escape") {
        setSelectedId(null);
        setVarsOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  /* Drop the selection if its block disappeared (undo, delete). */
  useEffect(() => {
    if (selectedId && !findBlock(doc.blocks, selectedId)) {
      setSelectedId(null);
    }
  }, [doc.blocks, selectedId]);

  /* ---------------- drag and drop ---------------- */

  const setTarget = (target: DropTarget | null) => {
    const prev = dropRef.current;
    if (
      prev?.container === target?.container &&
      prev?.index === target?.index
    ) {
      return;
    }
    dropRef.current = target;
    setDropTarget(target);
  };

  const accepts = (container: ContainerKey) => {
    const payload = dragRef.current;
    if (!payload) return false;
    return canDrop(doc.blocks, container, {
      type: payload.type,
      id: payload.kind === "move" ? payload.id : "__new__",
    });
  };

  const startDrag = (event: DragEvent, payload: DragPayload) => {
    dragRef.current = payload;
    event.dataTransfer.effectAllowed = payload.kind === "new" ? "copy" : "move";
    // Firefox will not start a drag without some data set.
    event.dataTransfer.setData("text/plain", payload.type);
    if (payload.kind === "move") setDraggingId(payload.id);
  };

  const endDrag = () => {
    dragRef.current = null;
    setDraggingId(null);
    setTarget(null);
  };

  /* Over a block: drop above or below it, whichever half the
     pointer is in. If this container does not accept the dragged
     type, let the event bubble so an outer container can. */
  const overBlock = (event: DragEvent, container: ContainerKey, index: number) => {
    if (!accepts(container)) return;
    event.preventDefault();
    event.stopPropagation();
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    const after = event.clientY > rect.top + rect.height / 2;
    event.dataTransfer.dropEffect = dragRef.current?.kind === "new" ? "copy" : "move";
    setTarget({ container, index: after ? index + 1 : index });
  };

  /* Over empty space in a container: drop at its end. */
  const overContainer = (event: DragEvent, container: ContainerKey, length: number) => {
    if (!accepts(container)) return;
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = dragRef.current?.kind === "new" ? "copy" : "move";
    setTarget({ container, index: length });
  };

  const drop = (event: DragEvent) => {
    event.preventDefault();
    const payload = dragRef.current;
    const target = dropRef.current;
    endDrag();
    if (!payload || !target) return;

    if (payload.kind === "new") {
      addBlock(payload.type, target);
    } else {
      editBlocks((blocks) => moveBlock(blocks, payload.id, target.container, target.index));
      select(payload.id);
    }
  };

  /* ---------------- canvas rendering ---------------- */

  const Indicator = () => (
    <div
      aria-hidden
      style={{
        height: "3px",
        margin: "2px 6px",
        borderRadius: radius.pill,
        background: color.accent,
        boxShadow: `0 0 0 3px ${color.accentSubtle}`,
      }}
    />
  );

  const renderColumns = (block: ColumnsBlock, width: number) => {
    const p = block.properties;
    const [leftW, rightW] = columnWidths(width, p.ratio, p.gap, p.padding);
    return (
      <div style={{ display: "flex", gap: `${p.gap}px`, padding: `${p.padding}px` }}>
        {([0, 1] as const).map((column) => {
          const key = columnKey(block.id, column);
          const children = block.columns[column];
          const w = column === 0 ? leftW : rightW;
          const empty = children.length === 0;
          return (
            <div
              key={key}
              onDragOver={(event) => overContainer(event, key, children.length)}
              style={{
                flex: `${w} ${w} 0`,
                minWidth: 0,
                minHeight: "72px",
                border: `1px dashed ${
                  dropTarget?.container === key ? color.accent : color.borderStrong
                }`,
                borderRadius: radius.sm,
                background: empty ? "rgba(118,81,216,0.03)" : "transparent",
              }}
            >
              {empty ? (
                <div
                  style={{
                    padding: space[5],
                    textAlign: "center",
                    ...text.bodySm,
                    color: dropTarget?.container === key ? color.accentOnSubtle : color.textSubtle,
                    fontWeight: dropTarget?.container === key ? fontWeight.semibold : undefined,
                  }}
                >
                  {dropTarget?.container === key ? "Release to drop" : "Drop blocks here"}
                </div>
              ) : (
                renderContainer(key, children, w)
              )}
            </div>
          );
        })}
      </div>
    );
  };

  const renderBlock = (block: Block, container: ContainerKey, index: number, width: number) => {
    const selected = block.id === selectedId;
    const siblings = selected ? getContainer(doc.blocks, container) ?? [] : [];

    return (
      <div
        key={block.id}
        className="mq-eb-block"
        data-block-id={block.id}
        data-block-type={block.type}
        data-selected={selected}
        data-invalid={invalidBlocks.has(block.id)}
        data-dragging={draggingId === block.id}
        role="button"
        tabIndex={0}
        aria-label={`${blockLabel(block.type)} block${selected ? ", selected" : ""}`}
        aria-pressed={selected}
        onKeyDown={(event) => {
          if (event.target !== event.currentTarget) return;
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            select(block.id);
          } else if (selected && event.altKey && event.key === "ArrowUp") {
            event.preventDefault();
            editBlocks((b) => moveBy(b, block.id, -1));
          } else if (selected && event.altKey && event.key === "ArrowDown") {
            event.preventDefault();
            editBlocks((b) => moveBy(b, block.id, 1));
          }
        }}
        draggable
        onDragStart={(event) => {
          event.stopPropagation();
          startDrag(event, { kind: "move", type: block.type, id: block.id });
        }}
        onDragEnd={endDrag}
        onDragOver={(event) => overBlock(event, container, index)}
        onClick={(event) => {
          event.stopPropagation();
          select(block.id);
          setDrawerOpen(false);
        }}
        style={{ cursor: "grab" }}
      >
        <span
          className="mq-eb-chip"
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            zIndex: 2,
            transform: "translateY(-100%)",
            padding: `1px ${space[3]}`,
            borderRadius: `${radius.sm} ${radius.sm} 0 0`,
            background: invalidBlocks.has(block.id) ? color.dangerSolid : color.accent,
            color: color.textOnFilled,
            fontSize: "10px",
            fontWeight: fontWeight.bold,
            letterSpacing: "0.03em",
            textTransform: "uppercase",
            pointerEvents: "none",
          }}
        >
          {blockLabel(block.type)}
        </span>

        {selected ? (
          <div
            style={{
              position: "absolute",
              right: 0,
              top: 0,
              zIndex: 3,
              transform: "translateY(-100%)",
              display: "flex",
              gap: 1,
              padding: "1px 2px",
              borderRadius: `${radius.sm} ${radius.sm} 0 0`,
              background: color.accent,
            }}
          >
            <IconButton label="Move up" disabled={index === 0} onClick={() => editBlocks((b) => moveBy(b, block.id, -1))}>↑</IconButton>
            <IconButton label="Move down" disabled={index >= siblings.length - 1} onClick={() => editBlocks((b) => moveBy(b, block.id, 1))}>↓</IconButton>
            <IconButton label="Duplicate block" onClick={() => duplicate(block.id)}>⧉</IconButton>
            <IconButton label="Delete block" tone="danger" onClick={() => removeSelected(block.id)}>✕</IconButton>
          </div>
        ) : null}

        {block.type === "columns" ? (
          renderColumns(block, width)
        ) : (
          <div
            /* Our own renderer's output: every value in it is
               escaped or whitelisted, so this is not user HTML. */
            dangerouslySetInnerHTML={{
              __html: renderBlockHtml(block, blockContext(doc, { variables }, width)),
            }}
            style={{ pointerEvents: "none" }}
          />
        )}
      </div>
    );
  };

  function renderContainer(key: ContainerKey, blocks: Block[], width: number): ReactNode {
    return (
      <>
        {blocks.map((block, index) => (
          <div key={block.id}>
            {dropTarget?.container === key && dropTarget.index === index ? <Indicator /> : null}
            {renderBlock(block, key, index, width)}
          </div>
        ))}
        {dropTarget?.container === key && dropTarget.index === blocks.length ? <Indicator /> : null}
      </>
    );
  }

  /* ---------------- panels ---------------- */

  const selectedBlock = selectedId ? findBlock(doc.blocks, selectedId) : null;
  const errorCount = errors.length;
  const s = doc.settings;

  const panelStyle: CSSProperties = {
    ...card({ elevation: "flat" }),
    padding: 0,
    overflow: "hidden",
  };

  const sectionTitle = (title: string) => (
    <div style={{ ...text.h4, color: color.textStrong }}>{title}</div>
  );

  const fontOptions = (Object.keys(FONT_STACKS) as FontKey[]).map((key) => ({
    value: key,
    label: FONT_STACKS[key].label,
  }));

  /* Page style: what the Resend editor calls Page and Body. */
  const pageStylePanel = (
    <div style={{ padding: space[6], display: "flex", flexDirection: "column", gap: space[7] }}>
      <section style={{ display: "flex", flexDirection: "column", gap: space[5] }}>
        {sectionTitle("Page style")}
        <ColorInput label="Background" value={s.backgroundColor} onChange={setSetting("backgroundColor")} error={errorFor("settings.backgroundColor")} />
        <NumberInput label="Padding" suffix="px" min={0} max={80} value={s.padding} onChange={setSetting("padding")} error={errorFor("settings.padding")} />
      </section>

      <section style={{ display: "flex", flexDirection: "column", gap: space[5], paddingTop: space[6], borderTop: `1px solid ${color.borderSubtle}` }}>
        {sectionTitle("Body")}
        <Segmented label="Alignment" value={s.alignment} options={ALIGN_OPTIONS} onChange={setSetting("alignment")} />
        <ColorInput label="Background" value={s.contentBackgroundColor} onChange={setSetting("contentBackgroundColor")} error={errorFor("settings.contentBackgroundColor")} />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0,1fr))", gap: space[5] }}>
          <NumberInput label="Width" suffix="px" min={LIMITS.minWidth} max={LIMITS.maxWidth} value={s.width} onChange={setSetting("width")} error={errorFor("settings.width")} />
          <NumberInput label="Padding" suffix="px" min={0} max={60} value={s.contentPadding} onChange={setSetting("contentPadding")} error={errorFor("settings.contentPadding")} />
          <NumberInput label="Corner radius" suffix="px" min={0} max={40} value={s.borderRadius} onChange={setSetting("borderRadius")} error={errorFor("settings.borderRadius")} />
          <NumberInput label="Border" suffix="px" min={0} max={8} value={s.borderWidth} onChange={setSetting("borderWidth")} error={errorFor("settings.borderWidth")} />
        </div>
        {s.borderWidth > 0 ? (
          <ColorInput label="Border color" value={s.borderColor} onChange={setSetting("borderColor")} error={errorFor("settings.borderColor")} />
        ) : null}
        <SelectInput label="Font" value={s.fontFamily} options={fontOptions} onChange={setSetting("fontFamily")} />
      </section>

      <p style={{ margin: 0, ...text.bodySm, color: color.textSubtle }}>
        Click a block in the email to edit it. Width 600px suits most inboxes.
      </p>
    </div>
  );

  const blockPanel = selectedBlock ? (
    <div style={{ padding: space[6], display: "flex", flexDirection: "column", gap: space[6] }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: space[4] }}>
        <div>
          <button
            type="button"
            onClick={() => select(null)}
            style={{ border: 0, background: "transparent", padding: 0, cursor: "pointer", ...text.bodySm, color: color.accentOnSubtle, fontWeight: fontWeight.semibold }}
          >
            ← Page style
          </button>
          <div style={{ ...text.h3, color: color.textStrong, marginTop: space[2] }}>
            {blockLabel(selectedBlock.block.type)}
          </div>
        </div>
        {selectedBlock.container !== ROOT ? (
          <button type="button" style={button("tertiary", "sm")} onClick={() => select(selectedBlock.container.split(":")[0])}>
            Select columns
          </button>
        ) : null}
      </div>
      <BlockProperties
        key={selectedBlock.block.id}
        block={selectedBlock.block}
        errorFor={(field) => errorFor(field, selectedBlock.block.id)}
        onChange={(patch, field) =>
          editBlocks(
            (blocks) => updateBlockProperties(blocks, selectedBlock.block.id, patch),
            `${selectedBlock.block.id}.${field}`,
          )
        }
      />
      <div style={{ display: "flex", gap: space[4], paddingTop: space[5], borderTop: `1px solid ${color.borderSubtle}` }}>
        <button type="button" style={button("secondary", "sm")} onClick={() => duplicate(selectedBlock.block.id)}>
          Duplicate
        </button>
        <button type="button" style={button("danger", "sm")} onClick={() => removeSelected(selectedBlock.block.id)}>
          Delete component
        </button>
      </div>
    </div>
  ) : (
    pageStylePanel
  );

  const previewPanel = (
    <div style={{ padding: space[5], background: color.surfaceSunken, display: "flex", flexDirection: "column", gap: space[4] }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: space[4] }}>
        <span style={{ ...text.bodySm, color: color.textMuted }}>Updates as you edit</span>
        <DeviceSwitch device={device} onChange={setDevice} />
      </div>
      <InboxHeader doc={previewDoc} variables={variables} />
      <EmailPreviewFrame doc={previewDoc} variables={variables} device={device} />
      <p style={{ margin: 0, ...text.bodySm, color: color.textSubtle }}>
        Variables show sample values here. They are saved exactly as written.
      </p>
    </div>
  );

  const tabButton = (value: "style" | "preview", label: string) => {
    const active = rightTab === value;
    return (
      <button
        type="button"
        className={`mq-eb-tab-${value}`}
        role="tab"
        aria-selected={active}
        onClick={() => setRightTab(value)}
        style={{
          flex: 1,
          height: "44px",
          border: 0,
          borderBottom: `2px solid ${active ? color.accent : "transparent"}`,
          background: "transparent",
          color: active ? color.textStrong : color.textMuted,
          fontSize: "13px",
          fontWeight: fontWeight.semibold,
          cursor: "pointer",
        }}
      >
        {label}
      </button>
    );
  };

  const copyVariable = async (key: string) => {
    const token = variableToken(key);
    try {
      await navigator.clipboard.writeText(token);
      onNotify(`Copied ${token}. Paste it into any text field.`);
    } catch {
      onNotify(`Type ${token} into any text field.`);
    }
    setVarsOpen(false);
  };

  const bodyWidth = bodyInnerWidth(s);

  /* ---------------- layout ---------------- */

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: space[6] }}>
      <style>{CSS}</style>

      {/* ---------- top bar: Templates / name  [status]   actions ---------- */}
      <div
        style={{
          ...card({ elevation: "flat" }),
          padding: `${space[4]} ${space[6]}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: space[5],
          flexWrap: "wrap",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: space[3], minWidth: 0, flex: "1 1 320px", flexWrap: "wrap" }}>
          <a
            href={backTo}
            onClick={(event) => {
              event.preventDefault();
              onBack();
            }}
            style={{ ...text.body, color: color.textMuted, textDecoration: "none", whiteSpace: "nowrap" }}
          >
            Templates
          </a>
          <span aria-hidden style={{ color: color.textSubtle }}>/</span>
          <input
            aria-label="Template name"
            value={draft.name}
            maxLength={LIMITS.maxName}
            placeholder="Untitled template"
            onChange={(event) => {
              const name = event.target.value;
              dispatch({ type: "edit", coalesceKey: "name", update: (d) => ({ ...d, name }) });
            }}
            style={{
              minWidth: "120px",
              flex: "0 1 320px",
              border: `1px solid ${errorFor("name") ? color.dangerSolid : "transparent"}`,
              borderRadius: radius.sm,
              padding: `${space[2]} ${space[3]}`,
              background: "transparent",
              ...text.h4,
              color: color.textStrong,
              outline: "none",
            }}
            onFocus={(e) => (e.currentTarget.style.borderColor = color.border)}
            onBlur={(e) => (e.currentTarget.style.borderColor = errorFor("name") ? color.dangerSolid : "transparent")}
          />
          <select
            aria-label="Status"
            value={draft.status}
            onChange={(event) => {
              const status = event.target.value === "active" ? "active" : "draft";
              dispatch({ type: "edit", update: (d) => ({ ...d, status }) });
            }}
            style={{
              ...badge(draft.status === "active" ? "success" : "neutral"),
              border: 0,
              padding: `${space[2]} ${space[3]}`,
              cursor: "pointer",
              fontSize: "11px",
            }}
          >
            <option value="draft">DRAFT</option>
            <option value="active">ACTIVE</option>
          </select>
          <span style={{ ...text.bodySm, color: dirty ? color.warningText : color.textSubtle, whiteSpace: "nowrap" }}>
            {saving ? "Saving…" : dirty ? "Unsaved changes" : hasSaved ? "Saved" : "Not saved yet"}
          </span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: space[3] }}>
          <button type="button" aria-label="Undo" title="Undo (Ctrl/Cmd+Z)" style={button("tertiary", "sm", { disabled: !history.past.length })} disabled={!history.past.length} onClick={() => dispatch({ type: "undo" })}>
            <Icon name="undo" size={16} />
          </button>
          <button type="button" aria-label="Redo" title="Redo (Ctrl/Cmd+Shift+Z)" style={button("tertiary", "sm", { disabled: !history.future.length })} disabled={!history.future.length} onClick={() => dispatch({ type: "redo" })}>
            <Icon name="redo" size={16} />
          </button>
          <button type="button" style={button("secondary", "sm")} onClick={() => onPreview(draft)}>
            Preview
          </button>
          <button type="button" style={button("primary", "md", { disabled: saving })} disabled={saving} onClick={save}>
            {saving ? "Saving…" : "Save template"}
          </button>
        </div>
      </div>

      {serverError || errorCount ? (
        <div
          role="alert"
          style={{
            padding: `${space[5]} ${space[6]}`,
            borderRadius: radius.md,
            border: `1px solid ${color.dangerBorder}`,
            background: color.dangerSurface,
            color: color.dangerText,
            ...text.body,
          }}
        >
          {serverError || "Some fields need attention."}
          {errorCount ? ` ${errorCount} ${errorCount === 1 ? "issue is" : "issues are"} highlighted in red.` : ""}
        </div>
      ) : null}

      {/* ---------- phone-only bar ---------- */}
      <div className="mq-eb-mobile-bar" style={{ gap: space[4] }}>
        <button type="button" style={button("secondary", "sm")} onClick={() => { setRightTab("style"); setDrawerOpen(true); }}>
          {selectedBlock ? `Edit ${blockLabel(selectedBlock.block.type).toLowerCase()}` : "Page style"}
        </button>
        <button type="button" style={button("secondary", "sm")} onClick={() => { setRightTab("preview"); setDrawerOpen(true); }}>
          Live preview
        </button>
      </div>

      <div className="mq-eb-grid">
        {/* ---------- left: floating component toolbar ---------- */}
        <nav className="mq-eb-tools" aria-label="Components">
          {BLOCK_LIBRARY.map((item) => (
            <button
              key={item.type}
              type="button"
              className="mq-eb-tool"
              data-label={`${item.label} · drag or click`}
              aria-label={`Add ${item.label}`}
              draggable
              onDragStart={(event) => startDrag(event, { kind: "new", type: item.type })}
              onDragEnd={endDrag}
              onClick={() => addBlock(item.type)}
            >
              <Icon name={item.type} />
            </button>
          ))}
          <span aria-hidden style={{ width: "24px", height: "1px", background: color.border, margin: "4px 0", flexShrink: 0 }} />
          <div style={{ position: "relative" }}>
            <button
              type="button"
              className="mq-eb-tool"
              data-label="Variables"
              aria-label="Variables"
              aria-expanded={varsOpen}
              style={{ cursor: "pointer" }}
              onClick={() => setVarsOpen((v) => !v)}
            >
              <Icon name="variables" />
            </button>
            {varsOpen ? (
              <div
                role="menu"
                style={{
                  position: "absolute",
                  left: "calc(100% + 10px)",
                  bottom: 0,
                  width: "260px",
                  zIndex: zIndex.dropdown,
                  background: color.surface,
                  border: `1px solid ${color.border}`,
                  borderRadius: radius.md,
                  boxShadow: shadow.lg,
                  padding: space[3],
                }}
              >
                <div style={{ ...text.bodySm, color: color.textMuted, padding: `${space[2]} ${space[3]} ${space[3]}` }}>
                  Click to copy. Text fields also have a {"{ }"} button.
                </div>
                {EMAIL_VARIABLES.map((variable) => (
                  <button
                    key={variable.key}
                    type="button"
                    role="menuitem"
                    onClick={() => copyVariable(variable.key)}
                    style={{ display: "block", width: "100%", textAlign: "left", border: 0, background: "transparent", padding: `${space[3]} ${space[3]}`, borderRadius: radius.sm, cursor: "pointer" }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = color.surfaceSunken)}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                  >
                    <span style={{ display: "block", ...text.bodySm, color: color.textStrong }}>{variable.label}</span>
                    <code style={{ fontSize: "11px", color: color.textMuted }}>{variableToken(variable.key)}</code>
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        </nav>

        {/* ---------- middle: email header + canvas ---------- */}
        <section style={panelStyle} aria-label="Email canvas">
          <div style={{ padding: `${space[5]} ${space[7]} ${space[6]}`, maxWidth: `${Math.max(s.width, 560)}px`, margin: "0 auto", boxSizing: "border-box" }}>
            <div className="mq-eb-header-grid">
              <InlineInput label="From" value={doc.email.fromName} onChange={setEmail("fromName")} placeholder="Your store name" error={errorFor("email.fromName")} maxLength={100} />
              <InlineInput label="Reply-To" type="email" value={doc.email.replyTo} onChange={setEmail("replyTo")} placeholder="support@example.com" error={errorFor("email.replyTo")} />
              <InlineInput label="Subject" variables value={doc.email.subject} onChange={setEmail("subject")} placeholder="Subject line" error={errorFor("email.subject")} maxLength={LIMITS.maxShortText} />
              <InlineInput label="Preview text" variables value={doc.email.previewText} onChange={setEmail("previewText")} placeholder="Shown after the subject" error={errorFor("email.previewText")} maxLength={LIMITS.maxShortText} />
            </div>
          </div>

          {/* Clicking empty canvas clears the selection; Escape does the same from the keyboard. */}
          {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions */}
          <div
            onClick={() => select(null)}
            onDragOver={(event) => overContainer(event, ROOT, doc.blocks.length)}
            onDrop={drop}
            onDragLeave={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget as Node)) setTarget(null);
            }}
            style={{
              background: s.backgroundColor,
              padding: `${Math.max(s.padding, 16)}px ${space[5]}`,
              minHeight: "520px",
              display: "flex",
              justifyContent: s.alignment === "left" ? "flex-start" : s.alignment === "right" ? "flex-end" : "center",
              borderTop: `1px solid ${color.borderSubtle}`,
            }}
          >
            <div
              style={{
                maxWidth: `${s.width}px`,
                width: "100%",
                boxSizing: "border-box",
                alignSelf: "flex-start",
                background: s.contentBackgroundColor,
                border: s.borderWidth ? `${s.borderWidth}px solid ${s.borderColor}` : undefined,
                borderRadius: `${s.borderRadius}px`,
                padding: `${Math.max(s.contentPadding, 0)}px`,
                paddingTop: `${s.contentPadding + 18}px`,
                boxShadow: shadow.sm,
                fontFamily: FONT_STACKS[s.fontFamily]?.css,
              }}
            >
              {doc.blocks.length === 0 ? (
                <div
                  style={{
                    margin: space[6],
                    padding: `${space[11]} ${space[7]}`,
                    border: `2px dashed ${dropTarget ? color.accent : color.borderStrong}`,
                    borderRadius: radius.lg,
                    textAlign: "center",
                    color: color.textMuted,
                  }}
                >
                  <div style={{ ...text.h4, color: color.textStrong }}>Your email is empty</div>
                  <div style={{ ...text.body, marginTop: space[3] }}>
                    Drag a component from the toolbar, or click one to add it.
                  </div>
                </div>
              ) : (
                renderContainer(ROOT, doc.blocks, bodyWidth)
              )}
            </div>
          </div>
          <div style={{ padding: `${space[4]} ${space[6]}`, borderTop: `1px solid ${color.borderSubtle}`, ...text.bodySm, color: color.textSubtle, display: "flex", justifyContent: "space-between", gap: space[4], flexWrap: "wrap" }}>
            <span>{countBlocks(doc.blocks)} {countBlocks(doc.blocks) === 1 ? "block" : "blocks"} · drag blocks to reorder</span>
            <span>Ctrl/Cmd+Z undo · Ctrl/Cmd+S save</span>
          </div>
        </section>

        {/* ---------- right: style / preview ---------- */}
        <div className="mq-eb-backdrop" role="presentation" data-open={drawerOpen} onClick={() => setDrawerOpen(false)} />
        <aside className="mq-eb-right" data-open={drawerOpen} style={panelStyle} aria-label="Style and preview">
          <div role="tablist" style={{ display: "flex", alignItems: "center", borderBottom: `1px solid ${color.borderSubtle}` }}>
            {tabButton("style", selectedBlock ? `${blockLabel(selectedBlock.block.type)} settings` : "Style")}
            {tabButton("preview", "Preview")}
            <button type="button" className="mq-eb-drawer-close" aria-label="Close panel" onClick={() => setDrawerOpen(false)} style={{ ...button("tertiary", "sm"), marginRight: space[3] }}>
              ✕
            </button>
          </div>
          <div className="mq-eb-tp mq-eb-tp-style" data-active={rightTab === "style"}>{blockPanel}</div>
          <div className="mq-eb-tp mq-eb-tp-preview" data-active={rightTab === "preview"}>
            {rightTab === "preview" && !wide ? previewPanel : null}
          </div>
        </aside>

        {/* ---------- wide screens: preview always beside the editor ---------- */}
        <aside className="mq-eb-preview-xl" style={panelStyle} aria-label="Live preview">
          <div style={{ padding: `${space[5]} ${space[6]}`, borderBottom: `1px solid ${color.borderSubtle}`, ...text.h4, color: color.textStrong }}>
            Live preview
          </div>
          {wide ? previewPanel : null}
        </aside>
      </div>
    </div>
  );
}
