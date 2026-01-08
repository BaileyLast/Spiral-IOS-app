import { Switch, Route, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Home, ShoppingBag, User } from "lucide-react";
import { Link } from "wouter";
import Onboarding from "@/pages/Onboarding";
import Login from "@/pages/Login";
import InstagramConnect from "@/pages/InstagramConnect";
import Orders from "@/pages/Orders";
import OrderDetail from "@/pages/OrderDetail";
import Profile from "@/pages/Profile";
import CustomerHome from "@/pages/CustomerHome";

function BottomNav() {
  const [location] = useLocation();
  
  const navItems = [
    { path: "/home", icon: Home, label: "Home" },
    { path: "/orders", icon: ShoppingBag, label: "Orders" },
    { path: "/profile", icon: User, label: "Profile" },
  ];

  const isActive = (path: string) => {
    if (path === "/orders") {
      return location === "/orders" || location.startsWith("/orders/");
    }
    return location === path;
  };

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-card border-t border-border safe-bottom z-50">
      <div className="flex items-center justify-around h-16 max-w-md mx-auto">
        {navItems.map((item) => {
          const active = isActive(item.path);
          return (
            <Link key={item.path} href={item.path}>
              <button
                className={`flex flex-col items-center justify-center w-20 h-full gap-1 transition-colors ${
                  active 
                    ? "text-primary" 
                    : "text-muted-foreground"
                }`}
                data-testid={`nav-${item.label.toLowerCase()}`}
              >
                <item.icon className={`w-5 h-5 ${active ? "stroke-[2.5]" : "stroke-[1.5]"}`} />
                <span className="text-xs font-medium">{item.label}</span>
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
      <Route path="/" component={Onboarding} />
      <Route path="/login" component={Login} />
      <Route path="/connect-instagram" component={InstagramConnect} />
      <Route path="/home" component={CustomerHome} />
      <Route path="/orders" component={Orders} />
      <Route path="/orders/:id" component={OrderDetail} />
      <Route path="/profile" component={Profile} />
    </Switch>
  );
}

function AppContent() {
  const [location] = useLocation();
  
  const hideBottomNav = location === "/" || location === "/login" || location === "/connect-instagram";
  
  return (
    <div className="min-h-screen bg-background">
      <main className={`${hideBottomNav ? "" : "pb-20"}`}>
        <Router />
      </main>
      {!hideBottomNav && <BottomNav />}
    </div>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AppContent />
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}
