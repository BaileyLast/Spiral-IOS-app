import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { CreditCard, RefreshCw } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import type { StoreSettings } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";
import { StatusBadge } from "@/components/StatusBadge";
import shopifyIcon from "@assets/Shopify Purple_1763735957080.png";
import instagramIcon from "@assets/Instagram Purple_1763735981805.png";

export default function Settings() {
  const { toast } = useToast();

  const { data: settings, isLoading } = useQuery<StoreSettings>({
    queryKey: ["/api/settings"],
  });

  const handleConnectShopify = () => {
    window.location.href = '/auth/shopify';
  };

  const handleConnectInstagram = () => {
    window.location.href = '/auth/instagram';
  };

  const isShopifyConnected = !!(settings?.accessToken && settings?.shopDomain);
  const isInstagramConnected = !!(settings?.instagramBusinessAccountId && settings?.instagramAccessToken);

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
                  <img src={shopifyIcon} alt="Shopify" className="h-8 w-auto" />
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
                    className="bg-[#5729a3] text-white"
                  >
                    <img src={shopifyIcon} alt="" className="h-4 w-auto mr-2" />
                    Connect to Shopify
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <img src={instagramIcon} alt="Instagram" className="h-8 w-auto" />
                  <div>
                    <CardTitle>Instagram Connection</CardTitle>
                    <CardDescription>Manage your Instagram Business Account integration</CardDescription>
                  </div>
                </div>
                <StatusBadge 
                  active={isInstagramConnected}
                  activeLabel="Connected"
                  inactiveLabel="Not Connected"
                />
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {isInstagramConnected ? (
                <div className="space-y-4">
                  <div>
                    <Label className="text-sm text-muted-foreground">Instagram Username</Label>
                    <p className="text-sm font-medium mt-1" data-testid="text-instagram-username">
                      @{settings?.instagramUsername}
                    </p>
                  </div>
                  <div>
                    <Label className="text-sm text-muted-foreground">Business Account ID</Label>
                    <p className="text-sm font-mono text-xs mt-1" data-testid="text-business-account-id">
                      {settings?.instagramBusinessAccountId}
                    </p>
                  </div>
                  <div>
                    <Label className="text-sm text-muted-foreground">Page ID</Label>
                    <p className="text-sm font-mono text-xs mt-1" data-testid="text-page-id">
                      {settings?.instagramPageId}
                    </p>
                  </div>
                  <Button 
                    onClick={handleConnectInstagram} 
                    variant="outline"
                    data-testid="button-reconnect-instagram"
                  >
                    <RefreshCw className="w-4 h-4 mr-2" />
                    Reconnect Account
                  </Button>
                </div>
              ) : (
                <div className="space-y-4">
                  <p className="text-sm text-muted-foreground">
                    Connect your Instagram Business Account to enable automatic follower verification and discount management.
                  </p>
                  <Button 
                    onClick={handleConnectInstagram}
                    data-testid="button-connect-instagram"
                    className="bg-[#5729a3] text-white"
                  >
                    <img src={instagramIcon} alt="" className="h-4 w-auto mr-2" />
                    Connect Instagram
                  </Button>
                </div>
              )}
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
