import { Button } from "@/components/ui/button";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { ChevronRight, Instagram, Sparkles, Users, CheckCircle, Tag } from "lucide-react";
import type { Order } from "@shared/schema";

function getStatusLabel(order: Order) {
  if (order.verificationStatus === "verified") return "Verified";
  if (order.verificationStatus === "story_detected") return "Story Received";
  if (order.status === "delivered") return "Post Your Story";
  if (order.status === "fulfilled") return "On the way";
  return "Ordered";
}

function getStatusBadge(status: string) {
  switch (status) {
    case "Verified":
      return "bg-green-500/20 text-green-300 border border-green-400/20";
    case "Story Received":
      return "bg-blue-500/20 text-blue-300 border border-blue-400/20";
    case "Post Your Story":
      return "bg-amber-500/20 text-amber-300 border border-amber-400/20";
    case "On the way":
      return "bg-blue-500/20 text-blue-300 border border-blue-400/20";
    default:
      return "bg-white/10 text-white/70 border border-white/10";
  }
}

interface CustomerProfile {
  id: string;
  email: string;
  name?: string;
  instagramHandle?: string;
  instagramProfilePicture?: string;
  instagramAccountType?: string;
  followerCount?: number;
}

function formatFollowerCount(count: number): string {
  if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M`;
  if (count >= 1000) return `${(count / 1000).toFixed(1)}K`;
  return count.toString();
}

export default function CustomerHome() {
  const { data: profile } = useQuery<CustomerProfile>({
    queryKey: ["/api/customer/me"],
  });

  const { data: orders = [] } = useQuery<Order[]>({
    queryKey: ["/api/customer/orders"],
  });

  const { data: stats } = useQuery<{ totalSaved: number; ordersCompleted: number; averageSavingsPercent: number }>({
    queryKey: ["/api/customer/stats"],
  });

  const recentOrders = orders.slice(0, 3);
  const pendingActions = orders.filter(
    (o) => o.status === "delivered" && o.verificationStatus !== "verified" && o.verificationStatus !== "story_detected"
  );

  return (
    <div className="min-h-screen safe-top">
      <main className="px-6 pt-8 pb-8 space-y-6">
        {profile?.instagramHandle && (
          <div className="text-center" data-testid="card-instagram-profile">
            <Avatar className="w-20 h-20 mx-auto border-0">
              <AvatarImage
                src="/api/customer/instagram-avatar"
                alt={profile.instagramHandle}
              />
              <AvatarFallback className="bg-gradient-to-br from-purple-400 to-pink-400 text-white">
                <Instagram className="w-8 h-8" />
              </AvatarFallback>
            </Avatar>
            <div className="flex items-center justify-center gap-1.5 mt-3">
              <span className="font-medium text-white" data-testid="text-instagram-handle">
                @{profile.instagramHandle}
              </span>
              <CheckCircle className="w-3.5 h-3.5 text-green-400 flex-shrink-0" />
            </div>
            {profile.followerCount ? (
              <p className="text-sm text-white/50 mt-1" data-testid="text-follower-count">
                {formatFollowerCount(profile.followerCount)} followers
              </p>
            ) : null}
          </div>
        )}

        {stats && (
          <div className="text-center py-2" data-testid="card-average-savings">
            <p className="text-white/50 text-sm mb-1">On average, you save</p>
            <p className="text-6xl font-bold text-white tracking-tight" data-testid="text-average-savings">
              {stats.averageSavingsPercent.toFixed(1)}%
            </p>
            <p className="text-white/50 text-sm mt-1">with Spiral</p>
          </div>
        )}

        <div className="p-5 rounded-2xl bg-white/10 backdrop-blur-sm border border-white/10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-green-500/20 flex items-center justify-center flex-shrink-0">
              <Tag className="w-5 h-5 text-green-300" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm text-white/50">You've saved</p>
              <p className="text-xl font-semibold text-green-300" data-testid="text-total-saved">
                ${stats?.totalSaved?.toFixed(2) || "0.00"}
              </p>
            </div>
          </div>
        </div>

        {pendingActions.length > 0 && (
          <div className="p-5 rounded-2xl bg-amber-500/15 backdrop-blur-sm border border-amber-400/20">
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-xl bg-amber-500/20 flex items-center justify-center flex-shrink-0">
                <Sparkles className="w-5 h-5 text-amber-300" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-amber-200">
                  {pendingActions.length} order{pendingActions.length > 1 ? "s" : ""} awaiting your story
                </p>
                <p className="text-sm text-amber-300/70 mt-1">
                  Share to keep your discount
                </p>
              </div>
              <Link href="/discounts">
                <Button 
                  size="sm" 
                  className="bg-white/20 text-amber-200 border border-amber-400/30 rounded-lg"
                  data-testid="button-view-pending"
                >
                  View
                </Button>
              </Link>
            </div>
          </div>
        )}

        {recentOrders.length > 0 ? (
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-white">Recent Orders</h2>
              <Link href="/discounts">
                <Button variant="ghost" size="sm" className="text-white/50" data-testid="link-view-all-orders">
                  View all
                  <ChevronRight className="w-4 h-4 ml-1" />
                </Button>
              </Link>
            </div>

            <div className="space-y-3">
              {recentOrders.map((order) => {
                const status = getStatusLabel(order);
                return (
                  <Link key={order.id} href={`/orders/${order.id}`}>
                    <div className="p-4 rounded-2xl bg-white/10 backdrop-blur-sm border border-white/10 cursor-pointer hover-elevate" data-testid={`card-order-${order.id}`}>
                      <div className="flex items-center justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-white truncate">
                            Order #{order.shopifyOrderId.slice(-6)}
                          </p>
                          <p className="text-sm text-white/50 mt-0.5">
                            {new Date(order.createdAt).toLocaleDateString()}
                          </p>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-sm font-medium text-green-300">
                            -${Number(order.discountAmount).toFixed(2)}
                          </span>
                          <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${getStatusBadge(status)}`}>
                            {status}
                          </span>
                        </div>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="p-8 rounded-2xl bg-white/10 backdrop-blur-sm border border-white/10 text-center">
            <div className="w-16 h-16 rounded-2xl bg-white/15 flex items-center justify-center mx-auto mb-4">
              <ShoppingBag className="w-8 h-8 text-white/70" />
            </div>
            <h3 className="font-semibold text-white mb-2">No orders yet</h3>
            <p className="text-sm text-white/50">
              When you make a purchase with Spiral, it will appear here
            </p>
          </div>
        )}
      </main>
    </div>
  );
}

function ShoppingBag({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" />
      <line x1="3" y1="6" x2="21" y2="6" />
      <path d="M16 10a4 4 0 0 1-8 0" />
    </svg>
  );
}
