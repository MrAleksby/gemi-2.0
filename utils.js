// ─── Общие утилиты проекта ───────────────────────────────────────────────────

// ─── Управление модалками ────────────────────────────────────────────────────

const ALL_MODALS = ['rating-modal', 'shop-modal', 'crypto-modal', 'business-modal', 'chat-modal', 'invest-modal', 'deposit-modal'];

function hideAllModals() {
    ALL_MODALS.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
    });
    if (typeof stopCryptoPriceUpdates === 'function') stopCryptoPriceUpdates();
}

function showModal(id, display = 'flex') {
    hideAllModals();
    const el = document.getElementById(id);
    if (el) el.style.display = display;
}

// ─── Попапы (overlay + info-popup) ───────────────────────────────────────────

/**
 * Показывает попап с overlay.
 * @param {object} options
 * @param {string} options.title       — заголовок попапа
 * @param {string} options.content     — HTML-контент (строки, таблицы и т.д.)
 * @param {string} [options.titleStyle] — inline-стиль для заголовка (например "color:#27ae60;")
 * @param {string} [options.className]  — доп. класс для popup (например "badge-info-popup")
 * @param {string} [options.popupStyle] — inline-стиль для самого popup
 * @param {boolean} [options.showHint=true] — показывать "Кликните для закрытия"
 * @param {number|null} [options.timeout=5000] — авто-закрытие (null = не закрывать)
 * @returns {function} close — функция закрытия
 */
function showPopup(options) {
    const {
        title,
        content,
        titleStyle = '',
        className = '',
        popupStyle = '',
        showHint = true,
        timeout = 5000
    } = options;

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';

    const popup = document.createElement('div');
    popup.className = 'info-popup' + (className ? ' ' + className : '');
    if (popupStyle) popup.style.cssText = popupStyle;

    popup.innerHTML = `
        <div class="popup-title"${titleStyle ? ` style="${titleStyle}"` : ''}>${title}</div>
        ${content}
        ${showHint ? '<div class="popup-hint">Кликните для закрытия</div>' : ''}
    `;

    const close = () => { overlay.remove(); popup.remove(); };
    overlay.onclick = close;
    popup.onclick = close;
    document.body.appendChild(overlay);
    document.body.appendChild(popup);

    if (timeout) setTimeout(close, timeout);
    return close;
}

// ─── Тост-уведомления ────────────────────────────────────────────────────────

const TOAST_COLORS = {
    success: '#27ae60',
    error:   '#e53935',
    warning: '#f7931a',
    info:    '#1565c0'
};

/**
 * Показывает тост внизу экрана.
 * @param {string} message — текст
 * @param {'success'|'error'|'warning'|'info'} [type='success']
 * @param {number} [duration=4000] — время показа (мс)
 */
function showToast(message, type = 'success', duration = 4000) {
    const bg = TOAST_COLORS[type] || TOAST_COLORS.success;
    const toast = document.createElement('div');
    toast.className = 'toast-notification';
    toast.style.cssText = `
        position:fixed; bottom:80px; left:50%; transform:translateX(-50%);
        background:${bg}; color:#fff; padding:12px 20px; border-radius:14px;
        font-weight:600; font-size:0.95em; z-index:9999;
        box-shadow:0 4px 16px rgba(0,0,0,0.2); text-align:center;
        max-width:90vw; animation: toastIn 0.3s ease;
    `;
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => {
        toast.style.animation = 'toastOut 0.3s ease';
        setTimeout(() => toast.remove(), 300);
    }, duration);
}

// ─── Экранирование HTML ──────────────────────────────────────────────────────

/**
 * Экранирует спецсимволы HTML для защиты от XSS.
 * Использовать при вставке пользовательских данных в innerHTML.
 */
function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

/**
 * Экранирует строку для безопасной вставки в onclick="func('...')"
 */
function escapeAttr(str) {
    if (!str) return '';
    return String(str).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

/**
 * Переключает видимость пароля (глазик)
 */
function togglePwd(inputId, btn) {
    const input = document.getElementById(inputId);
    if (!input) return;
    const show = input.type === 'password';
    input.type = show ? 'text' : 'password';
    btn.textContent = show ? '🙈' : '👁';
    btn.classList.toggle('active', show);
}
