import { NextResponse } from "next/server";
import { env, isSet } from "@/lib/env";
import { testDb } from "@/lib/integrations/connection-tests";

/**
 * Public liveness/readiness probe. Reports only whether each integration is configured — never
 * values. The authenticated "deploy" test in Settings > Setup does the live calls.
 */
export async function GET() {
  const e = env();
  const dbResult = await testDb();
  const body = {
    status: dbResult.status === "ok" ? "ok" : "degraded",
    db: dbResult.status === "ok",
    configured: {
      plaid: isSet(e.PLAID_CLIENT_ID) && isSet(e.PLAID_SECRET),
      snaptrade: isSet(e.SNAPTRADE_CLIENT_ID) && isSet(e.SNAPTRADE_CONSUMER_KEY),
      claude: isSet(e.ANTHROPIC_API_KEY),
      gmail: isSet(e.GOOGLE_CLIENT_ID) && isSet(e.GOOGLE_CLIENT_SECRET),
      email: isSet(e.RESEND_API_KEY),
    },
  };
  return NextResponse.json(body, {
    status: body.db ? 200 : 503,
    headers: { "Cache-Control": "no-store" },
  });
}
