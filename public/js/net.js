// 서버 연결. 끊기면 지수 백오프로 다시 붙고, 붙을 때마다 같은 닉네임으로 다시 입장한다.
//
//   net.connect(name)     입장
//   net.send(msg)         { t: 'move' | 'sit' | 'stand' | 'go' | 'idle' | 'chat' | 'equip', ... }
//   handlers[t](msg)      서버 메시지 종류별 처리 함수
//   onState(state)        'connecting' | 'open' | 'closed'
//   joinExtra()           입장 메시지에 덧붙일 값 (착용 목록 등). 재접속 때마다 다시 읽는다.
(function () {

  function createNet({ url, handlers, onState, joinExtra }) {
    let ws = null;
    let name = '';
    let retry = 0;
    let timer = null;

    function open() {
      onState('connecting');
      ws = new WebSocket(url);

      ws.onopen = () => {
        retry = 0;
        onState('open');
        ws.send(JSON.stringify(Object.assign({ t: 'join', name }, joinExtra ? joinExtra() : {})));
      };

      ws.onmessage = (ev) => {
        let msg;
        try {
          msg = JSON.parse(ev.data);
        } catch {
          return;
        }
        const fn = handlers[msg.t];
        if (fn) fn(msg);
      };

      ws.onclose = () => {
        ws = null;
        onState('closed');
        const delay = Math.min(15000, 1000 * 2 ** retry++);
        console.warn('[net] closed, retry in', delay, 'ms');
        timer = setTimeout(open, delay);
      };

      ws.onerror = () => ws && ws.close();
    }

    return {
      connect(n) {
        name = n;
        clearTimeout(timer);
        if (!ws) open();
      },
      send(msg) {
        if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
      }
    };
  }

  PX.createNet = createNet;
})();
