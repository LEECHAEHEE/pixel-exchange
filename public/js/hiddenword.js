// 히든 워드 게임장 UI. scene.map 이 'hiddenword' 일 때만 보인다.
// 서버(server/hiddenword.js)가 보내는 hwState 를 그대로 그리고, 방석 위에 서면 앉았다고 알린다.
// 게임 중 참가자는 자기 방석 밖으로 못 나간다(places.js 의 confine 이 allowed 를 묻는다).
(function () {
  const PHASE_KO = { lobby: '대기 중', countdown: '곧 시작', pick: '히든 워드 고르기', hint: '힌트', guess: '정답 쓰기', reveal: '정답 공개', end: '게임 끝' };
  const MIN_PLAYERS = 3;
  const MAX_HINTS = 5;

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
      <div class="hw-board"><div class="hw-head"><span class="hw-title"></span><span class="hw-timer"></span></div><ol class="hw-hints"></ol></div>
      <div class="hw-me"></div>
      <div class="hw-score"></div>
      <div class="hw-center" hidden></div>
      <form class="hw-input" hidden><input maxlength="12" autocomplete="off" spellcheck="false"><button type="submit">내기</button></form>
      <div class="hw-toast" hidden></div>`;
    stage.appendChild(root);
    const $ = (s) => root.querySelector(s);
    const boardEl = $('.hw-board'), titleEl = $('.hw-title'), timerEl = $('.hw-timer'), hintsEl = $('.hw-hints');
    const meEl = $('.hw-me'), scoreEl = $('.hw-score'), centerEl = $('.hw-center');
    const formEl = $('.hw-input'), inputEl = formEl.querySelector('input'), toastEl = $('.hw-toast');
    place(boardEl, { x: 63, y: 3, w: 194, h: 39 });
    place(meEl, { x: 2, y: 3, w: 58, h: 40 });
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

    function renderBoard() {
      const s = st;
      let title = PHASE_KO[s.phase] || s.phase;
      if (s.phase === 'lobby') title = `방석에 ${MIN_PLAYERS}명 이상 앉으면 시작 (${s.seats.filter(Boolean).length}/6)`;
      else if (s.phase === 'hint') title = `${nameOf(s.setter)} 님 출제 · 힌트 ${s.hints.length}/${MAX_HINTS}`;
      else if (s.phase === 'guess') title = `정답 쓰기 · ${nameOf(s.setter)} 님의 히든 워드`;
      else if (s.phase === 'reveal') title = `${nameOf(s.setter)} 님의 히든 워드 공개`;
      titleEl.textContent = title;
      hintsEl.replaceChildren();
      // 카운트다운 동안은 제목 줄을 숨기고 문구만 전광판 한가운데에 둔다
      boardEl.classList.toggle('countdown', s.phase === 'countdown');
      for (let i = 0; i < s.hints.length; i++) {
        const h = s.hints[i];
        hintsEl.append(el('li', 'hw-hint' + (i === s.key ? ' key' : ''), `${h.word} [${h.score.toFixed(1)}%]`));
      }
      if (s.phase === 'hint' && s.scoring) hintsEl.append(el('li', 'hw-hint wait', '유사도 계산 중…'));
      if (!s.hints.length && !s.scoring) {
        const msg = s.phase === 'countdown' ? `${secLeft()}초 후 게임이 시작됩니다`
          : s.phase === 'hint' ? '출제자가 힌트를 고르는 중입니다'
          : s.phase === 'lobby' ? '유사도는 Claude 가 0~100% 로 매깁니다. 95% 이상이면 힌트가 바로 끝나요'
          : '';
        if (msg) hintsEl.append(el('li', 'hw-hint wait', msg));
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

    function renderMe() {
      meEl.replaceChildren();
      const p = meP();
      if (p && !p.gone && mine) {
        // 옆 사람이 화면을 봐도 모르게 평소에는 흐리게, 마우스를 올리면 눈을 뜨며 단어가 보인다
        const row = el('div', 'hw-mrow');
        const eye = el('span', 'hw-eye');
        eye.innerHTML = EYE_SVG;
        row.append(el('span', 'hw-mword', mine), eye);
        meEl.append(el('div', 'hw-mlabel', '내 히든 워드'), row);
      } else if (p && !p.gone) {
        meEl.append(el('div', 'hw-mlabel', '내 히든 워드'), el('div', 'hw-mtip', '봉투에서 하나 고르세요'));
      } else if (inGame()) {
        meEl.append(el('div', 'hw-mlabel', '관전 중'), el('div', 'hw-mtip', '게임이 끝나면 방석에 앉아 참가하세요'));
      } else {
        meEl.append(el('div', 'hw-mlabel', '히든 워드'), el('div', 'hw-mtip', '내 단어는 숨기고 남의 단어를 맞히세요'));
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
          const n = s.players.filter(q => !q.gone).length, k = s.players.filter(q => q.picked && !q.gone).length;
          centerEl.append(el('div', 'hw-ctitle', `다른 사람이 고르는 중 (${k}/${n})`));
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
      renderBoard();
      renderScore();
      renderMe();
      renderCenter();
      renderInput();
    }

    setInterval(() => {
      if (!inZone) return;
      timerEl.textContent = st.endsAt && st.phase !== 'countdown' ? fmt(st.endsAt - Date.now()) : '';
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

    return { handlers, setMap, update, allowed, setMe(id) { myId = id; } };
  }

  PX.createHiddenWord = createHiddenWord;
})();
