/* ============================================================
   WELCOME TOUR

   A short step-by-step introduction, shown the first time a
   merchant opens the app in this browser. Mounted once in the app
   layout, so it appears on whichever page they land on. The Home
   setup guide can open it again (TOUR_OPEN_EVENT).

   The Shopify admin menu lives outside the app's iframe, so the
   tour explains each area in a dialog rather than pointing at the
   menu items.
   ============================================================ */

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, LayoutTemplate, Mail, PartyPopper, Sparkles, Target, Users, type LucideIcon } from "lucide-react";

import { button, modalOverlay, modalPanel } from "../design/styles";
import { color, fontWeight, radius, space, text, zIndex } from "../design/tokens";
import { TOUR_OPEN_EVENT, TOUR_STEPS, readFlag, tourKey, writeFlag, type TourIcon } from "../models/onboarding";

const TOUR_ICONS: Record<TourIcon, LucideIcon> = {
  welcome: Sparkles,
  popups: LayoutTemplate,
  campaigns: Target,
  contacts: Users,
  logs: Mail,
  ready: PartyPopper,
};

export function WelcomeTour({ shop }: { shop: string }) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const nextRef = useRef<HTMLButtonElement>(null);

  /* Decided after hydration, so the server render never shows it. */
  useEffect(() => {
    if (!readFlag(tourKey(shop))) setOpen(true);
    const reopen = () => {
      setStep(0);
      setOpen(true);
    };
    window.addEventListener(TOUR_OPEN_EVENT, reopen);
    return () => window.removeEventListener(TOUR_OPEN_EVENT, reopen);
  }, [shop]);

  const close = useCallback(() => {
    writeFlag(tourKey(shop), true);
    setOpen(false);
  }, [shop]);

  const last = step === TOUR_STEPS.length - 1;

  useEffect(() => {
    if (!open) return;
    nextRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
      if (event.key === "ArrowRight") setStep((s) => Math.min(s + 1, TOUR_STEPS.length - 1));
      if (event.key === "ArrowLeft") setStep((s) => Math.max(s - 1, 0));
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, close, step]);

  if (!open) return null;
  const current = TOUR_STEPS[step];
  const CurrentIcon = TOUR_ICONS[current.icon];

  return (
    <div role="presentation" style={{ ...modalOverlay(), zIndex: zIndex.modal }}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="mq-tour-title"
        aria-describedby="mq-tour-body"
        style={{ ...modalPanel({ width: "520px" }), width: "calc(100% - 32px)" }}
      >
        <div
          style={{
            padding: `${space[9]} ${space[8]} ${space[7]}`,
            background: `linear-gradient(160deg, ${color.accentSubtle} 0%, ${color.surface} 70%)`,
            display: "grid",
            gap: space[5],
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span
              aria-hidden
              style={{
                width: "44px",
                height: "44px",
                borderRadius: radius.lg,
                background: color.accent,
                color: color.textOnFilled,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <CurrentIcon size={22} strokeWidth={2} />
            </span>
            <span style={{ ...text.caption, color: color.textMuted }}>
              Step {step + 1} of {TOUR_STEPS.length}
            </span>
          </div>

          <h2 id="mq-tour-title" style={{ margin: 0, ...text.h2, color: color.textStrong }}>
            {current.title}
          </h2>
          <p id="mq-tour-body" style={{ margin: 0, ...text.body, color: color.text, minHeight: "66px" }}>
            {current.body}
          </p>

          <div role="tablist" aria-label="Tour steps" style={{ display: "flex", gap: space[3] }}>
            {TOUR_STEPS.map((s, i) => (
              <button
                key={s.title}
                type="button"
                role="tab"
                aria-selected={i === step}
                aria-label={`Step ${i + 1}: ${s.title}`}
                onClick={() => setStep(i)}
                style={{
                  width: i === step ? "22px" : "8px",
                  height: "8px",
                  padding: 0,
                  border: 0,
                  borderRadius: radius.pill,
                  background: i === step ? color.accent : color.borderStrong,
                  cursor: "pointer",
                  transition: "width 160ms ease",
                }}
              />
            ))}
          </div>
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: space[4],
            padding: `${space[5]} ${space[8]}`,
            borderTop: `1px solid ${color.borderSubtle}`,
            background: color.surfaceSunken,
          }}
        >
          {last ? (
            <span />
          ) : (
            <button
              type="button"
              onClick={close}
              style={{ ...button("tertiary", "md"), color: color.textMuted, fontWeight: fontWeight.medium }}
            >
              Skip tour
            </button>
          )}
          <div style={{ display: "flex", gap: space[3] }}>
            {step > 0 ? (
              <button type="button" style={button("secondary", "md")} onClick={() => setStep(step - 1)}>
                <ArrowLeft aria-hidden size={15} strokeWidth={2} />
                Back
              </button>
            ) : null}
            <button
              ref={nextRef}
              type="button"
              style={button("primary", "md")}
              onClick={() => (last ? close() : setStep(step + 1))}
            >
              {last ? "Get started" : step === 0 ? "Show me around" : "Next"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
