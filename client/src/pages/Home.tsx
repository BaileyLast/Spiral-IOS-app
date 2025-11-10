import { StoreInfoCard } from "@/components/StoreInfoCard";
import { StatusBadge } from "@/components/StatusBadge";
import { Store, Instagram, Shield } from "lucide-react";

export default function Home() {
  const storeData = {
    storeName: "spiral-test.myshopify.com",
    instagramHandle: "@brandname",
    tokenActive: true,
  };

  return (
    <div className="p-8">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-2xl font-bold mb-6">Dashboard</h1>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <StoreInfoCard 
            icon={Store} 
            label="Connected Store" 
            value={storeData.storeName} 
          />
          <StoreInfoCard 
            icon={Instagram} 
            label="Instagram Handle" 
            value={storeData.instagramHandle} 
          />
          <StoreInfoCard 
            icon={Shield} 
            label="Token Health" 
            value={<StatusBadge active={storeData.tokenActive} />} 
          />
        </div>
      </div>
    </div>
  );
}
