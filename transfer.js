document.addEventListener('DOMContentLoaded', () => {
  const showBtn = document.getElementById('show-transfer-form');
  const formContainer = document.getElementById('transfer-form-container');
  if (!showBtn || !formContainer) return;

  showBtn.onclick = () => {
    if (formContainer.style.display === 'none' || !formContainer.style.display) {
      formContainer.innerHTML = `
        <form id="transfer-form">
          <input type="text" id="transfer-to" placeholder="Имя получателя" required autocomplete="off">
          <input type="number" id="transfer-amount" placeholder="Сколько монет" min="1" required>
          <button type="submit">Отправить</button>
          <div id="transfer-message" class="transfer-message"></div>
        </form>
      `;
      formContainer.style.display = '';
      document.getElementById('transfer-to').focus();
      document.getElementById('transfer-form').onsubmit = async (e) => {
        e.preventDefault();
        const toName = document.getElementById('transfer-to').value.trim();
        const amount = parseInt(document.getElementById('transfer-amount').value, 10);
        const msg = document.getElementById('transfer-message');
        msg.textContent = '';
        msg.className = 'transfer-message';
        if (!toName || isNaN(amount) || amount <= 0) {
          msg.textContent = 'Введите корректные данные!';
          msg.classList.add('error');
          return;
        }
        try {
          const user = firebase.auth().currentUser;
          if (!user) throw new Error('Войдите в аккаунт!');
          const fromRef = firebase.firestore().collection('users').doc(user.uid);
          const fromDoc = await fromRef.get();
          if (!fromDoc.exists) throw new Error('Профиль не найден!');
          const fromData = fromDoc.data();
          if ((fromData.coins || 0) < amount) throw new Error('Недостаточно монет!');
          // Поиск получателя по имени (без учёта регистра и пробелов)
          const usersSnap = await firebase.firestore().collection('users').get();
          const toDoc = usersSnap.docs.find(doc => doc.data().name && doc.data().name.trim().toLowerCase() === toName.toLowerCase());
          if (!toDoc) throw new Error('Пользователь не найден!');
          if (toDoc.id === user.uid) throw new Error('Нельзя переводить монеты самому себе!');
          // Перевод монет (batch)
          const batch = firebase.firestore().batch();
          batch.update(fromRef, { coins: (fromData.coins || 0) - amount });
          batch.update(toDoc.ref, { coins: (toDoc.data().coins || 0) + amount });
          await batch.commit();
          msg.textContent = `Успешно переведено ${amount} монет пользователю ${toDoc.data().name}!`;
          msg.classList.add('success');
          document.getElementById('transfer-to').value = '';
          document.getElementById('transfer-amount').value = '';
          if (typeof showProfile === 'function') showProfile();
          if (typeof showRating === 'function') showRating();
        } catch (err) {
          msg.textContent = err.message || 'Ошибка перевода!';
          msg.classList.add('error');
        }
      };
    } else {
      formContainer.style.display = 'none';
      formContainer.innerHTML = '';
    }
  };
}); 