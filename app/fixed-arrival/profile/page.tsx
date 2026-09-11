import { requireRole } from "@/lib/rbac/guards";
import { Role } from "@/lib/constants/enums";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ProfileHeroCard } from "@/components/shared/profile-hero-card";
import { ProfileUpdateForm } from "@/components/employee/profile-update-form";
import { ChangePasswordForm } from "@/components/employee/change-password-form";

export default async function FixedArrivalProfilePage() {
  const session = await requireRole([Role.FIXED_ARRIVAL]);

  const user = await prisma.user.findUniqueOrThrow({
    where: { id: session.id },
  });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Profile Settings</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Manage your account information and security preferences
        </p>
      </div>

      <ProfileHeroCard user={user} showPickupPoint />

      <div className="grid gap-6 lg:grid-cols-[1fr_0.67fr]">
        <Card>
          <CardHeader>
            <CardTitle>Update Profile</CardTitle>
            <p className="text-xs text-muted-foreground mt-2">
              Address, Contact Number and Office Location changes apply
              immediately. Pick-up Point changes are sent to Facilities for
              review.
            </p>
          </CardHeader>
          <CardContent>
            <ProfileUpdateForm
              pickupPoint={user.pickupPoint}
              address={user.address}
              contactNumber={user.contactNumber}
              officeLocation={user.officeLocation}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Security</CardTitle>
          </CardHeader>
          <CardContent>
            <ChangePasswordForm />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}