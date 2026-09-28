import { beforeEach, describe, expect, it, vi } from "vitest";

/* ------------------------------------------------------------
   In-memory stand-in for db.emailDomain, enough for the where
   shapes the service uses.
------------------------------------------------------------ */

type Row = {
  id: string;
  shop: string;
  resendId: string;
  name: string;
  region: string;
  status: string;
  tls: string;
  createdBy: string;
  createdAt: Date;
  syncedAt: Date;
};

const store: { rows: Row[]; seq: number } = vi.hoisted(() => ({ rows: [], seq: 0 }));

function matches(row: Row, where: Record<string, unknown> = {}) {
  return Object.entries(where).every(([key, cond]) => {
    const value = row[key as keyof Row];
    if (cond && typeof cond === "object" && "in" in (cond as object)) {
      return ((cond as { in: unknown[] }).in).includes(value);
    }
    return value === cond;
  });
}

vi.mock("../db.server", () => {
  const emailDomain = {
    findMany: vi.fn(async ({ where }: { where?: Record<string, unknown> } = {}) =>
      store.rows.filter((r) => matches(r, where)).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()),
    ),
    findFirst: vi.fn(async ({ where }: { where: Record<string, unknown> }) => store.rows.find((r) => matches(r, where)) ?? null),
    findUnique: vi.fn(async ({ where }: { where: Record<string, unknown> }) => store.rows.find((r) => matches(r, where)) ?? null),
    count: vi.fn(async ({ where }: { where: Record<string, unknown> }) => store.rows.filter((r) => matches(r, where)).length),
    create: vi.fn(async ({ data }: { data: Partial<Row> }) => {
      if (store.rows.some((r) => r.resendId === data.resendId)) throw new Error("Unique constraint failed on resendId");
      const row = { id: `row${++store.seq}`, tls: "opportunistic", createdBy: "", syncedAt: new Date(), ...data } as Row;
      store.rows.push(row);
      return row;
    }),
    update: vi.fn(async ({ where, data }: { where: Record<string, unknown>; data: Partial<Row> }) => {
      const row = store.rows.find((r) => matches(r, where));
      if (!row) throw new Error("Record not found");
      Object.assign(row, data);
      return row;
    }),
    updateMany: vi.fn(async ({ where, data }: { where: Record<string, unknown>; data: Partial<Row> }) => {
      const hit = store.rows.filter((r) => matches(r, where));
      hit.forEach((r) => Object.assign(r, data));
      return { count: hit.length };
    }),
    deleteMany: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
      const before = store.rows.length;
      store.rows = store.rows.filter((r) => !matches(r, where));
      return { count: before - store.rows.length };
    }),
  };
  return { default: { emailDomain } };
});

import {
  addShopDomain,
  deleteShopDomain,
  deleteShopDomains,
  getShopDomain,
  importShopDomains,
  listShopDomains,
  planSync,
  unclaimed,
  updateShopDomain,
  verifyShopDomain,
} from "./email-domains.server";

/* ------------------------------------------------------------
   Fake Resend account behind fetch.
------------------------------------------------------------ */

type RemoteDomain = { id: string; name: string; status: string; region: string; created_at: string };
let remote: RemoteDomain[];
let failWith: { status: number; body: unknown } | null;
let calls: { method: string; path: string; body?: unknown }[];

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status });
}

beforeEach(() => {
  store.rows = [];
  store.seq = 0;
  remote = [];
  failWith = null;
  calls = [];
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.stubEnv("RESEND_DOMAINS_API_KEY", "re_test");
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit) => {
      const u = new URL(url);
      const method = init.method || "GET";
      const body = init.body ? JSON.parse(String(init.body)) : undefined;
      calls.push({ method, path: u.pathname, body });
      if (failWith) return json(failWith.status, failWith.body);

      const [, , id, sub] = u.pathname.split("/");
      if (method === "GET" && !id) return json(200, { object: "list", has_more: false, data: remote });
      if (method === "POST" && !id) {
        const d = { id: `rs_${remote.length + 1}`, name: body.name, region: body.region, status: "not_started", created_at: "2026-09-28T10:00:00.000Z" };
        remote.push(d);
        return json(201, { ...d, records: [] });
      }
      const found = remote.find((d) => d.id === decodeURIComponent(id));
      if (!found) return json(404, { name: "not_found", message: "Domain not found", statusCode: 404 });
      if (method === "GET") return json(200, { object: "domain", ...found, records: [{ record: "DKIM", type: "TXT", name: "resend._domainkey", value: "p=abc", ttl: "Auto", status: "not_started" }] });
      if (method === "POST" && sub === "verify") {
        found.status = "pending";
        return json(200, { object: "domain", id: found.id });
      }
      if (method === "PATCH") return json(200, { object: "domain", id: found.id });
      if (method === "DELETE") {
        remote = remote.filter((d) => d !== found);
        return json(200, { object: "domain", id: found.id, deleted: true });
      }
      return json(500, {});
    }),
  );
});

const d = (id: string, name: string, status = "verified", region = "us-east-1"): RemoteDomain => ({
  id,
  name,
  status,
  region,
  created_at: "2026-09-01T00:00:00.000Z",
});

function seed(shop: string, r: RemoteDomain) {
  store.rows.push({
    id: `row${++store.seq}`,
    shop,
    resendId: r.id,
    name: r.name,
    region: r.region,
    status: "not_started",
    tls: "opportunistic",
    createdBy: "",
    createdAt: new Date(r.created_at),
    syncedAt: new Date(0),
  });
}

describe("planSync", () => {
  it("updates changed rows and removes ones gone from Resend", () => {
    const local = [
      { resendId: "a", name: "a.com", region: "us-east-1", status: "pending", tls: "opportunistic", createdAt: new Date("2026-09-01T00:00:00Z") },
      { resendId: "b", name: "b.com", region: "us-east-1", status: "verified", tls: "opportunistic", createdAt: new Date("2026-09-01T00:00:00Z") },
      { resendId: "c", name: "c.com", region: "us-east-1", status: "verified", tls: "opportunistic", createdAt: new Date("2026-09-01T00:00:00Z") },
    ];
    const plan = planSync(local, [d("a", "a.com", "verified"), d("b", "b.com", "verified")]);
    expect(plan.updates.map((u) => [u.resendId, u.status])).toEqual([["a", "verified"]]);
    expect(plan.removed).toEqual(["c"]);
  });

  it("lists unclaimed domains", () => {
    expect(unclaimed([d("a", "a.com"), d("b", "b.com")], ["a"]).map((x) => x.id)).toEqual(["b"]);
  });
});

describe("listShopDomains", () => {
  it("syncs this shop's rows and hides other shops' domains", async () => {
    remote = [d("a", "a.com", "verified"), d("b", "b.com", "pending"), d("free", "free.com")];
    seed("one.myshopify.com", d("a", "a.com"));
    seed("one.myshopify.com", d("gone", "gone.com"));
    seed("two.myshopify.com", d("b", "b.com"));

    const result = await listShopDomains("one.myshopify.com");
    expect(result.configured).toBe(true);
    expect(result.syncError).toBeNull();
    expect(result.domains.map((x) => [x.id, x.status])).toEqual([["a", "verified"]]);
    expect(result.importable.map((x) => x.id)).toEqual(["free"]);
    expect(store.rows.find((r) => r.resendId === "gone")).toBeUndefined();
    expect(store.rows.find((r) => r.resendId === "b")?.shop).toBe("two.myshopify.com");
  });

  it("returns the saved list with a friendly error when Resend is down", async () => {
    seed("one.myshopify.com", d("a", "a.com"));
    failWith = { status: 503, body: { name: "service_unavailable", message: "down" } };
    const result = await listShopDomains("one.myshopify.com");
    expect(result.domains).toHaveLength(1);
    expect(result.syncError).toMatch(/Resend had a problem/);
    expect(store.rows).toHaveLength(1);
  });

  it("reports not configured without calling Resend", async () => {
    vi.stubEnv("RESEND_DOMAINS_API_KEY", "");
    vi.stubEnv("RESEND_API_KEY", "");
    const result = await listShopDomains("one.myshopify.com");
    expect(result.configured).toBe(false);
    expect(calls).toHaveLength(0);
  });
});

describe("addShopDomain", () => {
  it("creates in Resend and saves the owner", async () => {
    const result = await addShopDomain("one.myshopify.com", "Jane", { name: "HTTPS://Mail.Shop.com/", region: "eu-west-1" });
    expect(result).toEqual({ ok: true, id: "rs_1" });
    expect(calls[0]).toMatchObject({ method: "POST", path: "/domains", body: { name: "mail.shop.com", region: "eu-west-1" } });
    expect(store.rows[0]).toMatchObject({ shop: "one.myshopify.com", resendId: "rs_1", name: "mail.shop.com", createdBy: "Jane" });
  });

  it("rejects a bad name or region before calling Resend", async () => {
    expect(await addShopDomain("s", "a", { name: "not a domain", region: "us-east-1" })).toMatchObject({ ok: false, field: "name" });
    expect(await addShopDomain("s", "a", { name: "shop.com", region: "mars-1" })).toMatchObject({ ok: false, field: "region" });
    expect(calls).toHaveLength(0);
  });

  it("says when the domain belongs to another Resend team", async () => {
    failWith = { status: 403, body: { name: "validation_error", message: "The shop.com domain has been registered already." } };
    const result = await addShopDomain("s", "a", { name: "shop.com", region: "us-east-1" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/another Resend account/);
  });

  it("suggests Import when the domain is already in our Resend account", async () => {
    remote = [d("x", "shop.com")];
    vi.mocked(fetch).mockImplementationOnce(async () =>
      json(403, { name: "validation_error", message: "The shop.com domain has been registered already." }),
    );
    const result = await addShopDomain("s", "a", { name: "shop.com", region: "us-east-1" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/Import from Resend/);
  });

  it("maps the plan limit", async () => {
    failWith = { status: 403, body: { name: "validation_error", message: "Domain limit reached for your plan" } };
    const result = await addShopDomain("s", "a", { name: "shop.com", region: "us-east-1" });
    if (!result.ok) expect(result.error).toMatch(/domain limit/);
  });
});

describe("one domain", () => {
  it("never touches another shop's domain", async () => {
    remote = [d("a", "a.com")];
    seed("two.myshopify.com", d("a", "a.com"));
    expect(await getShopDomain("one.myshopify.com", "a")).toEqual({ kind: "missing" });
    expect(await verifyShopDomain("one.myshopify.com", "a")).toMatchObject({ ok: false });
    expect(await updateShopDomain("one.myshopify.com", "a", { tls: "enforced" })).toMatchObject({ ok: false });
    expect(await deleteShopDomain("one.myshopify.com", "a")).toMatchObject({ ok: false });
    expect(calls).toHaveLength(0);
    expect(remote).toHaveLength(1);
  });

  it("loads live records and refreshes the cache", async () => {
    remote = [d("a", "a.com", "verified")];
    seed("s", d("a", "a.com"));
    const detail = await getShopDomain("s", "a");
    expect(detail.kind).toBe("ok");
    if (detail.kind === "ok") {
      expect(detail.domain.records[0]).toMatchObject({ type: "TXT", name: "resend._domainkey" });
      expect(detail.row.status).toBe("verified");
    }
  });

  it("drops the row when the domain was deleted in Resend", async () => {
    seed("s", d("a", "a.com"));
    expect(await getShopDomain("s", "a")).toEqual({ kind: "gone", name: "a.com" });
    expect(store.rows).toHaveLength(0);
  });

  it("verifies and stores the new status", async () => {
    remote = [d("a", "a.com", "not_started")];
    seed("s", d("a", "a.com"));
    expect(await verifyShopDomain("s", "a")).toEqual({ ok: true, status: "pending" });
    expect(store.rows[0].status).toBe("pending");
  });

  it("saves configuration and keeps TLS locally", async () => {
    remote = [d("a", "a.com")];
    seed("s", d("a", "a.com"));
    expect(await updateShopDomain("s", "a", { tls: "enforced", open_tracking: true, click_tracking: false, tracking_subdomain: "Links" })).toEqual({ ok: true });
    expect(calls.at(-1)).toMatchObject({ method: "PATCH", body: { tls: "enforced", open_tracking: true, click_tracking: false, tracking_subdomain: "links" } });
    expect(store.rows[0].tls).toBe("enforced");
  });

  it("rejects a bad tracking subdomain", async () => {
    seed("s", d("a", "a.com"));
    expect(await updateShopDomain("s", "a", { tracking_subdomain: "bad sub" })).toMatchObject({ ok: false });
    expect(calls).toHaveLength(0);
  });

  it("deletes in Resend and here, and treats an already-deleted domain as done", async () => {
    remote = [d("a", "a.com")];
    seed("s", d("a", "a.com"));
    seed("s", d("b", "b.com"));
    expect(await deleteShopDomain("s", "a")).toEqual({ ok: true, name: "a.com" });
    expect(await deleteShopDomain("s", "b")).toEqual({ ok: true, name: "b.com" });
    expect(store.rows).toHaveLength(0);
    expect(remote).toHaveLength(0);
  });

  it("bulk deletes and reports failures", async () => {
    remote = [d("a", "a.com"), d("b", "b.com")];
    seed("s", d("a", "a.com"));
    seed("s", d("b", "b.com"));
    const result = await deleteShopDomains("s", ["a", "b", "not-mine", "a"]);
    expect(result).toMatchObject({ deleted: 2, failed: 1 });
    expect(result.errors[0]).toMatch(/not found for this store/);
  });
});

describe("importShopDomains", () => {
  it("imports only unclaimed domains that exist in Resend", async () => {
    remote = [d("a", "a.com"), d("b", "b.com")];
    seed("other", d("b", "b.com"));
    const result = await importShopDomains("s", "Jane", ["a", "b", "nope"]);
    expect(result).toEqual({ ok: true, imported: 1, skipped: 2 });
    expect(store.rows.find((r) => r.resendId === "a")).toMatchObject({ shop: "s", createdBy: "Jane" });
    expect(store.rows.find((r) => r.resendId === "b")?.shop).toBe("other");
  });

  it("needs at least one id", async () => {
    expect(await importShopDomains("s", "a", [])).toMatchObject({ ok: false });
  });
});
