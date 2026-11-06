// 유저 기록: 브라우저 고유 번호(uid)마다 닉네임·접속 기록·보유/착용 아이템·잔액을 남긴다.
//
// 저장소는 Supabase(PostgreSQL)의 px_users 테이블. 키가 없으면 서버 메모리에만 두고(서버를 끄면 사라짐) 그대로 동작한다.
//   SUPABASE_URL · SUPABASE_SERVICE_KEY   또는
//   SUPABASE_KEY_FILE                     프로젝트 URL 한 줄과 secret(service_role) 키 한 줄. 저장소 밖에 둔다.
// 테이블 만들기는 server/supabase.sql.
//
// 구매·착용은 서버가 확인한다(브라우저 값은 고칠 수 있으므로). 단, 처음 기록을 만들 때만
// 그 브라우저에 남아 있던 인벤토리를 그대로 옮겨 받는다(DB 이전부터 산 아이템을 잃지 않게).
'use strict';

const fs = require('fs');

const TABLE = 'px_users';
const START_BALANCE = 10000;
const UID_RE = /^[A-Za-z0-9-]{8,64}$/;
const SAVE_DELAY_MS = 1000;

function readSupabase(env) {
  let url = env.SUPABASE_URL;
  let key = env.SUPABASE_SERVICE_KEY;
  if ((!url || !key) && env.SUPABASE_KEY_FILE) {
    const lines = fs.readFileSync(env.SUPABASE_KEY_FILE, 'utf8').split(/\r?\n/).map(s => s.trim()).filter(Boolean);
    url = url || lines.find(l => l.startsWith('https://'));
    // 브라우저용 publishable(anon) 키가 같이 적혀 있어도 서버용 secret 키를 고른다
    key = key || lines.find(l => l.startsWith('sb_secret_'))
      || lines.find(l => !l.startsWith('https://') && !l.startsWith('sb_publishable_'));
  }
  return url && key ? { url: url.replace(/\/+$/, ''), key } : null;
}

// Supabase 의 REST(PostgREST) 를 HTTPS 로 부른다. 회사망에서 DB 포트(5432)가 막혀도 된다.
function supabaseStore({ url, key }) {
  // 새 형식 secret 키(sb_secret_…)는 apikey 헤더로만 보낸다. 예전 service_role 키(JWT)는 Authorization 에도 싣는다.
  const headers = { apikey: key, 'Content-Type': 'application/json' };
  if (key.startsWith('eyJ')) headers.Authorization = 'Bearer ' + key;
  return {
    kind: 'supabase',
    async get(uid) {
      const res = await fetch(`${url}/rest/v1/${TABLE}?uid=eq.${encodeURIComponent(uid)}&select=*`, { headers });
      if (!res.ok) throw new Error(`get ${res.status} ${await res.text()}`);
      const rows = await res.json();
      return rows[0] || null;
    },
    async put(row) {
      const res = await fetch(`${url}/rest/v1/${TABLE}?on_conflict=uid`, {
        method: 'POST',
        headers: Object.assign({ Prefer: 'resolution=merge-duplicates,return=minimal' }, headers),
        body: JSON.stringify(row)
      });
      if (!res.ok) throw new Error(`put ${res.status} ${await res.text()}`);
    }
  };
}

function memoryStore() {
  const rows = new Map();
  return {
    kind: 'memory',
    async get(uid) { return rows.get(uid) || null; },
    async put(row) { rows.set(row.uid, Object.assign({}, row)); }
  };
}

function createAccounts({ catalog, env }) {
  const conf = readSupabase(env);
  const store = conf ? supabaseStore(conf) : memoryStore();
  console.log(`[accounts] store=${store.kind}`);

  // 접속 중인 계정. 같은 브라우저 탭 여러 개가 한 기록을 함께 쓰도록 uid 로 묶는다.
  const open = new Map();
  const timers = new Map();

  function known(ids) {
    return Array.isArray(ids) ? ids.filter((id, i) => typeof id === 'string' && catalog.byId(id) && ids.indexOf(id) === i) : [];
  }

  function rowOf(a) {
    return {
      uid: a.uid, name: a.name, owned: a.owned, equip: a.equip, balance: a.balance,
      visits: a.visits, first_seen: a.first_seen, last_seen: a.last_seen
    };
  }

  // 잦은 변경(착용을 여러 번 바꾸는 등)은 1초 모아서 한 번에 저장한다
  function save(a) {
    clearTimeout(timers.get(a.uid));
    timers.set(a.uid, setTimeout(() => {
      timers.delete(a.uid);
      store.put(rowOf(a)).catch(e => console.warn(`[accounts] save ${a.uid} failed: ${e.message}`));
    }, SAVE_DELAY_MS));
  }

  // uid 가 이상하면(옛 화면 등) 이번 접속만 쓰는 임시 계정을 만든다. 저장하지 않는다.
  async function enter(rawUid, name, local) {
    const now = new Date().toISOString();
    if (typeof rawUid !== 'string' || !UID_RE.test(rawUid)) {
      return guest(name, local, now);
    }
    const uid = rawUid;
    let a = open.get(uid);
    if (!a) {
      let row = null;
      try {
        row = await store.get(uid);
      } catch (e) {
        // DB 를 못 읽었는데 새로 만들면 기존 기록을 덮어쓰므로, 이번 접속은 저장하지 않는 임시 계정으로 받는다
        console.warn(`[accounts] load ${uid} failed: ${e.message}`);
        return guest(name, local, now);
      }
      a = row ? fromRow(row) : fresh(uid, local, now);
      a.refs = 0;
      open.set(uid, a);
    }
    a.refs++;
    a.name = name;
    a.visits = (a.visits || 0) + 1;
    a.last_seen = now;
    save(a);
    return a;
  }

  function fromRow(row) {
    const owned = known(row.owned);
    return {
      uid: row.uid, name: row.name, owned, equip: known(row.equip).filter(id => owned.includes(id)),
      balance: Number.isFinite(row.balance) ? row.balance : START_BALANCE,
      visits: row.visits || 0, first_seen: row.first_seen, last_seen: row.last_seen, saved: true
    };
  }

  function fresh(uid, local, now) {
    let owned = known(local && local.owned);
    let equip = known(local && local.equip).filter(id => owned.includes(id));
    if (!owned.length) {
      owned = catalog.starterItems();
      equip = owned.slice();
    }
    return { uid, name: '', owned, equip, balance: START_BALANCE, visits: 0, first_seen: now, last_seen: now, saved: true };
  }

  function guest(name, local, now) {
    const a = fresh(null, local, now);
    a.name = name;
    a.saved = false;
    return a;
  }

  function persist(a) {
    if (a.saved) save(a);
  }

  function leave(a) {
    if (!a.saved) return;
    a.last_seen = new Date().toISOString();
    save(a);
    if (--a.refs <= 0) open.delete(a.uid);
  }

  // 구매: 없는 아이템·이미 가진 아이템·잔액 부족이면 사유를 돌려준다
  function buy(a, id) {
    const item = typeof id === 'string' && catalog.byId(id);
    if (!item) return '없는 아이템입니다';
    if (a.owned.includes(id)) return '이미 가지고 있습니다';
    if (a.balance < item.price) return '잔액이 부족합니다';
    a.balance -= item.price;
    a.owned.push(id);
    persist(a);
    return null;
  }

  // 가진 아이템만, 부위가 겹치지 않게 입힌다
  function setEquip(a, ids) {
    let out = [];
    for (const id of known(ids)) if (a.owned.includes(id)) out = catalog.equipToggle(out, id);
    a.equip = out;
    persist(a);
    return out;
  }

  function view(a) {
    return { owned: a.owned.slice(), equip: a.equip.slice(), balance: a.balance };
  }

  return { enter, leave, buy, setEquip, view, kind: store.kind };
}

module.exports = { createAccounts };
