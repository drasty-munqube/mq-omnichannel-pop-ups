/* ============================================================
   EMAIL DOMAINS (shared, browser-safe)

   Types, regions and status wording for the sending domains a
   shop manages under Settings > Channels > Email. The Resend
   calls themselves live in resend-domains.server.ts; this file
   holds only what both the server and the screens need, so it
   must never import a .server module.

   Shapes follow the Resend Domains API:
   https://resend.com/docs/api-reference/domains
   ============================================================ */

import type { BadgeTone } from "../design/styles";

/* ------------------------------------------------------------
   REGIONS
------------------------------------------------------------ */

export const DOMAIN_REGIONS = [
  { value: "us-east-1", label: "North Virginia (us-east-1)" },
  { value: "eu-west-1", label: "Ireland (eu-west-1)" },
  { value: "sa-east-1", label: "São Paulo (sa-east-1)" },
  { value: "ap-northeast-1", label: "Tokyo (ap-northeast-1)" },
] as const;

export type DomainRegion = (typeof DOMAIN_REGIONS)[number]["value"];

export const DEFAULT_REGION: DomainRegion = "us-east-1";

export function isDomainRegion(value: unknown): value is DomainRegion {
  return DOMAIN_REGIONS.some((r) => r.value === value);
}

export function regionLabel(value: string) {
  return DOMAIN_REGIONS.find((r) => r.value === value)?.label ?? value;
}

/* ------------------------------------------------------------
   STATUS

   Every status Resend can report for a domain, with its own
   badge tone and a short line telling the merchant what it
   means and what to do next.
------------------------------------------------------------ */

export const DOMAIN_STATUSES = [
  "not_started",
  "pending",
  "verified",
  "partially_verified",
  "partially_failed",
  "failed",
  "temporary_failure",
] as const;

export type DomainStatus = (typeof DOMAIN_STATUSES)[number];

export function isDomainStatus(value: unknown): value is DomainStatus {
  return DOMAIN_STATUSES.includes(value as DomainStatus);
}

export type StatusMeta = {
  label: string;
  tone: BadgeTone;
  /* A dot color so two statuses that share a tone still look
     different in the table. */
  dot: string;
  help: string;
};

export const DOMAIN_STATUS: Record<DomainStatus, StatusMeta> = {
  not_started: {
    label: "Not started",
    tone: "neutral",
    dot: "#9AA3B2",
    help: "The domain is added but its DNS records have not been checked yet. Add the records below at your DNS provider, then press Verify DNS records.",
  },
  pending: {
    label: "Pending",
    tone: "warning",
    dot: "#D69E2E",
    help: "Resend is checking your DNS records. This usually takes a few minutes, and can take up to 72 hours while DNS changes spread.",
  },
  verified: {
    label: "Verified",
    tone: "success",
    dot: "#2F9E6A",
    help: "All records are in place. You can send email from any address on this domain.",
  },
  partially_verified: {
    label: "Partially verified",
    tone: "info",
    dot: "#3B82C4",
    help: "Some records are verified and others are still being checked. Sending works for the parts that are verified.",
  },
  partially_failed: {
    label: "Partially failed",
    tone: "accent",
    dot: "#C2410C",
    help: "Some records could not be found. Check the records below that are not verified against your DNS provider, fix them, then verify again.",
  },
  failed: {
    label: "Failed",
    tone: "danger",
    dot: "#C53030",
    help: "Resend could not find the records within 72 hours. Check that each record below matches exactly, then press Verify DNS records to check again.",
  },
  temporary_failure: {
    label: "Temporary failure",
    tone: "warning",
    dot: "#B7791F",
    help: "This domain was verified, but its records can no longer be found. Resend keeps checking for 72 hours. Make sure the records are still at your DNS provider.",
  },
};

/* Unknown values from a newer API version fall back to a neutral
   badge instead of breaking the page. This is Resend's own status,
   kept for the help text; merchants see displayStatus() below. */
export function resendStatusMeta(status: string): StatusMeta {
  return isDomainStatus(status)
    ? DOMAIN_STATUS[status]
    : { label: status.replace(/_/g, " "), tone: "neutral", dot: "#9AA3B2", help: "" };
}

/* ------------------------------------------------------------
   WHAT MERCHANTS SEE

   Only two states on the page: Verified, or Unverified for
   everything else (not started, pending, partly done, not found,
   temporarily missing). The help line still explains the real
   reason and what to do next.
------------------------------------------------------------ */

export const VERIFICATION_FILTERS = [
  { value: "verified", label: "Verified" },
  { value: "unverified", label: "Unverified" },
] as const;

export type VerificationState = (typeof VERIFICATION_FILTERS)[number]["value"];

export function verificationState(status: string): VerificationState {
  return status === "verified" ? "verified" : "unverified";
}

const VERIFIED_META = { label: "Verified", tone: "success" as BadgeTone, dot: "#2F9E6A" };
const UNVERIFIED_META = { label: "Unverified", tone: "warning" as BadgeTone, dot: "#D69E2E" };

export function statusMeta(status: string): StatusMeta {
  const look = verificationState(status) === "verified" ? VERIFIED_META : UNVERIFIED_META;
  return { ...look, help: resendStatusMeta(status).help };
}

/* Statuses where Resend is still working, so the detail page
   keeps checking on its own. */
export function isChecking(status: string) {
  return status === "pending";
}

/* ------------------------------------------------------------
   RESEND RESPONSE TYPES
------------------------------------------------------------ */

export type DnsRecordKind = "SPF" | "DKIM" | "Receiving" | "Tracking" | "TrackingCAA";
export type DnsRecordType = "MX" | "TXT" | "CNAME" | "CAA";
export type RecordStatus = "pending" | "verified" | "failed" | "temporary_failure" | "not_started";

export type DomainRecord = {
  record: DnsRecordKind | string;
  name: string;
  value: string;
  type: DnsRecordType | string;
  ttl: string;
  status: RecordStatus | string;
  priority?: number;
  routing_policy?: string;
  proxy_status?: string;
};

export type TlsMode = "opportunistic" | "enforced";

export type DomainCapabilities = {
  sending?: "enabled" | "disabled";
  receiving?: "enabled" | "disabled";
};

/* One row of GET /domains. */
export type ResendDomainSummary = {
  id: string;
  name: string;
  status: DomainStatus | string;
  created_at: string;
  region: DomainRegion | string;
  capabilities?: DomainCapabilities;
};

/* GET /domains/:id and POST /domains. */
export type ResendDomain = ResendDomainSummary & {
  object?: "domain";
  records: DomainRecord[];
  open_tracking?: boolean;
  click_tracking?: boolean;
  tracking_subdomain?: string | null;
};

export type ResendDomainList = {
  object: "list";
  has_more?: boolean;
  data: ResendDomainSummary[];
};

export type CreateDomainInput = {
  name: string;
  region?: DomainRegion;
  tls?: TlsMode;
  open_tracking?: boolean;
  click_tracking?: boolean;
  custom_return_path?: string;
};

export type UpdateDomainInput = {
  tls?: TlsMode;
  open_tracking?: boolean;
  click_tracking?: boolean;
  tracking_subdomain?: string;
};

/* ------------------------------------------------------------
   INPUT CHECKS
------------------------------------------------------------ */

/* Turns what a merchant pastes ("https://Mail.Store.com/") into a
   bare lowercase host name, and says what is wrong if it can't. */
export function normalizeDomainInput(
  raw: string,
): { ok: true; name: string } | { ok: false; error: string } {
  let name = String(raw || "").trim().toLowerCase();
  name = name.replace(/^[a-z]+:\/\//, "").replace(/[/?#].*$/, "").replace(/\.$/, "");

  if (!name) return { ok: false, error: "Enter a domain, like mail.yourstore.com." };
  if (name.includes("@")) {
    return { ok: false, error: "Enter only the domain, without a name or @. For you@yourstore.com, enter yourstore.com." };
  }
  if (name.length > 253) return { ok: false, error: "That domain is too long." };

  const labels = name.split(".");
  const labelOk = (l: string) => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(l);
  const tld = labels[labels.length - 1];

  if (labels.length < 2 || !labels.every(labelOk) || !/^(?:[a-z]{2,63}|xn--[a-z0-9-]{1,59})$/.test(tld)) {
    return { ok: false, error: "That doesn't look like a valid domain. Use a domain you own, like mail.yourstore.com." };
  }

  return { ok: true, name };
}

/* The DMARC record we recommend next to Resend's own records.
   p=none only reports, so it is safe to add before everything
   else is verified. */
export function dmarcRecommendation() {
  return {
    type: "TXT",
    name: "_dmarc",
    value: "v=DMARC1; p=none;",
    ttl: "Auto",
  };
}

/* Names Resend gives each record group in its dashboard. */
export function recordGroup(kind: string) {
  switch (kind) {
    case "DKIM":
      return "Domain verification (DKIM)";
    case "SPF":
      return "Enable sending (SPF)";
    case "Receiving":
      return "Enable receiving (MX)";
    case "Tracking":
    case "TrackingCAA":
      return "Open and click tracking";
    default:
      return kind || "Other";
  }
}
