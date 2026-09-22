import { PrismaClient } from "@prisma/client";

/* ============================================================
   ONE PRISMA CLIENT

   There used to be two here. A cached one was built behind the
   global, and then a second was built unconditionally and made
   the default export, which is the one every route and model
   imports. So the cache never applied to anything: in
   development each hot reload left another client, and its
   connection pool, behind; in production the app opened two
   pools where it needed one.

   Now there is a single client, cached on the global in
   development so reloads reuse it. Both export names point at
   it, since existing files import it either way.
   ============================================================ */

declare global {
  var __db: PrismaClient | undefined;
}

const prisma =
  global.__db ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  global.__db = prisma;
}

export default prisma;
export { prisma as db };
