import { Card, CardContent } from "@/components/ui/card";
import { LucideIcon } from "lucide-react";

interface StoreInfoCardProps {
  icon: LucideIcon;
  label: string;
  value: string | React.ReactNode;
}

export function StoreInfoCard({ icon: Icon, label, value }: StoreInfoCardProps) {
  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-start gap-4">
          <div className="p-2.5 bg-primary/10 rounded-lg">
            <Icon className="w-5 h-5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm text-muted-foreground mb-1">{label}</p>
            <div className="text-lg font-semibold text-foreground break-words" data-testid={`text-${label.toLowerCase().replace(/\s+/g, '-')}`}>
              {value}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
