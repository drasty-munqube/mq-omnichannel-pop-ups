/* ============================================================
   SHOP INFO (server)

   The store's real name and storefront URL, for {{shop.name}}
   and {{shop.url}} in emails. Read once from the Admin API with
   the shop's offline token, then cached for an hour, because the
   send loop may render many emails in a row.

   If the API cannot be reached, it falls back to the
   myshopify.com handle and URL, so an email is never blocked on
   this.
   ============================================================ */

import { unauthenticated } from "../shopify.server";

export type ShopInfo = { name: string; url: string };

const CACHE_MS = 60 * 60 * 1000;
const cache = new Map<string, { at: number; info: ShopInfo }>();

export function fallbackShopInfo(shop: string): ShopInfo {
  return { name: shop.replace(/\.myshopify\.com$/i, ""), url: `https://${shop}` };
}

export async function getShopInfo(shop: string): Promise<ShopInfo> {
  const hit = cache.get(shop);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.info;

  const fallback = fallbackShopInfo(shop);
  try {
    const { admin } = await unauthenticated.admin(shop);
    const response = await admin.graphql(`#graphql
      query MqShopInfo { shop { name primaryDomain { url } } }`);
    const json = (await response.json()) as {
      data?: { shop?: { name?: string; primaryDomain?: { url?: string } } };
    };
    const info: ShopInfo = {
      name: json.data?.shop?.name?.trim() || fallback.name,
      url: (json.data?.shop?.primaryDomain?.url || fallback.url).replace(/\/+$/, ""),
    };
    cache.set(shop, { at: Date.now(), info });
    return info;
  } catch (error) {
    console.warn("SHOP INFO LOOKUP FAILED, USING FALLBACK:", shop, String(error).slice(0, 200));
    return fallback;
  }
}
