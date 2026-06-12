import { cn } from "@/lib/utils";

interface StatusBadgeProps {
  status?: string | null;
  className?: string;
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  if (!status) return null;

  const s = status.toLowerCase();
  let cls = "inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ";

  switch (s) {
    case "draft":
      cls += "bg-gray-100 text-gray-600"; break;
    case "scripting":
    case "generating_assets":
    case "generating_voice":
    case "fetching-assets":
    case "voiceover":
      cls += "bg-blue-50 text-blue-700"; break;
    case "rendering":
      cls += "bg-amber-50 text-amber-700 animate-pulse"; break;
    case "completed":
      cls += "bg-emerald-50 text-emerald-700"; break;
    case "failed":
    case "error":
      cls += "bg-red-50 text-red-700"; break;
    case "processing":
    case "pending":
      cls += "bg-blue-50 text-blue-700"; break;
    case "cancelled":
      cls += "bg-gray-100 text-gray-500"; break;
    default:
      cls += "bg-gray-100 text-gray-600";
  }

  const display = status.replace(/-/g, " ").replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase());
  return <span className={cn(cls, className)}>{display}</span>;
}
