// ─── Инвестиции: Депозит ──────────────────────────────────────────────────────

// Ставки по уровням (% в месяц)
const DEPOSIT_RATES = [
    { minLevel: 25, rate: 30 },
    { minLevel: 20, rate: 25 },
    { minLevel: 15, rate: 20 },
    { minLevel: 10, rate: 15 },
    { minLevel: 5,  rate: 10 },
    { minLevel: 1,  rate: 5  },
];

function getDepositRate(level) {
    for (const r of DEPOSIT_RATES) {
        if (level >= r.minLevel) return r.rate;
    }
    return 5;
}

function getNextDepositRate(level) {
    for (let i = DEPOSIT_RATES.length - 1; i >= 0; i--) {
        if (DEPOSIT_RATES[i].minLevel > level) return DEPOSIT_RATES[i];
    }
    return null;
}

// Получить текущую ставку игрока из Firestore (для action-функций)
async function fetchUserDepositRate(uid) {
    const snap  = await firebase.firestore().collection('users').doc(uid).get();
    const data  = snap.data();
    const level = typeof getLevelByPoints === 'function'
        ? Math.max(1, Math.min(getLevelByPoints(data.points || 0), 25))
        : (currentUserLevel || 1);
    return { level, rate: getDepositRate(level) };
}

// Текущий баланс с учётом сложного процента по ТЕКУЩЕЙ ставке игрока
// amount * (1 + dailyRate)^дней — капитализация
function calcCompoundedAmount(dep, monthlyRate) {
    const now  = Date.now();
    const last = dep.lastCompounded?.toMillis
        ? dep.lastCompounded.toMillis()
        : dep.createdAt?.toMillis
            ? dep.createdAt.toMillis()
            : now;
    const diffDays  = (now - last) / (1000 * 60 * 60 * 24);
    const dailyRate = monthlyRate / 100 / 30;
    return dep.amount * Math.pow(1 + dailyRate, diffDays);
}

// Зафиксировать накопленный процент в Firestore перед любым действием
async function applyCompound(db, depRef, dep, monthlyRate) {
    const current = calcCompoundedAmount(dep, monthlyRate);
    const earned  = current - dep.amount;
    await depRef.update({
        amount:         current,
        lastCompounded: new Date(),
        totalEarned:    firebase.firestore.FieldValue.increment(earned),
    });
    return current;
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
    const level    = typeof getLevelByPoints === 'function'
        ? Math.max(1, Math.min(getLevelByPoints(userData.points || 0), 25))
        : (currentUserLevel || 1);
    const rate     = getDepositRate(level);
    const nextRate = getNextDepositRate(level);

    let depositBadge = '';
    if (!depSnap.empty) {
        const dep     = depSnap.docs[0].data();
        const current = calcCompoundedAmount(dep, rate); // текущая ставка игрока
        depositBadge  = `<div class="invest-hub-badge">✅ Активен · ${current.toFixed(2)} монет</div>`;
    } else {
        depositBadge = `<div class="invest-hub-badge inactive">Нет активного депозита</div>`;
    }

    content.innerHTML = `
        <div style="display:flex;flex-direction:column;gap:14px;padding:4px 0 8px;">

            <div class="invest-hub-card" onclick="openDepositModal()" style="border-color:#27ae60;">
                <div class="invest-hub-icon" style="background:linear-gradient(135deg,#27ae60,#2ecc71);">🏦</div>
                <div class="invest-hub-body">
                    <div class="invest-hub-title">Депозит</div>
                    <div class="invest-hub-desc">Пассивный доход под процент</div>
                    <div style="font-size:0.85em;color:#27ae60;font-weight:700;margin-top:5px;">Ставка растёт с уровнем · до 30% / мес</div>
                    ${depositBadge}
                </div>
                <div class="invest-hub-arrow">›</div>
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

// ─── Таблица ставок ───────────────────────────────────────────────────────────

function buildRateTableRows(currentRate) {
    return DEPOSIT_RATES.slice().reverse().map(r => {
        const isCurrent = currentRate === r.rate;
        const idx       = DEPOSIT_RATES.findIndex(x => x.rate === r.rate);
        const maxLvl    = idx > 0 ? DEPOSIT_RATES[idx - 1].minLevel - 1 : null;
        const lvlLabel  = maxLvl ? `${r.minLevel}–${maxLvl}` : `${r.minLevel}+`;
        return `<tr style="${isCurrent ? 'background:#e8f5e9;' : ''}">
            <td style="padding:7px 12px;color:#666;">Ур. ${lvlLabel}</td>
            <td style="padding:7px 12px;font-weight:${isCurrent ? '700' : '400'};color:${isCurrent ? '#27ae60' : '#333'};">
                ${r.rate}% / мес
                <span style="color:#aaa;font-size:0.82em;">(${(r.rate / 30).toFixed(2)}% / день)</span>
                ${isCurrent ? '<span style="font-size:0.8em;color:#27ae60;"> ← вы здесь</span>' : ''}
            </td>
        </tr>`;
    }).join('');
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

    const userData  = userSnap.data();
    const isAdmin   = userData.isAdmin === true;
    const coins     = userData.coins || 0;
    const level     = typeof getLevelByPoints === 'function'
        ? Math.max(1, Math.min(getLevelByPoints(userData.points || 0), 25))
        : (currentUserLevel || 1);
    const rate      = getDepositRate(level);   // ← всегда актуальная ставка
    const nextRate  = getNextDepositRate(level);
    const rateRows  = buildRateTableRows(rate);

    if (!depSnap.empty) {
        // ── Активный депозит ──
        const dep         = { id: depSnap.docs[0].id, ...depSnap.docs[0].data() };
        const current     = calcCompoundedAmount(dep, rate); // текущая ставка игрока
        const earned      = current - dep.amount;
        const totalEarned = (dep.totalEarned || 0) + earned;
        const createdAt   = dep.createdAt?.toDate ? dep.createdAt.toDate() : new Date();

        content.innerHTML = `
            <div class="deposit-active-card">
                <div style="text-align:center;margin-bottom:14px;">
                    <div style="font-size:2em;">🏦</div>
                    <div style="font-weight:700;color:#2e7d32;font-size:1.05em;">Активный депозит</div>
                </div>

                <div class="deposit-rows">
                    <div class="deposit-row">
                        <span>💰 Баланс депозита</span>
                        <b style="color:#2e7d32;font-size:1.05em;">${current.toFixed(2)} монет</b>
                    </div>
                    <div class="deposit-row">
                        <span>📈 Ваша ставка сейчас</span>
                        <b style="color:#27ae60;">${rate}% / мес (уровень ${level})</b>
                    </div>
                    <div class="deposit-row">
                        <span>📅 Открыт</span>
                        <b>${createdAt.toLocaleDateString('ru-RU')}</b>
                    </div>
                    <div class="deposit-row" style="border-top:1px dashed #c8e6c9;padding-top:10px;margin-top:4px;">
                        <span>📅 Начисляется в день</span>
                        <b style="color:#27ae60;">+${(current * rate / 100 / 30).toFixed(2)} монет</b>
                    </div>
                    <div class="deposit-row">
                        <span>📊 Заработано всего</span>
                        <b style="color:#27ae60;">+${totalEarned.toFixed(2)} монет</b>
                    </div>
                </div>

                ${nextRate ? `
                <div class="deposit-hint">
                    ⬆️ Подними уровень до ${nextRate.minLevel} — ставка вырастет до <b>${nextRate.rate}% в месяц</b> автоматически
                </div>` : `
                <div class="deposit-hint" style="color:#f7931a;">
                    🏆 У тебя максимальная ставка ${rate}% в месяц!
                </div>`}

                <div class="deposit-hint" style="margin-top:6px;">
                    ♻️ Проценты капают в тело депозита — следующее начисление считается на увеличенную сумму
                </div>
            </div>

            <!-- Пополнение -->
            <div class="deposit-action-card">
                <div class="deposit-action-title">➕ Пополнить депозит</div>
                <div style="font-size:0.82em;color:#27ae60;margin-bottom:6px;">
                    Основной счёт: <b>${coins.toLocaleString('ru-RU')} монет</b>
                </div>
                <div style="display:flex;gap:8px;align-items:center;">
                    <input type="number" id="dep-topup-input" min="1" max="${coins}"
                        placeholder="Сумма пополнения"
                        style="flex:1;width:0;min-width:0;padding:11px 12px;border:1.5px solid #a5d6a7;border-radius:10px;font-size:0.95em;box-sizing:border-box;margin-top:0;">
                    <button onclick="document.getElementById('dep-topup-input').value=${coins};"
                        style="width:auto !important;flex-shrink:0;padding:11px 14px;margin-top:0;background:rgba(39,174,96,0.12);border:1.5px solid #27ae60;color:#27ae60;border-radius:10px;cursor:pointer;font-weight:600;">
                        Макс
                    </button>
                </div>
                <button onclick="topUpDeposit('${dep.id}')" class="deposit-collect-btn" style="margin-top:10px;">
                    ➕ Пополнить
                </button>
            </div>

            <!-- Вывод -->
            <div class="deposit-action-card">
                <div class="deposit-action-title">💸 Вывести на основной счёт</div>
                <div style="font-size:0.82em;color:#27ae60;margin-bottom:6px;">
                    Доступно: <b>${current.toFixed(2)} монет</b> · Налог: <b>0%</b>
                </div>
                <div style="display:flex;gap:8px;align-items:center;">
                    <input type="number" id="dep-withdraw-input" min="1"
                        placeholder="Сумма вывода"
                        style="flex:1;width:0;min-width:0;padding:11px 12px;border:1.5px solid #ffe0b2;border-radius:10px;font-size:0.95em;box-sizing:border-box;margin-top:0;">
                    <button onclick="document.getElementById('dep-withdraw-input').value=Math.floor(${current});"
                        style="width:auto !important;flex-shrink:0;padding:11px 14px;margin-top:0;background:rgba(247,147,26,0.1);border:1.5px solid #f7931a;color:#f7931a;border-radius:10px;cursor:pointer;font-weight:600;">
                        Всё
                    </button>
                </div>
                <button onclick="withdrawFromDeposit('${dep.id}')" class="deposit-withdraw-btn" style="margin-top:10px;">
                    💸 Вывести
                </button>
            </div>

            <!-- Закрыть -->
            <button onclick="closeDeposit('${dep.id}')" class="deposit-close-btn">
                🔓 Закрыть депозит и вывести всё (${current.toFixed(2)} монет)
            </button>

            <div class="deposit-rate-table" style="margin-top:14px;">
                <div style="font-size:0.88em;color:#888;margin-bottom:8px;font-weight:600;">📊 Таблица ставок</div>
                <table style="width:100%;border-collapse:collapse;font-size:0.9em;">${rateRows}</table>
            </div>

            ${isAdmin ? `<button onclick="renderAdminDepositStats()" class="deposit-admin-btn">📊 Депозиты всех игроков</button>` : ''}
            <div id="admin-deposit-stats"></div>
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
                        Ваша ставка: <b style="color:#27ae60;">${rate}% в месяц</b> (уровень ${level})
                    </div>
                    ${nextRate
                        ? `<div style="font-size:0.8em;color:#aaa;margin-top:2px;">С уровня ${nextRate.minLevel} будет ${nextRate.rate}% в месяц</div>`
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
                    <div class="deposit-preview-row" style="margin-top:4px;font-size:0.9em;color:#888;">
                        ♻️ Сложный процент — ставка обновляется вместе с вашим уровнем
                    </div>
                </div>

                <button onclick="createDeposit()" class="deposit-collect-btn" style="margin-top:4px;">
                    🏦 Открыть депозит
                </button>
            </div>

            <div class="deposit-rate-table">
                <div style="font-size:0.88em;color:#888;margin-bottom:8px;font-weight:600;">📊 Ставки по уровням</div>
                <table style="width:100%;border-collapse:collapse;font-size:0.9em;">${rateRows}</table>
                <div style="font-size:0.78em;color:#aaa;margin-top:8px;text-align:center;">Повышай уровень — ставка вырастет автоматически!</div>
            </div>

            ${isAdmin ? `<button onclick="renderAdminDepositStats()" class="deposit-admin-btn">📊 Депозиты всех игроков</button>` : ''}
            <div id="admin-deposit-stats"></div>
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
    const daily = amount * rate / 100 / 30;
    document.getElementById('dep-daily').textContent = daily.toFixed(2);
    document.getElementById('dep-7d').textContent    = (amount * Math.pow(1 + rate/100/30, 7)  - amount).toFixed(2);
    document.getElementById('dep-30d').textContent   = (amount * Math.pow(1 + rate/100/30, 30) - amount).toFixed(2);
    preview.style.display = '';
}

// ─── Создать депозит ──────────────────────────────────────────────────────────

async function createDeposit() {
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
            const snap = await tx.get(userRef);
            if ((snap.data().coins || 0) < amount)
                throw new Error(`Недостаточно монет. У вас: ${snap.data().coins || 0}`);
            tx.update(userRef, { coins: firebase.firestore.FieldValue.increment(-amount) });
        });

        const userName = (await userRef.get()).data().name || '';
        await db.collection('deposits').add({
            userId:         user.uid,
            userName,
            amount,
            // ratePercent не храним — ставка всегда берётся из текущего уровня игрока
            createdAt:      new Date(),
            lastCompounded: new Date(),
            totalEarned:    0,
            status:         'active',
        });

        if (msgEl) { msgEl.style.color = '#27ae60'; msgEl.textContent = `✅ Депозит на ${amount} монет открыт!`; }
        setTimeout(() => renderDepositTab(), 1000);
    } catch(e) {
        if (msgEl) { msgEl.style.color = '#e53935'; msgEl.textContent = '❌ Ошибка: ' + e.message; }
        if (btn) { btn.disabled = false; btn.textContent = '🏦 Открыть депозит'; }
    }
}

// ─── Пополнить депозит ────────────────────────────────────────────────────────

async function topUpDeposit(depId) {
    const topup = parseInt(document.getElementById('dep-topup-input')?.value) || 0;
    const msgEl = document.getElementById('deposit-msg');
    if (topup < 1) {
        if (msgEl) { msgEl.style.color = '#e53935'; msgEl.textContent = '❌ Введите сумму пополнения'; }
        return;
    }

    const user = firebase.auth().currentUser;
    if (!user) return;

    const btn = document.querySelector('.deposit-collect-btn');
    if (btn) { btn.disabled = true; btn.textContent = '⏳...'; }

    try {
        const db      = firebase.firestore();
        const userRef = db.collection('users').doc(user.uid);
        const depRef  = db.collection('deposits').doc(depId);

        // Берём актуальную ставку игрока
        const { rate } = await fetchUserDepositRate(user.uid);
        const depSnap  = await depRef.get();
        const current  = calcCompoundedAmount(depSnap.data(), rate);
        const earned   = current - depSnap.data().amount;

        await db.runTransaction(async (tx) => {
            const uSnap = await tx.get(userRef);
            if ((uSnap.data().coins || 0) < topup)
                throw new Error(`Недостаточно монет. У вас: ${uSnap.data().coins || 0}`);
            tx.update(userRef, { coins: firebase.firestore.FieldValue.increment(-topup) });
            tx.update(depRef, {
                amount:         current + topup,
                lastCompounded: new Date(),
                totalEarned:    firebase.firestore.FieldValue.increment(earned),
            });
        });

        if (msgEl) { msgEl.style.color = '#27ae60'; msgEl.textContent = `✅ Депозит пополнен на ${topup} монет`; }
        setTimeout(() => renderDepositTab(), 1000);
    } catch(e) {
        if (msgEl) { msgEl.style.color = '#e53935'; msgEl.textContent = '❌ Ошибка: ' + e.message; }
        if (btn) { btn.disabled = false; btn.textContent = '➕ Пополнить'; }
    }
}

// ─── Вывести часть депозита ───────────────────────────────────────────────────

async function withdrawFromDeposit(depId) {
    const withdraw = parseFloat(document.getElementById('dep-withdraw-input')?.value) || 0;
    const msgEl    = document.getElementById('deposit-msg');
    if (withdraw < 1) {
        if (msgEl) { msgEl.style.color = '#e53935'; msgEl.textContent = '❌ Введите сумму вывода'; }
        return;
    }

    const user = firebase.auth().currentUser;
    if (!user) return;

    const btn = document.querySelector('.deposit-withdraw-btn');
    if (btn) { btn.disabled = true; btn.textContent = '⏳...'; }

    try {
        const db      = firebase.firestore();
        const userRef = db.collection('users').doc(user.uid);
        const depRef  = db.collection('deposits').doc(depId);

        const { rate } = await fetchUserDepositRate(user.uid);
        const depSnap  = await depRef.get();
        const current  = calcCompoundedAmount(depSnap.data(), rate);
        const earned   = current - depSnap.data().amount;

        if (withdraw > current)
            throw new Error(`Нельзя вывести больше чем есть (${current.toFixed(2)} монет)`);

        const remaining = current - withdraw;

        await db.runTransaction(async (tx) => {
            tx.update(userRef, { coins: firebase.firestore.FieldValue.increment(Math.floor(withdraw)) });
            if (remaining < 1) {
                tx.update(depRef, {
                    amount: 0, lastCompounded: new Date(),
                    totalEarned: firebase.firestore.FieldValue.increment(earned),
                    status: 'closed', closedAt: new Date(),
                });
            } else {
                tx.update(depRef, {
                    amount: remaining, lastCompounded: new Date(),
                    totalEarned: firebase.firestore.FieldValue.increment(earned),
                });
            }
        });

        const closed = remaining < 1;
        if (msgEl) {
            msgEl.style.color = '#27ae60';
            msgEl.textContent = closed
                ? `✅ Выведено ${Math.floor(withdraw)} монет. Депозит закрыт.`
                : `✅ Выведено ${Math.floor(withdraw)} монет. В депозите: ${remaining.toFixed(2)} монет`;
        }
        setTimeout(() => renderDepositTab(), 1000);
    } catch(e) {
        if (msgEl) { msgEl.style.color = '#e53935'; msgEl.textContent = '❌ ' + e.message; }
        if (btn) { btn.disabled = false; btn.textContent = '💸 Вывести'; }
    }
}

// ─── Закрыть депозит (вывести всё) ───────────────────────────────────────────

async function closeDeposit(depId) {
    const user = firebase.auth().currentUser;
    if (!user) return;

    try {
        const db      = firebase.firestore();
        const depRef  = db.collection('deposits').doc(depId);

        const { rate } = await fetchUserDepositRate(user.uid);
        const depSnap  = await depRef.get();
        const current  = calcCompoundedAmount(depSnap.data(), rate);
        const earned   = current - depSnap.data().amount;
        const total    = Math.floor(current);

        if (!confirm(`Закрыть депозит и вывести ${total.toLocaleString('ru-RU')} монет на основной счёт?`)) return;

        await Promise.all([
            db.collection('users').doc(user.uid).update({
                coins: firebase.firestore.FieldValue.increment(total)
            }),
            depRef.update({
                amount: 0, lastCompounded: new Date(),
                totalEarned: firebase.firestore.FieldValue.increment(earned),
                status: 'closed', closedAt: new Date(),
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

// ─── Админ: статистика депозитов всех игроков ─────────────────────────────────

async function renderAdminDepositStats() {
    const container = document.getElementById('admin-deposit-stats');
    if (!container) return;
    container.innerHTML = '<div class="crypto-loading" style="margin-top:12px;">Загружаем депозиты... 🏦</div>';

    try {
        const db = firebase.firestore();

        // Все активные депозиты
        const [depsSnap, usersSnap] = await Promise.all([
            db.collection('deposits').where('status', '==', 'active').get(),
            db.collection('users').get()
        ]);

        // Карта userId → уровень
        const userLevelMap = {};
        usersSnap.docs.forEach(doc => {
            const d = doc.data();
            if (d.isAdmin) return;
            const level = typeof getLevelByPoints === 'function'
                ? Math.max(1, Math.min(getLevelByPoints(d.points || 0), 25))
                : 1;
            userLevelMap[doc.id] = level;
        });

        if (depsSnap.empty) {
            container.innerHTML = '<div style="text-align:center;color:#aaa;padding:16px;font-size:0.9em;">Нет активных депозитов</div>';
            return;
        }

        // Считаем текущий баланс каждого депозита
        const rows = depsSnap.docs.map(doc => {
            const dep    = doc.data();
            const level  = userLevelMap[dep.userId] || 1;
            const rate   = getDepositRate(level);
            const current = calcCompoundedAmount(dep, rate);
            return { name: dep.userName || '—', level, rate, current };
        });

        // Сортируем по убыванию суммы
        rows.sort((a, b) => b.current - a.current);

        const medals = ['🥇', '🥈', '🥉'];
        const totalSum = rows.reduce((s, r) => s + r.current, 0);

        const rowsHtml = rows.map((r, i) => {
            const place = i < 3 ? medals[i] : `<span style="color:#999;font-size:0.85em;">${i + 1}</span>`;
            return `<tr style="${i % 2 === 0 ? 'background:#fff;' : 'background:#fafafa;'}">
                <td style="padding:8px 10px;text-align:center;width:32px;">${place}</td>
                <td style="padding:8px 8px;font-weight:600;color:#222;">${r.name}</td>
                <td style="padding:8px 8px;text-align:center;color:#7c3aed;font-size:0.88em;">Ур. ${r.level}</td>
                <td style="padding:8px 8px;text-align:center;color:#27ae60;font-size:0.88em;">${r.rate}% / мес</td>
                <td style="padding:8px 10px;text-align:right;font-weight:700;color:#2e7d32;white-space:nowrap;">${r.current.toFixed(2)}</td>
            </tr>`;
        }).join('');

        container.innerHTML = `
            <div style="background:#fff;border:1.5px solid #a5d6a7;border-radius:16px;overflow:hidden;margin-top:12px;">
                <div style="background:linear-gradient(135deg,#27ae60,#2ecc71);padding:12px 16px;display:flex;justify-content:space-between;align-items:center;">
                    <div style="font-weight:700;color:#fff;font-size:1em;">📊 Депозиты игроков</div>
                    <div style="font-size:0.85em;color:rgba(255,255,255,0.9);">Всего: <b>${totalSum.toFixed(2)} монет</b></div>
                </div>
                <div style="overflow-x:auto;">
                    <table style="width:100%;border-collapse:collapse;font-size:0.9em;">
                        <thead>
                            <tr style="background:#f1f8e9;color:#555;font-size:0.8em;font-weight:600;">
                                <th style="padding:7px 10px;">#</th>
                                <th style="padding:7px 8px;text-align:left;">Игрок</th>
                                <th style="padding:7px 8px;">Уровень</th>
                                <th style="padding:7px 8px;">Ставка</th>
                                <th style="padding:7px 10px;text-align:right;">Сумма</th>
                            </tr>
                        </thead>
                        <tbody>${rowsHtml}</tbody>
                    </table>
                </div>
                <div style="padding:8px 14px;text-align:right;font-size:0.78em;color:#aaa;">
                    ${rows.length} активных депозита
                </div>
            </div>
        `;
    } catch(e) {
        container.innerHTML = `<div style="color:#e53935;padding:12px;font-size:0.9em;">❌ Ошибка: ${e.message}</div>`;
    }
}
