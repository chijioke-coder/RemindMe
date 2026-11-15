-- HeroSMS support. Run once in Supabase: SQL Editor -> New query -> paste -> Run.
-- Safe to run again. It only ADDS columns; nothing existing is changed or removed.

-- settings: naira per US dollar, and two timestamps the function uses to share one poll / one sync
alter table public.app_settings
  add column if not exists hero_rate_naira   numeric     not null default 0,
  add column if not exists hero_last_poll    timestamptz,
  add column if not exists hero_last_sync_at timestamptz;

-- offers: the real HeroSMS price in US dollars (used to cap what we pay at purchase time)
alter table public.sms_offers
  add column if not exists usd_price numeric;

-- orders: which provider issued the number, plus what is needed to listen for a second SMS
alter table public.orders
  add column if not exists sms_provider     text,
  add column if not exists hero_country     text,
  add column if not exists hero_service     text,
  add column if not exists hero_otp_id      text,
  add column if not exists hero_first_otp_at timestamptz,
  add column if not exists hero_finished    boolean not null default false;

-- the poller looks up open HeroSMS orders on every tick
create index if not exists orders_hero_open_idx
  on public.orders (status)
  where sms_provider = 'hero';
