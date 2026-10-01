/* ============================================================
   PEOPLE (shared, browser-safe)

   Filters and page size for the one list on the Contacts page
   (contacts and anonymous visitors together). See
   people.server.ts for the query.
   ============================================================ */

export const PEOPLE_PAGE_SIZE = 25;

export const PEOPLE_FILTERS = [
  { key: "all", label: "All" },
  { key: "signed_up", label: "Signed up" },
  { key: "anonymous", label: "Anonymous" },
  { key: "logged_in", label: "Logged in" },
] as const;

export type PeopleFilterKey = (typeof PEOPLE_FILTERS)[number]["key"];

/* Older links used the Visitors tab's names. */
export function normalizePeopleFilter(value: string | null): PeopleFilterKey {
  if (value === "identified") return "signed_up";
  return PEOPLE_FILTERS.some((f) => f.key === value) ? (value as PeopleFilterKey) : "all";
}

