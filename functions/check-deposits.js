const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });

const uid = process.argv[2];
if (!uid) { console.log('Usage: node check-deposits.js <UID>'); process.exit(1); }

admin.firestore().collection('deposits')
    .where('userId', '==', uid)
    .get()
    .then(snap => {
        if (snap.empty) { console.log('Депозитов нет'); process.exit(0); }
        snap.docs.forEach(doc => {
            const d = doc.data();
            console.log('\n─────────────────────────');
            console.log('ID:      ', doc.id);
            console.log('Статус:  ', d.status);
            console.log('Сумма:   ', d.amount);
            console.log('Заработано всего:', d.totalEarned);
            console.log('Открыт: ', d.createdAt?.toDate?.().toLocaleString('ru-RU'));
            console.log('Закрыт: ', d.closedAt?.toDate?.().toLocaleString('ru-RU') || '—');
            console.log('Последняя капитализация:', d.lastCompounded?.toDate?.().toLocaleString('ru-RU'));
        });
        process.exit(0);
    })
    .catch(e => { console.error(e.message); process.exit(1); });
