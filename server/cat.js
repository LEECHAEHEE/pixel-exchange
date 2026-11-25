// 고양이. 모든 접속자에게 같은 고양이가 보이도록 서버가 움직임과 쉬는 자세를 정한다.
// 누구도 따라가지 않고 객장 통로를 혼자 오가다가, 멈추면 앉기·식빵·자기 중 하나로 한동안 쉰다.
'use strict';

const MAP = 'exchange';
const WALK_SPEED = 18;
// 상태는 0.2초에 한 번까지만 보낸다. 화면이 받은 위치를 향해 걷는 속도로 따라가므로 그 사이는 보이지 않는다.
const SEND_MS = 200;
// 쉬는 자세와 쉬는 시간(초). 잘 때가 가장 길다.
const REST = { sit: [3, 7], loaf: [5, 10], sleep: [8, 16] };
const REST_POSES = Object.keys(REST);

// 객장 맨 앞 통로와 가운데 카펫 통로. public/js/scene.js 의 의자 배치와 맞춰야 한다.
// 서로 다른 통로로 갈 때는 junction 을 거쳐 간다.
const ZONES = [
  { x0: 20, x1: 300, y0: 121, y1: 128 },
  { x0: 152, x1: 168, y0: 121, y1: 178 }
];
const JUNCTION = { x: 160, y: 124 };

function rand(a, b) {
  return a + Math.random() * (b - a);
}

function inRect(r, x, y) {
  return x >= r.x0 && x <= r.x1 && y >= r.y0 && y <= r.y1;
}

function createCat({ broadcast }) {
  const cat = { map: MAP, x: 120, y: 125, dir: 'left', pose: 'sit' };
  let path = [];
  let wait = rand(2, 5);
  let sent = '';
  let clock = 0;
  let sentAt = -SEND_MS;

  function planWalk() {
    const z = Math.random() >= 0.65 ? ZONES[1] : ZONES[0];
    const t = { x: rand(z.x0, z.x1), y: rand(z.y0, z.y1) };
    const direct = ZONES.some(r => inRect(r, cat.x, cat.y) && inRect(r, t.x, t.y));
    path = direct ? [t] : [JUNCTION, t];
  }

  // 한 걸음 이동. 도착하면 true.
  function stepTo(tx, ty, dt) {
    const dx = tx - cat.x, dy = ty - cat.y;
    const dist = Math.hypot(dx, dy);
    const step = WALK_SPEED * dt;
    if (Math.abs(dx) > 0.3) cat.dir = dx < 0 ? 'left' : 'right';
    if (dist <= step) {
      cat.x = tx;
      cat.y = ty;
      return true;
    }
    cat.x += dx / dist * step;
    cat.y += dy / dist * step;
    return false;
  }

  function tick(dt) {
    clock += dt * 1000;
    if (wait > 0) {
      wait -= dt;
    } else {
      if (!path.length) planWalk();
      cat.pose = 'walk';
      if (stepTo(path[0].x, path[0].y, dt)) {
        path.shift();
        if (!path.length) {
          cat.pose = REST_POSES[Math.floor(Math.random() * REST_POSES.length)];
          wait = rand(...REST[cat.pose]);
        }
      }
    }

    if (clock - sentAt < SEND_MS - 1) return;
    const msg = snapshot();
    const key = `${msg.x},${msg.y},${msg.dir},${msg.pose}`;
    if (key !== sent) {
      sent = key;
      sentAt = clock;
      broadcast(Object.assign({ t: 'cat' }, msg));
    }
  }

  function snapshot() {
    return {
      map: cat.map,
      x: Math.round(cat.x * 10) / 10,
      y: Math.round(cat.y * 10) / 10,
      dir: cat.dir,
      pose: cat.pose
    };
  }

  return { tick, snapshot };
}

module.exports = { createCat };
