const functions = require('firebase-functions');
const admin     = require('firebase-admin');
admin.initializeApp();

// ─── Конфигурация активов ────────────────────────────────────────────────────
const ASSETS = [
    { id: 'btc',  symbol: 'BTC',  binance: 'BTCUSDT',  futures: false },
    { id: 'ton',  symbol: 'TON',  binance: 'TONUSDT',  futures: false },
    { id: 'eth',  symbol: 'ETH',  binance: 'ETHUSDT',  futures: false },
    { id: 'paxg', symbol: 'PAXG', binance: 'PAXGUSDT', futures: false },
    { id: 'xag',  symbol: 'XAG',  binance: 'XAGUSDT',  futures: true  },
    { id: 'tsla', symbol: 'TSLA', binance: 'TSLAUSDT', futures: true  },
    { id: 'meta', symbol: 'META', binance: 'METAUSDT', futures: true  },
    { id: 'bz',   symbol: 'BZ',   binance: 'BZUSDT',   futures: true  },
    { id: 'aapl', symbol: 'AAPL', binance: 'AAPLUSDT', futures: true  },
    { id: 'nvda', symbol: 'NVDA', binance: 'NVDAUSDT', futures: true  },
];

// ─── Получение цены с Binance ────────────────────────────────────────────────
async function fetchBinancePrice(asset) {
    const base = asset.futures
        ? 'https://fapi.binance.com/fapi/v1/ticker/24hr'
        : 'https://api.binance.com/api/v3/ticker/24hr';
    const res = await fetch(`${base}?symbol=${asset.binance}`);
    if (!res.ok) throw new Error(`Binance HTTP ${res.status} for ${asset.binance}`);
    const d = await res.json();
    return parseFloat(d.lastPrice);
}

// ─── Проверка стоп-лоссов и тейк-профитов ────────────────────────────────────
exports.checkOrders = functions.region('europe-west1').pubsub.schedule('every 1 minutes').onRun(async (context) => {
    const db = admin.firestore();

    // Получаем цены всех активов
    const prices = {};
    await Promise.all(ASSETS.map(async (asset) => {
        try {
            prices[asset.id] = await fetchBinancePrice(asset);
        } catch (e) {
            console.error(`Не удалось получить цену ${asset.symbol}:`, e.message);
        }
    }));

    // Находим админа
    const adminSnap = await db.collection('users').where('isAdmin', '==', true).limit(1).get();
    const adminRef  = adminSnap.empty ? null : adminSnap.docs[0].ref;

    // Получаем всех пользователей (не админов)
    // Примечание: isAdmin может отсутствовать у старых/новых аккаунтов,
    // поэтому получаем всех и фильтруем вручную
    const usersSnap = await db.collection('users').get();

    const promises = [];

    for (const userDoc of usersSnap.docs) {
        const userData = userDoc.data();
        if (userData.isAdmin === true) continue; // пропускаем администратора
        const userRef  = userDoc.ref;

        for (const asset of ASSETS) {
            const price = prices[asset.id];
            if (!price) continue;

            const assetAmount = userData[`${asset.id}Amount`] || 0;
            if (assetAmount <= 0) continue;

            const stopLoss   = userData[`${asset.id}StopLoss`]   || 0;
            const takeProfit = userData[`${asset.id}TakeProfit`] || 0;

            let triggered = null; // 'stopLoss' | 'takeProfit'

            if (stopLoss > 0 && price <= stopLoss)   triggered = 'stopLoss';
            if (takeProfit > 0 && price >= takeProfit) triggered = 'takeProfit';

            if (!triggered) continue;

            // Выполняем продажу
            const avgPrice   = userData[`${asset.id}AvgPrice`] || 0;
            const coinsGross = assetAmount * price;
            const commission = coinsGross * 0.001;
            const coinsNet   = Math.round((coinsGross - commission) * 100) / 100;
            const pnl        = (price - avgPrice) * assetAmount - commission;
            const xpGain     = pnl > 0 ? Math.floor(pnl) : 0;

            const userName = userData.name || 'Неизвестно';

            const userUpdate = {
                exchangeCoins: admin.firestore.FieldValue.increment(coinsNet),
                totalPnl:      admin.firestore.FieldValue.increment(pnl),
                weeklyPnl:     admin.firestore.FieldValue.increment(pnl),
                [`${asset.id}StopLoss`]:   0,
                [`${asset.id}TakeProfit`]: 0,
                slTpNotifications: admin.firestore.FieldValue.arrayUnion({
                    assetId:     asset.id,
                    assetSymbol: asset.symbol,
                    type:        triggered,
                    price,
                    coinsNet,
                    pnl,
                    timestamp:   Date.now(),
                }),
            };
            if (xpGain > 0) userUpdate.points = admin.firestore.FieldValue.increment(xpGain);

            // Если продаём весь остаток — обнуляем количество и среднюю цену
            userUpdate[`${asset.id}Amount`]   = 0;
            userUpdate[`${asset.id}AvgPrice`] = 0;

            const p = (async () => {
                await userRef.update(userUpdate);

                // Комиссия → админу
                if (adminRef) {
                    await adminRef.update({
                        exchangeCoins: admin.firestore.FieldValue.increment(commission),
                    });
                }

                // Лог комиссии (та же коллекция что у обычных продаж)
                await db.collection('exchange_commissions').add({
                    userId:      userDoc.id,
                    userName,
                    type:        'sell_sltp',
                    trigger:     triggered,
                    assetId:     asset.id,
                    assetSymbol: asset.symbol,
                    assetAmount,
                    coinsNet,
                    commission,
                    price,
                    pnl,
                    timestamp:   admin.firestore.FieldValue.serverTimestamp(),
                });

                // Запись сделки
                await db.collection('exchange_trades').add({
                    userId:      userDoc.id,
                    userName,
                    type:        'sell',
                    trigger:     triggered,
                    assetId:     asset.id,
                    assetSymbol: asset.symbol,
                    assetAmount,
                    price,
                    coinsAmount: coinsNet,
                    commission,
                    pnl,
                    timestamp:   admin.firestore.FieldValue.serverTimestamp(),
                });

                console.log(`[SL/TP] ${triggered} сработал: ${userName} продал ${assetAmount} ${asset.symbol} по цене ${price}, PnL=${pnl.toFixed(2)}`);
            })();

            promises.push(p.catch(e => console.error(`Ошибка обработки ордера ${asset.id} для ${userDoc.id}:`, e.message)));
        }
    }

    await Promise.all(promises);
    return null;
});

// ─── Еженедельный сброс рейтинга инвесторов (пн 20:00 Ташкент = 15:00 UTC) ──
exports.resetWeeklyInvestorRating = functions.region('europe-west1').pubsub
    .schedule('0 15 * * 0')
    .timeZone('Asia/Tashkent')
    .onRun(async () => {
        const db = admin.firestore();

        const snap = await db.collection('users').where('isAdmin', '==', false).get();
        if (snap.empty) return null;

        // Ищем победителя — наибольший weeklyPnl > 0
        let winner = null;
        snap.docs.forEach(doc => {
            const d = doc.data();
            if (!d.name || !d.name.trim()) return;
            const pnl = d.weeklyPnl || 0;
            if (pnl > 0 && (!winner || pnl > winner.weeklyPnl)) {
                winner = { uid: doc.id, name: d.name, weeklyPnl: pnl };
            }
        });

        // Фиксируем победителя
        if (winner) {
            await db.collection('weekly_winners').add({
                uid:       winner.uid,
                name:      winner.name,
                weeklyPnl: winner.weeklyPnl,
                timestamp: admin.firestore.FieldValue.serverTimestamp(),
            });

            console.log(`[WeeklyReset] Победитель: ${winner.name}, PnL=${winner.weeklyPnl.toFixed(2)}`);
        } else {
            console.log('[WeeklyReset] Нет победителя (никто не в плюсе)');
        }

        // Сбрасываем weeklyPnl всем
        const batch = db.batch();
        snap.docs.forEach(doc => batch.update(doc.ref, { weeklyPnl: 0 }));
        await batch.commit();

        return null;
    });

// ─── Сброс пароля игрока (только для админа) ────────────────────────────────
exports.resetUserPassword = functions.https.onCall(async (data, context) => {
    // Проверяем что вызывающий авторизован
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Необходима авторизация');
    }

    // Проверяем что вызывающий — админ
    const callerDoc = await admin.firestore()
        .collection('users').doc(context.auth.uid).get();
    if (!callerDoc.exists || !callerDoc.data().isAdmin) {
        throw new functions.https.HttpsError('permission-denied', 'Только для администратора');
    }

    const { uid, newPassword } = data;

    if (!uid || typeof uid !== 'string') {
        throw new functions.https.HttpsError('invalid-argument', 'Не указан uid игрока');
    }
    if (!newPassword || newPassword.length < 4) {
        throw new functions.https.HttpsError('invalid-argument', 'Пароль должен быть не менее 4 символов');
    }

    // Меняем пароль в Firebase Auth
    await admin.auth().updateUser(uid, { password: newPassword });

    // Логируем действие
    await admin.firestore().collection('admin_logs').add({
        action:    'reset_password',
        targetUid: uid,
        adminUid:  context.auth.uid,
        timestamp: admin.firestore.FieldValue.serverTimestamp()
    });

    return { success: true };
});
