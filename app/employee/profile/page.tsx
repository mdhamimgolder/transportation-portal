import { requireRole } from "@/lib/rbac/guards";
import {
  Role,
  AddressChangeStatus,
  ContactChangeStatus,
  PickupPointChangeStatus,
} from "@/lib/constants/enums";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/shared/status-badge";
import { ProfileUpdateForm } from "@/components/employee/profile-update-form";

function ProfileField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="text-sm">{value}</p>
    </div>
  );
}

export default async function ProfilePage() {
  const session = await requireRole([Role.EMPLOYEE]);

  const user = await prisma.user.findUniqueOrThrow({
    where: { id: session.id },
  });

  const [addressChangeRequests, contactChangeRequests, pickupPointChangeRequests] =
    await Promise.all([
      prisma.addressChangeRequest.findMany({
        where: { employeeId: session.id },
        orderBy: { createdAt: "desc" },
      }),
      prisma.contactChangeRequest.findMany({
        where: { employeeId: session.id },
        orderBy: { createdAt: "desc" },
      }),
      prisma.pickupPointChangeRequest.findMany({
        where: { employeeId: session.id },
        orderBy: { createdAt: "desc" },
      }),
    ]);

  const hasPendingAddressRequest = addressChangeRequests.some(
    (r) => r.status === AddressChangeStatus.PENDING
  );
  const hasPendingContactRequest = contactChangeRequests.some(
    (r) => r.status === ContactChangeStatus.PENDING
  );
  const hasPendingPickupPointRequest = pickupPointChangeRequests.some(
    (r) => r.status === PickupPointChangeStatus.PENDING
  );

  const combinedHistory = [
    ...addressChangeRequests.map((r) => ({
      id: r.id,
      field: "Address",
      value: r.newAddress,
      status: r.status,
      rejectReason: r.rejectReason,
      createdAt: r.createdAt,
    })),
    ...contactChangeRequests.map((r) => ({
      id: r.id,
      field: "Contact Number",
      value: r.newContactNumber,
      status: r.status,
      rejectReason: r.rejectReason,
      createdAt: r.createdAt,
    })),
    ...pickupPointChangeRequests.map((r) => ({
      id: r.id,
      field: "Pick-up Point",
      value: r.newPickupPoint,
      status: r.status,
      rejectReason: r.rejectReason,
      createdAt: r.createdAt,
    })),
  ].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">My Profile</h1>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Profile Details</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4">
          <ProfileField label="Employee ID" value={user.employeeCode ?? "—"} />
          <ProfileField label="Name" value={user.fullName} />
          <ProfileField label="Email" value={user.email} />
          <ProfileField
            label="Contact Number"
            value={user.contactNumber ?? "—"}
          />
          <ProfileField label="Pick-up Point" value={user.pickupPoint ?? "—"} />
          <div className="col-span-2">
            <ProfileField label="Address" value={user.address ?? "—"} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Update Profile</CardTitle>
          <p className="text-xs text-muted-foreground">
            Pick-up Point, Address, and Contact Number changes are all sent to
            Operations for review.
          </p>
        </CardHeader>
        <CardContent>
          <ProfileUpdateForm
            pickupPoint={user.pickupPoint}
            address={user.address}
            contactNumber={user.contactNumber}
            pickupPointDisabled={hasPendingPickupPointRequest}
            addressDisabled={hasPendingAddressRequest}
            contactNumberDisabled={hasPendingContactRequest}
          />
        </CardContent>
      </Card>

      {combinedHistory.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Change Request History</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {combinedHistory.map((entry) => (
              <div
                key={entry.id}
                className="flex flex-col gap-1 border-b pb-3 last:border-0 last:pb-0"
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm">
                    <span className="text-xs font-medium text-muted-foreground">
                      {entry.field}:
                    </span>{" "}
                    {entry.value}
                  </p>
                  <StatusBadge status={entry.status} />
                </div>
                {entry.status === "REJECTED" && entry.rejectReason ? (
                  <p className="text-xs text-muted-foreground">
                    Reason: {entry.rejectReason}
                  </p>
                ) : null}
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
