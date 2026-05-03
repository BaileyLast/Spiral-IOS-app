import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Mail } from "lucide-react";
const spiralLogoUrl = "/spiral-gradient-logo.png";

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
      localStorage.setItem("spiral_customer", JSON.stringify({
        id: data.id,
        email: data.email,
        firstName: data.firstName,
        lastName: data.lastName,
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
    <div className="min-h-screen flex flex-col bg-white">
      <div className="flex-1 flex flex-col px-6 py-12 safe-top safe-bottom">
        <div className="w-full max-w-sm mx-auto flex-1 flex flex-col justify-center">
          <div className="text-center mb-10">
            <img 
              src={spiralLogoUrl} 
              alt="Spiral" 
              className="h-28 mx-auto mb-6 object-contain"
              data-testid="img-spiral-logo"
            />
            
            <div className="w-16 h-16 rounded-full bg-gray-50 border border-gray-100 flex items-center justify-center mx-auto mb-6">
              <Mail className="w-8 h-8 text-[#4ECCA3]" />
            </div>
            
            <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight mb-2">
              Check your email
            </h1>
            <p className="text-gray-500">
              We sent a 6-digit code to<br />
              <span className="text-gray-900 font-semibold">{customer?.email}</span>
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
                className="w-12 h-14 text-center text-2xl font-bold rounded-xl bg-gray-50 border border-gray-200 text-gray-900 focus:border-[#4ECCA3] focus:ring-2 focus:ring-[#4ECCA3]/20 focus:outline-none transition-colors"
                data-testid={`input-code-${index}`}
              />
            ))}
          </div>

          <Button 
            onClick={() => verifyMutation.mutate(code.join(""))}
            className="w-full h-14 text-base font-semibold rounded-2xl text-white border-0"
            style={{ background: 'linear-gradient(135deg, #A8F5E0, #4ECCA3, #2BAE88)' }}
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
              className="text-sm text-gray-500"
              data-testid="button-resend"
            >
              {resendMutation.isPending ? (
                "Sending..."
              ) : (
                <>Didn't receive it? <span className="text-[#4ECCA3] font-semibold">Resend code</span></>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
