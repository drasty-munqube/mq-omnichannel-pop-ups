/* Small line icons for the Channels cards (Lucide). */

import { Mail, MessageCircle, Smartphone } from "lucide-react";

const ICONS = { mail: Mail, chat: MessageCircle, sms: Smartphone } as const;

export function ChannelIcon({ icon, size = 22 }: { icon: "mail" | "chat" | "sms"; size?: number }) {
  const Glyph = ICONS[icon];
  return <Glyph aria-hidden size={size} strokeWidth={1.8} />;
}
