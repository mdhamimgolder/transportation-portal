import { requireRole } from "@/lib/rbac/guards";
import { Role } from "@/lib/constants/enums";
import { prisma } from "@/lib/prisma";
import {
  AddressApprovalCard,
  type AddressApprovalRow,
} from "@/components/operations/address-approval-card";
import {
  ContactApprovalCard,
  type ContactApprovalRow,
} from "@/components/operations/contact-approval-card";
import {
  PickupPointApprovalCard,
  type PickupPointApprovalRow,
} from "@/components/operations/pickup-point-approval-card";

export default async function ProfileApprovalsPage() {
  await requireRole([Role.OPERATIONS]);

  const [addressRequests, contactRequests, pickupPointRequests] = await Promise.all([
    prisma.addressChangeRequest.findMany({
      include: { employee: true },
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    }),
    prisma.contactChangeRequest.findMany({
      include: { employee: true },
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    }),
    prisma.pickupPointChangeRequest.findMany({
      include: { employee: true },
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    }),
  ]);

  const addressRows: AddressApprovalRow[] = addressRequests.map((r) => ({
    id: r.id,
    status: r.status,
    oldAddress: r.oldAddress,
    newAddress: r.newAddress,
    rejectReason: r.rejectReason,
    createdAt: r.createdAt.toISOString(),
    employee: {
      fullName: r.employee.fullName,
      employeeCode: r.employee.employeeCode,
      email: r.employee.email,
    },
  }));

  const contactRows: ContactApprovalRow[] = contactRequests.map((r) => ({
    id: r.id,
    status: r.status,
    oldContactNumber: r.oldContactNumber,
    newContactNumber: r.newContactNumber,
    rejectReason: r.rejectReason,
    createdAt: r.createdAt.toISOString(),
    employee: {
      fullName: r.employee.fullName,
      employeeCode: r.employee.employeeCode,
      email: r.employee.email,
    },
  }));

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

  const pendingAddressCount = addressRows.filter((r) => r.status === "PENDING").length;
  const pendingContactCount = contactRows.filter((r) => r.status === "PENDING").length;
  const pendingPickupPointCount = pickupPointRows.filter((r) => r.status === "PENDING").length;
  const totalPending = pendingAddressCount + pendingContactCount + pendingPickupPointCount;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Profile Approval Hub</h1>
        <p className="text-sm text-muted-foreground">
          {totalPending} pending request{totalPending === 1 ? "" : "s"}
        </p>
      </div>

      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-muted-foreground">
          Address Change Requests ({pendingAddressCount} pending)
        </h2>
        {addressRows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No address change requests yet.
          </p>
        ) : (
          <div className="space-y-3">
            {addressRows.map((row) => (
              <AddressApprovalCard key={row.id} row={row} />
            ))}
          </div>
        )}
      </div>

      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-muted-foreground">
          Contact Number Change Requests ({pendingContactCount} pending)
        </h2>
        {contactRows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No contact number change requests yet.
          </p>
        ) : (
          <div className="space-y-3">
            {contactRows.map((row) => (
              <ContactApprovalCard key={row.id} row={row} />
            ))}
          </div>
        )}
      </div>

      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-muted-foreground">
          Pick-up Point Change Requests ({pendingPickupPointCount} pending)
        </h2>
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
