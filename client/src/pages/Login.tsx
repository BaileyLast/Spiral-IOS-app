import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useLocation } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import spiralLogoUrl from "@assets/Spiral logo (2)_1763051288266.png";

type AuthMode = "login" | "signup";

interface AuthResponse {
  id: string;
  email: string;
  name?: string;
  emailVerified?: boolean;
  instagramHandle?: string;
  followerCount?: number;
}

export default function Login() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [mode, setMode] = useState<AuthMode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const authMutation = useMutation({
    mutationFn: async (data: { email: string; password: string }) => {
      const endpoint = mode === "login" ? "/api/customer/login" : "/api/customer/signup";
      const response = await apiRequest("POST", endpoint, data);
      return response.json();
    },
    onSuccess: (data: AuthResponse) => {
      localStorage.setItem("spiral_customer", JSON.stringify(data));
      
      if (mode === "signup") {
        setLocation("/verify-email");
      } else if (!data.emailVerified) {
        setLocation("/verify-email");
      } else if (data.instagramHandle) {
        setLocation("/home");
      } else {
        setLocation("/connect-instagram");
      }
    },
    onError: (error: Error) => {
      toast({
        title: mode === "login" ? "Login failed" : "Sign up failed",
        description: error.message || "Please check your details and try again",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      toast({
        title: "Missing information",
        description: "Please enter your email and password",
        variant: "destructive",
      });
      return;
    }
        authMutation.mutate({ email, password });
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
            <h1 className="text-3xl font-bold text-white mb-2">
              {mode === "login" ? "Welcome back" : "Get started"}
            </h1>
            <p className="text-white/70">
              {mode === "login" 
                ? "Sign in to view your discounts" 
                : "Create an account to start saving"}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email" className="text-white/90 text-sm font-medium">
                Email
              </Label>
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="h-14 rounded-2xl bg-white/10 border-white/20 text-white placeholder:text-white/40 focus:bg-white/15 focus:border-white/40 backdrop-blur-sm"
                data-testid="input-email"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password" className="text-white/90 text-sm font-medium">
                Password
              </Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="h-14 rounded-2xl bg-white/10 border-white/20 text-white placeholder:text-white/40 focus:bg-white/15 focus:border-white/40 backdrop-blur-sm pr-14"
                  data-testid="input-password"
                />
                <button
                  type="button"
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-white/60 hover:text-white p-1"
                  onClick={() => setShowPassword(!showPassword)}
                  data-testid="button-toggle-password"
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            <Button 
              type="submit"
              className="w-full h-14 text-base font-semibold rounded-2xl mt-6 bg-white text-gray-900 hover:bg-white/90 shadow-lg shadow-black/20"
              disabled={authMutation.isPending}
              data-testid="button-submit"
            >
              {authMutation.isPending ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : mode === "login" ? (
                "Sign In"
              ) : (
                "Create Account"
              )}
            </Button>
          </form>

          <div className="mt-8 text-center">
            <button
              type="button"
              onClick={() => setMode(mode === "login" ? "signup" : "login")}
              className="text-sm text-white/70"
              data-testid="button-toggle-mode"
            >
              {mode === "login" ? (
                <>Don't have an account? <span className="text-white font-medium">Sign up</span></>
              ) : (
                <>Already have an account? <span className="text-white font-medium">Sign in</span></>
              )}
            </button>
          </div>
        </div>

        <p className="text-xs text-white/40 text-center mt-auto pt-8">
          By continuing, you agree to our Terms of Service and Privacy Policy
        </p>
      </div>
    </div>
  );
}
