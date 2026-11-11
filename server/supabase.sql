-- 유저 기록 테이블(server/accounts.js). Supabase 대시보드 → SQL Editor 에 붙여 넣고 Run.
-- 브라우저 고유 번호(uid)마다 한 줄. 서버만 service_role 키로 읽고 쓴다.

create table if not exists public.px_users (
  uid         text primary key,
  name        text not null default '',
  owned       jsonb not null default '[]'::jsonb,   -- 보유 아이템 id 목록
  equip       jsonb not null default '[]'::jsonb,   -- 착용 중인 아이템 id 목록
  balance     integer not null default 10000,       -- 잔액(원)
  visits      integer not null default 0,           -- 입장 횟수
  first_seen  timestamptz not null default now(),
  last_seen   timestamptz not null default now()
);

-- 브라우저(anon 키)로는 아무것도 못 하게 RLS 를 켜고 정책은 두지 않는다. service_role 키는 RLS 를 거치지 않는다.
alter table public.px_users enable row level security;

-- 서버가 다시 켜져도 남아야 하는 작은 값(server/kv.js). 지금은 국장 전일 기준가 기록(key 'kr-base') 하나.
create table if not exists public.px_kv (
  key         text primary key,
  value       jsonb not null,
  updated_at  timestamptz not null default now()
);
alter table public.px_kv enable row level security;
