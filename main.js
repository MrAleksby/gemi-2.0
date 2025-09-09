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
const adminName = "admin"; // Измените на ваше имя админа

// DOM элементы
const loginSection = document.getElementById('login-section');
const registerSection = document.getElementById('register-section');
const profileSection = document.getElementById('profile-section');

const adminSection = document.getElementById('admin-section');

const showRegister = document.getElementById('show-register');
const showLogin = document.getElementById('show-login');
const loginForm = document.getElementById('login-form');
const registerForm = document.getElementById('register-form');
const logoutBtn = document.getElementById('logout-btn');
const profileInfo = document.getElementById('profile-info');
const ratingTableBody = document.querySelector('#rating-table tbody');
const adminAddPointsBtn = document.getElementById('admin-add-points');
const adminUserInput = document.getElementById('admin-user');
const adminPointsInput = document.getElementById('admin-points');
const adminMessage = document.getElementById('admin-message');
const adminResetUserBtn = document.getElementById('admin-reset-user');
const adminResetAllBtn = document.getElementById('admin-reset-all');
const profileCard = document.getElementById('profile-card');
const adminAddCoinsBtn = document.getElementById('admin-add-coins');
const adminAddWinsBtn = document.getElementById('admin-add-wins');
const adminWinsInput = document.getElementById('admin-wins');
const adminAddGamesBtn = document.getElementById('admin-add-games');
const adminGamesInput = document.getElementById('admin-games');
const adminResetWinsBtn = document.getElementById('admin-reset-wins');
const adminResetGamesBtn = document.getElementById('admin-reset-games');
const adminResetAllWinsBtn = document.getElementById('admin-reset-all-wins');
const adminResetAllGamesBtn = document.getElementById('admin-reset-all-games');

const auth = firebase.auth();

// Убираем проверку градиентного текста, так как теперь используем обычные цвета
// function checkGradientTextSupport() {
//     const testElement = document.createElement('div');
//     testElement.style.background = 'linear-gradient(45deg, red, blue)';
//     testElement.style.webkitBackgroundClip = 'text';
//     testElement.style.webkitTextFillColor = 'transparent';
//     
//     // Если градиентный текст не поддерживается, применяем fallback стили
//     if (!testElement.style.webkitBackgroundClip) {
//         document.body.classList.add('no-gradient-text');
//         
//         // Применяем fallback стили к заголовкам
//         const headings = document.querySelectorAll('h2');
//         headings.forEach(h => h.classList.add('fallback'));
//         
//         // Применяем fallback стили к ссылкам
//         const links = document.querySelectorAll('a');
//         links.forEach(a => a.classList.add('fallback'));
//     }
// }

// Вызываем проверку при загрузке страницы
// document.addEventListener('DOMContentLoaded', checkGradientTextSupport);

// Глобальный обработчик авторизации
auth.onAuthStateChanged(async (user) => {
    if (user) {
        currentUser = user.uid;
        await showProfile();
        await showRating();
        // Проверка на админа
        const doc = await db.collection('users').doc(currentUser).get();
        if (doc.exists && doc.data().name && doc.data().name.toLowerCase() === adminName.toLowerCase()) {
            if (adminSection) adminSection.style.display = '';
        } else {
            if (adminSection) adminSection.style.display = 'none';
        }
        if (loginSection) loginSection.style.display = 'none';
        if (registerSection) registerSection.style.display = 'none';
        if (profileCard) profileCard.style.display = '';
        if (ratingSection) ratingSection.style.display = '';
    } else {
        currentUser = null;
        if (loginSection) loginSection.style.display = '';
        if (registerSection) registerSection.style.display = 'none';
        if (profileCard) profileCard.style.display = 'none';
        if (ratingSection) ratingSection.style.display = 'none';
        if (adminSection) adminSection.style.display = 'none';
    }
});

// Переключение между формами
showRegister.onclick = (e) => {
    e.preventDefault();
    loginSection.style.display = 'none';
    registerSection.style.display = '';
};
showLogin.onclick = (e) => {
    e.preventDefault();
    registerSection.style.display = 'none';
    loginSection.style.display = '';
};

// Массив уровней с концепцией "Путь к взрослости"
const levels = [
  { name: "Ребенок", color: "#e3f2fd", emoji: "👶", description: "Только начинаешь изучать деньги" }, // 0
  { name: "Уровень 1", emoji: "👶" },
  { name: "Уровень 2", emoji: "👶" },
  { name: "Уровень 3", emoji: "👶" },
  { name: "Уровень 4", emoji: "👶" },
  { name: "Ученик", color: "#d4edda", emoji: "👨‍🎓", description: "Изучаешь основы инвестиций" },           // 5
  { name: "Уровень 6", emoji: "👨‍🎓" },
  { name: "Уровень 7", emoji: "👨‍🎓" },
  { name: "Уровень 8", emoji: "👨‍🎓" },
  { name: "Уровень 9", emoji: "👨‍🎓" },
  { name: "Начинающий инвестор", color: "#ffcdd2", emoji: "💼", description: "Делаешь первые инвестиции" },   // 10
  { name: "Уровень 11", emoji: "💼" },
  { name: "Уровень 12", emoji: "💼" },
  { name: "Уровень 13", emoji: "💼" },
  { name: "Уровень 14", emoji: "💼" },
  { name: "Опытный инвестор", color: "#fff9c4", emoji: "🏢", description: "Строишь инвестиционный портфель" }, // 15
  { name: "Уровень 16", emoji: "🏢" },
  { name: "Уровень 17", emoji: "🏢" },
  { name: "Уровень 18", emoji: "🏢" },
  { name: "Уровень 19", emoji: "🏢" },
  { name: "Финансовый магнат", color: "#b2ebf2", emoji: "👑", description: "Создаешь финансовую империю" },    // 20
  { name: "Уровень 21", emoji: "👑" },
  { name: "Уровень 22", emoji: "👑" },
  { name: "Уровень 23", emoji: "👑" },
  { name: "Уровень 24", emoji: "👑" },
  { name: "Финансовая свобода", color: "#e1bee7", emoji: "🌟", description: "Достиг финансовой независимости" }             // 25
];

// Границы баллов для уровней (индекс = уровень - 1) - увеличены на 50%
const levelThresholds = [
  0, 15, 38, 68, 105, 150, 203, 263, 330, 405, 488, 578, 675, 780, 893, 1013, 1140, 1275, 1418, 1568, 1725, 1890, 2063, 2243, 2430
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
    if (lvl >= 1 && lvl <= 4) return '#e3f2fd'; // Ребенок — голубой
    if (lvl >= 5 && lvl <= 9) return '#d4edda'; // Ученик — зелёный
    if (lvl >= 10 && lvl <= 14) return '#ffcdd2'; // Начинающий инвестор — красный
    if (lvl >= 15 && lvl <= 19) return '#fff9c4'; // Опытный инвестор — жёлтый
    if (lvl >= 20 && lvl <= 24) return '#b2ebf2'; // Финансовый магнат — синий
    if (lvl === 25) return '#e1bee7'; // Финансовая свобода — фиолетовый
    return '#f5f5f5';
}

// Функция для отображения прогресса "Путь к взрослости"
function showAdulthoodProgress() {
    if (!currentUser) return;
    
    const userRef = db.collection('users').doc(currentUser);
    userRef.get().then(doc => {
        if (doc.exists) {
            const data = doc.data();
            const currentLevel = Math.max(1, Math.min(getLevelByPoints(data.points), 25));
            const nextLevel = Math.min(currentLevel + 1, 25);
            const progressToNext = currentLevel < 25 ? 
                ((data.points - levelThresholds[currentLevel - 1]) / (levelThresholds[currentLevel] - levelThresholds[currentLevel - 1])) * 100 : 100;
            
            const progressHtml = `
                <div class="adulthood-progress">
                    <h3>🎯 Путь к взрослости</h3>
                    <div class="current-stage">
                        <div class="stage-emoji">${getLevelEmoji(currentLevel)}</div>
                        <div class="stage-info">
                            <div class="stage-title">${getLevelTitle(currentLevel)} ${currentLevel}</div>
                            <div class="stage-description">${getLevelDescription(currentLevel)}</div>
                        </div>
                    </div>
                    <div class="progress-bar">
                        <div class="progress-fill" style="width: ${progressToNext}%; background: ${getLevelColor(currentLevel)};"></div>
                    </div>
                    <div class="next-stage">
                        <span>Следующий уровень: ${getLevelTitle(nextLevel)} ${nextLevel}</span>
                        <span>${Math.round(progressToNext)}% готово</span>
                    </div>
                </div>
            `;
            
            // Добавляем в профиль
            const profileCard = document.getElementById('profile-card');
            if (profileCard) {
                const existingProgress = profileCard.querySelector('.adulthood-progress');
                if (existingProgress) {
                    existingProgress.remove();
                }
                profileCard.insertAdjacentHTML('afterbegin', progressHtml);
            }
        }
    });
}

// Регистрация
registerForm.onsubmit = async (e) => {
    e.preventDefault();
    const submitBtn = registerForm.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    const username = document.getElementById('register-username').value.trim();
    const email = document.getElementById('register-email').value.trim();
    const password = document.getElementById('register-password').value;
    const passwordConfirm = document.getElementById('register-password-confirm').value;
    if (!username) {
        alert('Поле "Имя пользователя" обязательно для заполнения!');
        submitBtn.disabled = false;
        return;
    }
    if (password !== passwordConfirm) {
        alert('Пароли не совпадают!');
        submitBtn.disabled = false;
        return;
    }
    // Проверка уникальности имени в коллекции usernames
    const usernameDoc = await db.collection('usernames').doc(username.toLowerCase()).get();
    if (usernameDoc.exists) {
        alert('Пользователь с таким именем уже существует!');
        submitBtn.disabled = false;
        return;
    }
    try {
        const cred = await auth.createUserWithEmailAndPassword(email, password);
        await new Promise(resolve => {
            const unsubscribe = auth.onAuthStateChanged(user => {
                if (user) {
                    unsubscribe();
                    resolve();
                }
            });
        });
        const uid = auth.currentUser.uid;
        // Добавляем имя в коллекцию usernames
        await db.collection('usernames').doc(username.toLowerCase()).set({
            uid: uid
        });
        // Создаём профиль пользователя
        await db.collection('users').doc(uid).set({
            name: username,
            email: email,
            level: 1,
            experience: 0,
            points: 0,
            coins: 0
        });
        currentUser = uid;
        showProfile();
        showRating();
        if (username.toLowerCase() === adminName.toLowerCase()) {
            if (adminSection) {
                adminSection.style.display = '';
                updateUsersList(); // Обновляем список пользователей
                updateTransactionsLists(); // Обновляем списки транзакций
            }
        } else {
            if (adminSection) adminSection.style.display = 'none';
        }
        if (registerSection) registerSection.style.display = 'none';
        if (profileCard) profileCard.style.display = '';
    } catch (err) {
        alert('Ошибка регистрации: ' + err.message);
    }
    submitBtn.disabled = false;
};

// Вход
loginForm.onsubmit = async (e) => {
    e.preventDefault();
    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;
    try {
        const cred = await auth.signInWithEmailAndPassword(email, password);
        currentUser = cred.user.uid;
        showProfile();
        showRating();
        // Получаем имя для проверки админа
        const doc = await db.collection('users').doc(currentUser).get();
        if (doc.exists && doc.data().name && doc.data().name.toLowerCase() === adminName.toLowerCase()) {
            if (adminSection) {
                adminSection.style.display = '';
                updateUsersList(); // Обновляем список пользователей
                updateTransactionsLists(); // Обновляем списки транзакций
            }
        } else {
            if (adminSection) adminSection.style.display = 'none';
        }
        if (loginSection) loginSection.style.display = 'none';
        // Показываем новый профиль
        if (profileCard) profileCard.style.display = '';
    } catch (err) {
        alert('Ошибка входа: ' + err.message);
    }
};

// Выход
logoutBtn.onclick = async () => {
    await auth.signOut();
    currentUser = null;
    if (loginSection) loginSection.style.display = '';
    if (registerSection) registerSection.style.display = 'none';
    // Скрываем новый профиль
    if (profileCard) profileCard.style.display = 'none';
    if (adminSection) adminSection.style.display = 'none';
};

// Показ профиля
async function showProfile() {
    if (!currentUser) return;
    const userRef = db.collection('users').doc(currentUser);
    const doc = await userRef.get();
    if (doc.exists) {
        const data = doc.data();
        const lvl = Math.max(1, Math.min(getLevelByPoints(data.points), 25));
        const lvlTitle = getLevelTitle(lvl);
        const lvlColor = getLevelColor(lvl);
        
        // Показываем прогресс "Путь к взрослости"
        showAdulthoodProgress();
        
        profileInfo.innerHTML = `
        <div class="profile-stats">
          <span class="profile-badge points"><span style="font-size:1.2em;">⭐</span> ${data.points}</span>
          <span class="profile-badge coins"><span style="font-size:1.2em;">💰</span> ${data.coins ?? 0}</span>
          <span class="profile-badge wins"><span style="font-size:1.2em;">🏆</span> ${data.wins ?? 0}</span>
          <span class="profile-badge games"><span style="font-size:1.2em;">🎮</span> ${data.games ?? 0}</span>
          <span class="profile-badge cf"><img src="logo.jpg" class="cf-logo-icon" alt="CF"> ${data.money ?? 0}</span>
        </div>
        `;
        

        const profileHeader = document.getElementById('profile-header');
        if (profileHeader) {
            let emoji = getLevelEmoji(lvl);
            // Используем белый текст для лучшей контрастности
            profileHeader.innerHTML = `<span style="font-size:1.3em;">${emoji}</span> <b style='font-size:1.18em;'>${data.name}</b> <span style='background:${lvlColor};color:white;font-weight:600;padding:1px 4px;border-radius:6px;box-shadow:0 1px 4px rgba(0,0,0,0.1);margin-left:2px;text-shadow:0 1px 2px rgba(0,0,0,0.3);font-size:0.8em;'>${lvlTitle} ${lvl}</span>`;
        }
        // Топ-5 игроков
        const top5Snap = await db.collection('users').orderBy('points', 'desc').limit(5).get();
        let top5Html = `<div class="top5-title" style="margin:14px 0 4px 0;font-weight:600;color:#1976d2;">🏆 Топ-5 игроков</div>`;
        top5Html += `<table class="top5-table" style="width:100%;font-size:0.98em;background:#f7fbfc;border-radius:10px;overflow:hidden;"><thead><tr>
            <th><span style='font-size:1.1em;'>🏅</span></th>
            <th><span style='font-size:1.1em;'>👤</span></th>
            <th><span style='font-size:1.1em;'>🎯</span></th>
            <th><span style='font-size:1.1em;'>⭐</span></th>
            <th><span style='font-size:1.1em;'>💰</span></th>
            <th><span style='font-size:1.1em;'>🏆</span></th>
            <th><span style='font-size:1.1em;'>🎮</span></th>
        </tr></thead><tbody>`;
        let place = 1;
        top5Snap.forEach(doc => {
            const d = doc.data();
            if (!d.name || d.name.trim() === "") return;
            const l = Math.max(1, Math.min(getLevelByPoints(d.points), 25));
            const title = getLevelTitle(l);
            const color = getLevelColor(l);
            top5Html += `<tr><td style='font-weight:bold;'>${place}</td><td>${d.name}</td><td><span style='background:${color};color:white;border-radius:6px;padding:1px 6px;font-weight:500;text-shadow:0 1px 2px rgba(0,0,0,0.3);font-size:0.85em;'>${title} ${l}</span></td><td>${d.points}</td><td>${d.coins ?? 0}</td><td>${d.wins ?? 0}</td><td>${d.games ?? 0}</td></tr>`;
            place++;
        });
        top5Html += `</tbody></table>`;
        document.getElementById('top5-container').innerHTML = top5Html;
        
        // Обновляем кнопку магазина в зависимости от уровня
        updateShopButton(lvl);
    }
}

// Функция для обновления кнопки магазина
function updateShopButton(userLevel) {
    const shopBtn = document.getElementById('shop-btn');
    if (!shopBtn) return;
    
    if (userLevel < 5) {
        shopBtn.innerHTML = '🔒 Магазин (5 уровень)';
        shopBtn.title = 'Магазин доступен только с 5 уровня! Станьте Учеником, чтобы получить доступ к инвестициям.';
        shopBtn.style.background = 'linear-gradient(135deg, #ccc, #999)';
        shopBtn.style.cursor = 'not-allowed';
        shopBtn.style.opacity = '0.7';
        shopBtn.disabled = true; // Блокируем кнопку
        shopBtn.classList.add('disabled'); // Добавляем класс для стилизации
    } else {
        shopBtn.innerHTML = '🛒 Магазин';
        shopBtn.title = 'Открыть магазин инвестиций';
        shopBtn.style.background = 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)';
        shopBtn.style.cursor = 'pointer';
        shopBtn.style.opacity = '1';
        shopBtn.disabled = false; // Разблокируем кнопку
        shopBtn.classList.remove('disabled'); // Убираем класс блокировки
    }
}

// Показ рейтинга
async function showRating() {
    const usersSnap = await db.collection('users').orderBy('points', 'desc').get();
    ratingTableBody.innerHTML = '';
    let place = 1;
    // Добавляем заголовок с новыми столбцами
    document.querySelector('#rating-table thead').innerHTML = `<tr>
        <th><span style='font-size:1.1em;'>🏅</span></th>
        <th><span style='font-size:1.1em;'>👤</span></th>
        <th><span style='font-size:1.1em;'>🎯</span></th>
        <th><span class='profile-badge points'><span style='font-size:1.1em;'>⭐</span></span></th>
        <th><span class='profile-badge coins'><span style='font-size:1.1em;'>💰</span></span></th>
        <th><span class='profile-badge cf'><img src="logo.jpg" class="cf-logo-icon" alt="CF" style="width:1.1em;height:1.1em;"></span></th>
        <th><span class='profile-badge wins'><span style='font-size:1.1em;'>🏆</span></span></th>
        <th><span class='profile-badge games'><span style='font-size:1.1em;'>🎮</span></span></th>
    </tr>`;
    usersSnap.forEach(doc => {
        const data = doc.data();
        if (!data.name || data.name.trim() === "") return; // фильтрация безымянных
        const lvl = Math.max(1, Math.min(getLevelByPoints(data.points), 25));
        const lvlTitle = getLevelTitle(lvl);
        const lvlColor = getLevelColor(lvl);
        const lvlHtml = `<span class=\"level-badge\" style=\"background:${lvlColor} !important;color:white !important;font-weight:600 !important;padding:1px 6px !important;border-radius:6px !important;box-shadow:0 2px 6px rgba(0,0,0,0.1) !important;text-shadow:0 1px 2px rgba(0,0,0,0.3) !important;font-size:0.85em !important;\">${lvlTitle} ${lvl}</span>`;
        const tr = document.createElement('tr');
        tr.innerHTML = `<td>${place++}</td><td>${data.name}</td><td>${lvlHtml}</td><td>${data.points}</td><td>${data.coins ?? 0}</td><td>${data.wins ?? 0}</td><td>${data.games ?? 0}</td>`;
        ratingTableBody.appendChild(tr);
    });
}

// Админ: начисление баллов
adminAddPointsBtn.onclick = async () => {
    const user = adminUserInput.value.trim();
    const points = parseInt(adminPointsInput.value, 10);
    if (!user || isNaN(points)) return;
    // Поиск пользователя по имени без учёта регистра и пробелов
    const usersSnap = await db.collection('users').get();
    const userDoc = usersSnap.docs.find(doc => doc.data().name && doc.data().name.trim().toLowerCase() === user.trim().toLowerCase());
    if (userDoc) {
        const oldPoints = userDoc.data().points || 0;
        const newPoints = oldPoints + points;
        const newLevel = getLevelByPoints(newPoints);
        await userDoc.ref.update({
            points: newPoints,
            level: newLevel
        });
        adminMessage.textContent = `Начислено ${points} баллов пользователю ${user}`;
        adminPointsInput.value = '';
        updateUsersList(); // Обновляем список пользователей
        setTimeout(() => {
            showProfile();
            showRating();
        }, 500);
    } else {
        adminMessage.textContent = `Пользователь ${user} не найден.`;
    }
};

// Админ: начисление монет
adminAddCoinsBtn.onclick = async () => {
    const user = adminUserInput.value.trim();
    const coins = parseInt(adminPointsInput.value, 10);
    if (!user || isNaN(coins)) return;
    // Поиск пользователя по имени без учёта регистра и пробелов
    const usersSnap = await db.collection('users').get();
    const userDoc = usersSnap.docs.find(doc => doc.data().name && doc.data().name.trim().toLowerCase() === user.trim().toLowerCase());
    if (userDoc) {
        const oldCoins = userDoc.data().coins || 0;
        const newCoins = oldCoins + coins;
        await userDoc.ref.update({
            coins: newCoins
        });
        adminMessage.textContent = `Начислено ${coins} монет пользователю ${user}`;
        adminPointsInput.value = '';
        updateUsersList(); // Обновляем список пользователей
        setTimeout(() => {
            showProfile();
            showRating();
        }, 500);
    } else {
        adminMessage.textContent = `Пользователь ${user} не найден.`;
    }
};

adminResetUserBtn.onclick = async () => {
    const user = adminUserInput.value.trim();
    if (!user) return;
    if (!confirm(`Обнулить баллы и монеты у пользователя ${user}?`)) return;
    // Поиск пользователя по имени без учёта регистра и пробелов
    const usersSnap = await db.collection('users').get();
    const userDoc = usersSnap.docs.find(doc => doc.data().name && doc.data().name.trim().toLowerCase() === user.trim().toLowerCase());
    if (userDoc) {
        await userDoc.ref.update({
            points: 0,
            coins: 0,
            level: 1,
            savingsLevel: 0,
            savings: 0,
            twobigLevel: 0,
            twobig: 0,
            ok4uLevel: 0,
            ok4u: 0,
            myt4uLevel: 0,
            myt4u: 0,
            percentsLevel: 0,
            percents: '-',
            passivesLevel: 0,
            passives: '-',
            realtyLevel: 0,
            realty: '-'
        });
        adminMessage.textContent = `Баллы, монеты и магазин пользователя ${user} обнулены!`;
        updateUsersList(); // Обновляем список пользователей
        if (userDoc.id === currentUser) showProfile();
        showRating();
        showProfile();
        if (typeof renderShop === 'function') renderShop();
    } else {
        adminMessage.textContent = `Пользователь ${user} не найден.`;
    }
};

adminResetAllBtn.onclick = async () => {
    if (!confirm('Вы уверены, что хотите обнулить баллы и монеты у всех участников?')) return;
    const usersSnap = await db.collection('users').get();
    const batch = db.batch();
    usersSnap.forEach(doc => {
        batch.update(doc.ref, {
            points: 0,
            coins: 0,
            level: 1,
            savingsLevel: 0,
            savings: 0,
            twobigLevel: 0,
            twobig: 0,
            ok4uLevel: 0,
            ok4u: 0,
            myt4uLevel: 0,
            myt4u: 0,
            percentsLevel: 0,
            percents: '-',
            passivesLevel: 0,
            passives: '-',
            realtyLevel: 0,
            realty: '-'
        });
    });
    await batch.commit();
    adminMessage.textContent = 'Баллы и монеты у всех участников обнулены!';
    updateUsersList(); // Обновляем список пользователей
    showRating();
    showProfile();
    if (typeof renderShop === 'function') renderShop();
};

if (adminAddWinsBtn) {
    adminAddWinsBtn.onclick = () => {
        const user = adminUserInput.value.trim();
        const wins = parseInt(adminWinsInput.value, 10);
        window.adminAddWins(user, wins);
    };
}
if (adminAddGamesBtn) {
    adminAddGamesBtn.onclick = () => {
        const user = adminUserInput.value.trim();
        const games = parseInt(adminGamesInput.value, 10);
        window.adminAddGames(user, games);
    };
}

// Модальное окно рейтинга
const ratingModal = document.getElementById('rating-modal');
const ratingClose = document.getElementById('rating-close');
const toggleRatingBtn = document.getElementById('toggle-rating-btn');

if (toggleRatingBtn && ratingModal) {
    toggleRatingBtn.onclick = () => {
        ratingModal.style.display = 'flex';
        showRating(); // Обновляем данные рейтинга при открытии
    };
}

if (ratingClose && ratingModal) {
    ratingClose.onclick = () => {
        ratingModal.style.display = 'none';
    };
}

// Закрытие модального окна при клике вне его
if (ratingModal) {
    ratingModal.onclick = (e) => {
        if (e.target === ratingModal) {
            ratingModal.style.display = 'none';
        }
    };
}

if (adminResetWinsBtn) {
    adminResetWinsBtn.onclick = async () => {
        const user = adminUserInput.value.trim();
        if (!user) return;
        // Поиск пользователя по имени без учёта регистра и пробелов
        const usersSnap = await db.collection('users').get();
        const userDoc = usersSnap.docs.find(doc => doc.data().name && doc.data().name.trim().toLowerCase() === user.trim().toLowerCase());
        if (userDoc) {
            await userDoc.ref.update({ wins: 0 });
            adminMessage.textContent = `Победы пользователя ${user} сброшены!`;
            updateUsersList(); // Обновляем список пользователей
            setTimeout(() => {
                if (typeof showProfile === 'function') showProfile();
                if (typeof showRating === 'function') showRating();
            }, 500);
        } else {
            adminMessage.textContent = `Пользователь ${user} не найден.`;
        }
    };
}

if (adminResetGamesBtn) {
    adminResetGamesBtn.onclick = async () => {
        const user = adminUserInput.value.trim();
        if (!user) return;
        // Поиск пользователя по имени без учёта регистра и пробелов
        const usersSnap = await db.collection('users').get();
        const userDoc = usersSnap.docs.find(doc => doc.data().name && doc.data().name.trim().toLowerCase() === user.trim().toLowerCase());
        if (userDoc) {
            await userDoc.ref.update({ games: 0 });
            adminMessage.textContent = `Игры пользователя ${user} сброшены!`;
            updateUsersList(); // Обновляем список пользователей
            setTimeout(() => {
                if (typeof showProfile === 'function') showProfile();
                if (typeof showRating === 'function') showRating();
            }, 500);
        } else {
            adminMessage.textContent = `Пользователь ${user} не найден.`;
        }
    };
}

if (adminResetAllWinsBtn) {
    adminResetAllWinsBtn.onclick = async () => {
        if (!confirm('Вы уверены, что хотите сбросить победы у всех участников?')) return;
        const usersSnap = await db.collection('users').get();
        const batch = db.batch();
        usersSnap.forEach(doc => {
            batch.update(doc.ref, { wins: 0 });
        });
        await batch.commit();
        adminMessage.textContent = 'Победы у всех участников сброшены!';
        updateUsersList(); // Обновляем список пользователей
        setTimeout(() => {
            if (typeof showProfile === 'function') showProfile();
            if (typeof showRating === 'function') showRating();
        }, 500);
    };
}
if (adminResetAllGamesBtn) {
    adminResetAllGamesBtn.onclick = async () => {
        if (!confirm('Вы уверены, что хотите сбросить игры у всех участников?')) return;
        const usersSnap = await db.collection('users').get();
        const batch = db.batch();
        usersSnap.forEach(doc => {
            batch.update(doc.ref, { games: 0 });
        });
        await batch.commit();
        adminMessage.textContent = 'Игры у всех участников сброшены!';
        updateUsersList(); // Обновляем список пользователей
        setTimeout(() => {
            if (typeof showProfile === 'function') showProfile();
            if (typeof showRating === 'function') showRating();
        }, 500);
    };
}

// Функция для загрузки списка пользователей в datalist
async function loadUsersList() {
    try {
        const usersSnap = await db.collection('users').get();
        const usersList = document.getElementById('users-list');
        if (usersList) {
            usersList.innerHTML = '';
            usersSnap.forEach(doc => {
                const userData = doc.data();
                if (userData.name && userData.name.trim() !== '') {
                    const option = document.createElement('option');
                    option.value = userData.name;
                    usersList.appendChild(option);
                }
            });
        }
    } catch (error) {
        console.error('Ошибка загрузки списка пользователей:', error);
    }
}

// Функция для обновления списка пользователей при показе админ-панели
function updateUsersList() {
    if (adminSection && adminSection.style.display !== 'none') {
        loadUsersList();
    }
}



// Система обмена монет на деньги
const exchangeModal = document.getElementById('exchange-modal');
const exchangeClose = document.getElementById('exchange-close');
const exchangeCoinsBtn = document.getElementById('exchange-coins-btn');
const exchangeAmount = document.getElementById('exchange-amount');
const exchangeResult = document.getElementById('exchange-result');
const userCoinsBalance = document.getElementById('user-coins-balance');
const confirmExchange = document.getElementById('confirm-exchange');

// Открытие модального окна обмена
if (exchangeCoinsBtn && exchangeModal) {
    exchangeCoinsBtn.onclick = () => {
        exchangeModal.style.display = 'flex';
        updateExchangeInfo();
    };
}

// Закрытие модального окна обмена
if (exchangeClose && exchangeModal) {
    exchangeClose.onclick = () => {
        exchangeModal.style.display = 'none';
        exchangeAmount.value = '';
        exchangeResult.textContent = '0';
    };
}

// Закрытие по клику вне окна
if (exchangeModal) {
    exchangeModal.onclick = (e) => {
        if (e.target === exchangeModal) {
            exchangeModal.style.display = 'none';
            exchangeAmount.value = '';
            exchangeResult.textContent = '0';
        }
    };
}

// Обновление информации об обмене
function updateExchangeInfo() {
    if (!currentUser) return;
    
    db.collection('users').doc(currentUser).get().then(doc => {
        if (doc.exists) {
            const data = doc.data();
            const coins = data.coins || 0;
            userCoinsBalance.textContent = coins;
        }
    });
}

// Расчет суммы обмена
if (exchangeAmount) {
    exchangeAmount.oninput = () => {
        const amount = parseInt(exchangeAmount.value) || 0;
                    const result = amount * 350; // 1 монета = 350 CF
        exchangeResult.textContent = result.toLocaleString();
    };
}

// Подтверждение обмена
if (confirmExchange) {
    confirmExchange.onclick = async () => {
        const amount = parseInt(exchangeAmount.value) || 0;
        if (amount <= 0) {
            alert('Введите корректное количество монет!');
            return;
        }
        
        if (!currentUser) {
            alert('Ошибка: пользователь не найден!');
            return;
        }
        
        try {
            const userRef = db.collection('users').doc(currentUser);
            const doc = await userRef.get();
            
            if (doc.exists) {
                const data = doc.data();
                const currentCoins = data.coins || 0;
                
                if (amount > currentCoins) {
                    alert('Недостаточно монет для обмена!');
                    return;
                }
                
                // Создаем запись в истории транзакций
                const transaction = {
                    userId: currentUser,
                    userName: data.name,
                    type: 'exchange',
                    coins: amount,
                    sum: amount * 350,
                    date: new Date(),
                    status: 'approved', // Сразу одобряем
                    description: 'Обмен монет на деньги'
                };
                
                console.log('Создаем транзакцию:', transaction);
                
                // Добавляем транзакцию в коллекцию
                const transactionRef = await db.collection('transactions').add(transaction);
                console.log('Транзакция создана с ID:', transactionRef.id);
                
                // Обновляем баланс пользователя
                const currentMoney = data.money || 0;
                await userRef.update({
                    coins: currentCoins - amount,
                    money: currentMoney + (amount * 350) // Добавляем деньги
                });
                
                alert(`Обмен ${amount} монет на ${amount * 350} сумов выполнен успешно!`);
                
                // Закрываем модальное окно
                exchangeModal.style.display = 'none';
                exchangeAmount.value = '';
                exchangeResult.textContent = '0';
                
                // Обновляем профиль
                showProfile();
            }
        } catch (error) {
            alert('Ошибка при обмене: ' + error.message);
        }
    };
}

// Админ-панель для управления транзакциями
const transactionsHistory = document.getElementById('transactions-history');
const adminWithdrawUser = document.getElementById('admin-withdraw-user');
const adminWithdrawAmount = document.getElementById('admin-withdraw-amount');
const adminWithdrawReason = document.getElementById('admin-withdraw-reason');
const adminWithdrawMoney = document.getElementById('admin-withdraw-money');
const clearTransactionsBtn = document.getElementById('clear-transactions-btn');

// Загрузка истории транзакций
async function loadTransactionsHistory() {
    if (!transactionsHistory) return;
    
    try {
        const transactionsSnap = await db.collection('transactions')
            .orderBy('date', 'desc')
            .limit(20)
            .get();
        
        transactionsHistory.innerHTML = '';
        
        if (transactionsSnap.empty) {
            transactionsHistory.innerHTML = '<p style="text-align: center; color: #666; font-style: italic;">История транзакций пуста</p>';
            return;
        }
        
        transactionsSnap.forEach(doc => {
            const transaction = doc.data();
            const date = transaction.date.toDate().toLocaleString('ru-RU');
            const statusClass = transaction.status;
            const statusText = {
                'pending': 'Ожидает',
                'approved': 'Подтверждено',
                'rejected': 'Отклонено'
            }[transaction.status];
            
            const transactionHtml = `
                <div class="transaction-item ${transaction.type === 'withdrawal' ? 'withdrawal' : statusClass}">
                    <div class="transaction-header">
                        <span class="transaction-user">${transaction.userName}</span>
                        <span class="transaction-status ${statusClass}">${statusText}</span>
                    </div>
                    <div class="transaction-details">
                        <span class="transaction-amount">${transaction.type === 'withdrawal' ? '-' : '+'}${transaction.sum} сумов</span>
                        <span class="transaction-type">${transaction.type === 'withdrawal' ? 'Снятие' : 'Обмен'}</span>
                    </div>
                    <div class="transaction-description">${transaction.description || ''}</div>
                    <div class="transaction-date">${date}</div>
                </div>
            `;
            
            transactionsHistory.innerHTML += transactionHtml;
        });
    } catch (error) {
        console.error('Ошибка загрузки истории:', error);
    }
}



// Снятие денег для донатов
if (adminWithdrawMoney) {
    adminWithdrawMoney.onclick = async () => {
        const userName = adminWithdrawUser.value.trim();
        const amount = parseInt(adminWithdrawAmount.value, 10);
        const reason = adminWithdrawReason.value.trim();
        
        if (!userName || isNaN(amount) || amount <= 0 || !reason) {
            alert('Заполните все поля корректно!');
            return;
        }
        
        try {
            // Находим пользователя
            const usersSnap = await db.collection('users').get();
            const userDoc = usersSnap.docs.find(doc => 
                doc.data().name && doc.data().name.trim().toLowerCase() === userName.trim().toLowerCase()
            );
            
            if (!userDoc) {
                alert('Пользователь не найден!');
                return;
            }
            
            const userData = userDoc.data();
            const currentMoney = userData.money || 0;
            
            if (amount > currentMoney) {
                alert(`Недостаточно CF! У пользователя ${currentMoney} CF, нужно ${amount} CF.`);
                return;
            }
            

            
            // Создаем транзакцию снятия
            const transaction = {
                userId: userDoc.id,
                userName: userData.name,
                type: 'withdrawal',
                sum: amount,
                date: new Date(),
                status: 'approved',
                description: reason
            };
            
            await db.collection('transactions').add(transaction);
            
            // Снимаем только деньги
            await userDoc.ref.update({
                money: Math.max(0, currentMoney - amount) // Не может быть меньше 0
            });
            
            adminMessage.textContent = `Снято ${amount} CF у пользователя ${userName} для ${reason}`;
            
            // Очищаем поля
            adminWithdrawUser.value = '';
            adminWithdrawAmount.value = '';
            adminWithdrawReason.value = '';
            
            // Обновляем списки
            loadTransactionsHistory();
            updateUsersList();
            
        } catch (error) {
            alert('Ошибка при снятии денег: ' + error.message);
        }
    };
}

// Очистка истории транзакций
if (clearTransactionsBtn) {
    clearTransactionsBtn.onclick = async () => {
        if (!confirm('Вы уверены, что хотите очистить всю историю транзакций? Это действие нельзя отменить.')) {
            return;
        }
        
        try {
            // Получаем все транзакции
            const transactionsSnap = await db.collection('transactions').get();
            
            if (transactionsSnap.empty) {
                adminMessage.textContent = 'История транзакций уже пуста!';
                return;
            }
            
            // Создаем batch для удаления
            const batch = db.batch();
            transactionsSnap.forEach(doc => {
                batch.delete(doc.ref);
            });
            
            // Выполняем удаление
            await batch.commit();
            
            adminMessage.textContent = `Удалено ${transactionsSnap.size} транзакций из истории!`;
            
            // Обновляем отображение
            loadTransactionsHistory();
            
        } catch (error) {
            alert('Ошибка при очистке истории: ' + error.message);
        }
    };
}

// Обновляем списки транзакций при показе админ-панели
function updateTransactionsLists() {
    if (adminSection && adminSection.style.display !== 'none') {
        loadTransactionsHistory();
    }
}

// Вызываем рейтинг при загрузке страницы
document.addEventListener('DOMContentLoaded', () => {
    showRating();
    // Загружаем список пользователей при загрузке страницы
    loadUsersList();
}); 