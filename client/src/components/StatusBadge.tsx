import { CheckCircle, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface StatusBadgeProps {
  active: boolean;
  activeLabel?: string;
  inactiveLabel?: string;
}

export function StatusBadge({ active, activeLabel = "Active", inactiveLabel = "Expired" }: StatusBadgeProps) {
  if (active) {
    return (
      <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 gap-1.5" data-testid="badge-status-active">
        <CheckCircle className="w-3.5 h-3.5" />
        {activeLabel}
      </Badge>
    );
  }

  return (
    <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200 gap-1.5" data-testid="badge-status-inactive">
      <XCircle className="w-3.5 h-3.5" />
      {inactiveLabel}
    </Badge>
  );
}
