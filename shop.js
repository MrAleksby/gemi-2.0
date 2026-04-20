// ─── Конфигурация всех товаров магазина ───────────────────────────────────────
const SHOP_ITEMS = [
    {
        id: 'savings',
        name: 'Сбережения',
        icon: '🏦',
        color: '#43a047',
        maxLevel: 25,
        upgrades: Array.from({ length: 25 }, (_, i) => ({
            charLevel: i + 1,
            cost: (i + 1) * 30,
            reward: (i + 1) * 200
        }))
    },
    {
        id: 'twobig',
        name: '2BIG акции',
        icon: '📊',
        color: '#e53935',
        unit: 'акций в игре',
        maxLevel: 5,
        upgrades: [
            { charLevel: 5,  cost: 75,  reward: 5  },
            { charLevel: 10, cost: 150, reward: 10 },
            { charLevel: 15, cost: 225, reward: 15 },
            { charLevel: 20, cost: 300, reward: 20 },
            { charLevel: 25, cost: 375, reward: 25 }
        ]
    },
    {
        id: 'ok4u',
        name: 'OK4U',
        icon: '🔷',
        color: '#1976d2',
        unit: 'акций в игре',
        maxLevel: 5,
        upgrades: [
            { charLevel: 5,  cost: 75,  reward: 100  },
            { charLevel: 10, cost: 150, reward: 250  },
            { charLevel: 15, cost: 225, reward: 500  },
            { charLevel: 20, cost: 300, reward: 750  },
            { charLevel: 25, cost: 375, reward: 1000 }
        ]
    },
    {
        id: 'myt4u',
        name: 'MYT4U',
        icon: '⭐',
        color: '#f9a825',
        unit: 'акций в игре',
        maxLevel: 5,
        upgrades: [
            { charLevel: 5,  cost: 75,  reward: 100  },
            { charLevel: 10, cost: 150, reward: 250  },
            { charLevel: 15, cost: 225, reward: 500  },
            { charLevel: 20, cost: 300, reward: 750  },
            { charLevel: 25, cost: 375, reward: 1000 }
        ]
    },
    {
        id: 'on2u',
        name: 'ON2U',
        icon: '🌿',
        color: '#00897b',
        unit: 'акций в игре',
        maxLevel: 5,
        upgrades: [
            { charLevel: 5,  cost: 113, reward: 100  },
            { charLevel: 10, cost: 225, reward: 250  },
            { charLevel: 15, cost: 338, reward: 500  },
            { charLevel: 20, cost: 450, reward: 750  },
            { charLevel: 25, cost: 563, reward: 1000 }
        ]
    },
    {
        id: 'gro4us',
        name: 'GRO4US',
        icon: '🚀',
        color: '#e65100',
        unit: 'акций в игре',
        maxLevel: 5,
        upgrades: [
            { charLevel: 5,  cost: 113, reward: 100  },
            { charLevel: 10, cost: 225, reward: 250  },
            { charLevel: 15, cost: 338, reward: 500  },
            { charLevel: 20, cost: 450, reward: 750  },
            { charLevel: 25, cost: 563, reward: 1000 }
        ]
    },
    {
        id: 'percents',
        name: 'Проценты',
        icon: '💹',
        color: '#6a1b9a',
        maxLevel: 5,
        defaultValue: '—',
        upgrades: [
            { charLevel: 5,  cost: 75,  reward: '10%' },
            { charLevel: 10, cost: 150, reward: '20%' },
            { charLevel: 15, cost: 225, reward: '30%' },
            { charLevel: 20, cost: 300, reward: '40%' },
            { charLevel: 25, cost: 375, reward: '50%' }
        ]
    },
    {
        id: 'passives',
        name: 'Пассивы',
        icon: '🛡️',
        color: '#388e3c',
        maxLevel: 5,
        defaultValue: '—',
        upgrades: [
            { charLevel: 5,  cost: 75,  reward: 'Мелкие кредиты'      },
            { charLevel: 10, cost: 150, reward: 'Кредитные карточки'   },
            { charLevel: 15, cost: 225, reward: 'Кредит на автомобиль' },
            { charLevel: 20, cost: 300, reward: 'На образование'       },
            { charLevel: 25, cost: 375, reward: 'Ипотека'              }
        ]
    },
    {
        id: 'realty',
        name: 'Недвижимость',
        icon: '🏠',
        color: '#ff9800',
        maxLevel: 5,
        defaultValue: '—',
        upgrades: [
            { charLevel: 5,  cost: 75,  reward: '(2|1 И35к ПВ2к П100)'   },
            { charLevel: 10, cost: 150, reward: '(3/2 И90к ПВ3к П200)'   },
            { charLevel: 15, cost: 225, reward: '(2плекс И40к ПВ5к П300)' },
            { charLevel: 20, cost: 300, reward: '(4плекс И80к ПВ10к П500)'},
            { charLevel: 25, cost: 375, reward: '(8плес И120к ПВ20к П1к)' }
        ]
    }
];

// ─── Построить одну карточку товара ───────────────────────────────────────────
function buildCard(item, data, coins) {
    const level     = data[item.id + 'Level'] || 0;
    const value     = data[item.id] ?? (item.defaultValue ?? 0);
    const next      = item.upgrades[level];
    const charLevel = data.level || 1;
    const maxed     = level >= item.maxLevel;
    const pct       = Math.round((level / item.maxLevel) * 100);

    let canUpgrade = false;
    let hint       = '';
    let btnLabel   = 'Купить';

    if (maxed) {
        hint     = `<div class="shop-hint shop-hint--max" style="color:${item.color}">✅ MAX</div>`;
        btnLabel = 'MAX';
    } else if (coins < next.cost) {
        const missing = next.cost - coins;
        hint     = `<div class="shop-hint shop-hint--warn">Не хватает ${missing} 💰</div>`;
        btnLabel = 'Мало монет';
    } else {
        canUpgrade = true;
        btnLabel   = `Купить — ${next.cost} 💰`;
    }

    const progressBar = `
        <div class="shop-bar-wrap">
            <div class="shop-bar-fill" style="width:${pct}%;background:${item.color};"></div>
        </div>`;

    const unit = item.unit ? ` <span style="font-size:0.8em;font-weight:400;color:#888;">${item.unit}</span>` : '';
    const nextInfo = (!maxed && next)
        ? `<div class="shop-next">Следующий уровень: <b>${next.reward}</b>${unit}</div>`
        : '';

    return `
        <div class="shop-card">
            <div class="shop-title" style="color:${item.color}">${item.icon} ${item.name}</div>
            <div class="shop-progress">Уровень <b>${level}</b> / ${item.maxLevel}</div>
            ${progressBar}
            <div class="shop-value">${value}</div>
            ${nextInfo}
            <button class="shop-btn" data-item-id="${item.id}" ${canUpgrade ? '' : 'disabled'}>${btnLabel}</button>
            ${hint}
        </div>`;
}

// ─── Отрисовка магазина ────────────────────────────────────────────────────────
async function renderShop() {
    const user = firebase.auth().currentUser;
    if (!user) {
        shopItems.innerHTML = '<p>Войдите в аккаунт, чтобы пользоваться магазином.</p>';
        return;
    }

    const userRef = firebase.firestore().collection('users').doc(user.uid);
    const doc     = await userRef.get();
    if (!doc.exists) return;

    const data      = doc.data();
    const charLevel = data.level || 1;
    const coins     = data.coins || 0;


    // Строим все карточки
    const cards = SHOP_ITEMS.map(item => buildCard(item, data, coins)).join('');
    shopItems.innerHTML = `
        <div class="shop-balance">💰 Монеты: <b>${fmt(coins)}</b></div>
        <div class="shop-cards">${cards}</div>`;

    // Один обработчик для всех кнопок
    shopItems.querySelectorAll('.shop-btn:not([disabled])').forEach(btn => {
        btn.onclick = () => handleShopPurchase(btn, userRef, data);
    });
}

// ─── Логика покупки (вынесена, чтобы не дублировать) ──────────────────────────
async function handleShopPurchase(btn, userRef, snapshotData) {
    if (btn.disabled) return;
    btn.disabled = true;

    const item = SHOP_ITEMS.find(i => i.id === btn.dataset.itemId);
    if (!item) { btn.disabled = false; return; }

    try {
        const freshDoc   = await userRef.get();
        const freshData  = freshDoc.data();
        const freshLevel = freshData[item.id + 'Level'] || 0;
        const freshCoins = freshData.coins || 0;
        const freshNext  = item.upgrades[freshLevel];
        const snapshotLevel = snapshotData[item.id + 'Level'] || 0;

        if (!freshNext || freshLevel !== snapshotLevel || freshCoins < freshNext.cost) {
            animatePurchase(btn, false);
            btn.disabled = false;
            animatePurchase(btn, false);
            btn.disabled = false;
            renderShop();
            return;
        }

        await userRef.update({
            coins:               freshCoins - freshNext.cost,
            [item.id + 'Level']: freshLevel + 1,
            [item.id]:           freshNext.reward
        });

        animatePurchase(btn, true);
        renderShop();
    } catch(e) {
        animatePurchase(btn, false);
        btn.disabled = false;
        console.error('Shop purchase error:', e);
    }
}

// ─── Анимация покупки ──────────────────────────────────────────────────────────
function animatePurchase(button, success = true) {
    const originalText = button.innerHTML;
    const originalBg   = button.style.background;

    if (success) {
        button.innerHTML        = '✅ Куплено!';
        button.style.background = 'linear-gradient(135deg, #4caf50, #66bb6a)';
        button.style.transform  = 'scale(1.05)';
        createParticleEffect(button);
        setTimeout(() => {
            button.innerHTML        = originalText;
            button.style.background = originalBg;
            button.style.transform  = '';
        }, 1500);
    } else {
        button.innerHTML        = '❌ Ошибка';
        button.style.background = 'linear-gradient(135deg, #f44336, #e53935)';
        button.style.transform  = 'scale(0.95)';
        setTimeout(() => {
            button.innerHTML        = originalText;
            button.style.background = originalBg;
            button.style.transform  = '';
        }, 1000);
    }
}

// ─── Эффект частиц при покупке ────────────────────────────────────────────────
function createParticleEffect(element) {
    const rect    = element.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top  + rect.height / 2;

    for (let i = 0; i < 8; i++) {
        const p = document.createElement('div');
        Object.assign(p.style, {
            position: 'fixed', left: centerX + 'px', top: centerY + 'px',
            width: '8px', height: '8px', background: '#4caf50',
            borderRadius: '50%', pointerEvents: 'none', zIndex: '9999',
            transition: 'all 0.6s ease-out'
        });
        document.body.appendChild(p);

        const angle    = (i / 8) * Math.PI * 2;
        const distance = 50;
        setTimeout(() => {
            p.style.left      = (centerX + Math.cos(angle) * distance) + 'px';
            p.style.top       = (centerY + Math.sin(angle) * distance) + 'px';
            p.style.opacity   = '0';
            p.style.transform = 'scale(0)';
        }, 50);
        setTimeout(() => p.remove(), 650);
    }
}

// ─── Открытие / закрытие магазина ─────────────────────────────────────────────
const shopBtn   = document.getElementById('shop-btn');
const shopModal = document.getElementById('shop-modal');
const shopClose = document.getElementById('shop-close');
const shopItems = document.getElementById('shop-items');

if (shopBtn && shopModal && shopClose) {
    shopBtn.onclick = async () => {
        const user = firebase.auth().currentUser;
        if (!user) { console.error('Магазин: пользователь не авторизован'); return; }

        const doc  = await firebase.firestore().collection('users').doc(user.uid).get();
        const data = doc.exists ? doc.data() : null;
        if (!data) { console.error('Магазин: ошибка загрузки данных пользователя'); return; }

        shopModal.style.display = 'block';
        renderShop();
    };

    shopClose.onclick = () => { shopModal.style.display = 'none'; if (typeof setNavTab === 'function') setNavTab('home'); };

    window.addEventListener('click', e => {
        if (e.target === shopModal) { shopModal.style.display = 'none'; if (typeof setNavTab === 'function') setNavTab('home'); }
    });
}
