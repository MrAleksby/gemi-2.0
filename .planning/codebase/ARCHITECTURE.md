# Architecture

**Analysis Date:** 2026-04-25

## Pattern Overview

**Overall:** Monolithic Vanilla JS + Firebase Backend

Gemi is a single-page application (SPA) with vanilla JavaScript, Firebase Firestore for data persistence, Cloud Authentication, and serverless Cloud Functions. The architecture separates concerns into feature modules (crypto trading, business management, deposits, transfers) that interact through a shared Firebase real-time database layer.

**Key Characteristics:**
- Single HTML entry point (`index.html`) with modular JS files for each feature
- Real-time Firestore listeners for profile, ratings, and admin requests
- Client-side state management via global variables and DOM manipulation
- Cloud Functions handle server-side operations (SL/TP checks, tax calculations, price feeds)
- Role-based access control (admin flag on users documents) enforced by Firestore security rules
- Mobile-first UI with modals and cards for feature navigation

## Layers

**Presentation (Client):**
- Purpose: Render UI, handle user interactions, show/hide modals
- Location: `index.html`, `style.css`, `transfer.css`
- Contains: HTML structure, CSS styling, modal management via `utils.js`
- Depends on: Firebase SDK, feature modules
- Used by: All feature modules directly manipulate DOM

**Feature Modules (Client Logic):**
- Purpose: Implement domain-specific functionality (trading, business, transfers, chat)
- Location: `crypto.js`, `business.js`, `deposit.js`, `transfer.js`, `shop.js`, `chat.js`, `admin-actions.js`
- Contains: Event handlers, Firestore queries, user interaction flows, modal rendering
- Depends on: Firebase SDK, `main.js` for auth context, `utils.js` for helpers
- Used by: Main app controller in `main.js`

**Core Controller (Client):**
- Purpose: Authentication, session management, profile loading, navigation between features
- Location: `main.js`
- Contains: Login/register flow, Firestore listeners (profile, score requests, ratings), top-5 display, badge system, quote system
- Depends on: Firebase SDK, all feature modules
- Used by: Entry point for all authenticated operations

**Backend Services (Cloud Functions):**
- Purpose: Server-side operations that require elevated privileges or scheduled execution
- Location: `functions/index.js` and related files
- Contains: Stop-loss/take-profit checks, price feeds from Binance, commission calculations, tax logging
- Depends on: Firebase Admin SDK, Binance API
- Used by: Client modules via Cloud Functions calls or via Firestore listeners watching trade documents

**Data Layer:**
- Purpose: Persistent storage and real-time synchronization
- Location: Firestore collections (users, transactions, score_requests, exchange_trades, businesses, deposits, tax_log)
- Contains: Game state, user profiles, transaction history, admin audit logs
- Depends on: Firestore security rules (`firestore.rules`)
- Used by: All client and server components

## Data Flow

**Authentication & Session:**

1. User submits login/register form in `index.html`
2. `main.js` calls `firebase.auth().signInWithEmailAndPassword()` or `createUserWithEmailAndPassword()`
3. If registration, creates `users/{uid}` document with initial game data (coins, cf, points)
4. If login, checks pending/approved status via Firestore listener on `unsubProfileDoc`
5. On approval, loads profile card with current stats and badges
6. On rejection, shows rejection reason with option to delete account

**Trading (Crypto Module):**

1. User selects asset in crypto modal (BTC, ETH, TON, etc.)
2. `crypto.js` fetches real-time prices from Binance API every 30 seconds
3. User places buy order: `buyAsset(assetId, amount)` → updates `users/{uid}` with `{assetIdAmount, assetIdAvgPrice, exchangeCoins}`
4. Buy triggers Cloud Function `addTradeCommission` (0.1% fee to admin)
5. Cloud Function `checkOrders` runs every 1 minute, checks all SL/TP conditions
6. If triggered, executes automatic sell → updates user coins + PnL fields
7. `exchange_trades` collection logs all trades immutably
8. `exchange_commissions` aggregates commission paid to admin

**Business Module:**

1. User buys first stage (cart) for 300 coins → creates/updates `businesses/{bizId}` document
2. `business.js` tracks daily energy capacity reset at 6:00 AM local time via `bizDayKey()`
3. User "works for business" → generates income based on stage + energy spent
4. Income calculation: `stage.incomePerEnergy * energySpent - workersPayroll`
5. Hiring workers requires specific business stage completion (e.g., hire for Kiosk requires Cart exp ≥50)
6. Daily capacity resets: stores `{dailyCapacity, used, lastReset}`
7. Withdrawal applies stage-specific tax (Cart: 1%, Kiosk: 5%, Cafe: 10%, Factory: 20%)
8. All work logs stored immutably in `businesses/{bizId}/work_logs/{docId}`

**Score Requests (Admin Approval System):**

1. Player clicks "📋 Подать счёт" → submits `score_requests/{docId}` with games, wins, cf, points, coins
2. Admin panel loads pending requests via Firestore listener
3. Admin approves: `score_requests/{docId}` marked as `status: 'approved'`
4. Cloud Function triggers → updates `users/{uid}` with new stats, removes request
5. On rejection: request marked `status: 'rejected'` with reason, player sees rejection UI

**Transfers (Player-to-Player):**

1. Player submits transfer form with recipient name + amount (coins or CF)
2. `transfer.js` finds recipient via case-insensitive search: `findUserByName()`
3. Validates sender balance ≥ amount
4. Creates `transactions/{docId}` record with from/to/amount/type/timestamp
5. Updates both `users` documents in batch: sender coins ↓, recipient coins ↑
6. Message shows: "Успешно отправлено X монет → [name]"

**Shop (Item Purchases):**

1. User selects upgrade from shop items (Savings, 2BIG акции, OK4U, etc.)
2. `shop.js` validates: player level ≥ minLevel required for that upgrade
3. Deducts cost in coins from `users/{uid}.coins`
4. Increments field: e.g., `users/{uid}.savings`, `users/{uid}.ok4uStocks`
5. Adds badge if unlocked (defined in `BADGES` array in `main.js`)

**Deposits (Investment) - REMOVED in Season 2:**
- Deprecated module, kept for reference only
- Do not restore or use in new features

## Key Abstractions

**Asset Model (Crypto & Business):**
- Purpose: Represent tradeable items with price, icons, metadata
- Examples: `CRYPTO_ITEMS` in `crypto.js`, `BUSINESS_STAGES` in `business.js`, `SHOP_ITEMS` in `shop.js`
- Pattern: Array of objects with id, name, icon, config. Lookup via helper functions: `getAsset(id)`, `getStage(stageId)`

**User State:**
- Purpose: Centralize player profile in single Firestore document `users/{uid}`
- Fields: coins, exchangeCoins, businessCoins, cf, points, games, wins, badges[], isAdmin, isApproved, rejectionReason, level (derived from points), business holdings (btcAmount, btcAvgPrice, etc.), shop items (savings, ok4uStocks, etc.)
- Pattern: Firestore listeners subscribe to profile doc; local cache in `currentUser` global variable
- Rounding: Coins rounded to hundredths (`Math.round(x * 100) / 100`); CF/points unrounded

**Collection Hierarchy:**
- `users/{uid}` — Player profile (single doc)
- `users/{uid}/badges` — Earned badges (sub-collection, rarely used; badges mostly in parent array)
- `businesses/{bizId}` — Business state for owner
- `businesses/{bizId}/work_logs/{logId}` — Immutable work history
- `transactions/{docId}` — Player-to-player transfers audit log
- `score_requests/{docId}` — Pending/approved/rejected stat submissions
- `exchange_trades/{docId}` — Immutable trade history (buy/sell)
- `exchange_commissions/{docId}` — Aggregated commissions for admin
- `tax_log/{docId}` — Aggregated business tax for admin

**Badge System:**
- Purpose: Gamification; unlock visual rewards based on achievements
- Examples: Game activities (games ≥1, wins ≥8), shop level-ups (savings level ≥5), wealth (coins ≥100)
- Pattern: `BADGES` array in `main.js` defines check functions. On profile load, iterate all badges, call `check(userData)`, show earned ones
- Tiers: common, rare, superrare, epic, mythic, legendary (like Brawl Stars rarity)

**Modal System:**
- Purpose: Navigate between feature screens (rating, shop, crypto, business, chat, deposits)
- Pattern: All modals defined in `index.html` with `display:none`; `showModal(id)` hides others + shows selected via `utils.js`
- Modal IDs: `rating-modal`, `shop-modal`, `crypto-modal`, `business-modal`, `chat-modal`, `invest-modal`, `deposit-modal`

## Entry Points

**Web App:**
- Location: `index.html` (hosted on Firebase Hosting)
- Triggers: Browser load, redirects to `/?` if not authenticated
- Responsibilities: Render login/register forms, profile card, modals for features, load Firebase SDK, defer script execution via `<script defer src="main.js"></script>`

**Main Controller:**
- Location: `main.js`
- Triggers: Page load (deferred)
- Responsibilities: Initialize Firebase, setup auth listener, load player profile on login, render modals, attach event listeners for feature buttons (show-exchange-btn, show-transfer-form, etc.), manage Firestore subscriptions

**Feature Buttons:**
- Location: Rendered in profile card, modal headers
- Examples: "🔄 Обменять CF" → `showModal('crypto-modal')`, "💸 Перевести" → renders transfer form
- Responsibilities: Toggle feature UI, start data flow for that feature

**Cloud Functions (Scheduled):**
- Location: `functions/index.js`
- Triggers: Pub/Sub schedule (checkOrders runs every 1 minute, deposits check deprecated)
- Responsibilities: Fetch asset prices, check SL/TP conditions, execute automatic sells, log taxes

**Admin Panel:**
- Location: `admin-section` div in `index.html`
- Triggers: When logged-in user has `isAdmin: true`
- Responsibilities: Display pending score requests, add/withdraw CF manually, view transactions log, approve/reject stat submissions

## Error Handling

**Strategy:** Optimistic client updates with fallback to Firestore error messages

**Patterns:**
- Try-catch blocks around Firestore operations; on error, show inline message via `showMsg(elementId, text, true)` (red color)
- Async operations show spinner on button via `setLoading(btn, true)` — clears on success or error
- Network errors (fetch timeout) handled by fetch `AbortController` with 7-second timeout
- Validation happens before transaction: check balance, check recipient exists, check level requirements
- Firestore security rules prevent unauthorized writes (e.g., can't modify other user's coins, can't set isAdmin without existing admin privilege)

## Cross-Cutting Concerns

**Logging:** 
- Approach: Firestore collections track all mutations (transactions, tax_log, exchange_trades, exchange_commissions, work_logs). No centralized logger.
- Admins can audit via admin panel queries on these collections

**Validation:**
- User inputs validated client-side before submission (amount > 0, recipient exists, balance sufficient)
- Server-side validation via Firestore security rules (auth required, ownership checks)
- No XSS protection via input sanitization (inputs are `<input type="number">` or `<input type="text">`; user data escaped via `escapeHtml()` before insertion to innerHTML)

**Authentication:**
- Firebase Auth with email/phone-based login (phone field stored as username)
- Session persists via Firebase Auth token (handled by SDK automatically)
- Admin role checked via `isAdmin` boolean field in user doc (read on every privileged operation)
- Pending approval state: `isApproved: false` blocks feature access; shows "Ожидай подтверждения" screen

**State Synchronization:**
- Real-time listeners (`unsubPlayerRequests`, `unsubAdminRequests`, `unsubProfileDoc`) keep local state in sync with Firestore
- After write transactions, code re-reads from Firestore with `{ source: 'server' }` to bypass cache
- Prevents UI inconsistency due to lag

---

*Architecture analysis: 2026-04-25*
