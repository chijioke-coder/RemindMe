-- Run once in Supabase: SQL Editor -> New query -> paste -> Run.
-- 1) removes everything left over from 5sim, 2) adds the favicon setting. Safe to run again.

-- Stop if a 5sim number order is still waiting for its code: finish or refund it first
-- (the 5sim code is gone, so nothing would deliver or refund it).
do $$
begin
  if exists (
    select 1 from public.orders
    where delivery_type = 'sms' and status in ('processing', 'needs_review')
      and sms_provider is distinct from 'hero'
  ) then
    raise exception 'There are number orders from 5sim that are still waiting. Refund or complete them in Admin -> Orders, then run this again.';
  end if;
end $$;

-- 5sim offers, countries and apps (HeroSMS rows start with "hero_" or use the shared app slugs below)
delete from public.sms_offers    where country not like 'hero\_%';
delete from public.sms_countries where slug    not like 'hero\_%';
delete from public.sms_services
  where slug not like 'hero\_%'
    and slug not in ('whatsapp','telegram','instagram','facebook','google','discord','twitter','uber','amazon');

-- prices are now stored directly in naira, so the shared base unit is 1
update public.app_settings set sms_rate_naira = 1 where id = 1;

-- old alerts that mention 5sim
update public.app_settings set alert = null where id = 1 and alert ilike '%5sim%';

-- favicon: path of the image in the public product-icons bucket, readable by visitors through a tiny view
alter table public.app_settings add column if not exists favicon_path text;
create or replace view public.public_branding as
  select favicon_path from public.app_settings where id = 1;
grant select on public.public_branding to anon, authenticated;
