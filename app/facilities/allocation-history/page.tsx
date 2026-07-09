import { requireRole } from "@/lib/rbac/guards";
import { Role } from "@/lib/constants/enums";
import { getAllocationHistory } from "@/lib/queries/allocation-history";
import { AllocationHistoryFilters } from "@/components/shared/allocation-history-filters";
import { AllocationHistoryTable } from "@/components/shared/allocation-history-table";

export default async function FacilitiesAllocationHistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; type?: string; from?: string; to?: string }>;
}) {
  await requireRole([Role.FACILITIES]);
  const { q, type, from, to } = await searchParams;
  const rows = await getAllocationHistory({ q, type, from, to });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Allocation History</h1>
        <p className="text-sm text-muted-foreground">
          Select a report type to view past driver and vehicle assignments.
        </p>
      </div>
      <AllocationHistoryFilters />
      {type === "weekly" || type === "adhoc" ? (
        <AllocationHistoryTable rows={rows} showTypeColumn={false} />
      ) : (
        <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
          Select Weekly Schedule or Ad-hoc Request above to view records.
        </p>
      )}
    </div>
  );
}
