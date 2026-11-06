// 풋살장 UI 와 공 그리기 상태. scene.map 이 'futsal' 일 때만 보인다.
// 서버(server/futsal.js)의 fs* 메시지를 받아 점수판·팀 고르기·카운트다운·골 배너·결과를 그리고,
// 공은 서버가 보낸 위치·속도로 이어 그린다(드리블 중이면 주인 발 앞에 붙인다).
// 조작: 방향키 이동, S 패스, D 슛(누르고 있으면 힘이 모인다). 공이 없을 때 S·D 는 태클.
(function () {
  const TEAM_KO = { red: '레드', blue: '블루' };
  // 팀 유니폼(상의, 상의 그늘)
  const KIT = { red: ['#d8343a', '#a3222a'], blue: ['#2f6fd8', '#1f4ea6'] };
  const PHASE_KO = { lobby: '팀 고르는 중', countdown: '킥오프 준비', play: '경기 중', goal: '골!', end: '경기 종료' };
  // server/futsal.js 와 맞춰야 한다
  const FRICTION = 1.4;
  const BALL_R = 2;
  // 드리블 공 자리: 바라보는 8방향(face, 0 오른쪽부터 시계 방향 45°씩)으로 가로 6px, 위 5px·아래 4px 앞.
  // server/futsal.js 의 dribbleOffset 과 같다. face 가 없으면 4방향(dir)으로.
  const DIRV = { right: [1, 0], down: [0, 1], left: [-1, 0], up: [0, -1] };
  function dribbleOffset(p) {
    const [fx, fy] = p.face != null ? [Math.cos(p.face * Math.PI / 4), Math.sin(p.face * Math.PI / 4)] : DIRV[p.dir] || [0, 0];
    return [fx * 6, fy * (fy < 0 ? 5 : 4)];
  }
  const TEAM_MAX = 5;
  const WIN_GOALS = 5;
  // D 를 이만큼 누르고 있으면 힘이 꽉 찬다
  const CHARGE_MS = 900;

  function isTyping(e) {
    const t = e.target;
    return t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
  }

  function fmtClock(ms) {
    const s = Math.max(0, Math.ceil(ms / 1000));
    return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  }

  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  function createFutsal({ stage, scene, chat, whoOf, send, place }) {
    const FS = PX.places.futsal.fs;
    const F = FS.field, G = FS.goal;

    // ---------- DOM (무대 안, 논리 픽셀 좌표) ----------
    const root = el('div');
    root.id = 'fs-ui';
    root.hidden = true;
    root.innerHTML = `
      <div class="fs-score">
        <div class="fs-sline"><b class="fs-tred">레드</b><span class="fs-num" data-s="0">0</span><i>:</i><span class="fs-num" data-s="1">0</span><b class="fs-tblue">블루</b></div>
        <div class="fs-sub"><span class="fs-clock">6:00</span><span class="fs-phase"></span></div>
      </div>
      <div class="fs-lobby">
        <div class="fs-title">팀을 골라 참가하세요 · ${WIN_GOALS}골 먼저 넣으면 승리</div>
        <div class="fs-cols">
          <div class="fs-col red"><div class="fs-chead">레드 <span></span></div><ol></ol><button type="button" data-team="red">레드 참가</button></div>
          <div class="fs-col blue"><div class="fs-chead">블루 <span></span></div><ol></ol><button type="button" data-team="blue">블루 참가</button></div>
        </div>
        <div class="fs-row">
          <button type="button" data-team="auto">자동 배정</button>
          <button type="button" data-team="none">관전</button>
          <button type="button" class="fs-start">START</button>
        </div>
        <div class="fs-why"></div>
      </div>
      <div class="fs-center" hidden><div class="fs-big"></div><div class="fs-small"></div></div>
      <div class="fs-result" hidden></div>
      <div class="fs-toast" hidden></div>
      <div class="fs-flash"></div>`;
    stage.appendChild(root);
    const $ = (s) => root.querySelector(s);
    const scoreEl = $('.fs-score'), clockEl = $('.fs-clock'), phaseEl = $('.fs-phase');
    const numEls = root.querySelectorAll('.fs-num');
    const lobbyEl = $('.fs-lobby'), whyEl = $('.fs-why'), startBtn = $('.fs-start');
    const centerEl = $('.fs-center'), bigEl = $('.fs-big'), smallEl = $('.fs-small');
    const resultEl = $('.fs-result'), toastEl = $('.fs-toast'), flashEl = $('.fs-flash');
    place(scoreEl, FS.board);
    place(lobbyEl, { x: 78, y: 44, w: 164, h: 80 });
    // 킥오프 대형(가운데 줄 y 103 근처)을 가리지 않게 경기장 위쪽에 띄운다
    place(centerEl, { x: 50, y: 42, w: 220, h: 28 });
    place(resultEl, { x: 66, y: 34, w: 188, h: 112 });
    place(toastEl, { x: 70, y: 25, w: 180, h: 9 });

    // ---------- 상태 ----------
    let inZone = false;
    let phase = 'lobby', endsAt = 0, clock = 0, clockAt = 0, golden = false;
    let score = [0, 0];
    let red = [], blue = [];
    const teamOf = new Map();       // 서버 id → 'red' | 'blue'
    let locked = false;
    let charging = null;            // D 를 누른 시각
    let kickoffShownUntil = 0;
    let goalUntil = 0;
    let toastTimer = 0;
    const puffs = [];
    // 공: 서버가 마지막으로 알려 준 값(s*)과 화면에 그리는 자리(x, y)
    const ball = { sx: FS.center.x, sy: FS.center.y, svx: 0, svy: 0, at: 0, owner: null, x: FS.center.x, y: FS.center.y, roll: 0 };

    function myTeam() {
      for (const [id, t] of teamOf) if (whoOf(id) === 'me') return t;
      return null;
    }
    // who: 'me' 또는 서버 id
    function teamFor(who) {
      return who === 'me' ? myTeam() : teamOf.get(who) || null;
    }
    const iHaveBall = () => !!ball.owner && whoOf(ball.owner) === 'me';
    // 공을 가진 사람의 걸음 빠르기 배율. 수비가 따라붙어 뺏을 틈이 생긴다.
    const DRIBBLE_SPEED = 0.9;
    const speed = () => (inZone && phase === 'play' && iHaveBall() ? DRIBBLE_SPEED : 1);

    // 경기 중(카운트다운·경기·골 세리머니)에는 팀에 없는 사람은 아래쪽 벤치 줄에서만 관전한다
    const inMatch = () => phase === 'countdown' || phase === 'play' || phase === 'goal';
    const watching = () => inZone && inMatch() && !myTeam();
    function allowed(x, y) {
      return !watching() || y >= FS.bench.y0;
    }
    // 경기장 안에 서 있던 관전자(경기 시작·경기 중 입장)는 벤치 줄 빈 곳으로 옮긴다
    function toBench() {
      const me = scene.where('me');
      if (!me || !watching() || me.y >= FS.bench.y0) return;
      // 레드 벤치 앞·블루 벤치 앞·가운데 중 한 곳(겹치지 않게 조금씩 비켜 선다)
      const spots = [82, 238, 160, 60, 104, 216, 260, 130, 190];
      const x = spots[Math.floor(Math.random() * spots.length)] + Math.round(Math.random() * 10 - 5);
      scene.teleport(x, FS.bench.y1, 'up');
    }

    // 다른 창이 열려 있거나 입장 전이면 S·D 를 받지 않는다
    function blocked() {
      return !document.getElementById('join').hidden
        || (PX.shop && PX.shop.open) || (PX.inventory && PX.inventory.open)
        || (PX.emote && PX.emote.open) || (PX.help && PX.help.open);
    }

    // ---------- 그리기용(places.js 가 매 프레임 부른다) ----------

    // 유니폼: 착용 아이템은 그대로 두고 상의만 팀 색으로. 조끼·넥타이·무늬·치마처럼 상의를 가리는 것은 뺀다.
    const kitCache = new WeakMap();
    function dress(who, look) {
      const team = teamFor(who);
      if (!team || !look) return null;
      let c = kitCache.get(look);
      if (!c) { c = {}; kitCache.set(look, c); }
      if (!c[team]) {
        c[team] = Object.assign({}, look, {
          shirt: KIT[team][0], shirtLo: KIT[team][1],
          vest: null, tie: null, print: null, apron: null, skirt: null, stripe: null
        });
      }
      return c[team];
    }

    function view() {
      if (!inZone) return null;
      const v = { ball: { x: ball.x, y: ball.y, roll: ball.roll }, ring: null, gauge: null, puffs: [] };
      if (ball.owner) {
        const p = scene.where(whoOf(ball.owner));
        if (p) v.ring = { x: p.x, y: p.y, team: teamOf.get(ball.owner) };
      }
      if (charging) {
        const me = scene.where('me');
        if (me) v.gauge = { x: me.x, y: me.y, p: chargeP() };
      }
      const now = performance.now();
      for (let i = puffs.length - 1; i >= 0; i--) {
        const f = puffs[i];
        if (now >= f.until) { puffs.splice(i, 1); continue; }
        const p = scene.where(f.who);
        if (p) v.puffs.push({ x: p.x, y: p.y, k: 1 - (f.until - now) / 300 });
      }
      return v;
    }

    function chargeP() {
      return charging ? Math.min(1, (performance.now() - charging) / CHARGE_MS) : 0;
    }

    // 골대 입구 쪽이면 골라인 너머까지, 아니면 경기장 안(server/futsal.js clampToField 와 같다)
    function clampField(x, y) {
      const mouth = y > G.y0 + 1 && y < G.y1 - 1;
      const lo = mouth ? F.x0 - BALL_R - 9 : F.x0 + BALL_R;
      const hi = mouth ? F.x1 + BALL_R + 9 : F.x1 - BALL_R;
      return [Math.min(hi, Math.max(lo, x)), Math.min(F.y1 - BALL_R, Math.max(F.y0 + BALL_R, y))];
    }

    // 매 프레임: 공 자리를 서버 값에서 앞으로 내다보고(마찰 반영) 부드럽게 따라간다
    function update(dt) {
      if (!inZone) return;
      toBench();
      const now = performance.now();
      let tx, ty;
      const owner = ball.owner ? scene.where(whoOf(ball.owner)) : null;
      if (owner) {
        const [ox, oy] = dribbleOffset(owner);
        [tx, ty] = clampField(owner.x + ox, owner.y + oy);
      } else {
        // 다음 소식까지 길어야 0.25초만 내다본다
        const e = Math.min(0.25, (now - ball.at) / 1000);
        const f = (1 - Math.exp(-FRICTION * e)) / FRICTION;
        [tx, ty] = clampField(ball.sx + ball.svx * f, ball.sy + ball.svy * f);
        if (phase === 'goal' || phase === 'countdown') { tx = ball.sx; ty = ball.sy; }
      }
      const dx = tx - ball.x, dy = ty - ball.y;
      const d = Math.hypot(dx, dy);
      if (d > 40) { ball.x = tx; ball.y = ty; }
      else {
        const a = 1 - Math.exp(-dt * (owner ? 30 : 18));
        ball.x += dx * a;
        ball.y += dy * a;
        ball.roll += d * a;
      }
      if (charging && !iHaveBall()) charging = null;
      refreshClock(now);
      refreshCenter(now);
    }

    // ---------- 점수판·가운데 글씨 ----------

    let lastClock = '', lastPhase = '';
    function refreshClock(now) {
      let txt;
      if (golden) txt = '골든골';
      else {
        const ms = phase === 'play' ? clock - (now - clockAt) : clock;
        txt = fmtClock(ms);
      }
      if (txt !== lastClock) { lastClock = txt; clockEl.textContent = txt; clockEl.classList.toggle('golden', golden); }
      const ph = (phase === 'play' || phase === 'countdown') && !myTeam() ? '관전 중' : PHASE_KO[phase] || '';
      if (ph !== lastPhase) { lastPhase = ph; phaseEl.textContent = ph; }
    }

    let lastBig = '';
    function refreshCenter(now) {
      let big = '', small = '', cls = '';
      if (phase === 'countdown') {
        const s = Math.ceil((endsAt - now) / 1000);
        big = s > 0 ? String(s) : '킥오프!';
        small = score[0] + score[1] === 0 ? '킥오프 준비 — 제자리에서 기다리세요' : '다시 킥오프';
        cls = 'count';
      } else if (phase === 'play' && now < kickoffShownUntil) {
        big = '킥오프!';
        cls = 'count';
      } else if (now < goalUntil && centerEl.dataset.goal) {
        big = centerEl.dataset.goal;
        small = centerEl.dataset.goalSub || '';
        cls = 'goal ' + (centerEl.dataset.team || '');
      }
      const key = big + '|' + small + '|' + cls;
      if (key === lastBig) return;
      lastBig = key;
      centerEl.hidden = !big;
      centerEl.className = 'fs-center ' + cls;
      bigEl.textContent = big;
      smallEl.textContent = small;
    }

    function renderScore() {
      numEls[0].textContent = score[0];
      numEls[1].textContent = score[1];
    }

    // ---------- 팀 고르기 ----------

    function renderLobby() {
      lobbyEl.hidden = !(inZone && phase === 'lobby');
      const mine = myTeam();
      for (const [team, list] of [['red', red], ['blue', blue]]) {
        const col = lobbyEl.querySelector('.fs-col.' + team);
        col.querySelector('.fs-chead span').textContent = `${list.length}/${TEAM_MAX}`;
        const ol = col.querySelector('ol');
        ol.replaceChildren(...list.map(([id, name]) => el('li', whoOf(id) === 'me' ? 'me' : '', name + (whoOf(id) === 'me' ? ' (나)' : ''))));
        if (!list.length) ol.appendChild(el('li', 'empty', '— 비어 있음 —'));
        const btn = col.querySelector('button');
        btn.disabled = mine === team || list.length >= TEAM_MAX;
        btn.textContent = mine === team ? '참가 중' : list.length >= TEAM_MAX ? '가득 참' : TEAM_KO[team] + ' 참가';
      }
      lobbyEl.querySelector('[data-team="none"]').disabled = !mine;
      let why = '';
      if (scene.player.rider) why = '말을 탄 채로는 참가할 수 없어요(마굿간에 돌려놓고 오세요)';
      else if (!mine) why = '팀에 참가하면 START 를 누를 수 있어요';
      else if (!red.length || !blue.length) why = '레드·블루에 각각 1명 이상 있어야 시작할 수 있어요';
      else if (red.length !== blue.length) why = `${red.length} 대 ${blue.length} — 인원이 달라도 시작할 수 있어요`;
      else why = `${red.length} 대 ${blue.length} · START 를 누르면 3초 뒤 킥오프!`;
      whyEl.textContent = why;
      startBtn.disabled = !mine || !red.length || !blue.length;
    }

    lobbyEl.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      // 버튼에 초점이 남으면 Space·Enter 가 다시 눌러 버린다
      b.blur();
      if (b === startBtn) send({ t: 'fsStart' });
      else if (b.dataset.team) send({ t: 'fsTeam', team: b.dataset.team === 'none' ? null : b.dataset.team });
    });

    // ---------- 결과 ----------

    function showResult(m) {
      resultEl.replaceChildren();
      const head = el('div', 'fs-rhead ' + m.winner, `${TEAM_KO[m.winner]} 승리!` + (m.forfeit ? ' (기권승)' : ''));
      const sc = el('div', 'fs-rscore');
      sc.append(el('b', 'fs-tred', `레드 ${m.score[0]}`), el('i', null, ' : '), el('b', 'fs-tblue', `${m.score[1]} 블루`));
      resultEl.append(head, sc);
      if (m.mvp) resultEl.appendChild(el('div', 'fs-mvp', `MVP · ${m.mvp}`));
      const list = el('ol', 'fs-goals');
      m.goals.forEach((g) => {
        const who = g.name ? g.name + (g.own ? ' (자책골)' : '') : '(나간 사람)';
        list.appendChild(el('li', g.team, `${TEAM_KO[g.team]} · ${who}` + (g.assist ? ` · 도움 ${g.assist}` : '')));
      });
      if (!m.goals.length) list.appendChild(el('li', 'empty', '득점 없음'));
      resultEl.appendChild(list);
      const foot = el('div', 'fs-rfoot');
      const left = el('span', 'fs-rleft');
      const close = el('button', null, '닫기');
      close.type = 'button';
      close.addEventListener('click', () => { close.blur(); resultEl.hidden = true; });
      foot.append(left, close);
      resultEl.appendChild(foot);
      resultEl.hidden = false;
      const tickLeft = () => {
        if (resultEl.hidden || phase !== 'end') return;
        left.textContent = `${Math.max(0, Math.ceil((endsAt - performance.now()) / 1000))}초 뒤 팀 고르기로 돌아갑니다`;
        setTimeout(tickLeft, 250);
      };
      tickLeft();
    }

    function toast(text) {
      toastEl.textContent = text;
      toastEl.hidden = false;
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => { toastEl.hidden = true; }, 3500);
    }

    function flash(team) {
      flashEl.className = 'fs-flash';
      // 애니메이션을 다시 걸려면 한 번 그려진 뒤 클래스를 붙인다
      void flashEl.offsetWidth;
      flashEl.className = 'fs-flash on ' + team;
    }

    // ---------- 키 ----------

    window.addEventListener('keydown', (e) => {
      if (!inZone || isTyping(e) || blocked()) return;
      if (e.code !== 'KeyS' && e.code !== 'KeyD') return;
      e.preventDefault();
      if (e.repeat || !myTeam() || phase !== 'play') return;
      if (!iHaveBall()) { send({ t: 'fsTackle' }); return; }
      if (e.code === 'KeyS') send({ t: 'fsPass', f: scene.player.face });
      else charging = performance.now();
    });
    window.addEventListener('keyup', (e) => {
      if (e.code !== 'KeyD' || !charging) return;
      const p = chargeP();
      charging = null;
      if (inZone && iHaveBall()) send({ t: 'fsShoot', p: Math.round(p * 100) / 100, f: scene.player.face });
    });
    window.addEventListener('blur', () => { charging = null; });

    // ---------- 상태 반영 ----------

    function setLock(v) {
      if (v === locked) return;
      locked = v;
      scene.setLocked(v);
    }

    function apply(s) {
      const prev = phase;
      const now = performance.now();
      phase = s.phase;
      endsAt = now + (s.left || 0);
      clock = s.clock;
      clockAt = now;
      golden = !!s.golden;
      score = s.score || [0, 0];
      red = s.red || [];
      blue = s.blue || [];
      teamOf.clear();
      for (const [id] of red) teamOf.set(id, 'red');
      for (const [id] of blue) teamOf.set(id, 'blue');
      if (prev === 'countdown' && phase === 'play') kickoffShownUntil = now + 800;
      if (phase === 'lobby') resultEl.hidden = true;
      // 킥오프 카운트다운 동안 선수는 제자리에서 기다린다
      setLock(inZone && phase === 'countdown' && !!myTeam());
      renderScore();
      renderLobby();
      if (s.ball) setBall(s.ball);
    }

    function setBall(m) {
      ball.sx = m.b[0];
      ball.sy = m.b[1];
      ball.svx = m.b[2];
      ball.svy = m.b[3];
      ball.at = performance.now();
      ball.owner = m.o || null;
    }

    function setMap(map) {
      const now = map === 'futsal';
      if (now === inZone) return;
      inZone = now;
      root.hidden = !now;
      if (!now) {
        charging = null;
        resultEl.hidden = true;
        setLock(false);
      } else {
        ball.x = ball.sx;
        ball.y = ball.sy;
        renderLobby();
      }
    }

    // 안내 문구 상태: lobby | team | play | ball | watch
    function prompt() {
      const mine = myTeam();
      if (phase === 'lobby' || phase === 'end') return mine ? 'team' : 'lobby';
      if (!mine) return 'watch';
      return iHaveBall() ? 'ball' : 'play';
    }

    const LOG = '풋살장';
    const handlers = {
      fsState(m) { apply(m); },
      fsB(m) { setBall(m); },
      // 킥오프 대형: 서버가 정한 내 자리로 옮긴다
      fsKick(m) { scene.teleport(m.x, m.y, m.dir); },
      fsGoal(m) {
        score = m.score;
        renderScore();
        const t = TEAM_KO[m.team];
        const who = m.name ? (m.own ? `자책골 — ${m.name}` : m.name) : '';
        centerEl.dataset.goal = `골!! ${t} 득점` + (who ? ` — ${who}` : '');
        centerEl.dataset.goalSub = `레드 ${m.score[0]} : ${m.score[1]} 블루` + (m.assist ? ` · 도움 ${m.assist}` : '') + (m.golden ? ' · 골든골!' : '');
        centerEl.dataset.team = m.team;
        goalUntil = performance.now() + 2500;
        if (inZone) flash(m.team);
        chat.addLog(LOG, centerEl.dataset.goal + ` (${m.score[0]}:${m.score[1]})`);
      },
      fsEnd(m) {
        chat.addLog(LOG, `경기 종료 — ${TEAM_KO[m.winner]} 승리${m.forfeit ? '(기권승)' : ''} ${m.score[0]}:${m.score[1]}` + (m.mvp ? ` · MVP ${m.mvp}` : ''));
        if (inZone) showResult(m);
      },
      fsSys(m) {
        chat.addLog(LOG, m.text);
        if (inZone) toast(m.text);
      },
      fsTk(m) { puffs.push({ who: whoOf(m.id), until: performance.now() + 300 }); }
    };

    return { handlers, apply, setMap, update, view, dress, prompt, allowed, speed, get inZone() { return inZone; } };
  }

  PX.createFutsal = createFutsal;
})();
