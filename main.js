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
const ratingSection = document.getElementById('rating-section');
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

const auth = firebase.auth();

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

// Массив уровней
const levels = [
  { name: "Начинающий инвестор", color: "#d4edda" }, // 0
  { name: "Уровень 1" },
  { name: "Уровень 2" },
  { name: "Уровень 3" },
  { name: "Уровень 4" },
  { name: "Искатель", color: "#e3f2fd" },           // 5
  { name: "Уровень 6" },
  { name: "Уровень 7" },
  { name: "Уровень 8" },
  { name: "Уровень 9" },
  { name: "Капитан активов", color: "#ffcdd2" },   // 10
  { name: "Уровень 11" },
  { name: "Уровень 12" },
  { name: "Уровень 13" },
  { name: "Уровень 14" },
  { name: "Магнат инвестиций", color: "#fff9c4" }, // 15
  { name: "Уровень 16" },
  { name: "Уровень 17" },
  { name: "Уровень 18" },
  { name: "Уровень 19" },
  { name: "Титан финансов", color: "#b2ebf2" },    // 20
  { name: "Уровень 21" },
  { name: "Уровень 22" },
  { name: "Уровень 23" },
  { name: "Уровень 24" },
  { name: "Творец", color: "#e1bee7" }             // 25
];

// Границы баллов для уровней (индекс = уровень - 1)
const levelThresholds = [
  0, 10, 25, 45, 70, 100, 135, 175, 220, 270, 325, 385, 450, 520, 595, 675, 760, 850, 945, 1045, 1150, 1260, 1375, 1495, 1620
];

function getLevelByPoints(points) {
    for (let i = levelThresholds.length - 1; i >= 0; i--) {
        if (points >= levelThresholds[i]) return i + 1;
    }
    return 1;
}

function getLevelTitle(lvl) {
    if (lvl >= 1 && lvl <= 4) return 'Искатель';
    if (lvl >= 5 && lvl <= 9) return 'Начинающий инвестор';
    if (lvl >= 10 && lvl <= 14) return 'Капитан активов';
    if (lvl >= 15 && lvl <= 19) return 'Магнат инвестиций';
    if (lvl >= 20 && lvl <= 24) return 'Титан финансов';
    if (lvl === 25) return 'Творец';
    return 'Неизвестно';
}

function getLevelColor(lvl) {
    if (lvl >= 1 && lvl <= 4) return '#e3f2fd'; // Искатель — голубой
    if (lvl >= 5 && lvl <= 9) return '#d4edda'; // Начинающий инвестор — зелёный
    if (lvl >= 10 && lvl <= 14) return '#ffcdd2'; // Капитан активов — красный
    if (lvl >= 15 && lvl <= 19) return '#fff9c4'; // Магнат инвестиций — жёлтый
    if (lvl >= 20 && lvl <= 24) return '#b2ebf2'; // Титан финансов — синий
    if (lvl === 25) return '#e1bee7'; // Творец — фиолетовый
    return '#f5f5f5';
}

// Регистрация
registerForm.onsubmit = async (e) => {
    e.preventDefault();
    const username = document.getElementById('register-username').value.trim();
    const email = document.getElementById('register-email').value.trim();
    const password = document.getElementById('register-password').value;
    const passwordConfirm = document.getElementById('register-password-confirm').value;
    if (password !== passwordConfirm) {
        alert('Пароли не совпадают!');
        return;
    }
    // Проверка уникальности имени в коллекции usernames
    const usernameDoc = await db.collection('usernames').doc(username.toLowerCase()).get();
    if (usernameDoc.exists) {
        alert('Пользователь с таким именем уже существует!');
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
            if (adminSection) adminSection.style.display = '';
        } else {
            if (adminSection) adminSection.style.display = 'none';
        }
        if (registerSection) registerSection.style.display = 'none';
        if (profileCard) profileCard.style.display = '';
        if (ratingSection) ratingSection.style.display = '';
    } catch (err) {
        alert('Ошибка регистрации: ' + err.message);
    }
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
            if (adminSection) adminSection.style.display = '';
        } else {
            if (adminSection) adminSection.style.display = 'none';
        }
        if (loginSection) loginSection.style.display = 'none';
        // Показываем новый профиль
        if (profileCard) profileCard.style.display = '';
        if (ratingSection) ratingSection.style.display = '';
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
    if (ratingSection) ratingSection.style.display = 'none';
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
        profileInfo.innerHTML = `
        <div class="profile-stats">
          <span class="profile-badge level"><span style="font-size:1.2em;">🏅</span> ${lvlTitle} ${lvl}</span>
          <span class="profile-badge points"><span style="font-size:1.2em;">⭐</span> ${data.points}</span>
          <span class="profile-badge coins"><span style="font-size:1.2em;">💰</span> ${data.coins ?? 0}</span>
        </div>
        <div style="margin-top:8px; color:#444; font-size:1em;">Имя: <b>${data.name}</b> | Email: <b>${data.email}</b></div>
        `;
    }
}

// Показ рейтинга
async function showRating() {
    const usersSnap = await db.collection('users').orderBy('points', 'desc').get();
    ratingTableBody.innerHTML = '';
    let place = 1;
    usersSnap.forEach(doc => {
        const data = doc.data();
        if (!data.name || data.name.trim() === "") return; // фильтрация безымянных
        const lvl = Math.max(1, Math.min(getLevelByPoints(data.points), 25));
        const lvlTitle = getLevelTitle(lvl);
        const lvlColor = getLevelColor(lvl);
        const lvlHtml = `<span class=\"level-badge\" style=\"background:${lvlColor};\">${lvlTitle} ${lvl}</span>`;
        const tr = document.createElement('tr');
        tr.innerHTML = `<td>${place++}</td><td>${data.name}</td><td>${lvlHtml}</td><td>${data.points}</td><td>${data.coins ?? 0}</td>`;
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
        const oldCoins = userDoc.data().coins || 0;
        const newPoints = oldPoints + points;
        const newCoins = oldCoins + points;
        const newLevel = getLevelByPoints(newPoints);
        await userDoc.ref.update({
            points: newPoints,
            coins: newCoins,
            level: newLevel
        });
        adminMessage.textContent = `Начислено ${points} баллов и монет пользователю ${user}`;
        if (userDoc.id === currentUser) showProfile();
        showRating();
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
        if (userDoc.id === currentUser) showProfile();
        showRating();
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
    showRating();
    showProfile();
    if (typeof renderShop === 'function') renderShop();
};

const toggleRatingBtn = document.getElementById('toggle-rating-btn');
if (toggleRatingBtn && ratingSection) {
    toggleRatingBtn.onclick = () => {
        if (ratingSection.classList.contains('visible')) {
            ratingSection.classList.remove('visible');
            toggleRatingBtn.textContent = 'Показать рейтинг';
        } else {
            ratingSection.classList.add('visible');
            toggleRatingBtn.textContent = 'Скрыть рейтинг';
        }
    };
    // По умолчанию скрываем рейтинг
    ratingSection.classList.remove('visible');
    toggleRatingBtn.textContent = 'Показать рейтинг';
} 