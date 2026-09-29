/* ============================================================
   SETUP GUIDE (Home)

   The first-time checklist: turn on the app embed, design a
   popup, launch a campaign, add a sending domain, get the first
   signup. Each step is ticked off from the shop's real data, so
   nothing has to be marked by hand. The merchant can hide it;
   that is remembered in this browser only.
   ============================================================ */

import { useEffect, useState } from "react";
import { useNavigate } from "react-router";

import { badge, button, card, interactive } from "../design/styles";
import { color, fontWeight, radius, space, text } from "../design/tokens";
import {
  TOUR_OPEN_EVENT,
  checklistKey,
  checklistProgress,
  readFlag,
  writeFlag,
  type SetupStep,
} from "../models/onboarding";

function Check({ done }: { done: boolean }) {
  return (
    <span
      aria-hidden
      style={{
        width: "22px",
        height: "22px",
        borderRadius: radius.pill,
        flexShrink: 0,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        border: done ? "none" : `1.5px dashed ${color.borderStrong}`,
        background: done ? color.successSolid : color.surface,
        color: color.textOnFilled,
      }}
    >
      {done ? (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
          <path d="m5 12.5 4.5 4.5L19 7" />
        </svg>
      ) : null}
    </span>
  );
}

export function SetupGuide({ shop, steps }: { shop: string; steps: SetupStep[] }) {
  const navigate = useNavigate();
  /* null until hydrated, so the server render and the first
     client render agree. */
  const [hidden, setHidden] = useState<boolean | null>(null);
  const firstOpen = steps.findIndex((s) => !s.done);
  const [expanded, setExpanded] = useState<string | null>(firstOpen >= 0 ? steps[firstOpen].id : null);

  useEffect(() => setHidden(readFlag(checklistKey(shop))), [shop]);

  const progress = checklistProgress(steps);
  const openTour = () => window.dispatchEvent(new Event(TOUR_OPEN_EVENT));
  const hide = (on: boolean) => {
    writeFlag(checklistKey(shop), on);
    setHidden(on);
  };

  if (hidden === null) return null;

  if (hidden) {
    return (
      <div style={{ display: "flex", justifyContent: "flex-end", gap: space[5], marginBottom: space[5] }}>
        <button type="button" onClick={openTour} style={{ ...button("tertiary", "sm"), color: color.textMuted }}>
          Take the tour
        </button>
        <button type="button" onClick={() => hide(false)} style={{ ...button("tertiary", "sm"), color: color.textMuted }}>
          Show setup guide ({progress.done}/{progress.total})
        </button>
      </div>
    );
  }

  const pct = Math.round((progress.done / progress.total) * 100);

  return (
    <section aria-labelledby="mq-setup-title" data-mq-reveal style={{ ...card({ elevation: "raised" }), marginBottom: space[5], overflow: "hidden" }}>
      <div style={{ padding: `${space[6]} ${space[7]}`, display: "grid", gap: space[4], borderBottom: `1px solid ${color.borderSubtle}` }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: space[5], flexWrap: "wrap" }}>
          <div>
            <h2 id="mq-setup-title" style={{ margin: 0, ...text.h3, color: color.textStrong }}>
              {progress.requiredDone ? "You're all set" : "Get started with MQ Pop-ups"}
            </h2>
            <p style={{ margin: `${space[2]} 0 0`, ...text.bodySm, color: color.textMuted }}>
              {progress.requiredDone
                ? "Your popups are live and collecting signups. You can hide this guide now."
                : "A few steps to get your first popup live and your first signup in."}
            </p>
          </div>
          <div style={{ display: "flex", gap: space[3], alignItems: "center" }}>
            <button type="button" onClick={openTour} style={button("secondary", "sm")}>
              Take the tour
            </button>
            <button type="button" onClick={() => hide(true)} style={{ ...button("tertiary", "sm"), color: color.textMuted }}>
              Hide
            </button>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: space[5] }}>
          <span style={{ ...text.bodySm, color: color.text, fontWeight: fontWeight.medium, whiteSpace: "nowrap" }}>
            {progress.done} of {progress.total} done
          </span>
          <div
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={progress.total}
            aria-valuenow={progress.done}
            aria-label="Setup progress"
            style={{ flex: 1, height: "6px", borderRadius: radius.pill, background: color.borderSubtle, overflow: "hidden" }}
          >
            <div style={{ width: `${pct}%`, height: "100%", background: color.successSolid, transition: "width 300ms ease" }} />
          </div>
        </div>
      </div>

      <ol style={{ listStyle: "none", margin: 0, padding: space[3] }}>
        {steps.map((s) => {
          const isOpen = expanded === s.id;
          return (
            <li key={s.id} style={{ borderRadius: radius.md, background: isOpen ? color.surfaceSunken : "transparent" }}>
              <button
                type="button"
                {...interactive}
                aria-expanded={isOpen}
                onClick={() => setExpanded(isOpen ? null : s.id)}
                style={{
                  width: "100%",
                  display: "flex",
                  alignItems: "center",
                  gap: space[5],
                  padding: `${space[5]} ${space[5]}`,
                  background: "transparent",
                  border: 0,
                  cursor: "pointer",
                  textAlign: "left",
                }}
              >
                <Check done={s.done} />
                <span
                  style={{
                    flex: 1,
                    ...text.body,
                    fontWeight: fontWeight.semibold,
                    color: s.done ? color.textMuted : color.textStrong,
                    textDecoration: s.done ? "line-through" : "none",
                  }}
                >
                  {s.title}
                </span>
                {s.optional ? <span style={badge("neutral")}>OPTIONAL</span> : null}
                {s.done ? <span style={badge("success")}>DONE</span> : null}
              </button>

              {isOpen ? (
                <div style={{ padding: `0 ${space[5]} ${space[5]} calc(${space[5]} + 22px + ${space[5]})`, display: "grid", gap: space[4], justifyItems: "start" }}>
                  <p style={{ margin: 0, ...text.bodySm, color: color.text }}>{s.body}</p>
                  {s.action.href ? (
                    <a href={s.action.href} target="_blank" rel="noopener noreferrer" style={{ ...button(s.done ? "secondary" : "primary", "sm"), textDecoration: "none" }}>
                      {s.action.label} ↗
                    </a>
                  ) : (
                    <button type="button" style={button(s.done ? "secondary" : "primary", "sm")} onClick={() => s.action.to && navigate(s.action.to)}>
                      {s.action.label}
                    </button>
                  )}
                </div>
              ) : null}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
