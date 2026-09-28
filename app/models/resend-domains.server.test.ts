import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  FRIENDLY,
  ResendDomainError,
  createDomain,
  deleteDomain,
  domainsApiKey,
  getDomain,
  listAllDomains,
  mapResendError,
  updateDomain,
  verifyDomain,
} from "./resend-domains.server";

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.stubEnv("RESEND_DOMAINS_API_KEY", "re_domains_key");
  vi.stubEnv("RESEND_API_KEY", "re_send_key");
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

function lastCall() {
  const [url, init] = fetchMock.mock.calls[fetchMock.mock.calls.length - 1];
  return { url: String(url), init: init as RequestInit & { headers: Record<string, string> } };
}

describe("API key", () => {
  it("prefers RESEND_DOMAINS_API_KEY", () => {
    expect(domainsApiKey()).toBe("re_domains_key");
  });

  it("falls back to RESEND_API_KEY", () => {
    vi.stubEnv("RESEND_DOMAINS_API_KEY", "");
    expect(domainsApiKey()).toBe("re_send_key");
  });

  it("throws not_configured without calling Resend when no key is set", async () => {
    vi.stubEnv("RESEND_DOMAINS_API_KEY", "");
    vi.stubEnv("RESEND_API_KEY", "");
    await expect(getDomain("d1")).rejects.toMatchObject({ code: "not_configured" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("requests", () => {
  it("creates a domain with a bearer key and JSON body", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(201, { id: "d1", name: "mail.shop.com", status: "not_started", region: "eu-west-1", created_at: "2026-09-28T10:00:00Z", records: [] }),
    );
    const created = await createDomain({ name: "mail.shop.com", region: "eu-west-1" });
    const { url, init } = lastCall();
    expect(url).toBe("https://api.resend.com/domains");
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toBe("Bearer re_domains_key");
    expect(init.headers["Content-Type"]).toBe("application/json");
    expect(JSON.parse(String(init.body))).toEqual({ name: "mail.shop.com", region: "eu-west-1" });
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(created.id).toBe("d1");
  });

  it("gets, verifies, updates and deletes by id (escaped)", async () => {
    fetchMock.mockImplementation(async () => jsonResponse(200, { object: "domain", id: "a/b" }));
    await getDomain("a/b");
    expect(lastCall()).toMatchObject({ url: "https://api.resend.com/domains/a%2Fb", init: { method: "GET" } });
    expect(lastCall().init.body).toBeUndefined();

    await verifyDomain("a/b");
    expect(lastCall()).toMatchObject({ url: "https://api.resend.com/domains/a%2Fb/verify", init: { method: "POST" } });

    await updateDomain("a/b", { tls: "enforced", open_tracking: true });
    expect(lastCall().init.method).toBe("PATCH");
    expect(JSON.parse(String(lastCall().init.body))).toEqual({ tls: "enforced", open_tracking: true });

    await deleteDomain("a/b");
    expect(lastCall().init.method).toBe("DELETE");
  });

  it("follows pagination until has_more is false", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, { object: "list", has_more: true, data: [{ id: "d1" }, { id: "d2" }] }))
      .mockResolvedValueOnce(jsonResponse(200, { object: "list", has_more: false, data: [{ id: "d3" }] }));
    const all = await listAllDomains();
    expect(all.map((d) => d.id)).toEqual(["d1", "d2", "d3"]);
    expect(String(fetchMock.mock.calls[0][0])).toBe("https://api.resend.com/domains?limit=100");
    expect(String(fetchMock.mock.calls[1][0])).toBe("https://api.resend.com/domains?limit=100&after=d2");
  });

  it("stops at the page cap", async () => {
    fetchMock.mockImplementation(async () => jsonResponse(200, { object: "list", has_more: true, data: [{ id: String(Math.random()) }] }));
    await listAllDomains(3);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});

describe("errors", () => {
  it("maps a network failure", async () => {
    fetchMock.mockRejectedValue(new TypeError("fetch failed"));
    await expect(getDomain("d1")).rejects.toMatchObject({ code: "network", friendly: FRIENDLY.network });
  });

  it("maps a timeout", async () => {
    fetchMock.mockRejectedValue(new DOMException("The operation was aborted due to timeout", "TimeoutError"));
    await expect(getDomain("d1")).rejects.toMatchObject({ code: "network" });
  });

  it("maps a non-JSON server error", async () => {
    fetchMock.mockResolvedValue(new Response("<html>Bad gateway</html>", { status: 502 }));
    await expect(getDomain("d1")).rejects.toMatchObject({ code: "server", status: 502 });
  });

  it("maps a rate limit", async () => {
    fetchMock.mockResolvedValue(jsonResponse(429, { name: "rate_limit_exceeded", message: "Too many requests.", statusCode: 429 }));
    const error = await createDomain({ name: "x.com" }).catch((e) => e);
    expect(error).toBeInstanceOf(ResendDomainError);
    expect(error.code).toBe("rate_limited");
    expect(error.friendly).toMatch(/too many requests/i);
  });

  const cases: [string, number, Record<string, unknown>, string][] = [
    ["domain in another team", 403, { name: "validation_error", message: "The example.com domain has been registered already." }, "domain_taken"],
    ["domain already in account", 409, { name: "validation_error", message: "Domain already exists" }, "domain_exists"],
    ["plan limit", 403, { name: "validation_error", message: "You have reached the maximum number of domains for your plan." }, "plan_limit"],
    ["plan limit (upgrade wording)", 403, { name: "validation_error", message: "Upgrade to add more domains" }, "plan_limit"],
    ["invalid domain", 422, { name: "validation_error", message: "The `name` field must be a valid domain." }, "invalid_domain"],
    ["invalid parameter", 422, { name: "invalid_parameter", message: "Invalid" }, "invalid_domain"],
    ["invalid region", 422, { name: "invalid_region", message: "Region must be one of" }, "invalid_region"],
    ["send-only key", 401, { name: "restricted_api_key", message: "This API key is restricted to only send emails." }, "restricted_key"],
    ["inactive key", 403, { name: "restricted_api_key", message: "API key is not active" }, "invalid_key"],
    ["bad key", 400, { name: "invalid_api_key", message: "API key is invalid" }, "invalid_key"],
    ["missing key", 401, { name: "missing_api_key", message: "Missing API key" }, "invalid_key"],
    ["not found", 404, { name: "not_found", message: "Domain not found" }, "not_found"],
    ["locked", 409, { name: "resource_locked", message: "Another request is already updating" }, "busy"],
    ["quota", 429, { name: "daily_quota_exceeded", message: "daily quota" }, "quota_exceeded"],
    ["server", 500, { name: "application_error", message: "An unexpected error occurred." }, "server"],
    ["unknown 403", 403, { name: "something_new", message: "?" }, "unknown"],
  ];

  it.each(cases)("maps %s", (_label, status, body, code) => {
    const error = mapResendError(status, body);
    expect(error.code).toBe(code);
    expect(error.friendly).toBe(FRIENDLY[code as keyof typeof FRIENDLY]);
    expect(error.friendly).not.toMatch(/re_/);
  });

  it("never puts the API key in an error", async () => {
    fetchMock.mockResolvedValue(jsonResponse(401, { name: "invalid_api_key", message: "API key is invalid" }));
    const error = await getDomain("d1").catch((e) => e);
    expect(`${error.message} ${error.friendly} ${error.detail}`).not.toContain("re_domains_key");
  });
});
