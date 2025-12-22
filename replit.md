# Spiral Merchant Dashboard

## Overview

Spiral is a Shopify merchant dashboard application designed for Instagram-based discount verification in e-commerce. It allows merchants to configure follower-based discount tiers and manage shopper verifications through Instagram post engagement. The platform serves as an admin interface optimized for embedding within Shopify's admin panel, providing a modern SaaS solution for influencer and follower discount programs.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend
- **Framework**: React 18 with TypeScript, Vite for build and development.
- **UI/UX**: shadcn/ui component system built on Radix UI primitives, styled with Tailwind CSS. Features a "new-york" style variant, neutral color scheme, and a clean, minimalist design inspired by Linear and Stripe.
- **Layout**: Context-based layout with a collapsible sidebar and a fixed-width main content area.
- **State Management**: React Query for server state, configured to throw on 401 errors.
- **Theming**: HSL-based color system with CSS custom properties, featuring a branded purple primary color (#5729a3) and secondary purple (#935eb2) with Inter font.
- **Dashboard Design**: Modernized with gradient accents, animated connection indicators, gradient stat cards, and polished table styling. Connection cards feature top gradient bars (purple for active, yellow for expired), animated status dots, and prominent warning badges for expired tokens.

### Pages
- **Home**: Dashboard with connection status and performance metrics
- **Spiral Settings**: Global configuration for discounts, product selection, and posting windows
- **Verifications**: Shopper verification records
- **Connections**: OAuth integrations for Shopify and Instagram

### Backend
- **Server**: Express.js with middleware for request handling, logging, and JSON body parsing.
- **Data Layer**: Drizzle ORM with PostgreSQL (Neon serverless) for type-safe operations.
- **Data Models**:
    - `store_settings`: Shopify and Instagram OAuth data, store configuration, plus Spiral settings (`spiralEnabled`, `productSelectionType`, `postingWindowDays`, `minFollowers`).
    - `discount_tiers`: Global follower ranges mapped to discount percentages.
    - `verifications`: Shopper verification records.
    - `shopify_products`: Synced product catalog.
    - `shopify_collections`: Synced collection catalog.
    - `selected_products`: Products selected for Spiral (when using specific/excluded mode).
    - `selected_collections`: Collections selected for Spiral (when using specific/excluded mode).
    - `orders`: Shopify order tracking with `shopperEmail`, `instagramHandle`, `discountApplied`, `totalPrice`, `fulfillmentStatus`, `fulfilledAt`, `verificationDeadline`, `verificationStatus`.
- **Discount Rules**: Global configuration. Enforces minimum discount (2.5%), non-negative follower counts, valid range ordering, and automatic final bracket configuration (no upper limit).
- **Spiral Settings**: Single global configuration including:
    - `spiralEnabled`: On/off toggle for entire store
    - `productSelectionType`: all/specific/excluded
    - `postingWindowDays`: 3/5/7/14 days
    - `discountTiers`: Follower-based discount brackets
- **API**: RESTful API using `/api` prefix, storage interface abstraction, and PostgreSQL-backed session management. Key endpoints: `GET/POST /api/spiral-settings` for global configuration.
- **Shopify Integration**: Product and collection catalog syncing via Admin REST API, webhook infrastructure for order events.

### Spiral Settings System
- **Enable/Disable Toggle**: Turn Spiral on or off for entire store
- **Product Selection**: All products, specific products only, or all except excluded products
- **Discount Brackets**: Follower-count-based discount percentages (minimum 2.5%)
- **Posting Window**: 3, 5, 7, or 14 days for customer story post deadline after delivery

### Development & Build
- **TypeScript**: Strict mode, ESNext modules, path aliases.
- **Build**: Vite for client, esbuild for server (production), tsx for development.
- **Tools**: Replit-specific plugins, runtime error modal, Vite middleware for HMR.

## External Dependencies

### UI & Forms
- **Radix UI**: Accessible component primitives.
- **Lucide React**: Icon library.
- **React Hook Form**: Form state management.
- **Zod**: Schema validation.
- **CVA, clsx, tailwind-merge**: Styling utilities.
- **date-fns**: Date manipulation.
- **nanoid**: Unique ID generation.

### Database & Backend Services
- **Neon Serverless PostgreSQL**: Cloud-native PostgreSQL.
- **Drizzle Kit**: Database migration and schema management.
- **connect-pg-simple**: PostgreSQL session store.

### Verification Lifecycle System
The verification system tracks Instagram story posts through a multi-stage lifecycle:

1. **pending**: Order placed, awaiting customer to post Instagram story tagging the brand
2. **story_detected**: Instagram webhook received, story found. 22-hour timer starts.
3. **verified**: Story confirmed still up after 22 hours. Discount kept.
4. **failed**: Story removed before 22 hours or never posted. Clawback triggered.

**Key Fields in `verifications` table:**
- `orderId`: Links to the associated order
- `instagramUserId`: Unique Instagram ID for matching webhooks
- `storyMediaId`: Instagram media ID for the detected story
- `storyDetectedAt`: When the story was first detected
- `confirmationDueAt`: When the 22-hour check should happen
- `verifiedAt` / `failedAt`: Final verification timestamps
- `clawbackTriggered`, `clawbackAmount`, `clawbackRefundId`: Clawback tracking

**Webhook Endpoints:**
- `GET /webhooks/instagram`: Meta webhook verification (hub.challenge)
- `POST /webhooks/instagram`: Receives story mention notifications, triggers verification flow
- `POST /webhooks/shopify/orders-create`: Receives Shopify order creation events, creates order and verification records
- `POST /webhooks/shopify/fulfillments-create`: Receives fulfillment events (TODO: update post deadline based on delivery)
- `POST /api/verification-check`: Scheduled job to check pending verifications after 22 hours

**Shopify Order Flow:**
1. Customer checks out with Spiral discount (discount code containing "spiral" or "instagram")
2. Shopify sends order webhook with note_attributes containing Instagram data
3. Spiral creates order record and verification record (if Instagram data present)
4. System awaits customer Instagram story post
5. Instagram webhook detects story mention → 22-hour verification timer starts

**Estimated Impressions Formula:**
Uses smooth power-law curve instead of harsh tiers to ensure impressions always increase with followers:
- `reachRate = clamp(0.06, 0.30 * (followers/500)^(-0.173))`
- 30% reach at 500 followers, tapers to ~12% at 100k, floors at 6%

### Integrations
- **Shopify OAuth 2.0**: Authorization code grant flow with CSRF protection, HMAC verification, secure token storage, and environment variable configuration.
- **Instagram OAuth 2.0 (Meta OAuth)**: Three-step authentication for Instagram Business Display API (via Meta for Developers), CSRF protection, automatic Business Account discovery, secure long-lived token storage, and environment variable configuration. Requires `instagram_basic`, `pages_show_list`, `pages_read_engagement` scopes.
- **Instagram Webhooks**: Story mention detection via Meta webhook subscriptions. Requires webhook URL registration in Meta for Developers console. **Security**: HMAC-SHA256 signature verification using `INSTAGRAM_APP_SECRET` - this secret MUST be configured in production to enforce webhook authentication. Missing signatures or invalid signatures are rejected with 403.

### Production Security Requirements
- `INSTAGRAM_APP_SECRET`: Required for webhook authentication. When set, all incoming Instagram webhooks must include valid `x-hub-signature-256` headers.
- `SESSION_SECRET`: Required for secure session management.
- `SHOPIFY_API_SECRET`: Required for Shopify HMAC verification.
