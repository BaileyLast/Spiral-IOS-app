import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useLocation, Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Instagram, Shield, CheckCircle, Loader2, Users, ArrowRight, LogOut, AlertCircle } from "lucide-react";
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
  const [username, setUsername] = useState("");

  const { data: profile, isLoading } = useQuery<CustomerProfile>({
    queryKey: ["/api/customer/me"],
  });

  const connectMutation = useMutation({
    mutationFn: async (instagramUsername: string) => {
      const response = await apiRequest("POST", "/api/customer/connect-instagram", {
        username: instagramUsername,
      });
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/customer/me"] });
      queryClient.invalidateQueries({ queryKey: ["/api/customer/stats"] });
      if (data.followerCount) {
        toast({
          title: "Instagram connected",
          description: `@${data.username} with ${formatFollowerCount(data.followerCount)} followers`,
        });
      } else {
        toast({
          title: "Username saved",
          description: data.message || "Your Instagram username has been saved",
        });
      }
    },
    onError: (error: any) => {
      const errorData = error?.message ? JSON.parse(error.message) : {};
      if (errorData.error === "not_found" || errorData.error === "personal_account") {
        toast({
          title: "Couldn't verify account",
          description: errorData.message || "Please check your username and try again",
          variant: "destructive",
        });
      } else {
        toast({
          title: "Connection failed",
          description: "Please check your username and try again",
          variant: "destructive",
        });
      }
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

  const handleConnect = (e: React.FormEvent) => {
    e.preventDefault();
    if (username.trim()) {
      connectMutation.mutate(username.trim());
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
            Enter your Instagram username to unlock discounts based on your follower count
          </p>

          <form onSubmit={handleConnect} className="space-y-4 mb-6">
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground">@</span>
              <Input
                type="text"
                placeholder="yourusername"
                value={username}
                onChange={(e) => setUsername(e.target.value.replace(/^@/, ""))}
                className="h-14 pl-9 text-base rounded-xl"
                disabled={connectMutation.isPending}
                data-testid="input-instagram-username"
              />
            </div>
            <Button 
              type="submit"
              className="w-full h-14 text-base font-medium rounded-xl"
              disabled={!username.trim() || connectMutation.isPending}
              data-testid="button-connect-instagram"
            >
              {connectMutation.isPending ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <>
                  <Instagram className="w-5 h-5 mr-2" />
                  Connect Instagram
                </>
              )}
            </Button>
          </form>

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
                <p className="text-sm font-medium text-foreground">Creator account required</p>
                <p className="text-sm text-muted-foreground mt-1">Your Instagram must be set to Creator or Business (not Personal)</p>
              </div>
            </div>
          </div>
          
          <p className="text-muted-foreground text-sm">
            <Link href="/instagram-help" className="text-primary hover:underline" data-testid="link-creator-help">
              How to switch to a Creator account
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
