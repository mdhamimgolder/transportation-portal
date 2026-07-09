import { requireRole } from "@/lib/rbac/guards";
import { Role } from "@/lib/constants/enums";
import { prisma } from "@/lib/prisma";
import {
  PickupPointApprovalCard,
  type PickupPointApprovalRow,
} from "@/components/facilities/pickup-point-approval-card";

export default async function FacilitiesProfileApprovalsPage() {
  await requireRole([Role.FACILITIES]);

  const pickupPointRequests = await prisma.pickupPointChangeRequest.findMany({
    include: { employee: true },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
  });

  const pickupPointRows: PickupPointApprovalRow[] = pickupPointRequests.map((r) => ({
    id: r.id,
    status: r.status,
    oldPickupPoint: r.oldPickupPoint,
    newPickupPoint: r.newPickupPoint,
    rejectReason: r.rejectReason,
    createdAt: r.createdAt.toISOString(),
    employee: {
      fullName: r.employee.fullName,
      employeeCode: r.employee.employeeCode,
      email: r.employee.email,
    },
  }));

  const pendingCount = pickupPointRows.filter((r) => r.status === "PENDING").length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-medium tracking-tight">
          Profile Approvals
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          {pendingCount} pending pick-up point change request
          {pendingCount === 1 ? "" : "s"}.
        </p>
      </div>

      <div className="space-y-3">
        {pickupPointRows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No pick-up point change requests yet.
          </p>
        ) : (
          <div className="space-y-3">
            {pickupPointRows.map((row) => (
              <PickupPointApprovalCard key={row.id} row={row} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
