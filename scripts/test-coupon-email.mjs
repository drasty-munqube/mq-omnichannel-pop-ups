/* ============================================================
   TEST COUPON EMAIL

   Sends one real coupon email, using the same template the app
   uses, so what lands in the inbox is what a shopper would get.

     node scripts/test-coupon-email.mjs you@example.com
     node scripts/test-coupon-email.mjs you@example.com SAVE25

   Nothing is written to the database. This checks the two
   things that are easy to get wrong and hard to notice: that
   the mail actually arrives, and that the template renders.
   ============================================================ */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

const require = createRequire(
  path.join(root, "package.json"),
);

const nodemailer = require("nodemailer");

const to = process.argv[2];
const code = process.argv[3] || "TEST-CODE-123";

if (!to) {
  console.log(
    "Usage: node scripts/test-coupon-email.mjs <email> [code]",
  );
  process.exit(1);
}

const env = {};

for (const line of fs
  .readFileSync(path.join(root, ".env"), "utf8")
  .split("\n")) {
  const match = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
  if (match) {
    env[match[1]] = match[2].replace(/^["']|["']$/g, "");
  }
}

/* The template is imported from the app rather than copied, so a
   change there shows up here. It lives in its own importless file
   precisely so this works: importing it from delivery.server.ts
   would drag in db.server, whose extensionless import only a
   bundler can resolve. */
const { couponEmail } = await import(
  path.join(root, "app/models/coupon-email.ts")
);

const transporter = nodemailer.createTransport({
  host: env.EMAIL_HOST,
  port: Number(env.EMAIL_PORT) || 465,
  secure: env.EMAIL_SECURE !== "false",
  auth: {
    user: env.EMAIL_USER,
    pass: env.EMAIL_PASS,
  },
});

const { subject, text, html } = couponEmail(code);

try {
  const info = await transporter.sendMail({
    from: env.MAIL_FROM || env.EMAIL_USER,
    to,
    subject,
    text,
    html,
  });

  console.log("SENT");
  console.log("to        :", to);
  console.log("code      :", code);
  console.log("messageId :", info.messageId);
  console.log("accepted  :", info.accepted);
  console.log("rejected  :", info.rejected);
  console.log("\nInbox check karo. Spam folder bhi dekh lena.");
  process.exit(0);
} catch (error) {
  console.log("FAILED");
  console.log("code   :", error.code || "-");
  console.log(
    "message:",
    String(error.message).slice(0, 300),
  );
  process.exit(1);
}
