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
exports.resetUserPassword = functions.region('europe-west1').https.onCall(async (data, context) => {
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
    if (!newPassword || newPassword.length < 6) {
        throw new functions.https.HttpsError('invalid-argument', 'Пароль должен быть не менее 6 символов');
    }

    // Меняем пароль в Firebase Auth
    try {
        await admin.auth().updateUser(uid, { password: newPassword });
    } catch (e) {
        throw new functions.https.HttpsError('internal', 'Ошибка Firebase Auth: ' + e.message);
    }

    // Логируем действие
    await admin.firestore().collection('admin_logs').add({
        action:    'reset_password',
        targetUid: uid,
        adminUid:  context.auth.uid,
        timestamp: admin.firestore.FieldValue.serverTimestamp()
    });

    return { success: true };
});

// ─── Вспомогательные функции Фазы 2 ─────────────────────────────────────────

// Ключ дня — сбрасывается в 6:00 по Ташкенту (UTC+5), совпадает с логикой business.js
function getBizDayKey() {
    const now = new Date();
    const tashkentMs = now.getTime() + 5 * 60 * 60 * 1000;
    const t = new Date(tashkentMs);
    if (t.getUTCHours() < 6) t.setUTCDate(t.getUTCDate() - 1);
    return t.getUTCFullYear() + '-' +
        String(t.getUTCMonth() + 1).padStart(2, '0') + '-' +
        String(t.getUTCDate()).padStart(2, '0');
}

const ENERGY_MAX_FN = 8;

const BUSINESS_STAGES_FN = [
    { id: 'cart',    incomePerEnergy: 5,  dailyCapacity: 10, expField: 'bizExpCart',    workerRequiredExp: null, workerRequiredField: null,        workerRequiredLabel: null },
    { id: 'kiosk',   incomePerEnergy: 10, dailyCapacity: 15, expField: 'bizExpKiosk',   workerRequiredExp: 50,   workerRequiredField: 'bizExpCart',  workerRequiredLabel: 'Тележка мороженного' },
    { id: 'cafe',    incomePerEnergy: 15, dailyCapacity: 20, expField: 'bizExpCafe',    workerRequiredExp: 50,   workerRequiredField: 'bizExpKiosk', workerRequiredLabel: 'Киоск мороженого' },
    { id: 'factory', incomePerEnergy: 20, dailyCapacity: 25, expField: 'bizExpFactory', workerRequiredExp: 50,   workerRequiredField: 'bizExpCafe',  workerRequiredLabel: 'Кафе-мороженое' }
];

function getStageById(stageId) {
    return BUSINESS_STAGES_FN.find(s => s.id === stageId) || BUSINESS_STAGES_FN[0];
}

// ─── Перевод монет между игроками (onCall) ────────────────────────────────────
exports.transferCoins = functions.region('europe-west1').https.onCall(async (data, context) => {
    if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'Необходима авторизация');
    const { toName, amount } = data;
    if (!toName || typeof toName !== 'string' || !toName.trim())
        throw new functions.https.HttpsError('invalid-argument', 'Укажите имя получателя');
    if (!Number.isInteger(amount) || amount < 1)
        throw new functions.https.HttpsError('invalid-argument', 'Сумма должна быть целым числом ≥ 1');

    const db = admin.firestore();
    const fromUid = context.auth.uid;

    const fromDoc = await db.collection('users').doc(fromUid).get();
    if (!fromDoc.exists) throw new functions.https.HttpsError('not-found', 'Ваш профиль не найден');
    if ((fromDoc.data().coins || 0) < amount)
        throw new functions.https.HttpsError('failed-precondition', `Недостаточно монет! У вас: ${fromDoc.data().coins || 0}`);

    const toSnap = await db.collection('users').where('name', '==', toName.trim()).limit(1).get();
    if (toSnap.empty) throw new functions.https.HttpsError('not-found', 'Пользователь не найден!');
    const toDocId   = toSnap.docs[0].id;
    const toDocName = toSnap.docs[0].data().name;
    if (toDocId === fromUid)
        throw new functions.https.HttpsError('invalid-argument', 'Нельзя переводить монеты самому себе!');

    const batch = db.batch();
    batch.update(db.collection('users').doc(fromUid), {
        coins:         admin.firestore.FieldValue.increment(-amount),
        transferCount: admin.firestore.FieldValue.increment(1)
    });
    batch.update(db.collection('users').doc(toDocId), {
        coins:             admin.firestore.FieldValue.increment(amount),
        receivedTransfers: admin.firestore.FieldValue.increment(1)
    });
    await batch.commit();
    return { success: true, toName: toDocName };
});

// ─── Перевод CF между игроками (onCall) ──────────────────────────────────────
exports.transferCF = functions.region('europe-west1').https.onCall(async (data, context) => {
    if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'Необходима авторизация');
    const { toName, amount } = data;
    if (!toName || typeof toName !== 'string' || !toName.trim())
        throw new functions.https.HttpsError('invalid-argument', 'Укажите имя получателя');
    if (typeof amount !== 'number' || amount < 1)
        throw new functions.https.HttpsError('invalid-argument', 'Сумма CF должна быть ≥ 1');

    const db = admin.firestore();
    const fromUid = context.auth.uid;

    const fromDoc = await db.collection('users').doc(fromUid).get();
    if (!fromDoc.exists) throw new functions.https.HttpsError('not-found', 'Ваш профиль не найден');
    if ((fromDoc.data().cf || 0) < amount)
        throw new functions.https.HttpsError('failed-precondition', `Недостаточно CF! У вас: ${fromDoc.data().cf || 0}`);

    const toSnap = await db.collection('users').where('name', '==', toName.trim()).limit(1).get();
    if (toSnap.empty) throw new functions.https.HttpsError('not-found', 'Пользователь не найден!');
    const toDocId   = toSnap.docs[0].id;
    const toDocName = toSnap.docs[0].data().name;
    if (toDocId === fromUid)
        throw new functions.https.HttpsError('invalid-argument', 'Нельзя переводить CF самому себе!');

    const batch = db.batch();
    batch.update(db.collection('users').doc(fromUid), {
        cf:            admin.firestore.FieldValue.increment(-amount),
        transferCount: admin.firestore.FieldValue.increment(1)
    });
    batch.update(db.collection('users').doc(toDocId), {
        cf:                admin.firestore.FieldValue.increment(amount),
        receivedTransfers: admin.firestore.FieldValue.increment(1)
    });
    await batch.commit();
    return { success: true, toName: toDocName };
});

// ─── Работа у владельца бизнеса (onCall) ─────────────────────────────────────
exports.workForOwner = functions.region('europe-west1').https.onCall(async (data, context) => {
    if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'Необходима авторизация');
    const { bizId } = data;
    if (!bizId || typeof bizId !== 'string')
        throw new functions.https.HttpsError('invalid-argument', 'Укажите bizId');

    const db         = admin.firestore();
    const workerUid  = context.auth.uid;
    const dayKey     = getBizDayKey();
    const bizRef     = db.collection('businesses').doc(bizId);
    const workerRef  = db.collection('users').doc(workerUid);

    const [bizSnap, workerSnap] = await Promise.all([bizRef.get(), workerRef.get()]);
    if (!bizSnap.exists)    throw new functions.https.HttpsError('not-found', 'Бизнес не найден');
    if (!workerSnap.exists) throw new functions.https.HttpsError('not-found', 'Профиль не найден');

    const biz        = bizSnap.data();
    const workerData = workerSnap.data();
    const stage      = getStageById(biz.stage);

    if (!biz.vacancyOpen)          throw new functions.https.HttpsError('failed-precondition', 'Вакансия закрыта');
    if (biz.ownerId === workerUid) throw new functions.https.HttpsError('invalid-argument', 'Нельзя работать в своём бизнесе!');

    // Ёмкость бизнеса (с учётом сброса нового дня)
    const isBizNewDay     = (biz.bizEnergyDate || '') !== dayKey;
    const energyUsedToday = isBizNewDay ? 0 : (biz.energyUsedToday || 0);
    if (energyUsedToday >= stage.dailyCapacity)
        throw new functions.https.HttpsError('failed-precondition',
            `Бизнес заполнен на сегодня! (${stage.dailyCapacity}/${stage.dailyCapacity})`);

    // Энергия работника (с учётом сброса нового дня)
    const isWorkerNewDay = (workerData.energyDate || '') !== dayKey;
    const workerEnergy   = isWorkerNewDay
        ? ENERGY_MAX_FN
        : (workerData.energy !== undefined ? workerData.energy : ENERGY_MAX_FN);
    if (workerEnergy <= 0)
        throw new functions.https.HttpsError('failed-precondition', '😴 Твоя энергия закончилась!');

    // Требования к опыту
    if (stage.workerRequiredExp && stage.workerRequiredField) {
        const workerExp = workerData[stage.workerRequiredField] || 0;
        if (workerExp < stage.workerRequiredExp)
            throw new functions.https.HttpsError('permission-denied',
                `Нужен опыт в «${stage.workerRequiredLabel}»: ${workerExp}/${stage.workerRequiredExp} ч.`);
    }

    const salary      = biz.vacancySalary || 0;
    const ownerIncome = stage.incomePerEnergy - salary;
    const workerName  = workerData.name || 'Неизвестно';

    // Формируем обновления работника
    const workerUpdate = {
        businessCoins:      admin.firestore.FieldValue.increment(salary),
        [stage.expField]:   admin.firestore.FieldValue.increment(1)
    };
    if (isWorkerNewDay) {
        workerUpdate.energy     = ENERGY_MAX_FN - 1;
        workerUpdate.energyDate = dayKey;
    } else {
        workerUpdate.energy = admin.firestore.FieldValue.increment(-1);
    }

    // Формируем обновления бизнеса
    const bizUpdate = { totalEarned: admin.firestore.FieldValue.increment(stage.incomePerEnergy) };
    if (isBizNewDay) {
        bizUpdate.energyUsedToday = 1;
        bizUpdate.bizEnergyDate   = dayKey;
    } else {
        bizUpdate.energyUsedToday = admin.firestore.FieldValue.increment(1);
    }

    await Promise.all([
        workerRef.update(workerUpdate),
        db.collection('users').doc(biz.ownerId).update({
            businessCoins: admin.firestore.FieldValue.increment(ownerIncome)
        }),
        bizRef.update(bizUpdate),
        bizRef.collection('work_logs').add({
            workerName, isOwner: false,
            income: stage.incomePerEnergy,
            salary, ownerProfit: ownerIncome,
            timestamp: admin.firestore.FieldValue.serverTimestamp()
        })
    ]);

    return {
        success: true,
        salary,
        ownerIncome,
        energyLeft: workerEnergy - 1,
        remaining:  stage.dailyCapacity - energyUsedToday - 1
    };
});

// ─── Перечисление налога администратору (onCall) ──────────────────────────────
exports.payTaxToAdmin = functions.region('europe-west1').https.onCall(async (data, context) => {
    if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'Необходима авторизация');
    const { amount, source, userId, userName, label } = data;
    if (context.auth.uid !== userId)
        throw new functions.https.HttpsError('permission-denied', 'Нельзя платить налог за другого пользователя');
    if (typeof amount !== 'number' || amount <= 0)
        throw new functions.https.HttpsError('invalid-argument', 'Некорректная сумма налога');

    const db        = admin.firestore();
    const adminSnap = await db.collection('users').where('isAdmin', '==', true).limit(1).get();
    if (!adminSnap.empty) {
        await adminSnap.docs[0].ref.update({
            businessCoins: admin.firestore.FieldValue.increment(amount)
        });
    }
    await db.collection('tax_log').add({
        userId, userName,
        amount, source,
        label: label || 'Налог',
        timestamp: admin.firestore.FieldValue.serverTimestamp()
    });
    return { success: true };
});

// ─── Торговая комиссия → Админу (onCall) ──────────────────────────────────────
exports.addTradeCommission = functions.region('europe-west1').https.onCall(async (data, context) => {
    if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'Необходима авторизация');
    const { userId, userName, type, assetId, assetSymbol, assetAmount, coinsAmount, commission } = data;
    if (context.auth.uid !== userId)
        throw new functions.https.HttpsError('permission-denied', 'Нельзя записать комиссию за другого пользователя');
    if (typeof commission !== 'number' || commission <= 0)
        throw new functions.https.HttpsError('invalid-argument', 'Некорректная сумма комиссии');

    const db        = admin.firestore();
    const adminSnap = await db.collection('users').where('isAdmin', '==', true).limit(1).get();
    if (!adminSnap.empty) {
        await adminSnap.docs[0].ref.update({
            exchangeCoins: admin.firestore.FieldValue.increment(commission)
        });
    }
    await db.collection('exchange_commissions').add({
        userId, userName, type, assetId, assetSymbol, assetAmount, coinsAmount, commission,
        timestamp: admin.firestore.FieldValue.serverTimestamp()
    });
    return { success: true };
});
