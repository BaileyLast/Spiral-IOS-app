import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { CreditCard, ExternalLink } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import type { StoreSettings } from "@shared/schema";
import { StatusBadge } from "@/components/StatusBadge";
const shopifyIcon = "/shopify-icon.png";

// Shopify is connected once on the merchant dashboard; the customer app
// reads the live credentials from there. There is no in-app OAuth here.
const MERCHANT_DASHBOARD_URL = "https://spiral-merchant-dashboard.replit.app";

type SettingsResponse = StoreSettings & { shopifyConnected?: boolean };

export default function Connections() {
  const { data: settings, isLoading } = useQuery<SettingsResponse>({
    queryKey: ["/api/settings"],
  });

  const handleOpenDashboard = () => {
    window.open(MERCHANT_DASHBOARD_URL, "_blank", "noopener,noreferrer");
  };

  const isShopifyConnected = !!settings?.shopifyConnected;

  if (isLoading) {
    return (
      <div className="p-8">
        <div className="max-w-7xl mx-auto space-y-8">
          <div>
            <h1 className="text-3xl font-bold bg-gradient-to-r from-[#4ECCA3] to-[#2BAE88] bg-clip-text text-transparent">
              Connections
            </h1>
            <p className="text-muted-foreground mt-2">Manage your Shopify integration</p>
          </div>
          <div className="grid gap-6">
            {[1, 2].map((i) => (
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
          <h1 className="text-3xl font-bold bg-gradient-to-r from-[#4ECCA3] to-[#2BAE88] bg-clip-text text-transparent">
            Connections
          </h1>
          <p className="text-muted-foreground mt-2">Manage your Shopify integration</p>
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
                  <p className="text-sm text-muted-foreground">
                    Shopify is connected through your Spiral merchant dashboard. To
                    reconnect or switch stores, open the dashboard.
                  </p>
                  <Button
                    onClick={handleOpenDashboard}
                    variant="outline"
                    data-testid="button-open-dashboard"
                  >
                    <ExternalLink className="w-4 h-4 mr-2" />
                    Open Merchant Dashboard
                  </Button>
                </div>
              ) : (
                <div className="space-y-4">
                  <p className="text-sm text-muted-foreground">
                    Connect your Shopify store in the Spiral merchant dashboard.
                    Once it's connected there, this app will pick it up
                    automatically within a few minutes — no setup needed here.
                  </p>
                  <Button
                    onClick={handleOpenDashboard}
                    data-testid="button-open-dashboard"
                    className="bg-[#4ECCA3] text-white"
                  >
                    <ExternalLink className="w-4 h-4 mr-2" />
                    Open Merchant Dashboard
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
