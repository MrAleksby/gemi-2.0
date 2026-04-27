// Одноразовый скрипт: сохранить победителя недели + сбросить weeklyPnl
// Запуск: node run-weekly-reset.js
process.env.GOOGLE_CLOUD_PROJECT = 'gemini-3e76f';

const admin = require('firebase-admin');
admin.initializeApp({ projectId: 'gemini-3e76f' });
const db = admin.firestore();

async function run() {
    const snap = await db.collection('users').get();
    const nonAdmins = snap.docs.filter(doc => doc.data().isAdmin !== true);

    console.log(`Найдено игроков: ${nonAdmins.length}`);

    // Выводим текущий weeklyPnl всех
    nonAdmins.forEach(doc => {
        const d = doc.data();
        if (d.weeklyPnl) console.log(`  ${d.name}: weeklyPnl=${d.weeklyPnl}`);
    });

    // Ищем победителя
    let winner = null;
    nonAdmins.forEach(doc => {
        const d = doc.data();
        if (!d.name || !d.name.trim()) return;
        const pnl = d.weeklyPnl || 0;
        if (pnl > 0 && (!winner || pnl > winner.weeklyPnl)) {
            winner = { uid: doc.id, name: d.name, weeklyPnl: pnl };
        }
    });

    if (winner) {
        console.log(`\n🏆 Победитель: ${winner.name}, PnL=+${winner.weeklyPnl.toFixed(2)}`);
        await db.collection('weekly_winners').add({
            uid:       winner.uid,
            name:      winner.name,
            weeklyPnl: winner.weeklyPnl,
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
        });
        console.log('✅ Победитель сохранён в weekly_winners');
    } else {
        console.log('\nНет победителя (никто не в плюсе за неделю)');
    }

    // Сброс weeklyPnl
    const batch = db.batch();
    nonAdmins.forEach(doc => batch.update(doc.ref, { weeklyPnl: 0 }));
    await batch.commit();
    console.log('✅ weeklyPnl сброшен у всех игроков');
}

run().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
