// 경마 화면 쪽. 서버가 보낸 경주 상태를 들고 있다가
//   - 경마장 가운데 전광판(투표 현황·남은 시간·순위·결과)을 그리고
//   - 말 위치(바퀴 수)를 장면(places.js)에 넘겨 준다.
//
//   race.apply(state)        서버 'race' 메시지 또는 welcome 의 race
//   race.setCounts(counts)   서버 'raceVotes'
//   race.setMine(horse, why) 서버 'raceVote' (내 투표 확인·거절)
//   race.positions()         말마다 지금 위치(바퀴 수). 장면이 매 프레임 부른다.
//   race.update()            매 프레임. 전광판 글자 갱신.
//   race.onVote(n)           내가 고른 말. main.js 가 서버로 보내도록 바꿔 끼운다.
(function () {

  // 기수 옷 색. 한국 경마 번호 색(1 흰 · 2 검 · 3 빨 · 4 파 · 5 노)을 따른다.
  const SILKS = ['#f4f1e6', '#2a2a30', '#d83a3a', '#2f5fd8', '#e8c030'];
  const COATS = ['#7a4a2a', '#4a2e1e', '#a0522d', '#9a9a9a', '#2b2420'];

  function mmss(ms) {
    const s = Math.max(0, Math.ceil(ms / 1000));
    return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
  }

  function createRace({ stage, scene }) {
    const el = document.createElement('section');
    el.className = 'race-panel';
    el.setAttribute('aria-label', '경마 전광판');
    const titleEl = document.createElement('div');
    titleEl.className = 'race-title';
    const chipsEl = document.createElement('div');
    chipsEl.className = 'race-chips';
    el.append(titleEl, chipsEl);
    stage.appendChild(el);

    const chips = [];
    for (let i = 0; i < SILKS.length; i++) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'race-chip';
      b.style.setProperty('--silk', SILKS[i]);
      b.innerHTML = '<i></i><span><b></b><small></small></span>';
      b.addEventListener('click', () => {
        race.onVote(i + 1);
        // 버튼에 포커스가 남으면 Space 가 버튼을 다시 누르므로 바로 뺀다
        b.blur();
      });
      chipsEl.appendChild(b);
      chips.push({ el: b, num: b.querySelector('b'), sub: b.querySelector('small'), text: '', cls: '' });
    }

    let s = null;           // 서버 상태
    let offset = 0;         // 서버 시각 - 내 시각
    let mine = null;        // 내가 투표한 말
    let notice = '';        // 잠깐 띄울 안내(투표 거절 등)
    let noticeUntil = 0;

    const now = () => Date.now() + offset;

    function apply(state) {
      offset = state.now - Date.now();
      // 새 경주가 열리면 내 투표도 비운다
      if (!s || state.round !== s.round) mine = null;
      s = state;
    }

    function setCounts(counts) {
      if (s) s.counts = counts;
    }

    function setMine(horse, reason) {
      mine = horse;
      if (reason) {
        notice = reason;
        noticeUntil = performance.now() + 2500;
      }
    }

    // 경주 계획(0.25초 간격 위치) 사이를 직선으로 잇는다
    function positions() {
      if (!s) return null;
      if (s.phase === 'result' && s.final) return s.final;
      if (s.phase !== 'racing' || !s.plan) return new Array(s.horses).fill(0);
      const p = s.plan;
      const t = Math.max(0, (now() - s.startAt) / 1000) / p.frameS;
      const i = Math.floor(t);
      if (i >= p.frames.length - 1) return p.frames[p.frames.length - 1];
      const a = p.frames[i], b = p.frames[i + 1], k = t - i;
      return a.map((v, n) => v + (b[n] - v) * k);
    }

    // 결승선을 지난 말은 들어온 순서, 아직 달리는 말은 앞선 순서
    function ranks(pos) {
      const laps = s.laps;
      const fin = s.plan ? s.plan.finish : null;
      const idx = pos.map((v, i) => i);
      idx.sort((a, b) => {
        const fa = pos[a] >= laps && fin, fb = pos[b] >= laps && fin;
        if (fa && fb) return fin[a] - fin[b];
        if (fa) return -1;
        if (fb) return 1;
        return pos[b] - pos[a];
      });
      const r = [];
      idx.forEach((h, k) => { r[h] = k + 1; });
      return r;
    }

    function setChip(c, text, sub, cls) {
      if (c.text !== text + '|' + sub) {
        c.text = text + '|' + sub;
        c.num.textContent = text;
        c.sub.textContent = sub;
      }
      if (c.cls !== cls) {
        c.cls = cls;
        c.el.className = 'race-chip' + cls;
      }
    }

    let lastTitle = '';
    function setTitle(text) {
      if (text !== lastTitle) {
        lastTitle = text;
        titleEl.textContent = text;
      }
    }

    function update() {
      if (scene.map !== 'racetrack') return;
      if (!s) { setTitle('경주 정보를 기다리는 중'); return; }

      let title;
      const t = now();
      if (s.phase === 'betting') {
        title = `제${s.round}경주 · 출발까지 ${mmss(s.startAt - t)} · 1~5 키로 투표`;
        if (mine) title = `제${s.round}경주 · 출발까지 ${mmss(s.startAt - t)} · 내 선택 ${mine}번`;
        s.counts.forEach((c, i) => setChip(chips[i], `${i + 1}번`, `${c}표`, mine === i + 1 ? ' mine' : ''));
      } else if (s.phase === 'racing') {
        const pos = positions();
        const lead = Math.max(...pos);
        const r = ranks(pos);
        title = lead >= s.laps
          ? `제${s.round}경주 · 결승!`
          : `제${s.round}경주 · ${Math.min(s.laps, Math.floor(lead) + 1)}/${s.laps}바퀴`;
        r.forEach((k, i) => setChip(chips[i], `${i + 1}번`, `${k}위`, (mine === i + 1 ? ' mine' : '') + (k === 1 ? ' lead' : '')));
      } else {
        const res = s.result;
        title = `제${s.round}경주 우승 ${res.winner}번! · 적중 ${res.hits}명`;
        if (mine) title += mine === res.winner ? ' · 내 투표 적중!' : ' · 아쉽네요';
        res.order.forEach((h, k) => setChip(chips[h - 1], `${h}번`, `${k + 1}위`, (mine === h ? ' mine' : '') + (k === 0 ? ' win' : '')));
      }
      if (notice && performance.now() < noticeUntil) title = notice;
      setTitle(title);
    }

    const race = {
      apply, setCounts, setMine, positions, update,
      onVote() {},
      el,
      silks: SILKS,
      coats: COATS,
      // 이 말이 멈춰 선 바퀴 수(달리기 동작을 멈출 지점). 경주가 아니면 0.
      lapsStop(n) {
        if (!s || s.phase !== 'racing' || !s.plan) return 0;
        return s.plan.frames[s.plan.frames.length - 1][n] - 0.002;
      },
      // 투표 중에는 말들이 출발선이 아니라 아래쪽 직선에 나란히 서서 기다린다(누가 누군지 보이게)
      get waiting() { return !!s && s.phase === 'betting'; }
    };

    // 경마장에서 숫자키 1~5 로 투표
    window.addEventListener('keydown', (e) => {
      const t = e.target;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      if (scene.map !== 'racetrack' || e.repeat) return;
      const m = /^(?:Digit|Numpad)([1-5])$/.exec(e.code);
      if (!m) return;
      e.preventDefault();
      race.onVote(Number(m[1]));
    });

    return race;
  }

  PX.createRace = createRace;
})();
