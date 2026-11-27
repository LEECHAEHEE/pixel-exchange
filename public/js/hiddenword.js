// 히든 워드 게임장 UI. scene.map 이 'hiddenword' 일 때만 보인다.
// 서버(server/hiddenword.js)가 보내는 hwState 를 그대로 그리고, 방석 위에 서면 앉았다고 알린다.
// 게임 중 참가자는 자기 방석 밖으로 못 나간다(places.js 의 confine 이 allowed 를 묻는다).
(function () {
  const PHASE_KO = { lobby: '대기 중', countdown: '곧 시작', pick: '히든 워드 고르기', hint: '힌트', auto: '핵심 단어 찾는 중', guess: '정답 제출', reveal: '정답 공개', end: '게임 끝' };
  const MIN_PLAYERS = 3;
  const MAX_HINTS = 10;

  // 도트 눈 아이콘(11 x 7). # 은 테두리, o 는 눈동자, . 은 흰자, 공백은 투명.
  // 감은 눈과 뜬 눈을 겹쳐 두고 CSS 가 마우스를 올렸는지에 따라 하나만 보인다.
  const EYE_OPEN = [
    '   #####   ',
    ' ##.....## ',
    '#...ooo...#',
    '#..ooooo..#',
    '#...ooo...#',
    ' ##.....## ',
    '   #####   '
  ];
  const EYE_SHUT = [
    '           ',
    '           ',
    '#         #',
    ' ##     ## ',
    '   #####   ',
    '  #  #  #  ',
    '           '
  ];
  const EYE_COL = { '#': '#e9e5da', '.': '#2b2f4a', o: '#ffe27a' };
  function eyeRects(rows, cls) {
    let s = `<g class="${cls}">`;
    rows.forEach((row, y) => {
      for (let x = 0; x < row.length; x++) {
        const c = EYE_COL[row[x]];
        if (c) s += `<rect x="${x}" y="${y}" width="1" height="1" fill="${c}"/>`;
      }
    });
    return s + '</g>';
  }
  const EYE_SVG = `<svg viewBox="0 0 11 7" shape-rendering="crispEdges" aria-hidden="true">${eyeRects(EYE_SHUT, 'shut')}${eyeRects(EYE_OPEN, 'open')}</svg>`;

  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  function createHiddenWord({ stage, scene, chat, send, place }) {
    const HW = PX.places.hiddenword.hw;

    // ---------- DOM ----------
    const root = el('div');
    root.id = 'hw-ui';
    root.hidden = true;
    root.innerHTML = `
      <div class="hw-board"><ol class="hw-hints"></ol></div>
      <div class="hw-me">
        <div class="hw-stat"><div class="hw-stxt"><div class="hw-phase"></div><div class="hw-who"></div></div><b class="hw-timer"></b></div>
        <div class="hw-mine"></div>
      </div>
      <div class="hw-score"></div>
      <div class="hw-center" hidden></div>
      <form class="hw-input" hidden><input maxlength="12" autocomplete="off" spellcheck="false"><button type="submit">내기</button></form>
      <div class="hw-toast" hidden></div>`;
    stage.appendChild(root);
    const $ = (s) => root.querySelector(s);
    const boardEl = $('.hw-board'), hintsEl = $('.hw-hints');
    const meEl = $('.hw-me'), phaseEl = $('.hw-phase'), whoEl = $('.hw-who'), timerEl = $('.hw-timer'), mineEl = $('.hw-mine');
    const scoreEl = $('.hw-score'), centerEl = $('.hw-center');
    const formEl = $('.hw-input'), inputEl = formEl.querySelector('input'), toastEl = $('.hw-toast');
    // 전광판 자리는 places.js 가 그리는 금테(HW.board) 안쪽과 맞춘다
    place(boardEl, HW.board);
    place(meEl, { x: 2, y: 3, w: 80, h: 40 });
    place(scoreEl, { x: 260, y: 3, w: 58, h: 40 });
    place(centerEl, { x: 98, y: 76, w: 124, h: 68 });
    place(formEl, { x: 96, y: 161, w: 128, h: 13 });
    place(toastEl, { x: 80, y: 48, w: 160, h: 9 });

    // ---------- 상태 ----------
    let inZone = false;
    let myId = null;
    let st = { phase: 'lobby', endsAt: 0, seats: [], players: [], order: [], setter: null, hints: [], key: null, guessed: [] };
    let envelope = [];
    let mine = null;
    let sentSeat = null;
    let toastTimer = 0;
    let inputMode = '';

    const inGame = () => !['lobby', 'countdown'].includes(st.phase);
    const meP = () => st.players.find(p => p.id === myId);
    const nameOf = (id) => { const p = st.players.find(q => q.id === id); return p ? p.name : ''; };

    // ---------- 방석 ----------
    function seatUnder(p) {
      return HW.seats.findIndex(s => Math.hypot(p.x - s.x, p.y - s.y) <= HW.seatR);
    }

    // 방석 위에 '올라선 순간'과 '내려온 순간'에만 알린다. 게임이 끝나 자리가 비워져도 서 있는 것만으로는 다시 앉지 않는다.
    function update() {
      if (!inZone || !scene.player.active || inGame()) return;
      const i = seatUnder(scene.player);
      const seat = i >= 0 ? i : null;
      if (seat === sentSeat) return;
      sentSeat = seat;
      // 위치 소식(move)은 0.1초마다 모아 보내 이 메시지보다 늦을 수 있으므로 지금 발 위치를 함께 보낸다
      send({ t: 'hwSeat', seat, x: Math.round(scene.player.x), y: Math.round(scene.player.y) });
    }

    function allowed(x, y) {
      if (!inGame()) return true;
      const p = meP();
      const i = st.seats.indexOf(myId);
      if (!p || p.gone || i < 0) return true;
      const s = HW.seats[i];
      return Math.hypot(x - s.x, y - s.y) <= HW.seatR;
    }

    // ---------- 그리기 ----------
    // 카운트다운에 보일 숫자(5 → 1)
    function secLeft() {
      return Math.max(1, Math.ceil((st.endsAt - Date.now()) / 1000));
    }

    function fmt(ms) {
      const s = Math.max(0, Math.ceil(ms / 1000));
      return s >= 60 ? Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0') : s + '초';
    }

    // 왼쪽 칸 위쪽: 지금 단계(굵은 한 줄)와 누구 차례인지(한두 줄), 오른쪽에 남은 시간
    function renderStatus() {
      const s = st, who = nameOf(s.setter);
      let phase = PHASE_KO[s.phase] || s.phase, sub = '';
      // 시작 카운트다운은 가운데 전광판에만 보이고 왼쪽 칸은 비워 둔다
      if (s.phase === 'countdown') phase = '';
      else if (s.phase === 'lobby') sub = `방석 ${s.seats.filter(Boolean).length}/6\n${MIN_PLAYERS}명부터 시작`;
      else if (s.phase === 'pick') {
        const n = s.players.filter(q => !q.gone).length, k = s.players.filter(q => q.picked && !q.gone).length;
        sub = `${k}/${n}명 골랐음`;
      } else if (s.phase === 'hint') {
        phase = `${who} 님 출제`;
        sub = `힌트 ${s.hints.length}/${MAX_HINTS}` + (s.scoring ? '\n유사도 계산 중' : '');
      } else if (s.phase === 'auto') { phase = `${who} 님 출제`; sub = 'AI 가 가장 가까운\n단어를 고르는 중'; }
      else if (s.phase === 'guess' || s.phase === 'reveal') sub = `${who} 님의\n히든 워드`;
      else if (s.phase === 'end') sub = '최종 순위';
      phaseEl.textContent = phase;
      whoEl.textContent = sub;
      renderTimer();
    }

    function renderTimer() {
      timerEl.textContent = st.endsAt && st.phase !== 'countdown' ? fmt(st.endsAt - Date.now()) : '';
    }

    function renderBoard() {
      const s = st;
      hintsEl.replaceChildren();
      // 카운트다운 동안은 제목 줄을 숨기고 문구만 전광판 한가운데에 둔다
      boardEl.classList.toggle('countdown', s.phase === 'countdown');
      // 전광판에는 힌트와 시작 카운트다운만 둔다. 진행 안내는 왼쪽 칸(renderStatus)이 맡는다.
      if (s.phase === 'countdown') {
        hintsEl.append(el('li', 'hw-hint wait', `${secLeft()}초 후 게임이 시작됩니다`));
        return;
      }
      // 유사도 높은 순으로 놓고, 가장 최근에 나온 힌트(마지막에는 95% 힌트나 AI 가 고른 단어)를 노란색으로
      const last = s.hints.length - 1;
      const sorted = s.hints.map((h, i) => ({ h, i })).sort((a, b) => b.h.score - a.h.score);
      for (const { h, i } of sorted) {
        hintsEl.append(el('li', 'hw-hint' + (i === last ? ' last' : '') + (h.auto ? ' auto' : ''), `${h.word} [${h.score.toFixed(1)}%]`));
      }
    }

    function renderScore() {
      scoreEl.replaceChildren(el('div', 'hw-shead', st.players.length ? '점수' : '좌석'));
      if (!st.players.length) {
        st.seats.forEach((id, i) => { if (id) scoreEl.append(el('div', 'hw-prow', `${i + 1}. ${nameOf(id) || scene.net.names().find(([x]) => x === id)?.[1] || (id === myId ? '나' : '')}`)); });
        return;
      }
      for (const p of st.players) {
        const row = el('div', 'hw-prow' + (p.gone ? ' gone' : '') + (p.id === st.setter ? ' setter' : ''));
        let mark = '';
        if (p.gone) mark = '나감';
        else if (st.phase === 'pick') mark = p.picked ? '✓' : '…';
        else if (p.id === st.setter && (st.phase === 'hint' || st.phase === 'guess')) mark = '출제';
        else if (st.phase === 'guess' && st.guessed.includes(p.id)) mark = '✓';
        row.append(el('span', 'hw-pn', p.name + (p.id === myId ? '(나)' : '')), el('span', 'hw-pm', mark), el('b', '', String(p.score)));
        scoreEl.append(row);
      }
    }

    // 왼쪽 칸 아래쪽: 내 히든 워드
    function renderMe() {
      mineEl.replaceChildren();
      const p = meP();
      if (p && !p.gone && mine) {
        // 옆 사람이 화면을 봐도 모르게 평소에는 흐리게, 마우스를 올리면 눈을 뜨며 단어가 보인다
        const eye = el('span', 'hw-eye');
        eye.innerHTML = EYE_SVG;
        mineEl.append(el('span', 'hw-mlabel', '내 히든 워드'), el('span', 'hw-mword', mine), eye);
      } else if (p && !p.gone) {
        mineEl.append(el('span', 'hw-mtip', '봉투에서 히든 워드를 고르세요'));
      } else if (inGame()) {
        mineEl.append(el('span', 'hw-mtip', '관전 중 · 끝나면 방석에 앉아 참가'));
      } else {
        mineEl.append(el('span', 'hw-mtip', '내 단어는 숨기고 남의 단어를 맞히세요'));
      }
    }

    function renderCenter() {
      const s = st;
      centerEl.replaceChildren();
      let show = true;
      // 카운트다운은 벽 전광판에만 보인다
      if (s.phase === 'pick') {
        const p = meP();
        if (p && !p.gone && !p.picked && envelope.length) {
          centerEl.append(el('div', 'hw-ctitle', '봉투에서 히든 워드를 고르세요'));
          const row = el('div', 'hw-env');
          for (const w of envelope) {
            const b = el('button', '', w);
            b.type = 'button';
            b.addEventListener('click', () => send({ t: 'hwPick', word: w }));
            row.append(b);
          }
          centerEl.append(row);
        } else {
          // 몇 명이 골랐는지는 왼쪽 칸에 나온다
          show = false;
        }
      } else if (s.phase === 'reveal' && s.reveal) {
        const r = s.reveal;
        centerEl.append(el('div', 'hw-ctitle', `정답: ${r.hidden}`));
        const list = el('div', 'hw-glist');
        for (const g of r.guesses) list.append(el('div', 'hw-g' + (g.correct ? ' ok' : ''), `${g.correct ? '○' : '×'} ${g.name}: ${g.word || '(안 씀)'}`));
        centerEl.append(list, el('div', 'hw-csub', r.setterWins ? `아무도 못 맞힘 · ${r.name} 님 +1` : '맞힌 사람 +1'));
      } else if (s.phase === 'end' && s.results) {
        centerEl.append(el('div', 'hw-ctitle', '최종 순위'));
        const list = el('div', 'hw-glist');
        for (const p of s.results) list.append(el('div', 'hw-g' + (p.rank === 1 ? ' ok' : ''), `${p.rank}위 ${p.name} ${p.score}점 · ${p.hidden || ''}`));
        centerEl.append(list);
      } else {
        show = false;
      }
      centerEl.hidden = !show;
    }

    // 지금 내가 낼 수 있는 것: 출제자는 힌트, 나머지 참가자는 정답
    function renderInput() {
      const p = meP();
      let mode = '';
      if (p && !p.gone && st.phase === 'hint' && st.setter === myId && st.hints.length < MAX_HINTS) mode = 'hint';
      if (p && !p.gone && st.phase === 'guess' && st.setter !== myId) mode = 'guess';
      if (mode === inputMode) {
        if (mode === 'hint') formEl.querySelector('button').disabled = !!st.scoring;
        return;
      }
      inputMode = mode;
      formEl.hidden = !mode;
      inputEl.value = '';
      inputEl.placeholder = mode === 'hint' ? '힌트 단어 (명사)' : mode === 'guess' ? '정답이라고 생각하는 단어' : '';
      formEl.querySelector('button').textContent = mode === 'hint' ? '힌트 내기' : '제출';
      if (mode) inputEl.focus();
      else if (document.activeElement === inputEl) inputEl.blur();
    }

    function render() {
      if (!inZone) return;
      renderStatus();
      renderBoard();
      renderScore();
      renderMe();
      renderCenter();
      renderInput();
    }

    setInterval(() => {
      if (!inZone) return;
      renderTimer();
      if (st.phase === 'countdown') renderBoard();
    }, 200);

    formEl.addEventListener('submit', (e) => {
      e.preventDefault();
      const word = inputEl.value.replace(/\s+/g, '');
      if (!word || !inputMode) return;
      send({ t: inputMode === 'hint' ? 'hwHint' : 'hwGuess', word });
      if (inputMode === 'guess') toast(`'${word}' 제출했습니다`);
      inputEl.value = '';
    });
    // 입력 중에는 방향키·Space 가 캐릭터로 가지 않게 한다. 한글 조합 중 Enter 는 조합 확정에 쓴다.
    inputEl.addEventListener('keydown', (e) => {
      if (e.isComposing) return;
      if (e.key === 'Escape') inputEl.blur();
      e.stopPropagation();
    });

    function toast(text) {
      toastEl.textContent = text;
      toastEl.hidden = false;
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => { toastEl.hidden = true; }, 3500);
    }

    function setMap(map) {
      const now = map === 'hiddenword';
      if (now === inZone) return;
      inZone = now;
      root.hidden = !now;
      sentSeat = null;
      if (now) render();
      else { inputMode = ''; formEl.hidden = true; }
    }

    const handlers = {
      hwState(m) {
        const was = st.phase;
        st = m;
        st.endsAt = m.left ? Date.now() + m.left : 0;
        // 새 판이 시작되거나 끝나면 내 단어를 잊는다
        if (st.phase === 'lobby' || (was !== 'pick' && st.phase === 'pick' && !envelope.length)) mine = null;
        if (st.phase === 'lobby') envelope = [];
        render();
      },
      hwEnvelope(m) { envelope = m.words; mine = null; render(); },
      hwMine(m) { mine = m.word; render(); },
      hwErr(m) { toast(m.text); },
      hwSys(m) { chat.addLog('히든 워드', m.text); }
    };

    // 다시 접속하면 서버는 내 자리를 모르므로, 방석 위에 서 있으면 다시 앉도록 보낸 기록을 지운다
    return { handlers, setMap, update, allowed, setMe(id) { myId = id; sentSeat = null; } };
  }

  PX.createHiddenWord = createHiddenWord;
})();
