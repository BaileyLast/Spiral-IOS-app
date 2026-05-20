import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  CheckCircle,
  Copy,
  ExternalLink,
  RefreshCw,
  Instagram,
} from "lucide-react";

interface SpiralCodeResponse {
  code: string;
  expiresAt: string;
  status: string;
}

interface VerificationStatus {
  status: string;
  instagramHandle?: string;
  followerCount?: number;
}

function formatFollowerCount(count: number) {
  if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M`;
  if (count >= 1000) return `${(count / 1000).toFixed(1)}K`;
  return count.toString();
}

export default function HomeInstagramConnect() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [copied, setCopied] = useState(false);

  const { data: spiralCode } = useQuery<SpiralCodeResponse>({
    queryKey: ["/api/customer/spiral-code"],
    queryFn: async () => {
      const response = await apiRequest("POST", "/api/customer/spiral-code/regenerate");
      return response.json();
    },
    staleTime: Infinity,
  });

  const { data: verificationStatus } = useQuery<VerificationStatus>({
    queryKey: ["/api/customer/spiral-code/status"],
    refetchInterval: 3000,
    enabled: !!spiralCode && spiralCode.status === "pending",
  });

  if (verificationStatus?.status === "verified") {
    queryClient.invalidateQueries({ queryKey: ["/api/customer/me"] });
    queryClient.invalidateQueries({ queryKey: ["/api/customer/stats"] });
  }

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

  return (
    <div className="space-y-6" data-testid="card-home-connect-instagram">
      {/* HERO */}
      <div className="creator-card story-bg-gradient p-6 text-white text-center relative overflow-hidden">
        <div className="absolute top-0 right-0 p-4 opacity-20 transform translate-x-4 -translate-y-4 pointer-events-none">
          <Instagram className="w-32 h-32" />
        </div>
        <div className="relative z-10 flex flex-col items-center">
          <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center text-[#4ECCA3] shadow-lg mb-4">
            <Instagram className="w-8 h-8" />
          </div>
          <h1 className="text-2xl font-black mb-2 leading-tight" data-testid="text-connect-heading">
            Connect Instagram
          </h1>
          <p className="text-[#E6F8F0] font-medium text-sm max-w-[280px]" data-testid="text-connect-body">Verify your Instagram and start earning discounts today!</p>
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
              <h3 className="font-black text-[#0E5C42] text-base">Verified!</h3>
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
          <div className="creator-card p-6 !bg-gray-900 text-white text-center">
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
    </div>
  );
}
