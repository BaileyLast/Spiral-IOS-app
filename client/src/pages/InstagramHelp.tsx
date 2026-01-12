import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";
import { ArrowLeft, Instagram, CheckCircle2, ExternalLink, Info } from "lucide-react";
import { SiFacebook } from "react-icons/si";
import spiralLogoUrl from "@assets/Spiral logo (2)_1763051288266.png";

export default function InstagramHelp() {
  const [location, setLocation] = useLocation();
  const params = new URLSearchParams(window.location.search);
  const error = params.get("error");

  const getErrorMessage = () => {
    switch (error) {
      case "no_pages":
        return "Your Instagram account isn't connected to a Facebook Page yet. This is required for Meta's business tools.";
      case "no_business_account":
        return "We couldn't find an Instagram Business or Creator account linked to your Meta account.";
      case "personal_account":
        return "Your Instagram account is set to Personal. Meta requires a Creator or Business account to access follower data.";
      default:
        return "To use Spiral, you need an Instagram Creator or Business account connected via Meta.";
    }
  };

  const steps = [
    {
      title: "Open Instagram",
      description: "Go to your profile and tap the menu (≡) in the top right",
    },
    {
      title: "Go to Settings",
      description: "Tap 'Settings and privacy' at the bottom",
    },
    {
      title: "Switch to professional",
      description: "Tap 'Account type and tools' → 'Switch to professional account'",
    },
    {
      title: "Pick a category",
      description: "Choose any category and toggle off 'Display on profile' to hide it",
    },
    {
      title: "Choose Creator",
      description: "Select 'Creator' (recommended for individuals)",
    },
    {
      title: "Link a Facebook Page",
      description: "Go to Edit Profile → Page to connect a Facebook Page. You can create a new one - it can be set to private",
    },
    {
      title: "Return to Spiral",
      description: "Come back and tap 'Continue with Meta' to complete the connection",
    },
  ];

  return (
    <div className="min-h-screen flex flex-col relative overflow-hidden">
      <div 
        className="absolute inset-0 z-0"
        style={{
          background: `
            linear-gradient(135deg, 
              hsl(280 70% 50%) 0%, 
              hsl(320 70% 45%) 50%,
              hsl(340 65% 40%) 100%)
          `,
        }}
      />
      
      <div className="relative z-10 flex-1 flex flex-col px-6 py-8">
        <button 
          onClick={() => setLocation("/connect-instagram")}
          className="flex items-center gap-2 text-white/80 hover:text-white transition-colors mb-6 w-fit"
          data-testid="button-back"
        >
          <ArrowLeft className="w-5 h-5" />
          <span>Back</span>
        </button>

        <div className="w-full max-w-sm mx-auto">
          <img 
            src={spiralLogoUrl} 
            alt="Spiral" 
            className="h-8 mx-auto mb-8 object-contain brightness-0 invert"
            data-testid="img-spiral-logo"
          />

          <div className="flex items-center justify-center gap-2 mb-6">
            <div className="w-12 h-12 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center">
              <Instagram className="w-6 h-6 text-white" />
            </div>
            <div className="w-6 h-6 rounded-full bg-white/10 flex items-center justify-center">
              <span className="text-white/70 text-sm">+</span>
            </div>
            <div className="w-12 h-12 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center">
              <SiFacebook className="w-6 h-6 text-white" />
            </div>
          </div>

          <h1 className="text-2xl font-semibold text-white text-center mb-3">
            Set up for Meta connection
          </h1>
          <p className="text-white/80 text-center mb-8">
            {getErrorMessage()}
          </p>

          <div className="bg-white rounded-3xl p-6 shadow-xl">
            <h2 className="font-medium text-foreground mb-4">
              How to switch (takes 2 minutes)
            </h2>
            
            <div className="space-y-4">
              {steps.map((step, index) => (
                <div key={index} className="flex gap-3">
                  <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center">
                    <span className="text-xs font-semibold text-primary">{index + 1}</span>
                  </div>
                  <div className="flex-1">
                    <p className="font-medium text-foreground text-sm">{step.title}</p>
                    <p className="text-muted-foreground text-sm">{step.description}</p>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-6 p-4 bg-muted/50 rounded-xl space-y-3">
              <div className="flex items-start gap-3">
                <Info className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-foreground">Why this setup?</p>
                  <p className="text-sm text-muted-foreground">
                    Meta (the company behind Instagram & Facebook) requires a Creator or Business account linked to a Facebook Page to access follower data. This is how Instagram's professional tools work.
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-foreground">Your account stays the same</p>
                  <p className="text-sm text-muted-foreground">
                    Switching to Creator is free and doesn't change how your profile looks or works.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="relative z-10 px-6 pb-8 space-y-3 safe-bottom">
        <Button 
          className="w-full h-14 text-base font-medium rounded-xl bg-white text-primary hover:bg-white/90"
          onClick={() => setLocation("/connect-instagram")}
          data-testid="button-try-again"
        >
          Try connecting with Meta
        </Button>
        <a 
          href="https://help.instagram.com/502981923235522"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-2 w-full h-12 text-white/80 hover:text-white transition-colors"
          data-testid="link-instagram-help"
        >
          <span>Instagram's official guide</span>
          <ExternalLink className="w-4 h-4" />
        </a>
      </div>
    </div>
  );
}
