"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/rbac/guards";
import { Role, WeeklyScheduleStatus } from "@/lib/constants/enums";
import {
  getMondayOfWeek,
  getWeekDays,
  toUtcMidnight,
  DAY_LABELS,
} from "@/lib/date/week";
import { officeCoordinatesFor } from "@/lib/constants/office-locations";
import {
  generate10PMRoutes,
  generate11PMRoutes,
  generate12AMPlus6AMRoutes,
  errorMessage,
} from "@/lib/routing/algorithms";
import { trainRoutePlannerFromHistory } from "@/actions/route-learning.actions";
import { Prisma } from "@/lib/generated/prisma/client";
import type { RouteAnalysis } from "@/lib/routing/route-analysis.types";

export interface GenerateRoutesResult {
  success: boolean;
  weekStartDate: string;
  summary: {
    routesGenerated10PM: number;
    routesGenerated11PM: number;
    routesGenerated12AMPlus: number;
    totalErrors: number;
  };
  details: {
    errors10PM: string[];
    errors11PM: string[];
    errors12AMPlus: string[];
  };
  /** Outcome of the automatic "Learn from history" refresh that runs before
   * generation. A failed refresh never blocks mapping, but routes whose legs
   * are untrained will error (pickup times come from trained legs only). */
  learning: {
    success: boolean;
    legCount: number;
    observationCount: number;
    confidentLegs: number;
    error?: string;
  };
  /** Which weekday a day-wise run scoped to (0=Mon .. 4=Fri). Absent for a
   * full-week run. */
  dayOfWeek?: number;
}

/** Parse a "yyyy-mm-dd" string as a LOCAL date (avoids UTC shift-off-by-one). */
function parseDayString(value: string): Date {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

/** Normalize a local-midnight Date to UTC midnight. Timestamps are stored in
 * UTC (`weekStartDate`, `weeklyScheduleDay.date`), so week-boundary lookups
 * must compare against UTC-midnight values regardless of the server's timezone.
 * (Shared implementation: lib/date/week.ts.) */

/**
 * Fixed-arrival employees (role FIXED_ARRIVAL) do not submit weekly
 * schedules — their one-time arrival choice on the User row is their standing
 * request. Before any mapping run, upsert an APPROVED weekly schedule plus
 * needs-transport days (Mon-Fri) for each of them, so the regular generators
 * pick them up by pickup point / home address automatically. Idempotent —
 * safe to call on every RUN MAPPING re-run.
 */
async function ensureFixedArrivalSchedules(weekStartDate: Date): Promise<number> {
  const fixedUsers = await prisma.user.findMany({
    where: {
      role: Role.FIXED_ARRIVAL,
      fixedArrivalTime: { not: null },
      fixedArrivalActive: true,
      isActive: true,
    },
    select: { id: true, fixedArrivalTime: true },
  });
  if (fixedUsers.length === 0) return 0;

  const weekDates = getWeekDays(weekStartDate);
  let ensured = 0;
  // Parallel upserts — every employee/day is an independent row keyed by
  // (employeeId, weekStartDate) / (weeklyScheduleId, dayOfWeek), so the
  // outcome is identical to the sequential loop, just without the latency.
  await Promise.all(
    fixedUsers.map(async (user) => {
      const arrivalTime = user.fixedArrivalTime;
      if (!arrivalTime) return;
      const schedule = await prisma.weeklySchedule.upsert({
        where: {
          employeeId_weekStartDate: { employeeId: user.id, weekStartDate },
        },
        update: {},
        create: {
          employeeId: user.id,
          weekStartDate,
          status: WeeklyScheduleStatus.APPROVED,
        },
      });
      await Promise.all(
        [1, 2, 3, 4, 5].map(async (dayOfWeek) => {
          await prisma.weeklyScheduleDay.upsert({
            where: {
              weeklyScheduleId_dayOfWeek: {
                weeklyScheduleId: schedule.id,
                dayOfWeek,
              },
            },
            update: {
              arrivalTime,
              needsTransport: true,
              date: weekDates[dayOfWeek - 1],
            },
            create: {
              weeklyScheduleId: schedule.id,
              dayOfWeek,
              date: weekDates[dayOfWeek - 1],
              arrivalTime,
              needsTransport: true,
            },
          });
          ensured++;
        })
      );
    })
  );
  return ensured;
}

/** Minutes-from-midnight reference for each arrival label (same day for 10/11
 * PM; late-night labels fall on the following calendar day, so 1440 + shift). */
const ARRIVAL_REF_MINUTES: Record<string, number> = {
  "10PM": 22 * 60,
  "11PM": 23 * 60,
  "12AM": 24 * 60,
  "1AM": 25 * 60,
  "2AM": 26 * 60,
  "3AM": 27 * 60,
  "4AM": 28 * 60,
  "5AM": 29 * 60,
  "6AM": 30 * 60,
};

function arrivalRefMinutes(label: string | null | undefined): number |
  null {
  const norm = (label ?? "").toUpperCase().replace(/\s+/g, "");
  return ARRIVAL_REF_MINUTES[norm] ?? null;
}

function hhmmToMinutes(time: string | null | undefined): number | null {
  if (!time) return null;
  const match = /^(\d{1,2}):(\d{2})$/.exec(time.trim());
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

/** The gap (minutes) forward from `a` to `b`, handling the midnight wrap that
 * late-night pickup times cross. Pickups are strictly increasing in drive
 * order, so the shortest forward gap is the true leg duration. */
function gapMinutes(a: number | null, b: number | null): number | null {
  if (a == null || b == null) return null;
  return (b - a + 1440) % 1440;
}

/**
 * Server action: Generate routes for a full week (Monday-Friday).
 * Called from the Auto Route Planner ("RUN MAPPING").
 *
 * Flow:
 * 1. Normalize & validate the week-start (Monday) date.
 * 2. Refresh the learned pickup-gap set from history (auto "Learn from
 *    history") — a failed refresh never blocks mapping.
 * 3. Clear any existing DRAFT/UNDER_REVIEW plans for the week (idempotent).
 * 4. Generate 10 PM preset routes, 11 PM dynamic routes, and 12 AM-6 AM
 *    dynamic routes for each weekday, using OSRM (no Google Maps key).
 * 5. Respect vehicles pinned in Route Setting (VehicleShiftAssignment).
 */
/** Shared generation core used by both the week-wise and the day-wise run
 *  mapping actions. Scoped to the given weekday indexes (0=Mon .. 4=Fri) —
 *  the draft-cleanup and the generation loop touch ONLY those days, so a
 *  single-day run never wipes the other days' draft routes.
 */
async function runRouteGeneration(weekStartDate: Date, dayIndexes: number[]) {
  // Fixed-arrival employees ride every mapped week at their locked arrival
  // time — upsert their standing schedule days before generating.
  await ensureFixedArrivalSchedules(weekStartDate);

  // Auto-"Learn from history": every mapping run first rebuilds the learned
  // pickup-gap set from all historical route plans, so the fresh plan uses
  // the real-world signal without a manual button click. A failed refresh
  // never blocks mapping, but untrained legs then error instead of being
  // estimated (pickup times come from trained legs only).
  const learning = await trainRoutePlannerFromHistory();

  const summary = {
    routesGenerated10PM: 0,
    routesGenerated11PM: 0,
    routesGenerated12AMPlus: 0,
    totalErrors: 0,
  };

  const details = {
    errors10PM: [] as string[],
    errors11PM: [] as string[],
    errors12AMPlus: [] as string[],
  };

  // Idempotency: drop previously generated draft routes for the scoped days
  // so a re-run produces a clean sheet. Finalized/executed plans are untouched.
  try {
    await prisma.routePlan.deleteMany({
      where: {
        weekStartDate,
        dayOfWeek: { in: dayIndexes },
        status: { in: ["DRAFT", "UNDER_REVIEW"] },
      },
    });
  } catch (error) {
    throw new Error(`Failed to clear previous draft routes: ${errorMessage(error)}`);
  }

  // Generate routes for each scoped day (Monday = 0, Friday = 4)
  for (const dayOfWeek of dayIndexes) {
    try {
      const result10PM = await generate10PMRoutes(weekStartDate, dayOfWeek);
      summary.routesGenerated10PM += result10PM.routesCreated;
      if (result10PM.errors.length > 0) {
        details.errors10PM.push(...result10PM.errors);
        summary.totalErrors += result10PM.errors.length;
      }

      const result11PM = await generate11PMRoutes(weekStartDate, dayOfWeek);
      summary.routesGenerated11PM += result11PM.routesCreated;
      if (result11PM.errors.length > 0) {
        details.errors11PM.push(...result11PM.errors);
        summary.totalErrors += result11PM.errors.length;
      }

      const result12AMPlus = await generate12AMPlus6AMRoutes(
        weekStartDate,
        dayOfWeek
      );
      summary.routesGenerated12AMPlus += result12AMPlus.routesCreated;
      if (result12AMPlus.errors.length > 0) {
        details.errors12AMPlus.push(...result12AMPlus.errors);
        summary.totalErrors += result12AMPlus.errors.length;
      }
    } catch (dayError) {
      const errorMsg = errorMessage(dayError);
      details.errors10PM.push(`Day ${dayOfWeek + 1}: ${errorMsg}`);
      summary.totalErrors++;
    }
  }

  return { summary, details, learning };
}

export async function generateWeeklyRoutes(
  weekStartDateStr: string
): Promise<GenerateRoutesResult> {
  try {
    await requireRole([Role.FACILITIES, Role.SUPER_ADMIN]);

    const parsed = parseDayString(weekStartDateStr);
    if (isNaN(parsed.getTime())) {
      throw new Error("Invalid week start date format");
    }

    const weekStartDate = toUtcMidnight(getMondayOfWeek(parsed));

    const { summary, details, learning } = await runRouteGeneration(
      weekStartDate,
      [0, 1, 2, 3, 4]
    );

    revalidatePath("/facilities/route-planning");
    revalidatePath("/facilities/automated-route-planner");

    return {
      success: summary.totalErrors === 0,
      weekStartDate: weekStartDate.toISOString().split("T")[0],
      summary,
      details,
      learning: {
        success: learning.success,
        legCount: learning.legCount,
        observationCount: learning.observationCount,
        confidentLegs: learning.confidentLegs,
        error: learning.error,
      },
    };
  } catch (error) {
    const errorMsg = errorMessage(error);
    return {
      success: false,
      weekStartDate: weekStartDateStr,
      summary: {
        routesGenerated10PM: 0,
        routesGenerated11PM: 0,
        routesGenerated12AMPlus: 0,
        totalErrors: 1,
      },
      details: {
        errors10PM: [errorMsg],
        errors11PM: [],
        errors12AMPlus: [],
      },
      learning: {
        success: false,
        legCount: 0,
        observationCount: 0,
        confidentLegs: 0,
      },
    };
  }
}

/** Day-wise run mapping — generates route planning for ONE weekday of the
 *  given week only, leaving the other days' draft routes untouched.
 *  `dayIndex` is 0 = Monday .. 4 = Friday.
 */
export async function generateDayRoutes(
  weekStartDateStr: string,
  dayIndex: number
): Promise<GenerateRoutesResult> {
  try {
    await requireRole([Role.FACILITIES, Role.SUPER_ADMIN]);

    const parsed = parseDayString(weekStartDateStr);
    if (isNaN(parsed.getTime())) {
      throw new Error("Invalid week start date format");
    }
    if (!Number.isInteger(dayIndex) || dayIndex < 0 || dayIndex > 4) {
      throw new Error("Invalid day selected — pick a weekday (Mon-Fri)");
    }

    const weekStartDate = toUtcMidnight(getMondayOfWeek(parsed));

    const { summary, details, learning } = await runRouteGeneration(
      weekStartDate,
      [dayIndex]
    );

    revalidatePath("/facilities/route-planning");
    revalidatePath("/facilities/automated-route-planner");

    return {
      success: summary.totalErrors === 0,
      weekStartDate: weekStartDate.toISOString().split("T")[0],
      dayOfWeek: dayIndex,
      summary,
      details,
      learning: {
        success: learning.success,
        legCount: learning.legCount,
        observationCount: learning.observationCount,
        confidentLegs: learning.confidentLegs,
        error: learning.error,
      },
    };
  } catch (error) {
    const errorMsg = errorMessage(error);
    return {
      success: false,
      weekStartDate: weekStartDateStr,
      dayOfWeek: dayIndex,
      summary: {
        routesGenerated10PM: 0,
        routesGenerated11PM: 0,
        routesGenerated12AMPlus: 0,
        totalErrors: 1,
      },
      details: {
        errors10PM: [errorMsg],
        errors11PM: [],
        errors12AMPlus: [],
      },
      learning: {
        success: false,
        legCount: 0,
        observationCount: 0,
        confidentLegs: 0,
      },
    };
  }
}

export interface WeekRouteOverviewDay {
  dayOfWeek: number; // 0=Mon .. 4=Fri
  dayDate: string;
  approvedEmployees: number;
  routesGenerated: number;
  byShift: { "10PM": number; "11PM": number; "12AMPlus": number };
  finalized: number;
}

export type WeekRouteOverview = WeekRouteOverviewDay[];

/**
 * Summary of what exists (and what is planned) for each day of a week —
 * used by the Auto Route Planner before/after running mapping.
 */
export async function getWeekRouteOverview(
  weekStartDateStr: string
): Promise<WeekRouteOverview> {
  try {
    await requireRole([Role.FACILITIES, Role.SUPER_ADMIN]);

    const weekStartDate = toUtcMidnight(
      getMondayOfWeek(parseDayString(weekStartDateStr))
    );
    const days = getWeekDays(weekStartDate);

  const [approvedDays, routes] = await Promise.all([
    prisma.weeklyScheduleDay.findMany({
      where: {
        needsTransport: true,
        weeklySchedule: { status: "APPROVED", weekStartDate },
      },
      select: { dayOfWeek: true },
    }),
    prisma.routePlan.findMany({
      where: { weekStartDate },
      select: {
        dayOfWeek: true,
        arrivalTime: true,
        status: true,
      },
    }),
  ]);

  const approvedByDay = new Map<number, number>();
  for (const day of approvedDays) {
    approvedByDay.set(day.dayOfWeek, (approvedByDay.get(day.dayOfWeek) ?? 0) + 1);
  }

  return days.map((dayDate, idx) => {
      const dayRoutes = routes.filter((r) => r.dayOfWeek === idx);
      const isLateNight = (t: string) =>
        ["12 AM", "1 AM", "2 AM", "3 AM", "4 AM", "5 AM", "6 AM"].includes(t);
      return {
        dayOfWeek: idx,
        dayDate: dayDate.toISOString().split("T")[0],
        approvedEmployees: approvedByDay.get(idx + 1) ?? 0,
        routesGenerated: dayRoutes.length,
        byShift: {
          "10PM": dayRoutes.filter((r) => r.arrivalTime === "10 PM").length,
          "11PM": dayRoutes.filter((r) => r.arrivalTime === "11 PM").length,
          "12AMPlus": dayRoutes.filter((r) => isLateNight(r.arrivalTime)).length,
        },
        finalized: dayRoutes.filter((r) => r.status === "FINALIZED").length,
      };
    });
  } catch (error) {
    throw new Error(`Failed to load the week overview: ${errorMessage(error)}`);
  }
}

/**
 * Get pending routes for review (used by the Route Planning dashboard).
 */
export async function getPendingRoutes(dayDate: Date) {
  try {
    await requireRole([Role.FACILITIES, Role.SUPER_ADMIN]);

    const routes = await prisma.routePlan.findMany({
      where: {
        dayDate: {
          gte: new Date(dayDate.setHours(0, 0, 0, 0)),
          lt: new Date(dayDate.setHours(23, 59, 59, 999)),
        },
        status: { in: ["DRAFT", "UNDER_REVIEW"] },
      },
      include: {
        vehicle: true,
        tripAssignments: {
          include: {
            employee: true,
            pickupAddress: true,
          },
        },
        previousRoutePlan: true,
      },
      orderBy: [{ arrivalTime: "asc" }, { vehicleId: "asc" }],
    });

    return routes;
  } catch (error) {
    throw new Error(`Failed to fetch pending routes: ${errorMessage(error)}`);
  }
}

/**
 * Get route statistics for a day (used by the Route Planning dashboard).
 */
export async function getRouteDayStats(dayDate: Date) {
  try {
    await requireRole([Role.FACILITIES, Role.SUPER_ADMIN]);

    const startOfDay = new Date(dayDate.setHours(0, 0, 0, 0));
    const endOfDay = new Date(dayDate.setHours(23, 59, 59, 999));

    const routes = await prisma.routePlan.findMany({
      where: {
        dayDate: {
          gte: startOfDay,
          lte: endOfDay,
        },
      },
      include: {
        tripAssignments: true,
      },
    });

    return {
      totalRoutes: routes.length,
      routesByStatus: {
        draft: routes.filter((r) => r.status === "DRAFT").length,
        underReview: routes.filter((r) => r.status === "UNDER_REVIEW").length,
        finalized: routes.filter((r) => r.status === "FINALIZED").length,
        executed: routes.filter((r) => r.status === "EXECUTED").length,
      },
      routesByShift: {
        "10PM": routes.filter((r) => r.arrivalTime === "10 PM").length,
        "11PM": routes.filter((r) => r.arrivalTime === "11 PM").length,
        "12AMPlus": routes.filter((r) =>
          ["12 AM", "1 AM", "2 AM", "3 AM", "4 AM", "5 AM", "6 AM"].includes(
            r.arrivalTime
          )
        ).length,
      },
      totalEmployeesAssigned: routes.reduce(
        (sum, r) => sum + r.tripAssignments.length,
        0
      ),
      capacityUtilization: {
        avg: Math.round(
          (routes.reduce((sum, r) => sum + r.tripAssignments.length, 0) /
            (routes.length * 5)) *
            100
        ),
      },
    };
  } catch (error) {
    throw new Error(`Failed to fetch route stats: ${errorMessage(error)}`);
  }
}

export interface GeneratedRouteTrip {
  id: string;
  sequenceInTrip: number;
  pickupTime: string | null;
  employeeName: string;
  employeeCode: string | null;
  /** Role of the employee ("FIXED_ARRIVAL" rows highlight amber in the sheet). */
  employeeRole: string;
  pickupType: string;
  pickupLocationLabel: string | null;
  pickupLat: number | null;
  pickupLng: number | null;
  /** Drive minutes from the previous stop to this one (null for the first). */
  travelFromPreviousMin: number | null;
  /** Drive minutes from this stop to the office arrival. */
  travelToOfficeMin: number | null;
  /** Heading (° from north) the vehicle faces at this stop once a route
   * analysis candidate has been applied; null otherwise. */
  approachBearing: number | null;
}

export interface GeneratedRouteDetail {
  id: string;
  vehicleId: string;
  dayOfWeek: number;
  arrivalTime: string;
  routeType: string;
  status: string;
  /**
   * True when this card is a placeholder for a route-pinned vehicle that ended
   * the day with no route at all (never used). Rendered as a blank card so a
   * pinned vehicle is never silently missing from the breakdown.
   */
  pinnedNotMapped?: boolean;
  /** Cached route analysis (side-of-road + order candidates), if computed. */
  routeAnalysis: RouteAnalysis | null;
  appliedCandidateId: string | null;
  departureTime: string | null;
  estimatedCompletionTime: string | null;
  vehicle: {
    vehicleNumber: string | null;
    vehicleType: string | null;
    capacity: number | null;
    driverName: string | null;
    driverContact: string | null;
    officeLocation: string | null;
  };
  destination: { lat: number; lng: number; name: string } | null;
  /** Optimized drive time from the first pickup to the office arrival. */
  pickupDriveMinutes: number | null;
  /** Drive time from office departure to the first pickup. */
  departureToFirstMinutes: number | null;
  trips: GeneratedRouteTrip[];
}

export interface GeneratedRouteDay {
  dayOfWeek: number;
  dayLabel: string;
  routes: GeneratedRouteDetail[];
}

const PLAN_DETAIL_INCLUDE = {
  vehicle: true,
  tripAssignments: {
    include: {
      employee: true,
      pickupAddress: true,
      pickupPoint: { include: { address: true } },
    },
    orderBy: { sequenceInTrip: "asc" },
  },
} as const;

type PlanDetailRow = Prisma.RoutePlanGetPayload<{
  include: typeof PLAN_DETAIL_INCLUDE;
}>;

/** Map one RoutePlan row + its trips into the planner's route card shape.
 *  Shared by the week breakdown and the single-route refresh so the two can
 *  never drift apart. */
function mapPlanToDetail(plan: PlanDetailRow): GeneratedRouteDetail {
  const office = officeCoordinatesFor(plan.officeLocation ?? plan.vehicle.officeLocation);
  const arrivalRef = arrivalRefMinutes(plan.arrivalTime);
  const tripMinutes = plan.tripAssignments.map((t) =>
    t.pickupTime ? hhmmToMinutes(t.pickupTime) : null
  );
  const firstPickupMin = tripMinutes.find((m) => m != null) ?? null;
  const pickupDriveMinutes =
    arrivalRef != null && firstPickupMin != null
      ? gapMinutes(firstPickupMin, arrivalRef)
      : null;
  // Office → first pickup leg: total drive (completion − departure, both
  // stored with the same day base) minus the pickup leg.
  const departureToFirstMinutes =
    plan.departureTime &&
    plan.estimatedCompletionTime &&
    pickupDriveMinutes != null
      ? Math.max(
          0,
          Math.round(
            (plan.estimatedCompletionTime.getTime() -
              plan.departureTime.getTime()) /
              60000
          ) - pickupDriveMinutes
        )
      : null;
  const rawAnalysis = plan.routeAnalysis as unknown;
  const routeAnalysis =
    rawAnalysis &&
    typeof rawAnalysis === "object" &&
    (rawAnalysis as { version?: unknown }).version === 1
      ? (rawAnalysis as RouteAnalysis)
      : null;
  return {
    id: plan.id,
    dayOfWeek: plan.dayOfWeek,
    arrivalTime: plan.arrivalTime,
    routeType: plan.routeType,
    status: plan.status,
    vehicleId: plan.vehicleId,
    routeAnalysis,
    appliedCandidateId: plan.appliedCandidateId ?? null,
    departureTime: plan.departureTime ? plan.departureTime.toISOString() : null,
    estimatedCompletionTime: plan.estimatedCompletionTime
      ? plan.estimatedCompletionTime.toISOString()
      : null,
    vehicle: {
      vehicleNumber: plan.vehicle.vehicleNumber,
      vehicleType: plan.vehicle.vehicleType,
      capacity: plan.vehicle.capacity,
      driverName: plan.vehicle.driverName,
      driverContact: plan.vehicle.driverContact,
      officeLocation: plan.vehicle.officeLocation,
    },
    destination:
      plan.destinationLat && plan.destinationLng
        ? {
            lat: plan.destinationLat,
            lng: plan.destinationLng,
            name: office.name,
          }
        : null,
    pickupDriveMinutes,
    departureToFirstMinutes,
    trips: plan.tripAssignments.map((t, idx) => {
      const minutes = tripMinutes[idx];
      const fromPrevious =
        idx > 0 ? gapMinutes(tripMinutes[idx - 1], minutes) : null;
      const toOffice =
        minutes != null && arrivalRef != null
          ? gapMinutes(minutes, arrivalRef)
          : null;
      let pickupLocationLabel: string | null = null;
      if (t.pickupType === "PRESET_POINT") {
        pickupLocationLabel =
          t.pickupPoint?.name?.trim() ||
          t.pickupPoint?.address?.addressText ||
          null;
      } else {
        pickupLocationLabel =
          t.pickupAddress?.addressText ?? t.employee.address ?? null;
      }
      // Resolve the stop's rendered coordinates. PRESET points use the
      // pickup-registry Address (Facilities-maintained lat/lng) — never the
      // employee's home; everything else uses the assignment's pickup
      // Address. Placeholder (0, 0) rows count as missing (same rule the
      // route analysis applies), so a point without coordinates can never
      // draw a pin at 0, 0 — the map shows its "coordinates missing" state.
      let pickupLat: number | null = null;
      let pickupLng: number | null = null;
      if (t.pickupType === "PRESET_POINT") {
        pickupLat = t.pickupPoint?.address?.latitude ?? null;
        pickupLng = t.pickupPoint?.address?.longitude ?? null;
      } else {
        pickupLat = t.pickupAddress?.latitude ?? null;
        pickupLng = t.pickupAddress?.longitude ?? null;
      }
      if (pickupLat === 0 && pickupLng === 0) {
        pickupLat = null;
        pickupLng = null;
      }
      return {
        id: t.id,
        sequenceInTrip: t.sequenceInTrip,
        pickupTime: t.pickupTime,
        employeeName: t.employee.fullName,
        employeeCode: t.employee.employeeCode,
        employeeRole: t.employee.role,
        pickupType: t.pickupType,
        pickupLocationLabel,
        pickupLat,
        pickupLng,
        travelFromPreviousMin: fromPrevious,
        travelToOfficeMin: toOffice,
        approachBearing: t.approachBearing ?? null,
      };
    }),
  };
}

/** Full day-by-day breakdown of every RoutePlan generated for a week, grouped
 *  by day (Monday-Friday). Used by the Auto Route Planner to show exactly which
 *  employees are on which vehicle per shift, with their pickup times.
 */
export async function getGeneratedRouteDetails(
  weekStartDateStr: string
): Promise<GeneratedRouteDay[]> {
  try {
    await requireRole([Role.FACILITIES, Role.SUPER_ADMIN]);

    const weekStartDate = toUtcMidnight(
      getMondayOfWeek(parseDayString(weekStartDateStr))
    );

    const plans = await prisma.routePlan.findMany({
      where: { weekStartDate },
      include: PLAN_DETAIL_INCLUDE,
      orderBy: [
        { dayOfWeek: "asc" },
        { arrivalTime: "asc" },
        { vehicle: { vehicleNumber: "asc" } },
      ],
    });

    // Route-pinned vehicles for this week: those are the vehicles Facilities
    // committed to running every day, so a pinned vehicle that ends a day with
    // NO route must still show in the breakdown as a blank card — otherwise a
    // missed mapping silently disappears. Placeholders only appear when the
    // vehicle is unused for the whole day (never per-shift blanks).
    const pins = await prisma.vehicleShiftAssignment.findMany({
      where: { startDate: weekStartDate, isActive: true },
      include: { vehicle: true },
    });

    const byDay = new Map<number, GeneratedRouteDetail[]>();
    const usedByDay = new Map<number, Set<string>>();
    for (const plan of plans) {
      const detail = mapPlanToDetail(plan);
      const bucket = byDay.get(plan.dayOfWeek) ?? [];
      bucket.push(detail);
      byDay.set(plan.dayOfWeek, bucket);
      const used = usedByDay.get(plan.dayOfWeek) ?? new Set<string>();
      if (plan.vehicleId) used.add(plan.vehicleId);
      usedByDay.set(plan.dayOfWeek, used);
    }

    // Append one blank card per unused route-pinned vehicle (whole day unused).
    for (let idx = 0; idx < 5; idx++) {
      const used = usedByDay.get(idx) ?? new Set<string>();
      const bucket = byDay.get(idx) ?? [];
      for (const pin of pins) {
        if (used.has(pin.vehicleId)) continue;
        bucket.push({
          id: `pin-blank:${pin.vehicleId}:${idx}`,
          dayOfWeek: idx,
          arrivalTime: "Pinned",
          routeType: "PINNED_UNMAPPED",
          status: "NOT_MAPPED",
          pinnedNotMapped: true,
          routeAnalysis: null,
          appliedCandidateId: null,
          departureTime: null,
          estimatedCompletionTime: null,
          vehicleId: pin.vehicleId,
          vehicle: {
            vehicleNumber: pin.vehicle.vehicleNumber,
            vehicleType: pin.vehicle.vehicleType,
            capacity: pin.vehicle.capacity,
            driverName: pin.vehicle.driverName,
            driverContact: pin.vehicle.driverContact,
            officeLocation: pin.vehicle.officeLocation,
          },
          destination: null,
          pickupDriveMinutes: null,
          departureToFirstMinutes: null,
          trips: [],
        });
      }
      if (bucket.length) byDay.set(idx, bucket);
    }

    return Array.from({ length: 5 }, (_, idx) => ({
      dayOfWeek: idx,
      dayLabel: DAY_LABELS[idx],
      routes: byDay.get(idx) ?? [],
    }));
  } catch (error) {
    throw new Error(
      `Failed to load the generated routes: ${errorMessage(error)}`
    );
  }
}

/** Lightweight refresh of one route card after an in-place edit (pickup time,
 *  row reorder, employee move, apply, finalize) — the planner patches a single
 *  card instead of re-fetching the entire week on every change. */
export async function getRoutePlanDetail(
  routePlanId: string
): Promise<GeneratedRouteDetail | null> {
  try {
    await requireRole([Role.FACILITIES, Role.SUPER_ADMIN]);

    const plan = await prisma.routePlan.findUnique({
      where: { id: routePlanId },
      include: PLAN_DETAIL_INCLUDE,
    });
    if (!plan) return null;

    return mapPlanToDetail(plan);
  } catch (error) {
    throw new Error(
      `Failed to refresh the route: ${errorMessage(error)}`
    );
  }
}