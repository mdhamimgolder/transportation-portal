import { requireRole } from "@/lib/rbac/guards";
import { Role } from "@/lib/constants/enums";
import { getEmployeeDirectory } from "@/lib/queries/users";
import { UserInfoTable } from "@/components/facilities/user-info-table";

export default async function FacilitiesUserInfoPage() {
  await requireRole([Role.FACILITIES]);
  const employees = await getEmployeeDirectory();

  return <UserInfoTable employees={employees} />;
}