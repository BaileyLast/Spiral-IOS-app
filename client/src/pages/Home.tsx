import { StoreInfoCard } from "@/components/StoreInfoCard";
import { StatusBadge } from "@/components/StatusBadge";
import { Store, Instagram, Shield, AlertCircle } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import type { StoreSettings } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";
import { useEffect } from "react";

export default function Home() {
  const { toast } = useToast();
  const { data: settings, isLoading, isError, error } = useQuery<StoreSettings | null>({
    queryKey: ["/api/settings"],
  });

  useEffect(() => {
    if (isError) {
      toast({
        description: error instanceof Error ? error.message : "Failed to load store settings",
        variant: "destructive",
      });
    }
  }, [isError, error, toast]);

  if (isLoading) {
    return (
      <div className="p-8">
        <div className="max-w-7xl mx-auto">
          <h1 className="text-2xl font-bold mb-6">Dashboard</h1>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-32 bg-muted animate-pulse rounded-lg" />
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
          <h1 className="text-2xl font-bold mb-6">Dashboard</h1>
          <div className="flex flex-col items-center justify-center py-12 border rounded-lg bg-destructive/10">
            <AlertCircle className="w-12 h-12 text-destructive mb-4" />
            <p className="text-lg font-medium text-foreground mb-2">Failed to load dashboard</p>
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
        <h1 className="text-2xl font-bold mb-6">Dashboard</h1>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <StoreInfoCard 
            icon={Store} 
            label="Connected Store" 
            value={settings?.storeName || "Not connected"} 
          />
          <StoreInfoCard 
            icon={Instagram} 
            label="Instagram Handle" 
            value={settings?.instagramHandle || "Not connected"} 
          />
          <StoreInfoCard 
            icon={Shield} 
            label="Token Health" 
            value={<StatusBadge active={settings?.tokenActive ?? false} />} 
          />
        </div>
      </div>
    </div>
  );
}
