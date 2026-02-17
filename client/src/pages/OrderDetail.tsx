import { Button } from "@/components/ui/button";
import { useQuery } from "@tanstack/react-query";
import { useRoute, Link } from "wouter";
import { ArrowLeft, CheckCircle, Clock, Package, Instagram, Camera, Loader2 } from "lucide-react";
import type { Order } from "@shared/schema";

function getStatusLabel(order: Order) {
  if (order.verificationStatus === "verified") return "verified";
  if (order.verificationStatus === "story_detected") return "story_received";
  if (order.status === "delivered") return "awaiting";
  if (order.status === "fulfilled") return "shipped";
  return "ordered";
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
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-white/50" />
      </div>
    );
  }

  if (!order) {
    return (
      <div className="min-h-screen safe-top">
        <header className="flex items-center px-4 h-14">
          <Link href="/discounts">
            <Button variant="ghost" size="icon" className="text-white/70" data-testid="button-back">
              <ArrowLeft className="w-5 h-5" />
            </Button>
          </Link>
        </header>
        <div className="px-6 py-12 text-center">
          <p className="text-white/50">Order not found</p>
        </div>
      </div>
    );
  }

  const status = getStatusLabel(order);

  const steps = [
    { id: "ordered", label: "Order placed", icon: Package, complete: true },
    { id: "shipped", label: "On the way", icon: Clock, complete: status !== "ordered" },
    { id: "delivered", label: "Delivered", icon: CheckCircle, complete: ["awaiting", "story_received", "verified"].includes(status) },
    { id: "verified", label: "Story verified", icon: CheckCircle, complete: status === "verified" || status === "story_received" },
  ];

  return (
    <div className="min-h-screen safe-top">
      <header className="flex items-center px-4 h-14">
        <Link href="/discounts">
          <Button variant="ghost" size="icon" className="text-white/70" data-testid="button-back">
            <ArrowLeft className="w-5 h-5" />
          </Button>
        </Link>
        <h1 className="ml-2 text-lg font-medium text-white">Order Details</h1>
      </header>

      <main className="px-6 pb-8 space-y-6">
        <div className="p-5 rounded-2xl bg-white/10 backdrop-blur-sm border border-white/10">
          <div className="flex items-start justify-between mb-4">
            <div>
              <p className="text-sm text-white/50">Order</p>
              <p className="text-lg font-semibold text-white" data-testid="text-order-id">
                #{order.shopifyOrderId.slice(-6)}
              </p>
            </div>
            <div className="text-right">
              <p className="text-sm text-white/50">Your discount</p>
              <p className="text-lg font-semibold text-green-300" data-testid="text-discount">
                -${Number(order.discountAmount).toFixed(2)}
              </p>
            </div>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-white/50">Order total</span>
            <span className="font-medium text-white" data-testid="text-order-total">
              ${Number(order.orderTotal).toFixed(2)}
            </span>
          </div>
        </div>

        <div className="p-5 rounded-2xl bg-white/10 backdrop-blur-sm border border-white/10">
          <h2 className="font-semibold text-white mb-4">Order Progress</h2>
          <div className="space-y-4">
            {steps.map((step, index) => {
              const isLast = index === steps.length - 1;
              const Icon = step.icon;
              
              return (
                <div key={step.id} className="flex gap-3">
                  <div className="flex flex-col items-center">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                      step.complete 
                        ? "bg-white/20" 
                        : "bg-white/5"
                    }`}>
                      <Icon className={`w-4 h-4 ${step.complete ? "text-white" : "text-white/30"}`} />
                    </div>
                    {!isLast && (
                      <div className={`w-0.5 h-6 mt-1 ${step.complete ? "bg-white/20" : "bg-white/5"}`} />
                    )}
                  </div>
                  <div className="flex-1 pb-2">
                    <p className={`font-medium ${step.complete ? "text-white" : "text-white/40"}`}>
                      {step.label}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {status === "awaiting" && (
          <div className="p-5 rounded-2xl bg-amber-500/15 backdrop-blur-sm border border-amber-400/20">
            <div className="flex items-start gap-4 mb-5">
              <div className="w-10 h-10 rounded-xl bg-amber-500/20 flex items-center justify-center flex-shrink-0">
                <Camera className="w-5 h-5 text-amber-300" />
              </div>
              <div>
                <h3 className="font-semibold text-amber-200">
                  Share to keep your discount
                </h3>
                <p className="text-sm text-amber-300/70 mt-1">
                  Post an Instagram Story tagging the brand to confirm your discount
                </p>
              </div>
            </div>
            
            <div className="bg-white/10 rounded-xl p-4 space-y-3">
              <div className="flex items-center gap-2 text-sm text-amber-200">
                <Instagram className="w-4 h-4" />
                <span className="font-medium">How to post:</span>
              </div>
              <ol className="text-sm text-amber-200/80 space-y-2 ml-6 list-decimal">
                <li>Take a photo or video of your purchase</li>
                <li>Add it to your Instagram Story</li>
                <li>Tag the brand using the @ mention sticker</li>
              </ol>
              <p className="text-xs text-amber-300/50 mt-2">
                We'll verify your story automatically once you tag the brand
              </p>
            </div>
          </div>
        )}

        {status === "story_received" && (
          <div className="p-5 rounded-2xl bg-blue-500/15 backdrop-blur-sm border border-blue-400/20">
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-xl bg-blue-500/20 flex items-center justify-center flex-shrink-0">
                <CheckCircle className="w-5 h-5 text-blue-300" />
              </div>
              <div>
                <h3 className="font-semibold text-blue-200">
                  Story received
                </h3>
                <p className="text-sm text-blue-300/70 mt-1">
                  We detected your story mention and are processing your verification
                </p>
              </div>
            </div>
          </div>
        )}

        {status === "verified" && (
          <div className="p-5 rounded-2xl bg-green-500/15 backdrop-blur-sm border border-green-400/20">
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-xl bg-green-500/20 flex items-center justify-center flex-shrink-0">
                <CheckCircle className="w-5 h-5 text-green-300" />
              </div>
              <div>
                <h3 className="font-semibold text-green-200">
                  You saved ${Number(order.discountAmount).toFixed(2)}!
                </h3>
                <p className="text-sm text-green-300/70 mt-1">
                  Your story was verified and your discount is confirmed
                </p>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
