import { Button } from "@/components/ui/button";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRoute, Link } from "wouter";
import { ArrowLeft, CheckCircle, Clock, Package, Instagram, Camera, Loader2, ShoppingBag } from "lucide-react";
import type { Order } from "@shared/schema";
import {
  parseLineItems,
  lineItemDisplayName,
  formatDiscountPercent,
  type LineItem,
} from "@/pages/Orders";

function LineItemThumb({ src, alt }: { src: string | null | undefined; alt: string }) {
  const [errored, setErrored] = useState(false);
  if (!src || errored) {
    return (
      <div
        className="w-12 h-12 rounded-md bg-gray-100 flex items-center justify-center flex-shrink-0"
        aria-label={`${alt} placeholder`}
      >
        <ShoppingBag className="w-5 h-5 text-gray-300" />
      </div>
    );
  }
  return (
    <img
      src={src}
      alt={alt}
      className="w-12 h-12 rounded-md object-cover bg-gray-100 flex-shrink-0"
      onError={() => setErrored(true)}
    />
  );
}

function LineItemRow({ item }: { item: LineItem }) {
  const name = lineItemDisplayName(item);
  const productUrl =
    typeof item.productUrl === "string" && /^https?:\/\//i.test(item.productUrl)
      ? item.productUrl
      : null;

  const inner = (
    <>
      <LineItemThumb src={item.imageUrl} alt={name} />
      <div className="flex-1 min-w-0 flex items-center justify-between gap-2">
        <p className="text-sm text-gray-900 truncate" data-testid={`text-line-item-name-${name}`}>
          {name}
        </p>
        {item.quantity > 1 && (
          <span className="text-sm text-gray-400 flex-shrink-0" data-testid={`text-line-item-qty-${name}`}>
            ×{item.quantity}
          </span>
        )}
      </div>
    </>
  );

  if (productUrl) {
    return (
      <a
        href={productUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-3 -mx-2 px-2 py-1 rounded-md hover-elevate active-elevate-2"
        data-testid={`link-line-item-${name}`}
      >
        {inner}
      </a>
    );
  }

  return (
    <div className="flex items-center gap-3" data-testid={`row-line-item-${name}`}>
      {inner}
    </div>
  );
}

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
      <div className="min-h-screen flex items-center justify-center bg-white">
        <Loader2 className="w-8 h-8 animate-spin text-[#4ECCA3]" />
      </div>
    );
  }

  if (!order) {
    return (
      <div className="min-h-screen safe-top bg-white">
        <header className="flex items-center px-4 h-14">
          <Link href="/discounts">
            <Button variant="ghost" size="icon" className="text-gray-500" data-testid="button-back">
              <ArrowLeft className="w-5 h-5" />
            </Button>
          </Link>
        </header>
        <div className="px-6 py-12 text-center">
          <p className="text-gray-400">Order not found</p>
        </div>
      </div>
    );
  }

  const status = getStatusLabel(order);
  const lineItems = parseLineItems(order.lineItems).filter((item) => lineItemDisplayName(item).length > 0);
  const percentLabel = formatDiscountPercent(order.discountPercent);

  const steps = [
    { id: "ordered", label: "Order placed", icon: Package, complete: true },
    { id: "shipped", label: "On the way", icon: Clock, complete: status !== "ordered" },
    { id: "delivered", label: "Delivered", icon: CheckCircle, complete: ["awaiting", "story_received", "verified"].includes(status) },
    { id: "verified", label: "Story verified", icon: CheckCircle, complete: status === "verified" || status === "story_received" },
  ];

  return (
    <div className="min-h-screen safe-top bg-white">
      <header className="flex items-center px-4 h-14 border-b border-gray-100">
        <Link href="/discounts">
          <Button variant="ghost" size="icon" className="text-gray-500" data-testid="button-back">
            <ArrowLeft className="w-5 h-5" />
          </Button>
        </Link>
        <h1 className="ml-2 text-lg font-bold text-gray-900">Order Details</h1>
      </header>

      <main className="px-6 pb-8 pt-6 space-y-6">
        <div className="p-5 rounded-2xl bg-gray-50 border border-gray-100">
          <div className="flex items-start justify-between mb-4">
            <div>
              <p className="text-sm text-gray-400">Order</p>
              <p className="text-lg font-bold text-gray-900" data-testid="text-order-id">
                #{order.shopifyOrderId.slice(-6)}
              </p>
            </div>
            <div className="text-right">
              <p className="text-sm text-gray-400">Your discount</p>
              <p className="text-lg font-bold text-green-700" data-testid="text-discount">
                -${Number(order.discountAmount).toFixed(2)}
              </p>
              {percentLabel && (
                <p className="text-xs text-green-700/80 mt-0.5" data-testid="text-discount-percent">
                  {percentLabel}
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-400">Order total</span>
            <span className="font-semibold text-gray-900" data-testid="text-order-total">
              ${Number(order.orderTotal).toFixed(2)}
            </span>
          </div>
        </div>

        {lineItems.length > 0 && (
          <div className="p-5 rounded-2xl bg-gray-50 border border-gray-100" data-testid="card-items">
            <h2 className="font-bold text-gray-900 mb-4">Items</h2>
            <div className="space-y-3">
              {lineItems.map((item, index) => (
                <LineItemRow key={`${lineItemDisplayName(item)}-${index}`} item={item} />
              ))}
            </div>
            <p className="text-xs text-gray-400 mt-4">
              Quantity shown reflects items discounted under your tier.
            </p>
          </div>
        )}

        <div className="p-5 rounded-2xl bg-gray-50 border border-gray-100">
          <h2 className="font-bold text-gray-900 mb-4">Order Progress</h2>
          <div className="space-y-4">
            {steps.map((step, index) => {
              const isLast = index === steps.length - 1;
              const Icon = step.icon;
              
              return (
                <div key={step.id} className="flex gap-3">
                  <div className="flex flex-col items-center">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                      step.complete 
                        ? "bg-[#4ECCA3]/10" 
                        : "bg-gray-100"
                    }`}>
                      <Icon className={`w-4 h-4 ${step.complete ? "text-[#4ECCA3]" : "text-gray-300"}`} />
                    </div>
                    {!isLast && (
                      <div className={`w-0.5 h-6 mt-1 ${step.complete ? "bg-[#4ECCA3]/20" : "bg-gray-100"}`} />
                    )}
                  </div>
                  <div className="flex-1 pb-2">
                    <p className={`font-medium ${step.complete ? "text-gray-900" : "text-gray-300"}`}>
                      {step.label}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {status === "awaiting" && (
          <div className="p-5 rounded-2xl bg-amber-50 border border-amber-200">
            <div className="flex items-start gap-4 mb-5">
              <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center flex-shrink-0">
                <Camera className="w-5 h-5 text-amber-600" />
              </div>
              <div>
                <h3 className="font-bold text-amber-900">
                  Post your Story to unlock your next discount
                </h3>
                <p className="text-sm text-amber-700 mt-1">
                  Until this is verified, you can't use Spiral on your next purchase.
                </p>
              </div>
            </div>
            
            <div className="bg-amber-100/60 rounded-xl p-4 space-y-3">
              <div className="flex items-center gap-2 text-sm text-amber-800">
                <Instagram className="w-4 h-4" />
                <span className="font-semibold">How to post:</span>
              </div>
              <ol className="text-sm text-amber-800 space-y-2 ml-6 list-decimal">
                <li>Take a photo or video of your purchase</li>
                <li>Add it to your Instagram Story</li>
                <li>Tag the brand using the @ mention sticker</li>
              </ol>
              <p className="text-xs text-amber-600 mt-2">
                We'll verify your story automatically once you tag the brand
              </p>
            </div>
          </div>
        )}

        {status === "story_received" && (
          <div className="p-5 rounded-2xl bg-blue-50 border border-blue-200">
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center flex-shrink-0">
                <CheckCircle className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <h3 className="font-bold text-blue-900">
                  Story received
                </h3>
                <p className="text-sm text-blue-700 mt-1">
                  We detected your story mention and are processing your verification
                </p>
              </div>
            </div>
          </div>
        )}

        {status === "verified" && (
          <div className="p-5 rounded-2xl bg-green-50 border border-green-200">
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-xl bg-green-100 flex items-center justify-center flex-shrink-0">
                <CheckCircle className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <h3 className="font-bold text-green-900">
                  You saved ${Number(order.discountAmount).toFixed(2)}!
                </h3>
                <p className="text-sm text-green-700 mt-1">
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
