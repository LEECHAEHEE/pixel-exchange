// 서버가 다시 켜져도 남아야 하는 작은 값(예: 국장 전일 기준가 기록)을 Supabase 의 px_kv 테이블에 둔다.
// 키·테이블이 없으면 아무것도 저장하지 않고(get 은 null) 그대로 동작한다. 테이블 만들기는 server/supabase.sql.
//
//   const kv = createKv(env)
//   await kv.get(key)          → value 또는 null
//   await kv.set(key, value)
'use strict';

const { readSupabase } = require('./accounts');

const TABLE = 'px_kv';

function createKv(env) {
  const sb = readSupabase(env);
  if (!sb) return { get: async () => null, set: async () => {} };
  const headers = { apikey: sb.key, 'Content-Type': 'application/json' };
  if (sb.key.startsWith('eyJ')) headers.Authorization = 'Bearer ' + sb.key;
  // 테이블이 없으면(404) 한 번만 알리고 더 부르지 않는다
  let missing = false;
  const gone = (res) => {
    if (res.status !== 404) return false;
    if (!missing) console.warn(`[kv] table ${TABLE} not found, run server/supabase.sql`);
    missing = true;
    return true;
  };

  return {
    async get(key) {
      if (missing) return null;
      try {
        const res = await fetch(`${sb.url}/rest/v1/${TABLE}?key=eq.${encodeURIComponent(key)}&select=value`, { headers });
        if (gone(res)) return null;
        if (!res.ok) throw new Error(`${res.status}`);
        const rows = await res.json();
        return rows[0] ? rows[0].value : null;
      } catch (e) {
        console.warn(`[kv] get ${key} failed: ${e.message}`);
        return null;
      }
    },

    async set(key, value) {
      if (missing) return;
      try {
        const res = await fetch(`${sb.url}/rest/v1/${TABLE}?on_conflict=key`, {
          method: 'POST',
          headers: Object.assign({ Prefer: 'resolution=merge-duplicates,return=minimal' }, headers),
          body: JSON.stringify({ key, value, updated_at: new Date().toISOString() })
        });
        if (gone(res)) return;
        if (!res.ok) throw new Error(`${res.status}`);
      } catch (e) {
        console.warn(`[kv] set ${key} failed: ${e.message}`);
      }
    }
  };
}

module.exports = { createKv };
