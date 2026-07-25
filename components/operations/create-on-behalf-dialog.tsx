"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import {
  createWeeklyScheduleOnBehalf,
  createAdHocRequestOnBehalf,
  type CreateWeeklyScheduleOnBehalfState,
  type CreateAdHocRequestOnBehalfState,
} from "@/actions/on-behalf.actions";
import { NO_TRANSPORT_VALUE, ARRIVAL_TIME_OPTIONS } from "@/lib/constants/arrival-times";
import { ADHOC_ARRIVAL_TIME_OPTIONS } from "@/lib/constants/adhoc-arrival-times";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export type OnBehalfEmployeeOption = {
  id: string;
  fullName: string;
  employeeCode: string | null;
  email: string;
  contactNumber: string | null;
  address: string | null;
};

function employeeLabel(e: OnBehalfEmployeeOption): string {
  return `${e.fullName}${e.employeeCode ? ` · ${e.employeeCode}` : ""}`;
}

function EmployeePicker({
  employees,
  selected,
  onSelect,
}: {
  employees: OnBehalfEmployeeOption[];
  selected: OnBehalfEmployeeOption | null;
  onSelect: (employee: OnBehalfEmployeeOption | null) => void;
}) {
  const [query, setQuery] = useState(selected ? employeeLabel(selected) : "");
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setQuery(selected ? employeeLabel(selected) : "");
  }, [selected]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return employees;
    return employees.filter(
      (e) =>
        e.fullName.toLowerCase().includes(needle) ||
        e.email.toLowerCase().includes(needle) ||
        (e.employeeCode?.toLowerCase().includes(needle) ?? false)
    );
  }, [employees, query]);

  return (
    <div ref={containerRef} className="relative">
      <Input
        value={query}
        placeholder="Search employee by name, email, or ID"
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          setQuery(e.target.value);
          onSelect(null);
          setOpen(true);
        }}
      />
      {open ? (
        <div className="absolute z-30 mt-1 max-h-56 w-full overflow-y-auto rounded-md border bg-popover p-1 shadow-md">
          {filtered.length === 0 ? (
            <p className="px-2 py-1.5 text-sm text-muted-foreground">No matches.</p>
          ) : (
            filtered.map((e) => (
              <button
                key={e.id}
                type="button"
                className={cn(
                  "flex w-full items-center rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent",
                  e.id === selected?.id && "bg-accent"
                )}
                onClick={() => {
                  onSelect(e);
                  setOpen(false);
                }}
              >
                {employeeLabel(e)}
              </button>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Saving..." : "Create & approve"}
    </Button>
  );
}

const weeklyInitialState: CreateWeeklyScheduleOnBehalfState = {};
const adhocInitialState: CreateAdHocRequestOnBehalfState = {};

export function CreateOnBehalfDialog({
  employees,
  weekLabel,
  days,
}: {
  employees: OnBehalfEmployeeOption[];
  weekLabel: string;
  days: { label: string; dateLabel: string }[];
}) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"weekly" | "adhoc">("weekly");
  const [selected, setSelected] = useState<OnBehalfEmployeeOption | null>(null);
  const [dayValues, setDayValues] = useState<string[]>(
    Array.from({ length: 5 }, () => NO_TRANSPORT_VALUE)
  );
  const [adhocDate, setAdhocDate] = useState("");
  const [adhocTime, setAdhocTime] = useState("");
  const [adhocReason, setAdhocReason] = useState("");

  const [weeklyState, weeklyAction] = useActionState(
    createWeeklyScheduleOnBehalf,
    weeklyInitialState
  );
  const [adhocState, adhocAction] = useActionState(
    createAdHocRequestOnBehalf,
    adhocInitialState
  );

  const handledWeekly = useRef<CreateWeeklyScheduleOnBehalfState>(weeklyInitialState);
  const handledAdhoc = useRef<CreateAdHocRequestOnBehalfState>(adhocInitialState);

  useEffect(() => {
    if (weeklyState.success && weeklyState !== handledWeekly.current) {
      handledWeekly.current = weeklyState;
      setSelected(null);
      setDayValues(Array.from({ length: 5 }, () => NO_TRANSPORT_VALUE));
    }
  }, [weeklyState]);

  useEffect(() => {
    if (adhocState.success && adhocState !== handledAdhoc.current) {
      handledAdhoc.current = adhocState;
      setSelected(null);
      setAdhocDate("");
      setAdhocTime("");
      setAdhocReason("");
    }
  }, [adhocState]);

  function setDay(index: number, value: string) {
    setDayValues((prev) => prev.map((v, i) => (i === index ? value : v)));
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline">
          Create on behalf of employee
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Create on behalf of an employee</DialogTitle>
          <DialogDescription>
            For an employee who missed the submission window. This is saved as
            already approved -- it skips the normal review step.
          </DialogDescription>
        </DialogHeader>

        <div className="flex gap-2">
          <Button
            type="button"
            size="sm"
            variant={mode === "weekly" ? "default" : "outline"}
            onClick={() => setMode("weekly")}
          >
            Weekly schedule
          </Button>
          <Button
            type="button"
            size="sm"
            variant={mode === "adhoc" ? "default" : "outline"}
            onClick={() => setMode("adhoc")}
          >
            Ad-hoc request
          </Button>
        </div>

        <div className="space-y-2">
          <Label>Employee</Label>
          <EmployeePicker employees={employees} selected={selected} onSelect={setSelected} />
        </div>

        {selected ? (
          <div className="grid grid-cols-1 gap-x-4 gap-y-1 rounded-md border bg-muted/30 p-3 text-sm sm:grid-cols-2">
            <p>
              <span className="text-muted-foreground">Email:</span> {selected.email}
            </p>
            <p>
              <span className="text-muted-foreground">Contact:</span>{" "}
              {selected.contactNumber ?? "—"}
            </p>
            <p className="sm:col-span-2">
              <span className="text-muted-foreground">Address:</span>{" "}
              {selected.address ?? "—"}
            </p>
          </div>
        ) : null}

        {mode === "weekly" ? (
          <form key="weekly" action={weeklyAction} className="space-y-4">
            <input type="hidden" name="employeeId" value={selected?.id ?? ""} />
            <p className="text-sm text-muted-foreground">
              Week of {weekLabel} -- select an arrival time for each day.
            </p>
            <div className="grid grid-cols-[repeat(auto-fit,minmax(9rem,1fr))] gap-2">
              {days.map((day, index) => (
                <div key={day.label} className="rounded-md border p-2">
                  <p className="text-xs font-semibold">{day.label}</p>
                  <p className="mb-1 text-xs text-muted-foreground">{day.dateLabel}</p>
                  <input type="hidden" name={`day-${index}`} value={dayValues[index]} />
                  <Select value={dayValues[index]} onValueChange={(v) => setDay(index, v)}>
                    <SelectTrigger className="w-full min-w-0">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NO_TRANSPORT_VALUE}>Not Required</SelectItem>
                      {ARRIVAL_TIME_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={o.value}>
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>
            {weeklyState.error ? (
              <p className="text-sm text-destructive">{weeklyState.error}</p>
            ) : null}
            {weeklyState.success ? (
              <p className="text-sm text-green-foreground">
                Weekly schedule created and approved for {weeklyState.employeeName}.
              </p>
            ) : null}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Close
              </Button>
              <SubmitButton />
            </DialogFooter>
          </form>
        ) : (
          <form key="adhoc" action={adhocAction} className="space-y-4">
            <input type="hidden" name="employeeId" value={selected?.id ?? ""} />
            <div className="space-y-2">
              <Label htmlFor="onbehalf-date">Date</Label>
              <Input
                id="onbehalf-date"
                type="date"
                name="date"
                value={adhocDate}
                onChange={(e) => setAdhocDate(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="onbehalf-arrival">Arrival time</Label>
              <Select name="arrivalTime" value={adhocTime} onValueChange={setAdhocTime} required>
                <SelectTrigger className="w-full" id="onbehalf-arrival">
                  <SelectValue placeholder="Select a time" />
                </SelectTrigger>
                <SelectContent>
                  {ADHOC_ARRIVAL_TIME_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="onbehalf-reason">Reason (optional)</Label>
              <Textarea
                id="onbehalf-reason"
                name="reason"
                value={adhocReason}
                onChange={(e) => setAdhocReason(e.target.value)}
              />
            </div>
            {adhocState.error ? (
              <p className="text-sm text-destructive">{adhocState.error}</p>
            ) : null}
            {adhocState.success ? (
              <p className="text-sm text-green-foreground">
                Ad-hoc request created and approved for {adhocState.employeeName}.
              </p>
            ) : null}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Close
              </Button>
              <SubmitButton />
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
