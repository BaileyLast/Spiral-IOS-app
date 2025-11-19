import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useRoute, useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Campaign, ShopifyProduct, ShopifyCollection } from "@shared/schema";
import { ArrowLeft, Package, Tag } from "lucide-react";

const campaignFormSchema = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string().optional(),
  status: z.enum(["active", "inactive"]).default("active"),
});

type CampaignFormData = z.infer<typeof campaignFormSchema>;

export default function CampaignEdit() {
  const [, navigate] = useLocation();
  const [match, params] = useRoute("/campaigns/:id");
  const { toast } = useToast();
  const isNew = params?.id === "new";
  const campaignId = isNew ? null : params?.id;

  const [selectedProducts, setSelectedProducts] = useState<string[]>([]);
  const [selectedCollections, setSelectedCollections] = useState<string[]>([]);
  const [selectionMode, setSelectionMode] = useState<"products" | "collections">("products");

  const { data: campaign } = useQuery<Campaign>({
    queryKey: ["/api/campaigns", campaignId],
    enabled: !isNew && !!campaignId,
  });

  const { data: products = [] } = useQuery<ShopifyProduct[]>({
    queryKey: ["/api/products"],
  });

  const { data: collections = [] } = useQuery<ShopifyCollection[]>({
    queryKey: ["/api/collections"],
  });

  const { data: campaignProducts = [] } = useQuery<ShopifyProduct[]>({
    queryKey: ["/api/campaigns", campaignId, "products"],
    enabled: !isNew && !!campaignId,
  });

  const { data: campaignCollections = [] } = useQuery<ShopifyCollection[]>({
    queryKey: ["/api/campaigns", campaignId, "collections"],
    enabled: !isNew && !!campaignId,
  });

  const form = useForm<CampaignFormData>({
    resolver: zodResolver(campaignFormSchema),
    defaultValues: {
      name: campaign?.name || "",
      description: campaign?.description || "",
      status: (campaign?.status === "active" || campaign?.status === "inactive") ? campaign.status : "active",
    },
  });

  const syncMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/shopify/sync"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      queryClient.invalidateQueries({ queryKey: ["/api/collections"] });
      toast({
        title: "Synced",
        description: "Products and collections synced from Shopify",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to sync from Shopify",
        variant: "destructive",
      });
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (data: CampaignFormData & { productIds?: string[], collectionIds?: string[] }) => {
      if (isNew) {
        return apiRequest("POST", "/api/campaigns", data);
      } else {
        return apiRequest("PATCH", `/api/campaigns/${campaignId}`, data);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/campaigns"] });
      toast({
        title: "Success",
        description: `Campaign ${isNew ? "created" : "updated"} successfully`,
      });
      navigate("/campaigns");
    },
    onError: () => {
      toast({
        title: "Error",
        description: `Failed to ${isNew ? "create" : "update"} campaign`,
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: CampaignFormData) => {
    saveMutation.mutate({
      ...data,
      productIds: selectionMode === "products" ? selectedProducts : undefined,
      collectionIds: selectionMode === "collections" ? selectedCollections : undefined,
    });
  };

  const toggleProduct = (productId: string) => {
    setSelectedProducts((prev) =>
      prev.includes(productId)
        ? prev.filter((id) => id !== productId)
        : [...prev, productId]
    );
  };

  const toggleCollection = (collectionId: string) => {
    setSelectedCollections((prev) =>
      prev.includes(collectionId)
        ? prev.filter((id) => id !== collectionId)
        : [...prev, collectionId]
    );
  };

  return (
    <div className="p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        <div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate("/campaigns")}
            className="mb-4"
            data-testid="button-back"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Campaigns
          </Button>
          <h1 className="text-2xl font-bold">
            {isNew ? "Create Campaign" : "Edit Campaign"}
          </h1>
          <p className="text-muted-foreground">
            Configure campaign details and select eligible products or collections
          </p>
        </div>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Campaign Details</CardTitle>
                <CardDescription>Basic information about this campaign</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Campaign Name</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="Summer Collection Discount"
                          data-testid="input-campaign-name"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Description (Optional)</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Describe this campaign..."
                          data-testid="input-campaign-description"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="status"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Status</FormLabel>
                      <FormControl>
                        <select
                          {...field}
                          className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                          data-testid="select-campaign-status"
                        >
                          <option value="active">Active</option>
                          <option value="inactive">Inactive</option>
                        </select>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Product Selection</CardTitle>
                    <CardDescription>
                      Choose products or collections to include in this campaign
                    </CardDescription>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => syncMutation.mutate()}
                    disabled={syncMutation.isPending}
                    data-testid="button-sync-shopify"
                  >
                    {syncMutation.isPending ? "Syncing..." : "Sync from Shopify"}
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <Tabs value={selectionMode} onValueChange={(v) => setSelectionMode(v as "products" | "collections")}>
                  <TabsList className="mb-4">
                    <TabsTrigger value="products" data-testid="tab-products">
                      <Package className="w-4 h-4 mr-2" />
                      Individual Products
                    </TabsTrigger>
                    <TabsTrigger value="collections" data-testid="tab-collections">
                      <Tag className="w-4 h-4 mr-2" />
                      Collections
                    </TabsTrigger>
                  </TabsList>

                  <TabsContent value="products" className="space-y-3">
                    {products.length === 0 ? (
                      <p className="text-muted-foreground text-sm">
                        No products found. Sync from Shopify to import your products.
                      </p>
                    ) : (
                      <div className="grid gap-3">
                        {products.map((product) => (
                          <div
                            key={product.id}
                            className="flex items-center space-x-3 p-3 rounded-md border hover-elevate"
                            data-testid={`product-item-${product.id}`}
                          >
                            <Checkbox
                              id={`product-${product.id}`}
                              checked={selectedProducts.includes(product.id)}
                              onCheckedChange={() => toggleProduct(product.id)}
                              data-testid={`checkbox-product-${product.id}`}
                            />
                            {product.imageUrl && (
                              <img
                                src={product.imageUrl}
                                alt={product.title}
                                className="w-12 h-12 object-cover rounded"
                              />
                            )}
                            <Label
                              htmlFor={`product-${product.id}`}
                              className="flex-1 cursor-pointer"
                            >
                              <p className="font-medium">{product.title}</p>
                              {product.vendor && (
                                <p className="text-sm text-muted-foreground">{product.vendor}</p>
                              )}
                            </Label>
                          </div>
                        ))}
                      </div>
                    )}
                  </TabsContent>

                  <TabsContent value="collections" className="space-y-3">
                    {collections.length === 0 ? (
                      <p className="text-muted-foreground text-sm">
                        No collections found. Sync from Shopify to import your collections.
                      </p>
                    ) : (
                      <div className="grid gap-3">
                        {collections.map((collection) => (
                          <div
                            key={collection.id}
                            className="flex items-center space-x-3 p-3 rounded-md border hover-elevate"
                            data-testid={`collection-item-${collection.id}`}
                          >
                            <Checkbox
                              id={`collection-${collection.id}`}
                              checked={selectedCollections.includes(collection.id)}
                              onCheckedChange={() => toggleCollection(collection.id)}
                              data-testid={`checkbox-collection-${collection.id}`}
                            />
                            <Label
                              htmlFor={`collection-${collection.id}`}
                              className="flex-1 cursor-pointer"
                            >
                              <p className="font-medium">{collection.title}</p>
                              <p className="text-sm text-muted-foreground">
                                {collection.productCount} products
                              </p>
                            </Label>
                          </div>
                        ))}
                      </div>
                    )}
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>

            <div className="flex items-center gap-3">
              <Button
                type="submit"
                disabled={saveMutation.isPending}
                data-testid="button-save-campaign"
              >
                {saveMutation.isPending ? "Saving..." : isNew ? "Create Campaign" : "Save Changes"}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => navigate("/campaigns")}
                data-testid="button-cancel"
              >
                Cancel
              </Button>
            </div>
          </form>
        </Form>
      </div>
    </div>
  );
}
