import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Plus, Trash2, AlertCircle } from "lucide-react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { DiscountTier } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";

interface BracketFormData {
  fromFollowers: number;
  toFollowers: number | null;
  discountPercent: number;
}

export default function DiscountRules() {
  const { toast } = useToast();
  const [brackets, setBrackets] = useState<BracketFormData[]>([
    { fromFollowers: 300, toFollowers: 499, discountPercent: 2.5 },
    { fromFollowers: 500, toFollowers: 999, discountPercent: 5 },
    { fromFollowers: 1000, toFollowers: 1499, discountPercent: 7.5 },
    { fromFollowers: 1500, toFollowers: null, discountPercent: 10 },
  ]);

  const { data: existingTiers, isLoading } = useQuery<DiscountTier[]>({
    queryKey: ["/api/discount-tiers"],
  });

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
    
    for (let i = Math.max(1, index); i < newBrackets.length; i++) {
      const prevBracket = newBrackets[i - 1];
      if (prevBracket.toFollowers !== null) {
        newBrackets[i].fromFollowers = prevBracket.toFollowers + 1;
      }
    }
    
    setBrackets(newBrackets);
  };

  const handleBracketChange = (index: number, field: keyof BracketFormData, value: number | null) => {
    const newBrackets = [...brackets];
    newBrackets[index] = { ...newBrackets[index], [field]: value };
    
    if (field === 'toFollowers' && index < newBrackets.length - 1) {
      for (let i = index + 1; i < newBrackets.length; i++) {
        const prevBracket = newBrackets[i - 1];
        if (prevBracket.toFollowers !== null) {
          newBrackets[i].fromFollowers = prevBracket.toFollowers + 1;
        }
      }
    }
    
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

    const effectiveMinFollowers = brackets[0]?.fromFollowers ?? 0;

    const normalizedBrackets = brackets.map((bracket, index) => ({
      ...bracket,
      toFollowers: index === brackets.length - 1 ? null : bracket.toFollowers,
    }));

    saveRulesMutation.mutate({ minFollowers: effectiveMinFollowers, tiers: normalizedBrackets });
  };

  if (isLoading) {
    return (
      <div className="p-8">
        <div className="max-w-4xl mx-auto space-y-8">
          <div>
            <h1 className="text-3xl font-bold bg-gradient-to-r from-[#5729a3] to-[#935eb2] bg-clip-text text-transparent">
              Discount Rules
            </h1>
            <p className="text-muted-foreground mt-2">Set follower thresholds and discounts for Spiral shoppers</p>
          </div>
          <div className="h-96 bg-muted animate-pulse rounded-xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="p-8">
      <div className="max-w-4xl mx-auto space-y-8">
        <div>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-[#5729a3] to-[#935eb2] bg-clip-text text-transparent">
            Discount Rules
          </h1>
          <p className="text-muted-foreground mt-2">Set follower thresholds and discounts for Spiral shoppers</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Follower Requirements</CardTitle>
            <CardDescription>
              Define the minimum followers required and create discount brackets
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between mb-3">
              <div>
                <label className="block text-sm font-medium">Discount Brackets</label>
                <p className="text-xs text-muted-foreground mt-1">
                  Minimum {brackets[0]?.fromFollowers || 0} followers required to qualify
                </p>
              </div>
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
                          {index === 0 ? (
                            <Input
                              type="number"
                              className="w-32"
                              value={bracket.fromFollowers}
                              onChange={(e) =>
                                handleBracketChange(index, "fromFollowers", Number(e.target.value))
                              }
                              min={0}
                              data-testid={`input-from-${index}`}
                            />
                          ) : (
                            <Input
                              type="number"
                              className="w-32 bg-muted/30"
                              value={bracket.fromFollowers}
                              readOnly
                              disabled
                              data-testid={`input-from-${index}`}
                            />
                          )}
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
                The final bracket automatically has no upper limit. All discounts must be at least 2.5%. The first bracket's starting point sets the minimum followers required.
              </p>
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
