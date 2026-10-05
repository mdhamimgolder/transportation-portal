import { requireRole } from "@/lib/rbac/guards";
import { Role } from "@/lib/constants/enums";
import { prisma } from "@/lib/prisma";
import { getUserNamesByIds } from "@/lib/queries/user-names";
import { AdHocTable } from "@/components/operations/adhoc-table";

export default async function OperationsAdHocPage() {
  await requireRole([Role.OPERATIONS]);

  const requests = await prisma.adHocRequest.findMany({
    include: { employee: true, routeAssignment: true },
    orderBy: { createdAt: "desc" },
    take: 500,
  });

  const reviewerNames = await getUserNamesByIds(requests.map((r) => r.reviewedById));
  const rows = requests.map((request) => ({
    ...request,
    reviewerName: request.reviewedById
      ? reviewerNames.get(request.reviewedById) ?? null
      : null,
  }));

  const employees = await prisma.user.findMany({
    where: { role: Role.EMPLOYEE, isActive: true },
    select: {
      id: true,
      fullName: true,
      employeeCode: true,
      email: true,
      contactNumber: true,
      address: true,
    },
    orderBy: { fullName: "asc" },
  });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Ad-hoc Transport</h1>
        <p className="text-sm text-muted-foreground">
          Approve or decline single-day requests. Approved requests go to
          Facilities for vehicle assignment.
        </p>
      </div>

      <AdHocTable requests={rows} employees={employees} />
    </div>
  );
}
