/* ============================================================
   RESEND DOMAINS API (server only)

   A small typed client for https://api.resend.com/domains.
   Plain fetch, like the rest of the email code, so there is no
   SDK to keep in step.

   The API key never leaves the server. It is read from
   RESEND_DOMAINS_API_KEY (a Full access key, because managing
   domains needs more than sending), falling back to
   RESEND_API_KEY when only one key is set.

   Every failure becomes a ResendDomainError with a stable
   `code` and a `friendly` message a merchant can act on. The
   raw Resend message is kept in `detail` for the server log.
   ============================================================ */

import type {
  CreateDomainInput,
  ResendDomain,
  ResendDomainList,
  ResendDomainSummary,
  UpdateDomainInput,
} from "./email-domain";

export const RESEND_API_BASE = "https://api.resend.com";
export const RESEND_TIMEOUT_MS = 15_000;

export type DomainErrorCode =
  | "not_configured"
  | "invalid_key"
  | "restricted_key"
  | "invalid_domain"
  | "invalid_region"
  | "domain_taken"
  | "domain_exists"
  | "plan_limit"
  | "rate_limited"
  | "quota_exceeded"
  | "not_found"
  | "busy"
  | "network"
  | "server"
  | "unknown";

export const FRIENDLY: Record<DomainErrorCode, string> = {
  not_configured:
    "Resend is not connected. Add RESEND_DOMAINS_API_KEY (a Full access key) to the app's environment and restart the app.",
  invalid_key:
    "The Resend API key is not valid or is no longer active. Check RESEND_DOMAINS_API_KEY in the app's environment.",
  restricted_key:
    "This Resend API key can only send emails. Create a key with Full access in Resend and set it as RESEND_DOMAINS_API_KEY.",
  invalid_domain:
    "That doesn't look like a valid domain. Use a domain you own, like mail.yourstore.com.",
  invalid_region: "Pick one of the listed regions.",
  domain_taken:
    "This domain is already registered in another Resend account. Remove it there, claim it in the Resend dashboard, or use a subdomain such as mail.yourstore.com.",
  domain_exists:
    "This domain is already in your Resend account. Use Import from Resend to add it here.",
  plan_limit:
    "Your Resend plan has reached its domain limit. Remove a domain you no longer use, or upgrade your Resend plan.",
  rate_limited: "Resend is getting too many requests right now. Wait a few seconds and try again.",
  quota_exceeded: "Your Resend quota is used up for now. Try again later or upgrade your Resend plan.",
  not_found: "This domain no longer exists in Resend.",
  busy: "Resend is still working on the last change to this domain. Try again in a moment.",
  network: "Could not reach Resend. Check your connection and try again.",
  server: "Resend had a problem on its side. Try again in a minute.",
  unknown: "Something went wrong with Resend. Please try again.",
};

export class ResendDomainError extends Error {
  code: DomainErrorCode;
  status: number;
  friendly: string;
  detail: string;

  constructor(code: DomainErrorCode, status = 0, detail = "") {
    super(`${code}${status ? ` (${status})` : ""}${detail ? `: ${detail}` : ""}`);
    this.name = "ResendDomainError";
    this.code = code;
    this.status = status;
    this.friendly = FRIENDLY[code];
    this.detail = detail;
  }
}

export function domainsApiKey() {
  return (process.env.RESEND_DOMAINS_API_KEY || process.env.RESEND_API_KEY || "").trim();
}

export function isResendConfigured() {
  return domainsApiKey() !== "";
}

/* ------------------------------------------------------------
   ERROR MAPPING

   Resend answers errors as { name, message, statusCode }. The
   name alone is not always enough (a taken domain and a plan
   limit are both validation_error / 403), so the message is
   checked too.
------------------------------------------------------------ */

export function mapResendError(status: number, body: unknown): ResendDomainError {
  const obj = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const name = String(obj.name || "");
  const message = String(obj.message || obj.error || "");
  const m = message.toLowerCase();
  const detail = [name, message].filter(Boolean).join(": ").slice(0, 400);

  if (name === "restricted_api_key" && /send/.test(m)) return new ResendDomainError("restricted_key", status, detail);
  if (["missing_api_key", "invalid_api_key", "restricted_api_key", "suspended_api_key"].includes(name)) {
    return new ResendDomainError("invalid_key", status, detail);
  }
  if (name === "invalid_permission") return new ResendDomainError("restricted_key", status, detail);
  if (name === "rate_limit_exceeded") return new ResendDomainError("rate_limited", status, detail);
  if (name === "daily_quota_exceeded" || name === "monthly_quota_exceeded") {
    return new ResendDomainError("quota_exceeded", status, detail);
  }
  if (name === "invalid_region") return new ResendDomainError("invalid_region", status, detail);
  if (name === "resource_locked" || name === "concurrent_idempotent_requests") {
    return new ResendDomainError("busy", status, detail);
  }

  if (/registered already|already registered|another (team|account|user)|owned by|belongs to/.test(m)) {
    return new ResendDomainError("domain_taken", status, detail);
  }
  if (/already exists|already been added|already added/.test(m)) {
    return new ResendDomainError("domain_exists", status, detail);
  }
  if (/(domain|plan).*(limit|maximum)|(limit|maximum).*(domain|plan)|upgrade/.test(m)) {
    return new ResendDomainError("plan_limit", status, detail);
  }
  if (name === "not_found" || status === 404) return new ResendDomainError("not_found", status, detail);
  if (status === 429) return new ResendDomainError("rate_limited", status, detail);
  if (status === 401) return new ResendDomainError("invalid_key", status, detail);
  if (
    ["validation_error", "invalid_parameter", "missing_required_field"].includes(name) ||
    status === 400 ||
    status === 422
  ) {
    return new ResendDomainError("invalid_domain", status, detail);
  }
  if (status >= 500) return new ResendDomainError("server", status, detail);
  return new ResendDomainError("unknown", status, detail);
}

/* ------------------------------------------------------------
   REQUEST
------------------------------------------------------------ */

async function request<T>(method: "GET" | "POST" | "PATCH" | "DELETE", path: string, body?: unknown): Promise<T> {
  const key = domainsApiKey();
  if (!key) throw new ResendDomainError("not_configured");

  let response: Response;
  try {
    response = await fetch(`${RESEND_API_BASE}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${key}`,
        Accept: "application/json",
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(RESEND_TIMEOUT_MS),
    });
  } catch (error) {
    throw new ResendDomainError("network", 0, error instanceof Error ? error.message : String(error));
  }

  const raw = await response.text().catch(() => "");
  let parsed: unknown = {};
  try {
    parsed = raw ? JSON.parse(raw) : {};
  } catch {
    parsed = { message: raw.slice(0, 300) };
  }

  if (!response.ok) throw mapResendError(response.status, parsed);
  return parsed as T;
}

const enc = encodeURIComponent;

/* ------------------------------------------------------------
   ENDPOINTS
------------------------------------------------------------ */

export function createDomain(input: CreateDomainInput) {
  return request<ResendDomain>("POST", "/domains", input);
}

export function listDomainsPage(options: { limit?: number; after?: string } = {}) {
  const params = new URLSearchParams();
  params.set("limit", String(Math.min(100, Math.max(1, options.limit ?? 100))));
  if (options.after) params.set("after", options.after);
  return request<ResendDomainList>("GET", `/domains?${params.toString()}`);
}

/* Every domain in the Resend account, following pagination. The
   page cap keeps a runaway loop from hammering the API. */
export async function listAllDomains(maxPages = 10): Promise<ResendDomainSummary[]> {
  const all: ResendDomainSummary[] = [];
  let after: string | undefined;
  for (let i = 0; i < maxPages; i++) {
    const page = await listDomainsPage({ limit: 100, after });
    const data = Array.isArray(page.data) ? page.data : [];
    all.push(...data);
    if (!page.has_more || data.length === 0) break;
    after = data[data.length - 1].id;
  }
  return all;
}

export function getDomain(id: string) {
  return request<ResendDomain>("GET", `/domains/${enc(id)}`);
}

export function updateDomain(id: string, input: UpdateDomainInput) {
  return request<{ object: "domain"; id: string }>("PATCH", `/domains/${enc(id)}`, input);
}

export function verifyDomain(id: string) {
  return request<{ object: "domain"; id: string }>("POST", `/domains/${enc(id)}/verify`);
}

export function deleteDomain(id: string) {
  return request<{ object: "domain"; id: string; deleted: boolean }>("DELETE", `/domains/${enc(id)}`);
}
