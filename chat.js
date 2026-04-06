// ─── Chat ─────────────────────────────────────────────────────────────────────

let currentChatId        = null;
let currentChatOtherUid  = null;
let currentChatOtherName = null;
let unsubChatMessages    = null;
let unsubChatList        = null;
let unsubChatBadge       = null;

function getChatId(uid1, uid2) {
    return [uid1, uid2].sort().join('_');
}

// ─── Открыть вкладку чата (список переписок) ──────────────────────────────────

function openChatModal() {
    document.getElementById('rating-modal').style.display   = 'none';
    document.getElementById('shop-modal').style.display     = 'none';
    document.getElementById('crypto-modal').style.display   = 'none';
    document.getElementById('business-modal').style.display = 'none';
    if (typeof stopCryptoPriceUpdates === 'function') stopCryptoPriceUpdates();
    document.getElementById('chat-modal').style.display = 'flex';
    showChatList();
}

// ─── Список всех переписок ────────────────────────────────────────────────────

function showChatList() {
    // Отписываемся от сообщений если вернулись из чата
    if (unsubChatMessages) { unsubChatMessages(); unsubChatMessages = null; }
    currentChatId = null;

    const user = firebase.auth().currentUser;
    if (!user) return;

    const container = document.getElementById('chat-content');
    container.innerHTML = `
        <div style="padding:16px 16px 10px;font-size:1.1em;font-weight:700;color:#5c1f4a;">💬 Сообщения</div>
        <div id="chat-list-container" style="padding:0 8px 16px;">
            <div style="text-align:center;color:#aaa;padding:20px;">Загрузка...</div>
        </div>
    `;

    if (unsubChatList) { unsubChatList(); unsubChatList = null; }

    unsubChatList = firebase.firestore()
        .collection('chats')
        .where('participants', 'array-contains', user.uid)
        .onSnapshot(snap => {
            const listEl = document.getElementById('chat-list-container');
            if (!listEl) return;

            // Сортируем на клиенте — не нужен индекс Firestore
            const sorted = snap.docs.sort((a, b) => {
                const at = a.data().lastMessageTime?.toMillis() || 0;
                const bt = b.data().lastMessageTime?.toMillis() || 0;
                return bt - at;
            });

            if (sorted.length === 0) {
                listEl.innerHTML = `
                    <div style="text-align:center;color:#aaa;padding:40px 16px;">
                        <div style="font-size:2.5em;margin-bottom:10px;">💬</div>
                        <div style="font-weight:600;margin-bottom:4px;">Нет сообщений</div>
                        <div style="font-size:0.85em;">Найди игрока в Рейтинге и напиши первым!</div>
                    </div>`;
                return;
            }

            listEl.innerHTML = sorted.map(doc => {
                const data     = doc.data();
                const otherUid = data.participants.find(p => p !== user.uid);
                const otherName = data[`name_${otherUid}`] || 'Игрок';
                const unread   = data[`unread_${user.uid}`] || 0;
                const lastMsg  = data.lastMessage || '';
                const time     = data.lastMessageTime
                    ? data.lastMessageTime.toDate().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
                    : '';
                const avatar   = otherName.charAt(0).toUpperCase();
                const safeName = otherName.replace(/\\/g, '\\\\').replace(/'/g, "\\'");

                return `
                <div onclick="openChat('${otherUid}','${safeName}')"
                     style="display:flex;align-items:center;gap:12px;padding:12px;border-radius:14px;cursor:pointer;margin-bottom:6px;background:#fff;box-shadow:0 1px 5px rgba(0,0,0,0.07);">
                    <div style="width:46px;height:46px;border-radius:50%;background:linear-gradient(135deg,#5c1f4a,#e8956d);display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:1.15em;flex-shrink:0;">
                        ${avatar}
                    </div>
                    <div style="flex:1;min-width:0;">
                        <div style="font-weight:700;color:#222;font-size:0.95em;margin-bottom:2px;">${otherName}</div>
                        <div style="color:#888;font-size:0.82em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${lastMsg}</div>
                    </div>
                    <div style="display:flex;flex-direction:column;align-items:flex-end;gap:5px;flex-shrink:0;">
                        <div style="font-size:0.72em;color:#bbb;">${time}</div>
                        ${unread > 0
                            ? `<div style="background:#e53935;color:#fff;border-radius:50%;min-width:20px;height:20px;display:flex;align-items:center;justify-content:center;font-size:0.72em;font-weight:700;padding:0 4px;">${unread > 9 ? '9+' : unread}</div>`
                            : ''}
                    </div>
                </div>`;
            }).join('');
        }, err => {
            console.warn('chat list error:', err);
        });
}

// ─── Открыть конкретный чат ───────────────────────────────────────────────────

async function openChat(otherUid, otherName) {
    const user = firebase.auth().currentUser;
    if (!user) return;

    // Если открываем из рейтинга — переключаемся на вкладку чата
    document.getElementById('rating-modal').style.display = 'none';
    document.getElementById('chat-modal').style.display   = 'flex';
    if (typeof setNavTab === 'function') setNavTab('chat');

    currentChatOtherUid  = otherUid;
    currentChatOtherName = otherName;
    currentChatId        = getChatId(user.uid, otherUid);

    const avatar = otherName.charAt(0).toUpperCase();

    const container = document.getElementById('chat-content');
    container.innerHTML = `
        <div style="display:flex;align-items:center;gap:10px;padding:12px 14px;border-bottom:1px solid #f0f0f0;background:#fff;position:sticky;top:0;z-index:10;">
            <button onclick="showChatList()" style="background:none;border:none;font-size:1.4em;cursor:pointer;color:#5c1f4a;line-height:1;padding:2px 6px 2px 0;">‹</button>
            <div style="width:38px;height:38px;border-radius:50%;background:linear-gradient(135deg,#5c1f4a,#e8956d);display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:1em;flex-shrink:0;">
                ${avatar}
            </div>
            <div style="font-weight:700;color:#222;font-size:0.97em;">${otherName}</div>
        </div>
        <div id="chat-messages" style="flex:1;overflow-y:auto;padding:12px 14px;display:flex;flex-direction:column;gap:6px;"></div>
        <div style="padding:10px 12px;border-top:1px solid #f0f0f0;background:#fff;display:flex;gap:8px;align-items:center;">
            <input id="chat-input" type="text" placeholder="Сообщение..."
                style="flex:1;padding:10px 14px;border:1.5px solid #e0e0e0;border-radius:22px;font-size:0.92em;outline:none;background:#fafafa;"
                onkeydown="if(event.key==='Enter')sendChatMessage()">
            <button onclick="sendChatMessage()"
                style="width:42px;height:42px;border-radius:50%;background:linear-gradient(135deg,#5c1f4a,#e8956d);color:#fff;border:none;font-size:1em;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;">➤</button>
        </div>
    `;

    await markChatAsRead(currentChatId, user.uid);

    if (unsubChatMessages) { unsubChatMessages(); unsubChatMessages = null; }

    unsubChatMessages = firebase.firestore()
        .collection('chats').doc(currentChatId)
        .collection('messages')
        .orderBy('timestamp', 'asc')
        .onSnapshot(snap => {
            const messagesEl = document.getElementById('chat-messages');
            if (!messagesEl) return;

            if (snap.empty) {
                messagesEl.innerHTML = `<div style="text-align:center;color:#bbb;padding:30px 16px;font-size:0.9em;">Начни переписку первым! 👋</div>`;
                return;
            }

            messagesEl.innerHTML = snap.docs.map(doc => {
                const msg  = doc.data();
                const isMe = msg.senderId === user.uid;
                const time = msg.timestamp
                    ? msg.timestamp.toDate().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
                    : '';
                return `
                <div style="display:flex;flex-direction:column;align-items:${isMe ? 'flex-end' : 'flex-start'};">
                    <div style="max-width:78%;padding:9px 13px;border-radius:${isMe ? '16px 16px 4px 16px' : '16px 16px 16px 4px'};
                        background:${isMe ? 'linear-gradient(135deg,#5c1f4a,#e8956d)' : '#f0f0f0'};
                        color:${isMe ? '#fff' : '#222'};font-size:0.92em;word-break:break-word;line-height:1.4;">
                        ${msg.text}
                    </div>
                    <div style="font-size:0.7em;color:#bbb;margin-top:2px;padding:0 4px;">${time}</div>
                </div>`;
            }).join('');

            messagesEl.scrollTop = messagesEl.scrollHeight;
            markChatAsRead(currentChatId, user.uid);
        }, err => {
            console.warn('chat messages error:', err);
        });
}

// ─── Отправить сообщение ──────────────────────────────────────────────────────

async function sendChatMessage() {
    const input = document.getElementById('chat-input');
    const text  = input?.value?.trim();
    if (!text || !currentChatId || !currentChatOtherUid) return;

    const user = firebase.auth().currentUser;
    if (!user) return;

    input.value = '';
    input.focus();

    try {
        const db      = firebase.firestore();
        const chatRef = db.collection('chats').doc(currentChatId);
        const msgRef  = chatRef.collection('messages').doc();

        // Получаем имена обоих участников
        const [senderSnap, chatSnap] = await Promise.all([
            db.collection('users').doc(user.uid).get(),
            chatRef.get()
        ]);
        const senderName = senderSnap.data()?.name || 'Игрок';

        const chatData = chatSnap.data() || {};
        const updateData = {
            participants:    [user.uid, currentChatOtherUid],
            lastMessage:     text,
            lastMessageTime: firebase.firestore.FieldValue.serverTimestamp(),
            [`name_${user.uid}`]: senderName,
            [`unread_${currentChatOtherUid}`]: firebase.firestore.FieldValue.increment(1),
            [`unread_${user.uid}`]: 0
        };

        // Сохраняем имя собеседника если ещё не сохранено
        if (!chatData[`name_${currentChatOtherUid}`]) {
            const otherSnap = await db.collection('users').doc(currentChatOtherUid).get();
            updateData[`name_${currentChatOtherUid}`] = otherSnap.data()?.name || 'Игрок';
        }

        const batch = db.batch();
        batch.set(msgRef, {
            senderId:  user.uid,
            text,
            timestamp: firebase.firestore.FieldValue.serverTimestamp()
        });
        batch.set(chatRef, updateData, { merge: true });
        await batch.commit();

    } catch(e) {
        console.error('sendChatMessage error:', e);
    }
}

// ─── Пометить как прочитанное ─────────────────────────────────────────────────

async function markChatAsRead(chatId, uid) {
    try {
        await firebase.firestore().collection('chats').doc(chatId)
            .set({ [`unread_${uid}`]: 0 }, { merge: true });
    } catch(e) {}
}

// ─── Бейдж непрочитанных на иконке таба ──────────────────────────────────────

function setupChatBadge(uid) {
    if (unsubChatBadge) { unsubChatBadge(); unsubChatBadge = null; }

    unsubChatBadge = firebase.firestore()
        .collection('chats')
        .where('participants', 'array-contains', uid)
        .onSnapshot(snap => {
            const total = snap.docs.reduce((sum, doc) => sum + (doc.data()[`unread_${uid}`] || 0), 0);
            const badge = document.getElementById('chat-unread-badge');
            if (badge) {
                badge.style.display = total > 0 ? 'flex' : 'none';
                badge.textContent   = total > 9 ? '9+' : String(total);
            }
        }, () => {});
}
