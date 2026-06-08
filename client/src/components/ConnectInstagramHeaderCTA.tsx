import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Instagram, ChevronRight } from "lucide-react";

interface MeProfile {
  id: string;
  instagramHandle?: string | null;
}

export function ConnectInstagramHeaderCTA() {
  const { data: profile } = useQuery<MeProfile>({
    queryKey: ["/api/customer/me"],
  });

  if (!profile?.id) return null;
  if (profile.instagramHandle) return null;

  return (
    <div className="px-4 pt-4">
      <Link
        href="/home"
        className="creator-card story-bg-gradient flex items-center gap-3 px-4 py-3 text-white hover-elevate active-elevate-2"
        data-testid="header-cta-connect-instagram"
      >
        <div className="w-9 h-9 rounded-full bg-white flex items-center justify-center text-[#4ECCA3] shadow-sm shrink-0">
          <Instagram className="w-5 h-5" />
        </div>
        <span className="text-sm font-bold flex-1 leading-tight">
          Connect Instagram to use Spiral
        </span>
        <ChevronRight className="w-5 h-5 shrink-0 opacity-90" />
      </Link>
    </div>
  );
}
