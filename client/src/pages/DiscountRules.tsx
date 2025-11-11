import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Plus, Trash2, AlertCircle } from "lucide-react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { DiscountTier, StoreSettings } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";

interface BracketFormData {
  fromFollowers: number;
  toFollowers: number | null;
  discountPercent: number;
}

export default function DiscountRules() {
  const { toast } = useToast();
  const [minFollowers, setMinFollowers] = useState(0);
  const [brackets, setBrackets] = useState<BracketFormData[]>([
    { fromFollowers: 0, toFollowers: 1000, discountPercent: 5 },
  ]);

  const { data: settings } = useQuery<StoreSettings>({
    queryKey: ["/api/settings"],
  });

  const { data: existingTiers, isLoading } = useQuery<DiscountTier[]>({
    queryKey: ["/api/discount-tiers"],
  });

  useEffect(() => {
    if (settings) {
      setMinFollowers(settings.minFollowers || 0);
    }
  }, [settings]);

  useEffect(() => {
    if (existingTiers && existingTiers.length > 0) {
      const loadedBrackets = existingTiers.map((tier) => ({
        fromFollowers: tier.fromFollowers,
        toFollowers: tier.toFollowers,
        discountPercent: typeof tier.discountPercent === 'string' 
          ? parseFloat(tier.discountPercent) 
          : tier.discountPercent,
      }));
      setBrackets(loadedBrackets);
    }
  }, [existingTiers]);

  const saveRulesMutation = useMutation({
    mutationFn: async (payload: { minFollowers: number; tiers: BracketFormData[] }) => {
      return await apiRequest("POST", "/api/discount-rules", payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/discount-tiers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/settings"] });
      toast({ description: "Discount rules saved successfully" });
    },
    onError: (error: Error) => {
      toast({
        description: error.message || "Failed to save discount rules",
        variant: "destructive",
      });
    },
  });

  const handleAddBracket = () => {
    const lastBracket = brackets[brackets.length - 1];
    
    if (lastBracket.toFollowers === null) {
      const newFrom = lastBracket.fromFollowers + 1000;
      const newTo = newFrom + 999;
      
      setBrackets([
        ...brackets.slice(0, -1),
        { ...lastBracket, toFollowers: newFrom - 1 },
        { fromFollowers: newFrom, toFollowers: null, discountPercent: 5 },
      ]);
    } else {
      const newFrom = lastBracket.toFollowers + 1;
      setBrackets([
        ...brackets,
        { fromFollowers: newFrom, toFollowers: null, discountPercent: 5 },
      ]);
    }
  };

  const handleRemoveBracket = (index: number) => {
    if (brackets.length === 1) {
      toast({
        description: "You must have at least one discount bracket",
        variant: "destructive",
      });
      return;
    }

    const newBrackets = brackets.filter((_, i) => i !== index);
    
    if (index === newBrackets.length) {
      newBrackets[newBrackets.length - 1].toFollowers = null;
    }
    
    setBrackets(newBrackets);
  };

  const handleBracketChange = (index: number, field: keyof BracketFormData, value: number | null) => {
    const newBrackets = [...brackets];
    newBrackets[index] = { ...newBrackets[index], [field]: value };
    setBrackets(newBrackets);
  };

  const handleSave = () => {
    const hasInvalidDiscount = brackets.some((b) => b.discountPercent < 2.5);
    if (hasInvalidDiscount) {
      toast({
        description: "Minimum discount allowed is 2.5%",
        variant: "destructive",
      });
      return;
    }

    if (brackets.length > 0 && brackets[0].fromFollowers < minFollowers) {
      toast({
        description: `First bracket must start at or above the minimum followers threshold (${minFollowers})`,
        variant: "destructive",
      });
      return;
    }

    const normalizedBrackets = brackets.map((bracket, index) => ({
      ...bracket,
      toFollowers: index === brackets.length - 1 ? null : bracket.toFollowers,
    }));

    saveRulesMutation.mutate({ minFollowers, tiers: normalizedBrackets });
  };

  if (isLoading) {
    return (
      <div className="p-8">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-2xl font-bold mb-6">Discount Rules</h1>
          <div className="h-96 bg-muted animate-pulse rounded-xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-2xl font-bold mb-2">Discount Rules</h1>
        <p className="text-muted-foreground mb-6">
          Set follower thresholds and discounts for Spiral shoppers.
        </p>

        <Card>
          <CardHeader>
            <CardTitle>Follower Requirements</CardTitle>
            <CardDescription>
              Define the minimum followers required and create discount brackets
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div>
              <label className="block text-sm font-medium mb-2">
                Minimum followers required to qualify
              </label>
              <Input
                type="number"
                className="w-48"
                value={minFollowers}
                onChange={(e) => setMinFollowers(Number(e.target.value))}
                min={0}
                data-testid="input-min-followers"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-3">
                <label className="block text-sm font-medium">Discount Brackets</label>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleAddBracket}
                  data-testid="button-add-bracket"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Add Bracket
                </Button>
              </div>

              <div className="border rounded-lg overflow-hidden">
                <table className="w-full">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="text-left px-4 py-3 text-sm font-medium">From</th>
                      <th className="text-left px-4 py-3 text-sm font-medium">To</th>
                      <th className="text-left px-4 py-3 text-sm font-medium">Discount (%)</th>
                      <th className="w-12 px-4 py-3"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {brackets.map((bracket, index) => (
                      <tr key={index} data-testid={`row-bracket-${index}`}>
                        <td className="px-4 py-3">
                          <Input
                            type="number"
                            className="w-32"
                            value={bracket.fromFollowers}
                            onChange={(e) =>
                              handleBracketChange(index, "fromFollowers", Number(e.target.value))
                            }
                            min={index === 0 ? minFollowers : 0}
                            data-testid={`input-from-${index}`}
                          />
                        </td>
                        <td className="px-4 py-3">
                          {index === brackets.length - 1 ? (
                            <span className="text-muted-foreground text-sm">No limit</span>
                          ) : (
                            <Input
                              type="number"
                              className="w-32"
                              value={bracket.toFollowers || 0}
                              onChange={(e) =>
                                handleBracketChange(index, "toFollowers", Number(e.target.value))
                              }
                              min={bracket.fromFollowers + 1}
                              data-testid={`input-to-${index}`}
                            />
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <Input
                            type="number"
                            className="w-24"
                            value={bracket.discountPercent}
                            onChange={(e) =>
                              handleBracketChange(index, "discountPercent", Number(e.target.value))
                            }
                            min={2.5}
                            step={0.1}
                            data-testid={`input-discount-${index}`}
                          />
                        </td>
                        <td className="px-4 py-3">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleRemoveBracket(index)}
                            disabled={brackets.length === 1}
                            data-testid={`button-remove-${index}`}
                          >
                            <Trash2 className="w-4 h-4 text-muted-foreground" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex items-start gap-2 mt-3 p-3 bg-muted/30 rounded-md">
                <AlertCircle className="w-4 h-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                <p className="text-sm text-muted-foreground">
                  The final bracket automatically has no upper limit. All discounts must be at least 2.5%.
                </p>
              </div>
            </div>

            <div className="flex justify-end pt-4">
              <Button
                onClick={handleSave}
                disabled={saveRulesMutation.isPending}
                data-testid="button-save-rules"
              >
                {saveRulesMutation.isPending ? "Saving..." : "Save Changes"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
