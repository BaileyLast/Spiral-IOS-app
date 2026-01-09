import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Mail } from "lucide-react";
import spiralLogoUrl from "@assets/Spiral logo (2)_1763051288266.png";

export default function VerifyEmail() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [code, setCode] = useState(["", "", "", "", "", ""]);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  const customerData = localStorage.getItem("spiral_customer");
  const customer = customerData ? JSON.parse(customerData) : null;

  useEffect(() => {
    if (!customer) {
      setLocation("/");
    }
  }, [customer, setLocation]);

  const verifyMutation = useMutation({
    mutationFn: async (verificationCode: string) => {
      const response = await apiRequest("POST", "/api/customer/verify-email", { code: verificationCode });
      return response.json();
    },
    onSuccess: (data) => {
      // Account is created on verification success - store the customer data
      localStorage.setItem("spiral_customer", JSON.stringify({
        id: data.id,
        email: data.email,
        emailVerified: true,
      }));
      toast({
        title: "Email verified",
        description: "Your account is ready to use",
      });
      setLocation("/connect-instagram");
    },
    onError: (error: Error) => {
      toast({
        title: "Verification failed",
        description: error.message || "Please check your code and try again",
        variant: "destructive",
      });
    },
  });

  const resendMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/customer/resend-code");
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Code sent",
        description: "Check your email for a new verification code",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to resend",
        description: error.message || "Please try again",
        variant: "destructive",
      });
    },
  });

  const handleChange = (index: number, value: string) => {
    if (!/^\d*$/.test(value)) return;
    
    const newCode = [...code];
    newCode[index] = value.slice(-1);
    setCode(newCode);

    if (value && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }

    if (newCode.every(d => d) && newCode.join("").length === 6) {
      verifyMutation.mutate(newCode.join(""));
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === "Backspace" && !code[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (pasted.length === 6) {
      setCode(pasted.split(""));
      verifyMutation.mutate(pasted);
    }
  };

  return (
    <div className="min-h-screen flex flex-col relative overflow-hidden">
      <div 
        className="absolute inset-0 z-0"
        style={{
          background: `
            linear-gradient(135deg, 
              hsl(265, 60%, 20%) 0%, 
              hsl(280, 55%, 30%) 25%, 
              hsl(290, 50%, 35%) 50%, 
              hsl(320, 45%, 30%) 75%, 
              hsl(340, 40%, 25%) 100%
            )
          `,
        }}
      />
      
      <div 
        className="absolute inset-0 z-0 opacity-30"
        style={{
          background: `
            radial-gradient(ellipse at 30% 20%, hsl(270, 70%, 50%) 0%, transparent 50%),
            radial-gradient(ellipse at 80% 80%, hsl(320, 60%, 45%) 0%, transparent 40%)
          `,
        }}
      />

      <div className="relative z-10 flex-1 flex flex-col px-6 py-12 safe-top safe-bottom">
        <div className="w-full max-w-sm mx-auto flex-1 flex flex-col justify-center">
          <div className="text-center mb-10">
            <img 
              src={spiralLogoUrl} 
              alt="Spiral" 
              className="h-40 mx-auto mb-6 object-contain brightness-0 invert"
              data-testid="img-spiral-logo"
            />
            
            <div className="w-16 h-16 rounded-full bg-white/10 flex items-center justify-center mx-auto mb-6">
              <Mail className="w-8 h-8 text-white" />
            </div>
            
            <h1 className="text-3xl font-bold text-white mb-2">
              Check your email
            </h1>
            <p className="text-white/70">
              We sent a 6-digit code to<br />
              <span className="text-white font-medium">{customer?.email}</span>
            </p>
          </div>

          <div className="flex justify-center gap-3 mb-8" onPaste={handlePaste}>
            {code.map((digit, index) => (
              <input
                key={index}
                ref={el => inputRefs.current[index] = el}
                type="text"
                inputMode="numeric"
                maxLength={1}
                value={digit}
                onChange={e => handleChange(index, e.target.value)}
                onKeyDown={e => handleKeyDown(index, e)}
                className="w-12 h-14 text-center text-2xl font-bold rounded-xl bg-white/10 border border-white/20 text-white focus:bg-white/15 focus:border-white/40 focus:outline-none"
                data-testid={`input-code-${index}`}
              />
            ))}
          </div>

          <Button 
            onClick={() => verifyMutation.mutate(code.join(""))}
            className="w-full h-14 text-base font-semibold rounded-2xl bg-white text-gray-900 hover:bg-white/90 shadow-lg shadow-black/20"
            disabled={verifyMutation.isPending || code.some(d => !d)}
            data-testid="button-verify"
          >
            {verifyMutation.isPending ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              "Verify"
            )}
          </Button>

          <div className="mt-6 text-center">
            <button
              type="button"
              onClick={() => resendMutation.mutate()}
              disabled={resendMutation.isPending}
              className="text-sm text-white/70"
              data-testid="button-resend"
            >
              {resendMutation.isPending ? (
                "Sending..."
              ) : (
                <>Didn't receive it? <span className="text-white font-medium">Resend code</span></>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
