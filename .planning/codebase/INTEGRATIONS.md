# External Integrations

**Analysis Date:** 2026-04-25

## APIs & External Services

**Price Data:**
- Binance REST API - Cryptocurrency and futures price feeds
  - SDK/Client: Direct HTTP fetch (no SDK)
  - Endpoints:
    - Spot: `https://api.binance.com/api/v3/ticker/24hr`
    - Futures: `https://fapi.binance.com/fapi/v1/ticker/24hr`
  - Used in: `crypto.js` (front-end trading), `functions/index.js` (Cloud Function price checking)
  - Timeout: 7 seconds per request with AbortController
  - Region: europe-west1 for Cloud Functions (US IPs are blocked by Binance)

## Data Storage

**Databases:**
- Cloud Firestore (Firebase)
  - Connection: Initialized in `main.js` with project credentials
  - Client: Firebase SDK v9.22.2 (compat mode)
  - Admin access: Firebase Admin SDK v12.0.0 in Cloud Functions

**Collections:**
- `users` - Player profiles (coins, cf, points, level, isAdmin flag)
- `transactions` - Transfer history (coins/CF between players)
- `score_requests` - Admin approval queue for player statistics
- `exchange_trades` - Immutable log of all crypto trades
- `exchange_commissions` - Trade commission records (admin read-only)
- `tax_log` - Withdrawal tax history (admin read-only)
- `businesses` - Business ownership and details
- `deposits` - Investment/deposit records (deprecated in Season 2)
- `job_board` - Available job listings
- `weekly_winners` - Weekly investor ranking winners
- `admin_logs` - Admin action audit trail (admin read-only)
- `chats/{chatId}/messages` - Direct chat messages between players
- `usernames` - Phone number to UID mapping

**File Storage:**
- Local filesystem only - No cloud storage (images/assets served from hosting root)

**Caching:**
- Client-side in-memory caches:
  - `ratingCache` in `main.js` - Rating leaderboard (30 second TTL)
  - `cryptoPrices` in `crypto.js` - Asset prices (30 second TTL)

## Authentication & Identity

**Auth Provider:**
- Firebase Authentication (email/password auth via phone number)
  - Implementation: Custom email/password flow using phone as username
  - User registration: `register-form` in `index.html`
  - User login: `login-form` in `index.html`
  - Session: Firebase Auth compat SDK session management
  - Admin role: Determined by `isAdmin: true` boolean field in user document (not by name)
  - Password reset: Cloud Function `resetUserPassword` (admin-only)

## Monitoring & Observability

**Error Tracking:**
- None detected - No error tracking service integrated

**Logs:**
- Cloud Function console logs via `console.log()` and `console.error()`
- Firestore transaction logging via collections:
  - `exchange_trades` - All trades logged
  - `exchange_commissions` - Commission tracking
  - `tax_log` - Tax payment history
  - `admin_logs` - Admin action audit trail

## CI/CD & Deployment

**Hosting:**
- Firebase Hosting - Serves static assets and SPA

**CI Pipeline:**
- Manual deployment via Firebase CLI commands:
  ```
  firebase deploy              # All (hosting + functions + firestore rules)
  firebase deploy --only hosting  # Frontend only (fastest)
  ```
- GitHub: `MrAleksby/gemi-2.0` repository (main branch)

**Scheduled Cloud Functions:**
- `checkOrders` - Every 1 minute (Check SL/TP triggers)
  - Region: europe-west1
  - Schedule expression: `every 1 minutes`
- `resetWeeklyInvestorRating` - Weekly (Monday 20:00 Tashkent time = 15:00 UTC)
  - Region: europe-west1
  - Schedule expression: `0 15 * * 0`
  - TimeZone: `Asia/Tashkent`

## Environment Configuration

**Firebase Project Config:**
```javascript
{
  apiKey: "AIzaSyBAq3RVzn-riWlpQEFLWJebPFqzSaoAtm8",
  authDomain: "gemini-3e76f.firebaseapp.com",
  projectId: "gemini-3e76f",
  storageBucket: "gemini-3e76f.appspot.com",
  messagingSenderId: "698666508962",
  appId: "1:698666508962:web:7f13c14e154819d6f6edfb"
}
```

**Cloud Functions Configuration:**
- Runtime: Node.js 20
- Region: europe-west1
- Entry point: `functions/index.js`

**Secrets location:**
- No .env files detected
- Firebase credentials embedded in `main.js` (public config, not sensitive)
- Service account key for Cloud Functions: `functions/serviceAccountKey.json` (not committed, downloaded from Firebase Console)

## Webhooks & Callbacks

**Incoming:**
- None - No webhook endpoints

**Outgoing:**
- None - No external webhook calls made

## Real-time Features

**Firestore Listeners:**
- `onSnapshot()` for real-time updates:
  - Admin pending registrations list
  - Player profile changes
  - Chat messages
  - Score request updates
- Unsubscribe functions stored and cleaned up to prevent memory leaks

---

*Integration audit: 2026-04-25*
