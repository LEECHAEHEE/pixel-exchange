// 도트 객장 장면. 움직이지 않는 벽·바닥은 처음 한 번만 그려 두고,
// 매 프레임에는 그 이미지를 붙인 뒤 의자·사람만 깊이 순으로 덧그린다.
(function () {
  const C = PX.config;
  const W = C.width;
  const H = C.height;
  const FLOOR_Y = 116;

  const PAL = {
    outline: '#2a1d18',
    ceiling: '#4a3328', lamp: '#fff2b0', lampGlow: '#e9d9a0',
    wall: '#d8b47e', plank: '#c29a63', grain: '#cfa86f',
    rail: '#8a5a34', wainscot: '#a8743f', wainscotLine: '#93633a', baseboard: '#5e3a22',
    frame: '#1e1e24', frameHi: '#5b5b66', frameLo: '#0e0e12', screen: '#0b0d10', bolt: '#9a9aa6',
    sign: '#24543c', signEdge: '#d8b048',
    tile1: '#e9e5da', tile2: '#dcd6c8', grout: '#c8c0ae', speck: '#cfc7b6', floorShade: '#b9b0a0',
    carpet: '#a83a3a', carpetEdge: '#7e2626', carpetDot: '#c85a4a',
    chair: '#c8424a', chairHi: '#e0707a', chairLo: '#9b2c35', chairUnder: '#7d222b', chairArm: '#e6d3a8', chairLeg: '#4b3326',
    pot: '#b5673a', potRim: '#d48a52', leaf1: '#2e6b2c', leaf2: '#3f8f3a', leaf3: '#66b34a',
    paper: '#f4f1e6', ink: '#8c8577',
    skin: '#f2c39b', eye: '#2a1a14', shoe: '#3a2a24'
  };

  function rng(seed) {
    return function () {
      seed |= 0; seed = seed + 0x6D2B79F5 | 0;
      let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  function makeCanvas(w, h) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const g = c.getContext('2d');
    g.imageSmoothingEnabled = false;
    return { c, g };
  }

  function rect(g, x, y, w, h, color) {
    g.fillStyle = color;
    g.fillRect(x, y, w, h);
  }

  // 사각형 부품들을 외곽선 먼저, 채움 나중 순서로 그려 도트 특유의 테두리를 만든다
  function parts(g, list) {
    g.fillStyle = PAL.outline;
    for (const p of list) g.fillRect(p[0] - 1, p[1] - 1, p[2] + 2, p[3] + 2);
    for (const p of list) rect(g, p[0], p[1], p[2], p[3], p[4]);
  }

  function disc(g, cx, cy, r, fill, edge) {
    for (let y = -r; y <= r; y++) {
      for (let x = -r; x <= r; x++) {
        const d = Math.sqrt(x * x + y * y);
        if (d > r + 0.3) continue;
        rect(g, cx + x, cy + y, 1, 1, d > r - 1 ? edge : fill);
      }
    }
  }

  // ---------- 배치 ----------

  const CHAIR_W = 14;
  const CHAIR_H = 13;
  const CHAIR_ROWS = [126, 144, 162];
  const CHAIR_COLS = [];
  for (let i = 0; i < 7; i++) CHAIR_COLS.push(20 + i * 18);
  for (let i = 0; i < 7; i++) CHAIR_COLS.push(178 + i * 18);

  const PLANTS = [{ x: 4 }, { x: 302 }];

  // 발 위치 기준 충돌 영역. 의자는 등받이 위쪽과 겹쳐 서 있을 수 있게 아랫부분만 막는다.
  const BLOCKS = [];
  for (const y of CHAIR_ROWS) {
    BLOCKS.push({ x: 18, y: y + 4, w: 128, h: 10 });
    BLOCKS.push({ x: 176, y: y + 4, w: 128, h: 10 });
  }
  for (const p of PLANTS) BLOCKS.push({ x: p.x - 1, y: FLOOR_Y, w: 16, h: 14 });
  const BOUNDS = { x0: 4, y0: 120, x1: W - 4, y1: H - 1 };
  const AISLE_X = 160;

  // ---------- 정적 배경 ----------

  function drawCeiling(g) {
    rect(g, 0, 0, W, 4, PAL.ceiling);
    for (let x = 20; x < W; x += 40) {
      rect(g, x, 3, 16, 2, PAL.lamp);
      rect(g, x + 2, 5, 12, 1, PAL.lampGlow);
    }
  }

  // 전광판 프레임(안쪽은 DOM 이 덮는다)
  function drawBoardFrame(g, b) {
    rect(g, b.x - 3, b.y - 3, b.w + 6, b.h + 6, PAL.frame);
    rect(g, b.x - 3, b.y - 3, b.w + 6, 1, PAL.frameHi);
    rect(g, b.x - 3, b.y - 3, 1, b.h + 6, PAL.frameHi);
    rect(g, b.x - 3, b.y + b.h + 2, b.w + 6, 1, PAL.frameLo);
    rect(g, b.x + b.w + 2, b.y - 3, 1, b.h + 6, PAL.frameLo);
    rect(g, b.x, b.y, b.w, b.h, PAL.screen);
    for (const [bx, by] of [[b.x - 2, b.y - 2], [b.x + b.w + 1, b.y - 2], [b.x - 2, b.y + b.h + 1], [b.x + b.w + 1, b.y + b.h + 1]]) {
      rect(g, bx, by, 1, 1, PAL.bolt);
    }
  }

  // 착석 화면: 벽 가득 전광판. 아래 띠는 매 프레임 장면을 확대해 덮는다.
  function paintSeatedBackground() {
    const { c, g } = makeCanvas(W, H);
    rect(g, 0, 0, W, H, PAL.wall);
    for (let x = 0; x < W; x += 8) rect(g, x, 0, 1, H, PAL.plank);
    drawCeiling(g);
    drawBoardFrame(g, C.boardSeated);
    rect(g, 0, C.seatedStrip.y - 1, W, 1, PAL.outline);
    return c;
  }

  function paintBackground() {
    const { c, g } = makeCanvas(W, H);
    const r = rng(7);

    // 벽: 세로 판자
    rect(g, 0, 0, W, FLOOR_Y, PAL.wall);
    for (let x = 0; x < W; x += 8) {
      rect(g, x, 4, 1, 100, PAL.plank);
      for (let k = 0; k < 6; k++) rect(g, x + 2 + Math.floor(r() * 5), 6 + Math.floor(r() * 96), 1, 2 + Math.floor(r() * 3), PAL.grain);
    }
    rect(g, 0, 102, W, 2, PAL.rail);
    rect(g, 0, 104, W, 8, PAL.wainscot);
    for (let x = 0; x < W; x += 16) rect(g, x, 104, 1, 8, PAL.wainscotLine);
    rect(g, 0, 112, W, 4, PAL.baseboard);

    drawCeiling(g);

    // 간판 판(글씨는 DOM)
    const s = C.sign;
    rect(g, s.x - 1, s.y - 1, s.w + 2, s.h + 2, PAL.signEdge);
    rect(g, s.x, s.y, s.w, s.h, PAL.sign);

    // 전광판이 벽 양 끝까지 차지하므로 벽 시계·게시판은 두지 않는다
    drawBoardFrame(g, C.board);

    // 바닥: 대리석 바둑판 타일
    for (let y = FLOOR_Y, row = 0; y < H; y += 10, row++) {
      for (let x = 0, col = 0; x < W; x += 16, col++) {
        rect(g, x, y, 16, 10, (row + col) % 2 ? PAL.tile2 : PAL.tile1);
        rect(g, x, y, 16, 1, PAL.grout);
        rect(g, x, y, 1, 10, PAL.grout);
        for (let k = 0; k < 3; k++) rect(g, x + 2 + Math.floor(r() * 12), y + 2 + Math.floor(r() * 7), 1, 1, PAL.speck);
      }
    }
    rect(g, 0, FLOOR_Y, W, 2, PAL.floorShade);

    // 가운데 통로 카펫
    rect(g, 148, 120, 24, H - 120, PAL.carpetEdge);
    rect(g, 150, 120, 20, H - 120, PAL.carpet);
    for (let y = 124; y < H; y += 8) rect(g, 159, y, 2, 2, PAL.carpetDot);

    // 화분
    for (const p of PLANTS) {
      const x = p.x;
      rect(g, x + 1, 120, 12, 10, PAL.pot);
      rect(g, x, 118, 14, 3, PAL.potRim);
      rect(g, x + 2, 130, 10, 1, 'rgba(0,0,0,0.2)');
      disc(g, x + 7, 108, 6, PAL.leaf2, PAL.leaf1);
      disc(g, x + 3, 113, 4, PAL.leaf2, PAL.leaf1);
      disc(g, x + 11, 113, 4, PAL.leaf2, PAL.leaf1);
      rect(g, x + 5, 104, 2, 2, PAL.leaf3);
      rect(g, x + 9, 110, 2, 1, PAL.leaf3);
    }
    return c;
  }

  // 뒤에서 본 객장 의자(빨간 등받이)
  function paintChair() {
    const { c, g } = makeCanvas(CHAIR_W, CHAIR_H);
    rect(g, 1, 0, 12, 1, PAL.outline);
    rect(g, 0, 1, 14, 8, PAL.outline);
    rect(g, 1, 1, 12, 7, PAL.chair);
    rect(g, 2, 1, 10, 1, PAL.chairHi);
    rect(g, 11, 2, 1, 6, PAL.chairLo);
    rect(g, 1, 7, 12, 1, PAL.chairLo);
    rect(g, 0, 8, 14, 1, PAL.chairArm);
    rect(g, 1, 9, 12, 2, PAL.chairUnder);
    rect(g, 1, 11, 2, 2, PAL.chairLeg);
    rect(g, 11, 11, 2, 2, PAL.chairLeg);
    rect(g, 3, 12, 8, 1, 'rgba(0,0,0,0.15)');
    return c;
  }

  // ---------- 사람 ----------

  // (x, y) 는 발끝 가운데. frame 0 은 정지, 1·2 는 걷기 동작.
  function drawPerson(g, x, y, look, dir, frame) {
    rect(g, x - 4, y - 1, 8, 2, 'rgba(0,0,0,0.18)');

    const lUp = frame === 1 ? 1 : 0;
    const rUp = frame === 2 ? 1 : 0;
    const p = [
      [x - 3, y - 4, 3, 3 - lUp, look.pants],
      [x + 1, y - 4, 3, 3 - rUp, look.pants],
      [x - 4, y - 10, 8, 6, look.shirt],
      [x - 4, y - 17, 8, 7, PAL.skin]
    ];
    parts(g, p);
    rect(g, x - 3, y - 2 - lUp, 3, 1, PAL.shoe);
    rect(g, x + 1, y - 2 - rUp, 3, 1, PAL.shoe);

    // 팔
    if (dir === 'left' || dir === 'right') {
      rect(g, x - 1, y - 9 + (frame ? 1 : 0), 2, 4, look.shirtLo || look.shirt);
      rect(g, x - 1, y - 6 + (frame ? 1 : 0), 2, 1, PAL.skin);
    } else {
      rect(g, x - 5, y - 9, 1, 4, PAL.skin);
      rect(g, x + 4, y - 9, 1, 4, PAL.skin);
    }

    if (look.paper && dir === 'down') {
      rect(g, x - 6, y - 12, 12, 7, PAL.outline);
      rect(g, x - 5, y - 11, 10, 5, PAL.paper);
      rect(g, x - 4, y - 10, 3, 1, PAL.ink);
      rect(g, x, y - 10, 4, 1, PAL.ink);
      rect(g, x - 4, y - 8, 8, 1, PAL.ink);
    }

    // 머리카락·눈
    const hy = y - 17;
    const hair = look.hair;
    if (dir === 'up') {
      rect(g, x - 4, hy, 8, 6, hair);
      rect(g, x - 4, hy + 3, 1, 2, PAL.skin);
      rect(g, x + 3, hy + 3, 1, 2, PAL.skin);
    } else if (dir === 'down') {
      rect(g, x - 4, hy, 8, 2, hair);
      rect(g, x - 4, hy + 2, 1, 2, hair);
      rect(g, x + 3, hy + 2, 1, 2, hair);
      rect(g, x - 2, hy + 4, 1, 1, PAL.eye);
      rect(g, x + 1, hy + 4, 1, 1, PAL.eye);
    } else {
      const s = dir === 'left' ? 1 : -1;
      rect(g, x - 4, hy, 8, 2, hair);
      rect(g, s > 0 ? x : x - 4, hy + 2, 4, 3, hair);
      rect(g, x - 3 * s - (s < 0 ? 1 : 0), hy + 4, 1, 1, PAL.eye);
    }

    if (look.cap) {
      rect(g, x - 5, hy - 2, 10, 4, PAL.outline);
      rect(g, x - 4, hy - 1, 8, 3, look.cap);
      if (dir === 'down') {
        rect(g, x - 4, hy + 2, 8, 1, look.capLo);
        rect(g, x - 1, hy, 2, 1, '#ffffff');
      } else if (dir === 'left') {
        rect(g, x - 7, hy + 1, 3, 1, look.capLo);
      } else if (dir === 'right') {
        rect(g, x + 4, hy + 1, 3, 1, look.capLo);
      }
    }
  }

  // 의자에 앉은 뒷모습: 머리만 등받이 위로 보인다
  function drawSeated(g, x, y, look, tilt) {
    const hx = x + 3 + tilt;
    const hy = y - 6;
    parts(g, [[hx, hy, 8, 7, PAL.skin]]);
    if (look.bald) {
      rect(g, hx, hy + 2, 1, 4, look.hair);
      rect(g, hx + 7, hy + 2, 1, 4, look.hair);
      rect(g, hx + 1, hy + 4, 6, 3, look.hair);
    } else {
      rect(g, hx, hy, 8, 7, look.hair);
      rect(g, hx, hy + 3, 1, 2, PAL.skin);
      rect(g, hx + 7, hy + 3, 1, 2, PAL.skin);
    }
    if (look.cap) {
      rect(g, hx - 1, hy - 2, 10, 5, PAL.outline);
      rect(g, hx, hy - 1, 8, 3, look.cap);
    }
  }

  // 앉을 수 있는 의자 위에 띄우는 작은 화살표
  function drawSeatMarker(g, seat, t) {
    const x = seat.x + 7;
    const y = seat.y - 13 + (Math.floor(t * 3) % 2);
    rect(g, x - 3, y, 7, 1, PAL.outline);
    rect(g, x - 2, y + 1, 5, 1, PAL.signEdge);
    rect(g, x - 1, y + 2, 3, 1, PAL.signEdge);
    rect(g, x, y + 3, 1, 1, PAL.outline);
  }

  // ---------- 장면 ----------

  function hits(x, y) {
    if (x < BOUNDS.x0 || x > BOUNDS.x1 || y < BOUNDS.y0 || y > BOUNDS.y1) return true;
    for (const b of BLOCKS) {
      if (x + 3 > b.x && x - 3 < b.x + b.w && y > b.y && y - 2 < b.y + b.h) return true;
    }
    return false;
  }

  function createWalker(look, x, y, path, speed) {
    return { look, x, y, dir: 'down', frame: 0, anim: 0, path, wp: 0, speed, wait: 0 };
  }

  // 한 축씩 이동해 벽에 비스듬히 부딪혀도 미끄러지듯 움직이게 한다
  function moveBy(p, dx, dy) {
    let moved = false;
    if (dx && !hits(p.x + dx, p.y)) { p.x += dx; moved = true; }
    if (dy && !hits(p.x, p.y + dy)) { p.y += dy; moved = true; }
    if (Math.abs(dx) > Math.abs(dy)) p.dir = dx < 0 ? 'left' : 'right';
    else if (dy) p.dir = dy < 0 ? 'up' : 'down';
    return moved;
  }

  function animate(p, moving, dt) {
    if (!moving) { p.frame = 0; p.anim = 0; return; }
    p.anim += dt;
    p.frame = Math.floor(p.anim / 0.16) % 4;
    p.frame = p.frame === 1 ? 1 : p.frame === 3 ? 2 : 0;
  }

  function createScene(canvas) {
    const screen = canvas.getContext('2d');
    screen.imageSmoothingEnabled = false;
    // 장면은 늘 world 에 그리고, 화면에는 시점에 맞게 옮겨 붙인다
    const { c: world, g } = makeCanvas(W, H);
    const bg = paintBackground();
    const seatedBg = paintSeatedBackground();
    const chairImg = paintChair();
    const r = rng(42);

    const hairs = ['#2a2220', '#2a2220', '#3b2a20', '#8c8c8c', '#d9d9d9', '#5b3a22'];
    const statics = [];
    const seated = [];
    const seats = [];
    for (const cy of CHAIR_ROWS) {
      for (const cx of CHAIR_COLS) {
        const seat = { x: cx, y: cy, taken: false };
        seats.push(seat);
        if (r() < 0.35) {
          seat.taken = true;
          const s = { x: cx, y: cy, look: { hair: hairs[Math.floor(r() * hairs.length)], bald: r() < 0.15 }, tilt: 0, next: 1 + r() * 6 };
          seated.push(s);
          statics.push({ key: cy + CHAIR_H - 0.5, draw: () => drawSeated(g, s.x, s.y, s.look, s.tilt) });
        }
        statics.push({ key: cy + CHAIR_H, draw: () => g.drawImage(chairImg, cx, cy) });
      }
    }

    const player = {
      look: { hair: '#2a2220', shirt: '#3a5bbf', shirtLo: '#2c4596', pants: '#3a3a48', cap: '#d83a3a', capLo: '#a82626' },
      x: 160, y: 172, dir: 'up', frame: 0, anim: 0, route: null,
      seat: null, standAt: null
    };

    const npcs = [
      createWalker({ hair: '#5b3a22', shirt: '#4f8f5a', pants: '#5a4a3a' }, 160, 124, [[160, 124], [160, 176]], 18),
      createWalker({ hair: '#8c8c8c', shirt: '#d8c79a', pants: '#4a4a55' }, 24, 122, [[24, 122], [136, 122], [136, 122], [24, 122]], 14),
      { look: { hair: '#2a2220', shirt: '#7a4f9a', pants: '#3a3a48' }, x: 228, y: 122, dir: 'up', frame: 0, idle: true },
      { look: { hair: '#d9d9d9', shirt: '#8a6a4a', pants: '#3a3a48', paper: true }, x: 194, y: 122, dir: 'down', frame: 0, idle: true }
    ];

    const keys = new Set();
    const KEYMAP = { ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down', ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right' };

    // ---------- 앉기 ----------

    const DIRV = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };

    // 바라보는 방향으로 한 발 앞을 찍어 보고, 거기 닿는 빈 의자를 고른다.
    // 등받이 뒤·옆·앞 어느 쪽에서든 의자에 붙어 바라보면 앉을 수 있다.
    function seatFacing() {
      const [dx, dy] = DIRV[player.dir];
      // 걸음이 1.8px 단위라 붙어 서도 1~2px 떨어질 수 있어 옆쪽은 조금 더 멀리 본다
      const px = player.x + dx * 10;
      const py = player.y - 2 + dy * 6;
      return seats.find(s => !s.taken
        && px >= s.x && px < s.x + CHAIR_W
        && py >= s.y && py < s.y + CHAIR_H + 3) || null;
    }

    function sit(seat) {
      seat.taken = true;
      // 일어날 때 앉기 전 자리로 돌아오게 기억해 둔다
      player.standAt = { x: player.x, y: player.y, dir: player.dir };
      player.seat = seat;
      player.route = null;
      player.dir = 'up';
      animate(player, false, 0);
    }

    function stand() {
      player.seat.taken = false;
      player.x = player.standAt.x;
      player.y = player.standAt.y;
      player.dir = player.standAt.dir;
      player.seat = null;
    }

    function lineFree(x0, y0, x1, y1) {
      const n = Math.ceil(Math.hypot(x1 - x0, y1 - y0));
      for (let i = 1; i <= n; i++) {
        if (hits(x0 + (x1 - x0) * i / n, y0 + (y1 - y0) * i / n)) return false;
      }
      return true;
    }

    // 의자 줄 사이는 막다른 틈이라, 곧장 못 가면 가운데 통로로 나갔다가 들어간다
    function routeTo(tx, ty) {
      if (lineFree(player.x, player.y, tx, ty)) return [{ x: tx, y: ty }];
      return [{ x: AISLE_X, y: player.y }, { x: AISLE_X, y: ty }, { x: tx, y: ty }];
    }

    function toggleSit() {
      if (player.seat) { stand(); return; }
      const seat = seatFacing();
      if (seat) sit(seat);
    }

    window.addEventListener('keydown', (e) => {
      if (e.code === 'Space') {
        if (!e.repeat) toggleSit();
        e.preventDefault();
        return;
      }
      const k = KEYMAP[e.code];
      if (!k) return;
      e.preventDefault();
      if (player.seat) {
        // 앉은 채 ↑ 는 전광판 쪽이라 그대로 앉아 있고, 다른 방향은 일어선다
        if (k === 'up') return;
        stand();
      }
      keys.add(k);
      player.route = null;
    });
    window.addEventListener('keyup', (e) => {
      const k = KEYMAP[e.code];
      if (k) keys.delete(k);
    });
    window.addEventListener('blur', () => keys.clear());

    canvas.addEventListener('pointerdown', (e) => {
      const rc = canvas.getBoundingClientRect();
      const x = (e.clientX - rc.left) / rc.width * W;
      const y = (e.clientY - rc.top) / rc.height * H;
      // 착석 화면은 좌표계가 달라서, 아래 띠를 누르면 일어나기만 한다
      if (player.seat) { stand(); return; }
      if (y < FLOOR_Y) return;
      player.route = routeTo(Math.round(x), Math.round(y));
    });

    const PLAYER_SPEED = 55;

    function updatePlayer(dt) {
      if (player.seat) return;
      let dx = 0, dy = 0;
      if (keys.has('left')) dx -= 1;
      if (keys.has('right')) dx += 1;
      if (keys.has('up')) dy -= 1;
      if (keys.has('down')) dy += 1;

      const step = PLAYER_SPEED * dt;

      if (!dx && !dy && player.route) {
        const t = player.route[0];
        const tx = t.x - player.x;
        const ty = t.y - player.y;
        const dist = Math.hypot(tx, ty);
        if (dist <= step) {
          // 지나치면 앞뒤로 떨리므로 마지막 한 걸음은 목표점에 맞춘다
          if (!hits(t.x, t.y)) { player.x = t.x; player.y = t.y; }
          player.route.shift();
          if (player.route.length === 0) player.route = null;
          animate(player, true, dt);
          return;
        }
        dx = tx / dist;
        dy = ty / dist;
      }
      if (!dx && !dy) { animate(player, false, dt); return; }

      const len = Math.hypot(dx, dy);
      const moved = moveBy(player, dx / len * step, dy / len * step);
      if (!moved) player.route = null;
      animate(player, moved, dt);
    }

    function updateNpc(n, dt) {
      if (n.idle) return;
      if (n.wait > 0) { n.wait -= dt; animate(n, false, dt); return; }
      const [tx, ty] = n.path[n.wp];
      const dx = tx - n.x, dy = ty - n.y;
      const dist = Math.hypot(dx, dy);
      const step = n.speed * dt;
      if (dist <= step) {
        n.x = tx; n.y = ty;
        n.wp = (n.wp + 1) % n.path.length;
        n.wait = 0.8 + Math.random() * 2;
        n.dir = 'up';
        animate(n, false, dt);
        return;
      }
      n.x += dx / dist * step;
      n.y += dy / dist * step;
      n.dir = Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 'left' : 'right') : (dy < 0 ? 'up' : 'down');
      animate(n, true, dt);
    }

    function update(dt) {
      updatePlayer(dt);
      for (const n of npcs) updateNpc(n, dt);
      for (const s of seated) {
        s.next -= dt;
        if (s.next <= 0) {
          s.tilt = s.tilt ? 0 : (Math.random() < 0.5 ? -1 : 1);
          s.next = s.tilt ? 0.6 + Math.random() : 3 + Math.random() * 8;
        }
      }
    }

    const people = [player, ...npcs];
    function render() {
      const now = new Date();
      g.drawImage(bg, 0, 0);

      const list = statics.slice();
      for (const p of people) {
        if (p.seat) {
          const s = p.seat;
          list.push({ key: s.y + CHAIR_H - 0.5, draw: () => drawSeated(g, s.x, s.y, p.look, 0) });
          continue;
        }
        const px = Math.round(p.x), py = Math.round(p.y);
        list.push({ key: py, draw: () => drawPerson(g, px, py, p.look, p.dir, p.frame) });
      }
      list.sort((a, b) => a.key - b.key);
      for (const it of list) it.draw();

      const near = player.seat ? null : seatFacing();
      if (near) drawSeatMarker(g, near, now.getTime() / 1000);

      if (player.seat) composeSeated(player.seat);
      else screen.drawImage(world, 0, 0);
    }

    // 착석 띠: 내 자리를 가운데 두고 같은 줄 의자 등받이와 뒤통수만 확대해 보여준다
    const ST = C.seatedStrip;
    const strip = makeCanvas(W / ST.zoom, ST.h / ST.zoom);

    function composeSeated(seat) {
      const sg = strip.g;
      const sw = strip.c.width;
      const sh = strip.c.height;
      const sx = Math.round(Math.max(0, Math.min(W - sw, seat.x + CHAIR_W / 2 - sw / 2)));
      // 모자 꼭대기가 띠 맨 위, 등받이 윗부분이 띠 맨 아래에 오게 맞춘다
      const oy = 8 - seat.y;

      rect(sg, 0, 0, sw, sh, PAL.ceiling);
      for (const s of seats) {
        if (s.y !== seat.y || s.x + CHAIR_W < sx || s.x > sx + sw) continue;
        const x = s.x - sx;
        const y = s.y + oy;
        if (s === seat) drawSeated(sg, x, y, player.look, 0);
        else {
          const npc = seated.find(n => n.x === s.x && n.y === s.y);
          if (npc) drawSeated(sg, x, y, npc.look, npc.tilt);
        }
        sg.drawImage(chairImg, x, y);
      }

      screen.drawImage(seatedBg, 0, 0);
      screen.drawImage(strip.c, 0, ST.y, W, ST.h);
    }

    // 안내 문구용 현재 상태: 'seated' | 'near' | 'free'
    function prompt() {
      if (player.seat) return 'seated';
      return seatFacing() ? 'near' : 'free';
    }

    return { update, render, prompt, player };
  }

  PX.createScene = createScene;
})();
