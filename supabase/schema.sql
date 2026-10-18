-- 피클볼 대회 앱 스키마. Supabase 대시보드 → SQL Editor에 붙여넣고 한 번 실행.
-- 컬럼은 types/domain.ts 필드를 snake_case로 옮긴 것 (lib/supabase/mappers.ts).
-- "group"·"order"는 SQL 예약어라 group_name·match_order로 저장한다.
-- 시각 값은 앱과 같은 Date.now() 밀리초 숫자(bigint).

create table if not exists tournaments (
  id text primary key,
  name text not null,
  status text not null check (status in ('draft', 'active', 'closed')),
  divisions text[] not null default '{}',
  created_at bigint not null,
  bracket_uploaded_at bigint,
  league_divisions text[]
);

create index if not exists tournaments_status_idx on tournaments (status);

create table if not exists teams (
  id text primary key,
  tournament_id text not null references tournaments (id) on delete cascade,
  code text not null,
  division text not null,
  group_name text,
  team_name text not null,
  player1 text not null,
  player2 text not null,
  created_at bigint not null
);

create index if not exists teams_tournament_code_idx on teams (tournament_id, code);
create index if not exists teams_tournament_division_idx on teams (tournament_id, division);

create table if not exists matches (
  id text primary key,
  tournament_id text not null references tournaments (id) on delete cascade,
  division text not null,
  stage text not null check (stage in ('group', 'knockout')),
  group_name text,
  round text not null,
  round_index integer,
  match_order integer,
  court text,
  team_a_id text,
  team_b_id text,
  team_a_name text,
  team_b_name text,
  score_a integer,
  score_b integer,
  status text not null check (status in ('pending', 'awaiting_confirmation', 'confirmed', 'disputed')),
  submitted_by text check (submitted_by in ('teamA', 'teamB')),
  submitted_score_a integer,
  submitted_score_b integer,
  opponent_score_a integer,
  opponent_score_b integer,
  resolved_by text check (resolved_by in ('confirmation', 'admin', 'bye')),
  is_bye boolean not null default false,
  next_match_id text,
  next_match_slot text check (next_match_slot in ('teamA', 'teamB')),
  created_at bigint not null,
  updated_at bigint not null
);

create index if not exists matches_tournament_division_idx on matches (tournament_id, division);
create index if not exists matches_team_a_idx on matches (tournament_id, team_a_id);
create index if not exists matches_team_b_idx on matches (tournament_id, team_b_id);

-- 서버만 service_role 키로 접근한다. RLS를 켜고 정책을 두지 않으면
-- 브라우저용 anon 키로는 어떤 행도 읽거나 쓸 수 없다.
alter table tournaments enable row level security;
alter table teams enable row level security;
alter table matches enable row level security;
