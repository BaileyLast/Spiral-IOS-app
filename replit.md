# Spiral Customer App

## Overview

Spiral is a customer-facing mobile application that allows shoppers to earn instant discounts at checkout by agreeing to post one Instagram Story after delivery. The app handles login & identity, Instagram connection, follower verification, order tracking, and automated story verification. Designed with minimal, calm, trust-led principles inspired by Klarna and Apple.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend
- **Framework**: React 18 with TypeScript, Vite for build and development.
- **UI/UX**: Mobile-first design with shadcn/ui components, Tailwind CSS. Minimal, calm aesthetic with trust-led interactions.
- **Layout**: Bottom navigation bar with Home, Marketplace, Discounts, Profile tabs. Single-column mobile layouts.
- **State Management**: React Query for server state, localStorage for customer session.
- **Theming**: HSL-based color system with CSS custom properties, branded purple primary color, soft status colors for order states.
- **Design**: Rounded cards (rounded-2xl), generous padding, soft shadows, mobile-safe areas.

### Pages
- **Onboarding** (`/`): Welcome screen explaining value proposition with Get Started CTA
- **Login** (`/login`): Email/password authentication with signup toggle
- **Instagram Connect** (`/connect-instagram`): Connect Instagram to verify follower count
- **Home** (`/home`): Dashboard with stats, pending actions, recent orders
- **Marketplace** (`/marketplace`): Browse participating brands
- **Discounts** (`/discounts`): List of all orders with status badges
- **Order Detail** (`/orders/:id`): Progress timeline, discount info, posting instructions
- **Profile** (`/profile`): Account info, Instagram status, settings, logout
- **Manage Account** (`/manage-account`): Instagram disconnect card with profile pic, editable account info (email, name, date of birth, address)

### Backend
- **Server**: Express.js with middleware for request handling, logging, and JSON body parsing.
- **Data Layer**: Drizzle ORM with PostgreSQL (Neon serverless) for type-safe operations.
- **Data Models**:
    - `store_settings`: Shopify and Instagram OAuth data, store configuration, webhook health monitoring.
    - `discount_tiers`: Follower ranges mapped to discount percentages.
    - `verifications`: Story post verification records with webhook metadata.
    - `spiral_customers`: Customer accounts with Instagram credentials.
    - `orders`: Order tracking with discount info and verification status.
    - `merchant_scoped_user_map`: Maps merchant-scoped Instagram sender IDs to Spiral customers.
    - `spiral_codes`: DM-based Instagram verification codes for account linking.

### Customer API Endpoints
- `POST /api/customer/signup`: Create new customer account
- `POST /api/customer/login`: Authenticate customer
- `POST /api/customer/logout`: End session
- `GET /api/customer/me`: Get current customer profile
- `POST /api/customer/spiral-code`: Generate or get existing verification code
- `GET /api/customer/spiral-code/status`: Poll for verification status
- `POST /api/customer/spiral-code/regenerate`: Generate a new code (invalidates old)
- `POST /api/customer/disconnect-instagram`: Unlink Instagram account
- `PATCH /api/customer/profile`: Update customer profile (name, dateOfBirth, address)
- `GET /api/customer/orders`: Get customer's orders
- `GET /api/customer/orders/:id`: Get single order details
- `GET /api/customer/stats`: Get total saved and orders completed

### Webhook Endpoints
- `GET /webhooks/instagram-dm`: Webhook verification (Meta challenge)
- `POST /webhooks/instagram-dm`: Receive DMs to @joinspiral for code verification AND story_mention events
- `GET /webhooks/instagram`: Instagram webhook verification for merchant's connected account
- `POST /webhooks/instagram`: Receive story_mention events on merchant's connected Instagram

### Instagram Integration

#### Account Verification (DM-based)
- **Flow**: Customers verify Instagram ownership by DMing a unique code to @joinspiral
- **How It Works**:
  1. Customer gets a 6-character verification code (24-hour expiry)
  2. Customer opens Instagram and DMs the code to @joinspiral
  3. Webhook receives DM, extracts Instagram user ID from sender metadata
  4. Code is matched and customer's Instagram is verified automatically
- **Follower Lookup**: RapidAPI (Instagram API - Fast & Reliable Data Scraper) fetches follower count
- **Code Table**: `spiral_codes` tracks verification sessions with status (pending/verified/expired)

#### Story Verification (Automated via Story Mention Webhook)
- **Architecture**: Fully automated using Instagram Messaging webhooks on the merchant's connected Instagram account
- **How It Works**:
  1. Customer posts Instagram Story and tags the merchant using @ mention sticker
  2. Instagram sends a `story_mention` event to our webhook via the Messaging platform
  3. Webhook extracts sender's scoped ID and story URL from the event payload
  4. System resolves sender identity: checks `merchant_scoped_user_map` first, then falls back to Instagram Profile API to resolve username
  5. Matches resolved customer to their pending order(s)
  6. Creates scoped ID mapping for future lookups and marks order as verified
  7. Sends confirmation DM to customer via Instagram API
- **Scoped ID Mapping**: Instagram sends merchant-scoped sender IDs (not global user IDs). The `merchant_scoped_user_map` table caches the mapping between scoped IDs and Spiral customer accounts for fast repeat lookups.
- **OAuth Scopes Required**: `instagram_basic`, `instagram_manage_messages`, `pages_show_list`, `pages_read_engagement`, `pages_manage_metadata`
- **Webhook Subscription**: Automatically subscribed to `messages` and `messaging_postbacks` fields on the Facebook Page after merchant connects Instagram

### Required Secrets
- `RAPIDAPI_KEY`: For fetching Instagram follower counts
- `FACEBOOK_APP_SECRET`: For webhook signature verification
- `SPIRAL_INSTAGRAM_ACCESS_TOKEN`: For receiving DMs to @joinspiral
- `SPIRAL_INSTAGRAM_BUSINESS_ID`: The Instagram business account ID for @joinspiral

### Order Status Flow
1. **Ordered** - Order placed, waiting for delivery
2. **Fulfilled/Shipped** - On the way to customer
3. **Delivered** - Arrived, customer sees "Post Your Story" prompt
4. **Verified** - Story mention detected via webhook, discount confirmed

### Verification Lifecycle (Simplified)
1. **pending**: Order placed/delivered, awaiting customer to post Instagram Story tagging merchant
2. **story_detected**: Story mention webhook received, matched to order
3. **verified**: Verification complete, discount confirmed

### Webhook Health Monitoring
- `store_settings.webhookSubscriptionStatus`: Tracks whether messaging webhook is active/inactive/failed
- `store_settings.lastWebhookReceivedAt`: Timestamp of most recent story mention received
- Displayed on merchant Connections page with visual status indicators

### Development & Build
- **TypeScript**: Strict mode, ESNext modules, path aliases.
- **Build**: Vite for client, esbuild for server (production), tsx for development.
- **Tools**: Replit-specific plugins, runtime error modal, Vite middleware for HMR.

## External Dependencies

### UI & Forms
- **Radix UI**: Accessible component primitives
- **Lucide React**: Icon library
- **React Hook Form**: Form state management
- **Zod**: Schema validation
- **date-fns**: Date manipulation

### Database & Backend
- **Neon Serverless PostgreSQL**: Cloud-native PostgreSQL
- **Drizzle ORM**: Type-safe database operations

## Design Principles

- **Minimal**: Clean layouts with generous white space
- **Calm**: Soft transitions, no aggressive animations
- **Trust-led**: Clear status indicators, honest language
- **Mobile-first**: Touch-friendly targets, thumb-zone navigation
- **Rewarding tone**: "You saved $12" not "Discount applied"

## Key User Flows

### First Launch / Onboarding
1. Welcome screen with value proposition
2. Continue to login/signup
3. Connect Instagram (optional, can skip)
4. Land on home dashboard

### Checkout Deep Link Flow
1. Customer taps "Check your Spiral discount" at checkout
2. App opens with checkout session token
3. Displays brand name and maximum discount
4. After confirmation, returns calculated discount to checkout

### Post-Delivery Verification (Automated)
1. Delivery notification triggers "Post Your Story" prompt in app
2. Customer posts Instagram Story tagging merchant's Instagram handle
3. Story mention webhook fires automatically to our server
4. System identifies customer via scoped ID mapping or profile API lookup
5. Order marked as verified, confirmation DM sent to customer
6. Customer sees "You saved $X!" celebration in app
