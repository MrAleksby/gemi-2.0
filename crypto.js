// ─── Криптобиржа ───────────────────────────────────────────────────────────────

const CRYPTO_COMMISSION = 0.005; // 0.5%
const CRYPTO_ITEMS = [
    { id: 'btc', name: 'Bitcoin', symbol: 'BTC', icon: '₿', color: '#f7931a', cgId: 'bitcoin' }
];

let cryptoPrices = {};
let cryptoPriceInterval = null;

async function fetchCryptoPrice(cgId) {
    try {
        // Binance API — надёжный, бесплатный, без ключа
        const symbol = cgId === 'bitcoin' ? 'BTCUSDT' : cgId.toUpperCase() + 'USDT';
        const res = await fetch(`https://api.binance.com/api/v3/ticker/24hr?symbol=${symbol}`);
        const data = await res.json();
        return {
            price: parseFloat(data.lastPrice),
            change24h: parseFloat(data.priceChangePercent)
        };
    } catch (e) {
        return null;
    }
}

function stopCryptoPriceUpdates() {
    if (cryptoPriceInterval) { clearInterval(cryptoPriceInterval); cryptoPriceInterval = null; }
}

function startCryptoPriceUpdates() {
    stopCryptoPriceUpdates();
    cryptoPriceInterval = setInterval(async () => {
        const priceData = await fetchCryptoPrice('bitcoin');
        if (!priceData) return;
        cryptoPrices.btc = { ...priceData, fetchedAt: Date.now() };
        const priceEl = document.querySelector('.crypto-price');
        const changeEl = document.querySelector('.crypto-change');
        if (priceEl) priceEl.innerHTML = `${priceData.price.toLocaleString('ru-RU', {maximumFractionDigits: 2})} <span class="crypto-currency">монет</span>`;
        if (changeEl) {
            const s = priceData.change24h >= 0 ? '+' : '';
            changeEl.style.color = priceData.change24h >= 0 ? '#27ae60' : '#e53935';
            changeEl.textContent = `${s}${priceData.change24h.toFixed(2)}% за 24ч`;
        }
        // обновить превью если поле заполнено
        if (document.getElementById('crypto-buy-amount')?.value) updateBuyPreview();
        if (document.getElementById('crypto-sell-amount')?.value) updateSellPreview();
    }, 1000);
}

async function renderCryptoExchange() {
    const modal = document.getElementById('crypto-modal');
    const content = document.getElementById('crypto-content');
    if (!modal || !content) return;

    const user = firebase.auth().currentUser;
    if (!user) return;

    content.innerHTML = '<div class="crypto-loading">Загружаем курс... ₿</div>';

    const [priceData, userDoc] = await Promise.all([
        fetchCryptoPrice('bitcoin'),
        firebase.firestore().collection('users').doc(user.uid).get()
    ]);

    if (!priceData) {
        content.innerHTML = '<div class="crypto-error">Не удалось загрузить курс. Проверьте интернет.</div>';
        return;
    }

    const userData = userDoc.data();
    const coins = userData.coins || 0;
    const exchangeCoins = userData.exchangeCoins || 0;
    const btcAmount = userData.btcAmount || 0;
    const btcAvgPrice = userData.btcAvgPrice || 0;
    const isAdmin = userData.isAdmin === true;
    const btcPrice = priceData.price;
    const change24h = priceData.change24h;
    const changeSign = change24h >= 0 ? '+' : '';
    const changeColor = change24h >= 0 ? '#27ae60' : '#e53935';
    const btcValue = btcAmount * btcPrice; // value in coins

    cryptoPrices.btc = { price: btcPrice, change24h, fetchedAt: Date.now() };

    if (isAdmin) {
        // ─── Вид для АДМИНА ───────────────────────────────────────────────────
        // Загрузим историю комиссий
        let commissionsHtml = '';
        try {
            const commSnap = await firebase.firestore().collection('exchange_commissions')
                .orderBy('timestamp', 'desc').limit(20).get();
            if (commSnap.empty) {
                commissionsHtml = '<div style="color:#aaa;font-size:0.85em;">Комиссий ещё нет</div>';
            } else {
                commissionsHtml = commSnap.docs.map(doc => {
                    const d = doc.data();
                    const ts = d.timestamp?.toDate ? d.timestamp.toDate() : new Date(d.timestamp);
                    const dateStr = ts.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
                    const typeLabel = d.type === 'buy' ? 'покупка' : 'продажа';
                    return `<div class="crypto-commission-item">
                        <span>От ${d.userName} | ${typeLabel}</span>
                        <span>${(d.commission || 0).toFixed(2)} монет | ${dateStr}</span>
                    </div>`;
                }).join('');
            }
        } catch(e) {
            commissionsHtml = '<div style="color:#e53935;font-size:0.85em;">Ошибка загрузки истории</div>';
        }

        content.innerHTML = `
            <div class="crypto-card">
                <div class="crypto-header">
                    <span class="crypto-icon">₿</span>
                    <div>
                        <div class="crypto-name">Bitcoin (BTC)</div>
                        <div class="crypto-price">${btcPrice.toLocaleString('ru-RU', {maximumFractionDigits: 2})} <span class="crypto-currency">монет</span></div>
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

            <div style="margin-top:16px;">
                <h4 style="font-size:0.9em; color:#888; margin-bottom:8px;">📋 История комиссий (последние 20)</h4>
                ${commissionsHtml}
            </div>

            <div id="crypto-msg" class="crypto-msg"></div>
        `;

        startCryptoPriceUpdates();
        return;
    }

    // ─── Вид для ИГРОКА ───────────────────────────────────────────────────────

    // Загрузим историю сделок игрока
    let tradesHtml = '';
    try {
        const tradesSnap = await firebase.firestore().collection('exchange_trades')
            .where('userId', '==', user.uid)
            .orderBy('timestamp', 'desc')
            .limit(10)
            .get();
        if (tradesSnap.empty) {
            tradesHtml = '<div style="color:#aaa;font-size:0.85em;">Сделок ещё нет</div>';
        } else {
            tradesHtml = tradesSnap.docs.map(doc => {
                const d = doc.data();
                if (d.type === 'buy') {
                    return `<div class="crypto-trade-item buy">
                        <span>[покупка] Купил ${(d.btcAmount||0).toFixed(8)} BTC по ${Math.round(d.price||0).toLocaleString('ru-RU')} монет</span>
                        <span class="crypto-pnl-negative">-${(d.commission||0).toFixed(2)} монет</span>
                    </div>`;
                } else {
                    const pnl = d.pnl || 0;
                    const pnlClass = pnl >= 0 ? 'crypto-pnl-positive' : 'crypto-pnl-negative';
                    const pnlLabel = pnl >= 0 ? `+${pnl.toFixed(2)} монет прибыль ✅` : `${pnl.toFixed(2)} монет убыток ❌`;
                    return `<div class="crypto-trade-item sell">
                        <span>[продажа] Продал ${(d.btcAmount||0).toFixed(8)} BTC</span>
                        <span class="${pnlClass}">${pnlLabel}</span>
                    </div>`;
                }
            }).join('');
        }
    } catch(e) {
        tradesHtml = '<div style="color:#e53935;font-size:0.85em;">Ошибка загрузки истории</div>';
    }

    const avgPriceInfo = btcAvgPrice > 0 && btcAmount > 0
        ? `<div class="crypto-portfolio-row"><span>📈 Средняя цена BTC:</span><b>${Math.round(btcAvgPrice).toLocaleString('ru-RU')} монет</b></div>`
        : '';

    content.innerHTML = `
        <div class="crypto-card">
            <div class="crypto-header">
                <span class="crypto-icon">₿</span>
                <div>
                    <div class="crypto-name">Bitcoin (BTC)</div>
                    <div class="crypto-price">${btcPrice.toLocaleString('ru-RU', {maximumFractionDigits: 2})} <span class="crypto-currency">монет</span></div>
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
                <span>₿ Ваш Bitcoin:</span>
                <b>${btcAmount.toFixed(8)} BTC</b>
            </div>
            <div class="crypto-portfolio-row">
                <span>📊 Стоимость BTC:</span>
                <b>≈ ${btcValue.toFixed(2)} монет</b>
            </div>
            ${avgPriceInfo}
        </div>

        <div class="crypto-wallet-section">
            <button class="crypto-wallet-toggle" onclick="toggleCryptoWallet()">💼 Управление кошельком ▼</button>
            <div class="crypto-wallet-forms" id="crypto-wallet-forms" style="display:none;">
                <div style="font-size:0.85em; color:#888; margin-bottom:8px;">Пополнить биржу (из основного кошелька):</div>
                <div class="crypto-wallet-row">
                    <input type="number" id="crypto-deposit-amount" min="1" placeholder="Сумма монет">
                    <button class="crypto-deposit-btn" onclick="cryptoDeposit()">Пополнить</button>
                </div>
                <div style="font-size:0.85em; color:#888; margin-bottom:8px; margin-top:4px;">Вывести с биржи (на основной кошелёк):</div>
                <div class="crypto-wallet-row">
                    <input type="number" id="crypto-withdraw-amount" min="1" placeholder="Сумма монет">
                    <button class="crypto-withdraw-btn" onclick="cryptoWithdraw()">Вывести</button>
                </div>
                <div id="crypto-wallet-msg" style="font-size:0.85em; margin-top:6px;"></div>
            </div>
        </div>

        <div class="crypto-tabs">
            <button class="crypto-tab-btn active" id="crypto-buy-tab" onclick="switchCryptoTab('buy')">🟢 Купить</button>
            <button class="crypto-tab-btn" id="crypto-sell-tab" onclick="switchCryptoTab('sell')">🔴 Продать</button>
        </div>

        <div id="crypto-buy-form" class="crypto-form">
            <label>Потратить монет (биржевой кошелёк):</label>
            <div style="display:flex; align-items:center; gap:4px; margin-bottom:6px;">
                <input type="number" id="crypto-buy-amount" min="1" max="${exchangeCoins}" placeholder="Введите сумму" oninput="updateBuyPreview()" style="margin-bottom:0;">
                <button class="crypto-all-btn" onclick="buyAll()">Купить на всё</button>
            </div>
            <div class="crypto-preview" id="crypto-buy-preview"></div>
            <div class="crypto-commission-note">Комиссия: 0.5% включена в стоимость</div>
            <button class="crypto-confirm-btn buy" onclick="executeBuy()">Купить BTC</button>
        </div>

        <div id="crypto-sell-form" class="crypto-form" style="display:none">
            <label>Продать BTC:</label>
            <div style="display:flex; align-items:center; gap:4px; margin-bottom:6px;">
                <input type="number" id="crypto-sell-amount" min="0.00000001" step="0.00000001" placeholder="Кол-во BTC" oninput="updateSellPreview()" style="margin-bottom:0;">
                <button class="crypto-all-btn" onclick="sellAll()">Продать всё</button>
            </div>
            <div class="crypto-preview" id="crypto-sell-preview"></div>
            <div class="crypto-commission-note">Комиссия: 0.5% от суммы продажи</div>
            <button class="crypto-confirm-btn sell" onclick="executeSell()">Продать BTC</button>
        </div>

        <div id="crypto-msg" class="crypto-msg"></div>

        <div class="crypto-trade-history">
            <h4>📋 История сделок</h4>
            ${tradesHtml}
        </div>
    `;

    startCryptoPriceUpdates();
}

function toggleCryptoWallet() {
    const forms = document.getElementById('crypto-wallet-forms');
    const btn = document.querySelector('.crypto-wallet-toggle');
    if (!forms) return;
    if (forms.style.display === 'none') {
        forms.style.display = '';
        if (btn) btn.textContent = '💼 Управление кошельком ▲';
    } else {
        forms.style.display = 'none';
        if (btn) btn.textContent = '💼 Управление кошельком ▼';
    }
}

async function cryptoDeposit() {
    const amount = parseInt(document.getElementById('crypto-deposit-amount')?.value) || 0;
    const msgEl = document.getElementById('crypto-wallet-msg');
    if (amount < 1) { if (msgEl) msgEl.textContent = '❌ Минимум 1 монета'; return; }

    const user = firebase.auth().currentUser;
    if (!user) return;

    try {
        const userRef = firebase.firestore().collection('users').doc(user.uid);
        const freshDoc = await userRef.get();
        const freshCoins = freshDoc.data().coins || 0;
        if (freshCoins < amount) {
            if (msgEl) msgEl.textContent = `❌ Недостаточно монет. У вас: ${freshCoins}`;
            return;
        }
        await userRef.update({
            coins: firebase.firestore.FieldValue.increment(-amount),
            exchangeCoins: firebase.firestore.FieldValue.increment(amount)
        });
        if (msgEl) { msgEl.style.color = '#27ae60'; msgEl.textContent = `✅ Пополнено на ${amount} монет`; }
        setTimeout(() => renderCryptoExchange(), 1000);
    } catch(e) {
        if (msgEl) { msgEl.style.color = '#e53935'; msgEl.textContent = '❌ Ошибка: ' + e.message; }
    }
}

async function cryptoWithdraw() {
    const amount = parseInt(document.getElementById('crypto-withdraw-amount')?.value) || 0;
    const msgEl = document.getElementById('crypto-wallet-msg');
    if (amount < 1) { if (msgEl) msgEl.textContent = '❌ Минимум 1 монета'; return; }

    const user = firebase.auth().currentUser;
    if (!user) return;

    try {
        const userRef = firebase.firestore().collection('users').doc(user.uid);
        const freshDoc = await userRef.get();
        const freshExchange = freshDoc.data().exchangeCoins || 0;
        if (freshExchange < amount) {
            if (msgEl) msgEl.textContent = `❌ Недостаточно монет на бирже. У вас: ${freshExchange}`;
            return;
        }
        await userRef.update({
            exchangeCoins: firebase.firestore.FieldValue.increment(-amount),
            coins: firebase.firestore.FieldValue.increment(amount)
        });
        if (msgEl) { msgEl.style.color = '#27ae60'; msgEl.textContent = `✅ Выведено ${amount} монет`; }
        setTimeout(() => renderCryptoExchange(), 1000);
    } catch(e) {
        if (msgEl) { msgEl.style.color = '#e53935'; msgEl.textContent = '❌ Ошибка: ' + e.message; }
    }
}

async function adminWithdrawCommission() {
    const user = firebase.auth().currentUser;
    if (!user) return;
    const msgEl = document.getElementById('crypto-msg');

    try {
        const userRef = firebase.firestore().collection('users').doc(user.uid);
        const freshDoc = await userRef.get();
        const freshData = freshDoc.data();
        const exchangeCoins = freshData.exchangeCoins || 0;
        if (exchangeCoins <= 0) {
            if (msgEl) { msgEl.style.color = '#e53935'; msgEl.textContent = 'Биржевой кошелёк пуст'; }
            return;
        }
        await userRef.update({
            coins: firebase.firestore.FieldValue.increment(exchangeCoins),
            exchangeCoins: 0
        });
        if (msgEl) { msgEl.style.color = '#27ae60'; msgEl.textContent = `✅ Выведено ${exchangeCoins} монет на основной счёт`; }
        setTimeout(() => renderCryptoExchange(), 1000);
    } catch(e) {
        if (msgEl) { msgEl.style.color = '#e53935'; msgEl.textContent = '❌ Ошибка: ' + e.message; }
    }
}

function switchCryptoTab(tab) {
    document.getElementById('crypto-buy-form').style.display = tab === 'buy' ? '' : 'none';
    document.getElementById('crypto-sell-form').style.display = tab === 'sell' ? '' : 'none';
    document.getElementById('crypto-buy-tab').classList.toggle('active', tab === 'buy');
    document.getElementById('crypto-sell-tab').classList.toggle('active', tab === 'sell');
}

function buyAll() {
    const user = firebase.auth().currentUser;
    if (!user) return;
    firebase.firestore().collection('users').doc(user.uid).get().then(doc => {
        const exchangeCoins = doc.data().exchangeCoins || 0;
        const input = document.getElementById('crypto-buy-amount');
        if (input) { input.value = exchangeCoins; updateBuyPreview(); }
    });
}

function sellAll() {
    const user = firebase.auth().currentUser;
    if (!user) return;
    firebase.firestore().collection('users').doc(user.uid).get().then(doc => {
        const btcAmount = doc.data().btcAmount || 0;
        const input = document.getElementById('crypto-sell-amount');
        if (input) { input.value = btcAmount.toFixed(8); updateSellPreview(); }
    });
}

function updateBuyPreview() {
    const coinsInput = parseFloat(document.getElementById('crypto-buy-amount').value) || 0;
    const preview = document.getElementById('crypto-buy-preview');
    if (!coinsInput || coinsInput < 1 || !cryptoPrices.btc) { preview.textContent = ''; return; }
    const commission = coinsInput * CRYPTO_COMMISSION;
    const coinsForBtc = coinsInput - commission;
    const btcReceived = coinsForBtc / cryptoPrices.btc.price;
    preview.innerHTML = `Получите: <b>${btcReceived.toFixed(8)} BTC</b><br>Комиссия: ${commission.toFixed(2)} монет`;
}

function updateSellPreview() {
    const btcInput = parseFloat(document.getElementById('crypto-sell-amount').value) || 0;
    const preview = document.getElementById('crypto-sell-preview');
    if (!btcInput || !cryptoPrices.btc) { preview.textContent = ''; return; }
    const coinsGross = btcInput * cryptoPrices.btc.price;
    const commission = coinsGross * CRYPTO_COMMISSION;
    const coinsNet = coinsGross - commission;
    preview.innerHTML = `Получите: <b>${coinsNet.toFixed(2)} монет</b><br>Комиссия: ${commission.toFixed(2)} монет`;
}

async function addCommissionToAdmin(userId, userName, type, btcAmount, coinsAmount, commission) {
    try {
        const adminSnap = await firebase.firestore().collection('users')
            .where('isAdmin', '==', true).limit(1).get();
        if (!adminSnap.empty) {
            const adminRef = adminSnap.docs[0].ref;
            await adminRef.update({
                exchangeCoins: firebase.firestore.FieldValue.increment(commission)
            });
        }
        await firebase.firestore().collection('exchange_commissions').add({
            userId,
            userName,
            type,
            btcAmount,
            coinsAmount,
            commission,
            timestamp: new Date()
        });
    } catch(e) {
        console.error('Ошибка записи комиссии:', e);
    }
}

async function executeBuy() {
    const coinsInput = parseFloat(document.getElementById('crypto-buy-amount').value) || 0;
    const msgEl = document.getElementById('crypto-msg');
    if (coinsInput < 1) { msgEl.textContent = '❌ Минимум 1 монета'; return; }

    const user = firebase.auth().currentUser;
    if (!user) return;

    const btn = document.querySelector('.crypto-confirm-btn.buy');
    btn.disabled = true;
    btn.textContent = '⏳ Обработка...';

    try {
        const priceData = await fetchCryptoPrice('bitcoin');
        if (!priceData) throw new Error('Не удалось получить курс');

        const userRef = firebase.firestore().collection('users').doc(user.uid);
        const freshDoc = await userRef.get();
        const freshData = freshDoc.data();
        const freshExchangeCoins = freshData.exchangeCoins || 0;

        if (freshExchangeCoins < coinsInput) {
            msgEl.textContent = `❌ Недостаточно монет на бирже. У вас: ${freshExchangeCoins}`;
            btn.disabled = false;
            btn.textContent = 'Купить BTC';
            return;
        }

        const commission = coinsInput * CRYPTO_COMMISSION;
        const coinsForBtc = coinsInput - commission;
        const btcReceived = coinsForBtc / priceData.price;
        const currentPrice = priceData.price;

        // Обновляем среднюю цену покупки
        const oldBtcAmount = freshData.btcAmount || 0;
        const oldAvgPrice = freshData.btcAvgPrice || 0;
        let newAvgPrice;
        if (oldBtcAmount + btcReceived > 0) {
            newAvgPrice = ((oldBtcAmount * oldAvgPrice) + (btcReceived * currentPrice)) / (oldBtcAmount + btcReceived);
        } else {
            newAvgPrice = currentPrice;
        }

        await userRef.update({
            exchangeCoins: firebase.firestore.FieldValue.increment(-coinsInput),
            btcAmount: firebase.firestore.FieldValue.increment(btcReceived),
            btcAvgPrice: newAvgPrice
        });

        const userName = freshData.name || 'Неизвестно';

        // Записать комиссию и добавить на счёт админа
        await addCommissionToAdmin(user.uid, userName, 'buy', btcReceived, coinsInput, commission);

        // Записать сделку
        await firebase.firestore().collection('exchange_trades').add({
            userId: user.uid,
            userName,
            type: 'buy',
            btcAmount: btcReceived,
            price: currentPrice,
            coinsAmount: coinsInput,
            commission,
            pnl: null,
            timestamp: new Date()
        });

        msgEl.innerHTML = `✅ Куплено <b>${btcReceived.toFixed(8)} BTC</b> за ${coinsInput} монет`;
        msgEl.style.color = '#27ae60';
        cryptoPrices.btc = { price: priceData.price, change24h: priceData.change24h, fetchedAt: Date.now() };
        setTimeout(() => renderCryptoExchange(), 1500);
    } catch (e) {
        msgEl.textContent = '❌ Ошибка: ' + e.message;
        btn.disabled = false;
        btn.textContent = 'Купить BTC';
    }
}

async function executeSell() {
    const btcInput = parseFloat(document.getElementById('crypto-sell-amount').value) || 0;
    const msgEl = document.getElementById('crypto-msg');
    if (btcInput <= 0) { msgEl.textContent = '❌ Введите количество BTC'; return; }

    const user = firebase.auth().currentUser;
    if (!user) return;

    const btn = document.querySelector('.crypto-confirm-btn.sell');
    btn.disabled = true;
    btn.textContent = '⏳ Обработка...';

    try {
        const priceData = await fetchCryptoPrice('bitcoin');
        if (!priceData) throw new Error('Не удалось получить курс');

        const userRef = firebase.firestore().collection('users').doc(user.uid);
        const freshDoc = await userRef.get();
        const freshData = freshDoc.data();
        const freshBtc = freshData.btcAmount || 0;
        // округляем до 8 знаков чтобы избежать ошибок floating point
        const freshBtcRounded = Math.round(freshBtc * 1e8) / 1e8;
        const btcInputRounded = Math.round(btcInput * 1e8) / 1e8;

        if (freshBtcRounded < btcInputRounded) {
            msgEl.textContent = `❌ Недостаточно BTC. У вас: ${freshBtcRounded.toFixed(8)}`;
            btn.disabled = false;
            btn.textContent = 'Продать BTC';
            return;
        }

        const currentPrice = priceData.price;
        const oldAvgPrice = freshData.btcAvgPrice || 0;
        const coinsGross = btcInput * currentPrice;
        const commission = coinsGross * CRYPTO_COMMISSION;
        const coinsNet = Math.floor(coinsGross - commission);

        // P&L расчёт
        const pnl = (currentPrice - oldAvgPrice) * btcInput - commission;

        await userRef.update({
            exchangeCoins: firebase.firestore.FieldValue.increment(coinsNet),
            btcAmount: firebase.firestore.FieldValue.increment(-btcInput)
        });

        const userName = freshData.name || 'Неизвестно';

        // Записать комиссию и добавить на счёт админа
        await addCommissionToAdmin(user.uid, userName, 'sell', btcInput, coinsNet, commission);

        // Записать сделку
        await firebase.firestore().collection('exchange_trades').add({
            userId: user.uid,
            userName,
            type: 'sell',
            btcAmount: btcInput,
            price: currentPrice,
            coinsAmount: coinsNet,
            commission,
            pnl,
            timestamp: new Date()
        });

        msgEl.innerHTML = `✅ Продано <b>${btcInput} BTC</b> за ${coinsNet} монет`;
        msgEl.style.color = '#27ae60';
        cryptoPrices.btc = { price: priceData.price, change24h: priceData.change24h, fetchedAt: Date.now() };
        setTimeout(() => renderCryptoExchange(), 1500);
    } catch (e) {
        msgEl.textContent = '❌ Ошибка: ' + e.message;
        btn.disabled = false;
        btn.textContent = 'Продать BTC';
    }
}
