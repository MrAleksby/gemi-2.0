document.addEventListener('DOMContentLoaded', () => {
    const showBtn       = document.getElementById('show-transfer-form');
    const formContainer = document.getElementById('transfer-form-container');
    if (!showBtn || !formContainer) return;

    showBtn.onclick = () => {
        if (formContainer.style.display !== 'none' && formContainer.innerHTML) {
            formContainer.style.display = 'none';
            formContainer.innerHTML = '';
            return;
        }

        formContainer.innerHTML = `
            <div class="transfer-tabs">
                <button class="transfer-tab active" data-type="coins">💰 Монеты</button>
                <button class="transfer-tab" data-type="cf">💎 CF</button>
            </div>
            <form id="transfer-form">
                <input type="text" id="transfer-to" placeholder="Имя получателя" required autocomplete="off">
                <input type="number" id="transfer-amount" placeholder="Количество монет" min="1" required>
                <button type="submit">Отправить</button>
                <div id="transfer-message" class="transfer-message"></div>
            </form>
        `;
        formContainer.style.display = '';

        let transferType = 'coins';
        const amountInput = document.getElementById('transfer-amount');

        formContainer.querySelectorAll('.transfer-tab').forEach(tab => {
            tab.onclick = () => {
                formContainer.querySelectorAll('.transfer-tab').forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                transferType = tab.dataset.type;
                amountInput.placeholder = transferType === 'coins' ? 'Количество монет' : 'Количество CF';
                amountInput.value = '';
            };
        });

        document.getElementById('transfer-to').focus();

        document.getElementById('transfer-form').onsubmit = async (e) => {
            e.preventDefault();
            const toName = document.getElementById('transfer-to').value.trim();
            const amount = parseInt(amountInput.value, 10);
            const msg    = document.getElementById('transfer-message');
            msg.textContent = '';
            msg.className   = 'transfer-message';

            if (!toName || isNaN(amount) || amount <= 0) {
                msg.textContent = 'Введите корректные данные!';
                msg.classList.add('error');
                return;
            }

            try {
                const user = firebase.auth().currentUser;
                if (!user) throw new Error('Войдите в аккаунт!');

                const fromRef  = firebase.firestore().collection('users').doc(user.uid);
                const fromDoc  = await fromRef.get();
                if (!fromDoc.exists) throw new Error('Профиль не найден!');
                const fromData = fromDoc.data();

                const fieldName = transferType === 'coins' ? 'монет' : 'CF';
                if ((fromData[transferType] || 0) < amount) {
                    throw new Error(`Недостаточно ${fieldName}!`);
                }

                const usersSnap = await firebase.firestore().collection('users').get();
                const toDoc     = usersSnap.docs.find(doc =>
                    doc.data().name && doc.data().name.trim().toLowerCase() === toName.toLowerCase()
                );
                if (!toDoc) throw new Error('Пользователь не найден!');
                if (toDoc.id === user.uid) throw new Error(`Нельзя переводить ${fieldName} самому себе!`);

                const batch = firebase.firestore().batch();
                batch.update(fromRef, { [transferType]: (fromData[transferType] || 0) - amount });
                batch.update(toDoc.ref, { [transferType]: (toDoc.data()[transferType] || 0) + amount });
                await batch.commit();

                msg.textContent = `Успешно переведено ${amount} ${fieldName} игроку ${toDoc.data().name}!`;
                msg.classList.add('success');
                document.getElementById('transfer-to').value = '';
                amountInput.value = '';

                if (typeof showProfile === 'function') showProfile();
                if (typeof showRating  === 'function') showRating();
            } catch (err) {
                msg.textContent = err.message || 'Ошибка перевода!';
                msg.classList.add('error');
            }
        };
    };
});
