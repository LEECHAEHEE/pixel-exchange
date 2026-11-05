// 서버 진입점. 같은 포트에서 화면 파일(public/)과 웹소켓(/ws)을 함께 제공한다.
//   npm start            기본 포트 5178
//   PORT=8080 npm start
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');
const { createRoom } = require('./room');
const { createMarket, startSource } = require('./market');
const { createRace } = require('./race');

const PORT = Number(process.env.PORT) || 5178;
const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const MAX_MSG_BYTES = 2048;
const PING_MS = 30000;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

// public/ 밖의 파일(서버 코드 등)은 절대 내보내지 않는다
function serveStatic(req, res) {
  let urlPath;
  try {
    urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  } catch {
    res.writeHead(400).end();
    return;
  }
  const file = path.normalize(path.join(PUBLIC_DIR, urlPath === '/' ? 'index.html' : urlPath));
  if (!file.startsWith(PUBLIC_DIR + path.sep)) {
    res.writeHead(403).end();
    return;
  }
  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Not found');
      return;
    }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(file)] || 'application/octet-stream',
      'Cache-Control': 'no-cache'
    });
    res.end(data);
  });
}

const server = http.createServer(serveStatic);
const wss = new WebSocketServer({ server, path: '/ws', maxPayload: MAX_MSG_BYTES });

const market = createMarket();
// 경마는 방 전체에 알리고, 방은 입장할 때 경마 상태를 같이 보내므로 서로를 참조한다
let room = null;
const race = createRace({
  broadcast: msg => room && room.broadcast(msg),
  cycleMs: Number(process.env.RACE_CYCLE_SEC) * 1000 || undefined
});
room = createRoom({ market, race });
market.attach(msg => room.broadcast(msg));
startSource(market, process.env);

wss.on('connection', (ws) => {
  let user = null;
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });

  ws.on('message', (data) => {
    let msg;
    try {
      msg = JSON.parse(data.toString());
    } catch {
      return;
    }
    if (!msg || typeof msg.t !== 'string') return;

    // 입장(join) 전에는 다른 메시지를 받지 않는다
    if (!user) {
      if (msg.t === 'join') user = room.join(ws, msg.name);
      return;
    }
    room.handle(user, msg);
  });

  ws.on('close', () => {
    if (user) room.leave(user);
  });
  ws.on('error', (e) => console.warn('[ws] error', e.message));
});

// 응답 없는 연결(창을 닫았는데 close 가 안 온 경우 등)을 정리한다
setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.isAlive) {
      ws.terminate();
      continue;
    }
    ws.isAlive = false;
    ws.ping();
  }
}, PING_MS);

server.listen(PORT, () => {
  console.log(`[server] http://localhost:${PORT}`);
});
