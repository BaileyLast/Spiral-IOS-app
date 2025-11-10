import { StatusBadge } from "../StatusBadge";

export default function StatusBadgeExample() {
  return (
    <div className="p-8 space-y-4">
      <StatusBadge active={true} />
      <StatusBadge active={false} />
    </div>
  );
}
