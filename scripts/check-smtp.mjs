/* ============================================================
   SMTP CHECK

   Logs in to the mail server and hangs up. Nothing is sent, so
   this is safe to run as often as you like.

   Run it after changing any EMAIL_ value:

     node scripts/check-smtp.mjs

   It exists because the alternative way to find out that a
   password is wrong is a shopper who never receives their
   coupon, and a row in DiscountDelivery that quietly retries
   five times and gives up.

   No value from .env is ever printed. The password is only ever
   described by its length.
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

const env = {};

for (const line of fs
  .readFileSync(path.join(root, ".env"), "utf8")
  .split("\n")) {
  const match = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
  if (match) {
    env[match[1]] = match[2].replace(/^["']|["']$/g, "");
  }
}

const pass = env.EMAIL_PASS || "";
const stripped = pass.replace(/\s/g, "");

console.log("host :", env.EMAIL_HOST || "(missing)");
console.log("port :", env.EMAIL_PORT, "secure:", env.EMAIL_SECURE);
console.log(
  "user :",
  (env.EMAIL_USER || "(missing)").replace(
    /^(.{2}).*(@.*)$/,
    "$1***$2",
  ),
);
console.log("pass :", pass.length, "characters");

/* A Gmail or Workspace app password is sixteen characters,
   shown in four groups of four. Anything else is almost always
   the account password, which Google refuses over SMTP. */
if (
  /gmail|google/.test(env.EMAIL_HOST || "") &&
  stripped.length !== 16
) {
  console.log(
    "\nWARNING: Google app passwords are 16 characters." +
      " This looks like something else, and Google will" +
      " reject an account password over SMTP.",
  );
}

console.log("");

const transporter = nodemailer.createTransport({
  host: env.EMAIL_HOST,
  port: Number(env.EMAIL_PORT) || 465,
  secure: env.EMAIL_SECURE !== "false",
  auth: { user: env.EMAIL_USER, pass },
  connectionTimeout: 15000,
  greetingTimeout: 15000,
});

try {
  await transporter.verify();
  console.log("SMTP login SUCCESS. Coupons can be sent.");
  process.exit(0);
} catch (error) {
  console.log("SMTP login FAILED");
  console.log("code   :", error.code || "-");
  console.log(
    "message:",
    String(error.message).slice(0, 300),
  );

  if (error.code === "EAUTH") {
    console.log(
      "\nEAUTH means the host was reached but the login was" +
        " refused. Check EMAIL_USER and EMAIL_PASS.",
    );
  }

  if (/EDNS|ENOTFOUND|ETIMEDOUT/.test(error.code || "")) {
    console.log(
      "\nThe mail server could not be reached at all." +
        " Check EMAIL_HOST, or a firewall blocking port " +
        (env.EMAIL_PORT || 465) + ".",
    );
  }

  process.exit(1);
}
