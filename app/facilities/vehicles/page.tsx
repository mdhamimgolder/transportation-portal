import { requireRole } from "@/lib/rbac/guards";
import { Role } from "@/lib/constants/enums";
import { prisma } from "@/lib/prisma";
import { deactivateVehicleDriver } from "@/actions/vehicle-driver.actions";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { VehicleDriverFormDialog } from "@/components/facilities/vehicle-driver-form-dialog";
import { VehicleDriverBulkUploadDialog } from "@/components/facilities/vehicle-driver-bulk-upload-dialog";

export default async function VehiclesAndDriversPage() {
  await requireRole([Role.FACILITIES]);

  const records = await prisma.vehicleDriver.findMany({
    where: { isActive: true },
    orderBy: { driverName: "asc" },
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Vehicles &amp; Drivers</h1>
          <p className="text-sm text-muted-foreground">
            Master list used for route assignment.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <VehicleDriverBulkUploadDialog />
          <VehicleDriverFormDialog />
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Driver Name</TableHead>
              <TableHead>Contact Number</TableHead>
              <TableHead>Vehicle No</TableHead>
              <TableHead>Vendor</TableHead>
              <TableHead className="w-40">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {records.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground">
                  No vehicles or drivers yet.
                </TableCell>
              </TableRow>
            ) : (
              records.map((record) => (
                <TableRow key={record.id}>
                  <TableCell className="font-medium">{record.driverName}</TableCell>
                  <TableCell>{record.contactNumber}</TableCell>
                  <TableCell>{record.vehicleNumber}</TableCell>
                  <TableCell>{record.vendor}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <VehicleDriverFormDialog record={record} />
                      <form action={deactivateVehicleDriver}>
                        <input type="hidden" name="id" value={record.id} />
                        <Button type="submit" variant="ghost" size="sm">
                          Deactivate
                        </Button>
                      </form>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
