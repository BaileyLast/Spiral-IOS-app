import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { useLocation } from "wouter";

export default function Privacy() {
  const [, setLocation] = useLocation();

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 bg-background border-b px-4 py-3">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setLocation("/")}
            data-testid="button-back"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-lg font-semibold">Privacy Policy</h1>
        </div>
      </header>

      <main className="p-4 pb-8 max-w-2xl mx-auto">
        <Card>
          <CardHeader>
            <CardTitle>Spiral Privacy Policy</CardTitle>
            <p className="text-sm text-muted-foreground">Last updated: February 2026</p>
          </CardHeader>
          <CardContent className="space-y-6 text-sm text-muted-foreground">
            <section>
              <h2 className="text-base font-semibold text-foreground mb-2">1. Information We Collect</h2>
              <p>
                When you use Spiral, we collect information you provide directly to us, including:
              </p>
              <ul className="list-disc list-inside mt-2 space-y-1">
                <li>Account information (email address, name)</li>
                <li>Instagram account data (username, follower count, profile picture) when you connect your account</li>
                <li>Order information and verification status</li>
              </ul>
            </section>

            <section>
              <h2 className="text-base font-semibold text-foreground mb-2">2. How We Use Your Information</h2>
              <p>We use the information we collect to:</p>
              <ul className="list-disc list-inside mt-2 space-y-1">
                <li>Calculate and apply discounts based on your Instagram follower count</li>
                <li>Verify Instagram Story posts for order verification</li>
                <li>Send notifications about your orders and verification status</li>
                <li>Improve our services and user experience</li>
              </ul>
            </section>

            <section>
              <h2 className="text-base font-semibold text-foreground mb-2">3. Instagram Data</h2>
              <p>
                When you connect your Instagram account via Facebook Login, we access:
              </p>
              <ul className="list-disc list-inside mt-2 space-y-1">
                <li>Your Instagram username and profile information</li>
                <li>Your follower count to determine discount tiers</li>
                <li>Story posts to verify brand mentions</li>
              </ul>
              <p className="mt-2">
                We do not post on your behalf or access your private messages.
              </p>
            </section>

            <section>
              <h2 className="text-base font-semibold text-foreground mb-2">4. Data Sharing</h2>
              <p>
                We share your verification status with merchants to process discounts. 
                We do not sell your personal information to third parties.
              </p>
            </section>

            <section>
              <h2 className="text-base font-semibold text-foreground mb-2">5. Data Security</h2>
              <p>
                We implement appropriate security measures to protect your personal information 
                against unauthorized access, alteration, disclosure, or destruction.
              </p>
            </section>

            <section>
              <h2 className="text-base font-semibold text-foreground mb-2">6. Your Rights</h2>
              <p>You can:</p>
              <ul className="list-disc list-inside mt-2 space-y-1">
                <li>Disconnect your Instagram account at any time</li>
                <li>Request deletion of your account and data</li>
                <li>Access the personal information we hold about you</li>
              </ul>
            </section>

            <section>
              <h2 className="text-base font-semibold text-foreground mb-2">7. Contact Us</h2>
              <p>
                If you have questions about this Privacy Policy, please contact us through the app.
              </p>
            </section>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
