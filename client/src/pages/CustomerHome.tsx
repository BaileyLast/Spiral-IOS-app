import { Button } from "@/components/ui/button";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { ChevronRight, Instagram, Lock, CheckCircle, Tag } from "lucide-react";
import type { Order } from "@shared/schema";

function getStatusLabel(order: Order) {
  if (order.verificationStatus === "verified") return "Verified";
  if (order.verificationStatus === "story_detected") return "Story Received";
  if (order.status === "delivered") return "Story Needed";
  if (order.status === "fulfilled") return "On the way";
  return "Ordered";
}

function getStatusBadge(status: string) {
  switch (status) {
    case "Verified":
      return "bg-green-50 text-green-700 border border-green-200";
    case "Story Received":
      return "bg-blue-50 text-blue-700 border border-blue-200";
    case "Story Needed":
      return "bg-amber-50 text-amber-700 border border-amber-200";
    case "On the way":
      return "bg-blue-50 text-blue-700 border border-blue-200";
    default:
      return "bg-gray-100 text-gray-600 border border-gray-200";
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

  const { data: stats } = useQuery<{
    totalSaved: number;
    ordersCompleted: number;
    discountPercent: number;
    pendingVerificationCount: number;
    pendingOrders: { id: string; storeName: string | null; shopifyOrderId: string }[];
  }>({
    queryKey: ["/api/customer/stats"],
  });

  const recentOrders = orders.slice(0, 3);
  const pendingCount = stats?.pendingVerificationCount ?? 0;
  const pendingOrders = stats?.pendingOrders ?? [];

  return (
    <div className="min-h-screen safe-top bg-white">
      <main className="px-6 pt-14 pb-8 space-y-6">
        {profile?.instagramHandle && (
          <div className="text-center" data-testid="card-instagram-profile">
            <Avatar className="w-20 h-20 mx-auto border-2 border-gray-100">
              <AvatarImage
                src="/api/customer/instagram-avatar"
                alt={profile.instagramHandle}
              />
              <AvatarFallback className="text-white" style={{ background: 'linear-gradient(135deg, #FA7E1E, #D62976)' }}>
                <Instagram className="w-8 h-8" />
              </AvatarFallback>
            </Avatar>
            <div className="flex items-center justify-center gap-1.5 mt-3">
              <span className="font-semibold text-gray-900" data-testid="text-instagram-handle">
                @{profile.instagramHandle}
              </span>
              <CheckCircle className="w-3.5 h-3.5 text-green-500 flex-shrink-0" />
            </div>
            {profile.followerCount ? (
              <p className="text-sm text-gray-400 mt-1 flex items-center justify-center gap-1" data-testid="text-follower-count">
                <Instagram className="w-3 h-3" />
                {formatFollowerCount(profile.followerCount)} followers
              </p>
            ) : null}
          </div>
        )}

        {stats && stats.discountPercent > 0 && (
          <div className="text-center py-2" data-testid="card-discount">
            <p className="text-gray-400 text-sm mb-1">Your Spiral discount</p>
            <p className="text-6xl font-extrabold tracking-tight text-brand-gradient" data-testid="text-discount-percent">
              {stats.discountPercent % 1 === 0 ? stats.discountPercent.toFixed(0) : stats.discountPercent.toFixed(1)}%
            </p>
            <p className="text-gray-400 text-sm mt-1">off every order</p>
          </div>
        )}

        <div className="p-5 rounded-2xl bg-gray-50 border border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-green-50 border border-green-100 flex items-center justify-center flex-shrink-0">
              <Tag className="w-5 h-5 text-green-600" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm text-gray-500">You've saved</p>
              <p className="text-xl font-bold text-green-700" data-testid="text-total-saved">
                ${stats?.totalSaved?.toFixed(2) || "0.00"}
              </p>
            </div>
          </div>
        </div>

        {pendingCount > 0 && (
          <div className="p-5 rounded-2xl bg-amber-50 border border-amber-200" data-testid="card-lockout">
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center flex-shrink-0">
                <Lock className="w-5 h-5 text-amber-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-amber-900" data-testid="text-lockout-headline">
                  Your next Spiral discount is locked
                </p>
                <p className="text-sm text-amber-700 mt-1">
                  Post a Story for {pendingCount === 1 ? "your previous order" : `your ${pendingCount} unverified orders`} to unlock it.
                </p>
                {pendingOrders.length > 0 && (
                  <div className="mt-3 space-y-1.5">
                    {pendingOrders.map((o) => (
                      <Link key={o.id} href={`/orders/${o.id}`}>
                        <div
                          className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-white border border-amber-200 hover-elevate cursor-pointer"
                          data-testid={`link-pending-order-${o.id}`}
                        >
                          <span className="text-sm font-medium text-amber-900 truncate">
                            {o.storeName || `Order #${o.shopifyOrderId.slice(-6)}`}
                          </span>
                          <ChevronRight className="w-4 h-4 text-amber-500 flex-shrink-0" />
                        </div>
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {recentOrders.length > 0 ? (
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-gray-900">Recent Orders</h2>
              <Link href="/discounts">
                <Button variant="ghost" size="sm" className="text-gray-400" data-testid="link-view-all-orders">
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
                    <div className="p-4 rounded-2xl bg-white border border-gray-100 cursor-pointer hover-elevate" data-testid={`card-order-${order.id}`}>
                      <div className="flex items-center justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-gray-900 truncate">
                            Order #{order.shopifyOrderId.slice(-6)}
                          </p>
                          <p className="text-sm text-gray-400 mt-0.5">
                            {new Date(order.createdAt).toLocaleDateString()}
                          </p>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-sm font-bold text-green-700">
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
          <div className="p-8 rounded-2xl bg-gray-50 border border-gray-100 text-center">
            <div className="w-16 h-16 rounded-2xl bg-white border border-gray-100 flex items-center justify-center mx-auto mb-4">
              <ShoppingBag className="w-8 h-8 text-gray-300" />
            </div>
            <h3 className="font-bold text-gray-900 mb-2">No orders yet</h3>
            <p className="text-sm text-gray-400">
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
