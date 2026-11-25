// 삼색 고양이 그림(옆모습, 오른쪽을 보는 그림). 몸·머리·꼬리를 타원·삼각형·곡선으로 정해 두고
// 작은 격자에 찍은 뒤 바깥 테두리를 둘러 둥근 픽셀 그림을 만든다. 자세·프레임마다 처음 쓸 때 한 번만 만든다.
//
//   PX.cat.draw(g, x, y, dir, pose, nowMs)
//     (x, y) 발끝 가운데, dir 'left' | 'right', pose 'walk' | 'sit' | 'loaf' | 'sleep'
window.PX = window.PX || {};

(function () {
  // 모양은 26 x 18 칸 기준 좌표로 적고, K 배로 줄인 격자에 찍는다(사람 키에 맞춘 크기)
  const K = 0.68;
  const W = 18, H = 13;
  // 격자에서 발끝 가운데 칸
  const FOOT_X = 9;

  const COL = {
    white: '#f5efe4', orange: '#e48a3a', black: '#3a3430',
    eye: '#2a1a10', lid: '#6a5a50', nose: '#e4848c', edge: '#1d140f'
  };

  const h2 = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
  const mix = (a, b, t) => {
    const A = h2(a), B = h2(b);
    return '#' + A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, '0')).join('');
  };

  // 격자 칸 가운데를 원래 좌표로 바꿔 모양 안에 드는지 본다. 나중에 칠한 것이 앞에 온다.
  function paint(g, test, part) {
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = test((x + 0.5) / K, (y + 0.5) / K);
        if (i !== false && i !== -1) g[y][x] = { part, i: i === true ? 0 : i };
      }
    }
  }
  const ell = (cx, cy, rx, ry) => (x, y) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1;
  function tri(a, b, c) {
    const s = (p, q, r) => (p[0] - r[0]) * (q[1] - r[1]) - (q[0] - r[0]) * (p[1] - r[1]);
    return (x, y) => {
      const p = [x, y], d1 = s(p, a, b), d2 = s(p, b, c), d3 = s(p, c, a);
      return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0));
    };
  }
  // 굵기가 끝으로 갈수록 가늘어지는 곡선(꼬리). 무늬를 위해 몇 번째 마디인지 돌려준다.
  function tube(p, r0) {
    const pts = [];
    for (let i = 0; i <= 48; i++) {
      const t = i / 48, u = 1 - t;
      const at = k => u * u * u * p[0][k] + 3 * u * u * t * p[1][k] + 3 * u * t * t * p[2][k] + t * t * t * p[3][k];
      pts.push([at(0), at(1), r0 * (1 - 0.3 * t)]);
    }
    return (x, y) => {
      for (let i = pts.length - 1; i >= 0; i--) {
        const [cx, cy, r] = pts[i];
        if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) return i;
      }
      return -1;
    };
  }
  // 다리: 위 y0 에서 발끝 y1 까지 너비 2 막대. dx 만큼 발끝이 앞뒤로 기운다.
  const leg = (x0, dx, y0, y1) => (x, y) => {
    if (y < y0 || y > y1) return false;
    const l = x0 + dx * (y - y0) / (y1 - y0);
    return x >= l && x <= l + 2;
  };
  function head(g, hx, hy) {
    paint(g, tri([hx - 3.7, hy - 0.8], [hx - 2.9, hy - 5.0], [hx - 0.4, hy - 2.8]), 'earL');
    paint(g, tri([hx + 0.9, hy - 2.8], [hx + 3.0, hy - 5.0], [hx + 3.9, hy - 0.6]), 'earR');
    paint(g, ell(hx, hy, 3.8, 3.3), 'head');
    paint(g, ell(hx, hy + 1, 4.2, 2.3), 'head');
  }

  const POSE = {
    walk(f, g) {
      const bob = [0, 0.35, 0, 0.35][f], sway = [0, 1, 0, -1][f];
      const L = [[-1, 1, 1, -1], [0, 0, 0, 0], [1, -1, -1, 1], [0, 0, 0, 0]][f];
      paint(g, leg(8, L[0], 12, 17), 'legF');
      paint(g, leg(17, L[2], 12, 17), 'legF');
      paint(g, tube([[6, 9.5 + bob], [2, 9.5], [1.5, 4], [3.5 + sway * 0.8, 1.8]], 1.3), 'tail');
      paint(g, ell(12.5, 10.4 + bob, 7.6, 3.6), 'body');
      paint(g, ell(17.5, 10 + bob, 3.2, 3.4), 'body');
      paint(g, leg(5.5, L[1], 12, 17), 'legN');
      paint(g, leg(14.5, L[3], 12, 17), 'legN');
      head(g, 20.6, 6.4 + bob);
      return { hx: 20.6, hy: 6.4 + bob, bellyY: 12 };
    },
    sit(f, g) {
      const fl = f === 1 ? 1 : f === 2 ? -0.7 : 0;
      paint(g, leg(13.5, 0, 10, 17), 'legF');
      paint(g, ell(9.5, 12.8, 5.6, 4.4), 'body');
      paint(g, ell(14, 10.5, 3.6, 5.4), 'body');
      paint(g, leg(16, 0, 10, 17), 'legN');
      paint(g, tube([[6, 15], [3, 17], [12, 17], [19 + fl, 15.2 - Math.abs(fl)]], 1.2), 'tail');
      head(g, 15.6, 6.1);
      return { hx: 15.6, hy: 6.1, closed: f === 3, bellyY: 11 };
    },
    loaf(f, g) {
      paint(g, ell(11, 12.6, 8.2, 4.6), 'body');
      paint(g, ell(20, 16.2, 1.9, 1.1), 'paw');
      paint(g, tube([[4, 14.5], [2, 17.4], [9, 17.4], [15.5, 16.4]], 1.1), 'tail');
      head(g, 18, 9.4);
      return { hx: 18, hy: 9.4, closed: f === 1, bellyY: 99 };
    },
    sleep(f, g) {
      const b = f ? 0.35 : 0;
      paint(g, ell(12, 12.6 - b / 2, 8, 4.5 + b), 'body');
      head(g, 18.3, 12.4);
      paint(g, tube([[5, 14.8], [4, 17.4], [14, 17.4], [21.5, 15.5]], 1.1), 'tail');
      return { hx: 18.3, hy: 12.4, closed: true, bellyY: 99 };
    }
  };

  // 삼색 무늬: 흰 바탕에 왼쪽 귀·이마는 검정, 오른쪽 귀는 주황, 등에 주황·검정 얼룩, 꼬리는 줄무늬
  function furColor(c, x, y, m) {
    const ox = (x + 0.5) / K, oy = (y + 0.5) / K;
    const p = c.part;
    let col = COL.white;
    if (p === 'tail') col = c.i % 12 < 4 ? COL.black : COL.orange;
    else if (p === 'earL') col = COL.black;
    else if (p === 'earR') col = COL.orange;
    else if (p === 'head') {
      if (ox < m.hx - 0.5 && oy < m.hy + 0.5) col = COL.black;
      else if (ox > m.hx + 1 && oy < m.hy - 1) col = COL.orange;
    } else if (p === 'body' && oy < m.bellyY) {
      const v = Math.sin(ox * 0.7 + 1.1) + Math.cos(oy * 0.9 + ox * 0.25 - 0.5);
      if (v > 0.9) col = COL.orange;
      else if (v < -1.05) col = COL.black;
    }
    // 안쪽 다리는 그늘지게
    if (p === 'legF') col = mix(col, '#000000', 0.2);
    return col;
  }

  const cache = new Map();
  function sprite(pose, f) {
    const key = pose + f;
    if (cache.has(key)) return cache.get(key);
    const g = Array.from({ length: H }, () => Array(W).fill(null));
    const m = POSE[pose](f, g);
    const px = g.map((row, y) => row.map((c, x) => {
      if (!c) return null;
      const col = furColor(c, x, y, m);
      // 위가 빈 칸은 살짝 밝게(둥근 등 느낌)
      return (y === 0 || !g[y - 1][x]) && c.part !== 'tail' ? mix(col, '#ffffff', 0.15) : col;
    }));
    const ey = Math.floor(m.hy * K), lx = Math.floor((m.hx - 1.4) * K), rx = Math.floor((m.hx + 1.8) * K);
    const dot = (x, y, v) => { if (px[y] && px[y][x]) px[y][x] = v; };
    if (m.closed) { dot(lx, ey, COL.lid); dot(rx, ey, COL.lid); }
    else { dot(lx, ey, COL.eye); dot(rx, ey, COL.eye); }
    dot(Math.floor((m.hx + 0.2) * K), ey + 1, COL.nose);
    // 바깥 테두리: 옆 칸 털색을 어둡게 해서 두른다
    const out = px.map(r => r.slice());
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        if (px[y][x]) continue;
        for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
          const n = px[y + dy] && px[y + dy][x + dx];
          if (n) { out[y][x] = mix(n, COL.edge, 0.62); break; }
        }
      }
    }
    cache.set(key, out);
    return out;
  }

  // 자세별 프레임. 앉아 있을 때는 가끔 꼬리 끝을 까딱이고 눈을 깜빡이며, 잘 때는 숨 쉬듯 몸이 부푼다.
  function frameOf(pose, nowMs) {
    if (pose === 'walk') return Math.floor(nowMs / 150) % 4;
    const t = Math.floor(nowMs / 170);
    if (pose === 'sit') return [0, 0, 0, 1, 0, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 3][t % 18];
    if (pose === 'loaf') return t % 20 === 19 ? 1 : 0;
    return Math.floor(nowMs / 900) % 2;
  }

  function draw(g, x, y, dir, pose, nowMs) {
    const rect = PX.pixel.rect;
    const p = POSE[pose] ? pose : 'sit';
    const px = sprite(p, frameOf(p, nowMs));
    const flip = dir === 'left';
    const top = y - H;
    rect(g, x - 7, y, 14, 1, 'rgba(0,0,0,0.18)');
    for (let r = 0; r < H; r++) {
      for (let c = 0; c < W; c++) {
        const col = px[r][c];
        if (col) rect(g, flip ? x + (FOOT_X - 1 - c) : x - FOOT_X + c, top + r, 1, 1, col);
      }
    }
  }

  PX.cat = { draw, W, H };
})();
