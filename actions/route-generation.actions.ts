"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/rbac/guards";
import { Role, WeeklyScheduleStatus } from "@/lib/constants/enums";
import { ARRIVAL_TIME_OPTIONS } from "@/lib/constants/arrival-times";
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
} from "@/lib/routing/algorithms";
import { trainRoutePlannerFromHistory } from "@/actions/route-learning.actions";
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
   * generation. Never blocks mapping — the 5 min/km estimate is the fallback. */
  learning: {
    success: boolean;
    legCount: number;
    observationCount: number;
    confidentLegs: number;
    error?: string;
  };
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

const ARRIVAL_VALUE_LABELS = Object.fromEntries(
  ARRIVAL_TIME_OPTIONS.map((o) => [o.value, o.label])
);

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
      isActive: true,
    },
    select: { id: true, fixedArrivalTime: true },
  });
  if (fixedUsers.length === 0) return 0;

  const weekDates = getWeekDays(weekStartDate);
  let ensured = 0;
  for (const user of fixedUsers) {
    const arrivalTime = user.fixedArrivalTime;
    if (!arrivalTime) continue;
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
    for (let dayOfWeek = 1; dayOfWeek <= 5; dayOfWeek++) {
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
    }
  }
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

    // Fixed-arrival employees ride every mapped week at their locked arrival
    // time — upsert their standing schedule days before generating.
    await ensureFixedArrivalSchedules(weekStartDate);

    // Auto-"Learn from history": every mapping run first rebuilds the learned
    // pickup-gap set from all historical route plans, so the fresh plan uses
    // the real-world signal without a manual button click. A failed refresh
    // never blocks mapping — the 5 min/km distance estimate is the fallback.
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

    // Idempotency: drop previously generated draft routes for this week so a
    // re-run produces a clean sheet. Finalized/executed plans are untouched.
    try {
      await prisma.routePlan.deleteMany({
        where: {
          weekStartDate,
          status: { in: ["DRAFT", "UNDER_REVIEW"] },
        },
      });
    } catch (error) {
      throw new Error(
        `Failed to clear previous draft routes: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }

    // Generate routes for each day (Monday = 0, Friday = 4)
    for (let dayOfWeek = 0; dayOfWeek < 5; dayOfWeek++) {
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
        const errorMsg =
          dayError instanceof Error ? dayError.message : String(dayError);
        details.errors10PM.push(`Day ${dayOfWeek + 1}: ${errorMsg}`);
        summary.totalErrors++;
      }
    }

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
    const errorMsg =
      error instanceof Error ? error.message : "Unknown error occurred";
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
    throw new Error(
      `Failed to fetch pending routes: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
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
    throw new Error(
      `Failed to fetch route stats: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
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
  dayOfWeek: number;
  arrivalTime: string;
  routeType: string;
  status: string;
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

/**
 * Full day-by-day breakdown of every RoutePlan generated for a week, grouped
 * by day (Monday-Friday). Used by the Auto Route Planner to show exactly which
 * employees are on which vehicle per shift, with their pickup times.
 */
export async function getGeneratedRouteDetails(
  weekStartDateStr: string
): Promise<GeneratedRouteDay[]> {
  await requireRole([Role.FACILITIES, Role.SUPER_ADMIN]);

  const weekStartDate = toUtcMidnight(
    getMondayOfWeek(parseDayString(weekStartDateStr))
  );

  const plans = await prisma.routePlan.findMany({
    where: { weekStartDate },
    include: {
      vehicle: true,
      tripAssignments: {
        include: {
          employee: true,
          pickupAddress: true,
          pickupPoint: { include: { address: true } },
        },
        orderBy: { sequenceInTrip: "asc" },
      },
    },
    orderBy: [
      { dayOfWeek: "asc" },
      { arrivalTime: "asc" },
      { vehicle: { vehicleNumber: "asc" } },
    ],
  });

  const byDay = new Map<number, GeneratedRouteDetail[]>();
  for (const plan of plans) {
    const office = officeCoordinatesFor(plan.officeLocation ?? plan.vehicle.officeLocation);
    const arrivalRef = arrivalRefMinutes(plan.arrivalTime);
    const tripMinutes = plan.tripAssignments.map((t) =>
      t.pickupTime ? hhmmToMinutes(t.pickupTime) : null
    );
    const firstPickupMin =
      tripMinutes.find((m) => m != null) ?? null;
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
    const detail: GeneratedRouteDetail = {
      id: plan.id,
      dayOfWeek: plan.dayOfWeek,
      arrivalTime: plan.arrivalTime,
      routeType: plan.routeType,
      status: plan.status,
      routeAnalysis,
      appliedCandidateId: plan.appliedCandidateId ?? null,
      departureTime: plan.departureTime
        ? plan.departureTime.toISOString()
        : null,
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
        } else if (t.pickupType === "HOME_ADDRESS") {
          pickupLocationLabel =
            t.pickupAddress?.addressText ?? t.employee.address ?? null;
        } else {
          pickupLocationLabel =
            t.pickupAddress?.addressText ?? t.employee.address ?? null;
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
          pickupLat:
            t.pickupType === "PRESET_POINT"
              ? (t.pickupPoint?.address?.latitude ?? null)
              : (t.pickupAddress?.latitude ?? null),
          pickupLng:
            t.pickupType === "PRESET_POINT"
              ? (t.pickupPoint?.address?.longitude ?? null)
              : (t.pickupAddress?.longitude ?? null),
          travelFromPreviousMin: fromPrevious,
          travelToOfficeMin: toOffice,
          approachBearing: t.approachBearing ?? null,
        };
      }),
    };

    const bucket = byDay.get(plan.dayOfWeek) ?? [];
    bucket.push(detail);
    byDay.set(plan.dayOfWeek, bucket);
  }

  return Array.from({ length: 5 }, (_, idx) => ({
    dayOfWeek: idx,
    dayLabel: DAY_LABELS[idx],
    routes: byDay.get(idx) ?? [],
  }));
}