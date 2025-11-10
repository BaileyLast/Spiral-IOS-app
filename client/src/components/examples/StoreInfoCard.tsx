import { StoreInfoCard } from "../StoreInfoCard";
import { Store, Instagram, Shield } from "lucide-react";
import { StatusBadge } from "../StatusBadge";

export default function StoreInfoCardExample() {
  return (
    <div className="p-8 space-y-4 max-w-md">
      <StoreInfoCard icon={Store} label="Store Name" value="spiral-test.myshopify.com" />
      <StoreInfoCard icon={Instagram} label="Instagram" value="@brandname" />
      <StoreInfoCard icon={Shield} label="Token Health" value={<StatusBadge active={true} />} />
    </div>
  );
}
