import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(date: string | Date): string {
  return new Date(date).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + " " + sizes[i];
}

export function getStatusColor(status: string): string {
  switch (status) {
    case "completed":
      return "bg-apple-success/20 text-apple-success border border-apple-success/30";
    case "processing":
      return "bg-apple-accent/20 text-apple-accent border border-apple-accent/30";
    case "pending":
      return "bg-apple-text-muted/20 text-apple-text-muted border border-apple-text-muted/30";
    case "failed":
      return "bg-apple-error/20 text-apple-error border border-apple-error/30";
    default:
      return "bg-apple-text-muted/20 text-apple-text-muted border border-apple-text-muted/30";
  }
}

export function calculateProgress(processed: number, total: number): number {
  if (total === 0) return 0;
  return Math.round((processed / total) * 100);
}

export function estimateTimeRemaining(
  processed: number,
  total: number,
  startTime: Date
): string {
  if (processed === 0) return "Calculating...";
  const elapsed = Date.now() - startTime.getTime();
  const rate = processed / elapsed; // leads per millisecond
  const remaining = total - processed;
  const estimatedMs = remaining / rate;
  const minutes = Math.ceil(estimatedMs / 60000);
  return `${minutes} minute${minutes !== 1 ? "s" : ""}`;
}


