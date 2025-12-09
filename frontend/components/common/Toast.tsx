"use client";

import { useEffect } from "react";
import { cn } from "@/lib/utils";

interface ToastProps {
  message: string;
  type: "success" | "error" | "warning" | "info";
  onClose: () => void;
  duration?: number;
}

export function Toast({ message, type, onClose, duration = 5000 }: ToastProps) {
  useEffect(() => {
    const timer = setTimeout(() => {
      onClose();
    }, duration);

    return () => clearTimeout(timer);
  }, [duration, onClose]);

  const styles = {
    success: "bg-apple-success/20 border-apple-success/30 text-apple-success",
    error: "bg-apple-error/20 border-apple-error/30 text-apple-error",
    warning: "bg-apple-warning/20 border-apple-warning/30 text-apple-warning",
    info: "bg-apple-accent/20 border-apple-accent/30 text-apple-accent",
  };

  return (
    <div
      className={cn(
        "fixed top-4 right-4 z-50 p-4 rounded-lg border shadow-lg animate-in slide-in-from-top-5",
        styles[type]
      )}
    >
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm font-medium">{message}</p>
        <button
          onClick={onClose}
          className="text-current opacity-70 hover:opacity-100"
        >
          ×
        </button>
      </div>
    </div>
  );
}


