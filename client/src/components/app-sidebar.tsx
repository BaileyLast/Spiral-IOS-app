import { Home, BarChart3, Link2 } from "lucide-react";
import { Link, useLocation } from "wouter";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
} from "@/components/ui/sidebar";
const logoUrl = "/spiral-logo.png";
const spiralIconUrl = "/spiral-icon.png";

type MenuItem = {
  title: string;
  url: string;
  icon?: typeof Home;
  imageUrl?: string;
};

const menuItems: MenuItem[] = [
  {
    title: "Home",
    url: "/",
    icon: Home,
  },
  {
    title: "Spiral Settings",
    url: "/spiral-settings",
    imageUrl: spiralIconUrl,
  },
  {
    title: "Performance",
    url: "/performance",
    icon: BarChart3,
  },
  {
    title: "Connections",
    url: "/connections",
    icon: Link2,
  },
];

export function AppSidebar() {
  const [location] = useLocation();

  return (
    <Sidebar>
      <SidebarHeader className="p-6 flex justify-center items-center">
        <img 
          src={logoUrl} 
          alt="Spiral" 
          className="w-32 h-auto"
          data-testid="img-logo"
        />
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {menuItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild isActive={location === item.url} data-testid={`link-${item.title.toLowerCase().replace(' ', '-')}`}>
                    <Link href={item.url}>
                      {item.imageUrl ? (
                        <img src={item.imageUrl} alt="" className="w-5 h-5" />
                      ) : item.icon ? (
                        <item.icon className="w-5 h-5" />
                      ) : null}
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
