// 객장 강아지. 모든 접속자에게 같은 강아지가 보이도록 서버가 움직임과 주인을 정한다.
//
// 주인이 없으면 맨 앞 통로와 가운데 통로를 오가며 돌아다닌다.
// 누군가 강아지 근처로 '들어오면' 그 사람이 주인이 되고, 강아지는 주인 뒤를 따라간다.
// 근처에 계속 서 있는 것만으로는 바뀌지 않는다(주인과 나란히 선 사람과 1초마다 주인이 오가는 것을 막는다).
// 주인이 바뀐 뒤 1초가 지나야 다시 바뀔 수 있다.
'use strict';

const MEET_PX = 12;
const SWITCH_GAP_MS = 1000;
const WANDER_SPEED = 25;
const FOLLOW_SPEED = 62;
const FOLLOW_GAP = 10;

// 의자 사이를 지나지 않도록 돌아다니는 곳을 두 칸으로 나눈다. 두 칸은 (160, 124) 에서 만난다.
// public/js/scene.js 의 의자 배치와 맞춰야 한다.
const ZONES = [
  { x0: 20, x1: 300, y0: 121, y1: 128 },   // 맨 앞 통로
  { x0: 152, x1: 168, y0: 121, y1: 178 }   // 가운데 카펫 통로
];
const JUNCTION = { x: 160, y: 124 };
const BEHIND = { up: [0, 8], down: [0, -8], left: [FOLLOW_GAP, 0], right: [-FOLLOW_GAP, 0] };

function rand(a, b) {
  return a + Math.random() * (b - a);
}

function zoneOf(x, y) {
  return y > ZONES[0].y1 && x >= ZONES[1].x0 - 2 && x <= ZONES[1].x1 + 2 ? 1 : 0;
}

// 강아지는 객장에만 있다. 다른 장소(사거리·경마장)에 있는 사람은 주인이 될 수 없다.
function inExchange(u) {
  return !u.map || u.map === 'exchange';
}

function createDog({ users, broadcast, bounds }) {
  const dog = { x: 160, y: 150, dir: 'left', moving: false, owner: null, ownerSince: -SWITCH_GAP_MS };
  let path = [];
  let wait = 1;
  let sent = '';
  const near = new Set();
  // 1초 제한은 tick 으로 흐른 시간으로 잰다(실제 시계 대신 써서 시험에서도 같은 결과가 난다)
  let clock = 0;

  function clamp(v, lo, hi) {
    return Math.min(hi, Math.max(lo, v));
  }

  function planWander() {
    const z = ZONES[Math.random() < 0.65 ? 0 : 1];
    const t = { x: rand(z.x0, z.x1), y: rand(z.y0, z.y1) };
    // 다른 칸으로 갈 때는 두 칸이 만나는 곳을 거쳐 간다
    path = zoneOf(dog.x, dog.y) === zoneOf(t.x, t.y) ? [t] : [JUNCTION, t];
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
      const isNear = inExchange(u) && Math.hypot(u.x - dog.x, u.y - dog.y) < MEET_PX;
      if (isNear && !near.has(u.id)) {
        near.add(u.id);
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
    // 주인이 나갔거나 객장을 떠나면 다시 혼자 돌아다닌다
    if (dog.owner && (!users.has(dog.owner) || !inExchange(users.get(dog.owner)))) dog.owner = null;
    checkOwners(now);

    if (dog.owner) {
      const o = users.get(dog.owner);
      const [ox, oy] = BEHIND[o.dir] || [0, 0];
      const tx = clamp(o.x + ox, bounds.x0, bounds.x1);
      const ty = clamp(o.y + oy, bounds.y0, bounds.y1);
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

    // 바뀐 것이 있을 때만 보낸다
    const msg = snapshot();
    const key = `${msg.x},${msg.y},${msg.dir},${msg.moving},${msg.owner}`;
    if (key !== sent) {
      sent = key;
      broadcast(Object.assign({ t: 'dog' }, msg));
    }
  }

  function snapshot() {
    return {
      x: Math.round(dog.x * 10) / 10,
      y: Math.round(dog.y * 10) / 10,
      dir: dog.dir,
      moving: dog.moving ? 1 : 0,
      owner: dog.owner
    };
  }

  function forget(id) {
    near.delete(id);
    if (dog.owner === id) dog.owner = null;
  }

  return { tick, snapshot, forget };
}

module.exports = { createDog };
