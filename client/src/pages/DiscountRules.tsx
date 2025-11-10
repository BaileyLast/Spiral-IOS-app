import { useState } from "react";
import { DiscountTierCard } from "@/components/DiscountTierCard";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";

export default function DiscountRules() {
  const [tiers, setTiers] = useState([
    { id: "1", minFollowers: 0, maxFollowers: 1000, discountPercent: 5 },
    { id: "2", minFollowers: 1000, maxFollowers: 5000, discountPercent: 10 },
    { id: "3", minFollowers: 5000, maxFollowers: 50000, discountPercent: 15 },
  ]);

  const handleUpdate = (updatedTier: { id: string; minFollowers: number; maxFollowers: number; discountPercent: number }) => {
    setTiers(tiers.map(tier => tier.id === updatedTier.id ? updatedTier : tier));
  };

  const handleDelete = (id: string) => {
    setTiers(tiers.filter(tier => tier.id !== id));
  };

  const handleAddTier = () => {
    const newId = (Math.max(...tiers.map(t => parseInt(t.id))) + 1).toString();
    setTiers([...tiers, { 
      id: newId, 
      minFollowers: 0, 
      maxFollowers: 1000, 
      discountPercent: 5 
    }]);
    console.log('New tier added');
  };

  return (
    <div className="p-8">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold">Discount Rules</h1>
          <Button onClick={handleAddTier} data-testid="button-add-tier">
            <Plus className="w-4 h-4 mr-2" />
            Add Tier
          </Button>
        </div>

        <div className="space-y-4">
          {tiers.map((tier) => (
            <DiscountTierCard
              key={tier.id}
              tier={tier}
              onUpdate={handleUpdate}
              onDelete={handleDelete}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
