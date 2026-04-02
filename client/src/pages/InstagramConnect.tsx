import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { CheckCircle, Loader2, Users, ArrowRight, LogOut, Copy, ExternalLink, RefreshCw } from "lucide-react";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import spiralLogoUrl from "@assets/Spiral_gradient_logo_1775056007518.png";

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
  const [igHandle, setIgHandle] = useState("");
  const [handleSaved, setHandleSaved] = useState(false);

  const saveHandleMutation = useMutation({
    mutationFn: async (handle: string) => {
      await apiRequest("PATCH", "/api/customer/spiral-code/handle", { handle });
    },
    onSuccess: () => setHandleSaved(true),
  });

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
      <div className="min-h-screen flex items-center justify-center bg-white">
        <Loader2 className="w-8 h-8 animate-spin text-[#D62976]" />
      </div>
    );
  }

  const isConnected = profile?.instagramHandle;

  if (isConnected) {
    return (
      <div className="min-h-screen flex flex-col bg-white">
        <div className="flex-1 flex flex-col items-center justify-center px-6 py-12">
          <div className="w-full max-w-sm mx-auto text-center">
            <img 
              src={spiralLogoUrl} 
              alt="Spiral" 
              className="h-12 mx-auto mb-12 object-contain"
              data-testid="img-spiral-logo"
            />

            <div className="bg-gray-50 border border-gray-100 rounded-3xl p-6 mb-6">
              <div className="flex items-center gap-4 mb-4">
                <Avatar className="w-16 h-16 border-2 border-gray-200">
                  <AvatarImage 
                    src={profile.instagramProfilePicture} 
                    alt={profile.instagramHandle}
                  />
                  <AvatarFallback className="text-white text-xl" style={{ background: 'linear-gradient(135deg, #FA7E1E, #D62976)' }}>
                    {profile.instagramHandle?.charAt(0).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 text-left">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-gray-900">
                      @{profile.instagramHandle}
                    </span>
                    <CheckCircle className="w-4 h-4 text-green-600" />
                  </div>
                  {profile.followerCount ? (
                    <div className="flex items-center gap-1 text-gray-500 text-sm">
                      <Users className="w-3.5 h-3.5" />
                      <span>{formatFollowerCount(profile.followerCount)} followers</span>
                    </div>
                  ) : null}
                </div>
              </div>

              <div className="flex items-center gap-2 p-3 bg-green-50 rounded-xl border border-green-100">
                <CheckCircle className="w-5 h-5 text-green-600" />
                <span className="text-sm text-green-800">
                  Instagram connected
                </span>
              </div>
            </div>

            <button
              onClick={() => disconnectMutation.mutate()}
              disabled={disconnectMutation.isPending}
              className="flex items-center justify-center gap-2 text-gray-400 hover:text-gray-600 transition-colors mx-auto text-sm"
              data-testid="button-disconnect"
            >
              <LogOut className="w-4 h-4" />
              <span>Disconnect account</span>
            </button>
          </div>
        </div>

        <div className="px-6 pb-8 safe-bottom">
          <Button 
            className="w-full h-14 text-base font-semibold rounded-2xl text-white border-0"
            style={{ background: 'linear-gradient(135deg, #FA7E1E, #D62976, #962FBF)' }}
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
    <div className="min-h-screen flex flex-col bg-white">
      <div className="flex-1 flex flex-col items-center px-6 pt-12 pb-6">
        <div className="w-full max-w-sm mx-auto text-center">
          <img 
            src={spiralLogoUrl} 
            alt="Spiral" 
            className="h-10 mx-auto mb-10 object-contain"
            data-testid="img-spiral-logo"
          />

          <h1 className="text-2xl font-extrabold text-gray-900 tracking-tight mb-3">
            Connect Instagram
          </h1>
          <p className="text-gray-500 mb-8">
            Verify your Instagram to unlock discounts based on your follower count
          </p>

          {spiralCode?.status === "pending" && (
            <div className="bg-gray-50 rounded-2xl border border-gray-100 p-4 mb-4">
              <p className="text-sm text-gray-500 mb-2">Your Instagram username</p>
              <div className="flex items-center gap-1 bg-white rounded-xl border border-gray-100 px-3 py-2">
                <span className="text-gray-400 font-medium text-sm">@</span>
                <input
                  type="text"
                  value={igHandle}
                  onChange={(e) => {
                    const val = e.target.value.replace(/^@/, "").replace(/\s/g, "");
                    setIgHandle(val);
                    setHandleSaved(false);
                  }}
                  onBlur={() => {
                    if (igHandle.trim()) saveHandleMutation.mutate(igHandle.trim());
                  }}
                  placeholder="yourhandle"
                  className="flex-1 bg-transparent outline-none text-gray-900 text-sm"
                  data-testid="input-instagram-handle"
                />
                {handleSaved && <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0" />}
              </div>
            </div>
          )}

          {spiralCode?.status === "pending" && (
            <div className="bg-gray-50 rounded-2xl border border-gray-100 p-6 mb-6">
              <p className="text-sm text-gray-500 mb-3">
                Send this code to @joinspiral on Instagram:
              </p>
              
              <div className="bg-white rounded-xl border border-gray-100 p-4 mb-4">
                <span className="text-3xl font-bold tracking-[0.3em] text-[#D62976] font-mono">
                  {spiralCode.code}
                </span>
              </div>

              <Button 
                onClick={handleCopyAndMessage}
                className="w-full h-14 text-base font-semibold rounded-xl text-white border-0 mb-3"
                style={{ background: 'linear-gradient(135deg, #FA7E1E, #D62976, #962FBF)' }}
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

              <div className="flex items-center justify-center gap-2 text-sm text-gray-400">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Waiting for your message...</span>
              </div>
            </div>
          )}

          {verificationStatus?.status === "verified" && (
            <div className="bg-green-50 rounded-2xl border border-green-100 p-6 mb-6">
              <CheckCircle className="w-12 h-12 text-green-600 mx-auto mb-3" />
              <p className="text-lg font-semibold text-green-800 mb-1">
                Verified!
              </p>
              <p className="text-sm text-green-700">
                Connected as @{verificationStatus.instagramHandle}
              </p>
              {verificationStatus.followerCount ? (
                <p className="text-sm text-green-600 mt-1">
                  {formatFollowerCount(verificationStatus.followerCount)} followers
                </p>
              ) : null}
            </div>
          )}

          {spiralCode?.status === "pending" && (
            <button
              onClick={() => regenerateCodeMutation.mutate()}
              disabled={regenerateCodeMutation.isPending}
              className="flex items-center justify-center gap-2 text-gray-400 hover:text-gray-600 transition-colors mx-auto text-sm"
              data-testid="button-regenerate"
            >
              <RefreshCw className={`w-4 h-4 ${regenerateCodeMutation.isPending ? 'animate-spin' : ''}`} />
              <span>Get new code</span>
            </button>
          )}
        </div>
      </div>

      <div className="px-6 pb-8 safe-bottom">
        {verificationStatus?.status !== "verified" && (
          <Button 
            variant="ghost"
            className="w-full h-12 text-base text-gray-400"
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
