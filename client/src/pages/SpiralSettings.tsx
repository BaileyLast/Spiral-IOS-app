import { useState, useEffect, useRef, Fragment } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { ShopifyProduct, ShopifyCollection, DiscountTier } from "@shared/schema";
import { Plus, Trash2, Loader2 } from "lucide-react";

interface BracketFormData {
  fromFollowers: number;
  toFollowers: number | null;
  discountPercent: number;
}

interface SpiralSettingsData {
  spiralEnabled: boolean;
  productSelectionType: string;
  postingWindowDays: number;
  minFollowers: number;
  discountTiers: DiscountTier[];
  selectedProducts: string[];
  selectedCollections: string[];
}

const POSTING_WINDOW_OPTIONS = [
  { value: 3, label: "3 days" },
  { value: 5, label: "5 days" },
  { value: 7, label: "7 days" },
  { value: 14, label: "14 days" },
];

function getReachRate(followers: number): number {
  if (followers <= 1000) return 0.30;
  if (followers <= 5000) return 0.25;
  if (followers <= 20000) return 0.20;
  if (followers <= 100000) return 0.12;
  return 0.06;
}

function formatImpressions(followers: number | null, isOpenEnded: boolean = false): string {
  if (followers === null) return "—";
  const reachRate = getReachRate(followers);
  const impressions = Math.round(followers * reachRate);
  if (isOpenEnded) {
    return `${impressions.toLocaleString()}+`;
  }
  return impressions.toLocaleString();
}

export default function SpiralSettings() {
  const { toast } = useToast();
  const hasHydratedRef = useRef(false);

  const [spiralEnabled, setSpiralEnabled] = useState(false);
  const [productSelectionType, setProductSelectionType] = useState("all");
  const [postingWindowDays, setPostingWindowDays] = useState(7);
  const [minFollowers, setMinFollowers] = useState(0);
  const [selectedProducts, setSelectedProducts] = useState<string[]>([]);
  const [selectedCollections, setSelectedCollections] = useState<string[]>([]);
  const [discountBrackets, setDiscountBrackets] = useState<BracketFormData[]>([
    { fromFollowers: 500, toFollowers: 999, discountPercent: 5 },
    { fromFollowers: 1000, toFollowers: 2499, discountPercent: 10 },
    { fromFollowers: 2500, toFollowers: 4999, discountPercent: 15 },
    { fromFollowers: 5000, toFollowers: 9999, discountPercent: 20 },
    { fromFollowers: 10000, toFollowers: 19999, discountPercent: 50 },
    { fromFollowers: 20000, toFollowers: null, discountPercent: 75 },
  ]);

  const { data: spiralSettings, isLoading: isLoadingSettings } = useQuery<SpiralSettingsData>({
    queryKey: ["/api/spiral-settings"],
  });

  const { data: products = [] } = useQuery<ShopifyProduct[]>({
    queryKey: ["/api/products"],
  });

  const { data: collections = [] } = useQuery<ShopifyCollection[]>({
    queryKey: ["/api/collections"],
  });

  useEffect(() => {
    if (!hasHydratedRef.current && spiralSettings) {
      setSpiralEnabled(spiralSettings.spiralEnabled);
      setProductSelectionType(spiralSettings.productSelectionType);
      setPostingWindowDays(spiralSettings.postingWindowDays);
      setMinFollowers(spiralSettings.minFollowers);
      setSelectedProducts(spiralSettings.selectedProducts || []);
      setSelectedCollections(spiralSettings.selectedCollections || []);

      if (spiralSettings.discountTiers && spiralSettings.discountTiers.length > 0) {
        const loadedBrackets = spiralSettings.discountTiers.map((tier) => ({
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
  }, [spiralSettings]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest("POST", "/api/spiral-settings", {
        spiralEnabled,
        productSelectionType,
        postingWindowDays,
        minFollowers,
        discountTiers: discountBrackets,
        selectedProducts,
        selectedCollections,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/spiral-settings"] });
      toast({
        description: "Spiral settings saved successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        description: error.message || "Failed to save settings",
        variant: "destructive",
      });
    },
  });

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

  if (isLoadingSettings) {
    return (
      <div className="p-8">
        <div className="max-w-4xl mx-auto space-y-6">
          <div>
            <h1 className="text-3xl font-bold bg-gradient-to-r from-[#5729a3] to-[#935eb2] bg-clip-text text-transparent">
              Spiral Settings
            </h1>
            <p className="text-muted-foreground mt-2">
              Configure how Spiral works across your store
            </p>
          </div>
          <div className="grid gap-6">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-48 bg-muted animate-pulse rounded-xl" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-[#5729a3] to-[#935eb2] bg-clip-text text-transparent">
            Spiral Settings
          </h1>
          <p className="text-muted-foreground mt-2">
            Configure how Spiral works across your store
          </p>
        </div>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Enable Spiral</CardTitle>
                <CardDescription>
                  Turn Spiral on or off for your entire store
                </CardDescription>
              </div>
              <Switch
                checked={spiralEnabled}
                onCheckedChange={setSpiralEnabled}
                data-testid="switch-spiral-enabled"
              />
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              {spiralEnabled 
                ? "Spiral is active. The checkout button will appear on your store and discounts will be applied based on your settings."
                : "Spiral is disabled. The checkout button will not appear on your store."}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Product Selection</CardTitle>
            <CardDescription>
              Choose which products Spiral discounts apply to
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <RadioGroup
              value={productSelectionType}
              onValueChange={setProductSelectionType}
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
            </RadioGroup>

            {productSelectionType === "specific" && (
              <div className="border rounded-lg p-4 mt-4">
                <div className="flex items-center justify-between mb-3">
                  <Label className="text-sm font-medium">Select products to include:</Label>
                  {products.length > 0 && (
                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setSelectedProducts(products.map(p => p.shopifyProductId))}
                        data-testid="button-select-all-products"
                      >
                        Select All
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setSelectedProducts([])}
                        data-testid="button-deselect-all-products"
                      >
                        Deselect All
                      </Button>
                    </div>
                  )}
                </div>
                {products.length === 0 ? (
                  <p className="text-muted-foreground text-sm">
                    No products found. Connect your Shopify store via the Connections page to import products.
                  </p>
                ) : (
                  <div className="grid gap-2 max-h-64 overflow-y-auto">
                    {products.map((product) => (
                      <div
                        key={product.shopifyProductId}
                        className="flex items-center space-x-3 p-2 rounded-md border hover-elevate"
                        data-testid={`product-item-${product.shopifyProductId}`}
                      >
                        <Checkbox
                          id={`product-${product.shopifyProductId}`}
                          checked={selectedProducts.includes(product.shopifyProductId)}
                          onCheckedChange={() => toggleProduct(product.shopifyProductId)}
                          data-testid={`checkbox-product-${product.shopifyProductId}`}
                        />
                        {product.imageUrl && (
                          <img
                            src={product.imageUrl}
                            alt={product.title}
                            className="w-10 h-10 object-cover rounded"
                          />
                        )}
                        <Label
                          htmlFor={`product-${product.shopifyProductId}`}
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
                  <div className="flex items-center justify-between mb-3">
                    <Label className="text-sm font-medium">Or select collections:</Label>
                    {collections.length > 0 && (
                      <div className="flex items-center gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setSelectedCollections(collections.map(c => c.shopifyCollectionId))}
                          data-testid="button-select-all-collections"
                        >
                          Select All
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setSelectedCollections([])}
                          data-testid="button-deselect-all-collections"
                        >
                          Deselect All
                        </Button>
                      </div>
                    )}
                  </div>
                  {collections.length === 0 ? (
                    <p className="text-muted-foreground text-sm">
                      No collections found. Connect your Shopify store via the Connections page to import collections.
                    </p>
                  ) : (
                    <div className="grid gap-2 max-h-48 overflow-y-auto">
                      {collections.map((collection) => (
                        <div
                          key={collection.shopifyCollectionId}
                          className="flex items-center space-x-3 p-2 rounded-md border hover-elevate"
                          data-testid={`collection-item-${collection.shopifyCollectionId}`}
                        >
                          <Checkbox
                            id={`collection-${collection.shopifyCollectionId}`}
                            checked={selectedCollections.includes(collection.shopifyCollectionId)}
                            onCheckedChange={() => toggleCollection(collection.shopifyCollectionId)}
                            data-testid={`checkbox-collection-${collection.shopifyCollectionId}`}
                          />
                          <Label
                            htmlFor={`collection-${collection.shopifyCollectionId}`}
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
                  Configure follower-based discount brackets
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
                <tbody>
                  {discountBrackets.map((bracket, index) => (
                    <Fragment key={index}>
                      <tr data-testid={`row-bracket-${index}`} className="border-b border-border/50">
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
                            className="text-muted-foreground hover:text-destructive"
                            data-testid={`button-remove-bracket-${index}`}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </td>
                      </tr>
                      <tr className="bg-muted/30 border-b" data-testid={`row-impressions-${index}`}>
                        <td className="px-4 py-1.5 text-xs text-muted-foreground">
                          <span className="text-[10px] uppercase tracking-wide">Est. impressions:</span>{" "}
                          {formatImpressions(bracket.fromFollowers, index === discountBrackets.length - 1)}
                        </td>
                        <td className="px-4 py-1.5 text-xs text-muted-foreground">
                          {bracket.toFollowers !== null && formatImpressions(bracket.toFollowers)}
                        </td>
                        <td className="px-4 py-1.5"></td>
                        <td className="px-4 py-1.5"></td>
                      </tr>
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Posting Window</CardTitle>
            <CardDescription>
              How many days customers have to post their Instagram story after delivery
            </CardDescription>
          </CardHeader>
          <CardContent>
            <RadioGroup
              value={postingWindowDays.toString()}
              onValueChange={(value) => setPostingWindowDays(parseInt(value))}
              className="flex flex-wrap gap-4"
            >
              {POSTING_WINDOW_OPTIONS.map((option) => (
                <div key={option.value} className="flex items-center space-x-2">
                  <RadioGroupItem 
                    value={option.value.toString()} 
                    id={`window-${option.value}`}
                    data-testid={`radio-window-${option.value}`}
                  />
                  <Label htmlFor={`window-${option.value}`} className="cursor-pointer">
                    {option.label}
                  </Label>
                </div>
              ))}
            </RadioGroup>
          </CardContent>
        </Card>

        <div className="flex justify-end">
          <Button
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending}
            className="bg-[#5729a3] text-white"
            data-testid="button-save-settings"
          >
            {saveMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Save Settings
          </Button>
        </div>
      </div>
    </div>
  );
}
