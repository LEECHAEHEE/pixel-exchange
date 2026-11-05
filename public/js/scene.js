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

  // 다른 장소(places.js)도 같은 도트 그리기 도구를 쓴다
  PX.pixel = { PAL, rng, makeCanvas, rect, parts, disc };

  // ---------- 배치 ----------

  const CHAIR_W = 14;
  const CHAIR_H = 13;
  const CHAIR_ROWS = [126, 144, 162];
  const CHAIR_COLS = [];
  for (let i = 0; i < 7; i++) CHAIR_COLS.push(20 + i * 18);
  for (let i = 0; i < 7; i++) CHAIR_COLS.push(178 + i * 18);

  // 오른쪽 화분 자리는 상점 주인이 쓴다
  const PLANTS = [{ x: 4 }];
  const SHOPKEEPER = { x: 310, y: 129 };

  // 발 위치 기준 충돌 영역. 의자는 등받이 위쪽과 겹쳐 서 있을 수 있게 아랫부분만 막는다.
  const BLOCKS = [];
  for (const y of CHAIR_ROWS) {
    BLOCKS.push({ x: 18, y: y + 4, w: 128, h: 10 });
    BLOCKS.push({ x: 176, y: y + 4, w: 128, h: 10 });
  }
  for (const p of PLANTS) BLOCKS.push({ x: p.x - 1, y: FLOOR_Y, w: 16, h: 14 });
  BLOCKS.push({ x: SHOPKEEPER.x - 5, y: SHOPKEEPER.y - 8, w: 11, h: 9 });
  const AISLE_X = 160;

  // 가운데 빨간 복도(카펫) 아래 끝이 출구. 끝에 닿으면 사거리 위쪽으로 넘어간다.
  const CARPET_X = 148, CARPET_W = 24;

  // 장소 하나의 모양. 발 위치가 walk 사각형 중 하나 안에 있어야 서 있을 수 있고,
  // blocks 와 겹치면 막히며, exits 안에 들어서면 to 장소의 spawn 으로 옮겨 간다.
  const EXCHANGE = {
    walk: [{ x: 4, y: 120, w: W - 8, h: H - 121 }],
    blocks: BLOCKS,
    exits: [{ x: CARPET_X, y: H - 2, w: CARPET_W, h: 2, to: 'crossroad', spawn: { x: 160, y: 26, dir: 'down' } }],
    aisle: AISLE_X,
    floorY: FLOOR_Y
  };

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
    for (let y = 124; y < H - 12; y += 8) rect(g, 159, y, 2, 2, PAL.carpetDot);
    // 카펫 아래 끝: 사거리로 나가는 쪽을 가리키는 화살표
    for (let k = 0; k < 4; k++) {
      rect(g, CARPET_X + 8 + k, H - 10 + k, 1, 1, PAL.signEdge);
      rect(g, CARPET_X + 15 - k, H - 10 + k, 1, 1, PAL.signEdge);
    }

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
  // pose: 감정표현 중일 때의 자세. { bow: 0|1|2 } 는 꾸벅 인사(머리를 숙인 칸 수).
  function drawPerson(g, x, y, look, dir, frame, pose) {
    rect(g, x - 4, y - 1, 8, 2, 'rgba(0,0,0,0.18)');

    const lUp = frame === 1 ? 1 : 0;
    const rUp = frame === 2 ? 1 : 0;
    // 꾸벅 인사: 머리가 몸 쪽으로 내려오고(어깨를 덮는다), 옆모습이면 끝까지 숙일 때 앞으로 한 칸 나간다
    const bow = pose && pose.bow ? pose.bow : 0;
    const lean = bow === 2 ? (dir === 'left' ? -1 : dir === 'right' ? 1 : 0) : 0;
    const cx = x + lean;
    const p = [
      [x - 3, y - 4, 3, 3 - lUp, look.pants],
      [x + 1, y - 4, 3, 3 - rUp, look.pants],
      [x - 4, y - 10, 8, 6, look.shirt],
      [cx - 4, y - 17 + bow, 8, 7, PAL.skin]
    ];
    parts(g, p);

    // 하의 무늬: 반바지(무릎 아래 맨살), 체크
    if (look.shorts) {
      rect(g, x - 3, y - 3, 3, 1, PAL.skin);
      rect(g, x + 1, y - 3, 3, 1, PAL.skin);
    }
    if (look.check) {
      rect(g, x - 3, y - 4, 1, 1, look.check);
      rect(g, x - 1, y - 3, 1, 1, look.check);
      rect(g, x + 1, y - 4, 1, 1, look.check);
      rect(g, x + 3, y - 3, 1, 1, look.check);
    }
    if (look.stripe) {
      rect(g, x - 3, y - 4, 1, 2, look.stripe);
      rect(g, x + 3, y - 4, 1, 2, look.stripe);
    }

    const shoe = look.shoes || PAL.shoe;
    rect(g, x - 3, y - 2 - lUp, 3, 1, shoe);
    rect(g, x + 1, y - 2 - rUp, 3, 1, shoe);
    // 슬리퍼는 발가락이 보인다
    if (look.slipper) {
      rect(g, x - 2, y - 2 - lUp, 1, 1, PAL.skin);
      rect(g, x + 2, y - 2 - rUp, 1, 1, PAL.skin);
    }

    // 상의 위에 덧그리는 것: 조끼, 넥타이, 가슴 무늬, 트레이닝 옆줄
    if (look.vest) {
      if (dir === 'down') {
        rect(g, x - 4, y - 10, 3, 6, look.vest);
        rect(g, x + 1, y - 10, 3, 6, look.vest);
      } else {
        rect(g, x - 4, y - 10, 8, 6, look.vest);
      }
    }
    if (look.tie && dir === 'down') {
      rect(g, x - 1, y - 10, 2, 5, look.tie);
      rect(g, x - 1, y - 6, 1, 1, look.tie);
    }
    if (look.print && dir === 'down') {
      for (const [dx, dy] of [[-3, -9], [-1, -8], [1, -9], [2, -7], [-2, -6], [0, -7]]) rect(g, x + dx, y + dy, 1, 1, look.print);
    }
    if (look.stripe && dir !== 'left' && dir !== 'right') {
      rect(g, x - 4, y - 10, 1, 6, look.stripe);
      rect(g, x + 3, y - 10, 1, 6, look.stripe);
    }

    // 한벌옷 치마: 허리선 아래로 넓게 퍼지는 A라인. 주름선과 진한 밑단으로 윗옷과 구분한다.
    // 걸을 때는 밑단의 주름 위치만 한 칸씩 바뀌어 흔들려 보인다.
    if (look.skirt) {
      const lo = look.skirtLo || look.skirt;
      rect(g, x - 5, y - 5, 10, 1, PAL.outline);
      rect(g, x - 6, y - 4, 12, 1, PAL.outline);
      rect(g, x - 7, y - 3, 14, 2, PAL.outline);
      rect(g, x - 4, y - 6, 8, 1, lo);              // 허리선
      rect(g, x - 4, y - 5, 8, 1, look.skirt);
      rect(g, x - 5, y - 4, 10, 1, look.skirt);
      rect(g, x - 6, y - 3, 12, 1, look.skirt);
      rect(g, x - 6, y - 2, 12, 1, lo);             // 밑단
      const s = frame === 1 ? -1 : frame === 2 ? 1 : 0;
      for (const dx of [-3, 0, 3]) rect(g, x + dx + s, y - 3, 1, 1, lo);
      rect(g, x - 2, y - 4, 1, 1, lo);
      rect(g, x + 1, y - 4, 1, 1, lo);
      // 밑단 아래로 신발만 살짝 보인다
      rect(g, x - 3, y - 1, 2, 1, shoe);
      rect(g, x + 1, y - 1, 2, 1, shoe);
    }

    // 팔(반지는 손끝 금색 점)
    if (dir === 'left' || dir === 'right') {
      const ay = y - 9 + (frame ? 1 : 0);
      rect(g, x - 1, ay, 2, 4, look.shirtLo || look.shirt);
      rect(g, x - 1, ay + 3, 2, 1, PAL.skin);
      if (look.ring) rect(g, x, ay + 3, 1, 1, look.ring);
    } else {
      rect(g, x - 5, y - 9, 1, 4, PAL.skin);
      rect(g, x + 4, y - 9, 1, 4, PAL.skin);
      if (look.ring) rect(g, x + 4, y - 6, 1, 1, look.ring);
    }

    // 상점 주인 앞치마
    if (look.apron && dir !== 'up') {
      rect(g, x - 3, y - 9, 6, 6, look.apron);
      rect(g, x - 1, y - 7, 2, 1, PAL.paper);
    }

    // 머리카락·눈. 숙일수록 정수리(머리카락)가 더 보이고, 끝까지 숙이면 눈이 안 보인다.
    const hy = y - 17 + bow;
    const hair = look.hair;
    const crownRows = 2 + bow;
    if (dir === 'up') {
      rect(g, cx - 4, hy, 8, 6, hair);
      rect(g, cx - 4, hy + 3, 1, 2, PAL.skin);
      rect(g, cx + 3, hy + 3, 1, 2, PAL.skin);
    } else if (dir === 'down') {
      rect(g, cx - 4, hy, 8, crownRows, hair);
      rect(g, cx - 4, hy + 2, 1, 2, hair);
      rect(g, cx + 3, hy + 2, 1, 2, hair);
      if (bow < 2) {
        rect(g, cx - 2, hy + 4, 1, 1, PAL.eye);
        rect(g, cx + 1, hy + 4, 1, 1, PAL.eye);
      }
    } else {
      const s = dir === 'left' ? 1 : -1;
      rect(g, cx - 4, hy, 8, crownRows, hair);
      rect(g, s > 0 ? cx : cx - 4, hy + 2, 4, 3, hair);
      if (bow < 2) rect(g, cx - 3 * s - (s < 0 ? 1 : 0), hy + 4, 1, 1, PAL.eye);
    }

    // 귀걸이: 귀 바로 아래 금색 점. 옆모습이면 보이는 쪽 귀에만.
    if (look.earring) {
      if (dir === 'left') rect(g, cx + 4, hy + 5, 1, 1, look.earring);
      else if (dir === 'right') rect(g, cx - 5, hy + 5, 1, 1, look.earring);
      else {
        rect(g, cx - 5, hy + 5, 1, 1, look.earring);
        rect(g, cx + 4, hy + 5, 1, 1, look.earring);
      }
    }

    drawHeadwear(g, cx, hy, look, dir);
  }

  // 머리에 쓰는 것. x 는 머리 가운데(머리는 x-4 ~ x+3), hy 는 머리 꼭대기 줄.
  // 서 있는 사람과 앉은 뒷모습(dir 'up')이 함께 쓴다.
  function drawHeadwear(g, x, hy, look, dir) {
    if (look.cap) {
      rect(g, x - 5, hy - 2, 10, 4, PAL.outline);
      rect(g, x - 4, hy - 1, 8, 3, look.cap);
      if (look.fedora) {
        // 중절모: 사방으로 넓은 챙과 띠
        rect(g, x - 7, hy + 1, 14, 2, PAL.outline);
        rect(g, x - 6, hy + 1, 12, 1, look.capLo);
        rect(g, x - 4, hy, 8, 1, look.fedora);
      } else if (dir === 'down') {
        rect(g, x - 4, hy + 2, 8, 1, look.capLo);
        if (look.capMark === 'up') {
          rect(g, x - 1, hy - 1, 2, 1, '#ffffff');
          rect(g, x - 2, hy, 4, 1, '#ffffff');
        } else if (look.capMark === 'down') {
          rect(g, x - 2, hy - 1, 4, 1, '#ffffff');
          rect(g, x - 1, hy, 2, 1, '#ffffff');
        } else {
          rect(g, x - 1, hy, 2, 1, '#ffffff');
        }
      } else if (dir === 'left') {
        rect(g, x - 7, hy + 1, 3, 1, look.capLo);
        if (look.capMark) rect(g, x - 3, hy, 1, 1, '#ffffff');
      } else if (dir === 'right') {
        rect(g, x + 4, hy + 1, 3, 1, look.capLo);
        if (look.capMark) rect(g, x + 2, hy, 1, 1, '#ffffff');
      }
    }

    if (look.crown) {
      // 세 봉우리 왕관과 가운데 보석
      for (const [ox, oy, w, h] of [[-5, -4, 3, 4], [-2, -5, 4, 5], [2, -4, 3, 4], [-5, -2, 10, 3]]) {
        rect(g, x + ox, hy + oy, w, h, PAL.outline);
      }
      rect(g, x - 4, hy - 3, 1, 2, look.crown);
      rect(g, x - 1, hy - 4, 2, 3, look.crown);
      rect(g, x + 3, hy - 3, 1, 2, look.crown);
      rect(g, x - 4, hy - 1, 8, 1, look.crown);
      if (dir !== 'up') rect(g, x - 1, hy - 1, 2, 1, '#e0404a');
    }

    // 황소 뿔: 모자 옆에 붙어서 바깥으로 나갔다가 위로 휘어 오른다
    if (look.horns) {
      rect(g, x - 8, hy - 1, 4, 3, PAL.outline);
      rect(g, x - 9, hy - 4, 3, 4, PAL.outline);
      rect(g, x + 4, hy - 1, 4, 3, PAL.outline);
      rect(g, x + 6, hy - 4, 3, 4, PAL.outline);
      rect(g, x - 7, hy, 2, 1, look.horns);
      rect(g, x - 8, hy - 3, 1, 3, look.horns);
      rect(g, x + 5, hy, 2, 1, look.horns);
      rect(g, x + 7, hy - 3, 1, 3, look.horns);
    }

    // 곰 귀: 머리 위 양쪽의 동그란 귀
    if (look.bearEars) {
      rect(g, x - 6, hy - 4, 4, 4, PAL.outline);
      rect(g, x + 2, hy - 4, 4, 4, PAL.outline);
      rect(g, x - 5, hy - 3, 2, 2, look.bearEars);
      rect(g, x + 3, hy - 3, 2, 2, look.bearEars);
      if (dir !== 'up') {
        rect(g, x - 4, hy - 2, 1, 1, '#e8a0a0');
        rect(g, x + 3, hy - 2, 1, 1, '#e8a0a0');
      }
    }
  }

  // 흰 포메라니안(옆모습, 오른쪽을 보는 그림). 등 위로 말린 복슬 꼬리, 짧은 다리.
  //   o 외곽선  w 털  s 배 그늘  n 눈·코  t/T 꼬리 외곽선/털(흔들 때 좌우로 한 칸씩)
  // 다리는 걷기 동작에 따라 따로 그린다.
  const DOG_ROWS = [
    '                    ',
    '    ttt     o o     ',
    '   tTTTt   owowo    ',
    '   owwwwoooowwwwo   ',
    '    owwwwwwwwwwnwo  ',
    '   owwwwwwwwwwwwwno ',
    '   owwwwwwwwwwwwwo  ',
    '   owwwwwwwwwwwwo   ',
    '    osssssssssso    '
  ];
  const DOG_COL = { o: PAL.outline, t: PAL.outline, w: '#f7f6f1', T: '#f7f6f1', s: '#d9d6cc', n: '#2a1d18' };
  const DOG_LEGS = [5, 12];       // 뒷다리·앞다리 왼쪽 칸
  const DOG_CX = 10;              // 그림에서 발끝 가운데가 되는 칸

  // (x, y) 는 발끝 가운데, dir 은 'left' | 'right'. frame 은 걷기 동작(0 정지, 1·2 번갈아 다리 들기),
  // wag 는 꼬리 흔들기(0/1).
  function drawDog(g, x, y, dir, frame, wag) {
    const flip = dir === 'left';
    // 그림 칸 (col, row) 을 화면 좌표로. 왼쪽을 보면 좌우를 뒤집는다.
    const px = (col) => flip ? x + (DOG_CX - 1 - col) : x - DOG_CX + col;
    const top = y - 11;
    const dot = (col, row, c) => rect(g, px(col), top + row, 1, 1, c);

    rect(g, x - 6, y, 12, 1, 'rgba(0,0,0,0.18)');
    DOG_ROWS.forEach((row, ry) => {
      for (let cx = 0; cx < row.length; cx++) {
        const ch = row[cx];
        const c = DOG_COL[ch];
        if (!c) continue;
        // 꼬리는 흔들 때 몸 바깥쪽(뒤쪽)으로 한 칸 밀린다
        dot(ch === 't' || ch === 'T' ? cx - wag : cx, ry, c);
      }
    });
    // 다리: 정지면 둘 다 디디고, 걸을 때는 frame 에 따라 앞·뒤 다리가 번갈아 들린다
    DOG_LEGS.forEach((lx, i) => {
      const lifted = (frame === 1 && i === 1) || (frame === 2 && i === 0);
      if (lifted) {
        for (let k = 0; k < 3; k++) dot(lx + k, 9, PAL.outline);
      } else {
        dot(lx, 9, PAL.outline); dot(lx + 1, 9, '#d9d6cc'); dot(lx + 2, 9, PAL.outline);
        for (let k = 0; k < 3; k++) dot(lx + k, 10, PAL.outline);
      }
    });
    // 걸을 때는 혀가 살짝 보인다
    if (frame) dot(16, 6, '#e8707a');
  }

  // 의자에 앉은 뒷모습: 머리만 등받이 위로 보인다
  // 꾸벅 인사하면 머리가 등받이 쪽으로 내려가 일부가 등받이에 가려진다
  function drawSeated(g, x, y, look, tilt, pose) {
    const hx = x + 3 + tilt;
    const hy = y - 6 + (pose && pose.bow ? pose.bow : 0);
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
    if (look.earring) {
      rect(g, hx - 1, hy + 5, 1, 1, look.earring);
      rect(g, hx + 8, hy + 5, 1, 1, look.earring);
    }
    drawHeadwear(g, hx + 4, hy, look, 'up');
  }

  // 앉을 수 있는 의자·말 걸 수 있는 사람 위에 띄우는 작은 화살표. (x, top) 은 화살표 끝 바로 위.
  function drawMarker(g, x, top, t) {
    const y = top + (Math.floor(t * 3) % 2);
    rect(g, x - 3, y, 7, 1, PAL.outline);
    rect(g, x - 2, y + 1, 5, 1, PAL.signEdge);
    rect(g, x - 1, y + 2, 3, 1, PAL.signEdge);
    rect(g, x, y + 3, 1, 1, PAL.outline);
  }

  // ---------- 장면 ----------

  // 지금 서 있는 장소. createScene 이 정한다.
  let area = EXCHANGE;

  function inside(r, x, y) {
    return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
  }

  function hits(x, y) {
    if (!area.walk.some(r => inside(r, x, y))) return true;
    for (const b of area.blocks) {
      if (x + 3 > b.x && x - 3 < b.x + b.w && y > b.y && y - 2 < b.y + b.h) return true;
    }
    return false;
  }


  // 한 축씩 이동해 벽에 비스듬히 부딪혀도 미끄러지듯 움직이게 한다
  // 한 걸음이 벽을 넘으면 걸음을 반씩 줄여 다시 본다. 프레임이 느려 한 걸음이 길어져도
  // 벽(출구가 있는 화면 끝 포함) 바로 앞까지는 붙어 설 수 있게 한다.
  function stepAxis(p, dx, dy) {
    for (let k = 0; k < 4; k++) {
      if (!hits(p.x + dx, p.y + dy)) { p.x += dx; p.y += dy; return true; }
      dx /= 2;
      dy /= 2;
    }
    return false;
  }

  function moveBy(p, dx, dy) {
    let moved = false;
    if (dx && stepAxis(p, dx, 0)) moved = true;
    if (dy && stepAxis(p, 0, dy)) moved = true;
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

    // 장소마다 배경은 처음 한 번만 그린다
    const areas = { exchange: Object.assign({ bg }, EXCHANGE) };
    for (const [id, place] of Object.entries(PX.places || {})) {
      areas[id] = Object.assign({ bg: place.paint() }, place);
    }
    area = areas.exchange;

    // 의자 번호(index)는 서버와 같은 순서(줄 → 칸)로 매긴다. occupant 는 앉은 사람 객체.
    const statics = [];
    const seats = [];
    for (const cy of CHAIR_ROWS) {
      for (const cx of CHAIR_COLS) {
        seats.push({ x: cx, y: cy, index: seats.length, occupant: null });
        statics.push({ key: cy + CHAIR_H, draw: () => g.drawImage(chairImg, cx, cy) });
      }
    }

    // 내 캐릭터. 서버에서 입장 확인(welcome)을 받기 전에는 화면에 없다.
    const player = {
      active: false,
      look: { hair: '#2a2220', shirt: '#3a5bbf', shirtLo: '#2c4596', pants: '#3a3a48' },
      x: 160, y: 172, dir: 'up', frame: 0, anim: 0, route: null, moving: false,
      seat: null, standAt: null, map: 'exchange'
    };

    // 다른 접속자. 서버가 0.1초마다 보내는 위치(tx, ty)를 향해 부드럽게 따라간다.
    const remotes = new Map();

    // 강아지. 움직임과 주인은 서버가 정하고, 화면은 받은 위치를 사람처럼 부드럽게 따라간다.
    // map 은 강아지가 있는 장소로, 나와 같은 장소일 때만 그린다.
    const dog = { active: false, map: 'exchange', x: 160, y: 150, tx: 160, ty: 150, dir: 'left', moving: false, owner: null, frame: 0, anim: 0 };
    const dogHere = () => dog.active && dog.map === player.map;

    // 상점 주인. 모든 접속자에게 같은 자리에 보이는 고정 NPC 라 서버와 주고받지 않는다.
    const shopkeeper = {
      name: '상점 주인',
      look: { hair: '#8c8c8c', shirt: '#d8c79a', shirtLo: '#b8a779', pants: '#4a4a55', apron: '#6b3f22' },
      x: SHOPKEEPER.x, y: SHOPKEEPER.y, dir: 'down', frame: 0
    };

    // main.js 가 서버로 보내거나 창을 열 수 있게 앉기·일어나기·말 걸기·장소 이동을 알려준다
    const hooks = { onSit() {}, onStand() {}, onTalk() {}, onGo() {} };

    const inExchange = () => player.map === 'exchange';

    // 나와 같은 장소에 있는 다른 접속자
    function nearby() {
      const list = [];
      for (const r of remotes.values()) if (r.map === player.map) list.push(r);
      return list;
    }

    // 장소를 옮기면 화면이 잠깐 어두웠다 밝아진다
    const FADE_S = 0.3;
    let fade = 0;

    function enter(id, spawn) {
      area = areas[id];
      player.map = id;
      player.x = spawn.x;
      player.y = spawn.y;
      player.dir = spawn.dir;
      player.route = null;
      fade = FADE_S;
      hooks.onGo(id, player.x, player.y, player.dir);
    }

    // 대화창·상점 창이 열려 있는 동안에는 캐릭터 조작을 막는다
    let locked = false;

    const keys = new Set();
    const KEYMAP = { ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down', ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right' };

    // ---------- 앉기 ----------

    const DIRV = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };

    // 바라보는 방향으로 한 발 앞을 찍어 보고, 거기 닿는 빈 의자를 고른다.
    // 등받이 뒤·옆·앞 어느 쪽에서든 의자에 붙어 바라보면 앉을 수 있다.
    function seatFacing() {
      if (!inExchange()) return null;
      const [dx, dy] = DIRV[player.dir];
      // 걸음이 1.8px 단위라 붙어 서도 1~2px 떨어질 수 있어 옆쪽은 조금 더 멀리 본다
      const px = player.x + dx * 10;
      const py = player.y - 2 + dy * 6;
      return seats.find(s => !s.occupant
        && px >= s.x && px < s.x + CHAIR_W
        && py >= s.y && py < s.y + CHAIR_H + 3) || null;
    }

    // 서버 확인을 기다리지 않고 먼저 앉는다. 다른 사람이 먼저 앉았으면 서버가 sitDenied 를 보내 되돌린다.
    function sit(seat) {
      seat.occupant = player;
      // 일어날 때 앉기 전 자리로 돌아오게 기억해 둔다
      player.standAt = { x: player.x, y: player.y, dir: player.dir };
      player.seat = seat;
      player.route = null;
      player.moving = false;
      player.dir = 'up';
      animate(player, false, 0);
      hooks.onSit(seat.index);
    }

    function stand(silent) {
      if (player.seat.occupant === player) player.seat.occupant = null;
      player.x = player.standAt.x;
      player.y = player.standAt.y;
      player.dir = player.standAt.dir;
      player.seat = null;
      if (!silent) hooks.onStand(player.x, player.y, player.dir);
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
      if (!area.aisle || lineFree(player.x, player.y, tx, ty)) return [{ x: tx, y: ty }];
      return [{ x: area.aisle, y: player.y }, { x: area.aisle, y: ty }, { x: tx, y: ty }];
    }

    // 상점 주인을 바라보며 붙어 서 있는지. 의자와 같은 방식으로 한 발 앞을 찍어 본다.
    function shopFacing() {
      if (player.seat || !inExchange()) return false;
      const [dx, dy] = DIRV[player.dir];
      const px = player.x + dx * 10;
      const py = player.y - 2 + dy * 6;
      return px >= SHOPKEEPER.x - 6 && px <= SHOPKEEPER.x + 6
        && py >= SHOPKEEPER.y - 12 && py <= SHOPKEEPER.y + 4;
    }

    const OPPOSITE = { up: 'down', down: 'up', left: 'right', right: 'left' };

    // Space 하나로 말 걸기·앉기·일어나기를 모두 한다. 사람이 의자보다 우선.
    function act() {
      if (player.seat) { stand(); return; }
      if (shopFacing()) {
        shopkeeper.dir = OPPOSITE[player.dir];
        hooks.onTalk();
        return;
      }
      const seat = seatFacing();
      if (seat) sit(seat);
    }

    // 채팅 입력창에서 친 Space·방향키·WASD 가 캐릭터를 움직이면 안 된다
    function isTyping(e) {
      const t = e.target;
      return t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
    }

    window.addEventListener('keydown', (e) => {
      if (isTyping(e) || !player.active || locked) return;
      if (e.code === 'Space') {
        if (!e.repeat) act();
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
      if (!player.active || locked) return;
      // 착석 화면은 좌표계가 달라서, 아래 띠를 누르면 일어나기만 한다
      if (player.seat) { stand(); return; }
      if (area.floorY && y < area.floorY) return;
      player.route = routeTo(Math.round(x), Math.round(y));
    });

    const PLAYER_SPEED = 55;

    function updatePlayer(dt) {
      player.moving = false;
      if (!player.active || player.seat) return;
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
          player.moving = true;
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
      player.moving = moved;
      animate(player, moved, dt);

      const exit = moved && area.exits.find(e => inside(e, player.x, player.y));
      if (exit) enter(exit.to, exit.spawn);
    }

    // 서버 위치는 0.1초 간격이라, 그 사이를 걷는 속도로 채워 끊겨 보이지 않게 한다.
    // 너무 멀면(순간이동·재접속) 바로 옮긴다.
    const REMOTE_SPEED = 66;
    function updateRemote(r, dt) {
      if (r.seat) return;
      const dx = r.tx - r.x, dy = r.ty - r.y;
      const dist = Math.hypot(dx, dy);
      const step = REMOTE_SPEED * dt;
      if (dist > 40 || dist <= step) {
        r.x = r.tx;
        r.y = r.ty;
      } else {
        r.x += dx / dist * step;
        r.y += dy / dist * step;
      }
      animate(r, r.moving || dist > 0.5, dt);
    }

    function update(dt) {
      fade = Math.max(0, fade - dt);
      updatePlayer(dt);
      for (const r of remotes.values()) updateRemote(r, dt);
      if (dog.active) updateRemote(dog, dt);
    }

    function render() {
      const now = new Date();
      g.drawImage(area.bg, 0, 0);

      const list = inExchange() ? statics.slice() : [];
      const nowMs = performance.now();
      const people = nearby();
      if (player.active) people.push(player);
      if (inExchange()) people.push(shopkeeper);
      // 장소가 따로 그릴 것(경마장의 말 등)을 사람과 같은 깊이 순서에 끼워 넣는다
      if (area.decorate) area.decorate(list, g, now.getTime() / 1000);
      for (const p of people) {
        if (p.seat) {
          const s = p.seat;
          list.push({ key: s.y + CHAIR_H - 0.5, draw: () => drawSeated(g, s.x, s.y, p.look, 0, poseOf(p, nowMs)) });
          continue;
        }
        const px = Math.round(p.x), py = Math.round(p.y);
        list.push({ key: py, draw: () => drawPerson(g, px, py, p.look, p.dir, p.frame, poseOf(p, nowMs)) });
      }
      if (dogHere()) {
        const dx = Math.round(dog.x), dy = Math.round(dog.y);
        // 주인이 있으면 꼬리를 빨리 흔든다
        const wag = Math.floor(nowMs / (dog.owner ? 150 : 450)) % 2;
        list.push({ key: dy, draw: () => drawDog(g, dx, dy, dog.dir, dog.frame, wag) });
      }
      list.sort((a, b) => a.key - b.key);
      for (const it of list) it.draw();

      const t = now.getTime() / 1000;
      if (!locked && player.active && shopFacing()) drawMarker(g, SHOPKEEPER.x, SHOPKEEPER.y - 25, t);
      else {
        const near = player.seat ? null : seatFacing();
        if (near) drawMarker(g, near.x + 7, near.y - 13, t);
      }

      if (player.seat) composeSeated(player.seat);
      else screen.drawImage(world, 0, 0);
      if (fade > 0) {
        screen.fillStyle = `rgba(0,0,0,${(fade / FADE_S).toFixed(2)})`;
        screen.fillRect(0, 0, W, H);
      }
    }

    // 착석 띠: 내 자리를 가운데 두고 같은 줄 의자 등받이와 뒤통수만 확대해 보여준다
    const ST = C.seatedStrip;
    const strip = makeCanvas(W / ST.zoom, ST.h / ST.zoom);

    function composeSeated(seat) {
      const sg = strip.g;
      const sw = strip.c.width;
      const sh = strip.c.height;
      const sx = Math.round(Math.max(0, Math.min(W - sw, seat.x + CHAIR_W / 2 - sw / 2)));
      stripSx = sx;
      // 모자 꼭대기가 띠 맨 위, 등받이 윗부분이 띠 맨 아래에 오게 맞춘다
      const oy = 8 - seat.y;

      rect(sg, 0, 0, sw, sh, PAL.ceiling);
      // 앞사람을 먼저 그려 내 줄 사람·의자 뒤로 지나가게 한다
      drawFront(sg, seat, sx, sw);
      for (const s of seats) {
        if (s.y !== seat.y || s.x + CHAIR_W < sx || s.x > sx + sw) continue;
        const x = s.x - sx;
        const y = s.y + oy;
        if (s.occupant) drawSeated(sg, x, y, s.occupant.look, 0, poseOf(s.occupant, performance.now()));
        sg.drawImage(chairImg, x, y);
      }

      screen.drawImage(seatedBg, 0, 0);
      screen.drawImage(strip.c, 0, ST.y, W, ST.h);
    }

    // 나와 전광판 사이에 있는 사람(앞줄에 앉았거나 앞쪽에 서 있는 사람)을 내 줄과 같은 높이·크기로 그린다.
    // 원근 없이 머리 위치를 내 줄에 앉은 사람과 맞추므로, 내 줄 사람이 앉은 자리에서는 가려진다.
    function drawFront(sg, seat, sx, sw) {
      const list = [];
      for (const p of [shopkeeper, ...nearby()]) {
        if (!inFrontOf(seat, p)) continue;
        const x = Math.round(worldX(p) - sx);
        if (x < -8 || x > sw + 8) continue;
        list.push({ p, x, key: p.seat ? p.seat.y + CHAIR_H : p.y });
      }
      // 먼 사람부터 그려 가까운 사람이 위에 오게 한다
      list.sort((a, b) => a.key - b.key);
      for (const { p, x } of list) {
        // 띠 안에서 머리 꼭대기가 2번째 줄에 오게 맞춘다(내 줄에 앉은 머리와 같은 높이)
        const pose = poseOf(p, performance.now());
        if (p.seat) drawSeated(sg, x - CHAIR_W / 2, 8, p.look, 0, pose);
        else drawPerson(sg, x, 19, p.look, p.dir, p.frame, pose);
      }
    }

    function inFrontOf(seat, p) {
      if (p === player) return false;
      if (p.seat) return p.seat.y < seat.y;
      // 내 줄 등받이 바로 앞 틈까지가 '앞'. 내 뒤(관람자 쪽)에 선 사람은 보이지 않는다.
      return p.y <= seat.y + 4;
    }

    function worldX(p) {
      return p.seat ? p.seat.x + CHAIR_W / 2 : p.x;
    }

    // 안내 문구용 현재 상태: 'seated' | 'talk' | 'near' | 'free'
    function prompt() {
      if (player.seat) return 'seated';
      if (shopFacing()) return 'talk';
      return seatFacing() ? 'near' : 'free';
    }

    // 말풍선·닉네임이 붙을 머리 위 지점(화면 논리 좌표). 화면에 안 보이면 null.
    //   who: 'me', 'shop'(상점 주인) 또는 접속자 id
    let stripSx = 0;
    function anchor(who) {
      // 강아지는 키가 작아 앉은 화면 띠에는 그리지 않는다
      if (who === 'dog') return dogHere() && !player.seat ? { x: dog.x, y: dog.y - 12 } : null;
      const p = who === 'shop' ? (inExchange() ? shopkeeper : null)
        : who === 'me' ? (player.active ? player : null)
        : remotes.get(who);
      if (!p || (p.map && p.map !== player.map)) return null;
      if (player.seat) {
        // 착석 화면 아래 띠에는 내 줄 사람과 내 앞사람이 같은 높이로 보인다
        if (!inFrontOf(player.seat, p) && (!p.seat || p.seat.y !== player.seat.y)) return null;
        const x = (worldX(p) - stripSx) * ST.zoom;
        if (x < 0 || x > W) return null;
        return { x, y: ST.y - 1 };
      }
      if (p.seat) return { x: p.seat.x + CHAIR_W / 2, y: p.seat.y - 9 };
      return { x: p.x, y: p.y - 19 };
    }

    function releaseKeys() {
      keys.clear();
    }

    // ---------- 서버 동기화 ----------

    function occupy(r, index) {
      const seat = seats[index];
      if (!seat) return;
      // 내가 먼저 앉은 줄 알았는데 서버가 다른 사람에게 줬으면 내가 비킨다
      if (seat.occupant === player) stand(true);
      seat.occupant = r;
      r.seat = seat;
      r.moving = false;
    }

    function vacate(r) {
      if (r.seat && r.seat.occupant === r) r.seat.occupant = null;
      r.seat = null;
    }

    function setEquip(p, ids) {
      p.equip = Array.isArray(ids) ? ids.slice() : [];
      p.look = PX.items.applyEquip(p.baseLook || p.look, p.equip);
    }

    const net = {
      // 입장 확인. 재접속일 수도 있으므로 다른 사람·의자 상태를 모두 새로 받는다.
      welcome(me, users) {
        for (const s of seats) s.occupant = null;
        remotes.clear();
        const map = areas[me.map] ? me.map : 'exchange';
        Object.assign(player, { active: true, x: me.x, y: me.y, dir: me.dir, seat: null, route: null, map });
        area = areas[map];
        // 외형 = 서버가 정한 기본 외형 + 착용 아이템
        player.baseLook = me.look;
        setEquip(player, me.equip);
        for (const u of users) net.add(u);
      },

      equip(id, ids) {
        const r = remotes.get(id);
        if (r) setEquip(r, ids);
      },

      add(u) {
        const r = { id: u.id, name: u.name, baseLook: u.look, map: u.map || 'exchange', x: u.x, y: u.y, tx: u.x, ty: u.y, dir: u.dir, moving: !!u.moving, frame: 0, anim: 0, seat: null };
        setEquip(r, u.equip);
        remotes.set(u.id, r);
        if (u.seat != null) occupy(r, u.seat);
      },

      remove(id) {
        const r = remotes.get(id);
        if (!r) return;
        vacate(r);
        remotes.delete(id);
      },

      move(id, x, y, dir, moving) {
        const r = remotes.get(id);
        if (!r || r.seat) return;
        r.tx = x;
        r.ty = y;
        r.dir = dir;
        r.moving = !!moving;
      },

      sit(id, index) {
        const r = remotes.get(id);
        if (r) occupy(r, index);
      },

      stand(id, x, y, dir) {
        const r = remotes.get(id);
        if (!r) return;
        vacate(r);
        r.x = r.tx = x;
        r.y = r.ty = y;
        r.dir = dir;
      },

      // 다른 사람이 장소를 옮겼다. 다른 장소에 있는 사람은 그리지 않는다.
      go(id, map, x, y, dir) {
        const r = remotes.get(id);
        if (!r) return;
        vacate(r);
        r.map = map;
        r.x = r.tx = x;
        r.y = r.ty = y;
        r.dir = dir;
      },

      // 서버가 앉기를 거절했을 때(다른 사람이 먼저 앉음)
      sitDenied() {
        if (player.seat) stand(true);
      },

      names() {
        return [...remotes.values()].map(r => [r.id, r.name]);
      },

      // 강아지 상태. 처음 받을 때와 장소를 옮겼을 때는 그 자리에 바로 놓는다. 반환값: 주인이 바뀌었는지.
      dog(d) {
        if (!d) return false;
        const changed = d.owner !== dog.owner;
        const map = d.map || 'exchange';
        if (!dog.active || map !== dog.map) {
          dog.x = d.x;
          dog.y = d.y;
          dog.map = map;
          dog.active = true;
        }
        dog.tx = d.x;
        dog.ty = d.y;
        dog.dir = d.dir;
        dog.moving = !!d.moving;
        dog.owner = d.owner;
        return changed;
      },

      get count() {
        return remotes.size + (player.active ? 1 : 0);
      }
    };

    function setLocked(v) {
      locked = v;
      keys.clear();
      player.route = null;
      // 대화가 끝나면 상점 주인은 다시 정면을 본다
      if (!v) shopkeeper.dir = 'down';
    }

    // 인벤토리에서 갈아입었을 때. 입장 전이면 기본 외형이 없으니 목록만 기억해 둔다.
    function setMyEquip(ids) {
      if (player.baseLook) setEquip(player, ids);
      else player.equip = ids.slice();
    }

    // ---------- 감정표현 ----------

    // 꾸벅 인사 순서: 반쯤 숙임 → 끝까지 숙여 잠시 멈춤 → 반쯤 → 바로 섬
    const EMOTE_MS = { bow: 1400 };
    const BOW_STEPS = [[150, 1], [950, 2], [1150, 1]];

    // who: 'me' 또는 접속자 id. 같은 사람이 다시 하면 처음부터 다시 한다.
    function playEmote(who, type) {
      const p = who === 'me' ? player : remotes.get(who);
      if (!p || !EMOTE_MS[type]) return;
      const now = performance.now();
      p.emote = { type, start: now, until: now + EMOTE_MS[type] };
    }

    function poseOf(p, now) {
      const e = p.emote;
      if (!e || now >= e.until) return null;
      if (e.type === 'bow') {
        const t = now - e.start;
        const step = BOW_STEPS.find(([end]) => t < end);
        return step ? { bow: step[1] } : null;
      }
      return null;
    }

    return {
      update, render, prompt, anchor, releaseKeys, setLocked, setMyEquip, playEmote, player, hooks, net,
      shopkeeperName: shopkeeper.name,
      get map() { return player.map; },
      get seatedView() { return !!player.seat; }
    };
  }

  // 인벤토리 미리보기가 같은 그림을 쓰도록 내보낸다
  PX.sprites = { drawPerson, drawDog };

  PX.createScene = createScene;
})();
