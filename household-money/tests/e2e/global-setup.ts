import { execSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";

/**
 * Fresh E2E database: apply migrations, empty every table, seed the deterministic demo household.
 * Safety: refuses to touch any database whose name doesn't end in _e2e or _test.
 */
export default async function globalSetup() {
  const url = process.env.E2E_DATABASE_URL;
  if (!url)
    throw new Error(
      "Set E2E_DATABASE_URL to a dedicated, disposable database (name ending in _e2e)",
    );
  const dbName = new URL(url).pathname.replace(/^\//, "");
  if (!/_(e2e|test)$/.test(dbName))
    throw new Error(`Refusing to wipe "${dbName}": E2E database name must end in _e2e or _test`);

  const env = { ...process.env, DATABASE_URL: url, DIRECT_URL: url, DEMO_MODE: "true" };
  execSync("npx prisma migrate deploy", { env, stdio: "inherit" });

  const db = new PrismaClient({ datasources: { db: { url } } });
  try {
    const tables = await db.$queryRaw<{ tablename: string }[]>`
      SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
    if (tables.length)
      await db.$executeRawUnsafe(
        `TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(", ")} CASCADE`,
      );
  } finally {
    await db.$disconnect();
  }
  execSync("npx tsx prisma/seed.ts", { env, stdio: "inherit" });
}
