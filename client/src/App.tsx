import { useEffect } from "react";
import { Switch, Route, useLocation } from "wouter";
import { queryClient, apiRequest } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Home, Store, Percent, User } from "lucide-react";
import { Link } from "wouter";
import Login from "@/pages/Login";
import VerifyEmail from "@/pages/VerifyEmail";
import InstagramConnect from "@/pages/InstagramConnect";
import InstagramHelp from "@/pages/InstagramHelp";
import Orders from "@/pages/Orders";
import OrderDetail from "@/pages/OrderDetail";
import Profile from "@/pages/Profile";
import Marketplace from "@/pages/Marketplace";
import MerchantProducts from "@/pages/MerchantProducts";
import CustomerHome from "@/pages/CustomerHome";
import ManageAccount from "@/pages/ManageAccount";
import Privacy from "@/pages/Privacy";
import DataDeletion from "@/pages/DataDeletion";
import EmailFailures from "@/pages/EmailFailures";

function BottomNav() {
  const [location] = useLocation();
  
  const navItems = [
    { path: "/home", icon: Home, label: "Home" },
    { path: "/marketplace", icon: Store, label: "Marketplace" },
    { path: "/discounts", icon: Percent, label: "Discounts" },
    { path: "/profile", icon: User, label: "Profile" },
  ];

  const isActive = (path: string) => {
    if (path === "/discounts") {
      return location === "/discounts" || location.startsWith("/orders/");
    }
    if (path === "/marketplace") {
      return location === "/marketplace" || location.startsWith("/marketplace/");
    }
    return location === path;
  };

  return (
    <nav className="fixed left-0 right-0 z-50 px-4 bottom-4" style={{ bottom: 'max(1rem, env(safe-area-inset-bottom))' }}>
      <div className="max-w-md mx-auto bg-white/90 backdrop-blur-md rounded-full shadow-[0_8px_32px_rgba(0,0,0,0.08),0_2px_8px_rgba(0,0,0,0.04)] border border-white/60 flex items-center justify-around h-16 px-2">
        {navItems.map((item) => {
          const active = isActive(item.path);
          return (
            <Link key={item.path} href={item.path}>
              <button
                className={`relative flex items-center gap-2 px-4 h-11 rounded-full transition-all ${
                  active
                    ? "bg-[#4ECCA3] text-white shadow-[0_4px_12px_rgba(78,204,163,0.3)]"
                    : "text-gray-400"
                }`}
                data-testid={`nav-${item.label.toLowerCase()}`}
              >
                <item.icon className={`w-5 h-5 ${active ? "stroke-[2.5]" : "stroke-[2]"}`} />
                {active && (
                  <span className="text-sm font-bold">{item.label}</span>
                )}
              </button>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={Login} />
      <Route path="/login" component={Login} />
      <Route path="/verify-email" component={VerifyEmail} />
      <Route path="/connect-instagram" component={InstagramConnect} />
      <Route path="/instagram-help" component={InstagramHelp} />
      <Route path="/home" component={CustomerHome} />
      <Route path="/marketplace" component={Marketplace} />
      <Route path="/marketplace/:brandId" component={MerchantProducts} />
      <Route path="/discounts" component={Orders} />
      <Route path="/orders/:id" component={OrderDetail} />
      <Route path="/profile" component={Profile} />
      <Route path="/manage-account" component={ManageAccount} />
      <Route path="/privacy" component={Privacy} />
      <Route path="/data-deletion" component={DataDeletion} />
      <Route path="/admin/email-failures" component={EmailFailures} />
    </Switch>
  );
}

function AppContent() {
  const [location] = useLocation();
  
  const hideBottomNav = location === "/" || location === "/login" || location === "/verify-email" || location === "/connect-instagram" || location === "/instagram-help" || location === "/privacy" || location === "/data-deletion" || location === "/manage-account" || location.startsWith("/admin/");
  
  return (
    <div className="min-h-screen bg-white">
      <main className={hideBottomNav ? "" : "pb-20"}>
        <Router />
      </main>
      {!hideBottomNav && <BottomNav />}
    </div>
  );
}

// Registers the iOS APNs device token with the backend on app launch. The native iOS shell
// is expected to expose `window.spiralPushToken` (set before the WebView loads) and/or to
// invoke `window.spiralRegisterPushToken(token)` after permission is granted. Web-only sessions
// quietly no-op. The companion logout flow (Profile.tsx) clears the token by POSTing { token: null }.
function PushTokenRegistrar() {
  useEffect(() => {
    const w = window as unknown as {
      spiralPushToken?: string | null;
      spiralRegisterPushToken?: (token: string | null) => void;
    };
    const send = (token: string | null) => {
      apiRequest("POST", "/api/customer/push-token", { token }).catch((err) => {
        console.warn("[push-token] register failed", err);
      });
    };
    if (typeof w.spiralPushToken === "string" && w.spiralPushToken.length > 0) {
      send(w.spiralPushToken);
    }
    w.spiralRegisterPushToken = send;
    return () => {
      if (w.spiralRegisterPushToken === send) {
        w.spiralRegisterPushToken = undefined;
      }
    };
  }, []);
  return null;
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <PushTokenRegistrar />
        <AppContent />
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}
