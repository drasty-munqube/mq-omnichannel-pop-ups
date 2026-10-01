/* ============================================================
   ONBOARDING (shared, browser-safe)

   The first-time guide for merchants:
     - the welcome tour, shown once the first time the app opens,
     - the setup checklist on Home, whose steps tick themselves
       off from the shop's real data.

   What the merchant has seen or dismissed is remembered in this
   browser only (localStorage, per shop). Every read and write is
   wrapped, because storage can be blocked inside the Shopify
   admin iframe, and the guide must never break the page.
   ============================================================ */

/* ------------------------------------------------------------
   BROWSER MEMORY
------------------------------------------------------------ */

export const TOUR_OPEN_EVENT = "mq:open-tour";

export const tourKey = (shop: string) => `mq_onboarding_tour_done:${shop}`;
export const checklistKey = (shop: string) => `mq_onboarding_checklist_hidden:${shop}`;

export function readFlag(key: string): boolean {
  try {
    return window.localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

export function writeFlag(key: string, on: boolean) {
  try {
    if (on) window.localStorage.setItem(key, "1");
    else window.localStorage.removeItem(key);
  } catch {
    /* Storage blocked: the guide simply shows again next time. */
  }
}

/* ------------------------------------------------------------
   WELCOME TOUR
------------------------------------------------------------ */

/* Icon names, drawn with Lucide in the tour dialog. */
export type TourIcon = "welcome" | "popups" | "campaigns" | "contacts" | "logs" | "ready";

export type TourStep = { title: string; body: string; icon: TourIcon };

export const TOUR_STEPS: TourStep[] = [
  {
    icon: "welcome",
    title: "Welcome to MQ Pop-ups",
    body: "Collect emails and phone numbers with popups, send each new subscriber a discount, and see what every visitor did before they signed up. This short tour shows where everything is.",
  },
  {
    icon: "popups",
    title: "Popups",
    body: "Design how your popup looks: the layout, the text, the fields you ask for and the thank-you screen. One popup can be used by many campaigns.",
  },
  {
    icon: "campaigns",
    title: "Campaigns",
    body: "A campaign decides when and to whom a popup shows: which pages, which devices, new or returning visitors, and which discount they get. Launch it to make it live.",
  },
  {
    icon: "contacts",
    title: "Contacts and Visitors",
    body: "Contacts is one list of everyone who comes to your store: anonymous visitors, with the pages they viewed and popups they saw or clicked, and contacts who signed up, with their full Journey.",
  },
  {
    icon: "logs",
    title: "Logs and Settings",
    body: "Logs shows every discount email and its live status from Resend. In Settings you add your own sending domain so emails come from your store's address.",
  },
  {
    icon: "ready",
    title: "You're ready",
    body: "The setup guide on Home walks you through the first steps and ticks them off as you go. You can open this tour again from there at any time.",
  },
];

/* ------------------------------------------------------------
   SETUP CHECKLIST
------------------------------------------------------------ */

export type SetupStatus = {
  storefrontSeen: boolean;
  popupCount: number;
  liveCampaignCount: number;
  verifiedDomainCount: number;
  contactCount: number;
};

export type SetupStep = {
  id: "embed" | "popup" | "campaign" | "domain" | "signup";
  title: string;
  body: string;
  done: boolean;
  optional?: boolean;
  action: { label: string; to?: string; href?: string };
};

/* The theme editor with the app embed switched on. activateAppId
   is the app's client id (SHOPIFY_API_KEY) and the embed block's
   file name. */
export const EMBED_HANDLE = "mq-popup-embed";

export function themeEditorUrl(shop: string, apiKey: string) {
  const params = new URLSearchParams({ context: "apps", template: "index" });
  if (apiKey) params.set("activateAppId", `${apiKey}/${EMBED_HANDLE}`);
  return `https://${shop}/admin/themes/current/editor?${params.toString()}`;
}

export function buildChecklist(status: SetupStatus, links: { themeEditorUrl: string }): SetupStep[] {
  return [
    {
      id: "embed",
      title: "Turn on the app in your theme",
      body: "Switch on the MQ Pop-ups app embed in the theme editor and save. This ticks off once your store sends its first visit.",
      done: status.storefrontSeen,
      action: { label: "Open theme editor", href: links.themeEditorUrl },
    },
    {
      id: "popup",
      title: "Design your first popup",
      body: "Pick a layout, write your offer and choose the fields to collect.",
      done: status.popupCount > 0,
      action: { label: "Create popup", to: "/app/popups" },
    },
    {
      id: "campaign",
      title: "Launch a campaign",
      body: "Choose where and to whom the popup shows, add a discount, then launch it.",
      done: status.liveCampaignCount > 0,
      action: { label: "Create campaign", to: "/app/campaigns" },
    },
    {
      id: "domain",
      title: "Add your sending domain",
      body: "Send discount emails from your own address instead of the default one.",
      done: status.verifiedDomainCount > 0,
      optional: true,
      action: { label: "Add domain", to: "/app/settings/channels/email" },
    },
    {
      id: "signup",
      title: "Get your first signup",
      body: "Visit your store, fill in the popup yourself, and check that the contact and the discount email show up.",
      done: status.contactCount > 0,
      action: { label: "View contacts", to: "/app/contacts" },
    },
  ];
}

export function checklistProgress(steps: SetupStep[]) {
  const required = steps.filter((s) => !s.optional);
  return {
    done: steps.filter((s) => s.done).length,
    total: steps.length,
    requiredDone: required.every((s) => s.done),
  };
}
