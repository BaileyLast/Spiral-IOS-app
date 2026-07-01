import { useEffect, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { openInstagram } from "@/lib/native";
import { useToast } from "@/hooks/use-toast";
import {
  CheckCircle,
  Copy,
  ExternalLink,
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

  const regenerateCodeMutation = useMutation<SpiralCodeResponse, Error, { silent?: boolean } | void>({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/customer/spiral-code/regenerate");
      return response.json();
    },
    onSuccess: (data, variables) => {
      queryClient.setQueryData(["/api/customer/spiral-code"], data);
      const silent = variables && "silent" in variables ? variables.silent : false;
      if (!silent) {
        toast({
          title: "New code generated",
          description: "Your Spiral code has been refreshed",
        });
      }
    },
    onError: (_err, variables) => {
      const silent = variables && "silent" in variables ? variables.silent : false;
      if (!silent) {
        toast({
          title: "Failed to regenerate",
          description: "Please try again",
          variant: "destructive",
        });
      }
    },
  });

  // Auto-regenerate silently (exactly once) if the current code expires
  // while the page is open. Guard resets when status moves away from
  // "expired" so a future expiry can still auto-renew.
  const autoRegenFiredRef = useRef(false);
  useEffect(() => {
    const status = verificationStatus?.status;
    if (status === "expired") {
      if (!autoRegenFiredRef.current) {
        autoRegenFiredRef.current = true;
        regenerateCodeMutation.mutate({ silent: true });
      }
    } else {
      autoRegenFiredRef.current = false;
    }
  }, [verificationStatus?.status]);

  const handleCopyCode = async () => {
    if (!spiralCode?.code) return;
    try {
      await navigator.clipboard.writeText(spiralCode.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      toast({
        title: "Copy failed",
        description: "Please copy the code manually",
        variant: "destructive",
      });
    }
  };

  const handleDmSpiral = async () => {
    if (!spiralCode?.code) return;
    try {
      await navigator.clipboard.writeText(spiralCode.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      // Clipboard can fail without permissions; still open Instagram so the
      // shopper can send the code (it's shown on screen) manually.
    }
    // Opens Spiral's page in the Instagram app (not a web page). openInstagram
    // maps this to the instagram:// app scheme on device, falling back to the
    // browser only when Instagram isn't installed.
    await openInstagram("https://instagram.com/joinspiral");
  };

  return (
    <div className="space-y-6" data-testid="card-home-connect-instagram">
      {/* HERO */}
      <div className="creator-card story-bg-gradient p-6 text-white text-center relative overflow-hidden">
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
          {/* CODE + DM (one connected card) */}
          <div className="creator-card overflow-hidden">
            {/* Tap the code to copy it */}
            <button
              type="button"
              onClick={handleCopyCode}
              className="w-full block !bg-gray-900 text-white text-center px-6 pt-6 pb-5 transition-opacity active:opacity-90"
              data-testid="button-copy-code"
            >
              <span
                className="block text-sm font-medium text-gray-300 mb-4 leading-snug"
                data-testid="text-connect-instruction"
              >
                DM this code to @joinspiral to connect your Instagram
              </span>
              <span className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-4">
                Your Spiral code
              </span>
              <span
                className="block text-5xl font-black tracking-widest text-[#A8F0D1] mb-3"
                data-testid="text-spiral-code"
              >
                {spiralCode.code}
              </span>
              <span className="inline-flex items-center justify-center gap-1.5 text-sm font-bold text-gray-300">
                {copied ? (
                  <>
                    <CheckCircle className="w-4 h-4 text-[#A8F0D1]" />
                    Copied!
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4" />
                    Tap to copy
                  </>
                )}
              </span>
            </button>

            {/* DM Spiral opens Spiral's page in the Instagram app */}
            <div className="p-4">
              <button
                onClick={handleDmSpiral}
                className="tactile-btn w-full py-4 text-base flex items-center justify-center gap-2"
                data-testid="button-dm-spiral"
              >
                <Instagram className="w-5 h-5" />
                DM Spiral
                <ExternalLink className="w-4 h-4" />
              </button>
            </div>
          </div>

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
                "Tap your code above to copy it",
                "Tap DM Spiral — Instagram opens to @joinspiral",
                "Send the code in a DM and we'll verify you",
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
        </>
      )}
    </div>
  );
}
