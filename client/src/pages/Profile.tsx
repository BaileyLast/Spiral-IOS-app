import { useState } from "react";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation, Link } from "wouter";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import {
  LogOut,
  ChevronRight,
  Trash2,
  Loader2,
  UserCog,
  Shield,
  HelpCircle,
  Instagram,
  ShoppingBag,
} from "lucide-react";

import { formatCurrency } from "@/lib/countries";

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
  country?: string | null;
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
  const [deleteOpen, setDeleteOpen] = useState(false);
  const { data: profile, isLoading: profileLoading } = useQuery<CustomerProfile>({
    queryKey: ["/api/customer/me"],
  });

  const { data: stats } = useQuery<{ totalSaved: number; ordersCompleted: number }>({
    queryKey: ["/api/customer/stats"],
  });

  const logoutMutation = useMutation({
    mutationFn: async () => {
      try {
        await apiRequest("POST", "/api/customer/push-token", { token: null });
      } catch (err) {
        console.warn("[push-token] clear on logout failed", err);
      }
      await apiRequest("POST", "/api/customer/logout");
    },
    onSuccess: () => {
      localStorage.removeItem("spiral_customer");
      queryClient.clear();
      setLocation("/");
    },
  });

  const deleteAccountMutation = useMutation({
    mutationFn: async () => {
      try {
        await apiRequest("POST", "/api/customer/push-token", { token: null });
      } catch (err) {
        console.warn("[push-token] clear on delete failed", err);
      }
      await apiRequest("DELETE", "/api/customer/me");
    },
    onSuccess: () => {
      localStorage.removeItem("spiral_customer");
      queryClient.clear();
      setDeleteOpen(false);
      toast({ title: "Account deleted", description: "Your Spiral account has been permanently removed." });
      setLocation("/");
    },
    onError: () => {
      toast({
        title: "Couldn't delete account",
        description: "Something went wrong. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleLogout = () => {
    logoutMutation.mutate();
  };

  if (profileLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-warm">
        <Loader2 className="w-8 h-8 animate-spin text-[#4ECCA3]" />
      </div>
    );
  }

  const displayName =
    [profile?.firstName, profile?.lastName].filter(Boolean).join(" ") ||
    profile?.email ||
    "Guest";
  const isInstagramConnected = !!profile?.instagramHandle;
  const totalSaved = stats?.totalSaved ?? 0;
  const ordersCompleted = stats?.ordersCompleted ?? 0;

  return (
    <div className="min-h-screen bg-warm safe-top pb-12">
      <header className="px-6 pt-10 pb-6">
        <h1
          className="text-3xl font-black tracking-tight text-gray-900 mb-2"
          data-testid="text-page-title"
        >
          Profile
        </h1>
      </header>

      <main className="px-6 space-y-6">
        {/* Profile header card */}
        <div className="creator-card p-6 flex flex-col items-center text-center" data-testid="card-profile-header">
          <Avatar className="w-20 h-20 border-4 border-white shadow-md">
            {profile?.instagramProfilePicture ? (
              <AvatarImage
                src="/api/customer/instagram-avatar"
                alt={profile.instagramHandle || profile.email}
              />
            ) : null}
            <AvatarFallback className="bg-[#E6F8F0] text-[#1A996E] text-2xl font-black">
              {displayName?.[0]?.toUpperCase() || "?"}
            </AvatarFallback>
          </Avatar>
          <h2 className="text-2xl font-black text-gray-900 mt-4" data-testid="text-display-name">
            {displayName}
          </h2>
          {profile?.email && (
            <p className="text-sm font-medium text-gray-500 mt-1" data-testid="text-email">
              {profile.email}
            </p>
          )}
        </div>

        {/* Stats card */}
        <div className="creator-card p-5 !bg-gray-900 text-white" data-testid="card-stats">
          <h3 className="font-black text-lg mb-4">Your savings</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-3xl font-black text-[#A8F0D1]" data-testid="text-total-saved">
                {formatCurrency(Number(totalSaved), profile?.country)}
              </p>
              <p className="text-xs text-gray-400 font-bold uppercase tracking-wider mt-1">
                Total saved
              </p>
            </div>
            <div>
              <p className="text-3xl font-black text-[#A8F0D1]" data-testid="text-orders-completed">
                {ordersCompleted}
              </p>
              <p className="text-xs text-gray-400 font-bold uppercase tracking-wider mt-1">
                Orders
              </p>
            </div>
          </div>
        </div>

        {/* Instagram connection */}
        {isInstagramConnected ? (
          <div className="creator-card p-5 bg-[#E6F8F0]" data-testid="card-instagram-connected">
            <div className="flex items-center gap-4">
              <Avatar className="w-14 h-14 border-2 border-white shadow-sm">
                {profile?.instagramProfilePicture ? (
                  <AvatarImage
                    src="/api/customer/instagram-avatar"
                    alt={profile.instagramHandle || "Instagram"}
                  />
                ) : null}
                <AvatarFallback className="bg-[#4ECCA3] text-white">
                  <Instagram className="w-6 h-6" />
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <p className="font-black text-[#0E5C42] truncate" data-testid="text-instagram-handle">
                  @{profile?.instagramHandle}
                </p>
                {profile?.followerCount != null && (
                  <p className="text-sm font-bold text-[#1A996E] mt-0.5">
                    {formatFollowerCount(profile.followerCount)} followers
                  </p>
                )}
              </div>
              <div className="w-10 h-10 rounded-full bg-white shadow-sm flex items-center justify-center">
                <Instagram className="w-5 h-5 text-[#1A996E]" />
              </div>
            </div>
          </div>
        ) : (
          <div
            className="creator-card story-bg-gradient p-6 text-white text-center relative overflow-hidden"
            data-testid="card-connect-instagram-hero"
          >
            <div className="relative z-10 flex flex-col items-center">
              <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center text-[#4ECCA3] shadow-lg mb-4">
                <Instagram className="w-8 h-8" />
              </div>
              <h3 className="text-2xl font-black mb-2 leading-tight">
                Connect Instagram
              </h3>
              <p className="text-[#E6F8F0] font-medium text-sm mb-6 max-w-[260px]">
                Link your account to unlock bigger discounts at your favourite stores.
              </p>
              <button
                onClick={() => setLocation("/home")}
                className="tactile-btn bg-white text-[#4ECCA3] w-full py-4 text-lg shadow-[0_4px_12px_rgba(0,0,0,0.1),inset_0_-4px_0_rgba(240,240,240,1)]"
                data-testid="button-connect-instagram"
              >
                Connect Instagram
              </button>
            </div>
          </div>
        )}

        {/* Settings list */}
        <div className="creator-card p-2" data-testid="card-settings">
          <button
            onClick={() => setLocation("/manage-account")}
            className="w-full flex items-center gap-4 p-4 rounded-2xl hover-elevate text-left"
            data-testid="button-manage-account"
          >
            <div className="w-10 h-10 rounded-2xl bg-[#E6F8F0] flex items-center justify-center flex-shrink-0">
              <UserCog className="w-5 h-5 text-[#1A996E]" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-gray-900">Manage account</p>
              <p className="text-xs text-gray-500 font-medium">Email, name, address</p>
            </div>
            <ChevronRight className="w-5 h-5 text-gray-300 flex-shrink-0" />
          </button>

          <Link href="/privacy">
            <button
              className="w-full flex items-center gap-4 p-4 rounded-2xl hover-elevate text-left"
              data-testid="button-privacy"
            >
              <div className="w-10 h-10 rounded-2xl bg-[#E6F8F0] flex items-center justify-center flex-shrink-0">
                <Shield className="w-5 h-5 text-[#1A996E]" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-gray-900">Privacy</p>
                <p className="text-xs text-gray-500 font-medium">How we handle your data</p>
              </div>
              <ChevronRight className="w-5 h-5 text-gray-300 flex-shrink-0" />
            </button>
          </Link>

          <Link href="/instagram-help">
            <button
              className="w-full flex items-center gap-4 p-4 rounded-2xl hover-elevate text-left"
              data-testid="button-help"
            >
              <div className="w-10 h-10 rounded-2xl bg-[#E6F8F0] flex items-center justify-center flex-shrink-0">
                <HelpCircle className="w-5 h-5 text-[#1A996E]" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-gray-900">Help</p>
                <p className="text-xs text-gray-500 font-medium">Instagram &amp; Stories</p>
              </div>
              <ChevronRight className="w-5 h-5 text-gray-300 flex-shrink-0" />
            </button>
          </Link>

          <button
            onClick={handleLogout}
            disabled={logoutMutation.isPending}
            className="w-full flex items-center gap-4 p-4 rounded-2xl hover-elevate text-left"
            data-testid="button-logout"
          >
            <div className="w-10 h-10 rounded-2xl bg-gray-100 flex items-center justify-center flex-shrink-0">
              {logoutMutation.isPending ? (
                <Loader2 className="w-5 h-5 animate-spin text-gray-500" />
              ) : (
                <LogOut className="w-5 h-5 text-gray-500" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-gray-900">Sign out</p>
            </div>
            <ChevronRight className="w-5 h-5 text-gray-300 flex-shrink-0" />
          </button>

          <button
            onClick={() => setDeleteOpen(true)}
            className="w-full flex items-center gap-4 p-4 rounded-2xl hover-elevate text-left"
            data-testid="button-delete-account"
          >
            <div className="w-10 h-10 rounded-2xl bg-red-50 flex items-center justify-center flex-shrink-0">
              <Trash2 className="w-5 h-5 text-red-500" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-red-600">Delete account</p>
              <p className="text-xs text-red-400 font-medium">Permanently remove your data</p>
            </div>
            <ChevronRight className="w-5 h-5 text-red-200 flex-shrink-0" />
          </button>

          <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
            <AlertDialogContent data-testid="dialog-delete-account">
              <AlertDialogHeader>
                <AlertDialogTitle>Delete your Spiral account?</AlertDialogTitle>
                <AlertDialogDescription>
                  This permanently removes your profile, Instagram link, and verification codes.
                  Your past order history will be anonymized but kept for the brands you bought from.
                  This can't be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel
                  disabled={deleteAccountMutation.isPending}
                  data-testid="button-cancel-delete-account"
                >
                  Cancel
                </AlertDialogCancel>
                <AlertDialogAction
                  onClick={(e) => {
                    e.preventDefault();
                    deleteAccountMutation.mutate();
                  }}
                  disabled={deleteAccountMutation.isPending}
                  className="bg-red-500 text-white hover:bg-red-600"
                  data-testid="button-confirm-delete-account"
                >
                  {deleteAccountMutation.isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Deleting...
                    </>
                  ) : (
                    "Delete account"
                  )}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>

        <div className="text-center pt-2">
          <p className="text-xs text-gray-300 font-bold uppercase tracking-widest">
            Spiral · v1.0.0
          </p>
        </div>
      </main>
    </div>
  );
}
