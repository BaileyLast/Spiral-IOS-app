import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";
import { ArrowLeft, Instagram, CheckCircle2, ExternalLink, Link2 } from "lucide-react";
import { SiFacebook } from "react-icons/si";
const spiralLogoUrl = "/spiral-logo.png";

export default function InstagramHelp() {
  const [, setLocation] = useLocation();

  const creatorSteps = [
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
      title: "Choose Creator or Business",
      description: "Select 'Creator' for individuals or 'Business' for brands",
    },
  ];

  const linkSteps = [
    {
      title: "Open Instagram Settings",
      description: "Go to Settings and privacy > Accounts Center",
    },
    {
      title: "Add Facebook account",
      description: "Tap 'Accounts' then 'Add accounts' and connect your Facebook",
    },
    {
      title: "Link to a Facebook Page",
      description: "In Accounts Center, connect your Instagram to a Facebook Page you manage",
    },
  ];

  return (
    <div className="min-h-screen flex flex-col relative overflow-hidden">
      <div 
        className="absolute inset-0 z-0"
        style={{
          background: `linear-gradient(135deg, #A8F5E0 0%, #4ECCA3 50%, #2BAE88 100%)`,
        }}
      />
      
      <div className="relative z-10 flex-1 flex flex-col px-6 py-8 overflow-y-auto">
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
            Setup Guide
          </h1>
          <p className="text-white/80 text-center mb-8">
            Spiral needs your Instagram to be a Creator/Business account linked to Facebook
          </p>

          <div className="bg-white rounded-3xl p-6 shadow-xl mb-4">
            <div className="flex items-center gap-2 mb-4">
              <Instagram className="w-5 h-5 text-primary" />
              <h2 className="font-medium text-foreground">
                Step 1: Switch to Creator/Business
              </h2>
            </div>
            
            <div className="space-y-3">
              {creatorSteps.map((step, index) => (
                <div key={index} className="flex gap-3">
                  <div className="flex-shrink-0 w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center">
                    <span className="text-xs font-semibold text-primary">{index + 1}</span>
                  </div>
                  <div className="flex-1">
                    <p className="font-medium text-foreground text-sm">{step.title}</p>
                    <p className="text-muted-foreground text-xs">{step.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white rounded-3xl p-6 shadow-xl mb-4">
            <div className="flex items-center gap-2 mb-4">
              <SiFacebook className="w-5 h-5 text-[#1877F2]" />
              <h2 className="font-medium text-foreground">
                Step 2: Link to Facebook
              </h2>
            </div>
            
            <div className="space-y-3">
              {linkSteps.map((step, index) => (
                <div key={index} className="flex gap-3">
                  <div className="flex-shrink-0 w-5 h-5 rounded-full bg-[#1877F2]/10 flex items-center justify-center">
                    <span className="text-xs font-semibold text-[#1877F2]">{index + 1}</span>
                  </div>
                  <div className="flex-1">
                    <p className="font-medium text-foreground text-sm">{step.title}</p>
                    <p className="text-muted-foreground text-xs">{step.description}</p>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-950/30 rounded-xl">
              <div className="flex items-start gap-2">
                <Link2 className="w-4 h-4 text-[#1877F2] flex-shrink-0 mt-0.5" />
                <p className="text-xs text-muted-foreground">
                  If you don't have a Facebook Page, you can create one for free in the Facebook app or at facebook.com/pages/create
                </p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-3xl p-5 shadow-xl">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-foreground">Your privacy is protected</p>
                <p className="text-xs text-muted-foreground">
                  We only read your follower count. We can't post, message, or access your private data.
                </p>
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
          I'm ready - Connect now
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
