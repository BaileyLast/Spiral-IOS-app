interface ShopifyProduct {
  id: number;
  title: string;
  handle: string;
  product_type: string;
  vendor: string;
  image?: {
    src: string;
  };
  variants: Array<{
    id: number;
    title: string;
    price: string;
    sku: string;
  }>;
}

interface ShopifyCollection {
  id: number;
  title: string;
  handle: string;
  products_count: number;
}

interface ShopifyApiOptions {
  shopDomain: string;
  accessToken: string;
}

export async function fetchShopifyProducts(options: ShopifyApiOptions): Promise<ShopifyProduct[]> {
  const { shopDomain, accessToken } = options;
  const url = `https://${shopDomain}/admin/api/2024-01/products.json?limit=250`;
  
  const response = await fetch(url, {
    headers: {
      'X-Shopify-Access-Token': accessToken,
      'Content-Type': 'application/json',
    },
  });
  
  if (!response.ok) {
    throw new Error(`Failed to fetch products: ${response.statusText}`);
  }
  
  const data = await response.json();
  return data.products || [];
}

export async function fetchShopifyCollections(options: ShopifyApiOptions): Promise<ShopifyCollection[]> {
  const { shopDomain, accessToken } = options;
  const url = `https://${shopDomain}/admin/api/2024-01/custom_collections.json?limit=250`;
  
  const response = await fetch(url, {
    headers: {
      'X-Shopify-Access-Token': accessToken,
      'Content-Type': 'application/json',
    },
  });
  
  if (!response.ok) {
    throw new Error(`Failed to fetch collections: ${response.statusText}`);
  }
  
  const data = await response.json();
  const customCollections = data.custom_collections || [];
  
  const smartUrl = `https://${shopDomain}/admin/api/2024-01/smart_collections.json?limit=250`;
  const smartResponse = await fetch(smartUrl, {
    headers: {
      'X-Shopify-Access-Token': accessToken,
      'Content-Type': 'application/json',
    },
  });
  
  if (smartResponse.ok) {
    const smartData = await smartResponse.json();
    const smartCollections = smartData.smart_collections || [];
    return [...customCollections, ...smartCollections];
  }
  
  return customCollections;
}

export async function registerWebhook(options: ShopifyApiOptions & { topic: string; address: string }): Promise<void> {
  const { shopDomain, accessToken, topic, address } = options;
  const url = `https://${shopDomain}/admin/api/2024-01/webhooks.json`;
  
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'X-Shopify-Access-Token': accessToken,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      webhook: {
        topic,
        address,
        format: 'json',
      },
    }),
  });
  
  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(`Failed to register webhook: ${JSON.stringify(errorData)}`);
  }
}
