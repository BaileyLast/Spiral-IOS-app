import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { useLocation } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { ToastAction } from "@/components/ui/toast";
import { Eye, EyeOff, Loader2, ChevronDown, Check, Sparkles } from "lucide-react";
import { COUNTRIES, getCountryByCode, detectCountryFromLocale } from "@/lib/countries";
const spiralLogoUrl = "/spiral-gradient-logo.png";

type AuthMode = "login" | "signup";

interface AuthResponse {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
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
  const detectedCountry = useMemo(() => detectCountryFromLocale(), []);
  const [country, setCountry] = useState<string | null>(detectedCountry);
  const [countryPickerOpen, setCountryPickerOpen] = useState(false);
  const selectedCountry = getCountryByCode(country);

  const authMutation = useMutation({
    mutationFn: async (data: { mode: AuthMode; email: string; password: string; firstName?: string; lastName?: string; country?: string }) => {
      const endpoint = data.mode === "login" ? "/api/customer/login" : "/api/customer/signup";
      const { mode: _mode, ...payload } = data;
      const response = await apiRequest("POST", endpoint, payload);
      return response.json();
    },
    onSuccess: (data: AuthResponse, variables) => {
      localStorage.setItem("spiral_customer", JSON.stringify(data));

      if (variables.mode === "signup") {
        setLocation("/verify-email");
      } else if (!data.emailVerified) {
        setLocation("/verify-email");
      } else if (data.instagramHandle) {
        setLocation("/home");
      } else {
        setLocation("/home");
      }
    },
    onError: (error: Error, variables) => {
      const isDuplicateEmail =
        variables.mode === "signup" &&
        error.message === "An account with this email already exists";

      if (isDuplicateEmail) {
        const attemptedEmail = variables.email;
        toast({
          title: "You already have a Spiral account",
          description: "This email is already associated with a Spiral account.",
          action: (
            <ToastAction
              altText="Sign in with this email"
              onClick={() => {
                setMode("login");
                setEmail(attemptedEmail);
                setPassword("");
                setShowPassword(false);
              }}
              data-testid="button-toast-switch-signin"
            >
              Sign In
            </ToastAction>
          ),
        });
        return;
      }

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
    authMutation.mutate({
      mode,
      email,
      password,
      ...(mode === "signup" && firstName.trim() && { firstName: firstName.trim() }),
      ...(mode === "signup" && lastName.trim() && { lastName: lastName.trim() }),
      ...(mode === "signup" && country && { country }),
    });
  };

  return (
    <div className="min-h-screen bg-warm safe-top pb-12">
      <main className="px-6 pt-8 space-y-6">
        {/* HERO */}
        <div className="pt-8 pb-2 text-center flex flex-col items-center">
          <img
            src={spiralLogoUrl}
            alt="Spiral"
            className="h-14 w-14 object-contain mb-6"
            data-testid="img-spiral-logo"
          />
          <h1 className="text-3xl font-black mb-2 leading-tight tracking-tight text-gray-900">
            {mode === "login" ? "Welcome back" : "Earn instant discounts"}
          </h1>
          <p className="text-gray-500 font-medium text-sm max-w-[260px]">
            {mode === "login"
              ? "Sign in to view your Spiral account"
              : "Sign up to Spiral, everyone is doing it!"}
          </p>
        </div>

        {/* FORM */}
        <div className="creator-card p-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === "signup" && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="firstName" className="text-gray-700 text-sm font-bold">
                    First name
                  </Label>
                  <Input
                    id="firstName"
                    type="text"
                    placeholder="First"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    className="h-14 rounded-2xl bg-gray-50 border-0 text-gray-900 placeholder:text-gray-400 focus-visible:ring-2 focus-visible:ring-[#4ECCA3] focus-visible:ring-offset-0"
                    data-testid="input-firstname"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="lastName" className="text-gray-700 text-sm font-bold">
                    Last name
                  </Label>
                  <Input
                    id="lastName"
                    type="text"
                    placeholder="Last"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    className="h-14 rounded-2xl bg-gray-50 border-0 text-gray-900 placeholder:text-gray-400 focus-visible:ring-2 focus-visible:ring-[#4ECCA3] focus-visible:ring-offset-0"
                    data-testid="input-lastname"
                  />
                </div>
              </div>
            )}

            {mode === "signup" && (
              <div className="space-y-2">
                <Label className="text-gray-700 text-sm font-bold">Country</Label>
                <Popover open={countryPickerOpen} onOpenChange={setCountryPickerOpen}>
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      className="w-full h-14 px-4 rounded-2xl bg-gray-50 border-0 text-left flex items-center justify-between hover-elevate"
                      data-testid="button-signup-country"
                    >
                      <span className={selectedCountry ? "text-gray-900 font-medium" : "text-gray-400"}>
                        {selectedCountry?.name || "Select country"}
                      </span>
                      <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0" />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[320px] p-0" align="start">
                    <Command>
                      <CommandInput placeholder="Search country..." data-testid="input-signup-country-search" />
                      <CommandList>
                        <CommandEmpty>No country found.</CommandEmpty>
                        <CommandGroup>
                          {COUNTRIES.map((c) => (
                            <CommandItem
                              key={c.code}
                              value={c.name}
                              onSelect={() => {
                                setCountry(c.code);
                                setCountryPickerOpen(false);
                              }}
                              data-testid={`option-signup-country-${c.code}`}
                            >
                              <span className="flex-1">{c.name}</span>
                              {country === c.code && <Check className="w-4 h-4 text-[#4ECCA3]" />}
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="email" className="text-gray-700 text-sm font-bold">
                Email
              </Label>
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="h-14 rounded-2xl bg-gray-50 border-0 text-gray-900 placeholder:text-gray-400 focus-visible:ring-2 focus-visible:ring-[#4ECCA3] focus-visible:ring-offset-0"
                data-testid="input-email"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password" className="text-gray-700 text-sm font-bold">
                Password
              </Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="h-14 rounded-2xl bg-gray-50 border-0 text-gray-900 placeholder:text-gray-400 focus-visible:ring-2 focus-visible:ring-[#4ECCA3] focus-visible:ring-offset-0 pr-14"
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

            <button
              type="submit"
              className="tactile-btn bg-white text-[#4ECCA3] w-full py-4 text-base mt-6 shadow-[0_4px_12px_rgba(0,0,0,0.1),inset_0_-4px_0_rgba(240,240,240,1)]"
              disabled={authMutation.isPending}
              data-testid="button-submit"
            >
              {authMutation.isPending ? (
                <Loader2 className="w-5 h-5 animate-spin mx-auto" />
              ) : mode === "login" ? (
                "Sign In"
              ) : (
                "Create Account"
              )}
            </button>
          </form>
        </div>

        {/* MODE TOGGLE */}
        <div className="text-center">
          <button
            type="button"
            onClick={() => setMode(mode === "login" ? "signup" : "login")}
            className="text-sm text-gray-500 font-medium"
            data-testid="button-toggle-mode"
          >
            {mode === "login" ? (
              <>Don't have an account? <span className="text-[#4ECCA3] font-bold">Sign up</span></>
            ) : (
              <>Already have an account? <span className="text-[#4ECCA3] font-bold">Sign in</span></>
            )}
          </button>
        </div>
      </main>
    </div>
  );
}
