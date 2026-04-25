# Codebase Structure

**Analysis Date:** 2026-04-25

## Directory Layout

```
/Users/Aleks/Documents/gemi2/
├── index.html              # Single-page app root; defines all modals and sections
├── main.js                 # Core controller: auth, profile, rating, badges, quotes
├── crypto.js               # Trading module: buy/sell assets, SL/TP, price fetching
├── business.js             # Business module: income generation, workers, taxes, upgrades
├── deposit.js              # Investment module (DEPRECATED - Season 2; kept for reference)
├── transfer.js             # Player-to-player transfers (coins/CF) with autocomplete
├── shop.js                 # Item shop: upgrades, level requirements, badges
├── chat.js                 # In-game messaging between players
├── admin-actions.js        # Admin panel: CF adjustments, score request management
├── utils.js                # Shared utilities: modals, popups, toasts, HTML escaping
├── style.css               # Global styles (input fields, modals, cards, animations)
├── transfer.css            # Transfer form-specific styles
├── firebase.json           # Firebase project config (hosting, functions, firestore rules location)
├── firestore.rules         # Firestore security rules (role-based access control)
├── logo2.jpg               # App logo image
├── functions/              # Backend (Cloud Functions)
│   ├── index.js            # Main Cloud Functions file (checkOrders, trade commission, etc.)
│   ├── check-deposits.js   # Deprecated deposit compound interest logic
│   ├── check-user.js       # Verify user permissions
│   ├── reset-password.js   # Password reset HTTP function
│   ├── find-user.js        # User search function
│   ├── delete-user.js      # Account deletion function
│   ├── package.json        # Node.js 20 dependencies (firebase-admin, firebase-functions)
│   └── node_modules/       # Installed packages
├── .firebase/              # Firebase local cache (auto-generated)
├── .firebaserc             # Firebase project ID config
├── .git/                   # Git repository
├── .gitignore              # Git ignore rules (node_modules, .env, .DS_Store)
├── .planning/              # GSD planning documents (generated)
│   └── codebase/           # Architecture/structure/conventions docs
├── .claude/                # Claude Code project settings
├── README.md               # Project overview
├── PROJECT_VISION.md       # Product vision & target audience
├── DEPLOY_INSTRUCTIONS.md  # Deployment guide
└── CLAUDE.md               # Technical context for Claude (architecture, currencies, collections)
```

## Directory Purposes

**Root:**
- Purpose: Hosting root for Firebase Hosting + source code for feature modules
- Contains: Feature JS files, HTML template, CSS, images, Cloud Functions
- Key files: `index.html` (entry point), Firebase config files, main app modules

**functions/:**
- Purpose: Backend server-side operations
- Contains: Cloud Functions (scheduled tasks, HTTP endpoints, Firestore triggers)
- Key files: `functions/index.js` (price feeds, SL/TP checks, commission logging)
- Note: Deployed separately to Google Cloud region `europe-west1` (not US, to avoid Binance IP blocks)

**.firebase/:**
- Purpose: Local cache of deployed Firebase project state (emulator, credentials)
- Generated: Yes, by Firebase CLI
- Committed: No (in .gitignore)

## Key File Locations

**Entry Points:**
- `index.html`: Web app root; loads Firebase SDK, style.css, defers main.js
- `main.js`: Initializes Firebase, auth flow, profile loading, modal setup
- `functions/index.js`: Cloud Functions exports (scheduled tasks)

**Configuration:**
- `firebase.json`: Hosting rules, functions region (europe-west1), Firestore rules path
- `.firebaserc`: Firebase project ID (`gemini-3e76f`)
- `firestore.rules`: Security rules (auth checks, admin role enforcement)
- `functions/package.json`: Node.js 20, firebase-admin, firebase-functions versions

**Core Logic:**
- `main.js`: 108KB — auth, profile card, rating table, badge system, quotes (1/4 of app)
- `crypto.js`: 77KB — trading engine, price feeds, buy/sell/SL/TP logic (1/3 of app)
- `business.js`: 60KB — business management, workers, income, daily resets
- `transfer.js`: 6.5KB — peer transfers with autocomplete
- `shop.js`: 13KB — item catalog, level-gated upgrades, badge unlocks
- `deposit.js`: 34KB — deprecated; kept for reference (not used Season 2+)
- `admin-actions.js`: 6.3KB — admin CF management, score request UI
- `chat.js`: 13KB — in-game messaging

**Styling:**
- `style.css`: 88KB global styles (cards, modals, animations, input field defaults)
  - Critical rule: `input[type="number"] { !important }` at line 46 sets default padding/border/radius/font-size/background
  - All number input changes must respect this rule (don't inline override)
- `transfer.css`: 1KB transfer form specific styles

**Testing:**
- No test files present (no Jest, Vitest, or similar)

**Firestore Collections (defined in code + rules):**
- `users/{uid}` — Player profile document
- `businesses/{bizId}` — Business state with nested `work_logs` subcollection
- `transactions/{docId}` — Transfer history
- `score_requests/{docId}` — Pending stat submissions
- `exchange_trades/{docId}` — Trade audit log (immutable)
- `exchange_commissions/{docId}` — Admin commission aggregates (immutable)
- `tax_log/{docId}` — Business tax history (immutable)
- `deposits/{docId}` — Deprecated (Season 2 removed)

## Naming Conventions

**Files:**
- Camel case: `main.js`, `crypto.js`, `admin-actions.js` (hyphen for multi-word file names)
- CSS files: lowercase with hyphen: `transfer.css`
- No index.js pattern in root (root is flat, not nested module directories)

**JavaScript Functions:**
- Camel case: `setLoading()`, `showMsg()`, `getAsset()`, `bizDayKey()`
- Async functions prefixed or suffixed with async context: `fetchAssetPrice()`, `fetchAllPrices()`
- Firestore operations descriptive: `findUserByName()`, `getOrResetBizCapacity()`
- UI helpers start with verb: `showModal()`, `hideAllModals()`, `showPopup()`, `showToast()`

**Variables:**
- Global state: UPPERCASE_SNAKE_CASE for constants: `CRYPTO_COMMISSION`, `ENERGY_MAX`, `BUSINESS_STAGES`, `BADGES`, `BADGE_TIERS`
- Local/global: camelCase: `currentUser`, `cryptoPrices`, `ratingCache`, `currentCryptoAsset`
- Firestore refs: lowercase with `Ref`, `Snap`: `userRef`, `bizRef`, `transactionSnap`
- Private (convention, not enforced): prefix `_`: `_lastProfilePoints`, `_lastRenderedCryptoAsset`

**Types/Classes:**
- No explicit class definitions (vanilla JS)
- Configuration objects: PascalCase keys: `{ id: 'btc', name: 'Bitcoin', icon: '₿', color: '#f7931a', type: 'crypto', binance: 'BTCUSDT' }`
- Asset IDs: lowercase short: `btc`, `ton`, `eth`, `paxg`, `xag`, `tsla`, `meta`, `bz`, `aapl`, `nvda`
- Badge IDs: `game_1`, `game_4`, `win_1`, `win_3` (underscore for compound ID)

**DOM Elements:**
- Kebab case IDs: `login-section`, `register-section`, `profile-card`, `crypto-modal`, `admin-section`
- Classes: kebab case: `transfer-message`, `main-btn`, `score-btn`, `exchange-btn`, `autocomplete-list`
- Data attributes: `data-type`, `data-origText` (camelCase after `data-`)

## Where to Add New Code

**New Feature (Feature Module):**
- Primary code: Create `featureName.js` in root (e.g., `lottery.js`)
- Structure: 
  - Define constants at top (configs, rates, items array)
  - Export main UI render function (append form to `index.html` dynamically, or define in HTML)
  - Export setup/event handlers that run on `DOMContentLoaded`
  - Use `db`, `currentUser` globals from `main.js`
  - Use `showToast()`, `showPopup()`, `setLoading()` from `utils.js`
- Integration: 
  - Add button to profile card in `main.js` profile section render
  - Add modal div to `index.html` with ID matching `ALL_MODALS` array in `utils.js`
  - On button click: `showModal('featureName-modal')`

**New Component/Modal:**
- Implementation: Define HTML structure in `index.html` as hidden div
- Logic: Attach via `document.addEventListener('DOMContentLoaded', ...)` in feature module
- Styling: Add to `style.css` or create new `featureName.css` and link in `index.html`
- Visibility: Controlled by `showModal('featureName-modal')` from `utils.js`

**Utilities/Helpers:**
- Shared helpers: Add to `utils.js` (modal management, popups, toasts, HTML escaping)
- Feature-specific helpers: Keep in feature file (e.g., `getStage()` in `business.js`)
- Math/rounding: Define in feature file or utils; document rounding rules (coins to hundredths, CF unrounded)

**Cloud Functions:**
- Scheduled (Pub/Sub): Define in `functions/index.js` with `functions.region('europe-west1').pubsub.schedule(...)`
- HTTP endpoints: Define as `.https.onRequest()` in `functions/index.js`
- Firestore triggers: Define as `.firestore.document(...).onCreate()` in `functions/index.js`
- Helper functions: Keep in `functions/index.js` or split into `functions/helpers.js` if large
- Testing: Manual via Firebase Emulator Suite (no unit tests present)

**Firestore Collections:**
- New collection: Define read/write rules in `firestore.rules` before deploying
- New sub-collection: Nest under parent document path in rules
- Admin-only access: Use `isAdmin()` helper function in rules
- Immutable logs: Set `allow update, delete: if false;` in rules (like `exchange_trades`, `exchange_commissions`, `tax_log`)

**Styling:**
- Global styles: `style.css` (cards, modals, buttons, animations, input defaults)
- Feature-specific: Add to `style.css` if used in multiple places; create separate file only if >20 lines
- Input field styling: ALWAYS check `style.css:46` before adding inline styles to number inputs (will be overridden by !important rule)
- Mobile UX: Use flexbox, relative units (rem, %, vw), max-width constraints

## Special Directories

**.firebase/:**
- Purpose: Local Firebase CLI cache (emulator state, project credentials)
- Generated: Yes, by `firebase init` and `firebase emulate`
- Committed: No (.gitignore)

**.git/:**
- Purpose: Version control history
- Remote: GitHub `MrAleksby/gemi-2.0` main branch
- Deployment: `git push` after `firebase deploy`

**.planning/:**
- Purpose: GSD orchestrator planning documents (auto-generated)
- Generated: Yes, by `/gsd-map-codebase` agent
- Committed: Yes (planning docs should persist)

**.claude/:**
- Purpose: Claude Code settings, project context, conversation memory
- Generated: Partially (by Claude)
- Committed: Check `.gitignore` (likely yes for settings.json)

## Firestore Data Model

**users/{uid}:**
```javascript
{
  // Auth & Identity
  uid: string (document ID, matches auth UID)
  name: string (first + last name, Russian)
  phone: string (username for login)
  
  // Wallet
  coins: number (main currency, rounded to hundredths)
  exchangeCoins: number (coins on exchange balance)
  businessCoins: number (coins in business account)
  cf: number (premium currency, unrounded)
  points: number (XP, integer)
  
  // Game Stats (updated by score_requests approval)
  games: number (total matches played)
  wins: number (total victories)
  
  // Crypto Holdings (per asset)
  btcAmount: number, btcAvgPrice: number, btcStopLoss: number, btcTakeProfit: number
  tonAmount: number, tonAvgPrice: number, ... (same for ETH, PAXG, XAG, TSLA, META, BZ, AAPL, NVDA)
  
  // PnL Tracking
  totalPnl: number, weeklyPnl: number (profit/loss from trades)
  
  // Business Holdings
  businessStage: string (e.g., 'cart', 'kiosk', 'cafe', 'factory')
  
  // Shop Items (number of each owned)
  savings: number (level, max 25)
  ok4uStocks: number
  twobigStocks: number
  myt4uStocks: number
  
  // Admin & Approval
  isAdmin: boolean (false if not set)
  isApproved: boolean (false until trainer confirms)
  rejectionReason: string (if rejected)
  
  // Timestamps
  createdAt: timestamp
  lastLogin: timestamp
  
  // Notifications
  slTpNotifications: array (auto-sell alerts from Cloud Functions)
}
```

**businesses/{bizId}:**
```javascript
{
  ownerId: string (user UID who owns this business)
  stage: string ('cart', 'kiosk', 'cafe', 'factory')
  createdAt: timestamp
  
  // Daily Capacity (resets at 6:00 AM local time)
  dailyCapacity: number (max energy for day)
  energyUsed: number (energy spent today)
  lastReset: string (YYYY-MM-DD of last reset)
  
  // Workers
  workers: array of { name: string, stage: string (stage completed to hire), joinedAt: timestamp }
  
  // Finance
  totalIncome: number (cumulative earnings)
  taxes: number (cumulative taxes paid)
}
```

**Sub-collection:** `businesses/{bizId}/work_logs/{logId}`
```javascript
{
  energySpent: number
  incomeGross: number
  workersPayroll: number
  incomNet: number
  timestamp: timestamp
}
```

**transactions/{docId}:** (Player-to-player transfers)
```javascript
{
  from: string (sender UID)
  to: string (recipient UID)
  fromName: string, toName: string
  amount: number (coins or CF, amount)
  type: string ('coins' or 'cf')
  timestamp: timestamp
}
```

**score_requests/{docId}:** (Stat submission requests)
```javascript
{
  userId: string
  userName: string
  games: number
  wins: number
  cf: number
  points: number
  coins: number
  status: string ('pending', 'approved', 'rejected')
  rejectionReason: string (if rejected)
  createdAt: timestamp
  approvedAt: timestamp (if approved)
}
```

**exchange_trades/{docId}:** (Immutable trade log)
```javascript
{
  userId: string
  assetId: string
  type: string ('buy' or 'sell')
  amount: number (quantity of asset)
  price: number (price at time of trade)
  coinsGross: number
  commission: number
  coinsNet: number
  pnl: number (profit/loss)
  avgPrice: number (for buy orders)
  timestamp: timestamp
}
```

---

*Structure analysis: 2026-04-25*
