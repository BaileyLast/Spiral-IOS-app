import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useQuery } from "@tanstack/react-query";
import { useRoute, Link } from "wouter";
import { ArrowLeft, CheckCircle, Clock, Package, Instagram, AlertCircle, Camera, Loader2 } from "lucide-react";
import type { Order } from "@shared/schema";

function getStatusLabel(order: Order) {
  if (order.verificationStatus === "verified") return "verified";
  if (order.verificationStatus === "failed") return "reversed";
  if (order.status === "delivered") return "awaiting";
  if (order.status === "fulfilled") return "shipped";
  return "ordered";
}

function formatDeadline(deadline: Date | string | null) {
  if (!deadline) return null;
  const date = new Date(deadline);
  const now = new Date();
  const diff = date.getTime() - now.getTime();
  
  if (diff < 0) return { text: "Deadline passed", urgent: true };
  
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  
  if (days > 1) return { text: `${days} days left`, urgent: false };
  if (days === 1) return { text: `${days} day ${hours}h left`, urgent: false };
  if (hours > 0) return { text: `${hours} hours left`, urgent: true };
  return { text: "Less than 1 hour left", urgent: true };
}

export default function OrderDetail() {
  const [, params] = useRoute("/orders/:id");
  const orderId = params?.id;

  const { data: order, isLoading } = useQuery<Order>({
    queryKey: ["/api/customer/orders", orderId],
    enabled: !!orderId,
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!order) {
    return (
      <div className="min-h-screen bg-background safe-top">
        <header className="flex items-center px-4 h-14">
          <Link href="/orders">
            <Button variant="ghost" size="icon" data-testid="button-back">
              <ArrowLeft className="w-5 h-5" />
            </Button>
          </Link>
        </header>
        <div className="px-6 py-12 text-center">
          <p className="text-muted-foreground">Order not found</p>
        </div>
      </div>
    );
  }

  const status = getStatusLabel(order);
  const deadline = status === "awaiting" ? formatDeadline(order.postDeadline) : null;

  const steps = [
    { id: "ordered", label: "Order placed", icon: Package, complete: true },
    { id: "shipped", label: "On the way", icon: Clock, complete: status !== "ordered" },
    { id: "delivered", label: "Delivered", icon: CheckCircle, complete: ["awaiting", "verified", "reversed"].includes(status) },
    { id: "verified", label: "Verified", icon: CheckCircle, complete: status === "verified", failed: status === "reversed" },
  ];

  return (
    <div className="min-h-screen bg-background safe-top">
      <header className="flex items-center px-4 h-14">
        <Link href="/orders">
          <Button variant="ghost" size="icon" data-testid="button-back">
            <ArrowLeft className="w-5 h-5" />
          </Button>
        </Link>
        <h1 className="ml-2 text-lg font-medium">Order Details</h1>
      </header>

      <main className="px-6 pb-8 space-y-6">
        <Card className="p-5 rounded-2xl">
          <div className="flex items-start justify-between mb-4">
            <div>
              <p className="text-sm text-muted-foreground">Order</p>
              <p className="text-lg font-semibold text-foreground" data-testid="text-order-id">
                #{order.shopifyOrderId.slice(-6)}
              </p>
            </div>
            <div className="text-right">
              <p className="text-sm text-muted-foreground">Your discount</p>
              <p className="text-lg font-semibold text-primary" data-testid="text-discount">
                -${Number(order.discountAmount).toFixed(2)}
              </p>
            </div>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Order total</span>
            <span className="font-medium text-foreground" data-testid="text-order-total">
              ${Number(order.orderTotal).toFixed(2)}
            </span>
          </div>
        </Card>

        <Card className="p-5 rounded-2xl">
          <h2 className="font-semibold text-foreground mb-4">Order Progress</h2>
          <div className="space-y-4">
            {steps.map((step, index) => {
              const isLast = index === steps.length - 1;
              const Icon = step.icon;
              
              return (
                <div key={step.id} className="flex gap-3">
                  <div className="flex flex-col items-center">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                      step.failed 
                        ? "bg-[hsl(var(--status-failed))]" 
                        : step.complete 
                          ? "bg-primary" 
                          : "bg-muted"
                    }`}>
                      {step.failed ? (
                        <AlertCircle className="w-4 h-4 text-[hsl(var(--status-failed-foreground))]" />
                      ) : (
                        <Icon className={`w-4 h-4 ${step.complete ? "text-primary-foreground" : "text-muted-foreground"}`} />
                      )}
                    </div>
                    {!isLast && (
                      <div className={`w-0.5 h-6 mt-1 ${step.complete ? "bg-primary" : "bg-muted"}`} />
                    )}
                  </div>
                  <div className="flex-1 pb-2">
                    <p className={`font-medium ${step.failed ? "text-[hsl(var(--status-failed-foreground))]" : step.complete ? "text-foreground" : "text-muted-foreground"}`}>
                      {step.failed ? "Discount reversed" : step.label}
                    </p>
                    {step.id === "verified" && status === "awaiting" && deadline && (
                      <p className={`text-sm mt-0.5 ${deadline.urgent ? "text-[hsl(var(--status-awaiting-foreground))] font-medium" : "text-muted-foreground"}`}>
                        {deadline.text}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        {status === "awaiting" && (
          <Card className="p-5 rounded-2xl bg-[hsl(var(--status-awaiting))] border-0">
            <div className="flex items-start gap-4 mb-5">
              <div className="w-10 h-10 rounded-xl bg-white/30 flex items-center justify-center flex-shrink-0">
                <Camera className="w-5 h-5 text-[hsl(var(--status-awaiting-foreground))]" />
              </div>
              <div>
                <h3 className="font-semibold text-[hsl(var(--status-awaiting-foreground))]">
                  Share to keep your discount
                </h3>
                <p className="text-sm text-[hsl(var(--status-awaiting-foreground))] opacity-80 mt-1">
                  Post an Instagram Story featuring your purchase and tag the brand
                </p>
              </div>
            </div>
            
            <div className="bg-white/20 rounded-xl p-4 space-y-3">
              <div className="flex items-center gap-2 text-sm text-[hsl(var(--status-awaiting-foreground))]">
                <Instagram className="w-4 h-4" />
                <span className="font-medium">How to post:</span>
              </div>
              <ol className="text-sm text-[hsl(var(--status-awaiting-foreground))] space-y-2 ml-6 list-decimal">
                <li>Take a photo or video of your purchase</li>
                <li>Add it to your Instagram Story</li>
                <li>Tag the brand in your story</li>
                <li>Keep it up for 24 hours</li>
              </ol>
            </div>
          </Card>
        )}

        {status === "verified" && (
          <Card className="p-5 rounded-2xl bg-[hsl(var(--status-verified))] border-0">
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-xl bg-white/30 flex items-center justify-center flex-shrink-0">
                <CheckCircle className="w-5 h-5 text-[hsl(var(--status-verified-foreground))]" />
              </div>
              <div>
                <h3 className="font-semibold text-[hsl(var(--status-verified-foreground))]">
                  You saved ${Number(order.discountAmount).toFixed(2)}!
                </h3>
                <p className="text-sm text-[hsl(var(--status-verified-foreground))] opacity-80 mt-1">
                  Your story was verified and your discount is confirmed
                </p>
              </div>
            </div>
          </Card>
        )}

        {status === "reversed" && (
          <Card className="p-5 rounded-2xl bg-[hsl(var(--status-failed))] border-0">
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-xl bg-white/30 flex items-center justify-center flex-shrink-0">
                <AlertCircle className="w-5 h-5 text-[hsl(var(--status-failed-foreground))]" />
              </div>
              <div>
                <h3 className="font-semibold text-[hsl(var(--status-failed-foreground))]">
                  Discount was reversed
                </h3>
                <p className="text-sm text-[hsl(var(--status-failed-foreground))] opacity-80 mt-1">
                  We couldn't verify your story within the posting window. The discount amount will be charged to your original payment method.
                </p>
              </div>
            </div>
          </Card>
        )}
      </main>
    </div>
  );
}
