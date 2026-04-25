# Testing Patterns

**Analysis Date:** 2026-04-25

## Current Testing State

**No Test Framework:** The project has no automated testing infrastructure. No Jest, Vitest, Mocha, or other test runner is present. No test configuration files exist (.test.js, .spec.js, vitest.config.js, jest.config.js, etc.)

## Manual Testing Approach

**Frontend Testing:**
- Manual browser testing via Firebase Hosting deployment
- Browser developer tools (console) for debugging
- No unit/integration test suites

**Cloud Functions Testing:**
- Manual testing via Firebase emulator or production deployment
- No automated test framework

## Error Handling via Console

**Logging for Debugging (see `main.js`, `deposit.js`, `admin-actions.js`):**

```javascript
// Error logging pattern
console.error('Ошибка при подтверждении счёта:', err);
console.warn('checkDailyBonus error:', e);
```

**Where errors are logged:**
- `main.js:339` - Daily bonus check failures
- `main.js:1496` - Admin finance stats load failures
- `main.js:1766` - Game history load failures
- `main.js:1862` - Analytics errors
- `main.js:1948` - Transaction history load failures
- `admin-actions.js` - Score request approval/rejection failures
- `deposit.js` - Deposit operation errors
- `business.js` - Work log and tax calculation errors
- `functions/index.js` - Cloud Function execution errors

## Firestore Patterns for Data Consistency

**Server-side reads after writes:**
```javascript
// Pattern: Always use { source: 'server' } after Firestore transactions
const userDoc = await firebase.firestore()
    .collection('users')
    .doc(user.uid)
    .get({ source: 'server' });
```

**Why:** Default SDK caching returns stale data. Always fetch fresh from server after mutations.

**Observed in:**
- `deposit.js:74` - After creating deposits
- `business.js` - After work/tax calculations
- `crypto.js` - After selling assets

## Validation Patterns

**Frontend Validation (User Input):**

```javascript
// Parameter validation pattern
async function adminAddCF(username, amount, reason) {
    if (!username || isNaN(amount) || amount <= 0) {
        if (adminMessage) adminMessage.textContent = 'Введите корректное имя и сумму больше 0';
        return;
    }
    // ... proceed with operation
}
```

**Checks performed:**
- Username exists and non-empty
- Amount is numeric and positive
- User account exists in Firestore
- Sufficient balance before withdrawal
- Business energy availability
- Chat participant exists

**Validation locations:**
- `admin-actions.js` - CF add/withdraw validation
- `crypto.js` - Buy/sell transaction validation
- `business.js` - Employee hire, work, withdraw validation
- `transfer.js` - Transfer amount and recipient validation
- `deposit.js` - Deposit create/topup/withdraw validation

## Data Integrity Checks

**Document existence checks:**
```javascript
const userDoc = await findUserByName(username);
if (!userDoc) {
    adminMessage.textContent = `Пользователь ${username} не найден.`;
    return;
}
```

**Balance validation before operations:**
```javascript
const oldCF = userDoc.data().cf || 0;
if (oldCF < amount) {
    adminMessage.textContent = `Недостаточно CF у ${username}. Доступно: ${oldCF}`;
    return;
}
```

**Firestore error handling with fallback:**
```javascript
// Pattern: Use .catch() with fallback data
const result = await firebase.firestore()
    .collection('tax_log')
    .where('userId', '==', user.uid)
    .get()
    .catch(() => ({ docs: [] }));
```

## Transaction Logging

**All financial operations logged to `transactions` collection:**
```javascript
async function addTransactionRecord(username, amount, type, reason, userId = null) {
    await db.collection('transactions').add({
        username,
        amount,
        type,           // 'add', 'withdraw', 'exchange', 'transfer', etc.
        reason,
        timestamp: new Date(),
        userId,
        admin: type !== 'exchange'
    });
}
```

**Types of transactions recorded:**
- Admin operations: CF add/withdraw
- Exchange trades: Buy/sell assets
- Business operations: Work, hire, withdraw
- Deposits: Create, topup, withdraw, interest accrual
- Transfers: Player-to-player coin/CF transfer
- Score requests: Approval/rejection

**Usage:** All financial mutations create transaction records for audit trail.

## Numeric Rounding Tests

**Coins rounding requirement (from CLAUDE.md):**
- Must round to hundredths: `Math.round(x * 100) / 100`
- Used in: deposit interest calculation, tax calculations, asset sales
- **Example locations:**
  - `crypto.js` - Commission deduction in asset sales
  - `deposit.js` - Interest compounding: `Math.round(calcCompoundedAmount(...) * 100) / 100`
  - `business.js` - Tax deduction and work income: `Math.round(...* 100) / 100`

**Format function for display:**
```javascript
function fmt(n) {
    const v = parseFloat((+n || 0).toFixed(2));
    return v % 1 === 0 ? String(v) : v.toFixed(2);
}
```

**Testing pattern (manual):**
- Verify display shows correct decimals: `fmt(0.8573355) → "0.86"`
- Verify stored values use rounding: `Math.round(0.8573355 * 100) / 100 = 0.86`

## UI State Testing

**Anti-flashing patterns (cache to prevent re-renders):**

```javascript
// Don't re-fetch if nothing changed
let _lastProfilePoints = -1;
async function showProfile() {
    const data = currentUserData;
    if (data.points === _lastProfilePoints) return; // Skip if same
    _lastProfilePoints = data.points;
    // ... render profile
}
```

**Applied to:**
- Profile rendering: `_lastProfilePoints`
- Crypto asset display: `_lastRenderedCryptoAsset`

## Async/Promise Testing

**Error handling in async operations:**

```javascript
try {
    const reqDoc = await db.collection('score_requests').doc(requestId).get();
    if (!reqDoc.exists) return;
    // ... process
} catch (err) {
    console.error('Ошибка при подтверждении счёта:', err);
    // Show user-friendly message
}
```

**Patterns observed:**
- All async Firestore calls wrapped in try-catch
- Promise.all() used for parallel queries: `Promise.all([userSnap, depSnap])`
- Timeout handling for API calls: `new AbortController()` with 7-second timeout in `crypto.js`

## Cloud Functions Testing

**Functions in `functions/index.js` (deployed to europe-west1):**

**checkOrders (scheduled every 1 minute):**
- Fetches prices from Binance API
- Iterates all users checking stop-loss and take-profit conditions
- Executes sell transactions when triggered
- **Manual test:** Check Firestore exchange_trades and user balances after SL/TP trigger

**checkDepositInterest (scheduled daily at 00:00 UTC):**
- Recalculates compound interest for active deposits
- Updates amount and lastCompounded field
- **Manual test:** Verify deposits grow by expected percentage daily

**Other utility functions:**
- `check-user.js`, `find-user.js`, `delete-user.js`, `reset-password.js` - one-off operations
- Typically triggered by admin or via HTTP triggers

**Testing approach:**
- Use Firebase Emulator Suite locally
- Deploy to staging/test project if available
- Monitor Firestore collection changes in console
- Check Cloud Logs (Firebase console) for execution errors

## Missing Test Infrastructure

**What's needed for future phases:**

1. **Frontend unit tests:** Jest + @testing-library or Vitest for UI logic
2. **Frontend integration tests:** Cypress or Playwright for user flows
3. **Cloud Functions tests:** Jest with Firebase test utilities
4. **Contract tests:** Verify Firestore schema/field names match expectations
5. **Load tests:** Simulate concurrent users, especially for trading/crypto operations

**Current gaps:**
- No test coverage metrics
- No automated regression testing
- No CI/CD test runs (Firebase deployment happens via `firebase deploy` only)
- No staging environment testing

## Manual Checklist for New Features

**Before deploying new financial operation:**
1. Verify rounding: coins use `Math.round(x * 100) / 100`
2. Check transaction logging: operation creates record in `transactions` collection
3. Test balance mutations: Read with `{ source: 'server' }` after write
4. Validate user inputs: Check for null/NaN/negative where appropriate
5. Test error messages: Trigger edge cases and verify user sees helpful text
6. Browser console: No uncaught errors or warnings
7. Firestore rules: Ensure operation passes Firestore security rules
8. Network latency: Test with throttled network in DevTools

## Browser Testing Tools

**Available in development:**
- Chrome DevTools Console (for errors/logs)
- Chrome DevTools Network tab (Firebase API calls)
- Chrome DevTools Application → Firestore section (inspect documents)
- Firebase Console → Firestore → Data → Watch collections in real-time

---

*Testing analysis: 2026-04-25*
