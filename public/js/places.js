// 객장 밖 장소들: 빨간 복도 사거리, 경마장, 마피아존, 풋살장. 모두 위에서 내려다본 시점이다.
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
    wall: '#9a8f80', wallLine: '#7f7567', pillar: '#6f665a', banner: '#a8322e', bannerHi: '#d8b048',
    tile1: '#e9e5da', tile2: '#dcd6c8', grout: '#c8c0ae',
    rail: '#f4f1e6', railShade: '#bdb7a8',
    dirt: '#b0814f', dirtDark: '#9a6d40', dirtLight: '#c4955f',
    infield: '#74b35a', infieldStripe: '#6aa84f',
    tote: '#14171c', toteFrame: '#3a3f48',
    roof: '#8e3b2c', roofDark: '#6c2a1f', barn: '#b5763f', barnDark: '#8d5a2e', stallIn: '#3a2a1e', hay: '#d8b85a',
    horse: '#8a5530', horseDark: '#5e3820', mane: '#2e1d14'
  };

  function grass(g, r, x0, y0, w, h, base) {
    rect(g, x0, y0, w, h, base || COL.grass);
    for (let i = 0; i < w * h / 40; i++) {
      const x = x0 + Math.floor(r() * w);
      const y = y0 + Math.floor(r() * h);
      rect(g, x, y, 2, 1, r() < 0.5 ? COL.grassDark : COL.grassLight);
    }
  }


  // ---------- 사거리 ----------

  // 객장 가운데 빨간 복도가 이어지는 실내 복도 사거리.
  // 세로 복도는 위로 객장, 아래로 경마장. 가로 복도 왼쪽은 풋살장, 오른쪽은 마피아존.
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

    // 빨간 복도: 세로·가로 모두 끝까지
    carpetRun(g, 0, CARPET.y, W, CARPET.h, false);
    carpetRun(g, CARPET.x, 0, CARPET.w, H, true);
    // 만나는 곳은 테두리 없이 한 장으로
    rect(g, CARPET.x, CARPET.y, CARPET.w, CARPET.h, PAL.carpetEdge);
    rect(g, CARPET.x + 2, CARPET.y + 2, CARPET.w - 4, CARPET.h - 4, PAL.carpet);
    disc(g, CARPET.x + CARPET.w / 2, CARPET.y + CARPET.h / 2, 5, PAL.signEdge, PAL.carpetEdge);

    // 왼쪽: 풋살장 입구. 초록 문틀(경기장 잔디 색)과 문 앞 고무 매트.
    rect(g, 0, HALL_Y, 7, HALL_H, '#2f8a45');
    rect(g, 7, HALL_Y, 2, HALL_H, PAL.outline);
    rect(g, 0, HALL_Y, 7, 3, '#226a34');
    rect(g, 0, HALL_Y + HALL_H - 3, 7, 3, '#226a34');
    rect(g, 9, HALL_Y + 22, 14, HALL_H - 44, '#3b4a3e');
    for (let y = HALL_Y + 24; y < HALL_Y + HALL_H - 22; y += 3) rect(g, 10, y, 12, 1, '#55675a');
    // 오른쪽: 마피아존 입구(붉은 카펫이 이어지는 통로). 핑크 문틀.
    carpetRun(g, W - 30, HALL_Y + 20, 30, HALL_H - 40, false);
    rect(g, W - 7, HALL_Y, 7, HALL_H, '#c21e63');
    rect(g, W - 9, HALL_Y, 2, HALL_H, PAL.outline);
    rect(g, W - 7, HALL_Y, 7, 3, '#a3134f');
    rect(g, W - 7, HALL_Y + HALL_H - 3, 7, 3, '#a3134f');

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
      // 위쪽 화분 두 개
      { x: HALL_X + 2, y: HALL_Y - 10, w: 12, h: 10 },
      { x: HALL_X + HALL_W - 14, y: HALL_Y - 10, w: 12, h: 10 },
      // 아래쪽 화분 두 개
      { x: HALL_X + 2, y: H - 10, w: 12, h: 10 },
      { x: HALL_X + HALL_W - 14, y: H - 10, w: 12, h: 10 }
    ],
    exits: [
      { x: HALL_X, y: 0, w: HALL_W, h: 2, to: 'exchange', spawn: { x: 160, y: 168, dir: 'up' } },
      { x: HALL_X, y: H - 3, w: HALL_W, h: 3, to: 'racetrack', spawn: { x: 160, y: 38, dir: 'down' } },
      { x: W - 3, y: HALL_Y + 18, w: 3, h: HALL_H - 20, to: 'mafiazone', spawn: { x: 24, y: 96, dir: 'right' } },
      // 풋살장 오른쪽 위 문으로 들어간다(관람 통로)
      { x: 0, y: HALL_Y + 18, w: 3, h: HALL_H - 20, to: 'futsal', spawn: { x: 300, y: 33, dir: 'left' } }
    ]
  };

  // ---------- 경마장 ----------

  // 위쪽 출입문으로 들어와 관람 광장에 선다. 난간 너머는 타원 주로(走路).
  const GATE_X = 146, GATE_W = 28;
  const WALL_H = 18;
  const RAIL_Y = 60;
  const TRACK = { cx: 160, cy: 122, rx: 150, ry: 54, irx: 116, iry: 24 };
  const FINISH_X = 208;
  // 광장 왼쪽 담장에 붙은 마굿간. 칸 가운데 x 와 칸 앞 줄은 server/stable.js 와 맞춰야 한다.
  const STABLE = { x: 22, w: 76, y: 1, stallW: 20, stallX: [36, 60, 84], frontY: 28 };

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
    // 마굿간 칸의 말(칸 문 뒤라 사람보다 먼저 그린다)
    const st = PX.stable && PX.stable.stalls;
    if (st) STABLE.stallX.forEach((cx, n) => { if (st[n]) list.push({ key: 0, draw: () => drawStallHorse(g, cx, t, n) }); });
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

    paintStable(g);

    // 광장 양 끝 화분
    for (const x of [6, W - 20]) {
      rect(g, x + 1, 44, 12, 10, PAL.pot);
      rect(g, x, 42, 14, 3, PAL.potRim);
      disc(g, x + 7, 36, 6, PAL.leaf2, PAL.leaf1);
      rect(g, x + 5, 33, 2, 2, PAL.leaf3);
    }
    return c;
  }

  // 지붕 + 나무 벽 + 칸 셋. 칸 안의 말은 decorate 에서 그린다(훔쳐 가면 빈 칸).
  function paintStable(g) {
    const S = STABLE;
    const bottom = S.frontY - 1;
    rect(g, S.x - 1, S.y + 5, S.w + 2, bottom - S.y - 4, PAL.outline);
    rect(g, S.x, S.y + 6, S.w, bottom - S.y - 6, COL.barn);
    for (let x = S.x + 3; x < S.x + S.w; x += 4) rect(g, x, S.y + 6, 1, bottom - S.y - 6, COL.barnDark);
    // 지붕
    rect(g, S.x - 3, S.y - 1, S.w + 6, 8, PAL.outline);
    for (let y = S.y; y < S.y + 6; y += 2) {
      rect(g, S.x - 2, y, S.w + 4, 2, (y / 2) % 2 ? COL.roofDark : COL.roof);
    }
    // 칸: 어두운 안쪽, 바닥 짚, 반쪽 문(X 자 덧대기)
    for (const cx of S.stallX) {
      const x0 = cx - S.stallW / 2;
      rect(g, x0 - 1, S.y + 8, S.stallW + 2, bottom - S.y - 8, PAL.outline);
      rect(g, x0, S.y + 9, S.stallW, bottom - S.y - 9, COL.stallIn);
      rect(g, x0, bottom - 3, S.stallW, 2, COL.hay);
      const dy = bottom - 7;
      rect(g, x0 - 1, dy - 1, S.stallW + 2, 8, PAL.outline);
      rect(g, x0, dy, S.stallW, 6, COL.barn);
      for (let i = 0; i < S.stallW; i++) {
        const k = Math.round(i * 5 / (S.stallW - 1));
        rect(g, x0 + i, dy + k, 1, 1, COL.barnDark);
        rect(g, x0 + i, dy + 5 - k, 1, 1, COL.barnDark);
      }
      rect(g, x0, dy, S.stallW, 1, COL.barnDark);
    }
  }

  // 칸 문 위로 고개를 내민 말(앞모습)
  function drawStallHorse(g, cx, t, n) {
    const top = STABLE.frontY - 1 - 7 - 9;
    const nod = Math.floor(t * 0.7 + n * 1.3) % 4 === 0 ? 1 : 0;
    const y = top + nod;
    rect(g, cx - 4, y - 1, 8, 11 - nod, PAL.outline);
    rect(g, cx - 3, y, 6, 10 - nod, COL.horse);
    rect(g, cx - 3, y, 6, 2, COL.mane);
    rect(g, cx - 5, y, 2, 2, PAL.outline);
    rect(g, cx + 3, y, 2, 2, PAL.outline);
    rect(g, cx - 2, y + 3, 1, 1, PAL.outline);
    rect(g, cx + 1, y + 3, 1, 1, PAL.outline);
    rect(g, cx - 2, y + 7 - nod, 4, 2, COL.horseDark);
  }

  const racetrack = {
    paint: paintRacetrack,
    stable: STABLE,
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

  // ---------- 마피아존 ----------

  // 오징어게임풍 아레나. 왼쪽 문으로 통로와 이어진다. 가운데 ○△□, 위쪽 핑크 벽에 사회자 단상.
  const MZ = { wallH: 36, host: { x: 160, y: 52 } };

  function ringSym(g, cx, cy, r, th, col, floor) { disc(g, cx, cy, r, col, col); disc(g, cx, cy, r - th, floor, floor); }
  function boxSym(g, cx, cy, s, th, col, floor) { const h = s / 2; rect(g, cx - h, cy - h, s, s, col); rect(g, cx - h + th, cy - h + th, s - th * 2, s - th * 2, floor); }
  function triSym(g, cx, topY, hgt, th, col, floor) {
    const fill = (ty, hh, c) => { for (let i = 0; i <= hh; i++) { const half = Math.round((i / hh) * hh * 0.95); rect(g, cx - half, ty + i, half * 2 + 1, 1, c); } };
    fill(topY, hgt, col); fill(topY + th + 1, hgt - th * 2, floor);
  }

  // 정장 차림 사회자(Claude) NPC — rect 로만 그린 작은 도트 인물
  function hostNpc(g, x, y) {
    rect(g, x - 5, y + 1, 10, 2, 'rgba(0,0,0,0.22)');       // 그림자
    rect(g, x - 3, y - 3, 3, 3, '#20242e'); rect(g, x + 1, y - 3, 3, 3, '#20242e'); // 바지
    rect(g, x - 4, y - 9, 8, 6, '#242a36');                  // 재킷
    rect(g, x - 1, y - 9, 2, 6, '#e8e8e8');                  // 흰 셔츠
    rect(g, x - 1, y - 8, 2, 2, '#b23a3a');                  // 넥타이
    rect(g, x - 4, y - 15, 8, 6, '#f2c39b');                 // 얼굴
    rect(g, x - 4, y - 16, 8, 3, '#141414');                 // 머리
    rect(g, x - 2, y - 12, 1, 1, '#2a1a14'); rect(g, x + 1, y - 12, 1, 1, '#2a1a14'); // 눈
  }

  const FLOOR = '#c7a977';

  function paintMafiazone() {
    const { c, g } = makeCanvas(W, H);
    // 바닥(모래)
    rect(g, 0, 0, W, H, FLOOR);
    for (let y = MZ.wallH; y < H; y += 8) rect(g, 0, y, W, 1, '#bb9c6b');
    // 위쪽 핑크 벽
    rect(g, 0, 0, W, MZ.wallH, '#c21e63');
    rect(g, 0, 0, W, 8, '#a3134f');
    for (let x = 0; x < W; x += 20) rect(g, x, 0, 1, MZ.wallH, '#ad1657');
    rect(g, 0, MZ.wallH - 3, W, 3, '#7a0f3c');
    rect(g, 0, MZ.wallH - 1, W, 1, PAL.outline);
    // 사회자 단상 + NPC
    rect(g, MZ.host.x - 12, MZ.host.y + 1, 24, 4, '#3a2a1a');
    rect(g, MZ.host.x - 12, MZ.host.y + 1, 24, 1, '#5a4330');
    hostNpc(g, MZ.host.x, MZ.host.y);
    // 벽 현판(글씨는 DOM)
    rect(g, W / 2 - 46, 6, 92, 2, '#f1cf5a');
    rect(g, W / 2 - 46, 24, 92, 2, '#f1cf5a');
    // 경기장 테두리
    rect(g, 8, MZ.wallH + 4, W - 16, 2, '#ede3cf');
    rect(g, 8, H - 6, W - 16, 2, '#ede3cf');
    rect(g, 8, MZ.wallH + 4, 2, H - MZ.wallH - 10, '#ede3cf');
    rect(g, W - 10, MZ.wallH + 4, 2, H - MZ.wallH - 10, '#ede3cf');
    // 바닥 심볼 ○ △ □ (핑크)
    const SC = '#d9397e', sy = 120;
    ringSym(g, 70, sy, 22, 5, SC, FLOOR);
    triSym(g, 160, sy - 20, 40, 5, SC, FLOOR);
    boxSym(g, 250, sy, 38, 5, SC, FLOOR);
    // 왼쪽 입구(통로로 이어지는 붉은 카펫)
    rect(g, 0, 84, 16, 28, PAL.carpetEdge);
    rect(g, 0, 88, 14, 20, PAL.carpet);
    return c;
  }

  const mafiazone = {
    paint: paintMafiazone,
    walk: [
      { x: 12, y: MZ.wallH + 8, w: W - 24, h: H - MZ.wallH - 16 },
      { x: 0, y: 88, w: 16, h: 20 }
    ],
    blocks: [
      // 사회자 단상 근처는 막는다
      { x: MZ.host.x - 12, y: MZ.host.y - 4, w: 24, h: 10 }
    ],
    exits: [
      { x: 0, y: 86, w: 3, h: 24, to: 'crossroad', spawn: { x: W - 16, y: 90, dir: 'left' } }
    ]
  };

  // ---------- 풋살장 ----------

  // 위에서 내려다본 실내 풋살장. 위쪽은 관중석과 점수판, 오른쪽 위 문으로 사거리와 이어진다.
  // 경기장 선·골대 입구·가운데는 server/futsal.js 의 FIELD·GOAL·CENTER 와 맞춰야 한다(공이 그 안에서 움직인다).
  const FS = {
    standH: 24,
    field: { x0: 24, x1: 296, y0: 40, y1: 166 },
    goal: { y0: 85, y1: 121, depth: 12 },
    center: { x: 160, y: 103 },
    door: { y: 28, h: 12 },
    // 경기 중 관전자가 머무는 아래쪽 벤치 줄(경기장 선 아래)과 그 끝의 관전석 출입문
    bench: { y0: 170, y1: 176 },
    benchDoor: { x: 284, w: 22 },
    board: { x: 112, y: 2, w: 96, h: 19 }
  };
  const FC = {
    wall: '#262b36', seat: '#3a4152', seatHi: '#4a5266', rail: '#d9dde4', railShade: '#8c94a3',
    apron: '#4a5663', apronDot: '#55626f', turf: '#3f9a52', turfStripe: '#46a85a', line: '#f4f6ef',
    net: '#1b232c', netLine: '#8d99a6', post: '#ffffff', screen: '#0d1015', frame: '#5b5f6a',
    door: '#2f8a45', doorDark: '#226a34', red: '#d8343a', blue: '#2f6fd8', bench: '#6b4a2e'
  };

  // 관중석: 세 줄 좌석에 듬성듬성 앉은 관중(머리만 보인다)
  function paintStands(g, r) {
    rect(g, 0, 0, W, FS.standH, FC.wall);
    for (let row = 0; row < 3; row++) {
      const y = 3 + row * 6;
      rect(g, 0, y + 3, W, 2, FC.seat);
      rect(g, 0, y + 3, W, 1, FC.seatHi);
      for (let x = 2; x < W - 2; x += 4) {
        // 점수판 뒤에는 앉지 않는다
        if (x > FS.board.x - 4 && x < FS.board.x + FS.board.w + 2) continue;
        if (r() < 0.45) continue;
        const shirt = r() < 0.5 ? FC.red : r() < 0.6 ? FC.blue : PX.pixel.PAL.chairArm;
        rect(g, x, y + 2, 3, 2, shirt);
        rect(g, x, y, 3, 2, r() < 0.7 ? PAL.skin : PAL.outline);
        rect(g, x, y - 1, 3, 1, r() < 0.5 ? '#2a2220' : '#5b3a22');
      }
    }
    // 난간
    rect(g, 0, FS.standH - 2, W, 1, PAL.outline);
    rect(g, 0, FS.standH - 1, W, 1, FC.rail);
    rect(g, 0, FS.standH, W, 1, FC.railShade);
    // 점수판 틀(글씨는 DOM)
    const B = FS.board;
    rect(g, B.x - 2, B.y - 1, B.w + 4, B.h + 2, PAL.outline);
    rect(g, B.x - 1, B.y, B.w + 2, B.h, FC.frame);
    rect(g, B.x, B.y + 1, B.w, B.h - 2, FC.screen);
    // 왼쪽 현판 바탕(글씨는 DOM)
    rect(g, 9, 6, 82, 12, PAL.outline);
    rect(g, 10, 7, 80, 10, '#1f5a31');
    rect(g, 10, 7, 80, 1, PAL.signEdge);
  }

  // 왼쪽(side -1)·오른쪽(side 1) 골대. 골망은 격자, 기둥·옆 테는 흰색.
  function paintGoal(g, side) {
    const F = FS.field, G = FS.goal;
    const x0 = side < 0 ? F.x0 - G.depth : F.x1 + 1;
    rect(g, x0 - 1, G.y0 - 2, G.depth + 2, G.y1 - G.y0 + 5, PAL.outline);
    rect(g, x0, G.y0, G.depth, G.y1 - G.y0 + 1, FC.net);
    for (let x = x0 + 1; x < x0 + G.depth; x += 3) rect(g, x, G.y0, 1, G.y1 - G.y0 + 1, FC.netLine);
    for (let y = G.y0 + 2; y < G.y1; y += 3) rect(g, x0, y, G.depth, 1, FC.netLine);
    // 옆 테와 뒤 테
    rect(g, x0, G.y0 - 1, G.depth, 1, FC.post);
    rect(g, x0, G.y1 + 1, G.depth, 1, FC.post);
    rect(g, side < 0 ? x0 : x0 + G.depth - 1, G.y0 - 1, 1, G.y1 - G.y0 + 3, FC.post);
    // 기둥(골라인 위)
    const px = side < 0 ? F.x0 - 1 : F.x1;
    for (const py of [G.y0 - 2, G.y1]) {
      rect(g, px - 1, py - 1, 4, 4, PAL.outline);
      rect(g, px, py, 2, 2, FC.post);
    }
  }

  // 페널티 구역: 골대 입구에서 반지름 36 안쪽(골라인 앞으로 둥근 'D')
  function penaltyArc(g, side) {
    const F = FS.field, G = FS.goal, R = 36;
    const lx = side < 0 ? F.x0 : F.x1;
    for (let y = F.y0; y <= F.y1; y++) {
      for (let x = F.x0; x <= F.x1; x++) {
        const dx = Math.abs(x - lx);
        const dy = y < G.y0 ? G.y0 - y : y > G.y1 ? y - G.y1 : 0;
        const d = Math.hypot(dx, dy);
        if (d >= R - 0.5 && d < R + 0.5 && (side < 0 ? x >= lx : x <= lx)) rect(g, x, y, 1, 1, FC.line);
      }
    }
    rect(g, side < 0 ? lx + 60 : lx - 61, FS.center.y, 2, 1, FC.line);
  }

  function paintFutsal() {
    const { c, g } = makeCanvas(W, H);
    const r = rng(37);
    const F = FS.field;

    // 바닥(경기장 둘레)
    rect(g, 0, 0, W, H, FC.apron);
    for (let i = 0; i < 260; i++) rect(g, Math.floor(r() * W), FS.standH + Math.floor(r() * (H - FS.standH)), 1, 1, FC.apronDot);

    // 인조잔디: 경기장 선 바깥으로 4px 여유, 세로 줄무늬
    for (let x = F.x0 - 4; x <= F.x1 + 4; x++) {
      rect(g, x, F.y0 - 4, 1, F.y1 - F.y0 + 9, Math.floor((x - F.x0) / 17) % 2 ? FC.turfStripe : FC.turf);
    }
    // 선: 테두리, 하프라인, 센터서클, 센터 점, 페널티 구역, 코너
    rect(g, F.x0, F.y0, F.x1 - F.x0 + 1, 1, FC.line);
    rect(g, F.x0, F.y1, F.x1 - F.x0 + 1, 1, FC.line);
    rect(g, F.x0, F.y0, 1, F.y1 - F.y0 + 1, FC.line);
    rect(g, F.x1, F.y0, 1, F.y1 - F.y0 + 1, FC.line);
    rect(g, FS.center.x, F.y0, 1, F.y1 - F.y0 + 1, FC.line);
    for (let a = 0; a < 360; a += 2) {
      const t = a * Math.PI / 180;
      rect(g, Math.round(FS.center.x + 20 * Math.cos(t)), Math.round(FS.center.y + 20 * Math.sin(t)), 1, 1, FC.line);
    }
    rect(g, FS.center.x - 1, FS.center.y - 1, 3, 3, FC.line);
    penaltyArc(g, -1);
    penaltyArc(g, 1);
    for (const [cx, cy, sx, sy] of [[F.x0, F.y0, 1, 1], [F.x1, F.y0, -1, 1], [F.x0, F.y1, 1, -1], [F.x1, F.y1, -1, -1]]) {
      rect(g, cx + sx * 3, cy + sy, 1, 1, FC.line);
      rect(g, cx + sx * 2, cy + sy * 2, 1, 1, FC.line);
      rect(g, cx + sx, cy + sy * 3, 1, 1, FC.line);
    }

    paintGoal(g, -1);
    paintGoal(g, 1);

    // 아래쪽 양 팀 벤치(왼쪽 레드, 오른쪽 블루)
    for (const [bx, col] of [[52, FC.red], [208, FC.blue]]) {
      rect(g, bx - 1, 169, 62, 6, PAL.outline);
      rect(g, bx, 170, 60, 2, col);
      rect(g, bx, 172, 60, 2, FC.bench);
      for (const lx of [bx + 2, bx + 56]) rect(g, lx, 174, 2, 2, PAL.outline);
    }

    // 벽: 왼쪽·오른쪽·아래. 오른쪽 위에 사거리로 나가는 문.
    rect(g, 0, FS.standH, 6, H - FS.standH, FC.wall);
    rect(g, 6, FS.standH, 1, H - FS.standH, PAL.outline);
    rect(g, W - 6, FS.standH, 6, H - FS.standH, FC.wall);
    rect(g, W - 7, FS.standH, 1, H - FS.standH, PAL.outline);
    rect(g, 0, H - 3, W, 3, FC.wall);
    rect(g, 0, H - 4, W, 1, PAL.outline);
    // 아래쪽 관전석 출입문(사거리로 이어진다)
    const BD = FS.benchDoor;
    rect(g, BD.x, H - 4, BD.w, 4, FC.apron);
    rect(g, BD.x - 2, H - 5, 2, 5, FC.door);
    rect(g, BD.x + BD.w, H - 5, 2, 5, FC.door);
    rect(g, BD.x - 3, H - 5, 1, 5, FC.doorDark);
    rect(g, BD.x + BD.w + 2, H - 5, 1, 5, FC.doorDark);
    const D = FS.door;
    rect(g, W - 7, D.y, 7, D.h, FC.apron);
    rect(g, W - 7, D.y - 2, 7, 2, FC.door);
    rect(g, W - 7, D.y + D.h, 7, 2, FC.door);
    rect(g, W - 7, D.y - 3, 7, 1, FC.doorDark);
    rect(g, W - 7, D.y + D.h + 2, 7, 1, FC.doorDark);
    rect(g, W - 4, D.y + 4, 2, 1, PAL.signEdge);
    rect(g, W - 3, D.y + 5, 1, 2, PAL.signEdge);
    rect(g, W - 4, D.y + 7, 2, 1, PAL.signEdge);

    paintStands(g, r);
    return c;
  }

  // 공(5×5)과 그림자. (x, y) 는 공이 바닥에 닿는 점, roll 은 굴러간 거리(무늬가 돈다).
  function drawBall(g, x, y, roll) {
    rect(g, x - 2, y, 5, 1, 'rgba(0,0,0,0.35)');
    rect(g, x - 1, y - 5, 3, 1, PAL.outline);
    rect(g, x - 2, y - 4, 5, 3, PAL.outline);
    rect(g, x - 1, y - 1, 3, 1, PAL.outline);
    rect(g, x - 1, y - 4, 3, 3, '#ffffff');
    if (Math.floor(roll / 3) % 2) rect(g, x, y - 3, 1, 1, PAL.outline);
    else { rect(g, x - 1, y - 4, 1, 1, '#555a63'); rect(g, x + 1, y - 2, 1, 1, '#555a63'); }
  }

  // 공 가진 사람 발밑의 팀 색 고리
  function drawRing(g, x, y, col) {
    rect(g, x - 4, y - 2, 9, 1, col);
    rect(g, x - 4, y + 1, 9, 1, col);
    rect(g, x - 6, y - 1, 2, 2, col);
    rect(g, x + 5, y - 1, 2, 2, col);
  }

  // 슛 힘 게이지(내 캐릭터 오른쪽 세로 막대). 끝까지 차면 빨갛게.
  function drawGauge(g, x, y, p) {
    const h = 14, fill = Math.round(h * p);
    rect(g, x + 7, y - h - 3, 4, h + 2, PAL.outline);
    rect(g, x + 8, y - h - 2, 2, h, '#3a3f48');
    rect(g, x + 8, y - 2 - fill, 2, fill, p >= 1 ? '#ff5a4a' : p > 0.6 ? '#ffb84a' : '#7be07b');
  }

  // 태클할 때 발밑 먼지
  function drawPuff(g, x, y, k) {
    const s = 3 + Math.round(k * 4);
    for (const [dx, dy] of [[-s, 0], [s, 0], [-s + 1, -2], [s - 1, -2], [0, 1]]) rect(g, x + dx, y + dy, 2, 1, 'rgba(230,230,220,0.8)');
  }

  function decorateFutsal(list, g, t) {
    const v = PX.futsal && PX.futsal.view();
    if (!v) return;
    const ground = -1e6, top = 1e6;
    if (v.ring) list.push({ key: ground, draw: () => drawRing(g, Math.round(v.ring.x), Math.round(v.ring.y), v.ring.team === 'red' ? FC.red : FC.blue) });
    if (v.ball) {
      const bx = Math.round(v.ball.x), by = Math.round(v.ball.y);
      list.push({ key: by, draw: () => drawBall(g, bx, by, v.ball.roll) });
    }
    if (v.gauge) list.push({ key: top, draw: () => drawGauge(g, Math.round(v.gauge.x), Math.round(v.gauge.y), v.gauge.p) });
    for (const p of v.puffs) list.push({ key: top, draw: () => drawPuff(g, Math.round(p.x), Math.round(p.y), p.k) });
  }

  const G_ = FS.goal, F_ = FS.field;
  const futsal = {
    paint: paintFutsal,
    fs: FS,
    // 풋살장에서는 S 패스·D 슛이라 방향키로만 걷는다(scene.js)
    arrowsOnly: true,
    walk: [
      { x: 8, y: 30, w: W - 16, h: H - 34 },
      { x: W - 20, y: FS.door.y + 2, w: 19, h: FS.door.h - 4 }
    ],
    blocks: [
      // 골대 옆 테·뒤 테(입구로만 들어갈 수 있다)
      { x: F_.x0 - G_.depth - 2, y: G_.y0 - 3, w: G_.depth + 2, h: 2 },
      { x: F_.x0 - G_.depth - 2, y: G_.y1 + 1, w: G_.depth + 2, h: 2 },
      { x: F_.x0 - G_.depth - 4, y: G_.y0 - 3, w: 3, h: G_.y1 - G_.y0 + 6 },
      { x: F_.x1 + 1, y: G_.y0 - 3, w: G_.depth + 2, h: 2 },
      { x: F_.x1 + 1, y: G_.y1 + 1, w: G_.depth + 2, h: 2 },
      { x: F_.x1 + G_.depth + 2, y: G_.y0 - 3, w: 3, h: G_.y1 - G_.y0 + 6 },
      // 벤치
      { x: 52, y: 169, w: 60, h: 5 },
      { x: 208, y: 169, w: 60, h: 5 }
    ],
    exits: [
      { x: W - 3, y: FS.door.y, w: 3, h: FS.door.h, to: 'crossroad', spawn: { x: 16, y: 90, dir: 'right' } },
      { x: FS.benchDoor.x, y: H - 4, w: FS.benchDoor.w, h: 4, to: 'crossroad', spawn: { x: 16, y: 90, dir: 'right' } }
    ],
    // 경기 중 관전자는 벤치 줄 밖으로 못 나간다(futsal.js 가 정한다)
    confine: (x, y) => (PX.futsal ? PX.futsal.allowed(x, y) : true),
    // 공을 가진 사람은 90% 빠르기로 걷는다(futsal.js 가 정한다)
    speed: () => (PX.futsal ? PX.futsal.speed() : 1),
    decorate: decorateFutsal,
    // 팀에 들어간 사람은 이 장소에서만 팀 유니폼으로 그린다(futsal.js 가 정한다)
    dress: (who, look) => (PX.futsal ? PX.futsal.dress(who, look) : null)
  };

  PX.places = { crossroad, racetrack, mafiazone, futsal };
})();
