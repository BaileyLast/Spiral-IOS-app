import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, Package, Users } from "lucide-react";
import type { Campaign } from "@shared/schema";

export default function Campaigns() {
  const { data: campaigns = [], isLoading } = useQuery<Campaign[]>({
    queryKey: ["/api/campaigns"],
  });

  if (isLoading) {
    return (
      <div className="p-8">
        <div className="max-w-7xl mx-auto space-y-8">
          <div>
            <h1 className="text-3xl font-bold bg-gradient-to-r from-[#5729a3] to-[#935eb2] bg-clip-text text-transparent">
              Campaigns
            </h1>
            <p className="text-muted-foreground mt-2">Manage your product campaigns and discount offerings</p>
          </div>
          <div className="h-48 bg-muted animate-pulse rounded-xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="p-8">
      <div className="max-w-7xl mx-auto space-y-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold bg-gradient-to-r from-[#5729a3] to-[#935eb2] bg-clip-text text-transparent">
              Campaigns
            </h1>
            <p className="text-muted-foreground mt-2">Manage your product campaigns and discount offerings</p>
          </div>
          <Link href="/campaigns/new">
            <Button data-testid="button-create-campaign">
              <Plus className="w-4 h-4 mr-2" />
              Create Campaign
            </Button>
          </Link>
        </div>

        {campaigns.length === 0 ? (
          <Card>
            <CardContent className="pt-6">
              <div className="text-center py-12">
                <Package className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold mb-2">No campaigns yet</h3>
                <p className="text-muted-foreground mb-4">
                  Create your first campaign to start offering follower-based discounts
                </p>
                <Link href="/campaigns/new">
                  <Button data-testid="button-create-first-campaign">
                    <Plus className="w-4 h-4 mr-2" />
                    Create Campaign
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-6">
            {campaigns.map((campaign) => (
              <Card key={campaign.id} data-testid={`card-campaign-${campaign.id}`}>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <CardTitle className="flex items-center gap-2">
                        {campaign.name}
                        <Badge 
                          variant={campaign.status === "active" ? "default" : "secondary"}
                          data-testid={`badge-status-${campaign.id}`}
                        >
                          {campaign.status}
                        </Badge>
                      </CardTitle>
                      {campaign.description && (
                        <CardDescription className="mt-2">
                          {campaign.description}
                        </CardDescription>
                      )}
                    </div>
                    <Link href={`/campaigns/${campaign.id}`}>
                      <Button variant="outline" size="sm" data-testid={`button-edit-${campaign.id}`}>
                        Edit
                      </Button>
                    </Link>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-6 text-sm text-muted-foreground">
                    <div className="flex items-center gap-2">
                      <Users className="w-4 h-4" />
                      <span>Created {new Date(campaign.createdAt).toLocaleDateString()}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Package className="w-4 h-4" />
                      <span>Last updated {new Date(campaign.updatedAt).toLocaleDateString()}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
