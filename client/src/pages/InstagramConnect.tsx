import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowLeft,
  CheckCircle,
  Loader2,
  Users,
  ArrowRight,
  LogOut,
  Copy,
  ExternalLink,
  RefreshCw,
  Instagram,
} from "lucide-react";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";

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

  const { data: spiralCode } = useQuery<SpiralCodeResponse>({
    queryKey: ["/api/customer/spiral-code"],
    queryFn: async () => {
      const response = await apiRequest("POST", "/api/customer/spiral-code/regenerate");
      return response.json();
    },
    enabled: !!profile && !profile.instagramHandle,
    staleTime: Infinity,
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
      const timer = setTimeout(() => {
        setLocation("/home");
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [verificationStatus?.status, verificationStatus?.instagramHandle, queryClient, setLocation]);

  const regenerateCodeMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/customer/spiral-code/regenerate");
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.setQueryData(["/api/customer/spiral-code"], data);
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
      <div className="min-h-screen flex items-center justify-center bg-warm">
        <Loader2 className="w-8 h-8 animate-spin text-[#4ECCA3]" />
      </div>
    );
  }

  const isConnected = profile?.instagramHandle;

  // CONNECTED VIEW
  if (isConnected) {
    return (
      <div className="min-h-screen safe-top bg-warm pb-12">
        <header className="px-4 py-4 flex items-center justify-between sticky top-0 bg-[#FCFCFB]/80 backdrop-blur-md z-10">
          <button
            onClick={() => setLocation("/home")}
            className="w-10 h-10 rounded-full bg-white shadow-sm flex items-center justify-center hover-elevate"
            data-testid="button-back"
            aria-label="Back"
          >
            <ArrowLeft className="w-5 h-5 text-gray-900" />
          </button>
          <div className="w-10" />
        </header>

        <main className="px-6 mt-4 space-y-6">
          <div className="creator-card story-bg-gradient p-6 text-white text-center relative overflow-hidden">
            <div className="absolute top-0 right-0 p-4 opacity-20 transform translate-x-4 -translate-y-4 pointer-events-none">
              <Instagram className="w-32 h-32" />
            </div>
            <div className="relative z-10 flex flex-col items-center">
              <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center text-[#4ECCA3] shadow-lg mb-4">
                <CheckCircle className="w-8 h-8" />
              </div>
              <h1 className="text-2xl font-black mb-2 leading-tight">
                You're connected
              </h1>
              <p className="text-[#E6F8F0] font-medium text-sm max-w-[260px]">
                Your Instagram is linked. Discounts will scale with your follower count.
              </p>
            </div>
          </div>

          <div className="creator-card p-5">
            <div className="flex items-center gap-4">
              <Avatar className="w-16 h-16 border-2 border-[#E6F8F0]">
                <AvatarImage
                  src={profile.instagramProfilePicture}
                  alt={profile.instagramHandle}
                />
                <AvatarFallback className="text-white text-xl font-black story-bg-gradient">
                  {profile.instagramHandle?.charAt(0).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-black text-gray-900 text-base truncate">
                    @{profile.instagramHandle}
                  </span>
                  <CheckCircle className="w-4 h-4 text-[#1A996E] flex-shrink-0" />
                </div>
                {profile.followerCount ? (
                  <div className="flex items-center gap-1 text-gray-500 text-sm font-medium mt-0.5">
                    <Users className="w-3.5 h-3.5" />
                    <span>{formatFollowerCount(profile.followerCount)} followers</span>
                  </div>
                ) : null}
              </div>
            </div>
          </div>

          <button
            onClick={handleContinue}
            className="tactile-btn w-full py-4 text-base flex items-center justify-center gap-2"
            data-testid="button-continue"
          >
            Continue to Spiral
            <ArrowRight className="w-5 h-5" />
          </button>

          <div className="text-center">
            <button
              onClick={() => disconnectMutation.mutate()}
              disabled={disconnectMutation.isPending}
              className="inline-flex items-center justify-center gap-2 text-gray-400 hover:text-gray-600 transition-colors text-sm font-medium"
              data-testid="button-disconnect"
            >
              <LogOut className="w-4 h-4" />
              <span>Disconnect account</span>
            </button>
          </div>
        </main>
      </div>
    );
  }

  // CONNECT FLOW
  return (
    <div className="min-h-screen safe-top bg-warm pb-12">
      <header className="px-4 py-4 flex items-center justify-between sticky top-0 bg-[#FCFCFB]/80 backdrop-blur-md z-10">
        <button
          onClick={() => setLocation("/home")}
          className="w-10 h-10 rounded-full bg-white shadow-sm flex items-center justify-center hover-elevate"
          data-testid="button-back"
          aria-label="Back"
        >
          <ArrowLeft className="w-5 h-5 text-gray-900" />
        </button>
        <div className="w-10" />
      </header>

      <main className="px-6 mt-4 space-y-6">
        {/* HERO */}
        <div className="creator-card story-bg-gradient p-6 text-white text-center relative overflow-hidden">
          <div className="absolute top-0 right-0 p-4 opacity-20 transform translate-x-4 -translate-y-4 pointer-events-none">
            <Instagram className="w-32 h-32" />
          </div>
          <div className="relative z-10 flex flex-col items-center">
            <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center text-[#4ECCA3] shadow-lg mb-4">
              <Instagram className="w-8 h-8" />
            </div>
            <h1 className="text-2xl font-black mb-2 leading-tight">
              Connect Instagram
            </h1>
            <p className="text-[#E6F8F0] font-medium text-sm max-w-[280px]">
              Verify your Instagram to unlock bigger discounts based on your follower count.
            </p>
          </div>
        </div>

        {/* VERIFIED STATE */}
        {verificationStatus?.status === "verified" && (
          <div className="creator-card p-5 bg-[#E6F8F0] border border-[#A8F0D1]">
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center flex-shrink-0">
                <CheckCircle className="w-5 h-5 text-[#1A996E]" />
              </div>
              <div className="min-w-0">
                <h3 className="font-black text-[#0E5C42] text-base">
                  Verified!
                </h3>
                <p className="text-sm text-[#1A996E] mt-1 font-medium">
                  Connected as @{verificationStatus.instagramHandle}
                </p>
                {verificationStatus.followerCount ? (
                  <p className="text-sm text-[#1A996E] mt-0.5 font-medium">
                    {formatFollowerCount(verificationStatus.followerCount)} followers
                  </p>
                ) : null}
              </div>
            </div>
          </div>
        )}

        {/* CODE FLOW */}
        {spiralCode?.status === "pending" && (
          <>
            {/* CODE CARD */}
            <div className="creator-card p-6 bg-gray-900 text-white text-center">
              <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-4">
                Your Spiral code
              </p>
              <p
                className="text-5xl font-black tracking-widest text-[#A8F0D1] mb-5"
                data-testid="text-spiral-code"
              >
                {spiralCode.code}
              </p>
              <p className="text-sm text-gray-400 font-medium">
                DM this code to <span className="text-white font-bold">@joinspiral</span> on Instagram
              </p>
            </div>

            {/* CTA */}
            <button
              onClick={handleCopyAndMessage}
              className="tactile-btn w-full py-4 text-base flex items-center justify-center gap-2"
              data-testid="button-copy-message"
            >
              {copied ? (
                <>
                  <CheckCircle className="w-5 h-5" />
                  Copied! Opening Instagram…
                </>
              ) : (
                <>
                  <Copy className="w-5 h-5" />
                  Open Instagram &amp; DM @joinspiral
                  <ExternalLink className="w-4 h-4" />
                </>
              )}
            </button>

            {/* POLLING INDICATOR */}
            <div className="flex justify-center">
              <div className="glass-pill inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white shadow-sm border border-gray-100">
                <div className="w-2 h-2 rounded-full bg-[#4ECCA3] animate-pulse" />
                <span className="text-xs font-bold text-gray-600 uppercase tracking-wider">
                  Waiting for your DM…
                </span>
              </div>
            </div>

            {/* STEPS */}
            <div className="creator-card p-5">
              <h3 className="font-black text-gray-900 text-lg mb-4">How it works</h3>
              <ol className="space-y-4">
                {[
                  "Tap the button above to copy your code",
                  "Instagram opens to @joinspiral — paste and send the code",
                  "We'll verify your account and unlock your discounts",
                ].map((step, i) => (
                  <li key={i} className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-full bg-[#E6F8F0] text-[#1A996E] flex items-center justify-center font-black text-sm flex-shrink-0">
                      {i + 1}
                    </div>
                    <p className="text-sm text-gray-700 font-medium pt-1.5">{step}</p>
                  </li>
                ))}
              </ol>
            </div>

            {/* REGENERATE */}
            <div className="text-center">
              <button
                onClick={() => regenerateCodeMutation.mutate()}
                disabled={regenerateCodeMutation.isPending}
                className="inline-flex items-center justify-center gap-2 text-gray-400 hover:text-gray-600 transition-colors text-sm font-medium"
                data-testid="button-regenerate"
              >
                <RefreshCw className={`w-4 h-4 ${regenerateCodeMutation.isPending ? "animate-spin" : ""}`} />
                <span>Get a new code</span>
              </button>
            </div>
          </>
        )}

        {/* SKIP */}
        {verificationStatus?.status !== "verified" && (
          <div className="text-center pt-2">
            <button
              onClick={handleSkip}
              className="text-sm text-gray-400 font-medium hover:text-gray-600 transition-colors"
              data-testid="button-skip"
            >
              Skip for now
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
