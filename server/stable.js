// 경마장 마굿간과 관리인.
//
// 마굿간 칸마다 말이 한 마리씩 있다. 칸 앞에서 Space 를 누르면 말을 훔쳐 타고(steal),
// 탄 채로 마굿간 칸 앞에서 다시 누르면 제자리에 돌려놓는다(giveBack).
// 말을 탄 사람은 어느 장소에서나 말을 탄 채로 보인다. 옷을 갈아입어도 그대로다.
//
// 관리인은 서버가 움직이는 NPC 라 모두에게 같은 자리에 보인다.
//   - 경마장에 말 탄 사람이 있으면 잠깐 알아챈 뒤 쫓아간다. 닿으면 말을 뺏어 마굿간에 돌려놓는다.
//   - 경마장을 벗어나면(사거리로 나가면) 더 쫓지 못하고 자기 자리로 돌아간다.
//   - 말을 탄 채 경마장에 다시 들어오면 또 쫓는다.
// 관리인은 걷는 사람보다 빠르고 말보다 느리다. 말을 타고 곧장 문으로 가면 도망칠 수 있다.
'use strict';

// public/js/places.js 의 마굿간·광장 배치와 맞춰야 한다
const STALL_X = [36, 60, 84];      // 칸 가운데 x
const STALL_FRONT_Y = 28;          // 칸 문 바로 아래(광장 맨 윗줄)
const POST = { x: 30, y: 50, dir: 'right' };
// 관리인이 다닐 수 있는 곳: 관람 광장과 출입문 통로(문 밖으로는 못 나간다)
const AREAS = [
  { x0: 22, x1: 298, y0: 28, y1: 56 },
  { x0: 152, x1: 168, y0: 16, y1: 30 }
];

const NOTICE_S = 0.6;     // 말이 없어진 걸 알아채기까지
const CHASE_SPEED = 66;   // 사람 걸음 55, 말 82(public/js/scene.js)
const RETURN_SPEED = 40;
const CATCH_PX = 9;
// 서버가 사람 위치를 아는 간격(0.1초) 동안 말이 움직이는 거리만큼은 봐 준다
const STALL_REACH = { x: 14, y: 16 };
const SEND_MS = 200;

function inArea(x, y) {
  return AREAS.some(r => x >= r.x0 && x <= r.x1 && y >= r.y0 && y <= r.y1);
}

function createStable({ users, broadcast, sendMap }) {
  // 칸마다 말을 가져간 사람 id. null 이면 말이 칸에 있다.
  const stalls = STALL_X.map(() => null);
  const keeper = { x: POST.x, y: POST.y, dir: POST.dir, moving: false, target: null, wait: 0 };
  let sent = '';
  let sentAt = -SEND_MS;
  let clock = 0;

  function say(text) {
    sendMap('racetrack', { t: 'keeperSay', text });
  }

  function setMount(u, stall, why) {
    u.mount = stall;
    broadcast({ t: 'mount', id: u.id, stall, why });
  }

  // 사람이 서 있는 칸(앞에 붙어 섰는지). 없으면 -1.
  function stallAt(u) {
    if (u.map !== 'racetrack' || u.y > STALL_FRONT_Y + STALL_REACH.y) return -1;
    return STALL_X.findIndex(x => Math.abs(u.x - x) <= STALL_REACH.x);
  }

  function steal(u, stall) {
    if (u.mount != null || u.seat != null) return false;
    if (!Number.isInteger(stall) || stall < 0 || stall >= stalls.length || stalls[stall] !== null) return false;
    if (stallAt(u) !== stall) return false;
    stalls[stall] = u.id;
    setMount(u, stall, 'steal');
    return true;
  }

  // 아무 칸 앞에서나 돌려놓을 수 있고, 말은 원래 칸으로 들어간다
  function giveBack(u) {
    if (u.mount == null || stallAt(u) < 0) return false;
    stalls[u.mount] = null;
    setMount(u, null, 'return');
    return true;
  }

  function leave(u) {
    if (u.mount != null) stalls[u.mount] = null;
    if (keeper.target === u.id) keeper.target = null;
    u.mount = null;
  }

  // 막히면 가로·세로 한쪽으로만이라도 움직인다(광장에서 문 통로로 돌아 들어갈 때)
  function stepTo(tx, ty, speed, dt) {
    const dx = tx - keeper.x, dy = ty - keeper.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 0.5) return true;
    const step = Math.min(dist, speed * dt);
    const nx = keeper.x + dx / dist * step, ny = keeper.y + dy / dist * step;
    if (inArea(nx, ny)) { keeper.x = nx; keeper.y = ny; }
    else if (inArea(nx, keeper.y)) keeper.x = nx;
    else if (inArea(keeper.x, ny)) keeper.y = ny;
    else return false;
    if (Math.abs(dx) >= Math.abs(dy)) keeper.dir = dx < 0 ? 'left' : 'right';
    else keeper.dir = dy < 0 ? 'up' : 'down';
    return dist <= speed * dt;
  }

  function thiefOk(u) {
    return u && u.map === 'racetrack' && u.mount != null;
  }

  // 경마장에 있는 사람이 있거나 관리인이 아직 할 일이 있을 때만 room 이 부른다
  function busy() {
    if (keeper.target || keeper.x !== POST.x || keeper.y !== POST.y) return true;
    for (const u of users.values()) if (u.map === 'racetrack') return true;
    return false;
  }

  function tick(dt) {
    clock += dt * 1000;
    const t = keeper.target && users.get(keeper.target);
    if (keeper.target && !thiefOk(t)) {
      // 말을 탄 채 경마장을 벗어났다
      if (t && t.mount != null) say('거기 서! …놓쳤다. 다음엔 꼭 잡는다!');
      keeper.target = null;
    }

    if (!keeper.target) {
      // 가장 가까운 말 도둑을 고른다
      let best = null, bestD = Infinity;
      for (const u of users.values()) {
        if (!thiefOk(u)) continue;
        const d = Math.hypot(u.x - keeper.x, u.y - keeper.y);
        if (d < bestD) { best = u; bestD = d; }
      }
      if (best) {
        keeper.target = best.id;
        keeper.wait = NOTICE_S;
        say('어이! 말 도둑이다! 거기 서!');
      }
    }

    keeper.moving = false;
    const target = keeper.target && users.get(keeper.target);
    if (target) {
      if (keeper.wait > 0) {
        keeper.wait -= dt;
        keeper.dir = target.x < keeper.x ? 'left' : 'right';
      } else {
        keeper.moving = true;
        stepTo(target.x, target.y, CHASE_SPEED, dt);
        if (Math.hypot(target.x - keeper.x, target.y - keeper.y) <= CATCH_PX) {
          stalls[target.mount] = null;
          setMount(target, null, 'caught');
          keeper.target = null;
          say('잡았다! 말은 돌려받는다!');
        }
      }
    } else if (keeper.x !== POST.x || keeper.y !== POST.y) {
      keeper.moving = true;
      if (stepTo(POST.x, POST.y, RETURN_SPEED, dt)) {
        keeper.x = POST.x;
        keeper.y = POST.y;
        keeper.dir = POST.dir;
        keeper.moving = false;
      }
    }

    // 바뀐 것이 있을 때만, 0.2초 간격으로 경마장을 보는 사람에게 보낸다
    if (clock - sentAt < SEND_MS - 1) return;
    const s = keeperState();
    const key = `${s.x},${s.y},${s.dir},${s.moving}`;
    if (key !== sent) {
      sent = key;
      sentAt = clock;
      sendMap('racetrack', Object.assign({ t: 'keeper' }, s));
    }
  }

  function keeperState() {
    return {
      x: Math.round(keeper.x * 10) / 10,
      y: Math.round(keeper.y * 10) / 10,
      dir: keeper.dir,
      moving: keeper.moving ? 1 : 0
    };
  }

  // 접속 직후(welcome)와 경마장에 들어올 때(sync) 보낸다. stalls 는 칸마다 말이 있는지.
  function snapshot() {
    return { stalls: stalls.map(id => id === null), keeper: keeperState() };
  }

  return { steal, giveBack, leave, tick, busy, snapshot };
}

module.exports = { createStable, STALL_X };
