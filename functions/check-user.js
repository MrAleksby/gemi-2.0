const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });

const uid = process.argv[2];
if (!uid) { console.log('Usage: node check-user.js <UID>'); process.exit(1); }

Promise.all([
    admin.auth().getUser(uid),
    admin.firestore().collection('users').doc(uid).get()
]).then(([authUser, fsDoc]) => {
    console.log('\n=== Firebase Auth ===');
    console.log('Email:', authUser.email);
    console.log('Created:', new Date(authUser.metadata.creationTime).toLocaleString());
    console.log('Last sign-in:', new Date(authUser.metadata.lastSignInTime).toLocaleString());

    console.log('\n=== Firestore ===');
    if (!fsDoc.exists) {
        console.log('❌ Документ в Firestore НЕ НАЙДЕН!');
    } else {
        const d = fsDoc.data();
        console.log('Имя:', d.name || '(нет)');
        console.log('Монеты:', d.coins);
        console.log('Баллы:', d.points);
        console.log('Уровень:', d.level);
        console.log('isAdmin:', d.isAdmin);
        console.log('status:', d.status);
        console.log('totalPnl:', d.totalPnl);
        console.log('energy:', d.energy);
        console.log('\n--- Все поля ---');
        console.log(JSON.stringify(d, null, 2));
    }
    process.exit(0);
}).catch(e => { console.error('Ошибка:', e.message); process.exit(1); });
