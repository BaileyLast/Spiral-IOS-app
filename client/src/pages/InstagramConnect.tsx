import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Instagram, Shield, CheckCircle, Loader2 } from "lucide-react";
import spiralLogoUrl from "@assets/Spiral logo (2)_1763051288266.png";

export default function InstagramConnect() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const connectMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("/api/customer/connect-instagram", { 
        method: "POST",
        headers: { "Content-Type": "application/json" }
      });
      return response;
    },
    onSuccess: (data) => {
      const customer = JSON.parse(localStorage.getItem("spiral_customer") || "{}");
      localStorage.setItem("spiral_customer", JSON.stringify({ ...customer, ...data }));
      toast({
        title: "Instagram connected",
        description: "Your account is now linked",
      });
      setLocation("/home");
    },
    onError: (error: Error) => {
      toast({
        title: "Connection failed",
        description: error.message || "Please try again",
        variant: "destructive",
      });
    },
  });

  const handleSkip = () => {
    setLocation("/home");
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm mx-auto text-center">
          <img 
            src={spiralLogoUrl} 
            alt="Spiral" 
            className="h-8 mx-auto mb-12 object-contain"
            data-testid="img-spiral-logo"
          />

          <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center mx-auto mb-8">
            <Instagram className="w-10 h-10 text-white" />
          </div>

          <h1 className="text-2xl font-semibold text-foreground mb-3">
            Connect Instagram
          </h1>
          <p className="text-muted-foreground mb-8">
            Link your account to verify your follower count and unlock your discount
          </p>

          <div className="bg-card rounded-2xl border border-border p-5 mb-8 text-left">
            <div className="flex items-start gap-3 mb-4">
              <Shield className="w-5 h-5 text-primary mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-sm font-medium text-foreground">Your privacy is protected</p>
                <p className="text-sm text-muted-foreground mt-1">We only access your follower count and verify story tags</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <CheckCircle className="w-5 h-5 text-primary mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-sm font-medium text-foreground">No posts on your behalf</p>
                <p className="text-sm text-muted-foreground mt-1">We never post, comment, or follow anyone for you</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="px-6 pb-8 space-y-3 safe-bottom">
        <Button 
          className="w-full h-14 text-base font-medium rounded-xl"
          onClick={() => connectMutation.mutate()}
          disabled={connectMutation.isPending}
          data-testid="button-connect-instagram"
        >
          {connectMutation.isPending ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : (
            <>
              <Instagram className="w-5 h-5 mr-2" />
              Connect Instagram
            </>
          )}
        </Button>
        <Button 
          variant="ghost"
          className="w-full h-12 text-base text-muted-foreground"
          onClick={handleSkip}
          data-testid="button-skip"
        >
          Skip for now
        </Button>
      </div>
    </div>
  );
}
