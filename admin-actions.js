// admin-actions.js
// Ожидается, что db, adminMessage, getLevelByPoints определены в main.js

async function adminAddCF(username, amount, reason) {
    if (!username || isNaN(amount) || amount <= 0) {
        if (adminMessage) adminMessage.textContent = 'Введите корректное имя и сумму больше 0';
        return;
    }
    const userDoc = await findUserByName(username);
    if (!userDoc) {
        if (adminMessage) adminMessage.textContent = `Пользователь ${username} не найден.`;
        return;
    }
    const oldCF = userDoc.data().cf || 0;
    const newCF = oldCF + amount;
    await userDoc.ref.update({ cf: newCF });
    await addTransactionRecord(username, amount, 'add', reason);
    if (adminMessage) adminMessage.textContent = `Добавлено ${amount} CF → ${username}. Баланс: ${newCF} CF`;
    clearTransactionInputs();
    updateUsersList();
    setTimeout(() => { showProfile(); showRating(); }, 500);
}

async function adminWithdrawCF(username, amount, reason) {
    if (!username || isNaN(amount) || amount <= 0) {
        if (adminMessage) adminMessage.textContent = 'Введите корректное имя и сумму больше 0';
        return;
    }
    const userDoc = await findUserByName(username);
    if (!userDoc) {
        if (adminMessage) adminMessage.textContent = `Пользователь ${username} не найден.`;
        return;
    }
    const oldCF = userDoc.data().cf || 0;
    if (oldCF < amount) {
        if (adminMessage) adminMessage.textContent = `Недостаточно CF у ${username}. Доступно: ${oldCF}`;
        return;
    }
    const newCF = oldCF - amount;
    await userDoc.ref.update({ cf: newCF });
    await addTransactionRecord(username, amount, 'withdraw', reason);
    if (adminMessage) adminMessage.textContent = `Снято ${amount} CF у ${username}. Баланс: ${newCF} CF`;
    clearTransactionInputs();
    updateUsersList();
    setTimeout(() => { showProfile(); showRating(); }, 500);
}

async function addTransactionRecord(username, amount, type, reason, userId = null) {
    await db.collection('transactions').add({
        username,
        amount,
        type,
        reason: reason || 'Не указано',
        timestamp: new Date(),
        userId,
        admin: type !== 'exchange'
    });
}

function clearTransactionInputs() {
    const u = document.getElementById('admin-transaction-user');
    const a = document.getElementById('admin-transaction-amount');
    const r = document.getElementById('admin-transaction-reason');
    if (u) u.value = '';
    if (a) a.value = '';
    if (r) r.value = '';
}

// ─── Подтверждение / отклонение счётов ───────────────────────────────────────

async function approveScoreRequest(requestId) {
    try {
        const reqDoc = await db.collection('score_requests').doc(requestId).get();
        if (!reqDoc.exists) return;
        const req = reqDoc.data();

        // Ищем пользователя по userId
        const userRef = db.collection('users').doc(req.userId);
        const userDoc = await userRef.get();
        if (!userDoc.exists) { alert('Пользователь не найден!'); return; }

        const data = userDoc.data();
        const newPoints = (data.points || 0) + (req.points || 0);
        const newLevel  = getLevelByPoints(newPoints);

        const batch = db.batch();
        batch.update(userRef, {
            games:  (data.games  || 0) + (req.games  || 0),
            wins:   (data.wins   || 0) + (req.wins   || 0),
            cf:     (data.cf     || 0) + (req.cf     || 0),
            points: newPoints,
            level:  newLevel,
            coins:  (data.coins  || 0) + (req.coins  || 0)
        });
        batch.update(reqDoc.ref, { status: 'approved', resolvedAt: new Date() });
        await batch.commit();

        const parts = [];
        if (req.games)  parts.push(`${req.games} игр`);
        if (req.wins)   parts.push(`${req.wins} побед`);
        if (req.cf)     parts.push(`${req.cf} CF`);
        if (req.points) parts.push(`${req.points} опыта`);
        if (req.coins)  parts.push(`${req.coins} монет`);
        await addTransactionRecord(
            req.username,
            req.cf || 0,
            'approve',
            `Счёт одобрен: ${parts.join(', ')}`,
            req.userId
        );

        if (typeof showProfile === 'function') showProfile();
        if (typeof showRating  === 'function') showRating();
    } catch (err) {
        alert('Ошибка при подтверждении: ' + err.message);
    }
}

async function rejectScoreRequest(requestId, reason = '') {
    try {
        const reqDoc = await db.collection('score_requests').doc(requestId).get();
        if (!reqDoc.exists) return;
        const req = reqDoc.data();

        const update = { status: 'rejected', resolvedAt: new Date() };
        if (reason) update.rejectReason = reason;
        await reqDoc.ref.update(update);

        const note = reason ? `Счёт отклонён: ${reason}` : 'Счёт отклонён администратором';
        await addTransactionRecord(req.username, 0, 'reject', note, req.userId);
    } catch (err) {
        alert('Ошибка при отклонении: ' + err.message);
    }
}

// Экспорт в глобальный scope
window.adminAddCF          = adminAddCF;
window.adminWithdrawCF     = adminWithdrawCF;
window.approveScoreRequest = approveScoreRequest;
window.rejectScoreRequest  = rejectScoreRequest;
