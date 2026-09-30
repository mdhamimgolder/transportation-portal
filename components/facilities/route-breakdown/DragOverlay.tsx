"use client";

import { useMemo } from "react";
import { DragOverlay } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { Truck } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface DragOverlayProps {
  activeDrag: {
    tripId: string;
    routeId: string;
    employeeName: string;
  } | null;
  vehicleGroups: Array<{
    vehicleId: string;
    vehicleNumber: string | null;
    shifts: Array<{ routeId: string }>;
  }>;
}

interface DragOverlayRenderProps {
  activatorEvent: Event | null;
  rect: { x: number; y: number; width: number; height: number } | null;
  transform: { x: number; y: number; scaleX: number; scaleY: number; rotation: number };
  transition: string | undefined;
}

export function CustomDragOverlay({
  activeDrag,
  vehicleGroups,
}: DragOverlayProps) {
  const { tripId, routeId, employeeName } = activeDrag ?? {
    tripId: "",
    routeId: "",
    employeeName: "",
  };

  const currentVehicle = useMemo(() => {
    if (!activeDrag) return null;
    for (const group of vehicleGroups) {
      for (const shift of group.shifts) {
        if (shift.routeId === routeId) {
          return group;
        }
      }
    }
    return null;
  }, [vehicleGroups, routeId]);

  const otherVehicles = useMemo(() => {
    if (!currentVehicle) return [];
    return vehicleGroups.filter((g) => g.vehicleId !== currentVehicle?.vehicleId);
  }, [vehicleGroups, currentVehicle?.vehicleId]);

  const renderOverlay = (props: DragOverlayRenderProps): React.ReactNode => {
    const { rect, transform, transition } = props;
    if (!rect) return null;

    const style: React.CSSProperties = {
      transform: CSS.Transform.toString(transform),
      transition,
      pointerEvents: "none",
      zIndex: 9999,
    };

    return (
      <div style={style} className="pointer-events-none">
        <div className="flex items-center gap-3 px-4 py-3 bg-white dark:bg-neutral-900 rounded-lg shadow-xl border ring-2 ring-teal/50">
          <div className="min-w-[200px]">
            <p className="font-semibold text-sm">{employeeName}</p>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              {currentVehicle && (
                <span>from {currentVehicle.vehicleNumber}</span>
              )}
            </div>
          </div>
          {otherVehicles.length > 0 && (
            <div className="ml-2 pl-2 border-l text-xs text-muted-foreground">
              <p className="font-medium">Drop on another vehicle:</p>
              <div className="flex flex-wrap gap-1 mt-1">
                {otherVehicles.map((v) => (
                  <Badge key={v.vehicleId} variant="outline" className="h-4 px-1.5">
                    <Truck className="size-3 mr-0.5" />
                    {v.vehicleNumber}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  if (!activeDrag) return null;

  return (
    <DragOverlay>
      {renderOverlay as unknown as React.ReactNode}
    </DragOverlay>
  );
}