import { VerificationsTable } from "@/components/VerificationsTable";

export default function Verifications() {
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
    {
      id: "4",
      shopperEmail: "alex@example.com",
      instagramHandle: "@alextech",
      followerCount: 12000,
      postUrl: "https://instagram.com/p/jkl012",
      status: "verified",
      verifiedAt: new Date("2025-01-02"),
    },
    {
      id: "5",
      shopperEmail: "jessica@example.com",
      instagramHandle: "@jessicafood",
      followerCount: 3400,
      postUrl: "https://instagram.com/p/mno345",
      status: "verified",
      verifiedAt: new Date("2025-01-01"),
    },
  ];

  return (
    <div className="p-8">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-2xl font-bold mb-6">Verifications</h1>
        <VerificationsTable verifications={mockVerifications} />
      </div>
    </div>
  );
}
