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
  // 출구에 slide 가 있으면 어두워지는 대신 옛 게임처럼 화면이 그쪽으로 밀리며 옆 장소로 넘어간다.
  // spawn.y 가 없으면 들어온 높이 그대로 옆 장소 가장자리에서 시작한다.
  // 객장·코인 거래소·미국 증시는 옆으로 이어진 고리다: 객장 → 오른쪽 코인 → 오른쪽 미장 → 오른쪽 다시 객장.
  // 객장 양 끝 출구는 화분·상점 주인 아래쪽 통로에만 둔다. 객장으로 들어오는 출구도 같은 높이로 맞춰
  // 들어오자마자 화분·상점 주인에 갇히지 않게 한다.
  const EDGE_Y = SHOPKEEPER.y + 2;
  const toExchange = (side) => side === 'left'
    ? { x: 0, y: EDGE_Y, w: 3, h: H - EDGE_Y, to: 'exchange', spawn: { x: W - 10, dir: 'left' }, slide: 'left' }
    : { x: W - 5, y: EDGE_Y, w: 5, h: H - EDGE_Y, to: 'exchange', spawn: { x: 8, dir: 'right' }, slide: 'right' };
  const EXCHANGE = {
    walk: [{ x: 4, y: 120, w: W - 8, h: H - 121 }],
    blocks: BLOCKS,
    exits: [
      { x: CARPET_X, y: H - 2, w: CARPET_W, h: 2, to: 'crossroad', spawn: { x: 160, y: 26, dir: 'down' } },
      { x: 0, y: EDGE_Y, w: 5, h: H - EDGE_Y, to: 'us', spawn: { x: W - 10, dir: 'left' }, slide: 'left' },
      { x: W - 5, y: EDGE_Y, w: 5, h: H - EDGE_Y, to: 'coin', spawn: { x: 8, dir: 'right' }, slide: 'right' }
    ],
    aisle: AISLE_X,
    floorY: FLOOR_Y
  };

  // 코인 거래소·미국 증시: 객장과 같은 방에 전광판(DOM)만 있다
  const sideRoom = (left, right) => ({
    walk: [{ x: 2, y: 120, w: W - 6, h: H - 121 }],
    blocks: [],
    exits: [left, right],
    floorY: FLOOR_Y
  });
  const COIN = sideRoom(
    toExchange('left'),
    { x: W - 5, y: 120, w: 5, h: H - 120, to: 'us', spawn: { x: 8, dir: 'right' }, slide: 'right' }
  );
  const US = sideRoom(
    { x: 0, y: 120, w: 3, h: H - 120, to: 'coin', spawn: { x: W - 10, dir: 'left' }, slide: 'left' },
    toExchange('right')
  );

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

  // side 면 코인 거래소·미국 증시: 벽·간판·전광판 틀·바닥은 객장과 같고 카펫·화분이 없다
  function paintBackground(side) {
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
    if (side) return c;

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
  //       { fall: 'left'|'right' } 는 말발굽에 차여 그쪽으로 넘어져 누운 모습.
  function drawPerson(g, x, y, look, dir, frame, pose, noShadow) {
    if (pose && pose.fall) { drawFallen(g, x, y, look, pose.fall); return; }
    if (!noShadow) rect(g, x - 4, y - 1, 8, 2, 'rgba(0,0,0,0.18)');

    const lUp = frame === 1 ? 1 : 0;
    const rUp = frame === 2 ? 1 : 0;
    // 꾸벅 인사: 머리가 몸 쪽으로 내려오고(어깨를 덮는다), 옆모습이면 끝까지 숙일 때 앞으로 한 칸 나간다
    const bow = pose && pose.bow ? pose.bow : 0;
    const lean = bow === 2 ? (dir === 'left' ? -1 : dir === 'right' ? 1 : 0) : 0;
    const cx = x + lean;
    // 키 14칸: 머리 6(y-15 ~ y-10) · 몸통 5(y-9 ~ y-5) · 다리 3(y-4 ~ y-2).
    // 다리 바깥 테두리가 상의 양 끝선(x-4, x+3)에 오도록 두 칸 폭 다리 사이에 두 칸을 비운다
    const p = [
      [x - 3, y - 4, 2, 3 - lUp, look.pants],
      [x + 1, y - 4, 2, 3 - rUp, look.pants],
      [x - 4, y - 9, 8, 5, look.shirt],
      [cx - 4, y - 15 + bow, 8, 6, PAL.skin]
    ];
    parts(g, p);

    // 하의 무늬: 반바지(무릎 아래 맨살), 체크
    if (look.shorts) {
      rect(g, x - 3, y - 3, 2, 1, PAL.skin);
      rect(g, x + 1, y - 3, 2, 1, PAL.skin);
    }
    if (look.check) {
      rect(g, x - 3, y - 4, 1, 1, look.check);
      rect(g, x - 2, y - 3, 1, 1, look.check);
      rect(g, x + 1, y - 3, 1, 1, look.check);
      rect(g, x + 2, y - 4, 1, 1, look.check);
    }
    if (look.stripe) {
      rect(g, x - 3, y - 4, 1, 2, look.stripe);
      rect(g, x + 2, y - 4, 1, 2, look.stripe);
    }

    const shoe = look.shoes || PAL.shoe;
    rect(g, x - 3, y - 2 - lUp, 2, 1, shoe);
    rect(g, x + 1, y - 2 - rUp, 2, 1, shoe);
    // 슬리퍼는 발가락이 보인다
    if (look.slipper) {
      rect(g, x - 2, y - 2 - lUp, 1, 1, PAL.skin);
      rect(g, x + 1, y - 2 - rUp, 1, 1, PAL.skin);
    }

    // 상의 위에 덧그리는 것: 조끼, 넥타이, 가슴 무늬, 트레이닝 옆줄
    if (look.vest) {
      if (dir === 'down') {
        rect(g, x - 4, y - 9, 3, 5, look.vest);
        rect(g, x + 1, y - 9, 3, 5, look.vest);
      } else {
        rect(g, x - 4, y - 9, 8, 5, look.vest);
      }
    }
    if (look.tie && dir === 'down') {
      rect(g, x - 1, y - 9, 2, 3, look.tie);
      rect(g, x - 1, y - 6, 1, 1, look.tie);
    }
    if (look.print && dir === 'down') {
      for (const [dx, dy] of [[-3, -9], [-1, -8], [1, -9], [2, -7], [-2, -6], [0, -7]]) rect(g, x + dx, y + dy, 1, 1, look.print);
    }
    if (look.stripe && dir !== 'left' && dir !== 'right') {
      rect(g, x - 4, y - 9, 1, 5, look.stripe);
      rect(g, x + 3, y - 9, 1, 5, look.stripe);
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
      rect(g, x - 3, y - 8, 6, 5, look.apron);
      rect(g, x - 1, y - 6, 2, 1, PAL.paper);
    }

    // 머리카락·눈. 숙일수록 정수리(머리카락)가 더 보이고, 끝까지 숙이면 눈이 안 보인다.
    // 머리 6줄: 0~1 정수리, 2~3 옆머리, 4 눈, 5 턱
    const hy = y - 15 + bow;
    const hair = look.hair;
    const crownRows = 2 + bow;
    // 상점에서 산 헤어스타일. 머리 꼭대기를 덮는 모자·왕관을 쓰면 위로 솟은 머리는 눌려 안 보인다.
    if (look.hairStyle && PX.hairs.draw(g, cx, hy, look.hairStyle, dir, hair, !!(look.cap || look.crown))) {
      // 끝까지 숙이면 눈을 가린다(눈 자리는 기본 머리와 같다)
      if (bow === 2) {
        if (dir === 'down') { rect(g, cx - 2, hy + 4, 1, 1, PAL.skin); rect(g, cx + 1, hy + 4, 1, 1, PAL.skin); }
        else if (dir === 'left') rect(g, cx - 3, hy + 4, 1, 1, PAL.skin);
        else if (dir === 'right') rect(g, cx + 2, hy + 4, 1, 1, PAL.skin);
      }
    } else if (dir === 'up') {
      rect(g, cx - 4, hy, 8, 5, hair);
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

  // 넘어져 누운 사람. 선 모습(앞모습)을 따로 그려 90도 돌려 붙이므로 입은 아이템이 그대로 보인다.
  // 90도 회전은 도트가 정확히 칸에 맞아 뭉개지지 않는다. (x, y) 는 원래 발끝 자리로, 머리가 side 쪽으로 간다.
  const FALL_W = 24, FALL_H = 28;
  let fallCanvas = null;
  function drawFallen(g, x, y, look, side) {
    if (!fallCanvas) fallCanvas = makeCanvas(FALL_W, FALL_H);
    const f = fallCanvas;
    f.g.clearRect(0, 0, FALL_W, FALL_H);
    drawPerson(f.g, FALL_W / 2, FALL_H - 2, look, 'down', 0, null, true);
    const s = side === 'left' ? -1 : 1;
    // 몸이 바닥에 깔린 자리의 그림자
    rect(g, s > 0 ? x - 2 : x - 18, y - 1, 20, 2, 'rgba(0,0,0,0.18)');
    g.save();
    g.translate(x, y - 4);
    g.rotate(s * Math.PI / 2);
    g.drawImage(f.c, -FALL_W / 2, -(FALL_H - 2));
    g.restore();
    // 머리 위로 별이 돈다
    const t = Math.floor(performance.now() / 200) % 2;
    const hx = x + s * 18;
    rect(g, hx - 3 + t * 4, y - 12, 1, 1, '#ffe04a');
    rect(g, hx + 1 - t * 4, y - 14, 1, 1, '#ffe04a');
  }

  // ---------- 말 탄 사람 ----------
  // 경마장 마굿간에서 훔친 말을 탄 사람. 말은 외형(look)이 아니라 따로 그리므로
  // 아이템을 갈아입어도 옷만 바뀌고 말은 그대로다.
  const RIDE_H = 6;   // 말 등 높이. 사람은 이만큼 올라가 앉는다.
  const HORSE = { coat: '#8a5530', dark: '#5e3820', mane: '#2e1d14', saddle: '#b8302a' };

  // (x, y) 는 말 발끝 가운데. frame 은 사람과 같다(0 정지, 1·2 걸음).
  // pose.rear: 앞발차기 중. 1 은 앞발을 접어 드는 중, 2 는 앞으로 뻗어 차는 순간.
  function drawRider(g, x, y, look, dir, frame, pose) {
    const H = HORSE;
    const shoe = look.shoes || PAL.shoe;
    const rear = pose && pose.rear ? pose.rear : 0;
    rect(g, x - 9, y - 1, 18, 2, 'rgba(0,0,0,0.18)');
    if (dir === 'left' || dir === 'right') {
      const s = dir === 'right' ? 1 : -1;
      const R = (px, py, w, h, c) => rect(g, s > 0 ? x + px : x - px - w + 1, y + py, w, h, c);
      // 다리 넷: 걸을 때 앞뒤 다리가 번갈아 들린다. 앞발차기 중에는 앞다리(뒤의 둘)를 앞으로 든다.
      const up = frame === 1 ? [0, 1, 1, 0] : frame === 2 ? [1, 0, 0, 1] : [0, 0, 0, 0];
      [-6, -4, 3, 5].forEach((lx, i) => {
        if (rear && i >= 2) return;
        R(lx, -5, 1, 4 - (rear ? 0 : up[i]), H.dark);
        R(lx, -1 - (rear ? 0 : up[i]), 1, 1, PAL.outline);
      });
      if (rear) {
        const len = rear === 2 ? 4 : 2;
        for (const ly of rear === 2 ? [-8, -6] : [-7, -5]) {
          R(6, ly, len, 1, H.dark);
          R(6 + len, ly, 1, 1, PAL.outline);
        }
        // 차는 순간 발굽 앞에 번쩍
        if (rear === 2) {
          R(13, -9, 1, 1, PAL.paper);
          R(14, -7, 1, 1, '#ffe04a');
          R(13, -5, 1, 1, PAL.paper);
        }
      }
      // 몸통·목·머리(외곽선 먼저). 앞발을 들면 고개도 치켜든다.
      const body = [[-7, -10, 14, 5], [5, -14 - rear, 3, 6], [7, -16 - rear, 4, 3]];
      for (const [px, py, w, h] of body) R(px - 1, py - 1, w + 2, h + 2, PAL.outline);
      for (const [px, py, w, h] of body) R(px, py, w, h, H.coat);
      R(-7, -6, 14, 1, H.dark);
      R(5, -15 - rear, 1, 6, H.mane);
      R(9, -15 - rear, 1, 1, PAL.outline);
      R(10, -14 - rear, 1, 1, H.dark);
      R(-9, -10, 2, 1, H.mane);
      R(-10, -9, 2, 4, H.mane);
      // 사람은 말 등 위에, 안장과 늘어뜨린 다리는 그 위에 덧그린다
      drawPerson(g, x, y - RIDE_H, look, dir, 0, pose, true);
      R(-3, -10, 6, 2, H.saddle);
      R(-1, -9, 2, 3, look.pants);
      R(-1, -6, 2, 1, shoe);
      return;
    }
    // 앞모습·뒷모습: 좁은 몸통 양옆으로 사람 다리가 걸친다.
    // 앞발차기 중에는 말이 일어서듯 몸이 rear 칸만큼 올라가고 다리가 그만큼 길어진다.
    const a = rear ? 0 : frame === 1 ? 1 : 0, b = rear ? 0 : frame === 2 ? 1 : 0;
    for (const [lx, u] of [[-3, a], [2, b]]) {
      rect(g, x + lx, y - 5 - rear, 1, 4 - u + rear, H.dark);
      rect(g, x + lx, y - 1 - u, 1, 1, PAL.outline);
    }
    if (rear) {
      // 앞모습이면 차는 순간 발밑 앞쪽이 번쩍인다(치켜든 앞발굽은 맨 끝에 덧그린다)
      if (dir === 'down' && rear === 2) {
        rect(g, x - 3, y + 2, 1, 1, PAL.paper);
        rect(g, x, y + 3, 1, 1, '#ffe04a');
        rect(g, x + 3, y + 2, 1, 1, PAL.paper);
      }
      y -= rear;
    }
    parts(g, [[x - 3, y - 11, 6, 6, H.coat]]);
    drawPerson(g, x, y - RIDE_H, look, dir, 0, pose, true);
    rect(g, x - 4, y - 10, 8, 2, H.saddle);
    rect(g, x - 5, y - 10, 1, 4, look.pants);
    rect(g, x + 4, y - 10, 1, 4, look.pants);
    rect(g, x - 5, y - 6, 1, 1, shoe);
    rect(g, x + 4, y - 6, 1, 1, shoe);
    if (dir === 'down') {
      // 말 머리가 사람 앞에 온다
      parts(g, [[x - 2, y - 10, 4, 6, H.coat]]);
      rect(g, x - 2, y - 10, 4, 1, H.mane);
      rect(g, x - 2, y - 8, 1, 1, PAL.outline);
      rect(g, x + 1, y - 8, 1, 1, PAL.outline);
      rect(g, x - 1, y - 5, 2, 1, H.dark);
      // 앞발차기: 치켜든 앞발굽이 말 머리 양옆으로 나온다
      if (rear === 2) {
        rect(g, x - 4, y - 5, 2, 1, H.dark);
        rect(g, x + 2, y - 5, 2, 1, H.dark);
        rect(g, x - 4, y - 4, 2, 1, PAL.outline);
        rect(g, x + 2, y - 4, 2, 1, PAL.outline);
      }
    } else {
      // 뒷모습: 꼬리
      rect(g, x - 1, y - 9, 2, 5, H.mane);
    }
  }

  // 서 있는 사람 하나. 말을 탔으면 말과 함께 그린다.
  // look 을 주면 그 모습으로 그린다(풋살장 팀 유니폼처럼 그 자리에서만 바뀌는 옷).
  // noSmoke 면 담배만 그리고 연기는 그리지 않는다(앉은 화면 띠처럼 연기를 따로 그리는 곳).
  function drawStanding(g, x, y, p, pose, look, noSmoke) {
    if (p.rider) drawRider(g, x, y, look || p.look, p.dir, p.frame, pose);
    else drawPerson(g, x, y, look || p.look, p.dir, p.frame, pose);
    if (pose && pose.smoke != null && !p.rider) drawCig(g, x, y, p.dir, pose.smoke, noSmoke);
  }

  // ---------- 담배 ----------

  // 2초 동안 입에 문 채로 피운다(손은 움직이지 않는다). 불씨가 깜빡이고 끝에서 연기가 오르며,
  // 피울수록 담배가 짧아진다. 다 피면 scene 이 꽁초를 발 앞에 떨어뜨린다(drawButt).
  const SMOKE_MS = 2000;
  const CIG = { paper: '#f4f1e6', filter: '#d89a4a', ember: '#e8502a', emberHi: '#ffd23a', emberLo: '#a8301e' };
  const SMOKE_LIFE = 1100;

  // 사람 (x, y) 기준 담배 끝(불) 위치. left 는 right 를 좌우로 뒤집는다(x-0.5 대칭).
  // up(뒷모습)은 담배가 머리에 가려 안 보이고 연기만 머리 위로 오른다. 뒤통수·모자에 겹치지 않게 머리 꼭대기보다 두 칸 위에서 시작한다.
  // 입은 머리 맨 아래 턱 줄(y-10)이다. 앉은 사람은 머리 꼭대기가 의자 y-5 이므로 y 를 의자 y+10 으로 주면 같은 자리가 된다.
  const MOUTH_Y = -10;
  const SEATED_SMOKE_Y = 10;
  function cigAt(x, y, dir, t) {
    const len = Math.max(1, 3 - Math.floor(t / (SMOKE_MS / 3)));
    const s = dir === 'left' ? -1 : 1;
    const mx = (px) => (s > 0 ? px : 2 * x - 1 - px);
    if (dir === 'up') return { len, tip: [x - 1, y - 17], mx };
    if (dir === 'down') return { len, tip: [x + 1 + len, y + MOUTH_Y], mx: (px) => px };
    return { len, tip: [mx(x + 5 + len), y + MOUTH_Y], mx };
  }

  function drawCig(g, x, y, dir, t, noSmoke) {
    if (dir !== 'up') {
      const c = cigAt(x, y, dir, t);
      const dot = (px, py, col) => rect(g, c.mx(px), py, 1, 1, col);
      const ember = [CIG.emberHi, CIG.ember, CIG.emberLo, CIG.ember][Math.floor(t / 150) % 4];
      // 앞모습은 입에서 오른쪽으로, 옆모습은 얼굴 앞(x+4)에서 앞으로 문다
      const from = dir === 'down' ? x : x + 4;
      dot(from, y + MOUTH_Y, CIG.filter);
      for (let i = 1; i <= c.len; i++) dot(from + i, y + MOUTH_Y, CIG.paper);
      dot(from + 1 + c.len, y + MOUTH_Y, ember);
    }
    if (!noSmoke) drawSmoke(g, x, y, dir, t);
  }

  // 연기는 생긴 자리에 머물며 올라가야 하므로, 지금까지 생긴 연기 알갱이를 생긴 시각의 불 위치에서 계산해 그린다.
  // 불에서 0.2초마다 가는 연기 한 줄이 흔들리며 오르고 옅어진다.
  function drawSmoke(g, x, y, dir, t) {
    for (let born = 0; born <= t; born += 200) {
      const age = t - born;
      if (age >= SMOKE_LIFE) continue;
      const tip = cigAt(x, y, dir, born).tip;
      const a = (1 - age / SMOKE_LIFE) * 0.7;
      g.fillStyle = `rgba(225,225,228,${a.toFixed(2)})`;
      g.fillRect(Math.round(tip[0] + Math.sin(born / 170 + age / 220)), Math.round(tip[1] - 1 - age / 90), 1, 1);
    }
  }

  // 바닥에 버린 꽁초. 처음 1초는 불씨와 가는 연기, 마지막 0.5초는 깜빡이다 사라진다.
  const BUTT_MS = 2000;
  function drawButt(g, x, y, age) {
    if (age > BUTT_MS - 500 && Math.floor(age / 100) % 2) return;
    rect(g, x - 2, y - 1, 5, 3, PAL.outline);
    rect(g, x - 1, y, 1, 1, CIG.filter);
    rect(g, x, y, 1, 1, CIG.paper);
    rect(g, x + 1, y, 1, 1, age < 1000 ? (Math.floor(age / 150) % 2 ? CIG.ember : CIG.emberLo) : '#7a7a7a');
    if (age < 1000) {
      const a = (1 - age / 1000) * 0.6;
      g.fillStyle = `rgba(225,225,228,${a.toFixed(2)})`;
      g.fillRect(x + 1 + Math.round(Math.sin(age / 200)), y - 2 - Math.floor((age % 600) / 120), 1, 1);
    }
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
  // 머리 6줄 중 위 5줄이 등받이 위로 보이고 턱 줄은 등받이 윗선에 가린다.
  const SEAT_HEAD = 5;
  // 말풍선·화살표를 띄울 높이: 선 사람 발끝에서 머리 꼭대기 바로 위까지(머리 꼭대기 y-15, 모자 한 줄 위)
  const HEAD_TOP = 17;
  function drawSeated(g, x, y, look, tilt, pose) {
    const hx = x + 3 + tilt;
    const hy = y - SEAT_HEAD + (pose && pose.bow ? pose.bow : 0);
    parts(g, [[hx, hy, 8, 6, PAL.skin]]);
    // 헤어스타일 뒷모습. 어깨 아래로 내려온 머리는 뒤에 그리는 등받이가 가린다.
    const styled = look.hairStyle && PX.hairs.draw(g, hx + 4, hy, look.hairStyle, 'up', look.hair, !!(look.cap || look.crown));
    if (!styled && look.bald) {
      rect(g, hx, hy + 2, 1, 4, look.hair);
      rect(g, hx + 7, hy + 2, 1, 4, look.hair);
      rect(g, hx + 1, hy + 4, 6, 2, look.hair);
    } else if (!styled) {
      rect(g, hx, hy, 8, 6, look.hair);
      rect(g, hx, hy + 3, 1, 2, PAL.skin);
      rect(g, hx + 7, hy + 3, 1, 2, PAL.skin);
    }
    if (look.earring) {
      rect(g, hx - 1, hy + 4, 1, 1, look.earring);
      rect(g, hx + 8, hy + 4, 1, 1, look.earring);
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
    if (area.confine && !area.confine(x, y)) return true;
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
    // 전광판(DOM)보다 위에 그릴 것을 위한 투명 캔버스. 앉은 화면에서 머리 위 담배 연기가 전광판에 가리지 않게 한다.
    const fx = document.createElement('canvas');
    fx.width = W;
    fx.height = H;
    fx.className = 'fx';
    canvas.parentNode.appendChild(fx);
    const fxg = fx.getContext('2d');
    let fxUsed = false;
    // 장면은 늘 world 에 그리고, 화면에는 시점에 맞게 옮겨 붙인다
    const { c: world, g } = makeCanvas(W, H);
    const bg = paintBackground();
    const seatedBg = paintSeatedBackground();
    const chairImg = paintChair();

    // 장소마다 배경은 처음 한 번만 그린다
    const areas = {
      exchange: Object.assign({ bg }, EXCHANGE),
      coin: Object.assign({ bg: paintBackground(true) }, COIN),
      us: Object.assign({ bg: paintBackground(true) }, US)
    };
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

    // 경마장 관리인. 위치는 서버가 정하고(말 도둑을 쫓는다) 화면은 사람처럼 부드럽게 따라간다.
    const keeper = {
      active: false, name: '경마장 관리인',
      look: { hair: '#3b2a20', shirt: '#e8e0c8', shirtLo: '#c8bfa4', pants: '#4a3a2a', vest: '#2f6b3a', cap: '#2f6b3a' },
      x: 30, y: 50, tx: 30, ty: 50, dir: 'right', moving: false, frame: 0, anim: 0, map: 'racetrack'
    };
    const keeperHere = () => keeper.active && player.map === 'racetrack';
    // 마굿간 칸마다 말이 있는지. places.js 가 칸 속 말을 그릴 때 읽는다.
    const stable = { stalls: [] };
    PX.stable = stable;

    // main.js 가 서버로 보내거나 창을 열 수 있게 앉기·일어나기·말 걸기·장소 이동을 알려준다
    const hooks = { onSit() {}, onStand() {}, onTalk() {}, onGo() {}, onStable() {} };

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

    // 옆 장소로 밀리며 넘어가는 중. 떠난 장소의 마지막 화면(old)을 밀어내고 새 장소 화면을 밀어 넣는다.
    // 넘어가는 동안 캐릭터는 움직이지 않는다.
    const SLIDE_MS = 700;
    let slide = null;
    const slideOld = makeCanvas(W, H);

    function slideOffset(now) {
      const t = Math.min(1, (now - slide.start) / SLIDE_MS);
      return Math.round(W * (t < 0.5 ? 2 * t * t : 1 - 2 * (1 - t) * (1 - t)));
    }

    function enter(id, spawn, dir) {
      if (dir) {
        slideOld.g.clearRect(0, 0, W, H);
        slideOld.g.drawImage(canvas, 0, 0, W, H);
        slide = { from: player.map, to: id, dir, start: performance.now() };
        keys.clear();
      } else {
        fade = FADE_S;
      }
      area = areas[id];
      player.map = id;
      player.x = spawn.x;
      if (spawn.y != null) player.y = spawn.y;
      player.dir = spawn.dir;
      player.route = null;
      // 강아지 소식은 강아지가 있는 장소에서만 받는다. 새 장소의 sync·dog 로 실제 자리에 바로 놓이게 꺼 둔다.
      dog.active = false;
      keeper.active = false;
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

    // 경마장 마굿간 칸을 바라보며 붙어 서 있으면 그 칸 번호, 아니면 -1
    function stallFacing() {
      const S = area.stable;
      if (!S || player.seat || player.dir !== 'up' || player.y > S.frontY + 8) return -1;
      return S.stallX.findIndex(x => Math.abs(player.x - x) <= 9);
    }

    // Space 하나로 말 걸기·앉기·일어나기를 모두 한다. 사람이 의자보다 우선.
    function act() {
      if (isDown(player)) return;
      if (player.seat) { stand(); return; }
      const stall = stallFacing();
      if (stall >= 0) {
        if (player.rider) hooks.onStable('return');
        else if (stable.stalls[stall]) hooks.onStable('steal', stall);
        return;
      }
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
      // F: 말 탄 채 앞발차기. 감정표현 판이 떠 있을 때는 판이 키를 가로채지 않으므로 여기서 거른다.
      if (e.code === 'KeyF') {
        if (!e.repeat && !(PX.emote && PX.emote.open)) kick();
        e.preventDefault();
        return;
      }
      if (e.code === 'Space') {
        if (!e.repeat) act();
        e.preventDefault();
        return;
      }
      const k = KEYMAP[e.code];
      if (!k) return;
      // 풋살장에서는 S 가 패스, D 가 슛이라 WASD 로 걷지 않는다(방향키만)
      if (area.arrowsOnly && !e.code.startsWith('Arrow')) return;
      e.preventDefault();
      if (player.seat) {
        // 앉은 채 ↑ 는 전광판 쪽이라 그대로 앉아 있고, 다른 방향은 일어선다
        if (k === 'up') return;
        stand();
      }
      // 같은 방향키를 짧게 두 번 누르면 뛴다. 방향키를 모두 뗄 때까지 뛰는 채로 간다.
      if (!e.repeat) {
        const now = performance.now();
        if (k === lastTap.key && now - lastTap.at < DOUBLE_TAP_MS) running = true;
        lastTap.key = k;
        lastTap.at = now;
      }
      keys.add(k);
      player.route = null;
    });
    window.addEventListener('keyup', (e) => {
      const k = KEYMAP[e.code];
      if (k) keys.delete(k);
    });
    window.addEventListener('blur', () => { keys.clear(); running = false; });

    canvas.addEventListener('pointerdown', (e) => {
      const rc = canvas.getBoundingClientRect();
      const x = (e.clientX - rc.left) / rc.width * W;
      const y = (e.clientY - rc.top) / rc.height * H;
      // 넘어져 있는 동안은 클릭으로도 못 움직인다
      if (!player.active || locked || isDown(player)) return;
      // 착석 화면은 좌표계가 달라서, 아래 띠를 누르면 일어나기만 한다
      if (player.seat) { stand(); return; }
      if (area.floorY && y < area.floorY) return;
      // 반올림하면 화면 맨 아래(출구)를 눌렀을 때 바닥 밖(y=180)이 되어 거기까지 못 간다
      player.route = routeTo(Math.floor(x), Math.floor(y));
    });

    const PLAYER_SPEED = 55;
    // 말을 타면 빨라진다. 관리인(server/stable.js, 66)보다 빨라 곧장 달아나면 따돌릴 수 있다.
    const RIDE_SPEED = 82;
    // 방향키 두 번 연타로 뛰기. 말보다는 느리게 둬서 말 타는 의미를 남긴다.
    const RUN_FACTOR = 1.45;
    const DOUBLE_TAP_MS = 300;
    const lastTap = { key: null, at: 0 };
    let running = false;

    function updatePlayer(dt) {
      player.moving = false;
      if (!player.active || player.seat || slide) return;
      // 넘어져 있는 동안은 방향키를 눌러도 일어날 때까지 그대로 누워 있다
      if (isDown(player)) { animate(player, false, dt); return; }
      let dx = 0, dy = 0;
      if (keys.has('left')) dx -= 1;
      if (keys.has('right')) dx += 1;
      if (keys.has('up')) dy -= 1;
      if (keys.has('down')) dy += 1;
      if (keys.size === 0) running = false;
      // 말을 탔거나 풋살 경기장(걸음 빠르기가 경기 규칙)에서는 뛰지 않는다
      const run = running && !player.rider && !area.speed;

      // 장소가 걸음 빠르기를 바꿀 수 있다(풋살장에서 공을 가진 사람은 조금 느리다)
      const step = (player.rider ? RIDE_SPEED : PLAYER_SPEED) * (area.speed ? area.speed() : 1) * (run ? RUN_FACTOR : 1) * dt;

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
          // 클릭으로 출구까지 걸어온 경우도 옮겨 가야 한다
          checkExit();
          return;
        }
        dx = tx / dist;
        dy = ty / dist;
      }
      if (!dx && !dy) { animate(player, false, dt); return; }
      // 바라보는 8방향(0 오른쪽부터 시계 방향 45°씩). 그림은 4방향이지만 풋살 드리블·패스·슛은 대각선도 쓴다.
      player.face = (Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) + 8) % 8;

      const len = Math.hypot(dx, dy);
      const moved = moveBy(player, dx / len * step, dy / len * step);
      if (!moved) player.route = null;
      player.moving = moved;
      // 뛰는 동안은 다리도 빨리 움직인다
      animate(player, moved, run ? dt * RUN_FACTOR : dt);
      if (moved) checkExit();
    }

    function checkExit() {
      const exit = area.exits.find(e => inside(e, player.x, player.y));
      if (exit) enter(exit.to, exit.spawn, exit.slide);
    }

    // 서버 위치는 0.1초 간격이라, 그 사이를 걷는 속도로 채워 끊겨 보이지 않게 한다.
    // 상대가 뛰면 걷는 속도로는 뒤처지므로, 남은 거리를 다음 위치가 올 무렵(약 0.12초)까지 따라잡는 속도로 올린다.
    // 너무 멀면(순간이동·재접속) 바로 옮긴다.
    const REMOTE_SPEED = 66;
    function updateRemote(r, dt) {
      if (r.seat) return;
      const dx = r.tx - r.x, dy = r.ty - r.y;
      const dist = Math.hypot(dx, dy);
      const step = Math.max(r.rider ? RIDE_SPEED * 1.2 : REMOTE_SPEED, dist * 8) * dt;
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
      if (keeper.active) updateRemote(keeper, dt);
      dropButts();
    }

    // 담배를 다 피운 사람은 발 앞(바라보는 쪽)에 꽁초를 떨어뜨린다. 꽁초는 그 자리에 3초 있다가 사라진다.
    // 같은 표현을 받은 모든 화면이 각자 떨어뜨리므로 서버와 주고받지 않는다.
    const butts = [];
    function dropButts() {
      const now = performance.now();
      for (const p of [player, ...remotes.values()]) {
        const e = p.emote;
        if (!e || e.type !== 'smoke' || e.dropped || now < e.until) continue;
        e.dropped = true;
        if (p.rider) continue;
        const side = p.dir === 'left' ? -6 : p.dir === 'right' ? 6 : p.dir === 'up' ? 4 : 5;
        const seat = p.seat;
        butts.push({
          map: p.map,
          x: seat ? seat.x + 7 + side : Math.round(p.x) + side,
          y: seat ? seat.y + CHAIR_H + 2 : Math.round(p.y) + (p.dir === 'up' ? -2 : 1),
          at: now
        });
      }
      while (butts.length && now - butts[0].at >= BUTT_MS) butts.shift();
    }

    function render() {
      const now = new Date();
      g.drawImage(area.bg, 0, 0);

      const list = inExchange() ? statics.slice() : [];
      const nowMs = performance.now();
      const people = nearby();
      if (player.active) people.push(player);
      if (inExchange()) people.push(shopkeeper);
      if (keeperHere()) people.push(keeper);
      // 장소가 따로 그릴 것(경마장의 말 등)을 사람과 같은 깊이 순서에 끼워 넣는다
      if (area.decorate) area.decorate(list, g, now.getTime() / 1000);
      for (const p of people) {
        if (p.seat) {
          const s = p.seat;
          const pose = poseOf(p, nowMs);
          list.push({ key: s.y + CHAIR_H - 0.5, draw: () => drawSeated(g, s.x, s.y, p.look, 0, pose) });
          // 앉아서 피우면 등받이 위 머리에서 연기만 오른다
          if (pose && pose.smoke != null) list.push({ key: s.y + CHAIR_H + 0.5, draw: () => drawSmoke(g, s.x + 7, s.y + SEATED_SMOKE_Y, 'up', pose.smoke) });
          continue;
        }
        const px = Math.round(p.x), py = Math.round(p.y);
        // 장소가 옷을 바꿔 보여 줄 수 있다(풋살장 팀 유니폼). 착용 아이템은 그대로 둔다.
        const look = area.dress ? area.dress(p === player ? 'me' : p.id, p.look) : null;
        list.push({ key: py, draw: () => drawStanding(g, px, py, p, poseOf(p, nowMs), look) });
      }
      // 꽁초는 바닥에 있으니 같은 줄의 사람보다 먼저(뒤에) 그린다
      for (const b of butts) {
        if (b.map === player.map) list.push({ key: b.y - 0.5, draw: () => drawButt(g, b.x, b.y, nowMs - b.at) });
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
      if (!locked && player.active && shopFacing()) drawMarker(g, SHOPKEEPER.x, SHOPKEEPER.y - HEAD_TOP - 6, t);
      else {
        const near = player.seat ? null : seatFacing();
        if (near) drawMarker(g, near.x + 7, near.y - 13, t);
      }

      if (fxUsed) {
        fxg.clearRect(0, 0, W, H);
        fxUsed = false;
      }
      if (player.seat) composeSeated(player.seat);
      else if (slide) {
        // 오른쪽으로 갈 때는 옛 화면이 왼쪽으로 밀려 나가고 새 화면이 오른쪽에서 들어온다(왼쪽은 반대)
        const off = slideOffset(performance.now());
        const s = slide.dir === 'right' ? 1 : -1;
        screen.drawImage(slideOld.c, -s * off, 0);
        screen.drawImage(world, s * (W - off), 0);
        if (off >= W) slide = null;
      } else screen.drawImage(world, 0, 0);
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
      // 띠는 머리 바로 위까지만 있어 연기가 잘리므로, 연기는 모아 두었다가 띠를 붙인 뒤 전광판 위에 그린다
      const smokes = [];
      // 앞사람을 먼저 그려 내 줄 사람·의자 뒤로 지나가게 한다
      drawFront(sg, seat, sx, sw, smokes);
      for (const s of seats) {
        if (s.y !== seat.y || s.x + CHAIR_W < sx || s.x > sx + sw) continue;
        const x = s.x - sx;
        const y = s.y + oy;
        if (s.occupant) {
          const pose = poseOf(s.occupant, performance.now());
          drawSeated(sg, x, y, s.occupant.look, 0, pose);
          if (pose && pose.smoke != null) smokes.push([x + 7, y + SEATED_SMOKE_Y, 'up', pose.smoke]);
        }
        sg.drawImage(chairImg, x, y);
      }

      screen.drawImage(seatedBg, 0, 0);
      screen.drawImage(strip.c, 0, ST.y, W, ST.h);
      if (smokes.length) {
        fxg.save();
        fxg.translate(0, ST.y);
        fxg.scale(ST.zoom, ST.zoom);
        for (const [x, y, dir, t] of smokes) drawSmoke(fxg, x, y, dir, t);
        fxg.restore();
        fxUsed = true;
      }
    }

    // 나와 전광판 사이에 있는 사람(앞줄에 앉았거나 앞쪽에 서 있는 사람)을 내 줄과 같은 높이·크기로 그린다.
    // 원근 없이 머리 위치를 내 줄에 앉은 사람과 맞추므로, 내 줄 사람이 앉은 자리에서는 가려진다.
    // 띠 안에 선 사람을 그릴 발끝 줄. 머리(발끝 -15)가 앉은 머리(3번째 줄)와 같은 높이가 된다.
    const STRIP_FEET = 18;
    function drawFront(sg, seat, sx, sw, smokes) {
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
        // 띠 안에서 머리 꼭대기가 3번째 줄에 오게 맞춘다(내 줄에 앉은 머리와 같은 높이: 의자 8 - SEAT_HEAD)
        const pose = poseOf(p, performance.now());
        const smoking = pose && pose.smoke != null;
        if (p.seat) {
          drawSeated(sg, x - CHAIR_W / 2, 8, p.look, 0, pose);
          if (smoking) smokes.push([x - CHAIR_W / 2 + 7, 8 + SEATED_SMOKE_Y, 'up', pose.smoke]);
        } else {
          drawStanding(sg, x, p.rider ? STRIP_FEET + RIDE_H : STRIP_FEET, p, pose, null, true);
          if (smoking && !p.rider) smokes.push([x, STRIP_FEET, p.dir, pose.smoke]);
        }
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

    // 안내 문구용 현재 상태: 'seated' | 'talk' | 'near' | 'ride'(말 탄 채 빈 곳) | 'free'
    function prompt() {
      if (player.seat) return 'seated';
      if (shopFacing()) return 'talk';
      const stall = stallFacing();
      if (stall >= 0) return player.rider ? 'return' : stable.stalls[stall] ? 'steal' : 'empty';
      return seatFacing() ? 'near' : player.rider ? 'ride' : 'free';
    }

    // 말풍선·닉네임이 붙을 머리 위 지점(화면 논리 좌표). 화면에 안 보이면 null.
    //   who: 'me', 'shop'(상점 주인) 또는 접속자 id
    let stripSx = 0;
    function anchor(who) {
      // 화면이 밀리는 동안은 말풍선·닉네임표를 숨긴다(두 장소가 함께 보여 자리가 맞지 않는다)
      if (slide) return null;
      // 강아지는 키가 작아 앉은 화면 띠에는 그리지 않는다
      if (who === 'dog') return dogHere() && !player.seat ? { x: dog.x, y: dog.y - 12 } : null;
      if (who === 'keeper') return keeperHere() ? { x: keeper.x, y: keeper.y - HEAD_TOP } : null;
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
      if (p.seat) return { x: p.seat.x + CHAIR_W / 2, y: p.seat.y - SEAT_HEAD - 3 };
      // 넘어져 누워 있으면 머리가 옆으로 가 있다
      if (poseOf(p, performance.now())?.fall) return { x: p.x + (p.fall.side === 'left' ? -10 : 10), y: p.y - 10 };
      return { x: p.x, y: p.y - (p.rider ? HEAD_TOP + RIDE_H : HEAD_TOP) };
    }

    function releaseKeys() {
      keys.clear();
    }

    const FACE_OF_DIR = { right: 0, down: 2, left: 4, up: 6 };

    // 서버가 정한 자리로 순간이동(풋살 킥오프 대형). 걷던 길은 버린다.
    function teleport(x, y, dir) {
      if (!player.active || player.seat) return;
      player.x = x;
      player.y = y;
      if (dir) {
        player.dir = dir;
        player.face = FACE_OF_DIR[dir];
      }
      player.route = null;
      player.moving = false;
    }

    // 지금 화면에 그려지는 사람(나 'me' 또는 접속자 id). 같은 장소에 서 있을 때만.
    // 풋살장이 드리블 공을 그 사람 발 앞에 붙여 그릴 때 쓴다.
    function where(who) {
      const p = who === 'me' ? (player.active ? player : null) : remotes.get(who);
      if (!p || p.seat || p.map !== player.map) return null;
      return p;
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
        Object.assign(player, { active: true, x: me.x, y: me.y, dir: me.dir, seat: null, route: null, map, mount: me.mount ?? null, rider: me.mount != null });
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
        const r = { id: u.id, name: u.name, baseLook: u.look, map: u.map || 'exchange', x: u.x, y: u.y, tx: u.x, ty: u.y, dir: u.dir, moving: !!u.moving, frame: 0, anim: 0, seat: null, mount: u.mount ?? null, rider: u.mount != null };
        setEquip(r, u.equip);
        remotes.set(u.id, r);
        if (u.seat != null) occupy(r, u.seat);
      },

      // 누가 말을 훔쳐 탔거나(stall 번호) 내렸다(null). why: steal | return | caught
      mount(id, stall) {
        const p = id === 'me' ? player : remotes.get(id);
        if (p) {
          // 훔쳐 가면 칸이 비고, 돌려놓거나 뺏기면 원래 칸이 다시 찬다
          if (stall != null) stable.stalls[stall] = false;
          else if (p.mount != null) stable.stalls[p.mount] = true;
          p.mount = stall;
          p.rider = stall != null;
        } else if (stall != null) {
          stable.stalls[stall] = false;
        }
      },

      // 마굿간 칸 상태와 관리인 위치를 한 번에(입장·경마장 진입 때)
      stable(st) {
        if (!st) return;
        stable.stalls = st.stalls.slice();
        if (st.keeper) net.keeper(st.keeper, true);
      },

      keeper(k, jump) {
        if (jump || !keeper.active) {
          keeper.x = k.x;
          keeper.y = k.y;
          keeper.active = true;
        }
        keeper.tx = k.x;
        keeper.ty = k.y;
        keeper.dir = k.dir;
        keeper.moving = !!k.moving;
      },

      remove(id) {
        const r = remotes.get(id);
        if (!r) return;
        // 말을 탄 채 나가면 말은 마굿간으로 돌아간다
        if (r.mount != null) stable.stalls[r.mount] = true;
        vacate(r);
        remotes.delete(id);
      },

      move(id, x, y, dir, moving, face) {
        const r = remotes.get(id);
        if (!r || r.seat) return;
        r.tx = x;
        r.ty = y;
        r.dir = dir;
        r.face = face == null ? null : face;
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

      // 장소에 들어오거나 다시 볼 때 서버가 보낸 현재 모습(sync). 그동안 위치를 받지 않았으므로
      // 따라 걷지 않고 그 자리에 바로 놓는다. 앉아 있는 사람은 그 의자에 그대로 앉힌다.
      snap(id, map, x, y, dir, moving, seat) {
        const r = remotes.get(id);
        if (!r) return;
        r.map = map;
        r.x = r.tx = x;
        r.y = r.ty = y;
        r.dir = dir;
        r.moving = !!moving;
        if (seat == null) vacate(r);
        else if (!r.seat || r.seat.index !== seat) {
          vacate(r);
          occupy(r, seat);
        }
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
        const map = d.map || 'exchange';
        // 다른 장소의 강아지(떠난 장소에서 늦게 온 소식 포함)는 그리지 않는다
        if (map !== player.map) {
          dog.active = false;
          return false;
        }
        const changed = d.owner !== dog.owner;
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
    const EMOTE_MS = { bow: 1400, smoke: SMOKE_MS };
    const BOW_STEPS = [[150, 1], [950, 2], [1150, 1]];

    // who: 'me' 또는 접속자 id. 같은 사람이 다시 하면 처음부터 다시 한다.
    function playEmote(who, type) {
      const p = who === 'me' ? player : remotes.get(who);
      if (!p || !EMOTE_MS[type]) return;
      const now = performance.now();
      p.emote = { type, start: now, until: now + EMOTE_MS[type] };
    }

    // ---------- 앞발차기 ----------

    // 말 탄 사람이 F 를 누르면 말이 앞발을 들어 앞을 찬다: 접어 듦 → 뻗어 참 → 내림.
    // 맞았는지는 서버(server/stable.js hoof)가 정해 hoof 메시지로 알려 준다.
    const HOOF_MS = 650;
    const HOOF_STEPS = [[150, 1], [450, 2], [650, 1]];
    // 다시 찰 수 있는 간격. 서버는 전송이 들쭉날쭉한 것을 봐 주려고 0.9초로 조금 짧다.
    const HOOF_GAP_MS = 1000;
    // 맞은 사람: 누워 있다가(별이 돈다) 마지막에 반쯤 숙인 채 일어난다. 서버 FALL_MS 와 같다.
    const FALL_MS = 1800;
    const FALL_UP_MS = 1500;
    // 맞으면 찬 방향으로 이만큼 밀려난다(내 화면만 옮기면 위치 전송으로 남에게도 보인다)
    const PUSH_PX = 8;
    let lastKick = -Infinity;

    function isDown(p) {
      return !!p.fall && performance.now() < p.fall.until;
    }

    // 서버 확인을 기다리지 않고 먼저 앞발을 든다
    function kick() {
      const now = performance.now();
      if (!player.rider || player.seat || isDown(player) || now - lastKick < HOOF_GAP_MS) return;
      lastKick = now;
      player.hoof = { until: now + HOOF_MS };
      if (hooks.onHoof) hooks.onHoof(player.dir);
    }

    // who: 찬 사람('me' 또는 id), hits: [[맞은 사람('me' 또는 id), 넘어지는 쪽 'left'|'right']]
    function hoof(who, dir, hits) {
      const now = performance.now();
      if (who !== 'me') {
        const r = remotes.get(who);
        if (r) {
          r.dir = dir;
          r.hoof = { until: now + HOOF_MS };
        }
      }
      for (const [id, side] of hits) {
        const p = id === 'me' ? player : remotes.get(id);
        if (!p || p.seat) continue;
        p.fall = { side, until: now + FALL_MS };
        if (p !== player) continue;
        // 벽을 뚫지 않도록 두 칸씩 나눠 민다. 밀려도 바라보는 방향은 그대로다.
        const keep = player.dir;
        const [dx, dy] = DIRV[dir] || [0, 0];
        for (let k = 0; k < PUSH_PX / 2; k++) moveBy(player, dx * 2, dy * 2);
        player.dir = keep;
        player.route = null;
        keys.clear();
      }
    }

    function poseOf(p, now) {
      if (p.fall && now < p.fall.until) {
        return p.fall.until - now > FALL_MS - FALL_UP_MS ? { fall: p.fall.side } : { bow: 1 };
      }
      if (p.hoof && now < p.hoof.until) {
        const t = now - (p.hoof.until - HOOF_MS);
        const step = HOOF_STEPS.find(([end]) => t < end);
        return step ? { rear: step[1] } : null;
      }
      const e = p.emote;
      if (!e || now >= e.until) return null;
      if (e.type === 'bow') {
        const t = now - e.start;
        const step = BOW_STEPS.find(([end]) => t < end);
        return step ? { bow: step[1] } : null;
      }
      if (e.type === 'smoke') return { smoke: now - e.start };
      return null;
    }

    return {
      update, render, prompt, anchor, releaseKeys, setLocked, setMyEquip, playEmote, teleport, where, hoof, player, hooks, net,
      shopkeeperName: shopkeeper.name,
      get map() { return player.map; },
      get seatedView() { return !!player.seat; },
      // 밀리는 중이면 { from, to, dxFrom, dxTo }: 떠난 장소·새 장소 화면이 가로로 밀린 양(논리 px).
      // main.js 가 전광판 같은 DOM 오버레이를 같은 양만큼 옮긴다.
      get slide() {
        if (!slide) return null;
        const off = Math.min(W, slideOffset(performance.now()));
        const s = slide.dir === 'right' ? 1 : -1;
        return { from: slide.from, to: slide.to, dxFrom: -s * off, dxTo: s * (W - off) };
      }
    };
  }

  // 인벤토리 미리보기가 같은 그림을 쓰도록 내보낸다
  PX.sprites = { drawPerson, drawRider, drawDog };

  PX.createScene = createScene;
})();
