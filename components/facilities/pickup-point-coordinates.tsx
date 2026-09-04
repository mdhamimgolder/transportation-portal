"use client";

import { useActionState, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  setPickupPointCoordinatesAction,
  type PickupPointCoordinatesState,
} from "@/actions/facilities-profile.actions";

type PickupPoint = { name: string; latitude: number | null; longitude: number | null };
const initialState: PickupPointCoordinatesState = {};

export function PickupPointCoordinates({ points }: { points: PickupPoint[] }) {
  const [search, setSearch] = useState("");
  const [state, formAction, pending] = useActionState(setPickupPointCoordinatesAction, initialState);
  const filtered = useMemo(() => {
    const value = search.trim().toLowerCase();
    return value ? points.filter((point) => point.name.toLowerCase().includes(value)) : points;
  }, [points, search]);

  return (
    <div className="space-y-4">
      <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search pickup points" aria-label="Search pickup points" />
      {filtered.map((point) => (
        <form key={point.name} action={formAction} className="grid gap-3 rounded-lg border bg-card p-4 sm:grid-cols-[1fr_10rem_10rem_auto] sm:items-end">
          <input type="hidden" name="pickupPoint" value={point.name} />
          <div>
            <p className="font-medium">{point.name}</p>
            <p className="text-xs text-muted-foreground">{point.latitude !== null && point.longitude !== null ? "Coordinates set" : "Coordinates missing"}</p>
          </div>
          <div className="space-y-1"><Label htmlFor={`latitude-${point.name}`}>Latitude</Label><Input id={`latitude-${point.name}`} name="latitude" type="number" step="any" defaultValue={point.latitude ?? ""} required /></div>
          <div className="space-y-1"><Label htmlFor={`longitude-${point.name}`}>Longitude</Label><Input id={`longitude-${point.name}`} name="longitude" type="number" step="any" defaultValue={point.longitude ?? ""} required /></div>
          <Button type="submit" disabled={pending}>{pending ? "Saving..." : "Save"}</Button>
        </form>
      ))}
      {filtered.length === 0 ? <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">No pickup points found.</p> : null}
      {state.error ? <p className="text-sm text-destructive">{state.error}</p> : null}
      {state.success ? <p className="text-sm text-emerald-600">Pickup point coordinates saved.</p> : null}
    </div>
  );
}