import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useLocation } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Eye, EyeOff, Loader2 } from "lucide-react";
import { Link } from "wouter";
import spiralLogoUrl from "@assets/Spiral logo (2)_1763051288266.png";

type AuthMode = "login" | "signup";

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
    onSuccess: (data: { id: string; email: string; instagramHandle?: string }) => {
      localStorage.setItem("spiral_customer", JSON.stringify(data));
      if (data.instagramHandle) {
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
    <div className="min-h-screen flex flex-col bg-background">
      <header className="flex items-center px-4 h-14 safe-top">
        <Link href="/">
          <Button variant="ghost" size="icon" data-testid="button-back">
            <ArrowLeft className="w-5 h-5" />
          </Button>
        </Link>
      </header>

      <div className="flex-1 flex flex-col px-6 py-8">
        <div className="w-full max-w-sm mx-auto">
          <img 
            src={spiralLogoUrl} 
            alt="Spiral" 
            className="h-8 mb-8 object-contain"
            data-testid="img-spiral-logo"
          />

          <h1 className="text-2xl font-semibold text-foreground mb-2">
            {mode === "login" ? "Welcome back" : "Create your account"}
          </h1>
          <p className="text-muted-foreground mb-8">
            {mode === "login" 
              ? "Sign in to view your orders and discounts" 
              : "Start earning discounts on your purchases"}
          </p>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="h-12 rounded-xl"
                data-testid="input-email"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="h-12 rounded-xl pr-12"
                  data-testid="input-password"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-1 top-1/2 -translate-y-1/2"
                  onClick={() => setShowPassword(!showPassword)}
                  data-testid="button-toggle-password"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </Button>
              </div>
            </div>

            <Button 
              type="submit"
              className="w-full h-14 text-base font-medium rounded-xl mt-6"
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

          <div className="mt-6 text-center">
            <button
              type="button"
              onClick={() => setMode(mode === "login" ? "signup" : "login")}
              className="text-sm text-muted-foreground"
              data-testid="button-toggle-mode"
            >
              {mode === "login" ? (
                <>Don't have an account? <span className="text-primary font-medium">Sign up</span></>
              ) : (
                <>Already have an account? <span className="text-primary font-medium">Sign in</span></>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
