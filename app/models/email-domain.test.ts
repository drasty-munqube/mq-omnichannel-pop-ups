import { describe, expect, it } from "vitest";

import {
  DOMAIN_REGIONS,
  DOMAIN_STATUS,
  DOMAIN_STATUSES,
  isChecking,
  isDomainRegion,
  normalizeDomainInput,
  recordGroup,
  resendStatusMeta,
  statusMeta,
  verificationState,
} from "./email-domain";

describe("normalizeDomainInput", () => {
  it.each([
    ["mail.shop.com", "mail.shop.com"],
    ["  Mail.Shop.COM ", "mail.shop.com"],
    ["https://mail.shop.com/", "mail.shop.com"],
    ["http://shop.co.uk/path?x=1", "shop.co.uk"],
    ["shop.com.", "shop.com"],
    ["xn--bcher-kva.example", "xn--bcher-kva.example"],
  ])("accepts %s", (raw, name) => {
    expect(normalizeDomainInput(raw)).toEqual({ ok: true, name });
  });

  it.each(["", "   ", "localhost", "shop", "-shop.com", "shop-.com", "sh op.com", "shop..com", "shop.c", "shop.123", "you@shop.com", `${"a".repeat(64)}.com`])(
    "rejects %j",
    (raw) => {
      const result = normalizeDomainInput(raw);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.length).toBeGreaterThan(10);
    },
  );

  it("explains an email address", () => {
    const result = normalizeDomainInput("you@shop.com");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/without a name or @/);
  });
});

describe("status meta", () => {
  it("covers all seven Resend statuses with distinct colors and help", () => {
    expect(DOMAIN_STATUSES).toHaveLength(7);
    const dots = new Set(DOMAIN_STATUSES.map((s) => DOMAIN_STATUS[s].dot));
    expect(dots.size).toBe(7);
    for (const s of DOMAIN_STATUSES) {
      expect(DOMAIN_STATUS[s].label).toBeTruthy();
      expect(DOMAIN_STATUS[s].help.length).toBeGreaterThan(30);
    }
  });

  it("falls back for an unknown status", () => {
    expect(resendStatusMeta("brand_new_state")).toMatchObject({ label: "brand new state", tone: "neutral" });
    expect(statusMeta("brand_new_state")).toMatchObject({ label: "Unverified" });
  });

  it("shows merchants only Verified or Unverified, keeping Resend's help line", () => {
    expect(statusMeta("verified")).toMatchObject({ label: "Verified", tone: "success" });
    for (const s of ["failed", "partially_failed", "pending", "not_started", "temporary_failure", "partially_verified"]) {
      expect(statusMeta(s).label).toBe("Unverified");
      expect(verificationState(s)).toBe("unverified");
      expect(statusMeta(s).help).toBe(DOMAIN_STATUS[s as keyof typeof DOMAIN_STATUS].help);
    }
    for (const s of DOMAIN_STATUSES) expect(DOMAIN_STATUS[s].help).not.toMatch(/marked Failed/);
  });

  it("only polls while pending", () => {
    expect(isChecking("pending")).toBe(true);
    expect(isChecking("verified")).toBe(false);
    expect(isChecking("not_started")).toBe(false);
  });
});

describe("regions and groups", () => {
  it("lists the four Resend regions", () => {
    expect(DOMAIN_REGIONS.map((r) => r.value)).toEqual(["us-east-1", "eu-west-1", "sa-east-1", "ap-northeast-1"]);
    expect(isDomainRegion("eu-west-1")).toBe(true);
    expect(isDomainRegion("eu-central-1")).toBe(false);
  });

  it("names record groups", () => {
    expect(recordGroup("DKIM")).toMatch(/DKIM/);
    expect(recordGroup("SPF")).toMatch(/SPF/);
    expect(recordGroup("Tracking")).toMatch(/tracking/i);
    expect(recordGroup("")).toBe("Other");
  });
});
