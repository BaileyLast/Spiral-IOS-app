import { Switch } from "@/components/ui/switch";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  Bell,
  LogOut,
  ChevronRight,
  Trash2,
  Loader2,
} from "lucide-react";
const spiralLogoUrl = "/spiral-gradient-logo.png";

interface CustomerProfile {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
  emailVerified: boolean;
  instagramHandle?: string;
  instagramUserId?: string;
  instagramProfilePicture?: string;
  instagramAccountType?: string;
  followerCount?: number;
}

export default function Profile() {
  const [, setLocation] = useLocation();
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

  const handleLogout = () => {
    logoutMutation.mutate();
  };

  if (profileLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <Loader2 className="w-8 h-8 animate-spin text-[#4ECCA3]" />
      </div>
    );
  }

  return (
    <div className="min-h-screen safe-top bg-white">
      <header className="px-6 pt-8 pb-6">
        <h1 className="text-2xl font-extrabold text-gray-900 tracking-tight">Profile</h1>
      </header>

      <main className="px-6 pb-8 space-y-6">
        <div
          className="p-5 rounded-2xl bg-gray-50 border border-gray-100 cursor-pointer hover-elevate"
          onClick={() => setLocation("/manage-account")}
          data-testid="card-manage-account"
        >
          <div className="flex items-center gap-4">
            <Avatar className="w-14 h-14 border-2 border-gray-100">
              {profile?.instagramProfilePicture ? (
                <AvatarImage 
                  src="/api/customer/instagram-avatar"
                  alt={profile.instagramHandle || profile.email}
                />
              ) : null}
              <AvatarFallback className="bg-gray-100 text-gray-600 text-xl font-bold">
                {profile?.email?.[0]?.toUpperCase() || "?"}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-gray-900 truncate" data-testid="text-email">
                {[profile?.firstName, profile?.lastName].filter(Boolean).join(" ") || profile?.email || "Guest"}
              </p>
              <p className="text-sm text-gray-400 mt-0.5">Manage account</p>
            </div>
            <ChevronRight className="w-5 h-5 text-gray-300 flex-shrink-0" />
          </div>
        </div>

        <div className="rounded-2xl bg-gray-50 border border-gray-100 overflow-hidden">
          <div className="divide-y divide-gray-100">
            <div className="flex items-center justify-between p-4">
              <div className="flex items-center gap-3">
                <Bell className="w-5 h-5 text-gray-400" />
                <span className="font-medium text-gray-900">Push notifications</span>
              </div>
              <Switch defaultChecked data-testid="switch-notifications" />
            </div>

            <button
              onClick={handleLogout}
              className="w-full flex items-center justify-between p-4 hover-elevate"
              data-testid="button-logout"
            >
              <div className="flex items-center gap-3">
                <LogOut className="w-5 h-5 text-gray-400" />
                <span className="font-medium text-gray-900">Sign out</span>
              </div>
              <ChevronRight className="w-5 h-5 text-gray-300" />
            </button>

            <button
              className="w-full flex items-center justify-between p-4 hover-elevate"
              data-testid="button-delete-account"
            >
              <div className="flex items-center gap-3">
                <Trash2 className="w-5 h-5 text-red-400" />
                <span className="font-medium text-red-500">Delete account</span>
              </div>
              <ChevronRight className="w-5 h-5 text-gray-300" />
            </button>
          </div>
        </div>

        <div className="text-center pt-4">
          <img 
            src={spiralLogoUrl} 
            alt="Spiral" 
            className="h-8 mx-auto opacity-40 mb-2"
          />
          <p className="text-xs text-gray-300">Version 1.0.0</p>
        </div>
      </main>
    </div>
  );
}
