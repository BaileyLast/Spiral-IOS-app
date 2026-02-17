import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { CreditCard, RefreshCw, Wifi, WifiOff } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import type { StoreSettings } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";
import { StatusBadge } from "@/components/StatusBadge";
import shopifyIcon from "@assets/Shopify Purple_1763735957080.png";
import instagramIcon from "@assets/Instagram Purple_1763735981805.png";

export default function Connections() {
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
        <div className="max-w-7xl mx-auto space-y-8">
          <div>
            <h1 className="text-3xl font-bold bg-gradient-to-r from-[#5729a3] to-[#935eb2] bg-clip-text text-transparent">
              Connections
            </h1>
            <p className="text-muted-foreground mt-2">Manage your Shopify and Instagram integrations</p>
          </div>
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
      <div className="max-w-7xl mx-auto space-y-8">
        <div>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-[#5729a3] to-[#935eb2] bg-clip-text text-transparent">
            Connections
          </h1>
          <p className="text-muted-foreground mt-2">Manage your Shopify and Instagram integrations</p>
        </div>
        
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
                  <div className="border-t pt-4 mt-4">
                    <Label className="text-sm text-muted-foreground">Story Mention Webhook</Label>
                    <div className="flex items-center gap-2 mt-1" data-testid="webhook-status">
                      {settings?.webhookSubscriptionStatus === 'active' ? (
                        <Badge variant="outline" className="text-green-700 border-green-300 bg-green-50 dark:text-green-400 dark:border-green-700 dark:bg-green-950">
                          <Wifi className="w-3 h-3 mr-1" />
                          Active
                        </Badge>
                      ) : settings?.webhookSubscriptionStatus === 'subscription_failed' ? (
                        <Badge variant="outline" className="text-amber-700 border-amber-300 bg-amber-50 dark:text-amber-400 dark:border-amber-700 dark:bg-amber-950">
                          <WifiOff className="w-3 h-3 mr-1" />
                          Subscription Failed
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-muted-foreground">
                          <WifiOff className="w-3 h-3 mr-1" />
                          Inactive
                        </Badge>
                      )}
                    </div>
                    {settings?.lastWebhookReceivedAt && (
                      <p className="text-xs text-muted-foreground mt-2" data-testid="text-last-webhook">
                        Last story mention received: {new Date(settings.lastWebhookReceivedAt).toLocaleString()}
                      </p>
                    )}
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
