/* ============================================================
   AUDIT COLUMNS (shared, browser-safe)

   Formatting for the Created by / Modified by / Created date /
   Modified date columns in the admin lists. No imports, so any
   route component can use it.
   ============================================================ */

export const AUDIT_HEADERS = ["Created by", "Modified by", "Created date", "Modified date"] as const;

/* Grid widths for the four columns, appended to a table's own. */
/* Dates render on two lines (date, then time), so the date
   columns can be as narrow as the name columns. */
export const AUDIT_GRID = "minmax(96px, 1fr) minmax(96px, 1fr) minmax(96px, 0.9fr) minmax(96px, 0.9fr)";

export function auditPerson(value: string | null | undefined) {
  return value && value.trim() ? value.trim() : "—";
}

export function auditDate(value: string | Date | null | undefined) {
  if (!value) return "—";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  try {
    /* Same format the rest of the admin uses (en-IN). */
    return date.toLocaleString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return date.toISOString().slice(0, 16).replace("T", " ");
  }
}

/* Date and time as separate strings for the two-line cell.
   timeZone is passed in so the server render and the first
   browser render can agree (see AuditCells). */
export function auditDateParts(
  value: string | Date | null | undefined,
  timeZone?: string,
): { date: string; time: string } | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  try {
    return {
      date: date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone }),
      time: date.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", timeZone }),
    };
  } catch {
    const iso = date.toISOString();
    return { date: iso.slice(0, 10), time: iso.slice(11, 16) };
  }
}
