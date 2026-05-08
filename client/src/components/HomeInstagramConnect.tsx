import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { CheckCircle, Loader2, Copy, ExternalLink, RefreshCw, Lock, Instagram } from "lucide-react";

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
    <div
      className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5"
      data-testid="card-home-connect-instagram"
    >
      <div className="flex items-start gap-3 mb-4">
        <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center flex-shrink-0">
          <Lock className="w-5 h-5 text-emerald-600" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-emerald-900" data-testid="text-connect-heading">
            Verify your Instagram to start
          </p>
          <p className="text-sm text-emerald-700 mt-1" data-testid="text-connect-body">
            Connect Instagram to start earning Spiral discounts at checkout.
          </p>
        </div>
      </div>

      {spiralCode?.status === "pending" && (
        <div className="bg-white rounded-2xl border border-emerald-100 p-5">
          <p className="text-sm text-gray-500 mb-3 text-center">
            Send this code to @joinspiral on Instagram:
          </p>

          <div className="bg-gray-50 rounded-xl border border-gray-100 p-4 mb-4 text-center">
            <span
              className="text-3xl font-bold tracking-[0.3em] text-[#4ECCA3] font-mono"
              data-testid="text-spiral-code"
            >
              {spiralCode.code}
            </span>
          </div>

          <Button
            onClick={handleCopyAndMessage}
            className="w-full h-14 text-base font-semibold rounded-xl text-white border-0 mb-3"
            style={{ background: 'linear-gradient(135deg, #A8F5E0, #4ECCA3, #2BAE88)' }}
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

          <Button
            asChild
            variant="outline"
            className="w-full h-12 text-sm font-medium rounded-xl border-emerald-200 text-emerald-800 mb-3"
            data-testid="button-open-spiral-instagram"
          >
            <a
              href="https://instagram.com/joinspiral"
              target="_blank"
              rel="noopener noreferrer"
            >
              <Instagram className="w-4 h-4 mr-2" />
              Visit @joinspiral on Instagram
              <ExternalLink className="w-4 h-4 ml-2" />
            </a>
          </Button>

          <div className="flex items-center justify-center gap-2 text-sm text-gray-400 mb-3">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>Waiting for your message...</span>
          </div>

          <button
            onClick={() => regenerateCodeMutation.mutate()}
            disabled={regenerateCodeMutation.isPending}
            className="flex items-center justify-center gap-2 text-gray-400 hover:text-gray-600 transition-colors mx-auto text-sm"
            data-testid="button-regenerate"
          >
            <RefreshCw className={`w-4 h-4 ${regenerateCodeMutation.isPending ? 'animate-spin' : ''}`} />
            <span>Get new code</span>
          </button>
        </div>
      )}

      {!spiralCode && (
        <div className="bg-white rounded-2xl border border-emerald-100 p-6 flex items-center justify-center gap-2 text-sm text-gray-400">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span>Generating your code...</span>
        </div>
      )}

      {verificationStatus?.status === "verified" && (
        <div className="bg-green-50 rounded-2xl border border-green-100 p-5 text-center">
          <CheckCircle className="w-10 h-10 text-green-600 mx-auto mb-2" />
          <p className="text-base font-semibold text-green-800">Verified!</p>
          {verificationStatus.instagramHandle && (
            <p className="text-sm text-green-700 mt-0.5 flex items-center justify-center gap-1">
              <Instagram className="w-3.5 h-3.5" />
              @{verificationStatus.instagramHandle}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
