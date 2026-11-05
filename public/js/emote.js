// 감정표현 판. C 를 누르면 아래 채팅 입력줄 자리에 방향키 판이 뜨고, 방향키로 표현을 고른다.
//
//   emote.onEmote(type)   표현을 골랐을 때. main.js 가 내 캐릭터·서버에 전달한다.
//   emote.open            판이 열려 있는지
//
// 지금은 ↑ 인사만 있다. 다른 방향은 EMOTES 에 채우면 판에 바로 나온다.
(function () {

  const EMOTES = {
    up: { type: 'bow', name: '인사' },
    left: null,
    right: null,
    down: null
  };
  const ARROWS = { up: '↑', left: '←', right: '→', down: '↓' };
  const KEY_TO_DIR = {
    ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down',
    ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right'
  };

  function isTypingTarget(t) {
    return t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
  }

  function createEmote({ chatForm, canOpen }) {
    const el = document.createElement('div');
    el.className = 'emote';
    el.hidden = true;
    el.setAttribute('aria-label', '감정표현');

    const title = document.createElement('span');
    title.className = 'emote-title';
    title.textContent = '감정표현';
    el.appendChild(title);

    // 방향키 모양 배치: 가운데 위 ↑, 아래 줄 ← ↓ →
    const pad = document.createElement('div');
    pad.className = 'emote-pad';
    const cells = {};
    for (const dir of ['up', 'left', 'down', 'right']) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'emote-key ' + dir;
      const e = EMOTES[dir];
      b.innerHTML = '<b></b><span></span>';
      b.children[0].textContent = ARROWS[dir];
      b.children[1].textContent = e ? e.name : '준비 중';
      if (!e) b.classList.add('empty');
      b.addEventListener('click', () => pick(dir));
      pad.appendChild(b);
      cells[dir] = b;
    }
    el.appendChild(pad);

    const hint = document.createElement('span');
    hint.className = 'emote-hint';
    hint.textContent = 'C·Esc 닫기';
    el.appendChild(hint);

    // 채팅 입력줄 자리를 대신한다
    chatForm.after(el);

    function setOpen(v) {
      el.hidden = !v;
      chatForm.hidden = v;
      if (v && document.activeElement) document.activeElement.blur();
    }

    function pick(dir) {
      const e = EMOTES[dir];
      if (!e) {
        // 아직 없는 표현은 잠깐 깜빡여 알려 준다
        cells[dir].classList.remove('blink');
        void cells[dir].offsetWidth;
        cells[dir].classList.add('blink');
        return;
      }
      setOpen(false);
      emote.onEmote(e.type);
    }

    // 판이 떠 있는 동안 방향키가 캐릭터를 움직이지 않도록 먼저 가로챈다
    window.addEventListener('keydown', (ev) => {
      if (el.hidden) {
        if (ev.code === 'KeyC' && !ev.repeat && !isTypingTarget(ev.target) && canOpen()) {
          ev.preventDefault();
          ev.stopPropagation();
          setOpen(true);
        }
        return;
      }
      const dir = KEY_TO_DIR[ev.code];
      if (dir) { if (!ev.repeat) pick(dir); }
      else if (ev.code === 'KeyC' || ev.key === 'Escape') setOpen(false);
      else if (ev.key === 'Enter') setOpen(false);
      else return;
      ev.preventDefault();
      ev.stopPropagation();
    }, true);

    const emote = {
      get open() { return !el.hidden; },
      close() { setOpen(false); },
      onEmote() {}
    };
    return emote;
  }

  PX.createEmote = createEmote;
})();
