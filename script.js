// ═══════════════════════════════════════════════════════════
//  ArtWat Setup — VK Mini App
//  Автоматическое создание сообщества и получение токена
// ═══════════════════════════════════════════════════════════

// ─── КОНФИГУРАЦИЯ ───────────────────────────────────────────
// ⚠️ ЗАМЕНИТЕ на ваш app_id из кабинета разработчика VK
const APP_ID = 54818456;

// Название создаваемого сообщества
const COMMUNITY_TITLE = 'ArtWat — мой автополив';

// Права, которые запрашиваем у пользователя
const USER_SCOPE = 'groups';

// Права для токена сообщества
const COMMUNITY_SCOPE = 'manage,messages,photos,docs';

// ─── СОСТОЯНИЕ ──────────────────────────────────────────────
const state = {
    userToken:      null,
    groupId:        null,
    communityToken: null
};

// Промис инициализации VK Bridge (запускается сразу при загрузке)
let vkReadyPromise = null;

// ─── UI-УТИЛИТЫ ─────────────────────────────────────────────

const $ = (id) => document.getElementById(id);

function showScreen(name) {
    ['welcome', 'loading', 'success', 'error'].forEach(s => {
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

// ─── ОСНОВНАЯ ЛОГИКА ────────────────────────────────────────

async function startSetup() {
    showScreen('loading');
    setProgress('Инициализация...', 1, 4);

    try {
        // Ждём завершения инициализации VK Bridge (запущена при загрузке страницы)
        if (vkReadyPromise) {
            await vkReadyPromise;
        } else {
            // Страховка: если по какой-то причине промис не создан
            await vkBridge.send('VKWebAppInit');
        }

        // Шаг 2: получаем пользовательский токен
        setProgress('Запрос разрешений...', 2, 4);
        state.userToken = await getUserToken();
        console.log('✅ Токен пользователя получен');

        // Шаг 3: создаём сообщество
        setProgress('Создание сообщества...', 3, 4);
        state.groupId = await createCommunity(state.userToken);
        console.log('✅ Сообщество создано, ID:', state.groupId);

        // Шаг 4: получаем токен сообщества
        setProgress('Получение токена бота...', 4, 4);
        state.communityToken = await getCommunityToken(state.groupId, state.userToken);
        console.log('✅ Токен сообщества получен');

        // Показываем результат
        showResult();

    } catch (err) {
        console.error('❌ Ошибка:', err);
        showError(err.message || 'Неизвестная ошибка');
    }
}

// ─── ШАГ 2: ПОЛЬЗОВАТЕЛЬСКИЙ ТОКЕН ─────────────────────────

async function getUserToken() {
    const data = await vkBridge.send('VKWebAppGetAuthToken', {
        app_id: APP_ID,
        scope:  USER_SCOPE
    });

    if (!data || !data.access_token) {
        throw new Error('VK не выдал токен доступа. Убедитесь, что вы разрешили доступ к сообществам.');
    }

    return data.access_token;
}

// ─── ШАГ 3: СОЗДАНИЕ СООБЩЕСТВА ────────────────────────────

async function createCommunity(userToken) {
    const params = new URLSearchParams({
        title:        COMMUNITY_TITLE,
        type:         'group',
        v:            '5.199',
        access_token: userToken
    });

    const resp = await fetch('https://api.vk.com/method/groups.create?' + params.toString());
    const json = await resp.json();

    if (json.error) {
        throw new Error(translateVkError(json.error));
    }

    if (!json.response || !json.response.id) {
        throw new Error('VK вернул неожиданный ответ при создании сообщества');
    }

    return json.response.id;
}

// ─── ШАГ 4: ТОКЕН СООБЩЕСТВА ───────────────────────────────

async function getCommunityToken(groupId, userToken) {
    // Способ 1: через VK Bridge (предпочтительный)
    try {
        const data = await vkBridge.send('VKWebAppGetCommunityToken', {
            app_id:   APP_ID,
            group_id: groupId,
            scope:    COMMUNITY_SCOPE
        });

        if (data && data.access_token) {
            console.log('✅ Токен получен через VKWebAppGetCommunityToken');
            return data.access_token;
        }
    } catch (e) {
        console.warn('VKWebAppGetCommunityToken не сработал:', e);
    }

    // Способ 2: через API VK (groups.getToken)
    try {
        const params = new URLSearchParams({
            group_id:     groupId,
            v:            '5.199',
            access_token: userToken
        });

        const resp = await fetch('https://api.vk.com/method/groups.getToken?' + params.toString());
        const json = await resp.json();

        if (json.response && json.response.token) {
            console.log('✅ Токен получен через groups.getToken');
            return json.response.token;
        }

        if (json.error) {
            console.warn('groups.getToken вернул ошибку:', json.error);
        }
    } catch (e) {
        console.warn('groups.getToken не сработал:', e);
    }

    // Оба способа провалились — сообщество создано, но токен получить не удалось
    throw new Error(
        'Сообщество создано (ID: ' + groupId + '), но автоматически получить токен не удалось. ' +
        'Пожалуйста, откройте сообщество в VK вручную, перейдите в Управление → Работа с API → ' +
        'Создать ключ доступа и выберите права: управление сообществом, сообщения, фотографии, документы.'
    );
}

// ─── ПОКАЗ РЕЗУЛЬТАТА ──────────────────────────────────────

function showResult() {
    $('result-group-id').textContent = state.groupId;
    $('result-token').textContent    = state.communityToken;
    showScreen('success');
}

// ─── КОПИРОВАНИЕ ────────────────────────────────────────────

function copyAll() {
    const text = `Group ID: ${state.groupId}\nToken: ${state.communityToken}`;

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
    if (!state.groupId) return;

    const url = 'https://vk.com/club' + state.groupId;

    if (typeof vkBridge !== 'undefined') {
        vkBridge.send('VKWebAppOpenLink', { url })
            .catch(() => { window.open(url, '_blank'); });
    } else {
        window.open(url, '_blank');
    }
}

// ─── ПОВТОР ─────────────────────────────────────────────────

function retry() {
    state.userToken      = null;
    state.groupId        = null;
    state.communityToken = null;

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
// ВАЖНО: VKWebAppInit нужно вызвать СРАЗУ при загрузке страницы,
// иначе VK через несколько секунд покажет «Сервис задумался...».
// Кнопка «Начать настройку» лишь дожидается результата этого промиса.

window.addEventListener('load', () => {
    if (typeof vkBridge === 'undefined') {
        showError('VK Bridge не загрузился. Проверьте интернет-соединение и откройте приложение заново.');
        return;
    }

    console.log('🌱 ArtWat Setup загружен, APP_ID =', APP_ID);

    // Инициализируем VK Bridge немедленно
    vkReadyPromise = vkBridge.send('VKWebAppInit')
        .then(() => {
            console.log('✅ VK Bridge инициализирован');
        })
        .catch((err) => {
            console.error('❌ VKWebAppInit упал:', err);
        });
});
