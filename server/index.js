// 서버 진입점. 같은 포트에서 화면 파일(public/)과 웹소켓(/ws)을 함께 제공한다.
//   npm start            기본 포트 5178
//   PORT=8080 npm start
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const zlib = require('zlib');
const { WebSocketServer } = require('ws');
const { createRoom } = require('./room');
const { createMarket, startSource } = require('./market');
const { startNews } = require('./news');
const { createRace } = require('./race');
const { loadCatalog } = require('./catalog');
const { createAccounts } = require('./accounts');

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
// 압축해서 이득이 있는 글자 파일
const GZIP_EXT = new Set(['.html', '.css', '.js', '.json', '.svg']);

// 파일 내용·ETag·gzip 본을 메모리에 두고 재사용한다. 내보내는 양이 곧 호스팅 비용이라
// 같은 파일을 매번 읽고 통째로 보내지 않는다. 파일이 바뀌면(크기·수정 시각) 다시 읽는다.
const fileCache = new Map();

function loadFile(file, cb) {
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) return cb(null);
    const hit = fileCache.get(file);
    if (hit && hit.mtimeMs === st.mtimeMs && hit.size === st.size) return cb(hit);
    fs.readFile(file, (err2, data) => {
      if (err2) return cb(null);
      const ext = path.extname(file);
      const entry = {
        mtimeMs: st.mtimeMs, size: st.size, data,
        type: MIME[ext] || 'application/octet-stream',
        etag: '"' + crypto.createHash('sha1').update(data).digest('base64url').slice(0, 20) + '"',
        gzip: GZIP_EXT.has(ext) ? zlib.gzipSync(data, { level: 9 }) : null
      };
      fileCache.set(file, entry);
      cb(entry);
    });
  });
}

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
  loadFile(file, (f) => {
    if (!f) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Not found');
      return;
    }
    // no-cache: 브라우저는 매번 확인하되(배포가 바로 보이게), 안 바뀌었으면 304 로 본문 없이 끝낸다
    const headers = { 'Content-Type': f.type, 'Cache-Control': 'no-cache', ETag: f.etag };
    if (f.gzip) headers.Vary = 'Accept-Encoding';
    const inm = req.headers['if-none-match'];
    if (inm && inm.split(',').some(t => t.trim().replace(/^W\//, '') === f.etag)) {
      res.writeHead(304, headers).end();
      return;
    }
    let body = f.data;
    if (f.gzip && /\bgzip\b/.test(req.headers['accept-encoding'] || '')) {
      body = f.gzip;
      headers['Content-Encoding'] = 'gzip';
    }
    headers['Content-Length'] = body.length;
    res.writeHead(200, headers);
    res.end(body);
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
const accounts = createAccounts({ catalog: loadCatalog(), env: process.env });
room = createRoom({ market, race, accounts });
// 전광판은 객장에만 있으므로 시세는 객장을 보는 사람에게만 보낸다
market.attach(msg => room.sendMap('exchange', msg));
startSource(market, process.env);
startNews(list => market.setNews(list), process.env, () => market.snapshot().symbols.map(s => s.name));

wss.on('connection', (ws) => {
  let user = null;
  let joining = false;
  let closed = false;
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

    // 입장(join) 전에는 다른 메시지를 받지 않는다. 유저 기록을 불러오는 동안 온 메시지도 버린다.
    if (!user) {
      if (msg.t === 'join' && !joining) {
        joining = true;
        room.join(ws, msg).then((u) => {
          user = u;
          if (u && closed) room.leave(u);
        }).catch((e) => console.warn('[ws] join failed', e.message));
      }
      return;
    }
    room.handle(user, msg);
  });

  ws.on('close', () => {
    closed = true;
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
