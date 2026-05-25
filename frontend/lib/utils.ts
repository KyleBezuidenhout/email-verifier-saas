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
      return "bg-[#22c55e]/20 text-[#22c55e] border border-[#22c55e]/30";
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

/**
 * Build the default download filename for a results CSV.
 *
 * Base name priority: user-supplied job name -> input filename (sans .csv)
 * -> short job id fallback. Filter suffixes are appended when the user is
 * downloading only a subset of statuses (e.g. catchall only, valid &
 * catchall) so the file on disk reflects the slice they pulled.
 */
export function buildResultsFilename(opts: {
  jobName?: string | null;
  originalFilename?: string | null;
  fallback: string;
  filters?: string[];
}): string {
  const stripExt = (s: string) => s.replace(/\.csv$/i, "");
  const sanitize = (s: string) =>
    s.replace(/[^a-zA-Z0-9 _&-]/g, "").trim().slice(0, 60);

  const rawBase =
    (opts.jobName && opts.jobName.trim()) ||
    (opts.originalFilename ? stripExt(opts.originalFilename) : "") ||
    opts.fallback;
  const base = sanitize(rawBase) || opts.fallback;

  const filters = (opts.filters || []).filter((f) => f && f !== "all");
  // The product surfaces three top-level buckets (valid, catchall, invalid).
  // No suffix when the user has all three (or none) selected; that's a full
  // export. Otherwise append a human suffix in canonical order.
  const KNOWN = ["valid", "catchall", "invalid"] as const;
  const known = filters.filter((f) => (KNOWN as readonly string[]).includes(f));
  let suffix = "";
  if (known.length > 0 && known.length < KNOWN.length) {
    if (known.length === 1) {
      suffix = ` - ${known[0]} only`;
    } else {
      const ordered = KNOWN.filter((s) => known.includes(s));
      suffix = ` - ${ordered.join(" & ")}`;
    }
  }

  return `results - ${base}${suffix}`;
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


