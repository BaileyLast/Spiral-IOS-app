# Spiral Customer App - Design Guidelines

## Design Approach
**Minimal, Calm, Trust-Led**: Consumer mobile-first application inspired by Klarna, Apple, and modern fintech apps. The experience should feel rewarding, not transactional. No gamification noise, no influencer cringe.

## Core Design Principles
- **Minimal**: Clean layouts with generous white space, focused content
- **Calm**: Soft transitions, no aggressive animations, passive encouragement
- **Trust-led**: Clear status indicators, honest language, no dark patterns
- **Mobile-first**: Touch-friendly targets, thumb-zone navigation, single-column layouts

## Core Design Elements

### Typography
- **Headings**: Inter, semibold (font-semibold), sizes: text-2xl for page titles, text-xl for section headers
- **Body**: Inter, regular weight (font-normal), text-base for primary content, text-sm for secondary info
- **Data/Numbers**: font-semibold for discounts and key metrics
- **Tone**: Rewarding language, calm and supportive, never pushy or transactional

### Color Palette
- **Primary**: Purple (brand color from merchant app) - used sparingly for key actions and accents
- **Success**: Soft green for verified status, discounts earned
- **Warning**: Soft amber for pending actions, deadlines
- **Error**: Soft red for failed verifications (used calmly, not alarming)
- **Backgrounds**: Clean white primary, soft gray-50 secondary
- **Text**: gray-900 primary, gray-500 secondary, gray-400 tertiary

### Layout System
**Mobile-First Spacing**: Tailwind units of 4, 6, 8, 12
- Main content: px-6 padding on mobile, max-w-md container centered
- Cards: p-5 internal padding, rounded-2xl for soft appearance
- Component spacing: gap-4 for groupings, gap-6 for sections
- Bottom navigation: Fixed, h-16, with safe area padding

### Component Library

**Bottom Navigation**
- Fixed at bottom, full width
- 4-5 items max: Home, Orders, Profile
- Active state: Primary color with filled icon
- Inactive: Gray muted icons
- Touch targets: min 44px

**Cards (Order Cards, Status Cards)**
- White background (bg-white), rounded-2xl, subtle shadow-sm
- Consistent p-5 padding
- Soft border (border border-gray-100)
- Brand/Store name prominent at top
- Status badge aligned right

**Status Badges**
- Rounded-full pills
- Status colors:
  - Ordered: bg-gray-100 text-gray-600
  - Delivered: bg-blue-100 text-blue-600
  - Awaiting Story: bg-amber-100 text-amber-700
  - Verified: bg-green-100 text-green-700
  - Reversed: bg-red-100 text-red-600

**Buttons**
- Primary: bg-primary text-white rounded-xl py-4 font-medium (full width on mobile)
- Secondary: bg-gray-100 text-gray-700 rounded-xl py-4
- Ghost: text-primary for text links
- All buttons: min-h-12 for touch targets

**Progress Indicators**
- Countdown timers: Soft, not alarming
- Progress bars: Rounded, primary color fill
- Step indicators: Minimal dots or subtle line

**Profile Elements**
- Avatar: Rounded-full, with IG profile photo if connected
- Stats: Simple number + label pairs
- Settings items: Full-width touch rows with chevron

### Onboarding Flow
- Full-screen pages with centered content
- Large friendly illustrations or icons (not images)
- Single primary CTA per screen
- Progress dots if multi-step
- Skip option visible but subtle

### Order Flow States
1. **Ordered** - Neutral, waiting for delivery
2. **Delivered** - Active, prompting to share
3. **Awaiting Story** - Countdown visible, gentle reminder
4. **Verified** - Celebration moment, discount confirmed
5. **Reversed** - Calm explanation, no blame

### Animations
**Subtle and Purposeful Only**
- Page transitions: Gentle fade or slide
- Success states: Soft scale-up with checkmark
- Loading: Simple spinner or skeleton
- No bouncy animations, no confetti

### Safe Areas
- Top: Account for notch/dynamic island
- Bottom: Account for home indicator + nav bar

### Accessibility
- Touch targets: 44px minimum
- Color contrast: WCAG AA compliant
- Clear focus states
- Readable font sizes (16px base minimum)

## Page-Specific Guidelines

### Onboarding
- Center-aligned content
- Illustration/icon at top (40% of screen)
- Headline + supporting text (rewarding tone)
- Single CTA button at bottom

### Login/Signup
- Email-first, minimal friction
- Social sign-in options if available
- Password field with show/hide toggle
- Friendly error messages

### Instagram Connection
- Explain value proposition clearly
- Show what data is accessed (follower count only)
- Connected state shows handle + follower band
- Easy disconnect option in settings

### Orders List
- Simple list of order cards
- Most recent at top
- Tap to expand/view details
- Empty state with friendly message

### Order Detail
- Brand at top with logo if available
- Discount amount prominent
- Timeline/status progress
- Action buttons contextual to status
- Posting instructions clear but calm

### Profile
- Connected IG at top with handle
- Follower band (not exact number)
- Stats: Discounts earned, orders completed
- Settings: Notifications, Disconnect IG, Delete account
- Version number at bottom

## Language Guidelines
- **Rewarding**: "You saved $12" not "Discount applied"
- **Calm**: "Your order is on the way" not "ORDER SHIPPED!"
- **Trust**: "We only check your follower count" not "Connect Instagram"
- **Encouraging**: "Almost there!" not "ACTION REQUIRED"
- **Honest**: "The discount was reversed" not "You lost your discount"
