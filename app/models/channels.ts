/* ============================================================
   CHANNELS (shared, browser-safe)

   The cards on Settings > Channels. Adding a channel later is a
   new entry here plus its own routes; the menu itself does not
   change. A channel without `href` shows as Coming soon.
   ============================================================ */

export type ChannelKey = "email" | "whatsapp" | "sms";

export type ChannelConfig = {
  key: ChannelKey;
  name: string;
  description: string;
  /* Where Manage goes. Leave out for a channel that is not ready. */
  href?: string;
  /* Short glyph for the card icon. */
  icon: "mail" | "chat" | "sms";
};

export const CHANNELS: ChannelConfig[] = [
  {
    key: "email",
    name: "Email",
    description: "Send from your own domain through Resend. Add, verify and manage sending domains.",
    href: "/app/settings/channels/email",
    icon: "mail",
  },
  {
    key: "whatsapp",
    name: "WhatsApp",
    description: "Send discount codes and updates as WhatsApp messages.",
    icon: "chat",
  },
  {
    key: "sms",
    name: "SMS",
    description: "Send discount codes as text messages.",
    icon: "sms",
  },
];

export function isChannelReady(channel: ChannelConfig) {
  return Boolean(channel.href);
}
