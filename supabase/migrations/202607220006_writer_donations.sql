-- Optional direct QR donations for writers.
alter table public.profiles
  add column if not exists donation_qr_url text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_owned_donation_qr') then
    alter table public.profiles add constraint profiles_owned_donation_qr check (
      donation_qr_url is null or donation_qr_url like
      'https://syemkwyfefzdmogtsvmi.supabase.co/storage/v1/object/public/donation-assets/' || id::text || '/%'
    );
  end if;
end $$;

grant update(donation_qr_url) on public.profiles to authenticated;

create or replace view public.public_profiles
with (security_barrier = true)
as
select username, display_name, bio, avatar_url, donation_qr_url
from public.profiles;

create or replace view public.public_story_feed
with (security_barrier = true)
as
select
  s.id, s.slug, s.title, s.subtitle, s.content_html, s.cover_url, s.tags,
  s.status, s.is_featured, s.reading_minutes, s.view_count, s.published_at,
  s.created_at, s.category_id,
  p.username as author_username,
  p.display_name as author_name,
  p.avatar_url as author_avatar_url,
  c.name as category_name,
  c.slug as category_slug,
  (s.author_id = auth.uid()) as is_own,
  (select count(*) from public.likes l where l.story_id = s.id) as like_count,
  p.donation_qr_url as author_donation_qr_url
from public.stories s
join public.profiles p on p.id = s.author_id
left join public.categories c on c.id = s.category_id
where s.status = 'published';

grant select on public.public_profiles, public.public_story_feed to anon, authenticated;

drop policy if exists "writers_upload_own_donation_qr" on storage.objects;
create policy "writers_upload_own_donation_qr" on storage.objects
for insert to authenticated
with check (
  bucket_id = 'donation-assets'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and not exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.is_suspended
  )
);
