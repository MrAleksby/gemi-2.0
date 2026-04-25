# Codebase Concerns

**Analysis Date:** 2026-04-25

## Tech Debt

**Deprecated deposits system (Season 2 cleanup incomplete):**
- Issue: `deposit.js` still contains ~670 lines of deposit code that was officially removed in Season 2 (March 2026). CLAUDE.md explicitly states "Депозиты **полностью удалены** — не восстанавливать, не добавлять"
- Files: `deposit.js`, `functions/check-deposits.js`, `firestore.rules:109-114`
- Impact: Dead code creates confusion for future maintainers and increases bundle size. Firestore rules still define deposits collection access
- Fix approach: Delete `deposit.js` and `functions/check-deposits.js` entirely. Remove deposits rules from `firestore.rules`. Remove `renderInvestHub()` calls from UI

**Manual rounding logic scattered across files:**
- Issue: Rounding implementation for coins (to 2 decimals) duplicated in 30+ locations across `crypto.js`, `business.js`, `deposit.js`. Patterns vary: `Math.round(x * 100) / 100`, `parseFloat().toFixed()`, and sometimes inconsistent
- Files: `crypto.js:715,734,895`, `business.js:1105`, multiple call sites
- Impact: Maintenance burden. Risk of inconsistent handling if one location is missed during updates. Hard to enforce rule "CF not rounded"
- Fix approach: Create centralized utility functions `roundCoins(x)` and `roundAsset(x, decimals)` in `utils.js`, replace all callsites

**Empty catch blocks without logging:**
- Issue: Multiple catch handlers silently swallow errors with `.catch(() => {})` or `catch(e) {}` providing no visibility into failures
- Files: `crypto.js:63`, `business.js:195,846,1120`, `main.js:205,559,578,954,1094,1105`, `chat.js:237`
- Impact: Silent failures make debugging difficult. Users don't know when operations fail asynchronously (e.g., tax payment in `cryptoWithdraw()` line 749)
- Fix approach: Add console.warn() or fire telemetry for all catch blocks. For user-facing operations, display toast notifications instead of silent fails

**Time zone handling inconsistency:**
- Issue: Two different day-reset implementations exist: `business.js:89-96` uses local time (6:00 AM), while `functions/index.js:245-253` attempts Tashkent time offset calculation (UTC+5). Both may diverge due to DST
- Files: `business.js:88-96`, `functions/index.js:245-253`
- Impact: Business energy caps and scheduled Cloud Functions may desync by ±1 day during DST transitions or timezone changes
- Fix approach: Standardize on server-side time in Cloud Functions. Pass normalized day key from backend to frontend instead of computing locally

**Firestore permissions too permissive for job_board:**
- Issue: `firestore.rules:104-107` allows any authenticated user to create/update/delete any job board entry. No ownership check
- Files: `firestore.rules:104-107`
- Impact: Players can delete or edit other players' job listings, close their own vacancies, sabotage competitors
- Fix approach: Add rule requiring `request.auth.uid == resource.data.ownerId` for update/delete on job_board. Validate in Cloud Function

**Admin CF management lacks audit trail:**
- Issue: `admin-actions.js:3-22` allows admin to add/withdraw CF directly without validation. Manual arithmetic instead of Firestore transactions
- Files: `admin-actions.js:3-46`
- Impact: CF balance can become inconsistent if operation fails mid-way. No signature/approval for manual interventions
- Fix approach: Move to Cloud Function with transaction, log all admin CF changes to `admin_logs` collection with before/after snapshots

---

## Known Issues & Bugs

**Floating-point precision in asset trading:**
- Symptoms: Users report discrepancies of 0.00001 BTC when selling, rounding to 8 decimals inconsistently
- Files: `crypto.js:882-884` (precision handling exists but not applied at all callsites)
- Trigger: Sell order on BTC/TON after multiple buy/sell cycles with micro-quantities
- Workaround: Round inputs at UI layer before sending to Cloud Function
- Fix approach: Ensure all asset amount calculations use `Math.round(x * 10^decimals) / 10^decimals` before storage

**SL/TP notifications not cleared on app restart:**
- Symptoms: `slTpNotifications` array persists in user document; users see old SL/TP alerts on second login
- Files: `crypto.js:209-216` clears notifications but only after rendering once
- Trigger: User logs out after SL triggers, logs back in later
- Impact: Users confused by stale alerts from hours ago
- Fix approach: Clear `slTpNotifications` atomically in the `checkOrders` function after building notification, not on client read

**Business capacity reset may not trigger for offline users:**
- Symptoms: User works in business after 6:00 AM but if their browser closed before 6:00, capacity not reset
- Files: `business.js:99-108` (`getOrResetBizCapacity`) only resets on next read
- Trigger: Player offline at 6:00 AM UTC+5, comes back online at 10:00 AM
- Impact: Unfair advantage—some users get more work slots per day
- Fix approach: Use Cloud scheduled function to reset `energyUsedToday` for all businesses at 6:00 AM, not on-read

**Firestore rules allow deposits collection reads by users:**
- Symptoms: While deposits system removed, rules still grant `isAuth()` read access
- Files: `firestore.rules:109-114`
- Impact: If deposits were re-added elsewhere, users could read admin deposit configs
- Fix approach: Change rule to `allow read: if isAdmin()` or remove entirely

**Batch update in postVacancy doesn't validate stage config:**
- Symptoms: Salary validation at line 737 checks `stage.incomePerEnergy`, but batch uses `job_board` document which may have stale stage data
- Files: `business.js:723-766`
- Trigger: Admin upgrades business stage, player opens old vacancy without refresh
- Fix approach: Fetch fresh stage config from businesses document in Cloud Function before allowing post

---

## Security Considerations

**Firebase API key exposed in main.js:**
- Risk: `apiKey` in `main.js:1-8` is Firebase Web API key (not secret), but still identifies project. Could be used for reconnaissance
- Files: `main.js:1-8`
- Current mitigation: Firebase Web keys have no actual sensitive access without rules enforcement
- Recommendations: Use domain restrictions in Firebase Console to limit Web key to gemi2.com only

**Admin detection relies on Firestore read:**
- Risk: `firestore.rules:12-14` reads user document on every restricted operation. If database slow, denial of window for privilege escalation attempts
- Files: `firestore.rules:12-14`, `admin-actions.js`
- Current mitigation: Cloud Functions use Admin SDK which bypasses rules
- Recommendations: Cache admin status in session or auth custom claims for critical operations

**CF transfers use player name lookup:**
- Risk: If two players have similar names (e.g., "Alex" vs "alex"), case-insensitive fallback at `main.js:79-82` could transfer to wrong player
- Files: `main.js:75-83`, `functions/index.js:285-286` (exact match only)
- Current mitigation: Functions use exact match lookup; case-insensitive fallback only on client UI
- Recommendations: Enforce strict name uniqueness, use UID-based transfers as option, display confirmation with avatar

**Tax payment asynchronous without confirmation:**
- Risk: `cryptoWithdraw()` line 745-749 sends tax to Cloud Function without waiting. If function fails, player loses coins but admin never gets tax
- Files: `crypto.js:744-750`
- Current mitigation: Console error logs, but no user notification
- Recommendations: Make tax payment synchronous or add retry logic with alerts

---

## Performance Bottlenecks

**Weekly winner calculation queries all users:**
- Problem: `functions/index.js:169` loads ALL users into memory to find weekly winner, then batch updates all
- Files: `functions/index.js:163-200`
- Cause: No database-level max/order-by to find winner atomically
- Improvement path: Use Cloud Firestore query with `where('weeklyPnl', '>', 0).orderBy('weeklyPnl', 'desc').limit(1).get()` instead of fetch-all

**Rating cache expires but never invalidated on user changes:**
- Problem: `main.js:35,38,113` maintains `ratingCache` with 30-second TTL, but only explicit refeshes clear it
- Files: `main.js:33-38`
- Cause: After approve/reject, cache should expire immediately but doesn't until timeout
- Improvement path: Add `ratingCache = null` after user data changes in `approveScoreRequest()`, `rejectScoreRequest()`

**renderCryptoExchange re-fetches prices on every render:**
- Problem: Even with 30-second cache, `fetchAssetPrice()` called per render for all 10 assets from Binance
- Files: `crypto.js:94-100,178-204`
- Cause: No pooled request or websocket subscription for prices
- Improvement path: Single interval that updates all prices once, share cache via `cryptoPrices` object (already done, but interval stops/starts per asset)

**DOM queries in loops:**
- Problem: `_updateDropdownPrices()` queries for `.asset-dropdown-item[onclick*="..."]` on every item—selector string matching is slow
- Files: `crypto.js:102-116`
- Cause: Each item found by expensive substring match
- Improvement path: Cache item elements after initial render, update by reference

---

## Fragile Areas

**Business stage structure duplicated in 3 places:**
- Files: `business.js:5-74` (BUSINESS_STAGES), `functions/index.js:257-262` (BUSINESS_STAGES_FN), hardcoded in HTML
- Why fragile: Adding new stage requires updating 3+ places. Easy to create inconsistency (e.g., income values mismatch)
- Safe modification: Define single canonical stage config in Cloud Firestore `config/businessStages` document, fetch once at app init
- Test coverage: No automated checks that stage configs match across files

**Energy reset time zone logic:**
- Files: `business.js:88-96`, `functions/index.js:245-253`
- Why fragile: Hardcoded 6:00 AM reset with local time vs UTC+5 offset causes edge cases around midnight
- Safe modification: Always use server-side time; pass normalized day key in response
- Test coverage: No tests for DST boundaries or timezone edge cases

**Asset configuration split (crypto.js vs functions/index.js):**
- Files: `crypto.js:5-16` (10 assets with icons/colors), `functions/index.js:6-17` (10 assets without colors)
- Why fragile: If admin wants to add/remove asset, both files must sync
- Safe modification: Define asset list in Firestore `config/assets` collection, fetch on app load
- Test coverage: No parity tests

**Work logs appended without cap:**
- Files: `business.js:672-674`, schema allows unlimited work_logs subcollection
- Why fragile: 1000+ work logs per business not paginated, query returns all
- Safe modification: Trim to last 50 on write, implement cursor pagination for history view
- Test coverage: None

---

## Scaling Limits

**Binance API rate limits not enforced:**
- Current capacity: 1200 requests/min to Binance (standard tier)
- Limit: With 10 assets checked every 5 seconds (player + 1min Cloud Function), 12,000 req/day. Safe margin to 18,000/day (Binance hard limit)
- Scaling path: If >100 concurrent players trading, add request batching, cache prices server-side with single Binance call

**Firestore batch writes cap at 500 documents:**
- Current usage: `weeklyReset` batches all non-admin users (~100 expected), still safe
- Limit: If 500+ active players, batch splits needed
- Scaling path: Implement `commitBatchesInChunks()` utility for large operations

**Weekly winners unlimited append:**
- Current capacity: 52 entries/year, acceptable
- Limit: 10 years = 520 docs, still queryable
- Scaling path: Archive old winners to separate collection yearly

---

## Dependencies at Risk

**Firebase SDK v9.22.2 (compat):**
- Risk: Compat SDK deprecated, Firebase recommends v9+ modular SDK
- Impact: Eventually lose support; existing code won't break but no new features
- Migration plan: Create modular SDK migration branch, test against API, deploy as v3.0

**Binance API no SLA:**
- Risk: Crypto exchange API can go down or rate-limit without notice
- Impact: Trading freezes, no price updates
- Mitigation: Fallback to cached prices if Binance unavailable (already done), add Yahoo Finance fallback (code present but untested)

**Node.js 18 for Cloud Functions:**
- Risk: Firebase Functions runtime will sunset Node.js 18 in ~2 years
- Impact: Deployments will fail
- Migration plan: Update to Node.js 20 when available

---

## Missing Critical Features

**No data export for GDPR compliance:**
- Problem: Players cannot download their data (games, coins history, trades, profile)
- Blocks: Can't be GDPR-compliant without this
- Implementation: Add admin endpoint to generate JSON export of user's firestore documents

**No email/password reset UI:**
- Problem: `resetUserPassword()` Cloud Function exists but only admin can call—no self-service
- Blocks: Players locked out if they forget password
- Implementation: Add "Forgot Password" form that sends reset link via Firebase Auth

**No inactive account cleanup:**
- Problem: Deleted users' documents remain in Firestore (jobs, businesses, trades)
- Blocks: Database grows unbounded; no cleanup
- Implementation: Add scheduled Cloud Function to hard-delete user data after 1 year of inactivity

**No moderation for chat messages:**
- Problem: `chat.js` allows any message, no filtering or reporting
- Blocks: Abuse/spam possible
- Implementation: Add message length limit, explicit profanity filter, flag-for-review mechanic

---

## Test Coverage Gaps

**Untested area: Stop-Loss / Take-Profit execution:**
- What's not tested: `checkOrders()` Cloud Function sells at SL/TP prices, updates PnL, awards XP
- Files: `functions/index.js:31-160`
- Risk: If SL price exact match fails (e.g., price touches 100.0001 but SL set to 100), order silently doesn't trigger
- Priority: **High** — core feature, financial correctness

**Untested area: Business stage upgrade edge cases:**
- What's not tested: Upgrade while vacancy open, upgrade while worker active, worker hire during upgrade
- Files: `business.js:685-721`
- Risk: Race condition could allow worker on old stage to work for new stage income
- Priority: **High**

**Untested area: Batch failures in transactions:**
- What's not tested: What happens if batch.commit() fails mid-way (e.g., permission denied on user doc but job_board succeeds)
- Files: `business.js:744-757` (job posting), `admin-actions.js:86-97` (approval)
- Risk: Partial state corruption
- Priority: **Medium**

**Untested area: Rounding edge cases:**
- What's not tested: What if coinsGross = 1.004, commission = 0.001, received = 1.003? Does Math.round handle it?
- Files: All trading functions
- Risk: Off-by-penny errors at scale
- Priority: **Medium**

**Untested area: Name collision in transfers:**
- What's not tested: Two players with similar names, case sensitivity
- Files: `main.js:75-83`, `functions/index.js:285-286`
- Risk: Wrong recipient
- Priority: **Medium**

---

*Concerns audit: 2026-04-25*
