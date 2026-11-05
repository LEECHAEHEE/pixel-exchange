// 객장 한 칸. 접속자 목록, 의자 점유, 위치·채팅 중계를 맡는다.
// 위치는 클라이언트가 보낸 값을 범위만 확인해 믿고, 의자는 서버가 주인을 정한다(동시에 앉기 방지).
'use strict';

// public/js/scene.js 의 의자 배치(3줄 × 14개)와 맞춰야 한다
const SEAT_COUNT = 42;
// 장소마다 걸을 수 있는 모양이 달라 서버는 화면(320×180) 안인지만 본다
const BOUNDS = { x0: 0, y0: 0, x1: 319, y1: 179 };
// 객장(의자가 있는 곳)과 public/js/places.js 의 장소들
const MAPS = new Set(['exchange', 'crossroad', 'racetrack']);
const DIRS = new Set(['up', 'down', 'left', 'right']);

const NAME_MAX = 12;
const CHAT_MAX = 60;
const CHAT_GAP_MS = 300;
const BROADCAST_MS = 100;

const HAIRS = ['#2a2220', '#3b2a20', '#5b3a22', '#8c8c8c', '#d9d9d9', '#a0522d', '#1f2a44'];
const SHIRTS = [
  ['#3a5bbf', '#2c4596'], ['#4f8f5a', '#3c6e45'], ['#d8c79a', '#b8a779'], ['#7a4f9a', '#5e3c78'],
  ['#c8424a', '#9b2c35'], ['#2f8a8a', '#226767'], ['#e08a2e', '#b56d20'], ['#5a5a66', '#43434d']
];
const PANTS = ['#3a3a48', '#4a4a55', '#5a4a3a', '#2c3e5c', '#3d4a3a'];
const CAPS = [['#d83a3a', '#a82626'], ['#2f5fd8', '#2346a8'], ['#2f9a4a', '#22733a'], ['#e0b030', '#b08a20']];

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomLook() {
  const [shirt, shirtLo] = pick(SHIRTS);
  const look = { hair: pick(HAIRS), shirt, shirtLo, pants: pick(PANTS) };
  if (Math.random() < 0.5) {
    const [cap, capLo] = pick(CAPS);
    look.cap = cap;
    look.capLo = capLo;
  }
  return look;
}

// 제어문자를 빼고 공백을 하나로 줄인다. 화면에는 textContent 로만 넣으므로 HTML 이스케이프는 필요 없다.
function cleanText(s, max) {
  if (typeof s !== 'string') return '';
  return s.replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function clampNum(v, lo, hi) {
  return Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : null;
}

function createRoom({ market, race }) {
  const users = new Map();
  const seats = new Array(SEAT_COUNT).fill(null);
  const dirty = new Set();
  let nextId = 1;
  let guestNo = 1;

  function publicOf(u) {
    return { id: u.id, name: u.name, look: u.look, map: u.map, x: u.x, y: u.y, dir: u.dir, moving: u.moving, seat: u.seat };
  }

  // 같은 메시지를 접속자 수만큼 직렬화하지 않도록 한 번만 문자열로 만든다
  function broadcast(msg, exceptId) {
    const data = JSON.stringify(msg);
    for (const u of users.values()) {
      if (u.id !== exceptId && u.ws.readyState === 1) u.ws.send(data);
    }
  }

  function send(u, msg) {
    if (u.ws.readyState === 1) u.ws.send(JSON.stringify(msg));
  }

  function join(ws, rawName) {
    const id = String(nextId++);
    const name = cleanText(rawName, NAME_MAX) || '손님' + guestNo++;
    const u = {
      id, ws, name, look: randomLook(), map: 'exchange',
      x: 150 + Math.random() * 20, y: 170 + Math.random() * 6, dir: 'up', moving: false,
      seat: null, lastChat: 0
    };
    users.set(id, u);
    send(u, {
      t: 'welcome',
      me: publicOf(u),
      users: [...users.values()].filter(o => o !== u).map(publicOf),
      market: market.snapshot(),
      race: race.snapshot()
    });
    broadcast({ t: 'join', user: publicOf(u) }, id);
    console.log(`[room] join id=${id} name=${name} users=${users.size}`);
    return u;
  }

  function leave(u) {
    if (!users.has(u.id)) return;
    if (u.seat !== null) seats[u.seat] = null;
    race.leave(u.id);
    users.delete(u.id);
    dirty.delete(u.id);
    broadcast({ t: 'leave', id: u.id });
    console.log(`[room] leave id=${u.id} users=${users.size}`);
  }

  function handle(u, msg) {
    switch (msg.t) {
      // 호스팅이 서버를 재우지 않게 하는 신호. 할 일은 없다.
      case 'ping':
        return;
      case 'move': {
        if (u.seat !== null) return;
        const x = clampNum(msg.x, BOUNDS.x0, BOUNDS.x1);
        const y = clampNum(msg.y, BOUNDS.y0, BOUNDS.y1);
        if (x === null || y === null) return;
        u.x = x;
        u.y = y;
        if (DIRS.has(msg.dir)) u.dir = msg.dir;
        u.moving = !!msg.moving;
        dirty.add(u.id);
        return;
      }
      case 'sit': {
        const seat = msg.seat;
        if (!Number.isInteger(seat) || seat < 0 || seat >= SEAT_COUNT) return;
        if (u.seat !== null || seats[seat] !== null || u.map !== 'exchange') {
          send(u, { t: 'sitDenied', seat });
          return;
        }
        seats[seat] = u.id;
        u.seat = seat;
        u.moving = false;
        broadcast({ t: 'sit', id: u.id, seat });
        return;
      }
      case 'stand': {
        if (u.seat === null) return;
        seats[u.seat] = null;
        u.seat = null;
        const x = clampNum(msg.x, BOUNDS.x0, BOUNDS.x1);
        const y = clampNum(msg.y, BOUNDS.y0, BOUNDS.y1);
        if (x !== null && y !== null) { u.x = x; u.y = y; }
        if (DIRS.has(msg.dir)) u.dir = msg.dir;
        broadcast({ t: 'stand', id: u.id, x: u.x, y: u.y, dir: u.dir });
        return;
      }
      // 다른 장소로 옮겨 감. 앉아 있으면 옮길 수 없다.
      case 'go': {
        if (u.seat !== null || !MAPS.has(msg.map)) return;
        const x = clampNum(msg.x, BOUNDS.x0, BOUNDS.x1);
        const y = clampNum(msg.y, BOUNDS.y0, BOUNDS.y1);
        if (x === null || y === null) return;
        u.map = msg.map;
        u.x = x;
        u.y = y;
        if (DIRS.has(msg.dir)) u.dir = msg.dir;
        u.moving = false;
        broadcast({ t: 'go', id: u.id, map: u.map, x: u.x, y: u.y, dir: u.dir }, u.id);
        return;
      }
      // 경마 투표. 결과(받아들인 번호 또는 거절 사유)는 본인에게만 알린다.
      case 'vote': {
        const r = race.vote(u, msg.horse);
        send(u, { t: 'raceVote', horse: race.myVote(u.id), reason: r.ok ? null : r.reason });
        return;
      }
      case 'chat': {
        const now = Date.now();
        if (now - u.lastChat < CHAT_GAP_MS) return;
        const text = cleanText(msg.text, CHAT_MAX);
        if (!text) return;
        u.lastChat = now;
        broadcast({ t: 'chat', id: u.id, text });
        return;
      }
    }
  }

  // 위치는 0.1초마다 바뀐 사람만 모아 한 번에 보낸다. 접속자가 많아도 메시지 수가 늘지 않는다.
  setInterval(() => {
    if (dirty.size === 0) return;
    const list = [];
    for (const id of dirty) {
      const u = users.get(id);
      if (u) list.push([u.id, Math.round(u.x * 10) / 10, Math.round(u.y * 10) / 10, u.dir, u.moving ? 1 : 0]);
    }
    dirty.clear();
    if (list.length) broadcast({ t: 'moves', list });
  }, BROADCAST_MS);

  return { join, leave, handle, broadcast, get size() { return users.size; } };
}

module.exports = { createRoom };
