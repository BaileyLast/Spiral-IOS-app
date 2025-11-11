import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Store, Instagram, CreditCard, RefreshCw } from "lucide-react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { StoreSettings } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";
import { StatusBadge } from "@/components/StatusBadge";

export default function Settings() {
  const { toast } = useToast();
  const [instagramHandle, setInstagramHandle] = useState("");

  const { data: settings, isLoading } = useQuery<StoreSettings>({
    queryKey: ["/api/settings"],
  });

  useEffect(() => {
    if (settings?.instagramHandle) {
      setInstagramHandle(settings.instagramHandle);
    }
  }, [settings]);

  const updateSettingsMutation = useMutation({
    mutationFn: async (payload: Partial<StoreSettings>) => {
      return await apiRequest("PATCH", "/api/settings", payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings"] });
      toast({ description: "Settings updated successfully" });
    },
    onError: (error: Error) => {
      toast({
        description: error.message || "Failed to update settings",
        variant: "destructive",
      });
    },
  });

  const handleConnectShopify = () => {
    const shop = prompt("Enter your Shopify store domain (e.g., your-store.myshopify.com):");
    if (shop) {
      window.location.href = `/shopify/install?shop=${encodeURIComponent(shop)}`;
    }
  };

  const handleUpdateInstagram = (e: React.FormEvent) => {
    e.preventDefault();
    const handle = instagramHandle.startsWith('@') ? instagramHandle : `@${instagramHandle}`;
    updateSettingsMutation.mutate({ 
      instagramHandle: handle,
      storeName: settings?.storeName || "My Store"
    });
  };

  const isShopifyConnected = !!(settings?.accessToken && settings?.shopDomain);

  if (isLoading) {
    return (
      <div className="p-8">
        <div className="max-w-7xl mx-auto">
          <h1 className="text-2xl font-bold mb-6">Settings</h1>
          <div className="grid gap-6">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-48 bg-muted animate-pulse rounded-xl" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-2xl font-bold mb-6">Settings</h1>
        
        <div className="grid gap-6">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Store className="w-5 h-5 text-muted-foreground" />
                  <div>
                    <CardTitle>Shopify Connection</CardTitle>
                    <CardDescription>Manage your Shopify store integration</CardDescription>
                  </div>
                </div>
                <StatusBadge 
                  active={isShopifyConnected}
                  activeLabel="Connected"
                  inactiveLabel="Not Connected"
                />
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {isShopifyConnected ? (
                <div className="space-y-4">
                  <div>
                    <Label className="text-sm text-muted-foreground">Store Domain</Label>
                    <p className="text-sm font-medium mt-1" data-testid="text-shop-domain">
                      {settings?.shopDomain}
                    </p>
                  </div>
                  <div>
                    <Label className="text-sm text-muted-foreground">Store Name</Label>
                    <p className="text-sm font-medium mt-1" data-testid="text-store-name">
                      {settings?.storeName}
                    </p>
                  </div>
                  <Button 
                    onClick={handleConnectShopify} 
                    variant="outline"
                    data-testid="button-reconnect-shopify"
                  >
                    <RefreshCw className="w-4 h-4 mr-2" />
                    Reconnect Store
                  </Button>
                </div>
              ) : (
                <div className="space-y-4">
                  <p className="text-sm text-muted-foreground">
                    Connect your Shopify store to enable discount verification and management.
                  </p>
                  <Button 
                    onClick={handleConnectShopify}
                    data-testid="button-connect-shopify"
                  >
                    <Store className="w-4 h-4 mr-2" />
                    Connect to Shopify
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                <Instagram className="w-5 h-5 text-muted-foreground" />
                <div>
                  <CardTitle>Instagram Settings</CardTitle>
                  <CardDescription>Configure your Instagram business account</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleUpdateInstagram} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="instagram-handle">Instagram Handle</Label>
                  <Input
                    id="instagram-handle"
                    type="text"
                    placeholder="@yourstore"
                    value={instagramHandle}
                    onChange={(e) => setInstagramHandle(e.target.value)}
                    data-testid="input-instagram-handle"
                  />
                  <p className="text-xs text-muted-foreground">
                    This is the Instagram account that shoppers must follow to qualify for discounts.
                  </p>
                </div>
                <Button 
                  type="submit" 
                  disabled={updateSettingsMutation.isPending}
                  data-testid="button-save-instagram"
                >
                  {updateSettingsMutation.isPending ? "Saving..." : "Save Instagram Settings"}
                </Button>
              </form>
              
              <div className="mt-6 p-4 border rounded-lg bg-muted/50">
                <p className="text-sm font-medium mb-2">Instagram API Connection</p>
                <StatusBadge 
                  active={false}
                  activeLabel="Connected"
                  inactiveLabel="Not Connected"
                />
                <p className="text-xs text-muted-foreground mt-2">
                  Instagram Graph API integration coming soon for automatic follower verification.
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                <CreditCard className="w-5 h-5 text-muted-foreground" />
                <div>
                  <CardTitle>Billing & Subscription</CardTitle>
                  <CardDescription>Manage your plan and billing information</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="p-4 border rounded-lg bg-muted/50">
                <p className="text-sm text-muted-foreground">
                  Billing management coming soon. You'll be able to view your current plan, usage, and payment methods here.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
