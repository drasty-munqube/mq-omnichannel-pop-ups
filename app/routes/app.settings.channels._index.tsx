/* ============================================================
   SETTINGS > CHANNELS

   One square card per channel from app/models/channels.ts.
   Ready channels link to their own setup; the rest say Coming
   soon. The Email card also shows how many sending domains this
   store has and how many are verified (from the local cache, so
   this page never waits on Resend).
   ============================================================ */

import type { LoaderFunctionArgs } from "react-router";
import { Link, useLoaderData } from "react-router";

import { ChannelIcon } from "../components/channel-icon";
import { badge, card } from "../design/styles";
import { color, fontWeight, radius, space, text } from "../design/tokens";
import { CHANNELS, isChannelReady, type ChannelConfig } from "../models/channels";
import { countShopDomains } from "../models/email-domains.server";
import { authenticate } from "../shopify.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);
  try {
    return { email: await countShopDomains(session.shop) };
  } catch (error) {
    console.error("CHANNELS COUNT ERROR:", error);
    return { email: null };
  }
}

function summary(channel: ChannelConfig, email: { total: number; verified: number } | null) {
  if (channel.key !== "email" || !email) return null;
  if (email.total === 0) return "No domains yet";
  return `${email.total} domain${email.total === 1 ? "" : "s"} · ${email.verified} verified`;
}

function CardBody({ channel, note }: { channel: ChannelConfig; note: string | null }) {
  const ready = isChannelReady(channel);
  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: space[4] }}>
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: "44px",
            height: "44px",
            borderRadius: radius.lg,
            background: ready ? color.primarySubtle : color.surfaceSunken,
            color: ready ? color.primary : color.textSubtle,
          }}
        >
          <ChannelIcon icon={channel.icon} />
        </span>
        <span style={badge(ready ? "success" : "neutral")}>{ready ? "AVAILABLE" : "COMING SOON"}</span>
      </div>

      <div style={{ marginTop: "auto" }}>
        <div style={{ ...text.h3, color: ready ? color.textStrong : color.textMuted }}>{channel.name}</div>
        <p style={{ margin: `${space[2]} 0 0`, ...text.bodySm, color: color.textMuted }}>{channel.description}</p>
        {note ? (
          <div style={{ marginTop: space[4], ...text.bodySm, color: color.text, fontWeight: fontWeight.medium }}>{note}</div>
        ) : null}
        {ready ? (
          <div style={{ marginTop: space[4], ...text.label, color: color.primary }}>Manage →</div>
        ) : null}
      </div>
    </>
  );
}

export default function ChannelsPage() {
  const { email } = useLoaderData<typeof loader>();

  const tile = (ready: boolean) => ({
    ...card({ padding: 7, interactive: ready }),
    display: "flex",
    flexDirection: "column" as const,
    gap: space[6],
    aspectRatio: "1 / 1",
    minHeight: "220px",
    textDecoration: "none",
    color: "inherit",
    opacity: ready ? 1 : 0.8,
    cursor: ready ? "pointer" : "default",
  });

  return (
    <s-section heading="Channels">
      <p style={{ margin: `0 0 ${space[6]}`, ...text.body, color: color.textMuted }}>
        Choose how your campaigns reach shoppers. Set up a channel once and every campaign can use it.
      </p>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(210px, 1fr))",
          gap: space[6],
        }}
      >
        {CHANNELS.map((channel) =>
          channel.href ? (
            <Link
              key={channel.key}
              to={channel.href}
              data-mq="interactive"
              aria-label={`${channel.name}: manage`}
              style={tile(true)}
            >
              <CardBody channel={channel} note={summary(channel, email)} />
            </Link>
          ) : (
            <div key={channel.key} aria-disabled="true" style={tile(false)}>
              <CardBody channel={channel} note={null} />
            </div>
          ),
        )}
      </div>
    </s-section>
  );
}
