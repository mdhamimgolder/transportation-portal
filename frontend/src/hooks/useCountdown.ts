import { useEffect, useState } from "react";

/** Returns a live countdown string to the target, and whether it has passed. */
export function useCountdown(target?: string): { text: string; passed: boolean } {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  if (!target) return { text: "—", passed: false };
  const diff = new Date(target).getTime() - now;
  if (diff <= 0) return { text: "Closed", passed: true };

  const d = Math.floor(diff / 86400000);
  const h = Math.floor((diff % 86400000) / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  const s = Math.floor((diff % 60000) / 1000);
  const parts = [];
  if (d) parts.push(`${d}d`);
  parts.push(`${h}h`, `${m}m`, `${s}s`);
  return { text: parts.join(" "), passed: false };
}
