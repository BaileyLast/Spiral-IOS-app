import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { ChevronRight, Instagram, Lock, CheckCircle2 } from "lucide-react";
import type { Order } from "@shared/schema";
import HomeInstagramConnect from "@/components/HomeInstagramConnect";
import { OrderCard } from "@/pages/Orders";
import { formatCurrency } from "@/lib/countries";
import { useAuthGuard } from "@/hooks/use-auth-guard";

interface CustomerProfile {
  id: string;
  email: string;
  name?: string;
  instagramHandle?: string;
  instagramProfilePicture?: string;
  instagramAccountType?: string;
  followerCount?: number;
  accountStatus?: string;
  softBannedReason?: string | null;
  country?: string | null;
}

function formatFollowerCount(count: number): string {
  if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M`;
  if (count >= 1000) return `${(count / 1000).toFixed(1)}K`;
  return count.toString();
}

export default function CustomerHome() {
  const { data: profile, error: profileError } = useQuery<CustomerProfile>({
    queryKey: ["/api/customer/me"],
  });

  const { data: orders = [], error: ordersError } = useQuery<Order[]>({
    queryKey: ["/api/customer/orders"],
  });

  const { data: stats, error: statsError } = useQuery<{
    totalSaved: number;
    ordersCompleted: number;
    discountPercent: number;
    pendingVerificationCount: number;
  }>({
    queryKey: ["/api/customer/stats"],
  });

  // If the session is dead, treat the shopper as logged out instead of rendering
  // the signed-in shell with stale/empty data (e.g. on-hold banner + no orders).
  useAuthGuard(profileError, ordersError, statsError);

  const recentOrders = orders.slice(0, 3);
  const isSoftBanned = profile?.accountStatus === "soft_banned";
  // Mirrors server-side getOwedOrdersForCustomer exactly so banner count never disagrees
  // with checkout: taken_down_early (final-fail debt) is owed regardless of delivery; quick
  // states (pending / awaiting_review / not_public) only count once delivered.
  const owedOrders = orders.filter((o) => {
    const v = o.verificationStatus;
    if (v === "taken_down_early") return true;
    if (o.status === "delivered" && (v === "pending" || v === "awaiting_review" || v === "not_public")) return true;
    return false;
  });
  const pendingCount = owedOrders.length;

  const greetingName = profile?.name?.split(" ")[0] || profile?.instagramHandle;
  const hasStats =
    !!stats && (stats.totalSaved > 0 || stats.ordersCompleted > 0 || stats.discountPercent > 0);
  const discountText =
    stats && stats.discountPercent > 0
      ? stats.discountPercent % 1 === 0
        ? stats.discountPercent.toFixed(0)
        : stats.discountPercent.toFixed(1)
      : null;

  return (
    <div className="min-h-screen bg-warm safe-top pb-12">
      <header className="px-6 pt-10 pb-6">
        <h1
          className="text-3xl font-black tracking-tight text-gray-900 mb-2"
          data-testid="text-page-title"
        >
          {greetingName ? `Hi, ${greetingName}` : "Welcome"}
        </h1>
        {profile?.instagramHandle && (
          <div
            className="glass-pill inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white shadow-sm border border-gray-100"
            data-testid="card-instagram-profile"
          >
            <Instagram className="w-3.5 h-3.5 text-[#4ECCA3]" />
            <span
              className="text-xs font-bold text-gray-700"
              data-testid="text-instagram-handle"
            >
              @{profile.instagramHandle}
            </span>
            <CheckCircle2 className="w-3.5 h-3.5 text-[#1A996E]" />
            {profile.followerCount ? (
              <span
                className="text-xs font-bold text-gray-500"
                data-testid="text-follower-count"
              >
                · {formatFollowerCount(profile.followerCount)}
              </span>
            ) : null}
          </div>
        )}
      </header>

      <main className="px-6 space-y-6">
        {profile && !profile.instagramHandle && <HomeInstagramConnect />}

        {hasStats && (
          <div
            className="creator-card p-6 !bg-gray-900 text-white"
            data-testid="card-stats"
          >
            <h3 className="font-black text-lg mb-5">Your Spiral</h3>

            {discountText && (
              <div
                className="mb-5 pb-5 border-b border-gray-800"
                data-testid="card-discount"
              >
                <p className="text-xs uppercase tracking-widest text-gray-400 font-bold mb-1">
                  Discount on every order
                </p>
                <p
                  className="text-5xl font-black tracking-tight text-[#A8F0D1]"
                  data-testid="text-discount-percent"
                >
                  {discountText}%
                </p>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs uppercase tracking-widest text-gray-400 font-bold mb-1">
                  Saved
                </p>
                <p
                  className="text-2xl font-black text-[#A8F0D1]"
                  data-testid="text-total-saved"
                >
                  {formatCurrency(stats!.totalSaved, profile?.country)}
                </p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-widest text-gray-400 font-bold mb-1">
                  Orders
                </p>
                <p
                  className="text-2xl font-black text-white"
                  data-testid="text-orders-completed"
                >
                  {stats!.ordersCompleted}
                </p>
              </div>
            </div>
          </div>
        )}

        {isSoftBanned && (
          <div
            className="creator-card story-bg-gradient p-6 text-white relative overflow-hidden"
            data-testid="banner-soft-banned"
          >
            <div className="absolute top-0 right-0 p-4 opacity-20 transform translate-x-4 -translate-y-4 pointer-events-none">
              <Instagram className="w-32 h-32" />
            </div>

            <div className="relative z-10">
              <div className="w-14 h-14 bg-white rounded-full flex items-center justify-center text-[#4ECCA3] shadow-lg mb-4">
                <Lock className="w-7 h-7" />
              </div>
              <h2
                className="text-2xl font-black mb-2 leading-tight"
                data-testid="text-soft-ban-heading"
              >
                Keep the spiral going
              </h2>
              <p
                className="text-[#E6F8F0] font-medium text-sm mb-5 max-w-[320px]"
                data-testid="text-soft-ban-body"
              >
                {profile?.softBannedReason === "inherited_from_instagram"
                  ? "Your Instagram owes a Story from an earlier Spiral order. Post it tagging the brand to keep earning discounts."
                  : pendingCount > 1
                    ? `You've got ${pendingCount} orders waiting on a Story. Post one for your latest purchase to keep earning discounts with Spiral.`
                    : "You've got a Story to post. Share your latest purchase tagging the brand to keep earning discounts with Spiral."}
              </p>

              <Link href="/discounts">
                <div
                  className="glass-pill flex items-center justify-between gap-2 px-4 py-3 rounded-2xl bg-white/90 cursor-pointer hover-elevate"
                  data-testid="link-see-pending-orders"
                >
                  <span className="text-sm font-bold text-gray-900">
                    See pending orders
                  </span>
                  <ChevronRight className="w-4 h-4 text-[#4ECCA3] flex-shrink-0" />
                </div>
              </Link>
            </div>
          </div>
        )}

        {recentOrders.length > 0 && (
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-gray-400 uppercase tracking-widest">
                Recent Orders
              </h2>
              <Link href="/discounts">
                <button
                  className="flex items-center gap-1 text-xs font-bold text-[#4ECCA3] hover-elevate rounded-full px-2 py-1"
                  data-testid="link-view-all-orders"
                >
                  View all
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </Link>
            </div>

            <div className="space-y-4">
              {recentOrders.map((order) => (
                <OrderCard key={order.id} order={order} />
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
