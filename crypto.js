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
];

let cryptoPrices = {};           // кэш цен { btc: {price, change24h, fetchedAt}, ... }
let cryptoPriceInterval = null;
let currentCryptoAsset = 'btc'; // текущий актив

// ─── Получение цены ────────────────────────────────────────────────────────────

async function fetchAssetPrice(asset) {
    try {
        if (asset.type === 'crypto') {
            const base = asset.futures
                ? 'https://fapi.binance.com/fapi/v1/ticker/24hr'
                : 'https://api.binance.com/api/v3/ticker/24hr';
            const res = await fetch(`${base}?symbol=${asset.binance}`);
            const d = await res.json();
            return { price: parseFloat(d.lastPrice), change24h: parseFloat(d.priceChangePercent) };
        } else {
            // Yahoo Finance для акций
            const res = await fetch(
                `https://query1.finance.yahoo.com/v8/finance/chart/${asset.yahoo}?interval=1d&range=1d`
            );
            const d = await res.json();
            const meta = d.chart.result[0].meta;
            const price = meta.regularMarketPrice;
            const prev  = meta.chartPreviousClose || price;
            return { price, change24h: ((price - prev) / prev) * 100 };
        }
    } catch(e) {
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
        if (cryptoPrices[a.id] && Date.now() - cryptoPrices[a.id].fetchedAt < 5000) return;
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

        const priceEl  = document.querySelector('.crypto-price');
        const changeEl = document.querySelector('.crypto-change');
        if (priceEl) {
            priceEl.innerHTML = `${pd.price.toLocaleString('ru-RU', {maximumFractionDigits: 4})} <span class="crypto-currency">монет</span>`;
        }
        if (changeEl) {
            const s = pd.change24h >= 0 ? '+' : '';
            changeEl.style.color = pd.change24h >= 0 ? '#27ae60' : '#e53935';
            changeEl.textContent = `${s}${pd.change24h.toFixed(2)}% за 24ч`;
        }
        if (document.getElementById('crypto-buy-amount')?.value) updateBuyPreview();
        if (document.getElementById('crypto-sell-amount')?.value) updateSellPreview();
    }, 3000);
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

async function renderCryptoExchange() {
    const content = document.getElementById('crypto-content');
    if (!content) return;
    const user = firebase.auth().currentUser;
    if (!user) return;

    content.innerHTML = '<div class="crypto-loading">Загружаем данные... ₿</div>';

    const asset = getAsset(currentCryptoAsset);

    const [priceData, userDoc] = await Promise.all([
        fetchAssetPrice(asset),
        firebase.firestore().collection('users').doc(user.uid).get()
    ]);

    if (!priceData) {
        content.innerHTML = `<div class="crypto-error">Не удалось загрузить курс ${asset.symbol}. Проверьте интернет.</div>`;
        return;
    }

    const userData     = userDoc.data();
    const coins        = userData.coins        || 0;
    const exchangeCoins= userData.exchangeCoins|| 0;
    const totalPnl     = userData.totalPnl     || 0;
    const isAdmin      = userData.isAdmin === true;
    const userLevel    = typeof getLevelByPoints === 'function'
        ? Math.max(1, getLevelByPoints(userData.points || 0)) : (currentUserLevel || 1);
    const canTrade     = true;

    const { amount: holding, avgPrice: avgBuyPrice } = assetHoldings(userData, asset.id);

    const btcPrice   = priceData.price;
    const change24h  = priceData.change24h;
    const changeSign = change24h >= 0 ? '+' : '';
    const changeColor= change24h >= 0 ? '#27ae60' : '#e53935';
    const holdingValue = holding * btcPrice;
    const dec = assetDecimals(asset.id);

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
            ${assetTabsHtml}

            <div class="crypto-card">
                <div class="crypto-header">
                    <span class="crypto-icon" style="color:${asset.color}">${asset.icon}</span>
                    <div>
                        <div class="crypto-name">${asset.name} (${asset.symbol})</div>
                        <div class="crypto-price">${btcPrice.toLocaleString('ru-RU', {maximumFractionDigits: 4})} <span class="crypto-currency">монет</span></div>
                        <div class="crypto-change" style="color:${changeColor}">${changeSign}${change24h.toFixed(2)}% за 24ч</div>
                    </div>
                </div>
            </div>

            <div class="crypto-admin-commission">
                <div style="font-weight:700; margin-bottom:8px; color:#5c1f4a;">💼 Биржевой кошелёк (комиссии)</div>
                <div style="font-size:1.3em; font-weight:700; color:#f7931a; margin-bottom:12px;">${exchangeCoins.toLocaleString('ru-RU')} монет</div>
                <div style="font-size:0.85em; color:#888; margin-bottom:10px;">💰 Основной счёт: ${coins.toLocaleString('ru-RU')} монет</div>
                <button class="crypto-confirm-btn buy" style="margin-bottom:0;" onclick="adminWithdrawCommission()">💸 Вывести на основной счёт</button>
            </div>

            <div style="margin-top:12px;">
                <button class="crypto-confirm-btn" style="background:#1565c0;margin-bottom:0;" onclick="showInvestorStats()">📊 Доходность инвесторов</button>
            </div>

            <div style="margin-top:16px;">
                <h4 style="font-size:0.9em; color:#888; margin-bottom:8px;">📋 История комиссий (последние 20)</h4>
                ${commissionsHtml}
            </div>

            <div id="crypto-msg" class="crypto-msg"></div>
        `;
        startCryptoPriceUpdates();
        return;
    }

    // ─── PLAYER VIEW ──────────────────────────────────────────────────────────

    let tradesHtml = '';
    try {
        const tradesSnap = await firebase.firestore().collection('exchange_trades')
            .where('userId', '==', user.uid)
            .where('assetId', '==', asset.id)
            .get();
        // Сортируем на клиенте, чтобы не нужен был составной индекс Firestore
        const tradeDocs = tradesSnap.docs
            .sort((a, b) => (b.data().timestamp?.seconds || 0) - (a.data().timestamp?.seconds || 0))
            .slice(0, 10);
        if (tradeDocs.length === 0) {
            tradesHtml = '<div style="color:#aaa;font-size:0.85em;">Сделок по этому активу ещё нет</div>';
        } else {
            tradesHtml = tradeDocs.map(doc => {
                const d = doc.data();
                if (d.type === 'buy') {
                    return `<div class="crypto-trade-item buy">
                        <span>[покупка] Купил ${(d.assetAmount||0).toFixed(dec)} ${asset.symbol} по ${Math.round(d.price||0).toLocaleString('ru-RU')} монет</span>
                        <span class="crypto-pnl-negative">-${(d.commission||0).toFixed(2)} монет</span>
                    </div>`;
                } else {
                    const pnl = d.pnl || 0;
                    const pnlClass = pnl >= 0 ? 'crypto-pnl-positive' : 'crypto-pnl-negative';
                    const pnlLabel = pnl >= 0 ? `+${pnl.toFixed(2)} монет ✅` : `${pnl.toFixed(2)} монет ❌`;
                    return `<div class="crypto-trade-item sell">
                        <span>[продажа] Продал ${(d.assetAmount||0).toFixed(dec)} ${asset.symbol}</span>
                        <span class="${pnlClass}">${pnlLabel}</span>
                    </div>`;
                }
            }).join('');
        }
    } catch(e) {
        tradesHtml = '<div style="color:#e53935;font-size:0.85em;">Ошибка загрузки истории</div>';
    }

    const avgPriceInfo = avgBuyPrice > 0 && holding > 0
        ? `<div class="crypto-portfolio-row"><span>📈 Средняя цена:</span><b>${avgBuyPrice.toLocaleString('ru-RU', {maximumFractionDigits: 4})} монет</b></div>`
        : '';

    const pnlClass = totalPnl >= 0 ? 'positive' : 'negative';
    const pnlSign  = totalPnl >= 0 ? '+' : '';

    content.innerHTML = `
        <div class="asset-tabs">${assetTabsHtml}</div>

        <div class="crypto-card">
            <div class="crypto-header">
                <span class="crypto-icon" style="color:${asset.color}">${asset.icon}</span>
                <div>
                    <div class="crypto-name">${asset.name} (${asset.symbol})${asset.type === 'stock' ? ' <span class="asset-type-badge">Акция</span>' : ''}</div>
                    <div class="crypto-price">${btcPrice.toLocaleString('ru-RU', {maximumFractionDigits: 4})} <span class="crypto-currency">монет</span></div>
                    <div class="crypto-change" style="color:${changeColor}">${changeSign}${change24h.toFixed(2)}% за 24ч</div>
                </div>
            </div>
        </div>

        <div class="crypto-portfolio">
            <div class="crypto-portfolio-row">
                <span>💼 Биржевой кошелёк:</span>
                <b>${exchangeCoins.toLocaleString('ru-RU')} монет</b>
            </div>
            <div class="crypto-portfolio-row">
                <span>💰 Основной кошелёк:</span>
                <b>${coins.toLocaleString('ru-RU')} монет</b>
            </div>
            <div class="crypto-portfolio-row">
                <span>${asset.icon} Ваш ${asset.symbol}:</span>
                <b>${holding.toFixed(dec)} ${asset.symbol}</b>
            </div>
            <div class="crypto-portfolio-row">
                <span>📊 Стоимость:</span>
                <b>≈ ${holdingValue.toFixed(2)} монет</b>
            </div>
            ${avgPriceInfo}
        </div>

        <div class="crypto-total-pnl ${pnlClass}">
            <span class="crypto-pnl-label">📈 Заработано за всё время</span>
            <span class="crypto-pnl-value">${pnlSign}${totalPnl.toFixed(2)} монет</span>
        </div>

        <button onclick="showInvestorStats()" style="width:100%;padding:10px;margin:8px 0 4px;background:linear-gradient(135deg,#1565c0,#1976d2);color:#fff;border:none;border-radius:12px;font-size:0.9em;font-weight:600;cursor:pointer;">🏆 Рейтинг инвесторов</button>

        <div class="crypto-wallet-section">
            <button class="crypto-wallet-toggle" onclick="toggleCryptoWallet()">💼 Управление кошельком ▼</button>
            <div class="crypto-wallet-forms" id="crypto-wallet-forms" style="display:none;">
                <div style="font-size:0.85em; color:#888; margin-bottom:4px;">Пополнить биржу (из основного кошелька):</div>
                <div style="font-size:0.8em; color:#27ae60; margin-bottom:6px;">Доступно: <b>${coins.toLocaleString('ru-RU')} монет</b></div>
                <div style="display:flex; gap:6px; align-items:center; margin-bottom:6px;">
                    <input type="number" id="crypto-deposit-amount" min="1" max="${coins}" placeholder="Введите сумму"
                        style="flex:1; width:0; min-width:0; padding:10px 12px; border:1.5px solid #ddd; border-radius:10px; font-size:1em; box-sizing:border-box; margin-top:0;">
                    <button class="crypto-all-btn" onclick="(function(){var el=document.getElementById('crypto-deposit-amount');el.value=${coins};el.dispatchEvent(new Event('input'));})()"
                        style="width:auto !important; flex-shrink:0; white-space:nowrap; padding:10px 14px; margin-top:0;">Макс</button>
                </div>
                <button class="crypto-deposit-btn crypto-wallet-action-btn" onclick="cryptoDeposit()">Пополнить →</button>
                <div style="font-size:0.85em; color:#888; margin-bottom:4px; margin-top:12px;">Вывести с биржи (на основной кошелёк):</div>
                <div style="font-size:0.8em; color:#f7931a; margin-bottom:6px;">Доступно: <b>${exchangeCoins.toLocaleString('ru-RU')} монет</b></div>
                <div style="display:flex; gap:6px; align-items:center; margin-bottom:6px;">
                    <input type="number" id="crypto-withdraw-amount" min="1" max="${exchangeCoins}" placeholder="Введите сумму"
                        style="flex:1; width:0; min-width:0; padding:10px 12px; border:1.5px solid #ddd; border-radius:10px; font-size:1em; box-sizing:border-box; margin-top:0;">
                    <button class="crypto-all-btn" onclick="(function(){var el=document.getElementById('crypto-withdraw-amount');el.value=${exchangeCoins};el.dispatchEvent(new Event('input'));})()"
                        style="width:auto !important; flex-shrink:0; white-space:nowrap; padding:10px 14px; margin-top:0;">Макс</button>
                </div>
                <button class="crypto-withdraw-btn crypto-wallet-action-btn" onclick="cryptoWithdraw()">Вывести ←</button>
                <div id="crypto-wallet-msg" style="font-size:0.85em; margin-top:6px;"></div>
            </div>
        </div>

        ${!canTrade ? `
        <div class="crypto-level-lock">
            <div class="crypto-lock-icon">🔒</div>
            <div class="crypto-lock-title">Торговля заблокирована</div>
            <div class="crypto-lock-desc">Достигни уровня 5 ⚡ Пикачу чтобы покупать и продавать активы.<br>Пока можешь наблюдать за ценами!</div>
            <div class="crypto-lock-progress">Твой уровень: <b>${userLevel}</b> / 5</div>
        </div>
        ` : `
        <div class="crypto-tabs">
            <button class="crypto-tab-btn active" id="crypto-buy-tab" onclick="switchCryptoTab('buy')">🟢 Купить</button>
            <button class="crypto-tab-btn" id="crypto-sell-tab" onclick="switchCryptoTab('sell')">🔴 Продать</button>
        </div>

        <div id="crypto-buy-form" class="crypto-form">
            <label>Потратить монет (биржевой кошелёк):</label>
            <div style="display:flex; align-items:center; gap:4px; margin-bottom:6px;">
                <input type="number" id="crypto-buy-amount" min="1" max="${exchangeCoins}" placeholder="Введите сумму" oninput="updateBuyPreview()" style="margin-bottom:0;">
                <button class="crypto-all-btn" onclick="buyAll()">На всё</button>
            </div>
            <div class="crypto-preview" id="crypto-buy-preview"></div>
            <div class="crypto-commission-note">Комиссия: 0.1% включена в стоимость</div>
            <button class="crypto-confirm-btn buy" onclick="executeBuy()">Купить ${asset.symbol}</button>
        </div>

        <div id="crypto-sell-form" class="crypto-form" style="display:none">
            <label>Продать ${asset.symbol}:</label>
            <div style="display:flex; align-items:center; gap:4px; margin-bottom:6px;">
                <input type="number" id="crypto-sell-amount" min="0.000001" step="0.000001" placeholder="Количество ${asset.symbol}" oninput="updateSellPreview()" style="margin-bottom:0;">
                <button class="crypto-all-btn" onclick="sellAll()">Продать всё</button>
            </div>
            <div class="crypto-preview" id="crypto-sell-preview"></div>
            <div class="crypto-commission-note">Комиссия: 0.1% от суммы продажи</div>
            <button class="crypto-confirm-btn sell" onclick="executeSell()">Продать ${asset.symbol}</button>
        </div>
        `}

        <div id="crypto-msg" class="crypto-msg"></div>

        <div class="crypto-trade-history">
            <h4>📋 История сделок — ${asset.symbol}</h4>
            ${tradesHtml}
        </div>
    `;

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

function switchCryptoTab(tab) {
    document.getElementById('crypto-buy-form').style.display  = tab === 'buy'  ? '' : 'none';
    document.getElementById('crypto-sell-form').style.display = tab === 'sell' ? '' : 'none';
    document.getElementById('crypto-buy-tab').classList.toggle('active',  tab === 'buy');
    document.getElementById('crypto-sell-tab').classList.toggle('active', tab === 'sell');
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
        setTimeout(() => renderCryptoExchange(), 1000);
    } catch(e) {
        if (msgEl) { msgEl.style.color = '#e53935'; msgEl.textContent = '❌ Ошибка: ' + e.message; }
        if (btn) { btn.disabled = false; btn.textContent = 'Пополнить'; }
    }
}

async function cryptoWithdraw() {
    const amount = parseInt(document.getElementById('crypto-withdraw-amount')?.value) || 0;
    const msgEl  = document.getElementById('crypto-wallet-msg');
    const btn    = document.querySelector('.crypto-withdraw-btn');
    if (amount < 1) { if (msgEl) msgEl.textContent = '❌ Минимум 1 монета'; return; }
    const user = firebase.auth().currentUser;
    if (!user) return;
    if (btn) { btn.disabled = true; btn.textContent = '⏳...'; }
    try {
        const db   = firebase.firestore();
        const ref  = db.collection('users').doc(user.uid);
        const adminSnap = await db.collection('users').where('isAdmin', '==', true).limit(1).get();
        const adminRef  = adminSnap.empty ? null : adminSnap.docs[0].ref;
        let userName = '';

        await db.runTransaction(async (tx) => {
            const snap    = await tx.get(ref);
            const freshEx = snap.data().exchangeCoins || 0;
            userName = snap.data().name || '';
            if (freshEx < amount) throw new Error(`Недостаточно монет на бирже. У вас: ${freshEx}`);
            const tax      = adminRef ? Math.max(1, Math.floor(amount * 0.01)) : 0;
            const received = amount - tax;
            tx.update(ref, {
                exchangeCoins: firebase.firestore.FieldValue.increment(-amount),
                coins:         firebase.firestore.FieldValue.increment(received)
            });
            if (adminRef && tax > 0) {
                tx.update(adminRef, { businessCoins: firebase.firestore.FieldValue.increment(tax) });
            }
        });

        const tax      = adminRef ? Math.max(1, Math.floor(amount * 0.01)) : 0;
        const received = amount - tax;
        if (adminRef && tax > 0) {
            db.collection('tax_log').add({
                userId: user.uid, userName,
                amount: tax, source: 'exchange',
                label: 'Налог на доходы пользователей',
                timestamp: new Date()
            }).catch(() => {});
        }
        const msg = tax > 0 ? `✅ Выведено ${received} монет (налог 1%: ${tax})` : `✅ Выведено ${amount} монет`;
        if (msgEl) { msgEl.style.color = '#27ae60'; msgEl.textContent = msg; }
        setTimeout(() => renderCryptoExchange(), 1000);
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
        setTimeout(() => renderCryptoExchange(), 1000);
    } catch(e) {
        if (msgEl) { msgEl.style.color='#e53935'; msgEl.textContent='❌ Ошибка: ' + e.message; }
    }
}

// ─── Комиссия → Админу ────────────────────────────────────────────────────────

async function addCommissionToAdmin(userId, userName, type, assetId, assetSymbol, assetAmount, coinsAmount, commission) {
    try {
        const adminSnap = await firebase.firestore().collection('users')
            .where('isAdmin', '==', true).limit(1).get();
        if (!adminSnap.empty) {
            await adminSnap.docs[0].ref.update({
                exchangeCoins: firebase.firestore.FieldValue.increment(commission)
            });
        }
        await firebase.firestore().collection('exchange_commissions').add({
            userId, userName, type, assetId, assetSymbol, assetAmount, coinsAmount, commission,
            timestamp: new Date()
        });
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
        cryptoPrices[asset.id] = { price, change24h: priceData.change24h, fetchedAt: Date.now() };
        setTimeout(() => renderCryptoExchange(), 1500);
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
        const coinsNet   = Math.floor(coinsGross - commission);
        const pnl        = (price - oldAvg) * assetInput - commission;
        const dec        = assetDecimals(asset.id);

        const update = {
            exchangeCoins: firebase.firestore.FieldValue.increment(coinsNet),
            totalPnl:      firebase.firestore.FieldValue.increment(pnl),
        };
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

        msgEl.innerHTML = `✅ Продано <b>${assetInput} ${asset.symbol}</b> за ${coinsNet} монет`;
        msgEl.style.color = '#27ae60';
        cryptoPrices[asset.id] = { price, change24h: priceData.change24h, fetchedAt: Date.now() };
        setTimeout(() => renderCryptoExchange(), 1500);
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
    popup.style.cssText = 'max-width:340px;width:92%;max-height:70vh;overflow-y:auto;';
    popup.innerHTML = `<div class="popup-title">📊 Доходность инвесторов</div><div style="text-align:center;color:#aaa;">Загрузка...</div>`;
    const close = () => { overlay.remove(); popup.remove(); };
    overlay.onclick = close;
    document.body.appendChild(overlay);
    document.body.appendChild(popup);

    try {
        const snap = await firebase.firestore().collection('users').get();
        const players = snap.docs
            .map(doc => doc.data())
            .filter(d => !d.isAdmin && d.name && d.name.trim() && (d.totalPnl || 0) !== 0)
            .sort((a, b) => (b.totalPnl || 0) - (a.totalPnl || 0));

        if (!players.length) {
            popup.innerHTML = `<div class="popup-title">📊 Доходность инвесторов</div><div style="text-align:center;color:#aaa;padding:12px;">Никто ещё не торговал</div><div class="popup-hint">Кликните для закрытия</div>`;
            popup.onclick = close;
            return;
        }

        const pos = players.filter(d => (d.totalPnl || 0) > 0).length;
        const neg = players.length - pos;

        const rows = players.map(d => {
            const pnl   = d.totalPnl || 0;
            const color = pnl >= 0 ? '#2e7d32' : '#c62828';
            const sign  = pnl >= 0 ? '+' : '';
            return `<div style="display:flex;align-items:center;gap:10px;padding:9px 0;border-bottom:1px solid #f0f0f0;">
                <span style="flex:1;font-weight:600;font-size:0.93em;">${d.name}</span>
                <span style="font-weight:700;color:${color};white-space:nowrap;">${sign}${pnl.toFixed(2)} 💰</span>
            </div>`;
        }).join('');

        popup.innerHTML = `
            <div class="popup-title">📊 Доходность инвесторов</div>
            <div style="font-size:0.82em;color:#aaa;text-align:center;margin-bottom:10px;">✅ ${pos} в плюсе · ❌ ${neg} в минусе</div>
            ${rows}
            <div class="popup-hint" style="margin-top:10px;">Кликните для закрытия</div>`;
        popup.onclick = close;
    } catch(e) {
        popup.innerHTML = `<div class="popup-title">📊 Доходность</div><div style="color:#e53935;text-align:center;">Ошибка загрузки</div><div class="popup-hint">Кликните для закрытия</div>`;
        popup.onclick = close;
    }
}
