import { Card } from "@/components/ui/card";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { ShoppingBag, ChevronRight } from "lucide-react";
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

function formatDeadline(deadline: Date | string | null) {
  if (!deadline) return null;
  const date = new Date(deadline);
  const now = new Date();
  const diff = date.getTime() - now.getTime();
  
  if (diff < 0) return "Expired";
  
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  
  if (days > 0) return `${days}d ${hours}h left`;
  if (hours > 0) return `${hours}h left`;
  return "Less than 1h left";
}

export default function Orders() {
  const { data: orders = [], isLoading } = useQuery<Order[]>({
    queryKey: ["/api/customer/orders"],
  });

  return (
    <div className="min-h-screen bg-background safe-top">
      <header className="relative overflow-hidden px-6 pt-8 pb-6">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-primary/5 to-transparent" />
        <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-bl from-primary/20 to-transparent rounded-full blur-2xl -translate-y-1/2 translate-x-1/2" />
        <div className="relative">
          <h1 className="text-2xl font-semibold text-foreground">Your Discounts</h1>
          <p className="text-muted-foreground mt-1">Track your purchases and savings</p>
        </div>
      </header>

      <main className="px-6 pb-8">
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <Card key={i} className="p-4 rounded-2xl animate-pulse">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex-1">
                    <div className="h-5 bg-muted rounded w-32 mb-2" />
                    <div className="h-4 bg-muted rounded w-24" />
                  </div>
                  <div className="h-6 bg-muted rounded-full w-20" />
                </div>
              </Card>
            ))}
          </div>
        ) : orders.length > 0 ? (
          <div className="space-y-3">
            {orders.map((order) => {
              const status = getStatusLabel(order);
              const deadline = status === "Awaiting Story" ? formatDeadline(order.postDeadline) : null;
              
              return (
                <Link key={order.id} href={`/orders/${order.id}`}>
                  <Card className="p-4 rounded-2xl hover-elevate cursor-pointer" data-testid={`card-order-${order.id}`}>
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-foreground truncate">
                          Order #{order.shopifyOrderId.slice(-6)}
                        </p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <p className="text-sm text-muted-foreground">
                            {new Date(order.createdAt).toLocaleDateString()}
                          </p>
                          {deadline && (
                            <>
                              <span className="text-muted-foreground">·</span>
                              <p className="text-sm text-[hsl(var(--status-awaiting-foreground))] font-medium">
                                {deadline}
                              </p>
                            </>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="text-right">
                          <span className="text-sm font-medium text-primary">
                            -${Number(order.discountAmount).toFixed(2)}
                          </span>
                        </div>
                        <span className={`px-2.5 py-1 rounded-full text-xs font-medium whitespace-nowrap ${getStatusColor(status)}`}>
                          {status}
                        </span>
                        <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                      </div>
                    </div>
                  </Card>
                </Link>
              );
            })}
          </div>
        ) : (
          <Card className="p-8 rounded-2xl text-center relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-primary/5" />
            <div className="relative">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary to-primary/70 flex items-center justify-center mx-auto mb-4 shadow-lg shadow-primary/20">
                <ShoppingBag className="w-8 h-8 text-primary-foreground" />
              </div>
              <h3 className="font-semibold text-foreground mb-2">No orders yet</h3>
              <p className="text-sm text-muted-foreground">
                When you make a purchase with Spiral, it will appear here
              </p>
            </div>
          </Card>
        )}
      </main>
    </div>
  );
}
