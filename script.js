// ═══════════════════════════════════════════════════════════
//  ArtWat Setup — VK Mini App (Путь B: выбор сообщества)
// ═══════════════════════════════════════════════════════════

// ─── КОНФИГУРАЦИЯ ───────────────────────────────────────────
const APP_ID = 54818456;

const USER_SCOPE      = 'groups';
const COMMUNITY_SCOPE = 'manage,messages,photos,docs';

// ─── СОСТОЯНИЕ ──────────────────────────────────────────────
const state = {
    userToken:       null,
    communities:     [],      // массив { id, name, screen_name, photo }
    selectedGroupId: null,
    communityToken:  null
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
    setProgress('Инициализация...', 1, 4);

    try {
        if (vkReadyPromise) await vkReadyPromise;

        // Шаг 2: получаем пользовательский токен
        setProgress('Запрос разрешений...', 2, 4);
        state.userToken = await getUserToken();
        console.log('✅ Токен пользователя получен');

        // Шаг 3: получаем список сообществ пользователя
        setProgress('Загрузка сообществ...', 3, 4);
        state.communities = await getAdminCommunities(state.userToken);
        console.log('✅ Загружено сообществ:', state.communities.length);

        // Если сообществ нет — показываем экран с предложением создать
        if (state.communities.length === 0) {
            showNoCommunities();
            return;
        }

        // Показываем список для выбора
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

    // Формат ответа: { response: { count: N, items: [ {...}, {...} ] } }
    const items = data.response.items || [];

    return items.map(item => ({
        id:          item.id,
        name:        item.name,
        screen_name: item.screen_name,
        photo:       item.photo_100 || ''
    }));
}

// ─── ПОКАЗ СПИСКА СООБЩЕСТВ ────────────────────────────────

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

// ─── ПОКАЗ ЭКРАНА "НЕТ СООБЩЕСТВ" ──────────────────────────

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
    setProgress('Получение токена бота...', 4, 4);

    try {
        state.communityToken = await getCommunityToken(groupId, state.userToken);
        console.log('✅ Токен сообщества получен');
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

    // Способ 2: groups.getToken через VKWebAppCallAPIMethod
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

// ─── ПОКАЗ РЕЗУЛЬТАТА ──────────────────────────────────────

function showResult() {
    $('result-group-id').textContent = state.selectedGroupId;
    $('result-token').textContent    = state.communityToken;
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

    showScreen('welcome');
    $('help-block').classList.add('hidden');
}

// ─── ПЕРЕВОД ОШИБОК VK НА РУССКИЙ ──────────────────────────

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

// ─── ЗАПУСК ПРИ ЗАГРУЗКЕ ────────────────────────────────────

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
