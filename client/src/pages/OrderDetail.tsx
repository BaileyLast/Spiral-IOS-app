import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRoute, Link } from "wouter";
import {
  ArrowLeft,
  CheckCircle,
  Clock,
  Package,
  Instagram,
  Lock,
  Loader2,
  ShoppingBag,
  Store,
  ShieldCheck,
} from "lucide-react";
import type { Order } from "@shared/schema";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  parseLineItems,
  lineItemDisplayName,
  formatDiscountPercent,
  MOCK_ACTIVE,
  MOCK_HISTORY,
  type LineItem,
} from "@/pages/Orders";

// Brand @handle: always bold + underlined, click to copy with toast.
// Used everywhere we show the merchant's Instagram handle so it's both
// visually distinct against any background and trivially copyable.
function BrandHandle({ handle, className = "" }: { handle: string; className?: string }) {
  const { toast } = useToast();
  const display = `@${handle.replace(/^@/, "")}`;
  const onCopy = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(display);
      toast({ title: "Copied", description: `${display} copied to clipboard.` });
    } catch {
      toast({ title: "Couldn't copy", description: "Please try again.", variant: "destructive" });
    }
  };
  return (
    <button
      type="button"
      onClick={onCopy}
      className={`font-bold underline underline-offset-2 hover:opacity-80 active:opacity-70 ${className}`}
      data-testid="button-copy-brand-handle"
    >
      {display}
    </button>
  );
}

function getStatusLabel(order: Order) {
  if (order.verificationStatus === "verified") return "verified";
  if (order.verificationStatus === "quick_verified") return "quick_verified";
  if (order.verificationStatus === "not_public") return "not_public";
  if (order.verificationStatus === "taken_down_early") return "taken_down_early";
  if (order.verificationStatus === "awaiting_review") return "awaiting_review";
  if (order.verificationStatus === "story_detected") return "story_received";
  if (order.status === "delivered") return "awaiting";
  if (order.status === "fulfilled") return "shipped";
  return "ordered";
}

export default function OrderDetail() {
  const [, params] = useRoute("/orders/:id");
  const orderId = params?.id;
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const isMock = !!orderId && orderId.startsWith("mock-") && import.meta.env.DEV;
  const mockOrder = isMock
    ? [...MOCK_ACTIVE, ...MOCK_HISTORY].find((m) => m.id === orderId)
    : undefined;

  const { data: queryOrder, isLoading: queryLoading } = useQuery<Order>({
    queryKey: ["/api/customer/orders", orderId],
    enabled: !!orderId && !isMock,
  });

  const order = isMock ? mockOrder : queryOrder;
  const isLoading = isMock ? false : queryLoading;

  const markReceivedMutation = useMutation({
    mutationFn: async () => {
      if (isMock) {
        await new Promise((resolve) => setTimeout(resolve, 400));
        return;
      }
      await apiRequest("POST", `/api/customer/orders/${orderId}/mark-received`);
    },
    onSuccess: () => {
      if (!isMock) {
        queryClient.invalidateQueries({ queryKey: ["/api/customer/orders", orderId] });
        queryClient.invalidateQueries({ queryKey: ["/api/customer/orders"] });
      }
      toast({
        title: "Thanks!",
        description: isMock
          ? "Preview only — no real order was updated."
          : "We've marked your order as received.",
      });
    },
    onError: () => {
      toast({
        title: "Couldn't confirm",
        description: "Please try again in a moment.",
        variant: "destructive",
      });
    },
  });

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-warm">
        <Loader2 className="w-8 h-8 animate-spin text-[#4ECCA3]" />
      </div>
    );
  }

  if (!order) {
    return (
      <div className="min-h-screen safe-top bg-warm">
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
  const isPickup = !!order.readyForPickupAt || order.shopifyTrackingStatus === "ready_for_pickup";
  const awaitingPickup = order.shopifyTrackingStatus === "ready_for_pickup" && order.status !== "delivered";
  const rawHandle = (order.merchantInstagramHandle || "").replace(/^@/, "");
  const orderNumber = order.shopifyOrderId.slice(-4);

  // Journey middle-step label is dynamic per delivery mode.
  // Pickup journey: Order placed → Almost ready → Ready for pickup (→ Collected) → Post a story
  // Shipping journey: Order placed → On the way / In transit / Out for delivery → Delivered → Post a story
  const middleLabel = (() => {
    if (isPickup) {
      // Once the order is ready_for_pickup we show "Ready for pickup" on step 2;
      // before that (just fulfilled, not yet at the store), show "Almost ready".
      return order.shopifyTrackingStatus === "ready_for_pickup" ? "Ready for pickup" : "Almost ready";
    }
    switch (order.shopifyTrackingStatus) {
      case "out_for_delivery": return "Out for delivery";
      case "in_transit": return "In transit";
      default: return "On the way";
    }
  })();

  const storyComplete = status === "verified";
  const steps = [
    { id: "ordered", label: "Order placed", icon: Package, complete: true },
    { id: "shipped", label: middleLabel, icon: isPickup ? Store : Clock, complete: status !== "ordered" },
    { id: "delivered", label: isPickup ? "Collected" : "Delivered", icon: CheckCircle, complete: ["awaiting", "story_received", "awaiting_review", "quick_verified", "not_public", "taken_down_early", "verified"].includes(status) },
    { id: "verified", label: storyComplete ? "Story posted" : "Post a story", icon: CheckCircle, complete: storyComplete },
  ];

  return (
    <div className="min-h-screen safe-top bg-warm pb-12">
      <header className="px-4 py-4 flex items-center">
        <Link href="/discounts">
          <button
            className="w-10 h-10 rounded-full bg-white shadow-sm flex items-center justify-center hover-elevate"
            data-testid="button-back"
            aria-label="Back"
          >
            <ArrowLeft className="w-5 h-5 text-gray-900" />
          </button>
        </Link>
      </header>

      <main className="px-5 mt-4 space-y-6">
        {/* Status hero — what to do right now */}
        {awaitingPickup && (
          <div className="creator-card p-5 bg-indigo-50 border border-indigo-200" data-testid="card-ready-for-pickup">
            <div className="flex items-start gap-4 mb-4">
              <div className="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center flex-shrink-0">
                <Store className="w-5 h-5 text-indigo-600" />
              </div>
              <div>
                <h3 className="font-black text-indigo-900 text-base">
                  Your order is ready to pick up
                </h3>
                <p className="text-sm text-indigo-700 mt-1">
                  Once you've grabbed it, tap below to unlock your Story step.
                </p>
              </div>
            </div>
            <button
              className="tactile-btn w-full py-4 text-base bg-indigo-600 shadow-[0_4px_12px_rgba(79,70,229,0.3),inset_0_-4px_0_rgba(0,0,0,0.1)]"
              onClick={() => markReceivedMutation.mutate()}
              disabled={markReceivedMutation.isPending}
              data-testid="button-mark-collected"
            >
              {markReceivedMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin mx-auto" />
              ) : (
                "I've collected it"
              )}
            </button>
          </div>
        )}

        {status === "awaiting" && (
          <div className="creator-card story-bg-gradient p-6 text-white text-center relative overflow-hidden" data-testid="card-post-story">
            <div className="relative z-10 flex flex-col items-center">
              <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center text-[#4ECCA3] shadow-lg mb-4">
                <Instagram className="w-8 h-8" />
              </div>
              <h2 className="text-2xl font-black mb-2 leading-tight">
                Post your Story,<br />unlock your next discount.
              </h2>
              <p className="text-[#E6F8F0] font-medium text-sm mb-6 max-w-[260px]">
                Showcase your new purchase and tag {rawHandle ? <BrandHandle handle={rawHandle} /> : "the brand"} in a public Story to unlock more discounts from your favourite stores.
              </p>

              {rawHandle ? (
                <a
                  href={`https://instagram.com/${rawHandle}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="tactile-btn bg-white text-[#4ECCA3] w-full py-4 text-lg shadow-[0_4px_12px_rgba(0,0,0,0.1),inset_0_-4px_0_rgba(240,240,240,1)] text-center"
                  data-testid="link-merchant-handle"
                >
                  Open Instagram
                </a>
              ) : (
                <span className="tactile-btn bg-white text-[#4ECCA3] w-full py-4 text-lg shadow-[0_4px_12px_rgba(0,0,0,0.1),inset_0_-4px_0_rgba(240,240,240,1)] text-center">
                  Post Story Now
                </span>
              )}

              <ul className="mt-4 text-[#E6F8F0] text-xs font-medium bg-black/10 px-4 py-3 rounded-2xl space-y-1.5 text-left w-full max-w-[280px]">
                <li className="flex items-start gap-2">
                  <ShieldCheck className="w-4 h-4 mt-0.5 flex-shrink-0" />
                  <span>Public Story (not Close Friends)</span>
                </li>
                <li className="flex items-start gap-2">
                  <ShieldCheck className="w-4 h-4 mt-0.5 flex-shrink-0" />
                  <span>
                    {rawHandle ? <BrandHandle handle={rawHandle} /> : "@brand"} must be clearly visible
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <ShieldCheck className="w-4 h-4 mt-0.5 flex-shrink-0" />
                  <span>Stays up for 24 hours</span>
                </li>
              </ul>
            </div>
          </div>
        )}

        {(status === "story_received" || status === "awaiting_review") && (
          <div className="creator-card p-5 bg-blue-50 border border-blue-200">
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center flex-shrink-0">
                <Clock className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <h3 className="font-black text-blue-900 text-base" data-testid="text-awaiting-review-heading">
                  Story received — confirming shortly
                </h3>
                <p className="text-sm text-blue-700 mt-1" data-testid="text-awaiting-review-body">
                  We'll confirm your discount once your Story has been live for a few hours. Stories must be public — Close Friends posts won't count.
                </p>
              </div>
            </div>
          </div>
        )}

        {status === "quick_verified" && (
          <div className="flex items-center gap-2 px-1" data-testid="card-quick-verified">
            <CheckCircle className="w-4 h-4 text-green-600 flex-shrink-0" />
            <p className="text-sm text-gray-600" data-testid="text-quick-verified-heading">
              Story confirmed
            </p>
          </div>
        )}

        {(status === "not_public" || status === "taken_down_early") && (
          <div className="creator-card p-5 text-white bg-gradient-to-br from-[#FB923C] to-[#EA580C]" data-testid={`card-${status}`}>
            <div className="flex items-start gap-4 mb-4">
              <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center flex-shrink-0 shadow-lg text-[#EA580C]">
                <Lock className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-black text-white text-base" data-testid={`text-${status}-heading`}>
                  {status === "not_public"
                    ? "Your Story came through, but we couldn't confirm it"
                    : "Your Story came down too early"}
                </h3>
                <p className="text-sm text-orange-50 font-medium mt-1" data-testid={`text-${status}-body`}>
                  {status === "not_public"
                    ? "We picked up your Story, but couldn't see it publicly. Stories must be public and up for 24 hours."
                    : "Spiral Stories need to stay up for 24 hours. Repost publicly and tag the brand to unlock your next discount."}
                </p>
              </div>
            </div>
            {rawHandle ? (
              <a
                href={`https://instagram.com/${rawHandle}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center w-full rounded-full bg-white text-[#EA580C] font-bold py-4 text-lg shadow-[0_4px_12px_rgba(0,0,0,0.12)] active:opacity-90 transition-opacity"
                data-testid="link-repost-instagram"
              >
                Repost story
              </a>
            ) : (
              <span className="flex items-center justify-center w-full rounded-full bg-white text-[#EA580C] font-bold py-4 text-lg shadow-[0_4px_12px_rgba(0,0,0,0.12)]">
                Repost story
              </span>
            )}

            <ul className="mt-4 text-orange-50 text-xs font-medium bg-black/10 px-4 py-3 rounded-2xl space-y-1.5 text-left w-full">
              <li className="flex items-start gap-2">
                <ShieldCheck className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <span>Public Story (not Close Friends)</span>
              </li>
              <li className="flex items-start gap-2">
                <ShieldCheck className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <span>
                  {rawHandle ? <BrandHandle handle={rawHandle} /> : "@brand"} must be clearly visible
                </span>
              </li>
              <li className="flex items-start gap-2">
                <ShieldCheck className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <span>Stays up for 24 hours</span>
              </li>
            </ul>
          </div>
        )}

        {(status === "ordered" || status === "shipped") && !awaitingPickup && (
          <div data-testid="section-mark-received">
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="outline"
                  className="w-full rounded-full h-12 text-sm font-bold"
                  disabled={markReceivedMutation.isPending}
                  data-testid="button-mark-received"
                >
                  {markReceivedMutation.isPending ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    "I've received this order"
                  )}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Confirm you've received it?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Once you've got it, post an Instagram Story tagging{" "}
                    {rawHandle ? <BrandHandle handle={rawHandle} /> : "the brand"}{" "}
                    to unlock your next discount.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel data-testid="button-mark-received-cancel">Not yet</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => markReceivedMutation.mutate()}
                    data-testid="button-mark-received-confirm"
                  >
                    Yes, I have it
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
            <p className="text-xs text-gray-400 text-center mt-2">
              Only tap once the order is in your hands.
            </p>
          </div>
        )}

        {/* PRODUCTS */}
        {lineItems.length > 0 && (
          <div className="creator-card p-5" data-testid="card-items">
            <div className="flex justify-between items-end mb-4 gap-3">
              <div className="min-w-0">
                <h3 className="font-black text-lg text-gray-900">Items</h3>
                <p
                  className="text-xs font-bold text-gray-400 mt-0.5 truncate"
                  data-testid="text-order-id"
                >
                  Order #{orderNumber}
                </p>
              </div>
              <span className="text-sm font-bold text-gray-400 whitespace-nowrap">{lineItems.length} item{lineItems.length === 1 ? "" : "s"}</span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {lineItems.map((item, i) => {
                const name = lineItemDisplayName(item);
                const productUrl =
                  typeof item.productUrl === "string" && /^https?:\/\//i.test(item.productUrl)
                    ? item.productUrl
                    : null;
                const card = (
                  <div className="relative rounded-2xl overflow-hidden bg-gray-100 aspect-[4/5]">
                    {item.imageUrl ? (
                      <img
                        src={item.imageUrl}
                        alt={name}
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = "none";
                        }}
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100">
                        <ShoppingBag className="w-8 h-8 text-gray-300" />
                      </div>
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
                    <div className="absolute bottom-3 left-3 right-3">
                      <p
                        className="text-white font-bold text-sm leading-tight line-clamp-2 mb-1"
                        data-testid={`text-line-item-name-${name}`}
                      >
                        {name}
                      </p>
                      {item.quantity > 1 && (
                        <p
                          className="text-white/80 text-xs font-medium"
                          data-testid={`text-line-item-qty-${name}`}
                        >
                          Qty: {item.quantity}
                        </p>
                      )}
                    </div>
                  </div>
                );
                if (productUrl) {
                  return (
                    <a
                      key={`${name}-${i}`}
                      href={productUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      data-testid={`link-line-item-${name}`}
                    >
                      {card}
                    </a>
                  );
                }
                return (
                  <div key={`${name}-${i}`} data-testid={`row-line-item-${name}`}>
                    {card}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* SAVINGS SUMMARY */}
        <div className="creator-card p-5 !bg-gray-900 text-white">
          <h3 className="font-black text-lg mb-4">Summary</h3>

          <div className="space-y-3 mb-5 border-b border-gray-800 pb-5">
            <div className="flex justify-between text-sm">
              <span className="text-gray-400 font-medium">Subtotal</span>
              <span className="font-bold" data-testid="text-order-total">
                ${Number(order.orderTotal).toFixed(2)}
              </span>
            </div>
            <div className="flex justify-between items-center text-sm gap-3">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-[#A8F0D1] font-bold">Spiral Discount</span>
                {percentLabel && (
                  <span
                    className="bg-[#4ECCA3]/20 text-[#A8F0D1] text-[10px] px-2 py-0.5 rounded-full font-black uppercase whitespace-nowrap"
                    data-testid="text-discount-percent"
                  >
                    {percentLabel}
                  </span>
                )}
              </div>
              <span className="font-bold text-[#A8F0D1]" data-testid="text-discount">
                -${Number(order.discountAmount).toFixed(2)}
              </span>
            </div>
            {Number(order.shippingAmount ?? 0) > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-gray-400 font-medium">Shipping</span>
                <span className="font-bold" data-testid="text-shipping">
                  ${Number(order.shippingAmount).toFixed(2)}
                </span>
              </div>
            )}
          </div>

          <div className="flex justify-between items-center">
            <span className="text-sm text-gray-400 font-medium">Total Paid</span>
            <span className="text-2xl font-black">
              ${(Number(order.orderTotal) + Number(order.shippingAmount ?? 0) - Number(order.discountAmount)).toFixed(2)}
            </span>
          </div>
        </div>

        {/* JOURNEY */}
        <div className="px-2">
          <h3 className="font-black text-gray-900 mb-4 ml-1 text-lg">Journey</h3>
          <div className="space-y-0 relative before:absolute before:inset-y-2 before:left-[15px] before:w-[2px] before:bg-gray-200">
            {steps.map((step, index) => {
              const isLast = index === steps.length - 1;
              const Icon = step.icon;
              const isVerifiedStep = step.id === "verified";
              const deliveredComplete = steps[2]?.complete ?? false;
              const teaseGoal = isVerifiedStep && deliveredComplete && !step.complete;
              const isPostStoryStep = isVerifiedStep && !step.complete;
              return (
                <div key={step.id} className={`flex gap-4 relative z-10 ${isLast ? "" : "pb-6"}`}>
                  <div className="relative shrink-0">
                    {teaseGoal && (
                      <span
                        aria-hidden="true"
                        className="absolute inset-0 rounded-full bg-[#4ECCA3]/30 animate-[ping_2.4s_cubic-bezier(0,0,0.2,1)_infinite]"
                      />
                    )}
                    <div
                      className={`relative w-8 h-8 rounded-full border-4 border-[#FCFCFB] flex items-center justify-center ${
                        step.complete ? "bg-[#4ECCA3] text-white" : teaseGoal ? "bg-[#4ECCA3]/30 text-white" : "bg-gray-200 text-transparent"
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                    </div>
                  </div>
                  <div className={`pt-1 ${step.complete || isPostStoryStep ? "" : "opacity-50"}`}>
                    {isPostStoryStep ? (
                      <button
                        type="button"
                        onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
                        className="font-bold text-gray-900 text-sm underline underline-offset-2 hover:opacity-80 active:opacity-70 text-left"
                        data-testid="button-post-story-scroll-top"
                      >
                        {step.label}
                      </button>
                    ) : (
                      <p className="font-bold text-gray-900 text-sm">{step.label}</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </main>
    </div>
  );
}
