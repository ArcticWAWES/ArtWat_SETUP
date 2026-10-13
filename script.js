// ═══════════════════════════════════════════════════════════
//  ArtWat Setup — VK Mini App
//  Путь B: выбор сообщества + автоматическая настройка Long Poll
// ═══════════════════════════════════════════════════════════

// ─── КОНФИГУРАЦИЯ ───────────────────────────────────────────
const APP_ID = 54818456;

const USER_SCOPE      = 'groups';
const COMMUNITY_SCOPE = 'manage,messages,photos,docs';

// ─── СОСТОЯНИЕ ──────────────────────────────────────────────
const state = {
    userToken:       null,
    communities:     [],
    selectedGroupId: null,
    communityToken:  null,
    longPollEnabled: false,
    messagesAllowed: false
};

let vkReadyPromise = null;

// ─── UI-УТИЛИТЫ ─────────────────────────────────────────────

const $ = (id) => document.getElementById(id);

function showScreen(name) {
    ['welcome', 'loading', 'communities', 'success', 'error'].forEach(s => {
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

        // Шаг 2: получаем пользовательский токен
        setProgress('Запрос разрешений...', 2, 5);
        state.userToken = await getUserToken();
        console.log('✅ Токен пользователя получен');

        // Шаг 3: получаем список сообществ
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
// 1. Получаем токен сообщества
// 2. Включаем Long Poll API
// 3. Запрашиваем разрешение на сообщения от сообщества
// 4. Проверяем, что всё включилось

async function selectCommunity(groupId) {
    state.selectedGroupId = groupId;

    showScreen('loading');

    try {
        // Шаг 4: получаем токен сообщества
        setProgress('Получение токена бота...', 4, 5);
        state.communityToken = await getCommunityToken(groupId, state.userToken);
        console.log('✅ Токен сообщества получен');

        // Шаг 5: настраиваем Long Poll API и разрешения
        setProgress('Настройка сообщества...', 5, 5);
        await configureCommunity(groupId, state.communityToken);
        await requestMessagesPermission(groupId);

        // Финальная проверка
        await verifyLongPollSettings(groupId, state.communityToken);

        showResult();
    } catch (err) {
        console.error('❌ Ошибка:', err);
        showError(err.message || JSON.stringify(err));
    }
}

// ─── ШАГ 4: ТОКЕН СООБЩЕСТВА ───────────────────────────────

async function getCommunityToken(groupId, userToken) {
    // Способ 1: VKWebAppGetCommunityToken — родной метод VK Bridge
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

    // Способ 2: groups.getToken
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

// ─── ШАГ 5: АВТОНАСТРОЙКА СООБЩЕСТВА ───────────────────────
// Включаем Long Poll API и типы событий через groups.setLongPollSettings.
// Это полностью заменяет ручную настройку через десктопную версию VK.

async function configureCommunity(groupId, communityToken) {
    console.log('📤 Включаю Long Poll API для сообщества', groupId);

    try {
        const result = await vkBridge.send('VKWebAppCallAPIMethod', {
            method: 'groups.setLongPollSettings',
            params: {
                group_id:      groupId,
                enabled:       1,   // Включаем Long Poll API
                message_new:   1,   // Новые входящие сообщения
                message_reply: 1,   // Ответы на сообщения
                message_allow: 1,   // Разрешение на отправку сообщений
                message_edit:  1,   // Редактирование сообщений
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

            // Ошибка 15 (Access denied) — токен сообщества без права manage
            if (result.error.error_code === 15) {
                throw new Error(
                    'Не удалось включить Long Poll API: у токена сообщества нет прав управления.\n\n' +
                    'Откройте сообщество вручную: Управление → Работа с API → Long Poll API → Включить.'
                );
            }

            throw new Error(translateVkError(result.error));
        }

    } catch (e) {
        if (e.message && e.message.indexOf('Long Poll') !== -1) throw e;
        console.warn('⚠️ VK Bridge выбросил ошибку при setLongPollSettings:', e);
        // Не прерываем — возможно, права уже настроены
    }

    return false;
}

// ─── РАЗРЕШЕНИЕ НА СООБЩЕНИЯ ОТ СООБЩЕСТВА ────────────────
// Показывает пользователю нативное окно VK с запросом разрешения
// на получение сообщений от имени сообщества.

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

// ─── ПРОВЕРКА НАСТРОЕК LONG POLL ───────────────────────────
// Вызываем groups.getLongPollSettings, чтобы убедиться,
// что всё действительно включилось.

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

            if (r.message_new) {
                console.log('✅ Событие message_new включено');
            } else {
                console.warn('⚠️ message_new НЕ включено');
            }
        }

    } catch (e) {
        console.warn('⚠️ Не удалось проверить настройки:', e);
    }
}

// ─── ПОКАЗ РЕЗУЛЬТАТА ──────────────────────────────────────

function showResult() {
    $('result-group-id').textContent = state.selectedGroupId;
    $('result-token').textContent    = state.communityToken;

    // Показываем статус Long Poll в подзаголовке
    const sub = document.querySelector('#screen-success .success-sub');
    if (sub) {
        if (state.longPollEnabled) {
            sub.textContent = 'Ваш бот привязан и готов к работе';
        } else {
            sub.textContent = 'Бот привязан. Long Poll нужно включить вручную.';
        }
    }

    showScreen('success');
}

// ─── КОПИРОВАНИЕ ────────────────────────────────────────────

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
        showToast('Скопировано');
    } catch (e) {
        showToast('Не удалось скопировать');
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
