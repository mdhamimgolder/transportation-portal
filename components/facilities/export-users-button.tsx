"use client";

import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";

type ExportRow = {
  fullName: string;
  email: string;
  pickupPoint: string | null;
};

/** Quote a cell for RFC-4180 CSV: wrap when needed, escape inner quotes. */
function csvCell(value: string | null | undefined): string {
  const text = (value ?? "").replace(/\r?\n/g, " ").trim();
  if (text.includes('"') || text.includes(",") || text.includes(";")) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

export function ExportUsersButton({ employees }: { employees: ExportRow[] }) {
  const exportCsv = () => {
    const header = ["Name", "Email", "Pick-up Point"];
    const lines = [header.map(csvCell).join(",")];
    for (const e of employees) {
      lines.push(
        [csvCell(e.fullName), csvCell(e.email), csvCell(e.pickupPoint)].join(",")
      );
    }
    // UTF-8 BOM so Excel renders the file correctly on double-click.
    const blob = new Blob(["\uFEFF" + lines.join("\r\n")], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    const stamp = new Date().toISOString().slice(0, 10);
    link.download = `user-info-${stamp}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <Button type="button" variant="outline" onClick={exportCsv} disabled={employees.length === 0}>
      <Download className="size-4" aria-hidden />
      Export CSV
    </Button>
  );
}
