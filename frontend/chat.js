/* jshint esversion: 11 */
"use strict";


let currentUID = null;          // активный собеседник
let currentUserID = null;
let authToken = localStorage.getItem("access_token");

async function getCurrentUser() {
    const res = await fetch("http://127.0.0.1:8000/me", {
        headers: {"Authorization": "Bearer " + authToken}
    });
    if (res.ok) {
        const user = await res.json();
        currentUserID = user.id;
        document.getElementById("owner-name").textContent = user.login;
        document.getElementById("owner-avatar").src = user.avatar || "default.png";
    } else {
        localStorage.clear();
        window.location.href = "register.html";
    }
}

getCurrentUser();

async function loadUsers() {
  const res = await fetch("http://127.0.0.1:8000/users", {
    headers: { "Authorization": "Bearer " + authToken }
  });

  if (!res.ok) return;

  const users = await res.json();
  const list = document.querySelector("#dialogs");

  users.forEach(user => {
    if (user.login === "selti") return;  // исключаем AI, если вдруг попадёт в БД

    const item = document.createElement("div");
    item.classList.add("dialog-item");
    item.dataset.user = user.id;

    item.innerHTML = `
      <img class="avatar" src="${user.avatar || 'D:/web/frontend/img/default.png'}" />
      <div class="dialog-text">
        <div class="name">${user.login}</div>
        <div class="msg">Новое сообщение</div>
      </div>
      <div class="dialog-date">...</div>
    `;

    item.addEventListener("click", () => openChat(item));
    list.appendChild(item);
  });
}

loadUsers();

/* ------------------- DOM-ссылки ------------------------------------ */
const chatBox = document.getElementById('chat');
const headerLbl = document.getElementById('user-info');
const dialogs = document.querySelectorAll('.dialog-item');
const inputBox = document.querySelector('#composer input');
const sendBtn = document.querySelector('#composer button');
const avatarHdr = document.getElementById('header-avatar');
const closeBtn = document.getElementById('close-chat');
const searchInp = document.getElementById('search-input');
const resultBox = document.getElementById('search-results');

/* ------------------- утилиты -------------------------------------- */
const fmtTime = d => d.toLocaleTimeString('ru-RU', {hour: '2-digit', minute: '2-digit'});
const fmtDate = d => d.toLocaleDateString('ru-RU', {day: 'numeric', month: 'short'});

/* Обновляем превью и время в карточке */
function refreshCard(uid, lastText, ts) {
    const card = document.querySelector(`.dialog-item[data-user="${uid}"]`);
    if (!card) return;

    card.querySelector('.preview').textContent =
        lastText.length > 40 ? lastText.slice(0, 37) + '…' : lastText;

    const dateEl = card.querySelector('.date');
    const now = new Date(ts);
    dateEl.textContent = (new Date().toDateString() === now.toDateString())
        ? fmtTime(now) : fmtDate(now);

    /* переносим карточку вверх –- самое свежее сообщение выше */
    const parent = card.parentElement;
    if (parent) {
        parent.prepend(card);
    }
}

/* ссылки */
const logoutBtn = document.getElementById('owner-logout');
const ownerName = document.getElementById('owner-name');
const ownerAv = document.getElementById('owner-avatar');

/* обработчик выхода */
logoutBtn.addEventListener('click', () => {
    localStorage.clear();
    window.location.href = "register.html";
});

function buildSearchItem(card) {
    const uid = card.dataset.user;
    const name = card.querySelector('.name')?.textContent || '';

    const div = document.createElement('div');
    div.className = 'search-item';
    div.textContent = name;
    div.dataset.user = uid;
    return div;
}

function filterUsers(q) {
    resultBox.innerHTML = '';
    if (!q?.trim()) return;

    const found = Array.from(dialogs).filter(card =>
        card.querySelector('.name')?.textContent.toLowerCase().includes(q.toLowerCase())
    );

    if (!found.length) {
        resultBox.textContent = 'Нет совпадений';
        return;
    }
    found.forEach(card => resultBox.appendChild(buildSearchItem(card)));
}

searchInp.addEventListener('input', e => filterUsers(e.target.value));

resultBox.addEventListener('click', e => {
    const item = e.target.closest('.search-item');
    if (!item) return;

    const targetCard = document.querySelector(`.dialog-item[data-user="${item.dataset.user}"]`);
    if (targetCard) targetCard.click();

    searchInp.value = '';
    resultBox.innerHTML = '';
});

/* Строим один пузырь */
function buildMessage({from, text, ts, avatarSrc}) {
    const wrap = document.createElement('div');
    wrap.className = `msg-wrap ${from === 'me' ? 'out' : 'in'}`;

    if (from !== 'me' && avatarSrc) {
        const av = document.createElement('img');
        av.className = 'avatar-sm';
        av.src = avatarSrc;
        wrap.appendChild(av);
    }

    const bubble = document.createElement('div');
    bubble.className = `msg ${from === 'me' ? 'out' : 'in'}`;
    bubble.textContent = text || '';

    const t = document.createElement('time');
    t.textContent = fmtTime(new Date(ts));
    bubble.appendChild(t);

    wrap.appendChild(bubble);
    return wrap;
}

/* Загрузка сообщений */
async function loadMessages(uid, avatarSrc) {
    try {
        const res = await fetch(`http://127.0.0.1:8000/messages?with_user=${uid}`, {
            headers: {"Authorization": "Bearer " + authToken}
        });
        const data = await res.json();

        chatBox.innerHTML = '';
        if (!data.length) {
            chatBox.innerHTML = '<p class="placeholder">Сообщений пока нет.</p>';
            return;
        }

        data.forEach(msg => {
            const from = (msg.from_user === currentUserID) ? 'me' : 'them';
            chatBox.appendChild(buildMessage({
                from,
                text: msg.text,
                ts: new Date(msg.timestamp).getTime(),
                avatarSrc: from === 'them' ? avatarSrc : null
            }));
        });
        chatBox.scrollTop = chatBox.scrollHeight;
    } catch (err) {
        console.error('Error loading messages:', err);
        chatBox.innerHTML = '<p class="placeholder">Ошибка загрузки сообщений</p>';
    }
}

/* Открыть диалог */
function openChat(card) {
    if (!card) return;

    dialogs.forEach(d => d.classList.remove('active'));
    card.classList.add('active');

    const uid = card.dataset.user;
    const userName = card.querySelector('.name')?.textContent;
    const avatarSrc = card.querySelector('.avatar')?.src;

    if (!uid || !userName) return;

    headerLbl.textContent = userName;
    if (avatarSrc) {
        avatarHdr.src = avatarSrc;
        avatarHdr.style.display = 'block';
    }
    closeBtn.style.display = 'inline-flex';

    currentUID = uid;
    loadMessages(uid, avatarSrc);
}

/* Закрыть диалог */
closeBtn.onclick = () => {
    dialogs.forEach(d => d.classList.remove('active'));
    headerLbl.textContent = 'Сообщения';
    avatarHdr.style.display = closeBtn.style.display = 'none';
    chatBox.innerHTML =
        '<p class="placeholder">Выберите диалог слева, чтобы начать общение.</p>';
    currentUID = null;
};

/* Отправка */
async function sendMessage() {
    const txt = inputBox.value.trim();
    if (!txt || !currentUID) return;

    try {
        const res = await fetch("http://127.0.0.1:8000/messages", {
            method: "POST",
            headers: {
                "Authorization": "Bearer " + authToken,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({to: parseInt(currentUID), text: txt})
        });

        if (!res.ok) throw new Error('Failed to send message');

        const msg = await res.json();
        const card = document.querySelector(`.dialog-item[data-user="${currentUID}"]`);
        if (!card) return;

        chatBox.appendChild(buildMessage({
            from: 'me',
            text: msg.text,
            ts: new Date(msg.timestamp).getTime()
        }));
        chatBox.scrollTop = chatBox.scrollHeight;
        inputBox.value = '';
        refreshCard(currentUID, msg.text, msg.timestamp);
    } catch (err) {
        console.error('Error sending message:', err);
    }
}
function refreshCard(uid, text, timestamp) {
  const card = document.querySelector(`.dialog-item[data-user="${uid}"]`);
  if (!card) return;

  card.querySelector(".msg").textContent = text;
  card.querySelector(".dialog-date").textContent = formatTime(timestamp);

  // переместить в начало
  const parent = card.parentElement;
  parent.prepend(card);
}

/* ------------------- события ------------------------------------- */
dialogs.forEach(card => card.addEventListener('click', () => openChat(card)));
sendBtn.onclick = sendMessage;
inputBox.addEventListener('keyup', e => e.key === 'Enter' && sendMessage());

async function loadDialogs() {
  const res = await fetch("http://127.0.0.1:8000/dialogs", {
    headers: { "Authorization": "Bearer " + authToken }
  });
  if (!res.ok) return;

  const dialogs = await res.json();
  const list = document.querySelector("#dialogs");

  dialogs.forEach(user => {
    const item = document.createElement("div");
    item.classList.add("dialog-item");
    item.dataset.user = user.id;

    item.innerHTML = `
      <img class="avatar" src="${user.avatar || 'img/default.png'}" />
      <div class="dialog-text">
        <div class="name">${user.login}</div>
        <div class="msg">${truncate(user.last_message || "Нет сообщений", 40)}</div>
      </div>
      <div class="dialog-date">${formatTime(user.timestamp)}</div>
    `;

    item.addEventListener("click", () => openChat(item));
    list.appendChild(item);
  });
}

function truncate(text, max) {
  return text.length > max ? text.slice(0, max) + "…" : text;
}
