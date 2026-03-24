const firebaseConfig = {
  apiKey: "AIzaSyBAq3RVzn-riWlpQEFLWJebPFqzSaoAtm8",
  authDomain: "gemini-3e76f.firebaseapp.com",
  projectId: "gemini-3e76f",
  storageBucket: "gemini-3e76f.appspot.com",
  messagingSenderId: "698666508962",
  appId: "1:698666508962:web:7f13c14e154819d6f6edfb"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

let currentUser = null;
const adminName = "admin";

// DOM элементы
const loginSection = document.getElementById('login-section');
const registerSection = document.getElementById('register-section');
const adminSection = document.getElementById('admin-section');
const adminMessage = document.getElementById('admin-message');
const profileCard = document.getElementById('profile-card');
const profileInfo = document.getElementById('profile-info');
const ratingTableBody = document.querySelector('#rating-table tbody');
const auth = firebase.auth();

// Unsubscribe функции для Firestore слушателей
let unsubPlayerRequests = null;
let unsubAdminRequests = null;

// ─── Утилиты ─────────────────────────────────────────────────────────────────

async function findUserByName(username) {
    const usersSnap = await db.collection('users').get();
    return usersSnap.docs.find(doc =>
        doc.data().name && doc.data().name.trim().toLowerCase() === username.trim().toLowerCase()
    ) || null;
}

// ─── Мотивирующие цитаты ──────────────────────────────────────────────────────

const QUOTES = [
    { text: "Правило №1: никогда не теряй деньги. Правило №2: не забывай правило №1.", author: "Уоррен Баффетт" },
    { text: "Инвестиции в знания приносят наибольший доход.", author: "Бенджамин Франклин" },
    { text: "Не деньги делают тебя богатым — знания делают.", author: "Роберт Кийосаки" },
    { text: "Дисциплина — это мост между целями и достижениями.", author: "Джим Рон" },
    { text: "Успех — это сумма небольших усилий, повторяемых день за днём.", author: "Роберт Коллиер" },
    { text: "Единственный способ делать великую работу — любить то, что делаешь.", author: "Стив Джобс" },
    { text: "Будущее принадлежит тем, кто верит в красоту своей мечты.", author: "Элеонора Рузвельт" },
    { text: "Никогда не трать то, что ещё не заработал.", author: "Томас Джефферсон" },
    { text: "Твой самый ценный актив — это ты сам. Инвестируй в себя.", author: "Пол Мейер" },
    { text: "Деньги не сделают тебя счастливым, но помогут быть несчастным в комфорте.", author: "Хелен Герли Браун" },
    { text: "Маленькие шаги каждый день — это и есть путь к великим целям.", author: "Конфуций" },
    { text: "Не бойся расти медленно. Бойся стоять на месте.", author: "Китайская мудрость" },
];

function showRandomQuote() {
    const el = document.getElementById('daily-quote');
    if (!el) return;
    const q = QUOTES[Math.floor(Math.random() * QUOTES.length)];
    el.innerHTML = `
        <div class="quote-card">
            <div class="quote-text">${q.text}</div>
            <div class="quote-author">— ${q.author}</div>
        </div>
    `;
}

// ─── KD детали ────────────────────────────────────────────────────────────────

function showKDDetails(wins, games) {
    const kd = games > 0 ? (wins / games).toFixed(2) : '0.00';
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    const popup = document.createElement('div');
    popup.className = 'info-popup';
    popup.innerHTML = `
        <div class="popup-title">🎯 Статистика KD</div>
        <div class="popup-row"><span>🏆 Побед:</span><strong>${wins}</strong></div>
        <div class="popup-row"><span>🎮 Игр:</span><strong>${games}</strong></div>
        <div class="popup-row"><span>🎯 KD:</span><strong class="highlight">${kd}</strong></div>
        <div class="popup-hint">Кликните для закрытия</div>
    `;
    const close = () => { overlay.remove(); popup.remove(); };
    overlay.onclick = close;
    popup.onclick = close;
    document.body.appendChild(overlay);
    document.body.appendChild(popup);
    setTimeout(close, 5000);
}

// ─── CF конвертация ───────────────────────────────────────────────────────────

function showCFConversion(cfAmount) {
    const sumAmount = (cfAmount * 1000).toLocaleString('ru-RU');
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    const popup = document.createElement('div');
    popup.className = 'info-popup cf-popup';
    popup.innerHTML = `
        <div class="popup-title">💰 Конвертация CF</div>
        <div class="popup-row"><span>CF:</span><strong>${cfAmount}</strong></div>
        <div class="popup-row"><span>Сум:</span><strong class="highlight">${sumAmount}</strong></div>
        <div class="popup-rate">Курс: 1 CF = 1000 сум</div>
        <div class="popup-hint">Кликните для закрытия</div>
    `;
    const close = () => { overlay.remove(); popup.remove(); };
    overlay.onclick = close;
    popup.onclick = close;
    document.body.appendChild(overlay);
    document.body.appendChild(popup);
    setTimeout(close, 5000);
}

// ─── Уровни ───────────────────────────────────────────────────────────────────

const levelThresholds = [
  0, 30, 76, 136, 210, 300, 406, 526, 660, 810, 976, 1156, 1350, 1560, 1786,
  2026, 2280, 2550, 2836, 3136, 3450, 3780, 4126, 4486, 4860
];

function getLevelByPoints(points) {
    for (let i = levelThresholds.length - 1; i >= 0; i--) {
        if (points >= levelThresholds[i]) return i + 1;
    }
    return 1;
}

function getLevelTitle(lvl) {
    if (lvl >= 1 && lvl <= 4) return 'Ребенок';
    if (lvl >= 5 && lvl <= 9) return 'Ученик';
    if (lvl >= 10 && lvl <= 14) return 'Начинающий инвестор';
    if (lvl >= 15 && lvl <= 19) return 'Опытный инвестор';
    if (lvl >= 20 && lvl <= 24) return 'Финансовый магнат';
    if (lvl === 25) return 'Финансовая свобода';
    return 'Неизвестно';
}

function getLevelEmoji(lvl) {
    if (lvl >= 1 && lvl <= 4) return '👶';
    if (lvl >= 5 && lvl <= 9) return '👨‍🎓';
    if (lvl >= 10 && lvl <= 14) return '💼';
    if (lvl >= 15 && lvl <= 19) return '🏢';
    if (lvl >= 20 && lvl <= 24) return '👑';
    if (lvl === 25) return '🌟';
    return '❓';
}

function getLevelDescription(lvl) {
    if (lvl >= 1 && lvl <= 4) return 'Только начинаешь изучать деньги';
    if (lvl >= 5 && lvl <= 9) return 'Изучаешь основы инвестиций';
    if (lvl >= 10 && lvl <= 14) return 'Делаешь первые инвестиции';
    if (lvl >= 15 && lvl <= 19) return 'Строишь инвестиционный портфель';
    if (lvl >= 20 && lvl <= 24) return 'Создаешь финансовую империю';
    if (lvl === 25) return 'Достиг финансовой независимости';
    return 'Неизвестно';
}

function getLevelColor(lvl) {
    if (lvl >= 1 && lvl <= 4) return '#5c9bd6';
    if (lvl >= 5 && lvl <= 9) return '#4caf7a';
    if (lvl >= 10 && lvl <= 14) return '#e07070';
    if (lvl >= 15 && lvl <= 19) return '#c9a227';
    if (lvl >= 20 && lvl <= 24) return '#5b8dd9';
    if (lvl === 25) return '#9c5fd6';
    return '#888';
}

// ─── Прогресс уровня ──────────────────────────────────────────────────────────

function showAdulthoodProgress() {
    if (!currentUser) return;
    db.collection('users').doc(currentUser).get().then(doc => {
        if (!doc.exists) return;
        const data = doc.data();
        const lvl = Math.max(1, Math.min(getLevelByPoints(data.points), 25));
        const nextLvl = Math.min(lvl + 1, 25);
        const progress = lvl < 25
            ? ((data.points - levelThresholds[lvl - 1]) / (levelThresholds[lvl] - levelThresholds[lvl - 1])) * 100
            : 100;

        const html = `
            <div class="adulthood-progress">
                <h3>🎯 Путь к взрослости</h3>
                <div class="current-stage">
                    <div class="stage-emoji">${getLevelEmoji(lvl)}</div>
                    <div class="stage-info">
                        <div class="stage-title">${getLevelTitle(lvl)} ${lvl}</div>
                        <div class="stage-description">${getLevelDescription(lvl)}</div>
                    </div>
                </div>
                <div class="progress-bar">
                    <div class="progress-fill" style="width:${progress}%; background:${getLevelColor(lvl)};"></div>
                </div>
                <div class="next-stage">
                    <span>Следующий: ${getLevelTitle(nextLvl)} ${nextLvl}</span>
                    <span>${Math.round(progress)}%</span>
                </div>
            </div>
        `;

        const card = document.getElementById('profile-card');
        if (!card) return;
        const existing = card.querySelector('.adulthood-progress');
        if (existing) existing.remove();
        card.insertAdjacentHTML('afterbegin', html);
    });
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

auth.onAuthStateChanged(async (user) => {
    // Отписываемся от старых слушателей
    if (unsubPlayerRequests) { unsubPlayerRequests(); unsubPlayerRequests = null; }
    if (unsubAdminRequests) { unsubAdminRequests(); unsubAdminRequests = null; }

    if (user) {
        currentUser = user.uid;
        loginSection.style.display = 'none';
        registerSection.style.display = 'none';
        profileCard.style.display = '';
        await showProfile();
        await showRating();
        showRandomQuote();

        const doc = await db.collection('users').doc(currentUser).get();
        if (!doc.exists) { await auth.signOut(); return; }
        const isAdmin = doc.data().isAdmin === true;

        if (isAdmin) {
            adminSection.style.display = '';
            loadUsersList();
            updateTransactionsLists();
            setupAdminRequestsListener();
        } else {
            adminSection.style.display = 'none';
            loadPlayerHistory(currentUser);
        }
        setupPlayerRequestListener();
    } else {
        currentUser = null;
        loginSection.style.display = '';
        registerSection.style.display = 'none';
        profileCard.style.display = 'none';
        adminSection.style.display = 'none';
    }
});

// ─── Переключение форм ────────────────────────────────────────────────────────

document.getElementById('show-register').onclick = (e) => {
    e.preventDefault();
    loginSection.style.display = 'none';
    registerSection.style.display = '';
};
document.getElementById('show-login').onclick = (e) => {
    e.preventDefault();
    registerSection.style.display = 'none';
    loginSection.style.display = '';
};

// ─── Утилита: телефон → внутренний email ──────────────────────────────────────

function phoneToEmail(phone) {
    return phone.replace(/\D/g, '') + '@bmk.local';
}

// ─── Регистрация ──────────────────────────────────────────────────────────────

document.getElementById('register-form').onsubmit = async (e) => {
    e.preventDefault();
    const submitBtn = e.target.querySelector('button[type="submit"]');
    submitBtn.disabled = true;

    const fullname = document.getElementById('register-fullname').value.trim();
    const phone    = document.getElementById('register-phone').value.trim();
    const password = document.getElementById('register-password').value;
    const passwordConfirm = document.getElementById('register-password-confirm').value;

    if (!fullname) { alert('Введите имя и фамилию!'); submitBtn.disabled = false; return; }
    if (!phone)    { alert('Введите номер телефона!'); submitBtn.disabled = false; return; }
    if (password !== passwordConfirm) { alert('Пароли не совпадают!'); submitBtn.disabled = false; return; }

    const phoneKey = phone.replace(/\D/g, '');

    // Проверяем уникальность телефона
    const phoneDoc = await db.collection('usernames').doc(phoneKey).get();
    if (phoneDoc.exists) { alert('Этот номер телефона уже зарегистрирован!'); submitBtn.disabled = false; return; }

    try {
        const fakeEmail = phoneToEmail(phone);
        const cred = await auth.createUserWithEmailAndPassword(fakeEmail, password);
        await new Promise(resolve => {
            const unsub = auth.onAuthStateChanged(u => { if (u) { unsub(); resolve(); } });
        });
        const uid = auth.currentUser.uid;
        await db.collection('usernames').doc(phoneKey).set({ uid });
        await db.collection('users').doc(uid).set({
            name: fullname, phone: phoneKey, level: 1, experience: 0,
            points: 0, coins: 0, cf: 0, wins: 0, games: 0
        });
        currentUser = uid;
        registerSection.style.display = 'none';
        profileCard.style.display = '';
        showProfile();
        showRating();
        showRandomQuote();

        // isAdmin выставляется вручную в Firebase Console
    } catch (err) {
        alert('Ошибка регистрации: ' + err.message);
    }
    submitBtn.disabled = false;
};

// ─── Вход ─────────────────────────────────────────────────────────────────────

document.getElementById('login-form').onsubmit = async (e) => {
    e.preventDefault();
    const phone    = document.getElementById('login-phone').value.trim();
    const password = document.getElementById('login-password').value;
    try {
        const fakeEmail = phoneToEmail(phone);
        const cred = await auth.signInWithEmailAndPassword(fakeEmail, password);
        currentUser = cred.user.uid;
    } catch (err) {
        alert('Неверный номер телефона или пароль');
    }
};

// ─── Выход ────────────────────────────────────────────────────────────────────

document.getElementById('logout-btn').onclick = async () => {
    await auth.signOut();
};

// ─── Удаление аккаунта ────────────────────────────────────────────────────────

document.getElementById('delete-account-btn').onclick = () => {
    document.getElementById('delete-account-password').value = '';
    document.getElementById('delete-account-msg').textContent = '';
    document.getElementById('delete-account-modal').style.display = 'flex';
};

document.getElementById('delete-account-close').onclick = () => {
    document.getElementById('delete-account-modal').style.display = 'none';
};

document.getElementById('delete-account-confirm').onclick = async () => {
    const password = document.getElementById('delete-account-password').value.trim();
    const msgEl = document.getElementById('delete-account-msg');
    if (!password) { msgEl.textContent = 'Введи пароль'; msgEl.style.color = '#e74c3c'; return; }

    const user = auth.currentUser;
    if (!user) return;

    try {
        // Повторная аутентификация (Firebase требует перед удалением)
        const credential = firebase.auth.EmailAuthProvider.credential(user.email, password);
        await user.reauthenticateWithCredential(credential);

        // Удаляем данные из Firestore
        const userDoc = await db.collection('users').doc(user.uid).get();
        if (userDoc.exists) {
            const phone = userDoc.data().phone;
            // Удаляем запись в usernames
            if (phone) {
                const unameSnap = await db.collection('usernames').where('phone', '==', phone).get();
                const batch = db.batch();
                unameSnap.docs.forEach(d => batch.delete(d.ref));
                batch.delete(db.collection('users').doc(user.uid));
                await batch.commit();
            } else {
                await db.collection('users').doc(user.uid).delete();
            }
        }

        // Удаляем Firebase Auth аккаунт
        await user.delete();

        // Выходим — onAuthStateChanged сам переключит на экран входа
    } catch (e) {
        if (e.code === 'auth/wrong-password' || e.code === 'auth/invalid-credential') {
            msgEl.textContent = '❌ Неверный пароль';
        } else {
            msgEl.textContent = '❌ Ошибка: ' + e.message;
        }
        msgEl.style.color = '#e74c3c';
    }
};

// ─── Профиль ──────────────────────────────────────────────────────────────────

async function showProfile() {
    if (!currentUser) return;
    const doc = await db.collection('users').doc(currentUser).get();
    if (!doc.exists) return;
    const data = doc.data();
    const lvl = Math.max(1, Math.min(getLevelByPoints(data.points), 25));
    const lvlTitle = getLevelTitle(lvl);
    const lvlColor = getLevelColor(lvl);
    const totalCF = data.cf ?? 0;

    showAdulthoodProgress();

    profileInfo.innerHTML = `
    <div class="profile-stats">
      <span class="profile-badge points">⭐ ${data.points}</span>
      <span class="profile-badge coins">💰 ${data.coins ?? 0}</span>
      <span class="profile-badge kd"
            onclick="showKDDetails(${data.wins ?? 0}, ${data.games ?? 0})"
            style="cursor:pointer" title="Нажмите для подробностей">
        🎯 ${data.games > 0 ? (data.wins / data.games).toFixed(2) : '0.00'}
      </span>
      <span class="profile-badge cf"
            onclick="showCFConversion(${totalCF})"
            style="cursor:pointer" title="Нажмите для конвертации">
        <img src="logo2.jpg" class="cf-logo-icon" alt="CF"> ${totalCF.toFixed(2)}
      </span>
    </div>
    `;

    const profileHeader = document.getElementById('profile-header');
    if (profileHeader) {
        profileHeader.innerHTML = `
            <span>${getLevelEmoji(lvl)}</span>
            <b>${data.name}</b>
            <span class="level-tag" style="background:${lvlColor};">${lvlTitle} ${lvl}</span>
        `;
    }

    // Топ-5
    const top5Snap = await db.collection('users').orderBy('points', 'desc').limit(5).get();
    let top5Html = `<div class="top5-title">🏆 Топ-5 игроков</div>
        <table class="top5-table"><thead><tr>
            <th>🏅</th><th>👤</th><th>Уровень</th><th>⭐</th><th>KD</th>
        </tr></thead><tbody>`;
    let place = 1;
    top5Snap.forEach(doc => {
        const d = doc.data();
        if (!d.name || d.name.trim() === '' || d.isAdmin) return;
        const l = Math.max(1, Math.min(getLevelByPoints(d.points), 25));
        const kd = d.games > 0 ? (d.wins / d.games).toFixed(2) : '0.00';
        top5Html += `<tr>
            <td><b>${place}</b></td>
            <td>${d.name}</td>
            <td><span class="level-badge" style="background:${getLevelColor(l)};">${getLevelTitle(l)} ${l}</span></td>
            <td>${d.points}</td>
            <td onclick="showKDDetails(${d.wins ?? 0}, ${d.games ?? 0})" style="cursor:pointer">${kd}</td>
        </tr>`;
        place++;
    });
    top5Html += '</tbody></table>';
    document.getElementById('top5-container').innerHTML = top5Html;

    updateShopButton(lvl);
}

function updateShopButton(lvl) {
    const shopBtn = document.getElementById('shop-btn');
    if (!shopBtn) return;
    if (lvl < 5) {
        shopBtn.innerHTML = '🔒 Магазин (5 уровень)';
        shopBtn.disabled = true;
        shopBtn.style.background = 'linear-gradient(135deg, #ccc, #999)';
        shopBtn.style.opacity = '0.7';
        shopBtn.style.cursor = 'not-allowed';
    } else {
        shopBtn.innerHTML = '🛒 Магазин';
        shopBtn.disabled = false;
        shopBtn.style.background = 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)';
        shopBtn.style.opacity = '1';
        shopBtn.style.cursor = 'pointer';
    }
}

// ─── Рейтинг ──────────────────────────────────────────────────────────────────

async function showRating() {
    const usersSnap = await db.collection('users').orderBy('points', 'desc').get();
    ratingTableBody.innerHTML = '';
    let place = 1;
    usersSnap.forEach(doc => {
        const data = doc.data();
        if (!data.name || data.name.trim() === '' || data.isAdmin) return;
        const lvl = Math.max(1, Math.min(getLevelByPoints(data.points), 25));
        const kd = data.games > 0 ? (data.wins / data.games).toFixed(2) : '0.00';
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${place++}</td>
            <td>${data.name}</td>
            <td><span class="level-badge" style="background:${getLevelColor(lvl)};">${lvl}</span></td>
            <td>${data.points}</td>
            <td>${data.coins ?? 0}</td>
            <td>${(data.cf ?? 0).toFixed(2)}</td>
            <td onclick="showKDDetails(${data.wins ?? 0}, ${data.games ?? 0})" style="cursor:pointer">${kd}</td>
        `;
        ratingTableBody.appendChild(tr);
    });
}

// ─── Обмен CF ─────────────────────────────────────────────────────────────────

const CF_TO_POINTS = 2;
const CF_TO_COINS  = 2;

const exchangeModal = document.getElementById('exchange-modal');

document.getElementById('show-exchange-btn').onclick = async () => {
    document.getElementById('exchange-cf-amount').value = '';
    document.getElementById('exchange-preview').textContent = '';
    document.getElementById('exchange-msg').textContent = '';
    const doc = await db.collection('users').doc(currentUser).get();
    const cf = (doc.data().cf || 0).toFixed(2);
    document.getElementById('exchange-cf-balance').textContent = `Ваш баланс: ${cf} CF`;
    exchangeModal.style.display = 'flex';
};

document.getElementById('exchange-close').onclick = () => {
    exchangeModal.style.display = 'none';
};
exchangeModal.onclick = (e) => {
    if (e.target === exchangeModal) exchangeModal.style.display = 'none';
};

document.getElementById('exchange-cf-amount').oninput = () => {
    const amt = parseInt(document.getElementById('exchange-cf-amount').value) || 0;
    const preview = document.getElementById('exchange-preview');
    if (amt <= 0) { preview.textContent = ''; preview.className = 'exchange-preview'; return; }
    preview.textContent = `${amt} CF → ${amt * CF_TO_POINTS} ⭐ опыта + ${amt * CF_TO_COINS} 💰 монет`;
    preview.className = 'exchange-preview active';
};

document.getElementById('exchange-form').onsubmit = async (e) => {
    e.preventDefault();
    const msg = document.getElementById('exchange-msg');
    const amt = parseInt(document.getElementById('exchange-cf-amount').value) || 0;

    if (amt <= 0) {
        msg.textContent = 'Введите количество CF!';
        msg.className = 'transfer-message error';
        return;
    }

    msg.textContent = 'Обмен...';
    msg.className = 'transfer-message';

    try {
        const userRef = db.collection('users').doc(currentUser);
        const userDoc = await userRef.get();
        const data    = userDoc.data();
        const currentCF = data.cf || 0;

        if (currentCF < amt) {
            msg.textContent = `Недостаточно CF! У вас ${currentCF.toFixed(2)} CF`;
            msg.className = 'transfer-message error';
            return;
        }

        const newPoints = (data.points || 0) + amt * CF_TO_POINTS;
        const newCoins  = (data.coins  || 0) + amt * CF_TO_COINS;
        const newCF     = currentCF - amt;
        const newLevel  = getLevelByPoints(newPoints);

        await userRef.update({ cf: newCF, points: newPoints, coins: newCoins, level: newLevel });

        const userSnap = await userRef.get();
        const username = userSnap.data().name || '';
        await addTransactionRecord(
            username,
            amt,
            'exchange',
            `Обмен ${amt} CF → ${amt * CF_TO_POINTS} ⭐ опыта + ${amt * CF_TO_COINS} 💰 монет`,
            currentUser
        );

        msg.textContent = `Получено ${amt * CF_TO_POINTS} ⭐ опыта и ${amt * CF_TO_COINS} 💰 монет!`;
        msg.className = 'transfer-message success';
        document.getElementById('exchange-cf-amount').value = '';
        document.getElementById('exchange-preview').textContent = '';
        document.getElementById('exchange-cf-balance').textContent = `Ваш баланс: ${newCF.toFixed(2)} CF`;

        showProfile();
        showRating();

        setTimeout(() => {
            exchangeModal.style.display = 'none';
            msg.textContent = '';
        }, 2500);
    } catch (err) {
        msg.textContent = 'Ошибка: ' + err.message;
        msg.className = 'transfer-message error';
    }
};

// ─── Модалы ───────────────────────────────────────────────────────────────────

const ratingModal = document.getElementById('rating-modal');
document.getElementById('toggle-rating-btn').onclick = () => {
    ratingModal.style.display = 'flex';
    showRating();
};
document.getElementById('rating-close').onclick = () => { ratingModal.style.display = 'none'; };
ratingModal.onclick = (e) => { if (e.target === ratingModal) ratingModal.style.display = 'none'; };

const scoreRequestModal = document.getElementById('score-request-modal');
document.getElementById('submit-score-btn').onclick = () => {
    scoreRequestModal.style.display = 'flex';
};
document.getElementById('score-request-close').onclick = () => {
    scoreRequestModal.style.display = 'none';
};
scoreRequestModal.onclick = (e) => {
    if (e.target === scoreRequestModal) scoreRequestModal.style.display = 'none';
};

// ─── Подача счёта игроком ─────────────────────────────────────────────────────

document.getElementById('score-request-form').onsubmit = async (e) => {
    e.preventDefault();
    const msg = document.getElementById('score-request-msg');
    const games  = parseInt(document.getElementById('req-games').value)  || 0;
    const wins   = parseInt(document.getElementById('req-wins').value)   || 0;
    const cf     = parseInt(document.getElementById('req-cf').value)     || 0;
    const points  = parseInt(document.getElementById('req-points').value)  || 0;
    const coins   = parseInt(document.getElementById('req-coins').value)   || 0;
    const comment = document.getElementById('req-comment').value.trim();

    if (!games && !wins && !cf && !points && !coins) {
        msg.textContent = 'Заполните хотя бы одно поле!';
        msg.className = 'transfer-message error';
        return;
    }

    msg.textContent = 'Отправка...';
    msg.className = 'transfer-message';

    try {
        // Проверяем нет ли уже pending счёта
        const existing = await db.collection('score_requests')
            .where('userId', '==', currentUser)
            .where('status', '==', 'pending')
            .get();

        if (!existing.empty) {
            msg.textContent = 'У вас уже есть счёт на рассмотрении!';
            msg.className = 'transfer-message error';
            return;
        }

        const userDoc = await db.collection('users').doc(currentUser).get();
        const username = userDoc.data().name;

        await db.collection('score_requests').add({
            userId: currentUser,
            username,
            games, wins, cf, points, coins,
            comment: comment || '',
            status: 'pending',
            createdAt: new Date()
        });

        msg.textContent = 'Счёт отправлен! Ожидайте подтверждения.';
        msg.className = 'transfer-message success';
        e.target.reset();
        setTimeout(() => {
            scoreRequestModal.style.display = 'none';
            msg.textContent = '';
        }, 2000);
    } catch (err) {
        msg.textContent = 'Ошибка: ' + err.message;
        msg.className = 'transfer-message error';
    }
};

// ─── Real-time: статус счёта для игрока ──────────────────────────────────────

function setupPlayerRequestListener() {
    if (!currentUser) return;
    unsubPlayerRequests = db.collection('score_requests')
        .where('userId', '==', currentUser)
        .onSnapshot(snapshot => {
            const statusDiv = document.getElementById('score-request-status');
            const submitBtn = document.getElementById('submit-score-btn');
            if (!statusDiv) return;

            // Ищем pending или последний rejected
            const docs = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
            const pending = docs.find(r => r.status === 'pending');
            const rejected = docs
                .filter(r => r.status === 'rejected')
                .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0))[0];

            if (pending) {
                statusDiv.style.display = '';
                statusDiv.innerHTML = `
                    <div class="status-badge pending">⏳ Счёт на проверке у администратора</div>
                    <button class="cancel-request-btn" id="cancel-request-btn">✖ Отменить счёт</button>
                `;
                if (submitBtn) submitBtn.disabled = true;

                document.getElementById('cancel-request-btn').onclick = async () => {
                    if (!confirm('Отменить выставленный счёт?')) return;
                    await db.collection('score_requests').doc(pending.id).delete();
                };
            } else if (rejected) {
                statusDiv.style.display = '';
                statusDiv.innerHTML = `<div class="status-badge rejected">❌ Счёт отклонён — подай исправленный</div>`;
                if (submitBtn) submitBtn.disabled = false;
            } else {
                statusDiv.style.display = 'none';
                if (submitBtn) submitBtn.disabled = false;
            }
        });
}

// ─── Real-time: очередь счетов для администратора ─────────────────────────────

function setupAdminRequestsListener() {
    unsubAdminRequests = db.collection('score_requests')
        .where('status', '==', 'pending')
        .onSnapshot(snapshot => {
            const listDiv = document.getElementById('score-requests-list');
            if (!listDiv) return;

            if (snapshot.empty) {
                listDiv.innerHTML = '<p class="empty-hint">Нет входящих счетов</p>';
                return;
            }

            // Сортируем по дате
            const docs = snapshot.docs.sort((a, b) => {
                const ta = a.data().createdAt?.seconds || 0;
                const tb = b.data().createdAt?.seconds || 0;
                return ta - tb;
            });

            listDiv.innerHTML = '';
            docs.forEach(doc => {
                const req = doc.data();
                const dateStr = req.createdAt ? req.createdAt.toDate().toLocaleString('ru-RU', {
                    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'
                }) : '';

                const fields = [];
                if (req.games)  fields.push(`🎮 ${req.games} игр`);
                if (req.wins)   fields.push(`🏆 ${req.wins} побед`);
                if (req.cf)     fields.push(`💎 ${req.cf} CF`);
                if (req.points) fields.push(`⭐ ${req.points} опыта`);
                if (req.coins)  fields.push(`💰 ${req.coins} монет`);

                const card = document.createElement('div');
                card.className = 'request-card';
                card.innerHTML = `
                    <div class="request-header">
                        <span class="request-username">${req.username}</span>
                        <span class="request-time">${dateStr}</span>
                    </div>
                    <div class="request-fields">${fields.map(f => `<span class="req-field">${f}</span>`).join('')}</div>
                    ${req.comment ? `<div class="request-comment">💬 ${req.comment}</div>` : ''}
                    <div class="request-actions">
                        <button class="approve-btn" onclick="approveRequest('${doc.id}')">✅ Принять</button>
                        <button class="reject-btn" onclick="rejectRequest('${doc.id}')">❌ Отклонить</button>
                    </div>
                `;
                listDiv.appendChild(card);
            });
        });
}

// Глобальные обёртки для onclick в HTML
window.approveRequest = (id) => window.approveScoreRequest && window.approveScoreRequest(id);
window.rejectRequest  = (id) => window.rejectScoreRequest  && window.rejectScoreRequest(id);

// ─── Список пользователей для datalist ───────────────────────────────────────

async function loadUsersList() {
    const usersSnap = await db.collection('users').get();
    const usersList = document.getElementById('users-list');
    if (!usersList) return;
    usersList.innerHTML = '';
    usersSnap.forEach(doc => {
        const name = doc.data().name;
        if (name && name.trim()) {
            const opt = document.createElement('option');
            opt.value = name;
            usersList.appendChild(opt);
        }
    });
}

function updateUsersList() {
    if (adminSection && adminSection.style.display !== 'none') loadUsersList();
}

// ─── Рендер транзакции ────────────────────────────────────────────────────────

function renderTransactionItem(t) {
    const date = t.timestamp
        ? t.timestamp.toDate().toLocaleString('ru-RU')
        : 'Неизвестно';
    const typeMap = {
        add:      { cls: 'tx-add',      icon: '+', label: `${t.amount} CF` },
        withdraw: { cls: 'tx-remove',   icon: '-', label: `${t.amount} CF` },
        approve:  { cls: 'tx-approve',  icon: '✅', label: 'Счёт одобрен' },
        reject:   { cls: 'tx-reject',   icon: '❌', label: 'Счёт отклонён' },
        exchange: { cls: 'tx-exchange', icon: '🔄', label: `${t.amount} CF` },
    };
    const m = typeMap[t.type] || { cls: 'tx-add', icon: '', label: t.amount };
    return `
        <div class="transaction-item ${m.cls}">
            <div class="transaction-header">
                <span class="transaction-user">${t.username || ''}</span>
                <span class="transaction-amount">${m.icon} ${m.label}</span>
            </div>
            <div class="transaction-description">${t.reason || ''}</div>
            <div class="transaction-date">${date}</div>
        </div>
    `;
}

async function loadPlayerHistory(userId) {
    const listEl = document.getElementById('player-history-list');
    if (!listEl) return;
    try {
        const snap = await db.collection('transactions')
            .where('userId', '==', userId)
            .orderBy('timestamp', 'desc')
            .limit(20).get();
        if (snap.empty) {
            listEl.innerHTML = '<p class="empty-hint">История пуста</p>';
            return;
        }
        listEl.innerHTML = '';
        snap.forEach(doc => { listEl.innerHTML += renderTransactionItem(doc.data()); });
    } catch (err) {
        console.error('Ошибка загрузки истории игрока:', err);
    }
}

// ─── Транзакции CF ────────────────────────────────────────────────────────────

const adminTransactionUser   = document.getElementById('admin-transaction-user');
const adminTransactionAmount = document.getElementById('admin-transaction-amount');
const adminTransactionReason = document.getElementById('admin-transaction-reason');
const adminAddCFBtn          = document.getElementById('admin-add-cf');
const adminWithdrawCFBtn     = document.getElementById('admin-withdraw-cf');
const clearTransactionsBtn   = document.getElementById('clear-transactions-btn');
const transactionsHistory    = document.getElementById('transactions-history');

async function loadTransactionsHistory() {
    if (!transactionsHistory) return;
    try {
        const snap = await db.collection('transactions')
            .orderBy('timestamp', 'desc').limit(20).get();

        if (snap.empty) {
            transactionsHistory.innerHTML = '<p class="empty-hint">История пуста</p>';
            return;
        }

        transactionsHistory.innerHTML = '';
        snap.forEach(doc => {
            transactionsHistory.innerHTML += renderTransactionItem(doc.data());
        });
    } catch (err) {
        console.error('Ошибка загрузки истории:', err);
    }
}

function updateTransactionsLists() {
    if (adminSection && adminSection.style.display !== 'none') loadTransactionsHistory();
}

if (adminAddCFBtn) {
    adminAddCFBtn.onclick = async () => {
        const user   = adminTransactionUser.value.trim();
        const amount = parseInt(adminTransactionAmount.value, 10);
        const reason = adminTransactionReason.value.trim();
        if (!user || isNaN(amount) || amount <= 0) { alert('Заполните все поля!'); return; }
        await window.adminAddCF(user, amount, reason);
        loadTransactionsHistory();
    };
}

if (adminWithdrawCFBtn) {
    adminWithdrawCFBtn.onclick = async () => {
        const user   = adminTransactionUser.value.trim();
        const amount = parseInt(adminTransactionAmount.value, 10);
        const reason = adminTransactionReason.value.trim();
        if (!user || isNaN(amount) || amount <= 0) { alert('Заполните все поля!'); return; }
        await window.adminWithdrawCF(user, amount, reason);
        loadTransactionsHistory();
    };
}

if (clearTransactionsBtn) {
    clearTransactionsBtn.onclick = async () => {
        if (!confirm('Очистить всю историю транзакций?')) return;
        try {
            const snap = await db.collection('transactions').get();
            if (snap.empty) { adminMessage.textContent = 'История уже пуста!'; return; }
            const batch = db.batch();
            snap.forEach(doc => batch.delete(doc.ref));
            await batch.commit();
            adminMessage.textContent = `Удалено ${snap.size} транзакций!`;
            loadTransactionsHistory();
        } catch (err) {
            alert('Ошибка: ' + err.message);
        }
    };
}

// ─── Сброс данных ─────────────────────────────────────────────────────────────

const adminUserInput = document.getElementById('admin-user');

document.getElementById('admin-reset-user').onclick = async () => {
    const user = adminUserInput.value.trim();
    if (!user) return;
    if (!confirm(`Обнулить данные пользователя ${user}?`)) return;
    const userDoc = await findUserByName(user);
    if (userDoc) {
        await userDoc.ref.update({
            points: 0, coins: 0, level: 1,
            wins: 0, games: 0,
            savingsLevel: 0, savings: 0,
            twobigLevel: 0, twobig: 0,
            ok4uLevel: 0, ok4u: 0,
            myt4uLevel: 0, myt4u: 0,
            percentsLevel: 0, percents: '-',
            passivesLevel: 0, passives: '-',
            realtyLevel: 0, realty: '-'
        });
        adminMessage.textContent = `Данные ${user} обнулены!`;
        updateUsersList();
        showProfile();
        showRating();
        if (typeof renderShop === 'function') renderShop();
    } else {
        adminMessage.textContent = `Пользователь ${user} не найден.`;
    }
};

document.getElementById('admin-reset-all').onclick = async () => {
    if (!confirm('Обнулить данные всех участников?')) return;
    const usersSnap = await db.collection('users').get();
    const batch = db.batch();
    usersSnap.forEach(doc => {
        batch.update(doc.ref, {
            points: 0, coins: 0, level: 1,
            wins: 0, games: 0,
            savingsLevel: 0, savings: 0,
            twobigLevel: 0, twobig: 0,
            ok4uLevel: 0, ok4u: 0,
            myt4uLevel: 0, myt4u: 0,
            percentsLevel: 0, percents: '-',
            passivesLevel: 0, passives: '-',
            realtyLevel: 0, realty: '-'
        });
    });
    await batch.commit();
    adminMessage.textContent = 'Все участники обнулены!';
    updateUsersList();
    showRating();
    showProfile();
    if (typeof renderShop === 'function') renderShop();
};

document.getElementById('admin-reset-all-wins').onclick = async () => {
    if (!confirm('Сбросить победы у всех участников?')) return;
    const usersSnap = await db.collection('users').get();
    const batch = db.batch();
    usersSnap.forEach(doc => batch.update(doc.ref, { wins: 0 }));
    await batch.commit();
    adminMessage.textContent = 'Победы у всех сброшены!';
    showRating(); showProfile();
};

document.getElementById('admin-reset-all-games').onclick = async () => {
    if (!confirm('Сбросить игры у всех участников?')) return;
    const usersSnap = await db.collection('users').get();
    const batch = db.batch();
    usersSnap.forEach(doc => batch.update(doc.ref, { games: 0 }));
    await batch.commit();
    adminMessage.textContent = 'Игры у всех сброшены!';
    showRating(); showProfile();
};

// ─── Полный сброс (новый сезон) ───────────────────────────────────────────────

document.getElementById('admin-nuclear-reset').onclick = async () => {
    const confirmed = confirm(
        '☢️ ПОЛНЫЙ СБРОС\n\n' +
        'Будут удалены:\n' +
        '• Все игроки из базы данных\n' +
        '• Все счёта и заявки\n' +
        '• История транзакций\n\n' +
        'Игроки смогут зарегистрироваться заново.\n\n' +
        'Введите "НОВЫЙ СЕЗОН" для подтверждения:'
    );
    if (!confirmed) return;
    const code = prompt('Введите: НОВЫЙ СЕЗОН');
    if (code !== 'НОВЫЙ СЕЗОН') { alert('Отменено — текст не совпал.'); return; }

    try {
        adminMessage.textContent = 'Удаление данных...';
        const batch1 = db.batch();
        const batch2 = db.batch();
        const batch3 = db.batch();

        const [usersSnap, usernamesSnap, requestsSnap, txSnap] = await Promise.all([
            db.collection('users').get(),
            db.collection('usernames').get(),
            db.collection('score_requests').get(),
            db.collection('transactions').get(),
        ]);

        usersSnap.forEach(d => batch1.delete(d.ref));
        usernamesSnap.forEach(d => batch1.delete(d.ref));
        requestsSnap.forEach(d => batch2.delete(d.ref));
        txSnap.forEach(d => batch3.delete(d.ref));

        await Promise.all([batch1.commit(), batch2.commit(), batch3.commit()]);

        adminMessage.textContent = `✅ Удалено: ${usersSnap.size} игроков, ${requestsSnap.size} заявок, ${txSnap.size} транзакций. Новый сезон начат!`;
        loadUsersList();
        showRating();
    } catch (err) {
        alert('Ошибка: ' + err.message);
    }
};

// ─── DOMContentLoaded ─────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
    showRating();
    loadUsersList();
});
