import { requireRole } from "@/lib/rbac/guards";
import { Role } from "@/lib/constants/enums";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ProfileHeroCard } from "@/components/shared/profile-hero-card";
import { ChangePasswordForm } from "@/components/employee/change-password-form";

export default async function OperationsProfilePage() {
  const session = await requireRole([Role.OPERATIONS]);

  const user = await prisma.user.findUniqueOrThrow({
    where: { id: session.id },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Profile Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage your account information and security preferences
        </p>
      </div>

      <ProfileHeroCard user={user} />

      <Card>
        <CardHeader>
          <CardTitle>Security</CardTitle>
          <p className="mt-2 text-xs text-muted-foreground">
            Update your password to keep your account secure
          </p>
        </CardHeader>
        <CardContent>
          <ChangePasswordForm />
        </CardContent>
      </Card>
    </div>
  );
}
