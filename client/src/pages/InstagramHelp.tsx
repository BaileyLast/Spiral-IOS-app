import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";
import { ArrowLeft, Instagram, CheckCircle2, ExternalLink } from "lucide-react";
import spiralLogoUrl from "@assets/Spiral logo (2)_1763051288266.png";

export default function InstagramHelp() {
  const [, setLocation] = useLocation();

  const steps = [
    {
      title: "Open Instagram",
      description: "Go to your profile and tap the menu (three lines) in the top right",
    },
    {
      title: "Go to Settings",
      description: "Tap 'Settings and privacy' at the bottom of the menu",
    },
    {
      title: "Find account type",
      description: "Tap 'Account type and tools' (under 'For professionals')",
    },
    {
      title: "Switch to professional",
      description: "Tap 'Switch to professional account' and follow the prompts",
    },
    {
      title: "Choose Creator",
      description: "When asked, select 'Creator' - this is best for individuals",
    },
    {
      title: "Pick a category",
      description: "Choose any category (e.g., 'Digital creator'). You can hide it from your profile",
    },
    {
      title: "Return to Spiral",
      description: "Come back here and enter your Instagram username to connect",
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

          <div className="w-14 h-14 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center mx-auto mb-6">
            <Instagram className="w-7 h-7 text-white" />
          </div>

          <h1 className="text-2xl font-semibold text-white text-center mb-3">
            Switch to Creator Account
          </h1>
          <p className="text-white/80 text-center mb-8">
            Spiral needs a Creator or Business account to see your follower count. It's free and takes about 2 minutes.
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

            <div className="mt-6 p-4 bg-muted/50 rounded-xl">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-foreground">Your account stays the same</p>
                  <p className="text-sm text-muted-foreground">
                    Switching to Creator is free and doesn't change how your profile looks or works. You can switch back anytime.
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
          I've switched - Connect now
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
