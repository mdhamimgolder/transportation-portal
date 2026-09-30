import "dotenv/config";
import { prisma } from "@/lib/prisma";

/**
 * REPAIR #2: the first PRESET_SEQUENCE_REPAIR re-derived pickup times from
 * the learned-leg table, which was itself polluted by the violations — times
 * drifted late (21:00 → 21:25 etc.). Restore each trip's ORIGINAL time from
 * the repair override's beforeState, then set every rider on a point to the
 * original time of that point's earliest-sequenced anchor rider. Re-assert
 * the preset order. Audited as PRESET_SEQUENCE_REPAIR_V2.
 */

const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri"];

interface BeforeEntry {
  name: string;
  seq: number;
  time: string;
}

function parseBefore(raw: string): BeforeEntry[] {
  // beforeState is JSON: { order: ["Name (#3@21:05)", ...] }
  const parsed = JSON.parse(raw) as { order?: string[] };
  return (parsed.order ?? []).map((chunk) => {
    const m = /^(.*)\(#(\d+)@([\d:]+)\)$/.exec(chunk.trim());
    if (!m) throw new Error(`Unparseable before entry: "${chunk}"`);
    return { name: m[1], seq: Number(m[2]), time: m[3] };
  });
}

async function main() {
  const overrides = await prisma.routePlanOverride.findMany({
    where: { changeType: "PRESET_SEQUENCE_REPAIR" },
    orderBy: { createdAt: "asc" },
  });

  let fixed = 0;
  for (const ov of overrides) {
    const plan = await prisma.routePlan.findUnique({
      where: { id: ov.routePlanId },
      include: {
        vehicle: { select: { vehicleNumber: true } },
        tripAssignments: {
          include: {
            employee: { select: { fullName: true } },
            pickupPoint: true,
          },
        },
      },
    });
    if (!plan) continue;
    const original = new Map<string, BeforeEntry>();
    for (const e of parseBefore(ov.beforeState)) original.set(e.name, e);

    const vehiclePoints = await prisma.pickupPoint.findMany({
      where: { vehicleId: plan.vehicleId, isActive: true },
      orderBy: { sequence: "asc" },
    });
    const resolveSeq = (t: (typeof plan.tripAssignments)[number]) => {
      const p = t.pickupPoint;
      if (t.pickupType !== "PRESET_POINT" || !p) return null;
      const byId = vehiclePoints.find((vp) => vp.id === p.id);
      if (byId) return byId.sequence;
      if (p.addressId) {
        const byAddr = vehiclePoints.find((vp) => vp.addressId === p.addressId);
        if (byAddr) return byAddr.sequence;
      }
      const name = p.name?.trim().toLowerCase();
      if (name) {
        const byName = vehiclePoints.find(
          (vp) => vp.name.trim().toLowerCase() === name
        );
        if (byName) return byName.sequence;
      }
      return null;
    };

    const current = [...plan.tripAssignments]
      .filter((t) => t.sequenceInTrip > 0)
      .sort((a, b) => a.sequenceInTrip - b.sequenceInTrip);
    const ordered = [...current].sort((a, b) => {
      const sa = resolveSeq(a) ?? Number.POSITIVE_INFINITY;
      const sb = resolveSeq(b) ?? Number.POSITIVE_INFINITY;
      return sa - sb;
    });

    // Point anchor time = the ORIGINAL time of the same-point rider whose
    // ORIGINAL sequenceInTrip was smallest (the pre-violation anchor rider).
    const anchorBySeq = new Map<number, BeforeEntry>();
    for (const t of current) {
      const seq = resolveSeq(t);
      if (seq == null) continue;
      const orig = original.get(t.employee.fullName);
      if (!orig) continue;
      const existing = anchorBySeq.get(seq);
      if (!existing || orig.seq < existing.seq) anchorBySeq.set(seq, orig);
    }
    const anchorTimeBySeq = new Map<number, string>();
    for (const [seq, anchor] of anchorBySeq) anchorTimeBySeq.set(seq, anchor.time);

    // Any trip we can't trace back to its original row makes the plan unsafe
    // to auto-correct — report and skip rather than guess.
    const missing = current.filter((t) => !original.has(t.employee.fullName));
    if (missing.length > 0) {
      console.log(
        `⚠️ ${plan.vehicle.vehicleNumber} ${plan.dayDate.toISOString().slice(0, 10)}: ${missing.length} rider(s) not found in the repair audit — skipped.`
      );
      continue;
    }

    const before = current.map(
      (t) => `${t.employee.fullName}(#${t.sequenceInTrip}@${t.pickupTime})`
    );
    const updates: ReturnType<typeof prisma.tripAssignment.update>[] = [];
    let changed = 0;
    const newTimeOf = (t: (typeof plan.tripAssignments)[number]) => {
      const seq = resolveSeq(t);
      if (seq != null && anchorTimeBySeq.has(seq)) return anchorTimeBySeq.get(seq)!;
      return original.get(t.employee.fullName)?.time ?? t.pickupTime;
    };
    ordered.forEach((t, i) => {
      const newTime = newTimeOf(t);
      if (newTime !== t.pickupTime || i + 1 !== t.sequenceInTrip) {
        changed++;
        updates.push(
          prisma.tripAssignment.update({
            where: { id: t.id },
            data: {
              sequenceInTrip: i + 1,
              pickupTime: newTime,
              emailSentAt: null,
            },
          })
        );
      }
    });
    const after = ordered.map(
      (t, i) =>
        `${t.employee.fullName}(point#${resolveSeq(t)}→#${i + 1}@${newTimeOf(t)})`
    );

    if (updates.length === 0) {
      console.log(
        `· ${DAY_NAMES[plan.dayOfWeek]} ${plan.vehicle.vehicleNumber} — already consistent, skipped.`
      );
      continue;
    }
    await prisma.$transaction([
      ...updates,
      prisma.routePlanOverride.create({
        data: {
          routePlanId: plan.id,
          changedById: "system",
          changeType: "PRESET_SEQUENCE_REPAIR_V2",
          beforeState: JSON.stringify({ order: before }),
          afterState: JSON.stringify({ order: after }),
          reason:
            "First repair re-derived times from the (violation-polluted) learned-leg table — restored each pickup point's original anchor time and synced same-point riders.",
        },
      }),
    ]);
    fixed++;
    console.log(
      `✅ ${DAY_NAMES[plan.dayOfWeek]} ${plan.dayDate.toISOString().slice(0, 10)} · ${plan.vehicle.vehicleNumber} · ${plan.status} — ${changed} trip(s) corrected`
    );
    console.log(`   restored: ${after.join(" → ")}`);
  }

  console.log(`\nV2 repairs applied to ${fixed} plan(s).`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
