import { useState } from "react";

import type { LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";

import { authenticate } from "../shopify.server";
import db from "../db.server";
import { ContactJourneyDialog } from "../components/contact-journey";
import { PeopleList } from "../components/people-list";
import { kickDeliveries } from "../models/delivery.server";
import { loadPeoplePage } from "../models/people.server";
import { Download } from "lucide-react";

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

  /* One list: contacts and anonymous visitors together (see
     models/people.server.ts). The CSV export above stays
     contacts only. */
  return loadPeoplePage(session.shop, url);
}

/* ============================================================
   CONTACTS
   ============================================================ */

export default function Contacts() {
  const data = useLoaderData<typeof loader>();
  const total = data.contactTotal;

  const [exporting, setExporting] =
    useState(false);

  /* The contact whose journey dialog is open. */
  const [journeyFor, setJourneyFor] = useState<{ id: string; title: string } | null>(null);

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
              Everyone who came to your store with MQ Pop-ups on. Visitors stay anonymous until they sign up, then
              become contacts. Open a contact to see their journey.
            </p>
          </div>

          <button
            type="button"
            onClick={exportCsv}
            disabled={exporting || total === 0}
            style={{
              padding: "9px 16px",
              fontSize: "13px",
              fontWeight: 600,
              color: total === 0 ? "#9AA4B2" : "#FFFFFF",
              background: total === 0 ? "#EEF1F4" : "#1F2937",
              border: "none",
              borderRadius: "8px",
              cursor: exporting || total === 0 ? "default" : "pointer",
              whiteSpace: "nowrap",
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
            }}
          >
            <Download aria-hidden size={15} strokeWidth={2} />
            {exporting ? "Preparing…" : "Export contacts (CSV)"}
          </button>
        </div>

        <PeopleList data={data} onOpenJourney={setJourneyFor} />
      </s-section>

      {journeyFor ? (
        <ContactJourneyDialog
          contactId={journeyFor.id}
          title={journeyFor.title}
          onClose={() => setJourneyFor(null)}
        />
      ) : null}
    </s-page>
  );
}
