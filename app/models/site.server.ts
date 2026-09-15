import db from "../db.server";

/* ============================================================
   SITES

   A "site" is one website a merchant runs campaigns on. Until
   this existed, every website carrying the embed snippet got
   every live campaign, because the only thing the widget sent
   was the shop identifier. Sites give campaigns somewhere to
   point at, so "this campaign runs on the blog, that one runs
   on the landing page" becomes expressible.

   The Shopify storefront is a site too (kind = "shopify"). It
   reaches us through the App Proxy rather than the public
   widget endpoint, but for targeting purposes it is just
   another row, so the admin can treat every surface the same
   way.
   ============================================================ */

export type SiteRecord = {
  id: string;
  name: string;
  domain: string;
  kind: string;
  autoAdded: boolean;
  lastSeenAt: Date | null;
  createdAt: Date;
};

/* ------------------------------------------------------------
   DOMAIN NORMALISATION

   The browser reports "blog.example.com". A merchant types
   "https://www.Example.com/pricing?x=1". Both need to land on
   the same stored value or targeting silently misses.

   Rules: lowercase, drop scheme, drop credentials, drop path,
   query and hash, drop port, drop a leading "www.", drop a
   trailing dot.
   ------------------------------------------------------------ */

export function normalizeDomain(
  input: string | null | undefined,
): string {
  if (!input) {
    return "";
  }

  let value = String(input).trim().toLowerCase();

  if (!value) {
    return "";
  }

  value = value.replace(/^[a-z][a-z0-9+.-]*:\/\//, "");
  value = value.replace(/^[^/@]*@/, "");
  value = value.split("/")[0];
  value = value.split("?")[0];
  value = value.split("#")[0];
  value = value.replace(/:\d+$/, "");
  value = value.replace(/\.$/, "");
  value = value.replace(/^www\./, "");

  return value;
}

/* ------------------------------------------------------------
   Is this worth storing?

   Auto-registration runs on whatever a browser reports, so it
   has to reject the noise: empty values, bare hostnames with
   no dot, raw IP addresses, and anything absurdly long. Local
   development hosts are allowed through deliberately, since
   testing a snippet on localhost is a normal thing to do, but
   they are not auto-added (see touchSite).
   ------------------------------------------------------------ */

const LOCAL_HOSTS = new Set([
  "localhost",
  "127.0.0.1",
  "[::1]",
  "0.0.0.0",
]);

export function isLocalHost(domain: string) {
  return (
    LOCAL_HOSTS.has(domain) ||
    domain.endsWith(".local") ||
    domain.endsWith(".localhost")
  );
}

export function isStorableDomain(domain: string) {
  if (!domain || domain.length > 253) {
    return false;
  }

  if (isLocalHost(domain)) {
    return true;
  }

  if (!domain.includes(".")) {
    return false;
  }

  // Raw IPv4, which is never a real customer site.
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(domain)) {
    return false;
  }

  return /^[a-z0-9.-]+$/.test(domain);
}

/* ------------------------------------------------------------
   A shop can only ever accumulate so many auto-detected sites
   before the list stops being useful. Manual entries are never
   capped.
   ------------------------------------------------------------ */

const AUTO_ADD_LIMIT = 50;

/* ------------------------------------------------------------
   READS
   ------------------------------------------------------------ */

export async function listSites(
  shop: string,
): Promise<SiteRecord[]> {
  const sites = await db.site.findMany({
    where: { shop },
    orderBy: [
      { kind: "asc" },
      { createdAt: "asc" },
    ],
  });

  return sites.map((site) => ({
    id: site.id,
    name: site.name,
    domain: site.domain,
    kind: site.kind,
    autoAdded: site.autoAdded,
    lastSeenAt: site.lastSeenAt,
    createdAt: site.createdAt,
  }));
}

export async function findSiteByDomain(
  shop: string,
  domain: string,
) {
  const normalized = normalizeDomain(domain);

  if (!normalized) {
    return null;
  }

  return db.site.findUnique({
    where: {
      shop_domain: { shop, domain: normalized },
    },
  });
}

/* ------------------------------------------------------------
   The storefront row. Created on demand so existing shops get
   one the first time they open the Websites screen, without
   needing a data migration.
   ------------------------------------------------------------ */

export async function ensureShopifySite(
  shop: string,
) {
  const domain = normalizeDomain(shop);

  if (!domain) {
    return null;
  }

  const existing = await db.site.findUnique({
    where: {
      shop_domain: { shop, domain },
    },
  });

  if (existing) {
    return existing;
  }

  return db.site.create({
    data: {
      shop,
      name: "Shopify storefront",
      domain,
      kind: "shopify",
      autoAdded: false,
    },
  });
}

/* ------------------------------------------------------------
   WRITES FROM THE ADMIN
   ------------------------------------------------------------ */

export async function createSite(
  shop: string,
  input: { name?: string; domain?: string },
) {
  const domain = normalizeDomain(input.domain);

  if (!isStorableDomain(domain)) {
    return {
      ok: false as const,
      error:
        "Enter a valid website address, for example example.com.",
    };
  }

  const existing = await db.site.findUnique({
    where: {
      shop_domain: { shop, domain },
    },
  });

  if (existing) {
    return {
      ok: false as const,
      error:
        "That website is already in the list.",
    };
  }

  const site = await db.site.create({
    data: {
      shop,
      name:
        (input.name || "").trim() || domain,
      domain,
      kind: "external",
      autoAdded: false,
    },
  });

  return { ok: true as const, site };
}

export async function updateSite(
  shop: string,
  id: string,
  input: { name?: string; domain?: string },
) {
  const current = await db.site.findFirst({
    where: { id, shop },
  });

  if (!current) {
    return {
      ok: false as const,
      error: "Website not found.",
    };
  }

  const domain = input.domain
    ? normalizeDomain(input.domain)
    : current.domain;

  if (!isStorableDomain(domain)) {
    return {
      ok: false as const,
      error:
        "Enter a valid website address, for example example.com.",
    };
  }

  if (domain !== current.domain) {
    const clash = await db.site.findUnique({
      where: {
        shop_domain: { shop, domain },
      },
    });

    if (clash) {
      return {
        ok: false as const,
        error:
          "Another website in the list already uses that address.",
      };
    }
  }

  const site = await db.site.update({
    where: { id: current.id },
    data: {
      name:
        (input.name || "").trim() ||
        current.name,
      domain,
      // Editing a detected site makes it a real, owned entry.
      autoAdded: false,
    },
  });

  return { ok: true as const, site };
}

/* ------------------------------------------------------------
   Deleting a site also clears it out of every campaign that
   targeted it, so a campaign can never end up pointing at an
   id that no longer exists.
   ------------------------------------------------------------ */

export async function deleteSite(
  shop: string,
  id: string,
) {
  const site = await db.site.findFirst({
    where: { id, shop },
  });

  if (!site) {
    return {
      ok: false as const,
      error: "Website not found.",
    };
  }

  if (site.kind === "shopify") {
    return {
      ok: false as const,
      error:
        "The Shopify storefront cannot be removed.",
    };
  }

  const campaigns = await db.campaign.findMany({
    where: { shop, siteTargetMode: "selected" },
    select: { id: true, siteTargets: true },
  });

  for (const campaign of campaigns) {
    const targets = Array.isArray(
      campaign.siteTargets,
    )
      ? (campaign.siteTargets as string[])
      : [];

    if (!targets.includes(site.id)) {
      continue;
    }

    await db.campaign.update({
      where: { id: campaign.id },
      data: {
        siteTargets: targets.filter(
          (target) => target !== site.id,
        ),
      },
    });
  }

  await db.site.delete({
    where: { id: site.id },
  });

  return { ok: true as const };
}

/* ------------------------------------------------------------
   CALLED FROM THE PUBLIC WIDGET ENDPOINT

   Resolves the hostname a browser reported into a site row,
   creating one if this is a website we have not seen before so
   the merchant can see where their snippet ended up. Returns
   null when the host is unusable or the auto-add cap is hit;
   callers treat null as "only all-website campaigns apply".

   Never throws: a failure here must not stop campaigns from
   being served.
   ------------------------------------------------------------ */

export async function touchSite(
  shop: string,
  host: string | null | undefined,
) {
  const domain = normalizeDomain(host);

  if (!isStorableDomain(domain)) {
    return null;
  }

  try {
    const existing = await db.site.findUnique({
      where: {
        shop_domain: { shop, domain },
      },
    });

    if (existing) {
      await db.site.update({
        where: { id: existing.id },
        data: { lastSeenAt: new Date() },
      });

      return existing;
    }

    // Local testing should not litter the merchant's list.
    if (isLocalHost(domain)) {
      return null;
    }

    const autoCount = await db.site.count({
      where: { shop, autoAdded: true },
    });

    if (autoCount >= AUTO_ADD_LIMIT) {
      return null;
    }

    return await db.site.create({
      data: {
        shop,
        name: domain,
        domain,
        kind: "external",
        autoAdded: true,
        lastSeenAt: new Date(),
      },
    });
  } catch (error) {
    console.error("SITE TOUCH ERROR:", error);
    return null;
  }
}
