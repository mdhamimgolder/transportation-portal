import { requireRole } from "@/lib/rbac/guards";
import { Role } from "@/lib/constants/enums";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ProfileDetailsCard } from "@/components/shared/profile-details-card";
import { ChangePasswordForm } from "@/components/employee/change-password-form";

export default async function OperationsProfilePage() {
  const session = await requireRole([Role.OPERATIONS]);

  const user = await prisma.user.findUniqueOrThrow({
    where: { id: session.id },
  });

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">My Profile</h1>

      <ProfileDetailsCard user={user} />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Change Password</CardTitle>
        </CardHeader>
        <CardContent>
          <ChangePasswordForm />
        </CardContent>
      </Card>
    </div>
  );
}
