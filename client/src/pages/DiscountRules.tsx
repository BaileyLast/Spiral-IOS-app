import { DiscountTierCard } from "@/components/DiscountTierCard";
import { Button } from "@/components/ui/button";
import { Plus, AlertCircle } from "lucide-react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { DiscountTier } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";
import { useEffect } from "react";

export default function DiscountRules() {
  const { toast } = useToast();
  const { data: tiers = [], isLoading, isError, error } = useQuery<DiscountTier[]>({
    queryKey: ["/api/discount-tiers"],
  });

  useEffect(() => {
    if (isError) {
      toast({
        description: error instanceof Error ? error.message : "Failed to load discount tiers",
        variant: "destructive",
      });
    }
  }, [isError, error, toast]);

  const createTierMutation = useMutation({
    mutationFn: async (tier: { minFollowers: number; maxFollowers: number; discountPercent: number }) => {
      return await apiRequest("POST", "/api/discount-tiers", tier);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/discount-tiers"] });
      toast({ description: "Discount tier added successfully" });
    },
    onError: (error: Error) => {
      toast({ 
        description: error.message || "Failed to add discount tier", 
        variant: "destructive" 
      });
    },
  });

  const updateTierMutation = useMutation({
    mutationFn: async ({ id, ...tier }: { id: string; minFollowers: number; maxFollowers: number; discountPercent: number }) => {
      return await apiRequest("PATCH", `/api/discount-tiers/${id}`, tier);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/discount-tiers"] });
      toast({ description: "Discount tier updated successfully" });
    },
    onError: (error: Error) => {
      toast({ 
        description: error.message || "Failed to update discount tier", 
        variant: "destructive" 
      });
    },
  });

  const deleteTierMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest("DELETE", `/api/discount-tiers/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/discount-tiers"] });
      toast({ description: "Discount tier deleted successfully" });
    },
    onError: (error: Error) => {
      toast({ 
        description: error.message || "Failed to delete discount tier", 
        variant: "destructive" 
      });
    },
  });

  const handleUpdate = (tier: { id: string; minFollowers: number; maxFollowers: number; discountPercent: number }) => {
    updateTierMutation.mutate(tier);
  };

  const handleDelete = (id: string) => {
    deleteTierMutation.mutate(id);
  };

  const handleAddTier = () => {
    createTierMutation.mutate({
      minFollowers: 0,
      maxFollowers: 1000,
      discountPercent: 5,
    });
  };

  if (isLoading) {
    return (
      <div className="p-8">
        <div className="max-w-7xl mx-auto">
          <h1 className="text-2xl font-bold mb-6">Discount Rules</h1>
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-48 bg-muted animate-pulse rounded-lg" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="p-8">
        <div className="max-w-7xl mx-auto">
          <h1 className="text-2xl font-bold mb-6">Discount Rules</h1>
          <div className="flex flex-col items-center justify-center py-12 border rounded-lg bg-destructive/10">
            <AlertCircle className="w-12 h-12 text-destructive mb-4" />
            <p className="text-lg font-medium text-foreground mb-2">Failed to load discount rules</p>
            <p className="text-sm text-muted-foreground">
              {error instanceof Error ? error.message : "An unexpected error occurred"}
            </p>
          </div>
        </div>
      </div>
    );
  }

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
          {tiers.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              No discount tiers yet. Click "Add Tier" to create one.
            </div>
          ) : (
            tiers.map((tier) => (
              <DiscountTierCard
                key={tier.id}
                tier={tier}
                onUpdate={handleUpdate}
                onDelete={handleDelete}
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
}
