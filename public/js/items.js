// 아이템 목록·도트 아이콘·착용 규칙. 상점·인벤토리·캐릭터 그림이 함께 쓴다.
//
//   PX.items.list / byId(id) / categories / slots
//   PX.items.drawIcon(item)          16x16 도트 아이콘 canvas
//   PX.items.applyEquip(look, ids)   기본 외형에 착용 아이템을 덮어쓴 외형
//   PX.items.equipToggle(ids, id)    착용/해제 후의 착용 목록(같은 부위·겹치는 부위는 벗긴다)
//   PX.items.starterItems()          처음 접속한 사람에게 주는 기본 착장(머리·신발, 절반은 모자)
(function () {

  const CATEGORIES = [
    { id: 'hair', name: '헤어' },
    { id: 'hat', name: '모자' },
    { id: 'top', name: '상의' },
    { id: 'bottom', name: '하의' },
    { id: 'outfit', name: '한벌옷' },
    { id: 'shoes', name: '신발' },
    { id: 'accessory', name: '장식품' }
  ];

  // 착용 부위. 한벌옷은 상의·하의 자리를 함께 차지한다.
  const SLOTS = [
    { id: 'hair', name: '헤어' },
    { id: 'hat', name: '모자' },
    { id: 'top', name: '상의' },
    { id: 'bottom', name: '하의' },
    { id: 'outfit', name: '한벌옷' },
    { id: 'shoes', name: '신발' },
    { id: 'earring', name: '귀걸이' },
    { id: 'ring', name: '반지' }
  ];
  const CONFLICTS = { outfit: ['top', 'bottom'], top: ['outfit'], bottom: ['outfit'] };

  const WHITE = '#eeeeee';
  const GOLD = '#f3d24a';
  const SILVER = '#d8d8e0';
  const RUBY = '#e0404a';
  const SAPPHIRE = '#3a7ae0';

  // 부위별 아이템 한 줄씩. wear 는 캐릭터 그림(scene.js drawPerson)이 읽는 외형 값,
  // icon/opt 은 아이콘 모양과 변형. 나중에 서버가 목록·가격을 정하면 이 배열을 서버에서 받아 오면 된다.
  // 헤어는 모양(hairs.js)만 바꾸고 머리 색은 사람마다 정해진 색을 그대로 쓴다. 아이콘은 갈색으로 그린다.
  const hair = (style, price, desc) =>
    ({ id: 'hair-' + style, cat: 'hair', slot: 'hair', name: PX.hairs.list.find(s => s.id === style).name, price, desc, icon: 'hair', color: '#6b4428', opt: { style }, wear: { hairStyle: style } });
  const hat = (id, name, price, desc, color, wear, opt) =>
    ({ id, cat: 'hat', slot: 'hat', name, price, desc, icon: opt && opt.icon || 'cap', color, opt: opt || {}, wear });
  const top = (id, name, price, desc, color, wear, opt) =>
    ({ id, cat: 'top', slot: 'top', name, price, desc, icon: 'shirt', color, opt: opt || {}, wear });
  const bottom = (id, name, price, desc, color, wear, opt) =>
    ({ id, cat: 'bottom', slot: 'bottom', name, price, desc, icon: 'pants', color, opt: opt || {}, wear });
  const outfit = (id, name, price, desc, color, wear, opt) =>
    ({ id, cat: 'outfit', slot: 'outfit', name, price, desc, icon: opt && opt.icon || 'dress', color, opt: opt || {}, wear });
  const shoes = (id, name, price, desc, color, wear, opt) =>
    ({ id, cat: 'shoes', slot: 'shoes', name, price, desc, icon: 'shoes', color, opt: opt || {}, wear });
  const earring = (id, name, price, desc, metal, gem) =>
    ({ id, cat: 'accessory', slot: 'earring', kind: '귀걸이', name, price, desc, icon: 'earring', color: metal, opt: { gem }, wear: { earring: gem || metal } });
  const ring = (id, name, price, desc, metal, gem) =>
    ({ id, cat: 'accessory', slot: 'ring', kind: '반지', name, price, desc, icon: 'ring', color: metal, opt: { gem }, wear: { ring: gem || metal } });

  const ITEMS = [
    // 헤어
    hair('basic', 100, '단정한 기본 짧은머리'),
    hair('buzz', 100, '짧게 친 스포츠머리'),
    hair('part', 300, '볼륨 살린 가르마'),
    hair('spiky', 500, '하늘로 솟은 뾰족머리'),
    hair('mohawk', 1000, '가운데만 세운 모히칸'),
    hair('bald', 500, '옆머리만 남은 객장 고수'),
    hair('perm', 500, '동글동글 뽀글 파마'),
    hair('pixie', 300, '앞머리 내린 숏컷'),
    hair('bob', 300, '턱선까지 오는 단발'),
    hair('long', 500, '어깨 아래로 내려오는 생머리'),
    hair('wave', 800, '물결치는 긴 머리'),
    hair('pony', 500, '높이 묶은 포니테일'),
    hair('twin', 800, '양쪽으로 묶은 양갈래'),
    hair('bun', 500, '정수리에 올린 똥머리'),
    hair('braid', 800, '한쪽으로 늘어뜨린 땋은머리'),

    // 모자. 왕관은 모자 대신 쓰는 것이라 기본 외형의 모자를 지운다(cap: null).
    hat('hat-basic', '기본 모자', 100, '챙이 달린 기본 캡', '#c8424a', { cap: '#c8424a', capLo: '#9b2c35' }),
    hat('hat-navy', '남색 모자', 100, '차분한 남색 캡', '#2c3e5c', { cap: '#2c3e5c', capLo: '#1f2c42' }),
    hat('hat-blue', '파란 모자', 100, '시원한 파란 캡', '#2f5fd8', { cap: '#2f5fd8', capLo: '#2346a8' }),
    hat('hat-green', '초록 모자', 100, '산뜻한 초록 캡', '#2f9a4a', { cap: '#2f9a4a', capLo: '#22733a' }),
    hat('hat-yellow', '노란 모자', 100, '눈에 띄는 노란 캡', '#e0b030', { cap: '#e0b030', capLo: '#b08a20' }),
    hat('hat-up', '상승 빨간 모자', 300, '▲ 무늬가 박힌 빨간 캡', '#d83a3a', { cap: '#d83a3a', capLo: '#a82626', capMark: 'up' }, { mark: 'up' }),
    hat('hat-down', '하락 파란 모자', 300, '▼ 무늬가 박힌 파란 캡', '#2f5fd8', { cap: '#2f5fd8', capLo: '#2346a8', capMark: 'down' }, { mark: 'down' }),
    hat('hat-bull', '황소 뿔 모자', 1000, '상승장을 부르는 뿔', '#6b3f22', { cap: '#6b3f22', capLo: '#4b2c18', horns: '#f4ead8' }, { horns: '#f4ead8' }),
    hat('hat-bear', '곰 귀 모자', 1000, '하락장도 귀엽게', '#5a3a2a', { cap: '#5a3a2a', capLo: '#3d281d', bearEars: '#5a3a2a' }, { ears: '#5a3a2a' }),
    hat('hat-fedora', '증권맨 중절모', 2000, '챙 넓은 검정 중절모', '#2a2a30', { cap: '#2a2a30', capLo: '#18181c', fedora: '#8a1f2a' }, { icon: 'fedora', band: '#8a1f2a' }),
    hat('hat-crown', '황금 왕관', 5000, '수익률 1등의 증표', GOLD, { cap: null, capLo: null, crown: GOLD }, { icon: 'crown' }),

    // 상의
    top('top-basic', '기본 상의', 100, '무난한 반팔 티셔츠', '#3a5bbf', { shirt: '#3a5bbf', shirtLo: '#2c4596' }),
    top('top-white', '흰 셔츠', 100, '깔끔한 흰 셔츠', WHITE, { shirt: WHITE, shirtLo: '#c8c8c8' }),
    top('top-red', '빨간 티셔츠', 100, '상승 기원', '#d83a3a', { shirt: '#d83a3a', shirtLo: '#a82626' }),
    top('top-blue', '파란 티셔츠', 100, '하락 방어', '#2f5fd8', { shirt: '#2f5fd8', shirtLo: '#2346a8' }),
    top('top-tie', '셔츠+넥타이', 500, '객장 출근룩', WHITE, { shirt: WHITE, shirtLo: '#c8c8c8', tie: '#c8424a' }, { tie: '#c8424a' }),
    top('top-vest', '조끼', 500, '흰 셔츠 위 남색 조끼', WHITE, { shirt: WHITE, shirtLo: '#2c3e5c', vest: '#2c3e5c' }, { vest: '#2c3e5c' }),
    top('top-board', '전광판 티셔츠', 1000, '가슴에 초록 시세 무늬', '#1b1410', { shirt: '#1b1410', shirtLo: '#111111', print: '#5dff7a' }, { print: '#5dff7a' }),

    // 하의
    bottom('bottom-basic', '기본 하의', 100, '편한 일자 바지', '#3a3a48', { pants: '#3a3a48' }),
    bottom('bottom-jeans', '청바지', 100, '기본 청바지', '#3a5f9a', { pants: '#3a5f9a' }),
    bottom('bottom-beige', '베이지 면바지', 100, '무난한 면바지', '#c9b48a', { pants: '#c9b48a' }),
    bottom('bottom-black', '검정 정장 바지', 300, '정장에 맞춰 입는 바지', '#22222a', { pants: '#22222a' }),
    bottom('bottom-shorts', '반바지', 300, '무릎 위 짧은 바지', '#5a6a8a', { pants: '#5a6a8a', shorts: true }, { short: true }),
    bottom('bottom-check', '체크 바지', 500, '격자무늬 바지', '#6b4a3a', { pants: '#6b4a3a', check: '#a8865e' }, { check: '#a8865e' }),

    // 한벌옷. 치마는 skirt, 정장·트레이닝복은 위아래 같은 색.
    outfit('outfit-basic', '기본 한벌옷', 100, '위아래가 붙은 원피스', '#2f8a8a', { shirt: '#2f8a8a', shirtLo: '#226767', pants: '#2f8a8a', skirt: '#2f8a8a', skirtLo: '#226767' }),
    outfit('outfit-red', '빨간 원피스', 500, '눈에 띄는 빨간 원피스', '#c8424a', { shirt: '#c8424a', shirtLo: '#9b2c35', pants: '#c8424a', skirt: '#c8424a', skirtLo: '#9b2c35' }),
    outfit('outfit-navy-suit', '남색 정장', 1000, '빨간 넥타이를 맨 남색 정장', '#2c3e5c', { shirt: '#2c3e5c', shirtLo: '#1f2c42', pants: '#2c3e5c', tie: '#c8424a' }, { icon: 'suit', tie: '#c8424a' }),
    outfit('outfit-black-suit', '검정 정장', 1000, '파란 넥타이를 맨 검정 정장', '#22222a', { shirt: '#22222a', shirtLo: '#15151a', pants: '#22222a', tie: '#3a7ae0' }, { icon: 'suit', tie: '#3a7ae0' }),
    outfit('outfit-work', '작업복', 500, '객장 직원 회색 작업복', '#7a7f88', { shirt: '#7a7f88', shirtLo: '#5e626a', pants: '#7a7f88' }, { icon: 'suit' }),
    outfit('outfit-track', '트레이닝복', 800, '흰 줄 들어간 남색 트레이닝복', '#2c3e5c', { shirt: '#2c3e5c', shirtLo: '#1f2c42', pants: '#2c3e5c', stripe: WHITE }, { icon: 'suit', stripe: WHITE }),
    outfit('outfit-bull', '황소 탈', 3000, '뿔까지 달린 황소 옷', '#6b3f22', { shirt: '#6b3f22', shirtLo: '#4b2c18', pants: '#6b3f22', horns: '#f4ead8' }, { icon: 'suit', horns: '#f4ead8' }),

    // 신발
    shoes('shoes-basic', '기본 신발', 100, '가벼운 운동화', '#8a5a34', { shoes: '#8a5a34' }),
    shoes('shoes-white', '흰 운동화', 100, '깔끔한 흰 운동화', WHITE, { shoes: WHITE }),
    shoes('shoes-black', '검정 구두', 300, '정장용 구두', '#18181c', { shoes: '#18181c' }),
    shoes('shoes-red', '빨간 운동화', 300, '상승 기원 운동화', '#d83a3a', { shoes: '#d83a3a' }),
    shoes('shoes-slipper', '슬리퍼', 100, '객장 터줏대감의 슬리퍼', '#4fb0e0', { shoes: '#4fb0e0', slipper: true }, { slipper: true }),
    shoes('shoes-gold', '황금 구두', 3000, '대박 기념 황금 구두', GOLD, { shoes: GOLD }),

    // 장식품. 캐릭터에는 보석(없으면 금속) 색 점 하나로 보인다.
    earring('earring-basic', '기본 귀걸이', 100, '작은 금빛 귀걸이', GOLD, null),
    earring('earring-silver', '은 귀걸이', 100, '은빛 귀걸이', SILVER, null),
    earring('earring-ruby', '루비 귀걸이', 500, '빨간 보석 귀걸이', GOLD, RUBY),
    earring('earring-sapphire', '사파이어 귀걸이', 500, '파란 보석 귀걸이', SILVER, SAPPHIRE),
    earring('earring-diamond', '다이아 귀걸이', 3000, '반짝이는 다이아몬드', SILVER, '#ffffff'),
    ring('ring-basic', '기본 반지', 100, '금빛 반지', GOLD, null),
    ring('ring-silver', '은 반지', 100, '은빛 반지', SILVER, null),
    ring('ring-bull', '황소 반지', 1000, '빨간 보석이 박힌 반지', GOLD, RUBY),
    ring('ring-bear', '곰 반지', 1000, '파란 보석이 박힌 반지', SILVER, SAPPHIRE)
  ];
  const BY_ID = new Map(ITEMS.map(i => [i.id, i]));

  // ---------- 아이콘 (16x16 도트) ----------

  const OUTLINE = [42, 29, 24];
  const SKIN = '#f2c39b';

  function shade(hex, f) {
    const n = parseInt(hex.slice(1), 16);
    const c = [n >> 16, (n >> 8) & 255, n & 255].map(v => Math.max(0, Math.min(255, Math.round(v * f))));
    return `rgb(${c[0]},${c[1]},${c[2]})`;
  }

  const ICONS = {
    // 얼굴에 그 헤어스타일 앞모습을 그린다. 격자 0~14행이 아이콘 1~15줄에 들어간다.
    hair(r, c, o, g) {
      r(4, 4, 8, 7, SKIN);
      PX.hairs.draw(g, 8, 4, o.style, 'down', c, false);
    },
    cap(r, c, o) {
      r(4, 5, 8, 2, c); r(3, 7, 10, 3, c);
      r(3, 9, 12, 1, shade(c, 0.7)); r(10, 10, 5, 1, shade(c, 0.7));
      r(5, 6, 2, 1, shade(c, 1.3));
      if (o.mark === 'up') { r(7, 6, 2, 1, '#ffffff'); r(6, 7, 4, 1, '#ffffff'); }
      else if (o.mark === 'down') { r(6, 6, 4, 1, '#ffffff'); r(7, 7, 2, 1, '#ffffff'); }
      else r(7, 5, 2, 1, '#ffffff');
      if (o.horns) { r(2, 4, 1, 2, o.horns); r(1, 2, 1, 2, o.horns); r(13, 4, 1, 2, o.horns); r(14, 2, 1, 2, o.horns); }
      if (o.ears) { r(3, 2, 3, 3, o.ears); r(10, 2, 3, 3, o.ears); r(4, 3, 1, 1, '#e8a0a0'); r(11, 3, 1, 1, '#e8a0a0'); }
    },
    fedora(r, c, o) {
      r(4, 4, 8, 5, c); r(5, 3, 6, 1, c);
      r(4, 8, 8, 1, o.band || shade(c, 1.4));
      r(1, 9, 14, 2, shade(c, 0.8));
      r(5, 5, 1, 2, shade(c, 1.4));
    },
    crown(r, c) {
      r(2, 4, 2, 3, c); r(7, 2, 2, 5, c); r(12, 4, 2, 3, c);
      r(2, 7, 12, 4, c); r(2, 10, 12, 1, shade(c, 0.75));
      r(7, 8, 2, 2, RUBY); r(4, 8, 1, 1, SAPPHIRE); r(11, 8, 1, 1, SAPPHIRE);
    },
    shirt(r, c, o) {
      r(2, 3, 12, 2, c); r(1, 4, 3, 4, c); r(12, 4, 3, 4, c); r(4, 4, 8, 10, c);
      r(6, 3, 4, 1, shade(c, 0.6)); r(1, 7, 3, 1, shade(c, 0.75)); r(12, 7, 3, 1, shade(c, 0.75));
      if (o.vest) { r(4, 4, 3, 10, o.vest); r(9, 4, 3, 10, o.vest); }
      if (o.tie) { r(7, 4, 2, 2, shade(o.tie, 0.8)); r(7, 6, 2, 6, o.tie); }
      if (o.print) for (const [x, y] of [[5, 6], [7, 8], [9, 6], [10, 9], [6, 10], [8, 11]]) r(x, y, 1, 1, o.print);
      if (!o.vest && !o.tie) r(5, 5, 1, 7, shade(c, 1.25));
    },
    pants(r, c, o) {
      r(4, 2, 8, 2, shade(c, 0.75)); r(4, 4, 8, 3, c);
      if (o.short) {
        r(4, 7, 3, 3, c); r(9, 7, 3, 3, c);
        r(4, 10, 3, 3, SKIN); r(9, 10, 3, 3, SKIN);
      } else {
        r(4, 7, 3, 7, c); r(9, 7, 3, 7, c);
      }
      r(7, 7, 2, 1, c);
      if (o.check) for (const [x, y] of [[5, 5], [9, 5], [4, 8], [10, 8], [5, 11], [10, 11]]) r(x, y, 1, 1, o.check);
      else r(5, 4, 1, o.short ? 5 : 9, shade(c, 1.35));
    },
    dress(r, c) {
      r(5, 1, 2, 2, c); r(9, 1, 2, 2, c); r(5, 3, 6, 4, c);
      r(5, 7, 6, 1, shade(c, 0.7));
      r(4, 8, 8, 2, c); r(3, 10, 10, 2, c); r(2, 12, 12, 2, c);
      r(2, 13, 12, 1, shade(c, 0.75));
      r(6, 4, 1, 3, shade(c, 1.3)); r(4, 10, 1, 3, shade(c, 1.3));
    },
    // 정장·작업복·트레이닝복·황소 탈: 윗옷과 바지가 한 벌
    suit(r, c, o) {
      r(3, 1, 10, 2, c); r(2, 2, 2, 6, c); r(12, 2, 2, 6, c); r(4, 3, 8, 6, c);
      r(4, 9, 8, 2, c); r(4, 11, 3, 4, c); r(9, 11, 3, 4, c);
      if (o.tie) { r(7, 1, 2, 2, WHITE); r(7, 3, 2, 4, o.tie); }
      if (o.stripe) { r(2, 2, 1, 6, o.stripe); r(13, 2, 1, 6, o.stripe); r(4, 11, 1, 4, o.stripe); r(11, 11, 1, 4, o.stripe); }
      if (o.horns) { r(4, 0, 2, 1, o.horns); r(10, 0, 2, 1, o.horns); }
      if (!o.tie && !o.stripe) r(5, 4, 1, 4, shade(c, 1.3));
    },
    shoes(r, c, o) {
      if (o.slipper) {
        r(1, 10, 6, 2, c); r(9, 10, 6, 2, c);
        r(1, 12, 6, 1, shade(c, 0.7)); r(9, 12, 6, 1, shade(c, 0.7));
        r(2, 9, 4, 1, SKIN); r(10, 9, 4, 1, SKIN);
        return;
      }
      r(1, 8, 5, 3, c); r(1, 11, 7, 2, c);
      r(9, 8, 5, 3, c); r(9, 11, 7, 2, c);
      r(1, 12, 7, 1, c === WHITE ? '#b8b8b8' : '#eeeeee'); r(9, 12, 7, 1, c === WHITE ? '#b8b8b8' : '#eeeeee');
      r(2, 9, 2, 1, shade(c, 1.4)); r(10, 9, 2, 1, shade(c, 1.4));
    },
    earring(r, c, o) {
      const gem = o.gem || c;
      r(7, 1, 2, 1, c); r(9, 2, 1, 3, c); r(8, 5, 1, 2, c);
      r(6, 7, 4, 1, c); r(5, 8, 6, 4, gem); r(6, 12, 4, 1, gem); r(7, 13, 2, 1, gem);
      r(6, 9, 1, 2, '#ffffff');
    },
    ring(r, c, o) {
      const gem = o.gem || shade(c, 1.15);
      r(5, 6, 6, 1, c); r(4, 7, 2, 6, c); r(10, 7, 2, 6, c); r(5, 13, 6, 1, c);
      r(6, 2, 4, 1, gem); r(5, 3, 6, 3, gem); r(6, 3, 1, 1, '#ffffff');
      r(7, 6, 2, 1, shade(c, 0.7));
    }
  };

  // 칠한 픽셀 바깥쪽 한 칸에 외곽선을 둘러 다른 도트 그림과 같은 느낌을 낸다
  function drawIcon(item) {
    const cv = document.createElement('canvas');
    cv.width = 16;
    cv.height = 16;
    cv.className = 'item-icon';
    const g = cv.getContext('2d');
    ICONS[item.icon]((x, y, w, h, col) => { g.fillStyle = col; g.fillRect(x, y, w, h); }, item.color, item.opt || {}, g);

    const img = g.getImageData(0, 0, 16, 16);
    const a = (x, y) => (x < 0 || y < 0 || x > 15 || y > 15) ? 0 : img.data[(y * 16 + x) * 4 + 3];
    const edge = [];
    for (let y = 0; y < 16; y++) {
      for (let x = 0; x < 16; x++) {
        if (a(x, y)) continue;
        if (a(x - 1, y) || a(x + 1, y) || a(x, y - 1) || a(x, y + 1)) edge.push((y * 16 + x) * 4);
      }
    }
    for (const i of edge) {
      img.data[i] = OUTLINE[0]; img.data[i + 1] = OUTLINE[1]; img.data[i + 2] = OUTLINE[2]; img.data[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    return cv;
  }

  // ---------- 착용 ----------

  // 아무것도 안 썼을 때: 민머리·맨발. 기본 머리·신발·모자도 아이템이라 벗으면 이렇게 보인다.
  const BARE = { hairStyle: 'none', shoes: SKIN };

  // 모르는 id(다른 버전 화면이 보낸 값 등)는 조용히 무시한다
  function applyEquip(look, ids) {
    const out = Object.assign({}, BARE, look);
    for (const id of ids || []) {
      const item = BY_ID.get(id);
      if (item) Object.assign(out, item.wear);
    }
    return out;
  }

  // 처음 접속한 사람에게 주는 기본 착장. 절반은 모자를 쓰고 시작한다.
  function starterItems() {
    const caps = ['hat-basic', 'hat-blue', 'hat-green', 'hat-yellow'];
    const ids = ['hair-basic', 'shoes-basic'];
    if (Math.random() < 0.5) ids.push(caps[Math.floor(Math.random() * caps.length)]);
    return ids;
  }

  function equipToggle(ids, id) {
    const item = BY_ID.get(id);
    if (!item) return ids.slice();
    if (ids.includes(id)) return ids.filter(x => x !== id);
    const freed = new Set([item.slot, ...(CONFLICTS[item.slot] || [])]);
    return ids.filter(x => {
      const other = BY_ID.get(x);
      return other && !freed.has(other.slot);
    }).concat(id);
  }

  PX.items = {
    list: ITEMS,
    categories: CATEGORIES,
    slots: SLOTS,
    byId: (id) => BY_ID.get(id),
    drawIcon,
    applyEquip,
    equipToggle,
    starterItems
  };
})();
