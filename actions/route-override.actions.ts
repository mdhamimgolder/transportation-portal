"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/rbac/guards";
import { Role } from "@/lib/constants/enums";
import { sendMailBackground } from "@/lib/mailer";

/**
 * Reassign an employee to a different vehicle
 */
export async function reassignEmployeeToVehicle(
  tripAssignmentId: string,
  newVehicleId: string,
  reason?: string
) {
  try {
    const session = await requireRole([Role.FACILITIES, Role.SUPER_ADMIN]);

    // Get current assignment
    const currentAssignment = await prisma.tripAssignment.findUniqueOrThrow({
      where: { id: tripAssignmentId },
      include: {
        routePlan: true,
        vehicle: true,
        employee: true,
      },
    });

    // Validate new vehicle exists and has capacity
    const newVehicle = await prisma.vehicle.findUniqueOrThrow({
      where: { id: newVehicleId },
    });

    // Check capacity for the new vehicle on this route
    const currentCapacity = await prisma.tripAssignment.count({
      where: {
        routePlanId: currentAssignment.routePlanId,
        vehicleId: newVehicleId,
      },
    });

    // Max 5 for dynamic routes (11 PM+), no limit for 10 PM preset
    const isPreset = currentAssignment.routePlan.routeType === "PRESET_10PM";
    const maxCapacity = isPreset ? 999 : 5;

    if (currentCapacity >= maxCapacity) {
      throw new Error(
        `Vehicle ${newVehicle.vehicleNumber} is at capacity (${currentCapacity}/${maxCapacity})`
      );
    }

    // Save override audit
    const beforeState = {
      vehicleId: currentAssignment.vehicleId,
      pickupTime: currentAssignment.pickupTime,
      sequenceInTrip: currentAssignment.sequenceInTrip,
    };

    const afterState = {
      vehicleId: newVehicleId,
      pickupTime: currentAssignment.pickupTime,
      sequenceInTrip: currentCapacity + 1, // Will be the last in new vehicle
    };

    await prisma.routePlanOverride.create({
      data: {
        routePlanId: currentAssignment.routePlanId,
        changedById: session.id,
        changeType: "VEHICLE_REASSIGN",
        affectedEmployeeId: currentAssignment.employeeId,
        beforeState: JSON.stringify(beforeState),
        afterState: JSON.stringify(afterState),
        reason,
      },
    });

    // Update assignment
    const updated = await prisma.tripAssignment.update({
      where: { id: tripAssignmentId },
      data: {
        vehicleId: newVehicleId,
        sequenceInTrip: currentCapacity + 1,
        manuallyOverridden: true,
      },
      include: {
        vehicle: true,
        employee: true,
        routePlan: true,
      },
    });

    revalidatePath("/facilities/route-planning");

    return {
      success: true,
      message: `${updated.employee.fullName} reassigned to ${updated.vehicle.vehicleNumber}`,
      assignment: updated,
    };
  } catch (error) {
    throw new Error(
      `Failed to reassign employee: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}

/**
 * Adjust pickup time for an employee
 */
export async function adjustPickupTime(
  tripAssignmentId: string,
  newPickupTime: string,
  reason?: string
) {
  try {
    const session = await requireRole([Role.FACILITIES, Role.SUPER_ADMIN]);

    const currentAssignment = await prisma.tripAssignment.findUniqueOrThrow({
      where: { id: tripAssignmentId },
      include: {
        routePlan: true,
        employee: true,
      },
    });

    // Validate time format
    if (!/^\d{2}:\d{2}$/.test(newPickupTime)) {
      throw new Error("Invalid time format. Use HH:mm");
    }

    const beforeState = {
      pickupTime: currentAssignment.pickupTime,
    };

    const afterState = {
      pickupTime: newPickupTime,
    };

    await prisma.routePlanOverride.create({
      data: {
        routePlanId: currentAssignment.routePlanId,
        changedById: session.id,
        changeType: "PICKUP_TIME_ADJUST",
        affectedEmployeeId: currentAssignment.employeeId,
        beforeState: JSON.stringify(beforeState),
        afterState: JSON.stringify(afterState),
        reason,
      },
    });

    const updated = await prisma.tripAssignment.update({
      where: { id: tripAssignmentId },
      data: {
        pickupTime: newPickupTime,
        manuallyOverridden: true,
        emailSentAt: null, // Need to resend email with new time
      },
      include: {
        vehicle: true,
        employee: true,
        routePlan: true,
      },
    });

    revalidatePath("/facilities/route-planning");

    return {
      success: true,
      message: `Pickup time updated for ${updated.employee.fullName} to ${newPickupTime}`,
      assignment: updated,
    };
  } catch (error) {
    throw new Error(
      `Failed to adjust pickup time: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}

/**
 * Swap two employees between vehicles
 */
export async function swapEmployees(
  tripAssignmentId1: string,
  tripAssignmentId2: string,
  reason?: string
) {
  try {
    const session = await requireRole([Role.FACILITIES, Role.SUPER_ADMIN]);

    const assignment1 = await prisma.tripAssignment.findUniqueOrThrow({
      where: { id: tripAssignmentId1 },
      include: { employee: true, vehicle: true, routePlan: true },
    });

    const assignment2 = await prisma.tripAssignment.findUniqueOrThrow({
      where: { id: tripAssignmentId2 },
      include: { employee: true, vehicle: true, routePlan: true },
    });

    // Can only swap within same route
    if (assignment1.routePlanId !== assignment2.routePlanId) {
      throw new Error("Can only swap employees within the same route");
    }

    const beforeState = {
      emp1: { vehicleId: assignment1.vehicleId, time: assignment1.pickupTime },
      emp2: { vehicleId: assignment2.vehicleId, time: assignment2.pickupTime },
    };

    const afterState = {
      emp1: { vehicleId: assignment2.vehicleId, time: assignment2.pickupTime },
      emp2: { vehicleId: assignment1.vehicleId, time: assignment1.pickupTime },
    };

    await prisma.routePlanOverride.create({
      data: {
        routePlanId: assignment1.routePlanId,
        changedById: session.id,
        changeType: "EMPLOYEE_SWAP",
        beforeState: JSON.stringify(beforeState),
        afterState: JSON.stringify(afterState),
        reason,
      },
    });

    // Swap
    await prisma.tripAssignment.updateMany({
      where: {
        id: { in: [tripAssignmentId1, tripAssignmentId2] },
      },
      data: {
        manuallyOverridden: true,
        emailSentAt: null,
      },
    });

    await prisma.tripAssignment.update({
      where: { id: tripAssignmentId1 },
      data: {
        vehicleId: assignment2.vehicleId,
        pickupTime: assignment2.pickupTime,
      },
    });

    await prisma.tripAssignment.update({
      where: { id: tripAssignmentId2 },
      data: {
        vehicleId: assignment1.vehicleId,
        pickupTime: assignment1.pickupTime,
      },
    });

    revalidatePath("/facilities/route-planning");

    return {
      success: true,
      message: `${assignment1.employee.fullName} and ${assignment2.employee.fullName} swapped vehicles`,
    };
  } catch (error) {
    throw new Error(
      `Failed to swap employees: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}

/**
 * Finalize a route and send emails to employees
 */
export async function finalizeRoute(routePlanId: string) {
  try {
    await requireRole([Role.FACILITIES, Role.SUPER_ADMIN]);

    const routePlan = await prisma.routePlan.findUniqueOrThrow({
      where: { id: routePlanId },
      include: {
        vehicle: true,
        tripAssignments: {
          include: {
            employee: true,
            pickupAddress: true,
            pickupPoint: { include: { address: true } },
          },
        },
      },
    });

    // Mark route as finalized immediately
    const updated = await prisma.routePlan.update({
      where: { id: routePlanId },
      data: {
        status: "FINALIZED",
        finalizedAt: new Date(),
      },
    });

    // Send emails in background after response
    after(async () => {
      const results = await Promise.allSettled(
        routePlan.tripAssignments.map((assignment) => {
          const pickupLocation =
            assignment.pickupType === "PRESET_POINT" && assignment.pickupPoint
              ? assignment.pickupPoint.address?.addressText || "Pickup Point"
              : assignment.pickupAddress?.addressText || "Home Address";

          return sendMailBackground({
            to: assignment.employee.email,
            subject: `Your transport has been arranged - ${routePlan.arrivalTime}`,
            body: `Hi ${assignment.employee.fullName},

Your transport for ${routePlan.dayDate.toDateString()} has been arranged:

Arrival Time: ${routePlan.arrivalTime}
Pickup Time: ${assignment.pickupTime}
Pickup Location: ${pickupLocation}
Vehicle: ${routePlan.vehicle.vehicleNumber} (${routePlan.vehicle.vehicleType})
Driver: ${routePlan.vehicle.driverName || "TBD"}
Driver Contact: ${routePlan.vehicle.driverContact || "N/A"}

Please be ready at the pickup location at the scheduled time.

Best regards,
Facilities Team`,
            html: `
              <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                <h2 style="color: #1a1a2e;">Your Transport Has Been Arranged</h2>
                <p>Hi <strong>${assignment.employee.fullName}</strong>,</p>
                <p>Your transport for <strong>${routePlan.dayDate.toDateString()}</strong> has been arranged with the following details:</p>
                <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
                  <tr style="background: #f8f9fa;">
                    <td style="padding: 10px; border: 1px solid #dee2e6; font-weight: bold;">Arrival Time</td>
                    <td style="padding: 10px; border: 1px solid #dee2e6;">${routePlan.arrivalTime}</td>
                  </tr>
                  <tr>
                    <td style="padding: 10px; border: 1px solid #dee2e6; font-weight: bold;">Pickup Time</td>
                    <td style="padding: 10px; border: 1px solid #dee2e6;">${assignment.pickupTime}</td>
                  </tr>
                  <tr style="background: #f8f9fa;">
                    <td style="padding: 10px; border: 1px solid #dee2e6; font-weight: bold;">Pickup Location</td>
                    <td style="padding: 10px; border: 1px solid #dee2e6;">${pickupLocation}</td>
                  </tr>
                  <tr>
                    <td style="padding: 10px; border: 1px solid #dee2e6; font-weight: bold;">Vehicle</td>
                    <td style="padding: 10px; border: 1px solid #dee2e6;">${routePlan.vehicle.vehicleNumber} (${routePlan.vehicle.vehicleType})</td>
                  </tr>
                  <tr style="background: #f8f9fa;">
                    <td style="padding: 10px; border: 1px solid #dee2e6; font-weight: bold;">Driver</td>
                    <td style="padding: 10px; border: 1px solid #dee2e6;">${routePlan.vehicle.driverName || "TBD"}</td>
                  </tr>
                  <tr>
                    <td style="padding: 10px; border: 1px solid #dee2e6; font-weight: bold;">Driver Contact</td>
                    <td style="padding: 10px; border: 1px solid #dee2e6;">${routePlan.vehicle.driverContact || "N/A"}</td>
                  </tr>
                </table>
                <p>Please be ready at the pickup location at the scheduled time.</p>
                <p style="color: #6c757d; margin-top: 24px;">Best regards,<br><strong>Facilities Team</strong></p>
              </div>
            `,
          });
        })
      );

      const sentCount = results.filter((r) => r.status === "fulfilled").length;
      if (sentCount > 0) {
        await prisma.tripAssignment.updateMany({
          where: { routePlanId },
          data: { emailSentAt: new Date() },
        });
      }
      console.log(
        `[MAILER] Finalized route ${routePlanId}: ${sentCount}/${routePlan.tripAssignments.length} emails sent`
      );
    });

    revalidatePath("/facilities/route-planning");

    return {
      success: true,
      message: `Route finalized. Emails sending to ${routePlan.tripAssignments.length} employees.`,
      route: updated,
    };
  } catch (error) {
    throw new Error(
      `Failed to finalize route: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}

/**
 * Reject/cancel a draft route
 */
export async function cancelRoute(routePlanId: string, reason?: string) {
  try {
    await requireRole([Role.FACILITIES, Role.SUPER_ADMIN]);
    void reason;

    const routePlan = await prisma.routePlan.findUniqueOrThrow({
      where: { id: routePlanId },
      include: { vehicle: { select: { vehicleNumber: true } } },
    });

    if (routePlan.status !== "DRAFT" && routePlan.status !== "UNDER_REVIEW") {
      throw new Error(
        `Cannot cancel route with status ${routePlan.status}. Only DRAFT or UNDER_REVIEW routes can be cancelled.`
      );
    }

    // Delete all trip assignments for this route
    await prisma.tripAssignment.deleteMany({
      where: { routePlanId },
    });

    // Delete the route plan
    await prisma.routePlan.delete({
      where: { id: routePlanId },
    });

    revalidatePath("/facilities/route-planning");

    return {
      success: true,
      message: `Route cancelled: ${routePlan.vehicle.vehicleNumber || routePlan.id}`,
    };
  } catch (error) {
    throw new Error(
      `Failed to cancel route: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}

/**
 * Get route details with all assignments
 */
export async function getRouteDetails(routePlanId: string) {
  try {
    await requireRole([Role.FACILITIES, Role.SUPER_ADMIN]);

    const route = await prisma.routePlan.findUniqueOrThrow({
      where: { id: routePlanId },
      include: {
        vehicle: true,
        tripAssignments: {
          include: {
            employee: true,
            pickupAddress: true,
            pickupPoint: {
              include: { address: true },
            },
          },
          orderBy: { sequenceInTrip: "asc" },
        },
        overrides: {
          orderBy: { createdAt: "desc" },
        },
        previousRoutePlan: {
          include: { vehicle: true },
        },
      },
    });

    return route;
  } catch (error) {
    throw new Error(
      `Failed to fetch route details: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}
