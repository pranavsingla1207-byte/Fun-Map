create extension if not exists "pgcrypto";

create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  username text not null unique check (username = lower(username) and username ~ '^[a-z0-9_]{3,24}$'),
  password_hash text not null,
  created_at timestamptz not null default now()
);

create table if not exists sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table if not exists friend_requests (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references users(id) on delete cascade,
  recipient_id uuid not null references users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'rejected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (requester_id, recipient_id),
  check (requester_id <> recipient_id)
);

create table if not exists friendships (
  user_id uuid not null references users(id) on delete cascade,
  friend_id uuid not null references users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, friend_id),
  check (user_id <> friend_id)
);

create table if not exists drink_pins (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references users(id) on delete cascade,
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  place_label text,
  pin_type text not null check (pin_type in ('verified', 'forgotten')),
  created_at timestamptz not null default now()
);

create table if not exists drink_pin_participants (
  pin_id uuid not null references drink_pins(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (pin_id, user_id)
);

create table if not exists pin_photos (
  id uuid primary key default gen_random_uuid(),
  pin_id uuid not null unique references drink_pins(id) on delete cascade,
  storage_path text not null,
  width integer,
  height integer,
  mime_type text not null,
  uploaded_by uuid not null references users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists payment_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  pin_id uuid references drink_pins(id) on delete set null,
  amount_paise integer not null default 1000,
  status text not null default 'reserved',
  created_at timestamptz not null default now()
);

create or replace view visible_drink_pins as
select
  viewer.user_id as viewer_id,
  pins.id as pin_id,
  pins.creator_id,
  creators.username as creator_username,
  pins.latitude,
  pins.longitude,
  pins.place_label,
  pins.pin_type,
  pins.created_at,
  photos.storage_path as photo_path,
  coalesce(
    jsonb_agg(distinct jsonb_build_object('id', participants.id, 'username', participants.username))
      filter (where participants.id is not null and participants.id <> pins.creator_id),
    '[]'::jsonb
  ) as participants
from drink_pin_participants viewer
join drink_pins pins on pins.id = viewer.pin_id
join users creators on creators.id = pins.creator_id
left join pin_photos photos on photos.pin_id = pins.id
left join drink_pin_participants pin_people on pin_people.pin_id = pins.id
left join users participants on participants.id = pin_people.user_id
group by viewer.user_id, pins.id, creators.username, photos.storage_path;

create index if not exists sessions_token_hash_idx on sessions(token_hash);
create index if not exists drink_pins_creator_created_idx on drink_pins(creator_id, created_at desc);
create index if not exists friendships_friend_idx on friendships(friend_id);

grant usage on schema public to service_role;
grant all privileges on all tables in schema public to service_role;
grant all privileges on all sequences in schema public to service_role;
