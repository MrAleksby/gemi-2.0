const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });

const query = process.argv[2];
if (!query) { console.log('Usage: node find-user.js <имя или телефон>'); process.exit(1); }

admin.firestore().collection('users').get().then(snap => {
    const q = query.toLowerCase();
    const found = snap.docs.filter(doc => {
        const d = doc.data();
        return (d.name || '').toLowerCase().includes(q) ||
               (d.phone || '').includes(q);
    });

    if (!found.length) { console.log('❌ Не найдено:', query); process.exit(0); }

    found.forEach(doc => {
        const d = doc.data();
        console.log('\n─────────────────────────');
        console.log('UID:    ', doc.id);
        console.log('Имя:    ', d.name);
        console.log('Телефон:', d.phone);
        console.log('Монеты: ', d.coins);
        console.log('Баллы:  ', d.points);
        console.log('Уровень:', d.level);
        console.log('Статус: ', d.status);
    });
    process.exit(0);
}).catch(e => { console.error('Ошибка:', e.message); process.exit(1); });
