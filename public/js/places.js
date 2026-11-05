// 객장 밖 장소들: 빨간 복도 사거리와 경마장. 둘 다 위에서 내려다본 시점이다.
// 장소 하나는 { paint, walk, blocks, exits } 로 이루어지고 scene.js 가 객장과 같은 방식으로 다룬다.
//   walk   발 위치가 이 사각형들 중 하나 안에 있어야 서 있을 수 있다
//   blocks 발 주변이 겹치면 막힌다(바리케이드 등)
//   exits  발이 들어서면 to 장소의 spawn 위치로 옮겨 간다
// 글씨(안내판)는 config.js 의 labels 로 DOM 에 띄운다.
(function () {
  const { rng, makeCanvas, rect, disc, PAL } = PX.pixel;
  const W = PX.config.width;
  const H = PX.config.height;

  const COL = {
    grass: '#6aa84f', grassDark: '#4f8a3a', grassLight: '#86c25e',
    stripe1: '#e8792b', stripe2: '#f4f1e6', cone: '#f08a2b',
    wall: '#9a8f80', wallLine: '#7f7567', pillar: '#6f665a', banner: '#a8322e', bannerHi: '#d8b048',
    tile1: '#e9e5da', tile2: '#dcd6c8', grout: '#c8c0ae',
    rail: '#f4f1e6', railShade: '#bdb7a8',
    dirt: '#b0814f', dirtDark: '#9a6d40', dirtLight: '#c4955f',
    infield: '#74b35a', infieldStripe: '#6aa84f',
    tote: '#14171c', toteFrame: '#3a3f48'
  };

  function grass(g, r, x0, y0, w, h, base) {
    rect(g, x0, y0, w, h, base || COL.grass);
    for (let i = 0; i < w * h / 40; i++) {
      const x = x0 + Math.floor(r() * w);
      const y = y0 + Math.floor(r() * h);
      rect(g, x, y, 2, 1, r() < 0.5 ? COL.grassDark : COL.grassLight);
    }
  }




  // 주황·흰 줄무늬 가로대. vertical 이면 세로로 세운다.
  function barrier(g, x, y, len, vertical) {
    const w = vertical ? 6 : len;
    const h = vertical ? len : 6;
    rect(g, x - 1, y - 1, w + 2, h + 2, PAL.outline);
    for (let i = 0; i < len; i++) {
      const c = Math.floor(i / 5) % 2 ? COL.stripe2 : COL.stripe1;
      if (vertical) rect(g, x, y + i, w, 1, c);
      else rect(g, x + i, y, 1, h, c);
    }
  }

  function cone(g, x, y) {
    rect(g, x - 4, y - 1, 9, 2, PAL.outline);
    rect(g, x - 2, y - 8, 5, 7, PAL.outline);
    rect(g, x - 1, y - 7, 3, 6, COL.cone);
    rect(g, x - 1, y - 4, 3, 1, COL.stripe2);
    rect(g, x - 3, y - 1, 7, 1, COL.cone);
  }

  // ---------- 사거리 ----------

  // 객장 가운데 빨간 복도가 이어지는 실내 복도 사거리.
  // 세로 복도는 위로 객장, 아래로 경마장. 가로 복도 양쪽은 공사 중.
  // 카펫 폭·위치는 객장 카펫(x 148~172)과 맞춰 이어져 보이게 한다.
  const HALL_X = 132, HALL_W = 56;   // 세로 복도(바닥)
  const HALL_Y = 62, HALL_H = 56;    // 가로 복도(바닥)
  const CARPET = { x: 148, w: 24, y: 78, h: 24 };

  // 복도 밖은 객장과 같은 판자벽. 위에서 본 벽이라 복도 쪽 가장자리에 걸레받이와 그림자를 둔다.
  function hallWall(g, r, x, y, w, h) {
    rect(g, x, y, w, h, PAL.wall);
    for (let px = x; px < x + w; px += 8) {
      rect(g, px, y, 1, h, PAL.plank);
      for (let k = 0; k < h / 16; k++) rect(g, px + 2 + Math.floor(r() * 5), y + Math.floor(r() * h), 1, 2 + Math.floor(r() * 3), PAL.grain);
    }
  }

  function carpetRun(g, x, y, w, h, vertical) {
    rect(g, x, y, w, h, PAL.carpetEdge);
    if (vertical) {
      rect(g, x + 2, y, w - 4, h, PAL.carpet);
      for (let py = y + 4; py < y + h; py += 8) rect(g, x + w / 2 - 1, py, 2, 2, PAL.carpetDot);
    } else {
      rect(g, x, y + 2, w, h - 4, PAL.carpet);
      for (let px = x + 4; px < x + w; px += 8) rect(g, px, y + h / 2 - 1, 2, 2, PAL.carpetDot);
    }
  }

  function plant(g, x, y) {
    rect(g, x - 5, y - 1, 12, 2, 'rgba(0,0,0,0.18)');
    rect(g, x - 5, y - 9, 10, 8, PAL.pot);
    rect(g, x - 6, y - 10, 12, 2, PAL.potRim);
    disc(g, x, y - 15, 5, PAL.leaf2, PAL.leaf1);
    rect(g, x - 2, y - 18, 2, 2, PAL.leaf3);
  }

  function paintCrossroad() {
    const { c, g } = makeCanvas(W, H);
    const r = rng(11);

    // 바닥: 객장과 같은 대리석 타일
    for (let y = 0, row = 0; y < H; y += 10, row++) {
      for (let x = 0, col = 0; x < W; x += 16, col++) {
        rect(g, x, y, 16, 10, (row + col) % 2 ? PAL.tile2 : PAL.tile1);
        rect(g, x, y, 16, 1, PAL.grout);
        rect(g, x, y, 1, 10, PAL.grout);
        for (let k = 0; k < 3; k++) rect(g, x + 2 + Math.floor(r() * 12), y + 2 + Math.floor(r() * 7), 1, 1, PAL.speck);
      }
    }

    // 네 귀퉁이는 벽
    const quads = [
      [0, 0, HALL_X, HALL_Y], [HALL_X + HALL_W, 0, W - HALL_X - HALL_W, HALL_Y],
      [0, HALL_Y + HALL_H, HALL_X, H - HALL_Y - HALL_H], [HALL_X + HALL_W, HALL_Y + HALL_H, W - HALL_X - HALL_W, H - HALL_Y - HALL_H]
    ];
    for (const [x, y, w, h] of quads) {
      hallWall(g, r, x, y, w, h);
      // 복도 쪽 테두리: 걸레받이 + 바닥 그림자
      const right = x === 0, below = y === 0;
      rect(g, right ? x + w - 3 : x, y, 3, h, PAL.baseboard);
      rect(g, x, below ? y + h - 3 : y, w, 3, PAL.baseboard);
      rect(g, right ? x + w : x - 1, y, 1, h, PAL.outline);
      rect(g, x, below ? y + h : y - 1, w, 1, PAL.outline);
      rect(g, right ? x + w + 1 : x - 3, y, 2, h, PAL.floorShade);
      rect(g, x, below ? y + h + 1 : y - 3, w, 2, PAL.floorShade);
    }

    // 빨간 복도: 세로가 위아래로 끝까지, 가로는 공사 구간 앞까지
    carpetRun(g, 0, CARPET.y, W, CARPET.h, false);
    carpetRun(g, CARPET.x, 0, CARPET.w, H, true);
    // 만나는 곳은 테두리 없이 한 장으로
    rect(g, CARPET.x, CARPET.y, CARPET.w, CARPET.h, PAL.carpetEdge);
    rect(g, CARPET.x + 2, CARPET.y + 2, CARPET.w - 4, CARPET.h - 4, PAL.carpet);
    disc(g, CARPET.x + CARPET.w / 2, CARPET.y + CARPET.h / 2, 5, PAL.signEdge, PAL.carpetEdge);

    // 왼쪽·오른쪽 복도는 공사 중
    for (const bx of [22, W - 30]) {
      barrier(g, bx, HALL_Y + 2, HALL_H - 4, true);
      barrier(g, bx + 8 * (bx < W / 2 ? -1 : 1), HALL_Y + 2, HALL_H - 4, true);
      cone(g, bx + 3 + 12 * (bx < W / 2 ? 1 : -1), HALL_Y + 10);
      cone(g, bx + 3 + 12 * (bx < W / 2 ? 1 : -1), HALL_Y + HALL_H - 2);
    }

    // 복도 모서리 화분
    for (const [x, y] of [[HALL_X + 8, HALL_Y - 2], [HALL_X + HALL_W - 8, HALL_Y - 2], [HALL_X + 8, H - 2], [HALL_X + HALL_W - 8, H - 2]]) plant(g, x, y);
    return c;
  }

  const crossroad = {
    paint: paintCrossroad,
    walk: [
      { x: 0, y: HALL_Y + 18, w: W - 1, h: HALL_H - 20 },
      { x: HALL_X + 8, y: 0, w: HALL_W - 16, h: H - 1 }
    ],
    blocks: [
      { x: 0, y: HALL_Y, w: 34, h: HALL_H },
      { x: W - 34, y: HALL_Y, w: 34, h: HALL_H },
      // 위쪽 화분 두 개
      { x: HALL_X + 2, y: HALL_Y - 10, w: 12, h: 10 },
      { x: HALL_X + HALL_W - 14, y: HALL_Y - 10, w: 12, h: 10 },
      // 아래쪽 화분 두 개
      { x: HALL_X + 2, y: H - 10, w: 12, h: 10 },
      { x: HALL_X + HALL_W - 14, y: H - 10, w: 12, h: 10 }
    ],
    exits: [
      { x: HALL_X, y: 0, w: HALL_W, h: 2, to: 'exchange', spawn: { x: 160, y: 168, dir: 'up' } },
      { x: HALL_X, y: H - 3, w: HALL_W, h: 3, to: 'racetrack', spawn: { x: 160, y: 38, dir: 'down' } }
    ]
  };

  // ---------- 경마장 ----------

  // 위쪽 출입문으로 들어와 관람 광장에 선다. 난간 너머는 타원 주로(走路).
  const GATE_X = 146, GATE_W = 28;
  const WALL_H = 18;
  const RAIL_Y = 60;
  const TRACK = { cx: 160, cy: 122, rx: 150, ry: 54, irx: 116, iry: 24 };
  const FINISH_X = 208;

  // ---------- 말 ----------

  // 말 n 번(0부터)의 주로. 1번이 가장 안쪽.
  const LANES = 5;
  // 주로 폭을 끝까지 써서 줄 간격을 최대한 벌린다(위쪽 직선에서 약 6px)
  function lane(n) {
    const k = n / (LANES - 1);
    const T = TRACK;
    return { rx: T.irx + 5 + (T.rx - T.irx - 10) * k, ry: T.iry + 3 + (T.ry - T.iry - 5) * k };
  }

  // 타원을 각도로 나누면 직선 쪽은 빠르고 곡선 쪽은 느려 보이므로, 가운데 줄의 길이로 고르게 나눈다.
  // 출발·결승선에서 시작해 시계 반대 방향(위쪽 직선을 왼쪽으로)으로 돈다.
  const PATH = (function () {
    const mid = lane((LANES - 1) / 2);
    const t0 = -Math.acos((FINISH_X - TRACK.cx) / mid.rx);
    const N = 720;
    const th = [t0], len = [0];
    for (let i = 1; i <= N; i++) {
      const a = t0 - 2 * Math.PI * i / N, b = th[i - 1];
      th.push(a);
      len.push(len[i - 1] + Math.hypot(mid.rx * (Math.cos(a) - Math.cos(b)), mid.ry * (Math.sin(a) - Math.sin(b))));
    }
    return { th, len, total: len[N] };
  })();

  // 바퀴 수(0.0~5.x) → 각도
  function angleAt(laps) {
    const f = laps - Math.floor(laps);
    const want = f * PATH.total;
    let lo = 0, hi = PATH.len.length - 1;
    while (hi - lo > 1) {
      const m = (lo + hi) >> 1;
      if (PATH.len[m] <= want) lo = m; else hi = m;
    }
    const k = (want - PATH.len[lo]) / (PATH.len[hi] - PATH.len[lo] || 1);
    return PATH.th[lo] + (PATH.th[hi] - PATH.th[lo]) * k;
  }

  // 옆에서 본 말과 기수. (x, y) 는 발 가운데, frame 0/1 은 달리는 동작.
  function drawHorse(g, x, y, coat, silk, left, frame) {
    const s = left ? -1 : 1;
    const R = (px, py, w, h, c) => rect(g, s > 0 ? x + px : x - px - w + 1, y + py, w, h, c);
    R(-7, -1, 14, 2, 'rgba(0,0,0,0.2)');
    // 다리: 펴고(0) 모으고(1)
    const legs = frame ? [[-4, 0], [-2, 0], [2, 0], [4, 0]] : [[-6, 1], [-3, 0], [3, 0], [6, 1]];
    for (const [lx, d] of legs) { R(lx, -4 + d, 1, 4 - d, PAL.outline); }
    // 몸통·목·머리·꼬리(외곽선 먼저)
    const body = [[-5, -8, 10, 4], [4, -11, 3, 4], [6, -12, 4, 3]];
    for (const [px, py, w, h] of body) R(px - 1, py - 1, w + 2, h + 2, PAL.outline);
    for (const [px, py, w, h] of body) R(px, py, w, h, coat);
    R(9, -11, 1, 1, PAL.outline);
    R(-8, -8 + frame, 3, 2, PAL.outline);
    // 안장 천·기수
    R(-2, -8, 5, 2, silk);
    R(-2, -13, 1, 1, PAL.outline);
    R(-1, -14, 4, 4, PAL.outline);
    R(0, -13, 2, 3, silk);
    R(0, -15, 3, 2, PAL.outline);
    R(1, -15, 2, 1, silk === '#2a2a30' ? '#5a5a66' : silk);
  }

  // 장면이 매 프레임 부른다. 사람과 함께 깊이 순으로 그려지도록 목록에 넣는다.
  function decorate(list, g, t) {
    const race = PX.race;
    const pos = race && race.positions();
    if (!pos) return;
    if (race.waiting) {
      // 아래쪽 직선 가운데에 번호 순서대로 나란히, 출발 방향(오른쪽)을 보고 선다
      const L = lane((LANES - 1) / 2);
      const y = Math.round(TRACK.cy + L.ry);
      pos.forEach((v, n) => {
        const x = 112 + n * 24;
        list.push({ key: y, draw: () => drawHorse(g, x, y, race.coats[n], race.silks[n], false, 0) });
      });
      return;
    }
    pos.forEach((laps, n) => {
      const a = angleAt(laps);
      const L = lane(n);
      const x = Math.round(TRACK.cx + L.rx * Math.cos(a));
      const y = Math.round(TRACK.cy + L.ry * Math.sin(a));
      // 각도가 줄어드는 방향으로 돈다: 위쪽(sin<0)에서는 왼쪽, 아래쪽에서는 오른쪽으로 달린다
      const left = Math.sin(a) < 0;
      const running = laps > 0 && laps < race.lapsStop(n);
      const frame = running ? Math.floor(t * 9 + n * 0.7) % 2 : 0;
      list.push({ key: y, draw: () => drawHorse(g, x, y, race.coats[n], race.silks[n], left, frame) });
    });
  }

  function paintRacetrack() {
    const { c, g } = makeCanvas(W, H);
    const r = rng(23);

    grass(g, r, 0, RAIL_Y, W, H - RAIL_Y);

    // 타원 주로: 바깥 타원 안쪽·안쪽 타원 바깥쪽이 흙길
    const T = TRACK;
    for (let y = RAIL_Y + 2; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const dx = x + 0.5 - T.cx, dy = y + 0.5 - T.cy;
        const outer = (dx / T.rx) ** 2 + (dy / T.ry) ** 2;
        const inner = (dx / T.irx) ** 2 + (dy / T.iry) ** 2;
        if (outer > 1.03) continue;
        if (outer > 1) { rect(g, x, y, 1, 1, COL.rail); continue; }
        if (inner < 0.94) {
          rect(g, x, y, 1, 1, Math.floor(x / 12) % 2 ? COL.infield : COL.infieldStripe);
          continue;
        }
        if (inner < 1) { rect(g, x, y, 1, 1, COL.rail); continue; }
        const k = r();
        rect(g, x, y, 1, 1, k < 0.08 ? COL.dirtDark : k < 0.14 ? COL.dirtLight : COL.dirt);
      }
    }

    // 출발·결승선(위쪽 직선, 체크무늬)
    const fx = FINISH_X - 2;
    for (let y = T.cy - T.ry + 2; y < T.cy - T.iry - 1; y += 2) {
      rect(g, fx, y, 2, 2, (y >> 1) % 2 ? '#ffffff' : PAL.outline);
      rect(g, fx + 2, y, 2, 2, (y >> 1) % 2 ? PAL.outline : '#ffffff');
    }

    // 안쪽 전광판 틀(내용은 race.js 의 DOM)
    const P = PX.config.racePanel;
    rect(g, P.x - 3, P.y - 3, P.w + 6, P.h + 6, PAL.outline);
    rect(g, P.x - 2, P.y - 2, P.w + 4, P.h + 4, COL.toteFrame);
    rect(g, P.x, P.y, P.w, P.h, COL.tote);

    // 관람 광장: 객장과 같은 바둑판 타일
    for (let y = WALL_H, row = 0; y < RAIL_Y; y += 10, row++) {
      for (let x = 0, col = 0; x < W; x += 16, col++) {
        rect(g, x, y, 16, 10, (row + col) % 2 ? COL.tile2 : COL.tile1);
        rect(g, x, y, 16, 1, COL.grout);
        rect(g, x, y, 1, 10, COL.grout);
      }
    }

    // 난간
    rect(g, 0, RAIL_Y - 1, W, 4, PAL.outline);
    rect(g, 0, RAIL_Y, W, 2, COL.rail);
    rect(g, 0, RAIL_Y + 2, W, 1, COL.railShade);
    for (let x = 4; x < W; x += 10) {
      rect(g, x - 1, RAIL_Y - 4, 4, 9, PAL.outline);
      rect(g, x, RAIL_Y - 3, 2, 7, COL.rail);
    }

    // 위쪽 담장과 출입문
    rect(g, 0, 0, W, WALL_H, COL.wall);
    for (let y = 0; y < WALL_H; y += 5) {
      rect(g, 0, y, W, 1, COL.wallLine);
      for (let x = (y / 5) % 2 ? 0 : 8; x < W; x += 16) rect(g, x, y, 1, 5, COL.wallLine);
    }
    rect(g, 0, WALL_H, W, 1, PAL.outline);
    rect(g, GATE_X, 0, GATE_W, WALL_H + 1, COL.tile1);
    for (let y = 2; y < WALL_H; y += 4) rect(g, GATE_X, y, GATE_W, 1, COL.grout);
    for (const px of [GATE_X - 8, GATE_X + GATE_W]) {
      rect(g, px - 1, 0, 10, WALL_H + 3, PAL.outline);
      rect(g, px, 0, 8, WALL_H + 2, COL.pillar);
      rect(g, px + 1, 0, 1, WALL_H + 2, COL.wall);
    }
    // 문 위 현판(글씨는 DOM)
    rect(g, 119, 1, 82, 11, PAL.outline);
    rect(g, 120, 2, 80, 9, COL.banner);
    rect(g, 120, 2, 80, 1, COL.bannerHi);

    // 광장 양 끝 화분
    for (const x of [6, W - 20]) {
      rect(g, x + 1, 44, 12, 10, PAL.pot);
      rect(g, x, 42, 14, 3, PAL.potRim);
      disc(g, x + 7, 36, 6, PAL.leaf2, PAL.leaf1);
      rect(g, x + 5, 33, 2, 2, PAL.leaf3);
    }
    return c;
  }

  const racetrack = {
    paint: paintRacetrack,
    walk: [
      { x: 22, y: WALL_H + 10, w: W - 44, h: RAIL_Y - WALL_H - 14 },
      { x: GATE_X + 4, y: 0, w: GATE_W - 8, h: WALL_H + 12 }
    ],
    blocks: [],
    exits: [
      { x: GATE_X, y: 0, w: GATE_W, h: WALL_H - 4, to: 'crossroad', spawn: { x: 160, y: H - 12, dir: 'up' } }
    ],
    decorate
  };

  PX.places = { crossroad, racetrack };
})();
