import { StoreInfoCard } from "@/components/StoreInfoCard";
import { StatusBadge } from "@/components/StatusBadge";
import { Store, Instagram, Shield, AlertCircle } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import type { StoreSettings } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

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

  const isConnected = settings?.accessToken && settings?.shopDomain;

  const handleConnectShopify = () => {
    const shop = prompt("Enter your Shopify store domain (e.g., your-store.myshopify.com):");
    if (shop) {
      window.location.href = `/shopify/install?shop=${encodeURIComponent(shop)}`;
    }
  };

  return (
    <div className="p-8">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-2xl font-bold mb-6">Dashboard</h1>
        
        {!isConnected && (
          <Card className="mb-6">
            <CardHeader>
              <CardTitle>Connect Your Shopify Store</CardTitle>
              <CardDescription>
                Connect your Shopify store to start managing Instagram-based discounts for your customers.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button 
                onClick={handleConnectShopify} 
                data-testid="button-connect-shopify"
              >
                <Store className="w-4 h-4 mr-2" />
                Connect to Shopify
              </Button>
            </CardContent>
          </Card>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <StoreInfoCard 
            icon={Store} 
            label="Connected Store" 
            value={settings?.shopDomain || "Not connected"} 
          />
          <StoreInfoCard 
            icon={Instagram} 
            label="Instagram Handle" 
            value={settings?.instagramHandle || "Not configured"} 
          />
          <StoreInfoCard 
            icon={Shield} 
            label="Shopify Connection" 
            value={<StatusBadge active={!!isConnected} />} 
          />
        </div>
      </div>
    </div>
  );
}
