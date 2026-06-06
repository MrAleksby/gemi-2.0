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
    showRating();
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
    showRating();
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
        const reqRef  = db.collection('score_requests').doc(requestId);
        const preSnap = await reqRef.get();
        if (!preSnap.exists) return;
        const req = preSnap.data();

        const userRef = db.collection('users').doc(req.userId);

        // Транзакция с проверкой статуса: повторное одобрение (двойной клик,
        // устаревший UI, ретрай при обрыве сети) не начислит статистику дважды.
        const outcome = await db.runTransaction(async (tx) => {
            const reqSnap = await tx.get(reqRef);
            if (!reqSnap.exists) return { done: false };
            const r = reqSnap.data();
            if (r.status && r.status !== 'pending') return { done: false, already: true };

            const userSnap = await tx.get(userRef);
            if (!userSnap.exists) { console.error('approveScoreRequest: пользователь не найден, userId=' + req.userId); return { done: false }; }

            const data = userSnap.data();
            const newPoints = (data.points || 0) + (r.points || 0);
            const newLevel  = getLevelByPoints(newPoints);

            tx.update(userRef, {
                games:  (data.games  || 0) + (r.games  || 0),
                wins:   (data.wins   || 0) + (r.wins   || 0),
                cf:     (data.cf     || 0) + (r.cf     || 0),
                points: newPoints,
                level:  newLevel,
                coins:  (data.coins  || 0) + (r.coins  || 0),
                approvedRequests: firebase.firestore.FieldValue.increment(1)
            });
            tx.update(reqRef, { status: 'approved', resolvedAt: new Date() });
            return { done: true };
        });

        if (outcome.already) {
            if (typeof adminMessage !== 'undefined' && adminMessage) adminMessage.textContent = '↺ Счёт уже обработан';
            return;
        }
        if (!outcome.done) return;

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

        if (typeof ratingCache !== 'undefined') ratingCache = null;
        if (typeof showProfile === 'function') showProfile();
        if (typeof showRating  === 'function') showRating();
    } catch (err) {
        console.error('Ошибка при подтверждении счёта:', err);
        if (typeof adminMessage !== 'undefined' && adminMessage) adminMessage.textContent = 'Ошибка при подтверждении: ' + err.message;
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
        await db.collection('users').doc(req.userId).update({
            rejectedRequests: firebase.firestore.FieldValue.increment(1)
        });

        const note = reason ? `Счёт отклонён: ${reason}` : 'Счёт отклонён администратором';
        await addTransactionRecord(req.username, 0, 'reject', note, req.userId);
    } catch (err) {
        console.error('Ошибка при отклонении счёта:', err);
        if (typeof adminMessage !== 'undefined' && adminMessage) adminMessage.textContent = 'Ошибка при отклонении: ' + err.message;
    }
}

// ─── Сброс недельного рейтинга инвесторов ────────────────────────────────────

async function resetWeeklyInvestorRating() {
    if (!confirm('Зафиксировать чемпиона недели и сбросить weeklyPnl у всех игроков?')) return;

    try {
        const snap = await db.collection('users').get();
        const nonAdmins = snap.docs.filter(doc => doc.data().isAdmin !== true);

        // Ищем победителя — наибольший weeklyPnl > 0
        let winner = null;
        nonAdmins.forEach(doc => {
            const d = doc.data();
            if (!d.name || !d.name.trim()) return;
            const pnl = d.weeklyPnl || 0;
            if (pnl > 0 && (!winner || pnl > winner.weeklyPnl)) {
                winner = { uid: doc.id, name: d.name, weeklyPnl: pnl };
            }
        });

        // Сохраняем победителя
        if (winner) {
            await db.collection('weekly_winners').add({
                uid:       winner.uid,
                name:      winner.name,
                weeklyPnl: winner.weeklyPnl,
                timestamp: firebase.firestore.FieldValue.serverTimestamp(),
            });
        }

        // Сбрасываем weeklyPnl
        const batch = db.batch();
        nonAdmins.forEach(doc => batch.update(doc.ref, { weeklyPnl: 0 }));
        await batch.commit();

        if (winner) {
            alert(`✅ Чемпион недели: ${winner.name} (+${winner.weeklyPnl.toFixed(2)} монет)\nweeklyPnl сброшен у всех игроков.`);
        } else {
            alert('✅ weeklyPnl сброшен. Чемпиона нет — никто не в плюсе за неделю.');
        }
    } catch (e) {
        alert('❌ Ошибка: ' + e.message);
    }
}

// Экспорт в глобальный scope
window.adminAddCF                  = adminAddCF;
window.adminWithdrawCF             = adminWithdrawCF;
window.approveScoreRequest         = approveScoreRequest;
window.rejectScoreRequest          = rejectScoreRequest;
window.resetWeeklyInvestorRating   = resetWeeklyInvestorRating;
