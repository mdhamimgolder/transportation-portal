"use client";

import { Truck, Plus, MapPin, ArrowDown } from "lucide-react";
import { useDroppable } from "@dnd-kit/core";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import type { VehicleGroup } from "./hooks/useVehicleGroups";

interface EmptyVehicleDropZoneProps {
  group: VehicleGroup;
  isDragActive: boolean;
  onDrop: (tripId: string) => void;
}

export function EmptyVehicleDropZone({
  group,
  isDragActive,
}: EmptyVehicleDropZoneProps) {
  const { setNodeRef } = useDroppable({
    id: `vehicle-${group.vehicleId}`,
    disabled: !isDragActive,
  });

  const vehicleNumber = group.vehicleNumber ?? "—";
  const vehicleType = group.vehicleType ?? "";
  const capacity = group.capacity ? ` · ${group.capacity} seats` : "";
  const driver = group.driverName ? ` · ${group.driverName}` : "";
  const office = group.officeLocation ?? "Regnum";

  return (
    <Card
      ref={setNodeRef}
      className={`border-dashed transition-all duration-200 ${
        isDragActive
          ? "border-teal/50 bg-teal/5 shadow-lg"
          : "border-border hover:border-teal/30"
      }`}
    >
      <CardContent className="py-8 px-6">
        <div className="flex flex-col items-center gap-4 text-center">
          <div
            className={`flex items-center justify-center size-16 rounded-full transition-all duration-200 ${
              isDragActive
                ? "bg-teal/10 text-teal border-2 border-teal/50"
                : "bg-muted/50 text-muted-foreground"
            }`}
          >
            <Truck className="size-8" />
          </div>

          <div className="space-y-1">
            <p className="font-semibold text-lg">{vehicleNumber}</p>
            <p className="text-xs text-muted-foreground flex items-center justify-center gap-1">
              {vehicleType}{capacity}{driver}
              <span className="mx-1">·</span>
              <MapPin className="size-3" />
              {office}
            </p>
          </div>

          {isDragActive && (
            <div className="flex flex-col items-center gap-2 pt-2">
              <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-teal/10 text-teal border border-teal/30 animate-pulse">
                <ArrowDown className="size-4 animate-bounce" />
                <span className="font-medium">Drop employee here to map this vehicle</span>
              </div>
              <Badge variant="secondary" className="gap-1">
                <Plus className="size-3" />
                Creates new route on drop
              </Badge>
            </div>
          )}

          {!isDragActive && (
            <p className="text-xs text-muted-foreground italic">
              Drag an employee from another vehicle here
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}