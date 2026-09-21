import { useEffect, useState } from "react";
import type {
  ActionFunctionArgs,
  LoaderFunctionArgs,
} from "react-router";
import {
  useActionData,
  useLoaderData,
  useNavigation,
  useRevalidator,
  useSubmit,
} from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import {
  ensureShopifySite,
  listSites,
} from "../models/site.server";
import {
  buildCampaignSnippet,
  CodeBlock,
  CopyButton,
} from "../components/copy-snippet";


/* ------------------------------------------------------------
   Menu items arrive as full URLs on whatever domain the store
   serves, so they are reduced to the path the browser will
   actually be on. Lowercased and stripped of query, hash and a
   trailing slash so that what is stored and what the widget
   compares are the same string.
   ------------------------------------------------------------ */

function toStorefrontPath(
  url: string | null | undefined,
): string | null {
  if (!url) {
    return null;
  }

  let path = String(url).trim();

  if (!path) {
    return null;
  }

  path = path.replace(
    /^[a-z][a-z0-9+.-]*:\/\/[^/]*/i,
    "",
  );

  path = path.split("?")[0].split("#")[0];

  if (!path.startsWith("/")) {
    path = "/" + path;
  }

  path = path.toLowerCase();

  if (path.length > 1) {
    path = path.replace(/\/+$/, "");
  }

  return path || "/";
}

/* ============================================================
   LOADER
   ============================================================ */

export async function loader({
  request,
}: LoaderFunctionArgs) {
  const { admin, session } =
    await authenticate.admin(request);

  const popups = await db.popup.findMany({
    where: {
      shop: session.shop,
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  const campaigns = await db.campaign.findMany({
    where: {
      shop: session.shop,
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  /* SHOPIFY ONLINE STORE PAGES */

  let shopPages: {
    id: string;
    title: string;
    handle: string;
  }[] = [];

  let shopPagesError: string | null = null;

  try {
    const response = await admin.graphql(
      `#graphql
        query CampaignTargetPages {
          pages(first: 250, sortKey: TITLE) {
            edges {
              node {
                id
                title
                handle
              }
            }
          }
        }
      `,
    );

    const body = (await response.json()) as {
      data?: {
        pages?: {
          edges?: {
            node: {
              id: string;
              title: string;
              handle: string;
            };
          }[];
        };
      };
      errors?: unknown;
    };

    if (body.errors) {
      shopPagesError =
        "Could not read this store's pages. The app needs the read_content permission, which is granted when the app is installed or reinstalled. Open the app from Settings, Apps and sales channels, remove it and install it again, then come back here.";
    } else {
      shopPages =
        body.data?.pages?.edges?.map(
          (edge) => edge.node,
        ) || [];
    }
  } catch (error) {
    console.error(
      "LOAD SHOP PAGES ERROR:",
      error,
    );

    shopPagesError =
      "Could not read this store's pages. The app needs the read_content permission, which is granted when the app is installed or reinstalled. Open the app from Settings, Apps and sales channels, remove it and install it again, then come back here.";
  }

  /* SHOPIFY STOREFRONT NAVIGATION

     The Pages query above only returns Shopify's Page resource,
     so a storefront whose menu reads Home, Catalog, Contact only
     offered Contact — Home is a route and Catalog is a
     collection, neither of which is a Page.

     Reading the store's actual menus gives the list a merchant
     recognises, because it is literally their own navigation.
     Every item is targeted by its path, which works no matter
     what kind of resource it points at.

     Wrapped in its own try/catch and allowed to come back empty:
     the menus query needs its own permission, and if it is not
     granted the page list below must still work. */

  let navItems: {
    id: string;
    title: string;
    path: string;
  }[] = [];

  try {
    const response = await admin.graphql(
      `#graphql
        query CampaignTargetMenus {
          menus(first: 10) {
            edges {
              node {
                id
                items {
                  id
                  title
                  url
                  items {
                    id
                    title
                    url
                  }
                }
              }
            }
          }
        }
      `,
    );

    const body = (await response.json()) as {
      data?: {
        menus?: {
          edges?: {
            node: {
              items?: {
                id: string;
                title: string;
                url: string | null;
                items?: {
                  id: string;
                  title: string;
                  url: string | null;
                }[];
              }[];
            };
          }[];
        };
      };
      errors?: unknown;
    };

    if (!body.errors) {
      const seen = new Set<string>();

      const add = (item: {
        id: string;
        title: string;
        url: string | null;
      }) => {
        const path = toStorefrontPath(item.url);

        if (!path || seen.has(path)) {
          return;
        }

        seen.add(path);

        navItems.push({
          id: item.id,
          title: item.title,
          path,
        });
      };

      for (const edge of body.data?.menus
        ?.edges || []) {
        for (const item of edge.node.items ||
          []) {
          add(item);

          for (const child of item.items || []) {
            add(child);
          }
        }
      }
    }
  } catch (error) {
    console.error(
      "LOAD STORE NAVIGATION ERROR:",
      error,
    );
  }

  /* SHOPIFY DISCOUNTS */

  let discounts: {
    id: string;
    title: string;
    code: string | null;
    kind: string;
    status: string;
    summary: string;
  }[] = [];

  let discountsError: string | null = null;

  try {
    const response = await admin.graphql(
      `#graphql
        query CampaignRewardDiscounts {
          discountNodes(first: 50) {
            edges {
              node {
                id
                discount {
                  __typename
                  ... on DiscountCodeBasic {
                    title
                    status
                    codes(first: 1) {
                      edges { node { code } }
                    }
                    customerGets {
                      value {
                        __typename
                        ... on DiscountPercentage {
                          percentage
                        }
                        ... on DiscountAmount {
                          amount {
                            amount
                            currencyCode
                          }
                        }
                      }
                    }
                  }
                  ... on DiscountCodeFreeShipping {
                    title
                    status
                    codes(first: 1) {
                      edges { node { code } }
                    }
                  }
                  ... on DiscountCodeBxgy {
                    title
                    status
                    codes(first: 1) {
                      edges { node { code } }
                    }
                  }
                  ... on DiscountAutomaticBasic {
                    title
                    status
                    customerGets {
                      value {
                        __typename
                        ... on DiscountPercentage {
                          percentage
                        }
                        ... on DiscountAmount {
                          amount {
                            amount
                            currencyCode
                          }
                        }
                      }
                    }
                  }
                  ... on DiscountAutomaticFreeShipping {
                    title
                    status
                  }
                  ... on DiscountAutomaticBxgy {
                    title
                    status
                  }
                }
              }
            }
          }
        }
      `,
    );

    const body = (await response.json()) as {
      data?: {
        discountNodes?: {
          edges?: {
            node: {
              id: string;
              discount: any;
            };
          }[];
        };
      };
      errors?: unknown;
    };

    if (body.errors) {
      discountsError =
        "Could not load your Shopify discounts. Approve the updated app permissions to pick a discount here.";
    } else {
      discounts = (
        body.data?.discountNodes?.edges || []
      )
        .map((edge) => {
          const node = edge.node;
          const discount = node.discount || {};

          const typeName: string =
            discount.__typename || "";

          if (!discount.title) {
            return null;
          }

          const code =
            discount.codes?.edges?.[0]?.node
              ?.code || null;

          const value =
            discount.customerGets?.value;

          let summary = "Discount";

          if (
            typeName.includes("FreeShipping")
          ) {
            summary = "Free shipping";
          } else if (typeName.includes("Bxgy")) {
            summary = "Buy X get Y";
          } else if (
            value?.__typename ===
            "DiscountPercentage"
          ) {
            summary = `${Math.round(
              (value.percentage || 0) * 100,
            )}% off`;
          } else if (
            value?.__typename ===
            "DiscountAmount"
          ) {
            summary = `${
              value.amount?.currencyCode || ""
            } ${value.amount?.amount || ""} off`.trim();
          }

          return {
            id: node.id,
            title: discount.title as string,
            code,
            kind: typeName.startsWith(
              "DiscountAutomatic",
            )
              ? "Automatic"
              : "Code",
            status:
              (discount.status as string) ||
              "ACTIVE",
            summary,
          };
        })
        .filter(
          (
            discount,
          ): discount is {
            id: string;
            title: string;
            code: string | null;
            kind: string;
            status: string;
            summary: string;
          } => discount !== null,
        );
    }
  } catch (error) {
    console.error(
      "LOAD DISCOUNTS ERROR:",
      error,
    );

    discountsError =
      "Could not load your Shopify discounts. Approve the updated app permissions to pick a discount here.";
  }

  /* WEBSITES THIS CAMPAIGN CAN RUN ON

     ensureShopifySite means the storefront is always in the
     list, even for shops that installed before site targeting
     existed. */

  await ensureShopifySite(session.shop);

  const sites = (
    await listSites(session.shop)
  ).map((site) => ({
    id: site.id,
    name: site.name,
    domain: site.domain,
    kind: site.kind,
  }));

  /* Needed to render a campaign's own embed snippet in the
     wizard. Falls back to the request origin if the deploy
     environment has not set SHOPIFY_APP_URL. */

  const appUrl = (
    process.env.SHOPIFY_APP_URL ||
    new URL(request.url).origin
  ).replace(/\/+$/, "");

  return {
    popups,
    campaigns,
    shopPages,
    shopPagesError,
    navItems,
    discounts,
    discountsError,
    sites,
    shop: session.shop,
    appUrl,
  };
}

/* ============================================================
   ACTION — CAMPAIGN CRUD
   ============================================================ */

export async function action({
  request,
}: ActionFunctionArgs) {
  const { session } =
    await authenticate.admin(request);

  const formData = await request.formData();

  const intent = String(
    formData.get("intent") || "",
  ).trim();

  /* ---------------------------------------------------------
     DELETE
  --------------------------------------------------------- */

  if (intent === "deleteCampaign") {
    const campaignId = String(
      formData.get("campaignId") || "",
    ).trim();

    if (!campaignId) {
      return {
        ok: false,
        error: "Campaign ID is required.",
      };
    }

    try {
      await db.campaign.deleteMany({
        where: {
          id: campaignId,
          shop: session.shop,
        },
      });

      return {
        ok: true,
        intent: "deleteCampaign" as const,
      };
    } catch (error) {
      console.error(
        "DELETE CAMPAIGN ERROR:",
        error,
      );

      return {
        ok: false,
        error: "Unable to delete campaign.",
      };
    }
  }

  /* ---------------------------------------------------------
     TOGGLE STATUS
  --------------------------------------------------------- */

  if (intent === "toggleCampaignStatus") {
    const campaignId = String(
      formData.get("campaignId") || "",
    ).trim();

    const nextStatus = String(
      formData.get("status") || "",
    ).trim();

    if (
      !campaignId ||
      (nextStatus !== "active" &&
        nextStatus !== "draft")
    ) {
      return {
        ok: false,
        error: "Invalid status update.",
      };
    }

    try {
      await db.campaign.updateMany({
        where: {
          id: campaignId,
          shop: session.shop,
        },
        data: {
          status: nextStatus,
        },
      });

      return {
        ok: true,
        intent:
          "toggleCampaignStatus" as const,
      };
    } catch (error) {
      console.error(
        "TOGGLE CAMPAIGN STATUS ERROR:",
        error,
      );

      return {
        ok: false,
        error: "Unable to update status.",
      };
    }
  }

  /* ---------------------------------------------------------
     CREATE / UPDATE
  --------------------------------------------------------- */

  if (
    intent === "saveCampaign" ||
    intent === "publishCampaign"
  ) {
    const campaignId = String(
      formData.get("campaignId") || "",
    ).trim();

    const name = String(
      formData.get("name") || "",
    ).trim();

    const description = String(
      formData.get("description") || "",
    ).trim();

    const type =
      String(
        formData.get("type") || "targeted",
      ).trim() || "targeted";

    const audience = String(
      formData.get("audience") || "",
    ).trim();

    const popupId = String(
      formData.get("popupId") || "",
    ).trim();

    const trigger = String(
      formData.get("trigger") || "",
    ).trim();

    const reward = String(
      formData.get("reward") || "",
    ).trim();

    const rewardDiscountId = String(
      formData.get("rewardDiscountId") || "",
    ).trim();

    const rewardDiscountCode = String(
      formData.get("rewardDiscountCode") || "",
    ).trim();

    const pageTargetMode =
      String(
        formData.get("pageTargetMode") || "all",
      ).trim() === "specific"
        ? "specific"
        : "all";

    /* Which websites this campaign is allowed on. "all" is the
       default and what every campaign created before site
       targeting existed uses, so nothing already live changes
       behaviour. */

    const siteTargetMode =
      String(
        formData.get("siteTargetMode") || "all",
      ).trim() === "selected"
        ? "selected"
        : "all";

    const triggerDelaySeconds = Math.min(
      120,
      Math.max(
        1,
        Number(
          formData.get("triggerDelaySeconds"),
        ) || 5,
      ),
    );

    const triggerScrollPercent = Math.min(
      100,
      Math.max(
        5,
        Number(
          formData.get("triggerScrollPercent"),
        ) || 50,
      ),
    );

    let pageTargets: unknown = [];

    try {
      pageTargets = JSON.parse(
        String(
          formData.get("pageTargets") || "[]",
        ),
      );
    } catch {
      pageTargets = [];
    }

    if (!Array.isArray(pageTargets)) {
      pageTargets = [];
    }

    let siteTargets: string[] = [];

    try {
      const parsed = JSON.parse(
        String(
          formData.get("siteTargets") || "[]",
        ),
      );

      siteTargets = Array.isArray(parsed)
        ? parsed
            .map((value) => String(value))
            .filter(Boolean)
        : [];
    } catch {
      siteTargets = [];
    }

    /* HOW OFTEN, AND ON WHAT

       All of these are clamped rather than rejected: a nonsense
       number in the form should land on a sane value, not block
       the merchant from saving their campaign. */

    const frequencyModeRaw = String(
      formData.get("frequencyMode") || "unlimited",
    ).trim();

    const frequencyMode = [
      "once",
      "limited",
    ].includes(frequencyModeRaw)
      ? frequencyModeRaw
      : "unlimited";

    const frequencyLimit = Math.min(
      50,
      Math.max(
        1,
        Number(formData.get("frequencyLimit")) ||
          3,
      ),
    );

    const reshowCollectedDays = Math.min(
      365,
      Math.max(
        0,
        Math.floor(
          Number(
            formData.get(
              "reshowCollectedDays",
            ),
          ) || 0,
        ),
      ),
    );

    const reshowDismissedDays = Math.min(
      365,
      Math.max(
        0,
        Math.floor(
          Number(
            formData.get(
              "reshowDismissedDays",
            ),
          ) || 0,
        ),
      ),
    );

    const ALLOWED_DEVICES = [
      "desktop",
      "tablet",
      "mobile",
    ];

    let devices: string[] = ALLOWED_DEVICES;

    try {
      const parsed = JSON.parse(
        String(
          formData.get("devices") || "[]",
        ),
      );

      const cleaned = Array.isArray(parsed)
        ? parsed
            .map((value) => String(value))
            .filter((value) =>
              ALLOWED_DEVICES.includes(value),
            )
        : [];

      /* Empty means the merchant unticked everything, which
         would hide the campaign from every visitor. Treat it as
         no device targeting instead. */
      devices =
        cleaned.length > 0
          ? cleaned
          : ALLOWED_DEVICES;
    } catch {
      devices = ALLOWED_DEVICES;
    }

    /* SERVER-SIDE VALIDATION */

    if (name.length < 3 || name.length > 60) {
      return {
        ok: false,
        error:
          "Campaign name must be between 3 and 60 characters.",
      };
    }

    if (
      description.length < 10 ||
      description.length > 500
    ) {
      return {
        ok: false,
        error:
          "Campaign description must be between 10 and 500 characters.",
      };
    }

    /* A published campaign must be complete —
       drafts may still be missing later steps. */

    if (intent === "publishCampaign") {
      if (!audience) {
        return {
          ok: false,
          error: "An audience is required.",
        };
      }

      if (!trigger) {
        return {
          ok: false,
          error: "A trigger is required.",
        };
      }

      if (!reward) {
        return {
          ok: false,
          error:
            "A reward option is required.",
        };
      }

      if (
        pageTargetMode === "specific" &&
        (pageTargets as unknown[]).length === 0
      ) {
        return {
          ok: false,
          error:
            "Select at least one page, or target all pages.",
        };
      }

      /* Publishing a campaign scoped to no website at all
         would put it live where nobody can ever see it. */

      if (
        siteTargetMode === "selected" &&
        siteTargets.length === 0
      ) {
        return {
          ok: false,
          error:
            "Select at least one website, or target all websites.",
        };
      }
    }

    if (popupId) {
      const popup = await db.popup.findFirst({
        where: {
          id: popupId,
          shop: session.shop,
        },
        select: { id: true },
      });

      if (!popup) {
        return {
          ok: false,
          error: "Selected popup was not found.",
        };
      }
    }

    /* Only keep site ids that actually belong to this shop, so
       a tampered form can never point a campaign at someone
       else's website or at a row that has since been deleted. */

    if (siteTargets.length > 0) {
      const ownedSites = await db.site.findMany({
        where: {
          shop: session.shop,
          id: { in: siteTargets },
        },
        select: { id: true },
      });

      const ownedIds = new Set(
        ownedSites.map((site) => site.id),
      );

      siteTargets = siteTargets.filter((id) =>
        ownedIds.has(id),
      );
    }

    const data = {
      name,
      description,
      type,
      audience,
      popupId: popupId || null,
      trigger,
      triggerDelaySeconds,
      triggerScrollPercent,
      pageTargetMode,
      pageTargets: pageTargets as any,
      siteTargetMode,
      siteTargets: siteTargets as any,
      frequencyMode,
      frequencyLimit,
      reshowCollectedDays,
      reshowDismissedDays,
      devices: devices as any,
      reward,
      rewardDiscountId:
        rewardDiscountId || null,
      rewardDiscountCode:
        rewardDiscountCode || null,
      status:
        intent === "publishCampaign"
          ? "active"
          : "draft",
    };

    try {
      if (campaignId) {
        const existing =
          await db.campaign.findFirst({
            where: {
              id: campaignId,
              shop: session.shop,
            },
            select: { id: true },
          });

        if (!existing) {
          return {
            ok: false,
            error: "Campaign not found.",
          };
        }

        const campaign =
          await db.campaign.update({
            where: { id: campaignId },
            data,
          });

        return {
          ok: true,
          intent: "saveCampaign" as const,
          campaignId: campaign.id,
          published:
            intent === "publishCampaign",
        };
      }

      const campaign = await db.campaign.create(
        {
          data: {
            ...data,
            shop: session.shop,
          },
        },
      );

      return {
        ok: true,
        intent: "saveCampaign" as const,
        campaignId: campaign.id,
        published: intent === "publishCampaign",
      };
    } catch (error) {
      console.error(
        "SAVE CAMPAIGN ERROR:",
        error,
      );

      return {
        ok: false,
        error: "Unable to save campaign.",
      };
    }
  }

  return {
    ok: false,
    error: "Invalid action.",
  };
}

/* ============================================================
   OFFER PREVIEW HELPER
   ============================================================ */

function getOfferPreview(steps: unknown) {
  const fallback = {
    heading: "Untitled offer",
    text: "",
    buttonText: "Continue",
    headerBackground: "#0B3D66",
    headerGradientEnd: "#0B3D66",
  };

  if (!Array.isArray(steps)) {
    return fallback;
  }

  const offerStep = steps.find(
    (step: any) => step?.id === "offer",
  );

  if (!offerStep || !Array.isArray(offerStep.blocks)) {
    return fallback;
  }

  const heading = offerStep.blocks.find(
    (block: any) => block?.type === "heading",
  );

  const text = offerStep.blocks.find(
    (block: any) => block?.type === "text",
  );

  const button = offerStep.blocks.find(
    (block: any) =>
      block?.type === "button" ||
      block?.type === "channel",
  );

  const settings = offerStep.settings || {};

  return {
    heading: heading?.text || fallback.heading,
    text: text?.text || "",
    buttonText:
      button?.text || fallback.buttonText,
    headerBackground:
      settings.headerBackground ||
      fallback.headerBackground,
    headerGradientEnd:
      settings.headerGradientEnd ||
      settings.headerBackground ||
      fallback.headerGradientEnd,
  };
}

type CampaignType =
  | "targeted"
  | "broadcast"
  | "full"
  | null;

export default function Campaigns() {
  const {
    popups,
    campaigns,
    shopPages,
    shopPagesError,
    navItems,
    discounts,
    discountsError,
    sites,
    shop,
    appUrl,
  } = useLoaderData<typeof loader>();

  const submit = useSubmit();

  const navigation = useNavigation();

  const actionData =
    useActionData<typeof action>();

  const revalidator = useRevalidator();

  const saving =
    navigation.state === "submitting";

  /* =========================================================
     CAMPAIGN CHOOSER
  ========================================================= */

  const [showChooser, setShowChooser] = useState(false);

  const [selectedType, setSelectedType] =
    useState<CampaignType>(null);

  /* =========================================================
     CAMPAIGN WIZARD
  ========================================================= */

  const [showWizard, setShowWizard] = useState(false);

  const [wizardStep, setWizardStep] = useState(1);

  /* =========================================================
     THE PAGE LIST A MERCHANT RECOGNISES

     Their own storefront navigation first, since that is what
     they see on their site, with any Shopify Page not linked
     from a menu added after it so nothing becomes unreachable.

     A nav item pointing at /pages/<handle> is stored as
     page:<handle> rather than by path. That keeps selections
     made before navigation existed checked, and keeps using the
     storefront's existing handle matching for those.
  ========================================================= */

  const storePageOptions = (() => {
    const pageByPath = new Map(
      shopPages.map((page) => [
        `/pages/${page.handle.toLowerCase()}`,
        page,
      ]),
    );

    const options: {
      key: string;
      value: string;
      label: string;
      hint: string;
    }[] = [];

    const used = new Set<string>();

    for (const item of navItems) {
      const page = pageByPath.get(item.path);

      const value = page
        ? `page:${page.handle}`
        : `path:${item.path}`;

      if (used.has(value)) {
        continue;
      }

      used.add(value);

      options.push({
        key: item.id,
        value,
        label: item.title,
        hint: item.path,
      });
    }

    for (const page of shopPages) {
      const value = `page:${page.handle}`;

      if (used.has(value)) {
        continue;
      }

      used.add(value);

      options.push({
        key: page.id,
        value,
        label: page.title,
        hint: `/pages/${page.handle}`,
      });
    }

    return options;
  })();

  const totalSteps = 5;

  /* =========================================================
     CAMPAIGN DATA
  ========================================================= */

  const [editingCampaignId, setEditingCampaignId] =
    useState<string | null>(null);

  const [
    campaignPendingDelete,
    setCampaignPendingDelete,
  ] = useState<{
    id: string;
    name: string;
  } | null>(null);

  const [campaignName, setCampaignName] = useState("");

  const [campaignDescription, setCampaignDescription] =
    useState("");

  const [selectedAudience, setSelectedAudience] =
    useState("");

  const [selectedPopup, setSelectedPopup] =
    useState("");

  /* =========================================================
     TRIGGER SETTINGS
  ========================================================= */

  const [triggerDelaySeconds, setTriggerDelaySeconds] =
    useState(5);

  const [
    triggerScrollPercent,
    setTriggerScrollPercent,
  ] = useState(50);

  /* =========================================================
     PAGE TARGETING
  ========================================================= */

  const [pageTargetMode, setPageTargetMode] =
    useState<"all" | "specific">("all");

  const [pageTargets, setPageTargets] = useState<
    string[]
  >([]);

  const togglePageTarget = (value: string) => {
    setPageTargets((current) =>
      current.includes(value)
        ? current.filter(
            (item) => item !== value,
          )
        : [...current, value],
    );

    clearError("pageTargets");
  };

  /* =========================================================
     WEBSITE TARGETING

     Page targeting above is about where inside a storefront a
     popup shows. This is about which website it shows on at
     all, which matters as soon as the embed snippet is on more
     than one site.
  ========================================================= */

  const [siteTargetMode, setSiteTargetMode] =
    useState<"all" | "selected">("all");

  const [siteTargets, setSiteTargets] = useState<
    string[]
  >([]);

  const toggleSiteTarget = (value: string) => {
    setSiteTargets((current) =>
      current.includes(value)
        ? current.filter(
            (item) => item !== value,
          )
        : [...current, value],
    );

    clearError("siteTargets");
  };

  /* =========================================================
     FREQUENCY AND DEVICES

     How often one visitor may see this campaign, how long to
     wait before showing it again once they act on it, and which
     screen widths it is allowed on.
  ========================================================= */

  const [frequencyMode, setFrequencyMode] =
    useState<
      "unlimited" | "once" | "limited"
    >("unlimited");

  const [frequencyLimit, setFrequencyLimit] =
    useState(3);

  const [
    reshowCollectedDays,
    setReshowCollectedDays,
  ] = useState(0);

  const [
    reshowDismissedDays,
    setReshowDismissedDays,
  ] = useState(1);

  const ALL_DEVICES = [
    "desktop",
    "tablet",
    "mobile",
  ];

  const [devices, setDevices] = useState<
    string[]
  >(ALL_DEVICES);

  const toggleDevice = (value: string) => {
    setDevices((current) =>
      current.includes(value)
        ? current.filter(
            (item) => item !== value,
          )
        : [...current, value],
    );

    clearError("devices");
  };

  /* =========================================================
     FIELD VALIDATION
  ========================================================= */

  const [errors, setErrors] =
    useState<Record<string, string>>({});

  const clearError = (field: string) => {
    setErrors((current) => {
      if (!current[field]) {
        return current;
      }

      const next = { ...current };
      delete next[field];
      return next;
    });
  };

  /* =========================================================
     LIVE POPUPS + SEARCH
  ========================================================= */

  const [popupSearch, setPopupSearch] =
    useState("");

  const [popupPage, setPopupPage] =
    useState(1);

  const popupPageSize = 4;

  const livePopups = popups.filter(
    (popup) =>
      popup.status.toLowerCase() === "active",
  );

  const searchedPopups = popupSearch.trim()
    ? livePopups.filter((popup) =>
        popup.name
          .toLowerCase()
          .includes(
            popupSearch.trim().toLowerCase(),
          ),
      )
    : livePopups;

  const popupTotalPages = Math.max(
    1,
    Math.ceil(
      searchedPopups.length / popupPageSize,
    ),
  );

  const popupSafePage = Math.min(
    popupPage,
    popupTotalPages,
  );

  const paginatedWizardPopups =
    searchedPopups.slice(
      (popupSafePage - 1) * popupPageSize,
      popupSafePage * popupPageSize,
    );

  useEffect(() => {
    setPopupPage(1);
  }, [popupSearch]);

  const [selectedTrigger, setSelectedTrigger] =
    useState("");

  const [selectedReward, setSelectedReward] =
    useState("");

  const [
    selectedDiscountId,
    setSelectedDiscountId,
  ] = useState("");

  const [discountSearch, setDiscountSearch] =
    useState("");

  const searchedDiscounts =
    discountSearch.trim()
      ? discounts.filter((discount) => {
          const query = discountSearch
            .trim()
            .toLowerCase();

          return (
            discount.title
              .toLowerCase()
              .includes(query) ||
            (discount.code || "")
              .toLowerCase()
              .includes(query)
          );
        })
      : discounts;

  /* =========================================================
     OPEN CHOOSER
  ========================================================= */

  const openChooser = () => {
    setShowChooser(true);
    setSelectedType(null);
  };

  /* =========================================================
     CLOSE CHOOSER
  ========================================================= */

  const closeChooser = () => {
    setShowChooser(false);
    setSelectedType(null);
  };

  /* =========================================================
     RESET WIZARD FIELDS
  ========================================================= */

  const resetWizardFields = () => {
    setEditingCampaignId(null);
    setCampaignName("");
    setCampaignDescription("");
    setSelectedAudience("");
    setSelectedPopup("");
    setSelectedTrigger("");
    setSelectedReward("");
    setSelectedDiscountId("");
    setDiscountSearch("");
    setTriggerDelaySeconds(5);
    setTriggerScrollPercent(50);
    setPageTargetMode("all");
    setPageTargets([]);
    setSiteTargetMode("all");
    setSiteTargets([]);
    setFrequencyMode("unlimited");
    setFrequencyLimit(3);
    setReshowCollectedDays(0);
    setReshowDismissedDays(1);
    setDevices(ALL_DEVICES);
    setPopupSearch("");
    setPopupPage(1);
    setErrors({});
  };

  /* =========================================================
     BUILD CAMPAIGN
  ========================================================= */

  const handleBuild = (type: CampaignType) => {
    resetWizardFields();

    setSelectedType(type);

    setShowChooser(false);

    setWizardStep(1);

    setShowWizard(true);
  };

  /* =========================================================
     EDIT EXISTING CAMPAIGN
  ========================================================= */

  const handleEditCampaign = (
    campaign: (typeof campaigns)[number],
  ) => {
    setEditingCampaignId(campaign.id);
    setSelectedType(
      (campaign.type as CampaignType) ||
        "targeted",
    );
    setCampaignName(campaign.name);
    setCampaignDescription(
      campaign.description,
    );
    setSelectedAudience(campaign.audience);
    setSelectedPopup(campaign.popupId || "");
    setSelectedTrigger(campaign.trigger);
    setSelectedReward(campaign.reward);
    setSelectedDiscountId(
      campaign.rewardDiscountId || "",
    );
    setDiscountSearch("");
    setTriggerDelaySeconds(
      campaign.triggerDelaySeconds,
    );
    setTriggerScrollPercent(
      campaign.triggerScrollPercent,
    );
    setPageTargetMode(
      campaign.pageTargetMode === "specific"
        ? "specific"
        : "all",
    );
    /* route: targets came from the old fixed list of page
       types, which no longer has a UI. Dropping them on open
       keeps the screen honest: every selection that counts is
       one the merchant can actually see and untick. */

    setPageTargets(
      Array.isArray(campaign.pageTargets)
        ? (campaign.pageTargets as string[]).filter(
            (target) =>
              !target.startsWith("route:"),
          )
        : [],
    );
    setSiteTargetMode(
      campaign.siteTargetMode === "selected"
        ? "selected"
        : "all",
    );
    setSiteTargets(
      Array.isArray(campaign.siteTargets)
        ? (campaign.siteTargets as string[])
        : [],
    );
    setFrequencyMode(
      campaign.frequencyMode === "once" ||
        campaign.frequencyMode === "limited"
        ? campaign.frequencyMode
        : "unlimited",
    );
    setFrequencyLimit(
      campaign.frequencyLimit || 3,
    );
    setReshowCollectedDays(
      campaign.reshowCollectedDays ?? 0,
    );
    setReshowDismissedDays(
      campaign.reshowDismissedDays ?? 1,
    );
    setDevices(
      Array.isArray(campaign.devices) &&
        (campaign.devices as string[]).length >
          0
        ? (campaign.devices as string[])
        : ALL_DEVICES,
    );
    setPopupSearch("");
    setPopupPage(1);
    setErrors({});

    setShowChooser(false);
    setWizardStep(1);
    setShowWizard(true);
  };

  /* =========================================================
     DELETE CAMPAIGN
  ========================================================= */

  const handleDeleteCampaign = (
    id: string,
    name: string,
  ) => {
    setCampaignPendingDelete({ id, name });
  };

  const cancelDeleteCampaign = () => {
    setCampaignPendingDelete(null);
  };

  const confirmDeleteCampaign = () => {
    if (!campaignPendingDelete) {
      return;
    }

    const formData = new FormData();
    formData.append(
      "intent",
      "deleteCampaign",
    );
    formData.append(
      "campaignId",
      campaignPendingDelete.id,
    );

    submit(formData, { method: "post" });

    setCampaignPendingDelete(null);
  };

  /* =========================================================
     TOGGLE CAMPAIGN STATUS
  ========================================================= */

  const handleToggleCampaignStatus = (
    campaign: (typeof campaigns)[number],
  ) => {
    const formData = new FormData();

    formData.append(
      "intent",
      "toggleCampaignStatus",
    );
    formData.append(
      "campaignId",
      campaign.id,
    );
    formData.append(
      "status",
      campaign.status.toLowerCase() === "active"
        ? "draft"
        : "active",
    );

    submit(formData, { method: "post" });
  };

  /* =========================================================
     SUBMIT CAMPAIGN
  ========================================================= */

  const submitCampaign = (
    mode: "saveCampaign" | "publishCampaign",
  ) => {
    const formData = new FormData();

    formData.append("intent", mode);

    if (editingCampaignId) {
      formData.append(
        "campaignId",
        editingCampaignId,
      );
    }

    formData.append("name", campaignName);
    formData.append(
      "description",
      campaignDescription,
    );
    formData.append(
      "type",
      selectedType || "targeted",
    );
    formData.append(
      "audience",
      selectedAudience,
    );
    formData.append("popupId", selectedPopup);
    formData.append(
      "trigger",
      selectedTrigger,
    );
    formData.append("reward", selectedReward);

    const chosenDiscount = discounts.find(
      (discount) =>
        discount.id === selectedDiscountId,
    );

    formData.append(
      "rewardDiscountId",
      chosenDiscount?.id || "",
    );

    formData.append(
      "rewardDiscountCode",
      chosenDiscount?.code || "",
    );
    formData.append(
      "triggerDelaySeconds",
      String(triggerDelaySeconds),
    );
    formData.append(
      "triggerScrollPercent",
      String(triggerScrollPercent),
    );
    formData.append(
      "pageTargetMode",
      pageTargetMode,
    );
    formData.append(
      "pageTargets",
      JSON.stringify(
        pageTargetMode === "specific"
          ? pageTargets
          : [],
      ),
    );
    formData.append(
      "siteTargetMode",
      siteTargetMode,
    );
    formData.append(
      "siteTargets",
      JSON.stringify(
        siteTargetMode === "selected"
          ? siteTargets
          : [],
      ),
    );
    formData.append(
      "frequencyMode",
      frequencyMode,
    );
    formData.append(
      "frequencyLimit",
      String(frequencyLimit),
    );
    formData.append(
      "reshowCollectedDays",
      String(reshowCollectedDays),
    );
    formData.append(
      "reshowDismissedDays",
      String(reshowDismissedDays),
    );
    formData.append(
      "devices",
      JSON.stringify(devices),
    );

    submit(formData, { method: "post" });
  };

  /* =========================================================
     CLOSE WIZARD
  ========================================================= */

  const closeWizard = () => {
    setShowWizard(false);
    setWizardStep(1);
    resetWizardFields();
  };

  /* =========================================================
     CLOSE WIZARD AFTER A SUCCESSFUL SAVE
  ========================================================= */

  useEffect(() => {
    if (!actionData?.ok) {
      return;
    }

    if (
      actionData.intent === "saveCampaign"
    ) {
      setShowWizard(false);
      setWizardStep(1);
      resetWizardFields();
    }

    revalidator.revalidate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actionData]);

  /* =========================================================
     ERROR BANNER
  ========================================================= */

  const renderError = (field: string) => {
    if (!errors[field]) {
      return null;
    }

    return (
      <div
        style={{
          marginTop: "18px",
          padding: "12px 14px",
          border: "1px solid #F3C7C4",
          background: "#FFF5F4",
          borderRadius: "8px",
          color: "#C62828",
          fontSize: "13px",
          fontWeight: 600,
        }}
      >
        {errors[field]}
      </div>
    );
  };

  /* =========================================================
     VALIDATE STEP
  ========================================================= */

  const validateStep = (
    step: number,
  ): Record<string, string> => {
    const stepErrors: Record<string, string> = {};

    if (step === 1) {
      const name = campaignName.trim();

      if (!name) {
        stepErrors.campaignName =
          "Campaign name is required.";
      } else if (name.length < 3) {
        stepErrors.campaignName =
          "Campaign name must be at least 3 characters.";
      } else if (name.length > 60) {
        stepErrors.campaignName =
          "Campaign name must be 60 characters or less.";
      }

      const description =
        campaignDescription.trim();

      if (!description) {
        stepErrors.campaignDescription =
          "Campaign description is required.";
      } else if (description.length < 10) {
        stepErrors.campaignDescription =
          "Please describe the campaign in at least 10 characters.";
      } else if (description.length > 500) {
        stepErrors.campaignDescription =
          "Description must be 500 characters or less.";
      }
    }

    if (step === 2 && !selectedAudience) {
      stepErrors.selectedAudience =
        "Please choose an audience for this campaign.";
    }

    /* Popup lives in step 1 (Build) alongside the details. */
    if (step === 1 && !selectedPopup) {
      stepErrors.selectedPopup =
        "Please select a live popup for this campaign.";
    }

    /* Trigger lives in step 2 (Target) alongside the audience. */
    if (step === 2) {
      if (!selectedTrigger) {
        stepErrors.selectedTrigger =
          "Please choose when this popup should appear.";
      }

      if (
        selectedTrigger === "After delay" &&
        (triggerDelaySeconds < 1 ||
          triggerDelaySeconds > 120)
      ) {
        stepErrors.selectedTrigger =
          "Delay must be between 1 and 120 seconds.";
      }

      if (
        selectedTrigger === "Scroll depth" &&
        (triggerScrollPercent < 5 ||
          triggerScrollPercent > 100)
      ) {
        stepErrors.selectedTrigger =
          "Scroll depth must be between 5% and 100%.";
      }

      if (
        pageTargetMode === "specific" &&
        pageTargets.length === 0
      ) {
        stepErrors.pageTargets =
          "Select at least one page, or switch to all pages.";
      }

      if (devices.length === 0) {
        stepErrors.devices =
          "Choose at least one device, otherwise nobody can see this campaign.";
      }

      if (
        frequencyMode === "limited" &&
        (frequencyLimit < 1 ||
          frequencyLimit > 50)
      ) {
        stepErrors.frequencyLimit =
          "Enter a number between 1 and 50.";
      }
    }

    if (
      step === 3 &&
      siteTargetMode === "selected" &&
      siteTargets.length === 0
    ) {
      stepErrors.siteTargets =
        "Select at least one website, or switch to all websites.";
    }

    if (step === 4 && !selectedReward) {
      stepErrors.selectedReward =
        "Please choose a reward option.";
    }

    return stepErrors;
  };

  /* =========================================================
     NEXT STEP
  ========================================================= */

  const handleNext = () => {
    if (wizardStep < totalSteps) {
      const stepErrors =
        validateStep(wizardStep);

      if (
        Object.keys(stepErrors).length > 0
      ) {
        setErrors(stepErrors);
        return;
      }

      setErrors({});
      setWizardStep(wizardStep + 1);
      return;
    }

    /* FINAL STEP — VALIDATE EVERYTHING

       Bounded by totalSteps rather than a literal so adding a
       step to the wizard cannot silently skip its validation. */

    for (
      let step = 1;
      step < totalSteps;
      step += 1
    ) {
      const stepErrors = validateStep(step);

      if (
        Object.keys(stepErrors).length > 0
      ) {
        setErrors(stepErrors);
        setWizardStep(step);
        return;
      }
    }

    setErrors({});

    submitCampaign("publishCampaign");
  };

  /* =========================================================
     SAVE AS DRAFT
  ========================================================= */

  const handleSaveDraft = () => {
    const step1Errors = validateStep(1);

    if (Object.keys(step1Errors).length > 0) {
      setErrors(step1Errors);
      setWizardStep(1);
      return;
    }

    setErrors({});

    submitCampaign("saveCampaign");
  };

  /* =========================================================
     JUMP TO A STEP FROM THE STEPPER
     Going back is free; going forward runs the same
     validation the Next button does.
  ========================================================= */

  const handleStepClick = (
    targetStep: number,
  ) => {
    if (targetStep === wizardStep) {
      return;
    }

    if (targetStep < wizardStep) {
      setErrors({});
      setWizardStep(targetStep);
      return;
    }

    for (
      let step = 1;
      step < targetStep;
      step += 1
    ) {
      const stepErrors = validateStep(step);

      if (
        Object.keys(stepErrors).length > 0
      ) {
        setErrors(stepErrors);
        setWizardStep(step);
        return;
      }
    }

    setErrors({});
    setWizardStep(targetStep);
  };

  /* =========================================================
     PREVIOUS STEP
  ========================================================= */

  const handleBack = () => {
    if (wizardStep === 1) {
      setShowWizard(false);
      setShowChooser(true);
    } else {
      setWizardStep(wizardStep - 1);
    }
  };

  /* =========================================================
     CAMPAIGN TYPE NAME
  ========================================================= */

  const campaignTypeName =
    selectedType === "targeted"
      ? "Targeted popup campaign"
      : selectedType === "broadcast"
      ? "Broadcast"
      : selectedType === "full"
      ? "Full campaign"
      : "Campaign";

  return (
    <s-page heading="Campaigns" inlineSize="large">

      {/* =====================================================
          CAMPAIGNS HEADER
      ===================================================== */}

      <div style={{ marginBottom: "16px" }}>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "20px",
            padding: "4px 0 18px",
            flexWrap: "wrap",
          }}
        >

          <div>

            <h1
              style={{
                margin: 0,
                fontSize: "28px",
                fontWeight: 700,
                color: "#172033",
              }}
            >
              Campaigns
            </h1>

            <p
              style={{
                margin: "7px 0 0",
                fontSize: "14px",
                color: "#6B7280",
              }}
            >
              Create and manage your campaigns.
            </p>

          </div>

          <div
            style={{
              display: "flex",
              gap: "10px",
              alignItems: "center",
            }}
          >

            <button
              type="button"
              onClick={openChooser}
              style={{
                border: "1px solid #CFC5F4",
                background: "#FAF8FF",
                color: "#6546D7",
                borderRadius: "8px",
                padding: "10px 17px",
                fontSize: "13px",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              ✦ Draft a campaign
            </button>

            <button
              type="button"
              onClick={openChooser}
              style={{
                border: "none",
                background: "#0B3D66",
                color: "#FFFFFF",
                borderRadius: "8px",
                padding: "11px 20px",
                fontSize: "13px",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Create campaign
            </button>

          </div>

        </div>

      </div>


      {/* =====================================================
          YOUR CAMPAIGNS
      ===================================================== */}

      <div style={{ marginBottom: "16px" }}>

        <div
          style={{
            background: "#FFFFFF",
            border: "1px solid #D8DEE6",
            borderRadius: "12px",
            boxShadow:
              "0 1px 2px rgba(23, 32, 51, 0.04)",
            overflow: "hidden",
          }}
        >

          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "12px",
              padding: "16px 18px",
              borderBottom:
                "1px solid #E7EBEF",
            }}
          >
            <h2
              style={{
                margin: 0,
                fontSize: "16px",
                color: "#172033",
              }}
            >
              Your campaigns
            </h2>

            <span
              style={{
                fontSize: "12px",
                color: "#8A95A5",
              }}
            >
              {campaigns.length} total
            </span>
          </div>

          {campaigns.length === 0 ? (

            <div
              style={{
                padding: "40px 20px",
                textAlign: "center",
                color: "#6B7280",
                fontSize: "13px",
              }}
            >
              No campaigns yet. Click
              "Create campaign" to build your
              first one.
            </div>

          ) : (

            <>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns:
                    "minmax(220px, 1.6fr) 110px 130px 120px 150px",
                  gap: "12px",
                  alignItems: "center",
                  padding: "11px 18px",
                  background: "#F8F9FA",
                  borderBottom:
                    "1px solid #E7EBEF",
                  color: "#8A95A5",
                  fontSize: "10px",
                  fontWeight: 700,
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                }}
              >
                <div>Campaign</div>
                <div>Status</div>
                <div>Trigger</div>
                <div>Pages</div>
                <div>Actions</div>
              </div>

              {campaigns.map((campaign) => {

                const linkedPopup =
                  popups.find(
                    (popup) =>
                      popup.id ===
                      campaign.popupId,
                  );

                const isActive =
                  campaign.status.toLowerCase() ===
                  "active";

                const targetCount =
                  Array.isArray(
                    campaign.pageTargets,
                  )
                    ? (
                        campaign.pageTargets as unknown[]
                      ).length
                    : 0;

                return (
                  <div
                    key={campaign.id}
                    style={{
                      display: "grid",
                      gridTemplateColumns:
                        "minmax(220px, 1.6fr) 110px 130px 120px 150px",
                      gap: "12px",
                      alignItems: "center",
                      padding: "14px 18px",
                      borderBottom:
                        "1px solid #EEF1F4",
                    }}
                  >

                    <div>
                      <strong
                        style={{
                          display: "block",
                          fontSize: "13px",
                          color: "#172033",
                        }}
                      >
                        {campaign.name}
                      </strong>

                      <span
                        style={{
                          fontSize: "11px",
                          color: "#8A95A5",
                        }}
                      >
                        {campaign.audience ||
                          "No audience"}
                        {linkedPopup
                          ? ` · ${linkedPopup.name}`
                          : ""}
                        {campaign.rewardDiscountCode
                          ? ` · ${campaign.rewardDiscountCode}`
                          : campaign.reward &&
                              campaign.reward !==
                                "No reward"
                            ? ` · ${campaign.reward}`
                            : ""}
                      </span>
                    </div>

                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                      }}
                    >
                      <button
                        type="button"
                        role="switch"
                        aria-checked={isActive}
                        onClick={() =>
                          handleToggleCampaignStatus(
                            campaign,
                          )
                        }
                        style={{
                          position: "relative",
                          width: "30px",
                          height: "17px",
                          borderRadius: "999px",
                          border: "none",
                          background: isActive
                            ? "#1FAF6E"
                            : "#D8DEE7",
                          cursor: "pointer",
                          flexShrink: 0,
                        }}
                      >
                        <span
                          style={{
                            position:
                              "absolute",
                            top: "2px",
                            left: isActive
                              ? "15px"
                              : "2px",
                            width: "13px",
                            height: "13px",
                            borderRadius: "50%",
                            background:
                              "#FFFFFF",
                            transition:
                              "left 0.15s ease",
                          }}
                        />
                      </button>

                      <span
                        style={{
                          fontSize: "9px",
                          fontWeight: 700,
                          color: isActive
                            ? "#157A50"
                            : "#657080",
                        }}
                      >
                        {isActive
                          ? "LIVE"
                          : "DRAFT"}
                      </span>
                    </div>

                    <div
                      style={{
                        fontSize: "12px",
                        color: "#374151",
                      }}
                    >
                      {campaign.trigger ===
                      "After delay"
                        ? `After ${campaign.triggerDelaySeconds}s`
                        : campaign.trigger ===
                            "Scroll depth"
                          ? `Scroll ${campaign.triggerScrollPercent}%`
                          : campaign.trigger ||
                            "—"}
                    </div>

                    <div
                      style={{
                        fontSize: "12px",
                        color: "#374151",
                      }}
                    >
                      {campaign.pageTargetMode ===
                      "specific"
                        ? `${targetCount} page${
                            targetCount === 1
                              ? ""
                              : "s"
                          }`
                        : "All pages"}
                    </div>

                    <div
                      style={{
                        display: "flex",
                        gap: "7px",
                      }}
                    >
                      <button
                        type="button"
                        onClick={() =>
                          handleEditCampaign(
                            campaign,
                          )
                        }
                        style={{
                          border:
                            "1px solid #D5DCE5",
                          background: "#FFFFFF",
                          color: "#0B3D66",
                          borderRadius: "7px",
                          padding: "7px 11px",
                          fontSize: "11px",
                          fontWeight: 700,
                          cursor: "pointer",
                        }}
                      >
                        Edit
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          handleDeleteCampaign(
                            campaign.id,
                            campaign.name,
                          )
                        }
                        style={{
                          border:
                            "1px solid #F0B9B9",
                          background: "#FFF5F5",
                          color: "#C62828",
                          borderRadius: "7px",
                          padding: "7px 11px",
                          fontSize: "11px",
                          fontWeight: 700,
                          cursor: "pointer",
                        }}
                      >
                        Delete
                      </button>
                    </div>

                  </div>
                );
              })}
            </>

          )}

        </div>

      </div>


      {/* =====================================================
          CAMPAIGN LIBRARY
      ===================================================== */}

      <div style={{ marginBottom: "16px" }}>

        <div
          style={{
            background: "#F6F6F7",
            border: "1px solid #D8DEE6",
            borderRadius: "12px",
            padding: "22px",
          }}
        >

          <h2
            style={{
              margin: "0 0 16px",
              fontSize: "17px",
              color: "#172033",
            }}
          >
            Campaign library
          </h2>

          <div
            style={{
              display: "grid",
              gridTemplateColumns:
                "repeat(4, minmax(0, 1fr))",
              gap: "12px",
            }}
          >

            {/* TARGETED */}

            <div
              style={{
                background: "#FFFFFF",
                border: "1px solid #E1E6EC",
                borderRadius: "11px",
                padding: "18px",
                minHeight: "145px",
              }}
            >

              <div
                style={{
                  display: "inline-block",
                  padding: "4px 7px",
                  borderRadius: "5px",
                  background: "#F0EAFE",
                  color: "#6546D7",
                  fontSize: "10px",
                  fontWeight: 700,
                  marginBottom: "10px",
                }}
              >
                POPUP
              </div>

              <h3
                style={{
                  margin: "0 0 7px",
                  fontSize: "15px",
                  color: "#172033",
                }}
              >
                Targeted popup
              </h3>

              <p
                style={{
                  margin: 0,
                  fontSize: "12px",
                  lineHeight: 1.5,
                  color: "#6B7280",
                }}
              >
                Show a popup to a chosen audience.
              </p>

            </div>


            {/* BROADCAST */}

            <div
              style={{
                background: "#FFFFFF",
                border: "1px solid #E1E6EC",
                borderRadius: "11px",
                padding: "18px",
                minHeight: "145px",
              }}
            >

              <div
                style={{
                  display: "inline-block",
                  padding: "4px 7px",
                  borderRadius: "5px",
                  background: "#E8F8F6",
                  color: "#168A86",
                  fontSize: "10px",
                  fontWeight: 700,
                  marginBottom: "10px",
                }}
              >
                BROADCAST
              </div>

              <h3
                style={{
                  margin: "0 0 7px",
                  fontSize: "15px",
                  color: "#172033",
                }}
              >
                Broadcast
              </h3>

              <p
                style={{
                  margin: 0,
                  fontSize: "12px",
                  lineHeight: 1.5,
                  color: "#6B7280",
                }}
              >
                One-off send to existing subscribers.
              </p>

            </div>


            {/* FULL CAMPAIGN */}

            <div
              style={{
                background: "#FFFFFF",
                border: "1px solid #E1E6EC",
                borderRadius: "11px",
                padding: "18px",
                minHeight: "145px",
              }}
            >

              <div
                style={{
                  display: "inline-block",
                  padding: "4px 7px",
                  borderRadius: "5px",
                  background: "#EEF3F8",
                  color: "#0B3D66",
                  fontSize: "10px",
                  fontWeight: 700,
                  marginBottom: "10px",
                }}
              >
                CAMPAIGN
              </div>

              <h3
                style={{
                  margin: "0 0 7px",
                  fontSize: "15px",
                  color: "#172033",
                }}
              >
                Full campaign
              </h3>

              <p
                style={{
                  margin: 0,
                  fontSize: "12px",
                  lineHeight: 1.5,
                  color: "#6B7280",
                }}
              >
                Popup + broadcast + Smart Tests.
              </p>

            </div>


            {/* SMART TESTS */}

            <div
              style={{
                background: "#FFFFFF",
                border: "1px solid #E1E6EC",
                borderRadius: "11px",
                padding: "18px",
                minHeight: "145px",
              }}
            >

              <div
                style={{
                  display: "inline-block",
                  padding: "4px 7px",
                  borderRadius: "5px",
                  background: "#F0EAFE",
                  color: "#6546D7",
                  fontSize: "10px",
                  fontWeight: 700,
                  marginBottom: "10px",
                }}
              >
                ✦ TESTS
              </div>

              <h3
                style={{
                  margin: "0 0 7px",
                  fontSize: "15px",
                  color: "#172033",
                }}
              >
                Smart Tests
              </h3>

              <p
                style={{
                  margin: 0,
                  fontSize: "12px",
                  lineHeight: 1.5,
                  color: "#6B7280",
                }}
              >
                Test campaigns against a holdout.
              </p>

            </div>

          </div>

        </div>

      </div>


      {/* =====================================================
          LIVE CAMPAIGNS
      ===================================================== */}

      <div style={{ marginBottom: "16px" }}>

        <div
          style={{
            background: "#FFFFFF",
            border: "1px solid #D8DEE6",
            borderRadius: "12px",
            padding: "20px",
          }}
        >

          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "16px",
            }}
          >

            <h2
              style={{
                margin: 0,
                fontSize: "16px",
                color: "#172033",
              }}
            >
              Live campaigns
            </h2>

            <span
              style={{
                fontSize: "12px",
                color: "#6B7280",
              }}
            >
              View all
            </span>

          </div>

          <div
            style={{
              border: "1px solid #E7EBEF",
              borderRadius: "9px",
              padding: "16px",
            }}
          >

            <div
              style={{
                display: "grid",
                gridTemplateColumns:
                  "1.6fr 1fr 1fr 1fr",
                gap: "12px",
                alignItems: "center",
              }}
            >

              <div>

                <strong
                  style={{
                    fontSize: "13px",
                    color: "#172033",
                  }}
                >
                  Diwali — New Visitors
                </strong>

                <p
                  style={{
                    margin: "4px 0 0",
                    fontSize: "11px",
                    color: "#9CA3AF",
                  }}
                >
                  Targeted popup
                </p>

              </div>

              <div>

                <span
                  style={{
                    display: "inline-block",
                    padding: "4px 8px",
                    borderRadius: "5px",
                    background: "#E7F7EF",
                    color: "#157A50",
                    fontSize: "10px",
                    fontWeight: 700,
                  }}
                >
                  LIVE
                </span>

              </div>

              <div
                style={{
                  fontSize: "12px",
                  color: "#374151",
                }}
              >
                ₹1,42,800
              </div>

              <div
                style={{
                  fontSize: "12px",
                  color: "#6546D7",
                }}
              >
                +11.2% lift
              </div>

            </div>

          </div>

        </div>

      </div>


      {/* =====================================================
          GO LIVE CHECKLIST
      ===================================================== */}

      <div style={{ marginBottom: "16px" }}>

        <div
          style={{
            background: "#FFFFFF",
            border: "1px solid #D8DEE6",
            borderRadius: "12px",
            padding: "20px",
          }}
        >

          <h2
            style={{
              margin: "0 0 15px",
              fontSize: "16px",
              color: "#172033",
            }}
          >
            Go-live checklist
          </h2>

          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "11px",
            }}
          >

            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "10px",
                fontSize: "13px",
                color: "#374151",
              }}
            >
              <span style={{ color: "#157A50" }}>✓</span>
              Store connection
            </div>

            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "10px",
                fontSize: "13px",
                color: "#374151",
              }}
            >
              <span style={{ color: "#157A50" }}>✓</span>
              Popup installed
            </div>

            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "10px",
                fontSize: "13px",
                color: "#374151",
              }}
            >
              <span style={{ color: "#157A50" }}>✓</span>
              Targeting rules configured
            </div>

          </div>

        </div>

      </div>


      {/* =====================================================
          FOOTER
      ===================================================== */}

      <div style={{ marginBottom: "16px" }}>

        <p
          style={{
            margin: "0 0 20px",
            color: "#9CA3AF",
            fontSize: "12px",
          }}
        >
          Campaigns bring audience, popups, broadcasts and
          tests together and report into the same campaign
          analytics.
        </p>

      </div>


      {/* =====================================================
          CREATE CAMPAIGN CHOOSER
      ===================================================== */}

      {showChooser && (

        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 9999,
            background: "rgba(20, 28, 40, 0.48)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "20px",
          }}
        >

          <div
            style={{
              width: "100%",
              maxHeight: "90vh",
              overflowY: "auto",
              background: "#FFFFFF",
              borderRadius: "17px",
              boxShadow:
                "0 25px 70px rgba(0, 0, 0, 0.22)",
            }}
          >

            {/* HEADER */}

            <div
              style={{
                padding: "25px 30px 22px",
                borderBottom: "1px solid #E7EBEF",
                display: "flex",
                alignItems: "flex-start",
                justifyContent: "space-between",
                gap: "20px",
              }}
            >

              <div>

                <h2
                  style={{
                    margin: 0,
                    fontSize: "24px",
                    fontWeight: 700,
                    color: "#172033",
                  }}
                >
                  What are you creating?
                </h2>

                <p
                  style={{
                    margin: "6px 0 0",
                    fontSize: "14px",
                    color: "#6B7280",
                  }}
                >
                  Pick a type — MQ Brain can draft any of
                  them for you.
                </p>

              </div>

              <button
                type="button"
                onClick={closeChooser}
                style={{
                  border: "none",
                  background: "transparent",
                  color: "#94A0AF",
                  fontSize: "27px",
                  lineHeight: 1,
                  cursor: "pointer",
                  padding: "0 3px",
                }}
              >
                ×
              </button>

            </div>


            {/* MODAL CONTENT */}

            <div
              style={{
                padding: "26px 30px 30px",
              }}
            >

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns:
                    "repeat(3, minmax(0, 1fr))",
                  gap: "18px",
                }}
              >

                {/* =================================================
                    TARGETED
                ================================================= */}

                <div
                  style={{
                    border:
                      selectedType === "targeted"
                        ? "2px solid #0B3D66"
                        : "1px solid #DDE3EA",
                    borderRadius: "14px",
                    padding: "20px",
                    display: "flex",
                    flexDirection: "column",
                    minHeight: "390px",
                    background: "#FFFFFF",
                  }}
                >

                  <div
                    style={{
                      width: "46px",
                      height: "46px",
                      borderRadius: "11px",
                      background: "#EAF2FA",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: "#0B3D66",
                      fontSize: "22px",
                      marginBottom: "18px",
                    }}
                  >
                    ▣
                  </div>

                  <h3
                    style={{
                      margin: "0 0 8px",
                      fontSize: "17px",
                      color: "#172033",
                    }}
                  >
                    Targeted popup campaign
                  </h3>

                  <p
                    style={{
                      margin: 0,
                      color: "#687386",
                      fontSize: "13px",
                      lineHeight: 1.55,
                    }}
                  >
                    A popup shown to a chosen audience —
                    capture, quiz, wheel or announcement.
                    The bread and butter.
                  </p>

                  <div
                    style={{
                      display: "flex",
                      flexWrap: "wrap",
                      gap: "6px",
                      marginTop: "18px",
                    }}
                  >

                    <span
                      style={{
                        background: "#F0F2F5",
                        borderRadius: "5px",
                        padding: "4px 7px",
                        fontSize: "10px",
                        color: "#657080",
                        fontWeight: 700,
                      }}
                    >
                      POPUP
                    </span>

                    <span
                      style={{
                        background: "#F0F2F5",
                        borderRadius: "5px",
                        padding: "4px 7px",
                        fontSize: "10px",
                        color: "#657080",
                        fontWeight: 700,
                      }}
                    >
                      AUDIENCE
                    </span>

                    <span
                      style={{
                        background: "#F0F2F5",
                        borderRadius: "5px",
                        padding: "4px 7px",
                        fontSize: "10px",
                        color: "#657080",
                        fontWeight: 700,
                      }}
                    >
                      REWARD
                    </span>

                  </div>

                  <div
                    style={{
                      marginTop: "auto",
                      paddingTop: "22px",
                    }}
                  >

                    <p
                      style={{
                        margin: "0 0 10px",
                        color: "#9AA4B2",
                        fontSize: "12px",
                      }}
                    >
                      ~5 min via guided setup
                    </p>

                    <button
                      type="button"
                      onClick={() =>
                        handleBuild("targeted")
                      }
                      style={{
                        width: "100%",
                        height: "40px",
                        border:
                          "1px solid #C9D5E2",
                        borderRadius: "8px",
                        background: "#FFFFFF",
                        color: "#0B3D66",
                        fontSize: "13px",
                        fontWeight: 600,
                        cursor: "pointer",
                        marginBottom: "9px",
                      }}
                    >
                      Build it myself
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        handleBuild("targeted")
                      }
                      style={{
                        width: "100%",
                        height: "40px",
                        border: "none",
                        borderRadius: "8px",
                        background: "#7651D8",
                        color: "#FFFFFF",
                        fontSize: "13px",
                        fontWeight: 600,
                        cursor: "pointer",
                      }}
                    >
                      ✦ Draft with AI
                    </button>

                  </div>

                </div>


                {/* =================================================
                    BROADCAST
                ================================================= */}

                <div
                  style={{
                    position: "relative",
                    border: "1px solid #DDE3EA",
                    borderRadius: "14px",
                    padding: "20px",
                    display: "flex",
                    flexDirection: "column",
                    minHeight: "390px",
                    background: "#FBFBFC",
                    opacity: 0.65,
                  }}
                >

                  <div
                    style={{
                      position: "absolute",
                      top: "-11px",
                      left: "20px",
                      background: "#8A94A6",
                      color: "#FFFFFF",
                      borderRadius: "5px",
                      padding: "4px 9px",
                      fontSize: "10px",
                      fontWeight: 700,
                      letterSpacing: "0.03em",
                    }}
                  >
                    COMING SOON
                  </div>

                  <div
                    style={{
                      width: "46px",
                      height: "46px",
                      borderRadius: "11px",
                      background: "#E3F7F5",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: "#159B96",
                      fontSize: "22px",
                      marginBottom: "18px",
                    }}
                  >
                    ➤
                  </div>

                  <h3
                    style={{
                      margin: "0 0 8px",
                      fontSize: "17px",
                      color: "#172033",
                    }}
                  >
                    Broadcast
                  </h3>

                  <p
                    style={{
                      margin: 0,
                      color: "#687386",
                      fontSize: "13px",
                      lineHeight: 1.55,
                    }}
                  >
                    A one-off send to subscribers you
                    already have — sale announcement,
                    restock, launch — over email, WhatsApp
                    or SMS.
                  </p>

                  <div
                    style={{
                      display: "flex",
                      flexWrap: "wrap",
                      gap: "6px",
                      marginTop: "18px",
                    }}
                  >

                    <span
                      style={{
                        background: "#EAF5FF",
                        color: "#3978B5",
                        borderRadius: "5px",
                        padding: "4px 7px",
                        fontSize: "10px",
                        fontWeight: 700,
                      }}
                    >
                      @
                    </span>

                    <span
                      style={{
                        background: "#E8F8EF",
                        color: "#32935E",
                        borderRadius: "5px",
                        padding: "4px 7px",
                        fontSize: "10px",
                        fontWeight: 700,
                      }}
                    >
                      W
                    </span>

                    <span
                      style={{
                        background: "#E6F7F7",
                        color: "#159B96",
                        borderRadius: "5px",
                        padding: "4px 7px",
                        fontSize: "10px",
                        fontWeight: 700,
                      }}
                    >
                      S
                    </span>

                    <span
                      style={{
                        background: "#F0F2F5",
                        color: "#657080",
                        borderRadius: "5px",
                        padding: "4px 7px",
                        fontSize: "10px",
                        fontWeight: 700,
                      }}
                    >
                      COST PREVIEW
                    </span>

                  </div>

                  <div
                    style={{
                      marginTop: "auto",
                      paddingTop: "22px",
                    }}
                  >

                    <p
                      style={{
                        margin: "0 0 10px",
                        color: "#9AA4B2",
                        fontSize: "12px",
                      }}
                    >
                      Coming soon
                    </p>

                    <button
                      type="button"
                      disabled
                      style={{
                        width: "100%",
                        height: "40px",
                        border:
                          "1px solid #E2E6EC",
                        borderRadius: "8px",
                        background: "#F4F5F7",
                        color: "#AEB6C2",
                        fontSize: "13px",
                        fontWeight: 600,
                        cursor: "not-allowed",
                        marginBottom: "9px",
                      }}
                    >
                      Build it myself
                    </button>

                    <button
                      type="button"
                      disabled
                      style={{
                        width: "100%",
                        height: "40px",
                        border: "none",
                        borderRadius: "8px",
                        background: "#E2E6EC",
                        color: "#AEB6C2",
                        fontSize: "13px",
                        fontWeight: 600,
                        cursor: "not-allowed",
                      }}
                    >
                      ✦ Draft with AI
                    </button>

                  </div>

                </div>


                {/* =================================================
                    FULL CAMPAIGN
                ================================================= */}

                <div
                  style={{
                    position: "relative",
                    border: "1px solid #DDE3EA",
                    borderRadius: "14px",
                    padding: "20px",
                    display: "flex",
                    flexDirection: "column",
                    minHeight: "390px",
                    background: "#FBFBFC",
                    opacity: 0.65,
                  }}
                >

                  <div
                    style={{
                      position: "absolute",
                      top: "-11px",
                      left: "20px",
                      background: "#8A94A6",
                      color: "#FFFFFF",
                      borderRadius: "5px",
                      padding: "4px 9px",
                      fontSize: "10px",
                      fontWeight: 700,
                      letterSpacing: "0.03em",
                    }}
                  >
                    COMING SOON
                  </div>

                  <div
                    style={{
                      width: "46px",
                      height: "46px",
                      borderRadius: "11px",
                      background: "#0B3D66",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: "#FFFFFF",
                      fontSize: "22px",
                      marginBottom: "18px",
                    }}
                  >
                    ◇
                  </div>

                  <h3
                    style={{
                      margin: "0 0 8px",
                      fontSize: "17px",
                      color: "#172033",
                    }}
                  >
                    Full campaign
                  </h3>

                  <p
                    style={{
                      margin: 0,
                      color: "#687386",
                      fontSize: "13px",
                      lineHeight: 1.55,
                    }}
                  >
                    Popup + broadcast + Smart Tests around
                    one moment — a launch, a festival, BFCM.
                    Everything coordinated, measured against
                    one goal.
                  </p>

                  <div
                    style={{
                      display: "flex",
                      flexWrap: "wrap",
                      gap: "6px",
                      marginTop: "18px",
                    }}
                  >

                    <span
                      style={{
                        background: "#F0F2F5",
                        borderRadius: "5px",
                        padding: "4px 7px",
                        fontSize: "10px",
                        color: "#657080",
                        fontWeight: 700,
                      }}
                    >
                      POPUP
                    </span>

                    <span
                      style={{
                        background: "#F0F2F5",
                        borderRadius: "5px",
                        padding: "4px 7px",
                        fontSize: "10px",
                        color: "#657080",
                        fontWeight: 700,
                      }}
                    >
                      BROADCAST
                    </span>

                    <span
                      style={{
                        background: "#F0EAFE",
                        borderRadius: "5px",
                        padding: "4px 7px",
                        fontSize: "10px",
                        color: "#6546D7",
                        fontWeight: 700,
                      }}
                    >
                      ✦ TESTS
                    </span>

                    <span
                      style={{
                        background: "#F0F2F5",
                        borderRadius: "5px",
                        padding: "4px 7px",
                        fontSize: "10px",
                        color: "#657080",
                        fontWeight: 700,
                      }}
                    >
                      AUDIENCE
                    </span>

                  </div>

                  <div
                    style={{
                      marginTop: "auto",
                      paddingTop: "22px",
                    }}
                  >

                    <p
                      style={{
                        margin: "0 0 10px",
                        color: "#9AA4B2",
                        fontSize: "12px",
                      }}
                    >
                      Coming soon
                    </p>

                    <button
                      type="button"
                      disabled
                      style={{
                        width: "100%",
                        height: "40px",
                        border:
                          "1px solid #E2E6EC",
                        borderRadius: "8px",
                        background: "#F4F5F7",
                        color: "#AEB6C2",
                        fontSize: "13px",
                        fontWeight: 600,
                        cursor: "not-allowed",
                        marginBottom: "9px",
                      }}
                    >
                      Build it myself
                    </button>

                    <button
                      type="button"
                      disabled
                      style={{
                        width: "100%",
                        height: "40px",
                        border: "none",
                        borderRadius: "8px",
                        background: "#E2E6EC",
                        color: "#AEB6C2",
                        fontSize: "13px",
                        fontWeight: 600,
                        cursor: "not-allowed",
                      }}
                    >
                      ✦ Draft with AI
                    </button>

                  </div>

                </div>

              </div>


              <p
                style={{
                  margin: "25px 0 0",
                  color: "#9AA4B2",
                  fontSize: "12px",
                  lineHeight: 1.5,
                }}
              >
                Every type gets an audience from your Targeting
                Rules and reports into the same campaign
                analytics. You can add pieces later — a broadcast
                can grow into a full campaign.
              </p>

            </div>

          </div>

        </div>

      )}


      {/* =====================================================
          CAMPAIGN WIZARD
      ===================================================== */}

      {showWizard && (

        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 10000,
            background: "#F6F6F7",
            overflowY: "auto",
            padding: "20px",
          }}
        >

          <div
            style={{
              width: "100%",
              margin: "0 auto",
              background: "#FFFFFF",
              border: "1px solid #D8DEE6",
              borderRadius: "16px",
              boxShadow:
                "0 20px 60px rgba(0,0,0,0.12)",
              overflow: "hidden",
            }}
          >

            {/* =================================================
                WIZARD HEADER
            ================================================= */}

            <div
              style={{
                padding: "20px 28px",
                borderBottom: "1px solid #E7EBEF",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >

              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "12px",
                }}
              >

                <div
                  style={{
                    width: "34px",
                    height: "34px",
                    borderRadius: "8px",
                    background: "#0B3D66",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "#FFFFFF",
                    fontWeight: 700,
                  }}
                >
                  MQ
                </div>

                <div>

                  <strong
                    style={{
                      display: "block",
                      color: "#172033",
                      fontSize: "15px",
                    }}
                  >
                    Campaign Setup
                  </strong>

                  <span
                    style={{
                      color: "#7B8796",
                      fontSize: "12px",
                    }}
                  >
                    {campaignTypeName}
                  </span>

                </div>

              </div>

              <button
                type="button"
                onClick={closeWizard}
                style={{
                  border: "none",
                  background: "transparent",
                  color: "#94A0AF",
                  fontSize: "26px",
                  cursor: "pointer",
                }}
              >
                ×
              </button>

            </div>


            {/* =================================================
                STEPPER
            ================================================= */}

            <div
              style={{
                padding: "20px 28px",
                borderBottom: "1px solid #E7EBEF",
              }}
            >

              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                }}
              >

                {[
                  "Build",
                  "Target",
                  "Websites",
                  "Reward",
                  "Review",
                ].map((name, index) => {

                  const stepNumber = index + 1;

                  const isActive =
                    wizardStep === stepNumber;

                  const isDone =
                    wizardStep > stepNumber;

                  const isLast =
                    stepNumber === totalSteps;

                  return (
                    <div
                      key={name}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        flex: isLast
                          ? "0 0 auto"
                          : 1,
                        minWidth: 0,
                      }}
                    >

                      <button
                        type="button"
                        onClick={() =>
                          handleStepClick(
                            stepNumber,
                          )
                        }
                        title={`Go to step ${stepNumber} — ${name}`}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "8px",
                          border: "none",
                          background:
                            "transparent",
                          padding: "4px 6px",
                          margin: "-4px -6px",
                          borderRadius: "8px",
                          cursor: "pointer",
                          flexShrink: 0,
                        }}
                      >

                        <div
                          style={{
                            width: "30px",
                            height: "30px",
                            borderRadius: "50%",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            background:
                              isActive || isDone
                                ? "#0B3D66"
                                : "#EEF1F4",
                            color:
                              isActive || isDone
                                ? "#FFFFFF"
                                : "#7B8796",
                            fontSize: "12px",
                            fontWeight: 700,
                            flexShrink: 0,
                            boxShadow: isActive
                              ? "0 0 0 4px rgba(11, 61, 102, 0.12)"
                              : "none",
                          }}
                        >
                          {isDone ? "✓" : stepNumber}
                        </div>

                        <span
                          style={{
                            fontSize: "11px",
                            fontWeight:
                              isActive ? 700 : 500,
                            color:
                              isActive
                                ? "#0B3D66"
                                : "#7B8796",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {name}
                        </span>

                      </button>

                      {!isLast && (
                        <div
                          style={{
                            flex: 1,
                            height: "2px",
                            margin: "0 8px",
                            borderRadius: "999px",
                            background:
                              wizardStep >
                              stepNumber
                                ? "#0B3D66"
                                : "#E5E9EE",
                          }}
                        />
                      )}

                    </div>
                  );
                })}

              </div>

            </div>


            {/* =================================================
                WIZARD CONTENT
            ================================================= */}

            <div
              style={{
                padding: "45px",
                minHeight: "430px",
              }}
            >

              {/* =================================================
                  STEP 1 — details
              ================================================= */}

              {wizardStep === 1 && (

                <div
                  style={{
                    maxWidth: "1040px",
                    margin: "0 auto",
                  }}
                >

                  <div
                    style={{
                      color: "#7651D8",
                      fontSize: "11px",
                      fontWeight: 700,
                      letterSpacing: "0.08em",
                    }}
                  >
                    STEP 1 · DETAILS
                  </div>

                  <h2
                    style={{
                      margin: "10px 0 8px",
                      fontSize: "28px",
                      color: "#172033",
                    }}
                  >
                    Name your campaign
                  </h2>

                  <p
                    style={{
                      margin: 0,
                      color: "#6B7280",
                      fontSize: "14px",
                      lineHeight: 1.6,
                    }}
                  >
                    Give your campaign a clear name and
                    describe what you want to achieve.
                  </p>

                  <div
                    style={{
                      marginTop: "30px",
                    }}
                  >

                    <label
                      style={{
                        display: "block",
                        marginBottom: "8px",
                        fontSize: "13px",
                        fontWeight: 600,
                        color: "#374151",
                      }}
                    >
                      Campaign name{" "}
                      <span
                        style={{
                          color: "#C62828",
                        }}
                      >
                        *
                      </span>
                    </label>

                    <input
                      value={campaignName}
                      onChange={(e) => {
                        setCampaignName(
                          e.target.value
                        );
                        clearError(
                          "campaignName"
                        );
                      }}
                      maxLength={60}
                      placeholder="What are you looking for?"
                      style={{
                        width: "100%",
                        boxSizing: "border-box",
                        padding: "13px 14px",
                        border: errors.campaignName
                          ? "1px solid #E0574F"
                          : "1px solid #C9D5E2",
                        borderRadius: "8px",
                        fontSize: "14px",
                        outline: "none",
                        background:
                          errors.campaignName
                            ? "#FFF8F7"
                            : "#FFFFFF",
                      }}
                    />

                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent:
                          "space-between",
                        gap: "10px",
                        marginTop: "6px",
                      }}
                    >
                      <span
                        style={{
                          fontSize: "12px",
                          color: errors.campaignName
                            ? "#C62828"
                            : "#9AA4B2",
                        }}
                      >
                        {errors.campaignName ||
                          "Between 3 and 60 characters."}
                      </span>

                      <span
                        style={{
                          fontSize: "11px",
                          color: "#9AA4B2",
                          flexShrink: 0,
                        }}
                      >
                        {campaignName.length}/60
                      </span>
                    </div>

                  </div>

                  <div
                    style={{
                      marginTop: "20px",
                    }}
                  >

                    <label
                      style={{
                        display: "block",
                        marginBottom: "8px",
                        fontSize: "13px",
                        fontWeight: 600,
                        color: "#374151",
                      }}
                    >
                      Campaign description{" "}
                      <span
                        style={{
                          color: "#C62828",
                        }}
                      >
                        *
                      </span>
                    </label>

                    <textarea
                      value={campaignDescription}
                      onChange={(e) => {
                        setCampaignDescription(
                          e.target.value
                        );
                        clearError(
                          "campaignDescription"
                        );
                      }}
                      maxLength={500}
                      placeholder="What is this campaign trying to achieve?"
                      rows={5}
                      style={{
                        width: "100%",
                        boxSizing: "border-box",
                        padding: "13px 14px",
                        border:
                          errors.campaignDescription
                            ? "1px solid #E0574F"
                            : "1px solid #C9D5E2",
                        borderRadius: "8px",
                        fontSize: "14px",
                        resize: "vertical",
                        outline: "none",
                        background:
                          errors.campaignDescription
                            ? "#FFF8F7"
                            : "#FFFFFF",
                      }}
                    />

                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent:
                          "space-between",
                        gap: "10px",
                        marginTop: "6px",
                      }}
                    >
                      <span
                        style={{
                          fontSize: "12px",
                          color:
                            errors.campaignDescription
                              ? "#C62828"
                              : "#9AA4B2",
                        }}
                      >
                        {errors.campaignDescription ||
                          "At least 10 characters."}
                      </span>

                      <span
                        style={{
                          fontSize: "11px",
                          color: "#9AA4B2",
                          flexShrink: 0,
                        }}
                      >
                        {campaignDescription.length}
                        /500
                      </span>
                    </div>

                  </div>

                </div>

              )}


              {/* =================================================
                  STEP 2 — audience
              ================================================= */}

              {wizardStep === 2 && (

                <div
                  style={{
                    maxWidth: "1040px",
                    margin: "0 auto",
                  }}
                >

                  <div
                    style={{
                      color: "#7651D8",
                      fontSize: "11px",
                      fontWeight: 700,
                    }}
                  >
                    STEP 2 · AUDIENCE
                  </div>

                  <h2
                    style={{
                      margin: "10px 0 8px",
                      fontSize: "28px",
                      color: "#172033",
                    }}
                  >
                    Who should see this campaign?
                  </h2>

                  <p
                    style={{
                      margin: 0,
                      color: "#6B7280",
                      fontSize: "14px",
                    }}
                  >
                    Select the audience you want to target.
                  </p>

                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns:
                        "repeat(2, minmax(0, 1fr))",
                      gap: "14px",
                      marginTop: "30px",
                    }}
                  >

                    {[
                      {
                        title: "All visitors",
                        text: "Everyone visiting your store.",
                      },
                      {
                        title: "New visitors",
                        text: "Visitors who are new to your store.",
                      },
                      {
                        title: "Returning visitors",
                        text: "Visitors who have visited before.",
                      },
                      {
                        title: "Customers",
                        text: "Existing customers.",
                      },
                    ].map((item) => (

                      <button
                        key={item.title}
                        type="button"
                        onClick={() => {
                          setSelectedAudience(
                            item.title
                          );
                          clearError(
                            "selectedAudience"
                          );
                        }}
                        style={{
                          textAlign: "left",
                          padding: "20px",
                          background:
                            selectedAudience ===
                            item.title
                              ? "#F3F7FB"
                              : "#FFFFFF",
                          border:
                            selectedAudience ===
                            item.title
                              ? "2px solid #0B3D66"
                              : "1px solid #DCE3EA",
                          borderRadius: "10px",
                          cursor: "pointer",
                        }}
                      >

                        <strong
                          style={{
                            display: "block",
                            fontSize: "14px",
                            color: "#172033",
                          }}
                        >
                          {item.title}
                        </strong>

                        <span
                          style={{
                            display: "block",
                            marginTop: "6px",
                            color: "#6B7280",
                            fontSize: "12px",
                          }}
                        >
                          {item.text}
                        </span>

                      </button>

                    ))}

                  </div>

                  {renderError("selectedAudience")}

                </div>

              )}


              {/* =================================================
                  STEP 1 (continued) — popup
              ================================================= */}

              {wizardStep === 1 && (

                <div
                  style={{
                    maxWidth: "1040px",
                    /* Second half of the merged Build step, so it
                       needs a rule above it to read as its own
                       section rather than running on from Details. */
                    margin: "40px auto 0",
                    paddingTop: "32px",
                    borderTop: "1px solid #E7EBEF",
                  }}
                >

                  <div
                    style={{
                      color: "#7651D8",
                      fontSize: "11px",
                      fontWeight: 700,
                    }}
                  >
                    STEP 1 · POPUP
                  </div>

                  <h2
                    style={{
                      margin: "10px 0 8px",
                      fontSize: "28px",
                      color: "#172033",
                    }}
                  >
                    Choose your popup
                  </h2>

                  <p
                    style={{
                      margin: 0,
                      color: "#6B7280",
                      fontSize: "14px",
                    }}
                  >
                    Only live popups can be attached to
                    a campaign. Set a popup to Live on
                    the Popups page to see it here.
                  </p>

                  {/* SEARCH */}

                  {livePopups.length > 0 && (
                    <div
                      style={{
                        position: "relative",
                        marginTop: "24px",
                        maxWidth: "330px",
                      }}
                    >
                      <span
                        style={{
                          position: "absolute",
                          left: "12px",
                          top: "50%",
                          transform:
                            "translateY(-50%)",
                          color: "#8D98A7",
                          fontSize: "14px",
                        }}
                      >
                        ⌕
                      </span>

                      <input
                        value={popupSearch}
                        onChange={(e) =>
                          setPopupSearch(
                            e.target.value,
                          )
                        }
                        placeholder="Search live popups..."
                        style={{
                          width: "100%",
                          boxSizing: "border-box",
                          padding:
                            "11px 12px 11px 32px",
                          border:
                            "1px solid #C9D5E2",
                          borderRadius: "8px",
                          fontSize: "13px",
                          outline: "none",
                        }}
                      />
                    </div>
                  )}

                  {livePopups.length === 0 ? (

                    <div
                      style={{
                        marginTop: "30px",
                        padding: "30px",
                        textAlign: "center",
                        border: "1px dashed #C9D2DD",
                        borderRadius: "12px",
                        color: "#6B7280",
                        fontSize: "13px",
                      }}
                    >
                      You don't have any live popups yet.
                      Open the Popups page, switch a
                      popup to Live, then come back here
                      to attach it to this campaign.
                    </div>

                  ) : searchedPopups.length === 0 ? (

                    <div
                      style={{
                        marginTop: "24px",
                        padding: "30px",
                        textAlign: "center",
                        border: "1px dashed #C9D2DD",
                        borderRadius: "12px",
                        color: "#6B7280",
                        fontSize: "13px",
                      }}
                    >
                      No live popups match "
                      {popupSearch.trim()}". Try a
                      different search.
                    </div>

                  ) : (

                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns:
                          "repeat(2, minmax(0, 1fr))",
                        gap: "16px",
                        marginTop: "30px",
                      }}
                    >

                      {paginatedWizardPopups.map((popup) => {

                        const preview =
                          getOfferPreview(
                            popup.steps,
                          );

                        const selected =
                          selectedPopup ===
                          popup.id;

                        return (

                          <button
                            key={popup.id}
                            type="button"
                            onClick={() => {
                              setSelectedPopup(
                                popup.id,
                              );
                              clearError(
                                "selectedPopup",
                              );
                            }}
                            style={{
                              textAlign: "left",
                              padding: 0,
                              overflow: "hidden",
                              background:
                                selected
                                  ? "#F3F7FB"
                                  : "#FFFFFF",
                              border: selected
                                ? "2px solid #0B3D66"
                                : "1px solid #DCE3EA",
                              borderRadius: "12px",
                              cursor: "pointer",
                            }}
                          >

                            {/* LIVE OFFER PREVIEW */}

                            <div
                              style={{
                                padding: "18px 16px",
                                background:
                                  preview.headerBackground ===
                                  preview.headerGradientEnd
                                    ? preview.headerBackground
                                    : `linear-gradient(135deg, ${preview.headerBackground}, ${preview.headerGradientEnd})`,
                              }}
                            >
                              <div
                                style={{
                                  background: "#FFFFFF",
                                  borderRadius: "8px",
                                  padding: "12px 14px",
                                  boxShadow:
                                    "0 6px 16px rgba(0,0,0,.18)",
                                }}
                              >
                                <div
                                  style={{
                                    fontSize: "13px",
                                    fontWeight: 700,
                                    color: "#172033",
                                    overflow: "hidden",
                                    textOverflow: "ellipsis",
                                    whiteSpace: "nowrap",
                                  }}
                                >
                                  {preview.heading}
                                </div>

                                {preview.text && (
                                  <div
                                    style={{
                                      marginTop: "4px",
                                      fontSize: "11px",
                                      color: "#6B7280",
                                      overflow: "hidden",
                                      display: "-webkit-box",
                                      WebkitLineClamp: 2,
                                      WebkitBoxOrient:
                                        "vertical",
                                    }}
                                  >
                                    {preview.text}
                                  </div>
                                )}

                                <div
                                  style={{
                                    marginTop: "10px",
                                    display: "inline-block",
                                    padding: "6px 12px",
                                    borderRadius: "6px",
                                    background:
                                      preview.headerBackground,
                                    color: "#FFFFFF",
                                    fontSize: "11px",
                                    fontWeight: 700,
                                  }}
                                >
                                  {preview.buttonText}
                                </div>
                              </div>
                            </div>

                            {/* META */}

                            <div
                              style={{
                                padding: "12px 16px",
                              }}
                            >
                              <div
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent:
                                    "space-between",
                                  gap: "8px",
                                }}
                              >
                                <strong
                                  style={{
                                    fontSize: "14px",
                                    color: "#172033",
                                  }}
                                >
                                  {popup.name}
                                </strong>

                                <span
                                  style={{
                                    fontSize: "9px",
                                    fontWeight: 700,
                                    padding: "3px 7px",
                                    borderRadius: "5px",
                                    background:
                                      popup.status.toLowerCase() ===
                                      "active"
                                        ? "#E7F7EF"
                                        : "#F0F2F5",
                                    color:
                                      popup.status.toLowerCase() ===
                                      "active"
                                        ? "#157A50"
                                        : "#657080",
                                  }}
                                >
                                  {popup.status.toLowerCase() ===
                                  "active"
                                    ? "LIVE"
                                    : "DRAFT"}
                                </span>
                              </div>

                              <div
                                style={{
                                  marginTop: "6px",
                                  fontSize: "12px",
                                  color: "#6B7280",
                                }}
                              >
                                {Array.isArray(
                                  popup.steps,
                                )
                                  ? popup.steps.length
                                  : 0}{" "}
                                steps · priority{" "}
                                {popup.priority}
                              </div>
                            </div>

                          </button>

                        );
                      })}

                    </div>

                  )}

                  {/* PAGINATION */}

                  {popupTotalPages > 1 && (

                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        marginTop: "18px",
                      }}
                    >

                      <span
                        style={{
                          fontSize: "12px",
                          color: "#8A95A5",
                        }}
                      >
                        Page {popupSafePage} of{" "}
                        {popupTotalPages}
                      </span>

                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "6px",
                        }}
                      >

                        <button
                          type="button"
                          disabled={
                            popupSafePage === 1
                          }
                          onClick={() =>
                            setPopupPage((page) =>
                              Math.max(1, page - 1),
                            )
                          }
                          style={{
                            border: "1px solid #D8DEE7",
                            background: "#FFFFFF",
                            color:
                              popupSafePage === 1
                                ? "#C4CBD4"
                                : "#374151",
                            borderRadius: "7px",
                            padding: "7px 12px",
                            fontSize: "12px",
                            fontWeight: 600,
                            cursor:
                              popupSafePage === 1
                                ? "not-allowed"
                                : "pointer",
                          }}
                        >
                          Previous
                        </button>

                        {Array.from(
                          { length: popupTotalPages },
                          (_, index) => index + 1,
                        ).map((page) => (
                          <button
                            key={page}
                            type="button"
                            onClick={() =>
                              setPopupPage(page)
                            }
                            style={{
                              border:
                                page === popupSafePage
                                  ? "1px solid #0B3D66"
                                  : "1px solid #D8DEE7",
                              background:
                                page === popupSafePage
                                  ? "#0B3D66"
                                  : "#FFFFFF",
                              color:
                                page === popupSafePage
                                  ? "#FFFFFF"
                                  : "#374151",
                              borderRadius: "7px",
                              minWidth: "32px",
                              padding: "7px 8px",
                              fontSize: "12px",
                              fontWeight: 600,
                              cursor: "pointer",
                            }}
                          >
                            {page}
                          </button>
                        ))}

                        <button
                          type="button"
                          disabled={
                            popupSafePage ===
                            popupTotalPages
                          }
                          onClick={() =>
                            setPopupPage((page) =>
                              Math.min(
                                popupTotalPages,
                                page + 1,
                              ),
                            )
                          }
                          style={{
                            border: "1px solid #D8DEE7",
                            background: "#FFFFFF",
                            color:
                              popupSafePage ===
                              popupTotalPages
                                ? "#C4CBD4"
                                : "#374151",
                            borderRadius: "7px",
                            padding: "7px 12px",
                            fontSize: "12px",
                            fontWeight: 600,
                            cursor:
                              popupSafePage ===
                              popupTotalPages
                                ? "not-allowed"
                                : "pointer",
                          }}
                        >
                          Next
                        </button>

                      </div>

                    </div>

                  )}

                  {renderError("selectedPopup")}

                </div>

              )}


              {/* =================================================
                  STEP 2 (continued) — trigger
              ================================================= */}

              {wizardStep === 2 && (

                <div
                  style={{
                    maxWidth: "1040px",
                    /* Second half of the merged Target step — see
                       the matching rule in the Build step. */
                    margin: "40px auto 0",
                    paddingTop: "32px",
                    borderTop: "1px solid #E7EBEF",
                  }}
                >

                  <div
                    style={{
                      color: "#7651D8",
                      fontSize: "11px",
                      fontWeight: 700,
                    }}
                  >
                    STEP 2 · TRIGGER
                  </div>

                  <h2
                    style={{
                      margin: "10px 0 8px",
                      fontSize: "28px",
                      color: "#172033",
                    }}
                  >
                    When should it appear?
                  </h2>

                  <p
                    style={{
                      margin: 0,
                      color: "#6B7280",
                      fontSize: "14px",
                    }}
                  >
                    Choose when visitors should see the
                    campaign.
                  </p>

                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: "12px",
                      marginTop: "30px",
                    }}
                  >

                    {[
                      {
                        title: "Immediately",
                        text: "Show as soon as the visitor arrives.",
                      },
                      {
                        title: "After delay",
                        text: `Wait ${triggerDelaySeconds} second${
                          triggerDelaySeconds === 1
                            ? ""
                            : "s"
                        } before showing.`,
                      },
                      {
                        title: "Scroll depth",
                        text: `Show after the visitor scrolls ${triggerScrollPercent}% of the page.`,
                      },
                    ].map((item) => (

                      <div key={item.title}>

                        <button
                          type="button"
                          onClick={() => {
                            setSelectedTrigger(
                              item.title
                            );
                            clearError(
                              "selectedTrigger"
                            );
                          }}
                          style={{
                            width: "100%",
                            textAlign: "left",
                            padding: "17px 20px",
                            background:
                              selectedTrigger ===
                              item.title
                                ? "#F3F7FB"
                                : "#FFFFFF",
                            border:
                              selectedTrigger ===
                              item.title
                                ? "2px solid #0B3D66"
                                : "1px solid #DCE3EA",
                            borderRadius: "9px",
                            cursor: "pointer",
                          }}
                        >

                          <strong
                            style={{
                              display: "block",
                              color: "#172033",
                              fontSize: "14px",
                            }}
                          >
                            {item.title}
                          </strong>

                          <span
                            style={{
                              display: "block",
                              marginTop: "4px",
                              color: "#6B7280",
                              fontSize: "12px",
                            }}
                          >
                            {item.text}
                          </span>

                        </button>

                        {/* DELAY CONTROL */}

                        {item.title ===
                          "After delay" &&
                          selectedTrigger ===
                            "After delay" && (
                            <div
                              style={{
                                marginTop: "10px",
                                padding: "16px 20px",
                                border:
                                  "1px solid #DCE3EA",
                                borderRadius: "9px",
                                background: "#FBFCFD",
                              }}
                            >
                              <div
                                style={{
                                  display: "flex",
                                  alignItems:
                                    "center",
                                  justifyContent:
                                    "space-between",
                                  marginBottom:
                                    "10px",
                                }}
                              >
                                <label
                                  style={{
                                    fontSize: "13px",
                                    fontWeight: 600,
                                    color: "#374151",
                                  }}
                                >
                                  Delay before showing
                                </label>

                                <div
                                  style={{
                                    display: "flex",
                                    alignItems:
                                      "center",
                                    gap: "6px",
                                  }}
                                >
                                  <input
                                    type="number"
                                    min={1}
                                    max={120}
                                    value={
                                      triggerDelaySeconds
                                    }
                                    onChange={(e) => {
                                      const next =
                                        Number(
                                          e.target
                                            .value,
                                        );

                                      setTriggerDelaySeconds(
                                        Number.isNaN(
                                          next,
                                        )
                                          ? 1
                                          : Math.min(
                                              120,
                                              Math.max(
                                                1,
                                                next,
                                              ),
                                            ),
                                      );

                                      clearError(
                                        "selectedTrigger",
                                      );
                                    }}
                                    style={{
                                      width: "62px",
                                      padding:
                                        "6px 8px",
                                      border:
                                        "1px solid #C9D5E2",
                                      borderRadius:
                                        "6px",
                                      fontSize:
                                        "13px",
                                      textAlign:
                                        "center",
                                      outline: "none",
                                    }}
                                  />

                                  <span
                                    style={{
                                      fontSize:
                                        "12px",
                                      color:
                                        "#6B7280",
                                    }}
                                  >
                                    seconds
                                  </span>
                                </div>
                              </div>

                              <input
                                type="range"
                                min={1}
                                max={60}
                                step={1}
                                value={Math.min(
                                  60,
                                  triggerDelaySeconds,
                                )}
                                onChange={(e) => {
                                  setTriggerDelaySeconds(
                                    Number(
                                      e.target.value,
                                    ),
                                  );
                                  clearError(
                                    "selectedTrigger",
                                  );
                                }}
                                style={{
                                  width: "100%",
                                  accentColor:
                                    "#0B3D66",
                                  cursor: "pointer",
                                }}
                              />

                              <div
                                style={{
                                  display: "flex",
                                  justifyContent:
                                    "space-between",
                                  marginTop: "4px",
                                  fontSize: "11px",
                                  color: "#9AA4B2",
                                }}
                              >
                                <span>1s</span>
                                <span>60s</span>
                              </div>
                            </div>
                          )}

                        {/* SCROLL CONTROL */}

                        {item.title ===
                          "Scroll depth" &&
                          selectedTrigger ===
                            "Scroll depth" && (
                            <div
                              style={{
                                marginTop: "10px",
                                padding: "16px 20px",
                                border:
                                  "1px solid #DCE3EA",
                                borderRadius: "9px",
                                background: "#FBFCFD",
                              }}
                            >
                              <div
                                style={{
                                  display: "flex",
                                  alignItems:
                                    "center",
                                  justifyContent:
                                    "space-between",
                                  marginBottom:
                                    "10px",
                                }}
                              >
                                <label
                                  style={{
                                    fontSize: "13px",
                                    fontWeight: 600,
                                    color: "#374151",
                                  }}
                                >
                                  Scroll depth
                                </label>

                                <span
                                  style={{
                                    fontSize: "13px",
                                    fontWeight: 700,
                                    color: "#0B3D66",
                                    minWidth: "44px",
                                    textAlign:
                                      "right",
                                  }}
                                >
                                  {
                                    triggerScrollPercent
                                  }
                                  %
                                </span>
                              </div>

                              <input
                                type="range"
                                min={5}
                                max={100}
                                step={5}
                                value={
                                  triggerScrollPercent
                                }
                                onChange={(e) => {
                                  setTriggerScrollPercent(
                                    Number(
                                      e.target.value,
                                    ),
                                  );
                                  clearError(
                                    "selectedTrigger",
                                  );
                                }}
                                style={{
                                  width: "100%",
                                  accentColor:
                                    "#0B3D66",
                                  cursor: "pointer",
                                }}
                              />

                              <div
                                style={{
                                  display: "flex",
                                  justifyContent:
                                    "space-between",
                                  marginTop: "4px",
                                  fontSize: "11px",
                                  color: "#9AA4B2",
                                }}
                              >
                                <span>5%</span>
                                <span>50%</span>
                                <span>100%</span>
                              </div>
                            </div>
                          )}

                      </div>

                    ))}

                  </div>

                  {renderError("selectedTrigger")}

                  {/* =============================================
                      WHERE SHOULD IT APPEAR?
                  ============================================= */}

                  <div
                    style={{
                      marginTop: "36px",
                      paddingTop: "28px",
                      borderTop: "1px solid #E7EBEF",
                    }}
                  >

                    <h2
                      style={{
                        margin: "0 0 8px",
                        fontSize: "24px",
                        color: "#172033",
                      }}
                    >
                      Where should it appear?
                    </h2>

                    <p
                      style={{
                        margin: 0,
                        color: "#6B7280",
                        fontSize: "14px",
                      }}
                    >
                      Pick the storefront pages this
                      campaign runs on.
                    </p>

                    {/* MODE TOGGLE */}

                    <div
                      style={{
                        display: "flex",
                        gap: "10px",
                        marginTop: "20px",
                      }}
                    >
                      {(
                        [
                          {
                            value: "all" as const,
                            label: "All pages",
                            text: "Run everywhere on the storefront.",
                          },
                          {
                            value:
                              "specific" as const,
                            label: "Specific pages",
                            text: "Choose exactly where it runs.",
                          },
                        ]
                      ).map((mode) => (
                        <button
                          key={mode.value}
                          type="button"
                          onClick={() => {
                            setPageTargetMode(
                              mode.value,
                            );
                            clearError(
                              "pageTargets",
                            );
                          }}
                          style={{
                            flex: 1,
                            textAlign: "left",
                            padding: "15px 18px",
                            background:
                              pageTargetMode ===
                              mode.value
                                ? "#F3F7FB"
                                : "#FFFFFF",
                            border:
                              pageTargetMode ===
                              mode.value
                                ? "2px solid #0B3D66"
                                : "1px solid #DCE3EA",
                            borderRadius: "9px",
                            cursor: "pointer",
                          }}
                        >
                          <strong
                            style={{
                              display: "block",
                              color: "#172033",
                              fontSize: "14px",
                            }}
                          >
                            {mode.label}
                          </strong>

                          <span
                            style={{
                              display: "block",
                              marginTop: "4px",
                              color: "#6B7280",
                              fontSize: "12px",
                            }}
                          >
                            {mode.text}
                          </span>
                        </button>
                      ))}
                    </div>

                    {/* PAGE PICKER */}

                    {pageTargetMode ===
                      "specific" && (
                      <div
                        style={{
                          marginTop: "18px",
                        }}
                      >

                        {/* SHOPIFY PAGES */}

                        <div
                          style={{
                            fontSize: "11px",
                            fontWeight: 700,
                            letterSpacing: "0.06em",
                            color: "#8A94A6",
                            marginBottom: "10px",
                          }}
                        >
                          YOUR STORE PAGES
                        </div>

                        {shopPagesError ? (
                          <div
                            style={{
                              padding: "12px 14px",
                              border:
                                "1px solid #F3DFC4",
                              background:
                                "#FFFBF3",
                              borderRadius: "8px",
                              color: "#8A5A00",
                              fontSize: "12px",
                              lineHeight: 1.5,
                            }}
                          >
                            {shopPagesError}
                          </div>
                        ) : storePageOptions.length ===
                          0 ? (
                          <div
                            style={{
                              padding: "12px 14px",
                              border:
                                "1px dashed #C9D2DD",
                              borderRadius: "8px",
                              color: "#6B7280",
                              fontSize: "12px",
                            }}
                          >
                            No pages found in this
                            store yet.
                          </div>
                        ) : (
                          <div
                            style={{
                              display: "grid",
                              gridTemplateColumns:
                                "repeat(2, minmax(0, 1fr))",
                              gap: "8px",
                              maxHeight: "220px",
                              overflowY: "auto",
                            }}
                          >
                            {storePageOptions.map(
                              (page) => {
                                const value =
                                  page.value;

                                const checked =
                                  pageTargets.includes(
                                    value,
                                  );

                                return (
                                  <label
                                    key={page.key}
                                    style={{
                                      display:
                                        "flex",
                                      alignItems:
                                        "center",
                                      gap: "10px",
                                      padding:
                                        "11px 14px",
                                      border:
                                        checked
                                          ? "1px solid #0B3D66"
                                          : "1px solid #DCE3EA",
                                      background:
                                        checked
                                          ? "#F3F7FB"
                                          : "#FFFFFF",
                                      borderRadius:
                                        "8px",
                                      cursor:
                                        "pointer",
                                    }}
                                  >
                                    <input
                                      type="checkbox"
                                      checked={
                                        checked
                                      }
                                      onChange={() =>
                                        togglePageTarget(
                                          value,
                                        )
                                      }
                                      style={{
                                        cursor:
                                          "pointer",
                                      }}
                                    />

                                    <span>
                                      <span
                                        style={{
                                          display:
                                            "block",
                                          fontSize:
                                            "13px",
                                          color:
                                            "#172033",
                                          fontWeight: 600,
                                        }}
                                      >
                                        {page.label}
                                      </span>

                                      <span
                                        style={{
                                          display:
                                            "block",
                                          fontSize:
                                            "11px",
                                          color:
                                            "#9AA4B2",
                                        }}
                                      >
                                        {page.hint}
                                      </span>
                                    </span>
                                  </label>
                                );
                              },
                            )}
                          </div>
                        )}


                        {renderError(
                          "pageTargets",
                        )}

                        {pageTargets.length > 0 && (
                          <div
                            style={{
                              marginTop: "12px",
                              fontSize: "12px",
                              color: "#6B7280",
                            }}
                          >
                            {pageTargets.length} page
                            {pageTargets.length === 1
                              ? ""
                              : "s"}{" "}
                            selected
                          </div>
                        )}

                      </div>
                    )}

                  </div>

                  {/* =============================================
                      HOW OFTEN?

                      Counted per visitor in their own browser's
                      local storage, so clearing site data resets
                      it. That caveat is stated in the UI rather
                      than hidden, because merchants will
                      otherwise read the cap as a guarantee.
                  ============================================= */}

                  <div
                    style={{
                      marginTop: "36px",
                      paddingTop: "28px",
                      borderTop: "1px solid #E7EBEF",
                    }}
                  >

                    <h2
                      style={{
                        margin: "0 0 8px",
                        fontSize: "24px",
                        color: "#172033",
                      }}
                    >
                      How often should it show?
                    </h2>

                    <p
                      style={{
                        margin: 0,
                        color: "#6B7280",
                        fontSize: "14px",
                      }}
                    >
                      Limit how many times the same
                      visitor sees this campaign.
                    </p>

                    <div
                      style={{
                        display: "flex",
                        gap: "10px",
                        marginTop: "20px",
                      }}
                    >
                      {(
                        [
                          {
                            value:
                              "unlimited" as const,
                            label: "No limit",
                            text: "Show it every time the trigger fires.",
                          },
                          {
                            value: "once" as const,
                            label: "Only once",
                            text: "Show it a single time per visitor.",
                          },
                          {
                            value:
                              "limited" as const,
                            label: "A set number",
                            text: "Show it up to a chosen number of times.",
                          },
                        ]
                      ).map((mode) => (
                        <button
                          key={mode.value}
                          type="button"
                          onClick={() => {
                            setFrequencyMode(
                              mode.value,
                            );
                            clearError(
                              "frequencyLimit",
                            );
                          }}
                          style={{
                            flex: 1,
                            textAlign: "left",
                            padding: "15px 18px",
                            background:
                              frequencyMode ===
                              mode.value
                                ? "#F3F7FB"
                                : "#FFFFFF",
                            border:
                              frequencyMode ===
                              mode.value
                                ? "2px solid #0B3D66"
                                : "1px solid #DCE3EA",
                            borderRadius: "9px",
                            cursor: "pointer",
                          }}
                        >
                          <strong
                            style={{
                              display: "block",
                              color: "#172033",
                              fontSize: "14px",
                            }}
                          >
                            {mode.label}
                          </strong>

                          <span
                            style={{
                              display: "block",
                              marginTop: "4px",
                              fontSize: "12px",
                              color: "#6B7280",
                            }}
                          >
                            {mode.text}
                          </span>
                        </button>
                      ))}
                    </div>

                    {frequencyMode ===
                      "limited" && (
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "10px",
                          marginTop: "16px",
                          fontSize: "14px",
                          color: "#172033",
                        }}
                      >
                        <span>Show it up to</span>

                        <input
                          type="number"
                          min={1}
                          max={50}
                          value={frequencyLimit}
                          onChange={(event) => {
                            setFrequencyLimit(
                              Number(
                                event.target
                                  .value,
                              ),
                            );
                            clearError(
                              "frequencyLimit",
                            );
                          }}
                          style={{
                            width: "84px",
                            padding: "9px 10px",
                            fontSize: "14px",
                            border:
                              "1px solid #DCE3EA",
                            borderRadius: "8px",
                          }}
                        />

                        <span>
                          times per visitor
                        </span>
                      </div>
                    )}

                    {renderError("frequencyLimit")}

                    {/* COOLDOWNS */}

                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns:
                          "repeat(auto-fit, minmax(260px, 1fr))",
                        gap: "14px",
                        marginTop: "22px",
                      }}
                    >
                      {(
                        [
                          {
                            key: "collected" as const,
                            label:
                              "After they submit",
                            value:
                              reshowCollectedDays,
                            set: setReshowCollectedDays,
                          },
                          {
                            key: "dismissed" as const,
                            label:
                              "After they close it",
                            value:
                              reshowDismissedDays,
                            set: setReshowDismissedDays,
                          },
                        ]
                      ).map((field) => (
                        <div
                          key={field.key}
                          style={{
                            padding: "14px 16px",
                            border:
                              "1px solid #DCE3EA",
                            borderRadius: "9px",
                          }}
                        >
                          <div
                            style={{
                              fontSize: "13px",
                              fontWeight: 600,
                              color: "#172033",
                              marginBottom: "8px",
                            }}
                          >
                            {field.label}
                          </div>

                          <div
                            style={{
                              display: "flex",
                              alignItems:
                                "center",
                              gap: "8px",
                              fontSize: "13px",
                              color: "#6B7280",
                            }}
                          >
                            <span>
                              show again after
                            </span>

                            <input
                              type="number"
                              min={0}
                              max={365}
                              value={field.value}
                              onChange={(event) =>
                                field.set(
                                  Number(
                                    event.target
                                      .value,
                                  ),
                                )
                              }
                              style={{
                                width: "72px",
                                padding:
                                  "8px 10px",
                                fontSize: "13px",
                                border:
                                  "1px solid #DCE3EA",
                                borderRadius:
                                  "8px",
                              }}
                            />

                            <span>days</span>
                          </div>

                          <div
                            style={{
                              marginTop: "8px",
                              fontSize: "11px",
                              color: "#9AA4B2",
                            }}
                          >
                            {field.value <= 0
                              ? "0 means never show it to them again."
                              : `They will not see it again for ${field.value} day${
                                  field.value ===
                                  1
                                    ? ""
                                    : "s"
                                }.`}
                          </div>
                        </div>
                      ))}
                    </div>

                    <p
                      style={{
                        marginTop: "14px",
                        fontSize: "11px",
                        color: "#9AA4B2",
                      }}
                    >
                      These counts live in each
                      visitor's own browser storage. If
                      someone clears their site data or
                      switches device, they start
                      fresh.
                    </p>

                  </div>

                  {/* =============================================
                      DEVICES
                  ============================================= */}

                  <div
                    style={{
                      marginTop: "36px",
                      paddingTop: "28px",
                      borderTop: "1px solid #E7EBEF",
                    }}
                  >

                    <h2
                      style={{
                        margin: "0 0 8px",
                        fontSize: "24px",
                        color: "#172033",
                      }}
                    >
                      Devices
                    </h2>

                    <p
                      style={{
                        margin: 0,
                        color: "#6B7280",
                        fontSize: "14px",
                      }}
                    >
                      Pick the screen sizes this
                      campaign is allowed on.
                    </p>

                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns:
                          "repeat(auto-fit, minmax(220px, 1fr))",
                        gap: "10px",
                        marginTop: "20px",
                      }}
                    >
                      {(
                        [
                          {
                            value: "desktop",
                            label:
                              "Desktop browsers",
                            hint: "1024px and wider",
                          },
                          {
                            value: "tablet",
                            label:
                              "Tablet browsers",
                            hint: "768px to 1023px",
                          },
                          {
                            value: "mobile",
                            label:
                              "Mobile browsers",
                            hint: "Under 768px",
                          },
                        ]
                      ).map((device) => {
                        const checked =
                          devices.includes(
                            device.value,
                          );

                        return (
                          <label
                            key={device.value}
                            style={{
                              display: "flex",
                              alignItems:
                                "flex-start",
                              gap: "10px",
                              padding: "12px 14px",
                              background: checked
                                ? "#F3F7FB"
                                : "#FFFFFF",
                              border: checked
                                ? "2px solid #0B3D66"
                                : "1px solid #DCE3EA",
                              borderRadius: "9px",
                              cursor: "pointer",
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() =>
                                toggleDevice(
                                  device.value,
                                )
                              }
                              style={{
                                marginTop: "2px",
                              }}
                            />

                            <span>
                              <span
                                style={{
                                  display:
                                    "block",
                                  fontSize:
                                    "13px",
                                  color: "#172033",
                                  fontWeight: 600,
                                }}
                              >
                                {device.label}
                              </span>

                              <span
                                style={{
                                  display:
                                    "block",
                                  fontSize:
                                    "11px",
                                  color: "#9AA4B2",
                                }}
                              >
                                {device.hint}
                              </span>
                            </span>
                          </label>
                        );
                      })}
                    </div>

                    {renderError("devices")}

                  </div>

                </div>

              )}


              {/* =================================================
                  STEP 3 — websites

                  Page targeting in step 4 is about where inside
                  a storefront a popup shows. This step is about
                  which website it shows on at all, which starts
                  to matter the moment the embed snippet is on
                  more than one site.
              ================================================= */}

              {wizardStep === 3 && (

                <div
                  style={{
                    maxWidth: "1040px",
                    margin: "0 auto",
                  }}
                >

                  <div
                    style={{
                      color: "#7651D8",
                      fontSize: "11px",
                      fontWeight: 700,
                    }}
                  >
                    STEP 3 · WEBSITES
                  </div>

                  <h2
                    style={{
                      margin: "10px 0 8px",
                      fontSize: "28px",
                      color: "#172033",
                    }}
                  >
                    Which websites?
                  </h2>

                  <p
                    style={{
                      margin: 0,
                      color: "#6B7280",
                      fontSize: "14px",
                    }}
                  >
                    Your storefront and every website
                    carrying the embed snippet can run this
                    campaign. Narrow it down if it belongs
                    on only some of them.
                  </p>

                  {/* MODE TOGGLE */}

                  <div
                    style={{
                      display: "flex",
                      gap: "10px",
                      marginTop: "24px",
                    }}
                  >
                    {(
                      [
                        {
                          value: "all" as const,
                          label: "All websites",
                          text: "Run anywhere the snippet is installed.",
                        },
                        {
                          value: "selected" as const,
                          label: "Selected websites",
                          text: "Choose exactly which sites run it.",
                        },
                      ]
                    ).map((mode) => (
                      <button
                        key={mode.value}
                        type="button"
                        onClick={() => {
                          setSiteTargetMode(
                            mode.value,
                          );
                          clearError("siteTargets");
                        }}
                        style={{
                          flex: 1,
                          textAlign: "left",
                          padding: "15px 18px",
                          background:
                            siteTargetMode ===
                            mode.value
                              ? "#F3F7FB"
                              : "#FFFFFF",
                          border:
                            siteTargetMode ===
                            mode.value
                              ? "2px solid #0B3D66"
                              : "1px solid #DCE3EA",
                          borderRadius: "9px",
                          cursor: "pointer",
                        }}
                      >
                        <strong
                          style={{
                            display: "block",
                            color: "#172033",
                            fontSize: "14px",
                          }}
                        >
                          {mode.label}
                        </strong>

                        <span
                          style={{
                            display: "block",
                            marginTop: "4px",
                            fontSize: "12px",
                            color: "#6B7280",
                          }}
                        >
                          {mode.text}
                        </span>
                      </button>
                    ))}
                  </div>

                  {siteTargetMode === "selected" && (
                    <div style={{ marginTop: "24px" }}>

                      {sites.length === 0 ? (
                        <div
                          style={{
                            padding: "14px 16px",
                            fontSize: "13px",
                            color: "#6B7280",
                            background: "#F8FAFC",
                            border: "1px solid #E7EBEF",
                            borderRadius: "9px",
                          }}
                        >
                          No websites yet. One appears here
                          on its own once the snippet below
                          has loaded on it.
                        </div>
                      ) : (
                        <div
                          style={{
                            display: "grid",
                            gridTemplateColumns:
                              "repeat(auto-fit, minmax(240px, 1fr))",
                            gap: "10px",
                          }}
                        >
                          {sites.map((site) => {
                            const checked =
                              siteTargets.includes(
                                site.id,
                              );

                            return (
                              <label
                                key={site.id}
                                style={{
                                  display: "flex",
                                  alignItems:
                                    "flex-start",
                                  gap: "10px",
                                  padding: "12px 14px",
                                  background: checked
                                    ? "#F3F7FB"
                                    : "#FFFFFF",
                                  border: checked
                                    ? "2px solid #0B3D66"
                                    : "1px solid #DCE3EA",
                                  borderRadius: "9px",
                                  cursor: "pointer",
                                }}
                              >
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={() =>
                                    toggleSiteTarget(
                                      site.id,
                                    )
                                  }
                                  style={{
                                    marginTop: "2px",
                                  }}
                                />

                                <span
                                  style={{ minWidth: 0 }}
                                >
                                  <span
                                    style={{
                                      display: "block",
                                      fontSize: "13px",
                                      color: "#172033",
                                      fontWeight: 600,
                                    }}
                                  >
                                    {site.name}
                                  </span>

                                  <span
                                    style={{
                                      display: "block",
                                      fontSize: "11px",
                                      color: "#9AA4B2",
                                      wordBreak:
                                        "break-all",
                                    }}
                                  >
                                    {site.kind ===
                                    "shopify"
                                      ? "Shopify storefront"
                                      : site.domain}
                                  </span>
                                </span>
                              </label>
                            );
                          })}
                        </div>
                      )}

                      {renderError("siteTargets")}

                      {siteTargets.length > 0 && (
                        <div
                          style={{
                            marginTop: "12px",
                            fontSize: "12px",
                            color: "#6B7280",
                          }}
                        >
                          {siteTargets.length} website
                          {siteTargets.length === 1
                            ? ""
                            : "s"}{" "}
                          selected
                        </div>
                      )}

                    </div>
                  )}

                  <p
                    style={{
                      marginTop: "24px",
                      fontSize: "12px",
                      color: "#9AA4B2",
                    }}
                  >
                    Websites register themselves. Any site
                    where you paste the snippet below shows
                    up in this list once it has loaded the
                    widget, along with your Shopify
                    storefront.
                  </p>

                  {/* =============================================
                      THIS CAMPAIGN'S OWN SNIPPET

                      The snippet under Websites runs whichever
                      campaigns are eligible. This one is pinned
                      with data-campaign, so the website it goes
                      on runs this campaign and nothing else.

                      It is a filter, not an override: the device,
                      frequency and cooldown rules set above still
                      decide whether it actually appears.

                      Only shown once the campaign exists, because
                      the id is what makes the snippet specific.
                  ============================================= */}

                  <div
                    style={{
                      marginTop: "36px",
                      paddingTop: "28px",
                      borderTop: "1px solid #E7EBEF",
                    }}
                  >

                    <h2
                      style={{
                        margin: "0 0 8px",
                        fontSize: "24px",
                        color: "#172033",
                      }}
                    >
                      Install code snippet
                    </h2>

                    <p
                      style={{
                        margin: 0,
                        color: "#6B7280",
                        fontSize: "14px",
                      }}
                    >
                      Use this on a website that should
                      run only this campaign. Paste it
                      right before the closing body tag.
                    </p>

                    {editingCampaignId ? (
                      <>
                        <div
                          style={{
                            display: "flex",
                            justifyContent:
                              "flex-end",
                            marginTop: "16px",
                            marginBottom: "8px",
                          }}
                        >
                          <CopyButton
                            value={buildCampaignSnippet(
                              appUrl,
                              shop,
                              editingCampaignId,
                            )}
                          />
                        </div>

                        <CodeBlock
                          code={buildCampaignSnippet(
                            appUrl,
                            shop,
                            editingCampaignId,
                          )}
                        />

                        <p
                          style={{
                            marginTop: "12px",
                            fontSize: "12px",
                            color: "#9AA4B2",
                          }}
                        >
                          This only narrows that website
                          down to this campaign. The
                          frequency, cooldown and device
                          rules above still decide
                          whether it shows. For a website
                          that should run whatever is
                          eligible, use the general
                          snippet under Websites instead.
                        </p>
                      </>
                    ) : (
                      <div
                        style={{
                          marginTop: "16px",
                          padding: "14px 16px",
                          fontSize: "13px",
                          color: "#6B7280",
                          background: "#F8FAFC",
                          border: "1px solid #E7EBEF",
                          borderRadius: "9px",
                        }}
                      >
                        Save this campaign first. Its
                        snippet needs the campaign's id,
                        which only exists once it has
                        been saved, so it will appear
                        here when you reopen it.
                      </div>
                    )}

                  </div>

                </div>

              )}


              {/* =================================================
                  STEP 4 — reward
              ================================================= */}

              {wizardStep === 4 && (

                <div
                  style={{
                    maxWidth: "1040px",
                    margin: "0 auto",
                  }}
                >

                  <div
                    style={{
                      color: "#7651D8",
                      fontSize: "11px",
                      fontWeight: 700,
                    }}
                  >
                    STEP 4 · REWARD
                  </div>

                  <h2
                    style={{
                      margin: "10px 0 8px",
                      fontSize: "28px",
                      color: "#172033",
                    }}
                  >
                    Add a reward
                  </h2>

                  <p
                    style={{
                      margin: 0,
                      color: "#6B7280",
                      fontSize: "14px",
                    }}
                  >
                    Attach one of the discounts you
                    already created in Shopify, or run
                    the campaign without a reward.
                  </p>

                  {/* NO REWARD */}

                  <button
                    type="button"
                    onClick={() => {
                      setSelectedReward(
                        "No reward",
                      );
                      setSelectedDiscountId("");
                      clearError(
                        "selectedReward",
                      );
                    }}
                    style={{
                      width: "100%",
                      textAlign: "left",
                      marginTop: "26px",
                      padding: "15px 18px",
                      background:
                        selectedReward ===
                        "No reward"
                          ? "#F3F7FB"
                          : "#FFFFFF",
                      border:
                        selectedReward ===
                        "No reward"
                          ? "2px solid #0B3D66"
                          : "1px solid #DCE3EA",
                      borderRadius: "10px",
                      cursor: "pointer",
                    }}
                  >
                    <strong
                      style={{
                        display: "block",
                        fontSize: "14px",
                        color: "#172033",
                      }}
                    >
                      No reward
                    </strong>

                    <span
                      style={{
                        display: "block",
                        marginTop: "4px",
                        fontSize: "12px",
                        color: "#6B7280",
                      }}
                    >
                      Collect signups without
                      offering a discount.
                    </span>
                  </button>

                  {/* SHOPIFY DISCOUNTS */}

                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent:
                        "space-between",
                      gap: "12px",
                      margin: "26px 0 12px",
                      flexWrap: "wrap",
                    }}
                  >
                    <div
                      style={{
                        fontSize: "11px",
                        fontWeight: 700,
                        letterSpacing: "0.06em",
                        color: "#8A94A6",
                      }}
                    >
                      YOUR SHOPIFY DISCOUNTS
                    </div>

                    {discounts.length > 0 && (
                      <input
                        value={discountSearch}
                        onChange={(e) =>
                          setDiscountSearch(
                            e.target.value,
                          )
                        }
                        placeholder="Search discounts..."
                        style={{
                          width: "220px",
                          padding: "9px 12px",
                          border:
                            "1px solid #C9D5E2",
                          borderRadius: "8px",
                          fontSize: "13px",
                          outline: "none",
                        }}
                      />
                    )}
                  </div>

                  {discountsError ? (

                    <div
                      style={{
                        padding: "12px 14px",
                        border:
                          "1px solid #F3DFC4",
                        background: "#FFFBF3",
                        borderRadius: "8px",
                        color: "#8A5A00",
                        fontSize: "12px",
                        lineHeight: 1.5,
                      }}
                    >
                      {discountsError}
                    </div>

                  ) : discounts.length === 0 ? (

                    <div
                      style={{
                        padding: "26px 20px",
                        textAlign: "center",
                        border:
                          "1px dashed #C9D2DD",
                        borderRadius: "10px",
                        color: "#6B7280",
                        fontSize: "13px",
                        lineHeight: 1.6,
                      }}
                    >
                      No discounts found in your
                      store. Create one in Shopify
                      under Discounts, then reopen
                      this step to attach it.
                    </div>

                  ) : searchedDiscounts.length ===
                    0 ? (

                    <div
                      style={{
                        height: "320px",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        textAlign: "center",
                        padding: "20px",
                        boxSizing: "border-box",
                        border:
                          "1px dashed #C9D2DD",
                        borderRadius: "10px",
                        color: "#6B7280",
                        fontSize: "13px",
                      }}
                    >
                      No discounts match "
                      {discountSearch.trim()}".
                    </div>

                  ) : (

                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns:
                          "repeat(2, minmax(0, 1fr))",
                        gap: "12px",
                        height: "320px",
                        alignContent: "start",
                        overflowY: "auto",
                      }}
                    >
                      {searchedDiscounts.map(
                        (discount) => {
                          const selected =
                            selectedDiscountId ===
                            discount.id;

                          const isActive =
                            discount.status.toUpperCase() ===
                            "ACTIVE";

                          return (
                            <button
                              key={discount.id}
                              type="button"
                              onClick={() => {
                                setSelectedDiscountId(
                                  discount.id,
                                );
                                setSelectedReward(
                                  discount.title,
                                );
                                clearError(
                                  "selectedReward",
                                );
                              }}
                              style={{
                                textAlign: "left",
                                padding:
                                  "15px 16px",
                                background:
                                  selected
                                    ? "#F3F7FB"
                                    : "#FFFFFF",
                                border: selected
                                  ? "2px solid #0B3D66"
                                  : "1px solid #DCE3EA",
                                borderRadius:
                                  "10px",
                                cursor: "pointer",
                              }}
                            >
                              <div
                                style={{
                                  display: "flex",
                                  alignItems:
                                    "center",
                                  justifyContent:
                                    "space-between",
                                  gap: "8px",
                                }}
                              >
                                <strong
                                  style={{
                                    fontSize:
                                      "14px",
                                    color:
                                      "#172033",
                                    overflow:
                                      "hidden",
                                    textOverflow:
                                      "ellipsis",
                                    whiteSpace:
                                      "nowrap",
                                  }}
                                >
                                  {discount.title}
                                </strong>

                                <span
                                  style={{
                                    flexShrink: 0,
                                    fontSize:
                                      "9px",
                                    fontWeight: 700,
                                    padding:
                                      "3px 7px",
                                    borderRadius:
                                      "5px",
                                    background:
                                      isActive
                                        ? "#E7F7EF"
                                        : "#F0F2F5",
                                    color: isActive
                                      ? "#157A50"
                                      : "#657080",
                                  }}
                                >
                                  {discount.status.toUpperCase()}
                                </span>
                              </div>

                              <div
                                style={{
                                  marginTop: "8px",
                                  display: "flex",
                                  alignItems:
                                    "center",
                                  gap: "6px",
                                  flexWrap: "wrap",
                                }}
                              >
                                <span
                                  style={{
                                    fontSize:
                                      "11px",
                                    fontWeight: 700,
                                    padding:
                                      "3px 7px",
                                    borderRadius:
                                      "5px",
                                    background:
                                      "#F0EAFE",
                                    color:
                                      "#6546D7",
                                  }}
                                >
                                  {
                                    discount.summary
                                  }
                                </span>

                                <span
                                  style={{
                                    fontSize:
                                      "11px",
                                    color:
                                      "#8A95A5",
                                  }}
                                >
                                  {discount.kind}
                                  {discount.code
                                    ? ` · ${discount.code}`
                                    : ""}
                                </span>
                              </div>
                            </button>
                          );
                        },
                      )}
                    </div>

                  )}

                  {renderError("selectedReward")}

                </div>

              )}


              {/* =================================================
                  STEP 5 — review
              ================================================= */}

              {wizardStep === 5 && (

                <div
                  style={{
                    maxWidth: "1040px",
                    margin: "0 auto",
                  }}
                >

                  <div
                    style={{
                      color: "#7651D8",
                      fontSize: "11px",
                      fontWeight: 700,
                    }}
                  >
                    STEP 5 · REVIEW
                  </div>

                  <h2
                    style={{
                      margin: "10px 0 8px",
                      fontSize: "28px",
                      color: "#172033",
                    }}
                  >
                    Review your campaign
                  </h2>

                  <p
                    style={{
                      margin: 0,
                      color: "#6B7280",
                      fontSize: "14px",
                    }}
                  >
                    Everything looks good? Publish your
                    campaign when you're ready.
                  </p>

                  <div
                    style={{
                      marginTop: "30px",
                      border: "1px solid #DCE3EA",
                      borderRadius: "12px",
                      overflow: "hidden",
                    }}
                  >

                    <div
                      style={{
                        padding: "17px 20px",
                        background: "#F8FAFC",
                        borderBottom:
                          "1px solid #E7EBEF",
                      }}
                    >
                      <strong
                        style={{
                          color: "#0B3D66",
                          fontSize: "15px",
                        }}
                      >
                        Campaign summary
                      </strong>
                    </div>

                    <div
                      style={{
                        padding: "20px",
                        display: "flex",
                        flexDirection: "column",
                        gap: "16px",
                      }}
                    >

                      <div>
                        <span
                          style={{
                            display: "block",
                            fontSize: "11px",
                            color: "#9AA4B2",
                            marginBottom: "4px",
                          }}
                        >
                          CAMPAIGN
                        </span>

                        <strong
                          style={{
                            color: "#172033",
                            fontSize: "14px",
                          }}
                        >
                          {campaignName ||
                            "Untitled campaign"}
                        </strong>
                      </div>

                      <div>
                        <span
                          style={{
                            display: "block",
                            fontSize: "11px",
                            color: "#9AA4B2",
                            marginBottom: "4px",
                          }}
                        >
                          TYPE
                        </span>

                        <strong
                          style={{
                            color: "#172033",
                            fontSize: "14px",
                          }}
                        >
                          {campaignTypeName}
                        </strong>
                      </div>

                      <div>
                        <span
                          style={{
                            display: "block",
                            fontSize: "11px",
                            color: "#9AA4B2",
                            marginBottom: "4px",
                          }}
                        >
                          AUDIENCE
                        </span>

                        <strong
                          style={{
                            color: "#172033",
                            fontSize: "14px",
                          }}
                        >
                          {selectedAudience ||
                            "Not selected"}
                        </strong>
                      </div>

                      <div>
                        <span
                          style={{
                            display: "block",
                            fontSize: "11px",
                            color: "#9AA4B2",
                            marginBottom: "4px",
                          }}
                        >
                          POPUP
                        </span>

                        <strong
                          style={{
                            color: "#172033",
                            fontSize: "14px",
                          }}
                        >
                          {popups.find(
                            (popup) =>
                              popup.id ===
                              selectedPopup,
                          )?.name ||
                            "Not selected"}
                        </strong>
                      </div>

                      <div>
                        <span
                          style={{
                            display: "block",
                            fontSize: "11px",
                            color: "#9AA4B2",
                            marginBottom: "4px",
                          }}
                        >
                          TRIGGER
                        </span>

                        <strong
                          style={{
                            color: "#172033",
                            fontSize: "14px",
                          }}
                        >
                          {selectedTrigger ===
                          "After delay"
                            ? `After ${triggerDelaySeconds}s`
                            : selectedTrigger ===
                                "Scroll depth"
                              ? `Scroll ${triggerScrollPercent}%`
                              : selectedTrigger ||
                                "Not selected"}
                        </strong>
                      </div>

                      <div>
                        <span
                          style={{
                            display: "block",
                            fontSize: "11px",
                            color: "#9AA4B2",
                            marginBottom: "4px",
                          }}
                        >
                          REWARD
                        </span>

                        <strong
                          style={{
                            color: "#172033",
                            fontSize: "14px",
                          }}
                        >
                          {selectedReward ||
                            "Not selected"}
                        </strong>

                        {(() => {
                          const chosen =
                            discounts.find(
                              (discount) =>
                                discount.id ===
                                selectedDiscountId,
                            );

                          if (!chosen) {
                            return null;
                          }

                          return (
                            <span
                              style={{
                                display: "block",
                                marginTop: "3px",
                                fontSize: "11px",
                                color: "#8A95A5",
                              }}
                            >
                              {chosen.summary}
                              {chosen.code
                                ? ` · ${chosen.code}`
                                : ""}
                            </span>
                          );
                        })()}
                      </div>

                      <div>
                        <span
                          style={{
                            display: "block",
                            fontSize: "11px",
                            color: "#9AA4B2",
                            marginBottom: "4px",
                          }}
                        >
                          PAGES
                        </span>

                        <strong
                          style={{
                            color: "#172033",
                            fontSize: "14px",
                          }}
                        >
                          {pageTargetMode === "all"
                            ? "All pages"
                            : `${pageTargets.length} selected page${
                                pageTargets.length ===
                                1
                                  ? ""
                                  : "s"
                              }`}
                        </strong>
                      </div>

                      <div>
                        <span
                          style={{
                            display: "block",
                            fontSize: "11px",
                            color: "#9AA4B2",
                            marginBottom: "4px",
                          }}
                        >
                          WEBSITES
                        </span>

                        <strong
                          style={{
                            color: "#172033",
                            fontSize: "14px",
                          }}
                        >
                          {siteTargetMode === "all"
                            ? "All websites"
                            : `${siteTargets.length} selected website${
                                siteTargets.length ===
                                1
                                  ? ""
                                  : "s"
                              }`}
                        </strong>

                        {siteTargetMode ===
                          "selected" &&
                          siteTargets.length > 0 && (
                            <span
                              style={{
                                display: "block",
                                marginTop: "4px",
                                fontSize: "11px",
                                color: "#9AA4B2",
                              }}
                            >
                              {sites
                                .filter((site) =>
                                  siteTargets.includes(
                                    site.id,
                                  ),
                                )
                                .map(
                                  (site) => site.name,
                                )
                                .join(", ")}
                            </span>
                          )}
                      </div>

                      <div>
                        <span
                          style={{
                            display: "block",
                            fontSize: "11px",
                            color: "#9AA4B2",
                            marginBottom: "4px",
                          }}
                        >
                          FREQUENCY
                        </span>

                        <strong
                          style={{
                            color: "#172033",
                            fontSize: "14px",
                          }}
                        >
                          {frequencyMode === "once"
                            ? "Once per visitor"
                            : frequencyMode ===
                                "limited"
                              ? `Up to ${frequencyLimit} times per visitor`
                              : "No limit"}
                        </strong>

                        <span
                          style={{
                            display: "block",
                            marginTop: "4px",
                            fontSize: "11px",
                            color: "#9AA4B2",
                          }}
                        >
                          {reshowCollectedDays <= 0
                            ? "Never again after they submit"
                            : `Again ${reshowCollectedDays}d after they submit`}
                          {" · "}
                          {reshowDismissedDays <= 0
                            ? "never again after they close it"
                            : `${reshowDismissedDays}d after they close it`}
                        </span>
                      </div>

                      <div>
                        <span
                          style={{
                            display: "block",
                            fontSize: "11px",
                            color: "#9AA4B2",
                            marginBottom: "4px",
                          }}
                        >
                          DEVICES
                        </span>

                        <strong
                          style={{
                            color: "#172033",
                            fontSize: "14px",
                          }}
                        >
                          {devices.length === 3
                            ? "All devices"
                            : devices
                                .map(
                                  (device) =>
                                    device
                                      .charAt(0)
                                      .toUpperCase() +
                                    device.slice(1),
                                )
                                .join(", ") ||
                              "None selected"}
                        </strong>
                      </div>

                    </div>

                  </div>

                </div>

              )}

            </div>


            {/* =================================================
                WIZARD FOOTER
            ================================================= */}

            <div
              style={{
                borderTop: "1px solid #E7EBEF",
              }}
            >

              {actionData &&
                !actionData.ok &&
                actionData.error && (
                  <div
                    style={{
                      margin: "16px 28px 0",
                      padding: "12px 14px",
                      border: "1px solid #F3C7C4",
                      background: "#FFF5F4",
                      borderRadius: "8px",
                      color: "#C62828",
                      fontSize: "13px",
                      fontWeight: 600,
                    }}
                  >
                    {actionData.error}
                  </div>
                )}

              <div
                style={{
                  padding: "18px 28px",
                  display: "flex",
                  justifyContent:
                    "space-between",
                  alignItems: "center",
                  gap: "14px",
                  flexWrap: "wrap",
                }}
              >

                <button
                  type="button"
                  onClick={handleBack}
                  disabled={saving}
                  style={{
                    border: "1px solid #C9D5E2",
                    background: "#FFFFFF",
                    color: "#0B3D66",
                    borderRadius: "8px",
                    padding: "10px 20px",
                    fontSize: "13px",
                    fontWeight: 600,
                    cursor: saving
                      ? "not-allowed"
                      : "pointer",
                    opacity: saving ? 0.6 : 1,
                  }}
                >
                  Back
                </button>

                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "14px",
                  }}
                >

                  <span
                    style={{
                      color: "#9AA4B2",
                      fontSize: "12px",
                    }}
                  >
                    Step {wizardStep} of{" "}
                    {totalSteps}
                  </span>

                  <button
                    type="button"
                    onClick={handleSaveDraft}
                    disabled={saving}
                    style={{
                      border:
                        "1px solid #C9D5E2",
                      background: "#FFFFFF",
                      color: "#0B3D66",
                      borderRadius: "8px",
                      padding: "10px 18px",
                      fontSize: "13px",
                      fontWeight: 600,
                      cursor: saving
                        ? "not-allowed"
                        : "pointer",
                      opacity: saving ? 0.6 : 1,
                    }}
                  >
                    Save as draft
                  </button>

                  <button
                    type="button"
                    onClick={handleNext}
                    disabled={saving}
                    style={{
                      border: "none",
                      background: "#0B3D66",
                      color: "#FFFFFF",
                      borderRadius: "8px",
                      padding: "10px 23px",
                      fontSize: "13px",
                      fontWeight: 600,
                      cursor: saving
                        ? "not-allowed"
                        : "pointer",
                      opacity: saving ? 0.7 : 1,
                    }}
                  >
                    {saving
                      ? "Saving..."
                      : wizardStep === totalSteps
                        ? editingCampaignId
                          ? "Update campaign"
                          : "Publish campaign"
                        : "Next"}
                  </button>

                </div>

              </div>

            </div>

          </div>

        </div>

      )}


      {/* =====================================================
          DELETE CONFIRM MODAL
      ===================================================== */}

      {campaignPendingDelete && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={cancelDeleteCampaign}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(23, 32, 51, 0.45)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 10000,
          }}
        >
          <div
            onClick={(event) =>
              event.stopPropagation()
            }
            style={{
              width: "100%",
              maxWidth: "380px",
              margin: "16px",
              background: "#FFFFFF",
              borderRadius: "12px",
              padding: "22px",
              boxShadow:
                "0 12px 32px rgba(23, 32, 51, 0.24)",
            }}
          >
            <h3
              style={{
                margin: "0 0 8px",
                fontSize: "16px",
                color: "#172033",
              }}
            >
              Delete campaign?
            </h3>

            <p
              style={{
                margin: "0 0 20px",
                fontSize: "13px",
                color: "#6B7280",
                lineHeight: 1.5,
              }}
            >
              Delete "
              {campaignPendingDelete.name}"? This
              action cannot be undone.
            </p>

            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                gap: "10px",
              }}
            >
              <button
                type="button"
                onClick={cancelDeleteCampaign}
                style={{
                  border: "1px solid #D5DCE5",
                  background: "#FFFFFF",
                  color: "#374151",
                  borderRadius: "7px",
                  padding: "9px 16px",
                  fontSize: "12px",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                No
              </button>

              <button
                type="button"
                onClick={confirmDeleteCampaign}
                style={{
                  border: "none",
                  background: "#C62828",
                  color: "#FFFFFF",
                  borderRadius: "7px",
                  padding: "9px 16px",
                  fontSize: "12px",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Yes, delete
              </button>
            </div>
          </div>
        </div>
      )}

    </s-page>
  );
}