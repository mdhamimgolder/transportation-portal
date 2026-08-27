import { requireRole } from "@/lib/rbac/guards";
import { Role } from "@/lib/constants/enums";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ProfileHeroCard } from "@/components/shared/profile-hero-card";
import { ChangePasswordForm } from "@/components/employee/change-password-form";

export default async function FacilitiesProfilePage() {
  const session = await requireRole([Role.FACILITIES]);

  const user = await prisma.user.findUniqueOrThrow({
    where: { id: session.id },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Profile Settings</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Manage your account information and security preferences
        </p>
      </div>

      {/* Hero Card */}
      <ProfileHeroCard user={user} />

      {/* Two Column Layout */}
      <div className="grid gap-6 lg:grid-cols-[1fr_0.67fr]">
        {/* Left Column - Empty for balance (60%) */}
        <div className="space-y-6">
          <Card className="p-4 border-slate-700">
            <CardContent className="py-8 flex flex-col items-center justify-center text-center">
              <p className="text-sm text-muted-foreground">
                Profile management is handled by Super Admin
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Right Column - Password (40%) */}
        <Card>
          <CardHeader>
            <CardTitle>Security</CardTitle>
            <p className="text-xs text-muted-foreground mt-2">
              Update your password to keep your account secure
            </p>
          </CardHeader>
          <CardContent>
            <ChangePasswordForm />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
