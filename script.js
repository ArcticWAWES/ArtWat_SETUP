// ═══════════════════════════════════════════════════════════
//  ArtWat Setup — VK Mini App
//  Путь B + чеклист + скачивание аватарки
// ═══════════════════════════════════════════════════════════

// ─── КОНФИГУРАЦИЯ ───────────────────────────────────────────
const APP_ID = 54818456;

const USER_SCOPE      = 'groups';
const COMMUNITY_SCOPE = 'manage,messages,photos,docs';

// Путь к аватарке, которая лежит рядом с index.html
const AVATAR_URL = 'avatar.png';

// ─── СОСТОЯНИЕ ──────────────────────────────────────────────
const state = {
    userToken:       null,
    communities:     [],
    selectedGroupId: null,
    communityToken:  null,
    longPollEnabled: false,
    messagesAllowed: false,
    checklistDone:   false,
    settingsUrl:     ''
};

let vkReadyPromise = null;

// ─── UI-УТИЛИТЫ ─────────────────────────────────────────────

const $ = (id) => document.getElementById(id);

function showScreen(name) {
    ['welcome', 'loading', 'communities', 'checklist', 'success', 'error'].forEach(s => {
        const el = $('screen-' + s);
        if (el) el.classList.toggle('hidden', s !== name);
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function setProgress(text, stepNum, stepTotal) {
    $('progress-text').textContent = text;
    $('progress-step').textContent = `Шаг ${stepNum} из ${stepTotal}`;
}

function showError(details) {
    $('error-details').textContent = details;
    showScreen('error');
}

function showToast(message) {
    const toast = $('toast');
    toast.textContent = message;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 2000);
}

function toggleHelp() {
    $('help-block').classList.toggle('hidden');
}

function escapeHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

// ─── ОСНОВНАЯ ЛОГИКА ────────────────────────────────────────

async function startSetup() {
    showScreen('loading');
    setProgress('Инициализация...', 1, 5);

    try {
        if (vkReadyPromise) await vkReadyPromise;

        setProgress('Запрос разрешений...', 2, 5);
        state.userToken = await getUserToken();
        console.log('✅ Токен пользователя получен');

        setProgress('Загрузка сообществ...', 3, 5);
        state.communities = await getAdminCommunities(state.userToken);
        console.log('✅ Загружено сообществ:', state.communities.length);

        if (state.communities.length === 0) {
            showNoCommunities();
            return;
        }

        showCommunityList();

    } catch (err) {
        console.error('❌ Ошибка:', err);
        showError(err.message || JSON.stringify(err));
    }
}

// ─── ШАГ 2: ПОЛЬЗОВАТЕЛЬСКИЙ ТОКЕН ─────────────────────────

async function getUserToken() {
    console.log('📤 Запрашиваю VKWebAppGetAuthToken...');

    const data = await vkBridge.send('VKWebAppGetAuthToken', {
        app_id: APP_ID,
        scope:  USER_SCOPE
    });

    console.log('📥 Ответ VKWebAppGetAuthToken:', JSON.stringify(data));

    if (!data || !data.access_token) {
        throw new Error(
            'VK не выдал токен доступа. Сырой ответ: ' + JSON.stringify(data)
        );
    }

    return data.access_token;
}

// ─── ШАГ 3: СПИСОК СООБЩЕСТВ ───────────────────────────────

async function getAdminCommunities(userToken) {
    console.log('📤 Запрашиваю groups.get...');

    const data = await vkBridge.send('VKWebAppCallAPIMethod', {
        method: 'groups.get',
        params: {
            filter:       'admin',
            extended:     '1',
            fields:       'photo_100,members_count',
            v:            '5.199',
            access_token: userToken
        }
    });

    console.log('📥 Ответ groups.get:', JSON.stringify(data));

    if (data && data.error) {
        throw new Error(translateVkError(data.error));
    }

    if (!data || !data.response) {
        throw new Error('VK вернул неожиданный ответ: ' + JSON.stringify(data));
    }

    const items = data.response.items || [];

    return items.map(item => ({
        id:          item.id,
        name:        item.name,
        screen_name: item.screen_name,
        photo:       item.photo_100 || ''
    }));
}

// ─── СПИСОК СООБЩЕСТВ ──────────────────────────────────────

function showCommunityList() {
    const listEl = $('communities-list');
    if (!listEl) return;

    $('communities-title').textContent = 'ВЫБЕРИТЕ СООБЩЕСТВО';
    $('communities-sub').textContent   = 'В котором вы администратор';

    listEl.innerHTML = '';

    state.communities.forEach(c => {
        const item = document.createElement('div');
        item.className = 'community-item';
        item.innerHTML = `
            <img src="${escapeHtml(c.photo)}" alt="" class="community-photo">
            <div class="community-info">
                <div class="community-name">${escapeHtml(c.name)}</div>
                <div class="community-id">ID: ${c.id}</div>
            </div>
        `;
        item.onclick = () => selectCommunity(c.id);
        listEl.appendChild(item);
    });

    showScreen('communities');
}

function showNoCommunities() {
    $('communities-title').textContent = 'НЕТ СООБЩЕСТВ';
    $('communities-sub').textContent   = 'Где вы администратор';

    const listEl = $('communities-list');
    listEl.innerHTML = `
        <div class="no-communities">
            <p>У вас нет сообществ, где вы администратор.</p>
            <p>Создайте сообщество в VK и вернитесь сюда.</p>
            <button class="btn-primary" onclick="openCreateGroup()">СОЗДАТЬ СООБЩЕСТВО В VK</button>
        </div>
    `;

    showScreen('communities');
}

function openCreateGroup() {
    const url = 'https://vk.com/groups?w=groups_create';
    if (typeof vkBridge !== 'undefined') {
        vkBridge.send('VKWebAppOpenLink', { url })
            .catch(() => { window.open(url, '_blank'); });
    } else {
        window.open(url, '_blank');
    }
}

// ─── ВЫБОР СООБЩЕСТВА ──────────────────────────────────────

async function selectCommunity(groupId) {
    state.selectedGroupId = groupId;

    showScreen('loading');
    setProgress('Получение токена бота...', 4, 5);

    try {
        state.communityToken = await getCommunityToken(groupId, state.userToken);
        console.log('✅ Токен сообщества получен');

        showChecklist();

    } catch (err) {
        console.error('❌ Ошибка:', err);
        showError(err.message || JSON.stringify(err));
    }
}

// ─── ЧЕКЛИСТ ───────────────────────────────────────────────

function showChecklist() {
    const group = state.communities.find(c => c.id === state.selectedGroupId);
    const groupName = group ? group.name : 'сообщество';

    $('checklist-group-name').textContent = groupName;

    const url = 'https://vk.ru/club' + state.selectedGroupId + '/settings/bots';
    $('settings-url').textContent = url;
    state.settingsUrl = url;

    state.checklistDone = false;
    const item = $('checklist-bots');
    if (item) item.classList.remove('checked');
    const btn = $('btn-continue');
    if (btn) btn.disabled = true;

    showScreen('checklist');
}

function toggleChecklist() {
    state.checklistDone = !state.checklistDone;

    const item = $('checklist-bots');
    const btn  = $('btn-continue');

    if (state.checklistDone) {
        item.classList.add('checked');
        btn.disabled = false;
    } else {
        item.classList.remove('checked');
        btn.disabled = true;
    }
}

// ─── КОПИРОВАНИЕ ССЫЛКИ ────────────────────────────────────

function copySettingsUrl() {
    if (!state.settingsUrl) return;

    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(state.settingsUrl)
            .then(() => showToast('Ссылка скопирована'))
            .catch(() => fallbackCopy(state.settingsUrl));
    } else {
        fallbackCopy(state.settingsUrl);
    }
}

// ─── ФИНАЛИЗАЦИЯ ───────────────────────────────────────────

async function finalizeSetup() {
    if (!state.checklistDone) {
        showToast('Сначала отметьте галочку');
        return;
    }

    showScreen('loading');
    setProgress('Настройка Long Poll...', 5, 5);

    try {
        await configureCommunity(state.selectedGroupId, state.communityToken);
        await requestMessagesPermission(state.selectedGroupId);
        await verifyLongPollSettings(state.selectedGroupId, state.communityToken);

        showResult();

    } catch (err) {
        console.error('❌ Ошибка:', err);
        showError(err.message || JSON.stringify(err));
    }
}

// ─── ШАГ 4: ТОКЕН СООБЩЕСТВА ───────────────────────────────

async function getCommunityToken(groupId, userToken) {
    try {
        console.log('📤 Запрашиваю VKWebAppGetCommunityToken...');

        const data = await vkBridge.send('VKWebAppGetCommunityToken', {
            app_id:   APP_ID,
            group_id: groupId,
            scope:    COMMUNITY_SCOPE
        });

        console.log('📥 Ответ VKWebAppGetCommunityToken:', JSON.stringify(data));

        if (data && data.access_token) {
            console.log('✅ Токен получен через VKWebAppGetCommunityToken');
            return data.access_token;
        }
    } catch (e) {
        console.warn('⚠️ VKWebAppGetCommunityToken не сработал:', e);
    }

    try {
        console.log('📤 Пробую groups.getToken...');

        const data = await vkBridge.send('VKWebAppCallAPIMethod', {
            method: 'groups.getToken',
            params: {
                group_id:     groupId,
                v:            '5.199',
                access_token: userToken
            }
        });

        console.log('📥 Ответ groups.getToken:', JSON.stringify(data));

        if (data && data.response && data.response.token) {
            console.log('✅ Токен получен через groups.getToken');
            return data.response.token;
        }

        if (data && data.error) {
            console.warn('⚠️ groups.getToken вернул ошибку:', data.error);
        }
    } catch (e) {
        console.warn('⚠️ groups.getToken не сработал:', e);
    }

    throw new Error(
        'Не удалось автоматически получить токен сообщества.\n\n' +
        'Откройте сообщество в VK вручную: Управление → Работа с API → ' +
        'Создать ключ доступа. Выберите права: управление сообществом, сообщения, фотографии, документы.'
    );
}

// ─── ШАГ 5: LONG POLL ──────────────────────────────────────

async function configureCommunity(groupId, communityToken) {
    console.log('📤 Включаю Long Poll API для сообщества', groupId);

    try {
        const result = await vkBridge.send('VKWebAppCallAPIMethod', {
            method: 'groups.setLongPollSettings',
            params: {
                group_id:      groupId,
                enabled:       1,
                message_new:   1,
                message_reply: 1,
                message_allow: 1,
                message_edit:  1,
                v:             '5.199',
                access_token:  communityToken
            }
        });

        console.log('📥 Ответ groups.setLongPollSettings:', JSON.stringify(result));

        if (result && result.response === 1) {
            console.log('✅ Long Poll API успешно включён');
            state.longPollEnabled = true;
            return true;
        }

        if (result && result.error) {
            console.warn('⚠️ Ошибка setLongPollSettings:', result.error);
        }

    } catch (e) {
        console.warn('⚠️ VK Bridge выбросил ошибку при setLongPollSettings:', e);
    }

    return false;
}

// ─── РАЗРЕШЕНИЕ НА СООБЩЕНИЯ ───────────────────────────────

async function requestMessagesPermission(groupId) {
    console.log('📤 Запрашиваю разрешение на сообщения от сообщества...');

    try {
        const data = await vkBridge.send('VKWebAppAllowMessagesFromGroup', {
            group_id: groupId
        });

        console.log('📥 Ответ VKWebAppAllowMessagesFromGroup:', JSON.stringify(data));

        if (data && data.result) {
            console.log('✅ Пользователь разрешил сообщения от сообщества');
            state.messagesAllowed = true;
            return true;
        }

    } catch (e) {
        console.warn('⚠️ VKWebAppAllowMessagesFromGroup не сработал:', e);
    }

    return false;
}

// ─── ПРОВЕРКА LONG POLL ────────────────────────────────────

async function verifyLongPollSettings(groupId, communityToken) {
    console.log('📤 Проверяю настройки Long Poll...');

    try {
        const result = await vkBridge.send('VKWebAppCallAPIMethod', {
            method: 'groups.getLongPollSettings',
            params: {
                group_id:     groupId,
                v:            '5.199',
                access_token: communityToken
            }
        });

        console.log('📥 Ответ groups.getLongPollSettings:', JSON.stringify(result));

        if (result && result.response) {
            const r = result.response;

            if (r.is_enabled) {
                console.log('✅ Long Poll включён');
                state.longPollEnabled = true;
            } else {
                console.warn('⚠️ Long Poll НЕ включён');
                state.longPollEnabled = false;
            }

            const ev = r.events || {};
            if (ev.message_new)   console.log('✅ message_new включено');
            else                  console.warn('⚠️ message_new НЕ включено');

            if (ev.message_reply) console.log('✅ message_reply включено');
            if (ev.message_edit)  console.log('✅ message_edit включено');
            if (ev.message_allow) console.log('✅ message_allow включено');
        }

    } catch (e) {
        console.warn('⚠️ Не удалось проверить настройки:', e);
    }
}

// ─── СКАЧИВАНИЕ АВАТАРКИ ───────────────────────────────────
// Автоматически загрузить аватарку на VK нельзя из-за CORS —
// файловый сервер VK (pu.vk.ru) не отдаёт заголовки Access-Control-Allow-Origin.
// Поэтому даём пользователю скачать картинку и поставить её вручную.

function downloadAvatar() {
    const link = document.createElement('a');
    link.href = AVATAR_URL;
    link.download = 'artwat_avatar.png';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    showToast('Аватарка скачана');
}

// ─── ПОКАЗ РЕЗУЛЬТАТА ──────────────────────────────────────

function showResult() {
    $('result-group-id').textContent = state.selectedGroupId;
    $('result-token').textContent    = state.communityToken;

    const sub = $('success-subtitle');
    if (sub) {
        sub.textContent = 'Ваш бот привязан и готов к работе';
    }

    showScreen('success');
}

// ─── КОПИРОВАНИЕ ────────────────────────────────────────────

function copyField(field) {
    let value = '';
    let label = '';

    if (field === 'group') {
        value = String(state.selectedGroupId);
        label = 'Group ID';
    } else if (field === 'token') {
        value = state.communityToken;
        label = 'Token';
    }

    if (!value) return;

    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(value)
            .then(() => showToast(label + ' скопирован'))
            .catch(() => {
                fallbackCopy(value);
                showToast(label + ' скопирован');
            });
    } else {
        fallbackCopy(value);
        showToast(label + ' скопирован');
    }
}

function copyAll() {
    const text = `Group ID: ${state.selectedGroupId}\nToken: ${state.communityToken}`;

    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text)
            .then(() => showToast('Скопировано'))
            .catch(() => fallbackCopy(text));
    } else {
        fallbackCopy(text);
    }
}

function fallbackCopy(text) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try {
        document.execCommand('copy');
    } catch (e) {
        // silent
    }
    document.body.removeChild(ta);
}

// ─── ОТКРЫТИЕ СООБЩЕСТВА ────────────────────────────────────

function openVkGroup() {
    if (!state.selectedGroupId) return;

    const url = 'https://vk.com/club' + state.selectedGroupId;

    if (typeof vkBridge !== 'undefined') {
        vkBridge.send('VKWebAppOpenLink', { url })
            .catch(() => { window.open(url, '_blank'); });
    } else {
        window.open(url, '_blank');
    }
}

// ─── ПОВТОР ─────────────────────────────────────────────────

function retry() {
    state.userToken       = null;
    state.communities     = [];
    state.selectedGroupId = null;
    state.communityToken  = null;
    state.longPollEnabled = false;
    state.messagesAllowed = false;
    state.checklistDone   = false;
    state.settingsUrl     = '';

    showScreen('welcome');
    $('help-block').classList.add('hidden');
}

// ─── ПЕРЕВОД ОШИБОК VK ─────────────────────────────────────

function translateVkError(error) {
    const code = error.error_code;
    const msg  = error.error_msg || 'Неизвестная ошибка';

    const map = {
        5:   'Авторизация не удалась. Попробуйте снова и разрешите доступ.',
        6:   'Слишком много запросов. Подождите немного и попробуйте снова.',
        14:  'Требуется ввод капчи. Откройте VK в браузере и попробуйте снова.',
        15:  'Доступ запрещён. Убедитесь, что вы разрешили управление сообществами.',
        100: 'Один из параметров указан неверно.',
        200: 'Доступ к сообществу запрещён.',
        203: 'Вы не являетесь администратором этого сообщества.',
        260: 'Не удалось создать сообщество. Возможно, достигнут лимит.',
        262: 'VK временно ограничил создание сообществ. Попробуйте позже.'
    };

    return map[code] ? `${map[code]} (код ${code})` : `${msg} (код ${code})`;
}

// ─── ЗАПУСК ─────────────────────────────────────────────────

window.addEventListener('load', () => {
    if (typeof vkBridge === 'undefined') {
        showError('VK Bridge не загрузился. Проверьте интернет-соединение и откройте приложение заново.');
        return;
    }

    console.log('🌱 ArtWat Setup загружен, APP_ID =', APP_ID);

    vkReadyPromise = vkBridge.send('VKWebAppInit')
        .then(() => {
            console.log('✅ VK Bridge инициализирован');
        })
        .catch((err) => {
            console.error('❌ VKWebAppInit упал:', err);
        });
});
