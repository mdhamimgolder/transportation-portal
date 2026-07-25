import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

function ProfileField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="text-sm">{value}</p>
    </div>
  );
}

export function ProfileDetailsCard({
  user,
  showPickupPoint = false,
}: {
  user: {
    employeeCode: string | null;
    department: string | null;
    fullName: string;
    email: string;
    contactNumber: string | null;
    address: string | null;
    pickupPoint?: string | null;
  };
  showPickupPoint?: boolean;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Profile Details</CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <ProfileField label="Employee ID" value={user.employeeCode ?? "—"} />
        <ProfileField label="Department" value={user.department ?? "—"} />
        <ProfileField label="Name" value={user.fullName} />
        <ProfileField label="Email" value={user.email} />
        <ProfileField label="Contact Number" value={user.contactNumber ?? "—"} />
        {showPickupPoint ? (
          <ProfileField label="Pick-up Point" value={user.pickupPoint ?? "—"} />
        ) : null}
        <div className="sm:col-span-2">
          <ProfileField label="Address" value={user.address ?? "—"} />
        </div>
      </CardContent>
    </Card>
  );
}
