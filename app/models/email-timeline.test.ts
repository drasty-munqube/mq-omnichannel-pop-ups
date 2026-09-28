import { describe, expect, it } from "vitest";

import { EVENT_META, buildTimeline, eventMeta, lastEventFromApi, type StoredEvent } from "./email-timeline";

const base = {
  createdAt: "2026-09-28T10:20:00.000Z",
  sentAt: "2026-09-28T10:20:01.000Z",
  providerId: "e1",
  deliveredAt: null,
  openedAt: null,
  clickedAt: null,
  bouncedAt: null,
  complainedAt: null,
};

const ev = (id: string, type: string, at: string, extra: Partial<StoredEvent> = {}): StoredEvent => ({
  id,
  providerId: "e1",
  type,
  occurredAt: at,
  link: null,
  bounceType: null,
  bounceSubType: null,
  reason: null,
  ...extra,
});

describe("buildTimeline", () => {
  it("orders events by time, whatever order they were stored in", () => {
    const t = buildTimeline(base, [
      ev("3", "email.clicked", "2026-09-28T10:25:00.000Z", { link: "https://s.com" }),
      ev("1", "email.sent", "2026-09-28T10:20:01.000Z"),
      ev("2", "email.delivered", "2026-09-28T10:20:05.000Z"),
      ev("4", "email.opened", "2026-09-28T10:24:00.000Z"),
      ev("5", "email.opened", "2026-09-28T11:00:00.000Z"),
    ]);
    expect(t.map((e) => e.type)).toEqual(["queued", "email.sent", "email.delivered", "email.opened", "email.clicked", "email.opened"]);
    expect(t.find((e) => e.type === "email.clicked")?.link).toBe("https://s.com");
  });

  it("fills older emails from the saved first-time columns", () => {
    const t = buildTimeline({ ...base, deliveredAt: "2026-09-28T10:20:05.000Z", openedAt: "2026-09-28T10:24:00.000Z" }, []);
    expect(t.map((e) => [e.type, e.saved ?? false])).toEqual([
      ["queued", false],
      ["email.sent", true],
      ["email.delivered", true],
      ["email.opened", true],
    ]);
  });

  it("does not double up when a stored event exists for that type", () => {
    const t = buildTimeline({ ...base, deliveredAt: "2026-09-28T10:20:05.000Z" }, [ev("1", "email.delivered", "2026-09-28T10:20:05.000Z")]);
    expect(t.filter((e) => e.type === "email.delivered")).toHaveLength(1);
  });

  it("shows bounce details and marks earlier attempts", () => {
    const t = buildTimeline({ ...base, providerId: "e2" }, [
      ev("1", "email.bounced", "2026-09-28T10:21:00.000Z", { bounceType: "Permanent", bounceSubType: "General", reason: "No such user" }),
    ]);
    const bounce = t.find((e) => e.type === "email.bounced")!;
    expect(bounce.detail).toBe("Permanent, General: No such user");
    expect(bounce.earlierAttempt).toBe(true);
  });
});

describe("event wording", () => {
  it("covers every Resend email event", () => {
    for (const type of ["sent", "delivered", "delivery_delayed", "opened", "clicked", "bounced", "complained", "failed", "scheduled", "suppressed"]) {
      expect(EVENT_META[`email.${type}`]?.label).toBeTruthy();
    }
  });

  it("handles unknown types", () => {
    expect(eventMeta("email.link_preview_fetched")).toMatchObject({ label: "Link preview fetched", tone: "neutral" });
  });

  it("maps last_event from the API", () => {
    expect(lastEventFromApi("delivery_delayed")).toBe("delayed");
    expect(lastEventFromApi("delivered")).toBe("delivered");
    expect(lastEventFromApi("queued")).toBeNull();
    expect(lastEventFromApi(undefined)).toBeNull();
  });
});
