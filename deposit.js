// ─── Инвестиции: Депозит ──────────────────────────────────────────────────────

// Ставки по уровням (% в день)
const DEPOSIT_RATES = [
    { minLevel: 25, rate: 10 },
    { minLevel: 20, rate: 7  },
    { minLevel: 15, rate: 5  },
    { minLevel: 10, rate: 3  },
    { minLevel: 5,  rate: 2  },
    { minLevel: 1,  rate: 1  },
];

function getDepositRate(level) {
    for (const r of DEPOSIT_RATES) {
        if (level >= r.minLevel) return r.rate;
    }
    return 1;
}

function getNextDepositRate(level) {
    for (let i = DEPOSIT_RATES.length - 1; i >= 0; i--) {
        if (DEPOSIT_RATES[i].minLevel > level) return DEPOSIT_RATES[i];
    }
    return null;
}

// Начисленные проценты с момента последнего сбора
function calcAccruedInterest(dep) {
    const now = Date.now();
    const last = dep.lastCollected?.toMillis
        ? dep.lastCollected.toMillis()
        : dep.createdAt?.toMillis
            ? dep.createdAt.toMillis()
            : Date.now();
    const diffDays = (now - last) / (1000 * 60 * 60 * 24);
    return diffDays * (dep.ratePercent / 100) * dep.amount;
}

// ─── Хаб «Инвестиции» ────────────────────────────────────────────────────────

async function renderInvestHub() {
    const content = document.getElementById('invest-content');
    if (!content) return;
    const user = firebase.auth().currentUser;
    if (!user) return;

    content.innerHTML = '<div class="crypto-loading">Загружаем... 💼</div>';

    const [userSnap, depSnap] = await Promise.all([
        firebase.firestore().collection('users').doc(user.uid).get(),
        firebase.firestore().collection('deposits')
            .where('userId', '==', user.uid)
            .where('status', '==', 'active')
            .limit(1).get()
    ]);

    const userData = userSnap.data();
    const level = typeof getLevelByPoints === 'function'
        ? Math.max(1, Math.min(getLevelByPoints(userData.points || 0), 25))
        : (currentUserLevel || 1);
    const rate = getDepositRate(level);
    const nextRate = getNextDepositRate(level);

    let depositBadge = '';
    if (!depSnap.empty) {
        const dep = depSnap.docs[0].data();
        const accrued = calcAccruedInterest(dep);
        depositBadge = `<div class="invest-hub-badge">✅ Активен · +${accrued.toFixed(2)} монет начислено</div>`;
    } else {
        depositBadge = `<div class="invest-hub-badge inactive">Нет активного депозита</div>`;
    }

    content.innerHTML = `
        <div style="display:flex;flex-direction:column;gap:14px;padding:4px 0 8px;">

            <div class="invest-hub-card" style="border-color:#e0e0e0;opacity:0.55;cursor:not-allowed;">
                <div class="invest-hub-icon" style="background:linear-gradient(135deg,#bbb,#ccc);">🏦</div>
                <div class="invest-hub-body">
                    <div class="invest-hub-title">Депозит</div>
                    <div class="invest-hub-desc">Пассивный доход под процент</div>
                    <div style="font-size:0.85em;color:#aaa;font-weight:600;margin-top:5px;">🔒 Скоро открытие</div>
                </div>
                <div class="invest-hub-arrow" style="color:#ddd;">›</div>
            </div>

            <div class="invest-hub-card" onclick="openExchangeFromHub()" style="border-color:#f7931a;">
                <div class="invest-hub-icon" style="background:linear-gradient(135deg,#f7931a,#e67e22);">📈</div>
                <div class="invest-hub-body">
                    <div class="invest-hub-title">Биржа</div>
                    <div class="invest-hub-desc">Торгуй активами в реальном времени</div>
                    <div style="font-size:0.82em;color:#888;margin-top:5px;">
                        ₿ BTC &nbsp;·&nbsp; ETH &nbsp;·&nbsp; 🍎 AAPL &nbsp;·&nbsp; 🚗 TSLA &nbsp;·&nbsp; 🥇 Gold...
                    </div>
                </div>
                <div class="invest-hub-arrow">›</div>
            </div>

        </div>
    `;
}

function openExchangeFromHub() {
    showModal('crypto-modal');
    renderCryptoExchange();
    setNavTab('crypto');
}

function openDepositModal() {
    showModal('deposit-modal');
    renderDepositTab();
}

// ─── Вкладка «Депозит» ────────────────────────────────────────────────────────

async function renderDepositTab() {
    const content = document.getElementById('deposit-content');
    if (!content) return;
    content.innerHTML = '<div class="crypto-loading">Загружаем депозит... 🏦</div>';

    const user = firebase.auth().currentUser;
    if (!user) return;

    const [userSnap, depSnap] = await Promise.all([
        firebase.firestore().collection('users').doc(user.uid).get(),
        firebase.firestore().collection('deposits')
            .where('userId', '==', user.uid)
            .where('status', '==', 'active')
            .limit(1).get()
    ]);

    const userData = userSnap.data();
    const coins    = userData.coins || 0;
    const level    = typeof getLevelByPoints === 'function'
        ? Math.max(1, Math.min(getLevelByPoints(userData.points || 0), 25))
        : (currentUserLevel || 1);
    const rate     = getDepositRate(level);
    const nextRate = getNextDepositRate(level);

    const rateTableRows = DEPOSIT_RATES.slice().reverse().map(r => {
        const isCurrent = rate === r.rate;
        return `<tr style="${isCurrent ? 'background:#e8f5e9;' : ''}">
            <td style="padding:7px 12px;color:#666;">Ур. ${r.minLevel}${r.minLevel < 25 ? '–' + (DEPOSIT_RATES[DEPOSIT_RATES.findIndex(x=>x.rate===r.rate)-1]?.minLevel - 1 || 24) : '+'}</td>
            <td style="padding:7px 12px;font-weight:${isCurrent ? '700' : '400'};color:${isCurrent ? '#27ae60' : '#333'};">
                ${r.rate}% / день
                ${isCurrent ? '<span style="font-size:0.8em;color:#27ae60;"> ← вы здесь</span>' : ''}
            </td>
        </tr>`;
    }).join('');

    if (!depSnap.empty) {
        // ── Активный депозит ──
        const dep = { id: depSnap.docs[0].id, ...depSnap.docs[0].data() };
        const accrued = calcAccruedInterest(dep);
        const createdAt = dep.createdAt?.toDate ? dep.createdAt.toDate() : new Date();
        const totalEarned = (dep.totalEarned || 0);

        content.innerHTML = `
            <div class="deposit-active-card">
                <div style="text-align:center;margin-bottom:14px;">
                    <div style="font-size:2em;">🏦</div>
                    <div style="font-weight:700;color:#2e7d32;font-size:1.05em;">Активный депозит</div>
                </div>

                <div class="deposit-rows">
                    <div class="deposit-row">
                        <span>💰 Сумма вклада</span>
                        <b>${dep.amount.toLocaleString('ru-RU')} монет</b>
                    </div>
                    <div class="deposit-row">
                        <span>📈 Ставка</span>
                        <b style="color:#27ae60;">${dep.ratePercent}% в день</b>
                    </div>
                    <div class="deposit-row">
                        <span>📅 Открыт</span>
                        <b>${createdAt.toLocaleDateString('ru-RU')}</b>
                    </div>
                    <div class="deposit-row" style="border-top:1px dashed #c8e6c9;padding-top:10px;margin-top:4px;">
                        <span>⏳ Начислено сейчас</span>
                        <b style="color:#27ae60;">+${accrued.toFixed(2)} монет</b>
                    </div>
                    <div class="deposit-row">
                        <span>🏆 Собрано всего</span>
                        <b style="color:#27ae60;">+${totalEarned.toFixed(2)} монет</b>
                    </div>
                </div>

                <button onclick="collectDepositInterest('${dep.id}', ${accrued})"
                    class="deposit-collect-btn">
                    💸 Собрать ${accrued.toFixed(2)} монет
                </button>
                <button onclick="closeDeposit('${dep.id}', ${dep.amount}, ${accrued})"
                    class="deposit-close-btn">
                    🔓 Закрыть и вернуть ${dep.amount.toLocaleString('ru-RU')} монет
                </button>
            </div>

            <div class="deposit-rate-table">
                <div style="font-size:0.88em;color:#888;margin-bottom:8px;font-weight:600;">📊 Таблица ставок</div>
                <table style="width:100%;border-collapse:collapse;font-size:0.9em;">${rateTableRows}</table>
            </div>

            <div id="deposit-msg" class="crypto-msg"></div>
        `;

    } else {
        // ── Форма открытия депозита ──
        content.innerHTML = `
            <div class="deposit-create-card">
                <div style="text-align:center;margin-bottom:16px;">
                    <div style="font-size:2.2em;">🏦</div>
                    <div style="font-weight:700;color:#2e7d32;font-size:1.05em;margin-top:4px;">Открыть депозит</div>
                    <div style="font-size:0.88em;color:#888;margin-top:4px;">
                        Ваша ставка: <b style="color:#27ae60;">${rate}% в день</b> (уровень ${level})
                    </div>
                    ${nextRate
                        ? `<div style="font-size:0.8em;color:#aaa;margin-top:2px;">С уровня ${nextRate.minLevel} будет ${nextRate.rate}% в день</div>`
                        : `<div style="font-size:0.8em;color:#f7931a;margin-top:2px;">🏆 Максимальная ставка!</div>`}
                </div>

                <div style="font-size:0.85em;color:#888;margin-bottom:4px;">Сумма (из основного кошелька):</div>
                <div style="font-size:0.82em;color:#27ae60;margin-bottom:6px;">Доступно: <b>${coins.toLocaleString('ru-RU')} монет</b></div>
                <div style="display:flex;gap:8px;align-items:center;margin-bottom:10px;">
                    <input type="number" id="deposit-amount-input" min="1" max="${coins}"
                        placeholder="Введите сумму" oninput="updateDepositPreview(${rate})"
                        style="flex:1;width:0;min-width:0;padding:12px;border:1.5px solid #a5d6a7;border-radius:10px;font-size:1em;box-sizing:border-box;margin-top:0;">
                    <button onclick="document.getElementById('deposit-amount-input').value=${coins};updateDepositPreview(${rate});"
                        style="width:auto !important;flex-shrink:0;padding:12px 14px;margin-top:0;background:rgba(39,174,96,0.12);border:1.5px solid #27ae60;color:#27ae60;border-radius:10px;cursor:pointer;font-weight:600;">
                        Макс
                    </button>
                </div>

                <div id="deposit-preview" class="deposit-preview" style="display:none;">
                    <div class="deposit-preview-row">📅 Доход в день: <b id="dep-daily">0</b> монет</div>
                    <div class="deposit-preview-row">📆 За 7 дней: <b id="dep-7d">0</b> монет</div>
                    <div class="deposit-preview-row">📆 За 30 дней: <b id="dep-30d">0</b> монет</div>
                </div>

                <button onclick="createDeposit(${rate})" class="deposit-collect-btn" style="margin-top:4px;">
                    🏦 Открыть депозит
                </button>
            </div>

            <div class="deposit-rate-table">
                <div style="font-size:0.88em;color:#888;margin-bottom:8px;font-weight:600;">📊 Ставки по уровням</div>
                <table style="width:100%;border-collapse:collapse;font-size:0.9em;">${rateTableRows}</table>
                <div style="font-size:0.78em;color:#aaa;margin-top:8px;text-align:center;">Повышай уровень — получай больше!</div>
            </div>

            <div id="deposit-msg" class="crypto-msg"></div>
        `;
    }
}

// ─── Превью расчёта ───────────────────────────────────────────────────────────

function updateDepositPreview(rate) {
    const amount  = parseFloat(document.getElementById('deposit-amount-input')?.value) || 0;
    const preview = document.getElementById('deposit-preview');
    if (!preview) return;
    if (amount < 1) { preview.style.display = 'none'; return; }
    const daily = amount * rate / 100;
    document.getElementById('dep-daily').textContent = daily.toFixed(2);
    document.getElementById('dep-7d').textContent    = (daily * 7).toFixed(2);
    document.getElementById('dep-30d').textContent   = (daily * 30).toFixed(2);
    preview.style.display = '';
}

// ─── Создать депозит ──────────────────────────────────────────────────────────

async function createDeposit(rate) {
    const amount = parseInt(document.getElementById('deposit-amount-input')?.value) || 0;
    const msgEl  = document.getElementById('deposit-msg');
    if (amount < 1) {
        if (msgEl) { msgEl.style.color = '#e53935'; msgEl.textContent = '❌ Введите сумму'; }
        return;
    }

    const user = firebase.auth().currentUser;
    if (!user) return;

    const btn = document.querySelector('.deposit-collect-btn');
    if (btn) { btn.disabled = true; btn.textContent = '⏳...'; }

    try {
        const db      = firebase.firestore();
        const userRef = db.collection('users').doc(user.uid);

        await db.runTransaction(async (tx) => {
            const snap       = await tx.get(userRef);
            const freshCoins = snap.data().coins || 0;
            if (freshCoins < amount) throw new Error(`Недостаточно монет. У вас: ${freshCoins}`);
            tx.update(userRef, { coins: firebase.firestore.FieldValue.increment(-amount) });
        });

        const userSnap = await userRef.get();
        await db.collection('deposits').add({
            userId:       user.uid,
            userName:     userSnap.data().name || '',
            amount,
            ratePercent:  rate,
            createdAt:    new Date(),
            lastCollected: new Date(),
            totalEarned:  0,
            status:       'active'
        });

        if (msgEl) { msgEl.style.color = '#27ae60'; msgEl.textContent = `✅ Депозит на ${amount} монет открыт!`; }
        setTimeout(() => renderDepositTab(), 1000);
    } catch(e) {
        if (msgEl) { msgEl.style.color = '#e53935'; msgEl.textContent = '❌ Ошибка: ' + e.message; }
        if (btn) { btn.disabled = false; btn.textContent = '🏦 Открыть депозит'; }
    }
}

// ─── Собрать проценты ─────────────────────────────────────────────────────────

async function collectDepositInterest(depId, accrued) {
    const msgEl = document.getElementById('deposit-msg');
    const earned = Math.floor(accrued);
    if (earned < 1) {
        if (msgEl) { msgEl.style.color = '#e8956d'; msgEl.textContent = '⏳ Ещё не накопилось — подожди немного!'; }
        return;
    }

    const user = firebase.auth().currentUser;
    if (!user) return;

    const btn = document.querySelector('.deposit-collect-btn');
    if (btn) { btn.disabled = true; btn.textContent = '⏳...'; }

    try {
        const db = firebase.firestore();
        await Promise.all([
            db.collection('users').doc(user.uid).update({
                coins: firebase.firestore.FieldValue.increment(earned)
            }),
            db.collection('deposits').doc(depId).update({
                lastCollected: new Date(),
                totalEarned:   firebase.firestore.FieldValue.increment(earned)
            })
        ]);

        if (msgEl) { msgEl.style.color = '#27ae60'; msgEl.textContent = `✅ +${earned} монет собрано!`; }
        setTimeout(() => renderDepositTab(), 1000);
    } catch(e) {
        if (msgEl) { msgEl.style.color = '#e53935'; msgEl.textContent = '❌ Ошибка: ' + e.message; }
        if (btn) { btn.disabled = false; }
    }
}

// ─── Закрыть депозит ──────────────────────────────────────────────────────────

async function closeDeposit(depId, principal, accrued) {
    const earned = Math.floor(accrued);
    const total  = principal + earned;
    if (!confirm(`Закрыть депозит?\n\nВернётся ${principal.toLocaleString('ru-RU')} монет + ${earned} монет процентов = ${total.toLocaleString('ru-RU')} монет`)) return;

    const user = firebase.auth().currentUser;
    if (!user) return;

    try {
        const db = firebase.firestore();
        await Promise.all([
            db.collection('users').doc(user.uid).update({
                coins: firebase.firestore.FieldValue.increment(total)
            }),
            db.collection('deposits').doc(depId).update({
                status:      'closed',
                closedAt:    new Date(),
                totalEarned: firebase.firestore.FieldValue.increment(earned)
            })
        ]);

        const msgEl = document.getElementById('deposit-msg');
        if (msgEl) {
            msgEl.style.color = '#27ae60';
            msgEl.textContent = `✅ Депозит закрыт. Получено ${total.toLocaleString('ru-RU')} монет`;
        }
        setTimeout(() => renderDepositTab(), 1200);
    } catch(e) {
        const msgEl = document.getElementById('deposit-msg');
        if (msgEl) { msgEl.style.color = '#e53935'; msgEl.textContent = '❌ Ошибка: ' + e.message; }
    }
}
