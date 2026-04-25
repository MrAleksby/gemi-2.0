# Coding Conventions

**Analysis Date:** 2026-04-25

## Naming Patterns

**Files:**
- Lowercase with hyphens: `transfer.js`, `admin-actions.js`, `deposit.js`
- No file extensions for subdirectories: `functions/` contains modules
- Utilities and shared logic: `utils.js`

**Functions:**
- camelCase for all functions: `setLoading()`, `findUserByName()`, `showModal()`
- Async functions prefixed with logic (no special marker): `async function approveScoreRequest()`
- Verb-first for imperative functions: `hideAllModals()`, `showPopup()`, `fetchAssetPrice()`
- Single-letter or abbreviated params in loops/map operations: `d => d.games`, `(userDoc) => ...`

**Variables:**
- camelCase constants and variables: `currentUser`, `currentUserLevel`, `adminName`
- ALL_CAPS for static configuration constants: `CRYPTO_COMMISSION`, `ENERGY_MAX`, `BUSINESS_STAGES`, `DEPOSIT_RATES`
- Private/internal state prefixed with underscore: `_lastProfilePoints`, `_lastRenderedCryptoAsset`
- Boolean-like state: `currentCryptoAsset` (current selection), not `isCryptoOpen`
- Shadow/cache variables with suffix: `ratingCache`, `ratingCacheTime`, `cryptoPrices`

**Types:**
- Object properties use camelCase: `userData.bizExpCart`, `userData.isAdmin`, `data.priceChangePercent`
- Firestore field names: lowercase with underscores or camelCase depending on context
  - Example: `${id}Amount`, `${id}AvgPrice`, `${id}StopLoss` (dynamic field generation)
  - Example: `createdAt`, `lastCompounded` (Firestore timestamps)
- Collection names: lowercase: `users`, `transactions`, `score_requests`, `tax_log`, `deposits`, `exchange_trades`, `businesses`

## Code Style

**Formatting:**
- No linter/formatter detected (no .eslintrc, .prettierrc, or biome.json)
- Indentation: 4 spaces (observed in all `.js` files)
- Line breaks: Liberal spacing around function definitions and logical sections
- Comments use emoji section markers for organization

**Comments and Organization:**
- Section headers with emoji and dashes: `// ─── Криптобиржа ────────────────────────────`
- Inline comments in Russian (Cyrillic)
- JSDoc-style comments for utility functions with `@param` and function description
- Example from `utils.js`:
  ```javascript
  /**
   * Показывает попап с overlay.
   * @param {object} options
   * @param {string} options.title       — заголовок попапа
   * @param {string} [options.timeout=5000] — авто-закрытие (null = не закрывать)
   * @returns {function} close — функция закрытия
   */
  function showPopup(options) { ... }
  ```

**Linting:**
- No linting configuration found. Code uses console logging for errors.
- Error handling via console.error/warn for logging: `console.error('Ошибка при подтверждении счёта:', err)`

## Import Organization & Module Structure

**Frontend (Browser):**
- Single HTML entry point: `index.html`
- Scripts loaded via `<script>` tags in order:
  1. Firebase SDK (v9.22.2 compat)
  2. Utility module: `utils.js`
  3. Feature modules: `main.js`, `crypto.js`, `business.js`, `deposit.js`, `transfer.js`, `shop.js`, `chat.js`, `admin-actions.js`
- Global variable sharing across scripts (Firebase instance, db, currentUser)
- No module bundler (Webpack, Rollup) detected

**Backend (Cloud Functions):**
- CommonJS modules: `const functions = require('firebase-functions')`
- Explicit imports for each Cloud Function file: `require('firebase-admin')`
- Functions deployed separately: `check-deposits.js`, `check-user.js`, `delete-user.js`, `find-user.js`, `reset-password.js`, `index.js`

**Path Aliases:**
- Not used; all references are relative to global scope or Firestore collections

## Error Handling

**Patterns:**
- Try-catch blocks for async operations: `try { ... } catch(e) { ... }`
- Error messages shown to users via `showMsg(elementId, text, true)` for error flag
- Admin-facing errors in `adminMessage` element: `.textContent = 'Error text'`
- Firestore fallback patterns with `.catch(() => ({ docs: [] }))`
- Silent failures in some cases: `catch(e) { /* тихо */ }` (see `deposit.js`)
- User-facing messages via modals/popups/toasts

**Common Error Messages:**
- Validation: `'Введите корректное имя и сумму больше 0'`
- Not found: `'Пользователь ${username} не найден'`
- Insufficient funds: `'Недостаточно монет. У вас: ${snap.data().coins || 0}'`
- Network/API: `'Не удалось получить цену ${asset.symbol}'`

## Logging

**Framework:** Console methods (no logging library)

**Patterns:**
- `console.error()` for exceptions and business logic errors: `console.error('approveScoreRequest: пользователь не найден, userId=' + req.userId)`
- `console.warn()` for recoverable issues: `console.warn('checkDailyBonus error:', e)`
- `console.log()` not commonly used in production paths (frontend typically silent)
- Cloud Functions use `console.error()` for operational issues

## Comments

**When to Comment:**
- Section headers with visual separators (emoji + dashes)
- Complex calculations: annotate intent, not mechanics
- Non-obvious Firestore patterns: "читать данные с `{ source: 'server' }` — иначе SDK отдаёт кеш"
- Configuration rationale: explain why a value is set

**JSDoc/TSDoc:**
- Used for public utility functions in `utils.js`
- Parameter types marked with `@param {type}`
- Optional parameters marked with brackets: `@param {number|null} [options.timeout=5000]`
- Return type marked: `@returns {function}`

## Function Design

**Size:** 
- Small functions (15-40 lines typical)
- Larger feature handlers (50-100 lines for UI construction)
- Very large files (main.js ~2600 lines, crypto.js ~1900 lines) due to feature concentration

**Parameters:**
- Explicit parameters for single values: `setLoading(btn, isLoading)`
- Options object for multiple parameters: `showPopup({ title, content, timeout, ... })`
- Destructuring used in function signatures: `const { title, content, ... } = options`

**Return Values:**
- Functions return promises for async operations
- Void functions (side effects only) do not return
- Returns used for close/cleanup callbacks: `return close` in `showPopup()`
- Firestore refs/docs returned directly: `return snap.docs[0]`

## Module Design

**Exports:**
- Browser: Global functions and variables (no explicit export)
- Cloud Functions: `exports.functionName = functions.region(...).handler()`

**Barrel Files:**
- Not used; each module loads directly via script tag

## Rounding and Number Formatting

**Critical Rules (from CLAUDE.md):**
- **Coins:** Rounded to hundredths: `Math.round(x * 100) / 100`
- **CF:** Not rounded (whole numbers or as-is)
- **XP/Points:** Whole integers, never modify
- **KD/Rating:** Never modify

**Format Function:**
- `fmt(n)` in `utils.js` formats coins to 2 decimals: `fmt(0.8573355) → "0.86"`
- Used throughout for display: `${fmt(amount)} монет`

## Firestore Field Naming

**Generated dynamic fields:**
```javascript
// Asset holdings - pattern: ${id}Amount, ${id}AvgPrice, ${id}StopLoss, ${id}TakeProfit
btcAmount, btcAvgPrice, btcStopLoss, btcTakeProfit
tonAmount, tonAvgPrice, etc.

// Business experience - pattern: bizExp${stage}
bizExpCart, bizExpKiosk, bizExpCafe, bizExpFactory

// Tax tracking
lastTaxDay, totalTaxPaid, taxesByStage
```

**Standard fields:**
- `userId`, `uid` (user document ID)
- `name` (player username)
- `isAdmin` (boolean)
- `coins`, `exchangeCoins`, `businessCoins`, `cf`, `points`
- `games`, `wins` (game stats)
- `createdAt`, `lastMessageTime`, `timestamp` (dates)
- `status` ('active', 'completed', etc.)

## HTML/CSS Integration

**Input Styling:**
- Global input style rules in `style.css:46` with `!important` flags
- Override: `input[type="number"]` has hardcoded padding, border, font-size
- Never set inline styles on inputs that conflict with global rules
- Inline styles allowed only for position/display/color (non-overridden properties)

**Modal/UI Patterns:**
- Modals hidden with `display:none`, shown with `display:flex` or custom
- Modals managed centrally via `hideAllModals()` and `showModal(id, display)`
- Overlays created dynamically as sibling divs
- All modals listed in `ALL_MODALS` array in `utils.js`

---

*Convention analysis: 2026-04-25*
