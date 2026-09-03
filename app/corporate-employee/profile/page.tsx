import { requireRole } from "@/lib/rbac/guards";
import { Role } from "@/lib/constants/enums";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/shared/status-badge";
import { ProfileHeroCard } from "@/components/shared/profile-hero-card";
import { ProfileUpdateForm } from "@/components/employee/profile-update-form";
import { ChangePasswordForm } from "@/components/employee/change-password-form";
import { formatDistanceToNow } from "date-fns";

export default async function CorporateEmployeeProfilePage() {
  const session = await requireRole([Role.CORPORATE_EMPLOYEE]);

  const user = await prisma.user.findUniqueOrThrow({
    where: { id: session.id },
  });

  const pickupPointChangeRequests = await prisma.pickupPointChangeRequest.findMany({
    where: { employeeId: session.id },
    orderBy: { createdAt: "desc" },
  });

  const combinedHistory = [
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
      <div>
        <h1 className="text-2xl font-bold">Profile Settings</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Manage your account information and security preferences
        </p>
      </div>

      {/* Hero Card */}
      <ProfileHeroCard
        user={user}
        showPickupPoint
      />

      {/* Two Column Layout */}
      <div className="grid gap-6 lg:grid-cols-[1fr_0.67fr]">
        {/* Left Column - Update Profile (60%) */}
        <Card>
          <CardHeader>
            <CardTitle>Update Profile</CardTitle>
            <p className="text-xs text-muted-foreground mt-2">
              Address and Contact Number changes apply immediately. Pick-up Point changes are sent to Facilities for review.
            </p>
          </CardHeader>
          <CardContent>
            <ProfileUpdateForm
              pickupPoint={user.pickupPoint}
              address={user.address}
              contactNumber={user.contactNumber}
            />
          </CardContent>
        </Card>

        {/* Right Column - Password & History (40%) */}
        <div className="space-y-4">
          {/* Change Password */}
          <Card>
            <CardHeader>
              <CardTitle>Security</CardTitle>
            </CardHeader>
            <CardContent>
              <ChangePasswordForm />
            </CardContent>
          </Card>

          {/* Change Request History */}
          {combinedHistory.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Change History</CardTitle>
                <p className="text-xs text-muted-foreground mt-2">
                  Recent pick-up point change requests
                </p>
              </CardHeader>
              <CardContent className="space-y-3 max-h-96 overflow-y-auto">
                {combinedHistory.map((entry) => (
                  <div
                    key={entry.id}
                    className="flex flex-col gap-2 pb-3 border-b last:border-0 last:pb-0 hover:bg-slate-50 p-2 -m-2 rounded transition-colors"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-muted-foreground">
                          {entry.field}
                        </p>
                        <p className="text-sm truncate">{entry.value}</p>
                      </div>
                      <StatusBadge status={entry.status} />
                    </div>
                    <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                      <span>{formatDistanceToNow(entry.createdAt, { addSuffix: true })}</span>
                    </div>
                    {entry.status === "REJECTED" && entry.rejectReason && (
                      <p className="text-xs text-destructive bg-red-50 p-1.5 rounded">
                        {entry.rejectReason}
                      </p>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
