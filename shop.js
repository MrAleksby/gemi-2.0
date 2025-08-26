// Открытие модального окна магазина
const shopBtn = document.getElementById('shop-btn');
const shopModal = document.getElementById('shop-modal');
const shopClose = document.getElementById('shop-close');
const shopItems = document.getElementById('shop-items');

// Массив апгрейдов для "Сбережения"
const savingsUpgrades = Array.from({length: 25}, (_, i) => ({
    cost: (i + 1) * 5,
    reward: (i + 1) * 200
}));

// Массив апгрейдов для "2big акции" (только на 5, 10, 15, 20, 25 уровнях)
const twobigUpgrades = [
    { charLevel: 5, cost: 25, reward: 5 },
    { charLevel: 10, cost: 50, reward: 10 },
    { charLevel: 15, cost: 75, reward: 15 },
    { charLevel: 20, cost: 100, reward: 20 },
    { charLevel: 25, cost: 125, reward: 25 }
];

// Массив апгрейдов для OK4U и MYT4U
const ok4uUpgrades = [
    { charLevel: 5, cost: 25, reward: 100 },
    { charLevel: 10, cost: 50, reward: 250 },
    { charLevel: 15, cost: 75, reward: 500 },
    { charLevel: 20, cost: 100, reward: 750 },
    { charLevel: 25, cost: 125, reward: 1000 }
];
const myt4uUpgrades = [
    { charLevel: 5, cost: 25, reward: 100 },
    { charLevel: 10, cost: 50, reward: 250 },
    { charLevel: 15, cost: 75, reward: 500 },
    { charLevel: 20, cost: 100, reward: 750 },
    { charLevel: 25, cost: 125, reward: 1000 }
];

// --- Новые категории ---
const percentsUpgrades = [
    { charLevel: 5, cost: 25, reward: '10%' },
    { charLevel: 10, cost: 50, reward: '20%' },
    { charLevel: 15, cost: 75, reward: '30%' },
    { charLevel: 20, cost: 100, reward: '40%' },
    { charLevel: 25, cost: 125, reward: '50%' }
];
const passivesUpgrades = [
    { charLevel: 5, cost: 25, reward: 'Мелкие кредиты' },
    { charLevel: 10, cost: 50, reward: 'Кредитные карточки' },
    { charLevel: 15, cost: 75, reward: 'Кредит на автомобиль' },
    { charLevel: 20, cost: 100, reward: 'На образование' },
    { charLevel: 25, cost: 125, reward: 'Ипотека' }
];
const realtyUpgrades = [
    { charLevel: 5, cost: 25, reward: '(2|1 И35к ПВ2к П100)' },
    { charLevel: 10, cost: 50, reward: '(3\\2 И90к ПВ3к П200)' },
    { charLevel: 15, cost: 75, reward: '(2плекс И40к ПВ5к П300)' },
    { charLevel: 20, cost: 100, reward: '(4плекс И80к ПВ10к П500)' },
    { charLevel: 25, cost: 125, reward: '(8плес И120к ПВ20к П1к)' }
];

// Получить данные пользователя из Firestore
async function getCurrentUserData() {
    const user = firebase.auth().currentUser;
    if (!user) return null;
    const doc = await firebase.firestore().collection('users').doc(user.uid).get();
    return doc.exists ? doc.data() : null;
}

// Обновить магазин
async function renderShop() {
    const user = firebase.auth().currentUser;
    if (!user) {
        shopItems.innerHTML = '<p>Войдите в аккаунт, чтобы пользоваться магазином.</p>';
        return;
    }
    const userRef = firebase.firestore().collection('users').doc(user.uid);
    const doc = await userRef.get();
    if (!doc.exists) return;
    const data = doc.data();
    const userLevel = data.level || 1;
    const coins = data.coins || 0;
    
    // Проверяем уровень пользователя
    if (userLevel < 5) {
        shopItems.innerHTML = `
            <div class="shop-locked-message">
                <div class="lock-icon">🔒</div>
                <h3>Магазин заблокирован</h3>
                <p>Магазин доступен только с 5 уровня!</p>
                <p>Станьте <strong>Учеником</strong>, чтобы получить доступ к инвестициям.</p>
                <div class="level-requirement">
                    <span>Требуется уровень: 5</span>
                    <span>Ваш уровень: ${userLevel}</span>
                </div>
                <div class="progress-to-unlock">
                    <p>До разблокировки: ${5 - userLevel} уровней</p>
                </div>
            </div>
        `;
        return;
    }
    // --- Сбережения ---
    const savingsLevel = data.savingsLevel || 0;
    const savings = data.savings || 0;
    let nextUpgrade = savingsUpgrades[savingsLevel];
    let charLevel = data.level || 1;
    let savingsMaxed = savingsLevel >= 25;
    let savingsLevelLimit = !nextUpgrade || charLevel < (savingsLevel + 1);
    let canUpgrade = nextUpgrade && coins >= nextUpgrade.cost && !savingsMaxed && charLevel >= (savingsLevel + 1);
    let savingsCard = `
      <div class="shop-card">
        <div class="shop-title savings">Сбережения</div>
        <div class="shop-progress">Ур. <b>${savingsLevel}</b> / 25</div>
        <div class="shop-value">${savings}</div>
        <div class="shop-next">+${nextUpgrade ? nextUpgrade.reward : '-'} за ${nextUpgrade ? nextUpgrade.cost : '-'} монет</div>
        <button class="shop-btn" id="upgrade-savings-btn" ${canUpgrade ? '' : 'disabled'}>Прокачать</button>
        ${savingsMaxed ? '<div class="shop-hint" style="color:#388e3c;">MAX</div>' : (savingsLevelLimit ? '<div class="shop-hint">Увеличьте уровень персонажа</div>' : '')}
      </div>`;
    // --- 2big акции ---
    const twobigLevel = data.twobigLevel || 0;
    const twobig = data.twobig || 0;
    let nextTwobig = twobigUpgrades[twobigLevel];
    const userWins = data.wins || 0;
    const needsWinForLevel3Twobig = twobigLevel === 2 && userWins < 1;
    let canUpgradeTwobig = nextTwobig && coins >= nextTwobig.cost && (data.level || 1) >= nextTwobig.charLevel && twobigLevel < ((data.level || 1) / 5) && !needsWinForLevel3Twobig;
    let twobigLimitReached = !nextTwobig || (data.level || 1) < nextTwobig.charLevel;
    let twobigMaxed = twobigLevel >= 5;
    let twobigCard = `
      <div class="shop-card">
        <div class="shop-title twobig">2big акции</div>
        <div class="shop-progress">Ур. <b>${twobigLevel}</b> / 5</div>
        <div class="shop-value">${twobig}</div>
        <div class="shop-next">+${nextTwobig ? nextTwobig.reward : '-'} за ${nextTwobig ? nextTwobig.cost : '-'} монет</div>
        <button class="shop-btn" id="upgrade-twobig-btn" ${canUpgradeTwobig ? '' : 'disabled'}>Прокачать</button>
        ${twobigMaxed ? '<div class="shop-hint" style="color:#d32f2f;">MAX</div>' : (twobigLimitReached ? '<div class="shop-hint">Увеличьте уровень персонажа</div>' : (needsWinForLevel3Twobig ? '<div class="shop-hint" style="color:#ff9800;">Требуется 1 победа для 3 уровня</div>' : ''))}
      </div>`;
    // --- OK4U ---
    const ok4uLevel = data.ok4uLevel || 0;
    const ok4u = data.ok4u || 0;
    let nextOk4u = ok4uUpgrades[ok4uLevel];
    const needsWinForLevel3Ok4u = ok4uLevel === 2 && userWins < 1;
    let canUpgradeOk4u = nextOk4u && coins >= nextOk4u.cost && (data.level || 1) >= nextOk4u.charLevel && ok4uLevel < ((data.level || 1) / 5) && !needsWinForLevel3Ok4u;
    let ok4uLimitReached = !nextOk4u || (data.level || 1) < nextOk4u.charLevel;
    let ok4uMaxed = ok4uLevel >= 5;
    let ok4uCard = `
      <div class="shop-card">
        <div class="shop-title ok4u">OK4U</div>
        <div class="shop-progress">Ур. <b>${ok4uLevel}</b> / 5</div>
        <div class="shop-value">${ok4u}</div>
        <div class="shop-next">+${nextOk4u ? nextOk4u.reward : '-'} за ${nextOk4u ? nextOk4u.cost : '-'} монет</div>
        <button class="shop-btn" id="upgrade-ok4u-btn" ${canUpgradeOk4u ? '' : 'disabled'}>Прокачать</button>
        ${ok4uMaxed ? '<div class="shop-hint" style="color:#1976d2;">MAX</div>' : (ok4uLimitReached ? '<div class="shop-hint">Увеличьте уровень персонажа</div>' : (needsWinForLevel3Ok4u ? '<div class="shop-hint" style="color:#ff9800;">Требуется 1 победа для 3 уровня</div>' : ''))}
      </div>`;
    // --- MYT4U ---
    const myt4uLevel = data.myt4uLevel || 0;
    const myt4u = data.myt4u || 0;
    let nextMyt4u = myt4uUpgrades[myt4uLevel];
    const needsWinForLevel3Myt4u = myt4uLevel === 2 && userWins < 1;
    let canUpgradeMyt4u = nextMyt4u && coins >= nextMyt4u.cost && (data.level || 1) >= nextMyt4u.charLevel && myt4uLevel < ((data.level || 1) / 5) && !needsWinForLevel3Myt4u;
    let myt4uLimitReached = !nextMyt4u || (data.level || 1) < nextMyt4u.charLevel;
    let myt4uMaxed = myt4uLevel >= 5;
    let myt4uCard = `
      <div class="shop-card">
        <div class="shop-title myt4u">MYT4U</div>
        <div class="shop-progress">Ур. <b>${myt4uLevel}</b> / 5</div>
        <div class="shop-value">${myt4u}</div>
        <div class="shop-next">+${nextMyt4u ? nextMyt4u.reward : '-'} за ${nextMyt4u ? nextMyt4u.cost : '-'} монет</div>
        <button class="shop-btn" id="upgrade-myt4u-btn" ${canUpgradeMyt4u ? '' : 'disabled'}>Прокачать</button>
        ${myt4uMaxed ? '<div class="shop-hint" style="color:#fbc02d;">MAX</div>' : (myt4uLimitReached ? '<div class="shop-hint">Увеличьте уровень персонажа</div>' : (needsWinForLevel3Myt4u ? '<div class="shop-hint" style="color:#ff9800;">Требуется 1 победа для 3 уровня</div>' : ''))}
      </div>`;
    // --- Проценты ---
    const percentsLevel = data.percentsLevel || 0;
    const percents = data.percents || '-';
    let nextPercents = percentsUpgrades[percentsLevel];
    const needsWinForLevel3Percents = percentsLevel === 2 && userWins < 1;
    let canUpgradePercents = nextPercents && coins >= nextPercents.cost && (data.level || 1) >= nextPercents.charLevel && percentsLevel < ((data.level || 1) / 5) && !needsWinForLevel3Percents;
    let percentsLimitReached = !nextPercents || (data.level || 1) < nextPercents.charLevel;
    let percentsMaxed = percentsLevel >= 5;
    let percentsCard = `
      <div class="shop-card">
        <div class="shop-title" style="color:#6a1b9a;">Проценты</div>
        <div class="shop-progress">Ур. <b>${percentsLevel}</b> / 5</div>
        <div class="shop-value">${percents}</div>
        <div class="shop-next">${nextPercents ? nextPercents.reward : '-'} за ${nextPercents ? nextPercents.cost : '-'} монет</div>
        <button class="shop-btn" id="upgrade-percents-btn" ${canUpgradePercents ? '' : 'disabled'}>Прокачать</button>
        ${percentsMaxed ? '<div class="shop-hint" style="color:#6a1b9a;">MAX</div>' : (percentsLimitReached ? '<div class="shop-hint">Увеличьте уровень персонажа</div>' : (needsWinForLevel3Percents ? '<div class="shop-hint" style="color:#ff9800;">Требуется 1 победа для 3 уровня</div>' : ''))}
      </div>`;
    // --- Уменьшение пассивов ---
    const passivesLevel = data.passivesLevel || 0;
    const passives = data.passives || '-';
    let nextPassives = passivesUpgrades[passivesLevel];
    const needsWinForLevel3Passives = passivesLevel === 2 && userWins < 1;
    let canUpgradePassives = nextPassives && coins >= nextPassives.cost && (data.level || 1) >= nextPassives.charLevel && passivesLevel < ((data.level || 1) / 5) && !needsWinForLevel3Passives;
    let passivesLimitReached = !nextPassives || (data.level || 1) < nextPassives.charLevel;
    let passivesMaxed = passivesLevel >= 5;
    let passivesCard = `
      <div class="shop-card">
        <div class="shop-title" style="color:#388e3c;">Уменьшение пассивов</div>
        <div class="shop-progress">Ур. <b>${passivesLevel}</b> / 5</div>
        <div class="shop-value">${passives}</div>
        <div class="shop-next">${nextPassives ? nextPassives.reward : '-'} за ${nextPassives ? nextPassives.cost : '-'} монет</div>
        <button class="shop-btn" id="upgrade-passives-btn" ${canUpgradePassives ? '' : 'disabled'}>Прокачать</button>
        ${passivesMaxed ? '<div class="shop-hint" style="color:#388e3c;">MAX</div>' : (passivesLimitReached ? '<div class="shop-hint">Увеличьте уровень персонажа</div>' : (needsWinForLevel3Passives ? '<div class="shop-hint" style="color:#ff9800;">Требуется 1 победа для 3 уровня</div>' : ''))}
      </div>`;
    // --- Недвижимость ---
    const realtyLevel = data.realtyLevel || 0;
    const realty = data.realty || '-';
    let nextRealty = realtyUpgrades[realtyLevel];
    const needsWinForLevel3Realty = realtyLevel === 2 && userWins < 1;
    let canUpgradeRealty = nextRealty && coins >= nextRealty.cost && (data.level || 1) >= nextRealty.charLevel && realtyLevel < ((data.level || 1) / 5) && !needsWinForLevel3Realty;
    let realtyLimitReached = !nextRealty || (data.level || 1) < nextRealty.charLevel;
    let realtyMaxed = realtyLevel >= 5;
    let realtyCard = `
      <div class="shop-card">
        <div class="shop-title" style="color:#ff9800;">Недвижимость</div>
        <div class="shop-progress">Ур. <b>${realtyLevel}</b> / 5</div>
        <div class="shop-value">${realty}</div>
        <div class="shop-next">${nextRealty ? nextRealty.reward : '-'} за ${nextRealty ? nextRealty.cost : '-'} монет</div>
        <button class="shop-btn" id="upgrade-realty-btn" ${canUpgradeRealty ? '' : 'disabled'}>Прокачать</button>
        ${realtyMaxed ? '<div class="shop-hint" style="color:#ff9800;">MAX</div>' : (realtyLimitReached ? '<div class="shop-hint">Увеличьте уровень персонажа</div>' : (needsWinForLevel3Realty ? '<div class="shop-hint" style="color:#ff9800;">Требуется 1 победа для 3 уровня</div>' : ''))}
      </div>`;
    shopItems.innerHTML = `<div class="shop-balance">Ваши монеты: <b>${coins}</b></div><div class="shop-cards">${savingsCard}${twobigCard}${ok4uCard}${myt4uCard}${percentsCard}${passivesCard}${realtyCard}</div>`;
    // --- обработчик savings ---
    if (nextUpgrade && canUpgrade) {
        document.getElementById('upgrade-savings-btn').onclick = async () => {
            const button = document.getElementById('upgrade-savings-btn');
            const freshDoc = await userRef.get();
            const freshData = freshDoc.data();
            const freshLevel = freshData.savingsLevel || 0;
            const freshCoins = freshData.coins || 0;
            const freshCharLevel = freshData.level || 1;
            if (freshLevel !== savingsLevel || freshCoins < nextUpgrade.cost || freshCharLevel < (freshLevel + 1)) {
                animatePurchase(button, false);
                setTimeout(() => renderShop(), 1000);
                return;
            }
            await userRef.update({
                coins: freshCoins - nextUpgrade.cost,
                savingsLevel: freshLevel + 1,
                savings: nextUpgrade.reward
            });
            animatePurchase(button, true);
            if (typeof showProfile === 'function') showProfile();
            setTimeout(() => renderShop(), 1500);
        };
    }
    // --- обработчик twobig ---
    if (nextTwobig && canUpgradeTwobig) {
        document.getElementById('upgrade-twobig-btn').onclick = async () => {
            const button = document.getElementById('upgrade-twobig-btn');
            const freshDoc = await userRef.get();
            const freshData = freshDoc.data();
            const freshTwobigLevel = freshData.twobigLevel || 0;
            const freshCoins = freshData.coins || 0;
            const freshCharLevel = freshData.level || 1;
            if (freshTwobigLevel !== twobigLevel || freshCoins < nextTwobig.cost || freshCharLevel < nextTwobig.charLevel) {
                animatePurchase(button, false);
                setTimeout(() => renderShop(), 1000);
                return;
            }
            await userRef.update({
                coins: freshCoins - nextTwobig.cost,
                twobigLevel: freshTwobigLevel + 1,
                twobig: nextTwobig.reward
            });
            animatePurchase(button, true);
            if (typeof showProfile === 'function') showProfile();
            setTimeout(() => renderShop(), 1500);
        };
    }
    // --- обработчик ok4u ---
    if (nextOk4u && canUpgradeOk4u) {
        document.getElementById('upgrade-ok4u-btn').onclick = async () => {
            const button = document.getElementById('upgrade-ok4u-btn');
            const freshDoc = await userRef.get();
            const freshData = freshDoc.data();
            const freshOk4uLevel = freshData.ok4uLevel || 0;
            const freshCoins = freshData.coins || 0;
            const freshCharLevel = freshData.level || 1;
            if (freshOk4uLevel !== ok4uLevel || freshCoins < nextOk4u.cost || freshCharLevel < nextOk4u.charLevel) {
                animatePurchase(button, false);
                setTimeout(() => renderShop(), 1000);
                return;
            }
            await userRef.update({
                coins: freshCoins - nextOk4u.cost,
                ok4uLevel: freshOk4uLevel + 1,
                ok4u: nextOk4u.reward
            });
            animatePurchase(button, true);
            if (typeof showProfile === 'function') showProfile();
            setTimeout(() => renderShop(), 1500);
        };
    }
    // --- обработчик myt4u ---
    if (nextMyt4u && canUpgradeMyt4u) {
        document.getElementById('upgrade-myt4u-btn').onclick = async () => {
            const button = document.getElementById('upgrade-myt4u-btn');
            const freshDoc = await userRef.get();
            const freshData = freshDoc.data();
            const freshMyt4uLevel = freshData.myt4uLevel || 0;
            const freshCoins = freshData.coins || 0;
            const freshCharLevel = freshData.level || 1;
            if (freshMyt4uLevel !== myt4uLevel || freshCoins < nextMyt4u.cost || freshCharLevel < nextMyt4u.charLevel) {
                animatePurchase(button, false);
                setTimeout(() => renderShop(), 1000);
                return;
            }
            await userRef.update({
                coins: freshCoins - nextMyt4u.cost,
                myt4uLevel: freshMyt4uLevel + 1,
                myt4u: nextMyt4u.reward
            });
            animatePurchase(button, true);
            if (typeof showProfile === 'function') showProfile();
            setTimeout(() => renderShop(), 1500);
        };
    }
    // --- обработчик percents ---
    if (nextPercents && canUpgradePercents) {
        document.getElementById('upgrade-percents-btn').onclick = async () => {
            const button = document.getElementById('upgrade-percents-btn');
            const freshDoc = await userRef.get();
            const freshData = freshDoc.data();
            const freshPercentsLevel = freshData.percentsLevel || 0;
            const freshCoins = freshData.coins || 0;
            const freshCharLevel = freshData.level || 1;
            if (freshPercentsLevel !== percentsLevel || freshCoins < nextPercents.cost || freshCharLevel < nextPercents.charLevel) {
                animatePurchase(button, false);
                setTimeout(() => renderShop(), 1000);
                return;
            }
            await userRef.update({
                coins: freshCoins - nextPercents.cost,
                percentsLevel: freshPercentsLevel + 1,
                percents: nextPercents.reward
            });
            animatePurchase(button, true);
            if (typeof showProfile === 'function') showProfile();
            setTimeout(() => renderShop(), 1500);
        };
    }
    // --- обработчик passives ---
    if (nextPassives && canUpgradePassives) {
        document.getElementById('upgrade-passives-btn').onclick = async () => {
            const button = document.getElementById('upgrade-passives-btn');
            const freshDoc = await userRef.get();
            const freshData = freshDoc.data();
            const freshPassivesLevel = freshData.passivesLevel || 0;
            const freshCoins = freshData.coins || 0;
            const freshCharLevel = freshData.level || 1;
            if (freshPassivesLevel !== passivesLevel || freshCoins < nextPassives.cost || freshCharLevel < nextPassives.charLevel) {
                animatePurchase(button, false);
                setTimeout(() => renderShop(), 1000);
                return;
            }
            await userRef.update({
                coins: freshCoins - nextPassives.cost,
                passivesLevel: freshPassivesLevel + 1,
                passives: nextPassives.reward
            });
            animatePurchase(button, true);
            if (typeof showProfile === 'function') showProfile();
            setTimeout(() => renderShop(), 1500);
        };
    }
    // --- обработчик realty ---
    if (nextRealty && canUpgradeRealty) {
        document.getElementById('upgrade-realty-btn').onclick = async () => {
            const button = document.getElementById('upgrade-realty-btn');
            const freshDoc = await userRef.get();
            const freshData = freshDoc.data();
            const freshRealtyLevel = freshData.realtyLevel || 0;
            const freshCoins = freshData.coins || 0;
            const freshCharLevel = freshData.level || 1;
            if (freshRealtyLevel !== realtyLevel || freshCoins < nextRealty.cost || freshCharLevel < nextRealty.charLevel) {
                animatePurchase(button, false);
                setTimeout(() => renderShop(), 1000);
                return;
            }
            await userRef.update({
                coins: freshCoins - nextRealty.cost,
                realtyLevel: freshRealtyLevel + 1,
                realty: nextRealty.reward
            });
            animatePurchase(button, true);
            if (typeof showProfile === 'function') showProfile();
            setTimeout(() => renderShop(), 1500);
        };
    }
}

// Функция для анимации покупки
function animatePurchase(button, success = true) {
    const originalText = button.innerHTML;
    const originalBackground = button.style.background;
    
    if (success) {
        button.innerHTML = '<span class="btn-icon">✅</span><span class="btn-text">Куплено!</span>';
        button.style.background = 'linear-gradient(135deg, #4caf50, #66bb6a)';
        button.style.transform = 'scale(1.05)';
        
        // Добавляем эффект частиц
        createParticleEffect(button);
        
        setTimeout(() => {
            button.innerHTML = originalText;
            button.style.background = originalBackground;
            button.style.transform = '';
        }, 1500);
    } else {
        button.innerHTML = '<span class="btn-icon">❌</span><span class="btn-text">Недостаточно монет!</span>';
        button.style.background = 'linear-gradient(135deg, #f44336, #e53935)';
        button.style.transform = 'scale(0.95)';
        
        setTimeout(() => {
            button.innerHTML = originalText;
            button.style.background = originalBackground;
            button.style.transform = '';
        }, 1000);
    }
}

// Функция для создания эффекта частиц
function createParticleEffect(element) {
    const rect = element.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    
    for (let i = 0; i < 8; i++) {
        const particle = document.createElement('div');
        particle.style.position = 'fixed';
        particle.style.left = centerX + 'px';
        particle.style.top = centerY + 'px';
        particle.style.width = '8px';
        particle.style.height = '8px';
        particle.style.background = '#4caf50';
        particle.style.borderRadius = '50%';
        particle.style.pointerEvents = 'none';
        particle.style.zIndex = '9999';
        particle.style.transition = 'all 0.6s ease-out';
        
        document.body.appendChild(particle);
        
        const angle = (i / 8) * Math.PI * 2;
        const distance = 50;
        const targetX = centerX + Math.cos(angle) * distance;
        const targetY = centerY + Math.sin(angle) * distance;
        
        setTimeout(() => {
            particle.style.left = targetX + 'px';
            particle.style.top = targetY + 'px';
            particle.style.opacity = '0';
            particle.style.transform = 'scale(0)';
        }, 50);
        
        setTimeout(() => {
            document.body.removeChild(particle);
        }, 650);
    }
}

if (shopBtn && shopModal && shopClose) {
    shopBtn.onclick = async () => {
        // Проверяем, заблокирована ли кнопка
        if (shopBtn.disabled || shopBtn.classList.contains('disabled')) {
            alert('Магазин доступен только с 5 уровня! Станьте Учеником, чтобы получить доступ к инвестициям.');
            return;
        }
        
        // Проверяем уровень пользователя
        const user = firebase.auth().currentUser;
        if (!user) {
            alert('Войдите в аккаунт, чтобы пользоваться магазином.');
            return;
        }
        
        const userRef = firebase.firestore().collection('users').doc(user.uid);
        const doc = await userRef.get();
        if (!doc.exists) {
            alert('Ошибка загрузки данных пользователя.');
            return;
        }
        
        const data = doc.data();
        const userLevel = data.level || 1;
        
        if (userLevel < 5) {
            alert('Магазин доступен только с 5 уровня! Станьте Учеником, чтобы получить доступ к инвестициям.');
            return;
        }
        
        shopModal.style.display = 'block';
        renderShop();
    };
    shopClose.onclick = () => {
        shopModal.style.display = 'none';
    };
    // Закрытие по клику вне окна
    window.onclick = (event) => {
        if (event.target === shopModal) {
            shopModal.style.display = 'none';
        }
    };
} 