/* jshint esversion: 11 */
"use strict";


let currentUID = null;          // активный собеседник
let currentUserID = null;
let authToken = localStorage.getItem("access_token");
let socket;

async function getCurrentUser() {
    const res = await fetch("http://127.0.0.1:8000/me", {
        headers: {"Authorization": "Bearer " + authToken}
    });
    if (res.ok) {
        const user = await res.json();
        currentUserID = user.id;
        document.getElementById("owner-name").textContent = user.login;
        document.getElementById("owner-avatar").src = user.avatar || "img/default.png";
    } else {
        localStorage.clear();
        window.location.href = "register.html";
    }
}

getCurrentUser().then(() => {
  loadDialogs();
  setupWebSocket();
});

/* ------------------- DOM-ссылки ------------------------------------ */
const chatBox = document.getElementById('chat');
const headerLbl = document.getElementById('user-info');
const inputBox = document.querySelector('#composer input');
const sendBtn = document.querySelector('#composer button');
const avatarHdr = document.getElementById('header-avatar');
const closeBtn = document.getElementById('close-chat');
const searchInp = document.getElementById('search-input');
const resultBox = document.getElementById('search-results');

/* ------------------- утилиты -------------------------------------- */
const fmtTime = d => d.toLocaleTimeString('ru-RU', {hour: '2-digit', minute: '2-digit'});
const fmtDate = d => d.toLocaleDateString('ru-RU', {day: 'numeric', month: 'short'});

function formatTime(ts) {
  if (!ts) return '';
  return fmtDate(new Date(ts)) + ' ' + fmtTime(new Date(ts));
}

/* Обновляем превью и время в карточке */

/* ссылки */
const logoutBtn = document.getElementById('owner-logout');
const ownerName = document.getElementById('owner-name');
const ownerAv = document.getElementById('owner-avatar');

/* обработчик выхода */
logoutBtn.addEventListener('click', () => {
    localStorage.clear();
    window.location.href = "register.html";
});

function setupWebSocket() {
  socket = new WebSocket(`ws://127.0.0.1:8000/ws?token=${authToken}`);
  socket.onmessage = e => {
    try {
      const msg = JSON.parse(e.data);
      if (msg.type === 'message') {
        handleIncoming(msg.data);
      } else if (msg.type === 'delete') {
        const bubble = document.querySelector(`.msg-wrap[data-id="${msg.data.id}"]`);
        if (bubble) bubble.remove();
      }
    } catch {}
  };
  socket.onclose = () => setTimeout(setupWebSocket, 2000);
  setInterval(() => {
    if (socket.readyState === WebSocket.OPEN) socket.send("ping");
  }, 30000);
}

function handleIncoming(data) {
  const from = data.from_user === currentUserID ? 'me' : 'them';
  const otherId = from === 'me' ? data.to : data.from_user;

  if (currentUID && (currentUID == otherId)) {
    chatBox.appendChild(buildMessage({
      id: data.id,
      from,
      text: data.text,
      ts: new Date(data.timestamp).getTime(),
      avatarSrc: from === 'them' ?
        document.querySelector(`.dialog-item[data-user="${otherId}"] .avatar`)?.src : null
    }));
    chatBox.scrollTop = chatBox.scrollHeight;
  }
  refreshCard(otherId, data.text, data.timestamp);
}

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

    const found = Array.from(document.querySelectorAll('.dialog-item')).filter(card =>
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
function buildMessage({id, from, text, ts, avatarSrc}) {
    const wrap = document.createElement('div');
    wrap.className = `msg-wrap ${from === 'me' ? 'out' : 'in'}`;
    if (id) wrap.dataset.id = id;

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
                id: msg.id,
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

    document.querySelectorAll('.dialog-item').forEach(d => d.classList.remove('active'));
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
    document.querySelectorAll('.dialog-item').forEach(d => d.classList.remove('active'));
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
            id: msg.id,
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

async function updateOnline() {
  try {
    const res = await fetch('http://127.0.0.1:8000/online');
    if (!res.ok) return;
    const ids = await res.json();
    document.querySelectorAll('.dialog-item').forEach(c => {
      c.classList.toggle('online', ids.includes(parseInt(c.dataset.user)));
    });
  } catch {}
}

/* ------------------- события ------------------------------------- */
document.querySelectorAll('.dialog-item').forEach(card =>
    card.addEventListener('click', () => openChat(card)));
sendBtn.onclick = sendMessage;
inputBox.addEventListener('keyup', e => e.key === 'Enter' && sendMessage());
chatBox.addEventListener('dblclick', async e => {
  const wrap = e.target.closest('.msg-wrap.out');
  if (!wrap) return;
  const id = wrap.dataset.id;
  if (!id) return;
  if (!confirm('Удалить сообщение?')) return;
  await fetch(`http://127.0.0.1:8000/messages/${id}`, {
    method: 'DELETE',
    headers: { 'Authorization': 'Bearer ' + authToken }
  });
  wrap.remove();
});

async function loadDialogs() {
  const res = await fetch("http://127.0.0.1:8000/dialogs", {
    headers: { "Authorization": "Bearer " + authToken }
  });
  if (!res.ok) return;

  const items = await res.json();
  const list = document.querySelector("#dialogs");

  items.forEach(user => {
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

setInterval(updateOnline, 10000);
updateOnline();
