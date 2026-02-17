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
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-white/50" />
      </div>
    );
  }

  const isInstagramConnected = !!profile?.instagramHandle;

  return (
    <div className="min-h-screen safe-top">
      <header className="px-6 pt-8 pb-6">
        <h1 className="text-2xl font-semibold text-white">Profile</h1>
      </header>

      <main className="px-6 pb-8 space-y-6">
        <div className="p-5 rounded-2xl bg-white/10 backdrop-blur-sm border border-white/10 cursor-pointer hover-elevate" data-testid="card-manage-account">
          <div className="flex items-center gap-4">
            <Avatar className="w-14 h-14 border-0">
              {profile?.instagramProfilePicture ? (
                <AvatarImage 
                  src="/api/customer/instagram-avatar"
                  alt={profile.instagramHandle || profile.email}
                />
              ) : null}
              <AvatarFallback className="bg-white/15 text-white text-xl font-semibold">
                {profile?.email?.[0]?.toUpperCase() || "?"}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-white truncate" data-testid="text-email">
                {profile?.name || profile?.email || "Guest"}
              </p>
              <p className="text-sm text-white/50 mt-0.5">Manage account</p>
            </div>
            <ChevronRight className="w-5 h-5 text-white/30 flex-shrink-0" />
          </div>
        </div>

        {!isInstagramConnected && (
          <div 
            className="p-5 rounded-2xl bg-white/10 backdrop-blur-sm border border-white/10 cursor-pointer hover-elevate"
            onClick={handleConnectInstagram}
            data-testid="card-connect-instagram"
          >
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-400 to-pink-400 flex items-center justify-center">
                <Instagram className="w-6 h-6 text-white" />
              </div>
              <div className="flex-1">
                <p className="font-medium text-white">Connect Instagram</p>
                <p className="text-sm text-white/50">
                  Link your Instagram to unlock discounts
                </p>
              </div>
              <Plus className="w-5 h-5 text-white/40" />
            </div>
          </div>
        )}

        <div className="rounded-2xl bg-white/10 backdrop-blur-sm border border-white/10 overflow-hidden">
          <div className="divide-y divide-white/10">
            <div className="flex items-center justify-between p-4">
              <div className="flex items-center gap-3">
                <Bell className="w-5 h-5 text-white/50" />
                <span className="font-medium text-white">Push notifications</span>
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
                  <Instagram className="w-5 h-5 text-white/50" />
                  <span className="font-medium text-white">Disconnect Instagram</span>
                </div>
                <ChevronRight className="w-5 h-5 text-white/30" />
              </button>
            )}

            <button
              onClick={handleLogout}
              className="w-full flex items-center justify-between p-4 hover-elevate"
              data-testid="button-logout"
            >
              <div className="flex items-center gap-3">
                <LogOut className="w-5 h-5 text-white/50" />
                <span className="font-medium text-white">Sign out</span>
              </div>
              <ChevronRight className="w-5 h-5 text-white/30" />
            </button>

            <button
              className="w-full flex items-center justify-between p-4 hover-elevate"
              data-testid="button-delete-account"
            >
              <div className="flex items-center gap-3">
                <Trash2 className="w-5 h-5 text-red-400" />
                <span className="font-medium text-red-400">Delete account</span>
              </div>
              <ChevronRight className="w-5 h-5 text-white/30" />
            </button>
          </div>
        </div>

        <div className="text-center pt-4">
          <img 
            src={spiralLogoUrl} 
            alt="Spiral" 
            className="h-6 mx-auto opacity-30 mb-2 brightness-0 invert"
          />
          <p className="text-xs text-white/30">Version 1.0.0</p>
        </div>
      </main>
    </div>
  );
}
