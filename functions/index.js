const functions = require('firebase-functions');
const admin     = require('firebase-admin');
admin.initializeApp();

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
