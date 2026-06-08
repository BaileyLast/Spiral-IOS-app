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

export async function fetchProductImages(
  options: ShopifyApiOptions & { productIds: Array<string | number> },
): Promise<Record<string, string>> {
  const { shopDomain, accessToken, productIds } = options;
  const unique = Array.from(new Set(productIds.map((id) => String(id)).filter(Boolean)));
  if (unique.length === 0) return {};

  const url = `https://${shopDomain}/admin/api/2024-01/products.json?ids=${unique.join(",")}&fields=id,image`;

  try {
    const response = await fetch(url, {
      headers: {
        'X-Shopify-Access-Token': accessToken,
        'Content-Type': 'application/json',
      },
    });
    if (!response.ok) {
      console.warn(`[shopify] fetchProductImages failed: ${response.status} ${response.statusText}`);
      return {};
    }
    const data = (await response.json()) as { products?: Array<{ id: number; image?: { src?: string } }> };
    const map: Record<string, string> = {};
    for (const p of data.products || []) {
      const src = p.image?.src;
      if (src) map[String(p.id)] = src;
    }
    return map;
  } catch (err) {
    console.warn('[shopify] fetchProductImages error:', err);
    return {};
  }
}

// Re-read a placed order from Shopify and resolve each line item's product
// image. Used to enrich/repair orders whose stored line items have no image
// (the checkout widget often doesn't send image URLs, and the webhook path
// can miss images if credentials were briefly unavailable at creation time).
// Returns a map of lowercased product title -> image URL. Degrades quietly to
// an empty map on any failure (missing order, no product image, API error).
export async function fetchOrderLineItemImages(
  options: ShopifyApiOptions & { shopifyOrderId: string | number },
): Promise<Record<string, string>> {
  const { shopDomain, accessToken, shopifyOrderId } = options;
  const idStr = String(shopifyOrderId).trim();
  if (!idStr) return {};

  const url = `https://${shopDomain}/admin/api/2024-01/orders/${encodeURIComponent(idStr)}.json?fields=line_items`;

  try {
    const response = await fetch(url, {
      headers: {
        'X-Shopify-Access-Token': accessToken,
        'Content-Type': 'application/json',
      },
    });
    if (!response.ok) {
      console.warn(`[shopify] fetchOrderLineItemImages failed: ${response.status} ${response.statusText}`);
      return {};
    }
    const data = (await response.json()) as {
      order?: { line_items?: Array<{ title?: string; product_id?: number | null }> };
    };
    const lineItems = data.order?.line_items || [];
    const productIds = lineItems
      .map((li) => li.product_id)
      .filter((id): id is number => id != null);
    if (productIds.length === 0) return {};

    const imagesByProductId = await fetchProductImages({ shopDomain, accessToken, productIds });

    const map: Record<string, string> = {};
    for (const li of lineItems) {
      const title = (li.title || '').trim().toLowerCase();
      if (!title || li.product_id == null) continue;
      const src = imagesByProductId[String(li.product_id)];
      if (src) map[title] = src;
    }
    return map;
  } catch (err) {
    console.warn('[shopify] fetchOrderLineItemImages error:', err);
    return {};
  }
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
