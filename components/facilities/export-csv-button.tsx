"use client";

import { Button } from "@/components/ui/button";

function csvEscape(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function ExportCsvButton({
  filename,
  headers,
  rows,
  label = "Export CSV",
}: {
  filename: string;
  headers: string[];
  rows: string[][];
  label?: string;
}) {
  function handleExport() {
    const lines = [headers, ...rows].map((row) =>
      row.map((cell) => csvEscape(cell)).join(",")
    );
    const csvContent = lines.join("\r\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  return (
    <Button type="button" variant="outline" className="surface-accent" onClick={handleExport}>
      {label}
    </Button>
  );
}
