import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Trash2 } from "lucide-react";
import { useState } from "react";

interface DiscountTierCardProps {
  tier: {
    id: string;
    minFollowers: number;
    maxFollowers: number;
    discountPercent: number;
  };
  onUpdate?: (tier: { id: string; minFollowers: number; maxFollowers: number; discountPercent: number }) => void;
  onDelete?: (id: string) => void;
}

export function DiscountTierCard({ tier, onUpdate, onDelete }: DiscountTierCardProps) {
  const [minFollowers, setMinFollowers] = useState(tier.minFollowers);
  const [maxFollowers, setMaxFollowers] = useState(tier.maxFollowers);
  const [discountPercent, setDiscountPercent] = useState(tier.discountPercent);

  const handleSave = () => {
    onUpdate?.({ id: tier.id, minFollowers, maxFollowers, discountPercent });
    console.log('Discount tier saved:', { id: tier.id, minFollowers, maxFollowers, discountPercent });
  };

  const handleDelete = () => {
    onDelete?.(tier.id);
    console.log('Discount tier deleted:', tier.id);
  };

  const formatFollowerRange = (min: number, max: number) => {
    const formatNum = (n: number) => n >= 1000 ? `${n / 1000}k` : n.toString();
    return `${formatNum(min)} - ${formatNum(max)} followers`;
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-4">
        <CardTitle className="text-base font-semibold">
          {formatFollowerRange(tier.minFollowers, tier.maxFollowers)}
        </CardTitle>
        <Button 
          size="icon" 
          variant="ghost" 
          onClick={handleDelete}
          data-testid={`button-delete-tier-${tier.id}`}
        >
          <Trash2 className="w-4 h-4 text-destructive" />
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-2">
            <Label htmlFor={`min-${tier.id}`}>Min Followers</Label>
            <Input
              id={`min-${tier.id}`}
              type="number"
              value={minFollowers}
              onChange={(e) => setMinFollowers(parseInt(e.target.value) || 0)}
              data-testid={`input-min-followers-${tier.id}`}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`max-${tier.id}`}>Max Followers</Label>
            <Input
              id={`max-${tier.id}`}
              type="number"
              value={maxFollowers}
              onChange={(e) => setMaxFollowers(parseInt(e.target.value) || 0)}
              data-testid={`input-max-followers-${tier.id}`}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`discount-${tier.id}`}>Discount %</Label>
            <Input
              id={`discount-${tier.id}`}
              type="number"
              value={discountPercent}
              onChange={(e) => setDiscountPercent(parseInt(e.target.value) || 0)}
              data-testid={`input-discount-percent-${tier.id}`}
            />
          </div>
        </div>
        <div className="flex justify-end">
          <Button onClick={handleSave} data-testid={`button-save-tier-${tier.id}`}>
            Save Changes
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
