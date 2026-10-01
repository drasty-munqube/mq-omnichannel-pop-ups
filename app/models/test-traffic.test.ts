import { describe, expect, it } from "vitest";

import { TEST_URL_MARKERS, isTestPageUrl, realTrafficWhere } from "./test-traffic";

describe("isTestPageUrl", () => {
  it("spots the theme editor, theme previews and MQ previews", () => {
    expect(isTestPageUrl("https://shop.myshopify.com/?oseid=abc&preview_theme_id=123")).toBe(true);
    expect(isTestPageUrl("https://shop.myshopify.com/products/x?preview_theme_id=9")).toBe(true);
    expect(isTestPageUrl("https://shop.myshopify.com/?mq_campaign=camp1")).toBe(true);
    expect(isTestPageUrl("https://abc123.shopifypreview.com/")).toBe(true);
    expect(isTestPageUrl("https://SHOP.myshopify.com/?OSEID=x")).toBe(true);
  });

  it("leaves real shopper pages alone", () => {
    expect(isTestPageUrl("https://shop.myshopify.com/collections/all?utm_source=ig")).toBe(false);
    expect(isTestPageUrl("https://example.com/?campaign=summer")).toBe(false);
    expect(isTestPageUrl(null)).toBe(false);
    expect(isTestPageUrl("")).toBe(false);
  });
});

describe("realTrafficWhere", () => {
  it("keeps rows with no page URL and drops every marker", () => {
    expect(realTrafficWhere.OR[0]).toEqual({ pageUrl: null });
    const markers = (realTrafficWhere.OR[1] as { NOT: { OR: { pageUrl: { contains: string } }[] } }).NOT.OR.map((c) => c.pageUrl.contains);
    expect(markers).toEqual([...TEST_URL_MARKERS]);
  });
});
