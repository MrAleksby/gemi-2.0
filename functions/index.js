// runtime: nodejs22 (см. firebase.json)
// v1 API (1st-gen функции). В firebase-functions v6+ корневой импорт больше не
// содержит region/https/pubsub — берём их явно из подпути /v1.
const functions = require('firebase-functions/v1');
const admin     = require('firebase-admin');
admin.initializeApp();

// ─── Конфигурация активов ────────────────────────────────────────────────────
const ASSETS = [
    { id: 'btc',  symbol: 'BTC',  binance: 'BTCUSDT',  futures: false },
    { id: 'ton',  symbol: 'GRAM', binance: 'GRAMUSDT', futures: false },
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

            const userName = userData.name || 'Неизвестно';

            // Продажа выполняется в транзакции: внутри повторно читаем свежие
            // данные и заново проверяем, что позиция ещё открыта и SL/TP всё ещё
            // выставлены. Если другой (наложившийся или дублирующий) запуск
            // планировщика уже закрыл ордер — видим amount=0/SL=TP=0 и выходим.
            // Это исключает двойное начисление монет и опыта по одному ордеру.
            const p = (async () => {
                let sold = null;
                await db.runTransaction(async (tx) => {
                    const snap = await tx.get(userRef);
                    const d    = snap.data() || {};
                    const amt  = d[`${asset.id}Amount`] || 0;
                    if (amt <= 0) return; // позиция уже закрыта

                    const sl = d[`${asset.id}StopLoss`]   || 0;
                    const tp = d[`${asset.id}TakeProfit`] || 0;
                    let trig = null;
                    if (sl > 0 && price <= sl) trig = 'stopLoss';
                    if (tp > 0 && price >= tp) trig = 'takeProfit';
                    if (!trig) return; // SL/TP уже сброшены или больше не срабатывают

                    const avgPrice   = d[`${asset.id}AvgPrice`] || 0;
                    const coinsGross = amt * price;
                    const commission = coinsGross * 0.001;
                    const coinsNet   = Math.round((coinsGross - commission) * 100) / 100;
                    const pnl        = (price - avgPrice) * amt - commission;
                    const xpGain     = pnl > 0 ? Math.floor(pnl) : 0;

                    const userUpdate = {
                        exchangeCoins: admin.firestore.FieldValue.increment(coinsNet),
                        totalPnl:      admin.firestore.FieldValue.increment(pnl),
                        weeklyPnl:     admin.firestore.FieldValue.increment(pnl),
                        [`${asset.id}StopLoss`]:   0,
                        [`${asset.id}TakeProfit`]: 0,
                        [`${asset.id}Amount`]:     0,
                        [`${asset.id}AvgPrice`]:   0,
                        slTpNotifications: admin.firestore.FieldValue.arrayUnion({
                            assetId: asset.id, assetSymbol: asset.symbol,
                            type: trig, price, coinsNet, pnl, timestamp: Date.now(),
                        }),
                    };
                    if (xpGain > 0) userUpdate.points = admin.firestore.FieldValue.increment(xpGain);
                    tx.update(userRef, userUpdate);

                    sold = { trig, amt, coinsNet, commission, pnl };
                });

                if (!sold) return; // продажа не выполнена (уже обработано)

                // Комиссия → админу (только при реально выполненной продаже)
                if (adminRef) {
                    await adminRef.update({
                        exchangeCoins: admin.firestore.FieldValue.increment(sold.commission),
                    });
                }

                // Лог комиссии (та же коллекция что у обычных продаж)
                await db.collection('exchange_commissions').add({
                    userId:      userDoc.id,
                    userName,
                    type:        'sell_sltp',
                    trigger:     sold.trig,
                    assetId:     asset.id,
                    assetSymbol: asset.symbol,
                    assetAmount: sold.amt,
                    coinsNet:    sold.coinsNet,
                    commission:  sold.commission,
                    price,
                    pnl:         sold.pnl,
                    timestamp:   admin.firestore.FieldValue.serverTimestamp(),
                });

                // Запись сделки
                await db.collection('exchange_trades').add({
                    userId:      userDoc.id,
                    userName,
                    type:        'sell',
                    trigger:     sold.trig,
                    assetId:     asset.id,
                    assetSymbol: asset.symbol,
                    assetAmount: sold.amt,
                    price,
                    coinsAmount: sold.coinsNet,
                    commission:  sold.commission,
                    pnl:         sold.pnl,
                    timestamp:   admin.firestore.FieldValue.serverTimestamp(),
                });

                console.log(`[SL/TP] ${sold.trig} сработал: ${userName} продал ${sold.amt} ${asset.symbol} по цене ${price}, PnL=${sold.pnl.toFixed(2)}`);
            })();

            promises.push(p.catch(e => console.error(`Ошибка обработки ордера ${asset.id} для ${userDoc.id}:`, e.message)));
        }
    }

    await Promise.all(promises);
    return null;
});

// ─── Еженедельный сброс рейтинга инвесторов (отключён — сброс делается вручную через админку) ──
// Чтобы включить: раскомментировать блок ниже и задеплоить functions
//
// exports.resetWeeklyInvestorRating = functions.region('europe-west1').pubsub
//     .schedule('0 20 * * 1')
//     .timeZone('Asia/Tashkent')
//     .onRun(async () => {
//         const db = admin.firestore();
//         const snap = await db.collection('users').get();
//         const nonAdmins = snap.docs.filter(doc => doc.data().isAdmin !== true);
//         if (nonAdmins.length === 0) return null;
//         let winner = null;
//         nonAdmins.forEach(doc => {
//             const d = doc.data();
//             if (!d.name || !d.name.trim()) return;
//             const pnl = d.weeklyPnl || 0;
//             if (pnl > 0 && (!winner || pnl > winner.weeklyPnl)) {
//                 winner = { uid: doc.id, name: d.name, weeklyPnl: pnl };
//             }
//         });
//         if (winner) {
//             await db.collection('weekly_winners').add({
//                 uid: winner.uid, name: winner.name, weeklyPnl: winner.weeklyPnl,
//                 timestamp: admin.firestore.FieldValue.serverTimestamp(),
//             });
//         }
//         const batch = db.batch();
//         nonAdmins.forEach(doc => batch.update(doc.ref, { weeklyPnl: 0 }));
//         await batch.commit();
//         return null;
//     });

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

// ─── Идемпотентность операций ────────────────────────────────────────────────
// Маркеры выполненных операций в processed_ops/{opId} защищают onCall-функции
// от повторного начисления, когда клиент повторяет запрос (commit уже прошёл на
// сервере, но ответ потерян из-за обрыва сети). Маркер пишется атомарно вместе
// с мутацией внутри runTransaction. processed_ops пишется только Admin SDK —
// правила безопасности на него не нужны (Admin SDK их обходит).

// Перевод монет/CF между игроками — атомарно, с защитой от дублей.
async function transferBetweenPlayers(db, fromUid, toName, amount, field, opId, validate) {
    const fromRef = db.collection('users').doc(fromUid);

    const toSnap = await db.collection('users').where('name', '==', toName.trim()).limit(1).get();
    if (toSnap.empty) throw new functions.https.HttpsError('not-found', 'Пользователь не найден!');
    const toDocId   = toSnap.docs[0].id;
    const toDocName = toSnap.docs[0].data().name;
    if (toDocId === fromUid)
        throw new functions.https.HttpsError('invalid-argument', 'Нельзя переводить самому себе!');
    const toRef = db.collection('users').doc(toDocId);
    const opRef = opId ? db.collection('processed_ops').doc(String(opId)) : null;

    let skipped = false;
    await db.runTransaction(async (tx) => {
        if (opRef) {
            const opSnap = await tx.get(opRef);
            if (opSnap.exists) { skipped = true; return; }
        }
        const fromSnap = await tx.get(fromRef);
        if (!fromSnap.exists) throw new functions.https.HttpsError('not-found', 'Ваш профиль не найден');
        validate(fromSnap.data());
        tx.update(fromRef, {
            [field]:       admin.firestore.FieldValue.increment(-amount),
            transferCount: admin.firestore.FieldValue.increment(1)
        });
        tx.update(toRef, {
            [field]:           admin.firestore.FieldValue.increment(amount),
            receivedTransfers: admin.firestore.FieldValue.increment(1)
        });
        if (opRef) tx.set(opRef, {
            kind: 'transfer_' + field, fromUid, toUid: toDocId, amount,
            createdAt: admin.firestore.FieldValue.serverTimestamp()
        });
    });
    return { success: true, toName: toDocName, skipped };
}

// ─── Перевод монет между игроками (onCall) ────────────────────────────────────
exports.transferCoins = functions.region('europe-west1').https.onCall(async (data, context) => {
    if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'Необходима авторизация');
    const { toName, amount, opId } = data;
    if (!toName || typeof toName !== 'string' || !toName.trim())
        throw new functions.https.HttpsError('invalid-argument', 'Укажите имя получателя');
    if (!Number.isInteger(amount) || amount < 1)
        throw new functions.https.HttpsError('invalid-argument', 'Сумма должна быть целым числом ≥ 1');

    return transferBetweenPlayers(admin.firestore(), context.auth.uid, toName, amount, 'coins', opId, (d) => {
        if ((d.coins || 0) < amount)
            throw new functions.https.HttpsError('failed-precondition', `Недостаточно монет! У вас: ${d.coins || 0}`);
    });
});

// ─── Перевод CF между игроками (onCall) ──────────────────────────────────────
exports.transferCF = functions.region('europe-west1').https.onCall(async (data, context) => {
    if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'Необходима авторизация');
    const { toName, amount, opId } = data;
    if (!toName || typeof toName !== 'string' || !toName.trim())
        throw new functions.https.HttpsError('invalid-argument', 'Укажите имя получателя');
    if (typeof amount !== 'number' || amount < 1)
        throw new functions.https.HttpsError('invalid-argument', 'Сумма CF должна быть ≥ 1');

    return transferBetweenPlayers(admin.firestore(), context.auth.uid, toName, amount, 'cf', opId, (d) => {
        if ((d.cf || 0) < amount)
            throw new functions.https.HttpsError('failed-precondition', `Недостаточно CF! У вас: ${d.cf || 0}`);
    });
});

// ─── Работа у владельца бизнеса (onCall) ─────────────────────────────────────
exports.workForOwner = functions.region('europe-west1').https.onCall(async (data, context) => {
    if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'Необходима авторизация');
    const { bizId, opId } = data;
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

    // Защита от дублей: занимаем маркер opId перед начислениями. create()
    // атомарен — упадёт, если такой opId уже обработан (повтор запроса при
    // обрыве сети). Так начисления (зарплата + опыт + доход владельца) не
    // удвоятся. Маркер занимаем после всех проверок, чтобы неудачная попытка
    // не «съела» opId зря.
    if (opId) {
        try {
            await db.collection('processed_ops').doc(String(opId)).create({
                kind: 'work', bizId, workerUid, salary, ownerIncome,
                createdAt: admin.firestore.FieldValue.serverTimestamp()
            });
        } catch (e) {
            throw new functions.https.HttpsError('already-exists', 'Эта операция уже выполнена');
        }
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
    const { amount, source, userId, userName, label, opId } = data;
    if (context.auth.uid !== userId)
        throw new functions.https.HttpsError('permission-denied', 'Нельзя платить налог за другого пользователя');
    if (typeof amount !== 'number' || amount <= 0)
        throw new functions.https.HttpsError('invalid-argument', 'Некорректная сумма налога');

    const db        = admin.firestore();
    // opId для налога привязан к породившей операции вывода → добавляем суффикс,
    // чтобы маркер не конфликтовал с маркером самого перевода кошелька.
    const opRef     = opId ? db.collection('processed_ops').doc(String(opId) + ':tax') : null;
    const adminSnap = await db.collection('users').where('isAdmin', '==', true).limit(1).get();
    const adminRef  = adminSnap.empty ? null : adminSnap.docs[0].ref;

    let skipped = false;
    await db.runTransaction(async (tx) => {
        if (opRef) {
            const opSnap = await tx.get(opRef);
            if (opSnap.exists) { skipped = true; return; }
        }
        if (adminRef) tx.update(adminRef, {
            businessCoins: admin.firestore.FieldValue.increment(amount)
        });
        if (opRef) tx.set(opRef, {
            kind: 'tax', userId, amount, source,
            createdAt: admin.firestore.FieldValue.serverTimestamp()
        });
    });

    if (!skipped) {
        await db.collection('tax_log').add({
            userId, userName,
            amount, source,
            label: label || 'Налог',
            opId: opId || null,
            timestamp: admin.firestore.FieldValue.serverTimestamp()
        });
    }
    return { success: true, skipped };
});

// ─── Обмен CF → опыт + монеты (onCall) ────────────────────────────────────────
// cf/points/level защищены правилами (см. changesProtected в firestore.rules),
// поэтому обмен выполняется сервером через Admin SDK.

const LEVEL_THRESHOLDS_FN = [
    0, 30, 76, 136, 210, 300, 406, 526, 660, 810, 976, 1156, 1350, 1560, 1786,
    2026, 2280, 2550, 2836, 3136, 3450, 3780, 4126, 4486, 4860
];

function getLevelByPointsFn(points) {
    for (let i = LEVEL_THRESHOLDS_FN.length - 1; i >= 0; i--) {
        if (points >= LEVEL_THRESHOLDS_FN[i]) return i + 1;
    }
    return 1;
}

const CF_TO_POINTS_FN = 2;
const CF_TO_COINS_FN  = 2;

exports.exchangeCF = functions.region('europe-west1').https.onCall(async (data, context) => {
    if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'Необходима авторизация');
    const { amount, opId } = data;
    if (!Number.isInteger(amount) || amount < 1)
        throw new functions.https.HttpsError('invalid-argument', 'Сумма обмена — целое число ≥ 1');

    const db      = admin.firestore();
    const uid     = context.auth.uid;
    const userRef = db.collection('users').doc(uid);
    const opRef   = opId ? db.collection('processed_ops').doc(String(opId)) : null;

    const gainedPoints = amount * CF_TO_POINTS_FN;
    const gainedCoins  = amount * CF_TO_COINS_FN;

    let skipped = false;
    let result  = { cf: 0, points: 0, coins: 0, level: 1, name: '' };

    await db.runTransaction(async (tx) => {
        if (opRef) {
            const opSnap = await tx.get(opRef);
            if (opSnap.exists) { skipped = true; return; }
        }
        const snap = await tx.get(userRef);
        if (!snap.exists) throw new functions.https.HttpsError('not-found', 'Профиль не найден');
        const d = snap.data();
        const currentCF = d.cf || 0;
        if (currentCF < amount)
            throw new functions.https.HttpsError('failed-precondition',
                `Недостаточно CF! У вас: ${currentCF.toFixed(2)}`);

        const newCF     = currentCF - amount;
        const newPoints = (d.points || 0) + gainedPoints;
        const newCoins  = Math.round(((d.coins || 0) + gainedCoins) * 100) / 100;
        const newLevel  = getLevelByPointsFn(newPoints);

        tx.update(userRef, {
            cf: newCF, points: newPoints, coins: newCoins, level: newLevel,
            exchangeCount: admin.firestore.FieldValue.increment(1)
        });
        if (opRef) tx.set(opRef, {
            kind: 'exchange_cf', uid, amount,
            createdAt: admin.firestore.FieldValue.serverTimestamp()
        });

        result = { cf: newCF, points: newPoints, coins: newCoins, level: newLevel, name: d.name || '' };
    });

    if (skipped) {
        // Повтор запроса: мутация уже применена — отдаём актуальное состояние,
        // чтобы клиент показал правильный баланс.
        const snap = await userRef.get();
        const d    = snap.data() || {};
        return {
            success: true, skipped: true, gainedPoints, gainedCoins,
            cf: d.cf || 0, points: d.points || 0, coins: d.coins || 0,
            level: d.level || 1, name: d.name || ''
        };
    }

    // Формат совпадает с addTransactionRecord() в admin-actions.js
    await db.collection('transactions').add({
        username: result.name,
        amount,
        type: 'exchange',
        reason: `Обмен ${amount} CF → ${gainedPoints} ⭐ опыта + ${gainedCoins} 💰 монет`,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
        userId: uid,
        admin: false
    });

    return { success: true, skipped: false, gainedPoints, gainedCoins, ...result };
});

// ─── Выдача наград/бейджей (onCall) ───────────────────────────────────────────
// Бонус за бейдж включает points — поле защищено правилами, поэтому проверка
// условий и начисление выполняются сервером. Список должен совпадать с BADGES
// в main.js (иконки/названия остаются на клиенте, здесь только условия и тир).

const BADGE_TIER_BONUS_FN = {
    common:    { coins: 10,  points: 0  },
    rare:      { coins: 25,  points: 0  },
    superrare: { coins: 40,  points: 0  },
    epic:      { coins: 50,  points: 5  },
    mythic:    { coins: 100, points: 10 },
    legendary: { coins: 200, points: 25 }
};

const BADGES_FN = [
    { id: 'game_1',  tier: 'common',    check: d => (d.games || 0) >= 1  },
    { id: 'game_4',  tier: 'common',    check: d => (d.games || 0) >= 4  },
    { id: 'game_8',  tier: 'rare',      check: d => (d.games || 0) >= 8  },
    { id: 'game_12', tier: 'rare',      check: d => (d.games || 0) >= 12 },
    { id: 'game_16', tier: 'superrare', check: d => (d.games || 0) >= 16 },
    { id: 'game_20', tier: 'epic',      check: d => (d.games || 0) >= 20 },
    { id: 'game_24', tier: 'mythic',    check: d => (d.games || 0) >= 24 },
    { id: 'game_30', tier: 'legendary', check: d => (d.games || 0) >= 30 },
    { id: 'win_1',   tier: 'common',    check: d => (d.wins || 0) >= 1  },
    { id: 'win_3',   tier: 'rare',      check: d => (d.wins || 0) >= 3  },
    { id: 'win_8',   tier: 'superrare', check: d => (d.wins || 0) >= 8  },
    { id: 'win_12',  tier: 'epic',      check: d => (d.wins || 0) >= 12 },
    { id: 'win_16',  tier: 'mythic',    check: d => (d.wins || 0) >= 16 },
    { id: 'win_20',  tier: 'legendary', check: d => (d.wins || 0) >= 20 },
    { id: 'kd_05',   tier: 'superrare', check: d => (d.games || 0) >= 5 && (d.wins || 0) / (d.games || 1) >= 0.5 },
    { id: 'kd_07',   tier: 'epic',      check: d => (d.games || 0) >= 5 && (d.wins || 0) / (d.games || 1) >= 0.7 },
    { id: 'kd_09',   tier: 'mythic',    check: d => (d.games || 0) >= 5 && (d.wins || 0) / (d.games || 1) >= 0.9 },
    { id: 'cf_100',  tier: 'common',    check: d => (d.cf || 0) >= 100  },
    { id: 'cf_300',  tier: 'rare',      check: d => (d.cf || 0) >= 300  },
    { id: 'cf_500',  tier: 'superrare', check: d => (d.cf || 0) >= 500  },
    { id: 'cf_1000', tier: 'epic',      check: d => (d.cf || 0) >= 1000 },
    { id: 'cf_1500', tier: 'mythic',    check: d => (d.cf || 0) >= 1500 },
    { id: 'coin_100',   tier: 'common',    check: d => (d.coins || 0) >= 100   },
    { id: 'coin_500',   tier: 'rare',      check: d => (d.coins || 0) >= 500   },
    { id: 'coin_1000',  tier: 'superrare', check: d => (d.coins || 0) >= 1000  },
    { id: 'coin_2000',  tier: 'epic',      check: d => (d.coins || 0) >= 2000  },
    { id: 'coin_3000',  tier: 'epic',      check: d => (d.coins || 0) >= 3000  },
    { id: 'coin_5000',  tier: 'mythic',    check: d => (d.coins || 0) >= 5000  },
    { id: 'coin_10000', tier: 'legendary', check: d => (d.coins || 0) >= 10000 },
    { id: 'exp_50',  tier: 'common',    check: d => (d.points || 0) >= 50  },
    { id: 'exp_150', tier: 'rare',      check: d => (d.points || 0) >= 150 },
    { id: 'exp_300', tier: 'superrare', check: d => (d.points || 0) >= 300 },
    { id: 'exp_500', tier: 'legendary', check: d => (d.points || 0) >= 500 },
    { id: 'lvl_5',   tier: 'rare',      check: d => getLevelByPointsFn(d.points || 0) >= 5  },
    { id: 'lvl_10',  tier: 'superrare', check: d => getLevelByPointsFn(d.points || 0) >= 10 },
    { id: 'lvl_15',  tier: 'epic',      check: d => getLevelByPointsFn(d.points || 0) >= 15 },
    { id: 'lvl_20',  tier: 'mythic',    check: d => getLevelByPointsFn(d.points || 0) >= 20 },
    { id: 'lvl_25',  tier: 'legendary', check: d => getLevelByPointsFn(d.points || 0) >= 25 },
    { id: 'first_req',   tier: 'common',    check: d => (d.totalRequests || 0) >= 1 },
    { id: 'reliable',    tier: 'superrare', check: d => (d.approvedRequests || 0) >= 5 && !(d.rejectedRequests > 0) },
    { id: 'top3_rank',   tier: 'epic',      check: d => (d.bestRank || 99) <= 3 },
    { id: 'silent_hunt', tier: 'mythic',    check: d => (d.games || 0) >= 10 && (d.wins || 0) / (d.games || 1) >= 0.8 },
    { id: 'top1_rank',   tier: 'legendary', check: d => (d.bestRank || 99) <= 1 }
];

exports.awardBadges = functions.region('europe-west1').https.onCall(async (data, context) => {
    if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'Необходима авторизация');

    const db      = admin.firestore();
    const userRef = db.collection('users').doc(context.auth.uid);

    let awarded = [];
    let badges  = [];

    await db.runTransaction(async (tx) => {
        const snap = await tx.get(userRef);
        if (!snap.exists) throw new functions.https.HttpsError('not-found', 'Профиль не найден');
        const d      = snap.data();
        const earned = new Set(Array.isArray(d.badges) ? d.badges : []);

        awarded = BADGES_FN
            .filter(b => !earned.has(b.id) && (() => { try { return b.check(d); } catch (e) { return false; } })())
            .map(b => b.id);

        badges = [...earned, ...awarded];
        if (awarded.length === 0) return;

        let bonusCoins = 0, bonusPoints = 0;
        awarded.forEach(id => {
            const b = BADGES_FN.find(x => x.id === id);
            const bonus = BADGE_TIER_BONUS_FN[b.tier] || { coins: 0, points: 0 };
            bonusCoins  += bonus.coins;
            bonusPoints += bonus.points;
        });

        const update = { badges };
        if (bonusCoins  > 0) update.coins  = Math.round(((d.coins || 0) + bonusCoins) * 100) / 100;
        if (bonusPoints > 0) {
            update.points = (d.points || 0) + bonusPoints;
            update.level  = getLevelByPointsFn(update.points);
        }
        tx.update(userRef, update);
    });

    return { success: true, awarded, badges };
});

// ─── Торговая комиссия → Админу (onCall) ──────────────────────────────────────
exports.addTradeCommission = functions.region('europe-west1').https.onCall(async (data, context) => {
    if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'Необходима авторизация');
    const { userId, userName, type, assetId, assetSymbol, assetAmount, coinsAmount, commission, opId } = data;
    if (context.auth.uid !== userId)
        throw new functions.https.HttpsError('permission-denied', 'Нельзя записать комиссию за другого пользователя');
    if (typeof commission !== 'number' || commission <= 0)
        throw new functions.https.HttpsError('invalid-argument', 'Некорректная сумма комиссии');

    const db        = admin.firestore();
    const opRef     = opId ? db.collection('processed_ops').doc(String(opId)) : null;
    const adminSnap = await db.collection('users').where('isAdmin', '==', true).limit(1).get();
    const adminRef  = adminSnap.empty ? null : adminSnap.docs[0].ref;

    let skipped = false;
    await db.runTransaction(async (tx) => {
        if (opRef) {
            const opSnap = await tx.get(opRef);
            if (opSnap.exists) { skipped = true; return; }
        }
        if (adminRef) tx.update(adminRef, {
            exchangeCoins: admin.firestore.FieldValue.increment(commission)
        });
        if (opRef) tx.set(opRef, {
            kind: 'commission', userId, commission, type, assetId,
            createdAt: admin.firestore.FieldValue.serverTimestamp()
        });
    });

    if (!skipped) {
        await db.collection('exchange_commissions').add({
            userId, userName, type, assetId, assetSymbol, assetAmount, coinsAmount, commission,
            opId: opId || null,
            timestamp: admin.firestore.FieldValue.serverTimestamp()
        });
    }
    return { success: true, skipped };
});
