# Technology Stack

**Analysis Date:** 2026-04-25

## Languages

**Primary:**
- JavaScript (ES6+) - Frontend, Cloud Functions logic
- HTML5 - UI markup
- CSS3 - Styling and layout

**Configuration:**
- JSON - Firebase config, rules, package manifests

## Runtime

**Environment:**
- Node.js 20 - Cloud Functions runtime

**Package Manager:**
- npm - Primary package manager
- Lockfile: `functions/package-lock.json` present

## Frameworks

**Core:**
- Firebase SDK v9.22.2 (compat mode) - Backend, real-time database, authentication, hosting
- Vanilla JavaScript - No frontend framework; DOM manipulation via pure JS

**UI Components:**
- Chart.js v4.4.0 - Analytics visualization (admin analytics charts)

**Cloud Services:**
- Firebase Cloud Functions v5.0.0 - Scheduled tasks, onCall functions
- Firebase Admin SDK v12.0.0 - Server-side operations (user management, transactions)

## Key Dependencies

**Critical:**
- `firebase-functions@^5.0.0` - Cloud Functions framework for scheduled tasks and callable functions
  - Used for: StopLoss/TakeProfit triggers (checkOrders), weekly investor rating reset, password resets, inter-player transfers, tax collection
- `firebase-admin@^12.0.0` - Admin SDK for server-side operations
  - Used for: Secure Firestore writes, user deletion, batch transactions, FieldValue operations

**Infrastructure:**
- Binance API (HTTP REST) - Real-time price feeds
  - Endpoints: `https://api.binance.com/api/v3/ticker/24hr` (spot)
  - `https://fapi.binance.com/fapi/v1/ticker/24hr` (futures)
  - Used by: Crypto trading module (`crypto.js`), Cloud Function price checking
- Chart.js v4.4.0 - Admin analytics visualization

## Configuration

**Environment:**
- Cloud Functions deployed to `europe-west1` (not us-central1 — Binance blocks US IP)
- Firebase project: `gemini-3e76f`
- Firestore database: Default instance
- Hosting: Public directory is project root (`.`)

**Build:**
- No build step for frontend (served as-is)
- Cloud Functions require Node.js 20 runtime

**Deployment Configuration:**
- `firebase.json` defines:
  - Functions source: `functions/`
  - Firestore rules: `firestore.rules`
  - Hosting public directory: `.` (root)
  - Cache-Control headers: `no-cache, no-store, must-revalidate` for `.js`, `.css`, `.html`
  - SPA rewrite: all routes redirect to `/index.html`

## Platform Requirements

**Development:**
- Node.js 20+
- Firebase CLI for deployments
- Text editor (no build tools needed for frontend)

**Production:**
- Firebase Hosting
- Cloud Firestore
- Cloud Functions (europe-west1)
- Firebase Authentication

---

*Stack analysis: 2026-04-25*
