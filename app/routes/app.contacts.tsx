import { useState } from "react";

import type { LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";

import { authenticate } from "../shopify.server";
import db from "../db.server";
import { kickDeliveries } from "../models/delivery.server";

/* ============================================================
   CSV EXPORT

   A merchant's whole reason for collecting these is to put them
   somewhere else: a mail tool, a CRM, a spreadsheet. Reading
   them off the screen 200 at a time is not that, so the same
   route also answers ?format=csv with every row.

   Escaping is the boring part that matters. A shopper controls
   what goes in these fields, so a value containing a comma, a
   quote or a newline has to survive the round trip, and a value
   starting with =, +, - or @ is neutralised: spreadsheets treat
   those as formulas, which is how an exported contact list
   turns into someone else's code running on open.
   ============================================================ */

function csvCell(value: unknown) {
  if (value === null || value === undefined) {
    return '""';
  }

  let text = String(value);

  if (/^[=+\-@\t\r]/.test(text)) {
    text = "'" + text;
  }

  return '"' + text.replace(/"/g, '""') + '"';
}

/* Field names differ from popup to popup, so the columns are
   whatever the exported rows actually contain. Capped so one
   misconfigured popup cannot produce a spreadsheet thousands of
   columns wide. */
const MAX_FIELD_COLUMNS = 50;

function buildCsv(
  rows: {
    createdAt: Date;
    email: string | null;
    phone: string | null;
    popupName: string | null;
    campaignId: string | null;
    pageUrl: string | null;
    fields: unknown;
  }[],
) {
  const fieldKeys: string[] = [];

  for (const row of rows) {
    const fields =
      row.fields &&
      typeof row.fields === "object" &&
      !Array.isArray(row.fields)
        ? (row.fields as Record<string, unknown>)
        : {};

    for (const key of Object.keys(fields)) {
      if (
        !fieldKeys.includes(key) &&
        fieldKeys.length < MAX_FIELD_COLUMNS
      ) {
        fieldKeys.push(key);
      }
    }
  }

  const header = [
    "Submitted at",
    "Email",
    "Phone",
    "Popup",
    "Campaign ID",
    "Page URL",
    ...fieldKeys,
  ];

  const lines = [
    header.map(csvCell).join(","),
  ];

  for (const row of rows) {
    const fields =
      row.fields &&
      typeof row.fields === "object" &&
      !Array.isArray(row.fields)
        ? (row.fields as Record<string, unknown>)
        : {};

    lines.push(
      [
        row.createdAt.toISOString(),
        row.email,
        row.phone,
        row.popupName,
        row.campaignId,
        row.pageUrl,
        ...fieldKeys.map(
          (key) => fields[key] ?? "",
        ),
      ]
        .map(csvCell)
        .join(","),
    );
  }

  /* CRLF and a BOM so Excel opens it as UTF-8 rather than
     mangling any name with an accent in it. */
  return "\uFEFF" + lines.join("\r\n") + "\r\n";
}

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

  /* Retry any coupon emails still pending, in the background.
     Opening Contacts is the natural moment a merchant checks on
     them, and it means a row stuck after a failed send does not
     have to wait for the next popup submission. */
  kickDeliveries(session.shop);

  const url = new URL(request.url);

  if (url.searchParams.get("format") === "csv") {
    const all = await db.contact.findMany({
      where: { shop: session.shop },
      orderBy: { createdAt: "desc" },
    });

    throw new Response(buildCsv(all), {
      headers: {
        "Content-Type":
          "text/csv; charset=utf-8",
        "Content-Disposition":
          'attachment; filename="mq-contacts.csv"',
      },
    });
  }

  const [contacts, total] = await Promise.all([
    db.contact.findMany({
      where: { shop: session.shop },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
    db.contact.count({
      where: { shop: session.shop },
    }),
  ]);

  return {
    total,
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
  const { contacts, total } =
    useLoaderData<typeof loader>();

  const [exporting, setExporting] =
    useState(false);

  /* Fetched and turned into a blob rather than linked to
     directly. This screen runs inside Shopify's admin iframe,
     where a plain download link is unreliable, and App Bridge
     only attaches the session token to fetch. */

  const exportCsv = async () => {
    if (exporting) {
      return;
    }

    setExporting(true);

    try {
      const response = await fetch(
        "/app/contacts?format=csv",
      );

      if (!response.ok) {
        throw new Error(
          "Export failed: " + response.status,
        );
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);

      const link =
        document.createElement("a");

      link.href = url;
      link.download = "mq-contacts.csv";

      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      URL.revokeObjectURL(url);
    } catch (error) {
      console.error(
        "CONTACTS EXPORT ERROR:",
        error,
      );
    } finally {
      setExporting(false);
    }
  };

  const formatDate = (value: string | Date) =>
    new Date(value).toLocaleString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

  return (
    <s-page inlineSize="large">

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
              {total > contacts.length
                ? ` Showing the latest ${contacts.length}; Export CSV gives you all ${total}.`
                : ""}
            </p>
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "14px",
            }}
          >
            <span
              style={{
                fontSize: "12px",
                fontWeight: 700,
                color: "#8A95A5",
              }}
            >
              {total} total
            </span>

            <button
              type="button"
              onClick={exportCsv}
              disabled={
                exporting || total === 0
              }
              style={{
                padding: "9px 16px",
                fontSize: "13px",
                fontWeight: 600,
                color:
                  total === 0
                    ? "#9AA4B2"
                    : "#FFFFFF",
                background:
                  total === 0
                    ? "#EEF1F4"
                    : "#1F2937",
                border: "none",
                borderRadius: "8px",
                cursor:
                  exporting || total === 0
                    ? "default"
                    : "pointer",
                whiteSpace: "nowrap",
              }}
            >
              {exporting
                ? "Preparing…"
                : "Export CSV"}
            </button>
          </div>
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
