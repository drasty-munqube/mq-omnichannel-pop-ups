/* ============================================================
   AUDIT CELLS + STICKY ACTIONS (shared by the admin tables)

   AuditCells renders the four Created by / Modified by /
   Created date / Modified date grid cells. Dates are two lines
   (date, then a lighter time) so the columns stay narrow.

   Dates are first rendered in UTC, which is what the server
   uses, so hydration matches; right after mount they switch to
   the viewer's own time zone.

   stickyEnd() keeps the Actions cell pinned to the right edge
   of a sideways-scrolling table, so the ⋮ menu is reachable on
   any screen width.
   ============================================================ */

import { useEffect, useState, type CSSProperties } from "react";
import { auditDateParts, auditPerson } from "../models/audit-format";

function useLocalTimeZone() {
  const [timeZone, setTimeZone] = useState<string | undefined>("UTC");
  useEffect(() => setTimeZone(undefined), []);
  return timeZone;
}

const ellipsis: CSSProperties = {
  minWidth: 0,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

export function AuditCells({
  createdBy,
  updatedBy,
  createdAt,
  updatedAt,
}: {
  createdBy: string | null | undefined;
  updatedBy: string | null | undefined;
  createdAt: string | Date | null | undefined;
  updatedAt: string | Date | null | undefined;
}) {
  const timeZone = useLocalTimeZone();

  const person = (value: string | null | undefined) => {
    const text = auditPerson(value);
    return (
      <div title={text} style={{ ...ellipsis, fontSize: "12px", color: "#374151" }}>
        {text}
      </div>
    );
  };

  const when = (value: string | Date | null | undefined) => {
    const parts = auditDateParts(value, timeZone);
    if (!parts) {
      return <div style={{ fontSize: "12px", color: "#657080" }}>—</div>;
    }
    return (
      <div title={`${parts.date}, ${parts.time}`} style={{ minWidth: 0, lineHeight: 1.35 }}>
        <div style={{ ...ellipsis, fontSize: "12px", color: "#374151" }}>{parts.date}</div>
        <div style={{ ...ellipsis, fontSize: "11px", color: "#8A95A5" }}>{parts.time}</div>
      </div>
    );
  };

  return (
    <>
      {person(createdBy)}
      {person(updatedBy)}
      {when(createdAt)}
      {when(updatedAt)}
    </>
  );
}

/* A single two-line date cell (date, then a lighter time), for
   tables that need a date column outside the four audit ones. */
export function AuditDate({ value }: { value: string | Date | null | undefined }) {
  const timeZone = useLocalTimeZone();
  const parts = auditDateParts(value, timeZone);
  if (!parts) {
    return <div style={{ fontSize: "12px", color: "#657080" }}>—</div>;
  }
  return (
    <div title={`${parts.date}, ${parts.time}`} style={{ minWidth: 0, lineHeight: 1.35 }}>
      <div style={{ ...ellipsis, fontSize: "12px", color: "#374151" }}>{parts.date}</div>
      <div style={{ ...ellipsis, fontSize: "11px", color: "#8A95A5" }}>{parts.time}</div>
    </div>
  );
}

/* Style for the last (Actions) cell of a row or header. Pass the
   row's own background so content scrolling underneath is
   hidden. */
export function stickyEnd(background: string): CSSProperties {
  return {
    position: "sticky",
    right: 0,
    zIndex: 1,
    /* A short fade on the left edge, so columns scrolling under
       the pinned cell disappear softly instead of being cut. */
    background: `linear-gradient(to right, transparent, ${background} 12px)`,
    marginLeft: "-12px",
    paddingLeft: "12px",
    display: "flex",
    justifyContent: "flex-end",
    alignItems: "center",
    alignSelf: "stretch",
  };
}
