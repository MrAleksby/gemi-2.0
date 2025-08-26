// admin-actions.js
// Функции для админских действий: начисление побед и сыгранных игр

// Ожидается, что db, adminMessage, adminUserInput, adminPointsInput уже определены в main.js

/**
 * Начислить победы пользователю
 * @param {string} username - Имя пользователя
 * @param {number} wins - Количество побед для начисления
 */
async function adminAddWins(username, wins) {
    if (!username || isNaN(wins)) return;
    const usersSnap = await db.collection('users').get();
    const userDoc = usersSnap.docs.find(doc => doc.data().name && doc.data().name.trim().toLowerCase() === username.trim().toLowerCase());
    if (userDoc) {
        const oldWins = userDoc.data().wins || 0;
        const newWins = oldWins + wins;
        await userDoc.ref.update({ wins: newWins });
        adminMessage.textContent = `Начислено ${wins} побед пользователю ${username}`;
        adminUserInput.value = '';
        adminPointsInput.value = '';
        if (typeof updateUsersList === 'function') updateUsersList(); // Обновляем список пользователей
        setTimeout(() => {
            if (typeof showProfile === 'function') showProfile();
            if (typeof showRating === 'function') showRating();
        }, 500);
    } else {
        adminMessage.textContent = `Пользователь ${username} не найден.`;
    }
}

/**
 * Начислить сыгранные игры пользователю
 * @param {string} username - Имя пользователя
 * @param {number} games - Количество игр для начисления
 */
async function adminAddGames(username, games) {
    if (!username || isNaN(games)) return;
    const usersSnap = await db.collection('users').get();
    const userDoc = usersSnap.docs.find(doc => doc.data().name && doc.data().name.trim().toLowerCase() === username.trim().toLowerCase());
    if (userDoc) {
        const oldGames = userDoc.data().games || 0;
        const newGames = oldGames + games;
        await userDoc.ref.update({ games: newGames });
        adminMessage.textContent = `Начислено ${games} игр пользователю ${username}`;
        adminUserInput.value = '';
        adminPointsInput.value = '';
        if (typeof updateUsersList === 'function') updateUsersList(); // Обновляем список пользователей
        setTimeout(() => {
            if (typeof showProfile === 'function') showProfile();
            if (typeof showRating === 'function') showRating();
        }, 500);
    } else {
        adminMessage.textContent = `Пользователь ${username} не найден.`;
    }
}

// Экспортируем функции для использования в main.js
window.adminAddWins = adminAddWins;
window.adminAddGames = adminAddGames; 