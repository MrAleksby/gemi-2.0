// ─── Криптобиржа / Фондовый рынок ─────────────────────────────────────────────

const CRYPTO_COMMISSION = 0.001; // 0.1%

const CRYPTO_ITEMS = [
    { id: 'btc',  name: 'Bitcoin',  symbol: 'BTC',  icon: '₿',  color: '#f7931a', type: 'crypto', binance: 'BTCUSDT'  },
    { id: 'ton',  name: 'Toncoin',  symbol: 'TON',  icon: '💎', color: '#0088cc', type: 'crypto', binance: 'TONUSDT'  },
    { id: 'eth',  name: 'Ethereum', symbol: 'ETH',  icon: '⟠',  color: '#627eea', type: 'crypto', binance: 'ETHUSDT'  },
    { id: 'paxg', name: 'Золото',   symbol: 'PAXG', icon: '🥇', color: '#d4a017', type: 'crypto', binance: 'PAXGUSDT' },
    { id: 'xag',  name: 'Серебро',  symbol: 'XAG',  icon: '🥈', color: '#aaaaaa', type: 'crypto', binance: 'XAGUSDT',  futures: true },
    { id: 'tsla', name: 'Tesla',    symbol: 'TSLA', icon: '🚗', color: '#cc0000', type: 'crypto', binance: 'TSLAUSDT', futures: true },
    { id: 'meta', name: 'Meta',     symbol: 'META', icon: '🌐', color: '#0082fb', type: 'crypto', binance: 'METAUSDT', futures: true },
    { id: 'bz',   name: 'Нефть Brent', symbol: 'BZ',   icon: '🛢️', color: '#5d4037', type: 'crypto', binance: 'BZUSDT',   futures: true },
    { id: 'aapl', name: 'Apple',  symbol: 'AAPL', icon: '🍎', color: '#555555', type: 'crypto', binance: 'AAPLUSDT', futures: true },
    { id: 'nvda', name: 'NVIDIA', symbol: 'NVDA', icon: '🟢', color: '#76b900', type: 'crypto', binance: 'NVDAUSDT', futures: true },
];

let cryptoPrices = {};           // кэш цен { btc: {price, change24h, fetchedAt}, ... }
let cryptoPriceInterval = null;
let currentCryptoAsset = 'btc'; // текущий актив
let _lastRenderedCryptoAsset = null; // для анти-мигания

// ─── Получение цены ────────────────────────────────────────────────────────────

async function fetchAssetPrice(asset) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 7000);
    try {
        if (asset.type === 'crypto') {
            const base = asset.futures
                ? 'https://fapi.binance.com/fapi/v1/ticker/24hr'
                : 'https://api.binance.com/api/v3/ticker/24hr';
            const res = await fetch(`${base}?symbol=${asset.binance}`, { signal: ctrl.signal });
            clearTimeout(timer);
            const d = await res.json();
            return { price: parseFloat(d.lastPrice), change24h: parseFloat(d.priceChangePercent) };
        } else {
            // Yahoo Finance для акций
            const res = await fetch(
                `https://query1.finance.yahoo.com/v8/finance/chart/${asset.yahoo}?interval=1d&range=1d`,
                { signal: ctrl.signal }
            );
            clearTimeout(timer);
            const d = await res.json();
            const meta = d.chart.result[0].meta;
            const price = meta.regularMarketPrice;
            const prev  = meta.chartPreviousClose || price;
            return { price, change24h: ((price - prev) / prev) * 100 };
        }
    } catch(e) {
        clearTimeout(timer);
        // fallback: query2 для Yahoo
        if (asset.type === 'stock') {
            try {
                const res2 = await fetch(
                    `https://query2.finance.yahoo.com/v8/finance/chart/${asset.yahoo}?interval=1d&range=1d`
                );
                const d2 = await res2.json();
                const meta2 = d2.chart.result[0].meta;
                const price2 = meta2.regularMarketPrice;
                const prev2  = meta2.chartPreviousClose || price2;
                return { price: price2, change24h: ((price2 - prev2) / prev2) * 100 };
            } catch(e2) { return null; }
        }
        return null;
    }
}

// ─── Хелперы ───────────────────────────────────────────────────────────────────

function getAsset(id) {
    return CRYPTO_ITEMS.find(a => a.id === id);
}

// Сколько знаков после запятой для данного актива
function assetDecimals(id) {
    return (id === 'btc' || id === 'ton') ? 8 : 6;
}

// Читаем holdings из данных пользователя
function assetHoldings(userData, id) {
    return {
        amount:   userData[`${id}Amount`]   || 0,
        avgPrice: userData[`${id}AvgPrice`] || 0,
    };
}

// ─── Обновление цены (интервал) ────────────────────────────────────────────────

function stopCryptoPriceUpdates() {
    if (cryptoPriceInterval) { clearInterval(cryptoPriceInterval); cryptoPriceInterval = null; }
}

async function fetchAllPrices() {
    await Promise.all(CRYPTO_ITEMS.map(async a => {
        if (cryptoPrices[a.id] && Date.now() - cryptoPrices[a.id].fetchedAt < 30000) return;
        const pd = await fetchAssetPrice(a);
        if (pd) cryptoPrices[a.id] = { ...pd, fetchedAt: Date.now() };
    }));
}

function _updateDropdownPrices() {
    CRYPTO_ITEMS.forEach(a => {
        const p = cryptoPrices[a.id];
        if (!p) return;
        const item = document.querySelector(`.asset-dropdown-item[onclick*="'${a.id}'"]`);
        if (!item) return;
        const priceEl = item.querySelector('.asset-dd-price');
        const chgEl   = item.querySelector('.asset-dd-chg');
        if (priceEl) priceEl.textContent = `$${p.price.toLocaleString('en-US', {maximumFractionDigits: 2})}`;
        if (chgEl) {
            chgEl.textContent = `${p.change24h >= 0 ? '+' : ''}${p.change24h.toFixed(2)}%`;
            chgEl.style.color = p.change24h >= 0 ? '#27ae60' : '#e53935';
        }
    });
}

function startCryptoPriceUpdates() {
    stopCryptoPriceUpdates();
    const asset = getAsset(currentCryptoAsset);
    cryptoPriceInterval = setInterval(async () => {
        const pd = await fetchAssetPrice(asset);
        if (!pd) return;
        cryptoPrices[asset.id] = { ...pd, fetchedAt: Date.now() };

        // Обновляем цену по новым стабильным ID (player view)
        const priceEl  = document.getElementById('ex-asset-price')  || document.querySelector('.crypto-price');
        const changeEl = document.getElementById('ex-asset-change') || document.querySelector('.crypto-change');
        if (priceEl) {
            if (priceEl.id === 'ex-asset-price') {
                priceEl.innerHTML = `${pd.price.toLocaleString('ru-RU', {maximumFractionDigits: 4})} <span style="font-size:0.52em;font-weight:400;color:#999;">монет</span>`;
            } else {
                priceEl.innerHTML = `${pd.price.toLocaleString('ru-RU', {maximumFractionDigits: 4})} <span class="crypto-currency">монет</span>`;
            }
        }
        if (changeEl) {
            const s = pd.change24h >= 0 ? '+' : '';
            changeEl.style.color = pd.change24h >= 0 ? '#27ae60' : '#e53935';
            changeEl.textContent = `${s}${pd.change24h.toFixed(2)}% за 24ч`;
        }
        if (document.getElementById('crypto-buy-amount')?.value) updateBuyPreview();
        if (document.getElementById('crypto-sell-amount')?.value) updateSellPreview();
    }, 5000);
}

// ─── Переключение актива ───────────────────────────────────────────────────────

function switchAsset(id) {
    currentCryptoAsset = id;
    renderCryptoExchange();
}

function toggleAssetDropdown() {
    const list = document.getElementById('asset-dropdown-list');
    if (!list) return;
    const isOpen = list.classList.toggle('open');
    if (isOpen) {
        fetchAllPrices().then(_updateDropdownPrices);
        setTimeout(() => {
            document.addEventListener('click', _closeAssetDropdown, { once: true });
        }, 0);
    }
}

function _closeAssetDropdown(e) {
    const wrap = document.getElementById('asset-dropdown-wrap');
    if (wrap && !wrap.contains(e.target)) {
        const list = document.getElementById('asset-dropdown-list');
        if (list) list.classList.remove('open');
    } else if (wrap && wrap.contains(e.target)) {
        // клик внутри — оставляем слушатель
        document.addEventListener('click', _closeAssetDropdown, { once: true });
    }
}

// ─── Главная функция рендера ───────────────────────────────────────────────────

async function renderCryptoExchange(silent = false) {
    const content = document.getElementById('crypto-content');
    if (!content) return;
    const user = firebase.auth().currentUser;
    if (!user) return;

    const asset = getAsset(currentCryptoAsset);
    const isFirstRender = !document.getElementById('ex-crypto-content-root');
    const assetChanged  = _lastRenderedCryptoAsset !== asset.id;
    const needsFullRender = isFirstRender || assetChanged;

    if (!silent && needsFullRender) {
        content.innerHTML = '<div class="crypto-loading">Загружаем данные... ₿</div>';
    }

    const cached = cryptoPrices[asset.id] && Date.now() - cryptoPrices[asset.id].fetchedAt < 60000
        ? cryptoPrices[asset.id] : null;

    const [priceData, userDoc] = await Promise.all([
        cached ? Promise.resolve(cached) : fetchAssetPrice(asset).catch(() => cached || null),
        firebase.firestore().collection('users').doc(user.uid).get({ source: 'server' })
    ]);

    if (!priceData) {
        content.innerHTML = `<div class="crypto-error">Не удалось загрузить курс ${asset.symbol}. Проверьте интернет.</div>`;
        return;
    }

    const userData = userDoc.data();

    // ─── Уведомления о сработавших SL/TP ────────────────────────────────────
    if (userData.slTpNotifications && userData.slTpNotifications.length > 0) {
        userData.slTpNotifications.forEach(n => {
            const type = n.type === 'stopLoss' ? '🔴 Stop-Loss' : '🟢 Take-Profit';
            showToast(`${type} по ${n.assetSymbol} сработал по цене $${n.price.toFixed(2)}. Получено ${fmt(n.coinsNet)} монет`,
                n.type === 'stopLoss' ? 'error' : 'success', 6000);
        });
        firebase.firestore().collection('users').doc(user.uid).update({ slTpNotifications: [] });
    }

    const coins         = userData.coins         || 0;
    const exchangeCoins = userData.exchangeCoins  || 0;
    const totalPnl      = userData.totalPnl      || 0;
    const isAdmin       = userData.isAdmin === true;
    const userLevel     = typeof getLevelByPoints === 'function'
        ? Math.max(1, getLevelByPoints(userData.points || 0)) : (currentUserLevel || 1);
    const canTrade      = true;

    const { amount: holding, avgPrice: avgBuyPrice } = assetHoldings(userData, asset.id);

    const btcPrice     = priceData.price;
    const change24h    = priceData.change24h;
    const changeSign   = change24h >= 0 ? '+' : '';
    const changeColor  = change24h >= 0 ? '#27ae60' : '#e53935';
    const holdingValue = holding * btcPrice;
    const dec          = assetDecimals(asset.id);
    const pnlClass     = totalPnl >= 0 ? 'positive' : 'negative';
    const pnlSign      = totalPnl >= 0 ? '+' : '';

    const _slVal    = userData[asset.id + 'StopLoss']  || 0;
    const _tpVal    = userData[asset.id + 'TakeProfit'] || 0;
    const _slActive = _slVal > 0;
    const _tpActive = _tpVal > 0;

    cryptoPrices[asset.id] = { ...priceData, fetchedAt: Date.now() };

    // ─── Дропдаун выбора актива ──────────────────────────────────────────────
    const assetDropdownItems = CRYPTO_ITEMS.map(a => {
        const p = cryptoPrices[a.id];
        const priceStr = p ? `$${p.price.toLocaleString('en-US', {maximumFractionDigits: 2})}` : '—';
        const chg = p ? p.change24h : null;
        const chgStr = chg !== null ? `${chg >= 0 ? '+' : ''}${chg.toFixed(2)}%` : '';
        const chgColor = chg !== null ? (chg >= 0 ? '#27ae60' : '#e53935') : '#888';
        const isActive = a.id === currentCryptoAsset;
        return `
        <div class="asset-dropdown-item ${isActive ? 'active' : ''}"
             onclick="switchAsset('${a.id}'); toggleAssetDropdown()"
             style="${isActive ? `border-left: 3px solid ${a.color};` : ''}">
            <span class="asset-dd-icon" style="color:${a.color}">${a.icon}</span>
            <span class="asset-dd-name">${a.symbol} <span style="font-weight:400;color:#888;font-size:0.82em">${a.name}</span></span>
            <span class="asset-dd-price">${priceStr}</span>
            <span class="asset-dd-chg" style="color:${chgColor}">${chgStr}</span>
        </div>`;
    }).join('');

    const assetTabsHtml = `
        <div class="asset-dropdown-wrap" id="asset-dropdown-wrap">
            <button class="asset-dropdown-btn" onclick="toggleAssetDropdown()" style="border-color:${asset.color}">
                <span style="color:${asset.color};font-size:1.15em">${asset.icon}</span>
                <span style="font-weight:700">${asset.symbol}</span>
                <span style="color:#888;font-size:0.85em">${asset.name}</span>
                <span class="asset-dd-chevron">▾</span>
            </button>
            <div class="asset-dropdown-list" id="asset-dropdown-list">
                ${assetDropdownItems}
            </div>
        </div>
    `;

    // ─── ADMIN VIEW ───────────────────────────────────────────────────────────
    if (isAdmin) {
        const adminStructureExists = !!document.getElementById('ex-admin-exchange-bal');
        if (needsFullRender || !adminStructureExists) {
            let commissionsHtml = '';
            try {
                const commSnap = await firebase.firestore().collection('exchange_commissions').get();
                const commDocs = commSnap.docs
                    .sort((a, b) => (b.data().timestamp?.seconds || 0) - (a.data().timestamp?.seconds || 0))
                    .slice(0, 20);
                if (commDocs.length === 0) {
                    commissionsHtml = '<div style="color:#aaa;font-size:0.85em;">Комиссий ещё нет</div>';
                } else {
                    commissionsHtml = commDocs.map(doc => {
                        const d = doc.data();
                        const ts = d.timestamp?.toDate ? d.timestamp.toDate() : new Date(d.timestamp);
                        const dateStr = ts.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
                        const typeLabel = d.type === 'buy' ? 'покупка' : 'продажа';
                        return `<div class="crypto-commission-item">
                            <span>От ${d.userName} | ${d.assetSymbol || 'BTC'} | ${typeLabel}</span>
                            <span>${(d.commission || 0).toFixed(2)} монет | ${dateStr}</span>
                        </div>`;
                    }).join('');
                }
            } catch(e) {
                commissionsHtml = '<div style="color:#e53935;font-size:0.85em;">Ошибка загрузки истории</div>';
            }

            content.innerHTML = `
                <div id="ex-crypto-content-root">
                    ${assetTabsHtml}
                    <div style="display:flex;gap:8px;align-items:stretch;">
                        <div class="crypto-card" style="flex:1;margin:0;">
                            <div class="crypto-header">
                                <span class="crypto-icon" style="color:${asset.color}">${asset.icon}</span>
                                <div>
                                    <div class="crypto-name">${asset.name} (${asset.symbol})</div>
                                    <div class="crypto-price">${btcPrice.toLocaleString('ru-RU', {maximumFractionDigits: 4})} <span class="crypto-currency">монет</span></div>
                                    <div class="crypto-change" style="color:${changeColor}">${changeSign}${change24h.toFixed(2)}% за 24ч</div>
                                </div>
                            </div>
                        </div>
                        <div style="display:flex;flex-direction:column;gap:6px;flex-shrink:0;">
                            <button onclick="showInvestorStats()" style="width:72px;padding:8px 4px;background:linear-gradient(135deg,#1565c0,#1976d2);color:#fff;border:none;border-radius:14px;font-size:0.75em;font-weight:600;cursor:pointer;line-height:1.3;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;">
                                <span style="font-size:1.4em;">🏆</span>
                                <span>Рейтинг инвесторов</span>
                            </button>
                        </div>
                    </div>
                    <div class="crypto-admin-commission">
                        <div style="font-weight:700;margin-bottom:8px;color:#5c1f4a;">💼 Биржевой кошелёк (комиссии)</div>
                        <div id="ex-admin-exchange-bal" style="font-size:1.3em;font-weight:700;color:#f7931a;margin-bottom:12px;">${fmt(exchangeCoins)} монет</div>
                        <div style="font-size:0.85em;color:#888;margin-bottom:10px;">💰 Основной счёт: <span id="ex-admin-main-bal">${fmt(coins)}</span> монет</div>
                        <button class="crypto-confirm-btn buy" style="margin-bottom:0;" onclick="adminWithdrawCommission()">💸 Вывести на основной счёт</button>
                    </div>
                    <div style="margin-top:16px;">
                        <h4 style="font-size:0.9em;color:#888;margin-bottom:8px;">📋 История комиссий (последние 20)</h4>
                        ${commissionsHtml}
                    </div>
                    <div id="crypto-msg" class="crypto-msg"></div>
                </div>
            `;
        } else {
            // Обновляем только балансы (без перестройки всего DOM)
            const elEx = document.getElementById('ex-admin-exchange-bal');
            if (elEx) elEx.textContent = `${fmt(exchangeCoins)} монет`;
            const elMain = document.getElementById('ex-admin-main-bal');
            if (elMain) elMain.textContent = fmt(coins);
        }
        _lastRenderedCryptoAsset = asset.id;
        startCryptoPriceUpdates();
        return;
    }

    // ─── PLAYER VIEW ──────────────────────────────────────────────────────────

    if (needsFullRender) {
        // ── Полный рендер (первый показ или смена актива) ──────────────────
        content.innerHTML = `
        <div id="ex-crypto-content-root">

            <!-- Выбор актива -->
            <div class="asset-tabs">${assetTabsHtml}</div>

            <!-- ① ЦЕНА -->
            <div class="ex-card">
                <div style="display:flex;align-items:center;gap:12px;">
                    <span style="font-size:2.2em;line-height:1;flex-shrink:0;color:${asset.color}">${asset.icon}</span>
                    <div style="flex:1;min-width:0;">
                        <div style="font-weight:700;font-size:0.97em;color:#222;">
                            ${asset.name}
                            <span style="color:#999;font-weight:400;font-size:0.85em;">${asset.symbol}${asset.type === 'stock' ? ' · Акция' : ''}</span>
                        </div>
                        <div id="ex-asset-price" style="font-size:1.38em;font-weight:800;color:#111;line-height:1.2;">
                            ${btcPrice.toLocaleString('ru-RU',{maximumFractionDigits:4})}
                            <span style="font-size:0.52em;font-weight:400;color:#999;">монет</span>
                        </div>
                        <div id="ex-asset-change" style="font-size:0.82em;font-weight:600;color:${changeColor};margin-top:2px;">${changeSign}${change24h.toFixed(2)}% за 24ч</div>
                    </div>
                    <button onclick="showInvestorStats()" class="ex-rank-btn">
                        <span style="font-size:1.5em;">🏆</span>
                        <span>Рейтинг</span>
                    </button>
                </div>
            </div>

            <!-- ② КОШЕЛЬКИ -->
            <div class="ex-card">
                <div class="ex-section-label">Кошельки</div>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px;">
                    <div style="background:#fff8f0;border:1.5px solid #ffe0b2;border-radius:12px;padding:11px;">
                        <div style="font-size:0.68em;font-weight:700;color:#f57c00;text-transform:uppercase;letter-spacing:0.3px;margin-bottom:3px;">💼 Биржевой</div>
                        <div id="ex-exchange-bal" style="font-size:1.12em;font-weight:800;color:#e65100;">${fmt(exchangeCoins)} 💰</div>
                    </div>
                    <div style="background:#f1f8e9;border:1.5px solid #c5e1a5;border-radius:12px;padding:11px;">
                        <div style="font-size:0.68em;font-weight:700;color:#558b2f;text-transform:uppercase;letter-spacing:0.3px;margin-bottom:3px;">💰 Основной</div>
                        <div id="ex-main-bal" style="font-size:1.12em;font-weight:800;color:#33691e;">${fmt(coins)} 💰</div>
                    </div>
                </div>
                <div style="display:flex;gap:8px;">
                    <button onclick="toggleExTransfer('deposit')" style="flex:1;padding:8px 6px;background:#fff8f0;border:1.5px solid #ffcc80;border-radius:10px;font-size:0.8em;font-weight:700;color:#e65100;cursor:pointer;">↓ Пополнить</button>
                    <button onclick="toggleExTransfer('withdraw')" style="flex:1;padding:8px 6px;background:#f1f8e9;border:1.5px solid #a5d6a7;border-radius:10px;font-size:0.8em;font-weight:700;color:#2e7d32;cursor:pointer;">↑ Вывести</button>
                </div>
                <div id="ex-transfer-panel" style="display:none;margin-top:8px;padding:12px;background:#fafafa;border-radius:12px;border:1px solid #eee;">
                    <div id="ex-deposit-form">
                        <div style="font-size:0.75em;font-weight:700;color:#e65100;margin-bottom:5px;">↓ Пополнить биржевой кошелёк</div>
                        <div id="ex-deposit-avail" style="font-size:0.72em;color:#aaa;margin-bottom:5px;">Доступно: <b style="color:#33691e">${fmt(coins)} монет</b></div>
                        <div style="margin-bottom:8px;">
                            <input type="number" id="crypto-deposit-amount" min="1" max="${coins}" placeholder="Сумма"
                                style="width:100%;padding:10px 12px;border:1.5px solid #ddd;border-radius:10px;font-size:1em;box-sizing:border-box;">
                        </div>
                        <button class="crypto-deposit-btn crypto-wallet-action-btn" onclick="cryptoDeposit()">Пополнить →</button>
                    </div>
                    <div id="ex-withdraw-form" style="display:none;">
                        <div style="font-size:0.75em;font-weight:700;color:#2e7d32;margin-bottom:5px;">↑ Вывести на основной кошелёк</div>
                        <div id="ex-withdraw-avail" style="font-size:0.72em;color:#aaa;margin-bottom:5px;">Доступно: <b style="color:#e65100">${fmt(exchangeCoins)} монет</b> · комиссия 1%</div>
                        <div style="margin-bottom:8px;">
                            <input type="number" id="crypto-withdraw-amount" min="1" max="${exchangeCoins}" step="0.01" placeholder="Сумма"
                                style="width:100%;padding:10px 12px;border:1.5px solid #ddd;border-radius:10px;font-size:1em;box-sizing:border-box;">
                        </div>
                        <button class="crypto-withdraw-btn crypto-wallet-action-btn" onclick="cryptoWithdraw()">Вывести ←</button>
                    </div>
                    <div id="crypto-wallet-msg" style="font-size:0.82em;margin-top:6px;"></div>
                </div>
            </div>

            <!-- ③ ПОРТФЕЛЬ (всегда в DOM, скрыт при нулевой позиции) -->
            <div class="ex-card" id="ex-portfolio-card" style="${holding > 0 ? '' : 'display:none'}">
                <div class="ex-section-label">Мой портфель — ${asset.symbol}</div>
                <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:7px;margin-bottom:10px;">
                    <div class="ex-pf-cell">
                        <span>Количество</span>
                        <b id="ex-pf-amount">${holding.toFixed(dec)} ${asset.symbol}</b>
                    </div>
                    <div class="ex-pf-cell">
                        <span>Стоимость</span>
                        <b id="ex-pf-value">≈ ${holdingValue.toFixed(2)} 💰</b>
                    </div>
                    <div class="ex-pf-cell" id="ex-pf-avgprice-cell" style="${avgBuyPrice > 0 ? '' : 'display:none'}">
                        <span>Ср. цена входа</span>
                        <b id="ex-pf-avgprice">${avgBuyPrice.toLocaleString('ru-RU',{maximumFractionDigits:2})}</b>
                    </div>
                </div>
                <!-- SL/TP статус -->
                <div style="display:flex;gap:6px;align-items:center;">
                    <div id="ex-sl-badge" class="ex-sltp-badge ${_slActive ? 'ex-sltp-badge--sl-on' : 'ex-sltp-badge--off'}">
                        🔴 SL: ${_slActive ? _slVal.toLocaleString('ru-RU',{maximumFractionDigits:2}) + ' · ●' : 'не задан'}
                    </div>
                    <div id="ex-tp-badge" class="ex-sltp-badge ${_tpActive ? 'ex-sltp-badge--tp-on' : 'ex-sltp-badge--off'}">
                        🟢 TP: ${_tpActive ? _tpVal.toLocaleString('ru-RU',{maximumFractionDigits:2}) + ' · ●' : 'не задан'}
                    </div>
                    <button onclick="toggleSltpForm('${asset.id}')" title="Редактировать ордера" class="ex-sltp-edit-btn">✏️</button>
                </div>
                <!-- Форма SL/TP — скрыта по умолчанию -->
                <div id="sltp-edit-${asset.id}" class="ex-sltp-form">
                    <div style="font-size:0.73em;color:#aaa;margin-bottom:8px;">Ордер сработает автоматически когда цена достигнет указанного уровня</div>
                    <div style="display:flex;gap:8px;flex-wrap:wrap;">
                        <label style="flex:1;min-width:110px;">
                            <input type="number" id="sl-${asset.id}" placeholder="🔴 Stop-Loss" value="${_slVal || ''}"
                                style="width:100%;padding:8px 10px;border:1.5px solid #ffcdd2;border-radius:8px;font-size:0.88em;box-sizing:border-box;">
                        </label>
                        <label style="flex:1;min-width:110px;">
                            <input type="number" id="tp-${asset.id}" placeholder="🟢 Take-Profit" value="${_tpVal || ''}"
                                style="width:100%;padding:8px 10px;border:1.5px solid #c8e6c9;border-radius:8px;font-size:0.88em;box-sizing:border-box;">
                        </label>
                    </div>
                    <div style="display:flex;gap:8px;margin-top:8px;">
                        <button onclick="saveSlTp('${asset.id}')" style="flex:1;padding:9px;background:#1565c0;color:#fff;border:none;border-radius:10px;font-weight:700;cursor:pointer;font-size:0.83em;">💾 Сохранить</button>
                        <button onclick="resetSlTp('${asset.id}')" style="padding:9px 13px;background:#e53935;color:#fff;border:none;border-radius:10px;font-weight:700;cursor:pointer;font-size:0.83em;">🗑 Сбросить</button>
                    </div>
                    <div id="sltp-msg-${asset.id}" style="font-size:0.8em;text-align:center;margin-top:4px;"></div>
                </div>
            </div>

            <!-- ④ P&L -->
            <div id="ex-pnl-card" class="crypto-total-pnl ${pnlClass}">
                <span class="crypto-pnl-label">📈 Заработано за всё время</span>
                <span class="crypto-pnl-value" id="ex-pnl-value">${pnlSign}${totalPnl.toFixed(2)} монет</span>
            </div>

            <!-- ⑤ ТОРГОВЛЯ -->
            ${!canTrade ? `
            <div class="crypto-level-lock">
                <div class="crypto-lock-icon">🔒</div>
                <div class="crypto-lock-title">Торговля заблокирована</div>
                <div class="crypto-lock-desc">Достигни уровня 5 ⚡ Пикачу чтобы покупать и продавать активы.</div>
                <div class="crypto-lock-progress">Твой уровень: <b>${userLevel}</b> / 5</div>
            </div>
            ` : `
            <div class="ex-card">
                <div class="ex-section-label">Торговля</div>
                <div class="ex-trade-tabs">
                    <button class="ex-trade-tab ex-tab--buy-active" id="crypto-buy-tab" onclick="switchTradeTab('buy')">🟢 Купить</button>
                    <button class="ex-trade-tab" id="crypto-sell-tab" onclick="switchTradeTab('sell')">🔴 Продать</button>
                </div>
                <div id="crypto-buy-form">
                    <div class="ex-form-label">Потратить монет (биржевой кошелёк):</div>
                    <input type="number" id="crypto-buy-amount" min="1" max="${exchangeCoins}" placeholder="Введите сумму" oninput="updateBuyPreview()"
                        style="padding:11px 12px;border:1.5px solid #ddd;border-radius:10px;font-size:1em;box-sizing:border-box;margin-bottom:6px;">
                    <button class="crypto-all-btn" onclick="buyAll()" style="padding:9px 14px;width:auto;">На всё</button>
                    <div class="crypto-preview" id="crypto-buy-preview"></div>
                    <div class="ex-form-note">Комиссия 0.1% включена в стоимость</div>
                    <button class="crypto-confirm-btn buy" onclick="executeBuy()">Купить ${asset.symbol}</button>
                </div>
                <div id="crypto-sell-form" style="display:none;">
                    <div class="ex-form-label">Продать ${asset.symbol}:</div>
                    <input type="number" id="crypto-sell-amount" min="0.000001" step="0.000001" placeholder="Количество ${asset.symbol}" oninput="updateSellPreview()"
                        style="padding:11px 12px;border:1.5px solid #ddd;border-radius:10px;font-size:1em;box-sizing:border-box;margin-bottom:6px;">
                    <button class="crypto-all-btn" onclick="sellAll()" style="padding:9px 14px;width:auto;">Всё</button>
                    <div class="crypto-preview" id="crypto-sell-preview"></div>
                    <div class="ex-form-note">Комиссия 0.1% от суммы продажи</div>
                    <button class="crypto-confirm-btn sell" onclick="executeSell()">Продать ${asset.symbol}</button>
                </div>
            </div>
            `}

            <div id="crypto-msg" class="crypto-msg"></div>

        </div>
        `;
        _lastRenderedCryptoAsset = asset.id;

    } else {
        // ── Обновление значений без перестройки DOM (без мигания) ─────────────

        // Цена и изменение
        const priceEl = document.getElementById('ex-asset-price');
        if (priceEl) priceEl.innerHTML = `${btcPrice.toLocaleString('ru-RU',{maximumFractionDigits:4})} <span style="font-size:0.52em;font-weight:400;color:#999;">монет</span>`;

        const changeEl = document.getElementById('ex-asset-change');
        if (changeEl) {
            changeEl.textContent = `${changeSign}${change24h.toFixed(2)}% за 24ч`;
            changeEl.style.color = changeColor;
        }

        // Балансы кошельков
        const exBalEl = document.getElementById('ex-exchange-bal');
        if (exBalEl) exBalEl.textContent = `${fmt(exchangeCoins)} 💰`;

        const mainBalEl = document.getElementById('ex-main-bal');
        if (mainBalEl) mainBalEl.textContent = `${fmt(coins)} 💰`;

        // Доступно в формах пополнения/вывода
        const depositAvailEl = document.getElementById('ex-deposit-avail');
        if (depositAvailEl) depositAvailEl.innerHTML = `Доступно: <b style="color:#33691e">${fmt(coins)} монет</b>`;
        const depInput = document.getElementById('crypto-deposit-amount');
        if (depInput) depInput.max = coins;

        const withdrawAvailEl = document.getElementById('ex-withdraw-avail');
        if (withdrawAvailEl) withdrawAvailEl.innerHTML = `Доступно: <b style="color:#e65100">${fmt(exchangeCoins)} монет</b> · комиссия 1%`;
        const witInput = document.getElementById('crypto-withdraw-amount');
        if (witInput) witInput.max = exchangeCoins;

        // Портфель
        const portfolioCard = document.getElementById('ex-portfolio-card');
        if (portfolioCard) {
            portfolioCard.style.display = holding > 0 ? '' : 'none';
            if (holding > 0) {
                const pfAmount = document.getElementById('ex-pf-amount');
                if (pfAmount) pfAmount.textContent = `${holding.toFixed(dec)} ${asset.symbol}`;

                const pfValue = document.getElementById('ex-pf-value');
                if (pfValue) pfValue.textContent = `≈ ${holdingValue.toFixed(2)} 💰`;

                const pfAvgCell = document.getElementById('ex-pf-avgprice-cell');
                if (pfAvgCell) pfAvgCell.style.display = avgBuyPrice > 0 ? '' : 'none';
                const pfAvg = document.getElementById('ex-pf-avgprice');
                if (pfAvg && avgBuyPrice > 0) pfAvg.textContent = avgBuyPrice.toLocaleString('ru-RU',{maximumFractionDigits:2});

                // SL/TP бейджи
                const slBadge = document.getElementById('ex-sl-badge');
                if (slBadge) {
                    slBadge.className = `ex-sltp-badge ${_slActive ? 'ex-sltp-badge--sl-on' : 'ex-sltp-badge--off'}`;
                    slBadge.textContent = `🔴 SL: ${_slActive ? _slVal.toLocaleString('ru-RU',{maximumFractionDigits:2}) + ' · ●' : 'не задан'}`;
                }
                const tpBadge = document.getElementById('ex-tp-badge');
                if (tpBadge) {
                    tpBadge.className = `ex-sltp-badge ${_tpActive ? 'ex-sltp-badge--tp-on' : 'ex-sltp-badge--off'}`;
                    tpBadge.textContent = `🟢 TP: ${_tpActive ? _tpVal.toLocaleString('ru-RU',{maximumFractionDigits:2}) + ' · ●' : 'не задан'}`;
                }
            }
        }

        // P&L
        const pnlCard = document.getElementById('ex-pnl-card');
        if (pnlCard) pnlCard.className = `crypto-total-pnl ${pnlClass}`;
        const pnlValue = document.getElementById('ex-pnl-value');
        if (pnlValue) pnlValue.textContent = `${pnlSign}${totalPnl.toFixed(2)} монет`;

        // max у торговых инпутов
        const buyInput = document.getElementById('crypto-buy-amount');
        if (buyInput) buyInput.max = exchangeCoins;

        // Обновляем список активов в дропдауне (только список, не кнопку)
        const ddList = document.getElementById('asset-dropdown-list');
        if (ddList) ddList.innerHTML = assetDropdownItems;
    }

    startCryptoPriceUpdates();
}

// ─── UI-хелперы ────────────────────────────────────────────────────────────────

function toggleCryptoWallet() {
    const forms = document.getElementById('crypto-wallet-forms');
    const btn   = document.querySelector('.crypto-wallet-toggle');
    if (!forms) return;
    const show = forms.style.display === 'none';
    forms.style.display = show ? '' : 'none';
    if (btn) btn.textContent = show ? '💼 Управление кошельком ▲' : '💼 Управление кошельком ▼';
}

function switchTradeTab(tab) {
    document.getElementById('crypto-buy-form').style.display  = tab === 'buy'  ? '' : 'none';
    document.getElementById('crypto-sell-form').style.display = tab === 'sell' ? '' : 'none';
    const buyBtn  = document.getElementById('crypto-buy-tab');
    const sellBtn = document.getElementById('crypto-sell-tab');
    if (buyBtn)  { buyBtn.classList.toggle('ex-tab--buy-active',  tab === 'buy');  buyBtn.classList.toggle('ex-tab--sell-active', false); }
    if (sellBtn) { sellBtn.classList.toggle('ex-tab--sell-active', tab === 'sell'); sellBtn.classList.toggle('ex-tab--buy-active',  false); }
}

function toggleExTransfer(type) {
    const panel  = document.getElementById('ex-transfer-panel');
    const depF   = document.getElementById('ex-deposit-form');
    const witF   = document.getElementById('ex-withdraw-form');
    if (!panel) return;
    const showing     = panel.style.display !== 'none';
    const currentType = depF && depF.style.display !== 'none' ? 'deposit' : 'withdraw';
    if (showing && currentType === type) { panel.style.display = 'none'; return; }
    panel.style.display = '';
    if (depF) depF.style.display = type === 'deposit'  ? '' : 'none';
    if (witF) witF.style.display = type === 'withdraw' ? '' : 'none';
}

function toggleSltpForm(assetId) {
    const form = document.getElementById(`sltp-edit-${assetId}`);
    if (!form) return;
    const hidden = form.style.display === '' || form.style.display === 'none';
    form.style.display = hidden ? 'block' : 'none';
}

function updateBuyPreview() {
    const coinsInput = parseFloat(document.getElementById('crypto-buy-amount').value) || 0;
    const preview    = document.getElementById('crypto-buy-preview');
    const asset      = getAsset(currentCryptoAsset);
    if (!coinsInput || coinsInput < 1 || !cryptoPrices[asset.id]) { if (preview) preview.textContent = ''; return; }
    const commission   = coinsInput * CRYPTO_COMMISSION;
    const coinsForAsset= coinsInput - commission;
    const received     = coinsForAsset / cryptoPrices[asset.id].price;
    const dec = assetDecimals(asset.id);
    preview.innerHTML  = `Получите: <b>${received.toFixed(dec)} ${asset.symbol}</b><br>Комиссия: ${commission.toFixed(2)} монет`;
}

function updateSellPreview() {
    const assetInput = parseFloat(document.getElementById('crypto-sell-amount').value) || 0;
    const preview    = document.getElementById('crypto-sell-preview');
    const asset      = getAsset(currentCryptoAsset);
    if (!assetInput || !cryptoPrices[asset.id]) { if (preview) preview.textContent = ''; return; }
    const coinsGross = assetInput * cryptoPrices[asset.id].price;
    const commission = coinsGross * CRYPTO_COMMISSION;
    const coinsNet   = coinsGross - commission;
    preview.innerHTML= `Получите: <b>${coinsNet.toFixed(2)} монет</b><br>Комиссия: ${commission.toFixed(2)} монет`;
}

function buyAll() {
    const user = firebase.auth().currentUser;
    if (!user) return;
    firebase.firestore().collection('users').doc(user.uid).get().then(doc => {
        const input = document.getElementById('crypto-buy-amount');
        if (input) { input.value = doc.data().exchangeCoins || 0; updateBuyPreview(); }
    });
}

function sellAll() {
    const user  = firebase.auth().currentUser;
    const asset = getAsset(currentCryptoAsset);
    if (!user) return;
    firebase.firestore().collection('users').doc(user.uid).get().then(doc => {
        const amount = doc.data()[`${asset.id}Amount`] || 0;
        const input  = document.getElementById('crypto-sell-amount');
        const dec    = assetDecimals(asset.id);
        if (input) { input.value = amount.toFixed(dec); updateSellPreview(); }
    });
}

// ─── Управление кошельком ──────────────────────────────────────────────────────

async function cryptoDeposit() {
    const amount = parseInt(document.getElementById('crypto-deposit-amount')?.value) || 0;
    const msgEl  = document.getElementById('crypto-wallet-msg');
    const btn    = document.querySelector('.crypto-deposit-btn');
    if (amount < 1) { if (msgEl) msgEl.textContent = '❌ Минимум 1 монета'; return; }
    const user = firebase.auth().currentUser;
    if (!user) return;
    if (btn) { btn.disabled = true; btn.textContent = '⏳...'; }
    try {
        const ref  = firebase.firestore().collection('users').doc(user.uid);
        const snap = await ref.get();
        const freshCoins = snap.data().coins || 0;
        if (freshCoins < amount) {
            if (msgEl) msgEl.textContent = `❌ Недостаточно монет. У вас: ${freshCoins}`;
            if (btn) { btn.disabled = false; btn.textContent = 'Пополнить'; }
            return;
        }
        await ref.update({
            coins:         firebase.firestore.FieldValue.increment(-amount),
            exchangeCoins: firebase.firestore.FieldValue.increment(amount)
        });
        if (msgEl) { msgEl.style.color = '#27ae60'; msgEl.textContent = `✅ Пополнено на ${amount} монет`; }
        if (btn) { btn.disabled = false; btn.textContent = 'Пополнить →'; }
        renderCryptoExchange(true);
    } catch(e) {
        if (msgEl) { msgEl.style.color = '#e53935'; msgEl.textContent = '❌ Ошибка: ' + e.message; }
        if (btn) { btn.disabled = false; btn.textContent = 'Пополнить'; }
    }
}

async function cryptoWithdraw() {
    const amount = Math.round(parseFloat(document.getElementById('crypto-withdraw-amount')?.value) * 100) / 100 || 0;
    const msgEl  = document.getElementById('crypto-wallet-msg');
    const btn    = document.querySelector('.crypto-withdraw-btn');
    if (amount < 1) { if (msgEl) msgEl.textContent = '❌ Минимум 1 монета'; return; }
    const user = firebase.auth().currentUser;
    if (!user) return;
    if (btn) { btn.disabled = true; btn.textContent = '⏳...'; }
    try {
        const db  = firebase.firestore();
        const ref = db.collection('users').doc(user.uid);
        let userName = '';
        let tax = 0;

        // Транзакция только на своём документе (без записи в документ админа)
        await db.runTransaction(async (tx) => {
            const snap    = await tx.get(ref);
            const freshEx = snap.data().exchangeCoins || 0;
            userName = snap.data().name || '';
            if (freshEx < amount) throw new Error(`Недостаточно монет на бирже. У вас: ${freshEx}`);
            tax            = Math.max(0.01, Math.round(amount * 0.01 * 100) / 100);
            const received = amount - tax;
            tx.update(ref, {
                exchangeCoins: firebase.firestore.FieldValue.increment(-amount),
                coins:         firebase.firestore.FieldValue.increment(received)
            });
        });

        const received = amount - tax;
        // Налог → Cloud Function (асинхронно, не блокируем UI)
        if (tax > 0) {
            firebase.functions().httpsCallable('payTaxToAdmin')({
                amount: tax, source: 'exchange',
                userId: user.uid, userName,
                label: 'Налог на доходы пользователей'
            }).catch(e => console.error('Ошибка перечисления налога:', e));
        }

        const msg = tax > 0 ? `✅ Выведено ${received} монет (налог 1%: ${tax})` : `✅ Выведено ${amount} монет`;
        if (msgEl) { msgEl.style.color = '#27ae60'; msgEl.textContent = msg; }
        if (btn) { btn.disabled = false; btn.textContent = 'Вывести ←'; }
        renderCryptoExchange(true);
    } catch(e) {
        if (msgEl) { msgEl.style.color = '#e53935'; msgEl.textContent = '❌ Ошибка: ' + e.message; }
        if (btn) { btn.disabled = false; btn.textContent = 'Вывести'; }
    }
}

async function adminWithdrawCommission() {
    const user  = firebase.auth().currentUser;
    const msgEl = document.getElementById('crypto-msg');
    if (!user) return;
    try {
        const ref   = firebase.firestore().collection('users').doc(user.uid);
        const snap  = await ref.get();
        const exCoins = snap.data().exchangeCoins || 0;
        if (exCoins <= 0) { if (msgEl) { msgEl.style.color='#e53935'; msgEl.textContent='Биржевой кошелёк пуст'; } return; }
        await ref.update({ coins: firebase.firestore.FieldValue.increment(exCoins), exchangeCoins: 0 });
        if (msgEl) { msgEl.style.color='#27ae60'; msgEl.textContent=`✅ Выведено ${exCoins} монет на основной счёт`; }
        renderCryptoExchange(true);
    } catch(e) {
        if (msgEl) { msgEl.style.color='#e53935'; msgEl.textContent='❌ Ошибка: ' + e.message; }
    }
}

// ─── Комиссия → Админу ────────────────────────────────────────────────────────

async function addCommissionToAdmin(userId, userName, type, assetId, assetSymbol, assetAmount, coinsAmount, commission) {
    try {
        const fn = firebase.functions().httpsCallable('addTradeCommission');
        await fn({ userId, userName, type, assetId, assetSymbol, assetAmount, coinsAmount, commission });
    } catch(e) {
        console.error('Ошибка записи комиссии:', e);
    }
}

// ─── Покупка ───────────────────────────────────────────────────────────────────

async function executeBuy() {
    const coinsInput = parseFloat(document.getElementById('crypto-buy-amount').value) || 0;
    const msgEl      = document.getElementById('crypto-msg');
    const asset      = getAsset(currentCryptoAsset);
    if (coinsInput < 1) { msgEl.textContent = '❌ Минимум 1 монета'; return; }

    const user = firebase.auth().currentUser;
    if (!user) return;

    const btn = document.querySelector('.crypto-confirm-btn.buy');
    btn.disabled = true; btn.textContent = '⏳ Обработка...';

    try {
        const priceData = await fetchAssetPrice(asset);
        if (!priceData) throw new Error('Не удалось получить курс');

        const ref       = firebase.firestore().collection('users').doc(user.uid);
        const snap      = await ref.get();
        const freshData = snap.data();
        const freshEx   = freshData.exchangeCoins || 0;

        if (freshEx < coinsInput) {
            msgEl.textContent = `❌ Недостаточно монет на бирже. У вас: ${freshEx}`;
            btn.disabled = false; btn.textContent = `Купить ${asset.symbol}`; return;
        }

        const commission    = coinsInput * CRYPTO_COMMISSION;
        const coinsForAsset = coinsInput - commission;
        const assetReceived = coinsForAsset / priceData.price;
        const price         = priceData.price;
        const dec           = assetDecimals(asset.id);

        const oldAmount   = freshData[`${asset.id}Amount`]   || 0;
        const oldAvgPrice = freshData[`${asset.id}AvgPrice`] || 0;
        const newAvgPrice = (oldAmount + assetReceived > 0)
            ? ((oldAmount * oldAvgPrice) + (assetReceived * price)) / (oldAmount + assetReceived)
            : price;

        const update = {
            exchangeCoins: firebase.firestore.FieldValue.increment(-coinsInput),
        };
        update[`${asset.id}Amount`]   = firebase.firestore.FieldValue.increment(assetReceived);
        update[`${asset.id}AvgPrice`] = newAvgPrice;
        await ref.update(update);

        const userName = freshData.name || 'Неизвестно';
        await addCommissionToAdmin(user.uid, userName, 'buy', asset.id, asset.symbol, assetReceived, coinsInput, commission);

        await firebase.firestore().collection('exchange_trades').add({
            userId: user.uid, userName,
            type: 'buy', assetId: asset.id, assetSymbol: asset.symbol,
            assetAmount: assetReceived, price, coinsAmount: coinsInput, commission, pnl: null,
            timestamp: new Date()
        });

        msgEl.innerHTML = `✅ Куплено <b>${assetReceived.toFixed(dec)} ${asset.symbol}</b> за ${coinsInput} монет`;
        msgEl.style.color = '#27ae60';
        btn.disabled = false; btn.textContent = `Купить ${asset.symbol}`;
        cryptoPrices[asset.id] = { price, change24h: priceData.change24h, fetchedAt: Date.now() };
        renderCryptoExchange(true);
    } catch(e) {
        msgEl.textContent = '❌ Ошибка: ' + e.message;
        btn.disabled = false; btn.textContent = `Купить ${asset.symbol}`;
    }
}

// ─── Продажа ───────────────────────────────────────────────────────────────────

async function executeSell() {
    const assetInput = parseFloat(document.getElementById('crypto-sell-amount').value) || 0;
    const msgEl      = document.getElementById('crypto-msg');
    const asset      = getAsset(currentCryptoAsset);
    if (assetInput <= 0) { msgEl.textContent = `❌ Введите количество ${asset.symbol}`; return; }

    const user = firebase.auth().currentUser;
    if (!user) return;

    const btn = document.querySelector('.crypto-confirm-btn.sell');
    btn.disabled = true; btn.textContent = '⏳ Обработка...';

    try {
        const priceData = await fetchAssetPrice(asset);
        if (!priceData) throw new Error('Не удалось получить курс');

        const ref       = firebase.firestore().collection('users').doc(user.uid);
        const snap      = await ref.get();
        const freshData = snap.data();
        const freshAmt  = freshData[`${asset.id}Amount`] || 0;

        // округление до нужной точности для избежания floating-point ошибок
        const prec = Math.pow(10, assetDecimals(asset.id));
        const freshRounded = Math.round(freshAmt  * prec) / prec;
        const inputRounded = Math.round(assetInput * prec) / prec;

        if (freshRounded < inputRounded) {
            msgEl.textContent = `❌ Недостаточно ${asset.symbol}. У вас: ${freshRounded.toFixed(assetDecimals(asset.id))}`;
            btn.disabled = false; btn.textContent = `Продать ${asset.symbol}`; return;
        }

        const price      = priceData.price;
        const oldAvg     = freshData[`${asset.id}AvgPrice`] || 0;
        const coinsGross = assetInput * price;
        const commission = coinsGross * CRYPTO_COMMISSION;
        const coinsNet   = Math.round((coinsGross - commission) * 100) / 100;
        const pnl        = (price - oldAvg) * assetInput - commission;
        const dec        = assetDecimals(asset.id);

        const xpGain = pnl > 0 ? Math.floor(pnl) : 0;

        const update = {
            exchangeCoins: firebase.firestore.FieldValue.increment(coinsNet),
            totalPnl:      firebase.firestore.FieldValue.increment(pnl),
            weeklyPnl:     firebase.firestore.FieldValue.increment(pnl),
        };
        if (xpGain > 0) update.points = firebase.firestore.FieldValue.increment(xpGain);
        update[`${asset.id}Amount`] = firebase.firestore.FieldValue.increment(-assetInput);
        await ref.update(update);

        const userName = freshData.name || 'Неизвестно';
        await addCommissionToAdmin(user.uid, userName, 'sell', asset.id, asset.symbol, assetInput, coinsNet, commission);

        await firebase.firestore().collection('exchange_trades').add({
            userId: user.uid, userName,
            type: 'sell', assetId: asset.id, assetSymbol: asset.symbol,
            assetAmount: assetInput, price, coinsAmount: coinsNet, commission, pnl,
            timestamp: new Date()
        });

        const xpMsg = xpGain > 0 ? ` &nbsp;⭐ +${xpGain} опыта` : '';
        msgEl.innerHTML = `✅ Продано <b>${assetInput} ${asset.symbol}</b> за ${coinsNet} монет${xpMsg}`;
        msgEl.style.color = '#27ae60';
        btn.disabled = false; btn.textContent = `Продать ${asset.symbol}`;
        cryptoPrices[asset.id] = { price, change24h: priceData.change24h, fetchedAt: Date.now() };
        renderCryptoExchange(true);
    } catch(e) {
        msgEl.textContent = '❌ Ошибка: ' + e.message;
        btn.disabled = false; btn.textContent = `Продать ${asset.symbol}`;
    }
}

async function showInvestorStats() {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    const popup = document.createElement('div');
    popup.className = 'info-popup';
    popup.style.cssText = 'max-width:360px;width:94%;max-height:80vh;overflow:hidden;padding:0;border-radius:18px;display:flex;flex-direction:column;';
    popup.innerHTML = `<div style="padding:18px 16px 8px;text-align:center;font-size:1.1em;font-weight:700;">🏆 Рейтинг инвесторов</div><div style="text-align:center;color:#aaa;padding:12px;">Загрузка...</div>`;
    const close = () => { overlay.remove(); popup.remove(); };
    overlay.onclick = close;
    document.body.appendChild(overlay);
    document.body.appendChild(popup);

    try {
        const currentUser = firebase.auth().currentUser;
        const snap = await firebase.firestore().collection('users').get({ source: 'server' });
        const allDocs = snap.docs
            .map(doc => ({ uid: doc.id, ...doc.data() }))
            .filter(d => !d.isAdmin && d.name && d.name.trim());

        const medals = ['🥇', '🥈', '🥉'];

        const buildTable = (field) => {
            const players = allDocs
                .filter(d => (d[field] || 0) !== 0)
                .sort((a, b) => (b[field] || 0) - (a[field] || 0));
            if (!players.length) return `<div style="text-align:center;color:#aaa;padding:16px;">Никто ещё не торговал</div>`;
            const pos = players.filter(d => (d[field] || 0) > 0).length;
            const neg = players.length - pos;
            const rows = players.map((d, i) => {
                const pnl = d[field] || 0;
                const isMe = currentUser && d.uid === currentUser.uid;
                const pnlColor = pnl >= 0 ? '#2e7d32' : '#c62828';
                const pnlSign = pnl >= 0 ? '+' : '';
                const place = i < 3 ? medals[i] : `<span style="color:#999;font-size:0.85em;">${i + 1}</span>`;
                const rowBg = isMe ? 'background:#fffde7;' : (i % 2 === 0 ? 'background:#fff;' : 'background:#fafafa;');
                const nameStyle = isMe ? 'font-weight:700;color:#1565c0;' : 'font-weight:500;color:#222;';
                return `<tr style="${rowBg}">
                    <td style="text-align:center;padding:9px 8px;width:36px;">${place}</td>
                    <td style="padding:9px 6px;${nameStyle}">${d.name}${isMe ? ' 👤' : ''}</td>
                    <td style="text-align:right;padding:9px 12px;font-weight:700;color:${pnlColor};white-space:nowrap;width:100px;">${pnlSign}${pnl.toFixed(2)} 💰</td>
                </tr>`;
            }).join('');
            return `
                <div style="font-size:0.8em;color:#aaa;text-align:center;padding:4px 0 8px;">✅ ${pos} в плюсе &nbsp;·&nbsp; ❌ ${neg} в минусе</div>
                <table style="width:100%;border-collapse:collapse;font-size:0.92em;table-layout:fixed;">
                    <thead><tr style="background:#f0f0f0;color:#666;font-size:0.8em;font-weight:600;">
                        <th style="padding:7px 8px;text-align:center;width:36px;">#</th>
                        <th style="padding:7px 6px;text-align:left;">Игрок</th>
                        <th style="padding:7px 12px;text-align:right;width:100px;">PnL</th>
                    </tr></thead>
                    <tbody>${rows}</tbody>
                </table>`;
        };

        const buildWinnersTable = async () => {
            try {
                const wSnap = await firebase.firestore().collection('weekly_winners')
                    .orderBy('timestamp', 'desc').limit(20).get();
                if (wSnap.empty) return `<div style="text-align:center;color:#aaa;padding:16px;">Чемпионов ещё нет</div>`;
                const medals = ['🥇', '🥈', '🥉'];
                const rows = wSnap.docs.map((doc, i) => {
                    const d = doc.data();
                    const ts = d.timestamp?.toDate ? d.timestamp.toDate() : new Date();
                    const dateStr = ts.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit' });
                    const place = i < 3 ? medals[i] : `<span style="color:#999;font-size:0.85em;">${i+1}</span>`;
                    return `<tr style="${i%2===0?'background:#fff;':'background:#fafafa;'}">
                        <td style="text-align:center;padding:9px 8px;width:36px;">${place}</td>
                        <td style="padding:9px 6px;font-weight:500;color:#222;">${d.name}</td>
                        <td style="text-align:right;padding:9px 8px;font-size:0.8em;color:#888;width:72px;">${dateStr}</td>
                        <td style="text-align:right;padding:9px 12px;font-weight:700;color:#2e7d32;white-space:nowrap;width:90px;">+${(d.weeklyPnl||0).toFixed(2)} 💰</td>
                    </tr>`;
                }).join('');
                return `<table style="width:100%;border-collapse:collapse;font-size:0.92em;table-layout:fixed;">
                    <thead><tr style="background:#f0f0f0;color:#666;font-size:0.8em;font-weight:600;">
                        <th style="padding:7px 8px;text-align:center;width:36px;">#</th>
                        <th style="padding:7px 6px;text-align:left;">Чемпион</th>
                        <th style="padding:7px 8px;text-align:right;width:72px;">Дата</th>
                        <th style="padding:7px 12px;text-align:right;width:90px;">PnL</th>
                    </tr></thead>
                    <tbody>${rows}</tbody>
                </table>`;
            } catch(e) {
                return `<div style="text-align:center;color:#e53935;padding:16px;">Ошибка загрузки</div>`;
            }
        };

        const tabStyle = (active) => active
            ? 'flex:1;padding:7px;border:none;border-radius:8px;font-size:0.82em;font-weight:600;cursor:pointer;background:#1565c0;color:#fff;'
            : 'flex:1;padding:7px;border:none;border-radius:8px;font-size:0.82em;font-weight:600;cursor:pointer;background:#eee;color:#555;';

        const switchTab = async (tab) => {
            const body = document.getElementById('investor-tab-body');
            document.getElementById('inv-tab-week').style.cssText    = tabStyle(tab === 'week');
            document.getElementById('inv-tab-all').style.cssText     = tabStyle(tab === 'alltime');
            document.getElementById('inv-tab-champ').style.cssText   = tabStyle(tab === 'champ');
            if (tab === 'champ') {
                body.innerHTML = '<div style="text-align:center;color:#aaa;padding:12px;">Загрузка...</div>';
                body.innerHTML = await buildWinnersTable();
            } else {
                body.innerHTML = buildTable(tab === 'week' ? 'weeklyPnl' : 'totalPnl');
            }
        };

        window._investorSwitchTab = switchTab;

        popup.innerHTML = `
            <div style="padding:16px 16px 10px;text-align:center;">
                <div style="font-size:1.1em;font-weight:700;margin-bottom:10px;">🏆 Рейтинг инвесторов</div>
                <div style="display:flex;gap:6px;">
                    <button id="inv-tab-week"  onclick="event.stopPropagation();window._investorSwitchTab('week')"    style="${tabStyle(true)}">📅 Неделя</button>
                    <button id="inv-tab-all"   onclick="event.stopPropagation();window._investorSwitchTab('alltime')" style="${tabStyle(false)}">🏆 Всё время</button>
                    <button id="inv-tab-champ" onclick="event.stopPropagation();window._investorSwitchTab('champ')"   style="${tabStyle(false)}">👑 Чемпионы</button>
                </div>
            </div>
            <div id="investor-tab-body" style="overflow-y:auto;flex:1;min-height:0;padding:0 0 4px;"></div>
            <div style="padding:8px 16px 14px;text-align:center;">
                <button onclick="event.stopPropagation();document.querySelectorAll('.modal-overlay').forEach(e=>e.remove());document.querySelectorAll('.info-popup').forEach(e=>e.remove());" style="padding:6px 20px;border:none;border-radius:8px;background:#eee;color:#555;cursor:pointer;font-size:0.85em;">Закрыть</button>
            </div>`;

        switchTab('week');

    } catch(e) {
        popup.innerHTML = `<div style="padding:18px;text-align:center;color:#e53935;">Ошибка загрузки</div><div style="text-align:center;padding:8px;"><button onclick="document.querySelectorAll('.modal-overlay,.info-popup').forEach(e=>e.remove())" style="padding:6px 16px;border:none;border-radius:8px;background:#eee;cursor:pointer;">Закрыть</button></div>`;
    }
}

async function resetWeeklyRating() {
    if (!confirm('Сбросить недельный рейтинг инвесторов? Это обнулит weeklyPnl у всех игроков.')) return;
    try {
        const snap = await firebase.firestore().collection('users').get();
        const batch = firebase.firestore().batch();
        snap.docs.forEach(doc => {
            if (!doc.data().isAdmin) {
                batch.update(doc.ref, { weeklyPnl: 0 });
            }
        });
        await batch.commit();
        alert('✅ Недельный рейтинг сброшен!');
    } catch(e) {
        alert('❌ Ошибка: ' + e.message);
    }
}

// ─── Сохранение Stop-Loss / Take-Profit ───────────────────────────────────────

async function saveSlTp(assetId) {
    const user = firebase.auth().currentUser;
    if (!user) return;
    const sl = parseFloat(document.getElementById(`sl-${assetId}`)?.value) || 0;
    const tp = parseFloat(document.getElementById(`tp-${assetId}`)?.value) || 0;
    const msgEl = document.getElementById(`sltp-msg-${assetId}`);

    // Валидация: SL должен быть ниже TP
    if (sl > 0 && tp > 0 && sl >= tp) {
        if (msgEl) { msgEl.style.color = '#e53935'; msgEl.textContent = '❌ SL должен быть ниже TP'; }
        return;
    }

    try {
        await firebase.firestore().collection('users').doc(user.uid).update({
            [`${assetId}StopLoss`]:   sl,
            [`${assetId}TakeProfit`]: tp,
        });
        if (msgEl) { msgEl.style.color = '#27ae60'; msgEl.textContent = '✅ Ордера сохранены'; }
        if (msgEl) msgEl.textContent = ''; renderCryptoExchange(true);
    } catch(e) {
        if (msgEl) { msgEl.style.color = '#e53935'; msgEl.textContent = '❌ Ошибка'; }
    }
}

// ─── Сброс Stop-Loss / Take-Profit ────────────────────────────────────────────
async function resetSlTp(assetId) {
    const user = firebase.auth().currentUser;
    if (!user) return;
    const msgEl = document.getElementById(`sltp-msg-${assetId}`);
    try {
        await firebase.firestore().collection('users').doc(user.uid).update({
            [`${assetId}StopLoss`]:   0,
            [`${assetId}TakeProfit`]: 0,
        });
        if (msgEl) { msgEl.style.color = '#27ae60'; msgEl.textContent = '✅ Ордера сброшены'; }
        renderCryptoExchange(true);
    } catch(e) {
        if (msgEl) { msgEl.style.color = '#e53935'; msgEl.textContent = '❌ Ошибка'; }
    }
}

// ─── СТАТИСТИКА СДЕЛОК ────────────────────────────────────────────────────────

let _statsChart = null;

function switchCryptoTab(tab) {
    const tradeEl  = document.getElementById('crypto-content');
    const statsEl  = document.getElementById('crypto-stats-content');
    const btnTrade = document.getElementById('crypto-tab-trade');
    const btnStats = document.getElementById('crypto-tab-stats');
    if (!tradeEl || !statsEl) return;

    if (tab === 'trade') {
        tradeEl.style.display  = '';
        statsEl.style.display  = 'none';
        btnTrade.style.background = '#f7931a'; btnTrade.style.color = '#fff'; btnTrade.style.borderColor = '#f7931a';
        btnStats.style.background = '#fafafa'; btnStats.style.color = '#999'; btnStats.style.borderColor = '#eee';
    } else {
        tradeEl.style.display  = 'none';
        statsEl.style.display  = '';
        btnTrade.style.background = '#fafafa'; btnTrade.style.color = '#999'; btnTrade.style.borderColor = '#eee';
        btnStats.style.background = '#1e293b'; btnStats.style.color = '#f8fafc'; btnStats.style.borderColor = '#3b82f6';
        renderExchangeStats();
    }
}

async function renderExchangeStats() {
    const el = document.getElementById('crypto-stats-content');
    if (!el) return;
    el.innerHTML = `<div style="color:#64748b;text-align:center;padding:30px;font-size:0.9em;">Загружаем статистику...</div>`;

    const user = firebase.auth().currentUser;
    if (!user) return;

    try {
        const snap = await firebase.firestore()
            .collection('exchange_trades')
            .where('userId', '==', user.uid)
            .get({ source: 'server' });

        const all = snap.docs
            .map(d => ({ ...d.data(), id: d.id }))
            .sort((a, b) => (a.timestamp?.seconds || 0) - (b.timestamp?.seconds || 0));
        const trades = all.filter(t => t.type === 'sell' && t.pnl != null);

        if (trades.length === 0) {
            el.innerHTML = `<div style="background:#151820;border-radius:14px;padding:40px;text-align:center;color:#475569;">
                <div style="font-size:2em;margin-bottom:12px;">📊</div>
                <div style="font-size:0.95em;">Сделок ещё нет.<br>Начни торговать на бирже!</div>
            </div>`;
            return;
        }

        // Статистика
        const totalPnl  = trades.reduce((s, t) => s + t.pnl, 0);
        const wins      = trades.filter(t => t.pnl > 0);
        const losses    = trades.filter(t => t.pnl < 0);
        const winRate   = (wins.length / trades.length * 100).toFixed(1);
        const best      = Math.max(...trades.map(t => t.pnl));
        const worst     = Math.min(...trades.map(t => t.pnl));
        const avgTrade  = totalPnl / trades.length;
        const totalComm = all.reduce((s, t) => s + (t.commission || 0), 0);

        const fmtPnl = v => (v >= 0 ? '+' : '') + v.toFixed(2) + ' 💰';
        const fmtC   = v => v >= 0 ? '#10b981' : '#ef4444';

        // Накопленный PnL для графика
        const labels = []; const cumData = [];
        let running = 0;
        trades.forEach((t, i) => {
            running += t.pnl;
            labels.push('#' + (i + 1));
            cumData.push(+running.toFixed(2));
        });

        el.innerHTML = `
        <div style="background:#0d0f14;border-radius:16px;padding:16px;font-family:-apple-system,BlinkMacSystemFont,sans-serif;">

            <!-- Карточки -->
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:14px;">
                <div style="background:#151820;border:1px solid #1e293b;border-radius:14px;padding:16px;border-top:2px solid ${fmtC(totalPnl)};">
                    <div style="font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:0.8px;margin-bottom:8px;">Общий PnL</div>
                    <div style="font-size:22px;font-weight:700;color:${fmtC(totalPnl)};">${fmtPnl(totalPnl)}</div>
                    <div style="font-size:11px;color:#475569;margin-top:4px;">${trades.length} сделок закрыто</div>
                </div>
                <div style="background:#151820;border:1px solid #1e293b;border-radius:14px;padding:16px;border-top:2px solid #3b82f6;">
                    <div style="font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:0.8px;margin-bottom:8px;">Win Rate</div>
                    <div style="font-size:22px;font-weight:700;color:#f8fafc;">${winRate}%</div>
                    <div style="font-size:11px;color:#475569;margin-top:4px;">${wins.length}W / ${losses.length}L</div>
                </div>
                <div style="background:#151820;border:1px solid #1e293b;border-radius:14px;padding:16px;border-top:2px solid #10b981;">
                    <div style="font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:0.8px;margin-bottom:8px;">Лучшая сделка</div>
                    <div style="font-size:22px;font-weight:700;color:#10b981;">+${best.toFixed(2)} 💰</div>
                    <div style="font-size:11px;color:#475569;margin-top:4px;">Худшая: ${worst.toFixed(2)} 💰</div>
                </div>
                <div style="background:#151820;border:1px solid #1e293b;border-radius:14px;padding:16px;border-top:2px solid #f59e0b;">
                    <div style="font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:0.8px;margin-bottom:8px;">Средняя сделка</div>
                    <div style="font-size:22px;font-weight:700;color:${fmtC(avgTrade)};">${fmtPnl(avgTrade)}</div>
                    <div style="font-size:11px;color:#475569;margin-top:4px;">Комиссий: ${totalComm.toFixed(2)} 💰</div>
                </div>
            </div>

            <!-- График -->
            <div style="background:#151820;border:1px solid #1e293b;border-radius:14px;padding:16px;margin-bottom:14px;">
                <div style="font-size:12px;font-weight:600;color:#94a3b8;text-transform:uppercase;letter-spacing:0.6px;margin-bottom:14px;">Рост капитала</div>
                <div style="position:relative;height:180px;">
                    <canvas id="exchangeStatsChart"></canvas>
                </div>
            </div>

            <!-- Таблица сделок -->
            <div style="background:#151820;border:1px solid #1e293b;border-radius:14px;overflow:hidden;">
                <div style="padding:14px 16px;border-bottom:1px solid #1e293b;display:flex;justify-content:space-between;align-items:center;">
                    <div style="font-size:12px;font-weight:600;color:#94a3b8;text-transform:uppercase;letter-spacing:0.6px;">История сделок</div>
                    <div style="background:#1e293b;border-radius:6px;padding:2px 10px;font-size:12px;color:#64748b;">${trades.length} сделок</div>
                </div>
                <div style="overflow-x:auto;">
                <table style="width:100%;border-collapse:collapse;font-size:12px;">
                    <thead>
                        <tr style="background:#0f1117;">
                            <th style="padding:8px 12px;text-align:left;color:#475569;font-weight:600;font-size:10px;text-transform:uppercase;letter-spacing:0.7px;border-bottom:1px solid #1e293b;">Актив</th>
                            <th style="padding:8px 12px;text-align:right;color:#475569;font-weight:600;font-size:10px;text-transform:uppercase;letter-spacing:0.7px;border-bottom:1px solid #1e293b;">Цена</th>
                            <th style="padding:8px 12px;text-align:right;color:#475569;font-weight:600;font-size:10px;text-transform:uppercase;letter-spacing:0.7px;border-bottom:1px solid #1e293b;">PnL</th>
                            <th style="padding:8px 12px;text-align:right;color:#475569;font-weight:600;font-size:10px;text-transform:uppercase;letter-spacing:0.7px;border-bottom:1px solid #1e293b;">Дата</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${[...trades].reverse().map((t, i) => {
                            const isWin = t.pnl >= 0;
                            const ts = t.timestamp?.toDate ? t.timestamp.toDate().toLocaleDateString('ru-RU', {day:'2-digit',month:'2-digit'}) : '—';
                            return `<tr style="border-bottom:1px solid #1a2234;">
                                <td style="padding:10px 12px;color:#f8fafc;font-weight:600;">${t.assetSymbol || '—'}</td>
                                <td style="padding:10px 12px;text-align:right;color:#94a3b8;">${t.price?.toFixed(4) || '—'}</td>
                                <td style="padding:10px 12px;text-align:right;font-weight:700;color:${isWin ? '#10b981' : '#ef4444'};">${isWin ? '+' : ''}${t.pnl.toFixed(2)}</td>
                                <td style="padding:10px 12px;text-align:right;color:#475569;">${ts}</td>
                            </tr>`;
                        }).join('')}
                    </tbody>
                </table>
                </div>
            </div>
        </div>`;

        // Рендерим Chart.js
        if (_statsChart) { _statsChart.destroy(); _statsChart = null; }
        const ctx = document.getElementById('exchangeStatsChart');
        if (ctx && typeof Chart !== 'undefined') {
            const gradient = ctx.getContext('2d').createLinearGradient(0, 0, 0, 180);
            gradient.addColorStop(0, 'rgba(59,130,246,0.25)');
            gradient.addColorStop(1, 'rgba(59,130,246,0.00)');
            _statsChart = new Chart(ctx, {
                type: 'line',
                data: {
                    labels,
                    datasets: [{
                        label: 'PnL',
                        data: cumData,
                        borderColor: '#3b82f6',
                        backgroundColor: gradient,
                        borderWidth: 2.5,
                        pointBackgroundColor: cumData.map(v => v >= 0 ? '#10b981' : '#ef4444'),
                        pointBorderColor: '#151820',
                        pointBorderWidth: 2,
                        pointRadius: 4,
                        tension: 0.35,
                        fill: true
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { display: false },
                        tooltip: {
                            backgroundColor: '#1e293b',
                            borderColor: '#334155',
                            borderWidth: 1,
                            titleColor: '#94a3b8',
                            bodyColor: '#f8fafc',
                            callbacks: {
                                label: c => ` PnL: ${c.parsed.y >= 0 ? '+' : ''}${c.parsed.y.toFixed(2)} 💰`
                            }
                        }
                    },
                    scales: {
                        x: { grid: { color: '#1e293b' }, ticks: { color: '#475569', font: { size: 10 } } },
                        y: { grid: { color: '#1e293b' }, ticks: { color: '#475569', font: { size: 10 },
                            callback: v => (v >= 0 ? '+' : '') + v.toFixed(1)
                        }}
                    }
                }
            });
        }
    } catch(e) {
        el.innerHTML = `<div style="color:#ef4444;text-align:center;padding:20px;">Ошибка загрузки: ${e.message}</div>`;
    }
}
