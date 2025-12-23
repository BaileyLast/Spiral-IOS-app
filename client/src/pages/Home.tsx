import { AlertCircle, Users, TrendingUp, AlertTriangle } from "lucide-react";
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
  
  // Get recent activity (last 5 verifications) - sort by most recent date available
  const getVerificationDate = (v: Verification) => {
    if (v.verifiedAt) return new Date(v.verifiedAt).getTime();
    if (v.failedAt) return new Date(v.failedAt).getTime();
    if (v.storyDetectedAt) return new Date(v.storyDetectedAt).getTime();
    return new Date(v.createdAt).getTime();
  };
  
  const recentActivity = [...verifications]
    .sort((a, b) => getVerificationDate(b) - getVerificationDate(a))
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
      <div className="max-w-7xl mx-auto space-y-8">
        <div>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-[#5729a3] to-[#935eb2] bg-clip-text text-transparent">
            Dashboard
          </h1>
          <p className="text-muted-foreground mt-2">Monitor your Instagram verification campaigns</p>
        </div>
        
        {/* System Status */}
        <div>
          <h2 className="text-lg font-semibold mb-4">Connections</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Shopify Connection Card */}
            <Card className={`relative overflow-hidden transition-all duration-300 ${
              shopifyStatus.variant === "active" 
                ? 'border-[#5729a3]/30 shadow-lg shadow-[#5729a3]/5' 
                : ''
            }`}>
              <div className={`absolute top-0 left-0 right-0 h-1 ${
                shopifyStatus.variant === "active" 
                  ? 'bg-gradient-to-r from-[#5729a3] to-[#935eb2]' 
                  : shopifyStatus.label === "Expired"
                  ? 'bg-yellow-500'
                  : 'bg-muted'
              }`} />
              <CardContent className="pt-7 pb-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <img src={shopifyIcon} alt="Shopify" className="h-12 w-auto" />
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="text-base font-semibold">Shopify</p>
                        {shopifyStatus.label === "Expired" ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-700 border border-yellow-200">
                            <AlertTriangle className="w-3 h-3" />
                            Expired
                          </span>
                        ) : (
                          <div className={`h-2 w-2 rounded-full ${
                            shopifyStatus.variant === "active" 
                              ? 'bg-green-500 animate-pulse' 
                              : 'bg-muted-foreground'
                          }`} />
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground mt-0.5">
                        {shopifyStatus.variant === "active" && settings?.shopDomain
                          ? settings.shopDomain
                          : shopifyStatus.label === "Expired"
                          ? "Token expired - reconnect required"
                          : "No store connected"}
                      </p>
                    </div>
                  </div>
                  {shopifyStatus.variant !== "active" && (
                    <Button 
                      size="sm" 
                      onClick={() => setLocation("/settings")}
                      data-testid="button-connect-shopify-status"
                      className="bg-[#5729a3] text-white"
                    >
                      {shopifyStatus.label === "Expired" ? "Reconnect" : "Connect"}
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Instagram Connection Card */}
            <Card className={`relative overflow-hidden transition-all duration-300 ${isInstagramConnected ? 'border-[#935eb2]/30 shadow-lg shadow-[#935eb2]/5' : ''}`}>
              <div className={`absolute top-0 left-0 right-0 h-1 ${isInstagramConnected ? 'bg-gradient-to-r from-[#935eb2] to-[#5729a3]' : 'bg-muted'}`} />
              <CardContent className="pt-7 pb-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <img src={instagramIcon} alt="Instagram" className="h-12 w-auto" />
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="text-base font-semibold">Instagram</p>
                        <div className={`h-2 w-2 rounded-full ${isInstagramConnected ? 'bg-green-500 animate-pulse' : 'bg-muted-foreground'}`} />
                      </div>
                      <p className="text-sm text-muted-foreground mt-0.5">
                        {settings?.instagramUsername ? `@${settings.instagramUsername}` : "No account connected"}
                      </p>
                    </div>
                  </div>
                  {!isInstagramConnected && (
                    <Button 
                      size="sm" 
                      onClick={() => setLocation("/settings")}
                      data-testid="button-connect-instagram-status"
                      className="bg-[#5729a3] text-white"
                    >
                      Connect
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Performance */}
        <div>
          <h2 className="text-lg font-semibold mb-4">Performance</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card className="relative overflow-hidden bg-gradient-to-br from-[#5729a3]/5 to-[#935eb2]/5 border-[#5729a3]/20">
              <CardContent className="pt-6 pb-6">
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <p className="text-sm font-medium text-muted-foreground mb-2">Total Audience Reach</p>
                    <p className="text-3xl font-bold text-[#5729a3]" data-testid="text-total-reach">
                      {totalAudienceReach.toLocaleString()}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">followers reached</p>
                  </div>
                  <div className="p-4 rounded-full bg-[#5729a3]/10">
                    <Users className="w-8 h-8 text-[#5729a3]" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="relative overflow-hidden bg-gradient-to-br from-[#935eb2]/5 to-[#5729a3]/5 border-[#935eb2]/20">
              <CardContent className="pt-6 pb-6">
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <p className="text-sm font-medium text-muted-foreground mb-2">Total Verifications</p>
                    <p className="text-3xl font-bold text-[#935eb2]" data-testid="text-total-posts">
                      {totalPosts}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">posts verified</p>
                  </div>
                  <div className="p-4 rounded-full bg-[#935eb2]/10">
                    <TrendingUp className="w-8 h-8 text-[#935eb2]" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Recent Activity */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">Recent Activity</h2>
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => setLocation("/performance")}
              data-testid="button-view-performance"
            >
              View All
            </Button>
          </div>
          <Card>
            <CardContent className="p-0">
              {recentActivity.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16">
                  <div className="p-4 rounded-full bg-muted/50 mb-4">
                    <AlertCircle className="w-8 h-8 text-muted-foreground" />
                  </div>
                  <p className="text-base font-medium text-foreground mb-2">No activity yet</p>
                  <p className="text-sm text-muted-foreground">
                    Verification requests will appear here
                  </p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent border-b-2">
                      <TableHead className="font-semibold">Email</TableHead>
                      <TableHead className="font-semibold">Instagram</TableHead>
                      <TableHead className="font-semibold">Followers</TableHead>
                      <TableHead className="font-semibold">Status</TableHead>
                      <TableHead className="text-right font-semibold">Time</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {recentActivity.map((verification) => (
                      <TableRow 
                        key={verification.id} 
                        data-testid={`row-verification-${verification.id}`}
                        className="hover:bg-muted/30 transition-colors duration-150"
                      >
                        <TableCell className="font-medium" data-testid={`text-email-${verification.id}`}>
                          {verification.shopperEmail}
                        </TableCell>
                        <TableCell data-testid={`text-handle-${verification.id}`}>
                          <span className="text-[#5729a3] font-medium">@{verification.instagramHandle}</span>
                        </TableCell>
                        <TableCell data-testid={`text-followers-${verification.id}`}>
                          <span className="font-semibold">{verification.followerCount.toLocaleString()}</span>
                        </TableCell>
                        <TableCell>
                          <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${
                            verification.status === "verified" 
                              ? "bg-green-100 text-green-700 border border-green-200" 
                              : verification.status === "story_detected"
                              ? "bg-blue-100 text-blue-700 border border-blue-200"
                              : verification.status === "pending"
                              ? "bg-yellow-100 text-yellow-700 border border-yellow-200"
                              : "bg-red-100 text-red-700 border border-red-200"
                          }`}>
                            {verification.status === "verified" ? "Verified" 
                              : verification.status === "story_detected" ? "Story Detected"
                              : verification.status === "pending" ? "Awaiting Story" 
                              : "Failed"}
                          </span>
                        </TableCell>
                        <TableCell className="text-right text-sm text-muted-foreground" data-testid={`text-time-${verification.id}`}>
                          {formatDistanceToNow(new Date(getVerificationDate(verification)), { addSuffix: true })}
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
