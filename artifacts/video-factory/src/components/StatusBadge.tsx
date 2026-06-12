import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface StatusBadgeProps {
  status?: string | null;
  className?: string;
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  if (!status) return null;

  const normalizedStatus = status.toLowerCase();

  let variant: "default" | "secondary" | "destructive" | "outline" = "default";
  let colorClass = "";

  switch (normalizedStatus) {
    case "draft":
      variant = "secondary";
      colorClass = "bg-zinc-800 text-zinc-300 border-zinc-700";
      break;
    case "scripting":
    case "generating_assets":
    case "generating_voice":
      variant = "outline";
      colorClass = "bg-blue-950/30 text-blue-400 border-blue-800/50";
      break;
    case "rendering":
      variant = "outline";
      colorClass = "bg-yellow-950/30 text-yellow-400 border-yellow-800/50 animate-pulse";
      break;
    case "completed":
      variant = "outline";
      colorClass = "bg-emerald-950/30 text-emerald-400 border-emerald-800/50";
      break;
    case "failed":
      variant = "destructive";
      colorClass = "bg-red-950/30 text-red-400 border-red-800/50";
      break;
    default:
      variant = "secondary";
  }

  // Format the text nicely
  const displayText = status.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase());

  return (
    <Badge variant={variant} className={cn("font-medium", colorClass, className)}>
      {displayText}
    </Badge>
  );
}
