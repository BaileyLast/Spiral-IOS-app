import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { 
  Instagram, 
  Bell, 
  LogOut, 
  ChevronRight, 
  Shield, 
  Gift,
  Trash2,
  Users,
  CheckCircle,
  Plus,
  Loader2
} from "lucide-react";
import spiralLogoUrl from "@assets/Spiral logo (2)_1763051288266.png";

interface CustomerProfile {
  id: string;
  email: string;
  name?: string;
  emailVerified: boolean;
  instagramHandle?: string;
  instagramUserId?: string;
  instagramProfilePicture?: string;
  instagramAccountType?: string;
  followerCount?: number;
}

function formatFollowerCount(count: number | null | undefined): string {
  if (count === null || count === undefined) return "";
  if (count >= 1000000) {
    return (count / 1000000).toFixed(1).replace(/\.0$/, "") + "M";
  }
  if (count >= 1000) {
    return (count / 1000).toFixed(1).replace(/\.0$/, "") + "K";
  }
  return count.toString();
}

export default function Profile() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const { data: profile, isLoading: profileLoading } = useQuery<CustomerProfile>({
    queryKey: ["/api/customer/me"],
  });

  const { data: stats } = useQuery<{ totalSaved: number; ordersCompleted: number }>({
    queryKey: ["/api/customer/stats"],
  });

  const logoutMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/customer/logout");
    },
    onSuccess: () => {
      localStorage.removeItem("spiral_customer");
      queryClient.clear();
      setLocation("/");
    },
  });

  const disconnectMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/customer/disconnect-instagram");
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Instagram disconnected",
        description: "Your Instagram account has been unlinked",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/customer/me"] });
      queryClient.invalidateQueries({ queryKey: ["/api/customer/stats"] });
    },
    onError: () => {
      toast({
        title: "Failed to disconnect",
        description: "Please try again",
        variant: "destructive",
      });
    },
  });

  const handleLogout = () => {
    logoutMutation.mutate();
  };

  const handleConnectInstagram = () => {
    setLocation("/connect-instagram");
  };

  if (profileLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  const isInstagramConnected = !!profile?.instagramHandle;

  return (
    <div className="min-h-screen bg-background safe-top">
      <header className="relative overflow-hidden px-6 pt-8 pb-6">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-primary/5 to-transparent" />
        <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-bl from-primary/20 to-transparent rounded-full blur-2xl -translate-y-1/2 translate-x-1/2" />
        <div className="relative">
          <h1 className="text-2xl font-semibold text-foreground">Profile</h1>
        </div>
      </header>

      <main className="px-6 pb-8 space-y-6">
        <Card className="p-5 rounded-2xl">
          <div className="flex items-center gap-4">
            <Avatar className="w-14 h-14">
              {profile?.instagramProfilePicture ? (
                <AvatarImage 
                  src={profile.instagramProfilePicture} 
                  alt={profile.instagramHandle || profile.email}
                />
              ) : null}
              <AvatarFallback className="bg-primary text-primary-foreground text-xl font-semibold">
                {profile?.email?.[0]?.toUpperCase() || "?"}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-foreground truncate" data-testid="text-email">
                {profile?.name || profile?.email || "Guest"}
              </p>
              <p className="text-sm text-muted-foreground truncate">
                {profile?.email}
              </p>
            </div>
          </div>
        </Card>

        {isInstagramConnected ? (
          <Card className="p-5 rounded-2xl">
            <div className="flex items-center gap-4">
              <Avatar className="w-12 h-12 border-2 border-primary/20">
                <AvatarImage 
                  src="/api/customer/instagram-avatar"
                  alt={profile.instagramHandle}
                />
                <AvatarFallback className="bg-gradient-to-br from-purple-500 to-pink-500 text-white">
                  <Instagram className="w-5 h-5" />
                </AvatarFallback>
              </Avatar>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-foreground" data-testid="text-instagram-handle">
                    @{profile.instagramHandle}
                  </span>
                  <CheckCircle className="w-4 h-4 text-green-600" />
                </div>
                <div className="flex items-center gap-3 text-sm text-muted-foreground mt-0.5">
                  {profile.followerCount && (
                    <div className="flex items-center gap-1">
                      <Users className="w-3.5 h-3.5" />
                      <span data-testid="text-follower-count">
                        {formatFollowerCount(profile.followerCount)} followers
                      </span>
                    </div>
                  )}
                  {profile.instagramAccountType && (
                    <span className="capitalize text-xs">
                      {profile.instagramAccountType.toLowerCase()}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </Card>
        ) : (
          <Card 
            className="p-5 rounded-2xl hover-elevate cursor-pointer"
            onClick={handleConnectInstagram}
            data-testid="card-connect-instagram"
          >
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
                <Instagram className="w-6 h-6 text-white" />
              </div>
              <div className="flex-1">
                <p className="font-medium text-foreground">Connect Instagram</p>
                <p className="text-sm text-muted-foreground">
                  Link your Instagram to unlock discounts
                </p>
              </div>
              <Plus className="w-5 h-5 text-muted-foreground" />
            </div>
          </Card>
        )}

        <div className="grid grid-cols-2 gap-4">
          <Card className="p-4 rounded-2xl text-center relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-transparent" />
            <div className="relative">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-primary/70 flex items-center justify-center mx-auto mb-2 shadow-md shadow-primary/20">
                <Gift className="w-5 h-5 text-primary-foreground" />
              </div>
              <p className="text-xl font-semibold text-foreground" data-testid="text-total-saved">
                ${stats?.totalSaved?.toFixed(2) || "0.00"}
              </p>
              <p className="text-xs text-muted-foreground">Total saved</p>
            </div>
          </Card>
          <Card className="p-4 rounded-2xl text-center relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-transparent" />
            <div className="relative">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-primary/70 flex items-center justify-center mx-auto mb-2 shadow-md shadow-primary/20">
                <Shield className="w-5 h-5 text-primary-foreground" />
              </div>
              <p className="text-xl font-semibold text-foreground" data-testid="text-orders-verified">
                {stats?.ordersCompleted || 0}
              </p>
              <p className="text-xs text-muted-foreground">Verified orders</p>
            </div>
          </Card>
        </div>

        <Card className="rounded-2xl overflow-hidden">
          <div className="divide-y divide-border">
            <div className="flex items-center justify-between p-4">
              <div className="flex items-center gap-3">
                <Bell className="w-5 h-5 text-muted-foreground" />
                <span className="font-medium text-foreground">Push notifications</span>
              </div>
              <Switch defaultChecked data-testid="switch-notifications" />
            </div>

            {isInstagramConnected && (
              <button
                onClick={() => disconnectMutation.mutate()}
                disabled={disconnectMutation.isPending}
                className="w-full flex items-center justify-between p-4 hover-elevate"
                data-testid="button-disconnect-instagram"
              >
                <div className="flex items-center gap-3">
                  <Instagram className="w-5 h-5 text-muted-foreground" />
                  <span className="font-medium text-foreground">Disconnect Instagram</span>
                </div>
                <ChevronRight className="w-5 h-5 text-muted-foreground" />
              </button>
            )}

            <button
              onClick={handleLogout}
              className="w-full flex items-center justify-between p-4 hover-elevate"
              data-testid="button-logout"
            >
              <div className="flex items-center gap-3">
                <LogOut className="w-5 h-5 text-muted-foreground" />
                <span className="font-medium text-foreground">Sign out</span>
              </div>
              <ChevronRight className="w-5 h-5 text-muted-foreground" />
            </button>

            <button
              className="w-full flex items-center justify-between p-4 hover-elevate"
              data-testid="button-delete-account"
            >
              <div className="flex items-center gap-3">
                <Trash2 className="w-5 h-5 text-destructive" />
                <span className="font-medium text-destructive">Delete account</span>
              </div>
              <ChevronRight className="w-5 h-5 text-muted-foreground" />
            </button>
          </div>
        </Card>

        <div className="text-center pt-4">
          <img 
            src={spiralLogoUrl} 
            alt="Spiral" 
            className="h-6 mx-auto opacity-50 mb-2"
          />
          <p className="text-xs text-muted-foreground">Version 1.0.0</p>
        </div>
      </main>
    </div>
  );
}
