import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
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
  Users
} from "lucide-react";
import spiralLogoUrl from "@assets/Spiral logo (2)_1763051288266.png";

function getFollowerBand(count: number | null | undefined): string {
  if (!count) return "Not connected";
  if (count < 1000) return "< 1K followers";
  if (count < 5000) return "1K - 5K followers";
  if (count < 10000) return "5K - 10K followers";
  if (count < 50000) return "10K - 50K followers";
  if (count < 100000) return "50K - 100K followers";
  return "100K+ followers";
}

export default function Profile() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const customer = JSON.parse(localStorage.getItem("spiral_customer") || "{}");

  const { data: stats } = useQuery<{ totalSaved: number; ordersCompleted: number }>({
    queryKey: ["/api/customer/stats"],
  });

  const logoutMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("/api/customer/logout", { method: "POST" });
    },
    onSuccess: () => {
      localStorage.removeItem("spiral_customer");
      queryClient.clear();
      setLocation("/");
    },
  });

  const disconnectMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("/api/customer/disconnect-instagram", { method: "POST" });
      return response;
    },
    onSuccess: () => {
      const updated = { ...customer, instagramHandle: null, followerCount: null };
      localStorage.setItem("spiral_customer", JSON.stringify(updated));
      toast({
        title: "Instagram disconnected",
        description: "Your account has been unlinked",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/customer/profile"] });
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

  return (
    <div className="min-h-screen bg-background safe-top">
      <header className="px-6 pt-6 pb-4">
        <h1 className="text-2xl font-semibold text-foreground">Profile</h1>
      </header>

      <main className="px-6 pb-8 space-y-6">
        <Card className="p-5 rounded-2xl">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-full bg-primary flex items-center justify-center">
              <span className="text-xl font-semibold text-primary-foreground">
                {customer.email?.[0]?.toUpperCase() || "?"}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-foreground truncate" data-testid="text-email">
                {customer.email || "Guest"}
              </p>
              {customer.instagramHandle && (
                <div className="flex items-center gap-1.5 text-sm text-muted-foreground mt-0.5">
                  <Instagram className="w-3.5 h-3.5" />
                  <span data-testid="text-instagram-handle">@{customer.instagramHandle}</span>
                </div>
              )}
            </div>
          </div>
        </Card>

        {customer.instagramHandle && (
          <Card className="p-5 rounded-2xl">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
                <Instagram className="w-6 h-6 text-white" />
              </div>
              <div className="flex-1">
                <p className="font-medium text-foreground">@{customer.instagramHandle}</p>
                <div className="flex items-center gap-1.5 text-sm text-muted-foreground mt-0.5">
                  <Users className="w-3.5 h-3.5" />
                  <span data-testid="text-follower-band">{getFollowerBand(customer.followerCount)}</span>
                </div>
              </div>
            </div>
          </Card>
        )}

        <div className="grid grid-cols-2 gap-4">
          <Card className="p-4 rounded-2xl text-center">
            <Gift className="w-6 h-6 text-primary mx-auto mb-2" />
            <p className="text-xl font-semibold text-foreground" data-testid="text-total-saved">
              ${stats?.totalSaved?.toFixed(2) || "0.00"}
            </p>
            <p className="text-xs text-muted-foreground">Total saved</p>
          </Card>
          <Card className="p-4 rounded-2xl text-center">
            <Shield className="w-6 h-6 text-primary mx-auto mb-2" />
            <p className="text-xl font-semibold text-foreground" data-testid="text-orders-verified">
              {stats?.ordersCompleted || 0}
            </p>
            <p className="text-xs text-muted-foreground">Verified orders</p>
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

            {customer.instagramHandle && (
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
