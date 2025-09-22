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

/**
 * Добавить CF пользователю
 * @param {string} username - Имя пользователя
 * @param {number} amount - Количество CF для добавления
 * @param {string} reason - Причина операции
 */
async function adminAddCF(username, amount, reason) {
    if (!username || isNaN(amount) || amount <= 0) {
        adminMessage.textContent = 'Введите корректное имя пользователя и сумму больше 0';
        return;
    }
    
    const usersSnap = await db.collection('users').get();
    const userDoc = usersSnap.docs.find(doc => doc.data().name && doc.data().name.trim().toLowerCase() === username.trim().toLowerCase());
    
    if (userDoc) {
        const userData = userDoc.data();
        const oldCF = userData.cf || 0;
        const newCF = oldCF + amount;
        
        await userDoc.ref.update({ cf: newCF });
        
        // Добавляем запись в историю транзакций
        await addTransactionRecord(username, amount, 'add', reason);
        
        adminMessage.textContent = `Добавлено ${amount} CF пользователю ${username}. Новый баланс: ${newCF} CF`;
        clearTransactionInputs();
        
        if (typeof updateUsersList === 'function') updateUsersList();
        setTimeout(() => {
            if (typeof showProfile === 'function') showProfile();
            if (typeof showRating === 'function') showRating();
        }, 500);
    } else {
        adminMessage.textContent = `Пользователь ${username} не найден.`;
    }
}

/**
 * Снять CF у пользователя
 * @param {string} username - Имя пользователя
 * @param {number} amount - Количество CF для снятия
 * @param {string} reason - Причина операции
 */
async function adminWithdrawCF(username, amount, reason) {
    if (!username || isNaN(amount) || amount <= 0) {
        adminMessage.textContent = 'Введите корректное имя пользователя и сумму больше 0';
        return;
    }
    
    const usersSnap = await db.collection('users').get();
    const userDoc = usersSnap.docs.find(doc => doc.data().name && doc.data().name.trim().toLowerCase() === username.trim().toLowerCase());
    
    if (userDoc) {
        const userData = userDoc.data();
        const oldCF = userData.cf || 0;
        
        if (oldCF < amount) {
            adminMessage.textContent = `У пользователя ${username} недостаточно CF. Доступно: ${oldCF} CF`;
            return;
        }
        
        const newCF = oldCF - amount;
        await userDoc.ref.update({ cf: newCF });
        
        // Добавляем запись в историю транзакций
        await addTransactionRecord(username, amount, 'withdraw', reason);
        
        adminMessage.textContent = `Снято ${amount} CF у пользователя ${username}. Новый баланс: ${newCF} CF`;
        clearTransactionInputs();
        
        if (typeof updateUsersList === 'function') updateUsersList();
        setTimeout(() => {
            if (typeof showProfile === 'function') showProfile();
            if (typeof showRating === 'function') showRating();
        }, 500);
    } else {
        adminMessage.textContent = `Пользователь ${username} не найден.`;
    }
}

/**
 * Добавить запись в историю транзакций
 * @param {string} username - Имя пользователя
 * @param {number} amount - Сумма операции
 * @param {string} type - Тип операции ('add' или 'withdraw')
 * @param {string} reason - Причина операции
 */
async function addTransactionRecord(username, amount, type, reason) {
    const transaction = {
        username: username,
        amount: amount,
        type: type,
        reason: reason || 'Не указано',
        timestamp: new Date(),
        admin: true
    };
    
    await db.collection('transactions').add(transaction);
}

/**
 * Очистить поля ввода транзакций
 */
function clearTransactionInputs() {
    const userInput = document.getElementById('admin-transaction-user');
    const amountInput = document.getElementById('admin-transaction-amount');
    const reasonInput = document.getElementById('admin-transaction-reason');
    
    if (userInput) userInput.value = '';
    if (amountInput) amountInput.value = '';
    if (reasonInput) reasonInput.value = '';
}

// Экспортируем функции для использования в main.js
window.adminAddWins = adminAddWins;
window.adminAddGames = adminAddGames;
window.adminAddCF = adminAddCF;
window.adminWithdrawCF = adminWithdrawCF; 