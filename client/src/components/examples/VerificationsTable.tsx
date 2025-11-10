import { VerificationsTable } from "../VerificationsTable";

export default function VerificationsTableExample() {
  const mockVerifications = [
    {
      id: "1",
      shopperEmail: "sarah@example.com",
      instagramHandle: "@sarahstyle",
      followerCount: 2500,
      postUrl: "https://instagram.com/p/abc123",
      status: "verified",
      verifiedAt: new Date("2025-01-05"),
    },
    {
      id: "2",
      shopperEmail: "mike@example.com",
      instagramHandle: "@mikefitness",
      followerCount: 8200,
      postUrl: "https://instagram.com/p/def456",
      status: "verified",
      verifiedAt: new Date("2025-01-04"),
    },
    {
      id: "3",
      shopperEmail: "emma@example.com",
      instagramHandle: "@emmabeauty",
      followerCount: 450,
      postUrl: "https://instagram.com/p/ghi789",
      status: "pending",
      verifiedAt: new Date("2025-01-03"),
    },
  ];

  return (
    <div className="p-8">
      <VerificationsTable verifications={mockVerifications} />
    </div>
  );
}
