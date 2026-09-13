"use client";

import { useCallback, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Check,
  ChevronLeft,
  ChevronRight,
  Pencil,
  Pin,
  Plus,
  Save,
  Search,
  Trash,
  Truck,
} from "lucide-react";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  SearchableCombobox,
  type ComboboxOption,
} from "@/components/ui/searchable-combobox";
import { createPickupPoint } from "@/actions/pickup-point.actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import {
  SHIFT_KEYS,
  SHIFT_LABELS,
} from "@/lib/constants/route-shifts";
import type { PinState, ShiftKey } from "@/lib/constants/route-shifts";
import {
  getVehicleShiftPins,
  reorderPickupPoints,
  toggleVehicleShiftPin,
  updateVehicle,
} from "@/actions/route-setting.actions";
import { deletePickupPoint } from "@/actions/pickup-point.actions";
import { OFFICE_LOCATIONS } from "@/lib/constants/enums";
import { formatShortDate, getMondayOfWeek } from "@/lib/date/week";

function toISODate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

/** A saved address whose text is raw "lat, lng" coordinates carries its
 * human-readable name in `label`. Real address rows keep the location in
 * `addressText` — and their `label` is the RESIDENT's name (home addresses
 * are labeled by employee), which must never surface as a pickup point. */
function isCoordinateText(text: string): boolean {
  return /^\s*-?\d+(\.\d+)?\s*,\s*-?\d+(\.\d+)?\s*$/.test(text);
}

/** The pickup-point name for a saved address: the label for coordinate-only
 * rows, otherwise the address text itself. */
function pickupPointNameFor(a: { label?: string | null; addressText: string }): string {
  return isCoordinateText(a.addressText) ? (a.label ?? a.addressText) : a.addressText;
}

type PickupPointRow = {
  id: string;
  name: string;
  sequence: number;
  baseETA: string;
  isActive: boolean;
  address: {
    addressText: string;
    latitude: number;
    longitude: number;
  } | null;
};

type VehicleRow = {
  id: string;
  vehicleNumber: string;
  vehicleType: string;
  capacity: number;
  driverName: string | null;
  driverContact: string | null;
  officeLocation: string;
  baseETA: string | null;
  firstPickupTime: string | null;
  pickupPoints: PickupPointRow[];
};

type PinnerProps = {
  initialWeekStart: string;
  vehicles: VehicleRow[];
  pins: PinState[];
  selectedVehicleId: string | null;
  onSelectVehicle: (vehicleId: string) => void;
};

type AddressOption = {
  id: string;
  addressText: string;
  label?: string | null;
  latitude: number;
  longitude: number;
};

/** Format a lat/lng pair the way Facilities reads it ("23.822664, 90.364146"). */
function formatLatLng(latitude: number, longitude: number): string {
  return `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;
}

// Simple vehicle list — shows only vehicle numbers, clickable to edit
function SimpleVehicleList({
  vehicles,
  selectedVehicleId,
  onSelectVehicle,
}: {
  vehicles: VehicleRow[];
  selectedVehicleId: string | null;
  onSelectVehicle: (vehicleId: string) => void;
}) {
  const [vehicleSearch, setVehicleSearch] = useState("");
  const filteredVehicles = vehicles.filter((vehicle) =>
    vehicle.vehicleNumber.toLowerCase().includes(vehicleSearch.toLowerCase().trim())
  );

  return (
    <Card>
      <CardHeader className="border-b">
        <CardTitle className="flex items-center gap-2">
          <Truck className="size-4 text-teal" />
          Select vehicle and set settings
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 py-4">
        {vehicles.length > 0 && (
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              aria-label="Search vehicles"
              placeholder="Search vehicles"
              value={vehicleSearch}
              onChange={(event) => setVehicleSearch(event.target.value)}
              className="pl-9"
            />
          </div>
        )}
        {vehicles.length === 0 ? (
          <div className="rounded-lg border border-dashed p-6 text-center">
            <p className="text-sm text-muted-foreground">
              No active vehicles yet. Create one to get started.
            </p>
          </div>
        ) : (
          <div className="max-h-[24rem] space-y-1 overflow-y-auto pr-1">
            {filteredVehicles.map((v) => (
              <button
                key={v.id}
                onClick={() => onSelectVehicle(v.id)}
                className={`w-full rounded-lg border px-3 py-2 text-left transition-all ${
                  selectedVehicleId === v.id
                    ? "border-teal/50 bg-teal/10"
                    : "hover:border-muted-foreground/50 hover:bg-accent/50"
                }`}
              >
                <p
                  className={`text-sm font-normal ${
                    selectedVehicleId === v.id ? "text-teal" : "text-black"
                  }`}
                >
                  {v.vehicleNumber}
                </p>
                <p className="text-xs text-muted-foreground">
                  {v.driverName || "Driver not assigned"}
                </p>
              </button>
            ))}
            {filteredVehicles.length === 0 && (
              <p className="rounded-lg border border-dashed py-4 text-center text-xs text-muted-foreground">
                No matching vehicles.
              </p>
            )}
          </div>
        )}

      </CardContent>
    </Card>
  );
}

// Detailed vehicle editor — shown when a vehicle is selected
function VehicleDetailEditor({
  vehicle: initialVehicle,
  addresses,
  pointsByVehicle,
  onPointsChange,
  onVehicleUpdate,
}: {
  vehicle: VehicleRow | null;
  addresses: AddressOption[];
  pointsByVehicle: Record<string, PickupPointRow[]>;
  onPointsChange: (vehicleId: string, points: PickupPointRow[]) => void;
  onVehicleUpdate: (
    updated: VehicleRow,
    pickupUpdates?: Array<{ id: string; baseETA: string }>
  ) => void;
}) {
  const { toast } = useToast();
  const [editingVehicle, setEditingVehicle] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  if (!initialVehicle) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <p className="text-sm text-muted-foreground">
            Select a vehicle from the left to configure its pickup sequence.
          </p>
        </CardContent>
      </Card>
    );
  }

  const vehicle = initialVehicle;
  const points = pointsByVehicle[vehicle.id] ?? [];
  const order = points.map((p) => p.id);

  function movePoint(index: number, dir: -1 | 1) {
    const target = index + dir;
    if (target < 0 || target >= order.length) return;
    const next = [...points];
    [next[index], next[target]] = [next[target], next[index]];
    onPointsChange(vehicle.id, next);
    setDirty(true);
  }

  async function addPoint(point: PickupPointRow) {
    const updated = [...points, point];
    onPointsChange(vehicle.id, updated);
    setDirty(true);
  }

  async function saveOrder() {
    setSaving(true);
    try {
      const res = await reorderPickupPoints(vehicle.id, order);
      if (!res.success) {
        toast({ title: "Reorder failed", description: res.error, variant: "destructive" });
        return;
      }
      setDirty(false);
      toast({ title: "Sequence saved", description: "Pickup order updated." });
    } finally {
      setSaving(false);
    }
  }

  async function deletePoint(pointId: string) {
    try {
      const res = await deletePickupPoint(pointId);
      if (!res.success) {
        toast({
          title: "Failed to delete",
          description: res.error,
          variant: "destructive",
        });
        return;
      }
      const updated = points.filter((p) => p.id !== pointId);
      onPointsChange(vehicle.id, updated);
      setDirty(true);
      toast({ title: "Pickup point deleted" });
    } catch (error) {
      toast({
        title: "Error deleting pickup point",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    }
  }

  return (
    <Card>
      <CardHeader className="border-b">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle>{vehicle.vehicleNumber}</CardTitle>
            <CardDescription>
              {vehicle.vehicleType} · Capacity {vehicle.capacity}
              {vehicle.officeLocation ? ` · ${vehicle.officeLocation}` : ""}
            </CardDescription>
          </div>
          {!editingVehicle && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setEditingVehicle(true)}
            >
              <Pencil className="mr-1 size-3.5" />
              Edit
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {editingVehicle && (
          <EditVehicleForm
            vehicle={vehicle}
            onSaved={(updated, pickupUpdates) => {
              onVehicleUpdate(updated, pickupUpdates);
              setEditingVehicle(false);
            }}
            onCancel={() => setEditingVehicle(false)}
          />
        )}

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="font-semibold">Pickup sequence</h4>
            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                disabled={!dirty || saving || points.length === 0}
                onClick={() => void saveOrder()}
              >
                <Save className="mr-1 size-3.5" />
                {saving ? "Saving…" : "Save"}
              </Button>
            </div>
          </div>

          {points.length > 0 ? (
            <ol className="divide-y rounded-lg border">
              {order.map((pointId, idx) => {
                const point = points.find((p) => p.id === pointId)!;
                const isLast = idx === order.length - 1;
                return (
                  <li
                    key={pointId}
                    className="flex items-center justify-between gap-3 px-4 py-3"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="flex size-6 shrink-0 items-center justify-center rounded-full border border-teal/50 bg-teal/10 text-xs font-semibold text-teal">
                        {idx + 1}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate font-medium text-sm">{point.name}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {point.baseETA}
                          {point.address ? ` · ${point.address.addressText}` : ""}
                        </p>
                        {point.address ? (
                          <p className="truncate font-mono text-xs text-teal">
                            {formatLatLng(point.address.latitude, point.address.longitude)}
                          </p>
                        ) : (
                          <p className="truncate text-xs font-medium text-destructive">
                            No address linked — coordinates missing
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="size-6"
                        disabled={idx === 0}
                        onClick={() => movePoint(idx, -1)}
                      >
                        <ArrowUp className="size-3" />
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="size-6"
                        disabled={isLast}
                        onClick={() => movePoint(idx, 1)}
                      >
                        <ArrowDown className="size-3" />
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="size-6"
                        onClick={() => void deletePoint(pointId)}
                      >
                        <Trash className="size-3" />
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ol>
          ) : (
            <p className="rounded-lg border border-dashed py-4 text-center text-xs text-muted-foreground">
              No pickup points yet — add one below.
            </p>
          )}

          <AddPointForm
            vehicle={vehicle}
            addresses={addresses}
            defaultSequence={points.length + 1}
            onCreated={(point) => void addPoint(point)}
            onError={(msg) =>
              toast({ title: "Add point failed", description: msg, variant: "destructive" })
            }
          />
        </div>
      </CardContent>
    </Card>
  );
}

function Pinner({
  initialWeekStart,
  vehicles,
  pins: initialPins,
  selectedVehicleId,
  onSelectVehicle,
}: PinnerProps) {
  const { toast } = useToast();
  const [weekStart, setWeekStart] = useState<Date>(
    () => new Date(`${initialWeekStart}T00:00:00`)
  );
  const [pins, setPins] = useState<PinState[]>(initialPins);
  const [loading, setLoading] = useState(false);

  const loadPins = useCallback(async (week: Date) => {
    setLoading(true);
    try {
      const res = await getVehicleShiftPins(toISODate(week));
      if (res.error) {
        toast({ title: "Failed to load pins", description: res.error, variant: "destructive" });
      } else {
        setPins(res.pins);
      }
    } finally {
      setLoading(false);
    }
  }, [toast]);

  function shiftWeek(days: number) {
    const next = new Date(weekStart);
    next.setDate(next.getDate() + days);
    setWeekStart(getMondayOfWeek(next));
    void loadPins(getMondayOfWeek(next));
  }

  function pinnedShifts(vehicleId: string): ShiftKey[] {
    const pin = pins.find((p) => p.vehicleId === vehicleId);
    return pin ? pin.shifts.filter((s): s is ShiftKey => SHIFT_KEYS.includes(s)) : [];
  }

  function isPinned(vehicleId: string, shift: ShiftKey) {
    return pinnedShifts(vehicleId).includes(shift);
  }

  async function toggle(vehicleId: string, shift: ShiftKey) {
    const wasPinned = isPinned(vehicleId, shift);

    // Optimistic update.
    setPins((prev) => {
      const existing = prev.find((p) => p.vehicleId === vehicleId);
      const nextShifts = existing ? [...existing.shifts] : [];
      const idx = nextShifts.indexOf(shift);
      if (idx >= 0) nextShifts.splice(idx, 1);
      else nextShifts.push(shift);

      const filtered = prev.filter((p) => p.vehicleId !== vehicleId);
      if (nextShifts.length === 0) return filtered;
      return [...filtered, { vehicleId, shifts: nextShifts }];
    });

    const res = await toggleVehicleShiftPin(vehicleId, toISODate(weekStart), shift);
    if (!res.success) {
      // Revert.
      setPins((prev) => {
        const existing = prev.find((p) => p.vehicleId === vehicleId);
        const nextShifts = existing ? [...existing.shifts] : [];
        const reverse = wasPinned ? [...nextShifts, shift] : nextShifts.filter((s) => s !== shift);
        const filtered = prev.filter((p) => p.vehicleId !== vehicleId);
        if (reverse.length === 0) return filtered;
        return [...filtered, { vehicleId, shifts: reverse }];
      });
      toast({ title: "Pin update failed", description: res.error, variant: "destructive" });
      return;
    }

    toast({
      title: wasPinned ? "Unpinned" : "Pinned",
      description: `${SHIFT_LABELS[shift]} ${wasPinned ? "removed from" : "assigned to"} this vehicle.`,
    });
  }

  return (
    <Card>
      <CardHeader className="border-b">
        <div className="flex items-center justify-between gap-4">
          <CardTitle className="flex items-center gap-2">
            <Pin className="size-4 text-teal" />
            Vehicle → route pinning
          </CardTitle>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="icon"
              aria-label="Previous week"
              onClick={() => shiftWeek(-7)}
            >
              <ChevronLeft className="size-4" />
            </Button>
            <span className="min-w-32 text-center text-xs font-medium sm:text-sm">
              Week of {formatShortDate(weekStart)}
            </span>
            <Button
              type="button"
              variant="outline"
              size="icon"
              aria-label="Next week"
              onClick={() => shiftWeek(7)}
            >
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>
        <CardDescription>
          Pin vehicles for use in RUN MAPPING this week.
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        <div className="max-h-[28rem] overflow-auto" tabIndex={0} aria-label="Vehicle routes — scrollable list">
          <table className="w-full border-collapse text-sm">
            <thead className="sticky top-0 z-10 bg-card">
              <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-2.5 font-medium">Vehicle</th>
                <th className="px-3 py-2.5 text-center font-medium">10 PM</th>
                <th className="px-3 py-2.5 text-center font-medium">11 PM</th>
                <th className="px-4 py-2.5 text-center font-medium">12 AM-6 AM</th>
              </tr>
            </thead>
            <tbody>
              {vehicles.map((v) => (
                <tr
                  key={v.id}
                  onClick={() => onSelectVehicle(v.id)}
                  className={`cursor-pointer border-b last:border-0 hover:bg-accent/40 ${
                    selectedVehicleId === v.id ? "bg-teal/10" : ""
                  }`}
                >
                  <td className="px-4 py-2">
                    <p
                      className={`text-sm ${
                        selectedVehicleId === v.id
                          ? "font-medium text-teal"
                          : "font-normal text-black"
                      }`}
                    >
                      {v.vehicleNumber}
                    </p>
                    {v.pickupPoints.length > 0 && (
                      <p className="text-xs text-muted-foreground">
                        {v.pickupPoints.length} point
                        {v.pickupPoints.length > 1 ? "s" : ""}
                      </p>
                    )}
                  </td>
                  {SHIFT_KEYS.map((shift) => (
                    <td key={shift} className="px-3 py-2 text-center">
                      <button
                        type="button"
                        disabled={loading}
                        onClick={() => void toggle(v.id, shift)}
                        aria-pressed={isPinned(v.id, shift)}
                        className="group inline-flex size-6 items-center justify-center rounded-full border transition-colors disabled:opacity-50"
                        aria-label={`${v.vehicleNumber} ${SHIFT_LABELS[shift]}`}
                        title={SHIFT_LABELS[shift]}
                      >
                        {isPinned(v.id, shift) ? (
                          <Check className="size-3.5 text-teal" />
                        ) : (
                          <span className="size-2 rounded-full bg-muted-foreground/30 group-hover:bg-muted-foreground/60" />
                        )}
                      </button>
                    </td>
                  ))}
                </tr>
              ))}
              {vehicles.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-sm text-muted-foreground">
                    No active vehicles.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {vehicles.length > 0 && (
          <p className="border-t px-4 py-2 text-xs text-muted-foreground">
            {vehicles.length} active vehicle{vehicles.length === 1 ? "" : "s"} — scroll to see all
          </p>
        )}
      </CardContent>
    </Card>
  );
}

type AddPointFormProps = {
  vehicle: VehicleRow;
  addresses: AddressOption[];
  defaultSequence: number;
  onCreated: (point: PickupPointRow) => void;
  onError: (message: string) => void;
};

function AddPointForm({
  vehicle,
  addresses,
  defaultSequence,
  onCreated,
  onError,
}: AddPointFormProps) {
  const [addressId, setAddressId] = useState("");
  const [sequence, setSequence] = useState(defaultSequence);
  const [saving, setSaving] = useState(false);

  const selectedAddress = addresses.find((a) => a.id === addressId);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!addressId) {
      onError("Select a pickup location.");
      return;
    }
    if (!selectedAddress) {
      onError("Selected location could not be found. Pick it again.");
      return;
    }
    const name = pickupPointNameFor(selectedAddress).trim();
    if (!name) {
      onError("Selected location has no name.");
      return;
    }
    setSaving(true);
    try {
      const res = await createPickupPoint({
        vehicleId: vehicle.id,
        addressId,
        name,
        sequence,
      });
      if (!res.success || !res.data) {
        onError(res.error ?? "Failed to create pickup point.");
        return;
      }
      const created = res.data as PickupPointRow & { addressId?: string };
      onCreated({
        id: created.id,
        name: created.name,
        sequence: created.sequence,
        baseETA: created.baseETA,
        isActive: created.isActive,
        address: created.address ?? null,
      });
      setAddressId("");
      setSequence(defaultSequence);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={(e) => void submit(e)} className="space-y-3 border-t p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Add pickup point
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1 sm:col-span-2">
          <Label htmlFor={`pp-address-${vehicle.id}`}>Pickup point</Label>
          <SearchableCombobox
            id={`pp-address-${vehicle.id}`}
            value={addressId || undefined}
            onChange={setAddressId}
            placeholder="Search & select"
            emptyText="No saved addresses yet."
            options={addresses.map(
              (a): ComboboxOption => ({
                value: a.id,
                searchText: `${a.label ?? ""} ${a.addressText}`,
                label: isCoordinateText(a.addressText) ? (
                  <span className="flex flex-col items-start">
                    <span>{a.label ?? a.addressText}</span>
                    <span className="text-xs text-muted-foreground">{a.addressText}</span>
                  </span>
                ) : (
                  a.addressText
                ),
              })
            )}
          />
          {selectedAddress && (
            <p className="font-mono text-xs text-teal">
              Coordinates: {formatLatLng(selectedAddress.latitude, selectedAddress.longitude)}
            </p>
          )}
        </div>
        <div className="space-y-1">
          <Label htmlFor={`pp-seq-${vehicle.id}`}>Sequence</Label>
          <Input
            id={`pp-seq-${vehicle.id}`}
            type="number"
            min={1}
            value={sequence}
            onChange={(e) => setSequence(Number(e.target.value))}
          />
        </div>
      </div>
      <Button type="submit" size="sm" disabled={saving}>
        <Plus className="mr-1 size-3.5" />
        {saving ? "Adding…" : "Add"}
      </Button>
    </form>
  );
}

type EditVehicleFormProps = {
  vehicle: VehicleRow;
  onSaved: (
    updated: VehicleRow,
    pickupUpdates?: Array<{ id: string; baseETA: string }>
  ) => void;
  onCancel: () => void;
};

function EditVehicleForm({ vehicle, onSaved, onCancel }: EditVehicleFormProps) {
  const { toast } = useToast();
  const [vehicleType, setVehicleType] = useState(vehicle.vehicleType);
  const [capacity, setCapacity] = useState(vehicle.capacity);
  const [driverName, setDriverName] = useState(vehicle.driverName ?? "");
  const [driverContact, setDriverContact] = useState(vehicle.driverContact ?? "");
  const [officeLocation, setOfficeLocation] = useState(vehicle.officeLocation);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const res = await updateVehicle({
        id: vehicle.id,
        vehicleType,
        capacity: Number(capacity),
        driverName,
        driverContact,
        officeLocation,
      });
      if (!res.success) {
        setError(res.error ?? "Failed to save vehicle.");
        return;
      }
      onSaved({
        ...vehicle,
        vehicleType,
        capacity: Number(capacity),
        driverName: driverName.trim() || null,
        driverContact: driverContact.trim() || null,
        officeLocation,
      }, res.pickupUpdates);
      toast({
        title: "Vehicle updated",
        description: `${vehicle.vehicleNumber} saved.`,
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      onSubmit={(e) => void save(e)}
      className="space-y-3 border-t bg-muted/30 p-4"
    >
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Edit vehicle
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor={`ev-type-${vehicle.id}`}>Type</Label>
          <Select value={vehicleType} onValueChange={setVehicleType}>
            <SelectTrigger id={`ev-type-${vehicle.id}`} className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="10-SEATER">10-SEATER</SelectItem>
              <SelectItem value="4-SEATER">4-SEATER</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label htmlFor={`ev-capacity-${vehicle.id}`}>Capacity</Label>
          <Input
            id={`ev-capacity-${vehicle.id}`}
            type="number"
            min={1}
            value={capacity}
            onChange={(e) => setCapacity(Number(e.target.value))}
            required
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor={`ev-driver-${vehicle.id}`}>Driver</Label>
          <Input
            id={`ev-driver-${vehicle.id}`}
            placeholder="Optional"
            value={driverName}
            onChange={(e) => setDriverName(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor={`ev-office-${vehicle.id}`}>Office</Label>
          <Select
            value={officeLocation}
            onValueChange={(value) => setOfficeLocation(value)}
          >
            <SelectTrigger id={`ev-office-${vehicle.id}`} className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {OFFICE_LOCATIONS.map((office) => (
                <SelectItem key={office} value={office}>
                  {office}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1 sm:col-span-2">
          <Label htmlFor={`ev-contact-${vehicle.id}`}>Driver contact</Label>
          <Input
            id={`ev-contact-${vehicle.id}`}
            placeholder="Optional"
            value={driverContact}
            onChange={(e) => setDriverContact(e.target.value)}
          />
        </div>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={saving}>
          <Save className="mr-1 size-3.5" />
          {saving ? "Saving…" : "Save"}
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

function SequenceEditor({
  vehicles,
  addresses,
  selectedVehicleId,
  onSelectVehicle,
  pointsByVehicle,
  onPointsChange,
  onVehicleUpdate,
}: {
  vehicles: VehicleRow[];
  addresses: AddressOption[];
  selectedVehicleId: string | null;
  onSelectVehicle: (vehicleId: string) => void;
  pointsByVehicle: Record<string, PickupPointRow[]>;
  onPointsChange: (vehicleId: string, points: PickupPointRow[]) => void;
  onVehicleUpdate: (
    updated: VehicleRow,
    pickupUpdates?: Array<{ id: string; baseETA: string }>
  ) => void;
}) {
  const selectedVehicle = vehicles.find((v) => v.id === selectedVehicleId) ?? null;

  return (
    <>
      <SimpleVehicleList
        vehicles={vehicles}
        selectedVehicleId={selectedVehicleId}
        onSelectVehicle={onSelectVehicle}
      />
      <VehicleDetailEditor
        vehicle={selectedVehicle}
        addresses={addresses}
        pointsByVehicle={pointsByVehicle}
        onPointsChange={onPointsChange}
        onVehicleUpdate={onVehicleUpdate}
      />
    </>
  );
}

type RouteSettingClientProps = {
  initialWeekStart: string;
  vehicles: VehicleRow[];
  addresses: AddressOption[];
  pins: PinState[];
};

export function RouteSettingClient({
  initialWeekStart,
  vehicles: initialVehicles,
  addresses,
  pins,
}: RouteSettingClientProps) {
  const [vehicles, setVehicles] = useState<VehicleRow[]>(initialVehicles);
  const [pointsByVehicle, setPointsByVehicle] = useState<
    Record<string, PickupPointRow[]>
  >(() =>
    Object.fromEntries(initialVehicles.map((v) => [v.id, [...v.pickupPoints]]))
  );
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(
    initialVehicles.length > 0 ? initialVehicles[0].id : null
  );

  function updateVehicle(
    updated: VehicleRow,
    pickupUpdates?: Array<{ id: string; baseETA: string }>
  ) {
    setVehicles((prev) =>
      prev.map((x) => (x.id === updated.id ? updated : x))
    );
    if (pickupUpdates) {
      const updatesById = new Map(
        pickupUpdates.map((point) => [point.id, point.baseETA])
      );
      setPointsByVehicle((prev) => ({
        ...prev,
        [updated.id]: (prev[updated.id] ?? []).map((point) => {
          const baseETA = updatesById.get(point.id);
          return baseETA ? { ...point, baseETA } : point;
        }),
      }));
    }
  }

  return (
    <div
      className="grid gap-6"
      style={{
        gridTemplateColumns: "1fr 2fr 2fr",
      }}
    >
      <SequenceEditor
        vehicles={vehicles}
        addresses={addresses}
        selectedVehicleId={selectedVehicleId}
        onSelectVehicle={setSelectedVehicleId}
        pointsByVehicle={pointsByVehicle}
        onPointsChange={(vehicleId, points) => {
          setPointsByVehicle((prev) => ({ ...prev, [vehicleId]: points }));
        }}
        onVehicleUpdate={updateVehicle}
      />
      <Pinner
        initialWeekStart={initialWeekStart}
        vehicles={vehicles}
        pins={pins}
        selectedVehicleId={selectedVehicleId}
        onSelectVehicle={setSelectedVehicleId}
      />
    </div>
  );
}
