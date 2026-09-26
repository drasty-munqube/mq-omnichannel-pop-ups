/* ============================================================
   UNSUBSCRIBE PAGE  (/unsubscribe?t=<token>)

   Where {{unsubscribeUrl}} in an email leads. Public: the signed
   token (see unsubscribe.server.ts) says which shop and email.

   GET   shows a confirm button. Nothing happens on GET, because
         mail scanners open links and must not unsubscribe people.
   POST  unsubscribes. Used by the button, and by inbox
         "Unsubscribe" buttons (RFC 8058 one-click, List-
         Unsubscribe-Post), which post to the same URL.
   ============================================================ */

import type { CSSProperties } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { Form, useActionData, useLoaderData, useNavigation } from "react-router";

import { getShopInfo } from "../models/shop-info.server";
import { isUnsubscribed, readUnsubscribeToken, unsubscribeEmail } from "../models/unsubscribe.server";

function maskEmail(email: string) {
  const [user, domain] = email.split("@");
  if (!domain) return email;
  return `${user.slice(0, 2)}${"•".repeat(Math.max(1, user.length - 2))}@${domain}`;
}

export async function loader({ request }: LoaderFunctionArgs) {
  const token = new URL(request.url).searchParams.get("t");
  const target = readUnsubscribeToken(token);
  if (!target) return { valid: false as const };

  const [shop, done] = await Promise.all([getShopInfo(target.shop), isUnsubscribed(target.shop, target.email)]);
  return { valid: true as const, token, email: maskEmail(target.email), shopName: shop.name, shopUrl: shop.url, done };
}

export async function action({ request }: ActionFunctionArgs) {
  const url = new URL(request.url);
  let token = url.searchParams.get("t");
  if (!token) {
    const form = await request.formData().catch(() => null);
    token = form ? String(form.get("t") || "") : null;
  }
  const target = readUnsubscribeToken(token);
  if (!target) return Response.json({ ok: false }, { status: 400 });

  await unsubscribeEmail(target.shop, target.email);
  return { ok: true };
}

const page: CSSProperties = {
  minHeight: "100vh",
  margin: 0,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "24px 16px",
  background: "#F4F5F7",
  fontFamily: "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
  color: "#172033",
  boxSizing: "border-box",
};

const card: CSSProperties = {
  width: "100%",
  maxWidth: "440px",
  background: "#FFFFFF",
  border: "1px solid #E1E6EC",
  borderRadius: "14px",
  padding: "32px 28px",
  boxShadow: "0 8px 24px rgba(23, 32, 51, 0.06)",
  textAlign: "center",
};

export default function Unsubscribe() {
  const data = useLoaderData<typeof loader>();
  const result = useActionData<typeof action>();
  const navigation = useNavigation();
  const busy = navigation.state !== "idle";

  if (!data.valid) {
    return (
      <main style={page}>
        <div style={card}>
          <h1 style={{ margin: "0 0 10px", fontSize: "22px" }}>This link is not valid</h1>
          <p style={{ margin: 0, color: "#5B6472", lineHeight: 1.5 }}>
            The unsubscribe link may be incomplete. Please use the link from the latest email you received.
          </p>
        </div>
      </main>
    );
  }

  const done = data.done || (result && "ok" in result && result.ok);

  return (
    <main style={page}>
      <div style={card}>
        {done ? (
          <>
            <h1 style={{ margin: "0 0 10px", fontSize: "22px" }}>You are unsubscribed</h1>
            <p style={{ margin: "0 0 20px", color: "#5B6472", lineHeight: 1.5 }}>
              {data.email} will not get more emails from {data.shopName}.
            </p>
            <a href={data.shopUrl} style={{ color: "#0B3D66", fontWeight: 600 }}>
              Back to {data.shopName}
            </a>
          </>
        ) : (
          <>
            <h1 style={{ margin: "0 0 10px", fontSize: "22px" }}>Unsubscribe from {data.shopName}?</h1>
            <p style={{ margin: "0 0 22px", color: "#5B6472", lineHeight: 1.5 }}>
              {data.email} will stop getting emails from this store.
            </p>
            <Form method="post">
              <input type="hidden" name="t" value={data.token ?? ""} />
              <button
                type="submit"
                disabled={busy}
                style={{ width: "100%", height: "44px", border: 0, borderRadius: "8px", background: "#172033", color: "#FFFFFF", fontSize: "15px", fontWeight: 600, cursor: busy ? "default" : "pointer", opacity: busy ? 0.7 : 1 }}
              >
                {busy ? "Unsubscribing…" : "Unsubscribe"}
              </button>
            </Form>
          </>
        )}
      </div>
    </main>
  );
}
