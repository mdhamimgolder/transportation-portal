"use client";
import { RefreshCw } from "lucide-react";
export function RefreshButton() {
  return (
    <button onClick={() => window.location.reload()} className="flex items-center gap-1 text-sm text-[#70bccc] hover:text-[#8fd0dd]">
      <RefreshCw size={14} /> Refresh
    </button>
  );
}
