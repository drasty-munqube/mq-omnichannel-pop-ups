/* ============================================================
   useScrollReveal

   Reveals `[data-mq-reveal]` elements as they scroll into view,
   with no dependency and no layout shift.

   Progressive enhancement by design: the CSS only hides an
   element once this hook has added `data-mq-reveal-armed`, so if
   JS never runs — or the browser has no IntersectionObserver, or
   the visitor prefers reduced motion — content simply stays
   visible instead of being stuck at opacity 0.
   ============================================================ */

import { useEffect } from "react";

export function useScrollReveal(
  options: {
    /* re-arm when this changes (route change, tab switch) */
    key?: unknown;
    /* how far into the viewport before revealing */
    rootMargin?: string;
  } = {},
) {
  const { key, rootMargin = "0px 0px -10% 0px" } = options;

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const prefersReducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    const targets = Array.from(
      document.querySelectorAll<HTMLElement>(
        "[data-mq-reveal]",
      ),
    );

    if (targets.length === 0) {
      return;
    }

    if (
      prefersReducedMotion ||
      typeof IntersectionObserver === "undefined"
    ) {
      targets.forEach((element) => {
        element.setAttribute("data-mq-visible", "");
      });
      return;
    }

    /* Arm only now that we can guarantee a reveal. */
    targets.forEach((element) => {
      if (!element.hasAttribute("data-mq-visible")) {
        element.setAttribute(
          "data-mq-reveal-armed",
          "",
        );
      }
    });

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) {
            return;
          }

          const element = entry.target as HTMLElement;
          element.setAttribute("data-mq-visible", "");
          observer.unobserve(element);
        });
      },
      { rootMargin, threshold: 0.05 },
    );

    targets.forEach((element) => {
      observer.observe(element);
    });

    return () => {
      observer.disconnect();
    };
  }, [key, rootMargin]);
}
