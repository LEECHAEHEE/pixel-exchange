// 객장 한 칸. 접속자 목록, 의자 점유, 위치·채팅 중계를 맡는다.
// 위치는 클라이언트가 보낸 값을 범위만 확인해 믿고, 의자는 서버가 주인을 정한다(동시에 앉기 방지).
'use strict';

const { createDog } = require('./dog');
const { createMafia } = require('./mafia');

// public/js/scene.js 의 의자 배치(3줄 × 14개)와 맞춰야 한다
const SEAT_COUNT = 42;
// 장소마다 걸을 수 있는 모양이 달라 서버는 화면(320×180) 안인지만 본다
const BOUNDS = { x0: 0, y0: 0, x1: 319, y1: 179 };
// 객장(의자가 있는 곳)과 public/js/places.js 의 장소들
const MAPS = new Set(['exchange', 'crossroad', 'racetrack', 'mafiazone']);
const DIRS = new Set(['up', 'down', 'left', 'right']);
// 감정표현 종류. 화면(emote.js·scene.js)에 새 표현을 넣으면 여기도 추가한다.
const EMOTES = new Set(['bow']);
const EMOTE_GAP_MS = 500;

const NAME_MAX = 12;
const CHAT_MAX = 60;
const CHAT_GAP_MS = 300;
// 채팅 기록은 서버 메모리에만 둔다. 서버가 꺼지면 사라진다.
const HISTORY_MAX = 100;
const BROADCAST_MS = 100;

const HAIRS = ['#2a2220', '#3b2a20', '#5b3a22', '#8c8c8c', '#d9d9d9', '#a0522d', '#1f2a44'];
const SHIRTS = [
  ['#3a5bbf', '#2c4596'], ['#4f8f5a', '#3c6e45'], ['#d8c79a', '#b8a779'], ['#7a4f9a', '#5e3c78'],
  ['#c8424a', '#9b2c35'], ['#2f8a8a', '#226767'], ['#e08a2e', '#b56d20'], ['#5a5a66', '#43434d']
];
const PANTS = ['#3a3a48', '#4a4a55', '#5a4a3a', '#2c3e5c', '#3d4a3a'];

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// 서버가 정하는 건 머리 색과 기본 옷뿐이다. 머리 모양·모자·신발은 화면이 첫 접속 때 준 기본 아이템이라 벗을 수 있다.
function randomLook() {
  const [shirt, shirtLo] = pick(SHIRTS);
  return { hair: pick(HAIRS), shirt, shirtLo, pants: pick(PANTS) };
}

// 제어문자를 빼고 공백을 하나로 줄인다. 화면에는 textContent 로만 넣으므로 HTML 이스케이프는 필요 없다.
function cleanText(s, max) {
  if (typeof s !== 'string') return '';
  return s.replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim().slice(0, max);
}

// 착용 목록은 아이템 id 문자열 배열. 서버는 목록(카탈로그)을 모르므로 모양만 확인하고 그대로 전달한다.
const EQUIP_MAX = 8;
function cleanEquip(v) {
  if (!Array.isArray(v)) return [];
  const out = [];
  for (const id of v) {
    if (typeof id === 'string' && /^[a-z0-9-]{1,32}$/.test(id) && !out.includes(id)) out.push(id);
    if (out.length >= EQUIP_MAX) break;
  }
  return out;
}

function clampNum(v, lo, hi) {
  return Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : null;
}

function createRoom({ market, race, accounts }) {
  const users = new Map();
  const seats = new Array(SEAT_COUNT).fill(null);
  const dirty = new Set();
  const history = [];
  const mafia = createMafia({ send });
  // 강아지 소식은 강아지가 있는 장소를 보는 사람에게만 보낸다.
  // 주인을 따라 장소를 옮긴 순간에는 떠난 장소에도 한 번 보내 그쪽 화면에서 사라지게 한다.
  let dogMap = 'exchange';
  const dog = createDog({
    users,
    broadcast: msg => {
      if (msg.map !== dogMap) sendMap(dogMap, msg);
      dogMap = msg.map;
      sendMap(msg.map, msg);
    }
  });
  let nextId = 1;
  let guestNo = 1;

  function publicOf(u) {
    return { id: u.id, name: u.name, look: u.look, equip: u.equip, map: u.map, x: u.x, y: u.y, dir: u.dir, moving: u.moving, seat: u.seat };
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

  // 그 장소를 지금 보고 있는 사람. 숨긴 탭·가림 화면(idle)은 그려지지 않으므로 빼고,
  // 다시 볼 때 sync 로 한 번에 맞춘다.
  function watching(u, map) {
    return u.map === map && !u.idle && u.ws.readyState === 1;
  }

  // 장소 안에서만 의미 있는 것(위치·강아지·시세)은 그 장소를 보는 사람에게만 보낸다. 내보내는 양이 곧 호스팅 비용이다.
  function sendMap(map, msg, exceptId) {
    let data = null;
    for (const u of users.values()) {
      if (u.id === exceptId || !watching(u, map)) continue;
      if (data === null) data = JSON.stringify(msg);
      u.ws.send(data);
    }
  }

  // 장소에 들어오거나 다시 볼 때 한 번 보내는 그 장소의 현재 모습.
  // 안 보는 동안 받지 않은 위치·강아지·시세를 여기서 한꺼번에 채운다.
  function sendSync(u) {
    const people = [];
    for (const o of users.values()) {
      if (o !== u && o.map === u.map) {
        people.push([o.id, Math.round(o.x * 10) / 10, Math.round(o.y * 10) / 10, o.dir, o.moving ? 1 : 0, o.seat]);
      }
    }
    const msg = { t: 'sync', map: u.map, people, dog: dog.snapshot() };
    if (u.map === 'exchange') msg.market = market.snapshot();
    send(u, msg);
  }

  // 유저 기록(보유·착용·잔액)을 불러와야 해서 비동기다. 불러오는 사이 창을 닫았으면 입장시키지 않는다.
  //   msg.uid    브라우저 고유 번호
  //   msg.local  그 브라우저에 남아 있던 인벤토리 { owned, equip }. 기록을 처음 만들 때만 쓴다.
  async function join(ws, msg) {
    const name = cleanText(msg.name, NAME_MAX) || '손님' + guestNo++;
    const account = await accounts.enter(msg.uid, name, msg.local);
    if (ws.readyState !== 1) {
      accounts.leave(account);
      return null;
    }
    const id = String(nextId++);
    const u = {
      id, ws, name, look: randomLook(), equip: account.equip.slice(), account, map: 'exchange',
      x: 150 + Math.random() * 20, y: 170 + Math.random() * 6, dir: 'up', moving: false,
      seat: null, lastChat: 0
    };
    users.set(id, u);
    send(u, {
      t: 'welcome',
      me: publicOf(u),
      users: [...users.values()].filter(o => o !== u).map(publicOf),
      inv: accounts.view(account),
      history,
      dog: dog.snapshot(),
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
    if (u.map === 'mafiazone') mafia.leave(u);
    users.delete(u.id);
    accounts.leave(u.account);
    dog.forget(u.id);
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
        const prevMap = u.map;
        u.map = msg.map;
        u.x = x;
        u.y = y;
        if (DIRS.has(msg.dir)) u.dir = msg.dir;
        u.moving = false;
        broadcast({ t: 'go', id: u.id, map: u.map, x: u.x, y: u.y, dir: u.dir }, u.id);
        // 마피아존 입장/퇴장 → 마피아 게임 참가/이탈
        if (prevMap === 'mafiazone' && u.map !== 'mafiazone') mafia.leave(u);
        if (u.map === 'mafiazone' && prevMap !== 'mafiazone') mafia.enter(u);
        if (!u.idle) sendSync(u);
        return;
      }
      // 탭을 숨기거나 X 로 가렸다(on: true) / 다시 본다(on: false). 보는 동안 놓친 것은 sync 로 채운다.
      case 'idle': {
        if (typeof msg.on !== 'boolean' || msg.on === !!u.idle) return;
        u.idle = msg.on;
        if (!u.idle) sendSync(u);
        return;
      }
      // 경마 투표. 결과(받아들인 번호 또는 거절 사유)는 본인에게만 알린다.
      case 'vote': {
        const r = race.vote(u, msg.horse);
        send(u, { t: 'raceVote', horse: race.myVote(u.id), reason: r.ok ? null : r.reason });
        return;
      }
      case 'emote': {
        const now = Date.now();
        if (!EMOTES.has(msg.emote) || now - (u.lastEmote || 0) < EMOTE_GAP_MS) return;
        u.lastEmote = now;
        broadcast({ t: 'emote', id: u.id, emote: msg.emote });
        return;
      }
      // 착용은 가진 아이템만. 요청과 결과가 다르면(안 가진 것을 입으려 함 등) 본인에게 바로잡은 목록을 보낸다.
      case 'equip': {
        const asked = cleanEquip(msg.equip);
        u.equip = accounts.setEquip(u.account, asked);
        broadcast({ t: 'equip', id: u.id, equip: u.equip });
        if (asked.join() !== u.equip.join()) send(u, Object.assign({ t: 'inv' }, accounts.view(u.account)));
        return;
      }
      // 구매: 서버가 잔액을 확인하고 깎는다. 결과(바뀐 인벤토리와 실패 사유)는 본인에게만.
      case 'buy': {
        const reason = accounts.buy(u.account, msg.id);
        send(u, Object.assign({ t: 'inv', bought: reason ? null : msg.id, reason }, accounts.view(u.account)));
        return;
      }
      case 'chat': {
        const now = Date.now();
        if (now - u.lastChat < CHAT_GAP_MS) return;
        const text = cleanText(msg.text, CHAT_MAX);
        if (!text) return;
        u.lastChat = now;
        // 마피아존 안에서는 게임 전용 채널로 격리한다(존 밖으로 새지 않음)
        if (u.map === 'mafiazone') { mafia.handleChat(u, text); return; }
        // 존 밖 전역 채팅: 마피아존에 있는 사람에게는 보내지 않는다
        history.push({ name: u.name, text, at: now });
        if (history.length > HISTORY_MAX) history.shift();
        const data = JSON.stringify({ t: 'chat', id: u.id, name: u.name, text, at: now });
        for (const o of users.values()) if (o.map !== 'mafiazone' && o.ws.readyState === 1) o.ws.send(data);
        return;
      }
      // 마피아존 전용 메시지는 존 안에 있을 때만 게임 매니저로 넘긴다
      case 'mzReady':
      case 'mzNight':
      case 'mzVote':
      case 'mzConfirm':
      case 'mzSkip':
        if (u.map === 'mafiazone') mafia.handle(u, msg);
        return;
    }
  }

  // 위치는 0.1초마다 바뀐 사람만 장소별로 모아, 그 장소를 보는 사람에게 한 번에 보낸다.
  // 접속자가 많아도 메시지 수가 늘지 않는다.
  let exchangeWatched = false;
  setInterval(() => {
    let watchers = 0;
    let dogWatchers = 0;
    const dm = dog.snapshot().map;
    for (const u of users.values()) {
      if (watching(u, 'exchange')) watchers++;
      if (watching(u, dm)) dogWatchers++;
    }
    // 강아지가 있는 장소를 아무도 안 보고 주인도 없으면 강아지는 멈춰 둔다(돌아오면 sync 로 맞춘다).
    // 주인이 있으면 주인이 장소를 옮길 때 따라가야 하므로 계속 움직인다.
    if (dogWatchers > 0 || dog.snapshot().owner) dog.tick(BROADCAST_MS / 1000);
    // 객장을 보는 사람이 없으면 데모 시세도 쉰다
    if ((watchers > 0) !== exchangeWatched) {
      exchangeWatched = watchers > 0;
      market.setWatched(exchangeWatched);
    }

    if (dirty.size === 0) return;
    const byMap = new Map();
    for (const id of dirty) {
      const u = users.get(id);
      if (!u) continue;
      if (!byMap.has(u.map)) byMap.set(u.map, []);
      byMap.get(u.map).push([u.id, Math.round(u.x * 10) / 10, Math.round(u.y * 10) / 10, u.dir, u.moving ? 1 : 0]);
    }
    dirty.clear();
    for (const [map, list] of byMap) sendMap(map, { t: 'moves', list });
  }, BROADCAST_MS);

  return { join, leave, handle, broadcast, sendMap, get size() { return users.size; } };
}

module.exports = { createRoom };
