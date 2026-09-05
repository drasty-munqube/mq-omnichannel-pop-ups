import type { LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";

import { authenticate } from "../shopify.server";
import db from "../db.server";

/* ============================================================
   LOADER

   Real shopper submissions captured by the storefront popup
   widget (extensions/mq-popup-embed) via the public app-proxy
   endpoint (app/routes/proxy.popups.tsx). Nothing here is
   sample data.
   ============================================================ */

export async function loader({
  request,
}: LoaderFunctionArgs) {
  const { session } =
    await authenticate.admin(request);

  const contacts = await db.contact.findMany({
    where: { shop: session.shop },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  return {
    contacts: contacts.map((contact) => ({
      id: contact.id,
      email: contact.email,
      phone: contact.phone,
      popupName: contact.popupName,
      fields: contact.fields as Record<
        string,
        string
      >,
      pageUrl: contact.pageUrl,
      createdAt: contact.createdAt,
    })),
  };
}

/* ============================================================
   CONTACTS
   ============================================================ */

export default function Contacts() {
  const { contacts } =
    useLoaderData<typeof loader>();

  const formatDate = (value: string | Date) =>
    new Date(value).toLocaleString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

  return (
    <s-page heading="Contacts" inlineSize="large">

      <s-section>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "20px",
            padding: "4px 0 18px",
            flexWrap: "wrap",
          }}
        >
          <div>
            <h1
              style={{
                margin: 0,
                fontSize: "28px",
                fontWeight: 700,
                color: "#172033",
              }}
            >
              Contacts
            </h1>

            <p
              style={{
                margin: "7px 0 0",
                fontSize: "14px",
                color: "#6B7280",
              }}
            >
              Shoppers who submitted a popup on your
              storefront.
            </p>
          </div>

          <span
            style={{
              fontSize: "12px",
              fontWeight: 700,
              color: "#8A95A5",
            }}
          >
            {contacts.length} total
          </span>
        </div>

      </s-section>

      <s-section>

        <div
          style={{
            background: "#FFFFFF",
            border: "1px solid #D8DEE6",
            borderRadius: "12px",
            overflow: "hidden",
          }}
        >

          {contacts.length === 0 ? (

            <div
              style={{
                padding: "50px 20px",
                textAlign: "center",
                color: "#6B7280",
                fontSize: "13px",
                lineHeight: 1.6,
              }}
            >
              No submissions yet. Once a popup is
              live on your storefront (enable the "MQ
              Popups" app embed under Online Store →
              Themes → Customize → App embeds) and a
              shopper submits it, they'll show up
              here.
            </div>

          ) : (

            <>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns:
                    "1.4fr 1fr 1fr 140px",
                  gap: "12px",
                  padding: "11px 18px",
                  background: "#F8F9FA",
                  borderBottom:
                    "1px solid #E7EBEF",
                  color: "#8A95A5",
                  fontSize: "10px",
                  fontWeight: 700,
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                }}
              >
                <div>Contact</div>
                <div>Popup</div>
                <div>Page</div>
                <div>Submitted</div>
              </div>

              {contacts.map((contact) => (
                <div
                  key={contact.id}
                  style={{
                    display: "grid",
                    gridTemplateColumns:
                      "1.4fr 1fr 1fr 140px",
                    gap: "12px",
                    alignItems: "center",
                    padding: "14px 18px",
                    borderBottom:
                      "1px solid #EEF1F4",
                  }}
                >
                  <div>
                    <strong
                      style={{
                        display: "block",
                        fontSize: "13px",
                        color: "#172033",
                      }}
                    >
                      {contact.email ||
                        contact.phone ||
                        "No email captured"}
                    </strong>

                    {Object.keys(contact.fields)
                      .length > 0 && (
                      <span
                        style={{
                          display: "block",
                          marginTop: "3px",
                          fontSize: "11px",
                          color: "#8A95A5",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {Object.values(
                          contact.fields,
                        ).join(" · ")}
                      </span>
                    )}
                  </div>

                  <div
                    style={{
                      fontSize: "12px",
                      color: "#374151",
                    }}
                  >
                    {contact.popupName || "—"}
                  </div>

                  <div
                    style={{
                      fontSize: "12px",
                      color: "#374151",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {contact.pageUrl ? (
                      <a
                        href={contact.pageUrl}
                        target="_blank"
                        rel="noreferrer"
                        style={{ color: "#0B3D66" }}
                      >
                        {contact.pageUrl.replace(
                          /^https?:\/\//,
                          "",
                        )}
                      </a>
                    ) : (
                      "—"
                    )}
                  </div>

                  <div
                    style={{
                      fontSize: "11px",
                      color: "#8A95A5",
                    }}
                  >
                    {formatDate(contact.createdAt)}
                  </div>
                </div>
              ))}
            </>

          )}

        </div>

      </s-section>

    </s-page>
  );
}
