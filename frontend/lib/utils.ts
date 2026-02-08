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
      return "bg-green-500/20 text-green-400 border border-green-500/30";
    case "processing":
      return "bg-[#0099FF]/20 text-[#0099FF] border border-[#0099FF]/30";
    case "pending":
      return "bg-gray-500/20 text-gray-400 border border-gray-500/30";
    case "failed":
      return "bg-red-500/20 text-red-400 border border-red-500/30";
    case "waiting_for_csv":
      return "bg-yellow-500/20 text-yellow-400 border border-yellow-500/30";
    default:
      return "bg-gray-500/20 text-gray-400 border border-gray-500/30";
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


