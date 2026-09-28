/* ============================================================
   EMAIL DOMAINS SERVICE (server only)

   What the Settings > Channels > Email screens call. Resend is
   the source of truth for every domain; the EmailDomain table
   only says which shop owns which Resend domain and caches its
   name, region and status.

   Every call that touches one domain first checks that the
   domain belongs to the shop asking, so one store can never see
   or change another store's domain, even by guessing an id.
   ============================================================ */

import db from "../db.server";
import {
  DEFAULT_REGION,
  isDomainRegion,
  normalizeDomainInput,
  type DomainRegion,
  type ResendDomain,
  type ResendDomainSummary,
  type TlsMode,
  type UpdateDomainInput,
} from "./email-domain";
import {
  ResendDomainError,
  createDomain,
  deleteDomain,
  getDomain,
  isResendConfigured,
  listAllDomains,
  updateDomain,
  verifyDomain,
} from "./resend-domains.server";

/* What the screens receive for one domain row. */
export type DomainRow = {
  id: string;
  name: string;
  region: string;
  status: string;
  tls: string;
  createdAt: string;
};

type LocalRow = {
  resendId: string;
  name: string;
  region: string;
  status: string;
  tls: string;
  createdAt: Date;
};

function toRow(row: LocalRow): DomainRow {
  return {
    id: row.resendId,
    name: row.name,
    region: row.region,
    status: row.status,
    tls: row.tls,
    createdAt: row.createdAt.toISOString(),
  };
}

function toDate(value: string | undefined) {
  const d = value ? new Date(value) : new Date();
  return Number.isNaN(d.getTime()) ? new Date() : d;
}

/* A friendly message for anything a service call threw, logged
   once with the real cause. */
export function friendlyError(error: unknown, context: string): string {
  if (error instanceof ResendDomainError) {
    console.error(`RESEND DOMAINS ${context}:`, error.message);
    return error.friendly;
  }
  console.error(`RESEND DOMAINS ${context}:`, error);
  return "Something went wrong. Please try again.";
}

/* ------------------------------------------------------------
   SYNC PLAN (pure, so it can be tested without a database)

   Compares this shop's cached rows with what Resend reports:
   rows whose domain changed are updated, rows whose domain is
   gone from Resend are removed.
------------------------------------------------------------ */

export type SyncPlan = {
  updates: { resendId: string; name: string; region: string; status: string; createdAt: Date }[];
  removed: string[];
};

export function planSync(local: LocalRow[], remote: ResendDomainSummary[]): SyncPlan {
  const byId = new Map(remote.map((d) => [d.id, d]));
  const plan: SyncPlan = { updates: [], removed: [] };

  for (const row of local) {
    const live = byId.get(row.resendId);
    if (!live) {
      plan.removed.push(row.resendId);
      continue;
    }
    const createdAt = toDate(live.created_at);
    if (
      live.name !== row.name ||
      live.region !== row.region ||
      live.status !== row.status ||
      createdAt.getTime() !== row.createdAt.getTime()
    ) {
      plan.updates.push({
        resendId: row.resendId,
        name: live.name,
        region: live.region,
        status: live.status,
        createdAt,
      });
    }
  }
  return plan;
}

/* Resend domains no store has added yet. */
export function unclaimed(remote: ResendDomainSummary[], claimedIds: Iterable<string>) {
  const claimed = new Set(claimedIds);
  return remote.filter((d) => !claimed.has(d.id));
}

async function applyPlan(shop: string, plan: SyncPlan) {
  const now = new Date();
  if (plan.removed.length) {
    await db.emailDomain.deleteMany({ where: { shop, resendId: { in: plan.removed } } });
  }
  for (const u of plan.updates) {
    await db.emailDomain.updateMany({
      where: { shop, resendId: u.resendId },
      data: { name: u.name, region: u.region, status: u.status, createdAt: u.createdAt, syncedAt: now },
    });
  }
}

/* ------------------------------------------------------------
   LIST
------------------------------------------------------------ */

export type DomainListResult = {
  configured: boolean;
  domains: DomainRow[];
  importable: { id: string; name: string; region: string; status: string; createdAt: string }[];
  /* Set when Resend could not be reached; the cached rows are
     still returned so the page is not empty. */
  syncError: string | null;
};

export async function listShopDomains(shop: string): Promise<DomainListResult> {
  const cached = () =>
    db.emailDomain.findMany({ where: { shop }, orderBy: { createdAt: "desc" } });

  if (!isResendConfigured()) {
    return { configured: false, domains: (await cached()).map(toRow), importable: [], syncError: null };
  }

  let remote: ResendDomainSummary[];
  try {
    remote = await listAllDomains();
  } catch (error) {
    return {
      configured: true,
      domains: (await cached()).map(toRow),
      importable: [],
      syncError: friendlyError(error, "LIST"),
    };
  }

  await applyPlan(shop, planSync(await cached(), remote));

  const claimed = await db.emailDomain.findMany({
    where: { resendId: { in: remote.map((d) => d.id) } },
    select: { resendId: true },
  });

  return {
    configured: true,
    domains: (await cached()).map(toRow),
    importable: unclaimed(remote, claimed.map((c) => c.resendId)).map((d) => ({
      id: d.id,
      name: d.name,
      region: d.region,
      status: d.status,
      createdAt: toDate(d.created_at).toISOString(),
    })),
    syncError: null,
  };
}

export async function countShopDomains(shop: string) {
  const [total, verified] = await Promise.all([
    db.emailDomain.count({ where: { shop } }),
    db.emailDomain.count({ where: { shop, status: "verified" } }),
  ]);
  return { total, verified };
}

/* ------------------------------------------------------------
   ONE DOMAIN
------------------------------------------------------------ */

async function owned(shop: string, id: string) {
  if (!id) return null;
  return db.emailDomain.findFirst({ where: { shop, resendId: id } });
}

/* The saved copy, for when Resend cannot be reached. */
export async function getCachedShopDomain(shop: string, id: string): Promise<DomainRow | null> {
  const local = await owned(shop, id);
  return local ? toRow(local) : null;
}

export type DomainDetail =
  | { kind: "ok"; row: DomainRow; domain: ResendDomain }
  | { kind: "missing" }
  | { kind: "gone"; name: string };

/* Loads the live domain from Resend and refreshes the cache.
   "missing" means this shop never had it (a 404 for the page);
   "gone" means it was deleted in Resend, so the row is dropped. */
export async function getShopDomain(shop: string, id: string): Promise<DomainDetail> {
  const local = await owned(shop, id);
  if (!local) return { kind: "missing" };

  let domain: ResendDomain;
  try {
    domain = await getDomain(id);
  } catch (error) {
    if (error instanceof ResendDomainError && error.code === "not_found") {
      await db.emailDomain.deleteMany({ where: { shop, resendId: id } });
      return { kind: "gone", name: local.name };
    }
    throw error;
  }

  const updated = await db.emailDomain.update({
    where: { id: local.id },
    data: {
      name: domain.name,
      region: domain.region,
      status: domain.status,
      createdAt: toDate(domain.created_at),
      syncedAt: new Date(),
    },
  });

  return { kind: "ok", row: toRow(updated), domain: { ...domain, records: domain.records ?? [] } };
}

/* ------------------------------------------------------------
   CREATE / IMPORT
------------------------------------------------------------ */

export async function addShopDomain(
  shop: string,
  actor: string,
  input: { name: string; region: string },
): Promise<{ ok: true; id: string } | { ok: false; error: string; field?: "name" | "region" }> {
  const checked = normalizeDomainInput(input.name);
  if (!checked.ok) return { ok: false, error: checked.error, field: "name" };

  const region: DomainRegion = input.region ? (input.region as DomainRegion) : DEFAULT_REGION;
  if (!isDomainRegion(region)) return { ok: false, error: "Pick one of the listed regions.", field: "region" };

  const mine = await db.emailDomain.findFirst({ where: { shop, name: checked.name } });
  if (mine) return { ok: false, error: "This domain is already added to this store.", field: "name" };

  let created: ResendDomain;
  try {
    created = await createDomain({ name: checked.name, region });
  } catch (error) {
    if (error instanceof ResendDomainError && error.code === "domain_taken") {
      /* Resend says "registered already" both when another team
         owns it and when it sits in our own account. Tell them
         apart so the merchant gets the right next step. */
      const ours = await listAllDomains().catch(() => [] as ResendDomainSummary[]);
      const match = ours.find((d) => d.name === checked.name);
      if (match) {
        const claimedBy = await db.emailDomain.findUnique({ where: { resendId: match.id } });
        return {
          ok: false,
          field: "name",
          error: claimedBy
            ? "This domain is already used by another store in this app."
            : new ResendDomainError("domain_exists").friendly,
        };
      }
    }
    return { ok: false, error: friendlyError(error, "CREATE"), field: "name" };
  }

  await db.emailDomain.create({
    data: {
      shop,
      resendId: created.id,
      name: created.name || checked.name,
      region: created.region || region,
      status: created.status || "not_started",
      createdBy: actor,
      createdAt: toDate(created.created_at),
    },
  });

  return { ok: true, id: created.id };
}

export async function importShopDomains(
  shop: string,
  actor: string,
  ids: string[],
): Promise<{ ok: true; imported: number; skipped: number } | { ok: false; error: string }> {
  const wanted = new Set(ids.filter(Boolean));
  if (wanted.size === 0) return { ok: false, error: "Pick at least one domain to import." };

  let remote: ResendDomainSummary[];
  try {
    remote = await listAllDomains();
  } catch (error) {
    return { ok: false, error: friendlyError(error, "IMPORT") };
  }

  let imported = 0;
  for (const d of remote) {
    if (!wanted.has(d.id)) continue;
    try {
      await db.emailDomain.create({
        data: {
          shop,
          resendId: d.id,
          name: d.name,
          region: d.region,
          status: d.status,
          createdBy: actor,
          createdAt: toDate(d.created_at),
        },
      });
      imported++;
    } catch {
      /* Unique resendId: another store took it first. */
    }
  }

  return { ok: true, imported, skipped: wanted.size - imported };
}

/* ------------------------------------------------------------
   VERIFY / UPDATE / DELETE
------------------------------------------------------------ */

const NOT_YOURS = "This domain was not found for this store.";

export async function verifyShopDomain(
  shop: string,
  id: string,
): Promise<{ ok: true; status: string } | { ok: false; error: string }> {
  const local = await owned(shop, id);
  if (!local) return { ok: false, error: NOT_YOURS };

  try {
    await verifyDomain(id);
  } catch (error) {
    return { ok: false, error: friendlyError(error, "VERIFY") };
  }

  /* Resend moves the domain to pending right away; read it back
     so the list and the page show the new status. */
  let status = "pending";
  try {
    const live = await getDomain(id);
    status = live.status || status;
  } catch {
    /* keep "pending" */
  }
  await db.emailDomain.update({ where: { id: local.id }, data: { status, syncedAt: new Date() } });
  return { ok: true, status };
}

export async function updateShopDomain(
  shop: string,
  id: string,
  input: UpdateDomainInput,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const local = await owned(shop, id);
  if (!local) return { ok: false, error: NOT_YOURS };

  const body: UpdateDomainInput = {};
  if (input.tls === "opportunistic" || input.tls === "enforced") body.tls = input.tls;
  if (typeof input.open_tracking === "boolean") body.open_tracking = input.open_tracking;
  if (typeof input.click_tracking === "boolean") body.click_tracking = input.click_tracking;
  if (typeof input.tracking_subdomain === "string") {
    const sub = input.tracking_subdomain.trim().toLowerCase();
    if (sub && !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(sub)) {
      return { ok: false, error: "The tracking subdomain can use letters, numbers and dashes only, like links." };
    }
    if (sub) body.tracking_subdomain = sub;
  }

  try {
    await updateDomain(id, body);
  } catch (error) {
    if (error instanceof ResendDomainError && error.code === "invalid_domain") {
      console.error("RESEND DOMAINS UPDATE:", error.message);
      return { ok: false, error: "Resend did not accept these settings. Check the values and try again." };
    }
    return { ok: false, error: friendlyError(error, "UPDATE") };
  }

  if (body.tls) {
    await db.emailDomain.update({ where: { id: local.id }, data: { tls: body.tls as TlsMode } });
  }
  return { ok: true };
}

export async function deleteShopDomain(
  shop: string,
  id: string,
): Promise<{ ok: true; name: string } | { ok: false; error: string }> {
  const local = await owned(shop, id);
  if (!local) return { ok: false, error: NOT_YOURS };

  try {
    await deleteDomain(id);
  } catch (error) {
    /* Already gone in Resend: just forget it here too. */
    if (!(error instanceof ResendDomainError && error.code === "not_found")) {
      return { ok: false, error: friendlyError(error, "DELETE") };
    }
  }

  await db.emailDomain.deleteMany({ where: { shop, resendId: id } });
  return { ok: true, name: local.name };
}

export async function deleteShopDomains(shop: string, ids: string[]) {
  const unique = [...new Set(ids.filter(Boolean))].slice(0, 100);
  let deleted = 0;
  const errors: string[] = [];
  for (const id of unique) {
    const result = await deleteShopDomain(shop, id);
    if (result.ok) deleted++;
    else if (!errors.includes(result.error)) errors.push(result.error);
  }
  return { deleted, failed: unique.length - deleted, errors };
}
