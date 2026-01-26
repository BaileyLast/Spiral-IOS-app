import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { useLocation, Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Instagram, Shield, CheckCircle, Loader2, Users, ArrowRight, LogOut, AlertCircle } from "lucide-react";
import { SiFacebook } from "react-icons/si";
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

  const { data: profile, isLoading } = useQuery<CustomerProfile>({
    queryKey: ["/api/customer/me"],
  });

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const success = urlParams.get("instagram_connected");
    const error = urlParams.get("instagram_error");
    
    if (success === "true") {
      queryClient.invalidateQueries({ queryKey: ["/api/customer/me"] });
      queryClient.invalidateQueries({ queryKey: ["/api/customer/stats"] });
      toast({
        title: "Instagram connected",
        description: "Your Instagram account has been linked successfully",
      });
      window.history.replaceState({}, "", "/connect-instagram");
    } else if (error) {
      let errorMessage = "Please try again";
      switch (error) {
        case "access_denied":
          errorMessage = "You declined the Instagram connection";
          break;
        case "no_instagram_account":
          errorMessage = "No Instagram account found linked to a Facebook Page. Please link your Instagram to a Facebook Page first.";
          break;
        case "no_facebook_pages":
          errorMessage = "No Facebook Pages found. Create a Facebook Page and link your Instagram to it.";
          break;
        case "personal_account":
          errorMessage = "Your Instagram must be a Creator or Business account, not Personal.";
          break;
        case "token_exchange_failed":
          errorMessage = "Failed to complete authentication. Please try again.";
          break;
        case "fetch_details_failed":
          errorMessage = "Could not retrieve your Instagram details. Please try again.";
          break;
        case "not_authenticated":
          errorMessage = "Your session expired. Please log in again.";
          setLocation("/login");
          break;
        case "invalid_state":
          errorMessage = "Security verification failed. Please try again.";
          break;
        case "configuration_error":
          errorMessage = "Instagram connection is not configured. Please contact support.";
          break;
        default:
          errorMessage = error.replace(/_/g, " ");
      }
      toast({
        title: "Connection failed",
        description: errorMessage,
        variant: "destructive",
      });
      window.history.replaceState({}, "", "/connect-instagram");
    }
  }, [queryClient, toast, setLocation]);

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
        description: "Your Instagram account has been unlinked",
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

  const handleConnectWithMeta = async () => {
    setIsConnecting(true);
    try {
      const response = await apiRequest("GET", "/api/customer/instagram/auth");
      const data = await response.json();
      
      if (data.requiresLogin || data.error === "Not authenticated") {
        setIsConnecting(false);
        toast({
          title: "Session expired",
          description: "Please log in again to connect Instagram",
          variant: "destructive",
        });
        setLocation("/login");
        return;
      }
      
      if (data.authUrl) {
        // Redirecting to Facebook - keep isConnecting true
        window.location.href = data.authUrl;
      } else {
        throw new Error("Failed to get auth URL");
      }
    } catch (error: any) {
      console.error("Failed to initiate Instagram auth:", error);
      setIsConnecting(false);
      
      // Handle 401 specifically
      if (error?.message?.includes("401") || error?.message?.includes("Not authenticated")) {
        toast({
          title: "Session expired",
          description: "Please log in again to connect Instagram",
          variant: "destructive",
        });
        setLocation("/login");
        return;
      }
      
      toast({
        title: "Connection failed",
        description: "Could not start Instagram connection. Please try again.",
        variant: "destructive",
      });
    }
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
                  {profile.followerCount ? (
                    <div className="flex items-center gap-1 text-muted-foreground text-sm">
                      <Users className="w-3.5 h-3.5" />
                      <span>{formatFollowerCount(profile.followerCount)} followers</span>
                    </div>
                  ) : null}
                  {profile.instagramAccountType && (
                    <span className="text-xs text-muted-foreground capitalize">
                      {profile.instagramAccountType.toLowerCase()} account
                    </span>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2 p-3 bg-green-50 dark:bg-green-950/30 rounded-xl">
                <CheckCircle className="w-5 h-5 text-green-600" />
                <span className="text-sm text-green-800 dark:text-green-200">
                  Instagram connected
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

          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center mx-auto mb-8">
            <Instagram className="w-8 h-8 text-white" />
          </div>

          <h1 className="text-2xl font-semibold text-foreground mb-3">
            Connect Instagram
          </h1>
          <p className="text-muted-foreground mb-8">
            Link your Instagram to unlock discounts based on your follower count
          </p>

          <Button 
            onClick={handleConnectWithMeta}
            disabled={isConnecting}
            className="w-full h-14 text-base font-medium rounded-xl bg-[#1877F2] hover:bg-[#166FE5] text-white mb-4"
            data-testid="button-connect-instagram"
          >
            {isConnecting ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <>
                <SiFacebook className="w-5 h-5 mr-2" />
                Continue with Facebook
              </>
            )}
          </Button>
          
          <p className="text-xs text-muted-foreground mb-6">
            Your Instagram must be linked to Facebook to connect
          </p>

          <div className="bg-card rounded-2xl border border-border p-5 mb-4 text-left space-y-4">
            <div className="flex items-start gap-3">
              <Shield className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-sm font-medium text-foreground">Your privacy is protected</p>
                <p className="text-sm text-muted-foreground mt-1">We only read your public follower count to calculate your discount</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-primary mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-sm font-medium text-foreground">Requirements</p>
                <p className="text-sm text-muted-foreground mt-1">Instagram must be Creator/Business account and linked to a Facebook Page</p>
              </div>
            </div>
          </div>
          
          <p className="text-muted-foreground text-sm">
            <Link href="/instagram-help" className="text-primary hover:underline" data-testid="link-creator-help">
              Need help setting up?
            </Link>
          </p>
        </div>
      </div>

      <div className="px-6 pb-8 safe-bottom">
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
