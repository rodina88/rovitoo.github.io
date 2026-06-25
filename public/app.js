let CURRENT_USER = null;
let TOKEN = localStorage.getItem('token') || null;
let ACTIVE_PAGE = 'home';
let ACTIVE_CHAT_USER = null;

// Инициализация при старте страницы
document.addEventListener("DOMContentLoaded", () => {
    loadServers();
    if (TOKEN) {
        checkToken();
    } else {
        showAuthModal(true);
    }
    
    // Обработка отправки формы входа/регистрации
    document.getElementById('auth-form').addEventListener('submit', handleAuthSubmit);
    document.getElementById('create-item-form').addEventListener('submit', handleCreateItem);
    document.getElementById('chat-input-form').addEventListener('submit', handleSendMessage);
    document.getElementById('add-review-form').addEventListener('submit', handleReviewSubmit);
});

function showAuthModal(show) {
    const modal = document.getElementById('auth-modal');
    if (show) modal.classList.add('show');
    else {
        modal.classList.remove('show');
        document.getElementById('app').classList.remove('hidden');
    }
}

function toggleAuthMode() {
    const isReg = document.getElementById('auth-username').style.display === 'block';
    document.getElementById('auth-title').innerText = isReg ? 'Вход в Rodina Market' : 'Регистрация на площадке';
    document.getElementById('auth-username').style.display = isReg ? 'none' : 'block';
    document.getElementById('auth-email').style.display = isReg ? 'none' : 'block';
    document.getElementById('auth-confirm').style.display = isReg ? 'none' : 'block';
    document.getElementById('auth-submit-btn').innerText = isReg ? 'Войти' : 'Зарегистрироваться';
    document.getElementById('auth-toggle').innerHTML = isReg ? 'Нет аккаунта? <span onclick="toggleAuthMode()">Зарегистрироваться</span>' : 'Уже есть аккаунт? <span onclick="toggleAuthMode()">Войти</span>';
    
    document.getElementById('auth-username').required = !isReg;
    document.getElementById('auth-email').required = !isReg;
    document.getElementById('auth-confirm').required = !isReg;
}

async function checkToken() {
    try {
        let res = await fetch('/api/auth/me', { headers: { 'Authorization': `Bearer ${TOKEN}` } });
        if (res.ok) {
            CURRENT_USER = await res.json();
            showAuthModal(false);
            if(CURRENT_USER.is_admin) document.getElementById('admin-nav-btn').classList.remove('hidden');
            loadItems();
        } else {
            showAuthModal(true);
        }
    } catch { showAuthModal(true); }
}

async function handleAuthSubmit(e) {
    e.preventDefault();
    const isReg = document.getElementById('auth-username').style.display === 'block';
    const loginOrEmail = document.getElementById('auth-login').value;
    const password = document.getElementById('auth-pass').value;

    let url = isReg ? '/api/auth/register' : '/api/auth/login';
    let body = isReg ? {
        username: document.getElementById('auth-username').value,
        email: document.getElementById('auth-email').value,
        password: password,
        confirmPassword: document.getElementById('auth-confirm').value
    } : { loginOrEmail, password };

    let res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    });
    let data = await res.json();
    if (!res.ok) return alert(data.error);

    localStorage.setItem('token', data.token);
    TOKEN = data.token;
    CURRENT_USER = data.user;
    showAuthModal(false);
    if(CURRENT_USER.is_admin) document.getElementById('admin-nav-btn').classList.remove('hidden');
    loadItems();
}

// NAVIGATION SPA
function navigateTo(page, param = null) {
    ACTIVE_PAGE = page;
    document.querySelectorAll('.page').forEach(p => p.classList.add('hidden'));
    document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
    
    if (page === 'home') {
        document.getElementById('page-home').classList.remove('hidden');
        loadItems();
    } else if (page === 'create') {
        document.getElementById('page-create').classList.remove('hidden');
    } else if (page === 'chats') {
        document.getElementById('page-chats').classList.remove('hidden');
        loadChats();
    } else if (page === 'favorites') {
        document.getElementById('page-favorites').classList.remove('hidden');
        loadFavorites();
    } else if (page === 'profile-my') {
        document.getElementById('page-profile').classList.remove('hidden');
        loadProfile(CURRENT_USER.id);
    } else if (page === 'profile' && param) {
        document.getElementById('page-profile').classList.remove('hidden');
        loadProfile(param);
    } else if (page === 'item' && param) {
        document.getElementById('page-item').classList.remove('hidden');
        loadItemDetail(param);
    } else if (page === 'admin') {
        document.getElementById('page-admin').classList.remove('hidden');
        loadAdminPanel();
    }
}

// SERVERS LOADING
async function loadServers() {
    let res = await fetch('/api/servers');
    let servers = await res.json();
    let options = '<option value="">Выберите сервер</option>';
    servers.forEach(s => options += `<option value="${s.id}">${s.name}</option>`);
    document.getElementById('filter-server').innerHTML = '<option value="">Все серверы</option>' + options;
    document.getElementById('create-server').innerHTML = options;
}

// LOAD LISTINGS
async function loadItems() {
    const search = document.getElementById('search-input').value;
    const cat = document.getElementById('filter-category').value;
    const srv = document.getElementById('filter-server').value;
    const minP = document.getElementById('filter-min-price').value;
    const maxP = document.getElementById('filter-max-price').value;
    const sort = document.getElementById('filter-sort').value;

    let url = `/api/items?search=${search}&category=${cat}&server=${srv}&minPrice=${minP}&maxPrice=${maxP}&sort=${sort}`;
    let res = await fetch(url);
    let items = await res.json();

    const box = document.getElementById('items-list');
    box.innerHTML = '';
    if(items.length === 0) box.innerHTML = '<p>Объявления не найдены</p>';
    
    items.forEach(item => {
        let imgs = JSON.parse(item.images || "[]");
        let card = document.createElement('div');
        card.className = 'card';
        card.innerHTML = `
            <img src="${imgs[0] || '/uploads/default-avatar.png'}" loading="lazy">
            <button class="fav-icon" onclick="toggleFav(event, ${item.id})">⭐</button>
            <div class="card-body" onclick="navigateTo('item', ${item.id})">
                <div class="card-price">${item.price.toLocaleString()} $</div>
                <div class="card-title">${item.title}</div>
                <div class="card-meta">
                    <span>📍 ${item.server_name}</span>
                    <span>👁️ ${item.views}</span>
                </div>
            </div>
        `;
        box.appendChild(card);
    });
}

// TOGGLE FAVORITE
async function toggleFav(e, id) {
    if(e) e.stopPropagation();
    let res = await fetch('/api/favorites/toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${TOKEN}` },
        body: JSON.stringify({ item_id: id })
    });
    let d = await res.json();
    alert(d.status === 'added' ? 'Добавлено в избранное!' : 'Удалено из избранного!');
}

// ITEM DETAILS
async function loadItemDetail(id) {
    let res = await fetch(`/api/items/${id}`);
    let item = await res.json();

    document.getElementById('item-title').innerText = item.title;
    document.getElementById('item-price').innerText = `${item.price.toLocaleString()} $`;
    document.getElementById('item-server').innerText = item.server_name;
    document.getElementById('item-author').innerText = item.author;
    document.getElementById('item-author').onclick = () => navigateTo('profile', item.user_id);
    document.getElementById('item-views').innerText = item.views;
    document.getElementById('item-date').innerText = new Date(item.created_at).toLocaleDateString();
    document.getElementById('item-desc').innerText = item.description;
    document.getElementById('item-contacts').innerText = item.contacts;

    let imgs = JSON.parse(item.images || "[]");
    let gall = document.getElementById('item-gallery');
    gall.innerHTML = '';
    imgs.forEach(i => gall.innerHTML += `<img src="${i}" class="gallery-img" style="width:100px; height:70px; object-fit:cover; margin-right:5px; border-radius:4px;">`);

    document.getElementById('btn-write-seller').onclick = () => {
        ACTIVE_CHAT_USER = item.user_id;
        navigateTo('chats');
        openConversation(item.user_id, item.author, item.id);
    };
    document.getElementById('btn-fav-toggle').onclick = () => toggleFav(null, item.id);
}

// CREATE LISTING
async function handleCreateItem(e) {
    e.preventDefault();
    let formData = new FormData();
    formData.append('title', document.getElementById('create-title').value);
    formData.append('description', document.getElementById('create-desc').value);
    formData.append('price', document.getElementById('create-price').value);
    formData.append('category', document.getElementById('create-category').value);
    formData.append('server_id', document.getElementById('create-server').value);
    formData.append('contacts', document.getElementById('create-contacts').value);

    let files = document.getElementById('create-images').files;
    for (let i = 0; i < files.length; i++) {
        formData.append('images', files[i]);
    }

    let res = await fetch('/api/items', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${TOKEN}` },
        body: formData
    });
    if(res.ok) {
        alert('Объявление успешно опубликовано!');
        navigateTo('home');
    }
}

// CHATS & MESSAGES
async function loadChats() {
    let res = await fetch('/api/messages/chats', { headers: { 'Authorization': `Bearer ${TOKEN}` } });
    let chats = await res.json();
    const box = document.getElementById('dialogs-container');
    box.innerHTML = '';
    chats.forEach(c => {
        box.innerHTML += `
            <div class="dialog-item" onclick="openConversation(${c.id}, '${c.username}')">
                <img src="${c.avatar}" class="avatar-small" style="width:40px;height:40px;border-radius:50%;">
                <div><strong>${c.username}</strong></div>
            </div>
        `;
    });
}

async function openConversation(userId, username, itemId = null) {
    ACTIVE_CHAT_USER = userId;
    document.getElementById('chat-header-user').innerText = `Диалог с ${username}`;
    document.getElementById('chat-input-form').classList.remove('hidden');
    
    let res = await fetch(`/api/messages/history/${userId}`, { headers: { 'Authorization': `Bearer ${TOKEN}` } });
    let history = await res.json();
    
    const box = document.getElementById('chat-messages-box');
    box.innerHTML = '';
    history.forEach(m => {
        let type = m.sender_id === CURRENT_USER.id ? 'my' : 'other';
        box.innerHTML += `
            <div class="message-bubble ${type}">
                ${m.message}
                ${m.image ? `<br><img src="${m.image}" style="max-width:100%; border-radius:8px; margin-top:5px;">` : ''}
            </div>
        `;
    });
    box.scrollTop = box.scrollHeight;
}

async function handleSendMessage(e) {
    e.preventDefault();
    let text = document.getElementById('chat-msg-text').value;
    let imgFile = document.getElementById('chat-msg-img').files[0];
    if(!text && !imgFile) return;

    let formData = new FormData();
    formData.append('receiver_id', ACTIVE_CHAT_USER);
    formData.append('item_id', 0);
    formData.append('message', text);
    if(imgFile) formData.append('image', imgFile);

    await fetch('/api/messages', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${TOKEN}` },
        body: formData
    });
    document.getElementById('chat-msg-text').value = '';
    document.getElementById('chat-msg-img').value = '';
    openConversation(ACTIVE_CHAT_USER, '');
}

// PROFILES & REVIEWS
async function loadProfile(id) {
    let res = await fetch(`/api/profile/${id}`);
    let prof = await res.json();

    document.getElementById('prof-avatar').src = prof.avatar;
    document.getElementById('prof-username').innerText = prof.username;
    document.getElementById('prof-regdate').innerText = new Date(prof.created_at).toLocaleDateString();
    document.getElementById('prof-rating').innerText = `⭐ ${Number(prof.rating).toFixed(1)}`;
    document.getElementById('prof-revcount').innerText = prof.reviews_count;
    document.getElementById('prof-itemscount').innerText = prof.items_count;

    if(id !== CURRENT_USER.id) {
        document.getElementById('add-review-form').classList.remove('hidden');
    } else {
        document.getElementById('add-review-form').classList.add('hidden');
    }

    let rRes = await fetch(`/api/profile/${id}/reviews`);
    let reviews = await rRes.json();
    const rBox = document.getElementById('reviews-list');
    rBox.innerHTML = '';
    reviews.forEach(r => {
        rBox.innerHTML += `
            <div style="background:var(--bg-input); padding:10px; border-radius:8px; margin-bottom:10px;">
                <strong>${r.author_name}</strong> (Оценка: ${r.rating}/5)<br>
                <p>${r.text}</p>
            </div>
        `;
    });
}

async function handleReviewSubmit(e) {
    e.preventDefault();
    let rating = document.getElementById('review-stars').value;
    let text = document.getElementById('review-text').value;

    await fetch(`/api/profile/${ACTIVE_CHAT_USER || CURRENT_USER.id}/reviews`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${TOKEN}` },
        body: JSON.stringify({ rating, text })
    });
    alert('Отзыв отправлен!');
    loadProfile(ACTIVE_CHAT_USER || CURRENT_USER.id);
}

// ADMIN PANEL
async function loadAdminPanel() {
    let res = await fetch('/api/admin/stats', { headers: { 'Authorization': `Bearer ${TOKEN}` } });
    let stats = await res.json();
    document.getElementById('admin-stats-box').innerHTML = `<p>Всего пользователей: ${stats.users} | Объявлений: ${stats.items}</p>`;

    let uRes = await fetch('/api/admin/users', { headers: { 'Authorization': `Bearer ${TOKEN}` } });
    let users = await uRes.json();
    const uBox = document.getElementById('admin-users-list');
    uBox.innerHTML = '';
    users.forEach(u => {
        uBox.innerHTML += `
            <div style="display:flex; justify-content:space-between; margin-bottom:5px;">
                <span>${u.username} (${u.email})</span>
                <button onclick="toggleBan(${u.id})">${u.is_banned ? 'Разбанить' : 'Забанить'}</button>
            </div>
        `;
    });
}

async function toggleBan(id) {
    await fetch(`/api/admin/users/${id}/ban`, { method: 'POST', headers: { 'Authorization': `Bearer ${TOKEN}` } });
    loadAdminPanel();
}