# Spiral Merchant Dashboard - Design Guidelines

## Design Approach
**System-Based with Shopify Context**: Clean admin interface optimized for iframe embedding within Shopify admin, using modern SaaS dashboard patterns inspired by Linear, Stripe Dashboard, and Notion.

## Core Design Elements

### Typography
- **Headings**: Inter or DM Sans, bold (font-bold), sizes: text-2xl for page titles, text-xl for section headers, text-lg for card titles
- **Body**: Same font family, regular weight (font-normal), text-base for primary content, text-sm for secondary info
- **Data/Numbers**: font-semibold for metrics and statistics
- **Hierarchy**: Use bold typography as specified - make headings stand out with strong weight contrast

### Layout System
**Spacing Units**: Tailwind units of 3, 4, 6, 8, 12 (p-4, mb-6, gap-8, etc.)
- Sidebar: Fixed width w-64, full height
- Main content: p-8 padding, max-w-7xl container
- Cards: p-6 internal padding, mb-6 spacing between
- Component spacing: gap-4 for tight grouping, gap-6 for section separation

### Component Library

**Sidebar Navigation**
- White background (bg-white), subtle right border (border-r)
- Logo/branding at top (mb-8)
- Navigation items: px-4 py-3, rounded-lg, hover:bg-gray-50 transition
- Active state: bg-blue-50 with text-blue-600
- Icons: 20px (w-5 h-5) from Heroicons, positioned left of text

**Cards**
- White background (bg-white), rounded-xl, shadow-sm
- Consistent p-6 padding
- Subtle border (border border-gray-100) for definition

**Status Indicators**
- Token health: Inline flex items (flex items-center gap-2)
- ✅ Active: Green badge (bg-green-100 text-green-700 px-3 py-1 rounded-full text-sm font-medium)
- ❌ Expired: Red badge (bg-red-100 text-red-700 px-3 py-1 rounded-full text-sm font-medium)

**Tables (Verifications Page)**
- Minimal styling: border-collapse, border border-gray-200
- Headers: bg-gray-50, font-semibold, text-left, px-4 py-3
- Rows: hover:bg-gray-50 for interactivity, px-4 py-3
- Alternating rows optional for readability

**Form Controls (Discount Rules)**
- Input fields: border border-gray-300, rounded-lg, px-4 py-2, focus:ring-2 focus:ring-blue-500
- Labels: text-sm font-medium text-gray-700, mb-2
- Tier editor: Grid layout (grid grid-cols-3 gap-4) for follower range, discount %, and actions

**Buttons**
- Primary: bg-blue-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-blue-700
- Secondary: border border-gray-300 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-50
- Sizes: Standard py-2 px-4, Small py-1.5 px-3 text-sm

### Color Palette (Reference Only for Structure)
- Primary action: Blue (Tailwind blue-600)
- Success: Green (green-600)
- Error: Red (red-600)
- Backgrounds: White primary, gray-50 secondary
- Text: gray-900 primary, gray-600 secondary, gray-400 tertiary
- Borders: gray-200 standard, gray-300 inputs

### Page-Specific Layouts

**Home Dashboard**
- Three-card grid: grid grid-cols-1 md:grid-cols-3 gap-6
- Each card shows: Icon, label (text-sm text-gray-600), value (text-xl font-bold)
- Store name card, Instagram handle card, Token health card

**Discount Rules**
- Header with "Add Tier" button (top-right)
- Each tier as a card with editable inputs in three-column layout
- Clear visual separation between tiers (mb-4)
- Save button at bottom-right of each tier card

**Verifications**
- Table with columns: Shopper Email, Instagram Handle, Follower Count, Post Link, Status, Date
- Status badges using same pattern as token health
- Pagination controls at bottom (if needed)

### Animations
**Minimal and Functional Only**
- Hover transitions: transition-colors duration-150
- No page transitions, no scroll animations, no complex effects
- Focus on instant, responsive feel

## Images
No hero images needed - this is an admin dashboard. Use Heroicons for all iconography (Home, Settings, CheckCircle, XCircle, Users, etc.)