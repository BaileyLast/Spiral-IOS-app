import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Gift, TrendingUp, ChevronRight, Instagram, Sparkles } from "lucide-react";
import spiralLogoUrl from "@assets/Spiral logo (2)_1763051288266.png";
import type { Order } from "@shared/schema";

function getStatusLabel(order: Order) {
  if (order.verificationStatus === "verified") return "Verified";
  if (order.verificationStatus === "failed") return "Reversed";
  if (order.status === "delivered") return "Awaiting Story";
  if (order.status === "fulfilled") return "On the way";
  return "Ordered";
}

function getStatusColor(status: string) {
  switch (status) {
    case "Verified":
      return "bg-[hsl(var(--status-verified))] text-[hsl(var(--status-verified-foreground))]";
    case "Reversed":
      return "bg-[hsl(var(--status-failed))] text-[hsl(var(--status-failed-foreground))]";
    case "Awaiting Story":
      return "bg-[hsl(var(--status-awaiting))] text-[hsl(var(--status-awaiting-foreground))]";
    case "On the way":
      return "bg-[hsl(var(--status-delivered))] text-[hsl(var(--status-delivered-foreground))]";
    default:
      return "bg-[hsl(var(--status-pending))] text-[hsl(var(--status-pending-foreground))]";
  }
}

export default function CustomerHome() {
  const customer = JSON.parse(localStorage.getItem("spiral_customer") || "{}");

  const { data: orders = [] } = useQuery<Order[]>({
    queryKey: ["/api/customer/orders"],
  });

  const { data: stats } = useQuery<{ totalSaved: number; ordersCompleted: number }>({
    queryKey: ["/api/customer/stats"],
  });

  const recentOrders = orders.slice(0, 3);
  const pendingActions = orders.filter(
    (o) => o.status === "delivered" && o.verificationStatus !== "verified" && o.verificationStatus !== "failed"
  );

  return (
    <div className="min-h-screen bg-background safe-top">
      <header className="px-6 pt-6 pb-4">
        <div className="flex items-center justify-between">
          <img 
            src={spiralLogoUrl} 
            alt="Spiral" 
            className="h-7 object-contain"
            data-testid="img-spiral-logo"
          />
          {customer.instagramHandle && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Instagram className="w-4 h-4" />
              <span data-testid="text-instagram-handle">@{customer.instagramHandle}</span>
            </div>
          )}
        </div>
      </header>

      <main className="px-6 pb-8 space-y-6">
        <div>
          <h1 className="text-2xl font-semibold text-foreground" data-testid="text-greeting">
            Hi{customer.email ? `, ${customer.email.split("@")[0]}` : ""}
          </h1>
          <p className="text-muted-foreground mt-1">Here's your Spiral activity</p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Card className="p-5 rounded-2xl">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-xl bg-accent flex items-center justify-center">
                <Gift className="w-5 h-5 text-primary" />
              </div>
            </div>
            <p className="text-2xl font-semibold text-foreground" data-testid="text-total-saved">
              ${stats?.totalSaved?.toFixed(2) || "0.00"}
            </p>
            <p className="text-sm text-muted-foreground">Total saved</p>
          </Card>

          <Card className="p-5 rounded-2xl">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-xl bg-accent flex items-center justify-center">
                <TrendingUp className="w-5 h-5 text-primary" />
              </div>
            </div>
            <p className="text-2xl font-semibold text-foreground" data-testid="text-orders-completed">
              {stats?.ordersCompleted || 0}
            </p>
            <p className="text-sm text-muted-foreground">Orders verified</p>
          </Card>
        </div>

        {pendingActions.length > 0 && (
          <Card className="p-5 rounded-2xl bg-[hsl(var(--status-awaiting))] border-0">
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-xl bg-white/30 flex items-center justify-center flex-shrink-0">
                <Sparkles className="w-5 h-5 text-[hsl(var(--status-awaiting-foreground))]" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-[hsl(var(--status-awaiting-foreground))]">
                  {pendingActions.length} order{pendingActions.length > 1 ? "s" : ""} awaiting your story
                </p>
                <p className="text-sm text-[hsl(var(--status-awaiting-foreground))] opacity-80 mt-1">
                  Share to keep your discount
                </p>
              </div>
              <Link href="/orders">
                <Button 
                  size="sm" 
                  variant="secondary"
                  className="bg-white/90 text-[hsl(var(--status-awaiting-foreground))] rounded-lg"
                  data-testid="button-view-pending"
                >
                  View
                </Button>
              </Link>
            </div>
          </Card>
        )}

        {recentOrders.length > 0 ? (
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-foreground">Recent Orders</h2>
              <Link href="/orders">
                <Button variant="ghost" size="sm" className="text-muted-foreground" data-testid="link-view-all-orders">
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
                    <Card className="p-4 rounded-2xl hover-elevate cursor-pointer" data-testid={`card-order-${order.id}`}>
                      <div className="flex items-center justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-foreground truncate">
                            Order #{order.shopifyOrderId.slice(-6)}
                          </p>
                          <p className="text-sm text-muted-foreground mt-0.5">
                            {new Date(order.createdAt).toLocaleDateString()}
                          </p>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-sm font-medium text-primary">
                            -${Number(order.discountAmount).toFixed(2)}
                          </span>
                          <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${getStatusColor(status)}`}>
                            {status}
                          </span>
                        </div>
                      </div>
                    </Card>
                  </Link>
                );
              })}
            </div>
          </div>
        ) : (
          <Card className="p-8 rounded-2xl text-center">
            <div className="w-16 h-16 rounded-2xl bg-accent flex items-center justify-center mx-auto mb-4">
              <ShoppingBag className="w-8 h-8 text-primary" />
            </div>
            <h3 className="font-semibold text-foreground mb-2">No orders yet</h3>
            <p className="text-sm text-muted-foreground">
              When you make a purchase with Spiral, it will appear here
            </p>
          </Card>
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
