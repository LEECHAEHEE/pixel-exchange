// 강아지. 모든 접속자에게 같은 강아지가 보이도록 서버가 움직임·주인·있는 장소를 정한다.
//
// 주인이 없으면 지금 장소의 통로를 오가며 돌아다닌다(처음에는 객장).
// 같은 장소에서 누군가 강아지 근처로 '들어오면' 그 사람이 주인이 되고, 강아지는 주인 뒤를 따라간다.
// 주인이 다른 장소로 옮기면 강아지도 함께 옮겨 간다.
// 근처에 계속 서 있는 것만으로는 바뀌지 않는다(주인과 나란히 선 사람과 1초마다 주인이 오가는 것을 막는다).
// 주인이 바뀐 뒤 1초가 지나야 다시 바뀔 수 있다.
// 주인이 10초 동안 움직이지 않으면(앉아 있는 것 포함) 주인을 버리고 그 장소에서 다시 돌아다닌다.
// 10초 넘게 가만히 있는 사람은 강아지가 옆을 지나가도 주인이 되지 않는다(버린 주인을 곧바로 다시 고르지 않게).
'use strict';

const MEET_PX = 12;
const SWITCH_GAP_MS = 1000;
const IDLE_MS = 10000;
const WANDER_SPEED = 25;
const FOLLOW_SPEED = 62;
const FOLLOW_GAP = 10;
// 상태는 0.2초에 한 번까지만 보낸다. 화면이 받은 위치를 향해 걷는 속도로 따라가므로 그 사이는 보이지 않는다.
const SEND_MS = 200;
const BEHIND = { up: [0, 8], down: [0, -8], left: [FOLLOW_GAP, 0], right: [-FOLLOW_GAP, 0] };

// 장소마다
//   walk     따라갈 때 강아지가 설 수 있는 곳(주인 뒤 자리가 벽이면 이 안으로 당긴다)
//   zones    혼자 돌아다니는 통로. 서로 다른 통로로 갈 때는 junction 을 거쳐 간다.
// 객장은 public/js/scene.js 의 의자 배치, 나머지는 public/js/places.js 의 walk·blocks 와 맞춰야 한다.
const MAPS = {
  exchange: {
    walk: [{ x0: 4, y0: 120, x1: 316, y1: 179 }],
    zones: [
      { x0: 20, x1: 300, y0: 121, y1: 128 },   // 맨 앞 통로
      { x0: 152, x1: 168, y0: 121, y1: 178 }   // 가운데 카펫 통로
    ],
    junction: { x: 160, y: 124 }
  },
  // 코인 거래소·미국 증시: 객장 양옆 방. 의자가 없어 바닥 전체를 돌아다닌다(양쪽 끝 출구 줄은 피한다).
  coin: {
    walk: [{ x0: 4, y0: 120, x1: 314, y1: 179 }],
    zones: [{ x0: 20, x1: 300, y0: 124, y1: 170 }],
    junction: null
  },
  us: {
    walk: [{ x0: 4, y0: 120, x1: 314, y1: 179 }],
    zones: [{ x0: 20, x1: 300, y0: 124, y1: 170 }],
    junction: null
  },
  crossroad: {
    walk: [
      { x0: 4, y0: 80, x1: 283, y1: 116 },     // 가로 복도(왼쪽 풋살장 문까지)
      { x0: 140, y0: 2, x1: 180, y1: 168 }     // 세로 복도(출구 줄·아래 화분 앞까지)
    ],
    zones: [
      { x0: 44, x1: 276, y0: 86, y1: 112 },
      { x0: 150, x1: 170, y0: 10, y1: 165 }
    ],
    junction: { x: 160, y: 98 }
  },
  // 풋살장: 경기장 바닥 전체를 따라다니고, 혼자일 때는 위쪽 관람 통로만 오간다(공과는 상관없다)
  futsal: {
    walk: [{ x0: 8, y0: 30, x1: 312, y1: 174 }],
    zones: [{ x0: 20, x1: 296, y0: 30, y1: 36 }],
    junction: null
  },
  racetrack: {
    walk: [
      { x0: 22, y0: 28, x1: 298, y1: 60 },     // 관람석 앞 바닥
      { x0: 150, y0: 16, x1: 170, y1: 30 }     // 입구
    ],
    zones: [{ x0: 30, x1: 290, y0: 32, y1: 56 }],
    junction: null
  }
};

function rand(a, b) {
  return a + Math.random() * (b - a);
}

function inRect(r, x, y) {
  return x >= r.x0 && x <= r.x1 && y >= r.y0 && y <= r.y1;
}

function clamp(v, lo, hi) {
  return Math.min(hi, Math.max(lo, v));
}

function mapOf(u) {
  return MAPS[u.map] ? u.map : 'exchange';
}

function createDog({ users, broadcast }) {
  const dog = { map: 'exchange', x: 160, y: 150, dir: 'left', moving: false, owner: null, ownerSince: -SWITCH_GAP_MS };
  let path = [];
  let wait = 1;
  let sent = '';
  let sentAt = -SEND_MS;
  const near = new Set();
  // 사람마다 마지막으로 위치가 바뀐 때. 10초 가만히 있는지 판단한다.
  const lastMove = new Map();
  // 1초·10초 제한은 tick 으로 흐른 시간으로 잰다(실제 시계 대신 써서 시험에서도 같은 결과가 난다)
  let clock = 0;

  function trackMoves(now) {
    for (const id of [...lastMove.keys()]) if (!users.has(id)) lastMove.delete(id);
    for (const u of users.values()) {
      const m = lastMove.get(u.id);
      if (!m || m.x !== u.x || m.y !== u.y) lastMove.set(u.id, { x: u.x, y: u.y, t: now });
    }
  }

  function isIdle(id, now) {
    const m = lastMove.get(id);
    return !!m && now - m.t >= IDLE_MS;
  }

  function planWander() {
    const m = MAPS[dog.map];
    const z = m.zones.length > 1 && Math.random() >= 0.65 ? m.zones[1] : m.zones[0];
    const t = { x: rand(z.x0, z.x1), y: rand(z.y0, z.y1) };
    // 한 통로 안에서 갈 수 있으면 곧장, 아니면 통로가 만나는 곳을 거쳐 간다
    const direct = !m.junction || m.zones.some(r => inRect(r, dog.x, dog.y) && inRect(r, t.x, t.y));
    path = direct ? [t] : [m.junction, t];
  }

  // 주인 뒤 자리. 벽 너머면 주인이 서 있는 칸 안으로 당긴다.
  function followTarget(o) {
    const [ox, oy] = BEHIND[o.dir] || [0, 0];
    const tx = o.x + ox, ty = o.y + oy;
    const walk = MAPS[dog.map].walk;
    if (walk.some(r => inRect(r, tx, ty))) return [tx, ty];
    const r = walk.find(w => inRect(w, o.x, o.y)) || walk[0];
    return [clamp(tx, r.x0, r.x1), clamp(ty, r.y0, r.y1)];
  }

  // 한 걸음 이동. 도착하면 true.
  function stepTo(tx, ty, speed, dt) {
    const dx = tx - dog.x, dy = ty - dog.y;
    const dist = Math.hypot(dx, dy);
    const step = speed * dt;
    if (Math.abs(dx) > 0.3) dog.dir = dx < 0 ? 'left' : 'right';
    if (dist <= step) {
      dog.x = tx;
      dog.y = ty;
      return true;
    }
    dog.x += dx / dist * step;
    dog.y += dy / dist * step;
    return false;
  }

  function setOwner(id, now) {
    dog.owner = id;
    dog.ownerSince = now;
    path = [];
  }

  function checkOwners(now) {
    for (const id of [...near]) if (!users.has(id)) near.delete(id);
    for (const u of users.values()) {
      const isNear = mapOf(u) === dog.map && Math.hypot(u.x - dog.x, u.y - dog.y) < MEET_PX;
      if (isNear && !near.has(u.id)) {
        near.add(u.id);
        if (isIdle(u.id, now)) continue;
        const free = !dog.owner;
        const canSwitch = dog.owner !== u.id && now - dog.ownerSince >= SWITCH_GAP_MS;
        if (free || canSwitch) setOwner(u.id, now);
      } else if (!isNear) {
        near.delete(u.id);
      }
    }
  }

  function tick(dt) {
    clock += dt * 1000;
    const now = clock;
    if (dog.owner && !users.has(dog.owner)) dog.owner = null;
    trackMoves(now);
    // 주인이 10초 동안 가만히 있으면 버리고 바로 돌아다니기 시작한다
    if (dog.owner && isIdle(dog.owner, now)) {
      dog.owner = null;
      path = [];
      wait = 0;
    }

    // 주인이 다른 장소로 옮겼으면 강아지도 주인 뒤로 옮겨 간다.
    // 옮긴 곳 근처에 서 있던 사람은 '이미 근처'로 쳐서, 도착하자마자 주인을 빼앗지 않게 한다.
    if (dog.owner) {
      const o = users.get(dog.owner);
      if (mapOf(o) !== dog.map) {
        dog.map = mapOf(o);
        [dog.x, dog.y] = followTarget(o);
        path = [];
        near.clear();
        for (const u of users.values()) {
          if (mapOf(u) === dog.map && Math.hypot(u.x - dog.x, u.y - dog.y) < MEET_PX) near.add(u.id);
        }
      }
    }
    checkOwners(now);

    if (dog.owner) {
      const [tx, ty] = followTarget(users.get(dog.owner));
      // 주인 바로 뒤에 붙으면 멈춘다
      dog.moving = Math.hypot(tx - dog.x, ty - dog.y) > 3;
      if (dog.moving) stepTo(tx, ty, FOLLOW_SPEED, dt);
    } else if (wait > 0) {
      wait -= dt;
      dog.moving = false;
    } else {
      if (!path.length) planWander();
      dog.moving = true;
      if (stepTo(path[0].x, path[0].y, WANDER_SPEED, dt)) {
        path.shift();
        if (!path.length) wait = rand(1, 4);
      }
    }

    // 바뀐 것이 있을 때만, 0.2초 간격으로 보낸다. 미룬 변화는 다음 차례에 마지막 상태로 나간다.
    if (now - sentAt < SEND_MS - 1) return;
    const msg = snapshot();
    const key = `${msg.map},${msg.x},${msg.y},${msg.dir},${msg.moving},${msg.owner}`;
    if (key !== sent) {
      sent = key;
      sentAt = now;
      broadcast(Object.assign({ t: 'dog' }, msg));
    }
  }

  function snapshot() {
    return {
      map: dog.map,
      x: Math.round(dog.x * 10) / 10,
      y: Math.round(dog.y * 10) / 10,
      dir: dog.dir,
      moving: dog.moving ? 1 : 0,
      owner: dog.owner
    };
  }

  function forget(id) {
    near.delete(id);
    lastMove.delete(id);
    if (dog.owner === id) dog.owner = null;
  }

  return { tick, snapshot, forget };
}

module.exports = { createDog };
