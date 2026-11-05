// 진입점: 화면 배율 맞추기, 장면 루프, 서버 연결(사람·채팅·시세)
(function () {
  const C = PX.config;
  const stage = document.getElementById('stage');
  const canvas = document.getElementById('scene');

  const gridEl = document.getElementById('board-grid');
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
    gridEl.style.setProperty('--cell-font', font.toFixed(1) + 'px');
    const cellW = font * c.wEm + 1;
    const cellH = font * c.hEm + 1;
    const cols = Math.max(1, Math.min(c.maxCols, Math.floor(gridEl.clientWidth / cellW)));
    const rows = Math.max(1, Math.min(c.maxRows, Math.floor(gridEl.clientHeight / cellH)));
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

  board = PX.createBoard({
    gridEl,
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
  const frameMs = 1000 / C.renderFps;
  let last = performance.now();

  const hintEl = document.getElementById('hint');
  const HINTS = {
    free: '방향키로 이동 · 빈 의자에 붙어 바라보고 Space 로 앉기 · Enter 로 채팅',
    near: 'Space 로 앉기',
    seated: 'Space 또는 ↓ ← → 로 일어나기'
  };
  let hintState = 'free';

  // 탭이 숨겨지면 rAF 가 멈추므로 별도 일시정지 처리는 필요 없다
  function loop(now) {
    requestAnimationFrame(loop);
    if (now - last < frameMs - 1) return;
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    scene.update(dt);
    scene.render();
    chat.update(now);

    const state = scene.prompt();
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
      hintEl.textContent = HINTS[state];
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

  const net = PX.createNet({
    url: (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws',
    onState(state) {
      onlineEl.dataset.state = state;
      if (state === 'connecting') onlineEl.textContent = '연결 중';
      if (state === 'closed') onlineEl.textContent = '연결 끊김 · 재접속 대기';
    },
    handlers: {
      welcome(msg) {
        // 재접속이면 이전 사람들의 말풍선·닉네임표를 먼저 치운다
        for (const [id] of scene.net.names()) chat.remove(id);
        myId = msg.me.id;
        scene.net.welcome(msg.me, msg.users);
        chat.setName('me', msg.me.name);
        for (const u of msg.users) chat.setName(u.id, u.name);
        applyMarket(msg.market);
        refreshOnline();
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
        for (const [id, x, y, dir, moving] of msg.list) {
          if (id !== myId) scene.net.move(id, x, y, dir, moving);
        }
      },
      sit(msg) { if (msg.id !== myId) scene.net.sit(msg.id, msg.seat); },
      stand(msg) { if (msg.id !== myId) scene.net.stand(msg.id, msg.x, msg.y, msg.dir); },
      sitDenied() { scene.net.sitDenied(); },
      chat(msg) { chat.say(whoOf(msg.id), msg.text); },

      symbols(msg) { board.setSymbols(msg.symbols); },
      ticks(msg) { board.push(msg.ticks); },
      indices(msg) { board.setIndices(msg.indices); },
      ticker(msg) { board.setTicker(msg.text); },
      status(msg) { board.setStatus(msg.text, msg.live); }
    }
  });

  scene.hooks.onSit = (seat) => net.send({ t: 'sit', seat });
  scene.hooks.onStand = (x, y, dir) => net.send({ t: 'stand', x, y, dir });
  chat.onSend = (text) => net.send({ t: 'chat', text });

  // 내 위치는 0.1초마다, 바뀌었을 때만 보낸다
  let sent = '';
  setInterval(() => {
    const p = scene.player;
    if (!p.active || p.seat) return;
    const key = `${Math.round(p.x * 10)},${Math.round(p.y * 10)},${p.dir},${p.moving ? 1 : 0}`;
    if (key === sent) return;
    sent = key;
    net.send({ t: 'move', x: Math.round(p.x * 10) / 10, y: Math.round(p.y * 10) / 10, dir: p.dir, moving: p.moving });
  }, 100);

  // ---------- 입장 화면 ----------

  const joinEl = document.getElementById('join');
  const joinName = document.getElementById('join-name');
  const NAME_KEY = 'pixel-exchange.name';

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
})();
