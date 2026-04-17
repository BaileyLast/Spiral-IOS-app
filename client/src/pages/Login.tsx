import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useLocation } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Eye, EyeOff, Loader2 } from "lucide-react";
const spiralLogoUrl = "/spiral-gradient-logo.png";

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
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const authMutation = useMutation({
    mutationFn: async (data: { email: string; password: string; name?: string }) => {
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
    const combinedName = `${firstName.trim()} ${lastName.trim()}`.trim();
    authMutation.mutate({ 
      email, 
      password,
      ...(mode === "signup" && combinedName && { name: combinedName })
    });
  };

  return (
    <div className="min-h-screen flex flex-col bg-white">
      <div className="flex-1 flex flex-col px-6 py-12 safe-top safe-bottom">
        <div className="w-full max-w-sm mx-auto flex-1 flex flex-col justify-center">
          <div className="text-center mb-10">
            <img 
              src={spiralLogoUrl} 
              alt="Spiral" 
              className="h-36 mx-auto mb-6 object-contain"
              data-testid="img-spiral-logo"
            />
            <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight mb-2">
              {mode === "login" ? "Welcome back" : "Get started"}
            </h1>
            <p className="text-gray-500">
              {mode === "login" 
                ? "Sign in to view your discounts" 
                : "Create an account to start saving"}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === "signup" && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="firstName" className="text-gray-700 text-sm font-medium">
                    First name
                  </Label>
                  <Input
                    id="firstName"
                    type="text"
                    placeholder="First"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    className="h-14 rounded-2xl bg-gray-50 border-gray-200 text-gray-900 placeholder:text-gray-400 focus:border-[#D62976] focus:ring-[#D62976]/20"
                    data-testid="input-firstname"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="lastName" className="text-gray-700 text-sm font-medium">
                    Last name
                  </Label>
                  <Input
                    id="lastName"
                    type="text"
                    placeholder="Last"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    className="h-14 rounded-2xl bg-gray-50 border-gray-200 text-gray-900 placeholder:text-gray-400 focus:border-[#D62976] focus:ring-[#D62976]/20"
                    data-testid="input-lastname"
                  />
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="email" className="text-gray-700 text-sm font-medium">
                Email
              </Label>
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="h-14 rounded-2xl bg-gray-50 border-gray-200 text-gray-900 placeholder:text-gray-400 focus:border-[#D62976] focus:ring-[#D62976]/20"
                data-testid="input-email"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password" className="text-gray-700 text-sm font-medium">
                Password
              </Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="h-14 rounded-2xl bg-gray-50 border-gray-200 text-gray-900 placeholder:text-gray-400 focus:border-[#D62976] focus:ring-[#D62976]/20 pr-14"
                  data-testid="input-password"
                />
                <button
                  type="button"
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-1"
                  onClick={() => setShowPassword(!showPassword)}
                  data-testid="button-toggle-password"
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            <Button 
              type="submit"
              className="w-full h-14 text-base font-semibold rounded-2xl mt-6 text-white border-0"
              style={{ background: 'linear-gradient(135deg, #FA7E1E, #D62976, #962FBF)' }}
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
              className="text-sm text-gray-500"
              data-testid="button-toggle-mode"
            >
              {mode === "login" ? (
                <>Don't have an account? <span className="text-[#D62976] font-semibold">Sign up</span></>
              ) : (
                <>Already have an account? <span className="text-[#D62976] font-semibold">Sign in</span></>
              )}
            </button>
          </div>
        </div>

        <p className="text-xs text-gray-400 text-center mt-auto pt-8">
          By continuing, you agree to our Terms of Service and Privacy Policy
        </p>
      </div>
    </div>
  );
}
