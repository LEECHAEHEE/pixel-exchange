// 채팅·말풍선·닉네임표. 글씨는 캐릭터 머리 위에 DOM 으로 띄운다(캔버스 도트 글씨로는 한글이 안 읽혀서).
//
//   chat.say(who, text)       who 의 머리 위에 말풍선. 같은 who 가 다시 말하면 내용이 바뀌고 시간이 다시 잰다.
//   chat.setName(who, name)   머리 위 닉네임표
//   chat.remove(who)          나간 사람의 말풍선·닉네임표 정리
//   chat.onSend(text)         내가 입력한 채팅. main.js 가 서버로 보내도록 바꿔 끼운다.
//   chat.update(now)          매 프레임 호출. 위치·만료 처리.
//
// who 는 'me'(내 캐릭터) 또는 접속자 id. 위치는 scene.anchor(who) 로 얻는다.
(function () {

  // 닉네임표 높이(논리 픽셀). 말풍선은 그만큼 위로 올려 겹치지 않게 한다.
  const TAG_H = 6;
  const FADE_MS = 300;

  function createChat({ stage, form, input, scene, getScale, durationMs, maxLength }) {
    const layer = document.createElement('div');
    layer.className = 'bubbles';
    stage.appendChild(layer);

    const bubbles = new Map();
    const tags = new Map();

    function makeEl(cls) {
      const el = document.createElement('div');
      el.className = cls;
      layer.appendChild(el);
      return el;
    }

    // 화면 가장자리(오른쪽 끝 상점 주인 등)에서 잘리지 않게 가로 위치를 무대 안으로 당긴다.
    // 같은 자리면 style 을 건드리지 않아 불필요한 스타일 계산을 피한다.
    let stageW = 0;
    function place(item, x, y) {
      const half = (item.w || 0) / 2 + 2;
      if (stageW > half * 2) x = Math.min(stageW - half, Math.max(half, x));
      const tx = `translate(${Math.round(x)}px, ${Math.round(y)}px) translate(-50%, -100%)`;
      if (tx !== item.tx) {
        item.tx = tx;
        item.el.style.transform = tx;
      }
    }

    function show(item, visible) {
      if (item.el.hidden === visible) item.el.hidden = !visible;
    }

    function say(who, text) {
      text = String(text).trim().slice(0, maxLength);
      if (!text) return;
      let b = bubbles.get(who);
      if (!b) {
        b = { el: makeEl('bubble'), until: 0, tx: '' };
        bubbles.set(who, b);
      }
      b.el.textContent = text;
      b.el.classList.remove('fade');
      b.w = 0;
      b.until = performance.now() + durationMs;
    }

    function setName(who, name) {
      let t = tags.get(who);
      if (!t) {
        t = { el: makeEl(who === 'me' ? 'tag me' : 'tag'), tx: '' };
        tags.set(who, t);
      }
      t.el.textContent = name;
      t.w = 0;
    }

    function remove(who) {
      for (const map of [bubbles, tags]) {
        const it = map.get(who);
        if (it) { it.el.remove(); map.delete(who); }
      }
    }

    function update(now) {
      const s = getScale();
      // 앉은 화면은 띠가 좁아 닉네임표를 숨기고 말풍선만 띄운다
      const seated = scene.seatedView;

      // 폭 재기(레이아웃 읽기)는 위치 쓰기보다 먼저 몰아서 한다. 섞으면 매번 레이아웃을 다시 계산한다.
      stageW = stage.clientWidth;
      for (const m of [tags, bubbles]) {
        for (const it of m.values()) if (!it.w && !it.el.hidden) it.w = it.el.offsetWidth;
      }

      for (const [who, t] of tags) {
        const a = seated ? null : scene.anchor(who);
        show(t, !!a);
        if (a) place(t, a.x * s, a.y * s);
      }

      for (const [who, b] of bubbles) {
        if (now >= b.until) {
          b.el.remove();
          bubbles.delete(who);
          continue;
        }
        if (now >= b.until - FADE_MS) b.el.classList.add('fade');

        const a = scene.anchor(who);
        show(b, !!a);
        if (!a) continue;
        const lift = !seated && tags.has(who) ? TAG_H : 0;
        place(b, a.x * s, (a.y - lift) * s);
      }
    }

    const chat = {
      say,
      setName,
      remove,
      update,
      onSend(text) { say('me', text); },
      get typing() { return document.activeElement === input; }
    };

    input.maxLength = maxLength;

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const text = input.value.trim();
      if (text) chat.onSend(text);
      input.value = '';
      // 보내고 나면 바로 다시 걸을 수 있게 입력창에서 빠져나온다
      input.blur();
    });

    input.addEventListener('focus', () => scene.releaseKeys());
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { input.value = ''; input.blur(); }
    });

    // 게임 중 Enter 를 누르면 입력창으로 들어간다. 다른 입력창(입장 화면 등)에 있을 때는 건드리지 않는다.
    window.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' || e.isComposing) return;
      const t = e.target;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'BUTTON')) return;
      e.preventDefault();
      input.focus();
    });

    return chat;
  }

  PX.createChat = createChat;
})();
