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
    <Link href="/connect-instagram">
      <a
        className="block bg-[#EBF9F5] border-b border-[#A8F5E0] px-6 py-2.5 hover-elevate active-elevate-2"
        data-testid="header-cta-connect-instagram"
      >
        <div className="flex items-center gap-2 text-[#155843]">
          <Instagram className="w-4 h-4 shrink-0" />
          <span className="text-sm font-semibold flex-1">Connect Instagram to use Spiral</span>
          <ChevronRight className="w-4 h-4 shrink-0 opacity-70" />
        </div>
      </a>
    </Link>
  );
}
