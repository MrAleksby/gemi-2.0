// ─── Криптобиржа ───────────────────────────────────────────────────────────────

const CRYPTO_COMMISSION = 0.02; // 2%
const CRYPTO_ITEMS = [
    { id: 'btc', name: 'Bitcoin', symbol: 'BTC', icon: '₿', color: '#f7931a', cgId: 'bitcoin' }
];

let cryptoPrices = {}; // cache: { btc: { price: 104321, change24h: 2.3, fetchedAt: timestamp } }

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
    const btcAmount = userData.btcAmount || 0;
    const btcPrice = priceData.price;
    const change24h = priceData.change24h;
    const changeSign = change24h >= 0 ? '+' : '';
    const changeColor = change24h >= 0 ? '#27ae60' : '#e53935';
    const btcValue = btcAmount * btcPrice; // value in coins

    cryptoPrices.btc = { price: btcPrice, change24h, fetchedAt: Date.now() };

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
                <span>💰 Ваши монеты:</span>
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
        </div>

        <div class="crypto-tabs">
            <button class="crypto-tab-btn active" id="crypto-buy-tab" onclick="switchCryptoTab('buy')">🟢 Купить</button>
            <button class="crypto-tab-btn" id="crypto-sell-tab" onclick="switchCryptoTab('sell')">🔴 Продать</button>
        </div>

        <div id="crypto-buy-form" class="crypto-form">
            <label>Потратить монет:</label>
            <input type="number" id="crypto-buy-amount" min="1" max="${coins}" placeholder="Введите сумму" oninput="updateBuyPreview()">
            <div class="crypto-preview" id="crypto-buy-preview"></div>
            <div class="crypto-commission-note">Комиссия: 2% включена в стоимость</div>
            <button class="crypto-confirm-btn buy" onclick="executeBuy()">Купить BTC</button>
        </div>

        <div id="crypto-sell-form" class="crypto-form" style="display:none">
            <label>Продать BTC:</label>
            <input type="number" id="crypto-sell-amount" min="0.00000001" step="0.00000001" placeholder="Кол-во BTC" oninput="updateSellPreview()">
            <div class="crypto-preview" id="crypto-sell-preview"></div>
            <div class="crypto-commission-note">Комиссия: 2% от суммы продажи</div>
            <button class="crypto-confirm-btn sell" onclick="executeSell()">Продать BTC</button>
        </div>

        <div id="crypto-msg" class="crypto-msg"></div>
    `;
}

function switchCryptoTab(tab) {
    document.getElementById('crypto-buy-form').style.display = tab === 'buy' ? '' : 'none';
    document.getElementById('crypto-sell-form').style.display = tab === 'sell' ? '' : 'none';
    document.getElementById('crypto-buy-tab').classList.toggle('active', tab === 'buy');
    document.getElementById('crypto-sell-tab').classList.toggle('active', tab === 'sell');
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
        const freshCoins = freshData.coins || 0;

        if (freshCoins < coinsInput) {
            msgEl.textContent = `❌ Недостаточно монет. У вас: ${freshCoins}`;
            btn.disabled = false;
            btn.textContent = 'Купить BTC';
            return;
        }

        const commission = coinsInput * CRYPTO_COMMISSION;
        const coinsForBtc = coinsInput - commission;
        const btcReceived = coinsForBtc / priceData.price;

        await userRef.update({
            coins: firebase.firestore.FieldValue.increment(-coinsInput),
            btcAmount: firebase.firestore.FieldValue.increment(btcReceived)
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

        if (freshBtc < btcInput) {
            msgEl.textContent = `❌ Недостаточно BTC. У вас: ${freshBtc.toFixed(8)}`;
            btn.disabled = false;
            btn.textContent = 'Продать BTC';
            return;
        }

        const coinsGross = btcInput * priceData.price;
        const commission = coinsGross * CRYPTO_COMMISSION;
        const coinsNet = Math.floor(coinsGross - commission);

        await userRef.update({
            coins: firebase.firestore.FieldValue.increment(coinsNet),
            btcAmount: firebase.firestore.FieldValue.increment(-btcInput)
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
