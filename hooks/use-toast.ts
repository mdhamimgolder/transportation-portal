import { useState } from "react";

export interface Toast {
  title: string;
  description?: string;
  variant?: "default" | "destructive";
}

export function useToast() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const toast = (message: Toast) => {
    setToasts((prev) => [...prev, message]);

    // Auto-remove after 3 seconds
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.title !== message.title));
    }, 3000);

    console.log(`[${message.variant || "INFO"}] ${message.title}`, message.description || "");
  };

  return { toast, toasts };
}
