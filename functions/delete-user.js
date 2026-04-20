const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });

const uid = process.argv[2];
if (!uid) { console.log('Usage: node delete-user.js <UID>'); process.exit(1); }

async function run() {
    const db = admin.firestore();

    // 1. Получаем данные пользователя
    const userDoc = await db.collection('users').doc(uid).get();
    if (!userDoc.exists) {
        console.log('⚠️  Документ Firestore не найден, продолжаем...');
    } else {
        const d = userDoc.data();
        console.log('Удаляем:', d.name, '| телефон:', d.phone);

        // 2. Удаляем из usernames (маппинг телефон → uid)
        if (d.phone) {
            const phoneKey = d.phone.replace(/\D/g, '');
            await db.collection('usernames').doc(phoneKey).delete();
            console.log('✅ Удалён из usernames:', phoneKey);
        }

        // 3. Удаляем документ из users
        await db.collection('users').doc(uid).delete();
        console.log('✅ Удалён из Firestore users');
    }

    // 4. Удаляем из Firebase Auth
    await admin.auth().deleteUser(uid);
    console.log('✅ Удалён из Firebase Auth');

    console.log('\n✅ Аккаунт полностью удалён.');
}

run().catch(e => { console.error('❌ Ошибка:', e.message); process.exit(1); });
