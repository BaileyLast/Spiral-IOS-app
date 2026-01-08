# Spiral Customer App

## Overview

Spiral is a customer-facing mobile application that allows shoppers to earn instant discounts at checkout by agreeing to post one Instagram Story after delivery. The app handles login & identity, Instagram connection, follower verification, order tracking, posting reminders, and post verification status. Designed with minimal, calm, trust-led principles inspired by Klarna and Apple.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend
- **Framework**: React 18 with TypeScript, Vite for build and development.
- **UI/UX**: Mobile-first design with shadcn/ui components, Tailwind CSS. Minimal, calm aesthetic with trust-led interactions.
- **Layout**: Bottom navigation bar with Home, Orders, Profile tabs. Single-column mobile layouts.
- **State Management**: React Query for server state, localStorage for customer session.
- **Theming**: HSL-based color system with CSS custom properties, branded purple primary color, soft status colors for order states.
- **Design**: Rounded cards (rounded-2xl), generous padding, soft shadows, mobile-safe areas.

### Pages
- **Onboarding** (`/`): Welcome screen explaining value proposition with Get Started CTA
- **Login** (`/login`): Email/password authentication with signup toggle
- **Instagram Connect** (`/connect-instagram`): Connect Instagram to verify follower count
- **Home** (`/home`): Dashboard with stats, pending actions, recent orders
- **Orders** (`/orders`): List of all orders with status badges and deadlines
- **Order Detail** (`/orders/:id`): Progress timeline, discount info, posting instructions
- **Profile** (`/profile`): Account info, Instagram status, settings, logout

### Backend
- **Server**: Express.js with middleware for request handling, logging, and JSON body parsing.
- **Data Layer**: Drizzle ORM with PostgreSQL (Neon serverless) for type-safe operations.
- **Data Models**:
    - `store_settings`: Shopify and Instagram OAuth data, store configuration, Spiral settings.
    - `discount_tiers`: Follower ranges mapped to discount percentages.
    - `verifications`: Story post verification records.
    - `spiral_customers`: Customer accounts with Instagram credentials.
    - `orders`: Order tracking with discount info and verification status.

### Customer API Endpoints
- `POST /api/customer/signup`: Create new customer account
- `POST /api/customer/login`: Authenticate customer
- `POST /api/customer/logout`: End session
- `POST /api/customer/connect-instagram`: Link Instagram account (mock for demo)
- `POST /api/customer/disconnect-instagram`: Unlink Instagram account
- `GET /api/customer/orders`: Get customer's orders
- `GET /api/customer/orders/:id`: Get single order details
- `GET /api/customer/stats`: Get total saved and orders completed

### Order Status Flow
1. **Ordered** - Order placed, waiting for delivery
2. **Fulfilled/Shipped** - On the way to customer
3. **Delivered** - Arrived, prompting customer to share story
4. **Awaiting Story** - Countdown timer active, customer needs to post
5. **Verified** - Story confirmed, discount kept
6. **Reversed** - Story not detected, clawback triggered

### Verification Lifecycle
1. **pending**: Order delivered, awaiting customer to post Instagram story
2. **story_detected**: Story found tagging brand, 22-hour timer starts
3. **verified**: Story confirmed still up after 22 hours, discount confirmed
4. **failed**: Story removed or never posted, clawback triggered

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

### Post-Delivery Verification
1. Delivery notification triggers "Share your story" prompt
2. Customer posts Instagram Story tagging brand
3. Story detected, 22-hour verification timer starts
4. If verified: discount confirmed, celebration state
5. If failed: calm explanation of reversal
