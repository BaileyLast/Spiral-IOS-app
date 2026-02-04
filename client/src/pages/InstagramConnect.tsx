import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Instagram, CheckCircle, Loader2, Users, ArrowRight, LogOut, Copy, ExternalLink, RefreshCw } from "lucide-react";
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

interface SpiralCodeResponse {
  code: string;
  expiresAt: string;
  status: string;
}

interface VerificationStatus {
  status: string;
  instagramHandle?: string;
  instagramUserId?: string;
  followerCount?: number;
}

export default function InstagramConnect() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [copied, setCopied] = useState(false);

  const { data: profile, isLoading } = useQuery<CustomerProfile>({
    queryKey: ["/api/customer/me"],
  });

  const { data: spiralCode, refetch: refetchCode } = useQuery<SpiralCodeResponse>({
    queryKey: ["/api/customer/spiral-code"],
    queryFn: async () => {
      const response = await apiRequest("POST", "/api/customer/spiral-code");
      return response.json();
    },
    enabled: !!profile && !profile.instagramHandle,
  });

  const { data: verificationStatus } = useQuery<VerificationStatus>({
    queryKey: ["/api/customer/spiral-code/status"],
    refetchInterval: 3000,
    enabled: !!spiralCode && spiralCode.status === "pending",
  });

  useEffect(() => {
    if (verificationStatus?.status === "verified") {
      queryClient.invalidateQueries({ queryKey: ["/api/customer/me"] });
      queryClient.invalidateQueries({ queryKey: ["/api/customer/stats"] });
      toast({
        title: "Instagram connected!",
        description: `Verified as @${verificationStatus.instagramHandle}`,
      });
    }
  }, [verificationStatus?.status, verificationStatus?.instagramHandle, queryClient, toast]);

  const regenerateCodeMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/customer/spiral-code/regenerate");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/customer/spiral-code"] });
      toast({
        title: "New code generated",
        description: "Your Spiral code has been refreshed",
      });
    },
    onError: () => {
      toast({
        title: "Failed to regenerate",
        description: "Please try again",
        variant: "destructive",
      });
    },
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

  const handleCopyAndMessage = async () => {
    if (!spiralCode?.code) return;

    try {
      await navigator.clipboard.writeText(spiralCode.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      
      window.open("https://ig.me/m/joinspiral", "_blank");
    } catch (error) {
      toast({
        title: "Copy failed",
        description: "Please copy the code manually",
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
            Verify your Instagram to unlock discounts based on your follower count
          </p>

          {spiralCode?.status === "pending" && (
            <div className="bg-card rounded-2xl border border-border p-6 mb-6">
              <p className="text-sm text-muted-foreground mb-3">
                Send this code to @joinspiral on Instagram:
              </p>
              
              <div className="bg-gradient-to-br from-primary/10 to-primary/5 rounded-xl p-4 mb-4">
                <span className="text-3xl font-bold tracking-[0.3em] text-primary font-mono">
                  {spiralCode.code}
                </span>
              </div>

              <Button 
                onClick={handleCopyAndMessage}
                className="w-full h-14 text-base font-medium rounded-xl bg-gradient-to-r from-purple-600 to-pink-500 hover:from-purple-700 hover:to-pink-600 text-white mb-3"
                data-testid="button-copy-message"
              >
                {copied ? (
                  <>
                    <CheckCircle className="w-5 h-5 mr-2" />
                    Copied! Opening Instagram...
                  </>
                ) : (
                  <>
                    <Copy className="w-5 h-5 mr-2" />
                    Copy & Message @joinspiral
                    <ExternalLink className="w-4 h-4 ml-2" />
                  </>
                )}
              </Button>

              <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Waiting for your message...</span>
              </div>
            </div>
          )}

          {verificationStatus?.status === "verified" && (
            <div className="bg-green-50 dark:bg-green-950/30 rounded-2xl border border-green-200 dark:border-green-900 p-6 mb-6">
              <CheckCircle className="w-12 h-12 text-green-600 mx-auto mb-3" />
              <p className="text-lg font-semibold text-green-800 dark:text-green-200 mb-1">
                Verified!
              </p>
              <p className="text-sm text-green-700 dark:text-green-300">
                Connected as @{verificationStatus.instagramHandle}
              </p>
              {verificationStatus.followerCount ? (
                <p className="text-sm text-green-600 dark:text-green-400 mt-1">
                  {formatFollowerCount(verificationStatus.followerCount)} followers
                </p>
              ) : null}
            </div>
          )}

          {spiralCode?.status === "pending" && (
            <button
              onClick={() => regenerateCodeMutation.mutate()}
              disabled={regenerateCodeMutation.isPending}
              className="flex items-center justify-center gap-2 text-muted-foreground hover:text-foreground transition-colors mx-auto text-sm"
              data-testid="button-regenerate"
            >
              <RefreshCw className={`w-4 h-4 ${regenerateCodeMutation.isPending ? 'animate-spin' : ''}`} />
              <span>Get new code</span>
            </button>
          )}
        </div>
      </div>

      <div className="px-6 pb-8 safe-bottom">
        {verificationStatus?.status === "verified" ? (
          <Button 
            className="w-full h-14 text-base font-medium rounded-xl"
            onClick={handleContinue}
            data-testid="button-continue"
          >
            Continue to Spiral
            <ArrowRight className="w-5 h-5 ml-2" />
          </Button>
        ) : (
          <Button 
            variant="ghost"
            className="w-full h-12 text-base text-muted-foreground"
            onClick={handleSkip}
            data-testid="button-skip"
          >
            Skip for now
          </Button>
        )}
      </div>
    </div>
  );
}
