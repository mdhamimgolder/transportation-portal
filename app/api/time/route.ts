import { NextResponse } from "next/server";
import { startOfToday, toUtcMidnight } from "@/lib/date/week";

/**
 * Authoritative server clock for Dhaka-wall-clock business rules.
 *
 * Ad-hoc eligibility (3-hour notice) must NOT trust the device clock — users
 * can have wrong time/timezone, which either hides valid arrival slots or
 * lets an ineligible slot through client-side filtering. Clients fetch this
 * endpoint once on mount and derive "now" from the server instant plus
 * monotonic elapsed time, so a wrong device clock cannot skew the cutoff.
 * Server Actions remain the final enforcer (they use the server clock too).
 *
 * Public (no session needed): returns only timestamps, no user data.
 *   200 { now, todayKey, timeZone }
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const now = new Date();
  const todayKey = toUtcMidnight(startOfToday());
  return NextResponse.json(
    {
      now: now.toISOString(),
      todayKey: todayKey.toISOString(),
      timeZone: "Asia/Dhaka",
    },
    {
      headers: {
        // Fresh every fetch; CDN-safe but never stale for eligibility.
        "Cache-Control": "no-store",
      },
    }
  );
}
