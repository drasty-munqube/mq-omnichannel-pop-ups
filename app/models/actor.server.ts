/* ============================================================
   WHO MADE THIS CHANGE

   The name saved in createdBy / updatedBy. The app asks Shopify
   for online sessions (useOnlineTokens in shopify.server.ts), so
   an admin request carries the staff member who is signed in.
   If that is ever missing (an older offline session, or a
   collaborator account without details), fall back to their
   Shopify user id, then to "Admin", so a row is never blank.
   ============================================================ */

type AdminAuth = {
  session: {
    onlineAccessInfo?: {
      associated_user?: {
        first_name?: string;
        last_name?: string;
        email?: string;
        id?: number;
      };
    };
  };
  sessionToken?: { sub?: string } | null;
};

export function actorName(auth: AdminAuth): string {
  const user = auth.session.onlineAccessInfo?.associated_user;
  const name = [user?.first_name, user?.last_name].filter(Boolean).join(" ").trim();
  if (name) return name.slice(0, 120);
  if (user?.email) return user.email.slice(0, 120);
  if (user?.id) return `Staff #${user.id}`;
  const sub = auth.sessionToken?.sub;
  if (sub) return `Staff #${String(sub).split("/").pop()}`;
  return "Admin";
}
