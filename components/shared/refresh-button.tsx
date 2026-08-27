"use client";
import { RefreshCw } from "lucide-react";
export function RefreshButton() {
  return (
    <button onClick={() => window.location.reload()} className="text-sm text-cyan-400 hover:text-cyan-500 flex items-center gap-1">
      <RefreshCw size={14} /> Refresh
    </button>
  );
}
