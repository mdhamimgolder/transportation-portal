"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  setAllPickupPointCoordinatesAction,
  setPickupPointCoordinatesAction,
  type PickupPointCoordinatesState,
} from "@/actions/facilities-profile.actions";

type PickupPoint = { name: string; latitude: number | null; longitude: number | null };
const initialState: PickupPointCoordinatesState = {};
const DRAFT_STORAGE_KEY = "pickup-point-coordinate-drafts";

export function PickupPointCoordinates({ points }: { points: PickupPoint[] }) {
  const [search, setSearch] = useState("");
  const [coordinates, setCoordinates] = useState<Record<string, string>>(() =>
    Object.fromEntries(points.map((point) => [point.name, point.latitude !== null && point.longitude !== null ? `${point.latitude}, ${point.longitude}` : ""]))
  );
  const draftsLoaded = useRef(false);
  useEffect(() => {
    const savedDrafts = window.localStorage.getItem(DRAFT_STORAGE_KEY);
    if (!savedDrafts) {
      draftsLoaded.current = true;
      return;
    }
    try {
      const drafts = JSON.parse(savedDrafts) as Record<string, string>;
      queueMicrotask(() => {
        setCoordinates((current) => ({ ...current, ...drafts }));
        draftsLoaded.current = true;
      });
    } catch {
      window.localStorage.removeItem(DRAFT_STORAGE_KEY);
      draftsLoaded.current = true;
    }
  }, []);
  useEffect(() => {
    if (!draftsLoaded.current) return;
    window.localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(coordinates));
  }, [coordinates]);
  const [allState, allFormAction, allPending] = useActionState(setAllPickupPointCoordinatesAction, initialState);
  const filtered = useMemo(() => {
    const value = search.trim().toLowerCase();
    return value ? points.filter((point) => point.name.toLowerCase().includes(value)) : points;
  }, [points, search]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search pickup points" aria-label="Search pickup points" />
        <form action={allFormAction} className="flex items-center gap-2">
          <input type="hidden" name="coordinatesJson" value={JSON.stringify(points
            .map((point) => ({ pickupPoint: point.name, coordinates: coordinates[point.name]?.trim() ?? "" }))
            .filter((entry) => entry.coordinates))} />
          <Button type="submit" disabled={allPending || points.length === 0}>{allPending ? "Saving all..." : "Save all entered"}</Button>
        </form>
      </div>
      {allState.error ? <p className="text-sm text-destructive">{allState.error}</p> : null}
      {allState.success ? <p className="text-sm text-emerald-600">All pickup-point coordinates saved.</p> : null}
      {filtered.map((point) => (
        <PickupPointCoordinateRow
          key={point.name}
          point={point}
          value={coordinates[point.name] ?? ""}
          onChange={(value) => setCoordinates((current) => ({ ...current, [point.name]: value }))}
        />
      ))}
      {filtered.length === 0 ? <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">No pickup points found.</p> : null}
    </div>
  );
}

function PickupPointCoordinateRow({ point, value, onChange }: { point: PickupPoint; value: string; onChange: (value: string) => void }) {
  const [state, formAction, pending] = useActionState(setPickupPointCoordinatesAction, initialState);

  return (
    <div className="space-y-2">
      <form action={formAction} className="grid gap-3 rounded-lg border bg-card p-4 sm:grid-cols-[1fr_20rem_auto] sm:items-end">
        <input type="hidden" name="pickupPoint" value={point.name} />
        <div>
          <p className="font-medium">{point.name}</p>
          <p className="text-xs text-muted-foreground">{point.latitude !== null && point.longitude !== null ? "Coordinates set" : "Coordinates missing"}</p>
        </div>
        <div className="space-y-1">
          <Label htmlFor={`coordinates-${point.name}`}>Latitude, Longitude</Label>
          <Input
            id={`coordinates-${point.name}`}
            name="coordinates"
            type="text"
            inputMode="decimal"
            placeholder="23.8103, 90.4125"
            value={value}
            onChange={(event) => onChange(event.target.value)}
            required
          />
        </div>
        <Button type="submit" disabled={pending}>{pending ? "Saving..." : "Save"}</Button>
      </form>
      {state.error ? <p className="text-sm text-destructive">{state.error}</p> : null}
      {state.success ? <p className="text-sm text-emerald-600">Pickup point coordinates saved.</p> : null}
    </div>
  );
}