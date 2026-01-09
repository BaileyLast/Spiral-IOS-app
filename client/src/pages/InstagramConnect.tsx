import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { useLocation, Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Instagram, Shield, CheckCircle, Loader2, Users, ArrowRight, LogOut } from "lucide-react";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import spiralLogoUrl from "@assets/Spiral logo (2)_1763051288266.png";

interface CustomerProfile {
  id: string;
  email: string;
  emailVerified: boolean;
  instagramHandle?: string;
  instagramUserId?: string;
  instagramProfilePicture?: string;
  instagramAccountType?: string;
  followerCount?: number;
}

export default function InstagramConnect() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isConnecting, setIsConnecting] = useState(false);

  const params = new URLSearchParams(window.location.search);
  const success = params.get("success") === "true";
  const error = params.get("error");

  const { data: profile, isLoading } = useQuery<CustomerProfile>({
    queryKey: ["/api/customer/me"],
  });

  const disconnectMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/customer/disconnect-instagram");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/customer/me"] });
      queryClient.invalidateQueries({ queryKey: ["/api/customer/stats"] });
      toast({
        title: "Instagram disconnected",
        description: "Your account has been unlinked",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to disconnect",
        description: error.message || "Please try again",
        variant: "destructive",
      });
    },
  });

  useEffect(() => {
    if (success) {
      queryClient.invalidateQueries({ queryKey: ["/api/customer/me"] });
      toast({
        title: "Instagram connected",
        description: "Your account is now linked",
      });
      window.history.replaceState({}, "", "/connect-instagram");
    }
  }, [success, toast, queryClient]);

  useEffect(() => {
    if (error) {
      const errorMessages: Record<string, string> = {
        "access_denied": "You cancelled the Instagram connection",
        "config_error": "Configuration error. Please try again later.",
        "token_exchange_failed": "Failed to connect. Please try again.",
        "token_refresh_failed": "Failed to secure your connection. Please try again.",
        "callback_failed": "Something went wrong. Please try again.",
        "invalid_state": "Security check failed. Please try again.",
        "missing_code": "Authorization was incomplete. Please try again.",
        "oauth_start_failed": "Could not start Instagram connection. Please try again.",
      };
      toast({
        title: "Connection failed",
        description: errorMessages[error] || "Please try again",
        variant: "destructive",
      });
      window.history.replaceState({}, "", "/connect-instagram");
    }
  }, [error, toast]);

  const handleConnect = () => {
    // Check if we're in an iframe (Replit preview)
    const isInIframe = window.self !== window.top;
    
    if (isInIframe) {
      // Show a toast and open the app in a new tab for OAuth
      toast({
        title: "Opening in new tab",
        description: "Instagram requires you to connect from the full app. Please complete the connection in the new tab.",
      });
      // Open the full app in a new tab
      window.open(window.location.origin + "/connect-instagram", "_blank");
      return;
    }
    
    setIsConnecting(true);
    window.location.href = "/api/customer/instagram/auth";
  };

  const handleSkip = () => {
    setLocation("/home");
  };

  const handleContinue = () => {
    setLocation("/home");
  };

  const formatFollowerCount = (count: number) => {
    if (count >= 1000000) {
      return (count / 1000000).toFixed(1).replace(/\.0$/, "") + "M";
    }
    if (count >= 1000) {
      return (count / 1000).toFixed(1).replace(/\.0$/, "") + "K";
    }
    return count.toString();
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  const isConnected = profile?.instagramHandle;

  if (isConnected) {
    return (
      <div className="min-h-screen flex flex-col relative overflow-hidden">
        <div 
          className="absolute inset-0 z-0"
          style={{
            background: `
              linear-gradient(135deg, 
                hsl(280 70% 50%) 0%, 
                hsl(320 70% 45%) 50%,
                hsl(340 65% 40%) 100%)
            `,
          }}
        />
        
        <div className="relative z-10 flex-1 flex flex-col items-center justify-center px-6 py-12">
          <div className="w-full max-w-sm mx-auto text-center">
            <img 
              src={spiralLogoUrl} 
              alt="Spiral" 
              className="h-8 mx-auto mb-12 object-contain brightness-0 invert"
              data-testid="img-spiral-logo"
            />

            <div className="bg-white rounded-3xl p-6 shadow-xl mb-6">
              <div className="flex items-center gap-4 mb-4">
                <Avatar className="w-16 h-16 border-2 border-primary/20">
                  <AvatarImage 
                    src={profile.instagramProfilePicture} 
                    alt={profile.instagramHandle}
                  />
                  <AvatarFallback className="bg-gradient-to-br from-purple-500 to-pink-500 text-white text-xl">
                    {profile.instagramHandle?.charAt(0).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 text-left">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-foreground">
                      @{profile.instagramHandle}
                    </span>
                    <CheckCircle className="w-4 h-4 text-green-600" />
                  </div>
                  <div className="flex items-center gap-1 text-muted-foreground text-sm">
                    <Users className="w-3.5 h-3.5" />
                    <span>{formatFollowerCount(profile.followerCount || 0)} followers</span>
                  </div>
                  <span className="text-xs text-muted-foreground capitalize">
                    {profile.instagramAccountType?.toLowerCase()} account
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2 p-3 bg-green-50 dark:bg-green-950/30 rounded-xl">
                <CheckCircle className="w-5 h-5 text-green-600" />
                <span className="text-sm text-green-800 dark:text-green-200">
                  Instagram connected successfully
                </span>
              </div>
            </div>

            <button
              onClick={() => disconnectMutation.mutate()}
              disabled={disconnectMutation.isPending}
              className="flex items-center justify-center gap-2 text-white/70 hover:text-white transition-colors mx-auto text-sm"
              data-testid="button-disconnect"
            >
              <LogOut className="w-4 h-4" />
              <span>Disconnect account</span>
            </button>
          </div>
        </div>

        <div className="relative z-10 px-6 pb-8 safe-bottom">
          <Button 
            className="w-full h-14 text-base font-medium rounded-xl bg-white text-primary hover:bg-white/90"
            onClick={handleContinue}
            data-testid="button-continue"
          >
            Continue to Spiral
            <ArrowRight className="w-5 h-5 ml-2" />
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <div className="flex-1 flex flex-col items-center px-6 pt-12 pb-6">
        <div className="w-full max-w-sm mx-auto text-center">
          <img 
            src={spiralLogoUrl} 
            alt="Spiral" 
            className="h-8 mx-auto mb-10 object-contain"
            data-testid="img-spiral-logo"
          />

          <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center mx-auto mb-8">
            <Instagram className="w-10 h-10 text-white" />
          </div>

          <h1 className="text-2xl font-semibold text-foreground mb-3">
            Connect your Instagram account to get started
          </h1>
          <p className="text-muted-foreground mb-8">
            <Link href="/instagram-help" className="text-primary hover:underline" data-testid="link-creator-help">
              Not a Creator account? Here's how to switch
            </Link>
          </p>

          <div className="bg-card rounded-2xl border border-border p-5 mb-8 text-left">
            <div className="flex items-start gap-3">
              <Shield className="w-5 h-5 text-primary mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-sm font-medium text-foreground">Your privacy is protected</p>
                <p className="text-sm text-muted-foreground mt-1">We only access your follower count and verify story tags</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="px-6 pb-8 space-y-3 safe-bottom">
        <Button 
          className="w-full h-14 text-base font-medium rounded-xl"
          onClick={handleConnect}
          disabled={isConnecting}
          data-testid="button-connect-instagram"
        >
          {isConnecting ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : (
            <>
              <Instagram className="w-5 h-5 mr-2" />
              Connect Instagram
            </>
          )}
        </Button>
        <Button 
          variant="ghost"
          className="w-full h-12 text-base text-muted-foreground"
          onClick={handleSkip}
          data-testid="button-skip"
        >
          Skip for now
        </Button>
      </div>
    </div>
  );
}
