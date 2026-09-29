import { describe, expect, it } from "vitest";

import { buildChecklist, checklistProgress, themeEditorUrl } from "./onboarding";

const empty = { storefrontSeen: false, popupCount: 0, liveCampaignCount: 0, verifiedDomainCount: 0, contactCount: 0 };
const links = { themeEditorUrl: "https://x" };

describe("onboarding checklist", () => {
  it("starts with nothing done", () => {
    const steps = buildChecklist(empty, links);
    expect(steps.map((s) => s.id)).toEqual(["embed", "popup", "campaign", "domain", "signup"]);
    expect(checklistProgress(steps)).toEqual({ done: 0, total: 5, requiredDone: false });
  });

  it("ticks steps off from real data, and the domain step is optional", () => {
    const steps = buildChecklist({ storefrontSeen: true, popupCount: 2, liveCampaignCount: 1, verifiedDomainCount: 0, contactCount: 3 }, links);
    expect(steps.filter((s) => s.done).map((s) => s.id)).toEqual(["embed", "popup", "campaign", "signup"]);
    expect(checklistProgress(steps)).toEqual({ done: 4, total: 5, requiredDone: true });
  });

  it("deep links to the theme editor with the app embed turned on", () => {
    const url = new URL(themeEditorUrl("demo.myshopify.com", "abc123"));
    expect(url.origin + url.pathname).toBe("https://demo.myshopify.com/admin/themes/current/editor");
    expect(url.searchParams.get("context")).toBe("apps");
    expect(url.searchParams.get("activateAppId")).toBe("abc123/mq-popup-embed");
    expect(new URL(themeEditorUrl("demo.myshopify.com", "")).searchParams.has("activateAppId")).toBe(false);
  });
});
