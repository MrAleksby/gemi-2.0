// ─── Бизнес (Квадрант Б — Кийосаки) ─────────────────────────────────────────

const ENERGY_MAX = 8;

const BUSINESS_STAGES = [
    {
        id: 'cart',
        name: 'Тележка мороженного',
        icon: '🛒',
        minLevel: 5,
        buyCost: 300,
        upgradeCost: 1000,
        incomePerEnergy: 5,
        maxWorkers: 1,
        dailyCapacity: 10,
        nextStage: 'kiosk',
        expField: 'bizExpCart',
        workerRequiredExp: null,
        workerRequiredField: null,
        workerRequiredLabel: null,
        desc: 'Маленькая тележка на колёсах. 1 рабочее место, 10 энергий в день.'
    },
    {
        id: 'kiosk',
        name: 'Киоск мороженого',
        icon: '🏪',
        minLevel: 9,
        buyCost: null,
        upgradeCost: 1500,
        incomePerEnergy: 15,
        maxWorkers: 2,
        dailyCapacity: 24,
        nextStage: 'cafe',
        expField: 'bizExpKiosk',
        workerRequiredExp: 50,
        workerRequiredField: 'bizExpCart',
        workerRequiredLabel: 'Тележка мороженного',
        desc: 'Киоск с витриной. 2 рабочих места, 24 энергии в день.'
    },
    {
        id: 'cafe',
        name: 'Кафе-мороженое',
        icon: '🏬',
        minLevel: 13,
        buyCost: null,
        upgradeCost: 8000,
        incomePerEnergy: 25,
        maxWorkers: 5,
        dailyCapacity: 60,
        nextStage: 'factory',
        expField: 'bizExpCafe',
        workerRequiredExp: 50,
        workerRequiredField: 'bizExpKiosk',
        workerRequiredLabel: 'Киоск мороженого',
        desc: 'Уютное кафе. 5 рабочих мест, 60 энергий в день.'
    },
    {
        id: 'factory',
        name: 'Фабрика мороженого',
        icon: '🏭',
        minLevel: 17,
        buyCost: null,
        upgradeCost: null,
        incomePerEnergy: 40,
        maxWorkers: 10,
        dailyCapacity: 120,
        nextStage: null,
        expField: 'bizExpFactory',
        workerRequiredExp: 50,
        workerRequiredField: 'bizExpCafe',
        workerRequiredLabel: 'Кафе-мороженое',
        desc: 'Максимальный уровень. 10 рабочих мест, 120 энергий в день!'
    }
];

function getStage(stageId) {
    return BUSINESS_STAGES.find(s => s.id === stageId) || BUSINESS_STAGES[0];
}

// Получить сегодняшнюю дату как строку YYYY-MM-DD
function todayStr() {
    return new Date().toISOString().slice(0, 10);
}

// Ключ дня — сбрасывается в 6:00 утра
function bizDayKey() {
    const now = new Date();
    // если время меньше 6:00 — считаем что это ещё «вчерашний» день
    if (now.getHours() < 6) {
        const yesterday = new Date(now);
        yesterday.setDate(yesterday.getDate() - 1);
        return yesterday.toISOString().slice(0, 10);
    }
    return now.toISOString().slice(0, 10);
}

// Получить текущую загрузку бизнеса, сбросить если новый день (в 6:00)
async function getOrResetBizCapacity(bizRef) {
    const snap = await bizRef.get();
    const data = snap.data();
    const key = bizDayKey();
    if ((data.bizEnergyDate || '') !== key) {
        await bizRef.update({ energyUsedToday: 0, bizEnergyDate: key });
        return 0;
    }
    return data.energyUsedToday || 0;
}

// Проверить/сбросить энергию игрока (сброс в 6:00 утра)
async function getOrResetEnergy(uid) {
    const ref = firebase.firestore().collection('users').doc(uid);
    const snap = await ref.get();
    const data = snap.data();
    const key = bizDayKey();
    if ((data.energyDate || '') !== key) {
        await ref.update({ energy: ENERGY_MAX, energyDate: key });
        return ENERGY_MAX;
    }
    return (data.energy !== undefined ? data.energy : ENERGY_MAX);
}

// ─── Главный рендер вкладки Бизнес ───────────────────────────────────────────

async function renderBusinessTab() {
    const content = document.getElementById('business-content');
    if (!content) return;
    content.innerHTML = '<div class="crypto-loading">Загружаем бизнес... 🏪</div>';

    const user = firebase.auth().currentUser;
    if (!user) return;

    const [energy, userSnap, bizSnap] = await Promise.all([
        getOrResetEnergy(user.uid),
        firebase.firestore().collection('users').doc(user.uid).get(),
        firebase.firestore().collection('businesses').where('ownerId', '==', user.uid).limit(1).get()
    ]);

    const userData = userSnap.data();
    const isAdmin = userData.isAdmin === true;
    const coins = userData.coins || 0;
    const businessCoins = userData.businessCoins || 0;
    const exchangeCoins = userData.exchangeCoins || 0;
    const hasBusiness = !bizSnap.empty;

    // Для админа — все налоги всех игроков; для обычного — только свои
    const taxQuery = isAdmin
        ? firebase.firestore().collection('tax_log').limit(50).get().catch(() => ({ docs: [] }))
        : firebase.firestore().collection('tax_log').where('userId', '==', user.uid).limit(20).get().catch(() => ({ docs: [] }));
    const taxSnap = await taxQuery;
    const taxLogs = taxSnap.docs
        .map(d => d.data())
        .sort((a, b) => (b.timestamp?.toMillis?.() || 0) - (a.timestamp?.toMillis?.() || 0))
        .slice(0, isAdmin ? 50 : 10);

    if (!hasBusiness) {
        renderNoBusiness(content, coins, businessCoins, exchangeCoins, energy, taxLogs, isAdmin);
    } else {
        const biz = { id: bizSnap.docs[0].id, ...bizSnap.docs[0].data() };
        // Загружаем дневную загрузку и историю работы
        const bizRef = firebase.firestore().collection('businesses').doc(biz.id);
        const energyUsedToday = await getOrResetBizCapacity(bizRef);
        let workLogs = [];
        try {
            const logsSnap = await firebase.firestore()
                .collection('businesses').doc(biz.id)
                .collection('work_logs')
                .orderBy('timestamp', 'desc').limit(15).get();
            workLogs = logsSnap.docs.map(d => d.data());
        } catch(e) { workLogs = []; }
        renderMyBusiness(content, biz, coins, businessCoins, exchangeCoins, energy, energyUsedToday, user.uid, userData.name || '', workLogs, taxLogs, isAdmin);
    }
}

// ─── Экран «нет бизнеса» ─────────────────────────────────────────────────────

function bizWalletSection(coins, businessCoins, exchangeCoins = 0, taxLogs = [], isAdmin = false) {
    const totalTax = taxLogs.reduce((s, t) => s + (t.amount || 0), 0);
    const taxHtml = taxLogs.length === 0 ? '' : `
        <div style="margin-top:10px;border-top:1px solid #eee;padding-top:8px;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
                <div style="font-size:0.82em;color:#888;">🏛 ${isAdmin ? 'Все налоги игроков' : 'История налогов'}:</div>
                ${isAdmin ? `<div style="font-size:0.82em;font-weight:700;color:#e8956d;">Итого: +${totalTax} монет</div>` : ''}
            </div>
            ${taxLogs.map(t => {
                const date = t.timestamp ? t.timestamp.toDate().toLocaleString('ru-RU') : '—';
                const src = t.source === 'exchange' ? '📈 Биржа' : '🏪 Бизнес';
                return `<div style="display:flex;justify-content:space-between;font-size:0.8em;padding:4px 0;border-bottom:1px solid #f5f5f5;">
                    <span style="color:#888;">${isAdmin ? `<b>${t.userName || '—'}</b> · ` : ''}${src} · ${date}</span>
                    <span style="color:#e8956d;font-weight:600;">+${t.amount} монет</span>
                </div>`;
            }).join('')}
        </div>`;
    return `
        <div class="biz-wallet-section">
            <button class="crypto-wallet-toggle" onclick="toggleBizWallet()">💼 Бизнес-кошелёк ▼</button>
            <div id="biz-wallet-forms" style="display:none;">
                <div class="biz-wallet-balance">
                    <div>💼 Бизнес-кошелёк: <b>${businessCoins.toLocaleString('ru-RU')} монет</b></div>
                    <div>📈 Биржевой кошелёк: <b>${exchangeCoins.toLocaleString('ru-RU')} монет</b></div>
                    <div>💰 Основной счёт: <b>${coins.toLocaleString('ru-RU')} монет</b></div>
                </div>

                <div style="font-size:0.85em;color:#888;margin-bottom:4px;">Пополнить (из основного):</div>
                <div style="display:flex;gap:6px;align-items:center;margin-bottom:8px;">
                    <input type="number" id="biz-deposit-amount" min="1" placeholder="Сумма монет"
                        style="flex:1;width:0;min-width:0;padding:10px;border:1.5px solid #ddd;border-radius:10px;font-size:0.95em;box-sizing:border-box;margin-top:0;">
                    <button onclick="document.getElementById('biz-deposit-amount').value=${coins}"
                        style="width:auto !important;flex-shrink:0;padding:10px 14px;margin-top:0;background:rgba(247,147,26,0.15);border:1px solid #f7931a;color:#f7931a;border-radius:8px;cursor:pointer;">Макс</button>
                    <button class="biz-deposit-btn" onclick="bizDeposit()"
                        style="width:auto !important;flex-shrink:0;padding:10px 14px;margin-top:0;background:#27ae60;color:#fff;border:none;border-radius:8px;cursor:pointer;font-weight:600;">Пополнить</button>
                </div>

                <div style="font-size:0.85em;color:#888;margin-bottom:4px;">Вывести (на основной) <span style="color:#e8956d;">−1% налог</span>:</div>
                <div style="display:flex;gap:6px;align-items:center;margin-bottom:8px;">
                    <input type="number" id="biz-withdraw-amount" min="1" placeholder="Сумма монет"
                        style="flex:1;width:0;min-width:0;padding:10px;border:1.5px solid #ddd;border-radius:10px;font-size:0.95em;box-sizing:border-box;margin-top:0;">
                    <button onclick="document.getElementById('biz-withdraw-amount').value=${businessCoins}"
                        style="width:auto !important;flex-shrink:0;padding:10px 14px;margin-top:0;background:rgba(247,147,26,0.15);border:1px solid #f7931a;color:#f7931a;border-radius:8px;cursor:pointer;">Макс</button>
                    <button class="biz-withdraw-btn" onclick="bizWithdraw()"
                        style="width:auto !important;flex-shrink:0;padding:10px 14px;margin-top:0;background:#e53935;color:#fff;border:none;border-radius:8px;cursor:pointer;font-weight:600;">Вывести</button>
                </div>

                <div style="border-top:1px dashed #e0e0e0;margin:8px 0 10px;"></div>
                <div style="font-size:0.85em;color:#888;margin-bottom:4px;">📈 Перевести на биржевой кошелёк <span style="color:#27ae60;font-size:0.88em;">без налога</span>:</div>
                <div style="display:flex;gap:6px;align-items:center;margin-bottom:8px;">
                    <input type="number" id="biz-to-exchange-amount" min="1" placeholder="Сумма монет"
                        style="flex:1;width:0;min-width:0;padding:10px;border:1.5px solid #ddd;border-radius:10px;font-size:0.95em;box-sizing:border-box;margin-top:0;">
                    <button onclick="document.getElementById('biz-to-exchange-amount').value=${businessCoins}"
                        style="width:auto !important;flex-shrink:0;padding:10px 14px;margin-top:0;background:rgba(247,147,26,0.15);border:1px solid #f7931a;color:#f7931a;border-radius:8px;cursor:pointer;">Макс</button>
                    <button class="biz-to-exchange-btn" onclick="transferBizToExchange()"
                        style="width:auto !important;flex-shrink:0;padding:10px 14px;margin-top:0;background:#3b82f6;color:#fff;border:none;border-radius:8px;cursor:pointer;font-weight:600;">→ Биржа</button>
                </div>
                <div style="font-size:0.85em;color:#888;margin-bottom:4px;">💼 Перевести с биржевого кошелька <span style="color:#27ae60;font-size:0.88em;">без налога</span>:</div>
                <div style="display:flex;gap:6px;align-items:center;margin-bottom:4px;">
                    <input type="number" id="exchange-to-biz-amount" min="1" placeholder="Сумма монет"
                        style="flex:1;width:0;min-width:0;padding:10px;border:1.5px solid #ddd;border-radius:10px;font-size:0.95em;box-sizing:border-box;margin-top:0;">
                    <button onclick="document.getElementById('exchange-to-biz-amount').value=${exchangeCoins}"
                        style="width:auto !important;flex-shrink:0;padding:10px 14px;margin-top:0;background:rgba(247,147,26,0.15);border:1px solid #f7931a;color:#f7931a;border-radius:8px;cursor:pointer;">Макс</button>
                    <button class="exchange-to-biz-btn" onclick="transferExchangeToBiz()"
                        style="width:auto !important;flex-shrink:0;padding:10px 14px;margin-top:0;background:#8b5cf6;color:#fff;border:none;border-radius:8px;cursor:pointer;font-weight:600;">→ Бизнес</button>
                </div>

                <div id="biz-wallet-msg" style="font-size:0.85em;margin-top:6px;"></div>
                ${taxHtml}
            </div>
        </div>
    `;
}

function renderNoBusiness(content, coins, businessCoins, exchangeCoins = 0, energy, taxLogs = [], isAdmin = false) {
    if (isAdmin) {
        content.innerHTML = `
            <div style="text-align:center; padding:16px 0 8px;">
                <div style="font-size:2.5rem;">🏛</div>
                <div style="font-weight:700; color:#5c1f4a; font-size:1.1em; margin-top:4px;">Панель администратора</div>
                <div style="font-size:0.85em; color:#888; margin-top:4px;">Налоги и бизнес-кошелёк</div>
            </div>
            ${bizWalletSection(coins, businessCoins, exchangeCoins, taxLogs, true)}
            <div id="biz-msg" class="biz-msg"></div>
        `;
        return;
    }

    const stage = BUSINESS_STAGES[0];
    const userLvl = typeof currentUserLevel !== 'undefined' ? currentUserLevel : 1;
    const canBuy = businessCoins >= stage.buyCost;

    content.innerHTML = `
        <div class="biz-welcome">
            <div class="biz-welcome-icon">🍦</div>
            <div class="biz-welcome-title">Открой свой бизнес!</div>
            <div class="biz-welcome-desc">Купи тележку мороженого и начни зарабатывать как настоящий предприниматель</div>
        </div>

        <div class="biz-start-card">
            <div class="biz-stage-icon">${stage.icon}</div>
            <div class="biz-stage-name">${stage.name}</div>
            <div class="biz-stage-desc">${stage.desc}</div>
            <div class="biz-stage-stats">
                <div class="biz-stat"><span>💰 Доход</span><b>${stage.incomePerEnergy} монет / работа</b></div>
                <div class="biz-stat"><span>👤 Работники</span><b>до ${stage.maxWorkers}</b></div>
            </div>
            <div class="biz-cost ${canBuy ? '' : 'biz-cost-poor'}">
                Стоимость: <b>${stage.buyCost} монет</b> (из бизнес-кошелька)
                ${businessCoins < stage.buyCost
                    ? `<div style="font-size:0.8em;margin-top:4px;">Нужно ещё ${stage.buyCost - businessCoins} монет в бизнес-кошельке</div>`
                    : ''}
            </div>
            <button class="biz-buy-btn" onclick="buyBusiness()" ${canBuy ? '' : 'disabled'}>
                ${canBuy ? '🚀 Открыть бизнес!' : '🔒 Пополни бизнес-кошелёк'}
            </button>
        </div>

        <div class="biz-path">
            <div style="font-size:0.85em;color:#888;margin-bottom:10px;text-align:center;">Путь развития бизнеса:</div>
            <div class="biz-path-row">
                ${BUSINESS_STAGES.map((s, i) => `
                    <div class="biz-path-step ${i === 0 ? 'current' : ''}">
                        <div class="biz-path-icon">${s.icon}</div>
                        <div class="biz-path-label">${s.name.split(' ')[0]}</div>
                        <div style="font-size:0.72em;color:#e8956d;margin-top:2px;">ур. ${s.minLevel}+</div>
                    </div>
                    ${s.nextStage ? '<div class="biz-path-arrow">→</div>' : ''}
                `).join('')}
            </div>
        </div>

        ${bizWalletSection(coins, businessCoins, exchangeCoins, taxLogs, isAdmin)}
        <div id="biz-msg" class="biz-msg"></div>
    `;
}

// ─── Экран «мой бизнес» ──────────────────────────────────────────────────────

function renderMyBusiness(content, biz, coins, businessCoins, exchangeCoins = 0, energy, energyUsedToday, uid, userName, workLogs = [], taxLogs = [], isAdmin = false) {
    const stage = getStage(biz.stage);
    const nextStage = stage.nextStage ? getStage(stage.nextStage) : null;
    const energyBars = renderEnergyBars(energy);
    const workers = biz.workers || [];
    const capacityFull = energyUsedToday >= stage.dailyCapacity;
    const canWork = energy > 0 && !capacityFull;
    const capacityPct = Math.min(100, Math.round((energyUsedToday / stage.dailyCapacity) * 100));
    const userLvl = typeof currentUserLevel !== 'undefined' ? currentUserLevel : 1;
    const canUpgrade = nextStage && businessCoins >= nextStage.upgradeCost;

    // Доска вакансий — открытые вакансии в этом бизнесе
    const vacancySection = biz.vacancyOpen ? `
        <div class="biz-vacancy-active">
            <div>📢 Вакансия открыта — зарплата <b>${biz.vacancySalary} монет / работа</b></div>
            <button class="biz-close-vacancy-btn" onclick="closeVacancy('${biz.id}')">Закрыть вакансию</button>
        </div>
    ` : workers.length < stage.maxWorkers ? `
        <div class="biz-open-vacancy">
            <div style="font-size:0.9em;color:#666;margin-bottom:8px;">Открой вакансию — наними работника</div>
            <div style="display:flex;gap:8px;align-items:center;">
                <input type="number" id="biz-salary-input" min="1" placeholder="Зарплата монет"
                    style="flex:1;width:0;min-width:0;padding:10px;border:1.5px solid #ddd;border-radius:10px;font-size:0.95em;box-sizing:border-box;margin-top:0;">
                <button class="biz-post-vacancy-btn" onclick="postVacancy('${biz.id}')"
                    style="width:auto !important;flex-shrink:0;padding:10px 14px;margin-top:0;">📢 Открыть</button>
            </div>
        </div>
    ` : '<div class="biz-full">✅ Все рабочие места заняты</div>';

    // Список работников
    const workersHtml = workers.length > 0 ? `
        <div class="biz-workers">
            <div style="font-size:0.85em;color:#888;margin-bottom:6px;">👥 Работники:</div>
            ${workers.map(w => `
                <div class="biz-worker-item">
                    <span>👤 ${w.name}</span>
                    <span>${w.salary} монет / работа</span>
                    <button class="biz-fire-btn" onclick="fireWorker('${biz.id}', '${w.userId}')">Уволить</button>
                </div>
            `).join('')}
        </div>
    ` : '';

    // История работы
    const logsHtml = workLogs.length === 0
        ? '<div style="color:#aaa;font-size:0.85em;text-align:center;padding:10px;">Пока никто не работал</div>'
        : workLogs.map(l => {
            const ts = l.timestamp?.toDate ? l.timestamp.toDate() : new Date(l.timestamp);
            const dateStr = ts.toLocaleString('ru-RU', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' });
            const isOwner = l.isOwner;
            return `<div class="biz-log-item">
                <div class="biz-log-left">
                    <span class="biz-log-who">${isOwner ? '👑' : '👤'} ${l.workerName}</span>
                    <span class="biz-log-date">${dateStr}</span>
                </div>
                <div class="biz-log-right">
                    ${isOwner
                        ? `<span class="biz-log-income">+${l.income} монет</span>`
                        : `<span class="biz-log-income">+${l.ownerProfit} прибыль</span><span class="biz-log-salary">зп: ${l.salary}</span>`
                    }
                </div>
            </div>`;
        }).join('');

    content.innerHTML = `
        <div class="biz-header-card">
            <div class="biz-stage-badge">${stage.icon}</div>
            <div class="biz-header-info">
                <div class="biz-header-name">${stage.name}</div>
                <div class="biz-header-total">Заработано всего: <b>${(biz.totalEarned || 0).toLocaleString('ru-RU')} монет</b></div>
            </div>
        </div>

        <div class="biz-balance-banner">
            <div class="biz-balance-item">
                <span>💼 Бизнес-кошелёк</span>
                <b>${businessCoins.toLocaleString('ru-RU')} монет</b>
            </div>
            <div class="biz-balance-item">
                <span>💰 Основной счёт</span>
                <b>${coins.toLocaleString('ru-RU')} монет</b>
            </div>
        </div>

        ${bizWalletSection(coins, businessCoins, exchangeCoins, taxLogs, isAdmin)}

        <div class="biz-energy-section">
            <div class="biz-energy-label">⚡ Энергия на сегодня</div>
            <div class="biz-energy-bars">${energyBars}</div>
            <div class="biz-energy-count">${energy} / ${ENERGY_MAX}</div>
        </div>

        <div class="biz-capacity-bar-wrap">
            <div class="biz-capacity-label">
                <span>📦 Загрузка на сегодня</span>
                <span><b>${energyUsedToday}/${stage.dailyCapacity}</b> энергий</span>
            </div>
            <div class="biz-capacity-bar-bg">
                <div class="biz-capacity-bar-fill ${capacityFull ? 'full' : ''}" style="width:${capacityPct}%"></div>
            </div>
            <div class="biz-capacity-reset">🕕 Сбрасывается в 6:00 утра</div>
        </div>

        <button class="biz-work-btn ${canWork ? '' : 'disabled'}" onclick="workInBusiness('${biz.id}')" ${canWork ? '' : 'disabled'}>
            ${capacityFull
                ? '🏁 Бизнес заполнен на сегодня'
                : canWork
                    ? `🔨 Работать (+${stage.incomePerEnergy} монет)`
                    : '😴 Твоя энергия закончилась'}
        </button>

        <div class="biz-stats-row">
            <div class="biz-stat-box">
                <div class="biz-stat-icon">💰</div>
                <div class="biz-stat-val">${stage.incomePerEnergy}</div>
                <div class="biz-stat-label">монет / работа</div>
            </div>
            <div class="biz-stat-box">
                <div class="biz-stat-icon">👤</div>
                <div class="biz-stat-val">${workers.length}/${stage.maxWorkers}</div>
                <div class="biz-stat-label">работников</div>
            </div>
            <div class="biz-stat-box">
                <div class="biz-stat-icon">📊</div>
                <div class="biz-stat-val">${biz.totalEarned || 0}</div>
                <div class="biz-stat-label">всего монет</div>
            </div>
        </div>

        ${workersHtml}
        ${vacancySection}

        ${nextStage ? `
        <div class="biz-upgrade-section">
            <div class="biz-upgrade-title">⬆️ Апгрейд до «${nextStage.name}»</div>
            <div class="biz-upgrade-info">
                <span>Доход: <b>${stage.incomePerEnergy} → ${nextStage.incomePerEnergy} монет</b></span>
                <span>Работников: <b>${stage.maxWorkers} → ${nextStage.maxWorkers}</b></span>
            </div>
            <button class="biz-upgrade-btn ${canUpgrade ? '' : 'disabled'}" onclick="upgradeBusiness('${biz.id}')" ${canUpgrade ? '' : 'disabled'}>
                ${canUpgrade
                        ? `🚀 Улучшить за ${nextStage.upgradeCost} монет`
                        : `🔒 Нужно ${nextStage.upgradeCost} монет в бизнес-кошельке`}
            </button>
        </div>
        ` : '<div class="biz-max-level">🏆 Максимальный уровень достигнут!</div>'}

        <div class="biz-work-history">
            <div class="biz-work-history-title">📋 История работы</div>
            ${logsHtml}
        </div>

        <div id="biz-msg" class="biz-msg"></div>
    `;
}

function renderEnergyBars(energy) {
    let html = '';
    for (let i = 0; i < ENERGY_MAX; i++) {
        html += `<div class="biz-energy-bar ${i < energy ? 'filled' : ''}"></div>`;
    }
    return html;
}

// ─── Действия ─────────────────────────────────────────────────────────────────

async function buyBusiness() {
    const user = firebase.auth().currentUser;
    if (!user) return;
    const stage = BUSINESS_STAGES[0];
    if (!confirm(`Открыть «${stage.name}» за ${stage.buyCost} монет из бизнес-кошелька?`)) return;
    const btn = document.querySelector('.biz-buy-btn');
    if (btn) { btn.disabled = true; btn.textContent = '⏳ Открываем...'; }

    try {
        const userRef = firebase.firestore().collection('users').doc(user.uid);
        const snap = await userRef.get();
        const data = snap.data();
        const lvl = typeof currentUserLevel !== 'undefined' ? currentUserLevel : 1;
        if ((data.businessCoins || 0) < stage.buyCost) {
            showBizMsg(`❌ Нужно ${stage.buyCost} монет в бизнес-кошельке. Сначала пополни его!`);
            if (btn) { btn.disabled = false; btn.textContent = '🔒 Пополни бизнес-кошелёк'; } return;
        }
        // Проверяем что бизнеса ещё нет
        const existing = await firebase.firestore().collection('businesses').where('ownerId', '==', user.uid).limit(1).get();
        if (!existing.empty) { showBizMsg('❌ У вас уже есть бизнес!'); return; }

        await userRef.update({ businessCoins: firebase.firestore.FieldValue.increment(-stage.buyCost) });
        await firebase.firestore().collection('businesses').add({
            ownerId: user.uid,
            ownerName: data.name || '',
            stage: 'cart',
            workers: [],
            vacancyOpen: false,
            vacancySalary: 0,
            totalEarned: 0,
            createdAt: new Date()
        });
        setTimeout(() => renderBusinessTab(), 800);
    } catch(e) {
        showBizMsg('❌ Ошибка: ' + e.message);
        if (btn) { btn.disabled = false; btn.textContent = '🚀 Открыть бизнес!'; }
    }
}

async function workInBusiness(bizId) {
    const user = firebase.auth().currentUser;
    if (!user) return;
    const btn = document.querySelector('.biz-work-btn');
    if (btn) { btn.disabled = true; btn.textContent = '⏳...'; }

    try {
        const bizRef = firebase.firestore().collection('businesses').doc(bizId);
        const [energy, energyUsed] = await Promise.all([
            getOrResetEnergy(user.uid),
            getOrResetBizCapacity(bizRef)
        ]);

        if (energy <= 0) { showBizMsg('😴 Твоя энергия закончилась!'); if (btn) { btn.disabled = false; } return; }

        const bizSnap = await bizRef.get();
        const biz = bizSnap.data();
        const stage = getStage(biz.stage);

        if (energyUsed >= stage.dailyCapacity) {
            showBizMsg(`🏁 Бизнес заполнен на сегодня! (${stage.dailyCapacity}/${stage.dailyCapacity}) Завтра откроется снова.`);
            if (btn) { btn.disabled = false; } return;
        }

        const income = stage.incomePerEnergy;
        const freshUserSnap = await firebase.firestore().collection('users').doc(user.uid).get();
        const workerName = freshUserSnap.data().name || 'Неизвестно';
        const remaining = stage.dailyCapacity - energyUsed - 1;

        const expUpdate = {};
        expUpdate[stage.expField] = firebase.firestore.FieldValue.increment(1);

        await Promise.all([
            firebase.firestore().collection('users').doc(user.uid).update({
                businessCoins: firebase.firestore.FieldValue.increment(income),
                energy: firebase.firestore.FieldValue.increment(-1),
                ...expUpdate
            }),
            bizRef.update({
                totalEarned: firebase.firestore.FieldValue.increment(income),
                energyUsedToday: firebase.firestore.FieldValue.increment(1)
            }),
            bizRef.collection('work_logs').add({
                workerName, isOwner: true, income, salary: 0, ownerProfit: income, timestamp: new Date()
            })
        ]);

        showBizMsg(`✅ +${income} монет! ⚡ Твоя энергия: ${energy - 1} | 📦 Осталось мест: ${remaining}`);
        setTimeout(() => renderBusinessTab(), 900);
    } catch(e) {
        showBizMsg('❌ Ошибка: ' + e.message);
        if (btn) { btn.disabled = false; }
    }
}

async function upgradeBusiness(bizId) {
    const user = firebase.auth().currentUser;
    if (!user) return;

    try {
        const bizRef = firebase.firestore().collection('businesses').doc(bizId);
        const bizSnap = await bizRef.get();
        const biz = bizSnap.data();
        const currentStage = getStage(biz.stage);
        if (!currentStage.nextStage) { showBizMsg('❌ Уже максимальный уровень!'); return; }
        const nextStage = getStage(currentStage.nextStage);

        if (!confirm(`Улучшить до «${nextStage.name}» за ${nextStage.upgradeCost} монет из бизнес-кошелька?`)) return;
        const btn = document.querySelector('.biz-upgrade-btn');
        if (btn) { btn.disabled = true; btn.textContent = '⏳...'; }

        const userRef = firebase.firestore().collection('users').doc(user.uid);
        const userSnap = await userRef.get();
        const businessCoins = userSnap.data().businessCoins || 0;
        if (businessCoins < nextStage.upgradeCost) {
            showBizMsg(`❌ Нужно ${nextStage.upgradeCost} монет в бизнес-кошельке, у вас ${businessCoins}`);
            if (btn) { btn.disabled = false; btn.textContent = `🚀 Улучшить за ${nextStage.upgradeCost} монет`; }
            return;
        }

        await Promise.all([
            userRef.update({ businessCoins: firebase.firestore.FieldValue.increment(-nextStage.upgradeCost) }),
            bizRef.update({ stage: currentStage.nextStage })
        ]);

        showBizMsg(`🎉 Бизнес улучшен до «${nextStage.name}»!`);
        setTimeout(() => renderBusinessTab(), 900);
    } catch(e) {
        showBizMsg('❌ Ошибка: ' + e.message);
        if (btn) { btn.disabled = false; }
    }
}

async function postVacancy(bizId) {
    const salary = parseInt(document.getElementById('biz-salary-input')?.value) || 0;
    if (salary < 1) { showBizMsg('❌ Введите зарплату!'); return; }
    const btn = document.querySelector('.biz-post-vacancy-btn');
    if (btn) { btn.disabled = true; }

    try {
        const db = firebase.firestore();
        const bizRef = db.collection('businesses').doc(bizId);
        const bizSnap = await bizRef.get();
        const biz = bizSnap.data();
        const stage = getStage(biz.stage);

        // #8 — ограничение зарплаты: не больше дохода бизнеса
        if (salary >= stage.incomePerEnergy) {
            showBizMsg(`❌ Зарплата не может быть ≥ дохода бизнеса (${stage.incomePerEnergy} монет). Владелец должен зарабатывать!`);
            if (btn) { btn.disabled = false; }
            return;
        }

        // #6 — атомарный batch: оба шага или ни одного
        const batch = db.batch();
        batch.update(bizRef, { vacancyOpen: true, vacancySalary: salary });
        batch.set(db.collection('job_board').doc(bizId), {
            bizId,
            ownerId: biz.ownerId,
            ownerName: biz.ownerName,
            bizName: stage.name,
            bizIcon: stage.icon,
            bizStage: biz.stage,
            salary,
            incomePerEnergy: stage.incomePerEnergy,
            updatedAt: new Date()
        });
        await batch.commit();
        showBizMsg('📢 Вакансия открыта! Игроки смогут откликнуться.');
        setTimeout(() => renderBusinessTab(), 900);
    } catch(e) {
        showBizMsg('❌ Ошибка: ' + e.message);
        if (btn) { btn.disabled = false; }
    }
}

async function closeVacancy(bizId) {
    try {
        await firebase.firestore().collection('businesses').doc(bizId).update({ vacancyOpen: false, vacancySalary: 0 });
        await firebase.firestore().collection('job_board').doc(bizId).delete();
        showBizMsg('✅ Вакансия закрыта.');
        setTimeout(() => renderBusinessTab(), 800);
    } catch(e) {
        showBizMsg('❌ Ошибка: ' + e.message);
    }
}

async function adminDeleteVacancy(bizId) {
    if (!confirm('Удалить вакансию?')) return;
    try {
        const db = firebase.firestore();
        const batch = db.batch();
        batch.update(db.collection('businesses').doc(bizId), { vacancyOpen: false, vacancySalary: 0 });
        batch.delete(db.collection('job_board').doc(bizId));
        await batch.commit();
        setTimeout(() => renderJobBoard(), 400);
    } catch(e) {
        showBizMsg('❌ Ошибка: ' + e.message);
    }
}

async function fireWorker(bizId, workerId) {
    if (!confirm('Уволить этого работника?')) return;
    try {
        const bizRef = firebase.firestore().collection('businesses').doc(bizId);
        const bizSnap = await bizRef.get();
        const workers = (bizSnap.data().workers || []).filter(w => w.userId !== workerId);
        await bizRef.update({ workers });
        showBizMsg('✅ Работник уволен.');
        setTimeout(() => renderBusinessTab(), 800);
    } catch(e) {
        showBizMsg('❌ Ошибка: ' + e.message);
    }
}

// ─── Доска вакансий (вид для работника) ──────────────────────────────────────

async function renderJobBoard() {
    const content = document.getElementById('business-content');
    if (!content) return;

    const user = firebase.auth().currentUser;
    if (!user) return;

    content.innerHTML = '<div class="crypto-loading">Загружаем вакансии... 📋</div>';
    try {

    // Проверяем — есть ли у самого бизнес (нельзя работать у себя)
    const myBizSnap = await firebase.firestore().collection('businesses').where('ownerId', '==', user.uid).limit(1).get();
    const myBizId = myBizSnap.empty ? null : myBizSnap.docs[0].id;

    const [energy, myUserSnap] = await Promise.all([
        getOrResetEnergy(user.uid),
        firebase.firestore().collection('users').doc(user.uid).get()
    ]);
    const myData = myUserSnap.data();
    const isAdmin = myData.isAdmin === true;

    const jobsSnap = await firebase.firestore().collection('job_board').get();
    const jobs = jobsSnap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter(j => isAdmin || j.ownerId !== user.uid);

    // Параллельно грузим ёмкость для каждого бизнеса (catch — если нет прав на запись)
    const capacities = await Promise.all(
        jobs.map(j => {
            const bizRef = firebase.firestore().collection('businesses').doc(j.bizId);
            return bizRef.get().then(snap => {
                const data = snap.data() || {};
                const key = bizDayKey();
                if ((data.bizEnergyDate || '') !== key) {
                    // Попробуем сбросить, но не блокируем рендер если нет прав
                    bizRef.update({ energyUsedToday: 0, bizEnergyDate: key }).catch(() => {});
                    return 0;
                }
                return data.energyUsedToday || 0;
            }).catch(() => 0);
        })
    );

    const jobsHtml = jobs.length === 0
        ? '<div style="color:#aaa;text-align:center;padding:20px;">Пока нет открытых вакансий</div>'
        : jobs.map((j, idx) => {
            const stage = getStage(j.bizStage || 'cart');
            const hasReq = stage.workerRequiredExp && stage.workerRequiredField;
            const myExp = hasReq ? (myData[stage.workerRequiredField] || 0) : 0;
            const reqMet = !hasReq || myExp >= stage.workerRequiredExp;
            const expPct = hasReq ? Math.min(100, Math.round((myExp / stage.workerRequiredExp) * 100)) : 100;

            const energyUsed = capacities[idx];
            const capacityLeft = stage.dailyCapacity - energyUsed;
            const capacityFull = capacityLeft <= 0;
            const capacityPct = Math.min(100, Math.round((energyUsed / stage.dailyCapacity) * 100));
            const capacityColor = capacityLeft <= 0 ? '#e74c3c' : capacityLeft <= stage.dailyCapacity * 0.2 ? '#e8956d' : '#27ae60';

            const reqHtml = hasReq ? `
                <div class="biz-exp-req ${reqMet ? 'met' : 'unmet'}">
                    <div class="biz-exp-req-label">
                        <span>${reqMet ? '✅' : '🔒'} Опыт «${stage.workerRequiredLabel}»: ${myExp}/${stage.workerRequiredExp} ч.</span>
                    </div>
                    <div class="biz-exp-bar-bg">
                        <div class="biz-exp-bar-fill ${reqMet ? 'met' : ''}" style="width:${expPct}%"></div>
                    </div>
                </div>` : '';

            const canApply = energy > 0 && reqMet && !capacityFull;
            const capacityText = capacityFull ? 'Заполнено' : (capacityLeft + ' из ' + stage.dailyCapacity);
            const btnLabel = !energy ? '😴 Нет энергии' : capacityFull ? '🏁 Мест нет на сегодня' : !reqMet ? '🔒 Нет опыта' : '🔨 Выйти на работу (−1 ⚡)';
            return `
            <div class="biz-job-card" data-biz-id="${j.bizId}">
                <div class="biz-job-header">
                    <span class="biz-job-icon">${j.bizIcon}</span>
                    <div>
                        <div class="biz-job-name">${j.bizName}</div>
                        <div class="biz-job-owner">Владелец: ${j.ownerName}</div>
                    </div>
                </div>
                <div class="biz-job-details">
                    <span>💰 Зарплата: <b>${j.salary} монет / работа</b></span>
                </div>
                <div class="biz-job-capacity">
                    <div class="biz-job-capacity-label">
                        <span>⚡ Мест на сегодня:</span>
                        <span class="biz-cap-text" style="color:${capacityColor};font-weight:700;">${capacityText}</span>
                    </div>
                    <div class="biz-cap-bar-bg">
                        <div class="biz-cap-bar-fill" style="width:${capacityPct}%;background:${capacityColor};"></div>
                    </div>
                </div>
                ${reqHtml}
                <button class="biz-apply-btn" onclick="workForOwner('${j.bizId}', ${j.salary}, ${j.dailyCapacity || stage.dailyCapacity})"
                    ${canApply ? '' : 'disabled'}
                    style="width:100% !important; margin-top:8px;">
                    ${btnLabel}
                </button>
                ${isAdmin ? `<button class="biz-admin-delete-btn" onclick="adminDeleteVacancy('${j.bizId}')">🗑 Удалить вакансию</button>` : ''}
            </div>`;
        }).join('');

    content.innerHTML = `
        <div class="biz-jobboard-header">
            <div style="font-size:1.1em;font-weight:700;color:#5c1f4a;">📋 Доска вакансий</div>
            <div id="jobboard-energy-display" style="font-size:0.85em;color:#888;">⚡ Твоя энергия: ${energy}/${ENERGY_MAX}</div>
        </div>
        ${jobsHtml}
        <div id="biz-msg" class="biz-msg"></div>
    `;
    } catch(e) {
        content.innerHTML = `<div style="color:#e74c3c;text-align:center;padding:20px;">❌ Ошибка загрузки: ${e.message}</div>`;
    }
}

async function workForOwner(bizId, salary, dailyCap) {
    const user = firebase.auth().currentUser;
    if (!user) return;
    const btn = event.target;
    if (btn) { btn.disabled = true; btn.textContent = '⏳...'; }

    try {
        const bizRef = firebase.firestore().collection('businesses').doc(bizId);
        const [energy, energyUsed] = await Promise.all([
            getOrResetEnergy(user.uid),
            getOrResetBizCapacity(bizRef)
        ]);

        if (energy <= 0) { showBizMsg('😴 Твоя энергия закончилась!'); if (btn) { btn.disabled = false; btn.textContent = '🔨 Выйти на работу (−1 ⚡)'; } return; }

        const bizSnap = await bizRef.get();
        const biz = bizSnap.data();
        const stage = getStage(biz.stage);

        if (energyUsed >= stage.dailyCapacity) {
            showBizMsg(`🏁 Бизнес заполнен на сегодня! (${stage.dailyCapacity}/${stage.dailyCapacity})`);
            if (btn) { btn.disabled = false; btn.textContent = '🏁 Заполнено на сегодня'; } return;
        }

        const ownerIncome = stage.incomePerEnergy - salary;
        if (ownerIncome < 0) { showBizMsg('❌ Зарплата больше чем доход бизнеса!'); if (btn) { btn.disabled = false; btn.textContent = '🔨 Выйти на работу (−1 ⚡)'; } return; }

        const workerSnap = await firebase.firestore().collection('users').doc(user.uid).get();
        const workerData = workerSnap.data();
        const workerName = workerData.name || 'Неизвестно';

        // Проверяем требования к опыту
        if (stage.workerRequiredExp && stage.workerRequiredField) {
            const workerExp = workerData[stage.workerRequiredField] || 0;
            if (workerExp < stage.workerRequiredExp) {
                showBizMsg(`❌ Нужен опыт в «${stage.workerRequiredLabel}»: ${workerExp}/${stage.workerRequiredExp} ч.`);
                if (btn) { btn.disabled = false; btn.textContent = '🔒 Нет опыта'; }
                return;
            }
        }

        const remaining = stage.dailyCapacity - energyUsed - 1;

        const workerExpUpdate = {};
        workerExpUpdate[stage.expField] = firebase.firestore.FieldValue.increment(1);

        await Promise.all([
            firebase.firestore().collection('users').doc(user.uid).update({
                energy: firebase.firestore.FieldValue.increment(-1),
                businessCoins: firebase.firestore.FieldValue.increment(salary),
                ...workerExpUpdate
            }),
            firebase.firestore().collection('users').doc(biz.ownerId).update({
                businessCoins: firebase.firestore.FieldValue.increment(ownerIncome)
            }),
            bizRef.update({
                totalEarned: firebase.firestore.FieldValue.increment(stage.incomePerEnergy),
                energyUsedToday: firebase.firestore.FieldValue.increment(1)
            }),
            bizRef.collection('work_logs').add({
                workerName, isOwner: false, income: stage.incomePerEnergy,
                salary, ownerProfit: ownerIncome, timestamp: new Date()
            })
        ]);

        showBizMsg(`✅ +${salary} монет тебе! Владелец +${ownerIncome}. 📦 Осталось мест: ${remaining}`);

        // Обновляем только карточку — без перерисовки всей доски
        const card = document.querySelector(`.biz-job-card[data-biz-id="${bizId}"]`);
        if (card) {
            const newUsed = energyUsed + 1;
            const newLeft = stage.dailyCapacity - newUsed;
            const newFull = newLeft <= 0;
            const newPct  = Math.min(100, Math.round((newUsed / stage.dailyCapacity) * 100));
            const newColor = newFull ? '#e74c3c' : newLeft <= stage.dailyCapacity * 0.2 ? '#e8956d' : '#27ae60';
            const newText  = newFull ? 'Заполнено' : (newLeft + ' из ' + stage.dailyCapacity);
            card.querySelector('.biz-cap-text').textContent = newText;
            card.querySelector('.biz-cap-text').style.color = newColor;
            card.querySelector('.biz-cap-bar-fill').style.width = newPct + '%';
            card.querySelector('.biz-cap-bar-fill').style.background = newColor;
            const energyDisplay = document.getElementById('jobboard-energy-display');
            if (energyDisplay) energyDisplay.textContent = `⚡ Твоя энергия: ${energy - 1}/${ENERGY_MAX}`;
            if (btn) {
                if (newFull) {
                    btn.disabled = true; btn.textContent = '🏁 Мест нет на сегодня';
                } else if (energy - 1 <= 0) {
                    btn.disabled = true; btn.textContent = '😴 Нет энергии';
                } else {
                    btn.disabled = false; btn.textContent = '🔨 Выйти на работу (−1 ⚡)';
                }
            }
        }
    } catch(e) {
        showBizMsg('❌ Ошибка: ' + e.message);
        if (btn) { btn.disabled = false; btn.textContent = '🔨 Выйти на работу (−1 ⚡)'; }
    }
}

// ─── Переключение вкладок внутри бизнес-модала ───────────────────────────────

function switchBizTab(tab) {
    document.getElementById('biz-tab-my').classList.toggle('active', tab === 'my');
    document.getElementById('biz-tab-jobs').classList.toggle('active', tab === 'jobs');
    document.getElementById('biz-tab-exp').classList.toggle('active', tab === 'exp');
    if (tab === 'my') renderBusinessTab();
    else if (tab === 'jobs') renderJobBoard();
    else renderMyExp();
}

async function renderMyExp() {
    const content = document.getElementById('business-content');
    if (!content) return;
    const user = firebase.auth().currentUser;
    if (!user) return;

    content.innerHTML = '<div class="crypto-loading">Загружаем опыт... 📊</div>';

    const snap = await firebase.firestore().collection('users').doc(user.uid).get();
    const data = snap.data();

    // Конфиг опыта: какой опыт нужен для работы в каждом бизнесе
    const expStages = [
        { stageId: 'cart',    expField: 'bizExpCart',    icon: '🛒', name: 'Тележка мороженного',  required: null, nextName: 'Киоск',          nextRequired: 50 },
        { stageId: 'kiosk',   expField: 'bizExpKiosk',   icon: '🏪', name: 'Киоск мороженого',     required: 50,   nextName: 'Кафе-мороженое', nextRequired: 50 },
        { stageId: 'cafe',    expField: 'bizExpCafe',    icon: '🏬', name: 'Кафе-мороженое',       required: 50,   nextName: 'Фабрика',        nextRequired: 50 },
        { stageId: 'factory', expField: 'bizExpFactory', icon: '🏭', name: 'Фабрика мороженого',   required: 50,   nextName: null,             nextRequired: null }
    ];

    const rows = expStages.map(s => {
        const exp = data[s.expField] || 0;
        const req = s.nextRequired;
        const pct = req ? Math.min(100, Math.round((exp / req) * 100)) : 100;
        const barColor = pct >= 100 ? '#27ae60' : pct >= 50 ? '#f7931a' : '#e8956d';
        const statusLabel = !s.required
            ? '<span style="font-size:0.78em;color:#27ae60;">✅ Доступно</span>'
            : (data[expStages.find(x => x.nextName === s.name)?.expField] || 0) >= s.required
                ? '<span style="font-size:0.78em;color:#27ae60;">✅ Доступно</span>'
                : `<span style="font-size:0.78em;color:#e53935;">🔒 Нужно ${s.required} оп. в предыдущем</span>`;

        const nextInfo = s.nextRequired
            ? `<div style="font-size:0.78em;color:#888;margin-top:3px;">Для работы в «${s.nextName}»: <b>${exp}/${s.nextRequired}</b></div>`
            : '<div style="font-size:0.78em;color:#27ae60;margin-top:3px;">🏆 Максимальный тип бизнеса</div>';

        return `
        <div style="background:#fff;border-radius:14px;padding:14px;margin-bottom:12px;box-shadow:0 2px 8px rgba(0,0,0,0.06);border:1.5px solid #f0e8ff;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
                <div style="font-weight:700;color:#5c1f4a;">${s.icon} ${s.name}</div>
                <div style="font-size:1.1em;font-weight:700;color:#7c3aed;">${exp} оп.</div>
            </div>
            ${statusLabel}
            <div style="background:#f0f0f0;border-radius:6px;height:8px;margin:8px 0 4px;overflow:hidden;">
                <div style="width:${pct}%;height:100%;border-radius:6px;background:${barColor};transition:width 0.4s;"></div>
            </div>
            ${nextInfo}
        </div>`;
    }).join('');

    content.innerHTML = `
        <div style="padding:4px 0 12px;">
            <div style="font-size:1.1em;font-weight:700;color:#5c1f4a;margin-bottom:4px;">📊 Мой опыт работы</div>
            <div style="font-size:0.85em;color:#888;">Опыт накапливается когда ты работаешь в бизнесе</div>
        </div>
        ${rows}
        <div style="font-size:0.8em;color:#aaa;text-align:center;margin-top:8px;">1 энергия = 1 опыт</div>
    `;
}

function toggleBizWallet() {
    const forms = document.getElementById('biz-wallet-forms');
    const btn = document.querySelector('.crypto-wallet-toggle');
    if (!forms) return;
    const open = forms.style.display === 'none';
    forms.style.display = open ? '' : 'none';
    if (btn) btn.textContent = open ? '💼 Бизнес-кошелёк ▲' : '💼 Бизнес-кошелёк ▼';
}

async function bizDeposit() {
    const amount = parseInt(document.getElementById('biz-deposit-amount')?.value) || 0;
    const msgEl = document.getElementById('biz-wallet-msg');
    const btn = document.querySelector('.biz-deposit-btn');
    if (amount < 1) { if (msgEl) msgEl.textContent = '❌ Минимум 1 монета'; return; }
    const user = firebase.auth().currentUser;
    if (!user) return;
    if (btn) { btn.disabled = true; btn.textContent = '⏳...'; }
    try {
        const ref = firebase.firestore().collection('users').doc(user.uid);
        const snap = await ref.get();
        const freshCoins = snap.data().coins || 0;
        if (freshCoins < amount) {
            if (msgEl) msgEl.textContent = `❌ Недостаточно монет. У вас: ${freshCoins}`;
            if (btn) { btn.disabled = false; btn.textContent = 'Пополнить'; }
            return;
        }
        await ref.update({
            coins: firebase.firestore.FieldValue.increment(-amount),
            businessCoins: firebase.firestore.FieldValue.increment(amount)
        });
        if (msgEl) { msgEl.style.color = '#27ae60'; msgEl.textContent = `✅ Пополнено на ${amount} монет`; }
        setTimeout(() => { renderBusinessTab(); if (typeof showProfile === 'function') showProfile(); }, 900);
    } catch(e) {
        if (msgEl) { msgEl.style.color = '#e53935'; msgEl.textContent = '❌ Ошибка: ' + e.message; }
        if (btn) { btn.disabled = false; btn.textContent = 'Пополнить'; }
    }
}

async function bizWithdraw() {
    const amount = parseInt(document.getElementById('biz-withdraw-amount')?.value) || 0;
    const msgEl = document.getElementById('biz-wallet-msg');
    const btn = document.querySelector('.biz-withdraw-btn');
    if (amount < 1) { if (msgEl) msgEl.textContent = '❌ Минимум 1 монета'; return; }
    const user = firebase.auth().currentUser;
    if (!user) return;
    if (btn) { btn.disabled = true; btn.textContent = '⏳...'; }
    try {
        const db  = firebase.firestore();
        const ref = db.collection('users').doc(user.uid);
        const adminSnap = await db.collection('users').where('isAdmin', '==', true).limit(1).get();
        const adminRef  = adminSnap.empty ? null : adminSnap.docs[0].ref;
        let userName = '';

        await db.runTransaction(async (tx) => {
            const snap     = await tx.get(ref);
            const freshBiz = snap.data().businessCoins || 0;
            userName = snap.data().name || '';
            if (freshBiz < amount) throw new Error(`Недостаточно монет в бизнес-кошельке. У вас: ${freshBiz}`);
            const tax      = adminRef ? Math.max(1, Math.floor(amount * 0.01)) : 0;
            const received = amount - tax;
            tx.update(ref, {
                businessCoins: firebase.firestore.FieldValue.increment(-amount),
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
                amount: tax, source: 'business',
                label: 'Налог на доходы пользователей',
                timestamp: new Date()
            }).catch(() => {});
        }
        const msg = tax > 0 ? `✅ Выведено ${received} монет (налог 1%: ${tax})` : `✅ Выведено ${amount} монет`;
        if (msgEl) { msgEl.style.color = '#27ae60'; msgEl.textContent = msg; }
        setTimeout(() => { renderBusinessTab(); if (typeof showProfile === 'function') showProfile(); }, 900);
    } catch(e) {
        if (msgEl) { msgEl.style.color = '#e53935'; msgEl.textContent = '❌ Ошибка: ' + e.message; }
        if (btn) { btn.disabled = false; btn.textContent = 'Вывести'; }
    }
}

async function transferBizToExchange() {
    const amount = parseInt(document.getElementById('biz-to-exchange-amount')?.value) || 0;
    const msgEl = document.getElementById('biz-wallet-msg');
    const btn = document.querySelector('.biz-to-exchange-btn');
    if (amount < 1) { if (msgEl) msgEl.textContent = '❌ Минимум 1 монета'; return; }
    const user = firebase.auth().currentUser;
    if (!user) return;
    if (btn) { btn.disabled = true; btn.textContent = '⏳...'; }
    try {
        const db = firebase.firestore();
        const ref = db.collection('users').doc(user.uid);
        await db.runTransaction(async (tx) => {
            const snap = await tx.get(ref);
            const freshBiz = snap.data().businessCoins || 0;
            if (freshBiz < amount) throw new Error(`Недостаточно в бизнес-кошельке: ${freshBiz}`);
            tx.update(ref, {
                businessCoins:  firebase.firestore.FieldValue.increment(-amount),
                exchangeCoins:  firebase.firestore.FieldValue.increment(amount)
            });
        });
        if (msgEl) { msgEl.style.color = '#27ae60'; msgEl.textContent = `✅ Переведено ${amount} монет на биржу`; }
        setTimeout(() => { renderBusinessTab(); if (typeof showProfile === 'function') showProfile(); }, 900);
    } catch(e) {
        if (msgEl) { msgEl.style.color = '#e53935'; msgEl.textContent = '❌ ' + e.message; }
        if (btn) { btn.disabled = false; btn.textContent = '→ Биржа'; }
    }
}

async function transferExchangeToBiz() {
    const amount = parseInt(document.getElementById('exchange-to-biz-amount')?.value) || 0;
    const msgEl = document.getElementById('biz-wallet-msg');
    const btn = document.querySelector('.exchange-to-biz-btn');
    if (amount < 1) { if (msgEl) msgEl.textContent = '❌ Минимум 1 монета'; return; }
    const user = firebase.auth().currentUser;
    if (!user) return;
    if (btn) { btn.disabled = true; btn.textContent = '⏳...'; }
    try {
        const db = firebase.firestore();
        const ref = db.collection('users').doc(user.uid);
        await db.runTransaction(async (tx) => {
            const snap = await tx.get(ref);
            const freshEx = snap.data().exchangeCoins || 0;
            if (freshEx < amount) throw new Error(`Недостаточно на бирже: ${freshEx}`);
            tx.update(ref, {
                exchangeCoins:  firebase.firestore.FieldValue.increment(-amount),
                businessCoins:  firebase.firestore.FieldValue.increment(amount)
            });
        });
        if (msgEl) { msgEl.style.color = '#27ae60'; msgEl.textContent = `✅ Переведено ${amount} монет в бизнес`; }
        setTimeout(() => { renderBusinessTab(); if (typeof showProfile === 'function') showProfile(); }, 900);
    } catch(e) {
        if (msgEl) { msgEl.style.color = '#e53935'; msgEl.textContent = '❌ ' + e.message; }
        if (btn) { btn.disabled = false; btn.textContent = '→ Бизнес'; }
    }
}

function showBizMsg(text) {
    const el = document.getElementById('biz-msg');
    if (!el) return;
    el.textContent = text;
    el.style.display = '';
    setTimeout(() => { if (el) el.style.display = 'none'; }, 3500);
}
