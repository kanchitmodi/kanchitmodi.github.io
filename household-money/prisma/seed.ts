import { PrismaClient } from "@prisma/client";
import { seedDemoHousehold } from "../src/lib/demo/seed";
import { todayInToronto } from "../src/lib/finance";

async function main() {
  if (process.env.DEMO_MODE !== "true") {
    console.info("DEMO_MODE is not 'true' — skipping demo seed.");
    return;
  }
  const db = new PrismaClient();
  try {
    const endDate = process.env.DEMO_END_DATE ?? todayInToronto();
    const r = await seedDemoHousehold(db, { endDate });
    console.info(
      `Seeded demo household ${r.householdId} with ${r.txnCount} transactions (to ${endDate}).`,
    );
  } finally {
    await db.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
