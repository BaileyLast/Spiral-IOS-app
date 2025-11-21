import { StatusBadge } from "@/components/StatusBadge";
import { AlertCircle, Users, TrendingUp } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import type { StoreSettings, Verification } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useLocation } from "wouter";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDistanceToNow } from "date-fns";
import shopifyIcon from "@assets/Shopify Purple_1763735957080.png";
import instagramIcon from "@assets/Instagram Purple_1763735981805.png";

export default function Home() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  
  const { data: settings, isLoading: settingsLoading, isError, error } = useQuery<StoreSettings | null>({
    queryKey: ["/api/settings"],
  });

  const { data: verifications = [], isLoading: verificationsLoading } = useQuery<Verification[]>({
    queryKey: ["/api/verifications"],
  });

  useEffect(() => {
    if (isError) {
      toast({
        description: error instanceof Error ? error.message : "Failed to load store settings",
        variant: "destructive",
      });
    }
  }, [isError, error, toast]);

  const isLoading = settingsLoading || verificationsLoading;

  if (isLoading) {
    return (
      <div className="p-8">
        <div className="max-w-7xl mx-auto">
          <h1 className="text-2xl font-bold mb-6">Dashboard</h1>
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {[1, 2].map((i) => (
                <div key={i} className="h-24 bg-muted animate-pulse rounded-xl" />
              ))}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-32 bg-muted animate-pulse rounded-xl" />
              ))}
            </div>
            <div className="h-64 bg-muted animate-pulse rounded-xl" />
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

  const isShopifyConnected = !!(settings?.accessToken && settings?.shopDomain);
  const isInstagramConnected = !!(settings?.instagramBusinessAccountId && settings?.instagramAccessToken);
  
  // Calculate KPIs
  const totalAudienceReach = verifications.reduce((sum, v) => sum + (v.followerCount || 0), 0);
  const totalPosts = verifications.length;
  
  // Get recent activity (last 5 verifications)
  const recentActivity = [...verifications]
    .sort((a, b) => new Date(b.verifiedAt).getTime() - new Date(a.verifiedAt).getTime())
    .slice(0, 5);

  const getShopifyStatus = () => {
    if (!isShopifyConnected) return { label: "Not Connected", variant: "inactive" as const };
    if (!settings?.tokenActive) return { label: "Expired", variant: "inactive" as const };
    return { label: "Connected", variant: "active" as const };
  };

  const getInstagramStatus = () => {
    if (!isInstagramConnected) return { label: "Not Connected", variant: "inactive" as const };
    return { label: "Connected", variant: "active" as const };
  };

  const shopifyStatus = getShopifyStatus();
  const instagramStatus = getInstagramStatus();

  return (
    <div className="p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        
        {/* System Status */}
        <div>
          <h2 className="text-lg font-semibold mb-3">System Status</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <img src={shopifyIcon} alt="Shopify" className="h-12 w-auto" />
                    <div>
                      <p className="text-sm font-medium">Shopify Connection</p>
                      <p className="text-xs text-muted-foreground">
                        {settings?.shopDomain || "Not connected"}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusBadge 
                      active={shopifyStatus.variant === "active"}
                      activeLabel="Connected"
                      inactiveLabel={shopifyStatus.label}
                    />
                    {!isShopifyConnected && (
                      <Button 
                        size="sm" 
                        variant="outline"
                        onClick={() => setLocation("/settings")}
                        data-testid="button-connect-shopify-status"
                      >
                        Connect
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <img src={instagramIcon} alt="Instagram" className="h-12 w-auto" />
                    <div>
                      <p className="text-sm font-medium">Instagram Connection</p>
                      <p className="text-xs text-muted-foreground">
                        {settings?.instagramUsername ? `@${settings.instagramUsername}` : "Not connected"}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusBadge 
                      active={instagramStatus.variant === "active"}
                      activeLabel="Connected"
                      inactiveLabel={instagramStatus.label}
                    />
                    {!isInstagramConnected && (
                      <Button 
                        size="sm" 
                        variant="outline"
                        onClick={() => setLocation("/settings")}
                        data-testid="button-connect-instagram-status"
                      >
                        Connect
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Performance */}
        <div>
          <h2 className="text-lg font-semibold mb-3">Performance</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card>
              <CardHeader className="pb-3">
                <CardDescription>Total Audience Reach</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-primary/10">
                    <Users className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold" data-testid="text-total-reach">
                      {totalAudienceReach.toLocaleString()}
                    </p>
                    <p className="text-xs text-muted-foreground">followers</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardDescription>Total Posts</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-primary/10">
                    <TrendingUp className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold" data-testid="text-total-posts">
                      {totalPosts}
                    </p>
                    <p className="text-xs text-muted-foreground">verifications</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Recent Activity */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold">Recent Activity</h2>
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => setLocation("/verifications")}
              data-testid="button-view-all-verifications"
            >
              View All
            </Button>
          </div>
          <Card>
            <CardContent className="p-0">
              {recentActivity.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12">
                  <AlertCircle className="w-12 h-12 text-muted-foreground mb-3" />
                  <p className="text-sm font-medium text-foreground mb-1">No activity yet</p>
                  <p className="text-xs text-muted-foreground">
                    Verification requests will appear here
                  </p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Email</TableHead>
                      <TableHead>Instagram</TableHead>
                      <TableHead>Followers</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Time</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {recentActivity.map((verification) => (
                      <TableRow key={verification.id} data-testid={`row-verification-${verification.id}`}>
                        <TableCell className="font-medium" data-testid={`text-email-${verification.id}`}>
                          {verification.shopperEmail}
                        </TableCell>
                        <TableCell data-testid={`text-handle-${verification.id}`}>
                          {verification.instagramHandle}
                        </TableCell>
                        <TableCell data-testid={`text-followers-${verification.id}`}>
                          {verification.followerCount.toLocaleString()}
                        </TableCell>
                        <TableCell>
                          <StatusBadge 
                            active={verification.status === "approved"}
                            activeLabel="Approved"
                            inactiveLabel={verification.status === "pending" ? "Pending" : "Rejected"}
                          />
                        </TableCell>
                        <TableCell className="text-right text-sm text-muted-foreground" data-testid={`text-time-${verification.id}`}>
                          {formatDistanceToNow(new Date(verification.verifiedAt), { addSuffix: true })}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
