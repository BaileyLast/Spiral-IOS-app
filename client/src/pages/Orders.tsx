import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { ShoppingBag, ChevronRight, CheckCircle2, Clock } from "lucide-react";
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

export default function Orders() {
  const { data: orders = [], isLoading } = useQuery<Order[]>({
    queryKey: ["/api/customer/orders"],
  });

  return (
    <div className="min-h-screen safe-top">
      <header className="px-6 pt-8 pb-6">
        <h1 className="text-2xl font-semibold text-white" data-testid="text-page-title">Your Discounts</h1>
        <p className="text-white/60 mt-1">Track your purchases and savings</p>
      </header>

      <main className="px-6 pb-8">
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="p-4 rounded-2xl bg-white/10 backdrop-blur-sm border border-white/10 animate-pulse">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex-1">
                    <div className="h-5 bg-white/10 rounded w-32 mb-2" />
                    <div className="h-4 bg-white/10 rounded w-24" />
                  </div>
                  <div className="h-6 bg-white/10 rounded-full w-20" />
                </div>
              </div>
            ))}
          </div>
        ) : orders.length > 0 ? (
          <div className="space-y-3">
            {orders.map((order) => {
              const status = getStatusLabel(order);
              
              return (
                <Link key={order.id} href={`/orders/${order.id}`}>
                  <div className="p-4 rounded-2xl bg-white/10 backdrop-blur-sm border border-white/10 cursor-pointer hover-elevate" data-testid={`card-order-${order.id}`}>
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-white truncate">
                          Order #{order.shopifyOrderId.slice(-6)}
                        </p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <p className="text-sm text-white/50">
                            {new Date(order.createdAt).toLocaleDateString()}
                          </p>
                          {status === "Verified" && (
                            <>
                              <span className="text-white/30">·</span>
                              <div className="flex items-center gap-1">
                                <CheckCircle2 className="w-3 h-3 text-green-400" />
                                <p className="text-sm text-green-400 font-medium">
                                  Discount confirmed
                                </p>
                              </div>
                            </>
                          )}
                          {status === "Post Your Story" && (
                            <>
                              <span className="text-white/30">·</span>
                              <div className="flex items-center gap-1">
                                <Clock className="w-3 h-3 text-amber-300" />
                                <p className="text-sm text-amber-300 font-medium">
                                  Share to keep discount
                                </p>
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="text-right">
                          <span className="text-sm font-medium text-green-300">
                            -${Number(order.discountAmount).toFixed(2)}
                          </span>
                        </div>
                        <span className={`px-2.5 py-1 rounded-full text-xs font-medium whitespace-nowrap ${getStatusBadge(status)}`}>
                          {status}
                        </span>
                        <ChevronRight className="w-4 h-4 text-white/30 flex-shrink-0" />
                      </div>
                    </div>
                  </div>
                </Link>
              );
            })}
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
