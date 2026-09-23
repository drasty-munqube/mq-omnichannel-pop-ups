/* ============================================================
   COUPON EMAIL TEMPLATE

   Deliberately importless. It touches no database, no mail
   transport and no environment, which is what lets a plain
   `node` script render exactly what the app sends without
   dragging Prisma in behind it.

   It used to live inside delivery.server.ts. A test script that
   imported it from there pulled in db.server, whose extensionless
   import only a bundler can resolve, so the script died before it
   ever reached the template. Keeping the pure part separate is
   the fix, and it also means there is one copy rather than the
   script carrying a duplicate that quietly drifts.
   ============================================================ */

/* The code comes from a merchant typing into a form, so it is
   escaped where it is rendered rather than where it is stored.
   Escaping at the point of use is the version of this rule that
   survives someone later changing where the value comes from. */

export function escapeHtml(value: string) {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[character] as string,
  );
}

export function couponEmail(code: string) {
  const safe = escapeHtml(code);

  return {
    subject: "Your discount code",

    /* A plain text part is not optional. Without it some clients
       show an empty message, and spam filters score the mail
       worse for being html only. */
    text: [
      "Here is your discount code:",
      "",
      code,
      "",
      "Use it at checkout.",
      "If you did not request this, you can ignore this email.",
    ].join("\n"),

    html: `<!doctype html>
<html>
  <body style="margin:0;padding:24px;background:#f5f6f8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
      <tr><td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:480px;background:#ffffff;border-radius:12px;overflow:hidden;">
          <tr><td style="padding:28px 28px 4px;">
            <h1 style="margin:0;font-size:22px;line-height:1.3;color:#172033;">Your discount code</h1>
            <p style="margin:10px 0 0;font-size:14px;line-height:1.6;color:#6b7280;">Thanks for signing up. Use this at checkout.</p>
          </td></tr>
          <tr><td style="padding:20px 28px;">
            <div style="padding:18px;text-align:center;background:#f3f7fb;border:1px dashed #0b3d66;border-radius:10px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:24px;font-weight:700;letter-spacing:2px;color:#0b3d66;">${safe}</div>
          </td></tr>
          <tr><td style="padding:0 28px 28px;">
            <p style="margin:0;font-size:12px;line-height:1.6;color:#9aa4b2;">If you did not request this, you can ignore this email.</p>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`,
  };
}
