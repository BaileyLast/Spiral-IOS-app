# Spiral Merchant Dashboard

## Overview

Spiral is a Shopify merchant dashboard application designed for Instagram-based discount verification in e-commerce. It allows merchants to set up follower-based discount tiers and manage shopper verifications through Instagram post engagement. The platform serves as an admin interface optimized for embedding within Shopify's admin panel, providing a modern SaaS solution for influencer and follower discount programs.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend
- **Framework**: React 18 with TypeScript, Vite for build and development.
- **UI/UX**: shadcn/ui component system built on Radix UI primitives, styled with Tailwind CSS. Features a "new-york" style variant, neutral color scheme, and a clean, minimalist design inspired by Linear and Stripe.
- **Layout**: Context-based layout with a collapsible sidebar and a fixed-width main content area.
- **State Management**: React Query for server state, configured to throw on 401 errors.
- **Theming**: HSL-based color system with CSS custom properties, featuring a branded purple primary color and Inter font.

### Backend
- **Server**: Express.js with middleware for request handling, logging, and JSON body parsing.
- **Data Layer**: Drizzle ORM with PostgreSQL (Neon serverless) for type-safe operations.
- **Data Models**:
    - `store_settings`: Shopify and Instagram OAuth data, store configuration, `minFollowers`.
    - `discount_tiers`: Flexible follower ranges mapped to discount percentages.
    - `verifications`: Shopper verification records.
    - `campaigns`: Marketing campaigns with status and description.
    - `shopify_products`: Synced product catalog.
    - `shopify_collections`: Synced collection catalog.
    - `campaign_products`: Many-to-many link between campaigns and products.
    - `campaign_collections`: Many-to-many link between campaigns and collections.
    - `orders`: Shopify order tracking with `customerEmail`, `instagramHandle`, `discountApplied`, `totalPrice`, `fulfillmentStatus`, `fulfilledAt`, `verificationDeadline`, `verificationStatus`.
- **Discount Rules**: Enforces minimum discount (2.5%), non-negative follower counts, valid range ordering, and automatic final bracket configuration (no upper limit).
- **Campaign Management**: CRUD operations for campaigns with product/collection targeting, real-time Shopify catalog sync, and a tabbed UI for selection.
- **API**: RESTful API using `/api` prefix, storage interface abstraction, and PostgreSQL-backed session management.
- **Shopify Integration**: Product and collection catalog syncing via Admin REST API, webhook infrastructure for order events.

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

### Integrations
- **Shopify OAuth 2.0**: Authorization code grant flow with CSRF protection, HMAC verification, secure token storage, and environment variable configuration.
- **Instagram OAuth 2.0 (Meta OAuth)**: Three-step authentication for Instagram Business Display API (via Meta for Developers), CSRF protection, automatic Business Account discovery, secure long-lived token storage, and environment variable configuration. Requires `instagram_basic`, `pages_show_list`, `pages_read_engagement` scopes.