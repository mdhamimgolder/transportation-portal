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
import { ProfileDetailsCard } from "@/components/shared/profile-details-card";
import { ProfileUpdateForm } from "@/components/employee/profile-update-form";
import { ChangePasswordForm } from "@/components/employee/change-password-form";

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

      <ProfileDetailsCard user={user} showPickupPoint />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Update Profile</CardTitle>
          <p className="text-xs text-muted-foreground">
            Address and Contact Number changes are sent to Operation-Admin
            for review. Pick-up Point changes are sent to Facilities for
            review.
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

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Change Password</CardTitle>
        </CardHeader>
        <CardContent>
          <ChangePasswordForm />
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
