import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

admin.initializeApp();

// Депозиты удалены в новом сезоне.
// Файл оставлен для возможного добавления Cloud Functions в будущем.

export const placeholder = functions.https.onRequest((req, res) => {
    res.send('Gemi Cloud Functions');
});
