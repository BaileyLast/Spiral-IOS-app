import { useState, useEffect, useRef } from "react";
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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Campaign, ShopifyProduct, ShopifyCollection, DiscountTier } from "@shared/schema";
import { ArrowLeft, Package, Plus, Trash2 } from "lucide-react";

interface BracketFormData {
  fromFollowers: number;
  toFollowers: number | null;
  discountPercent: number;
}

const campaignFormSchema = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string().optional(),
  status: z.enum(["draft", "active", "paused", "ended"]).default("draft"),
  productSelectionType: z.enum(["all", "specific", "excluded"]).default("all"),
  postingWindowDays: z.number().int().min(3).max(14).default(7),
});

type CampaignFormData = z.infer<typeof campaignFormSchema>;

const POSTING_WINDOW_OPTIONS = [
  { value: 3, label: "3 days" },
  { value: 5, label: "5 days" },
  { value: 7, label: "7 days" },
  { value: 14, label: "14 days" },
];

const STATUS_OPTIONS = [
  { value: "draft", label: "Draft", description: "Campaign is being edited. Not active." },
  { value: "active", label: "Active", description: "Campaign is live. Spiral checkout button appears." },
  { value: "paused", label: "Paused", description: "Temporarily disabled. Data is preserved." },
  { value: "ended", label: "Ended", description: "Completed or expired. Read-only." },
];

export default function CampaignEdit() {
  const [, navigate] = useLocation();
  const [match, params] = useRoute("/campaigns/:id");
  const { toast } = useToast();
  const isNew = params?.id === "new";
  const campaignId = isNew ? null : params?.id;

  const [selectedProducts, setSelectedProducts] = useState<string[]>([]);
  const [selectedCollections, setSelectedCollections] = useState<string[]>([]);
  const [discountBrackets, setDiscountBrackets] = useState<BracketFormData[]>([
    { fromFollowers: 300, toFollowers: 499, discountPercent: 2.5 },
    { fromFollowers: 500, toFollowers: 999, discountPercent: 5 },
    { fromFollowers: 1000, toFollowers: 1499, discountPercent: 7.5 },
    { fromFollowers: 1500, toFollowers: null, discountPercent: 10 },
  ]);
  const hasHydratedRef = useRef(false);

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

  const { data: campaignProducts = [], isLoading: isLoadingProducts } = useQuery<ShopifyProduct[]>({
    queryKey: ["/api/campaigns", campaignId, "products"],
    enabled: !isNew && !!campaignId,
  });

  const { data: campaignCollections = [], isLoading: isLoadingCollections } = useQuery<ShopifyCollection[]>({
    queryKey: ["/api/campaigns", campaignId, "collections"],
    enabled: !isNew && !!campaignId,
  });

  const { data: campaignTiers = [], isLoading: isLoadingTiers } = useQuery<DiscountTier[]>({
    queryKey: ["/api/campaigns", campaignId, "discount-tiers"],
    enabled: !isNew && !!campaignId,
  });

  const form = useForm<CampaignFormData>({
    resolver: zodResolver(campaignFormSchema),
    defaultValues: {
      name: "",
      description: "",
      status: "draft",
      productSelectionType: "all",
      postingWindowDays: 7,
    },
  });

  const productSelectionType = form.watch("productSelectionType");

  useEffect(() => {
    hasHydratedRef.current = false;
    setSelectedProducts([]);
    setSelectedCollections([]);
    setDiscountBrackets([
      { fromFollowers: 300, toFollowers: 499, discountPercent: 2.5 },
      { fromFollowers: 500, toFollowers: 999, discountPercent: 5 },
      { fromFollowers: 1000, toFollowers: 1499, discountPercent: 7.5 },
      { fromFollowers: 1500, toFollowers: null, discountPercent: 10 },
    ]);
    form.reset({
      name: "",
      description: "",
      status: "draft",
      productSelectionType: "all",
      postingWindowDays: 7,
    });
  }, [campaignId, form]);

  useEffect(() => {
    if (!isNew && !hasHydratedRef.current && campaign && !isLoadingProducts && !isLoadingCollections && !isLoadingTiers) {
      const validStatuses = ["draft", "active", "paused", "ended"] as const;
      const campaignStatus = validStatuses.includes(campaign.status as typeof validStatuses[number]) 
        ? campaign.status as typeof validStatuses[number]
        : "draft";
      
      const validSelectionTypes = ["all", "specific", "excluded"] as const;
      const selectionType = validSelectionTypes.includes(campaign.productSelectionType as typeof validSelectionTypes[number])
        ? campaign.productSelectionType as typeof validSelectionTypes[number]
        : "all";

      form.reset({
        name: campaign.name,
        description: campaign.description || "",
        status: campaignStatus,
        productSelectionType: selectionType,
        postingWindowDays: campaign.postingWindowDays || 7,
      });

      if (campaignProducts.length > 0) {
        setSelectedProducts(campaignProducts.map(p => p.id));
      }

      if (campaignCollections.length > 0) {
        setSelectedCollections(campaignCollections.map(c => c.id));
      }

      if (campaignTiers.length > 0) {
        const loadedBrackets = campaignTiers.map((tier) => ({
          fromFollowers: tier.fromFollowers,
          toFollowers: tier.toFollowers,
          discountPercent: typeof tier.discountPercent === 'string' 
            ? parseFloat(tier.discountPercent) 
            : tier.discountPercent,
        }));
        setDiscountBrackets(loadedBrackets);
      }

      hasHydratedRef.current = true;
    }
  }, [campaign, campaignProducts, campaignCollections, campaignTiers, isNew, form, isLoadingProducts, isLoadingCollections, isLoadingTiers]);

  const syncMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/shopify/sync"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      queryClient.invalidateQueries({ queryKey: ["/api/collections"] });
      toast({
        description: "Products and collections synced from Shopify",
      });
    },
    onError: () => {
      toast({
        description: "Failed to sync from Shopify",
        variant: "destructive",
      });
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (data: CampaignFormData & { productIds?: string[], collectionIds?: string[] }) => {
      let savedCampaign: Campaign;
      if (isNew) {
        const response = await apiRequest("POST", "/api/campaigns", data);
        savedCampaign = await response.json();
      } else {
        const response = await apiRequest("PATCH", `/api/campaigns/${campaignId}`, data);
        savedCampaign = await response.json();
      }

      const savedCampaignId = isNew ? savedCampaign.id : campaignId;
      await apiRequest("POST", `/api/campaigns/${savedCampaignId}/discount-tiers`, {
        tiers: discountBrackets,
      });

      return savedCampaign;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/campaigns"] });
      toast({
        description: `Campaign ${isNew ? "created" : "updated"} successfully`,
      });
      navigate("/campaigns");
    },
    onError: (error: Error) => {
      toast({
        description: error.message || `Failed to ${isNew ? "create" : "update"} campaign`,
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: CampaignFormData) => {
    saveMutation.mutate({
      ...data,
      productIds: selectedProducts,
      collectionIds: selectedCollections,
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

  const handleAddBracket = () => {
    const lastBracket = discountBrackets[discountBrackets.length - 1];
    
    if (lastBracket.toFollowers === null) {
      const newFrom = lastBracket.fromFollowers + 1000;
      const newTo = newFrom + 999;
      
      setDiscountBrackets([
        ...discountBrackets.slice(0, -1),
        { ...lastBracket, toFollowers: newFrom - 1 },
        { fromFollowers: newFrom, toFollowers: null, discountPercent: 5 },
      ]);
    } else {
      const newFrom = lastBracket.toFollowers + 1;
      setDiscountBrackets([
        ...discountBrackets,
        { fromFollowers: newFrom, toFollowers: null, discountPercent: 5 },
      ]);
    }
  };

  const handleRemoveBracket = (index: number) => {
    if (discountBrackets.length === 1) {
      toast({
        description: "You must have at least one discount bracket",
        variant: "destructive",
      });
      return;
    }

    const newBrackets = discountBrackets.filter((_, i) => i !== index);
    
    if (index === newBrackets.length) {
      newBrackets[newBrackets.length - 1].toFollowers = null;
    }
    
    for (let i = Math.max(1, index); i < newBrackets.length; i++) {
      const prevBracket = newBrackets[i - 1];
      if (prevBracket.toFollowers !== null) {
        newBrackets[i].fromFollowers = prevBracket.toFollowers + 1;
      }
    }
    
    setDiscountBrackets(newBrackets);
  };

  const handleBracketChange = (
    index: number,
    field: keyof BracketFormData,
    value: number | null
  ) => {
    const newBrackets = [...discountBrackets];
    
    if (field === "fromFollowers" && index === 0) {
      newBrackets[0].fromFollowers = value as number;
    } else if (field === "toFollowers") {
      const numValue = value as number | null;
      newBrackets[index].toFollowers = numValue;
      
      if (numValue !== null && index < newBrackets.length - 1) {
        newBrackets[index + 1].fromFollowers = numValue + 1;
      }
    } else if (field === "discountPercent") {
      newBrackets[index].discountPercent = value as number;
    }
    
    setDiscountBrackets(newBrackets);
  };

  return (
    <div className="p-8">
      <div className="max-w-4xl mx-auto space-y-6">
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
          <h1 className="text-3xl font-bold bg-gradient-to-r from-[#5729a3] to-[#935eb2] bg-clip-text text-transparent">
            {isNew ? "Create Campaign" : "Edit Campaign"}
          </h1>
          <p className="text-muted-foreground mt-2">
            Configure your campaign settings, products, and discount rules
          </p>
        </div>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Campaign Name</CardTitle>
              </CardHeader>
              <CardContent>
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormControl>
                        <Input
                          placeholder="e.g., January Influencer Push"
                          data-testid="input-campaign-name"
                          {...field}
                        />
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
                      Choose which products this campaign applies to
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
              <CardContent className="space-y-4">
                <FormField
                  control={form.control}
                  name="productSelectionType"
                  render={({ field }) => (
                    <FormItem>
                      <FormControl>
                        <RadioGroup
                          onValueChange={field.onChange}
                          value={field.value}
                          className="space-y-3"
                        >
                          <div className="flex items-center space-x-3">
                            <RadioGroupItem value="all" id="all-products" data-testid="radio-all-products" />
                            <Label htmlFor="all-products" className="font-normal cursor-pointer">
                              All products
                            </Label>
                          </div>
                          <div className="flex items-center space-x-3">
                            <RadioGroupItem value="specific" id="specific-products" data-testid="radio-specific-products" />
                            <Label htmlFor="specific-products" className="font-normal cursor-pointer">
                              Specific products only
                            </Label>
                          </div>
                          <div className="flex items-center space-x-3">
                            <RadioGroupItem value="excluded" id="excluded-products" data-testid="radio-excluded-products" />
                            <Label htmlFor="excluded-products" className="font-normal cursor-pointer">
                              All products except specific ones
                            </Label>
                          </div>
                        </RadioGroup>
                      </FormControl>
                    </FormItem>
                  )}
                />

                {productSelectionType !== "all" && (
                  <div className="border rounded-lg p-4 mt-4">
                    <Label className="text-sm font-medium mb-3 block">
                      {productSelectionType === "specific" ? "Select products to include:" : "Select products to exclude:"}
                    </Label>
                    {products.length === 0 ? (
                      <p className="text-muted-foreground text-sm">
                        No products found. Sync from Shopify to import your products.
                      </p>
                    ) : (
                      <div className="grid gap-2 max-h-64 overflow-y-auto">
                        {products.map((product) => (
                          <div
                            key={product.id}
                            className="flex items-center space-x-3 p-2 rounded-md border hover-elevate"
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
                                className="w-10 h-10 object-cover rounded"
                              />
                            )}
                            <Label
                              htmlFor={`product-${product.id}`}
                              className="flex-1 cursor-pointer"
                            >
                              <p className="font-medium text-sm">{product.title}</p>
                              {product.vendor && (
                                <p className="text-xs text-muted-foreground">{product.vendor}</p>
                              )}
                            </Label>
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="border-t mt-4 pt-4">
                      <Label className="text-sm font-medium mb-3 block">Or select collections:</Label>
                      {collections.length === 0 ? (
                        <p className="text-muted-foreground text-sm">
                          No collections found. Sync from Shopify to import your collections.
                        </p>
                      ) : (
                        <div className="grid gap-2 max-h-48 overflow-y-auto">
                          {collections.map((collection) => (
                            <div
                              key={collection.id}
                              className="flex items-center space-x-3 p-2 rounded-md border hover-elevate"
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
                                <p className="font-medium text-sm">{collection.title}</p>
                                <p className="text-xs text-muted-foreground">
                                  {collection.productCount} products
                                </p>
                              </Label>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Discount Rules</CardTitle>
                    <CardDescription>
                      Configure follower-based discount brackets for this campaign
                    </CardDescription>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleAddBracket}
                    data-testid="button-add-bracket"
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Add Bracket
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="border rounded-lg overflow-hidden">
                  <table className="w-full">
                    <thead className="bg-muted/50">
                      <tr>
                        <th className="text-left px-4 py-3 text-sm font-medium">From Followers</th>
                        <th className="text-left px-4 py-3 text-sm font-medium">To Followers</th>
                        <th className="text-left px-4 py-3 text-sm font-medium">Discount (%)</th>
                        <th className="w-12 px-4 py-3"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {discountBrackets.map((bracket, index) => (
                        <tr key={index} data-testid={`row-bracket-${index}`}>
                          <td className="px-4 py-3">
                            {index === 0 ? (
                              <Input
                                type="number"
                                className="w-32"
                                value={bracket.fromFollowers}
                                onChange={(e) =>
                                  handleBracketChange(index, "fromFollowers", Number(e.target.value))
                                }
                                min={0}
                                data-testid={`input-from-${index}`}
                              />
                            ) : (
                              <Input
                                type="number"
                                className="w-32"
                                value={bracket.fromFollowers}
                                disabled
                                data-testid={`input-from-${index}`}
                              />
                            )}
                          </td>
                          <td className="px-4 py-3">
                            {index === discountBrackets.length - 1 ? (
                              <span className="text-sm text-muted-foreground px-3">No limit</span>
                            ) : (
                              <Input
                                type="number"
                                className="w-32"
                                value={bracket.toFollowers || ""}
                                onChange={(e) =>
                                  handleBracketChange(
                                    index,
                                    "toFollowers",
                                    e.target.value ? Number(e.target.value) : null
                                  )
                                }
                                min={bracket.fromFollowers + 1}
                                data-testid={`input-to-${index}`}
                              />
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <Input
                              type="number"
                              className="w-24"
                              value={bracket.discountPercent}
                              onChange={(e) =>
                                handleBracketChange(index, "discountPercent", Number(e.target.value))
                              }
                              min={2.5}
                              max={100}
                              step={0.5}
                              data-testid={`input-discount-${index}`}
                            />
                          </td>
                          <td className="px-4 py-3">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              onClick={() => handleRemoveBracket(index)}
                              disabled={discountBrackets.length === 1}
                              data-testid={`button-remove-bracket-${index}`}
                            >
                              <Trash2 className="w-4 h-4 text-muted-foreground" />
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="text-xs text-muted-foreground mt-3">
                  Minimum discount: 2.5%. The last bracket has no upper follower limit.
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Posting Window</CardTitle>
                <CardDescription>
                  How many days after delivery does the customer have to post their Instagram story?
                </CardDescription>
              </CardHeader>
              <CardContent>
                <FormField
                  control={form.control}
                  name="postingWindowDays"
                  render={({ field }) => (
                    <FormItem>
                      <FormControl>
                        <RadioGroup
                          onValueChange={(v) => field.onChange(Number(v))}
                          value={String(field.value)}
                          className="flex flex-wrap gap-4"
                        >
                          {POSTING_WINDOW_OPTIONS.map((option) => (
                            <div key={option.value} className="flex items-center space-x-2">
                              <RadioGroupItem 
                                value={String(option.value)} 
                                id={`window-${option.value}`}
                                data-testid={`radio-window-${option.value}`}
                              />
                              <Label htmlFor={`window-${option.value}`} className="font-normal cursor-pointer">
                                {option.label}
                              </Label>
                            </div>
                          ))}
                        </RadioGroup>
                      </FormControl>
                      <FormDescription>
                        This value is used for reminder notifications and clawback eligibility.
                      </FormDescription>
                    </FormItem>
                  )}
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Campaign Status</CardTitle>
                <CardDescription>
                  Set the current status of this campaign
                </CardDescription>
              </CardHeader>
              <CardContent>
                <FormField
                  control={form.control}
                  name="status"
                  render={({ field }) => (
                    <FormItem>
                      <FormControl>
                        <RadioGroup
                          onValueChange={field.onChange}
                          value={field.value}
                          className="space-y-3"
                        >
                          {STATUS_OPTIONS.map((option) => (
                            <div key={option.value} className="flex items-start space-x-3">
                              <RadioGroupItem 
                                value={option.value} 
                                id={`status-${option.value}`}
                                className="mt-1"
                                data-testid={`radio-status-${option.value}`}
                              />
                              <Label htmlFor={`status-${option.value}`} className="cursor-pointer">
                                <p className="font-medium">{option.label}</p>
                                <p className="text-sm text-muted-foreground">{option.description}</p>
                              </Label>
                            </div>
                          ))}
                        </RadioGroup>
                      </FormControl>
                    </FormItem>
                  )}
                />
              </CardContent>
            </Card>

            <div className="flex items-center gap-3">
              <Button
                type="submit"
                disabled={saveMutation.isPending}
                data-testid="button-save-campaign"
                className="bg-[#5729a3] text-white"
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
