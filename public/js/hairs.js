// 헤어스타일 도트 그림. 캐릭터(scene.js)와 상점·인벤토리 아이콘(items.js)이 함께 쓴다.
//
// 스타일마다 앞(down)·옆(left)·뒤(up) 격자를 둔다. 오른쪽은 left 를 좌우로 뒤집어 쓴다.
// 격자는 폭 14칸, 행 0~14. 머리(얼굴)는 3~10열·3~9행이고 10행부터 몸통이다.
// 머리 위로 솟은 부분은 0~2행, 어깨 아래로 내려오는 부분은 10행 이후에 그린다.
//   o 외곽선  h 머리카락  d 진한 머리(결·그늘)  r 머리끈  s 피부  e 눈  공백 = 그대로 둠
(function () {
  const OUTLINE = '#2a1d18';
  const SKIN = '#f2c39b';
  const EYE = '#2a1a14';
  const TIE = '#e0404a';

  const STYLES = [
    // 헤어를 벗은 모습(민머리). 상점에서 팔지 않고, 아무 헤어도 안 썼을 때 쓴다.
    { id: 'none', name: '민머리',
      down: { 7: '     e  e     ' },
      left: { 7: '    e         ' },
      up:   {} },

    { id: 'basic', name: '기본 짧은머리',
      down: { 3: '   hhhhhhhh   ', 4: '   hhhhhhhh   ', 5: '   h      h   ', 6: '   h      h   ', 7: '     e  e     ' },
      left: { 3: '   hhhhhhhh   ', 4: '   hhhhhhhh   ', 5: '       hhhh   ', 6: '       hhhh   ', 7: '    e  hhhh   ' },
      up:   { 3: '   hhhhhhhh   ', 4: '   hhhhhhhh   ', 5: '   hhhhhhhh   ', 6: '   shhhhhhs   ', 7: '   shhhhhhs   ', 8: '   hhhhhhhh   ' } },

    { id: 'buzz', name: '스포츠머리',
      down: { 3: '   dddddddd   ', 4: '   d      d   ', 7: '     e  e     ' },
      left: { 3: '   dddddddd   ', 4: '        ddd   ', 5: '         dd   ', 7: '    e         ' },
      up:   { 3: '   dddddddd   ', 4: '   dddddddd   ', 5: '   dddddddd   ', 6: '   sdddddds   ', 7: '   sdddddds   ' } },

    { id: 'part', name: '가르마',
      down: { 1: '   oooooooo   ', 2: '  ohhhhdhhho  ', 3: '   hhhhdhhh   ', 4: '   hhhhhhhh   ', 5: '   hhhhh  h   ', 6: '   hh     h   ', 7: '     e  e     ' },
      left: { 1: '   oooooooo   ', 2: '  ohhhhhhhho  ', 3: '   hhhhhhhh   ', 4: '   hhhhhhhh   ', 5: '   hh  hhhh   ', 6: '       hhhh   ', 7: '    e  hhhh   ' },
      up:   { 1: '   oooooooo   ', 2: '  ohhhhhhhho  ', 3: '   hhhhhhhh   ', 4: '   hhhhhhhh   ', 5: '   hhhhhhhh   ', 6: '   shhhhhhs   ', 7: '   shhhhhhs   ', 8: '   hhhhhhhh   ' } },

    { id: 'spiky', name: '뾰족머리',
      down: { 0: '    o  o  o   ', 1: '   ohoohooho  ', 2: '  ohhhhhhhho  ', 3: '   hhhhhhhh   ', 4: '   hhhhhhhh   ', 5: '   h h  h h   ', 6: '   h      h   ', 7: '     e  e     ' },
      left: { 0: '    o  o  o   ', 1: '   ohoohooho  ', 2: '  ohhhhhhhho  ', 3: '   hhhhhhhh   ', 4: '   hhhhhhhh   ', 5: '   h h hhhh   ', 6: '       hhhh   ', 7: '    e  hhhh   ' },
      up:   { 0: '    o  o  o   ', 1: '   ohoohooho  ', 2: '  ohhhhhhhho  ', 3: '   hhhhhhhh   ', 4: '   hhhhhhhh   ', 5: '   hhhhhhhh   ', 6: '   shhhhhhs   ', 7: '   shhhhhhs   ', 8: '   hhhhhhhh   ' } },

    { id: 'mohawk', name: '모히칸',
      down: { 0: '     oooo     ', 1: '     ohho     ', 2: '     ohho     ', 3: '      hh      ', 4: '      hh      ', 7: '     e  e     ' },
      left: { 0: '    oooooo    ', 1: '   ohhhhhho   ', 2: '  ohhhhhhhho  ', 3: '   ddhhhhdd   ', 7: '    e         ' },
      up:   { 0: '     oooo     ', 1: '     ohho     ', 2: '     ohho     ', 3: '      hh      ', 4: '      hh      ', 5: '      hh      ', 6: '      hh      ', 7: '      hh      ', 8: '      hh      ' } },

    { id: 'bald', name: '대머리',
      down: { 5: '   h      h   ', 6: '   h      h   ', 7: '     e  e     ' },
      left: { 5: '        hhh   ', 6: '       hhhh   ', 7: '    e  hhhh   ' },
      up:   { 6: '   shhhhhhs   ', 7: '   shhhhhhs   ', 8: '   hhhhhhhh   ' } },

    { id: 'perm', name: '뽀글 파마',
      down: { 1: '    oooooo    ', 2: '  oohhhhhhoo  ', 3: ' ohhdhhhhdhho ', 4: ' ohhhhdhhhhho ', 5: ' ohdhhhhhhdho ', 6: ' ohh      hho ', 7: ' ohd e  e dho ', 8: '  oo      oo  ' },
      left: { 1: '    oooooo    ', 2: '  oohhhhhhoo  ', 3: ' ohhdhhhhdhho ', 4: ' ohhhhdhhhhho ', 5: ' ohd   hhdhho ', 6: '  o    hhhhho ', 7: '    e  hdhhho ', 8: '       hhhhho ', 9: '        oooo  ' },
      up:   { 1: '    oooooo    ', 2: '  oohhhhhhoo  ', 3: ' ohhdhhhhdhho ', 4: ' ohhhhdhhhhho ', 5: ' ohdhhhhhhdho ', 6: ' ohhhhdhhhhho ', 7: ' ohhdhhhhdhho ', 8: ' ohhhhhhhhhho ', 9: '  oooooooooo  ' } },

    { id: 'pixie', name: '숏컷',
      down: { 1: '   oooooooo   ', 2: '  ohhhhhhhho  ', 3: '   hhhhhhhh   ', 4: '   hhhhhhhh   ', 5: '   hhhhhh h   ', 6: '   hh     h   ', 7: '   h e  e h   ' },
      left: { 1: '   oooooooo   ', 2: '  ohhhhhhhho  ', 3: '   hhhhhhhh   ', 4: '   hhhhhhhh   ', 5: '   hhh hhhh   ', 6: '       hhhh   ', 7: '    e  hhhh   ', 8: '       hhhh   ' },
      up:   { 1: '   oooooooo   ', 2: '  ohhhhhhhho  ', 3: '   hhhhhhhh   ', 4: '   hhhhhhhh   ', 5: '   hhhhhhhh   ', 6: '   hhhhhhhh   ', 7: '   hhhhhhhh   ', 8: '   hhhhhhhh   ' } },

    { id: 'bob', name: '단발 보브',
      down: { 1: '   oooooooo   ', 2: '  ohhhhhhhho  ', 3: ' ohhhhhhhhhho ', 4: ' ohhhhhhhhhho ', 5: ' ohhsssssshho ', 6: ' ohhsssssshho ', 7: ' ohhsesseshho ', 8: ' ohhsssssshho ', 9: ' ohhsssssshho ', 10: '  oo      oo  ' },
      left: { 1: '   oooooooo   ', 2: '  ohhhhhhhho  ', 3: '  ohhhhhhhhho ', 4: '  ohhhhhhhhho ', 5: '   sssshhhhho ', 6: '   sssshhhhho ', 7: '   sesshhhhho ', 8: '   sssshhhhho ', 9: '   sssshhhhho ', 10: '       ooooo  ' },
      up:   { 1: '   oooooooo   ', 2: '  ohhhhhhhho  ', 3: ' ohhhhhhhhhho ', 4: ' ohhhhhhhhhho ', 5: ' ohhhhhhhhhho ', 6: ' ohhhhhhhhhho ', 7: ' ohhhhhhhhhho ', 8: ' ohhhhhhhhhho ', 9: ' ohhhhhhhhhho ', 10: '  oooooooooo  ' } },

    { id: 'long', name: '긴 생머리',
      down: { 1: '   oooooooo   ', 2: '  ohhhhhhhho  ', 3: ' ohhhhhhhhhho ', 4: ' ohhhhhhhhhho ', 5: ' ohhsssssshho ', 6: ' ohhsssssshho ', 7: ' ohhsesseshho ', 8: ' ohhsssssshho ', 9: ' ohhsssssshho ', 10: ' ohh      hho ', 11: ' ohh      hho ', 12: ' ohh      hho ', 13: ' ohh      hho ', 14: '  oo      oo  ' },
      left: { 1: '   oooooooo   ', 2: '  ohhhhhhhho  ', 3: '  ohhhhhhhhho ', 4: '  ohhhhhhhhho ', 5: '   sssshhhhho ', 6: '   sssshhhhho ', 7: '   sesshhhhho ', 8: '   sssshhhhho ', 9: '   sssshhhhho ', 10: '      ohhhhho ', 11: '      ohhhhho ', 12: '      ohhhhho ', 13: '      ohhhhho ', 14: '       ooooo  ' },
      up:   { 1: '   oooooooo   ', 2: '  ohhhhhhhho  ', 3: ' ohhhhhhhhhho ', 4: ' ohhhhhhhhhho ', 5: ' ohhhhhhhhhho ', 6: ' ohhhhhhhhhho ', 7: ' ohhhhhhhhhho ', 8: ' ohhhhhhhhhho ', 9: ' ohhhhhhhhhho ', 10: ' ohhhhhhhhhho ', 11: ' ohhhhhhhhhho ', 12: ' ohhhhhhhhhho ', 13: ' ohhhhhhhhhho ', 14: '  oooooooooo  ' } },

    { id: 'wave', name: '웨이브 긴머리',
      down: { 1: '   oooooooo   ', 2: '  ohhhhhhhho  ', 3: ' ohhhhhhhhhho ', 4: ' ohhhhhhhhhho ', 5: ' ohhsssssshho ', 6: ' odhsssssshdo ', 7: ' ohhsesseshho ', 8: ' odhsssssshdo ', 9: ' ohhsssssshho ', 10: ' ohd      dho ', 11: 'ohhd      dhho', 12: ' ohd      dho ', 13: 'ohhd      dhho', 14: ' ooo      ooo ' },
      left: { 1: '   oooooooo   ', 2: '  ohhhhhhhho  ', 3: '  ohhhhhhhhho ', 4: '  ohhhhhhhhho ', 5: '   sssshhhhho ', 6: '   sssshdhhho ', 7: '   sesshhhhho ', 8: '   sssshhdhho ', 9: '   sssshhhhho ', 10: '      ohdhhho ', 11: '      ohhdhhho', 12: '      ohhdhho ', 13: '      ohhhdhho', 14: '       oooooo ' },
      up:   { 1: '   oooooooo   ', 2: '  ohhhhhhhho  ', 3: ' ohhhhhhhhhho ', 4: ' ohhhhdhhhhho ', 5: ' ohhhhhhhdhho ', 6: ' ohhdhhhhhhho ', 7: ' ohhhhhdhhhho ', 8: ' ohhhhhhhhdho ', 9: ' ohdhhhhhhhho ', 10: ' ohhhhdhhhhho ', 11: 'ohhhhhhhdhhhho', 12: ' ohhdhhhhhhho ', 13: 'ohhhhhhdhhhhho', 14: ' oooooooooooo ' } },

    { id: 'pony', name: '포니테일',
      down: { 3: '   hhhhhhhh   ', 4: '   hhhhhhhh   ', 5: '   hhh  hhh   ', 6: '   h      h   ', 7: '     e  e     ' },
      left: { 3: '   hhhhhhhhoo ', 4: '   hhhhhhhhrho', 5: '       hhhhhho', 6: '       hhhhhho', 7: '    e  hhhhhho', 8: '           hho', 9: '           hho', 10: '           oo ' },
      up:   { 3: '   hhhhhhhh   ', 4: '   hhhrrhhh   ', 5: '   hhhddhhh   ', 6: '   shhddhhs   ', 7: '   shhddhhs   ', 8: '   hhhddhhh   ', 9: '     ohdo     ', 10: '     ohdo     ', 11: '     ohho     ', 12: '      oo      ' } },

    { id: 'twin', name: '양갈래',
      down: { 3: '   hhhhhhhh   ', 4: '   hhhhhhhh   ', 5: ' o hhhhhhhh o ', 6: 'ohrh      hrho', 7: 'oh   e  e   ho', 8: 'oh          ho', 9: 'oh          ho', 10: 'oh          ho', 11: ' o          o ' },
      left: { 3: '   hhhhhhhh   ', 4: '   hhhhhhhh   ', 5: '   hh  hhhh o ', 6: '       hhhhrho', 7: '    e  hhhh ho', 8: '            ho', 9: '            ho', 10: '            ho', 11: '            o ' },
      up:   { 3: '   hhhhhhhh   ', 4: '   hhhhhhhh   ', 5: ' o hhhhhhhh o ', 6: 'ohrhhhhhhhhrho', 7: 'oh shhhhhhs ho', 8: 'oh hhhhhhhh ho', 9: 'oh          ho', 10: 'oh          ho', 11: ' o          o ' } },

    { id: 'bun', name: '똥머리',
      down: { 0: '     oooo     ', 1: '    ohhdho    ', 2: '    ohrrho    ', 3: '   hhhhhhhh   ', 4: '   hhhhhhhh   ', 5: '   h      h   ', 6: '   h      h   ', 7: '     e  e     ' },
      left: { 0: '      oooo    ', 1: '     ohhdho   ', 2: '     ohrrho   ', 3: '   hhhhhhhh   ', 4: '   hhhhhhhh   ', 5: '       hhhh   ', 6: '       hhhh   ', 7: '    e  hhhh   ' },
      up:   { 0: '     oooo     ', 1: '    ohhdho    ', 2: '    ohrrho    ', 3: '   hhhhhhhh   ', 4: '   hhhhhhhh   ', 5: '   hhhhhhhh   ', 6: '   shhhhhhs   ', 7: '   shhhhhhs   ', 8: '   hhhhhhhh   ' } },

    { id: 'braid', name: '한쪽 땋은머리',
      down: { 1: '   oooooooo   ', 2: '  ohhhhhhhho  ', 3: '   hhhhhhhh   ', 4: '   hhhhhhhh   ', 5: '   hhh  hhh   ', 6: ' ohd      h   ', 7: ' odh e  e h   ', 8: ' ohd          ', 9: ' odh          ', 10: ' ohdo         ', 11: ' odho         ', 12: ' orro         ', 13: '  oho         ', 14: '   o          ' },
      left: { 1: '   oooooooo   ', 2: '  ohhhhhhhho  ', 3: '   hhhhhhhh   ', 4: '   hhhhhhhh   ', 5: '   hhh hhhh   ', 6: '       hhhh   ', 7: '    e  hhhh   ', 8: '       hhhh   ', 9: '        ohdo  ', 10: '        odho  ', 11: '        ohdo  ', 12: '        orro  ', 13: '         oo   ' },
      up:   { 1: '   oooooooo   ', 2: '  ohhhhhhhho  ', 3: '   hhhhhhhh   ', 4: '   hhhhhhhh   ', 5: '   hhhhhhhh   ', 6: '   shhhhhhs   ', 7: '   shhhhhhs   ', 8: '   hhhhhhhh   ', 9: '  ohdo        ', 10: '  odho        ', 11: '  ohdo        ', 12: '  orro        ', 13: '   oo         ' } }
  ];
  const BY_ID = new Map(STYLES.map(s => [s.id, s]));

  // 결·그늘 색은 머리 색을 조금 어둡게 해서 만든다
  const darkCache = new Map();
  function darker(hex) {
    let c = darkCache.get(hex);
    if (!c) {
      const n = parseInt(hex.slice(1), 16);
      const f = v => Math.round(v * 0.72);
      c = `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
      darkCache.set(hex, c);
    }
    return c;
  }

  // (x, hy) 는 머리 가운데 열과 머리 꼭대기 줄(scene.js drawPerson 의 cx, hy).
  // pressed 면 모자·왕관에 눌려 머리 위로 솟은 줄(0~2행)을 그리지 않는다.
  function draw(g, x, hy, id, dir, color, pressed) {
    const style = BY_ID.get(id);
    if (!style) return false;
    const grid = style[dir === 'right' ? 'left' : dir] || style.down;
    const flip = dir === 'right';
    const col = { o: OUTLINE, h: color, d: darker(color), r: TIE, s: SKIN, e: EYE };
    for (const key in grid) {
      const row = Number(key);
      if (pressed && row < 3) continue;
      const line = grid[key];
      for (let c = 0; c < line.length; c++) {
        const fill = col[line[c]];
        if (!fill) continue;
        g.fillStyle = fill;
        g.fillRect(x - 7 + (flip ? 13 - c : c), hy - 3 + row, 1, 1);
      }
    }
    return true;
  }

  PX.hairs = {
    list: STYLES.map(s => ({ id: s.id, name: s.name })),
    has: (id) => BY_ID.has(id),
    draw
  };
})();
