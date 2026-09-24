/* ============================================================
   BUILDER FORM FIELDS

   Small controlled inputs styled with the MQ design system.
   Text fields can insert a {{variable}} at the cursor.
   ============================================================ */

import {
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";

import {
  fieldHint,
  fieldLabel,
  input,
  textarea,
} from "../../design/styles";
import {
  color,
  fontWeight,
  radius,
  shadow,
  space,
  text,
  transition,
  zIndex,
} from "../../design/tokens";
import { EMAIL_VARIABLES, variableToken } from "../schema";

export function Field({
  label,
  hint,
  error,
  htmlFor,
  children,
  action,
}: {
  label: string;
  hint?: string;
  error?: string | null;
  htmlFor?: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: space[4],
        }}
      >
        <label htmlFor={htmlFor} style={{ ...fieldLabel(), marginBottom: space[3] }}>
          {label}
        </label>
        {action}
      </div>
      {children}
      {error ? (
        <span role="alert" style={{ ...fieldHint({ invalid: true }), marginTop: space[2] }}>
          {error}
        </span>
      ) : hint ? (
        <span style={{ ...fieldHint(), marginTop: space[2] }}>{hint}</span>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------
   VARIABLE MENU
------------------------------------------------------------ */

export function VariableMenu({
  onPick,
  compact,
}: {
  onPick: (token: string) => void;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => setOpen((v) => !v)}
        style={{
          border: `1px solid ${color.border}`,
          background: color.surface,
          color: color.accentOnSubtle,
          borderRadius: radius.sm,
          padding: `${space[1]} ${space[3]}`,
          fontSize: "11px",
          fontWeight: fontWeight.semibold,
          cursor: "pointer",
          marginBottom: compact ? 0 : space[3],
          whiteSpace: "nowrap",
        }}
      >
        {compact ? "{ }" : "{ } Variable"}
      </button>
      {open ? (
        <div
          role="menu"
          style={{
            position: "absolute",
            right: 0,
            top: "100%",
            zIndex: zIndex.dropdown,
            width: "240px",
            maxHeight: "260px",
            overflowY: "auto",
            background: color.surface,
            border: `1px solid ${color.border}`,
            borderRadius: radius.md,
            boxShadow: shadow.lg,
            padding: space[2],
          }}
        >
          {EMAIL_VARIABLES.map((variable) => (
            <button
              key={variable.key}
              type="button"
              role="menuitem"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                onPick(variableToken(variable.key));
                setOpen(false);
              }}
              style={{
                display: "block",
                width: "100%",
                textAlign: "left",
                border: 0,
                background: "transparent",
                padding: `${space[3]} ${space[4]}`,
                borderRadius: radius.sm,
                cursor: "pointer",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = color.surfaceSunken)}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            >
              <span style={{ display: "block", ...text.bodySm, color: color.textStrong }}>
                {variable.label}
              </span>
              <code style={{ fontSize: "11px", color: color.textMuted }}>
                {variableToken(variable.key)}
              </code>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------
   TEXT
------------------------------------------------------------ */

export function TextInput({
  label,
  value,
  onChange,
  placeholder,
  error,
  hint,
  multiline,
  rows = 4,
  variables,
  type = "text",
  maxLength,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  error?: string | null;
  hint?: string;
  multiline?: boolean;
  rows?: number;
  variables?: boolean;
  type?: "text" | "email" | "url";
  maxLength?: number;
}) {
  const id = useId();
  const ref = useRef<HTMLInputElement & HTMLTextAreaElement>(null);
  const pendingCaret = useRef<number | null>(null);

  useEffect(() => {
    if (pendingCaret.current !== null && ref.current) {
      ref.current.focus();
      ref.current.setSelectionRange(pendingCaret.current, pendingCaret.current);
      pendingCaret.current = null;
    }
  });

  const insert = (token: string) => {
    const el = ref.current;
    const start = el?.selectionStart ?? value.length;
    const end = el?.selectionEnd ?? value.length;
    pendingCaret.current = start + token.length;
    onChange(value.slice(0, start) + token + value.slice(end));
  };

  const common = {
    id,
    value,
    placeholder,
    maxLength,
    "aria-invalid": error ? true : undefined,
    onChange: (event: { target: { value: string } }) => onChange(event.target.value),
  };

  return (
    <Field
      label={label}
      hint={hint}
      error={error}
      htmlFor={id}
      action={variables ? <VariableMenu onPick={insert} /> : undefined}
    >
      {multiline ? (
        <textarea
          ref={ref}
          rows={rows}
          {...common}
          style={{ ...textarea({ invalid: !!error }), minHeight: `${rows * 22}px` }}
        />
      ) : (
        <input ref={ref} type={type} {...common} style={input({ invalid: !!error })} />
      )}
    </Field>
  );
}

/* ------------------------------------------------------------
   NUMBER

   Keeps what is typed as text so an empty or half-typed value
   does not snap back mid-edit; only commits real numbers.
------------------------------------------------------------ */

export function NumberInput({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  suffix,
  error,
  hint,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  suffix?: string;
  error?: string | null;
  hint?: string;
}) {
  const id = useId();
  const [draft, setDraft] = useState(String(value));

  useEffect(() => {
    if (Number(draft) !== value) setDraft(String(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <Field label={label} hint={hint} error={error} htmlFor={id}>
      <div style={{ position: "relative" }}>
        <input
          id={id}
          type="number"
          inputMode="decimal"
          value={draft}
          min={min}
          max={max}
          step={step}
          aria-invalid={error ? true : undefined}
          onChange={(event) => {
            setDraft(event.target.value);
            const n = Number(event.target.value);
            if (event.target.value.trim() !== "" && Number.isFinite(n)) onChange(n);
          }}
          onBlur={() => setDraft(String(value))}
          style={{ ...input({ invalid: !!error }), paddingRight: suffix ? "34px" : undefined }}
        />
        {suffix ? (
          <span
            style={{
              position: "absolute",
              right: space[5],
              top: "50%",
              transform: "translateY(-50%)",
              ...text.bodySm,
              color: color.textSubtle,
              pointerEvents: "none",
            }}
          >
            {suffix}
          </span>
        ) : null}
      </div>
    </Field>
  );
}

/* ------------------------------------------------------------
   COLOR
------------------------------------------------------------ */

function toSixDigit(value: string) {
  if (/^#[0-9a-f]{3}$/i.test(value)) {
    return `#${value[1]}${value[1]}${value[2]}${value[2]}${value[3]}${value[3]}`;
  }
  return /^#[0-9a-f]{6}$/i.test(value) ? value : "#000000";
}

export function ColorInput({
  label,
  value,
  onChange,
  error,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string | null;
}) {
  const id = useId();
  return (
    <Field label={label} error={error} htmlFor={id}>
      <div style={{ display: "flex", gap: space[3], alignItems: "center" }}>
        <input
          type="color"
          aria-label={`${label} picker`}
          value={toSixDigit(value)}
          onChange={(event) => onChange(event.target.value.toUpperCase())}
          style={{
            width: "38px",
            height: "38px",
            padding: 2,
            border: `1px solid ${color.border}`,
            borderRadius: radius.md,
            background: color.surface,
            cursor: "pointer",
            flexShrink: 0,
          }}
        />
        <input
          id={id}
          type="text"
          value={value}
          maxLength={7}
          aria-invalid={error ? true : undefined}
          onChange={(event) => {
            let next = event.target.value.trim();
            if (next && !next.startsWith("#")) next = `#${next}`;
            onChange(next.toUpperCase());
          }}
          style={{ ...input({ invalid: !!error }), fontFamily: "ui-monospace, Menlo, monospace" }}
        />
      </div>
    </Field>
  );
}

/* ------------------------------------------------------------
   SELECT / SEGMENTED / TOGGLE
------------------------------------------------------------ */

export function SelectInput<T extends string | number>({
  label,
  value,
  options,
  onChange,
  error,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  error?: string | null;
}) {
  const id = useId();
  return (
    <Field label={label} error={error} htmlFor={id}>
      <select
        id={id}
        value={String(value)}
        onChange={(event) => {
          const picked = options.find((o) => String(o.value) === event.target.value);
          if (picked) onChange(picked.value);
        }}
        style={{ ...input({ invalid: !!error }), cursor: "pointer" }}
      >
        {options.map((option) => (
          <option key={String(option.value)} value={String(option.value)}>
            {option.label}
          </option>
        ))}
      </select>
    </Field>
  );
}

export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <Field label={label}>
      <div
        role="radiogroup"
        aria-label={label}
        style={{
          display: "flex",
          padding: space[1],
          gap: space[1],
          background: color.surfaceSunken,
          border: `1px solid ${color.border}`,
          borderRadius: radius.md,
        }}
      >
        {options.map((option) => {
          const active = option.value === value;
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onChange(option.value)}
              style={{
                flex: 1,
                height: "30px",
                border: 0,
                borderRadius: radius.sm,
                background: active ? color.surface : "transparent",
                boxShadow: active ? shadow.xs : "none",
                color: active ? color.textStrong : color.textMuted,
                fontSize: "12px",
                fontWeight: fontWeight.semibold,
                cursor: "pointer",
                transition: transition.base,
              }}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </Field>
  );
}

export function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  const track: CSSProperties = {
    position: "relative",
    width: "34px",
    height: "20px",
    borderRadius: radius.pill,
    background: checked ? color.primary : color.borderStrong,
    transition: transition.base,
    flexShrink: 0,
  };
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      style={{
        display: "flex",
        alignItems: "center",
        gap: space[4],
        border: 0,
        background: "transparent",
        padding: 0,
        cursor: "pointer",
        ...text.body,
        color: color.textStrong,
        fontWeight: fontWeight.medium,
      }}
    >
      <span style={track}>
        <span
          style={{
            position: "absolute",
            top: "2px",
            left: checked ? "16px" : "2px",
            width: "16px",
            height: "16px",
            borderRadius: radius.circle,
            background: color.surface,
            boxShadow: shadow.sm,
            transition: `left 150ms ease`,
          }}
        />
      </span>
      {label}
    </button>
  );
}

export const ALIGN_OPTIONS = [
  { value: "left" as const, label: "Left" },
  { value: "center" as const, label: "Center" },
  { value: "right" as const, label: "Right" },
];

/* ------------------------------------------------------------
   INLINE INPUT

   A borderless row input for the email header (From, Subject…),
   styled like a mail client's compose window.
------------------------------------------------------------ */

export function InlineInput({
  label,
  value,
  onChange,
  placeholder,
  error,
  variables,
  type = "text",
  maxLength,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  error?: string | null;
  variables?: boolean;
  type?: "text" | "email";
  maxLength?: number;
}) {
  const id = useId();
  const ref = useRef<HTMLInputElement>(null);
  const pendingCaret = useRef<number | null>(null);

  useEffect(() => {
    if (pendingCaret.current !== null && ref.current) {
      ref.current.focus();
      ref.current.setSelectionRange(pendingCaret.current, pendingCaret.current);
      pendingCaret.current = null;
    }
  });

  const insert = (token: string) => {
    const el = ref.current;
    const start = el?.selectionStart ?? value.length;
    const end = el?.selectionEnd ?? value.length;
    pendingCaret.current = start + token.length;
    onChange(value.slice(0, start) + token + value.slice(end));
  };

  return (
    <div style={{ minWidth: 0 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: space[5],
          minHeight: "44px",
          borderBottom: `1px solid ${error ? color.dangerSolid : color.border}`,
        }}
      >
        <label
          htmlFor={id}
          style={{ ...text.body, color: color.textMuted, flexShrink: 0, minWidth: "84px" }}
        >
          {label}
        </label>
        <input
          ref={ref}
          id={id}
          type={type}
          value={value}
          maxLength={maxLength}
          placeholder={placeholder}
          aria-invalid={error ? true : undefined}
          onChange={(event) => onChange(event.target.value)}
          style={{
            flex: 1,
            minWidth: 0,
            border: 0,
            outline: "none",
            background: "transparent",
            ...text.body,
            color: color.textStrong,
            padding: `${space[3]} 0`,
          }}
        />
        {variables ? <VariableMenu compact onPick={insert} /> : null}
      </div>
      {error ? (
        <span role="alert" style={{ ...fieldHint({ invalid: true }), display: "block", marginTop: space[2] }}>
          {error}
        </span>
      ) : null}
    </div>
  );
}
