import { DiscountTierCard } from "../DiscountTierCard";

export default function DiscountTierCardExample() {
  const tier = {
    id: "1",
    minFollowers: 0,
    maxFollowers: 1000,
    discountPercent: 5,
  };

  return (
    <div className="p-8 max-w-3xl">
      <DiscountTierCard tier={tier} />
    </div>
  );
}
