import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Mail, Trash2 } from "lucide-react";
import { useLocation } from "wouter";
import { openExternalUrl } from "@/lib/native";

export default function DataDeletion() {
  const [, setLocation] = useLocation();

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 bg-background border-b px-4 py-3 safe-top">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setLocation("/")}
            data-testid="button-back"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-lg font-semibold">Data Deletion</h1>
        </div>
      </header>

      <main className="p-4 pb-8 max-w-2xl mx-auto safe-bottom">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="p-2 bg-destructive/10 rounded-full">
                <Trash2 className="h-6 w-6 text-destructive" />
              </div>
              <div>
                <CardTitle>Request Data Deletion</CardTitle>
                <p className="text-sm text-muted-foreground mt-1">
                  How to delete your Spiral account and data
                </p>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-6 text-sm text-muted-foreground">
            <section>
              <h2 className="text-base font-semibold text-foreground mb-2">Your Data Rights</h2>
              <p>
                You have the right to request deletion of your personal data at any time. 
                When you request data deletion, we will permanently remove:
              </p>
              <ul className="list-disc list-inside mt-2 space-y-1">
                <li>Your account information (email, name)</li>
                <li>Connected Instagram account data</li>
                <li>Order history and verification records</li>
                <li>All associated tokens and credentials</li>
              </ul>
            </section>

            <section>
              <h2 className="text-base font-semibold text-foreground mb-2">How to Delete Your Data</h2>
              
              <div className="space-y-4">
                <div className="p-4 bg-muted rounded-lg">
                  <h3 className="font-medium text-foreground mb-2">Option 1: In-App Deletion</h3>
                  <p>
                    Go to <strong>Profile</strong> → <strong>Settings</strong> → <strong>Delete Account</strong> 
                    to immediately delete your account and all associated data.
                  </p>
                </div>
                
                <div className="p-4 bg-muted rounded-lg">
                  <h3 className="font-medium text-foreground mb-2">Option 2: Email Request</h3>
                  <p className="mb-3">
                    Send an email to request data deletion. Include the email address 
                    associated with your Spiral account.
                  </p>
                  <Button variant="outline" size="sm" asChild>
                    <a href="mailto:privacy@spiral.app?subject=Data Deletion Request">
                      <Mail className="h-4 w-4 mr-2" />
                      Contact Privacy Team
                    </a>
                  </Button>
                </div>
              </div>
            </section>

            <section>
              <h2 className="text-base font-semibold text-foreground mb-2">Processing Time</h2>
              <p>
                Data deletion requests are processed within 30 days. You will receive 
                a confirmation email once your data has been permanently deleted.
              </p>
            </section>

            <section>
              <h2 className="text-base font-semibold text-foreground mb-2">Facebook/Instagram Connection</h2>
              <p>
                Deleting your Spiral account will also remove the connection between 
                Spiral and your Facebook/Instagram accounts. You can also disconnect 
                Spiral from your Facebook account directly in your 
                <a 
                  href="https://www.facebook.com/settings?tab=business_tools" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-primary hover:underline ml-1"
                  onClick={(e) => {
                    e.preventDefault();
                    openExternalUrl("https://www.facebook.com/settings?tab=business_tools");
                  }}
                >
                  Facebook Business Integrations settings
                </a>.
              </p>
            </section>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
