/* ============================================================
   ROW ACTIONS (⋮ menu)

   Shared by every admin table (Popups, Campaigns, Email
   templates). The menu is positioned with `fixed` from the
   button's rectangle and rendered into document.body (a
   portal), because the tables sit in a horizontally scrolling
   box, and some rows use hover transforms, either of which would
   clip or misplace a dropdown rendered inside the row. React
   still bubbles its events through the row, so a row with its
   own onClick should wrap this in an element that stops
   propagation. Closes on outside click, Escape, scroll and resize;
   arrow keys move between items.
   ============================================================ */

import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { color, fontWeight, radius, shadow, space, text, zIndex } from "../design/tokens";

export type RowAction = { label: string; onSelect: () => void; danger?: boolean; disabled?: boolean };

export function RowActions({ name, actions }: { name: string; actions: RowAction[] }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; right: number; up: boolean }>({ top: 0, right: 0, up: false });
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const anchorRef = useRef<{ top: number; right: number } | null>(null);

  const toggle = () => {
    if (open) {
      setOpen(false);
      return;
    }
    const rect = buttonRef.current?.getBoundingClientRect();
    if (rect) {
      anchorRef.current = { top: rect.top, right: rect.right };
      const menuHeight = actions.length * 38 + 12;
      const up = rect.bottom + menuHeight + 8 > window.innerHeight && rect.top > menuHeight + 8;
      setPos({ top: up ? rect.top - 6 : rect.bottom + 6, right: window.innerWidth - rect.right, up });
    }
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return;
    const close = (event: Event) => {
      const target = event.target as Node;
      if (menuRef.current?.contains(target) || buttonRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    /* Close only when the page really moved the button. Some
       containers fire scroll events without moving anything
       (focus, scroll anchoring), which would otherwise close the
       menu the moment it opens. */
    const onScroll = () => {
      const rect = buttonRef.current?.getBoundingClientRect();
      const anchor = anchorRef.current;
      if (!rect || !anchor || Math.abs(rect.top - anchor.top) > 2 || Math.abs(rect.right - anchor.right) > 2) {
        setOpen(false);
      }
    };
    const onResize = () => setOpen(false);
    /* Document listeners use the capture phase so a row that stops
       propagation (to keep its own click/Enter handlers quiet)
       cannot stop Escape or an outside click from closing this. */
    document.addEventListener("mousedown", close, true);
    document.addEventListener("keydown", onKey, true);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onResize);
    menuRef.current?.querySelector<HTMLButtonElement>("button:not([disabled])")?.focus();
    return () => {
      document.removeEventListener("mousedown", close, true);
      document.removeEventListener("keydown", onKey, true);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onResize);
    };
  }, [open]);

  /* Arrow keys move between items, like a native menu. */
  const onMenuKey = (event: ReactKeyboardEvent) => {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    const items = [...(menuRef.current?.querySelectorAll<HTMLButtonElement>("button:not([disabled])") ?? [])];
    const i = items.indexOf(document.activeElement as HTMLButtonElement);
    const next = event.key === "ArrowDown" ? (i + 1) % items.length : (i - 1 + items.length) % items.length;
    items[next]?.focus();
  };

  return (
    <div style={{ display: "flex", justifyContent: "flex-end" }}>
      <button
        ref={buttonRef}
        type="button"
        aria-label={`Actions for ${name}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={toggle}
        style={{
          width: "32px",
          height: "32px",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          border: `1px solid ${open ? color.borderStrong : "transparent"}`,
          borderRadius: radius.md,
          background: open ? color.surfaceSunken : "transparent",
          color: color.textMuted,
          cursor: "pointer",
          fontSize: "18px",
          lineHeight: 1,
        }}
        onMouseEnter={(e) => (e.currentTarget.style.background = color.surfaceSunken)}
        onMouseLeave={(e) => { if (!open) e.currentTarget.style.background = "transparent"; }}
      >
        <svg aria-hidden width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
          <circle cx="12" cy="5" r="1.8" />
          <circle cx="12" cy="12" r="1.8" />
          <circle cx="12" cy="19" r="1.8" />
        </svg>
      </button>

      {open && typeof document !== "undefined" ? createPortal(
        <div
          ref={menuRef}
          role="menu"
          aria-label={`Actions for ${name}`}
          onKeyDown={onMenuKey}
          style={{
            position: "fixed",
            top: pos.top,
            right: pos.right,
            transform: pos.up ? "translateY(-100%)" : undefined,
            zIndex: zIndex.dropdown + 100,
            minWidth: "168px",
            padding: space[2],
            background: color.surface,
            border: `1px solid ${color.border}`,
            borderRadius: radius.md,
            boxShadow: shadow.lg,
          }}
        >
          {actions.map((action) => (
            <button
              key={action.label}
              type="button"
              role="menuitem"
              disabled={action.disabled}
              onClick={() => {
                setOpen(false);
                action.onSelect();
              }}
              style={{
                display: "block",
                width: "100%",
                textAlign: "left",
                border: 0,
                borderRadius: radius.sm,
                background: "transparent",
                padding: `${space[4]} ${space[5]}`,
                ...text.body,
                fontWeight: fontWeight.medium,
                color: action.danger ? color.dangerText : color.textStrong,
                cursor: action.disabled ? "not-allowed" : "pointer",
                opacity: action.disabled ? 0.5 : 1,
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = action.danger ? color.dangerSurface : color.surfaceSunken)}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
              onFocus={(e) => (e.currentTarget.style.background = action.danger ? color.dangerSurface : color.surfaceSunken)}
              onBlur={(e) => (e.currentTarget.style.background = "transparent")}
            >
              {action.label}
            </button>
          ))}
        </div>,
        document.body,
      ) : null}
    </div>
  );
}
