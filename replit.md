# Spiral Merchant Dashboard

## Overview

Spiral is a Shopify merchant dashboard application that enables Instagram-based discount verification for e-commerce stores. The platform allows merchants to configure follower-based discount tiers and manage shopper verifications through Instagram post engagement. Built as an admin interface optimized for embedding within Shopify's admin panel, it provides a clean, modern SaaS experience for managing influencer and follower discount programs.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture

**Framework & Build System**
- React 18 with TypeScript using Vite as the build tool and development server
- Client-side routing implemented with Wouter (lightweight alternative to React Router)
- State management through React Query (@tanstack/react-query) for server state with infinite stale time and disabled auto-refetching
- Custom query client configured to throw on 401 errors rather than returning null by default

**UI Component Library**
- shadcn/ui component system with Radix UI primitives for accessibility
- Tailwind CSS for styling with custom design tokens defined in CSS variables
- "new-york" style variant with neutral base color scheme
- Comprehensive component library including forms, dialogs, tables, navigation, and data display elements
- Design system inspired by Linear, Stripe Dashboard, and Notion with clean, minimalist aesthetics

**Layout Strategy**
- SidebarProvider context-based layout with collapsible sidebar navigation
- Fixed-width sidebar (16rem) with mobile-responsive behavior
- Main content area with max-width container (max-w-7xl) and consistent padding (p-8)
- Card-based information architecture with shadow-sm elevation and rounded-xl corners

**Design Tokens & Theming**
- HSL-based color system with CSS custom properties for theming
- Branded purple (#5729a3 / HSL: 263° 60% 40%) used for sidebar and header backgrounds
- Light mode optimized with defined color scales for primary (purple/262° hue), secondary, muted, accent, and destructive variants
- Custom spacing system using Tailwind units (3, 4, 6, 8, 12)
- Typography using Inter font family loaded from Google Fonts
- White Spiral logo (spiral icon with text) displayed in sidebar header on purple background

### Backend Architecture

**Server Framework**
- Express.js HTTP server with middleware-based request handling
- Custom request logging middleware tracking API response times and payloads
- JSON body parsing with raw body preservation for webhook verification
- Modular route registration pattern through separate routes.ts file

**Data Layer**
- Drizzle ORM for type-safe database operations with PostgreSQL dialect
- Schema-first design with Zod validation using drizzle-zod integration
- Three core data models: store_settings, discount_tiers, and verifications
- In-memory storage abstraction (MemStorage) implementing IStorage interface for development/testing
- Database connection through Neon serverless PostgreSQL (@neondatabase/serverless)

**Data Models**
1. **Store Settings**: Stores Shopify and Instagram OAuth connection data with store configuration
   - Shopify fields: `storeName`, `shopDomain`, `accessToken`, `tokenActive`
   - Instagram OAuth fields: `instagramBusinessAccountId`, `instagramPageId`, `instagramUsername`, `instagramAccessToken`
   - Legacy field: `instagramHandle` (deprecated in favor of OAuth username)
   - `minFollowers`: INTEGER NOT NULL DEFAULT 0 - minimum follower count required for any discount eligibility
2. **Discount Tiers**: Flexible follower count ranges mapped to discount percentages
   - `fromFollowers`: INTEGER NOT NULL - lower bound of follower range (inclusive)
   - `toFollowers`: INTEGER (nullable) - upper bound of follower range (null for final bracket means no limit)
   - `discountPercent`: NUMERIC(5,2) NOT NULL - discount percentage (supports decimals, e.g., 7.5%)
3. **Verifications**: Shopper verification records linking email, Instagram handle, follower count, post URL, and verification status

**Discount Rules Validation**
- Minimum discount: 2.5% enforced on all brackets (frontend and backend)
- Minimum followers threshold: Derived from the first bracket's `fromFollowers` value (displayed as informational context in UI)
- First bracket must start at or above 0 (non-negative)
- Final bracket automatically has `toFollowers = null` (no upper limit)
- Follower counts must be non-negative
- Range ordering: `toFollowers > fromFollowers` (when toFollowers is not null)
- Both frontend and backend validate these rules with consistent error messages

**Discount Rules UI Design**
- Dynamic bracket creation system with unlimited tiers
- First bracket's "From" value sets the global minimum followers threshold
- Automatic bracket sequencing: new brackets start at previous bracket's end + 1
- Locked "From" inputs for brackets 2+ to prevent gaps/overlaps
- Cascade updates: changing a bracket's "To" value auto-updates subsequent brackets
- Smart removal handling: recalculates following brackets to maintain contiguous ranges
- Minimum followers displayed as informational text in table header (not editable separately)

**API Architecture**
- RESTful API pattern with /api route prefix convention
- Storage interface abstraction enabling future database migration without business logic changes
- Session management through connect-pg-simple for PostgreSQL-backed sessions

### Development & Build Configuration

**TypeScript Configuration**
- Strict mode enabled with ESNext module system
- Path aliases configured: @/ for client source, @shared/ for shared code
- Incremental compilation with build info caching
- Bundle resolution for Vite compatibility

**Build Process**
- Development: tsx for TypeScript execution with hot module replacement
- Production: Vite for client bundle, esbuild for server bundle (ESM format, platform=node)
- Separate output directories: dist/public for client, dist/ for server
- Source maps enabled for debugging (@jridgewell/trace-mapping)

**Development Tools**
- Replit-specific plugins for error overlay, cartographer, and dev banner
- Runtime error modal for improved debugging experience
- Vite middleware mode for seamless HMR integration with Express

## External Dependencies

### Third-Party UI Libraries
- **Radix UI**: Comprehensive set of unstyled, accessible component primitives including dialogs, dropdowns, popovers, tooltips, navigation menus, and form controls
- **Lucide React**: Icon library for consistent iconography throughout the application
- **cmdk**: Command palette component for keyboard-driven navigation
- **embla-carousel-react**: Carousel/slider component for image galleries
- **react-day-picker**: Date picker component for calendar interfaces
- **vaul**: Drawer component for mobile-friendly bottom sheets

### Form Management
- **React Hook Form**: Form state management and validation
- **@hookform/resolvers**: Validation resolver integration for Zod schemas
- **Zod**: Schema validation library integrated with Drizzle ORM

### Utility Libraries
- **class-variance-authority (CVA)**: Type-safe variant management for component styling
- **clsx & tailwind-merge**: Conditional className composition and conflict resolution
- **date-fns**: Date manipulation and formatting utilities
- **nanoid**: Unique ID generation for client-side operations

### Database & Backend Services
- **Neon Serverless PostgreSQL**: Cloud-native PostgreSQL database with serverless architecture and WebSocket connections
- **Drizzle Kit**: Database migration tool and schema management CLI
- **connect-pg-simple**: PostgreSQL session store for Express sessions

### Build & Development Tools
- **Vite**: Fast development server and optimized production bundler with HMR
- **esbuild**: JavaScript/TypeScript bundler for server-side code
- **tsx**: TypeScript execution engine for development
- **PostCSS & Autoprefixer**: CSS processing pipeline for Tailwind

### Implemented Integrations

**Shopify OAuth 2.0 Integration**
- Complete authorization code grant flow with CSRF protection
- State/nonce generation and validation via express-session
- HMAC signature verification using timing-safe comparison
- Secure token storage in PostgreSQL (store_settings table)
- Data merging to preserve existing merchant settings during reconnection
- Production-ready with trust proxy configuration for Render deployment

Required environment variables for deployment:
- `SESSION_SECRET`: Secret key for session encryption (generate with `openssl rand -hex 32`)
- `SHOPIFY_API_KEY`: Shopify app client ID
- `SHOPIFY_API_SECRET`: Shopify app client secret
- `SHOPIFY_REDIRECT_URI`: OAuth callback URL (e.g., `https://your-app.onrender.com/shopify/callback`)

OAuth endpoints:
- `/auth/shopify`: Initiates OAuth flow (optionally accepts ?shop=store-name.myshopify.com query parameter)
- `/shopify/callback`: Handles authorization and token exchange

Security features:
- CSRF protection via session-based state parameter
- HMAC signature verification on all callbacks
- Timing-safe string comparison to prevent timing attacks
- Secure, HTTP-only session cookies with proxy trust
- Automatic merging of new tokens with existing settings

**Instagram OAuth 2.0 Integration**
- Complete Meta OAuth authorization flow with Instagram Business Display API
- Three-step authentication: authorization code → short-lived token → long-lived token (60 days)
- CSRF protection via session-based state parameter matching Shopify implementation
- Automatic Instagram Business Account discovery via Facebook Pages API
- Secure long-lived token storage in PostgreSQL (store_settings table)
- Settings merging preserves existing Shopify and store configuration during connection

Required environment variables for deployment:
- `INSTAGRAM_APP_ID`: Meta App client ID (from Meta for Developers)
- `INSTAGRAM_APP_SECRET`: Meta App client secret
- `INSTAGRAM_REDIRECT_URI`: OAuth callback URL (e.g., `https://your-app.onrender.com/instagram/callback`)

OAuth endpoints:
- `/auth/instagram`: Initiates Instagram OAuth flow with Meta
- `/instagram/callback`: Handles authorization, token exchange, and account data retrieval

OAuth scopes requested:
- `instagram_basic`: Basic Instagram account information
- `pages_show_list`: Access to user's Facebook Pages list
- `pages_read_engagement`: Read Instagram Business Account linked to Pages

OAuth flow details:
1. User clicks "Connect Instagram" in Settings
2. Redirects to `/auth/instagram` which generates CSRF state and redirects to Meta authorization
3. User authorizes on Instagram/Facebook (must have Instagram Business or Creator account)
4. Meta redirects to `/instagram/callback` with authorization code
5. Backend validates CSRF state parameter
6. Exchanges authorization code for short-lived access token (1 hour)
7. Exchanges short-lived token for long-lived access token (60 days expiry)
8. Fetches user's Facebook Pages with `instagram_business_account` field
9. Finds first Page with linked Instagram Business Account
10. Stores business account ID, page ID, username, and long-lived token in database
11. Preserves existing Shopify connection and store settings during update
12. User returns to Settings page showing connected Instagram username and account details

Security features:
- CSRF protection via session-based state parameter
- Timing-safe string comparison for state validation
- Secure, HTTP-only session cookies
- Error handling for missing Instagram Business Account connections
- Validation that user has proper account type (Business/Creator, not Personal)

Settings UI:
- Displays "Connected" or "Not Connected" status badge
- Shows `@username`, business account ID, and page ID when connected
- "Connect Instagram" button initiates OAuth flow
- "Reconnect Account" button allows re-authorization for token refresh or account switching

Note: Instagram Basic Display was deprecated in December 2024. This integration requires Instagram Business or Creator accounts linked to Facebook Pages.