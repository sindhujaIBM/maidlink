# MaidLink — Features & Proposals

_Last updated: 2026-05-01_

## Status Legend
- ✅ **Done** — Implemented and deployed (or ready to deploy)
- 🔴 **P0** — Blocking revenue / operations
- 🟠 **P1** — Core marketplace trust
- 🟡 **P2** — Retention & growth
- 🟢 **P3** — Operational maturity
- 💡 **Idea** — Not yet prioritised

---

## Implemented

### Booking & Availability
- ✅ **Booking creation** — Concurrency-safe via PostgreSQL TSRANGE EXCLUDE constraint + SELECT FOR UPDATE
- ✅ **Booking completion flow** — Customer or maid can mark CONFIRMED → COMPLETED once start time has passed
- ✅ **Booking cancellation** — Customer or maid can cancel CONFIRMED bookings
- ✅ **Maid availability management** — Recurring weekly slots + one-off overrides (available/blocked)

### Maid Discovery
- ✅ **Maid listing & search** — Filter by postal code FSA, date, start time (covers slot + 3h), max rate, min rating, cleaning type (pre-fills booking form)
- ✅ **Maid detail page** — Profile, weekly availability, reviews, booking form; pre-fills slot/cleaning type from URL params passed by filters or chat

### Estimator
- ✅ **Cleaning time estimator** — Recalibrated formula: `base = bedrooms×0.6 + bathrooms×0.9 + sqft/500 + 0.25` (setup buffer) + 0.5h pack-down buffer before rounding; type/condition/pets/cooking multipliers and extras; rounding to 0.5h (≤4h) or 1h (>4h)
- ✅ **3-step AI estimator wizard** — Step 1: home details + live formula estimate; Step 2: per-room photo upload (min 5 / max 10 total, up to 5 per room); Step 3: AI results with room breakdown + checklist
- ✅ **Per-room AI analysis** — Nova Lite analyses photos labelled by room; returns per-room condition, minutes estimate, and priority tasks; overall 1/2-cleaner hour total
- ✅ **AI-generated cleaning checklist** — Customised per home from photos; tasks have priority (high/medium/standard) + AI note explaining why flagged; accordion UI; downloadable as PDF (room-by-room: AI highlights + full standard checklist per room, filtered by cleaning type)
- ✅ **Standard checklist data** — Full residential checklist in `frontend/src/data/cleaningChecklist.ts` by room and cleaning type; used as AI reference baseline
- ✅ **Estimator → booking hand-off** — S3 keys + AI checklist stored in sessionStorage and attached to booking; checklist available for maid job briefing

### Smart Scheduling
- ✅ **Floating AI chat widget** — Available on every page (bottom-right); collects date, time, cleaning type, postal code via conversation; shows matching available maids inline; clicking a maid pre-fills the booking form
- ✅ **Scheduler chat backend** — `POST /users/me/scheduler/chat`; stateless Nova Lite conversation with system prompt; parses `BOOKING_INTENT:{...}` token from AI response

### Profiles & Trust
- ✅ **Reviews & ratings** — 1–5 star + text review after COMPLETED booking; average shown on maid card and detail page
- ✅ **Maid verification badge** — Admin-controlled; verified badge displayed on card and profile
- ✅ **Before/after photos** — Maid uploads completion photos; customer can view before (estimator) and after photos on booking detail

### Maid Dashboard
- ✅ **Maid earnings dashboard** — Total earned, this month, pending, completed and upcoming booking lists

### Estimator History
- ✅ **Customer estimate history** — `/estimate/history`: expandable cards per past estimate; shows home details, condition, hours, AI assessment, photos (lightbox), room breakdown, checklist, PDF download, and "Book a cleaner" link
- ✅ **Admin estimator usage view** — `/admin/estimator`: all customers' estimates with user name/email/avatar, paginated; same card layout as customer history; linked from Admin Dashboard; upgrade recommendation shown inline
- ✅ **Estimator upgrade comparison card** — When AI recommends an upgrade, results page shows side-by-side Option C stacked cards: current plan (tasks + hours) with booking CTA, connector strip with AI reason, upgrade card (brand-coloured, benefits list, booking CTA); calculates upgrade hours live
- ✅ **Coverage review before AI analysis** — Before triggering AI, shows a room coverage panel with photo counts; "Add missing photos" auto-scrolls to first uncovered room; "Analyse anyway" bypasses
- ✅ **Dark room detection** — Camera capture shows non-blocking amber warning after 0.7s of detected low brightness (canvas pixel sampling reuses existing stability loop data)

### Admin
- ✅ **Admin maid approval queue** — Approve/reject maid profiles; verification badge management
- ✅ **Maid application email notification** — SES email sent to muni@maidlink.ca on every become-a-maid form submission; includes all applicant fields; fire-and-forget (does not block 201 response)
- ✅ **Admin estimator feedback (human-in-the-loop)** — Admin can review any customer estimate, optionally adjust hours, add a specialist note, and optionally send an SES email to the customer; `admin_feedback` JSONB stored in DB; "Reviewed ✓" badge on admin and customer history cards; customer sees adjusted hours + specialist note in their estimate history

### Infrastructure
- ✅ **RDS PostgreSQL t3.micro** — Migrated from Aurora Serverless v2 (~$52/mo) to RDS PostgreSQL 15.8 t3.micro (~$13-15/mo); same VPC, same pg driver, zero-downtime data migration via one-shot Lambda
- ✅ **SES bounce & complaint handling** — SES Configuration Set + SNS topic → Lambda; bounces and complaints trigger admin email alert to muni@maidlink.ca; all outbound emails use ConfigurationSetName; deployed to us-east-1 (SES not available in ca-west-1)
- ✅ **React error boundary** — Top-level class component catches unhandled render errors; shows user-friendly fallback with refresh button; logs to console

### Auth & Security
- ✅ **JWT refresh tokens** — 30-day rotating refresh tokens stored in DB; single-use rotation; silent refresh on 401; auto-refresh on app load if access token expired; logout clears refresh token
- ✅ **Booking soft deletes** — Cancellations record `cancelled_at`, `cancelled_by`, `cancellation_reason` instead of hard-deleting

### Landing Page
- ✅ **Landing page redesign (Direction A — Warm & Homey)** — Full 11-section page: sticky nav, split hero with live estimate form, trust strip, How it works, Services, Reasons, Reviews, Areas, Become a Maid band, FAQ accordion, final CTA, dark-teal footer with sitemap; Fraunces serif headings; estimate form wired to `calcHours()`

### SEO & Analytics
- ✅ **Per-page meta tags** — `react-helmet-async` sets unique `<title>`, `<meta description>`, Open Graph, and canonical URL on all 4 public pages (`/`, `/maids`, `/estimate`, `/become-a-maid`)
- ✅ **Local Business JSON-LD** — `HomeAndConstructionBusiness` structured data on homepage; includes `areaServed: Calgary`, service types, address region
- ✅ **robots.txt + sitemap.xml** — Blocks auth/admin routes; sitemap covers 4 public URLs with priorities; submitted to Google Search Console (4 pages discovered)
- ✅ **Google Analytics 4** — GA4 tag (`G-PTB1W634BF`) in `index.html`; tracks all page views automatically
- ✅ **Bundle code splitting** — `jspdf` + `html2canvas` (PDF export) and `qrcode.react` lazy-loaded on demand; main bundle reduced from 870KB → 462KB gzip

### Testing
- ✅ **Vitest unit test suite** — 88 tests across 6 files; covers shared validation, JWT, errors, booking pricing, tstzrange builder, and estimator calc formula; runs in 235ms with no DB or AWS required (`npm test`)
- ✅ **Integration test suite** — 14 tests across 2 files (`booking`, `estimator-ratelimit`); requires Docker Postgres; run with `npm run test:integration`

---

## Roadmap

### P0 — Blocking Revenue

#### Admin service has no handlers
`services/admin/` is a stub (only `package.json` + `tsconfig.json`). `AdminBookingsPage.tsx` calls `listAdminBookings` which does not exist in the repo — the admin bookings page is broken in production. Needs: `listAdminBookings` handler, route registration in `serverless.yml`, `withAuth(['ADMIN'])` guard, and basic cursor pagination.

#### Payments (Stripe)
`total_price` is calculated and stored but no money moves. Stripe Payment Intents: hold at booking time, capture on completion, refund on cancellation.

#### Transactional Emails
Maid application intake → admin notification is live. Still missing: booking confirmed, 24h reminder, cancellation, maid approved/rejected.

---

### P1 — Core Trust

#### Cleaning type filter misleads users — `MaidListPage`
The "Cleaning type" dropdown appears as an active filter chip after search but doesn't actually filter maids — it only pre-fills the booking form. Either wire it up server-side or remove it from the filter form entirely and pass it silently as a query param.

#### MaidDetailPage: `navigate(-1)` breaks on direct links
Back button uses `navigate(-1)` — if the user arrives from an external link or bookmark, this takes them somewhere outside the app. Fix: `navigate('/maids')` as a default, or check `document.referrer` first.

#### Cancellation Policy & Refund Logic
Free cancellation 48h+, 50% within 24h, no refund same-day. Protects maid income. Requires Payments first.

---

### P2 — Retention & Growth

#### Missing `<title>` on authenticated pages
`BookingsPage`, `DashboardPage`, `ProfilePage`, `MaidSetupPage`, `AvailabilityPage`, `EarningsPage` have no Helmet title — browser tab shows the last-set title (usually the home page). Add `<Helmet><title>Page Name — MaidLink</title></Helmet>` to each, or add a `title` prop to `Layout`.

#### Slot picker is a cramped scroll box — `MaidDetailPage`
`max-h-48 overflow-y-scroll` inside a sticky panel is hard to scan across many slots. Group by date with date headers, or show a compact calendar where clicking a date expands that day's slots.

#### Bio character counter + rate range hint — `MaidSetupPage`
Bio `<textarea>` has no `maxLength` and no live counter. Hourly rate has no suggested range. Add `maxLength={500}`, a live `X / 500` counter, and helper text like `"$25–$50/hr is typical in Calgary"`.

#### MaidCard "No bio yet." placeholder text
`maid.bio || 'No bio yet.'` is developer copy, not customer copy. Replace with `"Available for bookings in Calgary"` or omit the line entirely when bio is empty.

#### StarRating renders `<button>` when non-interactive — `StarRating.tsx`
When `interactive={false}`, the component still renders `<button>` elements which are in the tab order. Render `<span>` instead so display-only stars are inert in the DOM.

#### Recurring Bookings
"Every Friday at 10am" — the #1 retention driver. `booking_series` table + interval logic + auto-generation of future bookings.

#### Customer Saved Preferences
Save address and favourite maids. Auto-populate address on booking form. "Favourite" list on customer profile.

---

### P3 — Operational Maturity

#### Two NavBar implementations — `HomePage` vs `Navbar.tsx`
`HomePage.tsx` has its own local `NavBar` (anchor links, no beta banner, no chat widget). Shared `Navbar` is a completely separate component. Beta banner and `SchedulerChat` never appear on the home page; nav changes need to be made in two places. Extract the anchor-link nav into a prop/mode on the shared `Navbar`, or document the intentional split.

#### `useIsMobile` hook duplicated — `HomePage.tsx` + `Navbar.tsx`
Defined identically in both files. Extract to `src/hooks/useIsMobile.ts` and add ~150ms debounce to the resize listener.

#### `SchedulerChat` always mounted in Layout
Every page that uses `Layout` mounts the floating chat widget — distracting on focused forms (maid application, availability setup). Add a `hideChat?: boolean` prop to `Layout`.

#### Verify `animate-marquee` Tailwind keyframe — `tailwind.config.js`
`animate-marquee` is not a built-in Tailwind utility. If `keyframes.marquee` isn't defined in the config, the beta banner renders static. Confirm the config has the keyframe or the animation plays correctly in production.

#### Calgary FSA codes duplicated — `frontend/constants` + `@maidlink/shared`
Same FSA list defined in two places. Frontend should import from `@maidlink/shared` so adding a new FSA code only needs one change.

#### CORS `Allow-Origin: *` should be locked to production domain
`errors.ts` and `withAuth.ts` return `Access-Control-Allow-Origin: *`. Fine for MVP with header-based auth, but should be locked to `https://maidlink.ca` before launch.

#### No DB-level validation on `service_area_codes` — `maid_profiles`
`TEXT[]` column accepts arbitrary strings. A check constraint or trigger could validate against known Calgary FSA codes.

#### `PENDING` booking status has no code path
`BookingStatus` includes `'PENDING'` but bookings default to `'CONFIRMED'`. Either add an admin approval flow that creates `PENDING` bookings, or remove `PENDING` from the type to avoid confusion.

#### MaidBookingsPage: shared file input ref can desync
A single `<input ref={fileInputRef}>` is shared across all booking rows; active booking tracked via `pendingBooking.current`. If two uploads are triggered quickly the ref can get out of sync. Move the input inside each row or use separate controlled state per row.

#### Privacy Policy, Terms & Conditions, Cookie Notice
Required for PIPEDA / Alberta PIPA compliance. Disclose: Google OAuth, AWS (S3/Lambda/Aurora — ca-west-1), GA4, Amazon Bedrock (photos). Cookie notice needed for GA4 (CASL). Footer links already stubbed as `href="#"`.

#### Admin: Dispute Resolution
Dispute flag on bookings; admin can manually complete or refund. Needed once payments exist.

---

## Architectural Concerns

These are known gaps in the current architecture — not blocking for MVP but important before scaling.

| Concern | Impact | Notes |
|---------|--------|-------|
| **RDS cold starts** | ~500ms first request after Lambda cold start | No RDS Proxy; direct Lambda→RDS connection. Consider RDS Proxy once traffic picks up. |
| **No API rate limiting on auth endpoints** | Abuse / cost | `POST /auth/google` has no rate limiting. API Gateway WAF or a Lambda-level counter would prevent brute-force. AI endpoints (Bedrock) are especially exposed — only a DB-level daily limit exists on the estimator. |
| **AI calls are synchronous** | 10–30s Lambda timeout risk | Bedrock InvokeModel is called inline. Under load or model latency spikes, Lambdas can timeout. Consider SQS + async processing with WebSocket/polling for Bedrock calls. |
| **Refresh token storage (localStorage)** | XSS risk | Refresh tokens in localStorage are accessible to JS. HttpOnly cookies would be more secure but require same-domain backend or a BFF layer. Acceptable for MVP. |
| **No token revocation on logout** | Stolen token usable until expiry | Access tokens aren't revoked server-side on logout. A token blocklist (Redis or DB) would fix this. Refresh tokens rotate on use (single-use) but the access token remains live until expiry. |
| **Duplicate `/auth/me` and `/users/me` endpoints** | Maintenance burden | Both hit the `users` table and return similar shapes. Schema changes need updating in two places. Consolidate post-MVP. |
| **Google `tokeninfo` endpoint soft-deprecated** | Future breakage risk | `verifyIdToken` calls Google's tokeninfo endpoint. Google recommends `google-auth-library` for local JWKS verification (no round-trip, no rate limit). Post-MVP item. |

---

## AI Ideas

### Done
- ✅ AI photo estimator — 3-step wizard, per-room analysis, Nova Lite (us-west-2)
- ✅ AI-generated cleaning checklist — per home, per room, from photos, downloadable
- ✅ Smart scheduling chat widget

### Ready to Build
- **Post-cleaning report** — Maid uploads before/after photos; AI generates a short summary report (what was cleaned, condition change) emailed to the customer. Low effort given existing Bedrock + S3 setup.
- **Review summarization** — Auto-summarize a maid's reviews into 2–3 bullet points shown on the profile card. No new infra needed.

### Estimator: Photo Capture Enhancements
Two UX improvements to the live camera step in `CameraCapture.tsx`:

**1. Desktop → Mobile nudge**
- Detect non-mobile device (`window.innerWidth > 768` or `navigator.userAgent` check)
- Show a dismissible banner above the upload area: *"For best results, use your phone — photos taken with your camera give the AI much better detail"*
- Include a QR code (e.g. `qrcode.react` library) pointing to the current page URL so the user can instantly switch devices
- Banner should only show in Step 2 (photo upload step), not everywhere

**2. Room-specific shot guide (Turo-style)**
- Replace the generic 4-angle `GUIDED_ANGLES` array in `CameraCapture.tsx` with per-room shot lists
- Each shot has: `label` (e.g. "Top of stove"), `hint` (1-line instruction), and optionally an `icon` or small illustration (SVG or emoji stand-in) showing the angle/area
- Example shot lists:
  - **Kitchen**: Top of stove · Inside oven · Sink & countertops · Fridge front
  - **Bathroom**: Toilet & floor · Shower/tub · Vanity & mirror
  - **Bedroom**: Full room from doorway · Closet · Floor & corners
  - **Living Room**: Full room · Couch area · Windows & floors
  - **Basement / Garage**: Full-width panoramic · Floor condition · Any clutter/storage
- The capture UI cycles through the shot list in order (same ring-progress mechanic already in place), showing the shot label + hint + illustration as an overlay before the user frames the shot
- Fall back to current generic 4-angle scan for any room not in the list
- `maxCaptures` stays as the hard cap; shot list just sets the guided sequence length (can be shorter)

### Medium Effort
- **Personalized maid recommendations** — Rank maids on the listing page based on the customer's past bookings, stated home type, and cleaning preferences. Requires storing customer preferences.
- **Maid earnings optimizer** — Suggest optimal availability windows based on demand patterns (most-requested days/times in each FSA). Needs enough booking data to be meaningful.

### Larger Scope
- **Demand forecasting** — Predict busy periods in Calgary so the platform can prompt maids to open availability or run promotions.
- **Anomaly detection** — Flag suspicious bookings or reviews (price manipulation, fake reviews, fraud patterns). Admin-facing.
- **Job briefing for maids** — AI-generated checklist already stored in sessionStorage at booking time. Next step: surface it on the maid's booking detail page and optionally email it via SES. Low effort from current state.
