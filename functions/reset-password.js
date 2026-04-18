/**
 * Сброс пароля игрока через Firebase Admin SDK
 * Запуск: node reset-password.js <UID> <новый_пароль>
 *
 * Как получить UID:
 *   Firebase Console → Authentication → Users → кликни на строку игрока
 *
 * Как получить serviceAccountKey.json:
 *   Firebase Console → Project Settings (⚙️) → Service accounts → "Generate new private key"
 *   Сохрани как: /Users/Aleks/Documents/gemi2/functions/serviceAccountKey.json
 */

const admin = require('firebase-admin');
const path  = require('path');

const KEY_PATH = path.join(__dirname, 'serviceAccountKey.json');

let serviceAccount;
try {
    serviceAccount = require(KEY_PATH);
} catch(e) {
    console.error('❌ Не найден файл serviceAccountKey.json');
    console.error('   Скачай его: Firebase Console → Project Settings → Service accounts → Generate new private key');
    console.error('   Сохрани как: ' + KEY_PATH);
    process.exit(1);
}

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });

const uid         = process.argv[2];
const newPassword = process.argv[3];

if (!uid || !newPassword) {
    console.log('Использование: node reset-password.js <UID> <новый_пароль>');
    console.log('Пример:        node reset-password.js abc123xyz newpass456');
    process.exit(1);
}

if (newPassword.length < 4) {
    console.error('❌ Пароль должен быть не менее 4 символов');
    process.exit(1);
}

admin.auth().updateUser(uid, { password: newPassword })
    .then(() => {
        console.log('✅ Пароль успешно изменён для UID:', uid);
        console.log('   Игрок может войти с новым паролем:', newPassword);
        process.exit(0);
    })
    .catch(err => {
        console.error('❌ Ошибка:', err.message);
        process.exit(1);
    });
