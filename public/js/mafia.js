// 마피아존 UI. scene.map 이 'mafiazone' 일 때만 보인다.
// 서버(server/mafia.js)의 mz* 메시지를 받아 페이즈·역할·투표·건너뛰기·START 를 그린다.
// 채팅은 기존 chat 모듈로 말풍선+로그에 그린다(서버가 채널별 수신자를 이미 걸러 보냄).
(function () {
  const ROLE_DESC = {
    mafia: '밤마다 시민 한 명을 암살합니다. 동료 마피아와 밤에 상의할 수 있어요. 낮에는 시민인 척하세요.',
    police: '밤마다 한 명을 조사해 마피아 여부를 알 수 있습니다.',
    doctor: '밤마다 한 명을 치료합니다. 그 사람이 공격받아도 살아남아요.',
    citizen: '특별한 능력은 없습니다. 토론과 투표로 마피아를 찾아내세요.'
  };
  const PHASE_KO = {
    lobby: '대기 중', night: '밤', morning: '아침', day_discuss: '낮 · 토론',
    day_vote: '낮 · 투표', day_defense: '최후 변론', day_confirm: '찬반 투표', gameover: '게임 종료'
  };

  function createMafia({ scene, chat, whoOf, send }) {
    // ---------- DOM ----------
    const root = document.createElement('div');
    root.id = 'mz-ui';
    root.hidden = true;
    root.innerHTML = `
      <div id="mz-top">
        <span id="mz-banner">대기 중</span>
        <span id="mz-timer"></span>
        <span id="mz-progress"></span>
      </div>
      <aside id="mz-roster"></aside>
      <button type="button" id="mz-start" hidden>START</button>
      <button type="button" id="mz-skip" hidden>건너뛰기 ▶</button>
      <div id="mz-dialog" class="mz-dialog" hidden>
        <div class="mz-dlg-name"></div><p class="mz-dlg-text"></p><div class="mz-dlg-opts"></div>
      </div>
      <div id="mz-modal" class="mz-modal" hidden></div>`;
    document.body.appendChild(root);
    const $ = id => root.querySelector(id);
    const bannerEl = $('#mz-banner'), timerEl = $('#mz-timer'), progEl = $('#mz-progress');
    const rosterEl = $('#mz-roster'), startBtn = $('#mz-start'), skipBtn = $('#mz-skip');
    const dialog = $('#mz-dialog'), dlgName = dialog.querySelector('.mz-dlg-name'), dlgText = dialog.querySelector('.mz-dlg-text'), dlgOpts = dialog.querySelector('.mz-dlg-opts');
    const modal = $('#mz-modal');

    // ---------- 상태 ----------
    let inZone = false, myId = null, myRole = null, myMates = [];
    let players = [], phase = 'lobby', day = 0, endsAt = 0, accusedId = null, votes = null;

    const meU = () => players.find(p => p.id === myId);
    const amAlive = () => { const m = meU(); return !!(m && m.alive && !m.spectator); };
    const aliveOthers = () => players.filter(p => p.alive && !p.spectator && p.id !== myId);
    const aliveAll = () => players.filter(p => p.alive && !p.spectator);
    const nameOf = id => { const p = players.find(x => x.id === id); return p ? p.name : id; };
    const isMate = id => myMates.some(m => m.id === id);

    // ---------- 대화창(지목/투표/찬반) ----------
    let dlgBtns = [], dlgSel = 0;
    function dlgSelect(i) { if (!dlgBtns.length) return; dlgSel = (i + dlgBtns.length) % dlgBtns.length; dlgBtns.forEach((b, j) => b.classList.toggle('sel', j === dlgSel)); }
    function dlgShow(name, text, opts) {
      dlgName.textContent = name || ''; dlgName.style.display = name ? '' : 'none';
      dlgText.textContent = text || '';
      dlgOpts.replaceChildren();
      dlgBtns = opts.map(o => { const b = document.createElement('button'); b.type = 'button'; b.textContent = o.label; b.addEventListener('pointerenter', () => dlgSelect(dlgBtns.indexOf(b))); b.addEventListener('click', o.onClick); dlgOpts.appendChild(b); return b; });
      dialog.hidden = false; dlgSelect(0);
    }
    function dlgClose() { dialog.hidden = true; dlgBtns = []; }
    window.addEventListener('keydown', (e) => {
      if (!inZone || dialog.hidden) return;
      if (document.activeElement && document.activeElement.tagName === 'INPUT') return;
      if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') dlgSelect(dlgSel - 1);
      else if (e.key === 'ArrowDown' || e.key === 'ArrowRight') dlgSelect(dlgSel + 1);
      else if (e.code === 'Space' || e.key === 'Enter') { if (!e.repeat && dlgBtns[dlgSel]) dlgBtns[dlgSel].click(); }
      else return;
      e.preventDefault(); e.stopPropagation();
    }, true);

    // ---------- 모달(역할/결과) ----------
    function modalBox(title) {
      modal.replaceChildren();
      const b = document.createElement('div'); b.className = 'mz-box';
      const h = document.createElement('div'); h.className = 'mz-box-head'; h.textContent = title; b.appendChild(h);
      modal.appendChild(b); modal.hidden = false; return b;
    }
    function modalClose() { modal.hidden = true; modal.replaceChildren(); }
    modal.addEventListener('pointerdown', e => { if (e.target === modal) modalClose(); });

    function showRole(m) {
      const b = modalBox('당신의 역할');
      const card = document.createElement('div'); card.className = 'mz-role mz-role-' + m.role;
      card.innerHTML = `<div class="mz-role-name">${m.roleKo} <span class="mz-team mz-team-${m.team}">${m.team === 'mafia' ? '마피아 진영' : '시민 진영'}</span></div><p class="mz-role-desc">${ROLE_DESC[m.role] || ''}</p>`;
      if (m.mates && m.mates.length) { const p = document.createElement('p'); p.className = 'mz-mates'; p.textContent = '동료 마피아: ' + m.mates.map(x => x.name).join(', '); card.appendChild(p); }
      b.appendChild(card);
      const ok = document.createElement('button'); ok.className = 'mz-ok'; ok.textContent = '확인'; ok.addEventListener('click', modalClose); b.appendChild(ok);
    }
    function showGameover(m) {
      const b = modalBox('게임 종료');
      const bn = document.createElement('div'); bn.className = 'mz-win mz-win-' + m.winner; bn.textContent = m.winnerKo + ' 진영 승리!'; b.appendChild(bn);
      const list = document.createElement('div'); list.className = 'mz-result';
      for (const p of m.roles) { const row = document.createElement('div'); row.className = 'mz-rrow mz-role-' + p.role + (p.alive ? '' : ' dead'); row.innerHTML = `<span>${p.name}${p.id === myId ? ' (나)' : ''}</span><span class="mz-rrole">${p.roleKo}${p.alive ? '' : ' · 사망'}</span>`; list.appendChild(row); }
      b.appendChild(list);
      const ok = document.createElement('button'); ok.className = 'mz-ok'; ok.textContent = '닫기'; ok.addEventListener('click', modalClose); b.appendChild(ok);
    }

    // ---------- 페이즈별 내 액션 ----------
    function onPhase() {
      dlgClose();
      scene.setTarget && scene.setTarget(null);
      updateStartBtn();
      // 밤에는 이동 잠금
      scene.setLocked(inZone && phase === 'night');
      skipBtn.hidden = !(inZone && amAlive() && (phase === 'night' || phase === 'day_discuss'));
      if (!skipBtn.hidden) skipBtn.textContent = '건너뛰기 ▶';
      if (!inZone || !amAlive()) return;

      if (phase === 'night') {
        const R = {
          mafia:  { act: 'kill', name: '밤 · 마피아', verb: '암살', opts: () => aliveOthers().filter(p => !isMate(p.id)) },
          police: { act: 'investigate', name: '밤 · 경찰', verb: '조사', opts: () => aliveOthers() },
          doctor: { act: 'heal', name: '밤 · 의사', verb: '치료', opts: () => aliveAll() }
        }[myRole];
        if (R) {
          const openPick = () => dlgShow(R.name, `${R.verb}할 대상을 고르세요.`, [
            ...R.opts().map(p => ({ label: p.name, onClick: () => confirmPick(p.id) })),
            { label: '건너뛰기', onClick: () => send({ t: 'mzSkip' }) }
          ]);
          const confirmPick = (id) => dlgShow('확정', `${nameOf(id)} 님을 ${R.verb} 대상으로 확정할까요? 확정하면 바꿀 수 없습니다.`, [
            { label: '예 (확정)', onClick: () => { send({ t: 'mzNight', action: R.act, target: id }); if (myRole === 'mafia' && scene.setTarget) scene.setTarget(id); dlgShow(R.name, `${nameOf(id)} 님을 ${R.verb} 대상으로 확정했습니다. 결과를 기다리세요.`, [{ label: '확인', onClick: dlgClose }]); } },
            { label: '아니오 (다시)', onClick: openPick }
          ]);
          openPick();
        } else {
          dlgShow('밤', '밤이 깊었습니다. 다수가 동의하면 바로 아침으로 넘어갑니다.', [{ label: '건너뛰기', onClick: () => send({ t: 'mzSkip' }) }]);
        }
      } else if (phase === 'day_vote') {
        dlgShow('투표', '처형할 용의자를 지목하세요.', aliveOthers().map(p => ({ label: p.name, onClick: () => send({ t: 'mzVote', target: p.id }) })));
      } else if (phase === 'day_confirm') {
        const acc = players.find(p => p.id === accusedId);
        if (acc && acc.id === myId) { dlgShow('최후 변론', '당신은 투표 대상입니다. 결과를 기다리세요.', [{ label: '확인', onClick: dlgClose }]); return; }
        dlgShow('찬반 투표', (acc ? acc.name : '') + ' 님을 처형할까요?', [
          { label: '찬성 (처형)', onClick: () => { send({ t: 'mzConfirm', yes: true }); dlgShow('찬반 투표', '찬성에 투표했습니다.', [{ label: '확인', onClick: dlgClose }]); } },
          { label: '반대 (생존)', onClick: () => { send({ t: 'mzConfirm', yes: false }); dlgShow('찬반 투표', '반대에 투표했습니다.', [{ label: '확인', onClick: dlgClose }]); } }
        ]);
      }
    }

    // ---------- START / 타이머 / 현황판 ----------
    startBtn.addEventListener('click', () => { send({ t: 'mzReady' }); startBtn.blur(); });
    skipBtn.addEventListener('click', () => send({ t: 'mzSkip' }));

    function updateStartBtn() {
      if (!inZone || phase !== 'lobby') { startBtn.hidden = true; return; }
      startBtn.hidden = false;
      const m = meU(), n = players.filter(p => !p.spectator).length;
      const readyN = players.filter(p => p.ready && !p.spectator).length;
      const iReady = !!(m && m.ready);
      startBtn.classList.toggle('on', iReady);
      startBtn.textContent = (iReady ? '준비 완료 ✓ (취소)' : 'START') + `  ·  준비 ${readyN}/${n}` + (n < 4 ? ' (최소 4명)' : '');
    }

    function fmt(ms) { const s = Math.max(0, Math.ceil(ms / 1000)); return s >= 60 ? Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0') : s + '초'; }
    setInterval(() => { timerEl.textContent = (inZone && endsAt) ? fmt(endsAt - Date.now()) : ''; }, 200);

    function renderBanner() {
      let label = PHASE_KO[phase] || phase;
      if (phase === 'night' || phase === 'morning' || phase.startsWith('day')) label = day + '일차 · ' + label;
      bannerEl.textContent = label; bannerEl.dataset.phase = phase;
    }
    function renderRoster() {
      rosterEl.replaceChildren();
      const alive = players.filter(p => p.alive && !p.spectator).length;
      const head = document.createElement('div'); head.className = 'mz-rhead'; head.textContent = `생존 ${alive} / ${players.filter(p => !p.spectator).length}`; rosterEl.appendChild(head);
      for (const p of players) {
        const row = document.createElement('div'); row.className = 'mz-prow' + (p.alive ? '' : ' dead') + (p.spectator ? ' spec' : '');
        const nm = document.createElement('span'); nm.className = 'mz-pname'; nm.textContent = p.name + (p.id === myId ? ' (나)' : ''); row.appendChild(nm);
        if (p.spectator) { const s = document.createElement('span'); s.textContent = '관전'; s.className = 'mz-tag'; row.appendChild(s); }
        else if (!p.alive) { const s = document.createElement('span'); s.textContent = '사망'; s.className = 'mz-dead'; row.appendChild(s); }
        else if (votes && votes[p.id]) { const s = document.createElement('span'); s.textContent = votes[p.id] + '표'; s.className = 'mz-vote'; row.appendChild(s); }
        else if (phase === 'lobby' && p.ready) { const s = document.createElement('span'); s.textContent = '✓'; s.className = 'mz-ready'; row.appendChild(s); }
        rosterEl.appendChild(row);
      }
    }

    // ---------- 맵 전환 ----------
    function setMap(map) {
      const now = map === 'mafiazone';
      if (now === inZone) return;
      inZone = now;
      root.hidden = !now;
      if (!now) { dlgClose(); modalClose(); scene.setLocked(false); }
      else { renderBanner(); renderRoster(); updateStartBtn(); }
    }

    // ---------- 서버 메시지 핸들러 ----------
    const CH = { dead: '[유령] ', mafia: '[마피아] ' };
    const handlers = {
      mzWelcome(m) { myId = m.me.id; players = m.players; phase = m.phase; day = m.day; endsAt = m.endsAt; renderBanner(); renderRoster(); onPhase(); },
      mzPlayers(m) { players = m.players; renderRoster(); updateStartBtn(); },
      mzPhase(m) { phase = m.phase; day = m.day; endsAt = m.endsAt; if (phase !== 'day_vote') votes = null; if (phase === 'lobby' || phase === 'night' || phase === 'gameover') accusedId = null; renderBanner(); renderRoster(); onPhase(); },
      mzRole(m) { myRole = m.role; myMates = m.mates || []; showRole(m); chat.addLog('사회자(Claude)', '당신의 역할: ' + m.roleKo + (myMates.length ? ' · 동료: ' + myMates.map(x => x.name).join(', ') : '')); },
      mzSys(m) { chat.addLog('사회자(Claude)', m.text); },
      mzChat(m) { chat.say(whoOf(m.id), (CH[m.channel] || '') + m.text); chat.addLog((CH[m.channel] || '') + m.name, m.text); },
      mzMorning(m) {
        if (m.deaths && m.deaths.length) for (const d of m.deaths) chat.addLog('사회자(Claude)', `☀️ 아침 — ${d.roleKo ? `${d.name} (${d.roleKo})` : d.name} 님이 밤 사이 사망했습니다.`);
        else chat.addLog('사회자(Claude)', '☀️ 아침 — 조용한 밤이었습니다. 아무도 죽지 않았습니다.');
      },
      mzInvestigate(m) { chat.addLog('사회자(Claude)', `🔎 조사 결과: ${m.targetName} 님은 ${m.isMafia ? '마피아입니다!' : '마피아가 아닙니다.'}`); },
      mzHeal(m) { chat.addLog('사회자(Claude)', `💉 ${m.targetName} 님을 치료 대상으로 지정했습니다.`); },
      mzMafiaPick(m) { chat.addLog('사회자(Claude)', `🔪 ${m.by} → ${m.targetName} 지목`); },
      mzNightProg(m) { if (phase === 'night') progEl.textContent = `지목 ${m.acted}/${m.total}`; },
      mzVoteUpd(m) { votes = m.tally; renderRoster(); progEl.textContent = `투표 ${m.voted}/${m.total}`; },
      mzConfirmUpd(m) { progEl.textContent = `찬반 ${m.yes + m.no}/${m.total} (찬성 ${m.yes}·반대 ${m.no})`; },
      mzSkipUpd(m) { skipBtn.textContent = `건너뛰기 ▶ ${m.count}/${m.need}`; if (phase !== 'night') progEl.textContent = `건너뛰기 ${m.count}/${m.need}`; },
      mzDefense(m) { accusedId = m.id; chat.addLog('사회자(Claude)', `⚖️ ${m.name} 님이 최다 득표 — 최후 변론.`); },
      mzConfirmStart(m) { accusedId = m.id; },
      mzExecuted(m) { chat.addLog('사회자(Claude)', `🪢 ${m.roleKo ? `${m.name} (${m.roleKo})` : m.name} 님이 처형되었습니다.`); accusedId = null; },
      mzGameover(m) { chat.addLog('사회자(Claude)', `🏁 게임 종료 — ${m.winnerKo} 진영 승리!`); showGameover(m); myRole = null; myMates = []; }
    };
    // 페이즈 바뀔 때 progress 초기화
    const _mzPhase = handlers.mzPhase;
    handlers.mzPhase = (m) => { progEl.textContent = ''; _mzPhase(m); };

    return { handlers, setMap };
  }

  PX.createMafia = createMafia;
})();
