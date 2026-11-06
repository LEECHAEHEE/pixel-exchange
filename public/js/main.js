// 진입점: 화면 배율 맞추기, 장면 루프, 서버 연결(사람·채팅·시세)
(function () {
  const C = PX.config;
  const stage = document.getElementById('stage');
  const canvas = document.getElementById('scene');

  // X 키로 화면 전체를 까맣게 가렸다가 다시 X 로 되돌린다.
  // 캐릭터·채팅·상점보다 먼저 키를 받아야 해서 다른 키 처리보다 가장 먼저 등록한다.
  // 한/영이 한글이어도(ㅌ) 키 위치(code)로 판단한다. 입력칸이 아니면 글자 조합은 신경 쓸 필요가 없다.
  const coverEl = document.getElementById('cover');
  // 가림 화면을 켜고 끌 때 서버에 알린다(idle). 서버 연결은 아래에서 만들고 이 자리를 채운다.
  let onCoverChange = () => {};
  window.addEventListener('keydown', (e) => {
    const t = e.target;
    const typing = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
    if (e.code === 'KeyX' && !typing && !e.repeat) {
      coverEl.hidden = !coverEl.hidden;
      if (!coverEl.hidden) {
        PX.scene && PX.scene.releaseKeys();
        if (document.activeElement) document.activeElement.blur();
      }
      onCoverChange();
      e.preventDefault();
      e.stopImmediatePropagation();
      return;
    }
    // 가려져 있는 동안에는 다른 키가 캐릭터·채팅·상점으로 가지 않게 한다
    if (!coverEl.hidden) {
      e.preventDefault();
      e.stopImmediatePropagation();
    }
  }, true);

  // 조작 방법 창(Esc). 상점·인벤토리·감정표현 판이 Esc 로 닫힐 때 따라 열리지 않도록
  // 그 창들보다 먼저 키를 받게 여기서 만든다(그 창들은 아래에서 만들어져 PX 에 등록된다).
  const help = PX.createHelp({
    canOpen: () => document.getElementById('join').hidden
      && !(PX.shop && PX.shop.open) && !(PX.inventory && PX.inventory.open) && !(PX.emote && PX.emote.open)
  });
  document.getElementById('hint').addEventListener('click', () => help.toggle());

  // 종목 칸은 지수 패널 좌우로 두 묶음이다
  const gridEls = [document.getElementById('board-grid-left'), document.getElementById('board-grid-right')];
  let scale = 1;
  let seatedView = false;
  let board = null;

  // 도트가 뭉개지지 않도록 2배 이상이면 정수 배율만 쓴다
  function fit() {
    // 아래 40px 은 채팅 입력줄 자리
    const avail = Math.min(window.innerWidth / C.width, (window.innerHeight - 40) / C.height);
    scale = avail >= 2 ? Math.floor(avail) : Math.max(1, avail);
    stage.style.setProperty('--s', scale);
    stage.style.setProperty('--ps', scale);
    stage.style.width = C.width * scale + 'px';
    stage.style.height = C.height * scale + 'px';
    layoutGrid();
  }

  // 종목 글자는 읽기 좋은 크기 범위에서만 키우고, 남는 자리는 칸 수를 늘려 채운다.
  // 그래서 큰 화면일수록 더 많은 종목이 보인다.
  function layoutGrid() {
    if (!board) return;
    const c = C.cell;
    const font = Math.min(c.maxFont, Math.max(c.minFont, c.fontPerScale * scale)) * (seatedView ? c.seatedBoost : 1);
    for (const el of gridEls) el.style.setProperty('--cell-font', font.toFixed(1) + 'px');
    const cellW = font * c.wEm + 1;
    const cellH = font * c.hEm + 1;
    // 좌우 묶음 폭이 같으므로 한쪽 기준으로 열 수를 정하고 양쪽에 똑같이 둔다
    const perSide = Math.max(1, Math.min(Math.floor(c.maxCols / gridEls.length), Math.floor(gridEls[0].clientWidth / cellW)));
    const cols = perSide * gridEls.length;
    const rows = Math.max(1, Math.min(c.maxRows, Math.floor(gridEls[0].clientHeight / cellH)));
    board.resize(cols, rows);
  }

  let resizeTimer = 0;
  window.addEventListener('resize', () => {
    // 창 크기를 끄는 동안 칸을 매번 다시 만들지 않도록 멈춘 뒤 한 번만 계산
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(fit, 120);
  });

  // 오버레이 위치를 config 좌표에서 가져와 캔버스 프레임과 어긋나지 않게 한다
  function place(el, r) {
    el.style.setProperty('--x', r.x);
    el.style.setProperty('--y', r.y);
    el.style.setProperty('--w', r.w);
    el.style.setProperty('--h', r.h);
    if (r.k) el.style.setProperty('--k', r.k);
  }
  const boardEl = document.getElementById('board');
  place(boardEl, C.board);
  place(document.querySelector('.sign'), C.sign);

  // 장소별 안내 글씨. 장소를 옮길 때 그 장소 것만 보인다.
  const labelEls = C.labels.map((l) => {
    const el = document.createElement('div');
    el.className = 'label' + (l.cls ? ' ' + l.cls : '');
    el.textContent = l.text;
    el.dataset.map = l.map;
    place(el, l);
    stage.insertBefore(el, boardEl);
    return el;
  });
  // 코인 거래소 전광판. 아직 시세를 받지 않아 코인 이름과 빈 값만 있다.
  const coinBoardEl = document.createElement('section');
  coinBoardEl.className = 'coin-board';
  coinBoardEl.setAttribute('aria-label', '코인 전광판');
  coinBoardEl.innerHTML = '<div class="coin-grid"></div><div class="coin-foot"></div>';
  for (const [sym, name] of C.coins) {
    const cell = document.createElement('div');
    cell.className = 'coin-cell';
    cell.innerHTML = '<b></b><span>—</span>';
    cell.children[0].textContent = `${name} ${sym}`;
    coinBoardEl.firstChild.appendChild(cell);
  }
  coinBoardEl.lastChild.textContent = '코인 시세 준비 중';
  place(coinBoardEl, C.board);
  stage.insertBefore(coinBoardEl, boardEl);

  // 객장 오른쪽 끝에 다가가면 뜨는 '코인 →' 안내. 도트 동전이 빙글빙글 돌고 안내 전체가 둥둥 뜬다.
  const coinHintEl = document.createElement('div');
  coinHintEl.className = 'coin-hint';
  coinHintEl.hidden = true;
  coinHintEl.innerHTML = '<canvas width="9" height="9"></canvas><span>코인 →</span>';
  {
    // 9x9 금화: 테두리·안쪽 테 · 가운데 무늬 · 왼쪽 위 반짝임
    const cg = coinHintEl.firstChild.getContext('2d');
    const dot = (x, y, w, h, c) => { cg.fillStyle = c; cg.fillRect(x, y, w, h); };
    dot(2, 0, 5, 9, '#7a5410'); dot(0, 2, 9, 5, '#7a5410'); dot(1, 1, 7, 7, '#7a5410');
    dot(2, 1, 5, 7, '#f3c53a'); dot(1, 2, 7, 5, '#f3c53a');
    dot(3, 2, 3, 5, '#d89a1e'); dot(2, 3, 5, 3, '#d89a1e');
    dot(4, 3, 1, 3, '#fff1a8');
    dot(2, 2, 1, 1, '#fff8d0');
  }
  place(coinHintEl, C.coinHint);
  stage.insertBefore(coinHintEl, boardEl);

  // 장소에 딸린 DOM 오버레이. 장소를 옮기며 화면이 밀릴 때 같은 양만큼 함께 민다.
  const mapEls = [
    { el: boardEl, map: 'exchange' },
    { el: document.querySelector('.sign'), map: 'exchange' },
    { el: coinHintEl, map: 'exchange' },
    { el: coinBoardEl, map: 'coin' },
    ...labelEls.map(el => ({ el, map: el.dataset.map }))
  ];

  let shownMap = '';
  let sliding = false;
  function showMap(map) {
    const sl = scene.slide;
    if (map === shownMap && !sl && !sliding) return;
    shownMap = map;
    stage.dataset.map = map;
    if (sl) {
      // 떠난 장소와 새 장소의 오버레이를 함께 보이고 화면과 같이 민다
      stage.dataset.slide = sl.from + ' ' + sl.to;
      for (const { el, map: m } of mapEls) {
        el.style.setProperty('--dx', m === sl.from ? sl.dxFrom : m === sl.to ? sl.dxTo : 0);
        if (el.classList.contains('label')) el.hidden = m !== sl.from && m !== sl.to;
      }
      sliding = true;
      return;
    }
    sliding = false;
    delete stage.dataset.slide;
    for (const { el } of mapEls) el.style.removeProperty('--dx');
    for (const el of labelEls) el.hidden = el.dataset.map !== map;
  }

  board = PX.createBoard({
    gridEls,
    indicesEl: document.getElementById('board-indices'),
    statusEl: document.getElementById('board-status'),
    clockEl: document.getElementById('board-clock'),
    dateEl: document.getElementById('board-date'),
    tickerEl: document.getElementById('board-ticker'),
    flashMs: C.flashMs,
    indexNames: C.indices,
    tickerIdle: C.tickerIdle
  });
  fit();

  const scene = PX.createScene(canvas);
  const chat = PX.createChat({
    stage,
    form: document.getElementById('chat-form'),
    input: document.getElementById('chat-input'),
    scene,
    getScale: () => scale,
    durationMs: C.chat.durationMs,
    maxLength: C.chat.maxLength
  });
  // 상점 주인: 말을 걸면 대화창 → 구매한다 / 나간다 → 상점 창
  const shop = PX.createShop({ stage, name: scene.shopkeeperName });
  chat.setName('shop', scene.shopkeeperName);
  chat.setName('keeper', '경마장 관리인');
  scene.hooks.onTalk = () => shop.talk();
  shop.onOpen = () => {
    scene.setLocked(true);
    chat.say('shop', '어서 오세요!');
  };
  shop.onClose = (reason) => {
    scene.setLocked(false);
    chat.say('shop', reason === 'shop' ? '감사합니다. 또 오세요!' : '안녕히 가세요!');
  };

  // 경마: 경마장 가운데 전광판과 말 위치
  const race = PX.createRace({ stage, scene });
  place(race.el, C.racePanel);
  PX.race = race;
  // 인벤토리(I): 상점에서 산 아이템을 보관하고 입는다. 착용은 서버로 알려 다른 사람에게도 보이게 한다.
  // 감정표현 판(C)은 아래에서 만든다. 인벤토리가 열 수 있는지 판단할 때 함께 본다.
  let emote = null;
  const inventory = PX.createInventory({
    getBaseLook: () => scene.player.baseLook,
    canOpen: () => scene.player.active && !shop.open && !(emote && emote.open)
  });
  // 구매는 서버가 잔액을 확인한다. 결과는 아래 inv 메시지로 온다. net 은 아래에서 만들지만 구매는 입장 뒤에만 일어난다.
  shop.onBuy = (item) => net.send({ t: 'buy', id: item.id });
  shop.isOwned = (id) => inventory.has(id);
  scene.setMyEquip(inventory.equipped);
  inventory.onOpen = () => scene.setLocked(true);
  inventory.onClose = () => scene.setLocked(false);
  // onEquip 은 서버 연결(net)을 만든 뒤 아래에서 연결한다

  // 감정표현(C): 채팅 입력줄 자리에 방향키 판. ↑ 인사.
  emote = PX.createEmote({
    chatForm: document.getElementById('chat-form'),
    canOpen: () => scene.player.active && !shop.open && !inventory.open
  });

  const frameMs = 1000 / C.renderFps;
  let last = performance.now();

  const hintEl = document.getElementById('hint');
  const HINTS = {
    free: '[Esc] 조작 방법',
    near: 'Space 로 앉기',
    talk: 'Space 로 상점 주인에게 말 걸기',
    seated: 'Space 또는 ↓ ← → 로 일어나기',
    'crossroad:free': '↑ 객장 · ↓ 경마장 · ← 풋살장 · → 마피아존 · [Esc] 조작 방법',
    'coin:free': '← 객장 · [Esc] 조작 방법',
    // 풋살장은 팀·공 상태로 고른다(futsal.prompt)
    'futsal:lobby': '팀을 골라 참가하세요 · 풋살장에서는 방향키로만 이동 · [Esc] 조작 방법',
    'futsal:team': 'START 로 경기 시작 · 경기 중 방향키 이동, S 패스, D 슛',
    'futsal:play': '방향키 이동 · 공에 닿으면 드리블 · 공이 없을 때 S·D 는 태클',
    'futsal:ball': 'S 패스 · D 누르고 있다 떼면 슛(오래 누를수록 세게) · 방향키 드리블',
    'futsal:watch': '벤치에서 관전 중 · 경기가 끝나면 팀 참가 가능 · 오른쪽 아래 문으로 나가기',
    'racetrack:free': '1~5 키·전광판 클릭으로 우승마 투표 · [Esc] 조작 방법',
    'racetrack:steal': 'Space 로 말 훔쳐 타기 · 관리인에게 잡히면 뺏긴다! 경마장 밖으로 달아나자',
    'racetrack:return': 'Space 로 말 돌려놓기',
    'racetrack:empty': '빈 칸입니다. 누가 말을 훔쳐 갔어요',
    // 말 탄 채 아무것도 바라보지 않을 때. 이 장소 문구가 없으면 그 장소의 free 문구를 쓴다.
    ride: 'F 로 앞발차기 · [Esc] 조작 방법',
    'crossroad:ride': 'F 로 앞발차기 · ↑ 객장 · ↓ 경마장 · ← 풋살장 · → 마피아존',
    'racetrack:ride': 'F 로 앞발차기 · 관리인에게 잡히면 뺏긴다! 경마장 밖으로 달아나자'
  };
  let hintState = 'free';

  // 탭이 숨겨지면 rAF 가 멈추므로 별도 일시정지 처리는 필요 없다
  function loop(now) {
    requestAnimationFrame(loop);
    if (now - last < frameMs - 1) return;
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    scene.update(dt);
    // 풋살 공 자리는 그리기 전에 맞춘다(드리블 공은 주인 발 앞에 붙는다)
    futsal.setMap(scene.map);
    futsal.update(dt);
    scene.render();
    chat.update(now);
    race.update();

    showMap(scene.map);
    // 객장에서 오른쪽 끝에 다가갔을 때만(앉아 있지 않을 때) '코인 →' 안내를 띄운다. 밀리는 중에는 떠 있던 그대로 같이 밀린다.
    const nearCoin = scene.slide ? !coinHintEl.hidden
      : scene.map === 'exchange' && !scene.seatedView && scene.player.active && scene.player.x > C.coinHint.nearX;
    if (coinHintEl.hidden === nearCoin) coinHintEl.hidden = !nearCoin;
    mafia.setMap(scene.map);
    const state = scene.map === 'exchange' ? scene.prompt()
      : scene.map === 'futsal' ? 'futsal:' + futsal.prompt()
      : scene.map + ':' + scene.prompt();
    if (state !== hintState) {
      // 앉으면 전광판을 크게, 일어나면 원래 자리로
      const seated = state === 'seated';
      if (seated !== (hintState === 'seated')) {
        place(boardEl, seated ? C.boardSeated : C.board);
        stage.classList.toggle('seated', seated);
        seatedView = seated;
        layoutGrid();
      }
      hintState = state;
      hintEl.textContent = HINTS[state] ?? HINTS[state.replace(/ride$/, 'free')];
    }
  }
  requestAnimationFrame(loop);

  // ---------- 서버 ----------

  const onlineEl = document.getElementById('online');
  let myId = null;

  function whoOf(id) {
    return id === myId ? 'me' : id;
  }

  function refreshOnline() {
    onlineEl.textContent = '접속 ' + scene.net.count + '명';
  }

  function applyMarket(m) {
    if (m.symbols && m.symbols.length) board.setSymbols(m.symbols);
    if (m.ticks && m.ticks.length) board.push(m.ticks);
    if (m.indices && m.indices.length) board.setIndices(m.indices);
    if (m.ticker !== undefined) board.setTicker(m.ticker);
    if (m.status) board.setStatus(m.status.text, m.status.live);
  }

  // 마피아존 UI (scene.map==='mafiazone' 일 때만 보인다). mz* 메시지를 처리한다.
  const mafia = PX.createMafia({ scene, chat, whoOf, send: (m) => net.send(m) });
  PX.mafia = mafia;
  // 풋살장 UI (scene.map==='futsal' 일 때만 보인다). fs* 메시지를 처리하고 공을 그릴 상태를 places.js 에 준다.
  const futsal = PX.createFutsal({ stage, scene, chat, whoOf, send: (m) => net.send(m), place });
  PX.futsal = futsal;

  const net = PX.createNet({
    url: (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws',
    // uid 로 서버의 유저 기록을 찾는다. local 은 기록을 처음 만들 때 옮겨 줄 이 브라우저의 인벤토리.
    joinExtra: () => ({ uid: browserId(), local: inventory.local() }),
    onState(state) {
      onlineEl.dataset.state = state;
      if (state === 'connecting') onlineEl.textContent = '연결 중';
      if (state === 'closed') onlineEl.textContent = '연결 끊김 · 재접속 대기';
    },
    handlers: Object.assign({}, mafia.handlers, futsal.handlers, {
      welcome(msg) {
        // 재접속이면 이전 사람들의 말풍선·닉네임표를 먼저 치운다
        for (const [id] of scene.net.names()) chat.remove(id);
        myId = msg.me.id;
        if (msg.inv) {
          inventory.setState(msg.inv);
          shop.setBalance(msg.inv.balance);
        }
        scene.net.welcome(msg.me, msg.users);
        chat.setName('me', msg.me.name);
        for (const u of msg.users) chat.setName(u.id, u.name);
        chat.setLog(msg.history || []);
        scene.net.dog(msg.dog);
        applyMarket(msg.market);
        if (msg.race) race.apply(msg.race);
        scene.net.stable(msg.stable);
        refreshOnline();
        // 새 연결은 서버에서 '보는 중' 으로 시작하므로, 숨김·가림 상태면 다시 알린다
        idleSent = false;
        reportIdle();
      },
      // 장소에 들어왔거나 다시 볼 때 그 장소의 현재 모습. 안 보는 동안 놓친 위치·강아지·시세를 맞춘다.
      sync(msg) {
        for (const [id, x, y, dir, moving, seat] of msg.people || []) {
          if (id !== myId) scene.net.snap(id, msg.map, x, y, dir, moving, seat);
        }
        if (msg.dog) scene.net.dog(msg.dog);
        if (msg.market) applyMarket(msg.market);
        if (msg.stable) scene.net.stable(msg.stable);
        if (msg.futsal) futsal.apply(msg.futsal);
      },
      join(msg) {
        scene.net.add(msg.user);
        chat.setName(msg.user.id, msg.user.name);
        refreshOnline();
      },
      leave(msg) {
        scene.net.remove(msg.id);
        chat.remove(msg.id);
        refreshOnline();
      },
      moves(msg) {
        for (const [id, x, y, dir, moving, face] of msg.list) {
          if (id !== myId) scene.net.move(id, x, y, dir, moving, face);
        }
      },
      sit(msg) { if (msg.id !== myId) scene.net.sit(msg.id, msg.seat); },
      stand(msg) { if (msg.id !== myId) scene.net.stand(msg.id, msg.x, msg.y, msg.dir); },
      sitDenied() { scene.net.sitDenied(); },
      go(msg) { if (msg.id !== myId) scene.net.go(msg.id, msg.map, msg.x, msg.y, msg.dir); },
      equip(msg) { if (msg.id !== myId) scene.net.equip(msg.id, msg.equip); },
      // 서버가 바꾼(또는 바로잡은) 내 인벤토리. 구매 결과도 여기에 실려 온다.
      inv(msg) {
        inventory.setState(msg);
        scene.setMyEquip(inventory.equipped);
        shop.setBalance(msg.balance);
        const item = msg.bought && PX.items.byId(msg.bought);
        if (item) shop.result(`${item.name} 구매 완료 (${item.price.toLocaleString('ko-KR')}원) · I 로 인벤토리에서 입어 보세요`);
        else if (msg.reason) shop.result(msg.reason);
      },
      emote(msg) { if (msg.id !== myId) scene.playEmote(msg.id, msg.emote); },
      // 강아지가 새 주인을 만나면 짖는다
      dog(msg) { if (scene.net.dog(msg) && msg.owner) chat.say('dog', '멍!'); },
      // 말을 훔쳐 탔다(stall)·돌려놓았다·관리인에게 뺏겼다(stall null)
      mount(msg) {
        scene.net.mount(whoOf(msg.id), msg.stall);
        if (msg.why === 'futsal' && msg.id === myId) futsal.handlers.fsSys({ text: '풋살장에는 말을 타고 들어올 수 없어요. 말은 마굿간으로 돌아갔습니다.' });
      },
      keeper(msg) { scene.net.keeper(msg); },
      keeperSay(msg) { chat.say('keeper', msg.text); },
      // 말 탄 사람의 앞발차기. 내가 찼으면 앞발 드는 모습은 이미 그렸고, 맞은 사람만 넘어뜨린다.
      hoof(msg) { scene.hoof(whoOf(msg.id), msg.dir, (msg.hits || []).map(([id, side]) => [whoOf(id), side])); },
      chat(msg) {
        chat.say(whoOf(msg.id), msg.text);
        chat.addLog(msg.name || '?', msg.text);
      },

      race(msg) { race.apply(msg); },
      raceVotes(msg) { race.setCounts(msg.counts); },
      raceVote(msg) { race.setMine(msg.horse, msg.reason); },

      symbols(msg) { board.setSymbols(msg.symbols); },
      ticks(msg) { board.push(msg.ticks); },
      indices(msg) { board.setIndices(msg.indices); },
      ticker(msg) { board.setTicker(msg.text); },
      status(msg) { board.setStatus(msg.text, msg.live); }
    })
  });

  scene.hooks.onSit = (seat) => net.send({ t: 'sit', seat });
  inventory.onEquip = (ids) => {
    scene.setMyEquip(ids);
    net.send({ t: 'equip', equip: ids });
  };
  emote.onEmote = (type) => {
    scene.playEmote('me', type);
    net.send({ t: 'emote', emote: type });
  };
  scene.hooks.onStand = (x, y, dir) => net.send({ t: 'stand', x, y, dir });
  scene.hooks.onGo = (map, x, y, dir) => net.send({ t: 'go', map, x, y, dir });
  scene.hooks.onStable = (act, stall) => net.send({ t: 'stable', act, stall });
  scene.hooks.onHoof = (dir) => net.send({ t: 'hoof', dir });
  chat.onSend = (text) => net.send({ t: 'chat', text });
  race.onVote = (horse) => net.send({ t: 'vote', horse });

  // 내 위치는 0.1초마다, 바뀌었을 때만 보낸다. 지금 장소(map)도 함께 실어, 연결이 잠깐 끊긴 사이
  // 장소 이동(go)이 빠졌어도 서버가 내 장소를 바로잡게 한다.
  let sent = '';
  setInterval(() => {
    const p = scene.player;
    if (!p.active || p.seat) return;
    // 풋살장에서는 대각선 드리블을 위해 바라보는 8방향(f)도 보낸다
    const f = scene.map === 'futsal' && p.face != null ? p.face : undefined;
    const key = `${scene.map},${Math.round(p.x * 10)},${Math.round(p.y * 10)},${p.dir},${p.moving ? 1 : 0},${f}`;
    if (key === sent) return;
    sent = key;
    net.send({ t: 'move', map: scene.map, x: Math.round(p.x * 10) / 10, y: Math.round(p.y * 10) / 10, dir: p.dir, moving: p.moving, f });
  }, 100);

  // 탭이 숨겨졌거나 X 로 가렸으면 화면이 안 보이므로 서버에 알려 위치·강아지·시세를 받지 않는다.
  // 다시 보이면 서버가 sync 로 지금 모습을 한 번에 보내 준다.
  let idleSent = false;
  function reportIdle() {
    const on = document.hidden || !coverEl.hidden;
    if (on === idleSent) return;
    idleSent = on;
    net.send({ t: 'idle', on });
  }
  document.addEventListener('visibilitychange', reportIdle);
  onCoverChange = reportIdle;

  // 무료 호스팅(Render)은 들어오는 메시지가 15분 없으면 서버를 재운다.
  // 모두 앉아서 전광판만 보고 있어도 깨어 있도록 4분마다 작은 신호를 보낸다.
  setInterval(() => net.send({ t: 'ping' }), 4 * 60 * 1000);

  // ---------- 입장 화면 ----------

  const joinEl = document.getElementById('join');
  const joinName = document.getElementById('join-name');
  const NAME_KEY = 'pixel-exchange.name';
  const UID_KEY = 'pixel-exchange.uid';
  let uid = null;

  // 브라우저 고유 번호. 서버는 이 번호로 유저 기록(아이템·잔액)을 찾는다.
  // 저장소를 못 쓰면 이번 접속 동안만 같은 번호를 쓴다(다음에는 새 사람으로 보인다).
  function browserId() {
    if (uid) return uid;
    try { uid = localStorage.getItem(UID_KEY); } catch { /* 없어도 동작한다 */ }
    if (!uid) {
      uid = crypto.randomUUID ? crypto.randomUUID()
        : Array.from(crypto.getRandomValues(new Uint8Array(16)), b => b.toString(16).padStart(2, '0')).join('');
      try { localStorage.setItem(UID_KEY, uid); } catch { /* 없어도 동작한다 */ }
    }
    return uid;
  }

  // 지난번 닉네임을 채워 둔다. 저장소를 못 쓰는 환경(사생활 보호 모드 등)이면 그냥 넘어간다.
  try { joinName.value = localStorage.getItem(NAME_KEY) || ''; } catch { /* 없어도 동작한다 */ }
  joinName.focus();

  document.getElementById('join-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const name = joinName.value.trim();
    try { localStorage.setItem(NAME_KEY, name); } catch { /* 없어도 동작한다 */ }
    joinEl.hidden = true;
    joinName.blur();
    net.connect(name);
  });

  PX.board = board;
  PX.scene = scene;
  PX.chat = chat;
  PX.net = net;
  PX.shop = shop;
  PX.inventory = inventory;
  PX.emote = emote;
  PX.help = help;
})();
