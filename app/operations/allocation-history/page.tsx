import { requireRole } from "@/lib/rbac/guards";
import { Role } from "@/lib/constants/enums";
import { getAllocationHistory } from "@/lib/queries/allocation-history";
import { AllocationHistorySearch } from "@/components/shared/allocation-history-search";
import { AllocationHistoryTable } from "@/components/shared/allocation-history-table";

export default async function OperationsAllocationHistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  await requireRole([Role.OPERATIONS]);
  const { q } = await searchParams;
  const rows = await getAllocationHistory(q);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Allocation History</h1>
        <p className="text-sm text-muted-foreground">
          Past driver and vehicle assignments across weekly and ad-hoc requests.
        </p>
      </div>
      <AllocationHistorySearch />
      <AllocationHistoryTable rows={rows} />
    </div>
  );
}
