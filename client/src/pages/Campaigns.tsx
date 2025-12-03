import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus, Package, Calendar, Clock } from "lucide-react";
import type { Campaign } from "@shared/schema";

function getStatusBadge(status: string) {
  switch (status) {
    case "active":
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700 border border-green-200">
          Active
        </span>
      );
    case "draft":
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600 border border-gray-200">
          Draft
        </span>
      );
    case "paused":
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-700 border border-yellow-200">
          Paused
        </span>
      );
    case "ended":
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700 border border-red-200">
          Ended
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600 border border-gray-200">
          {status}
        </span>
      );
  }
}

function getProductSelectionLabel(type: string) {
  switch (type) {
    case "all":
      return "All products";
    case "specific":
      return "Specific products";
    case "excluded":
      return "All except excluded";
    default:
      return type;
  }
}

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
            <Button data-testid="button-create-campaign" className="bg-[#5729a3] text-white">
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
                  <Button data-testid="button-create-first-campaign" className="bg-[#5729a3] text-white">
                    <Plus className="w-4 h-4 mr-2" />
                    Create Campaign
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4">
            {campaigns.map((campaign) => (
              <Card 
                key={campaign.id} 
                data-testid={`card-campaign-${campaign.id}`}
                className="hover-elevate transition-all duration-200"
              >
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 flex-wrap">
                        <CardTitle className="text-lg">{campaign.name}</CardTitle>
                        <span data-testid={`badge-status-${campaign.id}`}>
                          {getStatusBadge(campaign.status)}
                        </span>
                      </div>
                      {campaign.description && (
                        <CardDescription className="mt-1.5 line-clamp-2">
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
                <CardContent className="pt-0">
                  <div className="flex items-center gap-6 text-sm text-muted-foreground flex-wrap">
                    <div className="flex items-center gap-2">
                      <Package className="w-4 h-4" />
                      <span>{getProductSelectionLabel(campaign.productSelectionType)}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Clock className="w-4 h-4" />
                      <span>{campaign.postingWindowDays} day posting window</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Calendar className="w-4 h-4" />
                      <span>Created {new Date(campaign.createdAt).toLocaleDateString()}</span>
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
